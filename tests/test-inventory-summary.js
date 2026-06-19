/**
 * Phase 1 - Test Inventory Summary Service against live SAP
 *
 * Run: node tests/test-inventory-summary.js
 *
 * Tests:
 *   1. Fetches inventory dataset
 *   2. Generates location-wise summary
 *   3. Validates summary structure
 *   4. Prints results (replaces Excel tab structure)
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const SAPService = require("../services/sap.service");
const InventoryDatasetService = require("../services/inventory-dataset.service");
const InventorySummaryService = require("../services/inventory-summary.service");

async function testInventorySummary() {
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

    const datasetService = new InventoryDatasetService(sap);
    const summaryService = new InventorySummaryService();

    // Fetch full dataset
    console.log("Fetching inventory dataset...");
    const records = await datasetService.getInventoryDataset();
    console.log(`  ${records.length} inventory records fetched.\n`);

    // Generate summary
    console.log("=== Inventory Summary (by Storage Location) ===");
    console.log("(This replaces Excel tabs: ECOM, WH10, OSL1, PRD1, etc.)\n");

    const summary = summaryService.summarizeByLocation(records);

    // Print as table
    console.log(
      "Location".padEnd(10) +
        "Materials".padEnd(12) +
        "Unrestricted".padEnd(16) +
        "Transit".padEnd(14) +
        "Quality".padEnd(14) +
        "Blocked".padEnd(14) +
        "Total Value".padEnd(16),
    );
    console.log("-".repeat(96));

    for (const s of summary) {
      console.log(
        s.location.padEnd(10) +
          String(s.materialCount).padEnd(12) +
          String(s.unrestrictedValue).padEnd(16) +
          String(s.transitValue).padEnd(14) +
          String(s.qualityValue).padEnd(14) +
          String(s.blockedValue).padEnd(14) +
          String(s.totalInventoryValue).padEnd(16),
      );
    }

    // Full JSON output
    console.log("\n--- Full Summary JSON ---");
    console.log(JSON.stringify(summary, null, 2));

    // Validate structure
    if (summary.length > 0) {
      const expectedFields = [
        "location",
        "unrestrictedValue",
        "transitValue",
        "qualityValue",
        "restrictedValue",
        "blockedValue",
        "returnsValue",
        "totalInventoryValue",
        "materialCount",
      ];
      console.log("\n--- Field Validation ---");
      const sample = summary[0];
      for (const field of expectedFields) {
        console.log(`  ${field}: ${field in sample ? "✓" : "✗ MISSING"}`);
      }
    }

    await sap.disconnect();
    console.log(
      "\nDisconnected. Phase 1 inventory summary validation complete.",
    );
  } catch (err) {
    console.error("ERROR:", err.message || err);
  }
}

testInventorySummary();
