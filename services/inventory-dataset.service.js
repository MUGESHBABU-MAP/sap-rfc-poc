const parseRows = require("../utils/parse-rows");

/**
 * Inventory Dataset Service
 *
 * Reads MARD, MARA, MAKT, MARC, MBEW, MCHB, MSLB, MSKU from SAP,
 * joins records using MATNR, and produces normalized InventoryRecord
 * objects matching the customer workbook.
 *
 * SAP Table Mapping:
 *   MARA  → Material, MaterialType, MaterialGroup, BaseUnit
 *   MAKT  → MaterialDescription
 *   MARC  → Plant (validates MATNR+WERKS combination)
 *   MARD  → StorageLocation, UnrestrictedQty, QualityQty, BlockedQty, TransitQty
 *   MBEW  → StandardCost, MovingAveragePrice
 *   MCHB  → Restricted-Use stock (batch level)
 *   MSLB  → Returns/Special stock with vendor
 *   MSKU  → Returns/Special stock with customer
 */
class InventoryDatasetService {
  constructor(sapService) {
    this.sap = sapService;
  }

  /**
   * Get the full inventory dataset.
   * @param {object} filters - { plant?, storageLocation?, material? }
   * @returns {Promise<InventoryRecord[]>}
   */
  async getInventoryDataset(filters = {}) {
    // Core tables (mandatory)
    const [mardRows, maraRows, maktRows, marcRows, mbewRows] =
      await Promise.all([
        this._readMARD(filters),
        this._readMARA(filters),
        this._readMAKT(filters),
        this._readMARC(filters),
        this._readMBEW(filters),
      ]);

    // Extended tables (optional — fail gracefully)
    let mchbRows = [];
    let mslbRows = [];
    let mskuRows = [];

    try {
      mchbRows = await this._readMCHB(filters);
    } catch (err) {
      console.warn(
        "  [MCHB] Unavailable (restricted stock will be 0):",
        err.message,
      );
    }

    try {
      mslbRows = await this._readMSLB(filters);
    } catch (err) {
      console.warn(
        "  [MSLB] Unavailable (vendor returns will be 0):",
        err.message,
      );
    }

    try {
      mskuRows = await this._readMSKU(filters);
    } catch (err) {
      console.warn(
        "  [MSKU] Unavailable (customer returns will be 0):",
        err.message,
      );
    }

    // Build lookup maps
    const maraMap = this._buildMap(maraRows, "MATNR");
    const maktMap = this._buildMap(maktRows, "MATNR");
    const marcMap = this._buildCompositeMap(marcRows, "MATNR", "WERKS");
    const mbewMap = this._buildCompositeMap(mbewRows, "MATNR", "BWKEY");

    // MCHB keyed by MATNR + WERKS + LGORT (aggregate all batches per location)
    const mchbMap = this._aggregateMCHB(mchbRows);

    // MSLB + MSKU aggregated by MATNR + WERKS for returns
    const returnsMap = this._aggregateReturns(mslbRows, mskuRows);

    // Join and produce InventoryRecord objects
    const records = [];
    for (let i = 0; i < mardRows.length; i++) {
      const mard = mardRows[i];
      const matnr = mard.MATNR;
      const werks = mard.WERKS;
      const lgort = mard.LGORT || "";

      const mara = maraMap[matnr] || {};
      const makt = maktMap[matnr] || {};
      const mbew = mbewMap[`${matnr}|${werks}`] || {};

      // Quantities from MARD
      const unrestrictedQty = parseFloat(mard.LABST) || 0;
      const qualityQty = parseFloat(mard.INSME) || 0;
      const blockedQty = parseFloat(mard.SPEME) || 0;
      const transitQty = parseFloat(mard.UMLME) || 0;

      // Restricted-use from MCHB (batch-level aggregated)
      const mchbKey = `${matnr}|${werks}|${lgort}`;
      const mchbData = mchbMap[mchbKey] || { restrictedQty: 0 };
      const restrictedQty = mchbData.restrictedQty;

      // Returns from MSLB + MSKU
      const returnsKey = `${matnr}|${werks}`;
      const returnsData = returnsMap[returnsKey] || { returnsQty: 0 };
      const returnsQty = returnsData.returnsQty;

      // Cost from MBEW
      const standardCost = parseFloat(mbew.STPRS) || 0;
      const movingAveragePrice = parseFloat(mbew.VERPR) || 0;
      const priceControl = mbew.VPRSV || "";

      // Effective cost based on price control indicator
      const effectiveCost =
        priceControl === "V" ? movingAveragePrice : standardCost;
      const valueDerived = effectiveCost > 0;

      // Calculate values
      const unrestrictedValue = unrestrictedQty * effectiveCost;
      const transitValue = transitQty * effectiveCost;
      const qualityValue = qualityQty * effectiveCost;
      const blockedValue = blockedQty * effectiveCost;
      const restrictedValue = restrictedQty * effectiveCost;
      const returnsValue = returnsQty * effectiveCost;

      // Totals
      const totalQuantity =
        unrestrictedQty +
        transitQty +
        qualityQty +
        blockedQty +
        restrictedQty +
        returnsQty;
      const totalInventoryValue =
        unrestrictedValue +
        transitValue +
        qualityValue +
        blockedValue +
        restrictedValue +
        returnsValue;

      records.push({
        material: matnr,
        materialType: mara.MTART || "",
        materialDescription: makt.MAKTX || "",
        materialGroup: mara.MATKL || "",
        plant: werks,
        storageLocation: lgort,
        baseUnit: mara.MEINS || "",
        unrestrictedQty,
        unrestrictedValue: round2(unrestrictedValue),
        transitQty,
        transitValue: round2(transitValue),
        qualityQty,
        qualityValue: round2(qualityValue),
        restrictedQty,
        restrictedValue: round2(restrictedValue),
        blockedQty,
        blockedValue: round2(blockedValue),
        returnsQty,
        returnsValue: round2(returnsValue),
        standardCost: round2(standardCost),
        movingAveragePrice: round2(movingAveragePrice),
        totalQuantity,
        totalInventoryValue: round2(totalInventoryValue),
        valueDerived,
      });
    }

    return records;
  }

