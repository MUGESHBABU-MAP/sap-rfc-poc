const ExcelJS = require("exceljs");
const path = require("path");
const fs = require("fs");

const OUTPUT_DIR = path.resolve(__dirname, "../output");

/**
 * Customer Workbook Generator
 *
 * Generates a single workbook matching the customer's Excel structure:
 *   1. Parameters
 *   2. Inventory Report (consolidated)
 *   3. Summary (grouped by storage location)
 *   4. One sheet per storage location (alphabetically sorted)
 *
 * PERFORMANCE:
 *   - ONE SAP extraction, then group in memory
 *   - Uses ExcelJS streaming WorkbookWriter
 *   - Rows committed immediately (constant memory)
 *   - Single-pass grouping using Map
 *   - No JSON.stringify on large arrays
 *   - No Math.max/min spread
 */
class CustomerWorkbookService {
  constructor() {
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
  }

  /**
   * Generate the full customer workbook.
   *
   * @param {InventoryRecord[]} records - pre-fetched from InventoryDatasetService (ONE call)
   * @param {object} params - { plant }
   * @returns {Promise<{filePath, totalRecords, locationCount, sheetCount, executionTime}>}
   */
  async generateCustomerWorkbook(records, params = {}) {
    const startTime = Date.now();
    const plant = params.plant || "ALL";

    const filename = `Inventory_Report_${plant}.xlsx`;
    const filePath = path.join(OUTPUT_DIR, filename);

    // --- Single-pass grouping by storage location ---
    const locationMap = new Map(); // Map<storageLocation, InventoryRecord[]>
    const summaryMap = new Map(); // Map<storageLocation, summary aggregates>

    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      const loc = r.storageLocation || "UNKNOWN";

      // Group records by location
      if (!locationMap.has(loc)) {
        locationMap.set(loc, []);
      }
      locationMap.get(loc).push(i); // Store index to avoid duplicating records

      // Aggregate summary
      if (!summaryMap.has(loc)) {
        summaryMap.set(loc, {
          location: loc,
          unrestrictedQty: 0,
          unrestrictedValue: 0,
          transitQty: 0,
          transitValue: 0,
          qualityQty: 0,
          qualityValue: 0,
          restrictedQty: 0,
          restrictedValue: 0,
          blockedQty: 0,
          blockedValue: 0,
          returnsQty: 0,
          returnsValue: 0,
          totalValue: 0,
          recordCount: 0,
        });
      }

      const s = summaryMap.get(loc);
      s.unrestrictedQty += r.unrestrictedQty;
      s.unrestrictedValue += r.unrestrictedValue;
      s.transitQty += r.transitQty;
      s.transitValue += r.transitValue;
      s.qualityQty += r.qualityQty;
      s.qualityValue += r.qualityValue;
      s.restrictedQty += r.restrictedQty;
      s.restrictedValue += r.restrictedValue;
      s.blockedQty += r.blockedQty;
      s.blockedValue += r.blockedValue;
      s.returnsQty += r.returnsQty;
      s.returnsValue += r.returnsValue;
      s.totalValue += r.totalInventoryValue;
      s.recordCount += 1;
    }

    // Sort locations alphabetically
    const sortedLocations = [...locationMap.keys()].sort();
    const locationCount = sortedLocations.length;
    const uniqueMaterials = new Set();
    for (let i = 0; i < records.length; i++) {
      uniqueMaterials.add(records[i].material);
    }

