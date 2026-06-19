/**
 * Diagnostic: Investigate RFC_READ_TABLE OPTIONS handling for FAGLFLEXT.
 *
 * Run: node tests/test-fagl-where.js
 *
 * Tests different WHERE clause constructions to identify
 * which format the customer's SAP system accepts.
 *
 * Test A: No WHERE clause
 * Test B: where = ["RRCTY = '0'"]
 * Test C: where = ["RVERS = '001'"]
 * Test D: where = ["RRCTY = '0'", "RVERS = '001'"] (separate rows)
 * Test E: where = ["RRCTY = '0' AND RVERS = '001'"] (single row)
 * Test F: where = ["RRCTY = '0'", "AND RVERS = '001'"] (AND on second row)
 *
 * Uses fields: RBUKRS, RACCT, RYEAR
 * ROWCOUNT = 5
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const SAPService = require("../services/sap.service");
const parseRows = require("../utils/parse-rows");

const FIELDS = ["RBUKRS", "RACCT", "RYEAR"];

async function testFaglWhere() {
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
    console.log("=== RFC_READ_TABLE OPTIONS Handling Diagnostic ===\n");

    const results = {};

    // Test A: No WHERE
    await runTest(sap, "Test A: No WHERE clause", [], results);

    // Test B: Single condition - RRCTY
    await runTest(sap, "Test B: RRCTY = '0'", ["RRCTY = '0'"], results);

    // Test C: Single condition - RVERS
    await runTest(sap, "Test C: RVERS = '001'", ["RVERS = '001'"], results);

    // Test D: Two separate OPTIONS rows (no AND keyword)
    await runTest(
      sap,
      "Test D: Separate rows ['RRCTY = 0', 'RVERS = 001']",
      ["RRCTY = '0'", "RVERS = '001'"],
      results,
    );

    // Test E: Single OPTIONS row with AND
    await runTest(
      sap,
      "Test E: Single row 'RRCTY = 0 AND RVERS = 001'",
      ["RRCTY = '0' AND RVERS = '001'"],
      results,
    );

    // Test F: AND keyword on second row
    await runTest(
      sap,
      "Test F: Second row starts with AND",
      ["RRCTY = '0'", "AND RVERS = '001'"],
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

    // Recommendation
    console.log("\n--- Recommendation ---");
    if (
      results["Test D: Separate rows ['RRCTY = 0', 'RVERS = 001']"].startsWith(
        "FAIL",
      )
    ) {
      if (
        results["Test E: Single row 'RRCTY = 0 AND RVERS = 001'"].startsWith(
          "PASS",
        )
      ) {
        console.log(
          "  → Use SINGLE ROW with AND keyword: \"RRCTY = '0' AND RVERS = '001'\"",
        );
        console.log(
          "  → This system does NOT support multiple OPTIONS rows as implicit AND.",
        );
      } else if (
        results["Test F: Second row starts with AND"].startsWith("PASS")
      ) {
        console.log(
          "  → Use AND prefix on subsequent rows: [\"RRCTY = '0'\", \"AND RVERS = '001'\"]",
        );
        console.log(
          "  → This is the standard RFC_READ_TABLE multi-row format.",
        );
      } else {
        console.log("  → Neither multi-row nor single-row AND works.");
        console.log(
          "  → Try filtering one condition at a time, or check RRCTY/RVERS values.",
        );
      }
    } else {
      console.log("  → Separate rows work fine. Issue may be elsewhere.");
    }

    await sap.disconnect();
    console.log("\nDone.");
  } catch (err) {
    console.error("FATAL:", err.message || err);
  }
}

async function runTest(sap, label, where, results) {
  try {
    const options = { rowCount: 5 };
    if (where.length > 0) {
      options.where = where;
    }
    const result = await sap.readTable("FAGLFLEXT", FIELDS, options);
    const rows = parseRows(result);
    console.log(`  ✓ ${label} — ${rows.length} rows`);
    if (rows.length > 0) {
      console.log(`    Sample: ${JSON.stringify(rows[0])}`);
    }
    results[label] = `PASS (${rows.length} rows)`;
  } catch (err) {
    console.log(`  ✗ ${label} — FAILED: ${err.message || err}`);
    results[label] = `FAIL: ${err.message || err}`;
  }
}

testFaglWhere();
