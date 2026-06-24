/**
 * Reconciliation Run Log Model (Phase 3.20)
 *
 * Represents a completed (or failed) reconciliation execution.
 * Persisted to audit trail for governance and BR10 compliance.
 *
 * NOTE: This is application-level audit logging only.
 * It does NOT track SAP material/document/posting changes.
 */

/**
 * @typedef {object} ReconciliationRunLog
 * @property {string} runId - Unique run identifier
 * @property {string} runName - Human-readable run name
 * @property {string} user - Who triggered the run
 * @property {string} timestamp - ISO timestamp of execution
 * @property {string} companyCode - SAP company code
 * @property {string} plant - SAP plant code
 * @property {string} fiscalYear - Fiscal year
 * @property {string} fiscalPeriod - Fiscal period
 * @property {string[]} selectedAccounts - GL accounts used
 * @property {number} inventoryRecords - Count of inventory records extracted
 * @property {number} glRecords - Count of GL records extracted
 * @property {number} inventoryValue - Total inventory value
 * @property {number} glValue - Total GL balance
 * @property {number} varianceAmount - Total variance
 * @property {number} exceptionCount - Number of exceptions/variances found
 * @property {string} workbookPath - Path to generated workbook
 * @property {number} executionTimeSeconds - Total execution time
 * @property {string} status - "SUCCESS" or "FAILED"
 * @property {string} [errorMessage] - Error message if status is FAILED
 */

/**
 * Create a default run log structure.
 * @returns {ReconciliationRunLog}
 */
function createDefaultRunLog() {
  return {
    runId: "",
    runName: "",
    user: "system",
    timestamp: "",
    companyCode: "",
    plant: "",
    fiscalYear: "",
    fiscalPeriod: "ALL",
    selectedAccounts: [],
    inventoryRecords: 0,
    glRecords: 0,
    inventoryValue: 0,
    glValue: 0,
    varianceAmount: 0,
    exceptionCount: 0,
    workbookPath: "",
    executionTimeSeconds: 0,
    status: "SUCCESS",
    errorMessage: "",
  };
}

module.exports = { createDefaultRunLog };
