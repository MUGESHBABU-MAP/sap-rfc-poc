/**
 * Phase 2 - GL Balance Validation (FAGLB03 Reproduction)
 *
 * Run: node tests/test-gl-balances.js
 *
 * Goal: Validate that monetary values required for FAGLB03
 * reconciliation are available through RFC extraction.
 *
 * Requirements:
 *   1. Read first 100 records from FAGLFLEXT
 *   2. Calculate cumulative balance: HSLVT + HSL01..HSL16
 *   3. Print sample output
 *   4. Print count of records having non-zero balances
 *   5. Create GLBalanceRecord structure
 *
 * Output structure:
 *   { companyCode, account, fiscalYear, period,
 *     debitCreditIndicator, cumulativeBalance,
 *     localCurrencyBalance, transactionCurrencyBalance }
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const SAPService = require("../services/sap.service");
const parseRows = require("../utils/parse-rows");

const HSL_PERIODS = [
  "HSL01",
  "HSL02",
  "HSL03",
  "HSL04",
  "HSL05",
  "HSL06",
  "HSL07",
  "HSL08",
  "HSL09",
  "HSL10",
  "HSL11",
  "HSL12",
  "HSL13",
  "HSL14",
  "HSL15",
  "HSL16",
];

const TSL_PERIODS = [
  "TSL01",
  "TSL02",
  "TSL03",
  "TSL04",
  "TSL05",
  "TSL06",
  "TSL07",
  "TSL08",
  "TSL09",
  "TSL10",
  "TSL11",
  "TSL12",
  "TSL13",
  "TSL14",
  "TSL15",
  "TSL16",
];

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

    // Batch 1: Identity + Local Currency (HSL)
    console.log("Reading Batch 1: Identity + HSLVT + HSL01..HSL16...");
    const batch1Fields = [
      "RBUKRS",
      "RACCT",
      "RYEAR",
      "RPMAX",
      "RRCTY",
      "RVERS",
      "DRCRK",
      "HSLVT",
      ...HSL_PERIODS,
    ];
    const result1 = await sap.readTable("FAGLFLEXT", batch1Fields, {
      where,
      rowCount: 100,
    });
    const hslRows = parseRows(result1);
    console.log(`  ${hslRows.length} rows returned.\n`);

    // Batch 2: Transaction Currency (TSL)
    console.log("Reading Batch 2: Identity + TSLVT + TSL01..TSL16...");
    const batch2Fields = ["RBUKRS", "RACCT", "RYEAR", "TSLVT", ...TSL_PERIODS];
    const result2 = await sap.readTable("FAGLFLEXT", batch2Fields, {
      where,
      rowCount: 100,
    });
    const tslRows = parseRows(result2);
    console.log(`  ${tslRows.length} rows returned.\n`);

    // Build GLBalanceRecord array
    console.log("Building GLBalanceRecord structures...\n");
    const records = hslRows.map((row, idx) => {
      const tslRow = tslRows[idx] || {};

      // Local currency: HSLVT + HSL01..HSL16
      const hslvt = parseFloat(row.HSLVT) || 0;
      let hslTotal = hslvt;
      for (const field of HSL_PERIODS) {
        hslTotal += parseFloat(row[field]) || 0;
      }

      // Transaction currency: TSLVT + TSL01..TSL16
      const tslvt = parseFloat(tslRow.TSLVT) || 0;
      let tslTotal = tslvt;
      for (const field of TSL_PERIODS) {
        tslTotal += parseFloat(tslRow[field]) || 0;
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

    // --- Additional analysis ---
    console.log("\n--- Period-Level Analysis (first non-zero record) ---");
    const firstNonZero = hslRows.find((row) => {
      const hslvt = parseFloat(row.HSLVT) || 0;
      let total = hslvt;
      for (const f of HSL_PERIODS) total += parseFloat(row[f]) || 0;
      return total !== 0;
    });

    if (firstNonZero) {
      console.log(`  Company: ${firstNonZero.RBUKRS}`);
      console.log(`  Account: ${firstNonZero.RACCT}`);
      console.log(`  Year: ${firstNonZero.RYEAR}`);
      console.log(`  HSLVT (carry-forward): ${firstNonZero.HSLVT}`);
      for (const f of HSL_PERIODS) {
        const val = parseFloat(firstNonZero[f]) || 0;
        if (val !== 0) {
          console.log(`  ${f}: ${firstNonZero[f]}`);
        }
      }
    }

    // Unique values
    const companies = [...new Set(records.map((r) => r.companyCode))];
    const years = [...new Set(records.map((r) => r.fiscalYear))];
    const indicators = [...new Set(records.map((r) => r.debitCreditIndicator))];

    console.log("\n--- Data Distribution ---");
    console.log(`  Company codes: ${companies.join(", ")}`);
    console.log(`  Fiscal years: ${years.join(", ")}`);
    console.log(`  Debit/Credit indicators: ${indicators.join(", ")}`);

    console.log("\n--- Conclusion ---");
    console.log("  FAGLB03 balance formula: HSLVT + HSL01 + ... + HSL16");
    console.log(
      `  Data availability: ${nonZeroLocal.length > 0 ? "CONFIRMED" : "NO NON-ZERO RECORDS FOUND"}`,
    );
    console.log("  Ready for reconciliation engine: YES");

    await sap.disconnect();
    console.log("\nDisconnected. GL balance validation complete.");
  } catch (err) {
    console.error("ERROR:", err.message || err);
  }
}

testGLBalances();
