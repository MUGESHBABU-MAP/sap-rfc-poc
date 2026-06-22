/**
 * Phase 3.7 - Test Summary Export (parameterized)
 *
 * Run: node tests/test-export-summary.js
 *
 * Uses: plant=1000 (configurable via env or hardcoded)
 * Expected: < 30 seconds, < 1000 rows
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const SAPService = require("../services/sap.service");
const InventoryDatasetService = require("../services/inventory-dataset.service");
const InventorySummaryService = require("../services/inventory-summary.service");
const ExportService = require("../services/export.service");

const TEST_PLANT = process.env.TEST_PLANT || "1000";

async function testExportSummary() {
  const startTime = Date.now();

  const sap = new SAPService({
    user: process.env.SAP_USER,
    passwd: process.env.SAP_PASSWORD,
    ashost: process.env.SAP_ASHOST,
    sysnr: process.env.SAP_SYSNR,
    client: process.env.SAP_CLIENT,
    lang: process.env.SAP_LANG,
  });

  try {
    await sap.connect();
    console.log("Connected to SAP\n");

    const inventoryService = new InventoryDatasetService(sap);
    const summaryService = new InventorySummaryService();
    const exportService = new ExportService();

    const filters = { plant: TEST_PLANT };
    console.log(`Fetching inventory for plant: ${TEST_PLANT}...`);

    const records = await inventoryService.getInventoryDataset(filters);
    console.log(`  Records fetched: ${records.length}`);

    const summary = summaryService.summarizeByLocation(records);
    console.log(`  Summary locations: ${summary.length}`);

    console.log("\nGenerating Summary export...");
    const params = { plant: TEST_PLANT };
    const filePath = await exportService.exportInventorySummaryWorkbook(
      summary,
      records,
      params,
    );

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n  ✓ ${filePath}`);
    console.log(`  Time: ${elapsed}s`);
    console.log(`  Rows: ${summary.length} (target: < 1000)`);
    console.log(`  Status: ${elapsed < 30 ? "PASS" : "SLOW"}`);

    await sap.disconnect();
    console.log("\nDone.");
  } catch (err) {
    console.error("ERROR:", err.message || err);
  }
}

testExportSummary();
