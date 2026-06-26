/**
 * Phase 3.18C - Company Code ↔ Plant Relationship Discovery
 *
 * Run: node tests/test-companycode-plant-mapping.js
 *
 * DIAGNOSTIC ONLY - No production code changes.
 *
 * Reads SAP organizational structure to verify:
 *   - How many plants exist under Company Code 1000
 *   - Whether current reconciliation architecture (Plant vs Company Code) is valid
 *
 * SAP Tables:
 *   T001W - Plant Master (WERKS, NAME1, BWKEY, BUKRS)
 *   T001  - Company Code Master (BUKRS, BUTXT, WAERS, KTOPL)
 *
 * Generates: output/CompanyCode_Plant_Analysis.xlsx
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
const PLANT = process.env.TEST_PLANT || "1000";

const accountMaster = require("../config/inventory-account-master.json");

async function testCompanyCodePlantMapping() {
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
      "║   Phase 3.18C - Company Code ↔ Plant Discovery              ║",
    );
    console.log(
      "║   DIAGNOSTIC ONLY - No production changes                   ║",
    );
    console.log(
      "╚══════════════════════════════════════════════════════════════╝\n",
    );

    // ================================================================
    // Step 1: Read T001 (Company Code Master)
    // ================================================================
    console.log("Step 1: Reading T001 (Company Code Master)...");
    let companyCodes = [];
    try {
      const t001Result = await sap.readTable(
        "T001",
        ["BUKRS", "BUTXT", "WAERS", "KTOPL"],
        {},
      );
      companyCodes = parseRows(t001Result);
      console.log(`  Company Codes found: ${companyCodes.length}\n`);
    } catch (err) {
      console.error(`  [T001] Read failed: ${err.message}\n`);
    }

    // ================================================================
    // Step 2: Read T001W (Plant Master)
    // ================================================================
    console.log("Step 2: Reading T001W (Plant Master)...");
    let plants = [];
    try {
      const t001wResult = await sap.readTable(
        "T001W",
        ["WERKS", "NAME1", "BWKEY", "BUKRS"],
        {},
      );
      plants = parseRows(t001wResult);
      console.log(`  Plants found: ${plants.length}\n`);
    } catch (err) {
      console.error(`  [T001W] Read failed: ${err.message}\n`);
    }

    // ================================================================
    // Step 3: Build Relationships
    // ================================================================
    console.log(
      "══════════════════════════════════════════════════════════════",
    );
    console.log("  COMPANY CODE SUMMARY");
    console.log(
      "══════════════════════════════════════════════════════════════\n",
    );

    // Company Code → Plants mapping
    const ccToPlants = {};
    for (let i = 0; i < plants.length; i++) {
      const p = plants[i];
      const cc = (p.BUKRS || "").trim();
      if (!cc) continue;
      if (!ccToPlants[cc]) ccToPlants[cc] = [];
      ccToPlants[cc].push({
        plant: (p.WERKS || "").trim(),
        name: (p.NAME1 || "").trim(),
        valuationArea: (p.BWKEY || "").trim(),
      });
    }

    // Print company code details
    for (let i = 0; i < companyCodes.length; i++) {
      const cc = companyCodes[i];
      const bukrs = (cc.BUKRS || "").trim();
      const plantsUnder = ccToPlants[bukrs] || [];
      console.log(`  Company Code: ${bukrs}`);
      console.log(`    Description: ${(cc.BUTXT || "").trim()}`);
      console.log(`    Currency: ${(cc.WAERS || "").trim()}`);
      console.log(`    Chart of Accounts: ${(cc.KTOPL || "").trim()}`);
      console.log(`    Plant Count: ${plantsUnder.length}`);
      if (plantsUnder.length > 0) {
        for (let p = 0; p < plantsUnder.length; p++) {
          console.log(
            `      - ${plantsUnder[p].plant} (${plantsUnder[p].name})`,
          );
        }
      }
      console.log("");
    }

    // ================================================================
    // Step 4: Focus on Target Company Code
    // ================================================================
    console.log(
      "══════════════════════════════════════════════════════════════",
    );
    console.log(`  TARGET: Company Code ${COMPANY_CODE}`);
    console.log(
      "══════════════════════════════════════════════════════════════\n",
    );

    const targetPlants = ccToPlants[COMPANY_CODE] || [];
    const targetCC = companyCodes.find(
      (c) => (c.BUKRS || "").trim() === COMPANY_CODE,
    );
    const chartOfAccounts = targetCC ? (targetCC.KTOPL || "").trim() : "?";
    const currency = targetCC ? (targetCC.WAERS || "").trim() : "?";
    const ccDescription = targetCC ? (targetCC.BUTXT || "").trim() : "?";

    console.log(`  Description: ${ccDescription}`);
    console.log(`  Currency: ${currency}`);
    console.log(`  Chart of Accounts: ${chartOfAccounts}`);
    console.log(
      `  Plants under Company Code ${COMPANY_CODE}: ${targetPlants.length}`,
    );
    console.log("");

    if (targetPlants.length > 0) {
      console.log("  Company Code → Plants:");
      for (let i = 0; i < targetPlants.length; i++) {
        const p = targetPlants[i];
        const marker = p.plant === PLANT ? " ← CURRENT" : "";
        console.log(
          `    ${p.plant}  ${p.name}  (Valuation: ${p.valuationArea})${marker}`,
        );
      }
      console.log("");
    }

    // Plant → Company Code
    console.log("  Plant → Company Code:");
    const targetPlantEntry = plants.find(
      (p) => (p.WERKS || "").trim() === PLANT,
    );
    if (targetPlantEntry) {
      console.log(
        `    Plant ${PLANT} → Company Code ${(targetPlantEntry.BUKRS || "").trim()}`,
      );
    } else {
      console.log(`    Plant ${PLANT} → NOT FOUND in T001W`);
    }
    console.log("");

    // ================================================================
    // Step 5: Risk Assessment
    // ================================================================
    console.log(
      "══════════════════════════════════════════════════════════════",
    );
    console.log("  RISK ASSESSMENT");
    console.log(
      "══════════════════════════════════════════════════════════════\n",
    );

    if (targetPlants.length === 1) {
      console.log("  ✓ SAFE");
      console.log(
        `  Inventory for Plant ${PLANT} can reasonably be reconciled against`,
      );
      console.log(`  Company Code ${COMPANY_CODE} GL balances.`);
      console.log(`  Only one plant under this Company Code.`);
    } else if (targetPlants.length > 1) {
      console.log("  ⚠ WARNING");
      console.log(
        `  Company Code ${COMPANY_CODE} contains ${targetPlants.length} plants.`,
      );
      console.log(`  Inventory extraction currently uses only Plant ${PLANT}.`);
      console.log(`  GL balances may contain postings from multiple plants.`);
      console.log(`  Business confirmation required before production use.`);
    } else {
      console.log("  ⚠ UNKNOWN");
      console.log(`  No plants found under Company Code ${COMPANY_CODE}.`);
      console.log("  T001W may have restricted authorization.");
    }
    console.log("");

    // ================================================================
    // Step 6: Inventory Account Range Verification
    // ================================================================
    console.log(
      "══════════════════════════════════════════════════════════════",
    );
    console.log("  INVENTORY ACCOUNT VERIFICATION");
    console.log(
      "══════════════════════════════════════════════════════════════\n",
    );

    const configuredAccounts =
      (accountMaster[COMPANY_CODE] || {}).inventoryAccounts || [];
    console.log(`  Chart of Accounts: ${chartOfAccounts}`);
    console.log(
      `  Configured Inventory Accounts: ${configuredAccounts.length}`,
    );

    if (configuredAccounts.length > 0) {
      const sorted = [...configuredAccounts].sort();
      const lowest = sorted[0];
      const highest = sorted[sorted.length - 1];
      console.log(`  Lowest Inventory Account: ${lowest}`);
      console.log(`  Highest Inventory Account: ${highest}`);
      console.log(`  Account Range: ${lowest} → ${highest}`);
      console.log("");
      console.log("  Configured Accounts:");
      for (let i = 0; i < configuredAccounts.length; i++) {
        console.log(`    ${configuredAccounts[i]}`);
      }
    }
    console.log("");

    // ================================================================
    // Step 7: Executive Conclusion
    // ================================================================
    console.log(
      "══════════════════════════════════════════════════════════════",
    );
    console.log("  ARCHITECTURE VALIDATION");
    console.log(
      "══════════════════════════════════════════════════════════════\n",
    );

    console.log(`  Inventory Scope`);
    console.log(`    Plant: ${PLANT}`);
    console.log(`  GL Scope`);
    console.log(`    Company Code: ${COMPANY_CODE}`);
    console.log(`  Plants under Company Code: ${targetPlants.length}`);
    console.log(`  Chart of Accounts: ${chartOfAccounts}`);
    console.log(`  Inventory Accounts Found: ${configuredAccounts.length}`);
    console.log("");

    if (targetPlants.length === 1) {
      console.log("  CONCLUSION:");
      console.log("  Current architecture is VALID.");
      console.log(
        `  Plant ${PLANT} is the only inventory plant within Company Code ${COMPANY_CODE}.`,
      );
      console.log(
        "  Current reconciliation approach (Plant Inventory vs Company Code GL) is appropriate.",
      );
      console.log("  No architectural changes required.");
    } else if (targetPlants.length > 1) {
      console.log("  CONCLUSION:");
      console.log("  Current architecture requires REVIEW.");
      console.log("  Reason:");
      console.log(
        `    Company Code ${COMPANY_CODE} contains ${targetPlants.length} plants.`,
      );
      console.log(`    Inventory extraction only considers Plant ${PLANT}.`);
      console.log("    GL balances may represent multiple plants.");
      console.log("    Business clarification required.");
    } else {
      console.log("  CONCLUSION:");
      console.log(
        "  Unable to determine. T001W returned no plants for this Company Code.",
      );
    }
    console.log("");

    // ================================================================
    // Step 8: Generate Workbook
    // ================================================================
    console.log("Generating CompanyCode_Plant_Analysis.xlsx...");
    await generateWorkbook(companyCodes, plants, ccToPlants, targetPlants, {
      companyCode: COMPANY_CODE,
      plant: PLANT,
      chartOfAccounts,
      currency,
      ccDescription,
      configuredAccounts,
    });

    await sap.disconnect();
    console.log("\nDone.");
  } catch (err) {
    console.error("ERROR:", err.message || err);
    if (err.stack) console.error(err.stack);
  }
}

async function generateWorkbook(
  companyCodes,
  plants,
  ccToPlants,
  targetPlants,
  meta,
) {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const filePath = path.join(OUTPUT_DIR, "CompanyCode_Plant_Analysis.xlsx");
  const workbook = new ExcelJS.Workbook();

  // Sheet 1: Company Codes
  const sheet1 = workbook.addWorksheet("Company Codes");
  sheet1.columns = [
    { header: "Company Code", key: "cc", width: 14 },
    { header: "Description", key: "desc", width: 35 },
    { header: "Currency", key: "curr", width: 10 },
    { header: "Chart of Accounts", key: "coa", width: 18 },
    { header: "Plant Count", key: "plantCount", width: 12 },
  ];
  for (let i = 0; i < companyCodes.length; i++) {
    const cc = companyCodes[i];
    const bukrs = (cc.BUKRS || "").trim();
    sheet1.addRow({
      cc: bukrs,
      desc: (cc.BUTXT || "").trim(),
      curr: (cc.WAERS || "").trim(),
      coa: (cc.KTOPL || "").trim(),
      plantCount: (ccToPlants[bukrs] || []).length,
    });
  }

  // Sheet 2: Plants
  const sheet2 = workbook.addWorksheet("Plants");
  sheet2.columns = [
    { header: "Plant", key: "plant", width: 10 },
    { header: "Plant Name", key: "name", width: 35 },
    { header: "Company Code", key: "cc", width: 14 },
    { header: "Valuation Area", key: "val", width: 14 },
  ];
  for (let i = 0; i < plants.length; i++) {
    const p = plants[i];
    sheet2.addRow({
      plant: (p.WERKS || "").trim(),
      name: (p.NAME1 || "").trim(),
      cc: (p.BUKRS || "").trim(),
      val: (p.BWKEY || "").trim(),
    });
  }

  // Sheet 3: Architecture Assessment
  const sheet3 = workbook.addWorksheet("Architecture Assessment");
  sheet3.columns = [
    { header: "Item", key: "item", width: 40 },
    { header: "Value", key: "value", width: 40 },
  ];
  const assessmentRows = [
    { item: "--- Current Architecture ---", value: "" },
    { item: "Inventory Scope", value: `Plant ${meta.plant}` },
    { item: "GL Scope", value: `Company Code ${meta.companyCode}` },
    { item: "", value: "" },
    { item: "--- Detected Relationships ---", value: "" },
    { item: "Company Code", value: meta.companyCode },
    { item: "Description", value: meta.ccDescription },
    { item: "Currency", value: meta.currency },
    { item: "Chart of Accounts", value: meta.chartOfAccounts },
    { item: "Plants under Company Code", value: String(targetPlants.length) },
    { item: "", value: "" },
    { item: "--- Plants ---", value: "" },
  ];
  for (let i = 0; i < targetPlants.length; i++) {
    assessmentRows.push({
      item: `Plant ${targetPlants[i].plant}`,
      value: targetPlants[i].name,
    });
  }
  assessmentRows.push({ item: "", value: "" });
  assessmentRows.push({ item: "--- Inventory Accounts ---", value: "" });
  assessmentRows.push({
    item: "Configured Count",
    value: String(meta.configuredAccounts.length),
  });
  if (meta.configuredAccounts.length > 0) {
    const sorted = [...meta.configuredAccounts].sort();
    assessmentRows.push({ item: "Lowest Account", value: sorted[0] });
    assessmentRows.push({
      item: "Highest Account",
      value: sorted[sorted.length - 1],
    });
  }
  assessmentRows.push({ item: "", value: "" });
  assessmentRows.push({ item: "--- Verdict ---", value: "" });
  if (targetPlants.length === 1) {
    assessmentRows.push({ item: "Status", value: "VALID" });
    assessmentRows.push({
      item: "Recommendation",
      value: "No architectural changes required",
    });
  } else if (targetPlants.length > 1) {
    assessmentRows.push({ item: "Status", value: "REQUIRES REVIEW" });
    assessmentRows.push({
      item: "Warning",
      value: `${targetPlants.length} plants found under CC ${meta.companyCode}`,
    });
    assessmentRows.push({
      item: "Recommendation",
      value: "Business clarification required",
    });
  } else {
    assessmentRows.push({ item: "Status", value: "UNKNOWN" });
    assessmentRows.push({
      item: "Recommendation",
      value: "T001W returned no plants",
    });
  }

  for (let i = 0; i < assessmentRows.length; i++) {
    sheet3.addRow(assessmentRows[i]);
  }

  await workbook.xlsx.writeFile(filePath);
  const fileSize = fs.statSync(filePath).size;
  console.log(`  File: ${filePath}`);
  console.log(`  Size: ${(fileSize / 1024).toFixed(1)} KB`);
  console.log(`  Sheets: 3 (Company Codes, Plants, Architecture Assessment)`);
}

testCompanyCodePlantMapping();
