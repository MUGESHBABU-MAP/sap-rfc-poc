/**
 * Tool: system.list
 * Lists available SAP systems for a KTern project.
 * Intended for UI dropdown population before reconciliation.
 *
 * NEVER exposes: passwords, usernames, hosts, clients, connection details.
 * Returns ONLY what the UI needs to display a system picker.
 */
module.exports = {
  name: "system.list",
  description:
    "List all SAP systems configured for a KTern project. Returns lightweight system info for UI dropdown (no credentials exposed).",
  inputSchema: {
    type: "object",
    properties: {
      projectId: { type: "string", description: "KTern Project ObjectId" },
    },
    required: ["projectId"],
  },
  async handler(args, ctx) {
    const startTime = Date.now();

    if (!args.projectId) {
      return {
        success: false,
        error: { code: "MISSING_PROJECT_ID", message: "projectId is required" },
      };
    }

    try {
      // Resolve project → dbName
      const { dbName } = await ctx.projectResolver.resolve(args.projectId);

      // List systems from repository
      const systems = await ctx.systemRepository.listSystems(dbName);

      // Map to lightweight DTO — never expose credentials
      const result = systems.map((sys) => {
        // Determine status from connections array
        const connections = sys.connections || [];
        const hasConnected = connections.some((c) => c.status === "Connected");
        const status = hasConnected
          ? "Connected"
          : connections.length > 0
            ? "Configured"
            : "No Connections";

        return {
          systemID: sys.systemID || sys.systemId || "",
          systemName:
            sys.systemName || sys.name || sys.systemID || sys.systemId || "",
          status,
          type: sys.type || "SAP",
          active: sys.active !== false,
        };
      });

      // Sort: Connected first, then alphabetically by systemName
      result.sort((a, b) => {
        if (a.status === "Connected" && b.status !== "Connected") return -1;
        if (b.status === "Connected" && a.status !== "Connected") return 1;
        return (a.systemName || "").localeCompare(b.systemName || "");
      });

      const elapsed = Date.now() - startTime;
      log(
        `project=${args.projectId} db=${dbName} systems=${result.length} ${elapsed}ms`,
      );

      return { success: true, data: result };
    } catch (err) {
      return {
        success: false,
        error: { code: "SYSTEM_LIST_FAILED", message: err.message },
      };
    }
  },
};

function log(msg) {
  console.log(`[SystemList] ${msg}`);
}
