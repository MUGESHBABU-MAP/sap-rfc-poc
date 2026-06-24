const express = require("express");
const router = express.Router();

/**
 * Run History Routes (Phase 3.20)
 *
 * GET /api/run-history          - List run history (with optional filters)
 * GET /api/run-history/:runId   - Get a specific run by ID
 */
module.exports = function (auditTrailService) {
  /**
   * GET /api/run-history
   * Query params: companyCode, plant, fiscalYear, user, fromDate, toDate
   */
  router.get("/", (req, res) => {
    try {
      const filters = {};
      if (req.query.companyCode) filters.companyCode = req.query.companyCode;
      if (req.query.plant) filters.plant = req.query.plant;
      if (req.query.fiscalYear) filters.fiscalYear = req.query.fiscalYear;
      if (req.query.user) filters.user = req.query.user;
      if (req.query.fromDate) filters.fromDate = req.query.fromDate;
      if (req.query.toDate) filters.toDate = req.query.toDate;

      const history = auditTrailService.getRunHistory(filters);

      res.json({
        success: true,
        data: history,
        meta: {
          count: history.length,
          filters,
        },
      });
    } catch (err) {
      console.error("GET /api/run-history error:", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/run-history/:runId
   */
  router.get("/:runId", (req, res) => {
    try {
      const run = auditTrailService.getRun(req.params.runId);
      if (!run) {
        return res.status(404).json({
          success: false,
          error: `Run '${req.params.runId}' not found`,
        });
      }
      res.json({ success: true, data: run });
    } catch (err) {
      console.error("GET /api/run-history/:runId error:", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
};
