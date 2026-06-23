/**
 * Final Gap Discovery - Combined Report
 *
 * Run: node tests/test-gap-discovery.js
 *
 * Executes all gap discovery tests and generates:
 *   output/Customer_Gap_Discovery.xlsx
 *
 * Sheets:
 *   1. SOBKZ Analysis (S column)
 *   2. Valuation Analysis (Valuation column)
 *   3. Special Stock Analysis (Special stock number + SL)
 *   4. Final Recommendation
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
const TEST_PLANT = process.env.TEST_PLANT || "1000";

async function testGapDiscovery() {
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
    console.log("=== Customer Gap Discovery (Final 4 Columns) ===\n");

    const allResults = [];

    // --- SOBKZ Discovery ---
    console.log("[1/3] SOBKZ (S column)...");
    const sobkzResults = await discoverSobkz(sap);
    allResults.push(...sobkzResults);

    // --- BWTAR Discovery ---
    console.log("\n[2/3] BWTAR (Valuation column)...");
    const bwtarResults = await discoverBwtar(sap);
    allResults.push(...bwtarResults);

    // --- Special Stock Number Discovery ---
    console.log("\n[3/3] Special Stock Number + SL...");
    const specialResults = await discoverSpecialStock(sap);
    allResults.push(...specialResults);

    // Generate Excel
    console.log("\n\nGenerating Customer_Gap_Discovery.xlsx...");
    await generateReport(
      allResults,
      sobkzResults,
      bwtarResults,
      specialResults,
    );

    // Final Summary
    console.log("\n========================================");
    console.log("=== FINAL RECOMMENDATION ===");
    console.log("========================================\n");

    const columns = [
      { name: "S", results: sobkzResults },
      { name: "Valuation", results: bwtarResults },
      {
        name: "Special stock number",
        results: specialResults.filter(
          (r) => r.customerColumn === "Special stock number",
        ),
      },
      {
        name: "SL",
        results: specialResults.filter((r) => r.customerColumn === "SL"),
      },
    ];

    console.log(
      "Column".padEnd(24) +
        "Status".padEnd(16) +
        "Source".padEnd(16) +
        "Action",
    );
    console.log("-".repeat(80));

    for (let c = 0; c < columns.length; c++) {
      const col = columns[c];
      const hasData = col.results.filter((r) => r.status === "HAS_DATA");
      let status, source, action;

      if (hasData.length > 0) {
        const best = hasData.sort(
          (a, b) => b.nonBlankCount - a.nonBlankCount,
        )[0];
        status = "AVAILABLE";
        source = `${best.table}.${best.field}`;
        action = "Implement";
      } else {
        const empty = col.results.filter((r) => r.status === "EMPTY");
        if (empty.length > 0) {
          status = "FIELD_EMPTY";
          source = empty[0].table + "." + empty[0].field;
          action = "Leave blank";
        } else {
          status = "NOT_FOUND";
          source = "—";
          action = "Customer clarification";
        }
      }

      console.log(
        col.name.padEnd(24) + status.padEnd(16) + source.padEnd(16) + action,
      );
    }

    await sap.disconnect();
    console.log("\nDone.");
  } catch (err) {
    console.error("FATAL:", err.message || err);
  }
}

// --- Discovery functions ---

async function discoverSobkz(sap) {
  const tables = [
    { name: "MARD", fields: ["MATNR", "WERKS", "SOBKZ"], plantField: "WERKS" },
    { name: "MSLB", fields: ["MATNR", "WERKS", "SOBKZ"], plantField: "WERKS" },
    { name: "MSKU", fields: ["MATNR", "WERKS", "SOBKZ"], plantField: "WERKS" },
    { name: "MSKA", fields: ["MATNR", "WERKS", "SOBKZ"], plantField: "WERKS" },
  ];

  const results = [];
  for (let t = 0; t < tables.length; t++) {
    const tbl = tables[t];
    try {
      const result = await sap.readTable(tbl.name, tbl.fields, {
        where: [`${tbl.plantField} = '${TEST_PLANT}'`],
        rowCount: 200,
      });
      const rows = parseRows(result);
      const analysis = analyzeFields(rows, ["SOBKZ"]);
      const a = analysis[0];
      console.log(
        `  ${tbl.name}.SOBKZ: ${a.nonBlankCount}/${a.totalRows} non-blank`,
      );
      results.push({
        customerColumn: "S",
        table: tbl.name,
        field: "SOBKZ",
        totalRows: a.totalRows,
        nonBlankCount: a.nonBlankCount,
        distinctCount: a.distinctCount,
        distinctValues: a.distinctValues.join(", "),
        coveragePercent:
          a.totalRows > 0
            ? Math.round((a.nonBlankCount / a.totalRows) * 100)
            : 0,
        status: a.nonBlankCount > 0 ? "HAS_DATA" : "EMPTY",
        recommendation: a.nonBlankCount > 0 ? "Implement" : "Leave blank",
      });
    } catch (err) {
      console.log(`  ${tbl.name}.SOBKZ: FAILED (${err.message})`);
      results.push({
        customerColumn: "S",
        table: tbl.name,
        field: "SOBKZ",
        totalRows: 0,
        nonBlankCount: 0,
        distinctCount: 0,
        distinctValues: "",
        coveragePercent: 0,
        status: "FAILED",
        recommendation: "Table inaccessible",
      });
    }
  }
  return results;
}

async function discoverBwtar(sap) {
  try {
    const result = await sap.readTable("MBEW", ["MATNR", "BWKEY", "BWTAR"], {
      where: [`BWKEY = '${TEST_PLANT}'`],
      rowCount: 500,
    });
    const rows = parseRows(result);
    const analysis = analyzeFields(rows, ["BWTAR"]);
    const a = analysis[0];
    console.log(`  MBEW.BWTAR: ${a.nonBlankCount}/${a.totalRows} non-blank`);
    const recommendation =
      a.nonBlankCount > 0
        ? "Implement - split valuation active"
        : "Leave blank - no split valuation";
    return [
      {
        customerColumn: "Valuation",
        table: "MBEW",
        field: "BWTAR",
        totalRows: a.totalRows,
        nonBlankCount: a.nonBlankCount,
        distinctCount: a.distinctCount,
        distinctValues: a.distinctValues.join(", "),
        coveragePercent:
          a.totalRows > 0
            ? Math.round((a.nonBlankCount / a.totalRows) * 100)
            : 0,
        status: a.nonBlankCount > 0 ? "HAS_DATA" : "EMPTY",
        recommendation,
      },
    ];
  } catch (err) {
    console.log(`  MBEW.BWTAR: FAILED (${err.message})`);
    return [
      {
        customerColumn: "Valuation",
        table: "MBEW",
        field: "BWTAR",
        totalRows: 0,
        nonBlankCount: 0,
        distinctCount: 0,
        distinctValues: "",
        coveragePercent: 0,
        status: "FAILED",
        recommendation: "Field not accessible",
      },
    ];
  }
}

async function discoverSpecialStock(sap) {
  const discoveries = [
    {
      customerColumn: "Special stock number",
      table: "MSLB",
      field: "LIFNR",
      fields: ["MATNR", "WERKS", "LIFNR"],
    },
    {
      customerColumn: "Special stock number",
      table: "MSKU",
      field: "KUNNR",
      fields: ["MATNR", "WERKS", "KUNNR"],
    },
    {
      customerColumn: "Special stock number",
      table: "MSKA",
      field: "VBELN",
      fields: ["MATNR", "WERKS", "VBELN"],
    },
  ];

  const results = [];
  for (let d = 0; d < discoveries.length; d++) {
    const disc = discoveries[d];
    try {
      const result = await sap.readTable(disc.table, disc.fields, {
        where: [`WERKS = '${TEST_PLANT}'`],
        rowCount: 200,
      });
      const rows = parseRows(result);
      const analysis = analyzeFields(rows, [disc.field]);
      const a = analysis[0];
      console.log(
        `  ${disc.table}.${disc.field}: ${a.nonBlankCount}/${a.totalRows} non-blank`,
      );
      results.push({
        customerColumn: disc.customerColumn,
        table: disc.table,
        field: disc.field,
        totalRows: a.totalRows,
        nonBlankCount: a.nonBlankCount,
        distinctCount: a.distinctCount,
        distinctValues: a.distinctValues.slice(0, 5).join(", "),
        coveragePercent:
          a.totalRows > 0
            ? Math.round((a.nonBlankCount / a.totalRows) * 100)
            : 0,
        status: a.nonBlankCount > 0 ? "HAS_DATA" : "EMPTY",
        recommendation: a.nonBlankCount > 0 ? "Implement" : "Leave blank",
      });
    } catch (err) {
      console.log(`  ${disc.table}.${disc.field}: FAILED (${err.message})`);
      results.push({
        customerColumn: disc.customerColumn,
        table: disc.table,
        field: disc.field,
        totalRows: 0,
        nonBlankCount: 0,
        distinctCount: 0,
        distinctValues: "",
        coveragePercent: 0,
        status: "FAILED",
        recommendation: "Table inaccessible",
      });
    }
  }

  // SL — needs customer clarification
  results.push({
    customerColumn: "SL",
    table: "N/A",
    field: "N/A",
    totalRows: 0,
    nonBlankCount: 0,
    distinctCount: 0,
    distinctValues: "",
    coveragePercent: 0,
    status: "NEEDS_CLARIFICATION",
    recommendation: "Ask customer what 'SL' represents in their MB52 report",
  });

  return results;
}

// --- Excel Report ---

async function generateReport(
  allResults,
  sobkzResults,
  bwtarResults,
  specialResults,
) {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const filePath = path.join(OUTPUT_DIR, "Customer_Gap_Discovery.xlsx");
  const workbook = new ExcelJS.Workbook();

  const cols = [
    { header: "Customer Column", key: "customerColumn", width: 22 },
    { header: "SAP Table", key: "table", width: 8 },
    { header: "SAP Field", key: "field", width: 10 },
    { header: "Total Rows", key: "totalRows", width: 10 },
    { header: "Non-Blank", key: "nonBlankCount", width: 10 },
    { header: "Distinct", key: "distinctCount", width: 10 },
    { header: "Coverage %", key: "coveragePercent", width: 10 },
    { header: "Distinct Values", key: "distinctValues", width: 30 },
    { header: "Status", key: "status", width: 18 },
    { header: "Recommendation", key: "recommendation", width: 35 },
  ];

  // Sheet 1: SOBKZ
  const s1 = workbook.addWorksheet("SOBKZ Analysis");
  s1.columns = cols;
  s1.getRow(1).font = { bold: true };
  for (let i = 0; i < sobkzResults.length; i++) s1.addRow(sobkzResults[i]);

  // Sheet 2: Valuation
  const s2 = workbook.addWorksheet("Valuation Analysis");
  s2.columns = cols;
  s2.getRow(1).font = { bold: true };
  for (let i = 0; i < bwtarResults.length; i++) s2.addRow(bwtarResults[i]);

  // Sheet 3: Special Stock
  const s3 = workbook.addWorksheet("Special Stock Analysis");
  s3.columns = cols;
  s3.getRow(1).font = { bold: true };
  for (let i = 0; i < specialResults.length; i++) s3.addRow(specialResults[i]);

  // Sheet 4: Final Recommendation
  const s4 = workbook.addWorksheet("Final Recommendation");
  s4.columns = [
    { header: "Customer Column", key: "customerColumn", width: 22 },
    { header: "Best Source Table", key: "table", width: 12 },
    { header: "Best Source Field", key: "field", width: 12 },
    { header: "Data Available?", key: "status", width: 16 },
    { header: "Coverage %", key: "coveragePercent", width: 12 },
    { header: "Recommendation", key: "recommendation", width: 40 },
  ];
  s4.getRow(1).font = { bold: true };

  // Build final recommendation per column
  const columnGroups = {
    S: sobkzResults,
    Valuation: bwtarResults,
    "Special stock number": specialResults.filter(
      (r) => r.customerColumn === "Special stock number",
    ),
    SL: specialResults.filter((r) => r.customerColumn === "SL"),
  };

  for (const [colName, results] of Object.entries(columnGroups)) {
    const hasData = results.filter((r) => r.status === "HAS_DATA");
    if (hasData.length > 0) {
      const best = hasData.sort((a, b) => b.nonBlankCount - a.nonBlankCount)[0];
      s4.addRow({
        customerColumn: colName,
        table: best.table,
        field: best.field,
        status: "AVAILABLE",
        coveragePercent: best.coveragePercent,
        recommendation: best.recommendation || "Implement",
      });
    } else {
      const first = results[0] || {};
      s4.addRow({
        customerColumn: colName,
        table: first.table || "N/A",
        field: first.field || "N/A",
        status: first.status || "UNKNOWN",
        coveragePercent: 0,
        recommendation: first.recommendation || "Needs investigation",
      });
    }
  }

  await workbook.xlsx.writeFile(filePath);
  console.log(`  ✓ ${filePath}`);
}

testGapDiscovery();
