const express = require("express");
const path = require("path");
const router = express.Router();
const inventoryAccountsConfig = require("../config/inventory-accounts.config");

/**
 * Export Routes (Phase 3.8 - Parameterized + Performance Metrics)
 *
 * GET /api/export/inventory           - Plant inventory Excel (REQUIRES: plant)
 * GET /api/export/summary             - Inventory summary Excel (recommended default)
 * GET /api/export/location/:sloc      - Location-specific Excel (SAP-filtered)
 * GET /api/export/reconciliation      - Reconciliation Excel (REQUIRES: companyCode, plant)
 *
 * All exports filter at SAP level. Never load full dataset.
 * All workbooks include Parameters metadata sheet.
 * Performance metrics logged for each export.
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
   * REQUIRED: plant
   * Optional: storageLocation, material
   */
  router.get("/inventory", async (req, res) => {
    try {
      if (!req.query.plant) {
        return res.status(400).json({
          success: false,
          error: "Parameter 'plant' is required for inventory export.",
          hint: "Example: /api/export/inventory?plant=1000",
        });
      }

      const startTime = Date.now();
      const filters = {
        plant: req.query.plant,
        storageLocation: req.query.storageLocation || undefined,
        material: req.query.material || undefined,
      };

      console.log(`[Export:Inventory] Filters: ${JSON.stringify(filters)}`);
      const records =
        await inventoryDatasetService.getInventoryDataset(filters);
      console.log(`[Export:Inventory] Rows fetched: ${records.length}`);

      const params = { ...filters };
      const filePath = await exportService.exportInventoryWorkbook(
        records,
        params,
      );

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(
        `[Export:Inventory] Exported: ${records.length} rows | Time: ${elapsed}s`,
      );

      res.download(filePath, path.basename(filePath), (err) => {
        if (err) console.error("Download error:", err.message);
      });
    } catch (err) {
      console.error("GET /api/export/inventory error:", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/export/summary
   * Optional: plant, storageLocation
   */
  router.get("/summary", async (req, res) => {
    try {
      const startTime = Date.now();
      const filters = {
        plant: req.query.plant || undefined,
        storageLocation: req.query.storageLocation || undefined,
        material: req.query.material || undefined,
      };

      console.log(`[Export:Summary] Filters: ${JSON.stringify(filters)}`);
      const records =
        await inventoryDatasetService.getInventoryDataset(filters);
      console.log(`[Export:Summary] Rows fetched: ${records.length}`);

      const summary = inventorySummaryService.summarizeByLocation(records);

      const params = { ...filters };
      const filePath = await exportService.exportInventorySummaryWorkbook(
        summary,
        records,
        params,
      );

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(
        `[Export:Summary] Exported: ${summary.length} summary rows | Time: ${elapsed}s`,
      );

      res.download(filePath, path.basename(filePath), (err) => {
        if (err) console.error("Download error:", err.message);
      });
    } catch (err) {
      console.error("GET /api/export/summary error:", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/export/location/:sloc
   * Fetches ONLY the requested location from SAP (server-side filter).
   * Optional: plant, material
   */
  router.get("/location/:sloc", async (req, res) => {
    try {
      const startTime = Date.now();
      const storageLocation = req.params.sloc;

      const filters = {
        plant: req.query.plant || undefined,
        storageLocation: storageLocation,
        material: req.query.material || undefined,
      };

      console.log(`[Export:Location] Filters: ${JSON.stringify(filters)}`);
      const records =
        await inventoryDatasetService.getInventoryDataset(filters);
      console.log(`[Export:Location] Rows fetched: ${records.length}`);

      const params = { ...filters };
      const filePath = await exportService.exportLocationWorkbook(
        records,
        storageLocation,
        params,
      );

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(
        `[Export:Location] Exported: ${records.length} rows | Time: ${elapsed}s`,
      );

      res.download(filePath, path.basename(filePath), (err) => {
        if (err) console.error("Download error:", err.message);
      });
    } catch (err) {
      console.error("GET /api/export/location error:", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/export/reconciliation
   * REQUIRED: companyCode, plant
   * Optional: fiscalYear, inventoryAccounts (comma-separated)
   */
  router.get("/reconciliation", async (req, res) => {
    try {
      if (!req.query.companyCode) {
        return res.status(400).json({
          success: false,
          error:
            "Parameter 'companyCode' is required for reconciliation export.",
          hint: "Example: /api/export/reconciliation?companyCode=1000&plant=1000",
        });
      }
      if (!req.query.plant) {
        return res.status(400).json({
          success: false,
          error: "Parameter 'plant' is required for reconciliation export.",
          hint: "Example: /api/export/reconciliation?companyCode=1000&plant=1000",
        });
      }

      const startTime = Date.now();
      const companyCode = req.query.companyCode;
      const plant = req.query.plant;
      const fiscalYear = req.query.fiscalYear || undefined;

      let inventoryAccounts;
      if (req.query.inventoryAccounts) {
        inventoryAccounts = req.query.inventoryAccounts
          .split(",")
          .map((a) => a.trim());
      } else {
        inventoryAccounts = inventoryAccountsConfig.getAccounts(companyCode);
      }

      const invFilters = { plant };
      const glFilters = {
        companyCode,
        fiscalYear,
        inventoryAccounts:
          inventoryAccounts.length > 0 ? inventoryAccounts : undefined,
      };

      console.log(`[Export:Recon] Inv filters: ${JSON.stringify(invFilters)}`);
      console.log(`[Export:Recon] GL filters: ${JSON.stringify(glFilters)}`);

      const [inventoryRecords, glRecords] = await Promise.all([
        inventoryDatasetService.getInventoryDataset(invFilters),
        glDatasetService.getGLBalances(glFilters),
      ]);

      console.log(
        `[Export:Recon] Inv rows: ${inventoryRecords.length} | GL rows: ${glRecords.length}`,
      );

      const reconResults = reconciliationService.reconcileByPlant(
        inventoryRecords,
        glRecords,
      );

      const params = { companyCode, fiscalYear, plant, inventoryAccounts };
      const filePath = await exportService.exportReconciliationWorkbook(
        reconResults,
        params,
      );

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(
        `[Export:Recon] Exported: ${reconResults.length} plants | Time: ${elapsed}s`,
      );

      res.download(filePath, path.basename(filePath), (err) => {
        if (err) console.error("Download error:", err.message);
      });
    } catch (err) {
      console.error("GET /api/export/reconciliation error:", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
};
