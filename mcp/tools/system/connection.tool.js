/**
 * Tool: system.connection
 * Validates SAP RFC connection for a specific project/system.
 */
module.exports = {
  name: "system.connection",
  description:
    "Validate SAP RFC connection. Resolves credentials via project/system, connects, and returns connection details.",
  inputSchema: {
    type: "object",
    properties: {
      projectId: {
        type: "string",
        description: "KTern project ID (optional, falls back to ENV)",
      },
      systemID: {
        type: "string",
        description: "SAP System ID (optional, falls back to ENV)",
      },
    },
  },
  async handler(args, ctx) {
    const startTime = Date.now();
    try {
      const { sapService } = await ctx.getServices(
        args.projectId,
        args.systemID,
      );

      // Verify connection with a lightweight read
      await sapService.readTable("T000", ["MANDT"], { rowCount: 1 });
      const elapsed = Date.now() - startTime;

      // Determine which credentials were actually used
      const credentials = await ctx.credentialProvider.resolve(
        args.projectId,
        args.systemID,
      );

      return {
        success: true,
        data: {
          connected: true,
          responseTimeMs: elapsed,
          source: credentials.source,
          sapClient: credentials.client,
          sapHost: credentials.ashost,
          sapLanguage: credentials.lang,
          projectId: args.projectId || null,
          systemID: args.systemID || null,
          dbName: credentials.dbName || null,
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
          projectId: args.projectId || null,
          systemID: args.systemID || null,
        },
      };
    }
  },
};
