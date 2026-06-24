const ExcelJS = require("exceljs");
const path = require("path");
const fs = require("fs");
const { safeNum, safeStr } = require("../utils/safe-cell");
const defaultConfig = require("../config/workbook.config");
const {
  splitIntoChunks,
  splitIndicesIntoChunks,
  buildSplitSheetNames,
  requiresSplitting,
  SAFE_MAX_ROWS,
} = require("../utils/excel-sheet-splitter");

const OUTPUT_DIR = path.resolve(__dirname, "../output");
const accountMaster = require("../config/inventory-account-master.json");

/**
 * Finance Workbook Service
 *
 * Generates a SINGLE reconciliation workbook containing:
 *   1. Parameters
 *   2. Inventory Report (consolidated)
 *   3. Summary (by location)
 *   4. Location sheets (one per location)
 *   5. GL Detail
 *   6. GL Summary
 *   7. Plant Reconciliation
 *   8. Location Reconciliation
 *   9. Top Variances
 *
 * PERFORMANCE:
 *   - ONE SAP inventory extraction
 *   - ONE SAP GL extraction
 *   - Streaming workbook writer
 *   - Single-pass aggregation
 */
class FinanceWorkbookService {
  constructor() {
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
  }

  /**
   * Generate the full finance reconciliation workbook.
   *
   * @param {object} data
   * @param {InventoryRecord[]} data.inventoryRecords
   * @param {GLBalanceRecord[]} data.glRecords
   * @param {PlantReconciliation[]} data.plantRecon
   * @param {StorageLocationReconciliation[]} data.locationRecon
   * @param {TopVariance[]} data.topVariances
   * @param {object} params - { companyCode, plant, fiscalYear, period, currency }
   * @param {object} [config] - overrides from workbook.config.js
   * @returns {Promise<{filePath, sheetCount, executionTime, fileSizeMB}|{files, sheetCount, executionTime}>}
   */
  async generateFinanceWorkbook(data, params, config) {
    const cfg = { ...defaultConfig, ...(config || {}) };
    const startTime = Date.now();

    // SPLIT mode generates separate workbooks
    if (cfg.workbookMode === "SPLIT") {
      return this._generateSplitWorkbooks(data, params, cfg, startTime);
    }

    return this._generateSingleWorkbook(data, params, cfg, startTime);
  }

