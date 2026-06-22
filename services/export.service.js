const ExcelJS = require("exceljs");
const path = require("path");
const fs = require("fs");

const OUTPUT_DIR = path.resolve(__dirname, "../output");
const MAX_UNFILTERED_ROWS = 100000;
const STREAMING_THRESHOLD = 50000;

/**
 * Export Service (Phase 3.7 - Parameterized)
 *
 * All exports are parameter-driven. No full dataset exports allowed.
 * Generates Excel workbooks matching customer workbook structures.
 *
 * Safety:
 *   - Rejects inventory export if rows > 100,000 without plant filter
 *   - Uses streaming writer for datasets > 50,000 rows
 *   - Every workbook includes Parameters metadata sheet
 */
class ExportService {
  constructor() {
    this._ensureOutputDir();
  }

  /**
   * Export 1: Inventory Workbook (parameterized)
   *
   * REQUIRES: plant filter (or dataset must be < 100,000 rows)
   *
   * @param {InventoryRecord[]} records - already filtered by caller
   * @param {object} params - { plant, storageLocation, material, ... }
   * @returns {Promise<string>} file path
   */
  async exportInventoryWorkbook(records, params = {}) {
    // Safety: reject unfiltered large exports
    if (records.length > MAX_UNFILTERED_ROWS && !params.plant) {
      throw new Error(
        `Dataset too large (${records.length} rows). Apply plant or storage location filter. Max unfiltered: ${MAX_UNFILTERED_ROWS}.`,
      );
    }

    const suffix = params.plant ? `_${params.plant}` : "";
    const locSuffix = params.storageLocation
      ? `_${params.storageLocation}`
      : "";
    const filename = `Inventory_Report${suffix}${locSuffix}_${this._timestamp()}.xlsx`;
    const filePath = path.join(OUTPUT_DIR, filename);

    const useStreaming = records.length > STREAMING_THRESHOLD;
    const workbook = useStreaming
      ? new ExcelJS.stream.xlsx.WorkbookWriter({ filename: filePath })
      : new ExcelJS.Workbook();

    const sheet = useStreaming
      ? workbook.addWorksheet("Inventory")
      : workbook.addWorksheet("Inventory");

    // Columns
    const columns = this._inventoryColumns();
    sheet.columns = columns;

    if (!useStreaming) this._formatHeader(sheet);

    // Data rows
    for (let i = 0; i < records.length; i++) {
      const row = sheet.addRow(records[i]);
      if (useStreaming) row.commit();
    }

    if (!useStreaming) {
      this._formatNumericColumns(sheet, 8, 23);
      sheet.views = [{ state: "frozen", ySplit: 1 }];
      sheet.autoFilter = { from: "A1", to: "W1" };
    }

    if (useStreaming) {
      sheet.commit();
    }

    // Parameters sheet
    this._addParametersSheet(workbook, params, records.length, useStreaming);

    if (useStreaming) {
      await workbook.commit();
    } else {
      this._formatHeader(workbook.getWorksheet("Inventory"));
      await workbook.xlsx.writeFile(filePath);
    }

    return filePath;
  }

