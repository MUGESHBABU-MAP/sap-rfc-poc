const parseRows = require("../utils/parse-rows");

/**
 * Inventory Dataset Service
 *
 * Reads MARD, MARA, MAKT, MARC from SAP, joins on MATNR,
 * and produces normalized InventoryRecord objects matching
 * the customer workbook structure.
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
    const [mardRows, maraRows, maktRows, marcRows] = await Promise.all([
      this._readMARD(filters),
      this._readMARA(filters),
      this._readMAKT(filters),
      this._readMARC(filters),
    ]);

    // Build lookup maps keyed by MATNR
    const maraMap = this._buildMap(maraRows, "MATNR");
    const maktMap = this._buildMap(maktRows, "MATNR");
    // MARC is keyed by MATNR + WERKS
    const marcMap = this._buildCompositeMap(marcRows, "MATNR", "WERKS");

    // Join and produce InventoryRecord objects
    const records = mardRows.map((mard) => {
      const matnr = mard.MATNR;
      const werks = mard.WERKS;

      const mara = maraMap[matnr] || {};
      const makt = maktMap[matnr] || {};
      const marc = marcMap[`${matnr}|${werks}`] || {};

      const unrestrictedQty = parseFloat(mard.LABST) || 0;
      const qualityQty = parseFloat(mard.INSME) || 0;
      const blockedQty = parseFloat(mard.SPEME) || 0;
      const transitQty = parseFloat(mard.UMLME) || 0;
      const returnsQty = parseFloat(mard.RETME) || 0;

      // Standard cost - Phase 2 enrichment
      const standardCost = 0;

      return {
        material: matnr,
        materialDescription: makt.MAKTX || "",
        materialType: mara.MTART || "",
        materialGroup: mara.MATKL || "",
        plant: werks,
        storageLocation: mard.LGORT || "",
        unrestrictedQty,
        unrestrictedValue: unrestrictedQty * standardCost,
        transitQty,
        transitValue: transitQty * standardCost,
        qualityQty,
        qualityValue: qualityQty * standardCost,
        blockedQty,
        blockedValue: blockedQty * standardCost,
        returnsQty,
        returnsValue: returnsQty * standardCost,
        standardCost,
        costPending: true,
      };
    });

    return records;
  }

  // --- Private helpers ---

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
    const where = this._buildMARDWhere(filters);
    const result = await this.sap.readTable("MARD", fields, { where });
    return parseRows(result);
  }

  async _readMARA(filters) {
    const fields = ["MATNR", "MTART", "MATKL"];
    const where = [];
    if (filters.material) {
      where.push(`MATNR = '${filters.material}'`);
    }
    const result = await this.sap.readTable("MARA", fields, { where });
    return parseRows(result);
  }

  async _readMAKT(filters) {
    const fields = ["MATNR", "MAKTX"];
    const where = [];
    if (filters.material) {
      where.push(`MATNR = '${filters.material}'`);
    }
    // Default to English descriptions
    where.push("SPRAS = 'E'");
    const result = await this.sap.readTable("MAKT", fields, { where });
    return parseRows(result);
  }

  async _readMARC(filters) {
    const fields = ["MATNR", "WERKS"];
    const where = [];
    if (filters.material) {
      where.push(`MATNR = '${filters.material}'`);
    }
    if (filters.plant) {
      where.push(`WERKS = '${filters.plant}'`);
    }
    const result = await this.sap.readTable("MARC", fields, { where });
    return parseRows(result);
  }

  _buildMARDWhere(filters) {
    const where = [];
    if (filters.plant) {
      where.push(`WERKS = '${filters.plant}'`);
    }
    if (filters.storageLocation) {
      where.push(`LGORT = '${filters.storageLocation}'`);
    }
    if (filters.material) {
      where.push(`MATNR = '${filters.material}'`);
    }
    return where;
  }

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

module.exports = InventoryDatasetService;
