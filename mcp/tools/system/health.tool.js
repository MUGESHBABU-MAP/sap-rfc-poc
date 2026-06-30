/**
 * Tool: system.health
 * Returns system health and connection status.
 */
module.exports = {
  name: "system.health",
  description:
    "Check system health: connection factory status, server version, current time.",
  inputSchema: {
    type: "object",
    properties: {
      projectId: { type: "string", description: "KTern project ID (optional)" },
      systemID: { type: "string", description: "SAP System ID (optional)" },
    },
  },
  async handler(args, ctx) {
    return {
      success: true,
      data: {
        serverVersion: "5.0.0",
        currentTime: new Date().toISOString(),
        activeConnections: ctx.connectionFactory.getConnectionCount(),
        runHistoryCount: ctx.auditTrailService.getRunCount(),
        mongoConfigured: !!process.env.MONGO_URI,
      },
    };
  },
};
