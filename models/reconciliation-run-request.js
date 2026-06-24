/**
 * Reconciliation Run Request Model (Phase 3.19)
 *
 * Single request model representing a reconciliation execution.
 * All reconciliation APIs consume this model.
 */

/**
 * @typedef {object} ReconciliationRunRequest
 * @property {string} runId - Unique run identifier (auto-generated if not provided)
 * @property {string} runName - Human-readable run name
 * @property {string} companyCode - SAP company code (required)
 * @property {string} plant - SAP plant code (required)
 * @property {string} fiscalYear - Fiscal year (required)
 * @property {string} fiscalPeriod - Fiscal period (default: "ALL")
 * @property {string[]} selectedAccounts - GL accounts to include (empty = use config)
 * @property {object} workbookConfig - Workbook generation config overrides
 * @property {string} triggeredBy - User or system that initiated the run
 * @property {string} createdAt - ISO timestamp of creation
 */

/**
 * Create a default run request structure.
 * @returns {ReconciliationRunRequest}
 */
function createDefaultRunRequest() {
  return {
    runId: "",
    runName: "",
    companyCode: "",
    plant: "",
    fiscalYear: "",
    fiscalPeriod: "ALL",
    selectedAccounts: [],
    workbookConfig: {},
    triggeredBy: "system",
    createdAt: "",
  };
}

module.exports = { createDefaultRunRequest };
