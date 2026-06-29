/**
 * Tool: system.connection
 * Validates SAP RFC connection.
 */
module.exports = {
  name: "system.connection",
  description:
    "Validate SAP RFC connection. Attempts ping and returns connection details.",
  inputSchema: { type: "object", properties: {} },
  async handler(args, ctx) {
    const startTime = Date.now();
    try {
      // Attempt a lightweight read to verify connection
      const result = await ctx.sapService.readTable("T000", ["MANDT"], {
        rowCount: 1,
      });
      const elapsed = Date.now() - startTime;
      return {
        success: true,
        data: {
          connected: true,
          responseTimeMs: elapsed,
          sapClient: process.env.SAP_CLIENT || "",
          sapHost: process.env.SAP_ASHOST || "",
          sapLanguage: process.env.SAP_LANG || "",
        },
      };
    } catch (err) {
      const elapsed = Date.now() - startTime;
      return {
        success: false,
        data: {
          connected: false,
          responseTimeMs: elapsed,
          error: err.message,
        },
      };
    }
  },
};
