/**
 * Test: system.list MCP Tool
 *
 * Run: node mcp/tests/test-system-list.js
 *
 * Validates system discovery, field filtering, sorting, and error handling.
 */
const { getTool } = require("../registry");

// Mock context
function createMockContext(systems = [], resolveError = null) {
  return {
    projectResolver: {
      async resolve(projectId) {
        if (resolveError) throw new Error(resolveError);
        if (projectId === "unknown")
          throw new Error("Project not found: unknown");
        return { dbName: "test-db" };
      },
    },
    systemRepository: {
      async listSystems(dbName) {
        return systems;
      },
    },
  };
}

async function runTests() {
  console.log(
    "╔══════════════════════════════════════════════════════════════╗",
  );
  console.log(
    "║   system.list MCP Tool Tests                                 ║",
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

  const tool = getTool("system.list");
  assert(tool !== null, "system.list is registered");
  assert(
    tool.inputSchema.required.includes("projectId"),
    "projectId is required",
  );

  // --- Case 1: Valid project, multiple systems ---
  console.log("\n--- Case 1: Valid project with systems ---\n");

  const systems = [
    {
      systemID: "AK4",
      systemName: "SAP QA",
      active: true,
      connections: [{ status: "Disconnected", user: "u1", password: "secret" }],
    },
    {
      systemId: "Haas",
      name: "Haas Customer",
      active: true,
      connections: [
        {
          status: "Connected",
          username: "u2",
          password: "hidden",
          host: "10.0.0.1",
        },
      ],
    },
    {
      systemID: "DEV",
      systemName: "Development",
      active: false,
      connections: [],
    },
  ];

  const ctx1 = createMockContext(systems);
  const result1 = await tool.handler(
    { projectId: "68d8e61f69823ccccb7e95e4" },
    ctx1,
  );

  assert(result1.success === true, "Case 1: success=true");
  assert(
    result1.data.length === 3,
    `Case 1: returns 3 systems (got ${result1.data.length})`,
  );

  // Verify sorting: Connected first
  assert(
    result1.data[0].systemID === "Haas",
    "Case 1: Connected system first (Haas)",
  );
  assert(
    result1.data[0].status === "Connected",
    "Case 1: first has status=Connected",
  );

  // Verify no sensitive fields exposed
  const allJSON = JSON.stringify(result1.data);
  assert(!allJSON.includes("secret"), "Case 1: no password in response");
  assert(!allJSON.includes("hidden"), "Case 1: no password in response (2)");
  assert(!allJSON.includes("10.0.0.1"), "Case 1: no host in response");
  assert(!allJSON.includes("u1"), "Case 1: no username in response");
  assert(!allJSON.includes("u2"), "Case 1: no username in response (2)");

  // Verify schema normalization
  const haas = result1.data.find((s) => s.systemID === "Haas");
  assert(
    haas.systemName === "Haas Customer",
    "Case 1: systemName from 'name' field",
  );
  assert(haas.type === "SAP", "Case 1: type defaults to SAP");

  // --- Case 2: Project exists, no systems ---
  console.log("\n--- Case 2: No systems ---\n");

  const ctx2 = createMockContext([]);
  const result2 = await tool.handler(
    { projectId: "68d8e61f69823ccccb7e95e4" },
    ctx2,
  );

  assert(result2.success === true, "Case 2: success=true (not error)");
  assert(result2.data.length === 0, "Case 2: empty array returned");

  // --- Case 3: Unknown project ---
  console.log("\n--- Case 3: Unknown project ---\n");

  const ctx3 = createMockContext([], null);
  const result3 = await tool.handler({ projectId: "unknown" }, ctx3);

  assert(result3.success === false, "Case 3: success=false");
  assert(result3.error.code === "SYSTEM_LIST_FAILED", "Case 3: error code");
  assert(result3.error.message.includes("not found"), "Case 3: error message");

  // --- Case 4: Mixed Mongo schema (systemID vs systemId) ---
  console.log("\n--- Case 4: Mixed schema ---\n");

  const mixedSystems = [
    {
      systemID: "SYS1",
      systemName: "System One",
      connections: [{ status: "Connected" }],
    },
    {
      systemId: "SYS2",
      name: "System Two",
      connections: [{ status: "Disconnected" }],
    },
  ];
  const ctx4 = createMockContext(mixedSystems);
  const result4 = await tool.handler({ projectId: "test" }, ctx4);

  assert(
    result4.data[0].systemID === "SYS1" || result4.data[0].systemID === "SYS2",
    "Case 4: handles both field names",
  );
  const sys2 = result4.data.find((s) => s.systemID === "SYS2");
  assert(sys2 !== undefined, "Case 4: systemId (lowercase d) resolved");
  assert(
    sys2.systemName === "System Two",
    "Case 4: name field used as systemName",
  );

  // --- Case 5: Missing projectId ---
  console.log("\n--- Case 5: Missing projectId ---\n");

  const result5 = await tool.handler({}, createMockContext([]));
  assert(result5.success === false, "Case 5: fails without projectId");
  assert(
    result5.error.code === "MISSING_PROJECT_ID",
    "Case 5: correct error code",
  );

  // --- Case 6: Active field ---
  console.log("\n--- Case 6: Active field ---\n");

  const dev = result1.data.find((s) => s.systemID === "DEV");
  assert(dev.active === false, "Case 6: inactive system has active=false");
  assert(
    dev.status === "No Connections",
    "Case 6: no connections = 'No Connections' status",
  );

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
