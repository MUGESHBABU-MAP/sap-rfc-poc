/**
 * MCP HTTP Transport (Phase 4.1)
 *
 * Implements MCP Streamable HTTP transport over Express.
 * Handles POST /mcp endpoint following the MCP specification.
 *
 * Protocol: JSON-RPC 2.0
 * Content-Type: application/json
 *
 * NOTE: Official @modelcontextprotocol/sdk requires Node 18+ and ESM.
 * This project uses Node 14 + CommonJS (required by node-rfc).
 * This transport implements the same protocol interface manually.
 */
const express = require("express");

/**
 * Create an Express router that handles MCP HTTP transport.
 *
 * @param {Function} requestHandler - async (request) => response
 * @param {object} [options]
 * @param {Function} [options.authMiddleware] - Express middleware for authentication (future)
 * @returns {express.Router}
 */
function createHttpTransport(requestHandler, options = {}) {
  const router = express.Router();

  // Future: authentication middleware hook
  if (options.authMiddleware) {
    router.use(options.authMiddleware);
  }

  // MCP endpoint
  router.post("/", express.json(), async (req, res) => {
    try {
      const request = req.body;

      // Validate JSON-RPC structure
      if (!request || !request.jsonrpc || request.jsonrpc !== "2.0") {
        return res.status(400).json({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32600, message: "Invalid JSON-RPC request" },
        });
      }

      if (!request.method) {
        return res.status(400).json({
          jsonrpc: "2.0",
          id: request.id || null,
          error: { code: -32600, message: "Missing method" },
        });
      }

      // Handle the request
      const response = await requestHandler(request);

      // Notifications (no id) don't get responses
      if (request.id === undefined || request.id === null) {
        return res.status(204).send();
      }

      res.json(response);
    } catch (err) {
      res.status(500).json({
        jsonrpc: "2.0",
        id: (req.body && req.body.id) || null,
        error: { code: -32603, message: "Internal server error" },
      });
    }
  });

  // GET for server info (optional, useful for health checks)
  router.get("/", (req, res) => {
    res.json({
      name: "inventory-gl-reconciliation",
      version: "4.1.0",
      protocol: "MCP",
      transport: "Streamable HTTP",
      endpoint: "POST /mcp",
    });
  });

  return router;
}

module.exports = { createHttpTransport };
