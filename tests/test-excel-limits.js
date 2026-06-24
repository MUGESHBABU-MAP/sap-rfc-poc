/**
 * Phase 3.17A - Excel Limits Diagnostic Test
 *
 * Run: node tests/test-excel-limits.js
 *
 * DIAGNOSTIC ONLY - Does NOT modify workbook generation.
 *
 * Purpose:
 *   Determine whether the Excel repair warning on the customer-scale
 *   workbook (Inventory_GL_Reconciliation_1000_2026.xlsx) is caused
 *   by sheets exceeding Excel's row/column maximums.
 *
 * Input: companyCode=1000, plant=1000, fiscalYear=2026
 * Output: Console report showing which sheets exceed Excel limits.
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const SAPService = require("../services/sap.service");
const InventoryDatasetService = require("../services/inventory-dataset.service");
const GLDatasetService = require("../services/gl-dataset.service");
const ReconciliationService = require("../services/reconciliation.service");
const {
  validateWorkbookLimits,
  EXCEL_MAX_ROWS,
  EXCEL_MAX_COLS,
} = require("../utils/workbook-limit-validator");

const accountMaster = require("../config/inventory-account-master.json");

const COMPANY_CODE = process.env.TEST_COMPANY || "1000";
const PLANT = process.env.TEST_PLANT || "1000";
const FISCAL_YEAR = process.env.TEST_FISCAL_YEAR || "2026";

async function testExcelLimits() {
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
      "║   Phase 3.17A - Excel Limits Diagnostic                     ║",
    );
    console.log(
      "║   DIAGNOSTIC ONLY - No workbook changes                     ║",
    );
    console.log(
      "╚══════════════════════════════════════════════════════════════╝\n",
    );
    console.log(
      `  Company: ${COMPANY_CODE} | Plant: ${PLANT} | Year: ${FISCAL_YEAR}`,
    );
    console.log(`  Excel Row Limit: ${EXCEL_MAX_ROWS.toLocaleString()}`);
    console.log(`  Excel Column Limit: ${EXCEL_MAX_COLS.toLocaleString()}\n`);

    // --- Step 1: Fetch Inventory ---
    console.log("Step 1: Fetching inventory dataset...");
    const inventoryService = new InventoryDatasetService(sap);
    const invStart = Date.now();
    const inventoryRecords = await inventoryService.getInventoryDataset({
      plant: PLANT,
    });
    const invTime = ((Date.now() - invStart) / 1000).toFixed(1);
    console.log(
      `  Inventory records: ${inventoryRecords.length.toLocaleString()} (${invTime}s)\n`,
    );

    // --- Step 2: Fetch GL ---
    console.log("Step 2: Fetching GL balances...");
    const glService = new GLDatasetService(sap);
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
    console.log(
      `  GL records: ${glRecords.length.toLocaleString()} (${glTime}s)\n`,
    );

    // --- Step 3: Run Reconciliation ---
    console.log("Step 3: Running reconciliation...");
    const reconService = new ReconciliationService();
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
    console.log(`  Top variances: ${topVariances.length}\n`);

    // --- Step 4: Validate Against Excel Limits ---
    console.log("Step 4: Analyzing workbook against Excel limits...\n");
    const report = validateWorkbookLimits({
      inventoryRecords,
      glRecords,
      plantRecon,
      locationRecon,
      topVariances,
    });

    // --- Print Sheet-by-Sheet Analysis ---
    console.log(
      "═══════════════════════════════════════════════════════════════════════════════════════════════",
    );
    console.log("  SHEET-BY-SHEET ANALYSIS");
    console.log(
      "═══════════════════════════════════════════════════════════════════════════════════════════════",
    );
    console.log("");
    console.log(
      padRight("  #", 5) +
        padRight("Sheet Name", 28) +
        padRight("Expected Rows", 16) +
        padRight("Expected Cols", 16) +
        padRight("Excel Max Rows", 16) +
        padRight("Excel Max Cols", 16) +
        "Exceeds Limit",
    );
    console.log("  " + "-".repeat(93));

    for (let i = 0; i < report.sheets.length; i++) {
      const s = report.sheets[i];
      const exceedsFlag = s.exceedsLimit ? "YES ⚠️" : "NO";
      console.log(
        padRight("  " + s.sheetIndex, 5) +
          padRight(s.sheetName, 28) +
          padRight(s.expectedRows.toLocaleString(), 16) +
          padRight(String(s.expectedColumns), 16) +
          padRight(EXCEL_MAX_ROWS.toLocaleString(), 16) +
          padRight(EXCEL_MAX_COLS.toLocaleString(), 16) +
          exceedsFlag,
      );
    }

    // --- Violations ---
    console.log(
      "\n═══════════════════════════════════════════════════════════════════════════════════════════════",
    );
    console.log("  VIOLATIONS (Sheets exceeding Excel limits)");
    console.log(
      "═══════════════════════════════════════════════════════════════════════════════════════════════\n",
    );

    if (report.violations.length === 0) {
      console.log("  None - No sheets exceed Excel limits.\n");
    } else {
      for (let i = 0; i < report.violations.length; i++) {
        const v = report.violations[i];
        if (v.type === "ROW_LIMIT_EXCEEDED") {
          console.log(`  ⚠️  ${v.sheet} (sheet${v.sheetIndex}.xml)`);
          console.log(`      Rows: ${v.rows.toLocaleString()}`);
          console.log(`      Excel Limit: ${v.limit.toLocaleString()}`);
          console.log(
            `      Overage: ${v.overage.toLocaleString()} rows over limit`,
          );
          console.log(`      Exceeds: YES\n`);
        } else {
          console.log(`  ⚠️  ${v.sheet} (sheet${v.sheetIndex}.xml)`);
          console.log(`      Columns: ${v.columns.toLocaleString()}`);
          console.log(`      Excel Limit: ${v.limit.toLocaleString()}`);
          console.log(
            `      Overage: ${v.overage.toLocaleString()} columns over limit`,
          );
          console.log(`      Exceeds: YES\n`);
        }
      }
    }

    // --- Warnings ---
    if (report.warnings.length > 0) {
      console.log(
        "═══════════════════════════════════════════════════════════════════════════════════════════════",
      );
      console.log("  WARNINGS (Sheets approaching 80% of Excel limits)");
      console.log(
        "═══════════════════════════════════════════════════════════════════════════════════════════════\n",
      );

      for (let i = 0; i < report.warnings.length; i++) {
        const w = report.warnings[i];
        console.log(`  ⚡ ${w.sheet} (sheet${w.sheetIndex}.xml)`);
        console.log(
          `     Rows: ${w.rows.toLocaleString()} (${w.percentUsed}% of limit)\n`,
        );
      }
    }

    // --- Correlation with Excel Repair ---
    console.log(
      "═══════════════════════════════════════════════════════════════════════════════════════════════",
    );
    console.log("  CORRELATION WITH EXCEL REPAIR WARNING");
    console.log(
      "═══════════════════════════════════════════════════════════════════════════════════════════════\n",
    );
    console.log("  Excel repair message referenced:");
    console.log("    - /xl/worksheets/sheet2.xml");
    console.log("    - /xl/worksheets/sheet77.xml\n");

    // Identify sheet2 and sheet77
    const sheet2 = report.sheets.find((s) => s.sheetIndex === 2);
    const sheet77 = report.sheets.find((s) => s.sheetIndex === 77);

    if (sheet2) {
      console.log(`  sheet2.xml → "${sheet2.sheetName}"`);
      console.log(`    Expected Rows: ${sheet2.expectedRows.toLocaleString()}`);
      console.log(`    Excel Limit: ${EXCEL_MAX_ROWS.toLocaleString()}`);
      console.log(`    Exceeds: ${sheet2.exceedsLimit ? "YES ⚠️" : "NO"}\n`);
    } else {
      console.log(
        "  sheet2.xml → (workbook has fewer than 2 sheets - unexpected)\n",
      );
    }

    if (sheet77) {
      console.log(`  sheet77.xml → "${sheet77.sheetName}"`);
      console.log(
        `    Expected Rows: ${sheet77.expectedRows.toLocaleString()}`,
      );
      console.log(`    Excel Limit: ${EXCEL_MAX_ROWS.toLocaleString()}`);
      console.log(`    Exceeds: ${sheet77.exceedsLimit ? "YES ⚠️" : "NO"}\n`);
    } else if (report.sheetCount < 77) {
      console.log(
        `  sheet77.xml → (workbook has ${report.sheetCount} sheets, no sheet77)`,
      );
      console.log(
        `    Note: sheet77 may correspond to a different sheet index depending on`,
      );
      console.log(`    internal xlsx packaging order.\n`);
    } else {
      console.log(`  sheet77.xml → Sheet at index 77 not found.\n`);
    }

    // --- Final Recommendation ---
    console.log(
      "═══════════════════════════════════════════════════════════════════════════════════════════════",
    );
    console.log("  RECOMMENDATION");
    console.log(
      "═══════════════════════════════════════════════════════════════════════════════════════════════\n",
    );

    console.log(`  Largest Sheet: "${report.largestSheet.sheetName}"`);
    console.log(
      `    Rows: ${report.largestSheet.expectedRows.toLocaleString()}`,
    );
    console.log(`    Category: ${report.largestSheet.category}\n`);
    console.log(`  Total Workbook Rows: ${report.totalRows.toLocaleString()}`);
    console.log(`  Total Sheets: ${report.sheetCount}\n`);

    if (report.exceedsExcelLimits) {
      console.log(`  ⚠️  EXCEL LIMITS EXCEEDED`);
      console.log(
        `  Sheets exceeding row limit: ${report.violations.filter((v) => v.type === "ROW_LIMIT_EXCEEDED").length}`,
      );
      console.log(
        `  Sheets exceeding column limit: ${report.violations.filter((v) => v.type === "COLUMN_LIMIT_EXCEEDED").length}\n`,
      );
      console.log(`  CONCLUSION: Sheet splitting IS REQUIRED.`);
      console.log(
        `  The Excel repair warning is caused by sheets with more rows than`,
      );
      console.log(
        `  Excel can handle (${EXCEL_MAX_ROWS.toLocaleString()} row limit).`,
      );
      console.log(`  Affected sheets must be split into multiple sub-sheets.`);
    } else {
      console.log(`  ✓ NO SHEETS EXCEED EXCEL LIMITS`);
      console.log(
        `  The Excel repair warning is NOT caused by row/column limit violations.`,
      );
      console.log(`  Root cause must be investigated elsewhere:`);
      console.log(
        `    - Possible string length exceeding 32,767 chars in a cell`,
      );
      console.log(`    - Possible invalid characters in cell values`);
      console.log(
        `    - Possible shared string table corruption at large scale`,
      );
      console.log(
        `    - Possible ExcelJS streaming writer issue at 500MB+ file sizes`,
      );
    }

    console.log(
      "\n═══════════════════════════════════════════════════════════════════════════════════════════════",
    );
    console.log("  DIAGNOSTIC COMPLETE");
    console.log(
      "═══════════════════════════════════════════════════════════════════════════════════════════════\n",
    );

    // --- Summary JSON output ---
    console.log("  Structured Result:");
    console.log(
      JSON.stringify(
        {
          exceedsExcelLimits: report.exceedsExcelLimits,
          violationCount: report.violations.length,
          warningCount: report.warnings.length,
          largestSheet: report.largestSheet.sheetName,
          largestSheetRows: report.largestSheet.expectedRows,
          totalRows: report.totalRows,
          sheetCount: report.sheetCount,
          sheetSplittingRequired: report.exceedsExcelLimits,
        },
        null,
        2,
      ),
    );

    await sap.disconnect();
    console.log("\nDone.");
  } catch (err) {
    console.error("ERROR:", err.message || err);
    if (err.stack) console.error(err.stack);
  }
}

// --- Utility ---
function padRight(str, len) {
  const s = String(str);
  return s.length >= len ? s : s + " ".repeat(len - s.length);
}

testExcelLimits();
