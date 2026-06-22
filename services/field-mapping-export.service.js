const ExcelJS = require("exceljs");
const path = require("path");
const fs = require("fs");

const OUTPUT_DIR = path.resolve(__dirname, "../output");

/**
 * Field Mapping Export Service
 *
 * Generates the Customer Field Mapping Excel document.
 * Color-coded by status for easy visual review.
 */
class FieldMappingExportService {
  constructor() {
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
  }

  /**
   * Export field mapping report to Excel.
   * @param {FieldMappingReport} report - from FieldMappingService
   * @returns {Promise<string>} file path
   */
  async exportFieldMappingWorkbook(report) {
    const filename = "Customer_Field_Mapping.xlsx";
    const filePath = path.join(OUTPUT_DIR, filename);

    const workbook = new ExcelJS.Workbook();

    // Sheet 1: Summary
    this._addSummarySheet(workbook, report);

    // Sheet 2: Full Mapping
    this._addMappingSheet(workbook, report.mappings);

    // Sheet 3: Gaps Only
    const gaps = report.mappings.filter(
      (m) => m.status === "MISSING" || m.status === "INVESTIGATION_REQUIRED",
    );
    this._addGapsSheet(workbook, gaps);

    await workbook.xlsx.writeFile(filePath);
    return filePath;
  }

  _addSummarySheet(workbook, report) {
    const sheet = workbook.addWorksheet("Summary");

    sheet.columns = [
      { header: "Metric", key: "metric", width: 30 },
      { header: "Value", key: "value", width: 20 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };

    sheet.addRow({
      metric: "Total Customer Columns",
      value: report.totalColumns,
    });
    sheet.addRow({ metric: "Covered Columns", value: report.coveredColumns });
    sheet.addRow({ metric: "Missing Columns", value: report.missingColumns });
    sheet.addRow({ metric: "Coverage %", value: `${report.coveragePercent}%` });
    sheet.addRow({ metric: "", value: "" });
    sheet.addRow({ metric: "--- Breakdown ---", value: "" });
    sheet.addRow({ metric: "AVAILABLE", value: report.breakdown.available });
    sheet.addRow({ metric: "PARTIAL", value: report.breakdown.partial });
    sheet.addRow({ metric: "MISSING", value: report.breakdown.missing });
    sheet.addRow({
      metric: "INVESTIGATION_REQUIRED",
      value: report.breakdown.investigationRequired,
    });
    sheet.addRow({ metric: "", value: "" });
    sheet.addRow({ metric: "Generated At", value: new Date().toISOString() });
  }

  _addMappingSheet(workbook, mappings) {
    const sheet = workbook.addWorksheet("Field Mapping");

    sheet.columns = [
      { header: "Customer Sheet", key: "customerSheet", width: 18 },
      { header: "Customer Column", key: "customerColumn", width: 25 },
      { header: "Application Field", key: "applicationField", width: 22 },
      { header: "SAP Table", key: "sapTable", width: 12 },
      { header: "SAP Field", key: "sapField", width: 16 },
      { header: "Status", key: "status", width: 24 },
      { header: "Remarks", key: "remarks", width: 60 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };

    for (let i = 0; i < mappings.length; i++) {
      const m = mappings[i];
      const row = sheet.addRow({
        customerSheet: m.customerSheet || "",
        customerColumn: m.customerColumn,
        applicationField: m.applicationField || "—",
        sapTable: m.sapTable || "—",
        sapField: m.sapField || "—",
        status: m.status,
        remarks: m.remarks || "",
      });

      // Color-code status cell
      const statusCell = row.getCell(6);
      switch (m.status) {
        case "AVAILABLE":
          statusCell.font = { color: { argb: "FF008000" }, bold: true };
          statusCell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFE8F5E9" },
          };
          break;
        case "PARTIAL":
          statusCell.font = { color: { argb: "FF8B6914" }, bold: true };
          statusCell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFFFF8E1" },
          };
          break;
        case "MISSING":
          statusCell.font = { color: { argb: "FFC00000" }, bold: true };
          statusCell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFFDECEA" },
          };
          break;
        case "INVESTIGATION_REQUIRED":
          statusCell.font = { color: { argb: "FFE65100" }, bold: true };
          statusCell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFFFF3E0" },
          };
          break;
      }
    }

    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: "A1", to: "G1" };
  }

  _addGapsSheet(workbook, gaps) {
    const sheet = workbook.addWorksheet("Gaps & Investigation");

    sheet.columns = [
      { header: "#", key: "index", width: 5 },
      { header: "Customer Column", key: "customerColumn", width: 25 },
      { header: "Status", key: "status", width: 24 },
      { header: "Remarks", key: "remarks", width: 70 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };

    for (let i = 0; i < gaps.length; i++) {
      const g = gaps[i];
      const row = sheet.addRow({
        index: i + 1,
        customerColumn: g.customerColumn,
        status: g.status,
        remarks: g.remarks || "",
      });

      const statusCell = row.getCell(3);
      if (g.status === "MISSING") {
        statusCell.font = { color: { argb: "FFC00000" }, bold: true };
      } else {
        statusCell.font = { color: { argb: "FFE65100" }, bold: true };
      }
    }

    sheet.views = [{ state: "frozen", ySplit: 1 }];
  }
}

module.exports = FieldMappingExportService;
