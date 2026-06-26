/**
 * Phase 3.18G - Verify FAGLFLEXT Balance Formula Against FAGLB03
 *
 * Run: node tests/test-faglb03-balance-formula.js
 *
 * DIAGNOSTIC ONLY - No production code changes.
 *
 * Reads raw FAGLFLEXT data for a known inventory account and
 * verifies whether our balance calculation (HSLVT + HSL01..HSL12)
 * is mathematically identical to FAGLB03 (HSLVT + HSL01..HSL16).
 *
 * Generates: output/FAGLB03_Balance_Validation.xlsx
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const path = require("path");
const fs = require("fs");
const ExcelJS = require("exceljs");

const SAPService = require("../services/sap.service");
const parseRows = require("../utils/parse-rows");

const OUTPUT_DIR = path.resolve(__dirname, "../output");
const COMPANY_CODE = process.env.TEST_COMPANY || "1000";
const FISCAL_YEAR = process.env.TEST_FISCAL_YEAR || "2026";
const TEST_ACCOUNT = process.env.TEST_GL_ACCOUNT || "0013000000";

const ALL_HSL = [
  "HSL01",
  "HSL02",
  "HSL03",
  "HSL04",
  "HSL05",
  "HSL06",
  "HSL07",
  "HSL08",
  "HSL09",
  "HSL10",
  "HSL11",
  "HSL12",
  "HSL13",
  "HSL14",
  "HSL15",
  "HSL16",
];

async function testFAGLB03BalanceFormula() {
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
    console.log(
      "╔══════════════════════════════════════════════════════════════╗",
    );
    console.log(
      "║   Phase 3.18G - FAGLB03 Balance Formula Verification        ║",
    );
    console.log(
      "║   DIAGNOSTIC ONLY - No production changes                   ║",
    );
    console.log(
      "╚══════════════════════════════════════════════════════════════╝\n",
    );
    console.log(`  Company Code: ${COMPANY_CODE}`);
    console.log(`  Fiscal Year:  ${FISCAL_YEAR}`);
    console.log(`  Test Account: ${TEST_ACCOUNT}\n`);

    // ================================================================
    // STEP 1: Read raw FAGLFLEXT fields
    // ================================================================
    console.log("STEP 1: Reading FAGLFLEXT raw data...\n");

    const where = [
      `RRCTY = '0' AND RVERS = '001'`,
      `AND RBUKRS = '${COMPANY_CODE}'`,
      `AND RYEAR = '${FISCAL_YEAR}'`,
      `AND RACCT = '${TEST_ACCOUNT}'`,
    ];

    // Batch A: Identity + HSLVT + HSL01-08
    let batchAFields = [
      "RBUKRS",
      "RACCT",
      "RYEAR",
      "DRCRK",
      "HSLVT",
      "HSL01",
      "HSL02",
      "HSL03",
      "HSL04",
      "HSL05",
      "HSL06",
      "HSL07",
      "HSL08",
    ];

    // Batch B: HSL09-16
    let batchBFields = [
      "RBUKRS",
      "RACCT",
      "RYEAR",
      "HSL09",
      "HSL10",
      "HSL11",
      "HSL12",
      "HSL13",
      "HSL14",
      "HSL15",
      "HSL16",
    ];

    let rowsA = [];
    let rowsB = [];

    try {
      const [resultA, resultB] = await Promise.all([
        sap.readTable("FAGLFLEXT", batchAFields, { where }),
        sap.readTable("FAGLFLEXT", batchBFields, { where }),
      ]);
      rowsA = parseRows(resultA);
      rowsB = parseRows(resultB);
    } catch (err) {
      // HSL13-16 may not exist. Try without them.
      console.log(`  Initial read failed: ${err.message}`);
      console.log("  Retrying without HSL13-16...\n");

      batchBFields = [
        "RBUKRS",
        "RACCT",
        "RYEAR",
        "HSL09",
        "HSL10",
        "HSL11",
        "HSL12",
      ];

      try {
        const [resultA2, resultB2] = await Promise.all([
          sap.readTable("FAGLFLEXT", batchAFields, { where }),
          sap.readTable("FAGLFLEXT", batchBFields, { where }),
        ]);
        rowsA = parseRows(resultA2);
        rowsB = parseRows(resultB2);
        console.log(
          "  ⚠ HSL13-HSL16 fields do NOT exist in this system's FAGLFLEXT.\n",
        );
      } catch (err2) {
        console.error(`  FATAL: Cannot read FAGLFLEXT: ${err2.message}`);
        await sap.disconnect();
        return;
      }
    }

    if (rowsA.length === 0) {
      console.log(
        `  No data found for account ${TEST_ACCOUNT} in year ${FISCAL_YEAR}.`,
      );
      await sap.disconnect();
      return;
    }

    console.log(`  Rows found: ${rowsA.length}\n`);

    // Process each row
    const allRowData = [];

    for (let idx = 0; idx < rowsA.length; idx++) {
      const rA = rowsA[idx];
      const rB = rowsB[idx] || {};

      const rowData = {
        RBUKRS: (rA.RBUKRS || "").trim(),
        RACCT: (rA.RACCT || "").trim(),
        RYEAR: (rA.RYEAR || "").trim(),
        DRCRK: (rA.DRCRK || "").trim(),
        HSLVT: parseFloat(rA.HSLVT) || 0,
      };

      // Parse all HSL periods
      for (let p = 1; p <= 16; p++) {
        const field = `HSL${String(p).padStart(2, "0")}`;
        const source = p <= 8 ? rA : rB;
        rowData[field] = parseFloat(source[field]) || 0;
      }

      allRowData.push(rowData);
    }

    // Print raw field values for first row (or all if few)
    const printCount = Math.min(allRowData.length, 5);
    for (let idx = 0; idx < printCount; idx++) {
      const rd = allRowData[idx];
      console.log(`  --- Row ${idx + 1} (DRCRK=${rd.DRCRK}) ---`);
      console.log(`    RBUKRS: ${rd.RBUKRS}`);
      console.log(`    RACCT:  ${rd.RACCT}`);
      console.log(`    RYEAR:  ${rd.RYEAR}`);
      console.log(`    DRCRK:  ${rd.DRCRK}`);
      console.log(`    HSLVT:  ${fmt(rd.HSLVT)}`);
      for (let p = 1; p <= 16; p++) {
        const field = `HSL${String(p).padStart(2, "0")}`;
        console.log(`    ${field}:  ${fmt(rd[field])}`);
      }
      console.log("");
    }

    // ================================================================
    // STEP 2: Calculate formulas (aggregate across all rows)
    // ================================================================
    console.log(
      "STEP 2: Formula Calculations (aggregated across all rows)...\n",
    );

    let totalHSLVT = 0;
    let totalHSL01_12 = 0;
    let totalHSL13_16 = 0;

    for (const rd of allRowData) {
      totalHSLVT += rd.HSLVT;
      for (let p = 1; p <= 12; p++) {
        totalHSL01_12 += rd[`HSL${String(p).padStart(2, "0")}`];
      }
      for (let p = 13; p <= 16; p++) {
        totalHSL13_16 += rd[`HSL${String(p).padStart(2, "0")}`];
      }
    }

    const calcA = round2(totalHSLVT);
    const calcB = round2(totalHSL01_12);
    const calcC = round2(totalHSL13_16);
    const calcD = round2(totalHSLVT + totalHSL01_12);
    const calcE = round2(totalHSLVT + totalHSL01_12 + totalHSL13_16);

    console.log(`  Calculation A (HSLVT only):            ${fmt(calcA)}`);
    console.log(`  Calculation B (HSL01..HSL12):          ${fmt(calcB)}`);
    console.log(`  Calculation C (HSL13..HSL16):          ${fmt(calcC)}`);
    console.log(
      `  Calculation D (HSLVT + HSL01..HSL12):  ${fmt(calcD)}  ← OUR IMPLEMENTATION`,
    );
    console.log(
      `  Calculation E (HSLVT + HSL01..HSL16):  ${fmt(calcE)}  ← FAGLB03 FORMULA`,
    );
    console.log(
      `\n  Difference (E - D):                    ${fmt(round2(calcE - calcD))}`,
    );
    console.log("");

    // ================================================================
    // STEP 3: Period-by-period breakdown
    // ================================================================
    console.log("STEP 3: Period Values (aggregated)...\n");

    const periodValues = {};
    periodValues["HSLVT"] = totalHSLVT;
    for (let p = 1; p <= 16; p++) {
      const field = `HSL${String(p).padStart(2, "0")}`;
      let sum = 0;
      for (const rd of allRowData) sum += rd[field];
      periodValues[field] = round2(sum);
    }

    console.log("    Period       Value           Non-Zero");
    console.log("    " + "-".repeat(45));
    console.log(
      `    HSLVT        ${fmt(periodValues["HSLVT"]).padStart(16)}   ${periodValues["HSLVT"] !== 0 ? "✓" : ""}`,
    );
    for (let p = 1; p <= 16; p++) {
      const field = `HSL${String(p).padStart(2, "0")}`;
      const val = periodValues[field];
      const nonZero = val !== 0 ? "✓" : "";
      const label =
        p <= 12
          ? `Period ${String(p).padStart(2, "0")}`
          : `Special ${String(p).padStart(2, "0")}`;
      console.log(`    ${label}     ${fmt(val).padStart(16)}   ${nonZero}`);
    }
    console.log("");

    // ================================================================
    // STEP 4: Latest period with movement
    // ================================================================
    console.log("STEP 4: Latest period with non-zero value...\n");

    let latestPeriod = 0;
    for (let p = 16; p >= 1; p--) {
      const field = `HSL${String(p).padStart(2, "0")}`;
      if (periodValues[field] !== 0) {
        latestPeriod = p;
        break;
      }
    }

    if (latestPeriod > 0) {
      const label =
        latestPeriod <= 12
          ? `Period ${String(latestPeriod).padStart(2, "0")}`
          : `Special Period ${latestPeriod}`;
      console.log(`  Latest period with non-zero value: ${label}`);
    } else {
      console.log("  No period movements found (only carry forward).");
    }
    console.log("");

    // ================================================================
    // STEP 5: Explain zero periods
    // ================================================================
    console.log("STEP 5: Analysis of zero periods...\n");

    const zeroPeriods = [];
    for (let p = 1; p <= 16; p++) {
      const field = `HSL${String(p).padStart(2, "0")}`;
      if (periodValues[field] === 0) zeroPeriods.push(p);
    }

    if (zeroPeriods.length > 0) {
      const futureZero = zeroPeriods.filter((p) => p > latestPeriod && p <= 12);
      const specialZero = zeroPeriods.filter((p) => p > 12);

      if (futureZero.length > 0) {
        console.log(
          `  Periods ${futureZero.join(", ")}: Zero because no postings exist yet`,
        );
        console.log(
          "    (These are future periods in the current fiscal year)",
        );
      }
      if (specialZero.length > 0) {
        console.log(
          `  Special periods ${specialZero.join(", ")}: Zero because`,
        );
        console.log("    1. Year-end closing has not yet occurred, OR");
        console.log("    2. Customer does not use special periods, OR");
        console.log(
          "    3. Fields do not exist in this FAGLFLEXT configuration",
        );
      }
    } else {
      console.log("  All periods have non-zero values.");
    }
    console.log("");

    // ================================================================
    // STEP 6: Balance breakdown
    // ================================================================
    console.log("STEP 6: Balance Breakdown...\n");

    console.log(`  Carry Forward (HSLVT):     ${fmt(calcA)}`);
    console.log(`  + Period Movements (01-12): ${fmt(calcB)}`);
    console.log(`  + Special Periods (13-16):  ${fmt(calcC)}`);
    console.log(`  ─────────────────────────────────────────`);
    console.log(`  = Expected Balance (FAGLB03): ${fmt(calcE)}`);
    console.log(`  = Our Balance (current impl): ${fmt(calcD)}`);
    console.log("");

    // ================================================================
    // STEP 7: Final determination
    // ================================================================
    console.log(
      "══════════════════════════════════════════════════════════════",
    );
    console.log("  STEP 7: VERDICT");
    console.log(
      "══════════════════════════════════════════════════════════════\n",
    );

    const difference = round2(calcE - calcD);
    const isIdentical = difference === 0;

    console.log(`  Our implementation:   HSLVT + HSL01..HSL12 = ${fmt(calcD)}`);
    console.log(`  FAGLB03 formula:      HSLVT + HSL01..HSL16 = ${fmt(calcE)}`);
    console.log(`  Difference:           ${fmt(difference)}`);
    console.log("");

    if (isIdentical) {
      console.log(
        "  ✓ YES — Our balance calculation is MATHEMATICALLY IDENTICAL to FAGLB03.",
      );
      console.log(
        "    Special periods (13-16) are zero for this account/year.",
      );
      console.log("    No correction needed at this time.");
      console.log(
        "    However, if year-end adjustments are posted to periods 13-16,",
      );
      console.log("    our balance will diverge from FAGLB03.");
    } else {
      console.log("  ✗ NO — Our balance calculation DOES NOT match FAGLB03.");
      console.log(`    Missing amount: ${fmt(difference)}`);
      console.log("    Cause: Special periods (HSL13-HSL16) contain values");
      console.log("    that our implementation does not include.");
      console.log("    Action: Add HSL13-HSL16 to the balance summation.");
    }
    console.log("");

    // ================================================================
    // STEP 8: Generate workbook
    // ================================================================
    console.log("STEP 8: Generating FAGLB03_Balance_Validation.xlsx...");
    await generateWorkbook(allRowData, periodValues, {
      calcA,
      calcB,
      calcC,
      calcD,
      calcE,
      difference,
      isIdentical,
      latestPeriod,
      account: TEST_ACCOUNT,
    });

    await sap.disconnect();
    console.log("\nDone.");
  } catch (err) {
    console.error("ERROR:", err.message || err);
    if (err.stack) console.error(err.stack);
  }
}

async function generateWorkbook(allRowData, periodValues, meta) {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const filePath = path.join(OUTPUT_DIR, "FAGLB03_Balance_Validation.xlsx");
  const workbook = new ExcelJS.Workbook();

  // Sheet 1: Raw FAGLFLEXT
  const s1 = workbook.addWorksheet("Raw FAGLFLEXT");
  const cols = [
    { header: "Row", key: "row", width: 5 },
    { header: "RBUKRS", key: "RBUKRS", width: 8 },
    { header: "RACCT", key: "RACCT", width: 14 },
    { header: "RYEAR", key: "RYEAR", width: 7 },
    { header: "DRCRK", key: "DRCRK", width: 6 },
    { header: "HSLVT", key: "HSLVT", width: 16 },
  ];
  for (let p = 1; p <= 16; p++) {
    const field = `HSL${String(p).padStart(2, "0")}`;
    cols.push({ header: field, key: field, width: 14 });
  }
  s1.columns = cols;
  for (let i = 0; i < allRowData.length; i++) {
    const rd = allRowData[i];
    const rowObj = { row: i + 1, ...rd };
    s1.addRow(rowObj);
  }

  // Sheet 2: Formula Breakdown
  const s2 = workbook.addWorksheet("Formula Breakdown");
  s2.columns = [
    { header: "Calculation", key: "calc", width: 40 },
    { header: "Value", key: "value", width: 20 },
  ];
  s2.addRow({ calc: "A: HSLVT (Carry Forward)", value: meta.calcA });
  s2.addRow({
    calc: "B: HSL01 + ... + HSL12 (Period Movements)",
    value: meta.calcB,
  });
  s2.addRow({
    calc: "C: HSL13 + ... + HSL16 (Special Periods)",
    value: meta.calcC,
  });
  s2.addRow({
    calc: "D: HSLVT + HSL01..HSL12 (Our Implementation)",
    value: meta.calcD,
  });
  s2.addRow({
    calc: "E: HSLVT + HSL01..HSL16 (FAGLB03 Formula)",
    value: meta.calcE,
  });
  s2.addRow({ calc: "", value: "" });
  s2.addRow({ calc: "Difference (E - D)", value: meta.difference });
  s2.addRow({
    calc: "Mathematically Identical?",
    value: meta.isIdentical ? "YES" : "NO",
  });

  // Sheet 3: Period Values
  const s3 = workbook.addWorksheet("Period Values");
  s3.columns = [
    { header: "Period", key: "period", width: 14 },
    { header: "Field", key: "field", width: 8 },
    { header: "Value", key: "value", width: 18 },
    { header: "Non-Zero", key: "nonZero", width: 10 },
    { header: "Included in Our Calc", key: "included", width: 20 },
  ];
  s3.addRow({
    period: "Carry Forward",
    field: "HSLVT",
    value: periodValues["HSLVT"],
    nonZero: periodValues["HSLVT"] !== 0 ? "Y" : "N",
    included: "YES",
  });
  for (let p = 1; p <= 16; p++) {
    const field = `HSL${String(p).padStart(2, "0")}`;
    const val = periodValues[field];
    s3.addRow({
      period: p <= 12 ? `Period ${String(p).padStart(2, "0")}` : `Special ${p}`,
      field,
      value: val,
      nonZero: val !== 0 ? "Y" : "N",
      included: p <= 12 ? "YES" : "NO ← MISSING",
    });
  }

  // Sheet 4: Conclusion
  const s4 = workbook.addWorksheet("Conclusion");
  s4.columns = [
    { header: "Item", key: "item", width: 45 },
    { header: "Value", key: "value", width: 30 },
  ];
  s4.addRow({ item: "Account", value: meta.account });
  s4.addRow({ item: "Company Code", value: COMPANY_CODE });
  s4.addRow({ item: "Fiscal Year", value: FISCAL_YEAR });
  s4.addRow({
    item: "Latest Period with Movement",
    value: meta.latestPeriod > 0 ? String(meta.latestPeriod) : "None",
  });
  s4.addRow({ item: "", value: "" });
  s4.addRow({
    item: "Our Balance (HSLVT + HSL01..HSL12)",
    value: String(meta.calcD),
  });
  s4.addRow({
    item: "FAGLB03 Balance (HSLVT + HSL01..HSL16)",
    value: String(meta.calcE),
  });
  s4.addRow({ item: "Difference", value: String(meta.difference) });
  s4.addRow({ item: "", value: "" });
  s4.addRow({
    item: "VERDICT",
    value: meta.isIdentical ? "YES - Identical" : "NO - Difference Found",
  });
  s4.addRow({ item: "", value: "" });
  if (meta.isIdentical) {
    s4.addRow({
      item: "Explanation",
      value: "Special periods 13-16 are zero. Our formula matches FAGLB03.",
    });
    s4.addRow({
      item: "Risk",
      value: "If year-end adjustments are posted later, a gap will appear.",
    });
    s4.addRow({
      item: "Recommendation",
      value: "Add HSL13-16 for future-proofing.",
    });
  } else {
    s4.addRow({
      item: "Explanation",
      value: "Special periods contain non-zero values not in our formula.",
    });
    s4.addRow({
      item: "Action Required",
      value: "Add HSL13-HSL16 to balance calculation.",
    });
  }
  s4.addRow({ item: "Generated At", value: new Date().toISOString() });

  await workbook.xlsx.writeFile(filePath);
  console.log(`  File: ${filePath}`);
  console.log(`  Sheets: 4`);
}

function fmt(val) {
  if (val === 0) return "0.00";
  return val.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function round2(val) {
  return Math.round(val * 100) / 100;
}

testFAGLB03BalanceFormula();
