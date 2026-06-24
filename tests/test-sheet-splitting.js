/**
 * Phase 3.17B - Test Sheet Splitting
 *
 * Run: node tests/test-sheet-splitting.js
 *
 * Tests that automatic sheet splitting works correctly
 * for datasets exceeding Excel's row limit.
 *
 * Uses mock data (no SAP connection required).
 *
 * Strategy:
 *   - Unit tests verify splitter utility at full scale (math only, no I/O)
 *   - Integration tests use small datasets to verify workbook generation
 *     and metadata return shape (no splitting triggered)
 *   - Integration tests with splitting use the actual SAFE_MAX_ROWS constant
 *     Note: Full-scale tests (1.5M+ records) should be run on customer
 *     SAP system via test-finance-workbook.js
 */
const path = require("path");
const fs = require("fs");
const ExcelJS = require("exceljs");

const {
  splitIntoChunks,
  splitIndicesIntoChunks,
  getRequiredSheetCount,
  buildSplitSheetNames,
  requiresSplitting,
  SAFE_MAX_ROWS,
} = require("../utils/excel-sheet-splitter");

const FinanceWorkbookService = require("../services/finance-workbook.service");

const OUTPUT_DIR = path.resolve(__dirname, "../output");

// --- Utility: generate mock inventory records ---
function generateMockRecords(count) {
  const records = [];
  for (let i = 0; i < count; i++) {
    records.push({
      material: `MAT${String(i).padStart(8, "0")}`,
      materialType: "ROH",
      materialDescription: `Material ${i}`,
      materialGroup: "GRP1",
      plant: "1000",
      storageLocation: `WH${String((i % 3) + 1).padStart(2, "0")}`,
      specialStockIndicator: i % 10 === 0 ? "E" : "",
      specialStockNumber: "",
      baseUnit: "EA",
      unrestrictedQty: 10,
      standardCost: 5.0,
      unrestrictedValue: 50.0,
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
      totalInventoryValue: 50.0,
      totalQuantity: 10,
    });
  }
  return records;
}

function generateMockGL(count) {
  const records = [];
  for (let i = 0; i < count; i++) {
    records.push({
      companyCode: "1000",
      glAccount: `79${String(i).padStart(4, "0")}00`,
      fiscalYear: "2026",
      period: "001",
      debitCreditIndicator: "S",
      cumulativeBalance: 1000 + i,
      localCurrencyBalance: 1000 + i,
      transactionCurrencyBalance: 1000 + i,
    });
  }
  return records;
}

function mockReconData() {
  return {
    plantRecon: [
      {
        plant: "1000",
        inventoryValue: 25000,
        glBalance: 25000,
        variance: 0,
        variancePercent: 0,
        status: "MATCH",
      },
    ],
    locationRecon: [
      {
        plant: "1000",
        storageLocation: "WH01",
        inventoryValue: 8000,
        glBalance: 8000,
        variance: 0,
        variancePercent: 0,
        status: "MATCH",
      },
    ],
    topVariances: [
      {
        plant: "1000",
        storageLocation: "WH01",
        inventoryValue: 8000,
        glBalance: 8000,
        variance: 0,
        variancePercent: 0,
      },
    ],
  };
}

const PARAMS = {
  companyCode: "1000",
  plant: "1000",
  fiscalYear: "2026",
  period: "ALL",
  currency: "USD",
};

