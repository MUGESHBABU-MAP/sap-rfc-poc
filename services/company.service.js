const parseRows = require("../utils/parse-rows");

/**
 * Company Service
 *
 * Reads company code data from SAP T001 table.
 * Provides currency information for workbook generation.
 */
class CompanyService {
  constructor(sapService) {
    this.sap = sapService;
    this._cache = new Map();
  }

  /**
   * Get company currency.
   * @param {string} companyCode
   * @returns {Promise<{companyCode, currency}>}
   */
  async getCompanyCurrency(companyCode) {
    // Check cache first
    if (this._cache.has(companyCode)) {
      return this._cache.get(companyCode);
    }

    const fields = ["BUKRS", "WAERS"];
    const where = [`BUKRS = '${companyCode}'`];

    try {
      const result = await this.sap.readTable("T001", fields, {
        where,
        rowCount: 1,
      });
      const rows = parseRows(result);

      const data = {
        companyCode,
        currency: rows.length > 0 ? rows[0].WAERS || "" : "",
      };

      this._cache.set(companyCode, data);
      return data;
    } catch (err) {
      console.warn(`  [T001] Currency lookup failed: ${err.message}`);
      return { companyCode, currency: "" };
    }
  }
}

module.exports = CompanyService;
