const parseRows = require("../utils/parse-rows");

/**
 * Account Service (Phase 3.18A)
 *
 * Reads available GL accounts from SAP and returns them
 * for user selection. Does NOT determine which accounts
 * are inventory accounts — that is left to user selection.
 *
 * SAP Tables Used:
 *   SKA1 - GL Account Master (Chart of Accounts level)
 *     Fields: KTOPL (Chart of Accounts), SAKNR (GL Account Number)
 *
 *   SKAT - GL Account Descriptions
 *     Fields: SPRAS (Language), KTOPL (Chart of Accounts),
 *             SAKNR (GL Account Number), TXT20 (Short Text),
 *             TXT50 (Long Text)
 *
 *   SKB1 - GL Account Master (Company Code level)
 *     Fields: BUKRS (Company Code), SAKNR (GL Account Number)
 *
 * Strategy:
 *   1. Read SKB1 to get accounts assigned to the company code
 *   2. Read SKAT to get account descriptions (language = EN)
 *   3. Join and deduplicate by account number
 */
class AccountService {
  constructor(sapService) {
    this.sap = sapService;
  }

  /**
   * Get all GL accounts for a company code with descriptions.
   *
   * @param {object} options
   * @param {string} options.companyCode - SAP company code (e.g., "1000")
   * @param {string} [options.chartOfAccounts] - Chart of accounts (auto-detected if not provided)
   * @param {string} [options.language] - Language key for descriptions (default: "EN")
   * @returns {Promise<AccountRecord[]>}
   */
  async getAccounts(options = {}) {
    const { companyCode, language = "EN" } = options;

    if (!companyCode) {
      throw new Error("companyCode is required");
    }

    // Step 1: Read accounts assigned to company code from SKB1
    const skb1Rows = await this._readSKB1(companyCode);

    if (skb1Rows.length === 0) {
      return [];
    }

    // Step 2: Detect chart of accounts from T001
    const chartOfAccounts =
      options.chartOfAccounts || (await this._getChartOfAccounts(companyCode));

    // Step 3: Read account descriptions from SKAT
    const skatRows = await this._readSKAT(chartOfAccounts, language);

    // Step 4: Build description lookup
    const descMap = new Map();
    for (let i = 0; i < skatRows.length; i++) {
      const acct = (skatRows[i].SAKNR || "").trim();
      descMap.set(acct, {
        shortText: (skatRows[i].TXT20 || "").trim(),
        longText: (skatRows[i].TXT50 || "").trim(),
      });
    }

    // Step 5: Join and deduplicate
    const seen = new Set();
    const accounts = [];

    for (let i = 0; i < skb1Rows.length; i++) {
      const acct = (skb1Rows[i].SAKNR || "").trim();
      if (!acct || seen.has(acct)) continue;
      seen.add(acct);

      const desc = descMap.get(acct) || { shortText: "", longText: "" };
      accounts.push({
        account: acct,
        description: desc.longText || desc.shortText || "",
        shortDescription: desc.shortText || "",
        companyCode: companyCode,
      });
    }

    // Sort by account number
    accounts.sort((a, b) => a.account.localeCompare(b.account));

    return accounts;
  }

  /**
   * Read GL accounts from SKB1 (Company Code level).
   */
  async _readSKB1(companyCode) {
    try {
      const fields = ["BUKRS", "SAKNR"];
      const where = [`BUKRS = '${companyCode}'`];
      const result = await this.sap.readTable("SKB1", fields, { where });
      return parseRows(result);
    } catch (err) {
      console.warn(`  [SKB1] Read failed: ${err.message}`);
      // Fallback: try SKA1 if SKB1 is not available
      return this._readSKA1Fallback(companyCode);
    }
  }

  /**
   * Fallback: Read from SKA1 if SKB1 fails.
   * SKA1 is chart-of-accounts level (not company-code specific).
   */
  async _readSKA1Fallback(companyCode) {
    try {
      const chartOfAccounts = await this._getChartOfAccounts(companyCode);
      if (!chartOfAccounts) return [];

      const fields = ["KTOPL", "SAKNR"];
      const where = [`KTOPL = '${chartOfAccounts}'`];
      const result = await this.sap.readTable("SKA1", fields, { where });
      return parseRows(result);
    } catch (err) {
      console.warn(`  [SKA1] Fallback read failed: ${err.message}`);
      return [];
    }
  }

  /**
   * Read account descriptions from SKAT.
   */
  async _readSKAT(chartOfAccounts, language) {
    if (!chartOfAccounts) return [];

    try {
      const fields = ["SAKNR", "TXT20", "TXT50"];
      const where = [`SPRAS = '${language}' AND KTOPL = '${chartOfAccounts}'`];
      const result = await this.sap.readTable("SKAT", fields, { where });
      return parseRows(result);
    } catch (err) {
      console.warn(`  [SKAT] Description read failed: ${err.message}`);
      return [];
    }
  }

  /**
   * Get chart of accounts for a company code from T001.
   */
  async _getChartOfAccounts(companyCode) {
    try {
      const fields = ["BUKRS", "KTOPL"];
      const where = [`BUKRS = '${companyCode}'`];
      const result = await this.sap.readTable("T001", fields, {
        where,
        rowCount: 1,
      });
      const rows = parseRows(result);
      return rows.length > 0 ? (rows[0].KTOPL || "").trim() : "";
    } catch (err) {
      console.warn(`  [T001] Chart of accounts lookup failed: ${err.message}`);
      return "";
    }
  }
}

module.exports = AccountService;
