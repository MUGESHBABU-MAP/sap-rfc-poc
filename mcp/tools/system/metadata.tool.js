/**
 * Tool: system.metadata
 * Returns server metadata and configured parameters.
 */
module.exports = {
  name: "system.metadata",
  description:
    "Get server metadata: configured company codes, accounts, workbook defaults.",
  inputSchema: { type: "object", properties: {} },
  async handler(args, ctx) {
    const companyCodes = Object.keys(ctx.accountMaster);
    const accountInfo = {};
    for (const cc of companyCodes) {
      accountInfo[cc] = {
        inventoryAccounts:
          (ctx.accountMaster[cc] || {}).inventoryAccounts || [],
      };
    }
    return {
      success: true,
      data: {
        serverName: "inventory-gl-reconciliation",
        version: "4.0.0",
        configuredCompanyCodes: companyCodes,
        accountConfiguration: accountInfo,
        defaultPlant: process.env.TEST_PLANT || "1000",
        defaultFiscalYear: process.env.TEST_FISCAL_YEAR || "2026",
      },
    };
  },
};
