/**
 * Inventory Summary Service
 *
 * Takes InventoryRecord[] from InventoryDatasetService
 * and groups by storageLocation to produce location-wise summaries.
 *
 * Replaces workbook tabs: ECOM, WH10, OSL1, OSL2, PRD1, PRD2, etc.
 * The UI will filter dynamically instead of separate worksheets.
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
          unrestrictedValue: 0,
          transitValue: 0,
          qualityValue: 0,
          restrictedValue: 0,
          blockedValue: 0,
          returnsValue: 0,
          totalInventoryValue: 0,
          materialCount: 0,
        };
      }

      const summary = locationMap[loc];
      summary.unrestrictedValue += record.unrestrictedValue;
      summary.transitValue += record.transitValue;
      summary.qualityValue += record.qualityValue;
      summary.restrictedValue += record.restrictedValue;
      summary.blockedValue += record.blockedValue;
      summary.returnsValue += record.returnsValue;
      summary.totalInventoryValue += record.totalInventoryValue;
      summary.materialCount += 1;
    }

    // Round final values
    const results = Object.values(locationMap).map((s) => ({
      ...s,
      unrestrictedValue: round2(s.unrestrictedValue),
      transitValue: round2(s.transitValue),
      qualityValue: round2(s.qualityValue),
      restrictedValue: round2(s.restrictedValue),
      blockedValue: round2(s.blockedValue),
      returnsValue: round2(s.returnsValue),
      totalInventoryValue: round2(s.totalInventoryValue),
    }));

    return results;
  }
}

function round2(val) {
  return Math.round(val * 100) / 100;
}

module.exports = InventorySummaryService;