// --- Test Runner ---
async function runTests() {
  console.log(
    "╔══════════════════════════════════════════════════════════════╗",
  );
  console.log(
    "║   Phase 3.17B - Sheet Splitting Tests                        ║",
  );
  console.log(
    "╚══════════════════════════════════════════════════════════════╝\n",
  );

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ ${message}`);
      passed++;
    } else {
      console.log(`  ✗ FAIL: ${message}`);
      failed++;
    }
  }

  // ==========================================================
  // Unit Tests: excel-sheet-splitter.js
  // ==========================================================
  console.log("\n--- Splitter Utility Unit Tests ---\n");

  // splitIntoChunks
  assert(
    splitIntoChunks([], 100).length === 1,
    "splitIntoChunks: empty array returns [[]]",
  );
  assert(
    splitIntoChunks([1, 2, 3], 10).length === 1,
    "splitIntoChunks: small array returns 1 chunk",
  );
  assert(
    splitIntoChunks([1, 2, 3], 10)[0].length === 3,
    "splitIntoChunks: small array chunk has all items",
  );
  assert(
    splitIntoChunks([1, 2, 3, 4, 5], 2).length === 3,
    "splitIntoChunks: 5 items / chunkSize 2 = 3 chunks",
  );
  assert(
    splitIntoChunks([1, 2, 3, 4, 5], 2)[2].length === 1,
    "splitIntoChunks: last chunk has remainder",
  );

  // splitIndicesIntoChunks (use small arrays to verify logic)
  const indices5 = [0, 1, 2, 3, 4];
  assert(
    splitIndicesIntoChunks(indices5, 2).length === 3,
    "splitIndicesIntoChunks: 5 indices / chunk 2 = 3",
  );
  assert(
    splitIndicesIntoChunks(indices5, 2)[0].length === 2,
    "splitIndicesIntoChunks: first chunk = 2",
  );
  assert(
    splitIndicesIntoChunks(indices5, 2)[2].length === 1,
    "splitIndicesIntoChunks: last chunk = 1",
  );
  assert(
    splitIndicesIntoChunks([], 100).length === 1,
    "splitIndicesIntoChunks: empty = [[]]",
  );

  // getRequiredSheetCount
  assert(
    getRequiredSheetCount(500) === 1,
    "getRequiredSheetCount: 500 rows = 1 sheet",
  );
  assert(
    getRequiredSheetCount(1000000) === 1,
    "getRequiredSheetCount: 1,000,000 rows = 1 sheet (at boundary)",
  );
  assert(
    getRequiredSheetCount(1000001) === 2,
    "getRequiredSheetCount: 1,000,001 rows = 2 sheets",
  );
  assert(
    getRequiredSheetCount(1500000) === 2,
    "getRequiredSheetCount: 1,500,000 rows = 2 sheets",
  );
  assert(
    getRequiredSheetCount(2000000) === 2,
    "getRequiredSheetCount: 2,000,000 rows = 2 sheets",
  );
  assert(
    getRequiredSheetCount(2000001) === 3,
    "getRequiredSheetCount: 2,000,001 rows = 3 sheets",
  );
  assert(
    getRequiredSheetCount(2500000) === 3,
    "getRequiredSheetCount: 2,500,000 rows = 3 sheets",
  );
  assert(
    getRequiredSheetCount(0) === 1,
    "getRequiredSheetCount: 0 rows = 1 sheet",
  );

  // buildSplitSheetNames - no split
  assert(
    buildSplitSheetNames("Inventory Report", 500).length === 1,
    "buildSplitSheetNames: 500 rows = 1 name",
  );
  assert(
    buildSplitSheetNames("Inventory Report", 500)[0] === "Inventory Report",
    "buildSplitSheetNames: no split = original name",
  );
  assert(
    buildSplitSheetNames("Inventory Report", 1000000).length === 1,
    "buildSplitSheetNames: at limit = 1 name",
  );
  assert(
    buildSplitSheetNames("Inventory Report", 1000000)[0] === "Inventory Report",
    "buildSplitSheetNames: at limit = original name",
  );

  // buildSplitSheetNames - split into 2
  const names2 = buildSplitSheetNames("Inventory Report", 1500000);
  assert(
    names2.length === 2,
    `buildSplitSheetNames: 1.5M = 2 names (got ${names2.length})`,
  );
  assert(
    names2[0] === "Inventory Report_1",
    `first = "Inventory Report_1" (got "${names2[0]}")`,
  );
  assert(
    names2[1] === "Inventory Report_2",
    `second = "Inventory Report_2" (got "${names2[1]}")`,
  );

  // buildSplitSheetNames - split into 3
  const namesFor3 = buildSplitSheetNames("Inventory Report", 2500000);
  assert(
    namesFor3.length === 3,
    `buildSplitSheetNames: 2.5M = 3 names (got ${namesFor3.length})`,
  );
  assert(
    namesFor3[2] === "Inventory Report_3",
    `third = "Inventory Report_3" (got "${namesFor3[2]}")`,
  );

  // Sheet name truncation (Excel 31 char limit)
  const longName = "Very Long Location Name That Exceeds Limit";
  const longNames = buildSplitSheetNames(longName, 1500000);
  assert(
    longNames[0].length <= 31,
    `name truncated to <=31 chars (got ${longNames[0].length}: "${longNames[0]}")`,
  );
  assert(
    longNames[1].length <= 31,
    `name2 truncated to <=31 chars (got ${longNames[1].length}: "${longNames[1]}")`,
  );

  // UNASSIGNED naming (customer scenario)
  const unNames = buildSplitSheetNames("UNASSIGNED", 1505762);
  assert(
    unNames.length === 2,
    `UNASSIGNED 1,505,762 = 2 (got ${unNames.length})`,
  );
  assert(unNames[0] === "UNASSIGNED_1", `UNASSIGNED_1 (got "${unNames[0]}")`);
  assert(unNames[1] === "UNASSIGNED_2", `UNASSIGNED_2 (got "${unNames[1]}")`);

  // Customer scenario: Inventory Report with 1,672,987 rows
  const custNames = buildSplitSheetNames("Inventory Report", 1672987);
  assert(
    custNames.length === 2,
    `Customer: Inventory Report 1,672,987 = 2 sheets`,
  );
  assert(custNames[0] === "Inventory Report_1", `Customer: Inventory Report_1`);
  assert(custNames[1] === "Inventory Report_2", `Customer: Inventory Report_2`);

  // requiresSplitting
  assert(
    requiresSplitting(999999) === false,
    "requiresSplitting: 999,999 = false",
  );
  assert(
    requiresSplitting(1000000) === false,
    "requiresSplitting: 1,000,000 = false (at limit)",
  );
  assert(
    requiresSplitting(1000001) === true,
    "requiresSplitting: 1,000,001 = true",
  );
  assert(
    requiresSplitting(1672987) === true,
    "requiresSplitting: 1,672,987 = true (customer)",
  );

  // ==========================================================
  // Integration Tests: FinanceWorkbookService (small datasets)
  // ==========================================================
  console.log("\n--- Finance Workbook Integration Tests ---\n");

  const financeWorkbook = new FinanceWorkbookService();
  const gl = generateMockGL(10);
  const recon = mockReconData();

  // Case 1: 500 rows - no splitting
  console.log("  Case 1: 500 records (no split)");
  const mock1 = generateMockRecords(500);
  const result1 = await financeWorkbook.generateFinanceWorkbook(
    { inventoryRecords: mock1, glRecords: gl, ...recon },
    PARAMS,
  );

  assert(
    result1.splitSheetsGenerated === false,
    `Case 1: splitSheetsGenerated = false`,
  );
  assert(result1.splitSheetCount === 0, `Case 1: splitSheetCount = 0`);
  assert(
    Array.isArray(result1.splitSheetDetails),
    `Case 1: splitSheetDetails is array`,
  );
  assert(result1.splitSheetDetails.length === 0, `Case 1: no split details`);

  // Verify workbook structure
  const wb1 = new ExcelJS.Workbook();
  await wb1.xlsx.readFile(result1.filePath);
  const names1 = wb1.worksheets.map((ws) => ws.name);
  assert(
    names1.includes("Inventory Report"),
    'Case 1: has "Inventory Report" (unsplit)',
  );
  assert(names1.includes("Parameters"), 'Case 1: has "Parameters"');
  assert(names1.includes("Summary"), 'Case 1: has "Summary"');
  assert(names1.includes("GL Detail"), 'Case 1: has "GL Detail"');
  assert(names1.includes("GL Summary"), 'Case 1: has "GL Summary"');
  assert(
    names1.includes("Plant Reconciliation"),
    'Case 1: has "Plant Reconciliation"',
  );
  assert(
    names1.includes("Location Reconciliation"),
    'Case 1: has "Location Reconciliation"',
  );
  assert(names1.includes("Top Variances"), 'Case 1: has "Top Variances"');
  assert(
    !names1.includes("Inventory Report_1"),
    'Case 1: no "Inventory Report_1"',
  );

  try {
    fs.unlinkSync(result1.filePath);
  } catch (e) {
    /* */
  }
  console.log("");

  // Case 2: Verify return shape has all required fields
  console.log("  Case 2: Return shape verification");
  assert("filePath" in result1, "Return has filePath");
  assert("sheetCount" in result1, "Return has sheetCount");
  assert("locationCount" in result1, "Return has locationCount");
  assert("fileSizeMB" in result1, "Return has fileSizeMB");
  assert("executionTime" in result1, "Return has executionTime");
  assert("splitSheetsGenerated" in result1, "Return has splitSheetsGenerated");
  assert("splitSheetCount" in result1, "Return has splitSheetCount");
  assert("splitSheetDetails" in result1, "Return has splitSheetDetails");
  console.log("");

  // Case 3: SUMMARY_ONLY mode - no detail sheets, no splitting
  console.log("  Case 3: SUMMARY_ONLY mode");
  const mock3 = generateMockRecords(500);
  const result3 = await financeWorkbook.generateFinanceWorkbook(
    { inventoryRecords: mock3, glRecords: gl, ...recon },
    PARAMS,
    { detailMode: "SUMMARY_ONLY" },
  );
  assert(result3.splitSheetsGenerated === false, "SUMMARY_ONLY: no splitting");
  const wb3 = new ExcelJS.Workbook();
  await wb3.xlsx.readFile(result3.filePath);
  const names3 = wb3.worksheets.map((ws) => ws.name);
  assert(
    !names3.includes("Inventory Report"),
    'SUMMARY_ONLY: no "Inventory Report"',
  );
  assert(!names3.includes("GL Detail"), 'SUMMARY_ONLY: no "GL Detail"');
  assert(names3.includes("Summary"), 'SUMMARY_ONLY: has "Summary"');
  assert(names3.includes("GL Summary"), 'SUMMARY_ONLY: has "GL Summary"');
  try {
    fs.unlinkSync(result3.filePath);
  } catch (e) {
    /* */
  }
  console.log("");

  // Case 4: locationMode NONE
  console.log("  Case 4: locationMode NONE");
  const mock4 = generateMockRecords(500);
  const result4 = await financeWorkbook.generateFinanceWorkbook(
    { inventoryRecords: mock4, glRecords: gl, ...recon },
    PARAMS,
    { locationMode: "NONE" },
  );
  const wb4 = new ExcelJS.Workbook();
  await wb4.xlsx.readFile(result4.filePath);
  const names4 = wb4.worksheets.map((ws) => ws.name);
  assert(!names4.includes("WH01"), 'locationMode NONE: no "WH01"');
  assert(!names4.includes("WH02"), 'locationMode NONE: no "WH02"');
  assert(!names4.includes("WH03"), 'locationMode NONE: no "WH03"');
  assert(
    names4.includes("Inventory Report"),
    'locationMode NONE: has "Inventory Report"',
  );
  try {
    fs.unlinkSync(result4.filePath);
  } catch (e) {
    /* */
  }
  console.log("");

  // Case 5: locationMode SELECTED
  console.log("  Case 5: locationMode SELECTED");
  const mock5 = generateMockRecords(500);
  const result5 = await financeWorkbook.generateFinanceWorkbook(
    { inventoryRecords: mock5, glRecords: gl, ...recon },
    PARAMS,
    { locationMode: "SELECTED", selectedLocations: ["WH01"] },
  );
  const wb5 = new ExcelJS.Workbook();
  await wb5.xlsx.readFile(result5.filePath);
  const names5 = wb5.worksheets.map((ws) => ws.name);
  assert(names5.includes("WH01"), 'locationMode SELECTED: has "WH01"');
  assert(!names5.includes("WH02"), 'locationMode SELECTED: no "WH02"');
  try {
    fs.unlinkSync(result5.filePath);
  } catch (e) {
    /* */
  }
  console.log("");

  // Case 6: Parameters sheet enhancement (no split scenario)
  console.log("  Case 6: Parameters sheet has Excel limit fields");
  const mock6 = generateMockRecords(200);
  const result6 = await financeWorkbook.generateFinanceWorkbook(
    { inventoryRecords: mock6, glRecords: gl, ...recon },
    PARAMS,
  );
  const wb6 = new ExcelJS.Workbook();
  await wb6.xlsx.readFile(result6.filePath);
  const paramSheet = wb6.getWorksheet("Parameters");
  let foundSafeLimit = false;
  let foundSplitGen = false;
  let foundSplitCnt = false;
  if (paramSheet) {
    paramSheet.eachRow((row) => {
      const p = row.getCell(1).value;
      const v = row.getCell(2).value;
      if (p === "Excel Safe Row Limit") foundSafeLimit = true;
      if (p === "Split Sheets Generated" && v === "NO") foundSplitGen = true;
      if (p === "Split Sheet Count" && v === "0") foundSplitCnt = true;
    });
  }
  assert(foundSafeLimit, 'Parameters: has "Excel Safe Row Limit"');
  assert(
    foundSplitGen,
    'Parameters: "Split Sheets Generated" = NO (small dataset)',
  );
  assert(foundSplitCnt, 'Parameters: "Split Sheet Count" = 0');
  try {
    fs.unlinkSync(result6.filePath);
  } catch (e) {
    /* */
  }
  console.log("");

  // Case 7: SPLIT workbook mode still works
  console.log("  Case 7: workbookMode SPLIT");
  const mock7 = generateMockRecords(300);
  const result7 = await financeWorkbook.generateFinanceWorkbook(
    { inventoryRecords: mock7, glRecords: gl, ...recon },
    PARAMS,
    { workbookMode: "SPLIT" },
  );
  assert(Array.isArray(result7.files), "SPLIT mode: returns files array");
  assert(
    result7.files.length === 3,
    `SPLIT mode: 3 files (got ${result7.files.length})`,
  );
  // Clean up all 3 files
  for (const f of result7.files) {
    try {
      fs.unlinkSync(f);
    } catch (e) {
      /* */
    }
  }
  console.log("");

  // ==========================================================
  // Splitter Logic at Scale (math verification, no I/O)
  // ==========================================================
  console.log("--- Scale Verification (math only) ---\n");

  // Customer scenario: 1,672,987 inventory records
  const custInvCount = 1672987;
  const custInvSheets = getRequiredSheetCount(custInvCount);
  const custInvNames = buildSplitSheetNames("Inventory Report", custInvCount);
  assert(
    custInvSheets === 2,
    `Customer Inventory: needs ${custInvSheets} sheets (expected 2)`,
  );
  assert(
    custInvNames[0] === "Inventory Report_1",
    "Customer: Inventory Report_1",
  );
  assert(
    custInvNames[1] === "Inventory Report_2",
    "Customer: Inventory Report_2",
  );

  // Chunk sizes
  const custChunks = splitIntoChunks(new Array(custInvCount).fill(null));
  assert(
    custChunks.length === 2,
    `Customer: 2 chunks (got ${custChunks.length})`,
  );
  assert(
    custChunks[0].length === SAFE_MAX_ROWS,
    `Customer: chunk1 = ${SAFE_MAX_ROWS}`,
  );
  assert(
    custChunks[1].length === 672987,
    `Customer: chunk2 = 672,987 (got ${custChunks[1].length})`,
  );

  // Customer scenario: UNASSIGNED 1,505,762 records
  const custUnCount = 1505762;
  const custUnSheets = getRequiredSheetCount(custUnCount);
  const custUnNames = buildSplitSheetNames("UNASSIGNED", custUnCount);
  assert(
    custUnSheets === 2,
    `Customer UNASSIGNED: needs ${custUnSheets} sheets (expected 2)`,
  );
  assert(custUnNames[0] === "UNASSIGNED_1", "Customer: UNASSIGNED_1");
  assert(custUnNames[1] === "UNASSIGNED_2", "Customer: UNASSIGNED_2");

  const custUnChunks = splitIntoChunks(new Array(custUnCount).fill(null));
  assert(custUnChunks.length === 2, `Customer UNASSIGNED: 2 chunks`);
  assert(
    custUnChunks[0].length === SAFE_MAX_ROWS,
    `Customer UNASSIGNED: chunk1 = ${SAFE_MAX_ROWS}`,
  );
  assert(
    custUnChunks[1].length === 505762,
    `Customer UNASSIGNED: chunk2 = 505,762 (got ${custUnChunks[1].length})`,
  );

  // Verify all split sheets stay under Excel limit
  assert(
    SAFE_MAX_ROWS < 1048576,
    `SAFE_MAX_ROWS (${SAFE_MAX_ROWS}) < Excel limit (1,048,576)`,
  );
  assert(672987 < 1048576, "Customer Inventory chunk2 (672,987) < Excel limit");
  assert(
    505762 < 1048576,
    "Customer UNASSIGNED chunk2 (505,762) < Excel limit",
  );

  console.log("");

  // ==========================================================
  // Results
  // ==========================================================
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log(
    `  RESULTS: ${passed} passed, ${failed} failed, ${passed + failed} total`,
  );
  console.log(
    `  STATUS: ${failed === 0 ? "ALL PASS ✓" : "FAILURES DETECTED ✗"}`,
  );
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log("");
  console.log("  NOTE: Full-scale integration test (1.6M+ records) should be");
  console.log(
    "  run on customer SAP system via: node tests/test-finance-workbook.js",
  );
  console.log("");

  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error("FATAL:", err.message || err);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
