const express = require("express");
const path = require("path");
const router = express.Router();

/**
 * Export Routes
 *
 * GET /api/export/inventory           - Full inventory Excel
 * GET /api/export/summary             - Inventory summary Excel
 * GET /api/export/location/:sloc      - Location-specific Excel
 * GET /api/export/reconciliation      - Reconciliation Excel
 *
 * All endpoints return the generated .xlsx file as a download.
 */
module.exports = function (
  inventoryDatasetService,
  inventorySummaryService,
  glDatasetService,
  reconciliationService,
  exportService,
) {
  /**
   * GET /api/export/inventory
   * Query: plant, storageLocation, material
   */
  router.get("/inventory", async (req, res) => {
    try {
      const filters = extractInvFilters(req.query);
      const records =
        await inventoryDatasetService.getInventoryDataset(filters);

      const filePath = await exportService.exportInventoryWorkbook(records);
      const filename = path.basename(filePath);

      res.download(filePath, filename, (err) => {
        if (err) console.error("Download error:", err.message);
      });
    } catch (err) {
      console.error("GET /api/export/inventory error:", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/export/summary
   * Query: plant, storageLocation, material
   */
  router.get("/summary", async (req, res) => {
    try {
      const filters = extractInvFilters(req.query);
      const records =
        await inventoryDatasetService.getInventoryDataset(filters);
      const summary = inventorySummaryService.summarizeByLocation(records);

      const filePath = await exportService.exportInventorySummaryWorkbook(
        summary,
        records,
      );
      const filename = path.basename(filePath);

      res.download(filePath, filename, (err) => {
        if (err) console.error("Download error:", err.message);
      });
    } catch (err) {
      console.error("GET /api/export/summary error:", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/export/location/:sloc
   * Example: /api/export/location/SHYD
   * Query: plant, material
   */
  router.get("/location/:sloc", async (req, res) => {
    try {
      const storageLocation = req.params.sloc;
      const filters = extractInvFilters(req.query);
      const records =
        await inventoryDatasetService.getInventoryDataset(filters);

      const filePath = await exportService.exportLocationWorkbook(
        records,
        storageLocation,
      );
      const filename = path.basename(filePath);

      res.download(filePath, filename, (err) => {
        if (err) console.error("Download error:", err.message);
      });
    } catch (err) {
      console.error("GET /api/export/location error:", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/export/reconciliation
   * Query: plant, storageLocation, material, companyCode, fiscalYear, glAccount
   */
  router.get("/reconciliation", async (req, res) => {
    try {
      const invFilters = extractInvFilters(req.query);
      const glFilters = extractGLFilters(req.query);

      const [inventoryRecords, glRecords] = await Promise.all([
        inventoryDatasetService.getInventoryDataset(invFilters),
        glDatasetService.getGLBalances(glFilters),
      ]);

      const reconResults = reconciliationService.reconcileByPlant(
        inventoryRecords,
        glRecords,
      );
      const filePath =
        await exportService.exportReconciliationWorkbook(reconResults);
      const filename = path.basename(filePath);

      res.download(filePath, filename, (err) => {
        if (err) console.error("Download error:", err.message);
      });
    } catch (err) {
      console.error("GET /api/export/reconciliation error:", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
};

function extractInvFilters(query) {
  return {
    plant: query.plant || undefined,
    storageLocation: query.storageLocation || undefined,
    material: query.material || undefined,
  };
}

function extractGLFilters(query) {
  return {
    companyCode: query.companyCode || undefined,
    fiscalYear: query.fiscalYear || undefined,
    glAccount: query.glAccount || undefined,
  };
}
