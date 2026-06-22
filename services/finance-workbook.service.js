const ExcelJS = require("exceljs");
const path = require("path");
const fs = require("fs");

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
   * @returns {Promise<{filePath, sheetCount, executionTime, fileSizeMB}>}
   */
  async generateFinanceWorkbook(data, params) {
    const startTime = Date.now();
    const { companyCode, plant, fiscalYear } = params;

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

    const sortedLocations = [...locationMap.keys()].sort();

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

    // --- Streaming workbook ---
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      filename: filePath,
    });

    // 1. Parameters
    await this._writeParams(workbook, params, data, sortedLocations.length);

    // 2. Inventory Report
    await this._writeInventory(
      workbook,
      data.inventoryRecords,
      params.currency,
    );

    // 3. Summary
    await this._writeSummary(workbook, summaryMap, sortedLocations);

    // 4. Location sheets
    for (let l = 0; l < sortedLocations.length; l++) {
      const loc = sortedLocations[l];
      const indices = locationMap.get(loc);
      await this._writeLocation(
        workbook,
        data.inventoryRecords,
        indices,
        loc,
        params.currency,
      );
    }

    // 5. GL Detail
    await this._writeGLDetail(workbook, data.glRecords);

    // 6. GL Summary
    await this._writeGLSummary(workbook, glSummaryMap);

    // 7. Plant Reconciliation
    await this._writePlantRecon(workbook, data.plantRecon);

    // 8. Location Reconciliation
    await this._writeLocationRecon(workbook, data.locationRecon);

    // 9. Top Variances
    await this._writeTopVariances(workbook, data.topVariances);

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
      sheetCount: 5 + sortedLocations.length + 4, // params+inv+summary + locations + gl detail+gl summary+plant recon+loc recon+top var
      locationCount: sortedLocations.length,
      executionTime: parseFloat(executionTime),
      fileSizeMB: (fileSize / (1024 * 1024)).toFixed(2),
    };
  }

  // --- Sheet writers ---

  async _writeParams(workbook, params, data, locationCount) {
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
      { p: "Version", v: "3.13.0" },
    ];
    for (let i = 0; i < rows.length; i++) {
      const row = sheet.addRow(rows[i]);
      row.commit();
    }
    sheet.commit();
  }

  async _writeInventory(workbook, records, currency) {
    const sheet = workbook.addWorksheet("Inventory Report");
    sheet.columns = this._customerColumns();
    for (let i = 0; i < records.length; i++) {
      const r = records[i];
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
        crcy: currency || "",
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

  async _writeSummary(workbook, summaryMap, sortedLocations) {
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
    sheet.commit();
  }

  async _writeLocation(workbook, records, indices, loc, currency) {
    const sheet = workbook.addWorksheet(loc.substring(0, 31));
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
        crcy: currency || "",
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
        cc: r.companyCode,
        acct: r.glAccount,
        year: r.fiscalYear,
        period: r.period,
        dc: r.debitCreditIndicator,
        lcb: r.localCurrencyBalance,
        tcb: r.transactionCurrencyBalance,
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
        plant: r.plant,
        inv: r.inventoryValue,
        gl: r.glBalance,
        var: r.variance,
        pct: r.variancePercent,
        status: r.status,
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
        plant: r.plant,
        sloc: r.storageLocation,
        inv: r.inventoryValue,
        gl: r.glBalance,
        var: r.variance,
        pct: r.variancePercent,
        status: r.status,
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
        plant: r.plant,
        sloc: r.storageLocation,
        inv: r.inventoryValue,
        gl: r.glBalance,
        var: r.variance,
        pct: r.variancePercent,
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
  return Math.round(val * 100) / 100;
}

module.exports = FinanceWorkbookService;
