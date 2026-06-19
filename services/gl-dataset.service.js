const parseRows = require("../utils/parse-rows");

/**
 * GL Dataset Service
 *
 * Extracts GL balance records from FAGLFLEXT (New GL Line Item Totals).
 * Reproduces customer FAGLB03 extraction logic.
 *
 * Balance Calculation (matches FAGLB03):
 *   cumulativeBalance = HSLVT + HSL01 + HSL02 + ... + HSL12
 *
 * Filters applied server-side:
 *   RRCTY = '0' (Actual postings only)
 *   RVERS = '001' (Standard version only)
 *
 * NOTE: WHERE clauses are combined into single OPTIONS rows using AND
 * because some SAP systems do not support multiple OPTIONS table rows
 * as implicit AND conditions (causes "dynamic entry parsing" error).
 *
 * Reads in smaller batches to stay within RFC_READ_TABLE width limits.
 */

const HSL_PART1 = ["HSL01", "HSL02", "HSL03", "HSL04", "HSL05", "HSL06"];
const HSL_PART2 = ["HSL07", "HSL08", "HSL09", "HSL10", "HSL11", "HSL12"];
const TSL_PART1 = ["TSL01", "TSL02", "TSL03", "TSL04", "TSL05", "TSL06"];
const TSL_PART2 = ["TSL07", "TSL08", "TSL09", "TSL10", "TSL11", "TSL12"];

class GLDatasetService {
  constructor(sapService) {
    this.sap = sapService;
  }

  /**
   * Get GL balance records from FAGLFLEXT.
   * Only actual postings (RRCTY=0, RVERS=001).
   *
   * @param {object} filters - { companyCode?, fiscalYear?, glAccount? }
   * @param {number} rowCount - max rows to fetch (0 = all). Default 0.
   * @returns {Promise<GLBalanceRecord[]>}
   */
  async getGLBalances(filters = {}, rowCount = 0) {
    const where = this._buildWhere(filters);

    // Batch 1: Identity + HSLVT + HSL01-06
    const batch1Fields = [
      "RBUKRS",
      "RACCT",
      "RYEAR",
      "RPMAX",
      "DRCRK",
      "HSLVT",
      ...HSL_PART1,
    ];

    // Batch 2: Identity keys + HSL07-12
    const batch2Fields = ["RBUKRS", "RACCT", "RYEAR", ...HSL_PART2];

    // Execute mandatory batches (local currency)
    const [result1, result2] = await Promise.all([
      this.sap.readTable("FAGLFLEXT", batch1Fields, { where, rowCount }),
      this.sap.readTable("FAGLFLEXT", batch2Fields, { where, rowCount }),
    ]);

    const rows1 = parseRows(result1);
    const rows2 = parseRows(result2);

    // Transaction currency batches - optional (fail gracefully)
    let rows3 = [];
    let rows4 = [];
    try {
      const batch3Fields = ["RBUKRS", "RACCT", "RYEAR", "TSLVT", ...TSL_PART1];
      const batch4Fields = ["RBUKRS", "RACCT", "RYEAR", ...TSL_PART2];

      const [result3, result4] = await Promise.all([
        this.sap.readTable("FAGLFLEXT", batch3Fields, { where, rowCount }),
        this.sap.readTable("FAGLFLEXT", batch4Fields, { where, rowCount }),
      ]);
      rows3 = parseRows(result3);
      rows4 = parseRows(result4);
    } catch (err) {
      console.warn(
        "TSL fields unavailable, skipping transaction currency:",
        err.message,
      );
    }

    // Merge batches by index (same WHERE + same order = same rows)
    const records = rows1.map((row, idx) => {
      const row2 = rows2[idx] || {};
      const row3 = rows3[idx] || {};
      const row4 = rows4[idx] || {};

      // Local currency: HSLVT + HSL01..HSL12
      const hslvt = parseFloat(row.HSLVT) || 0;
      const hslSum1 = sumFields(row, HSL_PART1);
      const hslSum2 = sumFields(row2, HSL_PART2);
      const localCurrencyBalance = round2(hslvt + hslSum1 + hslSum2);

      // Transaction currency: TSLVT + TSL01..TSL12
      const tslvt = parseFloat(row3.TSLVT) || 0;
      const tslSum1 = sumFields(row3, TSL_PART1);
      const tslSum2 = sumFields(row4, TSL_PART2);
      const transactionCurrencyBalance = round2(tslvt + tslSum1 + tslSum2);

      return {
        companyCode: row.RBUKRS || "",
        glAccount: row.RACCT || "",
        fiscalYear: row.RYEAR || "",
        period: row.RPMAX || "",
        debitCreditIndicator: row.DRCRK || "",
        cumulativeBalance: localCurrencyBalance,
        localCurrencyBalance,
        transactionCurrencyBalance,
      };
    });

    return records;
  }

  /**
   * Build WHERE clause for FAGLFLEXT.
   *
   * IMPORTANT: Combines all conditions into a SINGLE OPTIONS row
   * using AND keyword. Some SAP systems do not support multiple
   * OPTIONS rows as implicit AND (causes dynamic parsing error).
   *
   * Returns: ["condition1 AND condition2 AND ..."]
   */
  _buildWhere(filters) {
    const conditions = ["RRCTY = '0'", "RVERS = '001'"];

    if (filters.companyCode) {
      conditions.push(`RBUKRS = '${filters.companyCode}'`);
    }
    if (filters.fiscalYear) {
      conditions.push(`RYEAR = '${filters.fiscalYear}'`);
    }
    if (filters.glAccount) {
      conditions.push(`RACCT = '${filters.glAccount}'`);
    }

    // Join all conditions with AND into a single OPTIONS row
    return [conditions.join(" AND ")];
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

module.exports = GLDatasetService;
