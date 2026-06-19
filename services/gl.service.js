/**
 * @deprecated Use GLDatasetService and GLSummaryService instead.
 * Kept for backwards compatibility with legacy test scripts.
 */
const parseRows = require("../utils/parse-rows");

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
