const parseRows = require("../utils/parse-rows");

/**
 * Inventory Dataset Service
 *
 * Reads MARD, MARA, MAKT, MARC, MBEW from SAP,
 * joins records using MATNR, and produces normalized
 * InventoryRecord objects matching the customer workbook.
 *
 * SAP Table Mapping:
 *   MARA  → Material, MaterialType, MaterialGroup, BaseUnit
 *   MAKT  → MaterialDescription
 *   MARC  → Plant (validates MATNR+WERKS combination)
 *   MARD  → StorageLocation, UnrestrictedQty, QualityQty, BlockedQty, TransitQty
 *   MBEW  → StandardCost, MovingAveragePrice, InventoryValue, TotalQuantity
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
    const [mardRows, maraRows, maktRows, marcRows, mbewRows] =
      await Promise.all([
        this._readMARD(filters),
        this._readMARA(filters),
        this._readMAKT(filters),
        this._readMARC(filters),
        this._readMBEW(filters),
      ]);

    // Build lookup maps
    const maraMap = this._buildMap(maraRows, "MATNR");
    const maktMap = this._buildMap(maktRows, "MATNR");
    const marcMap = this._buildCompositeMap(marcRows, "MATNR", "WERKS");
    // MBEW keyed by MATNR + BWKEY (valuation area = plant)
    const mbewMap = this._buildCompositeMap(mbewRows, "MATNR", "BWKEY");

    // Join and produce InventoryRecord objects
    const records = mardRows.map((mard) => {
      const matnr = mard.MATNR;
      const werks = mard.WERKS;

      const mara = maraMap[matnr] || {};
      const makt = maktMap[matnr] || {};
      const marc = marcMap[`${matnr}|${werks}`] || {};
      const mbew = mbewMap[`${matnr}|${werks}`] || {};

      // Quantities from MARD
      const unrestrictedQty = parseFloat(mard.LABST) || 0;
      const qualityQty = parseFloat(mard.INSME) || 0;
      const blockedQty = parseFloat(mard.SPEME) || 0;
      const transitQty = parseFloat(mard.UMLME) || 0;
      const returnsQty = 0; // MARD doesn't have RETME in all systems; default 0

      // Cost from MBEW
      const standardCost = parseFloat(mbew.STPRS) || 0;
      const movingAveragePrice = parseFloat(mbew.VERPR) || 0;
      const priceControl = mbew.VPRSV || "";

      // Use the appropriate cost based on price control indicator
      // S = Standard Price, V = Moving Average Price
      const effectiveCost =
        priceControl === "V" ? movingAveragePrice : standardCost;

      // Determine if value is derived (calculated) or from SAP directly
      const valueDerived = effectiveCost > 0;

      // Calculate values: quantity × effective cost
      const unrestrictedValue = unrestrictedQty * effectiveCost;
      const transitValue = transitQty * effectiveCost;
      const qualityValue = qualityQty * effectiveCost;
      const blockedValue = blockedQty * effectiveCost;
      const returnsValue = returnsQty * effectiveCost;
      const restrictedQty = 0; // Placeholder — not in MARD standard fields
      const restrictedValue = restrictedQty * effectiveCost;

      // Total
      const totalQuantity =
        unrestrictedQty +
        transitQty +
        qualityQty +
        blockedQty +
        returnsQty +
        restrictedQty;
      const totalInventoryValue =
        unrestrictedValue +
        transitValue +
        qualityValue +
        blockedValue +
        returnsValue +
        restrictedValue;

      return {
        material: matnr,
        materialType: mara.MTART || "",
        materialDescription: makt.MAKTX || "",
        materialGroup: mara.MATKL || "",
        plant: werks,
        storageLocation: mard.LGORT || "",
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
      };
    });

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
    if (filters.plant) conditions.push(`WERKS = '${filters.plant}'`);
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

  /**
   * Combine WHERE conditions into single-row AND format.
   * Customer SAP requires: ["WERKS = '1000' AND LGORT = 'WH10'"]
   * NOT: ["WERKS = '1000'", "LGORT = 'WH10'"]
   *
   * Splits at 72-char boundary for RFC_READ_TABLE OPTIONS row limit.
   */
  _combineWhere(conditions) {
    if (conditions.length === 0) return [];

    const combined = conditions.join(" AND ");

    // RFC_READ_TABLE OPTIONS TEXT field is max 72 chars per row
    if (combined.length <= 72) {
      return [combined];
    }

    // Split into multiple rows at AND boundaries
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
    for (const row of rows) {
      map[row[key]] = row;
    }
    return map;
  }

  _buildCompositeMap(rows, key1, key2) {
    const map = {};
    for (const row of rows) {
      map[`${row[key1]}|${row[key2]}`] = row;
    }
    return map;
  }
}

function round2(val) {
  return Math.round(val * 100) / 100;
}

module.exports = InventoryDatasetService;
