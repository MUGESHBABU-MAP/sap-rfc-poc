/**
 * Phase 2 - Test GL Summary Service against live SAP
 *
 * Run: node tests/test-gl-summary.js
 *
 * Tests:
 *   1. Fetches GL dataset
 *   2. Generates company-code-wise summary
 *   3. Validates summary structure
 *   4. Prints results
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const SAPService = require("../services/sap.service");
const GLDatasetService = require("../services/gl-dataset.service");
const GLSummaryService = require("../services/gl-summary.service");

async function testGLSummary() {
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

    const datasetService = new GLDatasetService(sap);
    const summaryService = new GLSummaryService();

    // Fetch GL records
    console.log("Fetching GL balance records (RRCTY=0, RVERS=001)...");
    const records = await datasetService.getGLBalances();
    console.log(`  ${records.length} GL records fetched.\n`);

    // Generate summary
    console.log("=== GL Summary (by Company Code) ===\n");
    const summary = summaryService.summarizeByCompanyCode(records);

    // Print as table
    console.log(
      "Company".padEnd(12) +
        "Accounts".padEnd(12) +
        "Debit Bal".padEnd(18) +
        "Credit Bal".padEnd(18) +
        "Total GL Balance".padEnd(20),
    );
    console.log("-".repeat(80));

    for (const s of summary) {
      console.log(
        s.companyCode.padEnd(12) +
          String(s.accountCount).padEnd(12) +
          String(s.debitBalance).padEnd(18) +
          String(s.creditBalance).padEnd(18) +
          String(s.totalGLBalance).padEnd(20),
      );
    }

    // Full JSON output
    console.log("\n--- Full Summary JSON ---");
    console.log(JSON.stringify(summary, null, 2));

    // Validate structure
    if (summary.length > 0) {
      const expectedFields = [
        "companyCode",
        "totalGLBalance",
        "accountCount",
        "debitBalance",
        "creditBalance",
      ];
      console.log("\n--- Field Validation ---");
      const sample = summary[0];
      for (const field of expectedFields) {
        console.log(`  ${field}: ${field in sample ? "✓" : "✗ MISSING"}`);
      }
    }

    await sap.disconnect();
    console.log("\nDisconnected. Phase 2 GL summary validation complete.");
  } catch (err) {
    console.error("ERROR:", err.message || err);
  }
}

testGLSummary();
