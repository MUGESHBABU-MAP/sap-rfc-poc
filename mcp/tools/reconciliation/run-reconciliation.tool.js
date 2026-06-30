/**
 * Tool: reconciliation.run
 * Executes a full reconciliation run and generates workbook.
 */
module.exports = {
  name: "reconciliation.run",
  description:
    "Execute a full Inventory vs GL reconciliation. Extracts data, runs reconciliation, generates workbook, and logs to audit trail.",
  inputSchema: {
    type: "object",
    properties: {
      projectId: { type: "string", description: "KTern project ID (optional)" },
      systemID: { type: "string", description: "SAP System ID (optional)" },
      companyCode: { type: "string", description: "SAP Company Code" },
      plant: { type: "string", description: "SAP Plant code" },
      fiscalYear: { type: "string", description: "Fiscal Year" },
      selectedAccounts: {
        type: "array",
        items: { type: "string" },
        description: "GL accounts (optional, defaults to config)",
      },
      workbookConfiguration: {
        type: "object",
        description: "Workbook config overrides (optional)",
      },
      triggeredBy: { type: "string", description: "User or system identifier" },
    },
    required: ["companyCode", "plant", "fiscalYear"],
  },
  async handler(args, ctx) {
    const { inventoryService, glService, companyService } =
      await ctx.getServices(args.projectId, args.systemID);

    // Create run configuration
    const runConfig = ctx.runConfigurationService.createRunConfiguration({
      companyCode: args.companyCode,
      plant: args.plant,
      fiscalYear: args.fiscalYear,
      selectedAccounts: args.selectedAccounts,
      workbookConfig: args.workbookConfiguration,
      triggeredBy: args.triggeredBy || "mcp",
    });

    const startTime = Date.now();

    // Get currency
    const companyData = await companyService.getCompanyCurrency(
      runConfig.companyCode,
    );

    // Extract inventory
    const inventoryRecords = await inventoryService.getInventoryDataset({
      plant: runConfig.plant,
    });

    // Determine account filter
    let glAccountFilter;
    if (runConfig.selectedAccounts.length > 0) {
      glAccountFilter = runConfig.selectedAccounts;
    } else {
      const configured =
        (ctx.accountMaster[runConfig.companyCode] || {}).inventoryAccounts ||
        [];
      glAccountFilter = configured.length > 0 ? configured : undefined;
    }

    // Extract GL
    const glRecords = await glService.getGLBalances({
      companyCode: runConfig.companyCode,
      fiscalYear: runConfig.fiscalYear,
      inventoryAccounts: glAccountFilter,
    });

    // Reconciliation
    const plantRecon = ctx.reconciliationService.reconcileByPlant(
      inventoryRecords,
      glRecords,
    );
    const locationRecon = ctx.reconciliationService.reconcileByStorageLocation(
      inventoryRecords,
      glRecords,
    );
    const topVariances = ctx.reconciliationService.getTopVariances(
      inventoryRecords,
      glRecords,
      100,
    );
    const summary = ctx.reconciliationService.getSummary(
      inventoryRecords,
      glRecords,
    );

    // Generate workbook
    const wbConfig =
      Object.keys(runConfig.workbookConfig).length > 0
        ? runConfig.workbookConfig
        : undefined;
    const result = await ctx.financeWorkbookService.generateFinanceWorkbook(
      { inventoryRecords, glRecords, plantRecon, locationRecon, topVariances },
      {
        companyCode: runConfig.companyCode,
        plant: runConfig.plant,
        fiscalYear: runConfig.fiscalYear,
        period: runConfig.fiscalPeriod,
        currency: companyData.currency,
      },
      wbConfig,
    );

    const executionTime = ((Date.now() - startTime) / 1000).toFixed(1);

    // Log to audit trail
    const totalInvValue = inventoryRecords.reduce(
      (s, r) => s + (r.totalInventoryValue || 0),
      0,
    );
    const totalGlValue = glRecords.reduce(
      (s, r) => s + (r.cumulativeBalance || 0),
      0,
    );

    ctx.auditTrailService.logRun({
      runId: runConfig.runId,
      runName: runConfig.runName,
      user: runConfig.triggeredBy,
      timestamp: new Date().toISOString(),
      companyCode: runConfig.companyCode,
      plant: runConfig.plant,
      fiscalYear: runConfig.fiscalYear,
      fiscalPeriod: runConfig.fiscalPeriod,
      selectedAccounts: glAccountFilter || [],
      inventoryRecords: inventoryRecords.length,
      glRecords: glRecords.length,
      inventoryValue: Math.round(totalInvValue * 100) / 100,
      glValue: Math.round(totalGlValue * 100) / 100,
      varianceAmount: Math.round((totalInvValue - totalGlValue) * 100) / 100,
      exceptionCount: topVariances.length,
      workbookPath: result.filePath || "",
      executionTimeSeconds: parseFloat(executionTime),
      status: "SUCCESS",
    });

    return {
      success: true,
      data: {
        runId: runConfig.runId,
        status: "SUCCESS",
        summary,
        variance: summary.totalVariance,
        outputPath: result.filePath || (result.files ? result.files[0] : ""),
        runStatistics: {
          inventoryRecords: inventoryRecords.length,
          glRecords: glRecords.length,
          sheetCount: result.sheetCount,
          executionTimeSeconds: parseFloat(executionTime),
          fileSizeMB: result.fileSizeMB,
        },
      },
    };
  },
};
