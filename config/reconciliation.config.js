/**
 * Reconciliation Configuration
 *
 * Maps inventory plants/locations to GL accounts.
 * This is configuration-driven — customer-specific mappings
 * will be updated as the implementation progresses.
 *
 * inventoryAccounts: GL accounts that hold inventory values
 * plantMappings: Per-plant GL account assignments
 */
module.exports = {
  // GL accounts that represent inventory balances
  inventoryAccounts: ["0014000900", "0016200000", "0016400000"],

  // Plant-to-GL account mapping
  plantMappings: {
    1000: {
      companyCode: "1000",
      inventoryAccounts: ["0014000900", "0016200000"],
    },
    2000: {
      companyCode: "1000",
      inventoryAccounts: ["0016400000"],
    },
  },

  // Default company code if plant mapping doesn't specify one
  defaultCompanyCode: "1000",

  // Variance threshold rules
  thresholds: {
    matchThreshold: 1, // ABS(variance) < 1 → MATCH
  },
};
