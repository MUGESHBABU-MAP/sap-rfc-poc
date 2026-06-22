/**
 * Phase 3.6 - Test Excel Export Service
 *
 * Run: node tests/test-export.js
 *
 * Flow:
 *   1. Connect to SAP
 *   2. Generate Inventory Report export
 *   3. Generate Inventory Summary export
 *   4. Generate Location export (first available location)
 *   5. Generate Reconciliation export
 *   6. Print generated file paths
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const SAPService = require("../services/sap.service");
const InventoryDatasetService = require("../services/inventory-dataset.service");
const InventorySummaryService = require("../services/inventory-summary.service");
const GLDatasetService = require("../services/gl-dataset.service");
const ReconciliationService = require("../services/reconciliation.service");
const ExportService = require("../services/export.service");

async function testExport() {
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
    const glService = new GLDatasetService(sap);
    const reconService = new ReconciliationService();
    const exportService = new ExportService();

    // Load data
    console.log("Loading inventory dataset...");
    const inventoryRecords = await inventoryService.getInventoryDataset();
    console.log(`  Inventory records: ${inventoryRecords.length}`);

    console.log("Loading GL dataset...");
    const glRecords = await glService.getGLBalances();
    console.log(`  GL records: ${glRecords.length}\n`);

    const generatedFiles = [];

    // Export 1: Inventory Report
    console.log("Generating Inventory Report...");
    const invPath =
      await exportService.exportInventoryWorkbook(inventoryRecords);
    generatedFiles.push(invPath);
    console.log(`  ✓ ${invPath}`);

    // Export 2: Inventory Summary
    console.log("Generating Inventory Summary...");
    const summary = summaryService.summarizeByLocation(inventoryRecords);
    const summaryPath = await exportService.exportInventorySummaryWorkbook(
      summary,
      inventoryRecords,
    );
    generatedFiles.push(summaryPath);
    console.log(`  ✓ ${summaryPath}`);

    // Export 3: Location export (use first available location)
    if (summary.length > 0) {
      const firstLocation = summary[0].location;
      console.log(`Generating Location export (${firstLocation})...`);
      const locPath = await exportService.exportLocationWorkbook(
        inventoryRecords,
        firstLocation,
      );
      generatedFiles.push(locPath);
      console.log(`  ✓ ${locPath}`);
    }

    // Export 4: Reconciliation
    console.log("Generating Reconciliation export...");
    const reconResults = reconService.reconcileByPlant(
      inventoryRecords,
      glRecords,
    );
    const reconPath =
      await exportService.exportReconciliationWorkbook(reconResults);
    generatedFiles.push(reconPath);
    console.log(`  ✓ ${reconPath}`);

    // Summary
    console.log("\n=== Generated Files ===");
    for (let i = 0; i < generatedFiles.length; i++) {
      console.log(`  ${i + 1}. ${generatedFiles[i]}`);
    }

    await sap.disconnect();
    console.log("\nDisconnected. Export test complete.");
  } catch (err) {
    console.error("ERROR:", err.message || err);
  }
}

testExport();
