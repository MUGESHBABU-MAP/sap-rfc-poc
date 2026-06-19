/**
 * Inventory Summary Service
 *
 * Takes InventoryRecord[] from InventoryDatasetService
 * and groups by storageLocation to produce location-wise summaries.
 *
 * Replaces workbook tabs: WH10, ECOM, OSL1, PRD1, etc.
 */
class InventorySummaryService {
  /**
   * Generate location-wise inventory summaries.
   * @param {InventoryRecord[]} inventoryRecords
   * @returns {InventorySummary[]}
   */
  summarizeByLocation(inventoryRecords) {
    const locationMap = {};

    for (const record of inventoryRecords) {
      const loc = record.storageLocation || "UNKNOWN";

      if (!locationMap[loc]) {
        locationMap[loc] = {
          location: loc,
          unrestrictedQty: 0,
          unrestrictedValue: 0,
          qualityQty: 0,
          qualityValue: 0,
          blockedQty: 0,
          blockedValue: 0,
          transitQty: 0,
          transitValue: 0,
          returnsQty: 0,
          returnsValue: 0,
          totalInventoryValue: 0,
        };
      }

      const summary = locationMap[loc];
      summary.unrestrictedQty += record.unrestrictedQty;
      summary.unrestrictedValue += record.unrestrictedValue;
      summary.qualityQty += record.qualityQty;
      summary.qualityValue += record.qualityValue;
      summary.blockedQty += record.blockedQty;
      summary.blockedValue += record.blockedValue;
      summary.transitQty += record.transitQty;
      summary.transitValue += record.transitValue;
      summary.returnsQty += record.returnsQty;
      summary.returnsValue += record.returnsValue;
    }

    // Calculate total inventory value per location
    for (const loc of Object.keys(locationMap)) {
      const s = locationMap[loc];
      s.totalInventoryValue =
        s.unrestrictedValue +
        s.qualityValue +
        s.blockedValue +
        s.transitValue +
        s.returnsValue;
    }

    return Object.values(locationMap);
  }
}

module.exports = InventorySummaryService;