  // --- Private: SAP table readers ---

  async _readMARD(filters) {
    const fields = [
      "MATNR",
      "WERKS",
      "LGORT",
      "LABST",
      "INSME",
      "SPEME",
      "UMLME",
    ];
    const conditions = [];
    if (filters.plant) conditions.push(`WERKS = '${filters.plant}'`);
    if (filters.storageLocation)
      conditions.push(`LGORT = '${filters.storageLocation}'`);
    if (filters.material) conditions.push(`MATNR = '${filters.material}'`);
    const where = this._combineWhere(conditions);
    console.log(
      `  [MARD] WHERE: ${where.length > 0 ? where.join(" ") : "(none)"}`,
    );
    const result = await this.sap.readTable("MARD", fields, { where });
    return parseRows(result);
  }

  async _readMARA(filters) {
    const fields = ["MATNR", "MTART", "MATKL", "MEINS"];
    const conditions = [];
    if (filters.material) conditions.push(`MATNR = '${filters.material}'`);
    const where = this._combineWhere(conditions);
    console.log(
      `  [MARA] WHERE: ${where.length > 0 ? where.join(" ") : "(none)"}`,
    );
    const result = await this.sap.readTable("MARA", fields, { where });
    return parseRows(result);
  }

  async _readMAKT(filters) {
    const fields = ["MATNR", "MAKTX"];
    const conditions = ["SPRAS = 'E'"];
    if (filters.material) conditions.push(`MATNR = '${filters.material}'`);
    const where = this._combineWhere(conditions);
    console.log(
      `  [MAKT] WHERE: ${where.length > 0 ? where.join(" ") : "(none)"}`,
    );
    const result = await this.sap.readTable("MAKT", fields, { where });
    return parseRows(result);
  }

  async _readMARC(filters) {
    const fields = ["MATNR", "WERKS"];
    const conditions = [];
    if (filters.material) conditions.push(`MATNR = '${filters.material}'`);
    if (filters.plant) conditions.push(`WERKS = '${filters.plant}'`);
    const where = this._combineWhere(conditions);
    console.log(
      `  [MARC] WHERE: ${where.length > 0 ? where.join(" ") : "(none)"}`,
    );
    const result = await this.sap.readTable("MARC", fields, { where });
    return parseRows(result);
  }

  async _readMBEW(filters) {
    const fields = [
      "MATNR",
      "BWKEY",
      "VPRSV",
      "VERPR",
      "STPRS",
      "SALK3",
      "LBKUM",
    ];
    const conditions = [];
    if (filters.material) conditions.push(`MATNR = '${filters.material}'`);
    if (filters.plant) conditions.push(`BWKEY = '${filters.plant}'`);
    const where = this._combineWhere(conditions);
    console.log(
      `  [MBEW] WHERE: ${where.length > 0 ? where.join(" ") : "(none)"}`,
    );
    const result = await this.sap.readTable("MBEW", fields, { where });
    return parseRows(result);
  }

