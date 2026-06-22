/**
 * Phase 3.13 Bug Fix - GL Account Filter Diagnostic
 *
 * Run: node tests/test-gl-account-filter.js
 *
 * Tests WHERE clause variations to identify what customer SAP supports.
 * Specifically validates whether RACCT IN (...) syntax works.
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const SAPService = require("../services/sap.service");
const parseRows = require("../utils/parse-rows");

const COMPANY_CODE = process.env.TEST_COMPANY || "1000";
const FISCAL_YEAR = process.env.TEST_FISCAL_YEAR || "2026";

async function testGLAccountFilter() {
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
    console.log("=== GL Account Filter Diagnostic ===\n");

    const fields = ["RBUKRS", "RACCT", "RYEAR"];
    const results = {};

    // Test A: Base filters only
    await runTest(
      sap,
      "Test A: RRCTY + RVERS only",
      fields,
      ["RRCTY = '0' AND RVERS = '001'"],
      results,
    );

    // Test B: + Company Code
    await runTest(
      sap,
      "Test B: + RBUKRS",
      fields,
      [`RRCTY = '0' AND RVERS = '001' AND RBUKRS = '${COMPANY_CODE}'`],
      results,
    );

    // Test C: + Fiscal Year
    await runTest(
      sap,
      "Test C: + RYEAR",
      fields,
      [
        `RRCTY = '0' AND RVERS = '001' AND RBUKRS = '${COMPANY_CODE}' AND RYEAR = '${FISCAL_YEAR}'`,
      ],
      results,
    );

    // Test D: + RACCT IN() syntax
    await runTest(
      sap,
      "Test D: + RACCT IN()",
      fields,
      [
        `RRCTY = '0' AND RVERS = '001' AND RBUKRS = '${COMPANY_CODE}' AND RACCT IN ('0013000000','0013200000')`,
      ],
      results,
    );

    // Test E: Single RACCT =
    await runTest(
      sap,
      "Test E: + RACCT = (single)",
      fields,
      [
        `RRCTY = '0' AND RVERS = '001' AND RBUKRS = '${COMPANY_CODE}' AND RACCT = '0013000000'`,
      ],
      results,
    );

    // Summary
    console.log("\n========================================");
    console.log("=== SUMMARY ===");
    console.log("========================================\n");
    for (const [test, status] of Object.entries(results)) {
      const icon = status.startsWith("PASS") ? "✓" : "✗";
      console.log(`  ${icon} ${test}: ${status}`);
    }

    console.log("\n--- Recommendation ---");
    if (
      results["Test D: + RACCT IN()"] &&
      results["Test D: + RACCT IN()"].startsWith("FAIL")
    ) {
      console.log("  → RACCT IN() syntax NOT supported by this SAP system.");
      console.log("  → Use Node.js post-filtering instead.");
      console.log(
        "  → Fetch all records for companyCode+fiscalYear, then filter in memory.",
      );
    }

    await sap.disconnect();
    console.log("\nDone.");
  } catch (err) {
    console.error("FATAL:", err.message || err);
  }
}

async function runTest(sap, label, fields, where, results) {
  try {
    const result = await sap.readTable("FAGLFLEXT", fields, {
      where,
      rowCount: 5,
    });
    const rows = parseRows(result);
    console.log(`  ✓ ${label} — ${rows.length} rows`);
    results[label] = `PASS (${rows.length} rows)`;
  } catch (err) {
    console.log(`  ✗ ${label} — FAILED: ${err.message}`);
    results[label] = `FAIL: ${err.message}`;
  }
}

testGLAccountFilter();
