const parseRows = require("../utils/parse-rows");

/**
 * GL Dataset Service
 *
 * Extracts GL balance records from FAGLFLEXT
 * and produces structured GLBalanceRecord objects.
 */
class GLDatasetService {
  constructor(sapService) {
    this.sap = sapService;
  }

  /**
   * Get GL balances from SAP.
   * @param {object} filters - { companyCode?, fiscalYear?, account? }
   * @returns {Promise<GLBalanceRecord[]>}
   */
  async getGLBalances(filters = {}) {
    const fields = ["RBUKRS", "RACCT", "RYEAR", "RPMAX", "DRCRK"];
    const where = this._buildWhere(filters);

    const result = await this.sap.readTable("FAGLFLEXT", fields, { where });
    const rows = parseRows(result);

    return rows.map((row) => ({
      companyCode: row.RBUKRS || "",
      glAccount: row.RACCT || "",
      fiscalYear: row.RYEAR || "",
      period: row.RPMAX || "",
      debitCreditIndicator: row.DRCRK || "",
      balance: parseFloat(row.RPMAX) || 0,
    }));
  }

  /**
   * Get GL summary grouped by company code.
   * Useful for reconciliation against inventory locations.
   * @param {object} filters
   * @returns {Promise<GLSummary[]>}
   */
  async getGLSummary(filters = {}) {
    const balances = await this.getGLBalances(filters);

    const summaryMap = {};

    for (const record of balances) {
      const key = record.companyCode;

      if (!summaryMap[key]) {
        summaryMap[key] = {
          companyCode: key,
          totalDebit: 0,
          totalCredit: 0,
          netBalance: 0,
        };
      }

      if (record.debitCreditIndicator === "S") {
        summaryMap[key].totalDebit += record.balance;
      } else {
        summaryMap[key].totalCredit += record.balance;
      }
    }

    // Calculate net balance
    for (const key of Object.keys(summaryMap)) {
      const s = summaryMap[key];
      s.netBalance = s.totalDebit - s.totalCredit;
    }

    return Object.values(summaryMap);
  }

  _buildWhere(filters) {
    const where = [];
    if (filters.companyCode) {
      where.push(`RBUKRS = '${filters.companyCode}'`);
    }
    if (filters.fiscalYear) {
      where.push(`RYEAR = '${filters.fiscalYear}'`);
    }
    if (filters.account) {
      where.push(`RACCT = '${filters.account}'`);
    }
    return where;
  }
}

module.exports = GLDatasetService;
