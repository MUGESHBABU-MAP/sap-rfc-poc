/**
 * Tool: inventory.dataset
 * Fetches full inventory dataset from SAP.
 */
module.exports = {
  name: "inventory.dataset",
  description:
    "Extract inventory dataset from SAP (MARD, MARA, MAKT, MARC, MBEW, MCHB, MSLB, MSKU, MSKA). Returns normalized inventory records.",
  inputSchema: {
    type: "object",
    properties: {
      plant: { type: "string", description: "SAP Plant code (e.g., '1000')" },
      storageLocation: {
        type: "string",
        description: "Storage location filter (optional)",
      },
      material: {
        type: "string",
        description: "Material number filter (optional)",
      },
    },
    required: ["plant"],
  },
  async handler(args, ctx) {
    const records = await ctx.inventoryService.getInventoryDataset({
      plant: args.plant,
      storageLocation: args.storageLocation,
      material: args.material,
    });
    return {
      success: true,
      data: { recordCount: records.length, records: records.slice(0, 100) },
      meta: {
        plant: args.plant,
        totalRecords: records.length,
        truncated: records.length > 100,
      },
    };
  },
};
