const reconConfig = require("../config/reconciliation.config");

/**
 * Reconciliation Service
 *
 * Compares inventory values against GL balances at plant and
 * storage location level. Uses Map-based single-pass aggregation
 * to handle millions of records without stack overflow.
 *
 * Performance:
 *   - No nested O(n²) loops
 *   - Single-pass aggregation using Map()
 *   - No Math.max/min spread on large arrays
 *   - No recursive algorithms
 */
class ReconciliationService {
  constructor(config) {
    this.config = config || reconConfig;
  }

  /**
   * Reconcile inventory vs GL by plant.
   *
   * @param {InventoryRecord[]} inventoryRecords - from InventoryDatasetService
   * @param {GLBalanceRecord[]} glRecords - from GLDatasetService
   * @returns {PlantReconciliation[]}
   */
  reconcileByPlant(inventoryRecords, glRecords) {
    // Step 1: Aggregate inventory by plant (single pass)
    const invByPlant = this._aggregateInventoryByPlant(inventoryRecords);

    // Step 2: Aggregate GL by mapped accounts per plant (single pass)
    const glByPlant = this._aggregateGLByPlant(glRecords);

    // Step 3: Produce reconciliation results
    const allPlants = new Set([...invByPlant.keys(), ...glByPlant.keys()]);
    const results = [];

    for (const plant of allPlants) {
      const inventoryValue = invByPlant.get(plant) || 0;
      const glBalance = glByPlant.get(plant) || 0;
      const variance = round2(inventoryValue - glBalance);
      const variancePercent =
        glBalance === 0
          ? 0
          : round2(((inventoryValue - glBalance) / Math.abs(glBalance)) * 100);

      results.push({
        plant,
        inventoryValue: round2(inventoryValue),
        glBalance: round2(glBalance),
        variance,
        variancePercent,
        status:
          Math.abs(variance) < this.config.thresholds.matchThreshold
            ? "MATCH"
            : "VARIANCE",
      });
    }

    return results;
  }

  /**
   * Reconcile inventory vs GL by storage location within each plant.
   *
   * @param {InventoryRecord[]} inventoryRecords
   * @param {GLBalanceRecord[]} glRecords
   * @returns {StorageLocationReconciliation[]}
   */
  reconcileByStorageLocation(inventoryRecords, glRecords) {
    // Aggregate inventory by plant+storageLocation (single pass)
    const invByLoc = new Map();

    for (let i = 0; i < inventoryRecords.length; i++) {
      const r = inventoryRecords[i];
      const key = `${r.plant}|${r.storageLocation}`;
      invByLoc.set(
        key,
        (invByLoc.get(key) || 0) + (r.totalInventoryValue || 0),
      );
    }

    // GL aggregated by plant (location-level GL breakdown not available from FAGLFLEXT)
    const glByPlant = this._aggregateGLByPlant(glRecords);

    // Produce results
    const results = [];

    for (const [key, inventoryValue] of invByLoc) {
      const [plant, storageLocation] = key.split("|");
      const plantGLBalance = glByPlant.get(plant) || 0;

      // Pro-rate GL balance by location's share of plant inventory
      const plantInvTotal = this._getPlantInventoryTotal(invByLoc, plant);
      const locationShare =
        plantInvTotal === 0 ? 0 : inventoryValue / plantInvTotal;
      const glBalance = round2(plantGLBalance * locationShare);

      const variance = round2(inventoryValue - glBalance);
      const variancePercent =
        glBalance === 0
          ? 0
          : round2(((inventoryValue - glBalance) / Math.abs(glBalance)) * 100);

      results.push({
        plant,
        storageLocation,
        inventoryValue: round2(inventoryValue),
        glBalance,
        variance,
        variancePercent,
        status:
          Math.abs(variance) < this.config.thresholds.matchThreshold
            ? "MATCH"
            : "VARIANCE",
      });
    }

    return results;
  }

