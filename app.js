require("dotenv").config();
const express = require("express");

const SAPService = require("./services/sap.service");
const InventoryDatasetService = require("./services/inventory-dataset.service");
const InventorySummaryService = require("./services/inventory-summary.service");
const GLDatasetService = require("./services/gl-dataset.service");
const GLSummaryService = require("./services/gl-summary.service");
const ReconciliationService = require("./services/reconciliation.service");
const ExportService = require("./services/export.service");
const FieldMappingService = require("./services/field-mapping.service");
const CustomerWorkbookService = require("./services/customer-workbook.service");
const CompanyService = require("./services/company.service");
const FinanceWorkbookService = require("./services/finance-workbook.service");
const AccountService = require("./services/account.service");
const RunConfigurationService = require("./services/run-configuration.service");
const AuditTrailService = require("./services/audit-trail.service");

// Route factories
const inventoryRoutes = require("./routes/inventory.routes");
const glRoutes = require("./routes/gl.routes");
const reconciliationRoutes = require("./routes/reconciliation.routes");
const exportRoutes = require("./routes/export.routes");
const analysisRoutes = require("./routes/analysis.routes");
const customerWorkbookRoutes = require("./routes/customer-workbook.routes");
const accountRoutes = require("./routes/account.routes");
const runHistoryRoutes = require("./routes/run-history.routes");

const app = express();
const PORT = process.env.PORT || 3000;

// --- SAP configuration ---
const sapConfig = {
  user: process.env.SAP_USER,
  passwd: process.env.SAP_PASSWORD,
  ashost: process.env.SAP_ASHOST,
  sysnr: process.env.SAP_SYSNR,
  client: process.env.SAP_CLIENT,
  lang: process.env.SAP_LANG,
};

// --- Service initialization ---
const sap = new SAPService(sapConfig);
const inventoryDataset = new InventoryDatasetService(sap);
const inventorySummary = new InventorySummaryService();
const glDataset = new GLDatasetService(sap);
const glSummary = new GLSummaryService();
const reconciliation = new ReconciliationService();
const exportService = new ExportService();
const fieldMapping = new FieldMappingService();
const customerWorkbook = new CustomerWorkbookService();
const companyService = new CompanyService(sap);
const financeWorkbook = new FinanceWorkbookService();
const accountService = new AccountService(sap);
const runConfigService = new RunConfigurationService();
const auditTrail = new AuditTrailService();

let sapConnected = false;

// --- Middleware ---
app.use(express.json());

// SAP connection middleware - lazy connect on first request
app.use("/api", async (req, res, next) => {
  try {
    if (!sapConnected) {
      await sap.connect();
      sapConnected = true;
      console.log("SAP connection established.");
    }
    next();
  } catch (err) {
    console.error("SAP connection failed:", err.message);
    res.status(503).json({
      success: false,
      error: "SAP connection unavailable",
      details: err.message,
    });
  }
});

// --- Health endpoint ---
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    data: {
      status: "ok",
      sapConnected,
      version: "3.13.0",
      phase: "Phase 3.13 - Finance Reconciliation",
    },
  });
});

// --- Route registration ---
app.use("/api/inventory", inventoryRoutes(inventoryDataset, inventorySummary));
app.use("/api/gl", glRoutes(glDataset, glSummary));
app.use(
  "/api/reconciliation",
  reconciliationRoutes(inventoryDataset, glDataset, reconciliation),
);
app.use(
  "/api/export",
  exportRoutes(
    inventoryDataset,
    inventorySummary,
    glDataset,
    reconciliation,
    exportService,
  ),
);
app.use("/api/analysis", analysisRoutes(fieldMapping));
app.use(
  "/api/customer-workbook",
  customerWorkbookRoutes(inventoryDataset, customerWorkbook),
);
app.use("/api/accounts", accountRoutes(accountService));
app.use("/api/run-history", runHistoryRoutes(auditTrail));

