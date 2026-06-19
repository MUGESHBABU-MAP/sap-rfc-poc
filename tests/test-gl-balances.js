/**
 * Phase 2 - GL Balance Validation (FAGLB03 Reproduction)
 *
 * Run: node tests/test-gl-balances.js
 *
 * Fixed: Uses single-row AND format for WHERE clause
 * and smaller batches to stay within RFC width limits.
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

    // Single-row AND format (fixes dynamic parsing error)
    const where = ["RRCTY = '0' AND RVERS = '001'"];

    // Batch 1: Identity + HSLVT + HSL01-06
    console.log("Reading Batch 1: Identity + HSLVT + HSL01-06...");
    const result1 = await sap.readTable(
      "FAGLFLEXT",
      [
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
      ],
      { where, rowCount: 100 },
    );
    const rows1 = parseRows(result1);
    console.log(`  ${rows1.length} rows returned.`);

    // Batch 2: Identity keys + HSL07-12
    console.log("Reading Batch 2: Identity + HSL07-12...");
    const result2 = await sap.readTable(
      "FAGLFLEXT",
      [
        "RBUKRS",
        "RACCT",
        "RYEAR",
        "HSL07",
        "HSL08",
        "HSL09",
        "HSL10",
        "HSL11",
        "HSL12",
      ],
      { where, rowCount: 100 },
    );
    const rows2 = parseRows(result2);
    console.log(`  ${rows2.length} rows returned.`);

    // Batch 3: Transaction currency (optional)
    let rows3 = [];
    let rows4 = [];
    try {
      console.log("Reading Batch 3: TSLVT + TSL01-06...");
      const result3 = await sap.readTable(
        "FAGLFLEXT",
        [
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
        ],
        { where, rowCount: 100 },
      );
      rows3 = parseRows(result3);
      console.log(`  ${rows3.length} rows returned.`);

      console.log("Reading Batch 4: TSL07-12...");
      const result4 = await sap.readTable(
        "FAGLFLEXT",
        [
          "RBUKRS",
          "RACCT",
          "RYEAR",
          "TSL07",
          "TSL08",
          "TSL09",
          "TSL10",
          "TSL11",
          "TSL12",
        ],
        { where, rowCount: 100 },
      );
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
      let hslTotal = parseFloat(row.HSLVT) || 0;
      for (const f of ["HSL01", "HSL02", "HSL03", "HSL04", "HSL05", "HSL06"]) {
        hslTotal += parseFloat(row[f]) || 0;
      }
      for (const f of ["HSL07", "HSL08", "HSL09", "HSL10", "HSL11", "HSL12"]) {
        hslTotal += parseFloat(row2[f]) || 0;
      }

      // Transaction currency: TSLVT + TSL01..TSL12
      let tslTotal = parseFloat(row3.TSLVT) || 0;
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

    // --- Results ---
    console.log("--- Sample GLBalanceRecords (first 10) ---");
    console.log(JSON.stringify(records.slice(0, 10), null, 2));

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

    // Period breakdown for first non-zero record
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
      console.log("\n--- Period Breakdown (first non-zero record) ---");
      console.log(
        `  Company: ${row.RBUKRS} | Account: ${row.RACCT} | Year: ${row.RYEAR}`,
      );
      console.log(`  HSLVT (carry-forward): ${row.HSLVT}`);
      for (const f of ["HSL01", "HSL02", "HSL03", "HSL04", "HSL05", "HSL06"]) {
        if ((parseFloat(row[f]) || 0) !== 0) console.log(`  ${f}: ${row[f]}`);
      }
      for (const f of ["HSL07", "HSL08", "HSL09", "HSL10", "HSL11", "HSL12"]) {
        if ((parseFloat(row2[f]) || 0) !== 0) console.log(`  ${f}: ${row2[f]}`);
      }
    }

    const companies = [...new Set(records.map((r) => r.companyCode))];
    const years = [...new Set(records.map((r) => r.fiscalYear))];
    console.log("\n--- Data Distribution ---");
    console.log(`  Company codes: ${companies.join(", ")}`);
    console.log(`  Fiscal years: ${years.join(", ")}`);

    console.log("\n--- Conclusion ---");
    console.log(
      `  Data availability: ${nonZeroLocal.length > 0 ? "CONFIRMED" : "NO NON-ZERO RECORDS"}`,
    );

    await sap.disconnect();
    console.log("\nDisconnected.");
  } catch (err) {
    console.error("ERROR:", err.message || err);
  }
}

testGLBalances();
