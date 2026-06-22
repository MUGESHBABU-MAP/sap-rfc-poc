/**
 * Phase 3.10 - MARD Extended Field Discovery
 *
 * Run: node tests/test-mard-extended.js
 *
 * Validates extended MARD fields including SOBKZ (Special Stock Indicator).
 * Goal: Determine if "S" column from customer report is available.
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const SAPService = require("../services/sap.service");
const parseRows = require("../utils/parse-rows");
const { analyzeFields, printAnalysis } = require("../utils/field-discovery");

const FIELDS = [
  "MATNR",
  "WERKS",
  "LGORT",
  "SOBKZ",
  "LABST",
  "INSME",
  "SPEME",
  "UMLME",
];

async function testMardExtended() {
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
    console.log("=== MARD Extended Field Discovery ===");
    console.log(`Fields: ${FIELDS.join(", ")}\n`);

    // Test 1: Check if SOBKZ exists
    console.log("Test 1: Reading MARD with SOBKZ...");
    try {
      const result = await sap.readTable("MARD", FIELDS, { rowCount: 100 });
      const rows = parseRows(result);
      console.log(`  ✓ Success: ${rows.length} rows returned`);

      const analysis = analyzeFields(rows, FIELDS);
      printAnalysis("MARD", analysis);

      // Specific SOBKZ analysis
      const sobkz = analysis.find((a) => a.field === "SOBKZ");
      console.log("\n--- SOBKZ (Special Stock Indicator) Assessment ---");
      if (sobkz && sobkz.nonBlankCount > 0) {
        console.log(`  Status: AVAILABLE`);
        console.log(`  Non-blank: ${sobkz.nonBlankCount} / ${sobkz.totalRows}`);
        console.log(`  Distinct values: ${sobkz.distinctValues.join(", ")}`);
        console.log(`  → Can provide customer "S" column`);
      } else {
        console.log(`  Status: FIELD EXISTS but no data in sample`);
        console.log(
          `  → SOBKZ may only be populated for special stock (consignment, etc.)`,
        );
        console.log(`  → Field exists and can be included in extraction`);
      }

      return { success: true, analysis };
    } catch (err) {
      console.log(`  ✗ FAILED: ${err.message}`);

      // Try without SOBKZ
      console.log("\nTest 2: Reading MARD without SOBKZ...");
      const fieldsNoSobkz = FIELDS.filter((f) => f !== "SOBKZ");
      try {
        const result = await sap.readTable("MARD", fieldsNoSobkz, {
          rowCount: 100,
        });
        const rows = parseRows(result);
        console.log(`  ✓ Success without SOBKZ: ${rows.length} rows`);
        console.log(`  → SOBKZ does NOT exist in this system's MARD table`);
        console.log(
          `  → "S" column must come from another source (MCHB, MSEG)`,
        );
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

testMardExtended();
