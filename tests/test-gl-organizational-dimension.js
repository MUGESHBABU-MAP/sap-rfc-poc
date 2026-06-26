/**
 * Phase 3.18E - GL Organizational Dimension Discovery
 *
 * Run: node tests/test-gl-organizational-dimension.js
 *
 * DIAGNOSTIC ONLY - No production code changes.
 *
 * Determines whether Company Code 1000 can support Plant-level
 * GL reconciliation by discovering which organizational dimensions
 * exist in FAGLFLEXT postings.
 *
 * Key question:
 *   If Company Code 1000 contains multiple plants, is there any
 *   field in GL postings (Plant, Profit Center, Business Area, etc.)
 *   that can isolate plant-specific balances?
 *
 * Generates: output/GL_Organizational_Dimension_Discovery.xlsx
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
const FISCAL_YEAR = process.env.TEST_FISCAL_YEAR || "2026";

const accountMaster = require("../config/inventory-account-master.json");
const configuredAccounts =
  (accountMaster[COMPANY_CODE] || {}).inventoryAccounts || [];

async function testGLOrganizationalDimension() {
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
      "║   Phase 3.18E - GL Organizational Dimension Discovery       ║",
    );
    console.log(
      "║   DIAGNOSTIC ONLY - No production changes                   ║",
    );
    console.log(
      "╚══════════════════════════════════════════════════════════════╝\n",
    );
    console.log(`  Company Code: ${COMPANY_CODE}`);
    console.log(`  Plant: ${PLANT}`);
    console.log(`  Fiscal Year: ${FISCAL_YEAR}`);
    console.log(
      `  Configured Inventory Accounts: ${configuredAccounts.length}\n`,
    );

    const findings = {
      companyCodes: [],
      plants: [],
      plantsSource: "",
      plantsUnderCC: [],
      inventoryAccounts: [],
      glSampleRows: [],
      dimensions: {},
      conclusion: "",
    };

    // ================================================================
    // Step 1: Company Code Master
    // ================================================================
    console.log("Step 1: Reading T001 (Company Code Master)...");
    try {
      const result = await sap.readTable(
        "T001",
        ["BUKRS", "BUTXT", "WAERS", "KTOPL"],
        {},
      );
      findings.companyCodes = parseRows(result);
      console.log(`  ✓ Company Codes: ${findings.companyCodes.length}`);
      const target = findings.companyCodes.find(
        (c) => (c.BUKRS || "").trim() === COMPANY_CODE,
      );
      if (target) {
        console.log(
          `  → ${COMPANY_CODE}: ${(target.BUTXT || "").trim()} | ${(target.WAERS || "").trim()} | CoA: ${(target.KTOPL || "").trim()}`,
        );
      }
    } catch (err) {
      console.log(`  ✗ T001 failed: ${err.message}`);
    }
    console.log("");

    // ================================================================
    // Step 2: Plant Mapping
    // ================================================================
    console.log("Step 2: Reading Plant mapping...");

    // Try T001W first
    let t001wOk = false;
    try {
      const result = await sap.readTable(
        "T001W",
        ["WERKS", "NAME1", "BWKEY", "BUKRS"],
        {},
      );
      const rows = parseRows(result);
      findings.plants = rows.map((r) => ({
        plant: (r.WERKS || "").trim(),
        name: (r.NAME1 || "").trim(),
        valuationArea: (r.BWKEY || "").trim(),
        companyCode: (r.BUKRS || "").trim(),
      }));
      findings.plantsSource = "T001W";
      t001wOk = true;
      console.log(`  ✓ T001W accessible. Plants: ${findings.plants.length}`);
    } catch (err) {
      console.log(`  ✗ T001W failed: ${err.message}`);
      console.log("    Falling back to T001K + MBEW...");
    }

    // Fallback: T001K
    let t001kMapping = [];
    if (!t001wOk) {
      try {
        const result = await sap.readTable("T001K", ["BWKEY", "BUKRS"], {});
        t001kMapping = parseRows(result);
        console.log(`  ✓ T001K accessible. Entries: ${t001kMapping.length}`);
      } catch (err) {
        console.log(`  ✗ T001K failed: ${err.message}`);
      }

      // Derive plants from MARD
      try {
        const result = await sap.readTable("MARD", ["WERKS"], {
          rowCount: 1000,
        });
        const rows = parseRows(result);
        const plantSet = new Set();
        for (const r of rows) plantSet.add((r.WERKS || "").trim());
        const derivedPlants = [...plantSet].sort();

        findings.plants = derivedPlants.map((p) => {
          const t001kEntry = t001kMapping.find(
            (m) => (m.BWKEY || "").trim() === p,
          );
          return {
            plant: p,
            name: "",
            valuationArea: p,
            companyCode: t001kEntry ? (t001kEntry.BUKRS || "").trim() : "?",
          };
        });
        findings.plantsSource = "MARD+T001K (derived)";
        console.log(`  ✓ Derived ${findings.plants.length} plants from MARD`);
      } catch (err) {
        console.log(`  ✗ MARD plant discovery failed: ${err.message}`);
      }
    }

    // Determine plants under target company code
    findings.plantsUnderCC = findings.plants.filter(
      (p) => p.companyCode === COMPANY_CODE,
    );
    console.log(
      `\n  Plants under Company Code ${COMPANY_CODE}: ${findings.plantsUnderCC.length}`,
    );
    for (const p of findings.plantsUnderCC) {
      const marker = p.plant === PLANT ? " ← CURRENT" : "";
      console.log(
        `    ${p.plant}  ${p.name}  (Val: ${p.valuationArea})${marker}`,
      );
    }
    console.log("");

    // ================================================================
    // Step 3: Inventory Plants from MARD
    // ================================================================
    console.log("Step 3: Inventory plants with material counts...");
    try {
      const result = await sap.readTable("MARD", ["WERKS", "MATNR"], {
        rowCount: 5000,
      });
      const rows = parseRows(result);
      const plantCounts = {};
      for (const r of rows) {
        const w = (r.WERKS || "").trim();
        plantCounts[w] = (plantCounts[w] || 0) + 1;
      }
      console.log("  Plant        Material Count (sample)");
      console.log("  " + "-".repeat(35));
      for (const [p, cnt] of Object.entries(plantCounts).sort(
        (a, b) => b[1] - a[1],
      )) {
        const marker = p === PLANT ? " ← CURRENT" : "";
        console.log(`  ${p.padEnd(12)} ${String(cnt).padStart(8)}${marker}`);
      }
    } catch (err) {
      console.log(`  ✗ Failed: ${err.message}`);
    }
    console.log("");

    // ================================================================
    // Step 5: Inventory GL Account Verification
    // ================================================================
    console.log("Step 5: Inventory GL Account Verification (SKB1)...");
    try {
      const result = await sap.readTable("SKB1", ["SAKNR", "BUKRS"], {
        where: [`BUKRS = '${COMPANY_CODE}'`],
      });
      const rows = parseRows(result);
      const skb1Set = new Set(rows.map((r) => (r.SAKNR || "").trim()));

      findings.inventoryAccounts = configuredAccounts.map((acct) => ({
        account: acct,
        existsInSKB1: skb1Set.has(acct),
      }));

      const found = findings.inventoryAccounts.filter(
        (a) => a.existsInSKB1,
      ).length;
      console.log(
        `  ✓ ${found}/${configuredAccounts.length} accounts verified in SKB1`,
      );
    } catch (err) {
      console.log(`  ✗ SKB1 verification failed: ${err.message}`);
      findings.inventoryAccounts = configuredAccounts.map((a) => ({
        account: a,
        existsInSKB1: false,
      }));
    }
    console.log("");

    // ================================================================
    // Step 6: GL Posting Structure Discovery
    // ================================================================
    console.log("Step 6: GL Posting Structure Discovery (FAGLFLEXT)...");
    console.log("  Probing organizational dimension fields...\n");

    // Fields to probe — each tried individually to handle unavailability
    const dimensionFields = [
      { field: "RBUKRS", label: "Company Code" },
      { field: "RACCT", label: "GL Account" },
      { field: "PRCTR", label: "Profit Center" },
      { field: "GSBER", label: "Business Area" },
      { field: "SEGMENT", label: "Segment" },
      { field: "WERKS", label: "Plant" },
      { field: "BWKEY", label: "Valuation Area" },
      { field: "MATNR", label: "Material" },
      { field: "KOSTL", label: "Cost Center" },
      { field: "AUFNR", label: "Order" },
      { field: "PS_PSP_PNR", label: "WBS Element" },
    ];

    const baseWhere = [
      `RRCTY = '0' AND RVERS = '001'`,
      `AND RBUKRS = '${COMPANY_CODE}'`,
      `AND RYEAR = '${FISCAL_YEAR}'`,
    ];

    for (const dim of dimensionFields) {
      try {
        const result = await sap.readTable("FAGLFLEXT", ["RACCT", dim.field], {
          where: baseWhere,
          rowCount: 200,
        });
        const rows = parseRows(result);

        // Filter to inventory accounts only
        const invRows = rows.filter((r) =>
          configuredAccounts.includes((r.RACCT || "").trim()),
        );
        const uniqueValues = new Set();
        for (const r of invRows) {
          const val = (r[dim.field] || "").trim();
          if (val) uniqueValues.add(val);
        }

        findings.dimensions[dim.field] = {
          label: dim.label,
          status: "Available",
          uniqueValues: [...uniqueValues].sort(),
          totalRows: invRows.length,
          hasValues: uniqueValues.size > 0,
          blank: uniqueValues.size === 0,
        };

        const valPreview =
          uniqueValues.size > 0
            ? [...uniqueValues].slice(0, 5).join(", ") +
              (uniqueValues.size > 5 ? ` (+${uniqueValues.size - 5} more)` : "")
            : "(blank)";
        console.log(
          `  ${dim.field.padEnd(12)} ${dim.label.padEnd(18)} ${uniqueValues.size > 0 ? "Present" : "Blank".padEnd(10)}  Values: ${valPreview}`,
        );
      } catch (err) {
        findings.dimensions[dim.field] = {
          label: dim.label,
          status: "Unavailable",
          uniqueValues: [],
          totalRows: 0,
          hasValues: false,
          blank: true,
          error: err.message,
        };
        console.log(
          `  ${dim.field.padEnd(12)} ${dim.label.padEnd(18)} Unavailable   Error: ${err.message.substring(0, 40)}`,
        );
      }
    }
    console.log("");

    // Also capture sample rows for Excel export
    try {
      const sampleFields = ["RBUKRS", "RACCT", "RYEAR", "RPMAX", "DRCRK"];
      const result = await sap.readTable("FAGLFLEXT", sampleFields, {
        where: baseWhere,
        rowCount: 100,
      });
      const rows = parseRows(result);
      findings.glSampleRows = rows.filter((r) =>
        configuredAccounts.includes((r.RACCT || "").trim()),
      );
    } catch (err) {
      console.log(`  GL sample read failed: ${err.message}`);
    }

    // ================================================================
    // Step 9: Determine Isolation Strategy
    // ================================================================
    console.log(
      "══════════════════════════════════════════════════════════════",
    );
    console.log("  ORGANIZATIONAL DIMENSION ANALYSIS");
    console.log(
      "══════════════════════════════════════════════════════════════\n",
    );

    const multiPlant = findings.plantsUnderCC.length > 1;
    const plantDim = findings.dimensions["WERKS"];
    const prctrDim = findings.dimensions["PRCTR"];
    const gsberDim = findings.dimensions["GSBER"];
    const segmentDim = findings.dimensions["SEGMENT"];

    console.log(
      `  Multiple plants under CC ${COMPANY_CODE}: ${multiPlant ? "YES (" + findings.plantsUnderCC.length + ")" : "NO (single plant)"}`,
    );
    console.log(
      `  Plant field (WERKS) in GL:      ${plantDim ? (plantDim.hasValues ? "PRESENT (" + plantDim.uniqueValues.length + " values)" : plantDim.status === "Unavailable" ? "UNAVAILABLE" : "BLANK") : "NOT PROBED"}`,
    );
    console.log(
      `  Profit Center (PRCTR) in GL:    ${prctrDim ? (prctrDim.hasValues ? "PRESENT (" + prctrDim.uniqueValues.length + " values)" : prctrDim.status === "Unavailable" ? "UNAVAILABLE" : "BLANK") : "NOT PROBED"}`,
    );
    console.log(
      `  Business Area (GSBER) in GL:    ${gsberDim ? (gsberDim.hasValues ? "PRESENT (" + gsberDim.uniqueValues.length + " values)" : gsberDim.status === "Unavailable" ? "UNAVAILABLE" : "BLANK") : "NOT PROBED"}`,
    );
    console.log(
      `  Segment (SEGMENT) in GL:        ${segmentDim ? (segmentDim.hasValues ? "PRESENT (" + segmentDim.uniqueValues.length + " values)" : segmentDim.status === "Unavailable" ? "UNAVAILABLE" : "BLANK") : "NOT PROBED"}`,
    );
    console.log("");

    // ================================================================
    // Executive Conclusion
    // ================================================================
    console.log(
      "══════════════════════════════════════════════════════════════",
    );
    console.log("  EXECUTIVE CONCLUSION");
    console.log(
      "══════════════════════════════════════════════════════════════\n",
    );

    let conclusion = "";

    if (!multiPlant) {
      // CASE 1
      conclusion = "CASE_1_SINGLE_PLANT";
      console.log("  CASE 1: Company Code contains ONE Plant only.\n");
      console.log("  Current architecture is VALID.");
      console.log(
        `  Plant ${PLANT} is the only plant under Company Code ${COMPANY_CODE}.`,
      );
      console.log("  No isolation dimension needed.");
    } else if (plantDim && plantDim.hasValues) {
      // CASE 2
      conclusion = "CASE_2_PLANT_IN_GL";
      console.log("  CASE 2: Multiple Plants, GL contains Plant field.\n");
      console.log(
        `  Company Code ${COMPANY_CODE} contains ${findings.plantsUnderCC.length} plants.`,
      );
      console.log("  GL postings contain WERKS (Plant).");
      console.log("  Plant-level reconciliation IS POSSIBLE.");
      console.log(`  Filter GL by WERKS = '${PLANT}' to isolate.`);
      console.log(`  Plant values found: ${plantDim.uniqueValues.join(", ")}`);
    } else if (prctrDim && prctrDim.hasValues) {
      // CASE 3
      conclusion = "CASE_3_PROFIT_CENTER";
      console.log("  CASE 3: Multiple Plants, GL contains Profit Center.\n");
      console.log(
        `  Company Code ${COMPANY_CODE} contains ${findings.plantsUnderCC.length} plants.`,
      );
      console.log("  GL postings contain PRCTR (Profit Center).");
      console.log("  Profit Center should be used for plant isolation.");
      console.log(
        `  Profit Center values: ${prctrDim.uniqueValues.slice(0, 10).join(", ")}`,
      );
      console.log(
        "\n  ACTION: Determine Profit Center → Plant mapping with customer.",
      );
    } else if (gsberDim && gsberDim.hasValues) {
      // CASE 4
      conclusion = "CASE_4_BUSINESS_AREA";
      console.log("  CASE 4: Multiple Plants, GL contains Business Area.\n");
      console.log(
        `  Company Code ${COMPANY_CODE} contains ${findings.plantsUnderCC.length} plants.`,
      );
      console.log("  GL postings contain GSBER (Business Area).");
      console.log("  Business Area should be used for plant isolation.");
      console.log(
        `  Business Area values: ${gsberDim.uniqueValues.join(", ")}`,
      );
      console.log(
        "\n  ACTION: Determine Business Area → Plant mapping with customer.",
      );
    } else {
      // CASE 5
      conclusion = "CASE_5_NO_DIMENSION";
      console.log(
        "  CASE 5: Multiple Plants, NO organizational dimension available.\n",
      );
      console.log(
        `  Company Code ${COMPANY_CODE} contains ${findings.plantsUnderCC.length} plants.`,
      );
      console.log("  GL postings contain NO Plant dimension.");
      console.log("  GL balances are AGGREGATED at Company Code level.");
      console.log("  Plant-level reconciliation is IMPOSSIBLE.");
      console.log(
        "  Only Company Code reconciliation is mathematically correct.",
      );
    }

    findings.conclusion = conclusion;
    console.log("");

    // ================================================================
    // Summary
    // ================================================================
    console.log(
      "══════════════════════════════════════════════════════════════",
    );
    console.log("  SUMMARY");
    console.log(
      "══════════════════════════════════════════════════════════════\n",
    );
    console.log(`  Company Code:          ${COMPANY_CODE}`);
    console.log(
      `  Plants:                ${findings.plantsUnderCC.map((p) => p.plant).join(", ") || PLANT}`,
    );
    console.log(`  Inventory Accounts:    ${configuredAccounts.length}`);
    console.log(`  GL Sample Rows:        ${findings.glSampleRows.length}`);
    console.log(
      `  Plant Field:           ${plantDim ? (plantDim.hasValues ? "Present" : plantDim.status) : "?"}`,
    );
    console.log(
      `  Profit Center:         ${prctrDim ? (prctrDim.hasValues ? "Present" : prctrDim.status) : "?"}`,
    );
    console.log(
      `  Business Area:         ${gsberDim ? (gsberDim.hasValues ? "Present" : gsberDim.status) : "?"}`,
    );
    console.log(`  Conclusion:            ${conclusion}`);
    console.log("");

    // ================================================================
    // Generate Workbook
    // ================================================================
    console.log("Generating GL_Organizational_Dimension_Discovery.xlsx...");
    await generateWorkbook(findings);

    await sap.disconnect();
    console.log("\nDone.");
  } catch (err) {
    console.error("ERROR:", err.message || err);
    if (err.stack) console.error(err.stack);
  }
}

async function generateWorkbook(findings) {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const filePath = path.join(
    OUTPUT_DIR,
    "GL_Organizational_Dimension_Discovery.xlsx",
  );
  const workbook = new ExcelJS.Workbook();

  // Sheet 1: Company Codes
  const s1 = workbook.addWorksheet("Company Codes");
  s1.columns = [
    { header: "Company Code", key: "cc", width: 14 },
    { header: "Description", key: "desc", width: 35 },
    { header: "Currency", key: "curr", width: 10 },
    { header: "Chart of Accounts", key: "coa", width: 18 },
  ];
  for (const cc of findings.companyCodes) {
    s1.addRow({
      cc: (cc.BUKRS || "").trim(),
      desc: (cc.BUTXT || "").trim(),
      curr: (cc.WAERS || "").trim(),
      coa: (cc.KTOPL || "").trim(),
    });
  }

  // Sheet 2: Plants
  const s2 = workbook.addWorksheet("Plants");
  s2.columns = [
    { header: "Plant", key: "plant", width: 10 },
    { header: "Plant Name", key: "name", width: 35 },
    { header: "Company Code", key: "cc", width: 14 },
    { header: "Valuation Area", key: "va", width: 14 },
    { header: "Source", key: "source", width: 18 },
  ];
  for (const p of findings.plants) {
    s2.addRow({
      plant: p.plant,
      name: p.name,
      cc: p.companyCode,
      va: p.valuationArea,
      source: findings.plantsSource,
    });
  }

  // Sheet 3: CompanyCode-Plant Mapping
  const s3 = workbook.addWorksheet("CompanyCode-Plant Mapping");
  s3.columns = [
    { header: "Company Code", key: "cc", width: 14 },
    { header: "Plant", key: "plant", width: 10 },
    { header: "Plant Name", key: "name", width: 35 },
    { header: "Valuation Area", key: "va", width: 14 },
  ];
  for (const p of findings.plantsUnderCC) {
    s3.addRow({
      cc: COMPANY_CODE,
      plant: p.plant,
      name: p.name,
      va: p.valuationArea,
    });
  }

  // Sheet 4: Inventory Accounts
  const s4 = workbook.addWorksheet("Inventory Accounts");
  s4.columns = [
    { header: "Account", key: "account", width: 16 },
    { header: "Exists in SKB1", key: "exists", width: 14 },
  ];
  for (const a of findings.inventoryAccounts) {
    s4.addRow({ account: a.account, exists: a.existsInSKB1 ? "Y" : "N" });
  }

  // Sheet 5: GL Posting Sample
  const s5 = workbook.addWorksheet("GL Posting Sample");
  s5.columns = [
    { header: "Company Code", key: "cc", width: 14 },
    { header: "GL Account", key: "acct", width: 16 },
    { header: "Fiscal Year", key: "year", width: 10 },
    { header: "Period", key: "period", width: 8 },
    { header: "D/C", key: "dc", width: 5 },
  ];
  for (const r of findings.glSampleRows) {
    s5.addRow({
      cc: (r.RBUKRS || "").trim(),
      acct: (r.RACCT || "").trim(),
      year: (r.RYEAR || "").trim(),
      period: (r.RPMAX || "").trim(),
      dc: (r.DRCRK || "").trim(),
    });
  }

  // Sheet 6: Organizational Dimensions
  const s6 = workbook.addWorksheet("Organizational Dimensions");
  s6.columns = [
    { header: "Field", key: "field", width: 14 },
    { header: "Label", key: "label", width: 20 },
    { header: "Status", key: "status", width: 14 },
    { header: "Has Values", key: "hasValues", width: 12 },
    { header: "Unique Count", key: "count", width: 12 },
    { header: "Values (sample)", key: "values", width: 50 },
  ];
  for (const [field, dim] of Object.entries(findings.dimensions)) {
    s6.addRow({
      field,
      label: dim.label,
      status: dim.status,
      hasValues: dim.hasValues ? "YES" : "NO",
      count: dim.uniqueValues.length,
      values: dim.uniqueValues.slice(0, 10).join(", "),
    });
  }

  // Sheet 7: Executive Conclusion
  const s7 = workbook.addWorksheet("Executive Conclusion");
  s7.columns = [
    { header: "Item", key: "item", width: 40 },
    { header: "Value", key: "value", width: 50 },
  ];
  const conclusionRows = [
    { item: "Company Code", value: COMPANY_CODE },
    { item: "Plant (current)", value: PLANT },
    { item: "Fiscal Year", value: FISCAL_YEAR },
    {
      item: "Plants Under Company Code",
      value: String(findings.plantsUnderCC.length),
    },
    {
      item: "Plant List",
      value: findings.plantsUnderCC.map((p) => p.plant).join(", "),
    },
    { item: "Inventory Accounts", value: String(configuredAccounts.length) },
    { item: "Plants Source", value: findings.plantsSource },
    { item: "", value: "" },
    { item: "--- Dimension Availability ---", value: "" },
  ];
  for (const [field, dim] of Object.entries(findings.dimensions)) {
    if (["WERKS", "PRCTR", "GSBER", "SEGMENT", "BWKEY"].includes(field)) {
      conclusionRows.push({
        item: `${dim.label} (${field})`,
        value: dim.hasValues
          ? `Present (${dim.uniqueValues.length} values)`
          : dim.status === "Unavailable"
            ? "Unavailable"
            : "Blank",
      });
    }
  }
  conclusionRows.push({ item: "", value: "" });
  conclusionRows.push({ item: "--- Conclusion ---", value: "" });
  conclusionRows.push({ item: "Conclusion Code", value: findings.conclusion });

  const conclusionText = {
    CASE_1_SINGLE_PLANT:
      "Single plant. Current architecture is valid. No changes needed.",
    CASE_2_PLANT_IN_GL:
      "Multiple plants. GL contains Plant field. Plant reconciliation is possible.",
    CASE_3_PROFIT_CENTER:
      "Multiple plants. Use Profit Center for plant isolation.",
    CASE_4_BUSINESS_AREA:
      "Multiple plants. Use Business Area for plant isolation.",
    CASE_5_NO_DIMENSION:
      "Multiple plants. No dimension available. Only Company Code reconciliation is valid.",
  };
  conclusionRows.push({
    item: "Assessment",
    value: conclusionText[findings.conclusion] || "Unknown",
  });
  conclusionRows.push({
    item: "Generated At",
    value: new Date().toISOString(),
  });

  for (const r of conclusionRows) {
    s7.addRow(r);
  }

  await workbook.xlsx.writeFile(filePath);
  const fileSize = fs.statSync(filePath).size;
  console.log(`  File: ${filePath}`);
  console.log(`  Size: ${(fileSize / 1024).toFixed(1)} KB`);
  console.log(`  Sheets: 7`);
}

testGLOrganizationalDimension();
