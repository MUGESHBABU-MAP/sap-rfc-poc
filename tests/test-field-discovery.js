/**
 * Phase 3.10 - SAP Field Discovery (Combined Report)
 *
 * Run: node tests/test-field-discovery.js
 *
 * Runs all field discovery tests and generates:
 *   output/SAP_Field_Discovery.xlsx
 *
 * Tests: MARD extended, MBEW extended, MCHB, Special Stock tables
 * Goal: Determine availability of all gap fields.
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const SAPService = require("../services/sap.service");
const parseRows = require("../utils/parse-rows");
const { analyzeFields } = require("../utils/field-discovery");

const OUTPUT_DIR = path.resolve(__dirname, "../output");

const DISCOVERY_TABLES = [
  {
    table: "MARD",
    description: "Storage Location Stock",
    fields: [
      "MATNR",
      "WERKS",
      "LGORT",
      "SOBKZ",
      "LABST",
      "INSME",
      "SPEME",
      "UMLME",
    ],
    gapFields: ["SOBKZ"],
    gapReason: "S (Special Stock Indicator)",
  },
  {
    table: "MBEW",
    description: "Material Valuation",
    fields: ["MATNR", "BWKEY", "BWTAR", "VPRSV", "VERPR", "STPRS"],
    gapFields: ["BWTAR"],
    gapReason: "Valuation Type (split valuation)",
  },
  {
    table: "MCHB",
    description: "Batch Stocks",
    fields: ["MATNR", "WERKS", "LGORT", "CLABS", "CSPEM", "CINSM"],
    gapFields: ["CLABS", "CSPEM", "CINSM"],
    gapReason: "Restricted-Use / Batch level stock",
  },
  {
    table: "MSLB",
    description: "Special Stocks with Vendor",
    fields: ["MATNR", "WERKS", "SOBKZ", "LIFNR", "LBLAB", "LBINS"],
    gapFields: ["LBLAB", "LBINS", "LIFNR"],
    gapReason: "Returns / Vendor special stock",
  },
  {
    table: "MSKU",
    description: "Special Stocks with Customer",
    fields: ["MATNR", "WERKS", "SOBKZ", "KUNNR", "KULAB", "KUINS"],
    gapFields: ["KULAB", "KUINS", "KUNNR"],
    gapReason: "Customer consignment / returns",
  },
];

async function testFieldDiscovery() {
  const sap = new SAPService({
    user: process.env.SAP_USER,
    passwd: process.env.SAP_PASSWORD,
    ashost: process.env.SAP_ASHOST,
    sysnr: process.env.SAP_SYSNR,
    client: process.env.SAP_CLIENT,
    lang: process.env.SAP_LANG,
  });

  try {
    await sap.connect();
    console.log("Connected to SAP\n");
    console.log("=== SAP Field Discovery Toolkit ===\n");

    const allResults = [];

    for (let t = 0; t < DISCOVERY_TABLES.length; t++) {
      const config = DISCOVERY_TABLES[t];
      console.log(
        `[${t + 1}/${DISCOVERY_TABLES.length}] ${config.table}: ${config.description}`,
      );
      console.log(
        `    Gap fields: ${config.gapFields.join(", ")} (${config.gapReason})`,
      );

      try {
        const result = await sap.readTable(config.table, config.fields, {
          rowCount: 100,
        });
        const rows = parseRows(result);
        console.log(`    ✓ ${rows.length} rows returned`);

        const analysis = analyzeFields(rows, config.fields);

        for (let a = 0; a < analysis.length; a++) {
          const field = analysis[a];
          const isGapField = config.gapFields.indexOf(field.field) !== -1;
          allResults.push({
            table: config.table,
            tableDescription: config.description,
            field: field.field,
            isGapField,
            gapReason: isGapField ? config.gapReason : "",
            totalRows: field.totalRows,
            nonBlankCount: field.nonBlankCount,
            distinctCount: field.distinctCount,
            samples: field.samples.slice(0, 3).join(", "),
            status: field.nonBlankCount > 0 ? "HAS_DATA" : "EMPTY",
            tableStatus: "ACCESSIBLE",
          });
        }
      } catch (err) {
        console.log(`    ✗ FAILED: ${err.message}`);

        // Record failure for all fields
        for (let f = 0; f < config.fields.length; f++) {
          const isGapField = config.gapFields.indexOf(config.fields[f]) !== -1;
          allResults.push({
            table: config.table,
            tableDescription: config.description,
            field: config.fields[f],
            isGapField,
            gapReason: isGapField ? config.gapReason : "",
            totalRows: 0,
            nonBlankCount: 0,
            distinctCount: 0,
            samples: "",
            status: "TABLE_INACCESSIBLE",
            tableStatus: "FAILED",
          });
        }
      }
      console.log("");
    }

    // Generate Excel report
    console.log("Generating SAP_Field_Discovery.xlsx...");
    await generateExcelReport(allResults);

    // Summary
    console.log("\n========================================");
    console.log("=== GAP FIELD SUMMARY ===");
    console.log("========================================\n");

    console.log(
      "Table".padEnd(8) +
        "Field".padEnd(10) +
        "Status".padEnd(20) +
        "Non-Blank".padEnd(12) +
        "Gap Reason",
    );
    console.log("-".repeat(85));

    for (let i = 0; i < allResults.length; i++) {
      const r = allResults[i];
      if (r.isGapField) {
        console.log(
          r.table.padEnd(8) +
            r.field.padEnd(10) +
            r.status.padEnd(20) +
            String(r.nonBlankCount).padEnd(12) +
            r.gapReason,
        );
      }
    }

    // Conclusion
    console.log("\n--- Conclusion ---");
    const gapResults = allResults.filter((r) => r.isGapField);
    const available = gapResults.filter((r) => r.status === "HAS_DATA");
    const empty = gapResults.filter((r) => r.status === "EMPTY");
    const failed = gapResults.filter((r) => r.status === "TABLE_INACCESSIBLE");

    console.log(`  Gap fields with data: ${available.length}`);
    console.log(`  Gap fields empty: ${empty.length}`);
    console.log(`  Gap fields inaccessible: ${failed.length}`);

    if (available.length > 0) {
      console.log("\n  Fields ready to implement:");
      for (let i = 0; i < available.length; i++) {
        console.log(
          `    → ${available[i].table}.${available[i].field} (${available[i].gapReason})`,
        );
      }
    }

    await sap.disconnect();
    console.log("\nDone.");
  } catch (err) {
    console.error("FATAL:", err.message || err);
  }
}

async function generateExcelReport(results) {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const filePath = path.join(OUTPUT_DIR, "SAP_Field_Discovery.xlsx");
  const workbook = new ExcelJS.Workbook();

  // Sheet 1: All Fields
  const sheet = workbook.addWorksheet("Field Discovery");
  sheet.columns = [
    { header: "SAP Table", key: "table", width: 10 },
    { header: "Table Description", key: "tableDescription", width: 28 },
    { header: "Field", key: "field", width: 10 },
    { header: "Gap Field?", key: "isGapField", width: 10 },
    { header: "Gap Reason", key: "gapReason", width: 35 },
    { header: "Status", key: "status", width: 20 },
    { header: "Total Rows", key: "totalRows", width: 10 },
    { header: "Non-Blank", key: "nonBlankCount", width: 10 },
    { header: "Distinct", key: "distinctCount", width: 10 },
    { header: "Samples", key: "samples", width: 40 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const row = sheet.addRow({
      ...r,
      isGapField: r.isGapField ? "YES" : "",
    });

    // Color gap field rows
    if (r.isGapField) {
      const statusCell = row.getCell(6);
      if (r.status === "HAS_DATA") {
        statusCell.font = { color: { argb: "FF008000" }, bold: true };
      } else if (r.status === "TABLE_INACCESSIBLE") {
        statusCell.font = { color: { argb: "FFC00000" }, bold: true };
      } else {
        statusCell.font = { color: { argb: "FFE65100" }, bold: true };
      }
    }
  }

  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: "J1" };

  // Sheet 2: Gap Summary
  const gapSheet = workbook.addWorksheet("Gap Summary");
  gapSheet.columns = [
    { header: "Customer Column", key: "gapReason", width: 35 },
    { header: "SAP Table", key: "table", width: 10 },
    { header: "SAP Field", key: "field", width: 10 },
    { header: "Data Available?", key: "status", width: 20 },
    { header: "Non-Blank Count", key: "nonBlankCount", width: 14 },
    { header: "Recommendation", key: "recommendation", width: 40 },
  ];

  const gapHeaderRow = gapSheet.getRow(1);
  gapHeaderRow.font = { bold: true };

  const gapResults = results.filter((r) => r.isGapField);
  for (let i = 0; i < gapResults.length; i++) {
    const r = gapResults[i];
    let recommendation = "";
    if (r.status === "HAS_DATA") recommendation = "Ready to implement";
    else if (r.status === "EMPTY")
      recommendation = "Field exists but no data — verify with SME";
    else recommendation = "Table inaccessible — check authorization";

    gapSheet.addRow({
      gapReason: r.gapReason,
      table: r.table,
      field: r.field,
      status: r.status,
      nonBlankCount: r.nonBlankCount,
      recommendation,
    });
  }

  await workbook.xlsx.writeFile(filePath);
  console.log(`  ✓ ${filePath}`);
}

testFieldDiscovery();
