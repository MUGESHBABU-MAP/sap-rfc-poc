/**
 * Reconciliation Service
 *
 * Compares Inventory Summary (by location) against GL Summary
 * and calculates variance per location.
 *
 * Formula:
 *   variance = inventoryValue - glValue
 *   variancePercent = (variance / glValue) * 100
 */
class ReconciliationService {
  /**
   * Calculate location-wise variance.
   * @param {InventorySummary[]} inventorySummary - from InventorySummaryService
   * @param {GLSummary[]} glSummary - from GLDatasetService
   * @param {object} locationToCompanyMap - maps storageLocation -> companyCode
   *   e.g. { "WH10": "1000", "ECOM": "1000" }
   *   If not provided, uses a flat total comparison.
   * @returns {ReconciliationResult[]}
   */
  calculateVariance(inventorySummary, glSummary, locationToCompanyMap = null) {
    // If a mapping is provided, do location-level reconciliation
    if (locationToCompanyMap) {
      return this._locationWiseReconciliation(
        inventorySummary,
        glSummary,
        locationToCompanyMap,
      );
    }

    // Default: compare total inventory value vs total GL net balance
    return this._totalReconciliation(inventorySummary, glSummary);
  }

  _locationWiseReconciliation(inventorySummary, glSummary, mapping) {
    const glMap = {};
    for (const gl of glSummary) {
      glMap[gl.companyCode] = gl;
    }

    return inventorySummary.map((inv) => {
      const companyCode = mapping[inv.location];
      const gl = companyCode ? glMap[companyCode] : null;
      const glValue = gl ? gl.netBalance : 0;
      const inventoryValue = inv.totalInventoryValue;

      const variance = inventoryValue - glValue;
      const variancePercent =
        glValue === 0 ? 0 : Math.round((variance / glValue) * 100 * 100) / 100;

      return {
        location: inv.location,
        inventoryValue,
        glValue,
        variance,
        variancePercent,
      };
    });
  }

  _totalReconciliation(inventorySummary, glSummary) {
    const totalInventoryValue = inventorySummary.reduce(
      (sum, s) => sum + s.totalInventoryValue,
      0,
    );

    const totalGLValue = glSummary.reduce((sum, s) => sum + s.netBalance, 0);

    const variance = totalInventoryValue - totalGLValue;
    const variancePercent =
      totalGLValue === 0
        ? 0
        : Math.round((variance / totalGLValue) * 100 * 100) / 100;

    return [
      {
        location: "TOTAL",
        inventoryValue: totalInventoryValue,
        glValue: totalGLValue,
        variance,
        variancePercent,
      },
    ];
  }
}

module.exports = ReconciliationService;
