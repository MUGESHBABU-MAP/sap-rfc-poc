/**
 * Diagnostic: Identify which FAGLFLEXT fields exist in customer system.
 *
 * Run: node tests/test-fagl-fields.js
 *
 * Tests incrementally to find:
 *   1. Do basic identity fields work?
 *   2. Does HSLVT exist?
 *   3. Do HSL01-HSL12 exist?
 *   4. Do HSL13-HSL16 exist? (many systems only have 01-12)
 *   5. Does TSLVT + TSL01-TSL12 exist?
 *   6. Does KSLVT + KSL01-KSL12 exist?
 *   7. RFC width limit test (increasing field count)
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const SAPService = require("../services/sap.service");
const parseRows = require("../utils/parse-rows");

async function testFaglFields() {
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
    console.log("=== FAGLFLEXT Field Availability Diagnostic ===\n");

    const results = {};

    // Test 1: Basic identity fields
    await testBatch(
      sap,
      "Test 1: Identity fields",
      ["RBUKRS", "RACCT", "RYEAR", "RPMAX", "DRCRK"],
      results,
    );

    // Test 2: RRCTY and RVERS
    await testBatch(
      sap,
      "Test 2: RRCTY + RVERS",
      ["RBUKRS", "RACCT", "RRCTY", "RVERS"],
      results,
    );

    // Test 3: HSLVT (carry-forward)
    await testBatch(
      sap,
      "Test 3: HSLVT",
      ["RBUKRS", "RACCT", "HSLVT"],
      results,
    );

    // Test 4: HSL01-HSL03 (first few periods)
    await testBatch(
      sap,
      "Test 4: HSL01-HSL03",
      ["RBUKRS", "RACCT", "HSLVT", "HSL01", "HSL02", "HSL03"],
      results,
    );

    // Test 5: HSL01-HSL06
    await testBatch(
      sap,
      "Test 5: HSL01-HSL06",
      [
        "RBUKRS",
        "RACCT",
        "HSLVT",
        "HSL01",
        "HSL02",
        "HSL03",
        "HSL04",
        "HSL05",
        "HSL06",
      ],
      results,
    );

    // Test 6: HSL01-HSL12
    await testBatch(
      sap,
      "Test 6: HSL01-HSL12",
      [
        "RBUKRS",
        "RACCT",
        "HSLVT",
        "HSL01",
        "HSL02",
        "HSL03",
        "HSL04",
        "HSL05",
        "HSL06",
        "HSL07",
        "HSL08",
        "HSL09",
        "HSL10",
        "HSL11",
        "HSL12",
      ],
      results,
    );

    // Test 7: HSL13 (often doesn't exist)
    await testBatch(
      sap,
      "Test 7: HSL13 (special period)",
      ["RBUKRS", "RACCT", "HSL13"],
      results,
    );

    // Test 8: HSL14-HSL16
    await testBatch(
      sap,
      "Test 8: HSL14-HSL16",
      ["RBUKRS", "RACCT", "HSL14", "HSL15", "HSL16"],
      results,
    );

    // Test 9: TSLVT + TSL01-TSL03
    await testBatch(
      sap,
      "Test 9: TSLVT + TSL01-TSL03",
      ["RBUKRS", "RACCT", "TSLVT", "TSL01", "TSL02", "TSL03"],
      results,
    );

    // Test 10: TSL01-TSL12
    await testBatch(
      sap,
      "Test 10: TSL01-TSL12",
      [
        "RBUKRS",
        "RACCT",
        "TSLVT",
        "TSL01",
        "TSL02",
        "TSL03",
        "TSL04",
        "TSL05",
        "TSL06",
        "TSL07",
        "TSL08",
        "TSL09",
        "TSL10",
        "TSL11",
        "TSL12",
      ],
      results,
    );

    // Test 11: KSLVT + KSL01-KSL03
    await testBatch(
      sap,
      "Test 11: KSLVT + KSL01-KSL03",
      ["RBUKRS", "RACCT", "KSLVT", "KSL01", "KSL02", "KSL03"],
      results,
    );

    // Test 12: KSL01-KSL12
    await testBatch(
      sap,
      "Test 12: KSL01-KSL12",
      [
        "RBUKRS",
        "RACCT",
        "KSLVT",
        "KSL01",
        "KSL02",
        "KSL03",
        "KSL04",
        "KSL05",
        "KSL06",
        "KSL07",
        "KSL08",
        "KSL09",
        "KSL10",
        "KSL11",
        "KSL12",
      ],
      results,
    );

    // Test 13: Width test - Identity + HSLVT + HSL01-12 all together
    await testBatch(
      sap,
      "Test 13: Full batch (identity + HSLVT + HSL01-12)",
      [
        "RBUKRS",
        "RACCT",
        "RYEAR",
        "RPMAX",
        "DRCRK",
        "HSLVT",
        "HSL01",
        "HSL02",
        "HSL03",
        "HSL04",
        "HSL05",
        "HSL06",
        "HSL07",
        "HSL08",
        "HSL09",
        "HSL10",
        "HSL11",
        "HSL12",
      ],
      results,
    );

    // Summary
    console.log("\n\n========================================");
    console.log("=== SUMMARY ===");
    console.log("========================================\n");
    for (const [test, status] of Object.entries(results)) {
      const icon = status === "PASS" ? "✓" : "✗";
      console.log(`  ${icon} ${test}: ${status}`);
    }

    console.log("\n--- Recommendation ---");
    if (results["Test 7: HSL13 (special period)"] === "FAIL") {
      console.log("  HSL13-16 do NOT exist. Use HSL01-HSL12 only.");
    }
    if (
      results["Test 13: Full batch (identity + HSLVT + HSL01-12)"] === "FAIL"
    ) {
      console.log("  RFC width limit hit. Need to split into smaller batches.");
    }
    if (
      results["Test 13: Full batch (identity + HSLVT + HSL01-12)"] === "PASS"
    ) {
      console.log("  Full identity + HSL01-12 batch works. Safe to use.");
    }

    await sap.disconnect();
    console.log("\nDone.");
  } catch (err) {
    console.error("FATAL:", err.message || err);
  }
}

async function testBatch(sap, label, fields, results) {
  try {
    const result = await sap.readTable("FAGLFLEXT", fields, { rowCount: 5 });
    const rows = parseRows(result);
    console.log(`  ✓ ${label} — ${rows.length} rows returned`);
    results[label] = "PASS";
  } catch (err) {
    console.log(`  ✗ ${label} — FAILED: ${err.message || err}`);
    results[label] = "FAIL";
  }
}

testFaglFields();
