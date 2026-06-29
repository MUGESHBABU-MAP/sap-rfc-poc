/**
 * Tool: gl.summary
 * Returns GL summary grouped by company code.
 */
module.exports = {
  name: "gl.summary",
  description: "Get GL balance summary grouped by company code.",
  inputSchema: {
    type: "object",
    properties: {
      companyCode: { type: "string", description: "SAP Company Code" },
      fiscalYear: { type: "string", description: "Fiscal Year" },
    },
    required: ["companyCode"],
  },
  async handler(args, ctx) {
    const records = await ctx.glService.getGLBalances({
      companyCode: args.companyCode,
      fiscalYear: args.fiscalYear,
    });
    const summary = ctx.glSummary.summarizeByCompanyCode(records);
    return {
      success: true,
      data: { summary },
      meta: { totalRecords: records.length },
    };
  },
};
