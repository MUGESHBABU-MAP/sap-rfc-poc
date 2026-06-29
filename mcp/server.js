/**
 * MCP Server (Phase 4)
 *
 * JSON-RPC 2.0 server implementing MCP protocol.
 * Thin integration layer over existing services.
 *
 * Supports:
 *   - initialize
 *   - tools/list
 *   - tools/call
 *
 * Start: node mcp/server.js
 */
const { createContext } = require("./context");
const { getTool, getToolDefinitions } = require("./registry");

const SERVER_INFO = {
  name: "inventory-gl-reconciliation",
  version: "4.0.0",
  description: "Inventory & GL Reconciliation MCP Server",
};

let context = null;

/**
 * Handle a JSON-RPC request.
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

      case "tools/list":
        return jsonRpcSuccess(id, { tools: getToolDefinitions() });

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

  const tool = getTool(name);
  if (!tool) {
    return jsonRpcError(id, -32602, `Unknown tool: ${name}`);
  }

  // Ensure context and SAP connection
  if (!context) {
    context = createContext();
  }
  if (!context.connected) {
    await context.connect();
  }

  const startTime = Date.now();
  try {
    const result = await tool.handler(args || {}, context);
    const elapsed = Date.now() - startTime;
    logCall(name, elapsed, true);

    return jsonRpcSuccess(id, {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    });
  } catch (err) {
    const elapsed = Date.now() - startTime;
    logCall(name, elapsed, false, err.message);

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

function logCall(toolName, elapsed, success, error) {
  const status = success ? "OK" : "FAIL";
  const errorStr = error ? ` | ${error}` : "";
  console.log(`[MCP] ${toolName} | ${elapsed}ms | ${status}${errorStr}`);
}

/**
 * STDIO transport — reads JSON-RPC from stdin, writes to stdout.
 */
async function startStdioTransport() {
  console.error(
    `[MCP] ${SERVER_INFO.name} v${SERVER_INFO.version} starting (stdio)...`,
  );

  let buffer = "";

  process.stdin.setEncoding("utf8");
  process.stdin.on("data", async (chunk) => {
    buffer += chunk;

    // Process complete JSON messages (newline-delimited)
    const lines = buffer.split("\n");
    buffer = lines.pop(); // Keep incomplete line in buffer

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const request = JSON.parse(trimmed);
        const response = await handleRequest(request);
        if (response && request.id !== undefined) {
          process.stdout.write(JSON.stringify(response) + "\n");
        }
      } catch (err) {
        const errResponse = jsonRpcError(null, -32700, "Parse error");
        process.stdout.write(JSON.stringify(errResponse) + "\n");
      }
    }
  });

  process.stdin.on("end", async () => {
    if (context) await context.disconnect();
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    if (context) await context.disconnect();
    process.exit(0);
  });
}

// Start if run directly
if (require.main === module) {
  startStdioTransport();
}

module.exports = { handleRequest, SERVER_INFO };
