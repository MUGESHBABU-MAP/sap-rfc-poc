/**
 * Workbook Limit Validator (Phase 3.17A)
 *
 * DIAGNOSTIC ONLY - Does NOT modify workbook generation.
 *
 * Analyzes expected sheet sizes against official Excel limits
 * to determine if the repair warning is caused by exceeding
 * Excel's row/column maximums.
 *
 * Excel Limits (XLSX format):
 *   Max Rows per sheet:    1,048,576
 *   Max Columns per sheet: 16,384
 */

const EXCEL_MAX_ROWS = 1048576;
const EXCEL_MAX_COLS = 16384;

/**
 * Validate workbook data against Excel limits.
 *
 * @param {object} data
 * @param {InventoryRecord[]} data.inventoryRecords
 * @param {GLBalanceRecord[]} data.glRecords
 * @param {PlantReconciliation[]} data.plantRecon
 * @param {StorageLocationReconciliation[]} data.locationRecon
 * @param {TopVariance[]} data.topVariances
 * @param {object} [config] - workbook config overrides
 * @returns {WorkbookLimitReport}
 */
function validateWorkbookLimits(data, config) {
  const cfg = {
    includeInventoryReport: true,
    includeSummary: true,
    includeLocationSheets: true,
    includeSpecialStockSheets: true,
    includeGLDetail: true,
    includeGLSummary: true,
    includePlantReconciliation: true,
    includeLocationReconciliation: true,
    includeTopVariances: true,
    locationMode: "ALL",
    selectedLocations: [],
    detailMode: "FULL",
    ...(config || {}),
  };

  const isSummaryOnly = cfg.detailMode === "SUMMARY_ONLY";
  const sheets = [];

  // --- Group inventory by location ---
  const locationMap = new Map();
  const specialStockMap = new Map();
  specialStockMap.set("E", 0);
  specialStockMap.set("O", 0);
  specialStockMap.set("W", 0);
  specialStockMap.set("UNASSIGNED", 0);

  for (let i = 0; i < data.inventoryRecords.length; i++) {
    const r = data.inventoryRecords[i];
    const loc = r.storageLocation || "UNKNOWN";

    if (!locationMap.has(loc)) locationMap.set(loc, 0);
    locationMap.set(loc, locationMap.get(loc) + 1);

    const indicator = r.specialStockIndicator || "";
    if (indicator === "E" || indicator === "O" || indicator === "W") {
      specialStockMap.set(indicator, specialStockMap.get(indicator) + 1);
    } else {
      specialStockMap.set("UNASSIGNED", specialStockMap.get("UNASSIGNED") + 1);
    }
  }

  const sortedLocations = [...locationMap.keys()].sort();

  // --- GL Summary count ---
  const glAccountSet = new Set();
  for (let i = 0; i < data.glRecords.length; i++) {
    glAccountSet.add(data.glRecords[i].glAccount || "");
  }

  // --- Build sheet analysis ---

  // 1. Parameters (always)
  sheets.push({
    sheetName: "Parameters",
    sheetIndex: 1,
    expectedRows: 17 + 1, // 17 data rows + 1 header
    expectedColumns: 2,
    category: "metadata",
  });

  // 2. Inventory Report
  if (cfg.includeInventoryReport && !isSummaryOnly) {
    sheets.push({
      sheetName: "Inventory Report",
      sheetIndex: 2,
      expectedRows: data.inventoryRecords.length + 1, // +1 header
      expectedColumns: 25,
      category: "detail",
    });
  }

  // 3. Summary
  if (cfg.includeSummary) {
    sheets.push({
      sheetName: "Summary",
      sheetIndex: sheets.length + 1,
      expectedRows: sortedLocations.length + 2, // locations + header + grand total
      expectedColumns: 15,
      category: "summary",
    });
  }

  // 4. Location sheets
  if (cfg.includeLocationSheets && !isSummaryOnly) {
    const locsToGenerate = _resolveLocations(sortedLocations, cfg);
    for (let l = 0; l < locsToGenerate.length; l++) {
      const loc = locsToGenerate[l];
      const count = locationMap.get(loc) || 0;
      if (count > 0) {
        sheets.push({
          sheetName: loc.substring(0, 31),
          sheetIndex: sheets.length + 1,
          expectedRows: count + 1, // +1 header
          expectedColumns: 25,
          category: "location-detail",
        });
      }
    }
  }

  // 5. Special Stock Sheets
  if (cfg.includeSpecialStockSheets && !isSummaryOnly) {
    const ssOrder = ["E", "O", "W", "UNASSIGNED"];
    for (let ss = 0; ss < ssOrder.length; ss++) {
      const indicator = ssOrder[ss];
      const count = specialStockMap.get(indicator);
      if (count > 0) {
        sheets.push({
          sheetName: indicator,
          sheetIndex: sheets.length + 1,
          expectedRows: count + 2, // +1 header + 1 totals row
          expectedColumns: 25,
          category: "special-stock-detail",
        });
      }
    }
  }

  // 6. GL Detail
  if (cfg.includeGLDetail && !isSummaryOnly) {
    sheets.push({
      sheetName: "GL Detail",
      sheetIndex: sheets.length + 1,
      expectedRows: data.glRecords.length + 1, // +1 header
      expectedColumns: 7,
      category: "detail",
    });
  }

  // 7. GL Summary
  if (cfg.includeGLSummary) {
    sheets.push({
      sheetName: "GL Summary",
      sheetIndex: sheets.length + 1,
      expectedRows: glAccountSet.size + 2, // accounts + header + grand total
      expectedColumns: 5,
      category: "summary",
    });
  }

  // 8. Plant Reconciliation
  if (cfg.includePlantReconciliation) {
    sheets.push({
      sheetName: "Plant Reconciliation",
      sheetIndex: sheets.length + 1,
      expectedRows: data.plantRecon.length + 1, // +1 header
      expectedColumns: 6,
      category: "reconciliation",
    });
  }

  // 9. Location Reconciliation
  if (cfg.includeLocationReconciliation) {
    sheets.push({
      sheetName: "Location Reconciliation",
      sheetIndex: sheets.length + 1,
      expectedRows: data.locationRecon.length + 1, // +1 header
      expectedColumns: 7,
      category: "reconciliation",
    });
  }

  // 10. Top Variances
  if (cfg.includeTopVariances) {
    sheets.push({
      sheetName: "Top Variances",
      sheetIndex: sheets.length + 1,
      expectedRows: data.topVariances.length + 1, // +1 header
      expectedColumns: 6,
      category: "reconciliation",
    });
  }

  // --- Analyze each sheet ---
  const violations = [];
  const warnings = [];
  let largestSheet = null;
  let totalRows = 0;

  for (let i = 0; i < sheets.length; i++) {
    const s = sheets[i];
    s.excelMaxRows = EXCEL_MAX_ROWS;
    s.excelMaxColumns = EXCEL_MAX_COLS;
    s.exceedsRowLimit = s.expectedRows > EXCEL_MAX_ROWS;
    s.exceedsColumnLimit = s.expectedColumns > EXCEL_MAX_COLS;
    s.exceedsLimit = s.exceedsRowLimit || s.exceedsColumnLimit;

    totalRows += s.expectedRows;

    if (s.exceedsRowLimit) {
      violations.push({
        sheet: s.sheetName,
        sheetIndex: s.sheetIndex,
        rows: s.expectedRows,
        limit: EXCEL_MAX_ROWS,
        overage: s.expectedRows - EXCEL_MAX_ROWS,
        type: "ROW_LIMIT_EXCEEDED",
      });
    }

    if (s.exceedsColumnLimit) {
      violations.push({
        sheet: s.sheetName,
        sheetIndex: s.sheetIndex,
        columns: s.expectedColumns,
        limit: EXCEL_MAX_COLS,
        overage: s.expectedColumns - EXCEL_MAX_COLS,
        type: "COLUMN_LIMIT_EXCEEDED",
      });
    }

    // Warning threshold: > 80% of limit
    if (!s.exceedsRowLimit && s.expectedRows > EXCEL_MAX_ROWS * 0.8) {
      warnings.push({
        sheet: s.sheetName,
        sheetIndex: s.sheetIndex,
        rows: s.expectedRows,
        limit: EXCEL_MAX_ROWS,
        percentUsed: ((s.expectedRows / EXCEL_MAX_ROWS) * 100).toFixed(1),
        type: "APPROACHING_ROW_LIMIT",
      });
    }

    if (!largestSheet || s.expectedRows > largestSheet.expectedRows) {
      largestSheet = { ...s };
    }
  }

  return {
    exceedsExcelLimits: violations.length > 0,
    violations,
    warnings,
    largestSheet,
    totalRows,
    sheetCount: sheets.length,
    sheets,
    excelLimits: {
      maxRows: EXCEL_MAX_ROWS,
      maxColumns: EXCEL_MAX_COLS,
    },
    summary: {
      totalInventoryRecords: data.inventoryRecords.length,
      totalGLRecords: data.glRecords.length,
      locationCount: sortedLocations.length,
      specialStockDistribution: {
        E: specialStockMap.get("E"),
        O: specialStockMap.get("O"),
        W: specialStockMap.get("W"),
        UNASSIGNED: specialStockMap.get("UNASSIGNED"),
      },
      uniqueGLAccounts: glAccountSet.size,
    },
  };
}

/**
 * Resolve which locations to generate based on config.
 */
function _resolveLocations(sortedLocations, cfg) {
  if (cfg.locationMode === "NONE") return [];
  if (
    cfg.locationMode === "SELECTED" &&
    cfg.selectedLocations &&
    cfg.selectedLocations.length > 0
  ) {
    const selected = new Set(cfg.selectedLocations);
    return sortedLocations.filter((loc) => selected.has(loc));
  }
  return sortedLocations; // ALL
}

module.exports = {
  validateWorkbookLimits,
  EXCEL_MAX_ROWS,
  EXCEL_MAX_COLS,
};
