const parseRows = require("../utils/parse-rows");
const accountMaster = require("../config/inventory-account-master.json");

/**
 * Account Analysis Service (Phase 3.18B)
 *
 * ANALYSIS ONLY - Does NOT modify reconciliation logic.
 *
 * Analyzes GL accounts for a company code and fiscal year:
 *   - Which accounts have balances
 *   - Which accounts are currently configured for inventory
 *   - Which accounts may be inventory-related (keyword match)
 *
 * Balance Calculation:
 *   Reuses same formula as GLDatasetService:
 *   cumulativeBalance = HSLVT + HSL01 + HSL02 + ... + HSL12
 *
 * SAP Tables:
 *   SKB1  - GL accounts at company code level
 *   SKAT  - Account descriptions
 *   FAGLFLEXT - Actual balances (RRCTY=0, RVERS=001)
 *   T001  - Company code master (chart of accounts)
 */

const HSL_PART1 = ["HSL01", "HSL02", "HSL03", "HSL04", "HSL05", "HSL06"];
const HSL_PART2 = ["HSL07", "HSL08", "HSL09", "HSL10", "HSL11", "HSL12"];

const INVENTORY_KEYWORDS = [
  "INVENTORY",
  "STOCK",
  "RAW MATERIAL",
  "FINISHED",
  "FG",
  "RM",
  "WIP",
  "PROTOTYPE",
  "TRADING GOODS",
  "SEMI-FINISHED",
  "PACKAGING",
  "CONSUMABLE",
  "SPARE",
  "GOODS IN TRANSIT",
  "WORK IN PROCESS",
  "MERCHANDISE",
];

class AccountAnalysisService {
  constructor(sapService) {
    this.sap = sapService;
  }

  /**
   * Analyze all GL accounts for a company code and fiscal year.
   *
   * @param {string} companyCode
   * @param {string} fiscalYear
   * @returns {Promise<AccountAnalysisResult>}
   */
  async analyzeAccounts(companyCode, fiscalYear) {
    // Step 1: Get all accounts with descriptions
    const chartOfAccounts = await this._getChartOfAccounts(companyCode);
    const skb1Rows = await this._readSKB1(companyCode);
    const skatRows = await this._readSKAT(chartOfAccounts);

    // Build description map
    const descMap = new Map();
    for (let i = 0; i < skatRows.length; i++) {
      const acct = (skatRows[i].SAKNR || "").trim();
      descMap.set(acct, {
        shortText: (skatRows[i].TXT20 || "").trim(),
        longText: (skatRows[i].TXT50 || "").trim(),
      });
    }

    // Deduplicate accounts
    const seen = new Set();
    const allAccounts = [];
    for (let i = 0; i < skb1Rows.length; i++) {
      const acct = (skb1Rows[i].SAKNR || "").trim();
      if (!acct || seen.has(acct)) continue;
      seen.add(acct);
      const desc = descMap.get(acct) || { shortText: "", longText: "" };
      allAccounts.push({
        account: acct,
        description: desc.longText || desc.shortText || "",
        shortDescription: desc.shortText || "",
      });
    }
    allAccounts.sort((a, b) => a.account.localeCompare(b.account));

    // Step 2: Get balances from FAGLFLEXT
    const balanceMap = await this._getAccountBalances(companyCode, fiscalYear);

    // Step 3: Get current inventory accounts from config
    const currentInventoryAccounts = new Set(
      (accountMaster[companyCode] || {}).inventoryAccounts || [],
    );

    // Step 4: Classify each account
    const accountDetails = [];
    let accountsWithBalances = 0;
    let accountsWithoutBalances = 0;
    let currentInvActive = 0;
    const candidateInventoryAccounts = [];

    for (let i = 0; i < allAccounts.length; i++) {
      const a = allAccounts[i];
      const balance = balanceMap.get(a.account) || 0;
      const hasBalance = balance !== 0;
      const isCurrentInventoryAccount = currentInventoryAccounts.has(a.account);
      const keywordResult = this._matchInventoryKeyword(a.description);

      let recommendation = "NO_BALANCE";
      if (isCurrentInventoryAccount) {
        recommendation = "CURRENT_INVENTORY";
        if (hasBalance) currentInvActive++;
      } else if (hasBalance) {
        recommendation = "HAS_BALANCE";
      }

      if (keywordResult.matched && !isCurrentInventoryAccount && hasBalance) {
        recommendation = "POTENTIAL_INVENTORY";
        candidateInventoryAccounts.push(a.account);
      }

      if (hasBalance) accountsWithBalances++;
      else accountsWithoutBalances++;

      accountDetails.push({
        account: a.account,
        description: a.description,
        companyCode,
        hasBalance,
        balance: round2(balance),
        isCurrentInventoryAccount,
        inventoryKeywordMatch: keywordResult.matched,
        keywordMatched: keywordResult.keyword,
        recommendation,
      });
    }

    return {
      totalAccounts: allAccounts.length,
      accountsWithBalances,
      accountsWithoutBalances,
      currentInventoryAccounts: currentInventoryAccounts.size,
      currentInventoryAccountsActive: currentInvActive,
      candidateInventoryAccounts: candidateInventoryAccounts.length,
      accountDetails,
    };
  }

