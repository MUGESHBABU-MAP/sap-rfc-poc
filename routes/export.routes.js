const express = require("express");
const path = require("path");
const router = express.Router();
const inventoryAccountsConfig = require("../config/inventory-accounts.config");

/**
 * Export Routes (Phase 3.7 - Parameterized)
 *
 * GET /api/export/inventory           - Plant inventory Excel (REQUIRES: plant)
 * GET /api/export/summary             - Inventory summary Excel (recommended default)
 * GET /api/export/location/:sloc      - Location-specific Excel
 * GET /api/export/reconciliation      - Reconciliation Excel (REQUIRES: companyCode, plant)
 *
 * All exports filter at SAP level. Never load full dataset.
 * All workbooks include Parameters metadata sheet.
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
   * Optional: storageLocation, material, materialGroup
   */
  router.get("/inventory", async (req, res) => {
    try {
      // Validation
      if (!req.query.plant) {
        return res.status(400).json({
          success: false,
          error: "Parameter 'plant' is required for inventory export.",
          hint: "Example: /api/export/inventory?plant=1000",
        });
      }

      const filters = {
        plant: req.query.plant,
        storageLocation: req.query.storageLocation || undefined,
        material: req.query.material || undefined,
      };

      const records =
        await inventoryDatasetService.getInventoryDataset(filters);

      const params = { ...filters };
      const filePath = await exportService.exportInventoryWorkbook(
        records,
        params,
      );
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
   * Optional: plant, storageLocation
   * This is the recommended default export (always small).
   */
  router.get("/summary", async (req, res) => {
    try {
      const filters = {
        plant: req.query.plant || undefined,
        storageLocation: req.query.storageLocation || undefined,
        material: req.query.material || undefined,
      };

      const records =
        await inventoryDatasetService.getInventoryDataset(filters);
      const summary = inventorySummaryService.summarizeByLocation(records);

      const params = { ...filters };
      const filePath = await exportService.exportInventorySummaryWorkbook(
        summary,
        records,
        params,
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
   * Fetches only the requested storage location from SAP.
   * Optional: plant, material
   */
  router.get("/location/:sloc", async (req, res) => {
    try {
      const storageLocation = req.params.sloc;

      // Filter at SAP level — only fetch this location
      const filters = {
        plant: req.query.plant || undefined,
        storageLocation: storageLocation,
        material: req.query.material || undefined,
      };

      const records =
        await inventoryDatasetService.getInventoryDataset(filters);

      const params = { ...filters, storageLocation };
      const filePath = await exportService.exportLocationWorkbook(
        records,
        storageLocation,
        params,
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
   * REQUIRED: companyCode, plant
   * Optional: fiscalYear, inventoryAccounts (comma-separated)
   */
  router.get("/reconciliation", async (req, res) => {
    try {
      // Validation
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

      const companyCode = req.query.companyCode;
      const plant = req.query.plant;
      const fiscalYear = req.query.fiscalYear || undefined;

      // Inventory accounts: from query param or config
      let inventoryAccounts;
      if (req.query.inventoryAccounts) {
        inventoryAccounts = req.query.inventoryAccounts
          .split(",")
          .map((a) => a.trim());
      } else {
        inventoryAccounts = inventoryAccountsConfig.getAccounts(companyCode);
      }

      // Fetch inventory (filtered by plant)
      const invFilters = { plant };
      const glFilters = {
        companyCode,
        fiscalYear,
        inventoryAccounts:
          inventoryAccounts.length > 0 ? inventoryAccounts : undefined,
      };

      const [inventoryRecords, glRecords] = await Promise.all([
        inventoryDatasetService.getInventoryDataset(invFilters),
        glDatasetService.getGLBalances(glFilters),
      ]);

      const reconResults = reconciliationService.reconcileByPlant(
        inventoryRecords,
        glRecords,
      );

      const params = {
        companyCode,
        fiscalYear,
        plant,
        inventoryAccounts,
      };
      const filePath = await exportService.exportReconciliationWorkbook(
        reconResults,
        params,
      );
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
