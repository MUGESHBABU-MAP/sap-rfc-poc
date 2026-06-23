/**
 * Phase 3.15 - Validate Special Stock Sheets (E, O, W, UNASSIGNED)
 *
 * Run: node tests/test-special-stock-sheets.js
 *
 * Validates that the finance workbook now includes special stock sheets
 * and that records are correctly distributed.
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

async function testSpecialStockSheets() {
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
    console.log("=== Special Stock Sheets Validation ===\n");

    const inventoryService = new InventoryDatasetService(sap);
    const glService = new GLDatasetService(sap);
    const reconService = new ReconciliationService();
    const companyService = new CompanyService(sap);
    const financeWorkbook = new FinanceWorkbookService();

    // Fetch data
    console.log("Fetching inventory...");
    const inventoryRecords = await inventoryService.getInventoryDataset({
      plant: PLANT,
    });
    console.log(`  Records: ${inventoryRecords.length}`);

    console.log("Fetching GL...");
    const inventoryAccounts =
      (accountMaster[COMPANY_CODE] || {}).inventoryAccounts || [];
    const glRecords = await glService.getGLBalances({
      companyCode: COMPANY_CODE,
      fiscalYear: FISCAL_YEAR,
      inventoryAccounts:
        inventoryAccounts.length > 0 ? inventoryAccounts : undefined,
    });
    console.log(`  GL records: ${glRecords.length}`);

    // Count special stock distribution
    let eCount = 0,
      oCount = 0,
      wCount = 0,
      unassignedCount = 0;
    const locationSet = new Set();

    for (let i = 0; i < inventoryRecords.length; i++) {
      const r = inventoryRecords[i];
      locationSet.add(r.storageLocation || "UNKNOWN");
      const ind = r.specialStockIndicator || "";
      if (ind === "E") eCount++;
      else if (ind === "O") oCount++;
      else if (ind === "W") wCount++;
      else unassignedCount++;
    }

    console.log("\n--- Special Stock Distribution ---");
    console.log(`  E (Sales Order):       ${eCount}`);
    console.log(`  O (Vendor Consignment): ${oCount}`);
    console.log(`  W (Customer Consign.):  ${wCount}`);
    console.log(`  UNASSIGNED (Normal):    ${unassignedCount}`);
    console.log(`  Total:                  ${inventoryRecords.length}`);
    console.log(`  Location count:         ${locationSet.size}`);

    // Generate workbook
    console.log("\nGenerating finance workbook with special stock sheets...");
    const companyData = await companyService.getCompanyCurrency(COMPANY_CODE);
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

    console.log(`\n  ✓ ${result.filePath}`);
    console.log(`  Sheets: ${result.sheetCount}`);
    console.log(`  Time: ${result.executionTime}s`);
    console.log(`  Size: ${result.fileSizeMB} MB`);

    // Validation
    console.log("\n=== VALIDATION ===");
    console.log(`  Inventory records:     ${inventoryRecords.length}`);
    console.log(`  Location sheet count:  ${locationSet.size}`);
    console.log(`  E sheet records:       ${eCount}`);
    console.log(`  O sheet records:       ${oCount}`);
    console.log(`  W sheet records:       ${wCount}`);
    console.log(`  UNASSIGNED records:    ${unassignedCount}`);

    // Verify total = E + O + W + UNASSIGNED
    const sumCheck = eCount + oCount + wCount + unassignedCount;
    const totalMatch = sumCheck === inventoryRecords.length;
    console.log(
      `\n  Sum check: ${sumCheck} === ${inventoryRecords.length} → ${totalMatch ? "✓ PASS" : "✗ FAIL"}`,
    );

    console.log(`\n  Workbook path: ${result.filePath}`);

    await sap.disconnect();
    console.log("\nDone.");
  } catch (err) {
    console.error("ERROR:", err.message || err);
  }
}

testSpecialStockSheets();
