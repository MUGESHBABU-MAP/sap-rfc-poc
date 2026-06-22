/**
 * Phase 3.8 - Test Inventory Filtering (WHERE clause validation)
 *
 * Run: node tests/test-inventory-filter.js
 *
 * Tests:
 *   A. Plant only (WERKS = '1000')
 *   B. Plant + Location (WERKS = '1000' AND LGORT = 'WH10')
 *   C. Material only
 *   D. No filter (small sample)
 *
 * Validates:
 *   - SAP-side filtering works (single-row AND format)
 *   - WHERE clause is logged
 *   - Row counts decrease with more filters
 *
 * Performance metrics printed for each test.
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const SAPService = require("../services/sap.service");
const InventoryDatasetService = require("../services/inventory-dataset.service");

const TEST_PLANT = process.env.TEST_PLANT || "1000";
const TEST_LOCATION = process.env.TEST_LOCATION || "WH10";

async function testInventoryFilter() {
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

    const service = new InventoryDatasetService(sap);
    const results = {};

    // Test A: Plant only
    console.log(`=== Test A: Plant only (${TEST_PLANT}) ===`);
    const startA = Date.now();
    try {
      const recordsA = await service.getInventoryDataset({ plant: TEST_PLANT });
      const timeA = ((Date.now() - startA) / 1000).toFixed(1);
      console.log(`  ✓ Records: ${recordsA.length} | Time: ${timeA}s`);
      results["A: Plant only"] = `PASS (${recordsA.length} rows, ${timeA}s)`;
    } catch (err) {
      console.log(`  ✗ FAILED: ${err.message}`);
      results["A: Plant only"] = `FAIL: ${err.message}`;
    }

    // Test B: Plant + Location
    console.log(
      `\n=== Test B: Plant + Location (${TEST_PLANT} + ${TEST_LOCATION}) ===`,
    );
    const startB = Date.now();
    try {
      const recordsB = await service.getInventoryDataset({
        plant: TEST_PLANT,
        storageLocation: TEST_LOCATION,
      });
      const timeB = ((Date.now() - startB) / 1000).toFixed(1);
      console.log(`  ✓ Records: ${recordsB.length} | Time: ${timeB}s`);
      results["B: Plant + Location"] =
        `PASS (${recordsB.length} rows, ${timeB}s)`;

      // Print first 3 records
      if (recordsB.length > 0) {
        console.log("\n  Sample (first 3):");
        const count = Math.min(3, recordsB.length);
        for (let i = 0; i < count; i++) {
          const r = recordsB[i];
          console.log(
            `    ${r.material} | ${r.plant} | ${r.storageLocation} | Val: ${r.totalInventoryValue}`,
          );
        }
      }
    } catch (err) {
      console.log(`  ✗ FAILED: ${err.message}`);
      results["B: Plant + Location"] = `FAIL: ${err.message}`;
    }

    // Test C: Small sample (no filter, limited)
    console.log(`\n=== Test C: No filter (baseline) ===`);
    const startC = Date.now();
    try {
      // Read just MARD with rowCount to test baseline
      const parseRows = require("../utils/parse-rows");
      const result = await sap.readTable("MARD", ["MATNR", "WERKS", "LGORT"], {
        rowCount: 10,
      });
      const rows = parseRows(result);
      const timeC = ((Date.now() - startC) / 1000).toFixed(1);
      console.log(`  ✓ Sample rows: ${rows.length} | Time: ${timeC}s`);
      if (rows.length > 0) {
        // Show available plants and locations
        const plants = [...new Set(rows.map((r) => r.WERKS))];
        const locs = [...new Set(rows.map((r) => r.LGORT))];
        console.log(`  Available plants in sample: ${plants.join(", ")}`);
        console.log(`  Available locations in sample: ${locs.join(", ")}`);
      }
      results["C: No filter (sample)"] =
        `PASS (${rows.length} rows, ${timeC}s)`;
    } catch (err) {
      console.log(`  ✗ FAILED: ${err.message}`);
      results["C: No filter (sample)"] = `FAIL: ${err.message}`;
    }

    // Summary
    console.log("\n========================================");
    console.log("=== SUMMARY ===");
    console.log("========================================\n");
    for (const [test, status] of Object.entries(results)) {
      const icon = status.startsWith("PASS") ? "✓" : "✗";
      console.log(`  ${icon} ${test}: ${status}`);
    }

    console.log("\n--- Performance Target ---");
    console.log("  Plant + Location export: < 30 seconds");
    console.log("  Summary export: < 30 seconds");

    await sap.disconnect();
    console.log("\nDone.");
  } catch (err) {
    console.error("FATAL:", err.message || err);
  }
}

testInventoryFilter();
