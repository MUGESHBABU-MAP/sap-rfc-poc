/**
 * Tool: system.health
 * Returns system health and connection status.
 */
module.exports = {
  name: "system.health",
  description:
    "Check system health: SAP connection status, server version, current time.",
  inputSchema: { type: "object", properties: {} },
  async handler(args, ctx) {
    return {
      success: true,
      data: {
        sapConnected: ctx.connected,
        serverVersion: "4.0.0",
        currentTime: new Date().toISOString(),
        runHistoryCount: ctx.auditTrailService.getRunCount(),
      },
    };
  },
};
