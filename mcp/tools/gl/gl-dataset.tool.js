/**
 * Tool: gl.dataset
 * Fetches GL balance records from FAGLFLEXT.
 */
module.exports = {
  name: "gl.dataset",
  description:
    "Extract GL balance records from SAP FAGLFLEXT. Returns cumulative balances per account.",
  inputSchema: {
    type: "object",
    properties: {
      companyCode: {
        type: "string",
        description: "SAP Company Code (e.g., '1000')",
      },
      fiscalYear: { type: "string", description: "Fiscal Year (e.g., '2026')" },
      inventoryAccounts: {
        type: "array",
        items: { type: "string" },
        description: "GL accounts to filter (optional)",
      },
    },
    required: ["companyCode"],
  },
  async handler(args, ctx) {
    const filters = {
      companyCode: args.companyCode,
      fiscalYear: args.fiscalYear,
      inventoryAccounts: args.inventoryAccounts,
    };
    const records = await ctx.glService.getGLBalances(filters);
    return {
      success: true,
      data: { recordCount: records.length, records },
      meta: { companyCode: args.companyCode, fiscalYear: args.fiscalYear },
    };
  },
};
