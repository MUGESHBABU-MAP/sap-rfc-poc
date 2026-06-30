/**
 * MCP Context (Phase 5)
 *
 * Dependency injection container for MCP tools.
 * Supports multi-project SAP system resolution.
 *
 * Tools call: ctx.getServices(projectId, systemID)
 * Returns services wired to the correct SAP connection.
 *
 * If projectId/systemID not provided, falls back to .env credentials.
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const SAPService = require("../services/sap.service");
const InventoryDatasetService = require("../services/inventory-dataset.service");
const InventorySummaryService = require("../services/inventory-summary.service");
const GLDatasetService = require("../services/gl-dataset.service");
const GLSummaryService = require("../services/gl-summary.service");
const ReconciliationService = require("../services/reconciliation.service");
const FinanceWorkbookService = require("../services/finance-workbook.service");
const CompanyService = require("../services/company.service");
const AccountService = require("../services/account.service");
const AuditTrailService = require("../services/audit-trail.service");
const RunConfigurationService = require("../services/run-configuration.service");
const ProjectResolverService = require("../services/project-resolver.service");
const SystemDefinitionRepository = require("../services/system-definition.repository");
const CredentialProviderService = require("../services/credential-provider.service");
const SAPConnectionFactory = require("../services/sap-connection.factory");

const accountMaster = require("../config/inventory-account-master.json");

/**
 * Create and return a fully-initialized MCP context.
 * @returns {MCPContext}
 */
function createContext() {
  // MongoDB client (lazy — only created when needed)
  let mongoClient = null;

  // Initialize credential resolution infrastructure
  // These work with or without MongoDB (fallback to ENV)
  const projectResolver = new ProjectResolverService(getMongoClient());
  const systemRepository = new SystemDefinitionRepository(getMongoClient());
  const credentialProvider = new CredentialProviderService(
    projectResolver,
    systemRepository,
  );
  const connectionFactory = new SAPConnectionFactory(credentialProvider);

  // Shared services (not SAP-dependent)
  const inventorySummary = new InventorySummaryService();
  const glSummary = new GLSummaryService();
  const reconciliationService = new ReconciliationService();
  const financeWorkbookService = new FinanceWorkbookService();
  const auditTrailService = new AuditTrailService();
  const runConfigurationService = new RunConfigurationService();

  return {
    // Shared services (no SAP dependency)
    inventorySummary,
    glSummary,
    reconciliationService,
    financeWorkbookService,
    auditTrailService,
    runConfigurationService,
    accountMaster,
    connectionFactory,
    credentialProvider,
    projectResolver,
    systemRepository,

    /**
     * Get SAP-connected services for a specific project/system.
     * This is the primary method tools should call.
     *
     * @param {string} [projectId] - KTern project ID (optional, falls back to ENV)
     * @param {string} [systemID] - SAP system ID (optional, falls back to ENV)
     * @returns {Promise<ConnectedServices>}
     */
    async getServices(projectId, systemID) {
      const sapService = await connectionFactory.create(projectId, systemID);

      return {
        sapService,
        inventoryService: new InventoryDatasetService(sapService),
        glService: new GLDatasetService(sapService),
        companyService: new CompanyService(sapService),
        accountService: new AccountService(sapService),
      };
    },

    /**
     * Disconnect all cached connections.
     */
    async disconnectAll() {
      await connectionFactory.disconnectAll();
    },
  };
}

/**
 * Get or create MongoDB client.
 * Returns a stub if MongoDB is not configured.
 */
function getMongoClient() {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    // Return stub that will cause credential provider to fall back to ENV
    return {
      db() {
        return {
          collection() {
            return {
              async findOne() {
                return null;
              },
              find() {
                return {
                  async toArray() {
                    return [];
                  },
                };
              },
            };
          },
        };
      },
    };
  }

  // Lazy connect — only when actually used
  let client = null;
  return {
    db(dbName) {
      if (!client) {
        try {
          const { MongoClient } = require("mongodb");
          client = new MongoClient(mongoUri);
          // Note: MongoClient 4.x auto-connects on first operation
        } catch (e) {
          console.warn("[MCP Context] MongoDB unavailable:", e.message);
          // Return stub
          return {
            collection() {
              return {
                async findOne() {
                  return null;
                },
                find() {
                  return {
                    async toArray() {
                      return [];
                    },
                  };
                },
              };
            },
          };
        }
      }
      return client.db(dbName);
    },
  };
}

module.exports = { createContext };
