/**
 * Phase 3.9 - Test Field Mapping Report & Export
 *
 * Run: node tests/test-field-mapping.js
 *
 * Does NOT require SAP connection.
 * Generates: output/Customer_Field_Mapping.xlsx
 */
const FieldMappingService = require("../services/field-mapping.service");
const FieldMappingExportService = require("../services/field-mapping-export.service");

async function testFieldMapping() {
  console.log("=== Customer Field Mapping Report ===\n");

  const mappingService = new FieldMappingService();
  const exportService = new FieldMappingExportService();

  // Get report
  const report = mappingService.getFieldMappingReport();

  // Coverage summary
  console.log("--- Coverage Summary ---");
  console.log(`  Total Columns:    ${report.totalColumns}`);
  console.log(`  Covered:          ${report.coveredColumns}`);
  console.log(`  Missing:          ${report.missingColumns}`);
  console.log(`  Coverage:         ${report.coveragePercent}%`);
  console.log("");
  console.log("--- Breakdown ---");
  console.log(`  AVAILABLE:                ${report.breakdown.available}`);
  console.log(`  PARTIAL:                  ${report.breakdown.partial}`);
  console.log(`  MISSING:                  ${report.breakdown.missing}`);
  console.log(
    `  INVESTIGATION_REQUIRED:   ${report.breakdown.investigationRequired}`,
  );

  // Available fields
  console.log("\n--- Available Fields ---");
  const available = mappingService.getAvailable();
  for (let i = 0; i < available.length; i++) {
    const m = available[i];
    console.log(
      `  ✓ ${m.customerColumn.padEnd(28)} → ${m.applicationField} (${m.sapTable}.${m.sapField})`,
    );
  }

  // Gaps
  console.log("\n--- Gaps & Investigation Required ---");
  const gaps = mappingService.getGaps();
  for (let i = 0; i < gaps.length; i++) {
    const g = gaps[i];
    const icon = g.status === "MISSING" ? "✗" : "?";
    console.log(`  ${icon} ${g.customerColumn.padEnd(28)} [${g.status}]`);
    console.log(`    ${g.remarks}`);
  }

  // Generate Excel
  console.log("\n--- Generating Excel ---");
  const filePath = await exportService.exportFieldMappingWorkbook(report);
  console.log(`  ✓ ${filePath}`);

  console.log("\n--- Next Steps ---");
  console.log("  1. Send Customer_Field_Mapping.xlsx to Finance SME");
  console.log(
    "  2. SME confirms which INVESTIGATION_REQUIRED fields are needed",
  );
  console.log("  3. SME provides SAP source table/field for each gap");
  console.log("  4. Update config/customer-field-mapping.js with findings");
  console.log("  5. Implement confirmed fields in InventoryDatasetService");

  console.log("\nDone.");
}

testFieldMapping();
