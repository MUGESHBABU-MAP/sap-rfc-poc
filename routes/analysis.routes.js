const express = require("express");
const router = express.Router();

/**
 * Analysis Routes
 *
 * GET /api/analysis/field-mapping - Field mapping coverage report
 */
module.exports = function (fieldMappingService) {
  /**
   * GET /api/analysis/field-mapping
   * Returns coverage analysis and full mapping matrix.
   */
  router.get("/field-mapping", (req, res) => {
    try {
      const report = fieldMappingService.getFieldMappingReport();

      res.json({
        success: true,
        data: {
          coveragePercent: report.coveragePercent,
          totalColumns: report.totalColumns,
          coveredColumns: report.coveredColumns,
          missingColumns: report.missingColumns,
          breakdown: report.breakdown,
          mappings: report.mappings,
        },
      });
    } catch (err) {
      console.error("GET /api/analysis/field-mapping error:", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/analysis/field-mapping/gaps
   * Returns only missing / investigation-required fields.
   */
  router.get("/field-mapping/gaps", (req, res) => {
    try {
      const gaps = fieldMappingService.getGaps();

      res.json({
        success: true,
        data: gaps,
        meta: { count: gaps.length },
      });
    } catch (err) {
      console.error("GET /api/analysis/field-mapping/gaps error:", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
};
