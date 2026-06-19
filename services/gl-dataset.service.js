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
 * NOTE: Only HSL01-HSL12 used (periods 13-16 are special periods
 * that don't exist in all SAP systems). RFC_READ_TABLE has a ~512 byte
 * row width limit, so we read in smaller batches and merge by row index.
 */

// Only standard 12 periods - HSL13-16 are special periods not in all systems
const HSL_PERIODS = [
  "HSL01",
  "HSL02",
  "HSL03",
  "HSL04",
  "HSL05",
  "HSL06",
  "HSL07",
  "HSL08",
  "HSL09",
  "HSL10",
  "HSL11",
  "HSL12",
];

const TSL_PERIODS = [
  "TSL01",
  "TSL02",
  "TSL03",
  "TSL04",
  "TSL05",
  "TSL06",
  "TSL07",
  "TSL08",
  "TSL09",
  "TSL10",
  "TSL11",
  "TSL12",
];

const KSL_PERIODS = [
  "KSL01",
  "KSL02",
  "KSL03",
  "KSL04",
  "KSL05",
  "KSL06",
  "KSL07",
  "KSL08",
  "KSL09",
  "KSL10",
  "KSL11",
  "KSL12",
];

class GLDatasetService {
  constructor(sapService) {
    this.sap = sapService;
  }

  /**
   * Get GL balance records from FAGLFLEXT.
   * Only actual postings (RRCTY=0, RVERS=001).
   *
   * Reads in 4 smaller batches to stay within RFC_READ_TABLE width limits:
   *   Batch 1: Identity fields + HSLVT + HSL01-HSL06
   *   Batch 2: Identity keys + HSL07-HSL12
   *   Batch 3: Identity keys + TSLVT + TSL01-TSL12
   *   Batch 4: Identity keys + KSLVT + KSL01-KSL12 (optional, fails gracefully)
   *
   * @param {object} filters - { companyCode?, fiscalYear?, glAccount? }
   * @returns {Promise<GLBalanceRecord[]>}
   */
  async getGLBalances(filters = {}) {
    const where = this._buildWhere(filters);

    // Batch 1: Identity + carry-forward + HSL01-06
    const batch1Fields = [
      "RBUKRS",
      "RACCT",
      "RYEAR",
      "RPMAX",
      "DRCRK",
      "HSLVT",
      "HSL01",
      "HSL02",
      "HSL03",
      "HSL04",
      "HSL05",
      "HSL06",
    ];

    // Batch 2: Identity keys + HSL07-12
    const batch2Fields = [
      "RBUKRS",
      "RACCT",
      "RYEAR",
      "HSL07",
      "HSL08",
      "HSL09",
      "HSL10",
      "HSL11",
      "HSL12",
    ];

    // Batch 3: Identity keys + TSLVT + TSL01-06
    const batch3Fields = [
      "RBUKRS",
      "RACCT",
      "RYEAR",
      "TSLVT",
      "TSL01",
      "TSL02",
      "TSL03",
      "TSL04",
      "TSL05",
      "TSL06",
    ];

    // Batch 4: Identity keys + TSL07-12
    const batch4Fields = [
      "RBUKRS",
      "RACCT",
      "RYEAR",
      "TSL07",
      "TSL08",
      "TSL09",
      "TSL10",
      "TSL11",
      "TSL12",
    ];

    // Execute batches - batch 1 & 2 are mandatory (local currency)
    // Batch 3 & 4 (transaction currency) fail gracefully
    const [result1, result2] = await Promise.all([
      this.sap.readTable("FAGLFLEXT", batch1Fields, { where }),
      this.sap.readTable("FAGLFLEXT", batch2Fields, { where }),
    ]);

    const rows1 = parseRows(result1);
    const rows2 = parseRows(result2);

    // Transaction currency batches - optional (may not exist in all systems)
    let rows3 = [];
    let rows4 = [];
    try {
      const [result3, result4] = await Promise.all([
        this.sap.readTable("FAGLFLEXT", batch3Fields, { where }),
        this.sap.readTable("FAGLFLEXT", batch4Fields, { where }),
      ]);
      rows3 = parseRows(result3);
      rows4 = parseRows(result4);
    } catch (err) {
      console.warn(
        "TSL fields unavailable, skipping transaction currency:",
        err.message,
      );
    }

    // Merge batches by index (same WHERE = same row order)
    const records = rows1.map((row, idx) => {
      const row2 = rows2[idx] || {};
      const row3 = rows3[idx] || {};
      const row4 = rows4[idx] || {};

      // Local currency cumulative balance: HSLVT + HSL01..HSL12
      const hslvt = parseFloat(row.HSLVT) || 0;
      const hslPart1 = sumFields(row, [
        "HSL01",
        "HSL02",
        "HSL03",
        "HSL04",
        "HSL05",
        "HSL06",
      ]);
      const hslPart2 = sumFields(row2, [
        "HSL07",
        "HSL08",
        "HSL09",
        "HSL10",
        "HSL11",
        "HSL12",
      ]);
      const localCurrencyBalance = round2(hslvt + hslPart1 + hslPart2);

      // Transaction currency cumulative balance: TSLVT + TSL01..TSL12
      const tslvt = parseFloat(row3.TSLVT) || 0;
      const tslPart1 = sumFields(row3, [
        "TSL01",
        "TSL02",
        "TSL03",
        "TSL04",
        "TSL05",
        "TSL06",
      ]);
      const tslPart2 = sumFields(row4, [
        "TSL07",
        "TSL08",
        "TSL09",
        "TSL10",
        "TSL11",
        "TSL12",
      ]);
      const transactionCurrencyBalance = round2(tslvt + tslPart1 + tslPart2);

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
   * Always includes RRCTY = '0' AND RVERS = '001'.
   */
  _buildWhere(filters) {
    const where = ["RRCTY = '0'", "RVERS = '001'"];
    if (filters.companyCode) {
      where.push(`RBUKRS = '${filters.companyCode}'`);
    }
    if (filters.fiscalYear) {
      where.push(`RYEAR = '${filters.fiscalYear}'`);
    }
    if (filters.glAccount) {
      where.push(`RACCT = '${filters.glAccount}'`);
    }
    return where;
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