  async _generateSingleWorkbook(data, params, cfg, startTime) {
    const { plant, fiscalYear } = params;
    const filename = `Inventory_GL_Reconciliation_${plant}_${fiscalYear}.xlsx`;
    const filePath = path.join(OUTPUT_DIR, filename);

    // --- Single-pass inventory grouping ---
    const locationMap = new Map();
    const summaryMap = new Map();

    for (let i = 0; i < data.inventoryRecords.length; i++) {
      const r = data.inventoryRecords[i];
      const loc = r.storageLocation || "UNKNOWN";

      if (!locationMap.has(loc)) locationMap.set(loc, []);
      locationMap.get(loc).push(i);

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
      s.unrestrictedQty += safeNum(r.unrestrictedQty);
      s.unrestrictedValue += safeNum(r.unrestrictedValue);
      s.transitQty += safeNum(r.transitQty);
      s.transitValue += safeNum(r.transitValue);
      s.qualityQty += safeNum(r.qualityQty);
      s.qualityValue += safeNum(r.qualityValue);
      s.restrictedQty += safeNum(r.restrictedQty);
      s.restrictedValue += safeNum(r.restrictedValue);
      s.blockedQty += safeNum(r.blockedQty);
      s.blockedValue += safeNum(r.blockedValue);
      s.returnsQty += safeNum(r.returnsQty);
      s.returnsValue += safeNum(r.returnsValue);
      s.totalValue += safeNum(r.totalInventoryValue);
      s.recordCount += 1;
    }

    const sortedLocations = [...locationMap.keys()].sort();

    // --- Special Stock grouping (single pass already done, group by indicator) ---
    const specialStockMap = new Map(); // Map<indicator, index[]>
    specialStockMap.set("E", []);
    specialStockMap.set("O", []);
    specialStockMap.set("W", []);
    specialStockMap.set("UNASSIGNED", []);

    for (let i = 0; i < data.inventoryRecords.length; i++) {
      const indicator = data.inventoryRecords[i].specialStockIndicator || "";
      if (indicator === "E" || indicator === "O" || indicator === "W") {
        specialStockMap.get(indicator).push(i);
      } else {
        specialStockMap.get("UNASSIGNED").push(i);
      }
    }

    // --- GL Summary aggregation ---
    const glSummaryMap = new Map();
    for (let i = 0; i < data.glRecords.length; i++) {
      const r = data.glRecords[i];
      const acct = r.glAccount;
      if (!glSummaryMap.has(acct)) {
        glSummaryMap.set(acct, {
          glAccount: acct,
          balance: 0,
          debit: 0,
          credit: 0,
          count: 0,
        });
      }
      const g = glSummaryMap.get(acct);
      g.balance += r.cumulativeBalance;
      if (r.debitCreditIndicator === "S") g.debit += r.cumulativeBalance;
      else g.credit += r.cumulativeBalance;
      g.count += 1;
    }

    // --- Track split sheet details ---
    const splitSheetDetails = [];

    // --- Pre-calculate split info for Parameters sheet ---
    if (cfg.includeInventoryReport && cfg.detailMode !== "SUMMARY_ONLY") {
      if (requiresSplitting(data.inventoryRecords.length)) {
        const names = buildSplitSheetNames(
          "Inventory Report",
          data.inventoryRecords.length,
        );
        splitSheetDetails.push({
          baseSheet: "Inventory Report",
          generatedSheets: names.length,
        });
      }
    }
    if (cfg.includeLocationSheets && cfg.detailMode !== "SUMMARY_ONLY") {
      const locsToCheck = this._resolveLocations(sortedLocations, cfg);
      for (let l = 0; l < locsToCheck.length; l++) {
        const loc = locsToCheck[l];
        const indices = locationMap.get(loc);
        if (indices && requiresSplitting(indices.length)) {
          const names = buildSplitSheetNames(
            loc.substring(0, 31),
            indices.length,
          );
          splitSheetDetails.push({
            baseSheet: loc,
            generatedSheets: names.length,
          });
        }
      }
    }
    if (cfg.includeSpecialStockSheets && cfg.detailMode !== "SUMMARY_ONLY") {
      const ssOrder = ["E", "O", "W", "UNASSIGNED"];
      for (let ss = 0; ss < ssOrder.length; ss++) {
        const indicator = ssOrder[ss];
        const indices = specialStockMap.get(indicator);
        if (indices.length > 0 && requiresSplitting(indices.length)) {
          const baseName =
            indicator === "UNASSIGNED" ? "UNASSIGNED" : indicator;
          const names = buildSplitSheetNames(baseName, indices.length);
          splitSheetDetails.push({
            baseSheet: baseName,
            generatedSheets: names.length,
          });
        }
      }
    }

    // --- Streaming workbook ---
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      filename: filePath,
    });

    let sheetCount = 0;
    const isSummaryOnly = cfg.detailMode === "SUMMARY_ONLY";

    // 1. Parameters (always)
    await this._writeParams(
      workbook,
      params,
      data,
      sortedLocations.length,
      specialStockMap,
      splitSheetDetails,
    );
    sheetCount++;

    // 2. Inventory Report (detail) — with automatic splitting
    if (cfg.includeInventoryReport && !isSummaryOnly) {
      const written = await this._writeInventorySheets(
        workbook,
        data.inventoryRecords,
        params.currency,
      );
      sheetCount += written;
    }

    // 3. Summary (with worksheet distribution info)
    if (cfg.includeSummary) {
      await this._writeSummary(
        workbook,
        summaryMap,
        sortedLocations,
        splitSheetDetails,
      );
      sheetCount++;
    }

    // 4. Location sheets (detail) — with automatic splitting
    if (cfg.includeLocationSheets && !isSummaryOnly) {
      const locsToGenerate = this._resolveLocations(sortedLocations, cfg);
      for (let l = 0; l < locsToGenerate.length; l++) {
        const loc = locsToGenerate[l];
        const indices = locationMap.get(loc);
        if (indices && indices.length > 0) {
          const written = await this._writeLocationSheets(
            workbook,
            data.inventoryRecords,
            indices,
            loc,
            params.currency,
          );
          sheetCount += written;
        }
      }
    }

    // 5. Special Stock Sheets (detail) — with automatic splitting
    if (cfg.includeSpecialStockSheets && !isSummaryOnly) {
      const ssOrder = ["E", "O", "W", "UNASSIGNED"];
      for (let ss = 0; ss < ssOrder.length; ss++) {
        const indicator = ssOrder[ss];
        const indices = specialStockMap.get(indicator);
        if (indices.length > 0) {
          const written = await this._writeSpecialStockSheets(
            workbook,
            data.inventoryRecords,
            indices,
            indicator,
            params.currency,
          );
          sheetCount += written;
        }
      }
    }

    // 6. GL Detail (detail)
    if (cfg.includeGLDetail && !isSummaryOnly) {
      await this._writeGLDetail(workbook, data.glRecords);
      sheetCount++;
    }

    // 7. GL Summary
    if (cfg.includeGLSummary) {
      await this._writeGLSummary(workbook, glSummaryMap);
      sheetCount++;
    }

    // 8. Plant Reconciliation
    if (cfg.includePlantReconciliation) {
      await this._writePlantRecon(workbook, data.plantRecon);
      sheetCount++;
    }

    // 9. Location Reconciliation
    if (cfg.includeLocationReconciliation) {
      await this._writeLocationRecon(workbook, data.locationRecon);
      sheetCount++;
    }

    // 10. Top Variances
    if (cfg.includeTopVariances) {
      await this._writeTopVariances(workbook, data.topVariances);
      sheetCount++;
    }

    await workbook.commit();

    const executionTime = ((Date.now() - startTime) / 1000).toFixed(1);
    let fileSize = 0;
    try {
      fileSize = fs.statSync(filePath).size;
    } catch (e) {
      /* */
    }

    return {
      filePath,
      sheetCount,
      locationCount: sortedLocations.length,
      executionTime: parseFloat(executionTime),
      fileSizeMB: (fileSize / (1024 * 1024)).toFixed(2),
      splitSheetsGenerated: splitSheetDetails.length > 0,
      splitSheetCount: splitSheetDetails.reduce(
        (sum, d) => sum + d.generatedSheets,
        0,
      ),
      splitSheetDetails,
    };
  }

  /**
   * SPLIT mode: generate three separate workbooks.
   */
  async _generateSplitWorkbooks(data, params, cfg, startTime) {
    const { plant, fiscalYear } = params;
    const files = [];

    // Shared grouping
    const {
      locationMap,
      summaryMap,
      sortedLocations,
      specialStockMap,
      glSummaryMap,
    } = this._groupData(data, cfg);

    // Inventory workbook
    const invFile = path.join(
      OUTPUT_DIR,
      `Inventory_${plant}_${fiscalYear}.xlsx`,
    );
    const invWb = new ExcelJS.stream.xlsx.WorkbookWriter({ filename: invFile });
    await this._writeParams(
      invWb,
      params,
      data,
      sortedLocations.length,
      specialStockMap,
      [],
    );
    if (cfg.includeInventoryReport)
      await this._writeInventorySheets(
        invWb,
        data.inventoryRecords,
        params.currency,
      );
    if (cfg.includeSummary)
      await this._writeSummary(invWb, summaryMap, sortedLocations, []);
    if (cfg.includeLocationSheets) {
      const locs = this._resolveLocations(sortedLocations, cfg);
      for (let l = 0; l < locs.length; l++) {
        const indices = locationMap.get(locs[l]);
        if (indices && indices.length > 0)
          await this._writeLocationSheets(
            invWb,
            data.inventoryRecords,
            indices,
            locs[l],
            params.currency,
          );
      }
    }
    if (cfg.includeSpecialStockSheets) {
      for (const ind of ["E", "O", "W", "UNASSIGNED"]) {
        const indices = specialStockMap.get(ind);
        if (indices.length > 0)
          await this._writeSpecialStockSheets(
            invWb,
            data.inventoryRecords,
            indices,
            ind,
            params.currency,
          );
      }
    }
    await invWb.commit();
    files.push(invFile);

    // GL workbook
    const glFile = path.join(OUTPUT_DIR, `GL_${plant}_${fiscalYear}.xlsx`);
    const glWb = new ExcelJS.stream.xlsx.WorkbookWriter({ filename: glFile });
    await this._writeParams(
      glWb,
      params,
      data,
      sortedLocations.length,
      specialStockMap,
      [],
    );
    if (cfg.includeGLDetail) await this._writeGLDetail(glWb, data.glRecords);
    if (cfg.includeGLSummary) await this._writeGLSummary(glWb, glSummaryMap);
    await glWb.commit();
    files.push(glFile);

    // Reconciliation workbook
    const reconFile = path.join(
      OUTPUT_DIR,
      `Reconciliation_${plant}_${fiscalYear}.xlsx`,
    );
    const reconWb = new ExcelJS.stream.xlsx.WorkbookWriter({
      filename: reconFile,
    });
    await this._writeParams(
      reconWb,
      params,
      data,
      sortedLocations.length,
      specialStockMap,
      [],
    );
    if (cfg.includePlantReconciliation)
      await this._writePlantRecon(reconWb, data.plantRecon);
    if (cfg.includeLocationReconciliation)
      await this._writeLocationRecon(reconWb, data.locationRecon);
    if (cfg.includeTopVariances)
      await this._writeTopVariances(reconWb, data.topVariances);
    await reconWb.commit();
    files.push(reconFile);

    const executionTime = ((Date.now() - startTime) / 1000).toFixed(1);
    return {
      files,
      sheetCount: files.length,
      executionTime: parseFloat(executionTime),
    };
  }

  /**
   * Shared data grouping used by both SINGLE and SPLIT modes.
   */
  _groupData(data, cfg) {
    const locationMap = new Map();
    const summaryMap = new Map();
    const specialStockMap = new Map();
    specialStockMap.set("E", []);
    specialStockMap.set("O", []);
    specialStockMap.set("W", []);
    specialStockMap.set("UNASSIGNED", []);

    for (let i = 0; i < data.inventoryRecords.length; i++) {
      const r = data.inventoryRecords[i];
      const loc = r.storageLocation || "UNKNOWN";

      if (!locationMap.has(loc)) locationMap.set(loc, []);
      locationMap.get(loc).push(i);

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
      s.unrestrictedQty += safeNum(r.unrestrictedQty);
      s.unrestrictedValue += safeNum(r.unrestrictedValue);
      s.transitQty += safeNum(r.transitQty);
      s.transitValue += safeNum(r.transitValue);
      s.qualityQty += safeNum(r.qualityQty);
      s.qualityValue += safeNum(r.qualityValue);
      s.restrictedQty += safeNum(r.restrictedQty);
      s.restrictedValue += safeNum(r.restrictedValue);
      s.blockedQty += safeNum(r.blockedQty);
      s.blockedValue += safeNum(r.blockedValue);
      s.returnsQty += safeNum(r.returnsQty);
      s.returnsValue += safeNum(r.returnsValue);
      s.totalValue += safeNum(r.totalInventoryValue);
      s.recordCount += 1;

      const indicator = r.specialStockIndicator || "";
      if (indicator === "E" || indicator === "O" || indicator === "W") {
        specialStockMap.get(indicator).push(i);
      } else {
        specialStockMap.get("UNASSIGNED").push(i);
      }
    }

    const sortedLocations = [...locationMap.keys()].sort();

    const glSummaryMap = new Map();
    for (let i = 0; i < data.glRecords.length; i++) {
      const r = data.glRecords[i];
      const acct = r.glAccount || "";
      if (!glSummaryMap.has(acct))
        glSummaryMap.set(acct, {
          glAccount: acct,
          balance: 0,
          debit: 0,
          credit: 0,
          count: 0,
        });
      const g = glSummaryMap.get(acct);
      g.balance += safeNum(r.cumulativeBalance);
      if (r.debitCreditIndicator === "S")
        g.debit += safeNum(r.cumulativeBalance);
      else g.credit += safeNum(r.cumulativeBalance);
      g.count += 1;
    }

    return {
      locationMap,
      summaryMap,
      sortedLocations,
      specialStockMap,
      glSummaryMap,
    };
  }

  /**
   * Resolve which locations to generate based on config.
   */
  _resolveLocations(sortedLocations, cfg) {
    if (cfg.locationMode === "NONE") return [];
    if (
      cfg.locationMode === "SELECTED" &&
      cfg.selectedLocations &&
      cfg.selectedLocations.length > 0
    ) {
      const selected = new Set(cfg.selectedLocations);
      return sortedLocations.filter((loc) => selected.has(loc));
    }
    return sortedLocations; // ALL
  }

  // --- Sheet writers ---

  async _writeParams(
    workbook,
    params,
    data,
    locationCount,
    specialStockMap,
    splitDetails,
  ) {
    const sheet = workbook.addWorksheet("Parameters");
    sheet.columns = [
      { header: "Parameter", key: "p", width: 22 },
      { header: "Value", key: "v", width: 40 },
    ];
    const rows = [
      { p: "Company Code", v: params.companyCode },
      { p: "Plant", v: params.plant },
      { p: "Fiscal Year", v: params.fiscalYear },
      { p: "Period", v: params.period || "ALL" },
      { p: "Currency", v: params.currency || "" },
      { p: "Generated At", v: new Date().toISOString() },
      { p: "Inventory Records", v: String(data.inventoryRecords.length) },
      { p: "GL Records", v: String(data.glRecords.length) },
      { p: "Location Count", v: String(locationCount) },
      { p: "Version", v: "3.17B" },
      { p: "", v: "" },
      { p: "--- Special Stock Distribution ---", v: "" },
      {
        p: "E (Sales Order Stock)",
        v: String(specialStockMap.get("E").length),
      },
      {
        p: "O (Vendor Consignment)",
        v: String(specialStockMap.get("O").length),
      },
      {
        p: "W (Customer Consignment)",
        v: String(specialStockMap.get("W").length),
      },
      {
        p: "UNASSIGNED (Normal)",
        v: String(specialStockMap.get("UNASSIGNED").length),
      },
      {
        p: "Total Special Stock Records",
        v: String(
          specialStockMap.get("E").length +
            specialStockMap.get("O").length +
            specialStockMap.get("W").length,
        ),
      },
      { p: "", v: "" },
      { p: "--- Excel Row Limit Protection ---", v: "" },
      { p: "Excel Safe Row Limit", v: String(SAFE_MAX_ROWS) },
      {
        p: "Split Sheets Generated",
        v: splitDetails && splitDetails.length > 0 ? "YES" : "NO",
      },
      {
        p: "Split Sheet Count",
        v: String(
          splitDetails
            ? splitDetails.reduce((sum, d) => sum + d.generatedSheets, 0)
            : 0,
        ),
      },
    ];
    for (let i = 0; i < rows.length; i++) {
      const row = sheet.addRow(rows[i]);
      row.commit();
    }
    sheet.commit();
  }

  /**
   * Write inventory report sheets with automatic splitting if needed.
   * @returns {number} number of sheets written
   */
  async _writeInventorySheets(workbook, records, currency) {
    const sheetNames = buildSplitSheetNames("Inventory Report", records.length);
    const chunks = splitIntoChunks(records);

    for (let c = 0; c < chunks.length; c++) {
      const sheet = workbook.addWorksheet(sheetNames[c]);
      sheet.columns = this._customerColumns();
      const chunk = chunks[c];
      for (let i = 0; i < chunk.length; i++) {
        const r = chunk[i];
        const row = sheet.addRow({
          material: safeStr(r.material),
          mtyp: safeStr(r.materialType),
          materialDescription: safeStr(r.materialDescription),
          matlGroup: safeStr(r.materialGroup),
          plnt: safeStr(r.plant),
          sloc: safeStr(r.storageLocation),
          s: safeStr(r.specialStockIndicator),
          valuation: "",
          specialStockNo: safeStr(r.specialStockNumber),
          sl: "",
          bun: safeStr(r.baseUnit),
          unrestricted: safeNum(r.unrestrictedQty),
          crcy: safeStr(currency),
          unrestrictedCost: safeNum(r.standardCost),
          valueUnrestricted: safeNum(r.unrestrictedValue),
          transit: safeNum(r.transitQty),
          valTransit: safeNum(r.transitValue),
          inQuality: safeNum(r.qualityQty),
          valueQuality: safeNum(r.qualityValue),
          restrictedUse: safeNum(r.restrictedQty),
          valueRestricted: safeNum(r.restrictedValue),
          blocked: safeNum(r.blockedQty),
          valueBlocked: safeNum(r.blockedValue),
          returns: safeNum(r.returnsQty),
          valueReturns: safeNum(r.returnsValue),
        });
        row.commit();
      }
      sheet.commit();
    }
    return sheetNames.length;
  }

  async _writeSummary(
    workbook,
    summaryMap,
    sortedLocations,
    splitSheetDetails,
  ) {
    const sheet = workbook.addWorksheet("Summary");
    sheet.columns = [
      { header: "SLoc", key: "sloc", width: 8 },
      { header: "Unrestricted", key: "uQty", width: 14 },
      { header: "Value Unrestricted", key: "uVal", width: 18 },
      { header: "Transit/Transf.", key: "tQty", width: 14 },
      { header: "Val. in Trans./Tfr", key: "tVal", width: 18 },
      { header: "In Quality Insp.", key: "qQty", width: 16 },
      { header: "Value in QualInsp.", key: "qVal", width: 18 },
      { header: "Restricted-Use", key: "rQty", width: 14 },
      { header: "Value Restricted", key: "rVal", width: 16 },
      { header: "Blocked", key: "bQty", width: 10 },
      { header: "Value BlockedStock", key: "bVal", width: 18 },
      { header: "Returns", key: "retQty", width: 10 },
      { header: "Value Rets Blocked", key: "retVal", width: 18 },
      { header: "TOTAL", key: "total", width: 18 },
      { header: "Record Count", key: "cnt", width: 12, hidden: true },
    ];
    let gt = {
      uQty: 0,
      uVal: 0,
      tQty: 0,
      tVal: 0,
      qQty: 0,
      qVal: 0,
      rQty: 0,
      rVal: 0,
      bQty: 0,
      bVal: 0,
      retQty: 0,
      retVal: 0,
      total: 0,
      cnt: 0,
    };
    for (let i = 0; i < sortedLocations.length; i++) {
      const s = summaryMap.get(sortedLocations[i]);
      const row = sheet.addRow({
        sloc: s.location,
        uQty: r2(s.unrestrictedQty),
        uVal: r2(s.unrestrictedValue),
        tQty: r2(s.transitQty),
        tVal: r2(s.transitValue),
        qQty: r2(s.qualityQty),
        qVal: r2(s.qualityValue),
        rQty: r2(s.restrictedQty),
        rVal: r2(s.restrictedValue),
        bQty: r2(s.blockedQty),
        bVal: r2(s.blockedValue),
        retQty: r2(s.returnsQty),
        retVal: r2(s.returnsValue),
        total: r2(s.totalValue),
        cnt: s.recordCount,
      });
      row.commit();
      gt.uQty += s.unrestrictedQty;
      gt.uVal += s.unrestrictedValue;
      gt.tQty += s.transitQty;
      gt.tVal += s.transitValue;
      gt.qQty += s.qualityQty;
      gt.qVal += s.qualityValue;
      gt.rQty += s.restrictedQty;
      gt.rVal += s.restrictedValue;
      gt.bQty += s.blockedQty;
      gt.bVal += s.blockedValue;
      gt.retQty += s.returnsQty;
      gt.retVal += s.returnsValue;
      gt.total += s.totalValue;
      gt.cnt += s.recordCount;
    }
    const totalRow = sheet.addRow({
      sloc: "GRAND TOTAL",
      uQty: r2(gt.uQty),
      uVal: r2(gt.uVal),
      tQty: r2(gt.tQty),
      tVal: r2(gt.tVal),
      qQty: r2(gt.qQty),
      qVal: r2(gt.qVal),
      rQty: r2(gt.rQty),
      rVal: r2(gt.rVal),
      bQty: r2(gt.bQty),
      bVal: r2(gt.bVal),
      retQty: r2(gt.retQty),
      retVal: r2(gt.retVal),
      total: r2(gt.total),
      cnt: gt.cnt,
    });
    totalRow.commit();

    // Worksheet Distribution section (if any splits occurred)
    if (splitSheetDetails && splitSheetDetails.length > 0) {
      // Blank separator row
      const sepRow = sheet.addRow({ sloc: "" });
      sepRow.commit();
      const headerRow = sheet.addRow({
        sloc: "--- Worksheet Distribution ---",
      });
      headerRow.commit();
      for (let i = 0; i < splitSheetDetails.length; i++) {
        const detail = splitSheetDetails[i];
        const names = buildSplitSheetNames(
          detail.baseSheet.substring(0, 31),
          detail.generatedSheets * SAFE_MAX_ROWS,
        );
        for (let n = 0; n < names.length; n++) {
          const distRow = sheet.addRow({ sloc: names[n] });
          distRow.commit();
        }
      }
    }

    sheet.commit();
  }

  /**
   * Write location sheet(s) with automatic splitting if needed.
   * @returns {number} number of sheets written
   */
  async _writeLocationSheets(workbook, records, indices, loc, currency) {
    const baseName = loc.substring(0, 31);
    const sheetNames = buildSplitSheetNames(baseName, indices.length);
    const indexChunks = splitIndicesIntoChunks(indices);

    for (let c = 0; c < indexChunks.length; c++) {
      const sheet = workbook.addWorksheet(sheetNames[c]);
      sheet.columns = this._customerColumns();
      const chunk = indexChunks[c];
      for (let i = 0; i < chunk.length; i++) {
        const r = records[chunk[i]];
        const row = sheet.addRow({
          material: safeStr(r.material),
          mtyp: safeStr(r.materialType),
          materialDescription: safeStr(r.materialDescription),
          matlGroup: safeStr(r.materialGroup),
          plnt: safeStr(r.plant),
          sloc: safeStr(r.storageLocation),
          s: safeStr(r.specialStockIndicator),
          valuation: "",
          specialStockNo: safeStr(r.specialStockNumber),
          sl: "",
          bun: safeStr(r.baseUnit),
          unrestricted: safeNum(r.unrestrictedQty),
          crcy: safeStr(currency),
          unrestrictedCost: safeNum(r.standardCost),
          valueUnrestricted: safeNum(r.unrestrictedValue),
          transit: safeNum(r.transitQty),
          valTransit: safeNum(r.transitValue),
          inQuality: safeNum(r.qualityQty),
          valueQuality: safeNum(r.qualityValue),
          restrictedUse: safeNum(r.restrictedQty),
          valueRestricted: safeNum(r.restrictedValue),
          blocked: safeNum(r.blockedQty),
          valueBlocked: safeNum(r.blockedValue),
          returns: safeNum(r.returnsQty),
          valueReturns: safeNum(r.returnsValue),
        });
        row.commit();
      }
      sheet.commit();
    }
    return sheetNames.length;
  }

  /**
   * Write special stock sheet(s) with automatic splitting if needed.
   * @returns {number} number of sheets written
   */
  async _writeSpecialStockSheets(
    workbook,
    records,
    indices,
    indicator,
    currency,
  ) {
    const baseName = indicator === "UNASSIGNED" ? "UNASSIGNED" : indicator;
    const sheetNames = buildSplitSheetNames(baseName, indices.length);
    const indexChunks = splitIndicesIntoChunks(indices);

    for (let c = 0; c < indexChunks.length; c++) {
      const sheet = workbook.addWorksheet(sheetNames[c]);
      sheet.columns = this._customerColumns();
      const chunk = indexChunks[c];

      let totalQty = 0;
      let totalValue = 0;

      for (let i = 0; i < chunk.length; i++) {
        const r = records[chunk[i]];
        const row = sheet.addRow({
          material: safeStr(r.material),
          mtyp: safeStr(r.materialType),
          materialDescription: safeStr(r.materialDescription),
          matlGroup: safeStr(r.materialGroup),
          plnt: safeStr(r.plant),
          sloc: safeStr(r.storageLocation),
          s: safeStr(r.specialStockIndicator),
          valuation: "",
          specialStockNo: safeStr(r.specialStockNumber),
          sl: "",
          bun: safeStr(r.baseUnit),
          unrestricted: safeNum(r.unrestrictedQty),
          crcy: safeStr(currency),
          unrestrictedCost: safeNum(r.standardCost),
          valueUnrestricted: safeNum(r.unrestrictedValue),
          transit: safeNum(r.transitQty),
          valTransit: safeNum(r.transitValue),
          inQuality: safeNum(r.qualityQty),
          valueQuality: safeNum(r.qualityValue),
          restrictedUse: safeNum(r.restrictedQty),
          valueRestricted: safeNum(r.restrictedValue),
          blocked: safeNum(r.blockedQty),
          valueBlocked: safeNum(r.blockedValue),
          returns: safeNum(r.returnsQty),
          valueReturns: safeNum(r.returnsValue),
        });
        row.commit();
        totalQty += safeNum(r.totalQuantity);
        totalValue += safeNum(r.totalInventoryValue);
      }

      // Totals row
      const totalRow = sheet.addRow({
        material: `Records: ${chunk.length}`,
        mtyp: "",
        materialDescription: `Total Qty: ${r2(totalQty)}`,
        matlGroup: "",
        plnt: "",
        sloc: "",
        s: "",
        valuation: "",
        specialStockNo: `Total Value: ${r2(totalValue)}`,
        sl: "",
        bun: "",
        unrestricted: 0,
        crcy: "",
        unrestrictedCost: 0,
        valueUnrestricted: 0,
        transit: 0,
        valTransit: 0,
        inQuality: 0,
        valueQuality: 0,
        restrictedUse: 0,
        valueRestricted: 0,
        blocked: 0,
        valueBlocked: 0,
        returns: 0,
        valueReturns: 0,
      });
      totalRow.commit();
      sheet.commit();
    }
    return sheetNames.length;
  }

  async _writeGLDetail(workbook, glRecords) {
    const sheet = workbook.addWorksheet("GL Detail");
    sheet.columns = [
      { header: "Company Code", key: "cc", width: 12 },
      { header: "GL Account", key: "acct", width: 14 },
      { header: "Fiscal Year", key: "year", width: 10 },
      { header: "Period", key: "period", width: 8 },
      { header: "Debit/Credit", key: "dc", width: 12 },
      { header: "Local Currency Balance", key: "lcb", width: 22 },
      { header: "Transaction Currency Balance", key: "tcb", width: 26 },
    ];
    for (let i = 0; i < glRecords.length; i++) {
      const r = glRecords[i];
      const row = sheet.addRow({
        cc: safeStr(r.companyCode),
        acct: safeStr(r.glAccount),
        year: safeStr(r.fiscalYear),
        period: safeStr(r.period),
        dc: safeStr(r.debitCreditIndicator),
        lcb: safeNum(r.localCurrencyBalance),
        tcb: safeNum(r.transactionCurrencyBalance),
      });
      row.commit();
    }
    sheet.commit();
  }

  async _writeGLSummary(workbook, glSummaryMap) {
    const sheet = workbook.addWorksheet("GL Summary");
    sheet.columns = [
      { header: "GL Account", key: "acct", width: 14 },
      { header: "Balance", key: "balance", width: 20 },
      { header: "Debit Balance", key: "debit", width: 18 },
      { header: "Credit Balance", key: "credit", width: 18 },
      { header: "Record Count", key: "count", width: 12 },
    ];
    // Sort by ABS(balance) DESC
    const sorted = [...glSummaryMap.values()].sort(
      (a, b) => Math.abs(b.balance) - Math.abs(a.balance),
    );
    let gtBal = 0,
      gtDeb = 0,
      gtCred = 0,
      gtCnt = 0;
    for (let i = 0; i < sorted.length; i++) {
      const g = sorted[i];
      const row = sheet.addRow({
        acct: g.glAccount,
        balance: r2(g.balance),
        debit: r2(g.debit),
        credit: r2(g.credit),
        count: g.count,
      });
      row.commit();
      gtBal += g.balance;
      gtDeb += g.debit;
      gtCred += g.credit;
      gtCnt += g.count;
    }
    const totalRow = sheet.addRow({
      acct: "GRAND TOTAL",
      balance: r2(gtBal),
      debit: r2(gtDeb),
      credit: r2(gtCred),
      count: gtCnt,
    });
    totalRow.commit();
    sheet.commit();
  }

  async _writePlantRecon(workbook, plantRecon) {
    const sheet = workbook.addWorksheet("Plant Reconciliation");
    sheet.columns = [
      { header: "Plant", key: "plant", width: 8 },
      { header: "Inventory Value", key: "inv", width: 20 },
      { header: "GL Balance", key: "gl", width: 18 },
      { header: "Variance", key: "var", width: 18 },
      { header: "Variance %", key: "pct", width: 12 },
      { header: "Status", key: "status", width: 12 },
    ];
    for (let i = 0; i < plantRecon.length; i++) {
      const r = plantRecon[i];
      const row = sheet.addRow({
        plant: safeStr(r.plant),
        inv: safeNum(r.inventoryValue),
        gl: safeNum(r.glBalance),
        var: safeNum(r.variance),
        pct: safeNum(r.variancePercent),
        status: safeStr(r.status),
      });
      row.commit();
    }
    sheet.commit();
  }

  async _writeLocationRecon(workbook, locationRecon) {
    const sheet = workbook.addWorksheet("Location Reconciliation");
    sheet.columns = [
      { header: "Plant", key: "plant", width: 8 },
      { header: "Storage Location", key: "sloc", width: 14 },
      { header: "Inventory Value", key: "inv", width: 20 },
      { header: "Allocated GL Balance", key: "gl", width: 20 },
      { header: "Variance", key: "var", width: 18 },
      { header: "Variance %", key: "pct", width: 12 },
      { header: "Status", key: "status", width: 12 },
    ];
    for (let i = 0; i < locationRecon.length; i++) {
      const r = locationRecon[i];
      const row = sheet.addRow({
        plant: safeStr(r.plant),
        sloc: safeStr(r.storageLocation),
        inv: safeNum(r.inventoryValue),
        gl: safeNum(r.glBalance),
        var: safeNum(r.variance),
        pct: safeNum(r.variancePercent),
        status: safeStr(r.status),
      });
      row.commit();
    }
    sheet.commit();
  }

  async _writeTopVariances(workbook, topVariances) {
    const sheet = workbook.addWorksheet("Top Variances");
    sheet.columns = [
      { header: "Plant", key: "plant", width: 8 },
      { header: "Storage Location", key: "sloc", width: 14 },
      { header: "Inventory Value", key: "inv", width: 20 },
      { header: "GL Balance", key: "gl", width: 18 },
      { header: "Variance", key: "var", width: 18 },
      { header: "Variance %", key: "pct", width: 12 },
    ];
    for (let i = 0; i < topVariances.length; i++) {
      const r = topVariances[i];
      const row = sheet.addRow({
        plant: safeStr(r.plant),
        sloc: safeStr(r.storageLocation),
        inv: safeNum(r.inventoryValue),
        gl: safeNum(r.glBalance),
        var: safeNum(r.variance),
        pct: safeNum(r.variancePercent),
      });
      row.commit();
    }
    sheet.commit();
  }

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

function r2(val) {
  if (val === undefined || val === null || isNaN(val) || !isFinite(val))
    return 0;
  return Math.round(val * 100) / 100;
}

module.exports = FinanceWorkbookService;
