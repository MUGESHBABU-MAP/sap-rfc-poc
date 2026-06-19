const express = require("express");
const router = express.Router();

/**
 * GL Routes
 *
 * GET /api/gl/full     - Full GL balance records from FAGLFLEXT
 * GET /api/gl/summary  - GL summary grouped by company code
 *
 * Query params (all optional):
 *   companyCode, fiscalYear, glAccount
 */
module.exports = function (glDatasetService, glSummaryService) {
  /**
   * GET /api/gl/full
   * Returns all GLBalanceRecord objects with cumulative balances.
   */
  router.get("/full", async (req, res) => {
    try {
      const filters = extractGLFilters(req.query);
      const data = await glDatasetService.getGLBalances(filters);

      res.json({
        success: true,
        data,
        meta: {
          count: data.length,
          filters,
          note: "Balance = HSLVT + HSL01..HSL16 (local currency). Only RRCTY=0, RVERS=001.",
        },
      });
    } catch (err) {
      console.error("GET /api/gl/full error:", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/gl/summary
   * Returns GL totals grouped by company code.
   */
  router.get("/summary", async (req, res) => {
    try {
      const filters = extractGLFilters(req.query);
      const records = await glDatasetService.getGLBalances(filters);
      const data = glSummaryService.summarizeByCompanyCode(records);

      res.json({
        success: true,
        data,
        meta: {
          companyCount: data.length,
          totalRecords: records.length,
          filters,
        },
      });
    } catch (err) {
      console.error("GET /api/gl/summary error:", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
};

function extractGLFilters(query) {
  return {
    companyCode: query.companyCode || undefined,
    fiscalYear: query.fiscalYear || undefined,
    glAccount: query.glAccount || undefined,
  };
}