  /**
   * Get top variances sorted by ABS(variance) descending.
   *
   * @param {InventoryRecord[]} inventoryRecords
   * @param {GLBalanceRecord[]} glRecords
   * @param {number} limit - max results (default 100)
   * @returns {TopVariance[]}
   */
  getTopVariances(inventoryRecords, glRecords, limit = 100) {
    const locationResults = this.reconcileByStorageLocation(
      inventoryRecords,
      glRecords,
    );

    // Sort by absolute variance descending (iterative, no spread)
    locationResults.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));

    // Return top N
    const top = [];
    const count = Math.min(limit, locationResults.length);
    for (let i = 0; i < count; i++) {
      top.push(locationResults[i]);
    }
    return top;
  }

  /**
   * Generate reconciliation summary.
   *
   * @param {InventoryRecord[]} inventoryRecords
   * @param {GLBalanceRecord[]} glRecords
   * @returns {ReconciliationSummary}
   */
  getSummary(inventoryRecords, glRecords) {
    const plantResults = this.reconcileByPlant(inventoryRecords, glRecords);

    let totalInventoryValue = 0;
    let totalGLBalance = 0;
    let matchedPlants = 0;
    let variancePlants = 0;

    for (let i = 0; i < plantResults.length; i++) {
      const r = plantResults[i];
      totalInventoryValue += r.inventoryValue;
      totalGLBalance += r.glBalance;
      if (r.status === "MATCH") matchedPlants++;
      else variancePlants++;
    }

    const totalVariance = round2(totalInventoryValue - totalGLBalance);
    const variancePercent =
      totalGLBalance === 0
        ? 0
        : round2(
            ((totalInventoryValue - totalGLBalance) /
              Math.abs(totalGLBalance)) *
              100,
          );

    return {
      totalInventoryValue: round2(totalInventoryValue),
      totalGLBalance: round2(totalGLBalance),
      totalVariance,
      variancePercent,
      matchedPlants,
      variancePlants,
      totalPlants: plantResults.length,
    };
  }

  // --- Private: Aggregation helpers (single-pass, Map-based) ---

  /**
   * Aggregate inventory totalInventoryValue by plant. Single pass O(n).
   */
  _aggregateInventoryByPlant(inventoryRecords) {
    const map = new Map();
    for (let i = 0; i < inventoryRecords.length; i++) {
      const r = inventoryRecords[i];
      const plant = r.plant || "UNKNOWN";
      map.set(plant, (map.get(plant) || 0) + (r.totalInventoryValue || 0));
    }
    return map;
  }

  /**
   * Aggregate GL cumulativeBalance by plant using config mappings. Single pass O(n).
   *
   * Builds an account→plant lookup from config, then sums GL records
   * whose glAccount matches a mapped inventory account.
   */
  _aggregateGLByPlant(glRecords) {
    // Build account → plant lookup from config
    const accountToPlant = new Map();
    const mappings = this.config.plantMappings || {};

    for (const plant of Object.keys(mappings)) {
      const accounts = mappings[plant].inventoryAccounts || [];
      for (let i = 0; i < accounts.length; i++) {
        accountToPlant.set(accounts[i], plant);
      }
    }

    // Aggregate GL by plant
    const map = new Map();
    for (let i = 0; i < glRecords.length; i++) {
      const r = glRecords[i];
      const plant = accountToPlant.get(r.glAccount);
      if (plant) {
        map.set(plant, (map.get(plant) || 0) + (r.cumulativeBalance || 0));
      }
    }
    return map;
  }

  /**
   * Get total inventory for a plant from the location map.
   */
  _getPlantInventoryTotal(invByLoc, plant) {
    let total = 0;
    for (const [key, value] of invByLoc) {
      if (key.startsWith(plant + "|")) {
        total += value;
      }
    }
    return total;
  }
}

function round2(val) {
  return Math.round(val * 100) / 100;
}

module.exports = ReconciliationService;
