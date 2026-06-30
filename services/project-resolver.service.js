/**
 * Project Resolver Service (Phase 5)
 *
 * Resolves a KTern projectId to its database name (dbName).
 * Reads from master database: kt_m_projects collection.
 *
 * Flow: projectId → master DB → kt_m_projects → dbName
 */

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

class ProjectResolverService {
  constructor(mongoClient) {
    this.mongoClient = mongoClient;
    this.masterDb = process.env.MASTER_DATABASE || "ktern-masterdb";
    this.collection = process.env.PROJECT_COLLECTION || "kt_m_projects";
    this._cache = new Map(); // projectId → { dbName, expiry }
  }

  /**
   * Resolve a projectId to its database name.
   * @param {string} projectId - MongoDB ObjectId string
   * @returns {Promise<{dbName: string}>}
   * @throws {Error} If project not found or dbName missing
   */
  async resolve(projectId) {
    if (!projectId) {
      throw new Error("projectId is required");
    }

    // Check cache
    const cached = this._cache.get(projectId);
    if (cached && Date.now() < cached.expiry) {
      return { dbName: cached.dbName };
    }

    // Lookup in MongoDB
    let ObjectId;
    try {
      ObjectId = require("mongodb").ObjectId;
    } catch (e) {
      // mongodb not installed — use string ID comparison
      ObjectId = null;
    }

    const db = this.mongoClient.db(this.masterDb);
    const col = db.collection(this.collection);

    const query = ObjectId
      ? { _id: new ObjectId(projectId) }
      : { _id: projectId };
    const project = await col.findOne(query);

    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    if (!project.dbName) {
      throw new Error(`Project ${projectId} has no dbName`);
    }

    // Cache result
    this._cache.set(projectId, {
      dbName: project.dbName,
      expiry: Date.now() + CACHE_TTL_MS,
    });

    log(`Resolved project ${projectId} → ${project.dbName}`);
    return { dbName: project.dbName };
  }

  /**
   * Clear cache (for testing).
   */
  clearCache() {
    this._cache.clear();
  }
}

function log(msg) {
  console.log(`[ProjectResolver] ${msg}`);
}

module.exports = ProjectResolverService;
