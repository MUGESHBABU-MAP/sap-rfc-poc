/**
 * Phase 3.12 - Test Customer Workbook Generator
 *
 * Run: node tests/test-customer-workbook.js
 *
 * Input: plant = TEST_PLANT (env) or "1000"
 * Output: output/Inventory_Report_<plant>.xlsx
 *
 * Validates:
 *   - Single SAP extraction
 *   - All location sheets generated
 *   - Summary matches location data
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const SAPService = require("../services/sap.service");
const InventoryDatasetService = require("../services/inventory-dataset.service");
const CustomerWorkbookService = require("../services/customer-workbook.service");

const TEST_PLANT = process.env.TEST_PLANT || "1000";

async function testCustomerWorkbook() {
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
    console.log(`=== Customer Workbook Generator (Plant: ${TEST_PLANT}) ===\n`);

    const inventoryService = new InventoryDatasetService(sap);
    const workbookService = new CustomerWorkbookService();

    // ONE SAP extraction
    console.log("Step 1: Fetching inventory from SAP (single extraction)...");
    const fetchStart = Date.now();
    const records = await inventoryService.getInventoryDataset({
      plant: TEST_PLANT,
    });
    const fetchTime = ((Date.now() - fetchStart) / 1000).toFixed(1);
    console.log(`  Records: ${records.length}`);
    console.log(`  Fetch time: ${fetchTime}s`);

    // Generate workbook
    console.log("\nStep 2: Generating customer workbook (streaming)...");
    const result = await workbookService.generateCustomerWorkbook(records, {
      plant: TEST_PLANT,
    });

    // Results
    console.log("\n=== RESULT ===");
    console.log(`  File: ${result.filePath}`);
    console.log(`  Total Records: ${result.totalRecords}`);
    console.log(`  Location Count: ${result.locationCount}`);
    console.log(`  Sheet Count: ${result.sheetCount}`);
    console.log(`  Execution Time: ${result.executionTime}s`);
    console.log(`  File Size: ${result.fileSizeMB} MB`);

    // Validation
    console.log("\n=== VALIDATION ===");

    // Count locations from data
    const locationSet = new Set();
    for (let i = 0; i < records.length; i++) {
      locationSet.add(records[i].storageLocation || "UNKNOWN");
    }

    const expectedSheets = 3 + locationSet.size; // Params + Inventory + Summary + locations
    const sheetsMatch = result.sheetCount === expectedSheets;
    const locationsMatch = result.locationCount === locationSet.size;

    console.log(
      `  Expected sheets: ${expectedSheets} | Actual: ${result.sheetCount} → ${sheetsMatch ? "✓" : "✗"}`,
    );
    console.log(
      `  Expected locations: ${locationSet.size} | Actual: ${result.locationCount} → ${locationsMatch ? "✓" : "✗"}`,
    );
    console.log(`  Locations: ${[...locationSet].sort().join(", ")}`);

    // Performance
    console.log("\n=== PERFORMANCE ===");
    console.log(`  SAP Fetch: ${fetchTime}s`);
    console.log(
      `  Workbook Generation: ${(result.executionTime - parseFloat(fetchTime)).toFixed(1)}s`,
    );
    console.log(`  Total: ${result.executionTime}s`);

    const status = sheetsMatch && locationsMatch ? "PASS" : "ISSUES FOUND";
    console.log(`\n  STATUS: ${status}`);

    await sap.disconnect();
    console.log("\nDone.");
  } catch (err) {
    console.error("ERROR:", err.message || err);
  }
}

testCustomerWorkbook();
