/**
 * Tool: inventory.specialStock
 * Returns special stock distribution (E, O, W, UNASSIGNED).
 */
module.exports = {
  name: "inventory.specialStock",
  description:
    "Get special stock distribution: Sales Order (E), Vendor Consignment (O), Customer Consignment (W), and Normal (UNASSIGNED).",
  inputSchema: {
    type: "object",
    properties: {
      projectId: { type: "string", description: "KTern project ID (optional)" },
      systemID: { type: "string", description: "SAP System ID (optional)" },
      plant: { type: "string", description: "SAP Plant code" },
    },
    required: ["plant"],
  },
  async handler(args, ctx) {
    const { inventoryService } = await ctx.getServices(
      args.projectId,
      args.systemID,
    );
    const records = await inventoryService.getInventoryDataset({
      plant: args.plant,
    });
    const distribution = { E: 0, O: 0, W: 0, UNASSIGNED: 0 };
    for (const r of records) {
      const ind = r.specialStockIndicator || "";
      if (ind === "E" || ind === "O" || ind === "W") distribution[ind]++;
      else distribution.UNASSIGNED++;
    }
    return {
      success: true,
      data: { totalRecords: records.length, distribution },
      meta: { plant: args.plant },
    };
  },
};
