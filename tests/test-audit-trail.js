/**
 * Phase 3.20 - Test Audit Trail
 *
 * Run: node tests/test-audit-trail.js
 *
 * Tests audit trail write, read, filter, and Excel export.
 * No SAP connection required.
 */
const path = require("path");
const fs = require("fs");
const ExcelJS = require("exceljs");

const AuditTrailService = require("../services/audit-trail.service");
const RunConfigurationService = require("../services/run-configuration.service");

const OUTPUT_DIR = path.resolve(__dirname, "../output");

async function runTests() {
  console.log(
    "╔══════════════════════════════════════════════════════════════╗",
  );
  console.log(
    "║   Phase 3.20 - Audit Trail Tests                             ║",
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

  const auditTrail = new AuditTrailService();
  const runConfig = new RunConfigurationService();

  // Clear history for clean test
  auditTrail.clearHistory();

  // --- Write Log ---
  console.log("--- Write Log ---\n");

  const run1 = runConfig.createRunConfiguration({
    companyCode: "1000",
    plant: "1000",
    fiscalYear: "2026",
    triggeredBy: "test-user",
  });

  const log1 = auditTrail.logRun({
    runId: run1.runId,
    runName: run1.runName,
    user: run1.triggeredBy,
    timestamp: new Date().toISOString(),
    companyCode: run1.companyCode,
    plant: run1.plant,
    fiscalYear: run1.fiscalYear,
    fiscalPeriod: run1.fiscalPeriod,
    selectedAccounts: ["0013000000", "0013200000"],
    inventoryRecords: 1672986,
    glRecords: 416,
    inventoryValue: 45000000.5,
    glValue: 44900000.25,
    varianceAmount: 100000.25,
    exceptionCount: 12,
    workbookPath: "/output/Inventory_GL_Reconciliation_1000_2026.xlsx",
    executionTimeSeconds: 530,
    status: "SUCCESS",
  });

  assert(log1.runId === run1.runId, "Log written with correct runId");
  assert(log1.status === "SUCCESS", "Log status = SUCCESS");
  assert(log1.inventoryRecords === 1672986, "inventoryRecords captured");

  // Write a second run (different plant)
  const run2 = runConfig.createRunConfiguration({
    companyCode: "1000",
    plant: "2000",
    fiscalYear: "2026",
    triggeredBy: "admin",
  });

  auditTrail.logRun({
    runId: run2.runId,
    runName: run2.runName,
    user: run2.triggeredBy,
    timestamp: new Date().toISOString(),
    companyCode: "1000",
    plant: "2000",
    fiscalYear: "2026",
    inventoryRecords: 50000,
    glRecords: 100,
    inventoryValue: 5000000,
    glValue: 4999000,
    varianceAmount: 1000,
    exceptionCount: 3,
    executionTimeSeconds: 45,
    status: "SUCCESS",
  });

  // Write a failed run
  const run3 = runConfig.createRunConfiguration({
    companyCode: "1000",
    plant: "1000",
    fiscalYear: "2025",
    triggeredBy: "test-user",
  });

  auditTrail.logRun({
    runId: run3.runId,
    runName: run3.runName,
    user: run3.triggeredBy,
    timestamp: new Date().toISOString(),
    companyCode: "1000",
    plant: "1000",
    fiscalYear: "2025",
    status: "FAILED",
    errorMessage: "SAP connection timeout",
    executionTimeSeconds: 30,
  });

  // --- Read Log ---
  console.log("\n--- Read Log ---\n");

  const allHistory = auditTrail.getRunHistory();
  assert(allHistory.length === 3, `Total runs: 3 (got ${allHistory.length})`);

  const singleRun = auditTrail.getRun(run1.runId);
  assert(singleRun !== null, "getRun returns log entry");
  assert(singleRun.runId === run1.runId, "getRun correct runId");

  const noRun = auditTrail.getRun("nonexistent_id");
  assert(noRun === null, "getRun returns null for missing ID");

  // --- Filter Log ---
  console.log("\n--- Filter Log ---\n");

  const plantFilter = auditTrail.getRunHistory({ plant: "2000" });
  assert(
    plantFilter.length === 1,
    `Filter plant=2000: 1 result (got ${plantFilter.length})`,
  );

  const userFilter = auditTrail.getRunHistory({ user: "test-user" });
  assert(
    userFilter.length === 2,
    `Filter user=test-user: 2 results (got ${userFilter.length})`,
  );

  const yearFilter = auditTrail.getRunHistory({ fiscalYear: "2025" });
  assert(
    yearFilter.length === 1,
    `Filter year=2025: 1 result (got ${yearFilter.length})`,
  );
  assert(yearFilter[0].status === "FAILED", "2025 run is FAILED");

  // --- Run Count ---
  console.log("\n--- Metrics ---\n");

  assert(
    auditTrail.getRunCount() === 3,
    `Run count: 3 (got ${auditTrail.getRunCount()})`,
  );

  // --- Generate Excel ---
  console.log("\n--- Excel Export ---\n");

  await generateRunHistoryWorkbook(auditTrail);
  const xlsxPath = path.join(OUTPUT_DIR, "Reconciliation_Run_History.xlsx");
  assert(fs.existsSync(xlsxPath), "Reconciliation_Run_History.xlsx generated");

  // Verify sheets
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsxPath);
  const sheetNames = wb.worksheets.map((ws) => ws.name);
  assert(sheetNames.includes("Run History"), 'Has "Run History" sheet');
  assert(sheetNames.includes("Summary"), 'Has "Summary" sheet');

  // --- Delete Old Runs ---
  console.log("\n--- Delete Old Runs ---\n");

  // deleteOldRuns(1) = delete runs older than 1 day. All runs are from today, so 0 deleted.
  const deleted = auditTrail.deleteOldRuns(1);
  assert(deleted === 0, `Delete runs >1 day old: 0 deleted (got ${deleted})`);

  // --- Failed Run Logging ---
  console.log("\n--- Failed Run Logging ---\n");

  const failedRuns = auditTrail
    .getRunHistory()
    .filter((r) => r.status === "FAILED");
  assert(failedRuns.length === 1, `Failed runs: 1 (got ${failedRuns.length})`);
  assert(
    failedRuns[0].errorMessage === "SAP connection timeout",
    "Error message captured",
  );

  // --- Cleanup ---
  auditTrail.clearHistory();
  assert(auditTrail.getRunCount() === 0, "History cleared");

  // --- Results ---
  console.log(
    "\n═══════════════════════════════════════════════════════════════",
  );
  console.log(
    `  RESULTS: ${passed} passed, ${failed} failed, ${passed + failed} total`,
  );
  console.log(
    `  STATUS: ${failed === 0 ? "ALL PASS ✓" : "FAILURES DETECTED ✗"}`,
  );
  console.log(
    "═══════════════════════════════════════════════════════════════\n",
  );

  if (failed > 0) process.exit(1);
}

