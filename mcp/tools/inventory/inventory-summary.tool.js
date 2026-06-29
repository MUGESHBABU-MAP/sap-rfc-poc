/**
 * Tool: inventory.summary
 * Returns inventory summary grouped by storage location.
 */
module.exports = {
  name: "inventory.summary",
  description:
    "Get inventory summary by storage location. Aggregates quantities and values per location.",
  inputSchema: {
    type: "object",
    properties: {
      plant: { type: "string", description: "SAP Plant code" },
    },
    required: ["plant"],
  },
  async handler(args, ctx) {
    const records = await ctx.inventoryService.getInventoryDataset({
      plant: args.plant,
    });
    const summary = ctx.inventorySummary.summarizeByLocation(records);
    return {
      success: true,
      data: { locationCount: summary.length, summary },
      meta: { plant: args.plant, totalRecords: records.length },
    };
  },
};
