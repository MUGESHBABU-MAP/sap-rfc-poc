const parseRows = require("../utils/parse-rows");

/**
 * Legacy GL Service - kept for backwards compatibility with existing tests.
 * For the full dataset, use GLDatasetService instead.
 */
class GLService {
  constructor(sapService) {
    this.sap = sapService;
  }

  async getBalances() {
    const result = await this.sap.readTable(
      "FAGLFLEXT",
      ["RBUKRS", "RACCT", "RYEAR", "RPMAX", "DRCRK"],
      { rowCount: 100 },
    );

    return parseRows(result);
  }
}

module.exports = GLService;
