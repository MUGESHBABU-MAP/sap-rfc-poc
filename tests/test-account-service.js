/**
 * Phase 3.18A - Test Account Service
 *
 * Run: node tests/test-account-service.js
 *
 * Connects to SAP, reads GL accounts for company code 1000,
 * exports Account_Discovery.xlsx, and prints diagnostics.
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const path = require("path");
const fs = require("fs");
const ExcelJS = require("exceljs");

const SAPService = require("../services/sap.service");
const AccountService = require("../services/account.service");

const OUTPUT_DIR = path.resolve(__dirname, "../output");
const COMPANY_CODE = process.env.TEST_COMPANY || "1000";

async function testAccountService() {
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
    console.log(
      "╔══════════════════════════════════════════════════════════════╗",
    );
    console.log(
      "║   Phase 3.18A - Account Discovery Service Test              ║",
    );
    console.log(
      "╚══════════════════════════════════════════════════════════════╝\n",
    );
    console.log(`  Company Code: ${COMPANY_CODE}\n`);

    const accountService = new AccountService(sap);

    // Step 1: Get all accounts
    console.log("Step 1: Fetching GL accounts...");
    const startTime = Date.now();
    const accounts = await accountService.getAccounts({
      companyCode: COMPANY_CODE,
    });
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`  Time: ${elapsed}s\n`);

    // Step 2: Diagnostics
    console.log(
      "═══════════════════════════════════════════════════════════════",
    );
    console.log("  RESULTS");
    console.log(
      "═══════════════════════════════════════════════════════════════\n",
    );
    console.log(`  Total Accounts: ${accounts.length}`);
    console.log(`  Unique Accounts: ${accounts.length} (deduplicated)`);

    // Sample records
    const sampleCount = Math.min(20, accounts.length);
    console.log(`\n  Sample Records (first ${sampleCount}):`);
    console.log("  " + "-".repeat(60));
    console.log(`  ${"Account".padEnd(14)}${"Description"}`);
    console.log("  " + "-".repeat(60));
    for (let i = 0; i < sampleCount; i++) {
      const a = accounts[i];
      console.log(`  ${a.account.padEnd(14)}${a.description.substring(0, 45)}`);
    }
    if (accounts.length > sampleCount) {
      console.log(`  ... and ${accounts.length - sampleCount} more`);
    }

    // Step 3: Check if current hardcoded accounts are present
    const accountMaster = require("../config/inventory-account-master.json");
    const hardcodedAccounts =
      (accountMaster[COMPANY_CODE] || {}).inventoryAccounts || [];
    if (hardcodedAccounts.length > 0) {
      console.log(
        `\n  Current Hardcoded Accounts (inventory-account-master.json):`,
      );
      console.log("  " + "-".repeat(60));
      const accountSet = new Set(accounts.map((a) => a.account));
      for (let i = 0; i < hardcodedAccounts.length; i++) {
        const acct = hardcodedAccounts[i];
        const found = accountSet.has(acct);
        const desc = accounts.find((a) => a.account === acct);
        const descText = desc ? desc.description : "(not found in discovery)";
        console.log(`  ${found ? "✓" : "✗"} ${acct}  ${descText}`);
      }
    }

    // Step 4: Export Account_Discovery.xlsx
    console.log("\n\nStep 2: Generating Account_Discovery.xlsx...");
    await exportDiscoveryWorkbook(accounts, COMPANY_CODE);

    // Step 5: Validation
    console.log(
      "\n═══════════════════════════════════════════════════════════════",
    );
    console.log("  VALIDATION");
    console.log(
      "═══════════════════════════════════════════════════════════════\n",
    );

    const checks = [
      { name: "Accounts retrieved", pass: accounts.length > 0 },
      {
        name: "Accounts deduplicated",
        pass: new Set(accounts.map((a) => a.account)).size === accounts.length,
      },
      {
        name: "Account has number",
        pass: accounts.length > 0 && accounts[0].account.length > 0,
      },
      {
        name: "Account has description",
        pass: accounts.some((a) => a.description.length > 0),
      },
      { name: "Sorted by account number", pass: isSorted(accounts) },
    ];

    let allPass = true;
    for (let i = 0; i < checks.length; i++) {
      const c = checks[i];
      console.log(`  ${c.pass ? "✓" : "✗"} ${c.name}`);
      if (!c.pass) allPass = false;
    }

    console.log(`\n  STATUS: ${allPass ? "ALL PASS ✓" : "ISSUES FOUND ✗"}`);

    await sap.disconnect();
    console.log("\nDone.");
  } catch (err) {
    console.error("ERROR:", err.message || err);
    if (err.stack) console.error(err.stack);
  }
}

/**
 * Export Account_Discovery.xlsx with Accounts and Unique Accounts sheets.
 */
async function exportDiscoveryWorkbook(accounts, companyCode) {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const filePath = path.join(OUTPUT_DIR, "Account_Discovery.xlsx");
  const workbook = new ExcelJS.Workbook();

  // Sheet 1: Accounts (full list)
  const sheet1 = workbook.addWorksheet("Accounts");
  sheet1.columns = [
    { header: "Account", key: "account", width: 16 },
    { header: "Description", key: "description", width: 50 },
    { header: "Short Description", key: "shortDescription", width: 25 },
    { header: "Company Code", key: "companyCode", width: 14 },
  ];
  for (let i = 0; i < accounts.length; i++) {
    sheet1.addRow(accounts[i]);
  }

  // Sheet 2: Unique Accounts (same data since already deduplicated)
  const sheet2 = workbook.addWorksheet("Unique Accounts");
  sheet2.columns = [
    { header: "Account", key: "account", width: 16 },
    { header: "Description", key: "description", width: 50 },
  ];
  for (let i = 0; i < accounts.length; i++) {
    sheet2.addRow({
      account: accounts[i].account,
      description: accounts[i].description,
    });
  }

  await workbook.xlsx.writeFile(filePath);
  const fileSize = fs.statSync(filePath).size;
  console.log(`  File: ${filePath}`);
  console.log(`  Size: ${(fileSize / 1024).toFixed(1)} KB`);
  console.log(`  Sheets: 2 (Accounts, Unique Accounts)`);
  console.log(`  Records: ${accounts.length}`);
}

function isSorted(accounts) {
  for (let i = 1; i < accounts.length; i++) {
    if (accounts[i].account < accounts[i - 1].account) return false;
  }
  return true;
}

testAccountService();