  /**
   * Export 2: Inventory Summary Workbook
   * Default/recommended export. Always small (< 1000 rows).
   *
   * @param {InventorySummary[]} summaryRecords
   * @param {InventoryRecord[]} inventoryRecords - for plant lookup
   * @param {object} params
   * @returns {Promise<string>} file path
   */
  async exportInventorySummaryWorkbook(
    summaryRecords,
    inventoryRecords,
    params = {},
  ) {
    const suffix = params.plant ? `_${params.plant}` : "";
    const filename = `Inventory_Summary${suffix}_${this._timestamp()}.xlsx`;
    const filePath = path.join(OUTPUT_DIR, filename);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Summary");

    // Build plant lookup from inventory records
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
      sheet.addRow({
        plant: plantLocationMap.get(s.location) || "",
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

    // Parameters sheet
    this._addParametersSheet(workbook, params, summaryRecords.length, false);

    await workbook.xlsx.writeFile(filePath);
    return filePath;
  }

  /**
   * Export 3: Location-specific Workbook
   * Only records for a specific storageLocation (already filtered by caller).
   *
   * @param {InventoryRecord[]} records - pre-filtered to location
   * @param {string} storageLocation
   * @param {object} params
   * @returns {Promise<string>} file path
   */
  async exportLocationWorkbook(records, storageLocation, params = {}) {
    const filename = `Location_${storageLocation}_${this._timestamp()}.xlsx`;
    const filePath = path.join(OUTPUT_DIR, filename);

    const useStreaming = records.length > STREAMING_THRESHOLD;
    const workbook = useStreaming
      ? new ExcelJS.stream.xlsx.WorkbookWriter({ filename: filePath })
      : new ExcelJS.Workbook();

    const sheet = workbook.addWorksheet(storageLocation);
    sheet.columns = this._inventoryColumns();

    if (!useStreaming) this._formatHeader(sheet);

    for (let i = 0; i < records.length; i++) {
      const row = sheet.addRow(records[i]);
      if (useStreaming) row.commit();
    }

    if (!useStreaming) {
      this._formatNumericColumns(sheet, 8, 23);
      sheet.views = [{ state: "frozen", ySplit: 1 }];
      sheet.autoFilter = { from: "A1", to: "W1" };
    }

    if (useStreaming) sheet.commit();

    // Parameters sheet
    const metaParams = { ...params, storageLocation };
    this._addParametersSheet(
      workbook,
      metaParams,
      records.length,
      useStreaming,
    );

    if (useStreaming) {
      await workbook.commit();
    } else {
      await workbook.xlsx.writeFile(filePath);
    }

    return filePath;
  }

  /**
   * Export 4: Reconciliation Workbook
   *
   * REQUIRES: companyCode and plant
   *
   * @param {PlantReconciliation[]} reconResults
   * @param {object} params - { companyCode, fiscalYear, plant, ... }
   * @returns {Promise<string>} file path
   */
  async exportReconciliationWorkbook(reconResults, params = {}) {
    const suffix = params.plant ? `_${params.plant}` : "";
    const filename = `Reconciliation${suffix}_${this._timestamp()}.xlsx`;
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

      // Conditional formatting
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

    // Parameters sheet
    this._addParametersSheet(workbook, params, reconResults.length, false);

    await workbook.xlsx.writeFile(filePath);
    return filePath;
  }

  // --- Private helpers ---

  _addParametersSheet(workbook, params, rowCount, isStreaming) {
    const sheet = isStreaming
      ? workbook.addWorksheet("Parameters")
      : workbook.addWorksheet("Parameters");

    sheet.columns = [
      { header: "Parameter", key: "parameter", width: 25 },
      { header: "Value", key: "value", width: 40 },
    ];

    const rows = [
      { parameter: "Generated At", value: new Date().toISOString() },
      { parameter: "Record Count", value: String(rowCount) },
    ];

    if (params.companyCode)
      rows.push({ parameter: "Company Code", value: params.companyCode });
    if (params.fiscalYear)
      rows.push({ parameter: "Fiscal Year", value: params.fiscalYear });
    if (params.period) rows.push({ parameter: "Period", value: params.period });
    if (params.plant) rows.push({ parameter: "Plant", value: params.plant });
    if (params.storageLocation)
      rows.push({
        parameter: "Storage Location",
        value: params.storageLocation,
      });
    if (params.material)
      rows.push({ parameter: "Material", value: params.material });
    if (params.inventoryAccounts) {
      rows.push({
        parameter: "Inventory Accounts",
        value: params.inventoryAccounts.join(", "),
      });
    }

    for (let i = 0; i < rows.length; i++) {
      const row = sheet.addRow(rows[i]);
      if (isStreaming) row.commit();
    }

    if (isStreaming) sheet.commit();

    // Bold header
    if (!isStreaming) {
      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true };
    }
  }

  _inventoryColumns() {
    return [
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
  }

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
