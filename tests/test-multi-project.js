/**
 * Phase 5 - Multi-Project SAP System Resolution Tests
 *
 * Run: node tests/test-multi-project.js
 *
 * Tests credential resolution, caching, and ENV fallback.
 * No real MongoDB or SAP connection required — uses mocks.
 */
const ProjectResolverService = require("../services/project-resolver.service");
const SystemDefinitionRepository = require("../services/system-definition.repository");
const CredentialProviderService = require("../services/credential-provider.service");
const SAPConnectionFactory = require("../services/sap-connection.factory");

// Mock MongoDB client
function createMockMongoClient(data = {}) {
  return {
    db(dbName) {
      return {
        collection(colName) {
          return {
            async findOne(query) {
              const key = `${dbName}.${colName}`;
              const docs = data[key] || [];
              return (
                docs.find((d) => {
                  if (query._id) return String(d._id) === String(query._id);
                  if (query.systemID) return d.systemID === query.systemID;
                  return false;
                }) || null
              );
            },
            find() {
              const key = `${dbName}.${colName}`;
              return {
                async toArray() {
                  return data[key] || [];
                },
              };
            },
          };
        },
      };
    },
  };
}

async function runTests() {
  console.log(
    "╔══════════════════════════════════════════════════════════════╗",
  );
  console.log(
    "║   Phase 5 - Multi-Project Resolution Tests                   ║",
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

  // Mock data
  const mockData = {
    "ktern-masterdb.kt_m_projects": [
      { _id: "68d8e61f69823ccccb7e95e4", dbName: "google-kae" },
      { _id: "111111111111111111111111", dbName: "haas-prod" },
    ],
    "google-kae.kt_m_systemDefinitions": [
      {
        systemID: "AK4",
        applicationServer: "172.16.0.1",
        instanceNumber: "00",
        client: "210",
        active: true,
        connections: [
          {
            user: "RFC_USER",
            password: "secret123",
            status: "Connected",
            language: "EN",
          },
          {
            user: "RFC_USER2",
            password: "old",
            status: "Disconnected",
            language: "EN",
          },
        ],
      },
      {
        systemID: "AK5",
        applicationServer: "172.16.0.2",
        instanceNumber: "01",
        client: "300",
        active: false,
        connections: [
          { user: "USER3", password: "pass3", status: "Disconnected" },
        ],
      },
    ],
    "haas-prod.kt_m_systemDefinitions": [
      {
        systemID: "HP1",
        applicationServer: "10.0.0.1",
        instanceNumber: "00",
        client: "100",
        active: true,
        connections: [
          { user: "HAAS_RFC", password: "hpass", status: "Connected" },
        ],
      },
    ],
  };

  const mongoClient = createMockMongoClient(mockData);

  // --- Project Resolver ---
  console.log("--- Project Resolver ---\n");

  const resolver = new ProjectResolverService(mongoClient);

  const r1 = await resolver.resolve("68d8e61f69823ccccb7e95e4");
  assert(r1.dbName === "google-kae", `Resolved project → google-kae`);

  const r2 = await resolver.resolve("111111111111111111111111");
  assert(r2.dbName === "haas-prod", `Resolved project → haas-prod`);

  // Cache test
  const r3 = await resolver.resolve("68d8e61f69823ccccb7e95e4");
  assert(r3.dbName === "google-kae", "Cache hit returns same result");

  // Missing project
  try {
    await resolver.resolve("999999999999999999999999");
    assert(false, "Should throw for missing project");
  } catch (e) {
    assert(e.message.includes("not found"), "Throws on missing project");
  }

  // No projectId
  try {
    await resolver.resolve(null);
    assert(false, "Should throw for null projectId");
  } catch (e) {
    assert(e.message.includes("required"), "Throws on null projectId");
  }

  // --- System Definition Repository ---
  console.log("\n--- System Definition Repository ---\n");

  const sysRepo = new SystemDefinitionRepository(mongoClient);

  const sys1 = await sysRepo.getSystemDefinition("google-kae", "AK4");
  assert(sys1.systemID === "AK4", "Found system AK4");
  assert(sys1.applicationServer === "172.16.0.1", "Correct app server");

  // Select connection (prefers Connected)
  const conn = sysRepo.selectConnection(sys1);
  assert(conn.user === "RFC_USER", "Selected Connected connection");
  assert(conn.status === "Connected", "Connection status is Connected");

  // Fallback to first when none Connected
  const sys2 = await sysRepo.getSystemDefinition("google-kae", "AK5");
  const conn2 = sysRepo.selectConnection(sys2);
  assert(conn2.user === "USER3", "Falls back to first connection");

  // Missing system
  try {
    await sysRepo.getSystemDefinition("google-kae", "MISSING");
    assert(false, "Should throw for missing system");
  } catch (e) {
    assert(e.message.includes("not found"), "Throws on missing system");
  }

  // List systems
  const systems = await sysRepo.listSystems("google-kae");
  assert(systems.length === 2, `Listed 2 systems (got ${systems.length})`);

  // --- Credential Provider ---
  console.log("\n--- Credential Provider ---\n");

  const credProvider = new CredentialProviderService(resolver, sysRepo);

  // Dynamic resolution
  const cred1 = await credProvider.resolve("68d8e61f69823ccccb7e95e4", "AK4");
  assert(cred1.source === "dynamic", "Source is dynamic");
  assert(cred1.ashost === "172.16.0.1", "Correct ashost");
  assert(cred1.sysnr === "00", "Correct sysnr");
  assert(cred1.client === "210", "Correct client");
  assert(cred1.user === "RFC_USER", "Correct user");
  assert(cred1.passwd === "secret123", "Correct password");
  assert(cred1.projectId === "68d8e61f69823ccccb7e95e4", "projectId in result");
  assert(cred1.systemID === "AK4", "systemID in result");
  assert(cred1.dbName === "google-kae", "dbName in result");

  // ENV fallback (no projectId)
  const cred2 = await credProvider.resolve(null, null);
  assert(cred2.source === "env_fallback", "Falls back to ENV when no params");

  // ENV fallback (missing project)
  const cred3 = await credProvider.resolve("999999999999999999999999", "AK4");
  assert(cred3.source === "env_fallback", "Falls back to ENV on error");

  // Cache test
  const cred4 = await credProvider.resolve("68d8e61f69823ccccb7e95e4", "AK4");
  assert(cred4.source === "dynamic", "Cached credential returned");

  // --- SAP Connection Factory ---
  console.log("\n--- SAP Connection Factory ---\n");

  // Can't test actual connection without SAP, but verify structure
  const factory = new SAPConnectionFactory(credProvider);
  assert(typeof factory.create === "function", "Factory has create method");
  assert(
    typeof factory.disconnect === "function",
    "Factory has disconnect method",
  );
  assert(
    typeof factory.disconnectAll === "function",
    "Factory has disconnectAll method",
  );
  assert(factory.getConnectionCount() === 0, "Starts with 0 connections");

  // --- ENV Fallback Guarantee ---
  console.log("\n--- ENV Fallback ---\n");

  // Simulate complete Mongo failure
  const badMongoClient = createMockMongoClient({}); // Empty data
  const badResolver = new ProjectResolverService(badMongoClient);
  const badSysRepo = new SystemDefinitionRepository(badMongoClient);
  const badCredProvider = new CredentialProviderService(
    badResolver,
    badSysRepo,
  );

  const fallback = await badCredProvider.resolve(
    "68d8e61f69823ccccb7e95e4",
    "AK4",
  );
  assert(fallback.source === "env_fallback", "Complete failure → ENV fallback");

  // --- Backward Compatibility ---
  console.log("\n--- Backward Compatibility ---\n");

  // Old flow: no projectId/systemID = use ENV
  const oldFlow = await credProvider.resolve(undefined, undefined);
  assert(
    oldFlow.source === "env_fallback",
    "Undefined params → ENV (backward compatible)",
  );

  const oldFlow2 = await credProvider.resolve("", "");
  assert(
    oldFlow2.source === "env_fallback",
    "Empty strings → ENV (backward compatible)",
  );

  // --- Encrypted Password Stub ---
  console.log("\n--- Password Decryption Stub ---\n");

  try {
    CredentialProviderService.decryptPassword("ENC:abc123");
    assert(false, "Should throw on encrypted password");
  } catch (e) {
    assert(
      e.message.includes("decryption provider not configured"),
      "Stub throws correct error",
    );
  }

  // --- Production Mode Tests ---
  console.log("\n--- Production Mode ---\n");

  // Temporarily set APP_ENV=production
  const originalEnv = process.env.APP_ENV;
  process.env.APP_ENV = "production";

  const prodCredProvider = new CredentialProviderService(resolver, sysRepo);

  // Production: Mongo success still works
  const prodCred1 = await prodCredProvider.resolve(
    "68d8e61f69823ccccb7e95e4",
    "AK4",
  );
  assert(
    prodCred1.source === "dynamic",
    "Production + Mongo success = dynamic",
  );

  // Production: missing projectId → error (not ENV)
  try {
    await prodCredProvider.resolve(null, "AK4");
    assert(false, "Production: should throw on missing projectId");
  } catch (e) {
    assert(
      e.code === "ProductionModeRequiresProjectAndSystem",
      "Production: missing projectId → correct error code",
    );
  }

  // Production: missing systemID → error (not ENV)
  try {
    await prodCredProvider.resolve("68d8e61f69823ccccb7e95e4", null);
    assert(false, "Production: should throw on missing systemID");
  } catch (e) {
    assert(
      e.code === "ProductionModeRequiresProjectAndSystem",
      "Production: missing systemID → correct error code",
    );
  }

  // Production: unknown project → error (not ENV)
  try {
    await prodCredProvider.resolve("999999999999999999999999", "AK4");
    assert(false, "Production: should throw on unknown project");
  } catch (e) {
    assert(
      e.code === "ProjectNotFound",
      `Production: unknown project → ProjectNotFound (got ${e.code})`,
    );
  }

  // Production: unknown system → error (not ENV)
  try {
    await prodCredProvider.resolve("68d8e61f69823ccccb7e95e4", "MISSING");
    assert(false, "Production: should throw on unknown system");
  } catch (e) {
    assert(
      e.code === "SystemNotFound",
      `Production: unknown system → SystemNotFound (got ${e.code})`,
    );
  }

  // Production: complete Mongo failure → error (not ENV)
  const prodBadProvider = new CredentialProviderService(
    badResolver,
    badSysRepo,
  );
  try {
    await prodBadProvider.resolve("68d8e61f69823ccccb7e95e4", "AK4");
    assert(false, "Production: should throw on Mongo failure");
  } catch (e) {
    assert(
      e.code === "MongoUnavailable" || e.code === "ProjectNotFound",
      `Production: Mongo failure → error thrown (got ${e.code})`,
    );
  }

  // Restore development mode
  process.env.APP_ENV = originalEnv || "";
  delete process.env.APP_ENV;

  // Verify development mode is restored (ENV fallback works again)
  const devCheck = await credProvider.resolve(null, null);
  assert(
    devCheck.source === "env_fallback",
    "Development restored: ENV fallback works",
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
