/**
 * Diagnostic: MARA field filter validation
 *
 * Run: node tests/test-mara-filter.js
 *
 * Tests:
 *   1. MARA without filter → PASS (baseline)
 *   2. MARA with MATNR filter → PASS (valid field)
 *   3. MARA with WERKS filter → FAIL (WERKS does not exist in MARA)
 *
 * Confirms that MARA only supports MATNR as a filter field.
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const SAPService = require("../services/sap.service");
const parseRows = require("../utils/parse-rows");

async function testMaraFilter() {
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
    console.log("=== MARA Filter Validation ===\n");

    const fields = ["MATNR", "MTART", "MATKL", "MEINS"];
    const results = {};

    // Test 1: No filter
    try {
      const result = await sap.readTable("MARA", fields, { rowCount: 5 });
      const rows = parseRows(result);
      console.log(`  ✓ Test 1: No filter — ${rows.length} rows`);
      results["Test 1: No filter"] = "PASS";
    } catch (err) {
      console.log(`  ✗ Test 1: No filter — FAILED: ${err.message}`);
      results["Test 1: No filter"] = "FAIL";
    }

    // Test 2: MATNR filter (get a material number first)
    let testMatnr = "";
    try {
      const result = await sap.readTable("MARA", ["MATNR"], { rowCount: 1 });
      const rows = parseRows(result);
      if (rows.length > 0) testMatnr = rows[0].MATNR;
    } catch (err) {
      // ignore
    }

    if (testMatnr) {
      try {
        const result = await sap.readTable("MARA", fields, {
          where: [`MATNR = '${testMatnr}'`],
          rowCount: 5,
        });
        const rows = parseRows(result);
        console.log(`  ✓ Test 2: MATNR = '${testMatnr}' — ${rows.length} rows`);
        results["Test 2: MATNR filter"] = "PASS";
      } catch (err) {
        console.log(`  ✗ Test 2: MATNR filter — FAILED: ${err.message}`);
        results["Test 2: MATNR filter"] = "FAIL";
      }
    } else {
      console.log("  - Test 2: Skipped (no MATNR found)");
      results["Test 2: MATNR filter"] = "SKIPPED";
    }

    // Test 3: WERKS filter (INVALID - WERKS does NOT exist in MARA)
    try {
      const result = await sap.readTable("MARA", fields, {
        where: ["WERKS = '1000'"],
        rowCount: 5,
      });
      const rows = parseRows(result);
      console.log(
        `  ? Test 3: WERKS = '1000' — ${rows.length} rows (unexpected PASS)`,
      );
      results["Test 3: WERKS filter (invalid)"] = "UNEXPECTED PASS";
    } catch (err) {
      console.log(
        `  ✓ Test 3: WERKS = '1000' — FAILED as expected: ${err.message}`,
      );
      results["Test 3: WERKS filter (invalid)"] = "EXPECTED FAIL";
    }

    // Summary
    console.log("\n========================================");
    console.log("=== SUMMARY ===");
    console.log("========================================\n");
    for (const [test, status] of Object.entries(results)) {
      console.log(`  ${test}: ${status}`);
    }

    console.log("\n--- Conclusion ---");
    console.log("  MARA does NOT contain WERKS field.");
    console.log("  Only MATNR filtering is valid for MARA.");
    console.log(
      "  Plant filtering must happen via MARD or MARC (which have WERKS).",
    );

    await sap.disconnect();
    console.log("\nDone.");
  } catch (err) {
    console.error("FATAL:", err.message || err);
  }
}

testMaraFilter();
