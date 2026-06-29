/**
 * MCP Server Unit Test (Phase 4)
 *
 * Run: node mcp/test-mcp.js
 *
 * Tests MCP protocol handling without SAP connection.
 * Validates JSON-RPC responses, tool registry, and error handling.
 */
const { handleRequest, SERVER_INFO } = require("./server");
const { getAllTools, getTool, getToolDefinitions } = require("./registry");

async function runTests() {
  console.log(
    "╔══════════════════════════════════════════════════════════════╗",
  );
  console.log(
    "║   Phase 4 - MCP Server Unit Tests                            ║",
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

  // --- Registry Tests ---
  console.log("--- Tool Registry ---\n");

  const allTools = getAllTools();
  assert(
    allTools.length === 11,
    `Registry has 11 tools (got ${allTools.length})`,
  );

  const toolNames = allTools.map((t) => t.name);
  assert(toolNames.includes("inventory.dataset"), "Has inventory.dataset");
  assert(toolNames.includes("inventory.summary"), "Has inventory.summary");
  assert(
    toolNames.includes("inventory.specialStock"),
    "Has inventory.specialStock",
  );
  assert(toolNames.includes("gl.dataset"), "Has gl.dataset");
  assert(toolNames.includes("gl.summary"), "Has gl.summary");
  assert(toolNames.includes("reconciliation.run"), "Has reconciliation.run");
  assert(
    toolNames.includes("reconciliation.history"),
    "Has reconciliation.history",
  );
  assert(
    toolNames.includes("configuration.validate"),
    "Has configuration.validate",
  );
  assert(toolNames.includes("system.health"), "Has system.health");
  assert(toolNames.includes("system.connection"), "Has system.connection");
  assert(toolNames.includes("system.metadata"), "Has system.metadata");

  // Tool lookup
  const invTool = getTool("inventory.dataset");
  assert(invTool !== null, "getTool finds inventory.dataset");
  assert(
    invTool.inputSchema.required.includes("plant"),
    "inventory.dataset requires plant",
  );

  const missing = getTool("nonexistent.tool");
  assert(missing === null, "getTool returns null for unknown tool");

  // Tool definitions
  const defs = getToolDefinitions();
  assert(
    defs.length === 11,
    `getToolDefinitions returns 11 (got ${defs.length})`,
  );
  assert(
    defs[0].name && defs[0].description && defs[0].inputSchema,
    "Definitions have name/description/inputSchema",
  );

  // --- JSON-RPC Protocol Tests ---
  console.log("\n--- JSON-RPC Protocol ---\n");

  // Initialize
  const initResp = await handleRequest({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {},
  });
  assert(initResp.jsonrpc === "2.0", "initialize: jsonrpc 2.0");
  assert(initResp.id === 1, "initialize: id preserved");
  assert(
    initResp.result.serverInfo.name === SERVER_INFO.name,
    "initialize: server name",
  );
  assert(
    initResp.result.protocolVersion === "2024-11-05",
    "initialize: protocol version",
  );

  // tools/list
  const listResp = await handleRequest({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {},
  });
  assert(
    listResp.result.tools.length === 11,
    `tools/list: 11 tools (got ${listResp.result.tools.length})`,
  );

  // Unknown method
  const unknownResp = await handleRequest({
    jsonrpc: "2.0",
    id: 3,
    method: "unknown/method",
    params: {},
  });
  assert(unknownResp.error.code === -32601, "Unknown method returns -32601");

  // tools/call with missing tool name
  const noNameResp = await handleRequest({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: {},
  });
  assert(noNameResp.error.code === -32602, "Missing tool name returns -32602");

  // tools/call with unknown tool
  const badToolResp = await handleRequest({
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: { name: "bad.tool", arguments: {} },
  });
  assert(badToolResp.error.code === -32602, "Unknown tool returns -32602");

  // --- Tool Structure Validation ---
  console.log("\n--- Tool Structure ---\n");

  for (const tool of allTools) {
    assert(
      typeof tool.name === "string" && tool.name.length > 0,
      `${tool.name}: has name`,
    );
    assert(
      typeof tool.description === "string" && tool.description.length > 0,
      `${tool.name}: has description`,
    );
    assert(
      typeof tool.inputSchema === "object",
      `${tool.name}: has inputSchema`,
    );
    assert(
      typeof tool.handler === "function",
      `${tool.name}: has handler function`,
    );
  }

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
