const { Client } = require("node-rfc");

class SAPService {
  constructor(config) {
    this.client = new Client(config);
  }

  async connect() {
    await this.client.open();
  }

  async disconnect() {
    await this.client.close();
  }

  async readTable(tableName, fields = [], rowCount = 10) {
    const params = {
      QUERY_TABLE: tableName,
      DELIMITER: "|",
      ROWCOUNT: rowCount,
    };

    if (fields.length > 0) {
      params.FIELDS = fields.map((field) => ({
        FIELDNAME: field,
      }));
    }

    return await this.client.call("RFC_READ_TABLE", params);
  }
}

module.exports = SAPService;