/**
 * Generate Reconciliation_Run_History.xlsx
 */
async function generateRunHistoryWorkbook(auditTrail) {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const history = auditTrail.getRunHistory();
  const filePath = path.join(OUTPUT_DIR, "Reconciliation_Run_History.xlsx");
  const workbook = new ExcelJS.Workbook();

  // Sheet 1: Run History
  const sheet1 = workbook.addWorksheet("Run History");
  sheet1.columns = [
    { header: "Run ID", key: "runId", width: 24 },
    { header: "Run Name", key: "runName", width: 30 },
    { header: "User", key: "user", width: 14 },
    { header: "Timestamp", key: "timestamp", width: 22 },
    { header: "Company", key: "companyCode", width: 10 },
    { header: "Plant", key: "plant", width: 8 },
    { header: "Year", key: "fiscalYear", width: 6 },
    { header: "Inv Records", key: "inventoryRecords", width: 12 },
    { header: "GL Records", key: "glRecords", width: 10 },
    { header: "Inv Value", key: "inventoryValue", width: 16 },
    { header: "GL Value", key: "glValue", width: 16 },
    { header: "Variance", key: "varianceAmount", width: 14 },
    { header: "Exceptions", key: "exceptionCount", width: 10 },
    { header: "Time (s)", key: "executionTimeSeconds", width: 9 },
    { header: "Status", key: "status", width: 10 },
    { header: "Error", key: "errorMessage", width: 30 },
  ];
  for (let i = 0; i < history.length; i++) {
    sheet1.addRow(history[i]);
  }

  // Sheet 2: Summary
  const sheet2 = workbook.addWorksheet("Summary");
  sheet2.columns = [
    { header: "Metric", key: "metric", width: 35 },
    { header: "Value", key: "value", width: 25 },
  ];

  const successful = history.filter((r) => r.status === "SUCCESS");
  const failedRuns = history.filter((r) => r.status === "FAILED");
  const avgRuntime =
    successful.length > 0
      ? (
          successful.reduce((s, r) => s + (r.executionTimeSeconds || 0), 0) /
          successful.length
        ).toFixed(1)
      : "0";
  const avgVariance =
    successful.length > 0
      ? (
          successful.reduce((s, r) => s + Math.abs(r.varianceAmount || 0), 0) /
          successful.length
        ).toFixed(2)
      : "0";

  // Most used plant/company
  const plantCounts = {};
  const ccCounts = {};
  for (const r of history) {
    plantCounts[r.plant] = (plantCounts[r.plant] || 0) + 1;
    ccCounts[r.companyCode] = (ccCounts[r.companyCode] || 0) + 1;
  }
  const topPlant = Object.entries(plantCounts).sort((a, b) => b[1] - a[1])[0];
  const topCC = Object.entries(ccCounts).sort((a, b) => b[1] - a[1])[0];

  const summaryRows = [
    { metric: "Total Runs", value: String(history.length) },
    { metric: "Successful Runs", value: String(successful.length) },
    { metric: "Failed Runs", value: String(failedRuns.length) },
    { metric: "Most Used Plant", value: topPlant ? topPlant[0] : "N/A" },
    { metric: "Most Used Company", value: topCC ? topCC[0] : "N/A" },
    { metric: "Average Runtime (seconds)", value: avgRuntime },
    { metric: "Average Variance (absolute)", value: avgVariance },
  ];
  for (let i = 0; i < summaryRows.length; i++) {
    sheet2.addRow(summaryRows[i]);
  }

  await workbook.xlsx.writeFile(filePath);
  console.log(`  File: ${filePath}`);
}

runTests().catch((err) => {
  console.error("FATAL:", err.message || err);
  process.exit(1);
});