  /**
   * Get cumulative balances from FAGLFLEXT grouped by account.
   * Reuses same formula as GLDatasetService:
   *   balance = HSLVT + HSL01..HSL12
   */
  async _getAccountBalances(companyCode, fiscalYear) {
    const balanceMap = new Map();

    try {
      const where = this._buildBalanceWhere(companyCode, fiscalYear);

      // Batch 1: RACCT + HSLVT + HSL01-06
      const batch1Fields = ["RACCT", "HSLVT", ...HSL_PART1];
      // Batch 2: RACCT + HSL07-12
      const batch2Fields = ["RACCT", ...HSL_PART2];

      const [result1, result2] = await Promise.all([
        this.sap.readTable("FAGLFLEXT", batch1Fields, { where }),
        this.sap.readTable("FAGLFLEXT", batch2Fields, { where }),
      ]);

      const rows1 = parseRows(result1);
      const rows2 = parseRows(result2);

      for (let i = 0; i < rows1.length; i++) {
        const row1 = rows1[i];
        const row2 = rows2[i] || {};
        const acct = (row1.RACCT || "").trim();

        const hslvt = parseFloat(row1.HSLVT) || 0;
        const hslSum1 = sumFields(row1, HSL_PART1);
        const hslSum2 = sumFields(row2, HSL_PART2);
        const balance = hslvt + hslSum1 + hslSum2;

        // Aggregate by account (multiple rows per account possible)
        const existing = balanceMap.get(acct) || 0;
        balanceMap.set(acct, existing + balance);
      }
    } catch (err) {
      console.warn(`  [FAGLFLEXT] Balance read failed: ${err.message}`);
    }

    return balanceMap;
  }

  /**
   * Build WHERE clause for FAGLFLEXT balance extraction.
   */
  _buildBalanceWhere(companyCode, fiscalYear) {
    const conditions = [
      "RRCTY = '0'",
      "RVERS = '001'",
      `RBUKRS = '${companyCode}'`,
    ];
    if (fiscalYear) {
      conditions.push(`RYEAR = '${fiscalYear}'`);
    }

    const combined = conditions.join(" AND ");
    if (combined.length <= 72) return [combined];
    return this._splitWhereRows(conditions);
  }

  /**
   * Match account description against inventory keywords.
   */
  _matchInventoryKeyword(description) {
    if (!description) return { matched: false, keyword: "" };
    const upper = description.toUpperCase();
    for (let i = 0; i < INVENTORY_KEYWORDS.length; i++) {
      if (upper.includes(INVENTORY_KEYWORDS[i])) {
        return { matched: true, keyword: INVENTORY_KEYWORDS[i] };
      }
    }
    return { matched: false, keyword: "" };
  }

  /**
   * Get chart of accounts from T001.
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

  /**
   * Read accounts from SKB1.
   */
  async _readSKB1(companyCode) {
    try {
      const fields = ["BUKRS", "SAKNR"];
      const where = [`BUKRS = '${companyCode}'`];
      const result = await this.sap.readTable("SKB1", fields, { where });
      return parseRows(result);
    } catch (err) {
      console.warn(`  [SKB1] Read failed: ${err.message}`);
      return [];
    }
  }

  /**
   * Read account descriptions from SKAT.
   */
  async _readSKAT(chartOfAccounts) {
    if (!chartOfAccounts) return [];
    try {
      const fields = ["SAKNR", "TXT20", "TXT50"];
      const where = [`SPRAS = 'EN' AND KTOPL = '${chartOfAccounts}'`];
      const result = await this.sap.readTable("SKAT", fields, { where });
      return parseRows(result);
    } catch (err) {
      console.warn(`  [SKAT] Description read failed: ${err.message}`);
      return [];
    }
  }

  /**
   * Split conditions into multiple OPTIONS rows, each <=72 chars.
   */
  _splitWhereRows(conditions) {
    const rows = [];
    let current = "";
    for (let i = 0; i < conditions.length; i++) {
      const condition = conditions[i];
      const prefix = current.length === 0 ? "" : " AND ";
      const candidate = current + prefix + condition;
      if (candidate.length <= 72) {
        current = candidate;
      } else {
        if (current.length > 0) rows.push(current);
        current = "AND " + condition;
      }
    }
    if (current.length > 0) rows.push(current);
    return rows;
  }
}

function sumFields(row, fields) {
  let total = 0;
  for (const field of fields) {
    total += parseFloat(row[field]) || 0;
  }
  return total;
}

function round2(val) {
  return Math.round(val * 100) / 100;
}

module.exports = AccountAnalysisService;
