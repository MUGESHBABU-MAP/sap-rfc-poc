const parseRows = require("../utils/parse-rows");

class InventoryService {
  constructor(sapService) {
    this.sap = sapService;
  }

  async getInventory() {
    const result = await this.sap.readTable(
      "MARD",
      ["MATNR", "WERKS", "LGORT", "LABST", "INSME", "SPEME"],
      100,
    );

    return parseRows(result);
  }
}

module.exports = InventoryService;
