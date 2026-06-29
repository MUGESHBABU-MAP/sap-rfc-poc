/**
 * MCP Protocol Integration Tests (Phase 4.1)
 *
 * Run: node mcp/tests/test-mcp-protocol.js
 *
 * Tests:
 *   - JSON-RPC protocol compliance
 *   - Tool registry and definitions
 *   - HTTP transport behavior
 *   - Error handling
 *
 * Does NOT require SAP connection (tests protocol layer only).
 */
const { handleRequest, SERVER_INFO } = require("../server");
const { getAllTools, getTool, getToolDefinitions } = require("../registry");
const {
  buildToolDefinitions,
  ToolNotFoundError,
} = require("../registration/registerTools");

async function runTests() {
  console.log(
    "╔══════════════════════════════════════════════════════════════╗",
  );
  console.log(
    "║   Phase 4.1 - MCP Protocol Integration Tests                 ║",
  );
  console.log(
    "╚══════════════════════════════════════════════════════════════╝\n",
  );

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ ${message}`);
      passed++;
    } else {
      console.log(`  ✗ FAIL: ${message}`);
      failed++;
    }
  }

  // --- Registry ---
  console.log("--- Tool Registry ---\n");

  const allTools = getAllTools();
  assert(
    allTools.length === 11,
    `Registry has 11 tools (got ${allTools.length})`,
  );

  const expectedTools = [
    "inventory.dataset",
    "inventory.summary",
    "inventory.specialStock",
    "gl.dataset",
    "gl.summary",
    "reconciliation.run",
    "reconciliation.history",
    "configuration.validate",
    "system.health",
    "system.connection",
    "system.metadata",
  ];
  for (const name of expectedTools) {
    assert(getTool(name) !== null, `Tool registered: ${name}`);
  }

  assert(getTool("nonexistent") === null, "Unknown tool returns null");

  // --- Tool Definitions ---
  console.log("\n--- Tool Definitions ---\n");

  const defs = buildToolDefinitions();
  assert(defs.length === 11, `buildToolDefinitions: 11 tools`);
  for (const def of defs) {
    assert(
      def.name && def.description && def.inputSchema,
      `${def.name}: has name/description/inputSchema`,
    );
  }

  // --- Protocol: initialize ---
  console.log("\n--- Protocol: initialize ---\n");

  const initResp = await handleRequest({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {},
  });
  assert(initResp.jsonrpc === "2.0", "initialize: jsonrpc=2.0");
  assert(initResp.id === 1, "initialize: id preserved");
  assert(
    initResp.result.protocolVersion === "2024-11-05",
    "initialize: protocolVersion",
  );
  assert(
    initResp.result.serverInfo.name === SERVER_INFO.name,
    "initialize: serverInfo.name",
  );
  assert(
    initResp.result.serverInfo.version === "4.1.0",
    "initialize: version=4.1.0",
  );
  assert(
    initResp.result.capabilities.tools !== undefined,
    "initialize: tools capability",
  );

  // --- Protocol: tools/list ---
  console.log("\n--- Protocol: tools/list ---\n");

  const listResp = await handleRequest({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {},
  });
  assert(listResp.jsonrpc === "2.0", "tools/list: jsonrpc=2.0");
  assert(listResp.id === 2, "tools/list: id preserved");
  assert(
    Array.isArray(listResp.result.tools),
    "tools/list: result.tools is array",
  );
  assert(
    listResp.result.tools.length === 11,
    `tools/list: 11 tools (got ${listResp.result.tools.length})`,
  );

  // Verify tool structure
  const invTool = listResp.result.tools.find(
    (t) => t.name === "inventory.dataset",
  );
  assert(invTool !== undefined, "tools/list: contains inventory.dataset");
  assert(
    invTool.inputSchema.required.includes("plant"),
    "inventory.dataset: plant is required",
  );

  const reconTool = listResp.result.tools.find(
    (t) => t.name === "reconciliation.run",
  );
  assert(reconTool !== undefined, "tools/list: contains reconciliation.run");
  assert(
    reconTool.inputSchema.required.includes("companyCode"),
    "reconciliation.run: companyCode required",
  );
  assert(
    reconTool.inputSchema.required.includes("plant"),
    "reconciliation.run: plant required",
  );
  assert(
    reconTool.inputSchema.required.includes("fiscalYear"),
    "reconciliation.run: fiscalYear required",
  );

  // --- Protocol: errors ---
  console.log("\n--- Protocol: Error Handling ---\n");

  // Unknown method
  const unknownMethod = await handleRequest({
    jsonrpc: "2.0",
    id: 3,
    method: "unknown",
    params: {},
  });
  assert(unknownMethod.error.code === -32601, "Unknown method: code -32601");
  assert(
    unknownMethod.error.message.includes("unknown"),
    "Unknown method: message contains method name",
  );

  // tools/call with no tool name
  const noName = await handleRequest({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: {},
  });
  assert(noName.error.code === -32602, "Missing tool name: code -32602");

  // tools/call with unknown tool
  const badTool = await handleRequest({
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: { name: "bad.tool", arguments: {} },
  });
  assert(badTool.error.code === -32602, "Unknown tool: code -32602");

  // --- Protocol: notifications ---
  console.log("\n--- Protocol: Notifications ---\n");

  const notifResp = await handleRequest({
    jsonrpc: "2.0",
    method: "notifications/initialized",
    params: {},
  });
  assert(
    notifResp === null,
    "notifications/initialized: returns null (no response)",
  );

  // --- Server Info ---
  console.log("\n--- Server Info ---\n");

  assert(
    SERVER_INFO.name === "inventory-gl-reconciliation",
    `Server name: ${SERVER_INFO.name}`,
  );
  assert(
    SERVER_INFO.version === "4.1.0",
    `Server version: ${SERVER_INFO.version}`,
  );

  // --- HTTP Transport Structure ---
  console.log("\n--- HTTP Transport ---\n");

  const { createHttpTransport } = require("../transport/httpTransport");
  assert(
    typeof createHttpTransport === "function",
    "createHttpTransport exported",
  );

  // --- Auth Provider Structure ---
  const { authMiddleware, isAuthEnabled } = require("../auth/authProvider");
  assert(typeof authMiddleware === "function", "authMiddleware is function");
  assert(typeof isAuthEnabled === "function", "isAuthEnabled is function");
  assert(isAuthEnabled() === false, "Auth disabled by default");

  // --- ToolNotFoundError ---
  console.log("\n--- Custom Errors ---\n");

  const err = new ToolNotFoundError("test.tool");
  assert(
    err.message === "Unknown tool: test.tool",
    "ToolNotFoundError message",
  );
  assert(err.code === "TOOL_NOT_FOUND", "ToolNotFoundError code");
  assert(err.toolName === "test.tool", "ToolNotFoundError toolName");

  // --- Results ---
  console.log(
    "\n═══════════════════════════════════════════════════════════════",
  );
  console.log(
    `  RESULTS: ${passed} passed, ${failed} failed, ${passed + failed} total`,
  );
  console.log(
    `  STATUS: ${failed === 0 ? "ALL PASS ✓" : "FAILURES DETECTED ✗"}`,
  );
  console.log(
    "═══════════════════════════════════════════════════════════════\n",
  );

  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
