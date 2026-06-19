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

  /**
   * Read an SAP table via RFC_READ_TABLE.
   * @param {string} tableName - SAP table name
   * @param {string[]} fields - fields to select
   * @param {object} options - { rowCount, where[] }
   *   where: array of WHERE clause strings, e.g. ["WERKS = '1000'"]
   */
  async readTable(tableName, fields = [], options = {}) {
    const { rowCount = 0, where = [] } = options;

    const params = {
      QUERY_TABLE: tableName,
      DELIMITER: "|",
    };

    if (rowCount > 0) {
      params.ROWCOUNT = rowCount;
    }

    if (fields.length > 0) {
      params.FIELDS = fields.map((field) => ({ FIELDNAME: field }));
    }

    if (where.length > 0) {
      params.OPTIONS = where.map((clause) => ({ TEXT: clause }));
    }

    return await this.client.call("RFC_READ_TABLE", params);
  }
}

module.exports = SAPService;