  async _readMCHB(filters) {
    const fields = ["MATNR", "WERKS", "LGORT", "CLABS", "CSPEM", "CINSM"];
    const conditions = [];
    if (filters.plant) conditions.push(`WERKS = '${filters.plant}'`);
    if (filters.storageLocation)
      conditions.push(`LGORT = '${filters.storageLocation}'`);
    if (filters.material) conditions.push(`MATNR = '${filters.material}'`);
    const where = this._combineWhere(conditions);
    console.log(
      `  [MCHB] WHERE: ${where.length > 0 ? where.join(" ") : "(none)"}`,
    );
    const result = await this.sap.readTable("MCHB", fields, { where });
    return parseRows(result);
  }

  async _readMSLB(filters) {
    const fields = ["MATNR", "WERKS", "SOBKZ", "LIFNR", "LBLAB", "LBINS"];
    const conditions = [];
    if (filters.plant) conditions.push(`WERKS = '${filters.plant}'`);
    if (filters.material) conditions.push(`MATNR = '${filters.material}'`);
    const where = this._combineWhere(conditions);
    console.log(
      `  [MSLB] WHERE: ${where.length > 0 ? where.join(" ") : "(none)"}`,
    );
    const result = await this.sap.readTable("MSLB", fields, { where });
    return parseRows(result);
  }

  async _readMSKU(filters) {
    const fields = ["MATNR", "WERKS", "SOBKZ", "KUNNR", "KULAB", "KUINS"];
    const conditions = [];
    if (filters.plant) conditions.push(`WERKS = '${filters.plant}'`);
    if (filters.material) conditions.push(`MATNR = '${filters.material}'`);
    const where = this._combineWhere(conditions);
    console.log(
      `  [MSKU] WHERE: ${where.length > 0 ? where.join(" ") : "(none)"}`,
    );
    const result = await this.sap.readTable("MSKU", fields, { where });
    return parseRows(result);
  }

  // --- Aggregation helpers ---

  /**
   * Aggregate MCHB (batch stock) by MATNR+WERKS+LGORT.
   * Restricted qty = sum of batch stocks across all batches for a location.
   */
  _aggregateMCHB(mchbRows) {
    const map = {};
    for (let i = 0; i < mchbRows.length; i++) {
      const row = mchbRows[i];
      const key = `${row.MATNR}|${row.WERKS}|${row.LGORT}`;
      if (!map[key]) {
        map[key] = { restrictedQty: 0 };
      }
      // CLABS = unrestricted batch, CSPEM = blocked batch, CINSM = quality batch
      // "Restricted-Use" in customer context = sum of all batch-managed stock
      // that isn't in the main MARD unrestricted bucket
      map[key].restrictedQty +=
        (parseFloat(row.CSPEM) || 0) + (parseFloat(row.CINSM) || 0);
    }
    return map;
  }

  /**
   * Aggregate MSLB + MSKU for returns quantities by MATNR+WERKS.
   */
  _aggregateReturns(mslbRows, mskuRows) {
    const map = {};

    // MSLB: vendor special stock
    for (let i = 0; i < mslbRows.length; i++) {
      const row = mslbRows[i];
      const key = `${row.MATNR}|${row.WERKS}`;
      if (!map[key]) map[key] = { returnsQty: 0 };
      map[key].returnsQty +=
        (parseFloat(row.LBLAB) || 0) + (parseFloat(row.LBINS) || 0);
    }

    // MSKU: customer special stock
    for (let i = 0; i < mskuRows.length; i++) {
      const row = mskuRows[i];
      const key = `${row.MATNR}|${row.WERKS}`;
      if (!map[key]) map[key] = { returnsQty: 0 };
      map[key].returnsQty +=
        (parseFloat(row.KULAB) || 0) + (parseFloat(row.KUINS) || 0);
    }

    return map;
  }

  // --- WHERE clause builder ---

  _combineWhere(conditions) {
    if (conditions.length === 0) return [];
    const combined = conditions.join(" AND ");
    if (combined.length <= 72) return [combined];

    const rows = [];
    let current = "";
    for (let i = 0; i < conditions.length; i++) {
      const prefix = current.length === 0 ? "" : " AND ";
      const candidate = current + prefix + conditions[i];
      if (candidate.length <= 72) {
        current = candidate;
      } else {
        if (current.length > 0) rows.push(current);
        current = "AND " + conditions[i];
      }
    }
    if (current.length > 0) rows.push(current);
    return rows;
  }

  // --- Utility ---

  _buildMap(rows, key) {
    const map = {};
    for (let i = 0; i < rows.length; i++) {
      map[rows[i][key]] = rows[i];
    }
    return map;
  }

  _buildCompositeMap(rows, key1, key2) {
    const map = {};
    for (let i = 0; i < rows.length; i++) {
      map[`${rows[i][key1]}|${rows[i][key2]}`] = rows[i];
    }
    return map;
  }
}

function round2(val) {
  return Math.round(val * 100) / 100;
}

module.exports = InventoryDatasetService;
