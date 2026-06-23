/**
 * Gap Discovery - BWTAR (Valuation Type → "Valuation" column)
 *
 * Run: node tests/test-bwtar.js
 *
 * Reads MBEW-BWTAR to determine if split valuation is active.
 * If BWTAR is always blank → customer doesn't use split valuation.
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const SAPService = require("../services/sap.service");
const parseRows = require("../utils/parse-rows");
const { analyzeFields } = require("../utils/field-discovery");

const TEST_PLANT = process.env.TEST_PLANT || "1000";

async function testBwtar() {
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
    console.log("=== BWTAR (Valuation Type) Discovery ===\n");
    console.log(`Customer column: "Valuation"`);
    console.log(`Testing plant (BWKEY): ${TEST_PLANT}\n`);

    const fields = ["MATNR", "BWKEY", "BWTAR", "VPRSV", "STPRS", "VERPR"];
    const where = [`BWKEY = '${TEST_PLANT}'`];

    console.log("Reading MBEW with BWTAR...");
    let result;
    try {
      result = await sap.readTable("MBEW", fields, { where, rowCount: 500 });
    } catch (err) {
      console.log(`  ✗ Failed with BWTAR: ${err.message}`);
      console.log("  Trying without BWTAR...");
      const fieldsNoBwtar = fields.filter((f) => f !== "BWTAR");
      result = await sap.readTable("MBEW", fieldsNoBwtar, {
        where,
        rowCount: 500,
      });
      console.log("  → BWTAR field does not exist in this system.");
      console.log("\n--- Recommendation ---");
      console.log("  'Valuation' column: FIELD NOT AVAILABLE");
      console.log(
        "  Customer does not use split valuation. Column should remain blank.",
      );
      await sap.disconnect();
      return [
        {
          table: "MBEW",
          field: "BWTAR",
          status: "FIELD_NOT_FOUND",
          nonBlankCount: 0,
          distinctCount: 0,
          distinctValues: "",
          coveragePercent: 0,
          recommendation: "Leave blank - field doesn't exist",
        },
      ];
    }

    const rows = parseRows(result);
    console.log(`  Rows: ${rows.length}\n`);

    const analysis = analyzeFields(rows, ["BWTAR", "VPRSV"]);
    const bwtar = analysis[0];
    const vprsv = analysis[1];

    console.log("--- BWTAR (Valuation Type) ---");
    console.log(`  Total rows: ${bwtar.totalRows}`);
    console.log(`  Non-blank: ${bwtar.nonBlankCount}`);
    console.log(
      `  Distinct values: ${bwtar.distinctValues.join(", ") || "(all blank)"}`,
    );
    console.log(
      `  Coverage: ${bwtar.totalRows > 0 ? Math.round((bwtar.nonBlankCount / bwtar.totalRows) * 100) : 0}%`,
    );

    console.log("\n--- VPRSV (Price Control) for context ---");
    console.log(`  Distinct values: ${vprsv.distinctValues.join(", ")}`);
    console.log(`  S=Standard, V=Moving Average`);

    // Recommendation
    console.log("\n--- Recommendation ---");
    const resultData = {
      table: "MBEW",
      field: "BWTAR",
      totalRows: bwtar.totalRows,
      nonBlankCount: bwtar.nonBlankCount,
      distinctCount: bwtar.distinctCount,
      distinctValues: bwtar.distinctValues.join(", "),
      coveragePercent:
        bwtar.totalRows > 0
          ? Math.round((bwtar.nonBlankCount / bwtar.totalRows) * 100)
          : 0,
    };

    if (bwtar.nonBlankCount > 0) {
      console.log(
        `  Split valuation IS active. ${bwtar.nonBlankCount} materials have valuation types.`,
      );
      console.log(`  Values: ${bwtar.distinctValues.join(", ")}`);
      console.log(`  → Implement MBEW.BWTAR in extraction.`);
      resultData.status = "HAS_DATA";
      resultData.recommendation = "Implement - split valuation active";
    } else {
      console.log("  Split valuation is NOT active (all BWTAR values blank).");
      console.log("  → 'Valuation' column should remain blank in exports.");
      resultData.status = "EMPTY";
      resultData.recommendation = "Leave blank - no split valuation";
    }

    await sap.disconnect();
    console.log("\nDone.");
    return [resultData];
  } catch (err) {
    console.error("FATAL:", err.message || err);
    return [];
  }
}

if (require.main === module) testBwtar();
module.exports = testBwtar;
