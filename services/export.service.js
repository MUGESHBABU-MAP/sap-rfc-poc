const ExcelJS = require("exceljs");
const path = require("path");
const fs = require("fs");

const OUTPUT_DIR = path.resolve(__dirname, "../output");

/**
 * Export Service
 *
 * Generates Excel workbooks matching customer workbook structures.
 * Uses ExcelJS streaming workbook writer for memory efficiency.
 *
 * Exports:
 *   1. Inventory Report (full dataset)
 *   2. Inventory Summary (grouped by location)
 *   3. Location-specific workbook (single storage location)
 *   4. Reconciliation workbook (plant-level variance)
 */
class ExportService {
  constructor() {
    this._ensureOutputDir();
  }

  /**
   * Export 1: Full Inventory Workbook
   * Matches customer MB52 export structure.
   *
   * @param {InventoryRecord[]} records
   * @returns {Promise<string>} file path
   */
  async exportInventoryWorkbook(records) {
    const filename = `Inventory_Report_${this._timestamp()}.xlsx`;
    const filePath = path.join(OUTPUT_DIR, filename);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Inventory");

    // Define columns
    sheet.columns = [
      { header: "Material", key: "material", width: 18 },
      { header: "Material Type", key: "materialType", width: 12 },
      { header: "Material Description", key: "materialDescription", width: 35 },
      { header: "Material Group", key: "materialGroup", width: 14 },
      { header: "Plant", key: "plant", width: 8 },
      { header: "Storage Location", key: "storageLocation", width: 14 },
      { header: "Base Unit", key: "baseUnit", width: 8 },
      { header: "Unrestricted Qty", key: "unrestrictedQty", width: 16 },
      { header: "Unrestricted Value", key: "unrestrictedValue", width: 18 },
      { header: "Transit Qty", key: "transitQty", width: 12 },
      { header: "Transit Value", key: "transitValue", width: 14 },
      { header: "Quality Qty", key: "qualityQty", width: 12 },
      { header: "Quality Value", key: "qualityValue", width: 14 },
      { header: "Restricted Qty", key: "restrictedQty", width: 14 },
      { header: "Restricted Value", key: "restrictedValue", width: 16 },
      { header: "Blocked Qty", key: "blockedQty", width: 12 },
      { header: "Blocked Value", key: "blockedValue", width: 14 },
      { header: "Returns Qty", key: "returnsQty", width: 12 },
      { header: "Returns Value", key: "returnsValue", width: 14 },
      { header: "Standard Cost", key: "standardCost", width: 14 },
      { header: "Moving Average Price", key: "movingAveragePrice", width: 18 },
      { header: "Total Quantity", key: "totalQuantity", width: 14 },
      {
        header: "Total Inventory Value",
        key: "totalInventoryValue",
        width: 20,
      },
    ];

    // Header formatting
    this._formatHeader(sheet);

    // Add data rows
    for (let i = 0; i < records.length; i++) {
      sheet.addRow(records[i]);
    }

    // Numeric formatting (columns 8-23)
    this._formatNumericColumns(sheet, 8, 23);

    // Freeze top row + auto filter
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: "A1", to: `W1` };

