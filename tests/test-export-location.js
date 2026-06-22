/**
 * Phase 3.7 - Test Location Export (parameterized)
 *
 * Run: node tests/test-export-location.js
 *
 * Uses: storageLocation from env or first available location
 * Expected: < 30 seconds
 * Fetches ONLY the requested location from SAP (server-side filter).
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const SAPService = require("../services/sap.service");
const InventoryDatasetService = require("../services/inventory-dataset.service");
const ExportService = require("../services/export.service");

const TEST_PLANT = process.env.TEST_PLANT || "1000";
const TEST_LOCATION = process.env.TEST_LOCATION || "WH10";

async function testExportLocation() {
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
    const exportService = new ExportService();

    // Filter at SAP level: only fetch this location
    const filters = { plant: TEST_PLANT, storageLocation: TEST_LOCATION };
    console.log(
      `Fetching inventory for plant=${TEST_PLANT}, location=${TEST_LOCATION}...`,
    );

    const records = await inventoryService.getInventoryDataset(filters);
    console.log(`  Records fetched: ${records.length}`);

    if (records.length === 0) {
      console.log("\n  No records found for this location.");
      console.log(
        "  Try setting TEST_LOCATION env variable to a valid location.",
      );
      await sap.disconnect();
      return;
    }

    console.log("\nGenerating Location export...");
    const params = { plant: TEST_PLANT, storageLocation: TEST_LOCATION };
    const filePath = await exportService.exportLocationWorkbook(
      records,
      TEST_LOCATION,
      params,
    );

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n  ✓ ${filePath}`);
    console.log(`  Time: ${elapsed}s`);
    console.log(`  Rows: ${records.length}`);
    console.log(`  Status: ${elapsed < 30 ? "PASS" : "SLOW"}`);

    await sap.disconnect();
    console.log("\nDone.");
  } catch (err) {
    console.error("ERROR:", err.message || err);
  }
}

testExportLocation();
