/**
 * MCP Server (Phase 4.1)
 *
 * HTTP-based MCP server using Express.
 * Implements MCP protocol (JSON-RPC 2.0) over HTTP POST /mcp.
 *
 * Architecture:
 *   Express → HTTP Transport → Request Handler → Tool Registry → Services → SAP
 *
 * NOTE: Official @modelcontextprotocol/sdk requires Node 18+ and ESM modules.
 * This project requires Node 14 + CommonJS (node-rfc dependency).
 * This server implements the same MCP protocol interface manually,
 * producing identical JSON-RPC responses that any MCP client can consume.
 *
 * Start: node mcp/server.js
 * Endpoint: POST http://localhost:{MCP_PORT}/mcp
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const express = require("express");
const { createContext } = require("./context");
const { createHttpTransport } = require("./transport/httpTransport");
const {
  buildToolDefinitions,
  executeTool,
  ToolNotFoundError,
} = require("./registration/registerTools");
const { authMiddleware, isAuthEnabled } = require("./auth/authProvider");

const MCP_PORT = parseInt(process.env.MCP_PORT) || 3001;
const MCP_HOST = process.env.MCP_HOST || "0.0.0.0";

const SERVER_INFO = {
  name: "inventory-gl-reconciliation",
  version: "4.1.0",
  description: "Inventory & GL Reconciliation MCP Server (HTTP Transport)",
};

let context = null;

/**
 * Handle a JSON-RPC MCP request.
 * @param {object} request - { jsonrpc, id, method, params }
 * @returns {object} JSON-RPC response
 */
async function handleRequest(request) {
  const { id, method, params } = request;

  try {
    switch (method) {
      case "initialize":
        return jsonRpcSuccess(id, {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
        });

      case "notifications/initialized":
        // Client notification — no response needed
        return null;

      case "tools/list":
        return jsonRpcSuccess(id, { tools: buildToolDefinitions() });

      case "tools/call":
        return await handleToolCall(id, params);

      default:
        return jsonRpcError(id, -32601, `Method not found: ${method}`);
    }
  } catch (err) {
    return jsonRpcError(id, -32603, err.message);
  }
}

/**
 * Handle tools/call request.
 */
async function handleToolCall(id, params) {
  const { name, arguments: args } = params || {};

  if (!name) {
    return jsonRpcError(id, -32602, "Missing tool name");
  }

  // Check tool exists BEFORE attempting SAP connection
  const { getTool } = require("./registry");
  if (!getTool(name)) {
    return jsonRpcError(id, -32602, `Unknown tool: ${name}`);
  }

  // Ensure context exists (tools manage their own SAP connections via ctx.getServices)
  if (!context) {
    context = createContext();
  }

  const startTime = Date.now();
  try {
    const result = await executeTool(name, args || {}, context);
    const elapsed = Date.now() - startTime;
    log("INFO", `${name} | ${elapsed}ms | OK`);

    return jsonRpcSuccess(id, {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    });
  } catch (err) {
    const elapsed = Date.now() - startTime;

    if (err instanceof ToolNotFoundError) {
      log("WARN", `${name} | ${elapsed}ms | NOT_FOUND`);
      return jsonRpcError(id, -32602, err.message);
    }

    log("ERROR", `${name} | ${elapsed}ms | FAIL | ${err.message}`);
    return jsonRpcSuccess(id, {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: false,
            error: { code: "TOOL_ERROR", message: err.message },
          }),
        },
      ],
      isError: true,
    });
  }
}

function jsonRpcSuccess(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function jsonRpcError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function log(level, message) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [MCP] [${level}] ${message}`);
}

/**
 * Start the HTTP MCP server.
 */
function startServer() {
  const app = express();

  // Mount MCP transport at /mcp
  const transportOptions = {};
  if (isAuthEnabled()) {
    transportOptions.authMiddleware = authMiddleware;
  }
  const mcpRouter = createHttpTransport(handleRequest, transportOptions);
  app.use("/mcp", mcpRouter);

  // Health endpoint
  app.get("/health", (req, res) => {
    res.json({
      status: "ok",
      server: SERVER_INFO,
      sapConnected: context ? context.connected : false,
      uptime: process.uptime(),
    });
  });

  app.listen(MCP_PORT, MCP_HOST, () => {
    log("INFO", `${SERVER_INFO.name} v${SERVER_INFO.version}`);
    log("INFO", `Listening on http://${MCP_HOST}:${MCP_PORT}/mcp`);
    log("INFO", `Health: http://${MCP_HOST}:${MCP_PORT}/health`);
    log("INFO", `Transport: HTTP POST`);
    log("INFO", `Auth: ${isAuthEnabled() ? "ENABLED" : "DISABLED (stub)"}`);
    log("INFO", `Tools: ${buildToolDefinitions().length} registered`);
  });

  // Graceful shutdown
  process.on("SIGINT", async () => {
    log("INFO", "Shutting down...");
    if (context) await context.disconnectAll();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    log("INFO", "Shutting down...");
    if (context) await context.disconnectAll();
    process.exit(0);
  });
}

// Start if run directly
if (require.main === module) {
  startServer();
}

module.exports = { handleRequest, SERVER_INFO, startServer };
