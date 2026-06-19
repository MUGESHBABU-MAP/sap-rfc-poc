const express = require("express");
const router = express.Router();

/**
 * Reconciliation Routes
 *
 * GET /api/reconciliation/plant             - Plant-level reconciliation
 * GET /api/reconciliation/storage-location  - Storage location reconciliation
 * GET /api/reconciliation/top-variances     - Top variances sorted by ABS(variance)
 * GET /api/reconciliation/summary           - Overall reconciliation summary
 *
 * Query params:
 *   Inventory: plant, storageLocation, material
 *   GL: companyCode, fiscalYear, glAccount
 */
module.exports = function (
  inventoryDatasetService,
  glDatasetService,
  reconciliationService,
) {
  /**
   * GET /api/reconciliation/plant
   */
  router.get("/plant", async (req, res) => {
    try {
      const { inventoryRecords, glRecords } = await fetchData(
        req.query,
        inventoryDatasetService,
        glDatasetService,
      );

      const data = reconciliationService.reconcileByPlant(
        inventoryRecords,
        glRecords,
      );

      res.json({
        success: true,
        data,
        meta: {
          plantCount: data.length,
          inventoryRecords: inventoryRecords.length,
          glRecords: glRecords.length,
        },
      });
    } catch (err) {
      console.error("GET /api/reconciliation/plant error:", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/reconciliation/storage-location
   */
  router.get("/storage-location", async (req, res) => {
    try {
      const { inventoryRecords, glRecords } = await fetchData(
        req.query,
        inventoryDatasetService,
        glDatasetService,
      );

      const data = reconciliationService.reconcileByStorageLocation(
        inventoryRecords,
        glRecords,
      );

      res.json({
        success: true,
        data,
        meta: {
          locationCount: data.length,
          inventoryRecords: inventoryRecords.length,
          glRecords: glRecords.length,
        },
      });
    } catch (err) {
      console.error(
        "GET /api/reconciliation/storage-location error:",
        err.message,
      );
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/reconciliation/top-variances
   * Query: limit (default 100)
   */
  router.get("/top-variances", async (req, res) => {
    try {
      const { inventoryRecords, glRecords } = await fetchData(
        req.query,
        inventoryDatasetService,
        glDatasetService,
      );

      const limit = parseInt(req.query.limit) || 100;
      const data = reconciliationService.getTopVariances(
        inventoryRecords,
        glRecords,
        limit,
      );

      res.json({
        success: true,
        data,
        meta: { limit, returned: data.length },
      });
    } catch (err) {
      console.error(
        "GET /api/reconciliation/top-variances error:",
        err.message,
      );
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/reconciliation/summary
   */
  router.get("/summary", async (req, res) => {
    try {
      const { inventoryRecords, glRecords } = await fetchData(
        req.query,
        inventoryDatasetService,
        glDatasetService,
      );

      const data = reconciliationService.getSummary(
        inventoryRecords,
        glRecords,
      );

      res.json({
        success: true,
        data,
        meta: {
          inventoryRecords: inventoryRecords.length,
          glRecords: glRecords.length,
        },
      });
    } catch (err) {
      console.error("GET /api/reconciliation/summary error:", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
};

/**
 * Fetch both inventory and GL data in parallel based on query params.
 */
async function fetchData(query, inventoryDatasetService, glDatasetService) {
  const invFilters = {
    plant: query.plant || undefined,
    storageLocation: query.storageLocation || undefined,
    material: query.material || undefined,
  };

  const glFilters = {
    companyCode: query.companyCode || undefined,
    fiscalYear: query.fiscalYear || undefined,
    glAccount: query.glAccount || undefined,
  };

  const [inventoryRecords, glRecords] = await Promise.all([
    inventoryDatasetService.getInventoryDataset(invFilters),
    glDatasetService.getGLBalances(glFilters),
  ]);

  return { inventoryRecords, glRecords };
}
