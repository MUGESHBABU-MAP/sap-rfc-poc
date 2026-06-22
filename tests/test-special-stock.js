/**
 * Phase 3.10 - Special Stock Tables Discovery
 *
 * Run: node tests/test-special-stock.js
 *
 * Tests multiple SAP tables that may hold special stock data:
 *   MKOL - Consignment stock at customer
 *   MSLB - Special stocks with vendor
 *   MSKU - Special stocks with customer
 *   MSKA - Sales order stock
 *
 * Goal: Identify source for "Special stock number" and "Returns" columns.
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const SAPService = require("../services/sap.service");
const parseRows = require("../utils/parse-rows");
const { analyzeFields, printAnalysis } = require("../utils/field-discovery");

const TABLES = [
  {
    name: "MKOL",
    description: "Consignment Stock at Customer",
    fields: ["MATNR", "WERKS", "LGORT", "SOBKZ", "LIFNR"],
    relevance: "Special stock number (vendor), consignment",
  },
  {
    name: "MSLB",
    description: "Special Stocks with Vendor",
    fields: ["MATNR", "WERKS", "SOBKZ", "LIFNR", "LBLAB", "LBINS"],
    relevance: "Subcontracting stock, vendor returns",
  },
  {
    name: "MSKU",
    description: "Special Stocks with Customer",
    fields: ["MATNR", "WERKS", "SOBKZ", "KUNNR", "KULAB", "KUINS"],
    relevance: "Customer consignment, returnable packaging",
  },
  {
    name: "MSKA",
    description: "Sales Order Stock",
    fields: ["MATNR", "WERKS", "LGORT", "SOBKZ", "VBELN"],
    relevance: "Make-to-order stock",
  },
];

async function testSpecialStock() {
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
    console.log("=== Special Stock Tables Discovery ===\n");

    const results = {};

    for (let t = 0; t < TABLES.length; t++) {
      const table = TABLES[t];
      console.log(`--- ${table.name}: ${table.description} ---`);
      console.log(`    Relevance: ${table.relevance}`);
      console.log(`    Fields: ${table.fields.join(", ")}`);

      try {
        const result = await sap.readTable(table.name, table.fields, {
          rowCount: 50,
        });
        const rows = parseRows(result);
        console.log(`    ✓ ${rows.length} rows returned`);

        if (rows.length > 0) {
          const analysis = analyzeFields(rows, table.fields);
          printAnalysis(table.name, analysis);
          results[table.name] = {
            status: "AVAILABLE",
            rows: rows.length,
            analysis,
          };
        } else {
          console.log(`    → Table exists but is EMPTY`);
          results[table.name] = { status: "EMPTY", rows: 0 };
        }
      } catch (err) {
        console.log(`    ✗ FAILED: ${err.message}`);
        results[table.name] = { status: "FAILED", error: err.message };

        // Try minimal fields
        try {
          const minFields = table.fields.slice(0, 2);
          const result = await sap.readTable(table.name, minFields, {
            rowCount: 5,
          });
          const rows = parseRows(result);
          console.log(
            `    → Table exists (${rows.length} rows with ${minFields.join(",")}), some fields invalid`,
          );
          results[table.name].status = "PARTIAL";
        } catch (err2) {
          console.log(`    → Table does NOT exist or is inaccessible`);
        }
      }

      console.log("");
    }

    // Summary
    console.log("\n========================================");
    console.log("=== SUMMARY ===");
    console.log("========================================\n");

    console.log(
      "Table".padEnd(8) +
        "Status".padEnd(12) +
        "Rows".padEnd(8) +
        "Description",
    );
    console.log("-".repeat(70));

    for (let t = 0; t < TABLES.length; t++) {
      const table = TABLES[t];
      const r = results[table.name] || {};
      console.log(
        table.name.padEnd(8) +
          (r.status || "?").padEnd(12) +
          String(r.rows || 0).padEnd(8) +
          table.description,
      );
    }

    console.log("\n--- Recommendation ---");
    if (results.MSLB && results.MSLB.status === "AVAILABLE") {
      console.log(
        "  MSLB available → Can source vendor special stock / returns",
      );
    }
    if (results.MSKU && results.MSKU.status === "AVAILABLE") {
      console.log("  MSKU available → Can source customer consignment");
    }
    if (results.MKOL && results.MKOL.status === "AVAILABLE") {
      console.log("  MKOL available → Can source consignment at customer");
    }

    const allEmpty = Object.values(results).every(
      (r) => r.status === "EMPTY" || r.status === "FAILED",
    );
    if (allEmpty) {
      console.log("  No special stock tables have data.");
      console.log(
        "  'Special stock number' and 'Returns' columns may not apply to this customer.",
      );
    }
  } catch (err) {
    console.error("FATAL:", err.message || err);
  } finally {
    await sap.disconnect();
    console.log("\nDone.");
  }
}

testSpecialStock();
