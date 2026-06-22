/**
 * Phase 3.10 - MCHB (Batch Stock) Field Discovery
 *
 * Run: node tests/test-mchb.js
 *
 * MCHB = Batch Stocks at Storage Location level.
 * Fields: MATNR, WERKS, LGORT, CLABS, CSPEM, CINSM
 *
 * Goal: Determine if "Restricted-Use" stock is available at batch level.
 *   CLABS = Unrestricted batch stock
 *   CSPEM = Blocked batch stock
 *   CINSM = Quality inspection batch stock
 *
 * Note: Some systems may not have MCHB or it may be empty
 * if batch management is not active.
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const SAPService = require("../services/sap.service");
const parseRows = require("../utils/parse-rows");
const { analyzeFields, printAnalysis } = require("../utils/field-discovery");

const FIELDS = ["MATNR", "WERKS", "LGORT", "CLABS", "CSPEM", "CINSM"];

async function testMchb() {
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
    console.log("=== MCHB (Batch Stocks) Field Discovery ===");
    console.log(`Fields: ${FIELDS.join(", ")}\n`);

    console.log("Reading MCHB...");
    try {
      const result = await sap.readTable("MCHB", FIELDS, { rowCount: 100 });
      const rows = parseRows(result);
      console.log(`  ✓ Success: ${rows.length} rows returned`);

      if (rows.length === 0) {
        console.log("\n  → MCHB table exists but is EMPTY");
        console.log("  → Batch management may not be active for this plant");
        console.log("  → Restricted-use stock is NOT available from MCHB");
        return;
      }

      const analysis = analyzeFields(rows, FIELDS);
      printAnalysis("MCHB", analysis);

      // Assessment
      console.log("\n--- Batch Stock Assessment ---");
      const clabs = analysis.find((a) => a.field === "CLABS");
      const cspem = analysis.find((a) => a.field === "CSPEM");
      const cinsm = analysis.find((a) => a.field === "CINSM");

      console.log(
        `  CLABS (Unrestricted batch): ${clabs ? clabs.nonBlankCount : 0} non-blank`,
      );
      console.log(
        `  CSPEM (Blocked batch):      ${cspem ? cspem.nonBlankCount : 0} non-blank`,
      );
      console.log(
        `  CINSM (Quality batch):      ${cinsm ? cinsm.nonBlankCount : 0} non-blank`,
      );

      console.log("\n--- Conclusion ---");
      console.log("  MCHB provides batch-level stock breakdown.");
      console.log(
        "  For 'Restricted-Use': check if customer means batch-restricted stock.",
      );
      console.log(
        "  MCHB does NOT have a direct 'restricted' field — that's MARC-level or custom.",
      );
    } catch (err) {
      console.log(`  ✗ FAILED: ${err.message}`);
      console.log("\n  → MCHB table may not exist or fields are invalid");
      console.log("  → Batch management may not be configured in this system");

      // Try with fewer fields
      console.log("\n  Trying minimal fields (MATNR, WERKS, LGORT)...");
      try {
        const result = await sap.readTable(
          "MCHB",
          ["MATNR", "WERKS", "LGORT"],
          { rowCount: 5 },
        );
        const rows = parseRows(result);
        console.log(
          `  ✓ Table exists with ${rows.length} rows (some fields invalid)`,
        );
      } catch (err2) {
        console.log(
          `  ✗ Table does not exist or is inaccessible: ${err2.message}`,
        );
      }
    }
  } catch (err) {
    console.error("FATAL:", err.message || err);
  } finally {
    await sap.disconnect();
    console.log("\nDone.");
  }
}

testMchb();
