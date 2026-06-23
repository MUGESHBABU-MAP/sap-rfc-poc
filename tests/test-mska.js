/**
 * Phase 3.16 - MSKA (Sales Order Stock) Validation
 *
 * Run: node tests/test-mska.js
 *
 * Diagnostic only. Does NOT modify any services.
 * Determines whether Plant 1000 has Sales Order Stock (SOBKZ = E).
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const SAPService = require("../services/sap.service");
const parseRows = require("../utils/parse-rows");

const TEST_PLANT = process.env.TEST_PLANT || "1000";

async function testMska() {
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

    // Section 1: Header
    console.log("=== MSKA Discovery ===");
    console.log(`Plant: ${TEST_PLANT}\n`);

    const fields = [
      "MATNR",
      "WERKS",
      "VBELN",
      "POSNR",
      "SOBKZ",
      "KALAB",
      "KAINS",
      "KASPE",
    ];
    const where = [`WERKS = '${TEST_PLANT}'`];

    console.log(`Reading MSKA (fields: ${fields.join(", ")})...`);

    let rows = [];
    try {
      const result = await sap.readTable("MSKA", fields, {
        where,
        rowCount: 500,
      });
      rows = parseRows(result);
    } catch (err) {
      console.log(`\n  ✗ FAILED: ${err.message}`);
      console.log("\n  Trying with fewer fields...");

      // Fallback: try without KALAB/KAINS/KASPE (may not exist in all systems)
      try {
        const minFields = ["MATNR", "WERKS", "VBELN", "POSNR", "SOBKZ"];
        const result = await sap.readTable("MSKA", minFields, {
          where,
          rowCount: 500,
        });
        rows = parseRows(result);
        console.log(`  ✓ Succeeded with minimal fields: ${rows.length} rows`);
        console.log(
          "  Note: KALAB/KAINS/KASPE may not exist in this system.\n",
        );
      } catch (err2) {
        console.log(`  ✗ Also failed: ${err2.message}`);
        console.log("\n--- Final Recommendation ---");
        console.log("  MSKA table is not accessible for this plant.");
        console.log("  E sheet should remain empty.");
        await sap.disconnect();
        return;
      }
    }

    // Section 2: Row statistics
    console.log("\n--- Row Statistics ---");
    console.log(`  Rows returned: ${rows.length}`);

    let sobkzCount = 0;
    let vbelnCount = 0;
    const sobkzValues = new Set();
    const materialSet = new Set();
    const orderSet = new Set();

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r.SOBKZ && r.SOBKZ !== "") {
        sobkzCount++;
        sobkzValues.add(r.SOBKZ);
      }
      if (r.VBELN && r.VBELN !== "") {
        vbelnCount++;
        orderSet.add(r.VBELN);
      }
      if (r.MATNR && r.MATNR !== "") {
        materialSet.add(r.MATNR);
      }
    }

    console.log(`  Rows with SOBKZ: ${sobkzCount}`);
    console.log(`  Rows with VBELN: ${vbelnCount}`);
    console.log(
      `  Distinct SOBKZ values: ${[...sobkzValues].join(", ") || "(none)"}`,
    );

    // Section 3: First 20 records
    console.log("\n--- First 20 Records ---");
    const displayCount = Math.min(20, rows.length);

    if (displayCount > 0) {
      console.log(
        "MATNR".padEnd(18) +
          "WERKS".padEnd(6) +
          "VBELN".padEnd(12) +
          "POSNR".padEnd(8) +
          "SOBKZ".padEnd(6) +
          "KALAB".padEnd(12) +
          "KAINS".padEnd(10) +
          "KASPE",
      );
      console.log("-".repeat(84));

      for (let i = 0; i < displayCount; i++) {
        const r = rows[i];
        console.log(
          (r.MATNR || "").padEnd(18) +
            (r.WERKS || "").padEnd(6) +
            (r.VBELN || "").padEnd(12) +
            (r.POSNR || "").padEnd(8) +
            (r.SOBKZ || "").padEnd(6) +
            (r.KALAB || "").padEnd(12) +
            (r.KAINS || "").padEnd(10) +
            (r.KASPE || ""),
        );
      }
    } else {
      console.log("  (no records)");
    }

    // Section 4: Aggregate totals
    console.log("\n--- Aggregate Totals ---");
    let totalKalab = 0;
    let totalKains = 0;
    let totalKaspe = 0;

    for (let i = 0; i < rows.length; i++) {
      totalKalab += parseFloat(rows[i].KALAB) || 0;
      totalKains += parseFloat(rows[i].KAINS) || 0;
      totalKaspe += parseFloat(rows[i].KASPE) || 0;
    }

    console.log(`  Total unrestricted qty (KALAB): ${totalKalab}`);
    console.log(`  Total quality qty (KAINS):      ${totalKains}`);
    console.log(`  Total blocked qty (KASPE):      ${totalKaspe}`);

    // Additional validation
    console.log("\n--- Additional Validation ---");
    console.log(`  Unique materials: ${materialSet.size}`);
    console.log(`  Unique sales orders: ${orderSet.size}`);

    // Section 5: Final recommendation
    console.log("\n--- Final Recommendation ---");
    if (rows.length > 0) {
      console.log(
        `  ✓ MSKA contains Sales Order Stock for Plant ${TEST_PLANT}.`,
      );
      console.log(`    Records: ${rows.length}`);
      console.log(`    SOBKZ values: ${[...sobkzValues].join(", ")}`);
      console.log(`    Unique materials: ${materialSet.size}`);
      console.log(`    Unique orders: ${orderSet.size}`);
      console.log("");
      console.log("  ACTION: Integrate MSKA into inventory-dataset.service.js");
      console.log("    - Read MSKA with plant filter");
      console.log("    - Join on MATNR + WERKS");
      console.log("    - Set specialStockIndicator = SOBKZ (should be 'E')");
      console.log("    - Set specialStockNumber = VBELN");
      console.log("    - E sheet will then be populated in workbook");
    } else {
      console.log(`  No Sales Order Stock exists for Plant ${TEST_PLANT}.`);
      console.log("  E sheet should remain empty.");
      console.log("  No implementation changes needed.");
    }

    await sap.disconnect();
    console.log("\nDone.");
  } catch (err) {
    console.error("FATAL:", err.message || err);
  }
}

testMska();
