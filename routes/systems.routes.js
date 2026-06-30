const express = require("express");
const router = express.Router();

/**
 * Systems Routes (Phase 5)
 *
 * GET /api/projects/:projectId/systems
 *   Lists available SAP systems for a project.
 */
module.exports = function (projectResolver, systemRepository) {
  /**
   * GET /api/projects/:projectId/systems
   */
  router.get("/:projectId/systems", async (req, res) => {
    try {
      const { projectId } = req.params;

      if (!projectId) {
        return res.status(400).json({
          success: false,
          error: "projectId is required",
        });
      }

      // Resolve project → dbName
      const { dbName } = await projectResolver.resolve(projectId);

      // List systems
      const systems = await systemRepository.listSystems(dbName);

      const result = systems.map((sys) => ({
        systemID: sys.systemID || "",
        sapVersion: sys.sapVersion || sys.releaseVersion || "",
        client: sys.client || "",
        active: sys.active !== false,
        applicationServer: sys.applicationServer || "",
        connectionCount: (sys.connections || []).length,
      }));

      res.json({
        success: true,
        data: { systems: result },
        meta: { projectId, dbName, count: result.length },
      });
    } catch (err) {
      console.error("GET /api/projects/:projectId/systems error:", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
};
