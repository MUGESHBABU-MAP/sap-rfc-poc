/**
 * Phase 3.10 - MBEW Extended Field Discovery
 *
 * Run: node tests/test-mbew-extended.js
 *
 * Validates extended MBEW fields including BWTAR (Valuation Type).
 * Goal: Determine if "Valuation" column from customer report is available.
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const SAPService = require("../services/sap.service");
const parseRows = require("../utils/parse-rows");
const { analyzeFields, printAnalysis } = require("../utils/field-discovery");

const FIELDS = ["MATNR", "BWKEY", "BWTAR", "VPRSV", "VERPR", "STPRS"];

async function testMbewExtended() {
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
    console.log("=== MBEW Extended Field Discovery ===");
    console.log(`Fields: ${FIELDS.join(", ")}\n`);

    // Test 1: With BWTAR
    console.log("Test 1: Reading MBEW with BWTAR (Valuation Type)...");
    try {
      const result = await sap.readTable("MBEW", FIELDS, { rowCount: 100 });
      const rows = parseRows(result);
      console.log(`  ✓ Success: ${rows.length} rows returned`);

      const analysis = analyzeFields(rows, FIELDS);
      printAnalysis("MBEW", analysis);

      // Specific BWTAR analysis
      const bwtar = analysis.find((a) => a.field === "BWTAR");
      console.log("\n--- BWTAR (Valuation Type) Assessment ---");
      if (bwtar && bwtar.nonBlankCount > 0) {
        console.log(`  Status: AVAILABLE (Split Valuation Active)`);
        console.log(`  Non-blank: ${bwtar.nonBlankCount} / ${bwtar.totalRows}`);
        console.log(`  Distinct values: ${bwtar.distinctValues.join(", ")}`);
        console.log(`  → Customer uses split valuation`);
        console.log(`  → Can provide "Valuation" column`);
      } else {
        console.log(`  Status: FIELD EXISTS but empty (no split valuation)`);
        console.log(`  → Customer may not use split valuation`);
        console.log(`  → "Valuation" column would be blank`);
      }

      // VPRSV analysis
      const vprsv = analysis.find((a) => a.field === "VPRSV");
      console.log("\n--- VPRSV (Price Control) Assessment ---");
      if (vprsv) {
        console.log(`  Distinct values: ${vprsv.distinctValues.join(", ")}`);
        console.log(`  S = Standard Price, V = Moving Average Price`);
      }

      return { success: true, analysis };
    } catch (err) {
      console.log(`  ✗ FAILED: ${err.message}`);

      // Try without BWTAR
      console.log("\nTest 2: Reading MBEW without BWTAR...");
      const fieldsNoBwtar = FIELDS.filter((f) => f !== "BWTAR");
      try {
        const result = await sap.readTable("MBEW", fieldsNoBwtar, {
          rowCount: 100,
        });
        const rows = parseRows(result);
        console.log(`  ✓ Success without BWTAR: ${rows.length} rows`);
        console.log(`  → BWTAR does NOT exist or is inaccessible`);
      } catch (err2) {
        console.log(`  ✗ Also failed: ${err2.message}`);
      }

      return { success: false };
    }
  } catch (err) {
    console.error("FATAL:", err.message || err);
  } finally {
    await sap.disconnect();
    console.log("\nDone.");
  }
}

testMbewExtended();
