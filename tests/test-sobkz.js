/**
 * Gap Discovery - SOBKZ (Special Stock Indicator → "S" column)
 *
 * Run: node tests/test-sobkz.js
 *
 * Reads SOBKZ from multiple tables to determine where the customer
 * "S" column is sourced from.
 *
 * Tables tested: MARD, MSLB, MSKU, MSKA
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const SAPService = require("../services/sap.service");
const parseRows = require("../utils/parse-rows");
const { analyzeFields, printAnalysis } = require("../utils/field-discovery");

const TEST_PLANT = process.env.TEST_PLANT || "1000";

const TABLES = [
  {
    name: "MARD",
    fields: ["MATNR", "WERKS", "LGORT", "SOBKZ", "LABST"],
    plantField: "WERKS",
  },
  {
    name: "MSLB",
    fields: ["MATNR", "WERKS", "SOBKZ", "LIFNR", "LBLAB"],
    plantField: "WERKS",
  },
  {
    name: "MSKU",
    fields: ["MATNR", "WERKS", "SOBKZ", "KUNNR", "KULAB"],
    plantField: "WERKS",
  },
  {
    name: "MSKA",
    fields: ["MATNR", "WERKS", "LGORT", "SOBKZ", "VBELN"],
    plantField: "WERKS",
  },
];

async function testSobkz() {
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
    console.log("=== SOBKZ (Special Stock Indicator) Discovery ===\n");
    console.log(`Customer column: "S"`);
    console.log(`Testing plant: ${TEST_PLANT}\n`);

    const results = [];

    for (let t = 0; t < TABLES.length; t++) {
      const table = TABLES[t];
      console.log(`--- ${table.name} ---`);

      try {
        const where = [`${table.plantField} = '${TEST_PLANT}'`];
        const result = await sap.readTable(table.name, table.fields, {
          where,
          rowCount: 200,
        });
        const rows = parseRows(result);
        console.log(`  Rows: ${rows.length}`);

        if (rows.length > 0) {
          const analysis = analyzeFields(rows, ["SOBKZ"]);
          const sobkz = analysis[0];

          console.log(
            `  SOBKZ non-blank: ${sobkz.nonBlankCount} / ${sobkz.totalRows}`,
          );
          console.log(
            `  Distinct values: ${sobkz.distinctValues.join(", ") || "(none)"}`,
          );
          console.log(
            `  Samples: ${sobkz.samples.join(", ") || "(all blank)"}`,
          );

          results.push({
            table: table.name,
            field: "SOBKZ",
            totalRows: sobkz.totalRows,
            nonBlankCount: sobkz.nonBlankCount,
            distinctCount: sobkz.distinctCount,
            distinctValues: sobkz.distinctValues.join(", "),
            coveragePercent:
              sobkz.totalRows > 0
                ? Math.round((sobkz.nonBlankCount / sobkz.totalRows) * 100)
                : 0,
            status: sobkz.nonBlankCount > 0 ? "HAS_DATA" : "EMPTY",
          });
        } else {
          console.log(`  (no rows returned)`);
          results.push({
            table: table.name,
            field: "SOBKZ",
            totalRows: 0,
            nonBlankCount: 0,
            distinctCount: 0,
            distinctValues: "",
            coveragePercent: 0,
            status: "NO_ROWS",
          });
        }
      } catch (err) {
        console.log(`  ✗ FAILED: ${err.message}`);
        results.push({
          table: table.name,
          field: "SOBKZ",
          totalRows: 0,
          nonBlankCount: 0,
          distinctCount: 0,
          distinctValues: "",
          coveragePercent: 0,
          status: `FAILED: ${err.message}`,
        });
      }
      console.log("");
    }

    // Summary
    console.log("========================================");
    console.log("=== SOBKZ SUMMARY ===");
    console.log("========================================\n");

    console.log(
      "Table".padEnd(8) +
        "Status".padEnd(12) +
        "Non-Blank".padEnd(12) +
        "Distinct".padEnd(10) +
        "Values",
    );
    console.log("-".repeat(70));
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      console.log(
        r.table.padEnd(8) +
          r.status.substring(0, 10).padEnd(12) +
          String(r.nonBlankCount).padEnd(12) +
          String(r.distinctCount).padEnd(10) +
          r.distinctValues.substring(0, 30),
      );
    }

    // Recommendation
    const hasData = results.filter((r) => r.status === "HAS_DATA");
    console.log("\n--- Recommendation ---");
    if (hasData.length > 0) {
      const best = hasData.sort((a, b) => b.nonBlankCount - a.nonBlankCount)[0];
      console.log(
        `  Best source: ${best.table}.SOBKZ (${best.nonBlankCount} non-blank records)`,
      );
      console.log(`  Values: ${best.distinctValues}`);
    } else {
      console.log("  No SOBKZ data found in any table for this plant.");
      console.log(
        "  Customer 'S' column may not apply or uses a custom field.",
      );
    }

    await sap.disconnect();
    console.log("\nDone.");
    return results;
  } catch (err) {
    console.error("FATAL:", err.message || err);
    return [];
  }
}

if (require.main === module) testSobkz();
module.exports = testSobkz;
