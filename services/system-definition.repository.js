/**
 * System Definition Repository (Phase 5)
 *
 * Reads SAP system definitions from a project's database.
 * Collection: kt_m_systemDefinitions
 *
 * No RFC logic. Only MongoDB reads.
 */

class SystemDefinitionRepository {
  constructor(mongoClient) {
    this.mongoClient = mongoClient;
  }

  /**
   * Get system definition by dbName and systemID.
   * @param {string} dbName - Project database name (e.g., "google-kae")
   * @param {string} systemID - SAP System ID (e.g., "AK4")
   * @returns {Promise<SystemDefinition>}
   * @throws {Error} If system not found
   */
  async getSystemDefinition(dbName, systemID) {
    if (!dbName) throw new Error("dbName is required");
    if (!systemID) throw new Error("systemID is required");

    const db = this.mongoClient.db(dbName);
    const col = db.collection("kt_m_systemDefinitions");

    const systemDef = await col.findOne({ systemID });

    if (!systemDef) {
      throw new Error(`System '${systemID}' not found in database '${dbName}'`);
    }

    return systemDef;
  }

  /**
   * List all systems for a project database.
   * @param {string} dbName
   * @returns {Promise<SystemDefinition[]>}
   */
  async listSystems(dbName) {
    if (!dbName) throw new Error("dbName is required");

    const db = this.mongoClient.db(dbName);
    const col = db.collection("kt_m_systemDefinitions");

    return await col.find({}).toArray();
  }

  /**
   * Select the best connection from a system definition.
   * Prefers status=="Connected", otherwise first connection.
   * @param {SystemDefinition} systemDef
   * @returns {object} Connection object
   */
  selectConnection(systemDef) {
    const connections = systemDef.connections || [];
    if (connections.length === 0) {
      throw new Error(`System '${systemDef.systemID}' has no connections`);
    }

    // Prefer "Connected" status
    const connected = connections.find((c) => c.status === "Connected");
    return connected || connections[0];
  }
}

module.exports = SystemDefinitionRepository;
