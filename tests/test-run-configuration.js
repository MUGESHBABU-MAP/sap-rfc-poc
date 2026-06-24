/**
 * Phase 3.19 - Test Run Configuration
 *
 * Run: node tests/test-run-configuration.js
 *
 * Validates run configuration creation, validation, and normalization.
 * No SAP connection required.
 */
const RunConfigurationService = require("../services/run-configuration.service");

function runTests() {
  console.log(
    "╔══════════════════════════════════════════════════════════════╗",
  );
  console.log(
    "║   Phase 3.19 - Run Configuration Tests                       ║",
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

  const service = new RunConfigurationService();

  // --- Validation ---
  console.log("--- Validation ---\n");

  try {
    service.createRunConfiguration({});
    assert(false, "Should throw on missing required fields");
  } catch (e) {
    assert(e.message.includes("companyCode"), "Throws on missing companyCode");
  }

  try {
    service.createRunConfiguration({ companyCode: "1000" });
    assert(false, "Should throw on missing plant");
  } catch (e) {
    assert(e.message.includes("plant"), "Throws on missing plant");
  }

  try {
    service.createRunConfiguration({ companyCode: "1000", plant: "1000" });
    assert(false, "Should throw on missing fiscalYear");
  } catch (e) {
    assert(e.message.includes("fiscalYear"), "Throws on missing fiscalYear");
  }

  // --- Default Population ---
  console.log("\n--- Default Population ---\n");

  const cfg = service.createRunConfiguration({
    companyCode: "1000",
    plant: "1000",
    fiscalYear: "2026",
  });

  assert(cfg.runId.startsWith("run_"), `runId auto-generated: ${cfg.runId}`);
  assert(cfg.createdAt.length > 0, "createdAt populated");
  assert(
    cfg.runName.includes("1000"),
    `runName contains companyCode: ${cfg.runName}`,
  );
  assert(cfg.fiscalPeriod === "ALL", "fiscalPeriod defaults to ALL");
  assert(Array.isArray(cfg.selectedAccounts), "selectedAccounts is array");
  assert(
    cfg.selectedAccounts.length === 0,
    "selectedAccounts defaults to empty",
  );
  assert(typeof cfg.workbookConfig === "object", "workbookConfig is object");
  assert(cfg.triggeredBy === "system", "triggeredBy defaults to system");

  // --- Normalization ---
  console.log("\n--- Normalization ---\n");

  // String selectedAccounts
  const cfg2 = service.createRunConfiguration({
    companyCode: "1000",
    plant: "1000",
    fiscalYear: "2026",
    selectedAccounts: "0013000000, 0013200000, 0013300000",
  });
  assert(
    cfg2.selectedAccounts.length === 3,
    "Comma string normalized to array of 3",
  );
  assert(cfg2.selectedAccounts[0] === "0013000000", "First account trimmed");
  assert(cfg2.selectedAccounts[1] === "0013200000", "Second account trimmed");

  // Array selectedAccounts
  const cfg3 = service.createRunConfiguration({
    companyCode: "1000",
    plant: "1000",
    fiscalYear: "2026",
    selectedAccounts: ["0013000000", "0013200000"],
  });
  assert(cfg3.selectedAccounts.length === 2, "Array accounts preserved");

  // Whitespace trimming
  const cfg4 = service.createRunConfiguration({
    companyCode: " 1000 ",
    plant: " 1000 ",
    fiscalYear: " 2026 ",
  });
  assert(cfg4.companyCode === "1000", "companyCode trimmed");
  assert(cfg4.plant === "1000", "plant trimmed");
  assert(cfg4.fiscalYear === "2026", "fiscalYear trimmed");

  // Custom values
  const cfg5 = service.createRunConfiguration({
    companyCode: "1000",
    plant: "1000",
    fiscalYear: "2026",
    runId: "custom_run_001",
    runName: "Monthly Close",
    triggeredBy: "john.doe",
    fiscalPeriod: "06",
  });
  assert(cfg5.runId === "custom_run_001", "Custom runId preserved");
  assert(cfg5.runName === "Monthly Close", "Custom runName preserved");
  assert(cfg5.triggeredBy === "john.doe", "Custom triggeredBy preserved");
  assert(cfg5.fiscalPeriod === "06", "Custom fiscalPeriod preserved");

  // --- Backward Compatibility (fromQueryParams) ---
  console.log("\n--- Backward Compatibility (fromQueryParams) ---\n");

  const qcfg = service.fromQueryParams({
    companyCode: "1000",
    plant: "1000",
    fiscalYear: "2026",
    period: "06",
    selectedAccounts: "0013000000,0013200000",
  });
  assert(qcfg.companyCode === "1000", "Query: companyCode");
  assert(qcfg.fiscalPeriod === "06", "Query: period → fiscalPeriod");
  assert(qcfg.selectedAccounts.length === 2, "Query: selectedAccounts parsed");

  // Workbook config from query
  const qcfg2 = service.fromQueryParams({
    companyCode: "1000",
    plant: "1000",
    fiscalYear: "2026",
    detailMode: "SUMMARY_ONLY",
    locationMode: "NONE",
  });
  assert(
    qcfg2.workbookConfig.detailMode === "SUMMARY_ONLY",
    "Query: detailMode in config",
  );
  assert(
    qcfg2.workbookConfig.locationMode === "NONE",
    "Query: locationMode in config",
  );

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

runTests();
