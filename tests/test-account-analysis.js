/**
 * Phase 3.18B - Test Account Analysis
 *
 * Run: node tests/test-account-analysis.js
 *
 * Connects to SAP, analyzes GL accounts for company code 1000,
 * generates Account_Analysis.xlsx, and prints diagnostics.
 *
 * ANALYSIS ONLY - No changes to reconciliation or workbook generation.
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const path = require("path");
const fs = require("fs");
const ExcelJS = require("exceljs");

const SAPService = require("../services/sap.service");
const AccountAnalysisService = require("../services/account-analysis.service");

const OUTPUT_DIR = path.resolve(__dirname, "../output");
const COMPANY_CODE = process.env.TEST_COMPANY || "1000";
const FISCAL_YEAR = process.env.TEST_FISCAL_YEAR || "2026";

async function testAccountAnalysis() {
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
      "║   Phase 3.18B - Account Analysis & Recommendation           ║",
    );
    console.log(
      "║   ANALYSIS ONLY - No reconciliation changes                 ║",
    );
    console.log(
      "╚══════════════════════════════════════════════════════════════╝\n",
    );
    console.log(`  Company Code: ${COMPANY_CODE}`);
    console.log(`  Fiscal Year: ${FISCAL_YEAR}\n`);

    const analysisService = new AccountAnalysisService(sap);

    // Run analysis
    console.log("Step 1: Analyzing accounts...");
    const startTime = Date.now();
    const result = await analysisService.analyzeAccounts(
      COMPANY_CODE,
      FISCAL_YEAR,
    );
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`  Time: ${elapsed}s\n`);

    // Print summary
    console.log(
      "══════════════════════════════════════════════════════════════",
    );
    console.log("  Account Analysis");
    console.log(`  Company Code: ${COMPANY_CODE}  Fiscal Year: ${FISCAL_YEAR}`);
    console.log(
      "══════════════════════════════════════════════════════════════\n",
    );
    console.log(
      `  Total Accounts:                      ${result.totalAccounts}`,
    );
    console.log(
      `  Accounts With Balances:              ${result.accountsWithBalances}`,
    );
    console.log(
      `  Accounts Without Balances:           ${result.accountsWithoutBalances}`,
    );
    console.log(
      `  Current Inventory Accounts:          ${result.currentInventoryAccounts}`,
    );
    console.log(
      `  Current Inventory Accounts Active:   ${result.currentInventoryAccountsActive}`,
    );
    console.log(
      `  Potential Inventory Accounts:        ${result.candidateInventoryAccounts}`,
    );

    // Top 20 by balance
    const withBalances = result.accountDetails
      .filter((a) => a.hasBalance)
      .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));

    const top20 = withBalances.slice(0, 20);
    console.log("\n  Top 20 Accounts By Balance:");
    console.log("  " + "-".repeat(70));
    console.log(
      `  ${"Account".padEnd(14)}${"Description".padEnd(38)}${"Balance".padStart(18)}`,
    );
    console.log("  " + "-".repeat(70));
    for (let i = 0; i < top20.length; i++) {
      const a = top20[i];
      const desc = a.description.substring(0, 36).padEnd(38);
      const bal = a.balance
        .toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
        .padStart(18);
      console.log(`  ${a.account.padEnd(14)}${desc}${bal}`);
    }

    // Current inventory accounts detail
    const currentInv = result.accountDetails.filter(
      (a) => a.isCurrentInventoryAccount,
    );
    if (currentInv.length > 0) {
      console.log("\n\n  Current Inventory Accounts:");
      console.log("  " + "-".repeat(70));
      console.log(
        `  ${"Account".padEnd(14)}${"Description".padEnd(38)}${"Balance".padStart(14)}  Active`,
      );
      console.log("  " + "-".repeat(70));
      for (let i = 0; i < currentInv.length; i++) {
        const a = currentInv[i];
        const desc = a.description.substring(0, 36).padEnd(38);
        const bal = a.balance
          .toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })
          .padStart(14);
        const active = a.hasBalance ? "Y" : "N";
        console.log(`  ${a.account.padEnd(14)}${desc}${bal}  ${active}`);
      }
    }

    // Potential inventory accounts
    const potential = result.accountDetails.filter(
      (a) => a.recommendation === "POTENTIAL_INVENTORY",
    );
    if (potential.length > 0) {
      console.log(
        "\n\n  Potential Inventory Accounts (keyword match + has balance):",
      );
      console.log("  " + "-".repeat(80));
      console.log(
        `  ${"Account".padEnd(14)}${"Description".padEnd(38)}${"Balance".padStart(14)}  Keyword`,
      );
      console.log("  " + "-".repeat(80));
      for (let i = 0; i < potential.length; i++) {
        const a = potential[i];
        const desc = a.description.substring(0, 36).padEnd(38);
        const bal = a.balance
          .toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })
          .padStart(14);
        console.log(
          `  ${a.account.padEnd(14)}${desc}${bal}  ${a.keywordMatched}`,
        );
      }
    }

    // Step 2: Generate Account_Analysis.xlsx
    console.log("\n\nStep 2: Generating Account_Analysis.xlsx...");
    await generateAnalysisWorkbook(result, COMPANY_CODE, FISCAL_YEAR);

    // Step 3: Validation
    console.log(
      "\n══════════════════════════════════════════════════════════════",
    );
    console.log("  VALIDATION");
    console.log(
      "══════════════════════════════════════════════════════════════\n",
    );

    const checks = [
      { name: "Accounts retrieved from SAP", pass: result.totalAccounts > 0 },
      {
        name: "Some accounts have balances",
        pass: result.accountsWithBalances > 0,
      },
      {
        name: "Current inventory accounts found",
        pass: result.currentInventoryAccounts > 0,
      },
      {
        name: "Current inventory accounts exist in SAP",
        pass: currentInv.length === result.currentInventoryAccounts,
      },
      {
        name: "Current inventory accounts have balances",
        pass: result.currentInventoryAccountsActive > 0,
      },
      {
        name: "Account_Analysis.xlsx generated",
        pass: fs.existsSync(path.join(OUTPUT_DIR, "Account_Analysis.xlsx")),
      },
    ];

    let allPass = true;
    for (let i = 0; i < checks.length; i++) {
      const c = checks[i];
      console.log(`  ${c.pass ? "✓" : "✗"} ${c.name}`);
      if (!c.pass) allPass = false;
    }

    console.log(`\n  STATUS: ${allPass ? "ALL PASS ✓" : "ISSUES FOUND ✗"}`);
    console.log(`\n  Workbook: output/Account_Analysis.xlsx`);

    await sap.disconnect();
    console.log("\nDone.");
  } catch (err) {
    console.error("ERROR:", err.message || err);
    if (err.stack) console.error(err.stack);
  }
}

/**
 * Generate Account_Analysis.xlsx workbook.
 */
