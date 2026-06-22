const express = require("express");
const path = require("path");
const router = express.Router();

/**
 * Customer Workbook Routes
 *
 * GET /api/customer-workbook?plant=1000
 *
 * Generates the full customer workbook with:
 *   Parameters + Inventory Report + Summary + all location sheets
 * from a SINGLE SAP extraction.
 */
module.exports = function (inventoryDatasetService, customerWorkbookService) {
  /**
   * GET /api/customer-workbook
   * REQUIRED: plant
   */
  router.get("/", async (req, res) => {
    try {
      if (!req.query.plant) {
        return res.status(400).json({
          success: false,
          error: "Parameter 'plant' is required.",
          hint: "Example: /api/customer-workbook?plant=1000",
        });
      }

      const plant = req.query.plant;
      console.log(`[CustomerWorkbook] Generating for plant=${plant}...`);

      // ONE SAP extraction
      const startFetch = Date.now();
      const records = await inventoryDatasetService.getInventoryDataset({
        plant,
      });
      const fetchTime = ((Date.now() - startFetch) / 1000).toFixed(1);
      console.log(
        `[CustomerWorkbook] SAP fetch: ${records.length} records in ${fetchTime}s`,
      );

      // Generate workbook (streaming, in-memory grouping)
      const result = await customerWorkbookService.generateCustomerWorkbook(
        records,
        { plant },
      );

      console.log(
        `[CustomerWorkbook] Generated: ${result.sheetCount} sheets, ${result.locationCount} locations, ${result.executionTime}s total, ${result.fileSizeMB}MB`,
      );

      const filename = path.basename(result.filePath);
      res.download(result.filePath, filename, (err) => {
        if (err) console.error("Download error:", err.message);
      });
    } catch (err) {
      console.error("GET /api/customer-workbook error:", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
};
