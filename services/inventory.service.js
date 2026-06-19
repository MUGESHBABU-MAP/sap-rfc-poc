const parseRows = require("../utils/parse-rows");

/**
 * Legacy Inventory Service - kept for backwards compatibility with existing tests.
 * For the full dataset, use InventoryDatasetService instead.
 */
class InventoryService {
  constructor(sapService) {
    this.sap = sapService;
  }

  async getInventory() {
    const result = await this.sap.readTable(
      "MARD",
      ["MATNR", "WERKS", "LGORT", "LABST", "INSME", "SPEME"],
      { rowCount: 100 },
    );

    return parseRows(result);
  }
}

module.exports = InventoryService;
