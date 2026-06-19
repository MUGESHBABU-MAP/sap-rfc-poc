/**
 * Phase 3.5 - Inventory Account Discovery
 *
 * Run: node tests/test-inventory-accounts.js
 *
 * Purpose:
 *   Identify which GL accounts represent inventory by loading the full
 *   GL dataset, grouping by companyCode + glAccount, calculating
 *   cumulative balance, and sorting by ABS(balance) descending.
 *
 * Output:
 *   - Console: Top 200 GL accounts
 *   - CSV: output/top-gl-accounts.csv
 *
 * Finance SME will use this to identify:
 *   - Raw Material Inventory Accounts
 *   - FG Inventory Accounts
 *   - WIP Accounts
 *   - Inventory Clearing Accounts
 *
 * These accounts will populate config/reconciliation.config.js
 *
 * Performance:
 *   - Single-pass Map aggregation
 *   - No spread operators on large arrays
 *   - Iterative sort on aggregated results (small array)
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const fs = require("fs");
const path = require("path");
const SAPService = require("../services/sap.service");
const GLDatasetService = require("../services/gl-dataset.service");

async function testInventoryAccounts() {
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

    const glService = new GLDatasetService(sap);

    // Step 1: Load GL dataset
    console.log("Loading GL dataset (RRCTY=0, RVERS=001)...");
    const glRecords = await glService.getGLBalances();
    console.log(`  GL records loaded: ${glRecords.length}\n`);

    // Step 2: Group by companyCode + glAccount, sum cumulativeBalance
    console.log("Aggregating by companyCode + glAccount...");
    const accountMap = new Map();

    for (let i = 0; i < glRecords.length; i++) {
      const r = glRecords[i];
      const key = `${r.companyCode}|${r.glAccount}`;

      if (!accountMap.has(key)) {
        accountMap.set(key, {
          companyCode: r.companyCode,
          glAccount: r.glAccount,
          balance: 0,
          debitBalance: 0,
          creditBalance: 0,
          recordCount: 0,
        });
      }

      const entry = accountMap.get(key);
      entry.balance += r.cumulativeBalance || 0;
      entry.recordCount += 1;

      if (r.debitCreditIndicator === "S") {
        entry.debitBalance += r.cumulativeBalance || 0;
      } else {
        entry.creditBalance += r.cumulativeBalance || 0;
      }
    }

    console.log(`  Unique accounts found: ${accountMap.size}\n`);

    // Step 3: Convert to array and sort by ABS(balance) descending
    const accounts = [];
    for (const entry of accountMap.values()) {
      entry.balance = Math.round(entry.balance * 100) / 100;
      entry.debitBalance = Math.round(entry.debitBalance * 100) / 100;
      entry.creditBalance = Math.round(entry.creditBalance * 100) / 100;
      accounts.push(entry);
    }

    accounts.sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));

    // Step 4: Print top 200
    const top = Math.min(200, accounts.length);
    console.log(`=== Top ${top} GL Accounts by ABS(Balance) ===\n`);

    console.log(
      "#".padEnd(5) +
        "Company".padEnd(10) +
        "Account".padEnd(14) +
        "Balance".padEnd(22) +
        "Debit".padEnd(20) +
        "Credit".padEnd(20) +
        "Records",
    );
    console.log("-".repeat(95));

    for (let i = 0; i < top; i++) {
      const a = accounts[i];
      console.log(
        String(i + 1).padEnd(5) +
          a.companyCode.padEnd(10) +
          a.glAccount.padEnd(14) +
          String(a.balance).padEnd(22) +
          String(a.debitBalance).padEnd(20) +
          String(a.creditBalance).padEnd(20) +
          String(a.recordCount),
      );
    }

    // Step 5: Export CSV
    const outputDir = path.resolve(__dirname, "../output");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const csvPath = path.join(outputDir, "top-gl-accounts.csv");
    const csvHeader =
      "companyCode,glAccount,balance,debitBalance,creditBalance,debitCreditIndicator,recordCount\n";
    let csvRows = csvHeader;

    for (let i = 0; i < top; i++) {
      const a = accounts[i];
      // debitCreditIndicator: net indicator based on balance sign
      const indicator = a.balance >= 0 ? "S" : "H";
      csvRows += `${a.companyCode},${a.glAccount},${a.balance},${a.debitBalance},${a.creditBalance},${indicator},${a.recordCount}\n`;
    }

    fs.writeFileSync(csvPath, csvRows, "utf8");
    console.log(`\nCSV exported: ${csvPath}`);
    console.log(`  Rows: ${top}`);

    // Step 6: Quick stats
    console.log("\n=== Quick Stats ===");
    let positiveCount = 0;
    let negativeCount = 0;
    let zeroCount = 0;
    for (let i = 0; i < accounts.length; i++) {
      if (accounts[i].balance > 0) positiveCount++;
      else if (accounts[i].balance < 0) negativeCount++;
      else zeroCount++;
    }
    console.log(`  Positive balance accounts: ${positiveCount}`);
    console.log(`  Negative balance accounts: ${negativeCount}`);
    console.log(`  Zero balance accounts: ${zeroCount}`);

    console.log("\n--- Next Step ---");
    console.log("  Send output/top-gl-accounts.csv to Finance SME.");
    console.log("  They will identify inventory-related accounts.");
    console.log(
      "  Update config/reconciliation.config.js with confirmed accounts.",
    );

    await sap.disconnect();
    console.log("\nDisconnected.");
  } catch (err) {
    console.error("ERROR:", err.message || err);
  }
}

testInventoryAccounts();