    await workbook.xlsx.writeFile(filePath);
    return filePath;
  }

  /**
   * Export 2: Inventory Summary Workbook
   * Grouped by plant + storage location.
   *
   * @param {InventorySummary[]} summaryRecords - from InventorySummaryService
   * @param {InventoryRecord[]} inventoryRecords - for plant info
   * @returns {Promise<string>} file path
   */
  async exportInventorySummaryWorkbook(summaryRecords, inventoryRecords) {
    const filename = `Inventory_Summary_${this._timestamp()}.xlsx`;
    const filePath = path.join(OUTPUT_DIR, filename);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Summary");

    // Build plant+location summary with material count
    // summaryRecords already has location + materialCount + totalInventoryValue
    // We need to add plant info by cross-referencing inventory records
    const plantLocationMap = new Map();
    for (let i = 0; i < inventoryRecords.length; i++) {
      const r = inventoryRecords[i];
      const key = r.storageLocation || "UNKNOWN";
      if (!plantLocationMap.has(key)) {
        plantLocationMap.set(key, r.plant || "");
      }
    }

    sheet.columns = [
      { header: "Plant", key: "plant", width: 8 },
      { header: "Storage Location", key: "location", width: 16 },
      { header: "Material Count", key: "materialCount", width: 14 },
      { header: "Unrestricted Value", key: "unrestrictedValue", width: 18 },
      { header: "Transit Value", key: "transitValue", width: 14 },
      { header: "Quality Value", key: "qualityValue", width: 14 },
      { header: "Restricted Value", key: "restrictedValue", width: 16 },
      { header: "Blocked Value", key: "blockedValue", width: 14 },
      { header: "Returns Value", key: "returnsValue", width: 14 },
      {
        header: "Total Inventory Value",
        key: "totalInventoryValue",
        width: 20,
      },
    ];

    this._formatHeader(sheet);

    // Sort: Plant ASC, Inventory Value DESC
    const sorted = summaryRecords.slice().sort((a, b) => {
      const plantA = plantLocationMap.get(a.location) || "";
      const plantB = plantLocationMap.get(b.location) || "";
      if (plantA < plantB) return -1;
      if (plantA > plantB) return 1;
      return b.totalInventoryValue - a.totalInventoryValue;
    });

    let grandTotal = 0;
    for (let i = 0; i < sorted.length; i++) {
      const s = sorted[i];
      const plant = plantLocationMap.get(s.location) || "";
      sheet.addRow({
        plant,
        location: s.location,
        materialCount: s.materialCount,
        unrestrictedValue: s.unrestrictedValue,
        transitValue: s.transitValue,
        qualityValue: s.qualityValue,
        restrictedValue: s.restrictedValue,
        blockedValue: s.blockedValue,
        returnsValue: s.returnsValue,
        totalInventoryValue: s.totalInventoryValue,
      });
      grandTotal += s.totalInventoryValue;
    }

    // Grand total row
    const totalRow = sheet.addRow({
      plant: "",
      location: "GRAND TOTAL",
      materialCount: "",
      unrestrictedValue: "",
      transitValue: "",
      qualityValue: "",
      restrictedValue: "",
      blockedValue: "",
      returnsValue: "",
      totalInventoryValue: Math.round(grandTotal * 100) / 100,
    });
    totalRow.font = { bold: true };

    this._formatNumericColumns(sheet, 4, 10);
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: "A1", to: "J1" };

    await workbook.xlsx.writeFile(filePath);
    return filePath;
  }

  /**
   * Export 3: Location-specific Workbook
   * Filters inventory to a single storage location.
   *
   * @param {InventoryRecord[]} allRecords - full dataset
   * @param {string} storageLocation - e.g. "SHYD", "WH10"
   * @returns {Promise<string>} file path
   */
  async exportLocationWorkbook(allRecords, storageLocation) {
    // Filter records for the requested location
    const records = [];
    for (let i = 0; i < allRecords.length; i++) {
      if (allRecords[i].storageLocation === storageLocation) {
        records.push(allRecords[i]);
      }
    }

    const filename = `Location_${storageLocation}_${this._timestamp()}.xlsx`;
    const filePath = path.join(OUTPUT_DIR, filename);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(storageLocation);

    // Same structure as inventory workbook
    sheet.columns = [
      { header: "Material", key: "material", width: 18 },
      { header: "Material Type", key: "materialType", width: 12 },
      { header: "Material Description", key: "materialDescription", width: 35 },
      { header: "Material Group", key: "materialGroup", width: 14 },
      { header: "Plant", key: "plant", width: 8 },
      { header: "Storage Location", key: "storageLocation", width: 14 },
      { header: "Base Unit", key: "baseUnit", width: 8 },
      { header: "Unrestricted Qty", key: "unrestrictedQty", width: 16 },
      { header: "Unrestricted Value", key: "unrestrictedValue", width: 18 },
      { header: "Transit Qty", key: "transitQty", width: 12 },
      { header: "Transit Value", key: "transitValue", width: 14 },
      { header: "Quality Qty", key: "qualityQty", width: 12 },
      { header: "Quality Value", key: "qualityValue", width: 14 },
      { header: "Restricted Qty", key: "restrictedQty", width: 14 },
      { header: "Restricted Value", key: "restrictedValue", width: 16 },
      { header: "Blocked Qty", key: "blockedQty", width: 12 },
      { header: "Blocked Value", key: "blockedValue", width: 14 },
      { header: "Returns Qty", key: "returnsQty", width: 12 },
      { header: "Returns Value", key: "returnsValue", width: 14 },
      { header: "Standard Cost", key: "standardCost", width: 14 },
      { header: "Moving Average Price", key: "movingAveragePrice", width: 18 },
      { header: "Total Quantity", key: "totalQuantity", width: 14 },
      {
        header: "Total Inventory Value",
        key: "totalInventoryValue",
        width: 20,
      },
    ];

    this._formatHeader(sheet);

    for (let i = 0; i < records.length; i++) {
      sheet.addRow(records[i]);
    }

    this._formatNumericColumns(sheet, 8, 23);
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: "A1", to: "W1" };

    await workbook.xlsx.writeFile(filePath);
    return filePath;
  }

  /**
   * Export 4: Reconciliation Workbook
   * Plant-level inventory vs GL comparison.
   *
   * @param {PlantReconciliation[]} reconResults - from ReconciliationService
   * @returns {Promise<string>} file path
   */
  async exportReconciliationWorkbook(reconResults) {
    const filename = `Reconciliation_${this._timestamp()}.xlsx`;
    const filePath = path.join(OUTPUT_DIR, filename);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Plant Reconciliation");

    sheet.columns = [
      { header: "Plant", key: "plant", width: 10 },
      { header: "Inventory Value", key: "inventoryValue", width: 20 },
      { header: "GL Balance", key: "glBalance", width: 18 },
      { header: "Variance", key: "variance", width: 18 },
      { header: "Variance %", key: "variancePercent", width: 12 },
      { header: "Status", key: "status", width: 12 },
    ];

    this._formatHeader(sheet);

    for (let i = 0; i < reconResults.length; i++) {
      const r = reconResults[i];
      const row = sheet.addRow({
        plant: r.plant,
        inventoryValue: r.inventoryValue,
        glBalance: r.glBalance,
        variance: r.variance,
        variancePercent: r.variancePercent,
        status: r.status,
      });

      // Conditional formatting: MATCH=green, VARIANCE=red
      const statusCell = row.getCell(6);
      if (r.status === "MATCH") {
        statusCell.font = { color: { argb: "FF008000" }, bold: true };
        statusCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFE8F5E9" },
        };
      } else {
        statusCell.font = { color: { argb: "FFC00000" }, bold: true };
        statusCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFDECEA" },
        };
      }
    }

    this._formatNumericColumns(sheet, 2, 5);
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: "A1", to: "F1" };

    await workbook.xlsx.writeFile(filePath);
    return filePath;
  }

  // --- Private helpers ---

  _ensureOutputDir() {
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
  }

  _timestamp() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const h = String(now.getHours()).padStart(2, "0");
    const min = String(now.getMinutes()).padStart(2, "0");
    return `${y}${m}${d}_${h}${min}`;
  }

  _formatHeader(sheet) {
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
  }

  _formatNumericColumns(sheet, startCol, endCol) {
    for (let col = startCol; col <= endCol; col++) {
      const column = sheet.getColumn(col);
      column.numFmt = "#,##0.00";
    }
  }
}

module.exports = ExportService;
