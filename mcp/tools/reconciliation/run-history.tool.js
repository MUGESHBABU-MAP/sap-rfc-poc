/**
 * Tool: reconciliation.history
 * Retrieves reconciliation run history from audit trail.
 */
module.exports = {
  name: "reconciliation.history",
  description:
    "Get reconciliation run history. Supports filtering by company code, plant, fiscal year, user, and date range.",
  inputSchema: {
    type: "object",
    properties: {
      companyCode: { type: "string", description: "Filter by company code" },
      plant: { type: "string", description: "Filter by plant" },
      fiscalYear: { type: "string", description: "Filter by fiscal year" },
      user: { type: "string", description: "Filter by user" },
      fromDate: { type: "string", description: "Filter from date (ISO)" },
      toDate: { type: "string", description: "Filter to date (ISO)" },
      runId: { type: "string", description: "Get a specific run by ID" },
    },
  },
  async handler(args, ctx) {
    if (args.runId) {
      const run = ctx.auditTrailService.getRun(args.runId);
      if (!run)
        return {
          success: false,
          error: { code: "NOT_FOUND", message: `Run ${args.runId} not found` },
        };
      return { success: true, data: run };
    }

    const history = ctx.auditTrailService.getRunHistory({
      companyCode: args.companyCode,
      plant: args.plant,
      fiscalYear: args.fiscalYear,
      user: args.user,
      fromDate: args.fromDate,
      toDate: args.toDate,
    });

    return { success: true, data: { count: history.length, runs: history } };
  },
};
