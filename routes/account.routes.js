const express = require("express");
const router = express.Router();

/**
 * Account Routes (Phase 3.18A)
 *
 * GET /api/accounts?companyCode=1000
 *   Returns all GL accounts available for the company code.
 *
 * Query params:
 *   companyCode (required) - SAP company code
 *   language (optional) - Language for descriptions (default: EN)
 */
module.exports = function (accountService) {
  /**
   * GET /api/accounts
   * Returns deduplicated GL accounts with descriptions.
   */
  router.get("/", async (req, res) => {
    try {
      const companyCode = req.query.companyCode;

      if (!companyCode) {
        return res.status(400).json({
          success: false,
          error: "Parameter 'companyCode' is required.",
          hint: "Example: /api/accounts?companyCode=1000",
        });
      }

      const language = req.query.language || "EN";

      const accounts = await accountService.getAccounts({
        companyCode,
        language,
      });

      res.json({
        success: true,
        data: {
          accounts,
        },
        meta: {
          companyCode,
          language,
          totalAccounts: accounts.length,
          source: "SKB1 + SKAT",
        },
      });
    } catch (err) {
      console.error("GET /api/accounts error:", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
};
