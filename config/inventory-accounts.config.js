/**
 * Inventory Account Provider
 *
 * Maps company codes to their inventory GL accounts.
 * Finance SME identifies these accounts from FAGLFLEXT data.
 *
 * Future: Can be replaced by DB table or API call.
 *
 * Methods:
 *   getAccounts(companyCode) → string[]
 *   getAllAccounts() → { companyCode: string[] }
 */

const INVENTORY_ACCOUNTS = {
  1000: [
    "0013000000",
    "0013200000",
    "0013300000",
    "0013400000",
    "0013403000",
    "0013404000",
    "0013405000",
    "0013406000",
  ],
};

module.exports = {
  /**
   * Get inventory accounts for a specific company code.
   * @param {string} companyCode
   * @returns {string[]}
   */
  getAccounts(companyCode) {
    return INVENTORY_ACCOUNTS[companyCode] || [];
  },

  /**
   * Get all configured inventory accounts.
   * @returns {object} { companyCode: string[] }
   */
  getAllAccounts() {
    return { ...INVENTORY_ACCOUNTS };
  },

  /**
   * Check if an account is an inventory account.
   * @param {string} companyCode
   * @param {string} account
   * @returns {boolean}
   */
  isInventoryAccount(companyCode, account) {
    const accounts = INVENTORY_ACCOUNTS[companyCode];
    if (!accounts) return false;
    return accounts.indexOf(account) !== -1;
  },
};
