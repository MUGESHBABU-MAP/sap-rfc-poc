/**
 * MCP Auth Provider (Phase 4.1 - Stub)
 *
 * Placeholder for future JWT authentication.
 * Currently passes all requests through.
 *
 * Future implementation:
 *   - Validate JWT Bearer token
 *   - Extract user/tenant from token
 *   - Attach user context to request
 */

/**
 * Authentication middleware (currently no-op).
 * Replace with JWT validation when ready.
 */
function authMiddleware(req, res, next) {
  // Future: validate Authorization header
  // const token = req.headers.authorization;
  // if (!token) return res.status(401).json({ error: "Unauthorized" });
  // const user = validateJWT(token);
  // req.mcpUser = user;

  req.mcpUser = { id: "anonymous", role: "user" };
  next();
}

/**
 * Check if authentication is enabled.
 * @returns {boolean}
 */
function isAuthEnabled() {
  return process.env.MCP_AUTH_ENABLED === "true";
}

module.exports = { authMiddleware, isAuthEnabled };
