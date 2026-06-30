/**
 * SAP Connection Factory (Phase 5)
 *
 * Creates connected SAP RFC clients using the Credential Provider.
 * Manages connection lifecycle and caching.
 *
 * Architecture:
 *   API/MCP Boundary
 *     → SAPConnectionFactory.create(projectId, systemID)
 *     → CredentialProvider.resolve()
 *     → new SAPService(credentials)
 *     → sapService.connect()
 *     → Return connected SAPService
 *
 * Business services receive the connected SAPService.
 * They remain completely unaware of projects, MongoDB, or system selection.
 */
const SAPService = require("./sap.service");

class SAPConnectionFactory {
  constructor(credentialProvider) {
    this.credentialProvider = credentialProvider;
    this._connections = new Map(); // "projectId|systemID" → SAPService
  }

  /**
   * Create (or reuse) a connected SAP service.
   *
   * @param {string} [projectId] - KTern project ID (optional)
   * @param {string} [systemID] - SAP system ID (optional)
   * @returns {Promise<SAPService>} Connected SAP service
   */
  async create(projectId, systemID) {
    const cacheKey = `${projectId || "env"}|${systemID || "env"}`;

    // Reuse existing connection if available
    const existing = this._connections.get(cacheKey);
    if (existing) {
      return existing;
    }

    // Resolve credentials
    const credentials = await this.credentialProvider.resolve(
      projectId,
      systemID,
    );

    log(`Creating RFC connection (source=${credentials.source})`);

    // Create and connect
    const sapService = new SAPService({
      ashost: credentials.ashost,
      sysnr: credentials.sysnr,
      client: credentials.client,
      user: credentials.user,
      passwd: credentials.passwd,
      lang: credentials.lang,
    });

    await sapService.connect();

    // Cache the connection
    this._connections.set(cacheKey, sapService);

    log(`Connected (key=${cacheKey})`);
    return sapService;
  }

  /**
   * Disconnect and remove a cached connection.
   * @param {string} [projectId]
   * @param {string} [systemID]
   */
  async disconnect(projectId, systemID) {
    const cacheKey = `${projectId || "env"}|${systemID || "env"}`;
    const existing = this._connections.get(cacheKey);
    if (existing) {
      try {
        await existing.disconnect();
      } catch (e) {
        /* ignore disconnect errors */
      }
      this._connections.delete(cacheKey);
    }
  }

  /**
   * Disconnect all cached connections.
   */
  async disconnectAll() {
    for (const [key, sap] of this._connections) {
      try {
        await sap.disconnect();
      } catch (e) {
        /* ignore */
      }
    }
    this._connections.clear();
  }

  /**
   * Get count of active connections.
   */
  getConnectionCount() {
    return this._connections.size;
  }
}

function log(msg) {
  console.log(`[SAPConnectionFactory] ${msg}`);
}

module.exports = SAPConnectionFactory;