    // --- Streaming workbook ---
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      filename: filePath,
    });

    // Sheet 1: Parameters
    await this._writeParametersSheet(workbook, {
      plant,
      totalRecords: records.length,
      totalMaterials: uniqueMaterials.size,
      totalLocations: locationCount,
    });

    // Sheet 2: Inventory Report (consolidated)
    await this._writeInventorySheet(workbook, records);

    // Sheet 3: Summary
    await this._writeSummarySheet(workbook, summaryMap, sortedLocations);

    // Sheets 4+: One per location (alphabetical)
    for (let l = 0; l < sortedLocations.length; l++) {
      const loc = sortedLocations[l];
      const indices = locationMap.get(loc);
      await this._writeLocationSheet(workbook, records, indices, loc);
    }

    await workbook.commit();

    const executionTime = ((Date.now() - startTime) / 1000).toFixed(1);
    const sheetCount = 3 + locationCount; // Parameters + Inventory + Summary + locations

    // Get file size
    let fileSize = 0;
    try {
      const stat = fs.statSync(filePath);
      fileSize = stat.size;
    } catch (e) {
      /* ignore */
    }

    return {
      filePath,
      totalRecords: records.length,
      locationCount,
      sheetCount,
      executionTime: parseFloat(executionTime),
      fileSize,
      fileSizeMB: (fileSize / (1024 * 1024)).toFixed(2),
    };
  }

  // --- Sheet writers ---

  async _writeParametersSheet(workbook, meta) {
    const sheet = workbook.addWorksheet("Parameters");

    sheet.columns = [
      { header: "Parameter", key: "parameter", width: 20 },
      { header: "Value", key: "value", width: 40 },
    ];

    const rows = [
      { parameter: "Generated At", value: new Date().toISOString() },
      { parameter: "Plant", value: meta.plant },
      { parameter: "Total Records", value: String(meta.totalRecords) },
      { parameter: "Total Materials", value: String(meta.totalMaterials) },
      { parameter: "Total Locations", value: String(meta.totalLocations) },
      {
        parameter: "Generated By",
        value: "SAP Inventory & GL Reconciliation Platform",
      },
      { parameter: "Version", value: "3.12.0" },
    ];

    for (let i = 0; i < rows.length; i++) {
      const row = sheet.addRow(rows[i]);
      row.commit();
    }

    sheet.commit();
  }

  async _writeInventorySheet(workbook, records) {
    const sheet = workbook.addWorksheet("Inventory Report");

    sheet.columns = this._customerColumns();

    // Write rows (streaming — commit immediately)
    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      const row = sheet.addRow({
        material: r.material,
        mtyp: r.materialType,
        materialDescription: r.materialDescription,
        matlGroup: r.materialGroup,
        plnt: r.plant,
        sloc: r.storageLocation,
        s: "", // Special Stock Indicator (gap)
        valuation: "", // Valuation Type (gap)
        specialStockNo: "", // Special stock number (gap)
        sl: "", // SL (gap)
        bun: r.baseUnit,
        unrestricted: r.unrestrictedQty,
        crcy: "", // Currency (gap)
        unrestrictedCost: r.standardCost,
        valueUnrestricted: r.unrestrictedValue,
        transit: r.transitQty,
        valTransit: r.transitValue,
        inQuality: r.qualityQty,
        valueQuality: r.qualityValue,
        restrictedUse: r.restrictedQty,
        valueRestricted: r.restrictedValue,
        blocked: r.blockedQty,
        valueBlocked: r.blockedValue,
        returns: r.returnsQty,
        valueReturns: r.returnsValue,
      });
      row.commit();
    }

    sheet.commit();
  }

  async _writeSummarySheet(workbook, summaryMap, sortedLocations) {
    const sheet = workbook.addWorksheet("Summary");

    sheet.columns = [
      { header: "SLoc", key: "sloc", width: 8 },
      { header: "Unrestricted", key: "unrestrictedQty", width: 14 },
      { header: "Value Unrestricted", key: "unrestrictedValue", width: 18 },
      { header: "Transit/Transf.", key: "transitQty", width: 14 },
      { header: "Val. in Trans./Tfr", key: "transitValue", width: 18 },
      { header: "In Quality Insp.", key: "qualityQty", width: 16 },
      { header: "Value in QualInsp.", key: "qualityValue", width: 18 },
      { header: "Restricted-Use", key: "restrictedQty", width: 14 },
      { header: "Value Restricted", key: "restrictedValue", width: 16 },
      { header: "Blocked", key: "blockedQty", width: 10 },
      { header: "Value BlockedStock", key: "blockedValue", width: 18 },
      { header: "Returns", key: "returnsQty", width: 10 },
      { header: "Value Rets Blocked", key: "returnsValue", width: 18 },
      { header: "TOTAL", key: "totalValue", width: 18 },
      { header: "Record Count", key: "recordCount", width: 12, hidden: true },
    ];

    // Grand total accumulators
    let gtUnrQty = 0,
      gtUnrVal = 0,
      gtTrnQty = 0,
      gtTrnVal = 0;
    let gtQlQty = 0,
      gtQlVal = 0,
      gtResQty = 0,
      gtResVal = 0;
    let gtBlkQty = 0,
      gtBlkVal = 0,
      gtRetQty = 0,
      gtRetVal = 0;
    let gtTotal = 0,
      gtRecords = 0;

    for (let i = 0; i < sortedLocations.length; i++) {
      const loc = sortedLocations[i];
      const s = summaryMap.get(loc);

      const row = sheet.addRow({
        sloc: loc,
        unrestrictedQty: round2(s.unrestrictedQty),
        unrestrictedValue: round2(s.unrestrictedValue),
        transitQty: round2(s.transitQty),
        transitValue: round2(s.transitValue),
        qualityQty: round2(s.qualityQty),
        qualityValue: round2(s.qualityValue),
        restrictedQty: round2(s.restrictedQty),
        restrictedValue: round2(s.restrictedValue),
        blockedQty: round2(s.blockedQty),
        blockedValue: round2(s.blockedValue),
        returnsQty: round2(s.returnsQty),
        returnsValue: round2(s.returnsValue),
        totalValue: round2(s.totalValue),
        recordCount: s.recordCount,
      });
      row.commit();

      gtUnrQty += s.unrestrictedQty;
      gtUnrVal += s.unrestrictedValue;
      gtTrnQty += s.transitQty;
      gtTrnVal += s.transitValue;
      gtQlQty += s.qualityQty;
      gtQlVal += s.qualityValue;
      gtResQty += s.restrictedQty;
      gtResVal += s.restrictedValue;
      gtBlkQty += s.blockedQty;
      gtBlkVal += s.blockedValue;
      gtRetQty += s.returnsQty;
      gtRetVal += s.returnsValue;
      gtTotal += s.totalValue;
      gtRecords += s.recordCount;
    }

    // Grand Total row
    const totalRow = sheet.addRow({
      sloc: "GRAND TOTAL",
      unrestrictedQty: round2(gtUnrQty),
      unrestrictedValue: round2(gtUnrVal),
      transitQty: round2(gtTrnQty),
      transitValue: round2(gtTrnVal),
      qualityQty: round2(gtQlQty),
      qualityValue: round2(gtQlVal),
      restrictedQty: round2(gtResQty),
      restrictedValue: round2(gtResVal),
      blockedQty: round2(gtBlkQty),
      blockedValue: round2(gtBlkVal),
      returnsQty: round2(gtRetQty),
      returnsValue: round2(gtRetVal),
      totalValue: round2(gtTotal),
      recordCount: gtRecords,
    });
    totalRow.commit();

    sheet.commit();
  }

  async _writeLocationSheet(workbook, records, indices, locationName) {
    // Sheet name max 31 chars in Excel
    const sheetName = locationName.substring(0, 31);
    const sheet = workbook.addWorksheet(sheetName);

    sheet.columns = this._customerColumns();

    for (let i = 0; i < indices.length; i++) {
      const r = records[indices[i]];
      const row = sheet.addRow({
        material: r.material,
        mtyp: r.materialType,
        materialDescription: r.materialDescription,
        matlGroup: r.materialGroup,
        plnt: r.plant,
        sloc: r.storageLocation,
        s: "",
        valuation: "",
        specialStockNo: "",
        sl: "",
        bun: r.baseUnit,
        unrestricted: r.unrestrictedQty,
        crcy: "",
        unrestrictedCost: r.standardCost,
        valueUnrestricted: r.unrestrictedValue,
        transit: r.transitQty,
        valTransit: r.transitValue,
        inQuality: r.qualityQty,
        valueQuality: r.qualityValue,
        restrictedUse: r.restrictedQty,
        valueRestricted: r.restrictedValue,
        blocked: r.blockedQty,
        valueBlocked: r.blockedValue,
        returns: r.returnsQty,
        valueReturns: r.returnsValue,
      });
      row.commit();
    }

    sheet.commit();
  }

  // --- Customer column definition (matches customer Excel exactly) ---

  _customerColumns() {
    return [
      { header: "Material", key: "material", width: 18 },
      { header: "MTyp", key: "mtyp", width: 6 },
      { header: "Material Description", key: "materialDescription", width: 35 },
      { header: "Matl Group", key: "matlGroup", width: 10 },
      { header: "Plnt", key: "plnt", width: 5 },
      { header: "SLoc", key: "sloc", width: 6 },
      { header: "S", key: "s", width: 3 },
      { header: "Valuation", key: "valuation", width: 10 },
      { header: "Special stock number", key: "specialStockNo", width: 18 },
      { header: "SL", key: "sl", width: 4 },
      { header: "BUn", key: "bun", width: 5 },
      { header: "Unrestricted", key: "unrestricted", width: 14 },
      { header: "Crcy", key: "crcy", width: 5 },
      {
        header: "Unrestricted Standard Cost",
        key: "unrestrictedCost",
        width: 22,
      },
      { header: "Value Unrestricted", key: "valueUnrestricted", width: 18 },
      { header: "Transit/Transf.", key: "transit", width: 14 },
      { header: "Val. in Trans./Tfr", key: "valTransit", width: 16 },
      { header: "In Quality Insp.", key: "inQuality", width: 14 },
      { header: "Value in QualInsp.", key: "valueQuality", width: 16 },
      { header: "Restricted-Use", key: "restrictedUse", width: 14 },
      { header: "Value Restricted", key: "valueRestricted", width: 16 },
      { header: "Blocked", key: "blocked", width: 10 },
      { header: "Value BlockedStock", key: "valueBlocked", width: 16 },
      { header: "Returns", key: "returns", width: 10 },
      { header: "Value Rets Blocked", key: "valueReturns", width: 16 },
    ];
  }
}

function round2(val) {
  return Math.round(val * 100) / 100;
}

module.exports = CustomerWorkbookService;
