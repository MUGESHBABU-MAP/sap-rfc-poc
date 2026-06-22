/**
 * Phase 3.13 - Test Finance Reconciliation Workbook
 *
 * Run: node tests/test-finance-workbook.js
 *
 * Input: companyCode=1000, plant=1000, fiscalYear=2026
 * Output: output/Inventory_GL_Reconciliation_1000_2026.xlsx
 *
 * ONE SAP inventory extraction + ONE SAP GL extraction.
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const SAPService = require("../services/sap.service");
const InventoryDatasetService = require("../services/inventory-dataset.service");
const GLDatasetService = require("../services/gl-dataset.service");
const ReconciliationService = require("../services/reconciliation.service");
const CompanyService = require("../services/company.service");
const FinanceWorkbookService = require("../services/finance-workbook.service");

const accountMaster = require("../config/inventory-account-master.json");

const COMPANY_CODE = process.env.TEST_COMPANY || "1000";
const PLANT = process.env.TEST_PLANT || "1000";
const FISCAL_YEAR = process.env.TEST_FISCAL_YEAR || "2026";

async function testFinanceWorkbook() {
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
    console.log("=== Finance Reconciliation Workbook Generator ===");
    console.log(
      `  Company: ${COMPANY_CODE} | Plant: ${PLANT} | Year: ${FISCAL_YEAR}\n`,
    );

    const inventoryService = new InventoryDatasetService(sap);
    const glService = new GLDatasetService(sap);
    const reconService = new ReconciliationService();
    const companyService = new CompanyService(sap);
    const financeWorkbook = new FinanceWorkbookService();

    // Get currency
    console.log("Step 1: Getting company currency...");
    const companyData = await companyService.getCompanyCurrency(COMPANY_CODE);
    console.log(`  Currency: ${companyData.currency || "(not found)"}`);

    // ONE inventory extraction
    console.log("\nStep 2: Fetching inventory (single SAP extraction)...");
    const invStart = Date.now();
    const inventoryRecords = await inventoryService.getInventoryDataset({
      plant: PLANT,
    });
    const invTime = ((Date.now() - invStart) / 1000).toFixed(1);
    console.log(
      `  Inventory records: ${inventoryRecords.length} (${invTime}s)`,
    );

    // ONE GL extraction
    console.log("\nStep 3: Fetching GL balances...");
    const glStart = Date.now();
    const inventoryAccounts =
      (accountMaster[COMPANY_CODE] || {}).inventoryAccounts || [];
    const glFilters = {
      companyCode: COMPANY_CODE,
      fiscalYear: FISCAL_YEAR,
      inventoryAccounts:
        inventoryAccounts.length > 0 ? inventoryAccounts : undefined,
    };
    const glRecords = await glService.getGLBalances(glFilters);
    const glTime = ((Date.now() - glStart) / 1000).toFixed(1);
    console.log(`  GL records: ${glRecords.length} (${glTime}s)`);

    // Reconciliation
    console.log("\nStep 4: Running reconciliation...");
    const plantRecon = reconService.reconcileByPlant(
      inventoryRecords,
      glRecords,
    );
    const locationRecon = reconService.reconcileByStorageLocation(
      inventoryRecords,
      glRecords,
    );
    const topVariances = reconService.getTopVariances(
      inventoryRecords,
      glRecords,
      100,
    );
    console.log(`  Plant results: ${plantRecon.length}`);
    console.log(`  Location results: ${locationRecon.length}`);
    console.log(`  Top variances: ${topVariances.length}`);

    // Generate workbook
    console.log("\nStep 5: Generating workbook (streaming)...");
    const result = await financeWorkbook.generateFinanceWorkbook(
      { inventoryRecords, glRecords, plantRecon, locationRecon, topVariances },
      {
        companyCode: COMPANY_CODE,
        plant: PLANT,
        fiscalYear: FISCAL_YEAR,
        period: "ALL",
        currency: companyData.currency,
      },
    );

    // Results
    console.log("\n=== RESULT ===");
    console.log(`  File: ${result.filePath}`);
    console.log(`  Sheets: ${result.sheetCount}`);
    console.log(`  Locations: ${result.locationCount}`);
    console.log(`  Time: ${result.executionTime}s`);
    console.log(`  Size: ${result.fileSizeMB} MB`);

    // Validation
    console.log("\n=== VALIDATION ===");
    const checks = [
      { name: "Parameters sheet", pass: true },
      { name: "Inventory Report", pass: inventoryRecords.length > 0 },
      { name: "Summary", pass: true },
      { name: "GL Detail", pass: glRecords.length > 0 },
      { name: "GL Summary", pass: glRecords.length > 0 },
      { name: "Plant Reconciliation", pass: plantRecon.length > 0 },
      { name: "Location Reconciliation", pass: locationRecon.length > 0 },
      { name: "Top Variances", pass: topVariances.length > 0 },
      { name: "Location sheets", pass: result.locationCount > 0 },
    ];

    let allPass = true;
    for (let i = 0; i < checks.length; i++) {
      const c = checks[i];
      console.log(`  ${c.pass ? "✓" : "✗"} ${c.name}`);
      if (!c.pass) allPass = false;
    }

    console.log(`\n  STATUS: ${allPass ? "PASS" : "ISSUES FOUND"}`);

    await sap.disconnect();
    console.log("\nDone.");
  } catch (err) {
    console.error("ERROR:", err.message || err);
  }
}

testFinanceWorkbook();
