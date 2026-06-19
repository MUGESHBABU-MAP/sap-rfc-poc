/**
 * Phase 2 - Test GL Dataset Service against live SAP
 *
 * Run: node tests/test-gl-dataset.js
 *
 * Uses the fixed GLDatasetService that reads in small batches
 * and only uses HSL01-12 (no special periods 13-16).
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const SAPService = require("../services/sap.service");
const GLDatasetService = require("../services/gl-dataset.service");

async function testGLDataset() {
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

    const service = new GLDatasetService(sap);

    console.log("=== Test 1: getGLBalances() - No additional filters ===");
    console.log("(Auto-filtered: RRCTY=0, RVERS=001)");
    console.log("(Using HSL01-12 in small batches)\n");

    const records = await service.getGLBalances();

    console.log(`Records returned: ${records.length}`);

    if (records.length > 0) {
      // Validate record structure
      const expectedFields = [
        "companyCode",
        "glAccount",
        "fiscalYear",
        "period",
        "debitCreditIndicator",
        "cumulativeBalance",
        "localCurrencyBalance",
        "transactionCurrencyBalance",
      ];

      const sample = records[0];
      console.log("\n--- Field Validation ---");
      let allPresent = true;
      for (const field of expectedFields) {
        const present = field in sample;
        if (!present) allPresent = false;
        console.log(`  ${field}: ${present ? "✓" : "✗ MISSING"}`);
      }
      console.log(`\nAll fields present: ${allPresent ? "YES" : "NO"}`);

      // Sample records
      console.log("\n--- Sample Records (first 5) ---");
      console.log(JSON.stringify(records.slice(0, 5), null, 2));

      // Stats
      const nonZero = records.filter((r) => r.cumulativeBalance !== 0);
      const debitRecords = records.filter(
        (r) => r.debitCreditIndicator === "S",
      );
      const creditRecords = records.filter(
        (r) => r.debitCreditIndicator === "H",
      );
      const companies = [...new Set(records.map((r) => r.companyCode))];
      const years = [...new Set(records.map((r) => r.fiscalYear))];

      console.log("\n--- Statistics ---");
      console.log(`  Total records: ${records.length}`);
      console.log(`  Non-zero balance records: ${nonZero.length}`);
      console.log(`  Debit records (S): ${debitRecords.length}`);
      console.log(`  Credit records (H): ${creditRecords.length}`);
      console.log(`  Unique company codes: ${companies.join(", ")}`);
      console.log(`  Fiscal years: ${years.join(", ")}`);

      // Balance range
      const balances = records.map((r) => r.cumulativeBalance);
      const minBal = Math.min(...balances);
      const maxBal = Math.max(...balances);
      console.log(`\n--- Balance Range ---`);
      console.log(`  Min: ${minBal}`);
      console.log(`  Max: ${maxBal}`);
    }

    // Test with filter
    if (records.length > 0) {
      const testCompany = records[0].companyCode;
      console.log(
        `\n\n=== Test 2: getGLBalances({ companyCode: '${testCompany}' }) ===`,
      );
      const filtered = await service.getGLBalances({
        companyCode: testCompany,
      });
      console.log(`Records returned: ${filtered.length}`);
    }

    await sap.disconnect();
    console.log("\nDisconnected. Phase 2 GL dataset validation complete.");
  } catch (err) {
    console.error("ERROR:", err.message || err);
  }
}

testGLDataset();
