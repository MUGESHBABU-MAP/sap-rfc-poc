/**
 * Tool: configuration.validate
 * Validates run configuration parameters.
 */
module.exports = {
  name: "configuration.validate",
  description:
    "Validate reconciliation configuration parameters (company code, plant, accounts, workbook config).",
  inputSchema: {
    type: "object",
    properties: {
      companyCode: { type: "string", description: "Company Code to validate" },
      plant: { type: "string", description: "Plant to validate" },
      fiscalYear: { type: "string", description: "Fiscal Year" },
      selectedAccounts: {
        type: "array",
        items: { type: "string" },
        description: "Accounts to validate",
      },
      workbookConfiguration: {
        type: "object",
        description: "Workbook config to validate",
      },
    },
    required: ["companyCode", "plant", "fiscalYear"],
  },
  async handler(args, ctx) {
    const warnings = [];
    const errors = [];

    // Validate run configuration creation
    try {
      ctx.runConfigurationService.createRunConfiguration({
        companyCode: args.companyCode,
        plant: args.plant,
        fiscalYear: args.fiscalYear,
        selectedAccounts: args.selectedAccounts,
        workbookConfig: args.workbookConfiguration,
      });
    } catch (e) {
      errors.push(e.message);
    }

    // Validate accounts exist in config
    const configured =
      (ctx.accountMaster[args.companyCode] || {}).inventoryAccounts || [];
    if (
      configured.length === 0 &&
      (!args.selectedAccounts || args.selectedAccounts.length === 0)
    ) {
      warnings.push(
        `No inventory accounts configured for company code ${args.companyCode}. GL extraction will return all accounts.`,
      );
    }

    // Validate workbook config values
    if (args.workbookConfiguration) {
      const validModes = ["FULL", "SUMMARY_ONLY"];
      const validLocModes = ["ALL", "NONE", "SELECTED"];
      const validWbModes = ["SINGLE", "SPLIT"];
      if (
        args.workbookConfiguration.detailMode &&
        !validModes.includes(args.workbookConfiguration.detailMode)
      ) {
        errors.push(
          `Invalid detailMode: ${args.workbookConfiguration.detailMode}. Valid: ${validModes.join(", ")}`,
        );
      }
      if (
        args.workbookConfiguration.locationMode &&
        !validLocModes.includes(args.workbookConfiguration.locationMode)
      ) {
        errors.push(
          `Invalid locationMode: ${args.workbookConfiguration.locationMode}. Valid: ${validLocModes.join(", ")}`,
        );
      }
      if (
        args.workbookConfiguration.workbookMode &&
        !validWbModes.includes(args.workbookConfiguration.workbookMode)
      ) {
        errors.push(
          `Invalid workbookMode: ${args.workbookConfiguration.workbookMode}. Valid: ${validWbModes.join(", ")}`,
        );
      }
    }

    return {
      success: errors.length === 0,
      data: {
        valid: errors.length === 0,
        errors,
        warnings,
        configuredAccounts: configured.length,
        selectedAccounts: (args.selectedAccounts || []).length,
      },
    };
  },
};
