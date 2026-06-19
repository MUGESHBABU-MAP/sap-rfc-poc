const parseRows = require("../utils/parse-rows");

/**
 * GL Dataset Service
 *
 * Extracts GL balance records from FAGLFLEXT (New GL Line Item Totals).
 * Reproduces customer FAGLB03 extraction logic.
 *
 * Balance Calculation (matches FAGLB03):
 *   cumulativeBalance = HSLVT + HSL01 + HSL02 + ... + HSL16
 *
 * Filters applied server-side:
 *   RRCTY = '0' (Actual postings only)
 *   RVERS = '001' (Standard version only)
 *
 * RFC_READ_TABLE has a width limit (~512 chars per row), so we read
 * amount fields in batches and merge by row index.
 */

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
  "HSL13",
  "HSL14",
  "HSL15",
  "HSL16",
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
  "TSL13",
  "TSL14",
  "TSL15",
  "TSL16",
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
  "KSL13",
  "KSL14",
  "KSL15",
  "KSL16",
];

class GLDatasetService {
  constructor(sapService) {
    this.sap = sapService;
  }

  /**
   * Get GL balance records from FAGLFLEXT.
   * Only actual postings (RRCTY=0, RVERS=001).
   *
   * @param {object} filters - { companyCode?, fiscalYear?, glAccount? }
   * @returns {Promise<GLBalanceRecord[]>}
   */
  async getGLBalances(filters = {}) {
    const where = this._buildWhere(filters);

    // Batch 1: Identity fields + carry-forward + local currency periods (HSL)
    const batch1Fields = [
      "RBUKRS",
      "RACCT",
      "RYEAR",
      "RPMAX",
      "DRCRK",
      "HSLVT",
      ...HSL_PERIODS,
    ];

    // Batch 2: Transaction currency (TSL)
    const batch2Fields = ["RBUKRS", "RACCT", "RYEAR", "TSLVT", ...TSL_PERIODS];

    // Batch 3: Group currency (KSL)
    const batch3Fields = ["RBUKRS", "RACCT", "RYEAR", "KSLVT", ...KSL_PERIODS];

    const [result1, result2, result3] = await Promise.all([
      this.sap.readTable("FAGLFLEXT", batch1Fields, { where }),
      this.sap.readTable("FAGLFLEXT", batch2Fields, { where }),
      this.sap.readTable("FAGLFLEXT", batch3Fields, { where }),
    ]);

    const rows1 = parseRows(result1);
    const rows2 = parseRows(result2);
    const rows3 = parseRows(result3);

    // Merge batches by index (same WHERE produces same row order)
    const records = rows1.map((row, idx) => {
      const tslRow = rows2[idx] || {};
      const kslRow = rows3[idx] || {};

      // Local currency cumulative balance
      const hslvt = parseFloat(row.HSLVT) || 0;
      const hslPeriodTotal = this._sumPeriods(row, HSL_PERIODS);
      const localCurrencyBalance = round2(hslvt + hslPeriodTotal);

      // Transaction currency cumulative balance
      const tslvt = parseFloat(tslRow.TSLVT) || 0;
      const tslPeriodTotal = this._sumPeriods(tslRow, TSL_PERIODS);
      const transactionCurrencyBalance = round2(tslvt + tslPeriodTotal);

      // Group currency cumulative balance
      const kslvt = parseFloat(kslRow.KSLVT) || 0;
      const kslPeriodTotal = this._sumPeriods(kslRow, KSL_PERIODS);
      const groupCurrencyBalance = round2(kslvt + kslPeriodTotal);

      return {
        companyCode: row.RBUKRS || "",
        glAccount: row.RACCT || "",
        fiscalYear: row.RYEAR || "",
        period: row.RPMAX || "",
        debitCreditIndicator: row.DRCRK || "",
        cumulativeBalance: localCurrencyBalance,
        localCurrencyBalance,
        transactionCurrencyBalance,
        groupCurrencyBalance,
      };
    });

    return records;
  }

  /**
   * Sum period amount fields from a row.
   */
  _sumPeriods(row, periodFields) {
    let total = 0;
    for (const field of periodFields) {
      total += parseFloat(row[field]) || 0;
    }
    return total;
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

function round2(val) {
  return Math.round(val * 100) / 100;
}

module.exports = GLDatasetService;
