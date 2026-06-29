/**
 * MCP Context (Phase 4)
 *
 * Dependency injection container for MCP tools.
 * All tools receive this context — no tool instantiates services directly.
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

const accountMaster = require("../config/inventory-account-master.json");

/**
 * Create and return a fully-initialized MCP context.
 * @returns {MCPContext}
 */
function createContext() {
  const sapConfig = {
    user: process.env.SAP_USER,
    passwd: process.env.SAP_PASSWORD,
    ashost: process.env.SAP_ASHOST,
    sysnr: process.env.SAP_SYSNR,
    client: process.env.SAP_CLIENT,
    lang: process.env.SAP_LANG,
  };

  const sapService = new SAPService(sapConfig);
  const inventoryService = new InventoryDatasetService(sapService);
  const inventorySummary = new InventorySummaryService();
  const glService = new GLDatasetService(sapService);
  const glSummary = new GLSummaryService();
  const reconciliationService = new ReconciliationService();
  const financeWorkbookService = new FinanceWorkbookService();
  const companyService = new CompanyService(sapService);
  const accountService = new AccountService(sapService);
  const auditTrailService = new AuditTrailService();
  const runConfigurationService = new RunConfigurationService();

  return {
    sapService,
    inventoryService,
    inventorySummary,
    glService,
    glSummary,
    reconciliationService,
    financeWorkbookService,
    companyService,
    accountService,
    auditTrailService,
    runConfigurationService,
    accountMaster,
    connected: false,

    async connect() {
      if (!this.connected) {
        await this.sapService.connect();
        this.connected = true;
      }
    },

    async disconnect() {
      if (this.connected) {
        await this.sapService.disconnect();
        this.connected = false;
      }
    },
  };
}

module.exports = { createContext };
