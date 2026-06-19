/**
 * GL Summary Service
 *
 * Takes GLBalanceRecord[] from GLDatasetService
 * and groups by companyCode to produce GL summaries.
 *
 * Output: { companyCode, totalGLBalance }
 */
class GLSummaryService {
  /**
   * Generate GL summary grouped by company code.
   * @param {GLBalanceRecord[]} glRecords
   * @returns {GLSummary[]}
   */
  summarizeByCompanyCode(glRecords) {
    const companyMap = {};

    for (const record of glRecords) {
      const cc = record.companyCode || "UNKNOWN";

      if (!companyMap[cc]) {
        companyMap[cc] = {
          companyCode: cc,
          totalGLBalance: 0,
          accountCount: 0,
          debitBalance: 0,
          creditBalance: 0,
        };
      }

      const summary = companyMap[cc];

      if (record.debitCreditIndicator === "S") {
        summary.debitBalance += record.cumulativeBalance;
      } else {
        summary.creditBalance += record.cumulativeBalance;
      }

      summary.totalGLBalance += record.cumulativeBalance;
      summary.accountCount += 1;
    }

    // Round final values
    return Object.values(companyMap).map((s) => ({
      ...s,
      totalGLBalance: round2(s.totalGLBalance),
      debitBalance: round2(s.debitBalance),
      creditBalance: round2(s.creditBalance),
    }));
  }
}

function round2(val) {
  return Math.round(val * 100) / 100;
}

module.exports = GLSummaryService;
