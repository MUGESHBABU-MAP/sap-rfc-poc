/**
 * Audit Trail Service (Phase 3.20)
 *
 * Persists reconciliation execution history to file storage.
 * Tracks: who, when, what parameters, what results.
 *
 * Storage: data/reconciliation-run-history.json
 * Future: Easy migration to MongoDB (same interface).
 *
 * NOTE: This is application-level audit only.
 * Does NOT track SAP material/document/posting changes.
 */
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.resolve(__dirname, "../data");
const HISTORY_FILE = path.join(DATA_DIR, "reconciliation-run-history.json");

class AuditTrailService {
  constructor() {
    this._ensureDataDir();
  }

  /**
   * Log a reconciliation run.
   * @param {ReconciliationRunLog} runLog
   * @returns {ReconciliationRunLog} The persisted log entry
   */
  logRun(runLog) {
    const history = this._readHistory();

    // Ensure required fields
    const entry = {
      runId: runLog.runId || "",
      runName: runLog.runName || "",
      user: runLog.user || "system",
      timestamp: runLog.timestamp || new Date().toISOString(),
      companyCode: runLog.companyCode || "",
      plant: runLog.plant || "",
      fiscalYear: runLog.fiscalYear || "",
      fiscalPeriod: runLog.fiscalPeriod || "ALL",
      selectedAccounts: runLog.selectedAccounts || [],
      inventoryRecords: runLog.inventoryRecords || 0,
      glRecords: runLog.glRecords || 0,
      inventoryValue: runLog.inventoryValue || 0,
      glValue: runLog.glValue || 0,
      varianceAmount: runLog.varianceAmount || 0,
      exceptionCount: runLog.exceptionCount || 0,
      workbookPath: runLog.workbookPath || "",
      executionTimeSeconds: runLog.executionTimeSeconds || 0,
      status: runLog.status || "SUCCESS",
      errorMessage: runLog.errorMessage || "",
    };

    history.push(entry);
    this._writeHistory(history);

    return entry;
  }

  /**
   * Get run history with optional filters.
   * @param {object} [filters]
   * @param {string} [filters.companyCode]
   * @param {string} [filters.plant]
   * @param {string} [filters.fiscalYear]
   * @param {string} [filters.user]
   * @param {string} [filters.fromDate] - ISO date string
   * @param {string} [filters.toDate] - ISO date string
   * @returns {ReconciliationRunLog[]}
   */
  getRunHistory(filters = {}) {
    let history = this._readHistory();

    if (filters.companyCode) {
      history = history.filter((r) => r.companyCode === filters.companyCode);
    }
    if (filters.plant) {
      history = history.filter((r) => r.plant === filters.plant);
    }
    if (filters.fiscalYear) {
      history = history.filter((r) => r.fiscalYear === filters.fiscalYear);
    }
    if (filters.user) {
      history = history.filter((r) => r.user === filters.user);
    }
    if (filters.fromDate) {
      const from = new Date(filters.fromDate).getTime();
      history = history.filter((r) => new Date(r.timestamp).getTime() >= from);
    }
    if (filters.toDate) {
      const to = new Date(filters.toDate).getTime();
      history = history.filter((r) => new Date(r.timestamp).getTime() <= to);
    }

    // Return newest first
    return history.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }

  /**
   * Get a single run by ID.
   * @param {string} runId
   * @returns {ReconciliationRunLog|null}
   */
  getRun(runId) {
    const history = this._readHistory();
    return history.find((r) => r.runId === runId) || null;
  }

  /**
   * Delete runs older than a given number of days.
   * @param {number} [daysOld=90] - Delete runs older than this many days
   * @returns {number} Number of runs deleted
   */
  deleteOldRuns(daysOld = 90) {
    const cutoff = Date.now() - daysOld * 24 * 60 * 60 * 1000;
    const history = this._readHistory();
    const remaining = history.filter(
      (r) => new Date(r.timestamp).getTime() >= cutoff,
    );
    const deleted = history.length - remaining.length;
    this._writeHistory(remaining);
    return deleted;
  }

  /**
   * Get total run count.
   * @returns {number}
   */
  getRunCount() {
    return this._readHistory().length;
  }

  /**
   * Clear all history (for testing).
   */
  clearHistory() {
    this._writeHistory([]);
  }

  // --- Private ---

  _ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  _readHistory() {
    try {
      if (!fs.existsSync(HISTORY_FILE)) return [];
      const raw = fs.readFileSync(HISTORY_FILE, "utf8");
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    } catch (err) {
      console.warn(`[AuditTrail] Read error: ${err.message}`);
      return [];
    }
  }

  _writeHistory(history) {
    this._ensureDataDir();
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), "utf8");
  }
}

module.exports = AuditTrailService;
