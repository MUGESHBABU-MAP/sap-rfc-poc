/**
 * Workbook Configuration
 *
 * Controls which sheets are generated and how the workbook is structured.
 * All flags TRUE = identical to Phase 3.16 output (full workbook).
 *
 * API query params override these defaults at runtime.
 */
module.exports = {
  // --- Layer 1: Workbook Content ---
  includeInventoryReport: true,
  includeSummary: true,
  includeLocationSheets: true,
  includeSpecialStockSheets: true,
  includeGLDetail: true,
  includeGLSummary: true,
  includePlantReconciliation: true,
  includeLocationReconciliation: true,
  includeTopVariances: true,

  // --- Layer 2: Location Mode ---
  // ALL = generate all location sheets
  // NONE = no location sheets (summary still generated)
  // SELECTED = only locations in selectedLocations[]
  locationMode: "ALL",
  selectedLocations: [],

  // --- Layer 3: Workbook Strategy ---
  // SINGLE = one workbook (current behavior)
  // SPLIT = three workbooks (Inventory, GL, Reconciliation)
  workbookMode: "SINGLE",

  // --- Layer 4: Detail Mode ---
  // FULL = all detail rows included (current behavior)
  // SUMMARY_ONLY = no detail sheets, only summaries + reconciliation
  detailMode: "FULL",
};
