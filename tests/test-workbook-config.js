/**
 * Phase 3.17 - Workbook Configuration Test
 *
 * Run: node tests/test-workbook-config.js
 *
 * Tests all configuration modes with mock data (no SAP needed).
 * Validates that configuration flags work correctly.
 */
const path = require("path");
const ExcelJS = require("exceljs");
const FinanceWorkbookService = require("../services/finance-workbook.service");
const ReconciliationService = require("../services/reconciliation.service");

function buildMockData() {
  const records = [];
  const locations = ["WH10", "ECOM", "BMY1"];
  for (let i = 0; i < 30; i++) {
    records.push({
      material: `MAT${String(i).padStart(4, "0")}`,
      materialType: "ROH",
      materialDescription: `Material ${i}`,
      materialGroup: "001",
      plant: "1000",
      storageLocation: locations[i % 3],
      specialStockIndicator: i < 5 ? "E" : i < 10 ? "O" : i < 15 ? "W" : "",
      specialStockNumber: i < 15 ? `NUM${i}` : "",
      baseUnit: "EA",
      unrestrictedQty: i * 10,
      unrestrictedValue: i * 100,
      transitQty: 0,
      transitValue: 0,
      qualityQty: 0,
      qualityValue: 0,
      restrictedQty: 0,
      restrictedValue: 0,
      blockedQty: 0,
      blockedValue: 0,
      returnsQty: 0,
      returnsValue: 0,
      standardCost: 10,
      movingAveragePrice: 9.5,
      totalQuantity: i * 10,
      totalInventoryValue: i * 100,
      valueDerived: true,
    });
  }

  const glRecords = [
    {
      companyCode: "1000",
      glAccount: "0013000000",
      fiscalYear: "2026",
      period: "06",
      debitCreditIndicator: "S",
      cumulativeBalance: 5000,
      localCurrencyBalance: 5000,
      transactionCurrencyBalance: 5000,
    },
  ];

  const reconService = new ReconciliationService();
  const plantRecon = reconService.reconcileByPlant(records, glRecords);
  const locationRecon = reconService.reconcileByStorageLocation(
    records,
    glRecords,
  );
  const topVariances = reconService.getTopVariances(records, glRecords, 10);

  return {
    inventoryRecords: records,
    glRecords,
    plantRecon,
    locationRecon,
    topVariances,
  };
}

const PARAMS = {
  companyCode: "1000",
  plant: "1000",
  fiscalYear: "2026",
  period: "06",
  currency: "USD",
};

async function testWorkbookConfig() {
  console.log("=== Workbook Configuration Test ===\n");

  const service = new FinanceWorkbookService();
  const data = buildMockData();
  const results = [];

  // Case 1: FULL + ALL + SINGLE (default — must match Phase 3.16)
  console.log("--- Case 1: FULL / ALL / SINGLE (default) ---");
  const r1 = await service.generateFinanceWorkbook(data, PARAMS, {
    detailMode: "FULL",
    locationMode: "ALL",
    workbookMode: "SINGLE",
  });
  const sheets1 = await countSheets(r1.filePath);
  console.log(`  Sheets: ${sheets1} | File: ${path.basename(r1.filePath)}`);
  results.push({
    case: "FULL/ALL/SINGLE",
    sheets: sheets1,
    pass: sheets1 >= 10,
  });

  // Case 2: SUMMARY_ONLY
  console.log("\n--- Case 2: SUMMARY_ONLY ---");
  const r2 = await service.generateFinanceWorkbook(data, PARAMS, {
    detailMode: "SUMMARY_ONLY",
  });
  const sheets2 = await countSheets(r2.filePath);
  console.log(`  Sheets: ${sheets2} | File: ${path.basename(r2.filePath)}`);
  // Should have: Parameters + Summary + GL Summary + Plant Recon + Loc Recon + Top Variances = 6
  results.push({
    case: "SUMMARY_ONLY",
    sheets: sheets2,
    pass: sheets2 <= 7 && sheets2 >= 4,
  });

  // Case 3: SELECTED locations
  console.log("\n--- Case 3: SELECTED locations [BMY1, WH10] ---");
  const r3 = await service.generateFinanceWorkbook(data, PARAMS, {
    locationMode: "SELECTED",
    selectedLocations: ["BMY1", "WH10"],
  });
  const sheets3 = await countSheets(r3.filePath);
  const sheetNames3 = await getSheetNames(r3.filePath);
  const hasBMY1 = sheetNames3.includes("BMY1");
  const hasWH10 = sheetNames3.includes("WH10");
  const hasECOM = sheetNames3.includes("ECOM");
  console.log(
    `  Sheets: ${sheets3} | BMY1:${hasBMY1} WH10:${hasWH10} ECOM:${hasECOM}`,
  );
  results.push({
    case: "SELECTED [BMY1,WH10]",
    sheets: sheets3,
    pass: hasBMY1 && hasWH10 && !hasECOM,
  });

  // Case 4: SPLIT mode
  console.log("\n--- Case 4: SPLIT workbooks ---");
  const r4 = await service.generateFinanceWorkbook(data, PARAMS, {
    workbookMode: "SPLIT",
  });
  const fileCount = r4.files ? r4.files.length : 0;
  console.log(`  Files generated: ${fileCount}`);
  if (r4.files) {
    for (let i = 0; i < r4.files.length; i++) {
      const s = await countSheets(r4.files[i]);
      console.log(`    ${path.basename(r4.files[i])}: ${s} sheets`);
    }
  }
  results.push({ case: "SPLIT", sheets: fileCount, pass: fileCount === 3 });

  // Case 5: NONE locations
  console.log("\n--- Case 5: locationMode = NONE ---");
  const r5 = await service.generateFinanceWorkbook(data, PARAMS, {
    locationMode: "NONE",
  });
  const sheets5 = await countSheets(r5.filePath);
  const names5 = await getSheetNames(r5.filePath);
  const hasLocationSheet = names5.some((n) =>
    ["WH10", "ECOM", "BMY1"].includes(n),
  );
  console.log(
    `  Sheets: ${sheets5} | Has location sheets: ${hasLocationSheet}`,
  );
  results.push({
    case: "NONE locations",
    sheets: sheets5,
    pass: !hasLocationSheet,
  });

  // Summary
  console.log("\n========================================");
  console.log("=== RESULTS ===");
  console.log("========================================\n");
  let allPass = true;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const icon = r.pass ? "✓" : "✗";
    console.log(
      `  ${icon} ${r.case}: ${r.sheets} sheets — ${r.pass ? "PASS" : "FAIL"}`,
    );
    if (!r.pass) allPass = false;
  }
  console.log(`\n  STATUS: ${allPass ? "ALL PASS" : "ISSUES FOUND"}`);
  console.log("\nDone.");
}

async function countSheets(filePath) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  let count = 0;
  wb.eachSheet(() => count++);
  return count;
}

async function getSheetNames(filePath) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const names = [];
  wb.eachSheet((sheet) => names.push(sheet.name));
  return names;
}

testWorkbookConfig();
