/**
 * Gap Discovery - Special Stock Number + SL columns
 *
 * Run: node tests/test-special-stock-number.js
 *
 * Reads partner/document fields from special stock tables:
 *   MSLB → LIFNR (vendor number)
 *   MSKU → KUNNR (customer number)
 *   MSKA → VBELN, POSNR (sales order + item)
 *
 * Also investigates "SL" column candidates.
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const SAPService = require("../services/sap.service");
const parseRows = require("../utils/parse-rows");
const { analyzeFields } = require("../utils/field-discovery");

const TEST_PLANT = process.env.TEST_PLANT || "1000";

const DISCOVERIES = [
  {
    table: "MSLB",
    fields: ["MATNR", "WERKS", "SOBKZ", "LIFNR", "LBLAB"],
    targetField: "LIFNR",
    description: "Vendor Number (subcontracting/consignment)",
  },
  {
    table: "MSKU",
    fields: ["MATNR", "WERKS", "SOBKZ", "KUNNR", "KULAB"],
    targetField: "KUNNR",
    description: "Customer Number (customer consignment)",
  },
  {
    table: "MSKA",
    fields: ["MATNR", "WERKS", "LGORT", "SOBKZ", "VBELN"],
    targetField: "VBELN",
    description: "Sales Order Number (make-to-order)",
  },
];

async function testSpecialStockNumber() {
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
    console.log("=== Special Stock Number + SL Discovery ===\n");
    console.log(`Customer columns: "Special stock number", "SL"`);
    console.log(`Testing plant: ${TEST_PLANT}\n`);

    const results = [];

    for (let d = 0; d < DISCOVERIES.length; d++) {
      const disc = DISCOVERIES[d];
      console.log(
        `--- ${disc.table}.${disc.targetField}: ${disc.description} ---`,
      );

      try {
        const where = [`WERKS = '${TEST_PLANT}'`];
        const result = await sap.readTable(disc.table, disc.fields, {
          where,
          rowCount: 200,
        });
        const rows = parseRows(result);
        console.log(`  Rows: ${rows.length}`);

        if (rows.length > 0) {
          const analysis = analyzeFields(rows, [disc.targetField]);
          const field = analysis[0];

          console.log(
            `  ${disc.targetField} non-blank: ${field.nonBlankCount} / ${field.totalRows}`,
          );
          console.log(`  Distinct: ${field.distinctCount}`);
          console.log(`  Samples: ${field.samples.slice(0, 5).join(", ")}`);

          results.push({
            customerColumn: "Special stock number",
            table: disc.table,
            field: disc.targetField,
            description: disc.description,
            totalRows: field.totalRows,
            nonBlankCount: field.nonBlankCount,
            distinctCount: field.distinctCount,
            distinctValues: field.distinctValues.slice(0, 10).join(", "),
            coveragePercent:
              field.totalRows > 0
                ? Math.round((field.nonBlankCount / field.totalRows) * 100)
                : 0,
            status: field.nonBlankCount > 0 ? "HAS_DATA" : "EMPTY",
          });
        } else {
          console.log(`  (no rows)`);
          results.push({
            customerColumn: "Special stock number",
            table: disc.table,
            field: disc.targetField,
            description: disc.description,
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
          customerColumn: "Special stock number",
          table: disc.table,
          field: disc.targetField,
          description: disc.description,
          totalRows: 0,
          nonBlankCount: 0,
          distinctCount: 0,
          distinctValues: "",
          coveragePercent: 0,
          status: "FAILED",
        });
      }
      console.log("");
    }

    // SL column investigation
    console.log("--- SL Column Investigation ---");
    console.log("  'SL' in MB52 context typically means:");
    console.log("  1. Storage Location type indicator (custom)");
    console.log("  2. Stock Level indicator");
    console.log("  3. Could be part of MARD extended fields");
    console.log("");

    // Try MARD with LVORM (deletion flag) as potential SL candidate
    try {
      const slResult = await sap.readTable(
        "MARD",
        ["MATNR", "WERKS", "LGORT", "LVORM"],
        {
          where: [`WERKS = '${TEST_PLANT}'`],
          rowCount: 100,
        },
      );
      const slRows = parseRows(slResult);
      const slAnalysis = analyzeFields(slRows, ["LVORM"]);
      const lvorm = slAnalysis[0];
      console.log(
        `  MARD.LVORM (deletion indicator): ${lvorm.nonBlankCount} non-blank / ${lvorm.totalRows}`,
      );
      results.push({
        customerColumn: "SL",
        table: "MARD",
        field: "LVORM",
        description: "Deletion indicator (possible SL)",
        totalRows: lvorm.totalRows,
        nonBlankCount: lvorm.nonBlankCount,
        distinctCount: lvorm.distinctCount,
        distinctValues: lvorm.distinctValues.join(", "),
        coveragePercent:
          lvorm.totalRows > 0
            ? Math.round((lvorm.nonBlankCount / lvorm.totalRows) * 100)
            : 0,
        status: lvorm.nonBlankCount > 0 ? "HAS_DATA" : "EMPTY",
      });
    } catch (err) {
      console.log(`  MARD.LVORM: FAILED (${err.message})`);
      results.push({
        customerColumn: "SL",
        table: "MARD",
        field: "LVORM",
        description: "Deletion indicator",
        totalRows: 0,
        nonBlankCount: 0,
        distinctCount: 0,
        distinctValues: "",
        coveragePercent: 0,
        status: "FAILED",
      });
    }

    // Summary
    console.log("\n========================================");
    console.log("=== SUMMARY ===");
    console.log("========================================\n");

    console.log(
      "Column".padEnd(22) +
        "Table".padEnd(8) +
        "Field".padEnd(8) +
        "Status".padEnd(12) +
        "Non-Blank".padEnd(12) +
        "Description",
    );
    console.log("-".repeat(90));
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      console.log(
        r.customerColumn.padEnd(22) +
          r.table.padEnd(8) +
          r.field.padEnd(8) +
          r.status.substring(0, 10).padEnd(12) +
          String(r.nonBlankCount).padEnd(12) +
          r.description.substring(0, 35),
      );
    }

    console.log("\n--- Recommendation for 'Special stock number' ---");
    const specials = results.filter(
      (r) =>
        r.customerColumn === "Special stock number" && r.status === "HAS_DATA",
    );
    if (specials.length > 0) {
      console.log(
        `  Source: ${specials.map((s) => `${s.table}.${s.field}`).join(", ")}`,
      );
    } else {
      console.log("  No special stock data found. Column may remain blank.");
    }

    console.log("\n--- Recommendation for 'SL' ---");
    console.log("  Most likely: needs customer clarification.");
    console.log("  Could be LGORT-level type or custom classification.");

    await sap.disconnect();
    console.log("\nDone.");
    return results;
  } catch (err) {
    console.error("FATAL:", err.message || err);
    return [];
  }
}

if (require.main === module) testSpecialStockNumber();
module.exports = testSpecialStockNumber;