// --- Finance Reconciliation Workbook ---
const accountMaster = require("./config/inventory-account-master.json");
app.get("/api/finance-workbook", async (req, res) => {
  let runConfig = null;
  const runStartTime = Date.now();

  try {
    if (!req.query.companyCode || !req.query.plant) {
      return res.status(400).json({
        success: false,
        error: "Parameters 'companyCode' and 'plant' are required.",
        hint: "Example: /api/finance-workbook?companyCode=1000&plant=1000&fiscalYear=2026",
      });
    }

    // Build run configuration (backward compatible with legacy query params)
    runConfig = runConfigService.fromQueryParams(req.query);

    const companyCode = runConfig.companyCode;
    const plant = runConfig.plant;
    const fiscalYear = runConfig.fiscalYear;
    const period = runConfig.fiscalPeriod;

    console.log(
      `[FinanceWorkbook] runId=${runConfig.runId} cc=${companyCode} plant=${plant} year=${fiscalYear}`,
    );

    const companyData = await companyService.getCompanyCurrency(companyCode);
    const inventoryRecords = await inventoryDataset.getInventoryDataset({
      plant,
    });

    // Account selection: prefer selectedAccounts from run config, fallback to hardcoded
    let glAccountFilter;
    if (runConfig.selectedAccounts.length > 0) {
      glAccountFilter = runConfig.selectedAccounts;
    } else {
      const inventoryAccounts =
        (accountMaster[companyCode] || {}).inventoryAccounts || [];
      glAccountFilter =
        inventoryAccounts.length > 0 ? inventoryAccounts : undefined;
    }

    const glFilters = {
      companyCode,
      fiscalYear,
      inventoryAccounts: glAccountFilter,
    };
    const glRecords = await glDataset.getGLBalances(glFilters);
    const plantRecon = reconciliation.reconcileByPlant(
      inventoryRecords,
      glRecords,
    );
    const locationRecon = reconciliation.reconcileByStorageLocation(
      inventoryRecords,
      glRecords,
    );
    const topVariances = reconciliation.getTopVariances(
      inventoryRecords,
      glRecords,
      100,
    );

    const wbConfig =
      Object.keys(runConfig.workbookConfig).length > 0
        ? runConfig.workbookConfig
        : buildWorkbookConfig(req.query);

    const result = await financeWorkbook.generateFinanceWorkbook(
      { inventoryRecords, glRecords, plantRecon, locationRecon, topVariances },
      {
        companyCode,
        plant,
        fiscalYear,
        period,
        currency: companyData.currency,
      },
      wbConfig,
    );

    // Log successful run to audit trail
    const totalInvValue = inventoryRecords.reduce(
      (sum, r) => sum + (r.totalInventoryValue || 0),
      0,
    );
    const totalGlValue = glRecords.reduce(
      (sum, r) => sum + (r.cumulativeBalance || 0),
      0,
    );
    auditTrail.logRun({
      runId: runConfig.runId,
      runName: runConfig.runName,
      user: runConfig.triggeredBy,
      timestamp: new Date().toISOString(),
      companyCode,
      plant,
      fiscalYear,
      fiscalPeriod: period,
      selectedAccounts: glAccountFilter || [],
      inventoryRecords: inventoryRecords.length,
      glRecords: glRecords.length,
      inventoryValue: Math.round(totalInvValue * 100) / 100,
      glValue: Math.round(totalGlValue * 100) / 100,
      varianceAmount: Math.round((totalInvValue - totalGlValue) * 100) / 100,
      exceptionCount: topVariances.length,
      workbookPath: result.filePath || (result.files ? result.files[0] : ""),
      executionTimeSeconds: result.executionTime,
      status: "SUCCESS",
    });

    console.log(
      `[FinanceWorkbook] Done: ${result.sheetCount} sheets, ${result.executionTime}s`,
    );
    if (result.filePath) {
      const filename = require("path").basename(result.filePath);
      res.download(result.filePath, filename, (err) => {
        if (err) console.error("Download error:", err.message);
      });
    } else if (result.files) {
      // SPLIT mode — return first file (or JSON with paths)
      res.json({ success: true, data: result });
    }
  } catch (err) {
    // Log failed run to audit trail
    if (runConfig) {
      auditTrail.logRun({
        runId: runConfig.runId,
        runName: runConfig.runName,
        user: runConfig.triggeredBy,
        timestamp: new Date().toISOString(),
        companyCode: runConfig.companyCode,
        plant: runConfig.plant,
        fiscalYear: runConfig.fiscalYear,
        fiscalPeriod: runConfig.fiscalPeriod,
        selectedAccounts: runConfig.selectedAccounts,
        executionTimeSeconds: ((Date.now() - runStartTime) / 1000).toFixed(1),
        status: "FAILED",
        errorMessage: err.message,
      });
    }
    console.error("GET /api/finance-workbook error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Start server ---
app.listen(PORT, () => {
  console.log(`\n=== Inventory & GL Reconciliation API ===`);
  console.log(`Server running on port ${PORT}`);
  console.log(`\nPhase 1 - Inventory Endpoints:`);
  console.log(`  GET /api/health`);
  console.log(`  GET /api/inventory/full?plant=&storageLocation=&material=`);
  console.log(`  GET /api/inventory/summary?plant=&storageLocation=&material=`);
  console.log(`\nPhase 2 - GL Endpoints:`);
  console.log(`  GET /api/gl/full?companyCode=&fiscalYear=&glAccount=`);
  console.log(`  GET /api/gl/summary?companyCode=&fiscalYear=&glAccount=`);
  console.log(`\nPhase 3 - Reconciliation Endpoints:`);
  console.log(`  GET /api/reconciliation/plant`);
  console.log(`  GET /api/reconciliation/storage-location`);
  console.log(`  GET /api/reconciliation/top-variances?limit=100`);
  console.log(`  GET /api/reconciliation/summary`);
  console.log(`\nPhase 3.7 - Export Endpoints (parameterized):`);
  console.log(`  GET /api/export/inventory?plant=1000&storageLocation=WH10`);
  console.log(`  GET /api/export/summary?plant=1000`);
  console.log(`  GET /api/export/location/WH10?plant=1000`);
  console.log(
    `  GET /api/export/reconciliation?companyCode=1000&plant=1000&fiscalYear=2026`,
  );
  console.log(`\nPhase 3.12 - Customer Workbook:`);
  console.log(`  GET /api/customer-workbook?plant=1000`);
  console.log(`\nPhase 3.13 - Finance Reconciliation Workbook:`);
  console.log(
    `  GET /api/finance-workbook?companyCode=1000&plant=1000&fiscalYear=2026`,
  );
  console.log(
    `  GET /api/finance-workbook?companyCode=1000&plant=1000&fiscalYear=2026&selectedAccounts=0013000000,0013200000`,
  );
  console.log(`\nPhase 3.18A - Account Discovery:`);
  console.log(`  GET /api/accounts?companyCode=1000`);
  console.log(`\nPhase 3.19/3.20 - Run History & Audit:`);
  console.log(`  GET /api/run-history`);
  console.log(`  GET /api/run-history/:runId`);
  console.log(`\nAnalysis:`);
  console.log(`  GET /api/analysis/field-mapping`);
  console.log(`  GET /api/analysis/field-mapping/gaps\n`);
});

module.exports = app;

/**
 * Build workbook config overrides from API query parameters.
 * Only overrides values that are explicitly provided.
 */
function buildWorkbookConfig(query) {
  const overrides = {};
  if (query.detailMode) overrides.detailMode = query.detailMode;
  if (query.locationMode) overrides.locationMode = query.locationMode;
  if (query.workbookMode) overrides.workbookMode = query.workbookMode;
  if (query.selectedLocations) {
    overrides.selectedLocations = query.selectedLocations
      .split(",")
      .map((s) => s.trim());
    overrides.locationMode = "SELECTED";
  }
  if (query.includeInventoryReport !== undefined)
    overrides.includeInventoryReport = query.includeInventoryReport !== "false";
  if (query.includeSummary !== undefined)
    overrides.includeSummary = query.includeSummary !== "false";
  if (query.includeLocationSheets !== undefined)
    overrides.includeLocationSheets = query.includeLocationSheets !== "false";
  if (query.includeSpecialStockSheets !== undefined)
    overrides.includeSpecialStockSheets =
      query.includeSpecialStockSheets !== "false";
  if (query.includeGLDetail !== undefined)
    overrides.includeGLDetail = query.includeGLDetail !== "false";
  if (query.includeGLSummary !== undefined)
    overrides.includeGLSummary = query.includeGLSummary !== "false";
  if (query.includePlantReconciliation !== undefined)
    overrides.includePlantReconciliation =
      query.includePlantReconciliation !== "false";
  if (query.includeLocationReconciliation !== undefined)
    overrides.includeLocationReconciliation =
      query.includeLocationReconciliation !== "false";
  if (query.includeTopVariances !== undefined)
    overrides.includeTopVariances = query.includeTopVariances !== "false";
  return Object.keys(overrides).length > 0 ? overrides : undefined;
}
