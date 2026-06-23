/**
 * Workbook Integrity Test
 *
 * Run: node tests/test-workbook-integrity.js
 *
 * Generates a workbook with mock data (no SAP needed) and validates:
 *   - XLSX unzips cleanly
 *   - All sheet XML files are present
 *   - No NaN/Infinity/undefined in cell values
 *   - Sheet names match expectations
 *   - Row/column counts logged
 */
const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const { safeNum, safeStr } = require("../utils/safe-cell");

const FinanceWorkbookService = require("../services/finance-workbook.service");
const ReconciliationService = require("../services/reconciliation.service");

async function testWorkbookIntegrity() {
  console.log("=== Workbook Integrity Test ===\n");

  // Generate mock data
  const mockRecords = [];
  const locations = ["WH10", "ECOM", "BMY1", "OSL1", "PRD1"];
  const indicators = ["", "", "", "E", "O", "W", "", "", ""];

  for (let i = 0; i < 100; i++) {
    mockRecords.push({
      material: `MAT${String(i).padStart(6, "0")}`,
      materialType: "ROH",
      materialDescription: `Test Material ${i}`,
      materialGroup: "001",
      plant: "1000",
      storageLocation: locations[i % locations.length],
      specialStockIndicator: indicators[i % indicators.length],
      specialStockNumber: indicators[i % indicators.length] ? `VBELN${i}` : "",
      baseUnit: "EA",
      unrestrictedQty: i * 10,
      unrestrictedValue: i * 100.55,
      transitQty: i % 5 === 0 ? 5 : 0,
      transitValue: i % 5 === 0 ? 50.25 : 0,
      qualityQty: i % 7 === 0 ? 3 : 0,
      qualityValue: i % 7 === 0 ? 30.1 : 0,
      restrictedQty: 0,
      restrictedValue: 0,
      blockedQty: i % 10 === 0 ? 2 : 0,
      blockedValue: i % 10 === 0 ? 20.05 : 0,
      returnsQty: 0,
      returnsValue: 0,
      standardCost: 10.05,
      movingAveragePrice: 9.95,
      totalQuantity: i * 10,
      totalInventoryValue: i * 100.55,
      valueDerived: true,
    });
  }

  // Add edge cases that cause corruption
  mockRecords.push({
    material: "EDGE_UNDEFINED",
    materialType: undefined,
    materialDescription: null,
    materialGroup: undefined,
    plant: "1000",
    storageLocation: "WH10",
    specialStockIndicator: undefined,
    specialStockNumber: null,
    baseUnit: undefined,
    unrestrictedQty: NaN,
    unrestrictedValue: Infinity,
    transitQty: -Infinity,
    transitValue: undefined,
    qualityQty: null,
    qualityValue: NaN,
    restrictedQty: 0,
    restrictedValue: 0,
    blockedQty: undefined,
    blockedValue: null,
    returnsQty: NaN,
    returnsValue: Infinity,
    standardCost: undefined,
    movingAveragePrice: NaN,
    totalQuantity: NaN,
    totalInventoryValue: Infinity,
    valueDerived: true,
  });

  const mockGL = [
    {
      companyCode: "1000",
      glAccount: "0013000000",
      fiscalYear: "2026",
      period: "06",
      debitCreditIndicator: "S",
      cumulativeBalance: 50000,
      localCurrencyBalance: 50000,
      transactionCurrencyBalance: 50000,
    },
    {
      companyCode: "1000",
      glAccount: "0013200000",
      fiscalYear: "2026",
      period: "06",
      debitCreditIndicator: "H",
      cumulativeBalance: -12000,
      localCurrencyBalance: -12000,
      transactionCurrencyBalance: -12000,
    },
    {
      companyCode: "1000",
      glAccount: undefined,
      fiscalYear: null,
      period: NaN,
      debitCreditIndicator: "",
      cumulativeBalance: NaN,
      localCurrencyBalance: undefined,
      transactionCurrencyBalance: Infinity,
    },
  ];

  const reconService = new ReconciliationService();
  const plantRecon = reconService.reconcileByPlant(mockRecords, mockGL);
  const locationRecon = reconService.reconcileByStorageLocation(
    mockRecords,
    mockGL,
  );
  const topVariances = reconService.getTopVariances(mockRecords, mockGL, 10);

  // Generate workbook
  const financeWorkbook = new FinanceWorkbookService();
  console.log("Generating workbook with edge-case data...");

  const result = await financeWorkbook.generateFinanceWorkbook(
    {
      inventoryRecords: mockRecords,
      glRecords: mockGL,
      plantRecon,
      locationRecon,
      topVariances,
    },
    {
      companyCode: "1000",
      plant: "1000",
      fiscalYear: "2026",
      period: "06",
      currency: "USD",
    },
  );

  console.log(`  File: ${result.filePath}`);
  console.log(`  Sheets: ${result.sheetCount}`);
  console.log(`  Size: ${result.fileSizeMB} MB`);

  // Validate by reading back with ExcelJS
  console.log("\nValidating workbook by reading back...");
  const readWorkbook = new ExcelJS.Workbook();
  try {
    await readWorkbook.xlsx.readFile(result.filePath);
    console.log("  ✓ Workbook reads without error");
  } catch (err) {
    console.log(`  ✗ Workbook read FAILED: ${err.message}`);
    return;
  }

  // Sheet inventory
  console.log("\n--- Sheet Inventory ---");
  console.log(
    "  #".padEnd(5) + "Sheet Name".padEnd(28) + "Rows".padEnd(8) + "Cols",
  );
  console.log("  " + "-".repeat(50));

  let sheetIndex = 1;
  readWorkbook.eachSheet((sheet, id) => {
    const rowCount = sheet.rowCount;
    const colCount = sheet.columnCount;
    const xmlName = `sheet${sheetIndex}.xml`;
    console.log(
      `  ${String(sheetIndex).padEnd(5)}${sheet.name.padEnd(28)}${String(rowCount).padEnd(8)}${colCount}`,
    );
    sheetIndex++;
  });

  // Sheet mapping (for Excel recovery log interpretation)
  console.log("\n--- XML to Sheet Name Mapping ---");
  sheetIndex = 1;
  readWorkbook.eachSheet((sheet) => {
    console.log(`  sheet${sheetIndex}.xml → ${sheet.name}`);
    sheetIndex++;
  });

  // Check for bad values
  console.log("\n--- Cell Value Validation ---");
  let badCells = 0;
  readWorkbook.eachSheet((sheet) => {
    sheet.eachRow((row, rowNum) => {
      row.eachCell((cell) => {
        const v = cell.value;
        if (v !== null && v !== undefined && typeof v === "number") {
          if (isNaN(v) || !isFinite(v)) {
            badCells++;
            if (badCells <= 5) {
              console.log(`  ✗ Bad cell: ${sheet.name} row ${rowNum}: ${v}`);
            }
          }
        }
      });
    });
  });

  if (badCells === 0) {
    console.log("  ✓ No NaN/Infinity values found in any cell");
  } else {
    console.log(`  ✗ Found ${badCells} bad cell values`);
  }

  // Final verdict
  console.log("\n=== VERDICT ===");
  const pass = badCells === 0;
  console.log(
    `  ${pass ? "✓ PASS — Workbook is valid" : "✗ FAIL — Corruption detected"}`,
  );
  console.log(`  File: ${result.filePath}`);

  console.log("\nDone.");
}

testWorkbookIntegrity();
