const express = require("express");
const router = express.Router();

/**
 * Inventory Routes
 *
 * GET /api/inventory/full     - Full inventory dataset
 * GET /api/inventory/summary  - Location-wise inventory summary
 *
 * Query params (all optional):
 *   plant, storageLocation, material
 */
module.exports = function (inventoryDatasetService, inventorySummaryService) {
  /**
   * GET /api/inventory/full
   * Returns all InventoryRecord objects joined from MARD+MARA+MAKT+MARC+MBEW.
   */
  router.get("/full", async (req, res) => {
    try {
      const filters = extractInventoryFilters(req.query);
      const data = await inventoryDatasetService.getInventoryDataset(filters);

      res.json({
        success: true,
        data,
        meta: {
          count: data.length,
          filters,
        },
      });
    } catch (err) {
      console.error("GET /api/inventory/full error:", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/inventory/summary
   * Returns inventory grouped by storageLocation.
   */
  router.get("/summary", async (req, res) => {
    try {
      const filters = extractInventoryFilters(req.query);
      const records =
        await inventoryDatasetService.getInventoryDataset(filters);
      const data = inventorySummaryService.summarizeByLocation(records);

      res.json({
        success: true,
        data,
        meta: {
          locationCount: data.length,
          totalMaterials: records.length,
          filters,
        },
      });
    } catch (err) {
      console.error("GET /api/inventory/summary error:", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
};

function extractInventoryFilters(query) {
  return {
    plant: query.plant || undefined,
    storageLocation: query.storageLocation || undefined,
    material: query.material || undefined,
  };
}
