/**
 * Run Configuration Service (Phase 3.19)
 *
 * Validates, normalizes, and creates reconciliation run configurations.
 * Provides a single entry point for all reconciliation parameters.
 */
const crypto = require("crypto");

class RunConfigurationService {
  /**
   * Create and validate a run configuration from input.
   *
   * @param {object} input - Raw input (from API request or test)
   * @returns {ReconciliationRunRequest} Validated configuration
   * @throws {Error} If required fields are missing
   */
  createRunConfiguration(input = {}) {
    // Validate required fields
    const errors = [];
    if (!input.companyCode) errors.push("companyCode is required");
    if (!input.plant) errors.push("plant is required");
    if (!input.fiscalYear) errors.push("fiscalYear is required");

    if (errors.length > 0) {
      throw new Error(
        `Run Configuration validation failed: ${errors.join(", ")}`,
      );
    }

    // Apply defaults and normalize
    const runId = input.runId || this._generateRunId();
    const createdAt = input.createdAt || new Date().toISOString();
    const runName = input.runName || this._buildRunName(input);

    return {
      runId,
      runName,
      companyCode: String(input.companyCode).trim(),
      plant: String(input.plant).trim(),
      fiscalYear: String(input.fiscalYear).trim(),
      fiscalPeriod: input.fiscalPeriod || input.period || "ALL",
      selectedAccounts: this._normalizeAccounts(input.selectedAccounts),
      workbookConfig: this._normalizeWorkbookConfig(input.workbookConfig),
      triggeredBy: input.triggeredBy || input.user || "system",
      createdAt,
    };
  }

  /**
   * Convert legacy API query parameters to a run configuration.
   * Provides backward compatibility with existing API.
   *
   * @param {object} query - Express req.query object
   * @returns {ReconciliationRunRequest}
   */
  fromQueryParams(query = {}) {
    const input = {
      companyCode: query.companyCode,
      plant: query.plant,
      fiscalYear: query.fiscalYear,
      fiscalPeriod: query.period || "ALL",
      triggeredBy: query.user || "api",
      runName: query.runName,
    };

    // Handle selectedAccounts as comma-separated string
    if (query.selectedAccounts) {
      input.selectedAccounts = query.selectedAccounts
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }

    // Build workbook config from query params
    input.workbookConfig = this._workbookConfigFromQuery(query);

    return this.createRunConfiguration(input);
  }

  /**
   * Generate a unique run ID.
   */
  _generateRunId() {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(4).toString("hex");
    return `run_${timestamp}_${random}`;
  }

  /**
   * Build a default run name from parameters.
   */
  _buildRunName(input) {
    const cc = input.companyCode || "?";
    const plant = input.plant || "?";
    const year = input.fiscalYear || "?";
    const date = new Date().toISOString().split("T")[0];
    return `Recon_${cc}_${plant}_${year}_${date}`;
  }

  /**
   * Normalize selectedAccounts to a clean string array.
   */
  _normalizeAccounts(accounts) {
    if (!accounts) return [];
    if (typeof accounts === "string") {
      return accounts
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }
    if (Array.isArray(accounts)) {
      return accounts.map((s) => String(s).trim()).filter((s) => s.length > 0);
    }
    return [];
  }

  /**
   * Normalize workbook config.
   */
  _normalizeWorkbookConfig(config) {
    if (!config || typeof config !== "object") return {};
    return { ...config };
  }

  /**
   * Extract workbook config overrides from query params.
   */
  _workbookConfigFromQuery(query) {
    const overrides = {};
    if (query.detailMode) overrides.detailMode = query.detailMode;
    if (query.locationMode) overrides.locationMode = query.locationMode;
    if (query.workbookMode) overrides.workbookMode = query.workbookMode;
    if (query.selectedLocations) {
      overrides.selectedLocations = query.selectedLocations
        .split(",")
        .map((s) => s.trim());
      overrides.locationMode = "SELECTED";
    }
    if (query.includeInventoryReport !== undefined)
      overrides.includeInventoryReport =
        query.includeInventoryReport !== "false";
    if (query.includeSummary !== undefined)
      overrides.includeSummary = query.includeSummary !== "false";
    if (query.includeLocationSheets !== undefined)
      overrides.includeLocationSheets = query.includeLocationSheets !== "false";
    if (query.includeSpecialStockSheets !== undefined)
      overrides.includeSpecialStockSheets =
        query.includeSpecialStockSheets !== "false";
    if (query.includeGLDetail !== undefined)
      overrides.includeGLDetail = query.includeGLDetail !== "false";
    if (query.includeGLSummary !== undefined)
      overrides.includeGLSummary = query.includeGLSummary !== "false";
    if (query.includePlantReconciliation !== undefined)
      overrides.includePlantReconciliation =
        query.includePlantReconciliation !== "false";
    if (query.includeLocationReconciliation !== undefined)
      overrides.includeLocationReconciliation =
        query.includeLocationReconciliation !== "false";
    if (query.includeTopVariances !== undefined)
      overrides.includeTopVariances = query.includeTopVariances !== "false";
    return Object.keys(overrides).length > 0 ? overrides : {};
  }
}

module.exports = RunConfigurationService;
