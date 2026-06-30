/**
 * Credential Provider Service (Phase 5 + Production Mode)
 *
 * Resolves SAP RFC credentials from KTern project/system configuration.
 *
 * Deployment Modes (APP_ENV):
 *   development (default): Mongo preferred, ENV fallback allowed.
 *   production: Mongo mandatory, ENV never used.
 *
 * Flow:
 *   projectId + systemID
 *     → ProjectResolver (projectId → dbName)
 *     → SystemDefinitionRepository (dbName + systemID → system def)
 *     → Select connection → Extract credentials
 *     → Return RFC config
 */

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

class CredentialProviderService {
  constructor(projectResolver, systemRepository) {
    this.projectResolver = projectResolver;
    this.systemRepository = systemRepository;
    this._cache = new Map(); // "projectId|systemID" → { credentials, expiry }
  }

  /**
   * Resolve SAP RFC credentials.
   *
   * @param {string} [projectId] - KTern project ID
   * @param {string} [systemID] - SAP system ID
   * @returns {Promise<{ashost, sysnr, client, user, passwd, lang, source}>}
   */
  async resolve(projectId, systemID) {
    const isProduction = _isProduction();

    // If no projectId/systemID
    if (!projectId || !systemID) {
      if (isProduction) {
        throw new CredentialError(
          "ProductionModeRequiresProjectAndSystem",
          "projectId and systemID are required in production.",
        );
      }
      return this._envFallback("No projectId/systemID provided");
    }

    // Check cache
    const cacheKey = `${projectId}|${systemID}`;
    const cached = this._cache.get(cacheKey);
    if (cached && Date.now() < cached.expiry) {
      log(
        `Credential Source: MongoDB | project=${projectId} system=${systemID} | Cache: HIT`,
      );
      return cached.credentials;
    }

    try {
      // Step 1: Resolve project → dbName
      const { dbName } = await this.projectResolver.resolve(projectId);

      // Step 2: Get system definition
      const systemDef = await this.systemRepository.getSystemDefinition(
        dbName,
        systemID,
      );

      // Step 3: Select best connection
      const connection = this.systemRepository.selectConnection(systemDef);

      // Step 4: Build RFC config (support both naming conventions)
      const credentials = {
        ashost:
          systemDef.applicationServer ||
          connection.applicationServer ||
          connection.host ||
          "",
        sysnr:
          systemDef.instanceNumber ||
          connection.instanceNumber ||
          connection.systemNumber ||
          "00",
        client: systemDef.client || connection.client || "",
        user: connection.user || connection.username || "",
        passwd: this._resolvePassword(connection),
        lang: connection.lang || connection.language || "EN",
        source: "dynamic",
        projectId,
        systemID,
        dbName,
      };

      // Cache
      this._cache.set(cacheKey, {
        credentials,
        expiry: Date.now() + CACHE_TTL_MS,
      });

      log(
        `Credential Source: MongoDB | project=${projectId} system=${systemID} | Cache: MISS`,
      );
      return credentials;
    } catch (err) {
      // In production, never fall back to ENV
      if (isProduction) {
        // Re-throw with clear classification if not already a CredentialError
        if (err instanceof CredentialError) throw err;
        if (
          err.message.includes("not found") &&
          err.message.includes("Project")
        ) {
          throw new CredentialError("ProjectNotFound", err.message);
        }
        if (
          err.message.includes("not found") &&
          err.message.includes("System")
        ) {
          throw new CredentialError("SystemNotFound", err.message);
        }
        if (err.message.includes("no connections")) {
          throw new CredentialError("CredentialsMissing", err.message);
        }
        if (err.message.includes("decryption")) {
          throw new CredentialError("CredentialsMissing", err.message);
        }
        throw new CredentialError("MongoUnavailable", err.message);
      }

      // Development: fall back to ENV
      return this._envFallback(err.message);
    }
  }

  /**
   * Resolve password from connection.
   * Stub: future implementation will use KTern Connector decryption.
   */
  _resolvePassword(connection) {
    const password = connection.password || connection.passwd || "";

    // If password looks encrypted (future detection)
    if (password && password.startsWith("ENC:")) {
      return decryptPassword(password);
    }

    return password;
  }

  /**
   * Fallback to .env credentials (development only).
   */
  _envFallback(reason) {
    log(`Credential Source: ENV | Reason: ${reason}`);
    return {
      ashost: process.env.SAP_ASHOST || "",
      sysnr: process.env.SAP_SYSNR || "",
      client: process.env.SAP_CLIENT || "",
      user: process.env.SAP_USER || "",
      passwd: process.env.SAP_PASSWORD || "",
      lang: process.env.SAP_LANG || "EN",
      source: "env_fallback",
    };
  }

  /**
   * Clear credential cache.
   */
  clearCache() {
    this._cache.clear();
  }
}

/**
 * Credential resolution error with classification.
 */
class CredentialError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "CredentialError";
  }
}

/**
 * Password decryption stub.
 * Future: reuse KTern Connector decryption implementation.
 * @param {string} encryptedPassword
 * @returns {string}
 */
function decryptPassword(encryptedPassword) {
  throw new CredentialError(
    "CredentialsMissing",
    "Password decryption provider not configured. " +
      "Encrypted passwords require KTern Connector integration.",
  );
}

/**
 * Check if ENV fallback is allowed.
 * Uses ALLOW_ENV_SAP_FALLBACK (explicit flag) with APP_ENV as secondary signal.
 *
 * Priority:
 *   1. ALLOW_ENV_SAP_FALLBACK=true/false (explicit)
 *   2. APP_ENV=production → fallback disabled
 *   3. Default → fallback enabled (development convenience)
 *
 * @returns {boolean}
 */
function _isProduction() {
  const explicitFlag = process.env.ALLOW_ENV_SAP_FALLBACK;
  if (explicitFlag !== undefined) {
    return explicitFlag !== "true";
  }
  return (process.env.APP_ENV || "development") === "production";
}

function log(msg) {
  console.log(`[CredentialProvider] ${msg}`);
}

module.exports = CredentialProviderService;
module.exports.decryptPassword = decryptPassword;
module.exports.CredentialError = CredentialError;
