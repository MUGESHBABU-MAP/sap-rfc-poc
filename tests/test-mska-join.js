/**
 * Phase 3.16B - MSKA to Inventory Join Validation
 *
 * Run: node tests/test-mska-join.js
 *
 * Diagnostic only. Does NOT modify any services.
 * Validates whether MSKA.MATNR+WERKS can be joined against MARD.MATNR+WERKS.
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const SAPService = require("../services/sap.service");
const parseRows = require("../utils/parse-rows");

const TEST_PLANT = process.env.TEST_PLANT || "1000";

async function testMskaJoin() {
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

    console.log("=== MSKA Join Validation ===");
    console.log(`Plant: ${TEST_PLANT}\n`);

    // Step 1: Read MSKA
    console.log("Step 1: Reading MSKA...");
    let mskaRows = [];
    try {
      const mskaResult = await sap.readTable(
        "MSKA",
        ["MATNR", "WERKS", "VBELN", "POSNR", "SOBKZ"],
        { where: [`WERKS = '${TEST_PLANT}'`], rowCount: 500 },
      );
      mskaRows = parseRows(mskaResult);
      console.log(`  MSKA rows: ${mskaRows.length}`);
    } catch (err) {
      console.log(`  ✗ MSKA read failed: ${err.message}`);
      console.log("\n--- Final Recommendation ---");
      console.log("  Cannot validate join. MSKA inaccessible.");
      await sap.disconnect();
      return;
    }

    if (mskaRows.length === 0) {
      console.log("\n  No MSKA rows for this plant. Nothing to join.");
      await sap.disconnect();
      return;
    }

    // Step 2: Read MARD
    console.log("\nStep 2: Reading MARD...");
    let mardRows = [];
    try {
      const mardResult = await sap.readTable(
        "MARD",
        ["MATNR", "WERKS", "LGORT", "LABST", "INSME", "SPEME", "UMLME"],
        { where: [`WERKS = '${TEST_PLANT}'`] },
      );
      mardRows = parseRows(mardResult);
      console.log(`  MARD rows: ${mardRows.length}`);
    } catch (err) {
      console.log(`  ✗ MARD read failed: ${err.message}`);
      await sap.disconnect();
      return;
    }

    // Build MARD lookup: MATNR|WERKS → first matching row
    console.log("\nBuilding MARD lookup map...");
    const mardMap = {};
    for (let i = 0; i < mardRows.length; i++) {
      const r = mardRows[i];
      const key = `${r.MATNR}|${r.WERKS}`;
      if (!mardMap[key]) {
        mardMap[key] = r;
      }
    }
    const mardUniqueKeys = Object.keys(mardMap).length;
    console.log(`  Unique MARD keys (MATNR|WERKS): ${mardUniqueKeys}`);

    // Validate join
    console.log("\nValidating MSKA → MARD join...");
    const matched = [];
    const unmatched = [];
    const mskaMaterialSet = new Set();
    const matchedMaterialSet = new Set();

    for (let i = 0; i < mskaRows.length; i++) {
      const mska = mskaRows[i];
      const key = `${mska.MATNR}|${mska.WERKS}`;
      mskaMaterialSet.add(mska.MATNR);

      if (mardMap[key]) {
        matched.push({ mska, mard: mardMap[key] });
        matchedMaterialSet.add(mska.MATNR);
      } else {
        unmatched.push(mska);
      }
    }

    // Statistics
    const matchPercent =
      mskaRows.length > 0
        ? ((matched.length / mskaRows.length) * 100).toFixed(1)
        : 0;

    console.log("\n--- Statistics ---");
    console.log(`  MSKA rows checked:  ${mskaRows.length}`);
    console.log(`  MARD rows loaded:   ${mardRows.length}`);
    console.log(`  Matched:            ${matched.length}`);
    console.log(`  Unmatched:          ${unmatched.length}`);
    console.log(`  Match %:            ${matchPercent}%`);

    // Show first 20 matches
    const matchDisplay = Math.min(20, matched.length);
    if (matchDisplay > 0) {
      console.log(`\n--- First ${matchDisplay} Matches ---`);
      console.log(
        "MATNR".padEnd(18) +
          "WERKS".padEnd(6) +
          "VBELN".padEnd(12) +
          "SOBKZ".padEnd(6) +
          "LGORT".padEnd(6) +
          "LABST".padEnd(12) +
          "INSME".padEnd(10) +
          "SPEME".padEnd(10) +
          "UMLME",
      );
      console.log("-".repeat(92));

      for (let i = 0; i < matchDisplay; i++) {
        const m = matched[i];
        console.log(
          (m.mska.MATNR || "").padEnd(18) +
            (m.mska.WERKS || "").padEnd(6) +
            (m.mska.VBELN || "").padEnd(12) +
            (m.mska.SOBKZ || "").padEnd(6) +
            (m.mard.LGORT || "").padEnd(6) +
            (m.mard.LABST || "").padEnd(12) +
            (m.mard.INSME || "").padEnd(10) +
            (m.mard.SPEME || "").padEnd(10) +
            (m.mard.UMLME || ""),
        );
      }
    }

    // Show first 20 unmatched
    if (unmatched.length > 0) {
      const unmatchDisplay = Math.min(20, unmatched.length);
      console.log(`\n--- First ${unmatchDisplay} Unmatched ---`);
      console.log(
        "MATNR".padEnd(18) + "WERKS".padEnd(6) + "VBELN".padEnd(12) + "SOBKZ",
      );
      console.log("-".repeat(42));

      for (let i = 0; i < unmatchDisplay; i++) {
        const u = unmatched[i];
        console.log(
          (u.MATNR || "").padEnd(18) +
            (u.WERKS || "").padEnd(6) +
            (u.VBELN || "").padEnd(12) +
            (u.SOBKZ || ""),
        );
      }
    }

    // Additional analysis
    const mardMaterialSet = new Set();
    for (let i = 0; i < mardRows.length; i++) {
      mardMaterialSet.add(mardRows[i].MATNR);
    }

    const mskaOrderSet = new Set();
    for (let i = 0; i < mskaRows.length; i++) {
      if (mskaRows[i].VBELN) mskaOrderSet.add(mskaRows[i].VBELN);
    }

    console.log("\n--- Additional Analysis ---");
    console.log(`  Unique MSKA Materials:           ${mskaMaterialSet.size}`);
    console.log(`  Unique MARD Materials:           ${mardMaterialSet.size}`);
    console.log(
      `  MSKA Materials Found in MARD:    ${matchedMaterialSet.size}`,
    );
    console.log(`  Unique Sales Orders (VBELN):     ${mskaOrderSet.size}`);

    // Final recommendation
    console.log("\n--- Final Recommendation ---");
    if (parseFloat(matchPercent) >= 95) {
      console.log("  ✓ MSKA joins successfully with inventory dataset.");
      console.log(`    Match rate: ${matchPercent}%`);
      console.log("");
      console.log("  Recommended next phase:");
      console.log("    - Integrate MSKA into inventory-dataset.service.js");
      console.log("    - Read MSKA with plant filter");
      console.log("    - Join on MATNR + WERKS");
      console.log("    - Set specialStockIndicator = SOBKZ ('E')");
      console.log("    - Set specialStockNumber = VBELN");
      console.log("    - Populate E sheet in workbook");
    } else if (parseFloat(matchPercent) >= 50) {
      console.log(`  ⚠ Partial join success (${matchPercent}%).`);
      console.log("    Some MSKA materials don't exist in MARD.");
      console.log(
        "    Integration possible but unmatched records will be lost.",
      );
      console.log(
        "    Investigate: do unmatched materials have stock elsewhere?",
      );
    } else {
      console.log(`  ✗ Join quality insufficient (${matchPercent}%).`);
      console.log(
        "    Investigate alternative join strategy before implementation.",
      );
      console.log(
        "    MSKA materials may not align with MARD plant inventory.",
      );
    }

    await sap.disconnect();
    console.log("\nDone.");
  } catch (err) {
    console.error("FATAL:", err.message || err);
  }
}

testMskaJoin();