async function generateAnalysisWorkbook(result, companyCode, fiscalYear) {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const filePath = path.join(OUTPUT_DIR, "Account_Analysis.xlsx");
  const workbook = new ExcelJS.Workbook();

  // Sheet 1: All Accounts
  const sheet1 = workbook.addWorksheet("All Accounts");
  sheet1.columns = [
    { header: "Account", key: "account", width: 16 },
    { header: "Description", key: "description", width: 45 },
    { header: "Has Balance", key: "hasBalance", width: 12 },
    { header: "Balance", key: "balance", width: 20 },
    {
      header: "Current Inventory Account",
      key: "isCurrentInventoryAccount",
      width: 24,
    },
    { header: "Recommendation", key: "recommendation", width: 22 },
  ];
  for (let i = 0; i < result.accountDetails.length; i++) {
    const a = result.accountDetails[i];
    sheet1.addRow({
      account: a.account,
      description: a.description,
      hasBalance: a.hasBalance ? "Y" : "N",
      balance: a.balance,
      isCurrentInventoryAccount: a.isCurrentInventoryAccount ? "Y" : "N",
      recommendation: a.recommendation,
    });
  }

  // Sheet 2: Accounts With Balances
  const sheet2 = workbook.addWorksheet("Accounts With Balances");
  sheet2.columns = [
    { header: "Account", key: "account", width: 16 },
    { header: "Description", key: "description", width: 45 },
    { header: "Balance", key: "balance", width: 20 },
    { header: "Current Inventory", key: "isInv", width: 16 },
    { header: "Recommendation", key: "recommendation", width: 22 },
  ];
  const withBal = result.accountDetails
    .filter((a) => a.hasBalance)
    .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
  for (let i = 0; i < withBal.length; i++) {
    const a = withBal[i];
    sheet2.addRow({
      account: a.account,
      description: a.description,
      balance: a.balance,
      isInv: a.isCurrentInventoryAccount ? "Y" : "N",
      recommendation: a.recommendation,
    });
  }

  // Sheet 3: Current Inventory Accounts
  const sheet3 = workbook.addWorksheet("Current Inventory Accounts");
  sheet3.columns = [
    { header: "Account", key: "account", width: 16 },
    { header: "Description", key: "description", width: 45 },
    { header: "Balance", key: "balance", width: 20 },
    { header: "Active This Year", key: "active", width: 16 },
  ];
  const currentInv = result.accountDetails.filter(
    (a) => a.isCurrentInventoryAccount,
  );
  for (let i = 0; i < currentInv.length; i++) {
    const a = currentInv[i];
    sheet3.addRow({
      account: a.account,
      description: a.description,
      balance: a.balance,
      active: a.hasBalance ? "Y" : "N",
    });
  }

  // Sheet 4: Potential Inventory Accounts
  const sheet4 = workbook.addWorksheet("Potential Inventory Accounts");
  sheet4.columns = [
    { header: "Account", key: "account", width: 16 },
    { header: "Description", key: "description", width: 45 },
    { header: "Balance", key: "balance", width: 20 },
    { header: "Matched Keyword", key: "keyword", width: 20 },
  ];
  const potential = result.accountDetails.filter(
    (a) => a.recommendation === "POTENTIAL_INVENTORY",
  );
  for (let i = 0; i < potential.length; i++) {
    const a = potential[i];
    sheet4.addRow({
      account: a.account,
      description: a.description,
      balance: a.balance,
      keyword: a.keywordMatched,
    });
  }

  // Sheet 5: Executive Summary
  const sheet5 = workbook.addWorksheet("Executive Summary");
  sheet5.columns = [
    { header: "Metric", key: "metric", width: 40 },
    { header: "Value", key: "value", width: 20 },
  ];
  const summaryRows = [
    { metric: "Company Code", value: companyCode },
    { metric: "Fiscal Year", value: fiscalYear },
    { metric: "Generated At", value: new Date().toISOString() },
    { metric: "", value: "" },
    { metric: "Total Accounts", value: String(result.totalAccounts) },
    {
      metric: "Accounts With Balances",
      value: String(result.accountsWithBalances),
    },
    {
      metric: "Accounts Without Balances",
      value: String(result.accountsWithoutBalances),
    },
    {
      metric: "Current Inventory Accounts",
      value: String(result.currentInventoryAccounts),
    },
    {
      metric: "Current Inventory Accounts With Activity",
      value: String(result.currentInventoryAccountsActive),
    },
    {
      metric: "Potential Inventory Accounts",
      value: String(result.candidateInventoryAccounts),
    },
    { metric: "", value: "" },
    { metric: "--- Top 20 Accounts By Balance ---", value: "" },
  ];

  const top20 = withBal.slice(0, 20);
  for (let i = 0; i < top20.length; i++) {
    summaryRows.push({
      metric: `${top20[i].account} - ${top20[i].description.substring(0, 30)}`,
      value: String(top20[i].balance),
    });
  }

  for (let i = 0; i < summaryRows.length; i++) {
    sheet5.addRow(summaryRows[i]);
  }

  await workbook.xlsx.writeFile(filePath);
  const fileSize = fs.statSync(filePath).size;
  console.log(`  File: ${filePath}`);
  console.log(`  Size: ${(fileSize / 1024).toFixed(1)} KB`);
  console.log(`  Sheets: 5`);
}

testAccountAnalysis();
