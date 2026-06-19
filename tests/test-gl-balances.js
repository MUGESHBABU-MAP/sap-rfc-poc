/**
 * Phase 2 - GL Balance Validation (FAGLB03 Reproduction)
 *
 * Run: node tests/test-gl-balances.js
 *
 * Uses smaller batches to stay within RFC_READ_TABLE width limits.
 * Only uses HSL01-HSL12 (standard periods).
 *
 * Requirements:
 *   1. Read first 100 records
 *   2. Calculate cumulative balance: HSLVT + HSL01..HSL12
 *   3. Print sample output
 *   4. Print count of records having non-zero balances
 *   5. Create GLBalanceRecord structure
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const SAPService = require("../services/sap.service");
const parseRows = require("../utils/parse-rows");

async function testGLBalances() {
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
    console.log("=== GL Balance Validation (FAGLB03 Reproduction) ===\n");

    const where = ["RRCTY = '0'", "RVERS = '001'"];

    // Batch 1: Identity + HSLVT + HSL01-06 (small batch to avoid width limit)
    console.log("Reading Batch 1: Identity + HSLVT + HSL01-06...");
    const batch1Fields = [
      "RBUKRS",
      "RACCT",
      "RYEAR",
      "RPMAX",
      "DRCRK",
      "HSLVT",
      "HSL01",
      "HSL02",
      "HSL03",
      "HSL04",
      "HSL05",
      "HSL06",
    ];
    const result1 = await sap.readTable("FAGLFLEXT", batch1Fields, {
      where,
      rowCount: 100,
    });
    const rows1 = parseRows(result1);
    console.log(`  ${rows1.length} rows returned.`);

    // Batch 2: Identity keys + HSL07-12
    console.log("Reading Batch 2: Identity + HSL07-12...");
    const batch2Fields = [
      "RBUKRS",
      "RACCT",
      "RYEAR",
      "HSL07",
      "HSL08",
      "HSL09",
      "HSL10",
      "HSL11",
      "HSL12",
    ];
    const result2 = await sap.readTable("FAGLFLEXT", batch2Fields, {
      where,
      rowCount: 100,
    });
    const rows2 = parseRows(result2);
    console.log(`  ${rows2.length} rows returned.`);

    // Batch 3: Transaction currency (optional - may not exist)
    let rows3 = [];
    let rows4 = [];
    try {
      console.log("Reading Batch 3: TSLVT + TSL01-06...");
      const batch3Fields = [
        "RBUKRS",
        "RACCT",
        "RYEAR",
        "TSLVT",
        "TSL01",
        "TSL02",
        "TSL03",
        "TSL04",
        "TSL05",
        "TSL06",
      ];
      const result3 = await sap.readTable("FAGLFLEXT", batch3Fields, {
        where,
        rowCount: 100,
      });
      rows3 = parseRows(result3);
      console.log(`  ${rows3.length} rows returned.`);

      console.log("Reading Batch 4: TSL07-12...");
      const batch4Fields = [
        "RBUKRS",
        "RACCT",
        "RYEAR",
        "TSL07",
        "TSL08",
        "TSL09",
        "TSL10",
        "TSL11",
        "TSL12",
      ];
      const result4 = await sap.readTable("FAGLFLEXT", batch4Fields, {
        where,
        rowCount: 100,
      });
      rows4 = parseRows(result4);
      console.log(`  ${rows4.length} rows returned.`);
    } catch (err) {
      console.log(`  TSL fields unavailable (skipping): ${err.message}`);
    }

    // Build GLBalanceRecord array
    console.log("\nBuilding GLBalanceRecord structures...\n");
    const records = rows1.map((row, idx) => {
      const row2 = rows2[idx] || {};
      const row3 = rows3[idx] || {};
      const row4 = rows4[idx] || {};

      // Local currency: HSLVT + HSL01..HSL12
      const hslvt = parseFloat(row.HSLVT) || 0;
      let hslTotal = hslvt;
      for (const f of ["HSL01", "HSL02", "HSL03", "HSL04", "HSL05", "HSL06"]) {
        hslTotal += parseFloat(row[f]) || 0;
      }
      for (const f of ["HSL07", "HSL08", "HSL09", "HSL10", "HSL11", "HSL12"]) {
        hslTotal += parseFloat(row2[f]) || 0;
      }

      // Transaction currency: TSLVT + TSL01..TSL12
      const tslvt = parseFloat(row3.TSLVT) || 0;
      let tslTotal = tslvt;
      for (const f of ["TSL01", "TSL02", "TSL03", "TSL04", "TSL05", "TSL06"]) {
        tslTotal += parseFloat(row3[f]) || 0;
      }
      for (const f of ["TSL07", "TSL08", "TSL09", "TSL10", "TSL11", "TSL12"]) {
        tslTotal += parseFloat(row4[f]) || 0;
      }

      return {
        companyCode: row.RBUKRS || "",
        account: row.RACCT || "",
        fiscalYear: row.RYEAR || "",
        period: row.RPMAX || "",
        debitCreditIndicator: row.DRCRK || "",
        cumulativeBalance: Math.round(hslTotal * 100) / 100,
        localCurrencyBalance: Math.round(hslTotal * 100) / 100,
        transactionCurrencyBalance: Math.round(tslTotal * 100) / 100,
      };
    });

    // --- Requirement 3: Print sample output ---
    console.log("--- Sample GLBalanceRecords (first 10) ---");
    console.log(JSON.stringify(records.slice(0, 10), null, 2));

    // --- Requirement 4: Count non-zero balances ---
    const nonZeroLocal = records.filter((r) => r.localCurrencyBalance !== 0);
    const nonZeroTxn = records.filter(
      (r) => r.transactionCurrencyBalance !== 0,
    );

    console.log("\n--- Non-Zero Balance Counts ---");
    console.log(`  Total records: ${records.length}`);
    console.log(`  Non-zero local currency balance: ${nonZeroLocal.length}`);
    console.log(
      `  Non-zero transaction currency balance: ${nonZeroTxn.length}`,
    );

    // --- Period breakdown for first non-zero record ---
    console.log("\n--- Period-Level Breakdown (first non-zero record) ---");
    const firstNonZeroIdx = rows1.findIndex((row, idx) => {
      const row2 = rows2[idx] || {};
      let total = parseFloat(row.HSLVT) || 0;
      for (const f of ["HSL01", "HSL02", "HSL03", "HSL04", "HSL05", "HSL06"]) {
        total += parseFloat(row[f]) || 0;
      }
      for (const f of ["HSL07", "HSL08", "HSL09", "HSL10", "HSL11", "HSL12"]) {
        total += parseFloat(row2[f]) || 0;
      }
      return total !== 0;
    });

    if (firstNonZeroIdx >= 0) {
      const row = rows1[firstNonZeroIdx];
      const row2 = rows2[firstNonZeroIdx] || {};
      console.log(`  Company: ${row.RBUKRS}`);
      console.log(`  Account: ${row.RACCT}`);
      console.log(`  Year: ${row.RYEAR}`);
      console.log(`  HSLVT (carry-forward): ${row.HSLVT}`);
      for (const f of ["HSL01", "HSL02", "HSL03", "HSL04", "HSL05", "HSL06"]) {
        const val = parseFloat(row[f]) || 0;
        if (val !== 0) console.log(`  ${f}: ${row[f]}`);
      }
      for (const f of ["HSL07", "HSL08", "HSL09", "HSL10", "HSL11", "HSL12"]) {
        const val = parseFloat(row2[f]) || 0;
        if (val !== 0) console.log(`  ${f}: ${row2[f]}`);
      }
    }

    // Data distribution
    const companies = [...new Set(records.map((r) => r.companyCode))];
    const years = [...new Set(records.map((r) => r.fiscalYear))];

    console.log("\n--- Data Distribution ---");
    console.log(`  Company codes: ${companies.join(", ")}`);
    console.log(`  Fiscal years: ${years.join(", ")}`);

    console.log("\n--- Conclusion ---");
    console.log("  Formula: HSLVT + HSL01 + ... + HSL12");
    console.log(
      `  Data availability: ${nonZeroLocal.length > 0 ? "CONFIRMED" : "NO NON-ZERO RECORDS FOUND"}`,
    );

    await sap.disconnect();
    console.log("\nDisconnected. GL balance validation complete.");
  } catch (err) {
    console.error("ERROR:", err.message || err);
  }
}

testGLBalances();
