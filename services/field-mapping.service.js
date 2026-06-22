const FIELD_MAPPINGS = require("../config/customer-field-mapping");

/**
 * Field Mapping Service
 *
 * Provides field mapping report and coverage analysis.
 * Used for gap analysis and customer communication.
 */
class FieldMappingService {
  /**
   * Get full field mapping report with coverage analysis.
   * @returns {FieldMappingReport}
   */
  getFieldMappingReport() {
    const totalColumns = FIELD_MAPPINGS.length;

    let available = 0;
    let partial = 0;
    let missing = 0;
    let investigation = 0;

    for (let i = 0; i < FIELD_MAPPINGS.length; i++) {
      switch (FIELD_MAPPINGS[i].status) {
        case "AVAILABLE":
          available++;
          break;
        case "PARTIAL":
          partial++;
          break;
        case "MISSING":
          missing++;
          break;
        case "INVESTIGATION_REQUIRED":
          investigation++;
          break;
      }
    }

    const coveredColumns = available + partial;
    const missingColumns = missing + investigation;
    const coveragePercent = Math.round((coveredColumns / totalColumns) * 100);

    return {
      totalColumns,
      coveredColumns,
      missingColumns,
      coveragePercent,
      breakdown: {
        available,
        partial,
        missing,
        investigationRequired: investigation,
      },
      mappings: FIELD_MAPPINGS,
    };
  }

  /**
   * Get only gaps (MISSING + INVESTIGATION_REQUIRED)
   * @returns {FieldMapping[]}
   */
  getGaps() {
    const gaps = [];
    for (let i = 0; i < FIELD_MAPPINGS.length; i++) {
      const m = FIELD_MAPPINGS[i];
      if (m.status === "MISSING" || m.status === "INVESTIGATION_REQUIRED") {
        gaps.push(m);
      }
    }
    return gaps;
  }

  /**
   * Get only available fields
   * @returns {FieldMapping[]}
   */
  getAvailable() {
    const available = [];
    for (let i = 0; i < FIELD_MAPPINGS.length; i++) {
      if (FIELD_MAPPINGS[i].status === "AVAILABLE") {
        available.push(FIELD_MAPPINGS[i]);
      }
    }
    return available;
  }
}

module.exports = FieldMappingService;
