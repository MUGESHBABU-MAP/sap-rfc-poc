/**
 * Phase 3.18D - Organizational Mapping Validation
 *
 * Run: node tests/test-organizational-mapping.js
 *
 * DIAGNOSTIC ONLY - No production code changes.
 *
 * Determines the relationship between Plant, Valuation Area,
 * Company Code, and Inventory Accounts using whichever standard
 * SAP tables are accessible through RFC.
 *
 * Strategy:
 *   1. T001  - Company Code Master (should always work)
 *   2. T001W - Plant Master (may fail due to RFC auth)
 *   3. MARD  - Derive plants from actual inventory data
 *   4. MBEW  - Derive valuation areas from actual valuation data
 *   5. T001K - Valuation Area → Company Code mapping
 *   6. SKB1  - Verify configured accounts exist
 *
 * Never fails because one table is inaccessible.
 * Produces as much information as possible.
 *
 * Generates: output/Organizational_Mapping.xlsx
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

async function testOrganizationalMapping() {
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
      "║   Phase 3.18D - Organizational Mapping Validation           ║",
    );
    console.log(
      "║   DIAGNOSTIC ONLY - No production changes                   ║",
    );
    console.log(
      "╚══════════════════════════════════════════════════════════════╝\n",
    );

    const findings = {
      companyCodes: [],
      t001wPlants: [],
      t001wAccessible: false,
      inventoryPlants: [],
      valuationAreas: [],
      t001kMapping: [],
      t001kAccessible: false,
      accountVerification: [],
    };

    // ================================================================
    // Step 1: Read T001 (Company Codes)
    // ================================================================
    console.log("Step 1: Reading T001 (Company Code Master)...");
    try {
      const result = await sap.readTable(
        "T001",
        ["BUKRS", "BUTXT", "WAERS", "KTOPL"],
        {},
      );
      findings.companyCodes = parseRows(result);
      console.log(`  ✓ Company Codes found: ${findings.companyCodes.length}\n`);

      // Print details
      for (let i = 0; i < findings.companyCodes.length; i++) {
        const cc = findings.companyCodes[i];
        console.log(
          `    ${(cc.BUKRS || "").trim().padEnd(8)} ${(cc.BUTXT || "").trim().padEnd(30)} ${(cc.WAERS || "").trim().padEnd(6)} CoA: ${(cc.KTOPL || "").trim()}`,
        );
      }
      console.log("");
    } catch (err) {
      console.log(`  ✗ T001 read failed: ${err.message}\n`);
    }

    // ================================================================
    // Step 2: Attempt T001W (Plant Master)
    // ================================================================
    console.log("Step 2: Attempting T001W (Plant Master)...");
    try {
      const result = await sap.readTable(
        "T001W",
        ["WERKS", "NAME1", "BWKEY", "BUKRS"],
        {},
      );
      findings.t001wPlants = parseRows(result);
      findings.t001wAccessible = true;
      console.log(
        `  ✓ T001W accessible. Plants found: ${findings.t001wPlants.length}\n`,
      );

      for (let i = 0; i < findings.t001wPlants.length; i++) {
        const p = findings.t001wPlants[i];
        console.log(
          `    ${(p.WERKS || "").trim().padEnd(8)} ${(p.NAME1 || "").trim().padEnd(30)} CC: ${(p.BUKRS || "").trim().padEnd(6)} Val: ${(p.BWKEY || "").trim()}`,
        );
      }
      console.log("");
    } catch (err) {
      console.log(`  ✗ T001W not accessible through RFC.`);
      console.log(`    Continuing with alternate discovery.\n`);
      // Detailed error diagnostic
      console.log("    --- T001W Error Diagnostic ---");
      console.log(`    Message: ${err.message}`);
      if (err.code) console.log(`    Code: ${err.code}`);
      if (err.key) console.log(`    Key: ${err.key}`);
      if (err.abapMsgClass)
        console.log(`    ABAP Message Class: ${err.abapMsgClass}`);
      if (err.abapMsgNumber)
        console.log(`    ABAP Message Number: ${err.abapMsgNumber}`);
      if (err.abapMsgV1) console.log(`    ABAP Msg V1: ${err.abapMsgV1}`);
      if (err.abapMsgV2) console.log(`    ABAP Msg V2: ${err.abapMsgV2}`);
      // Log full error object for maximum diagnostic info
      try {
        const errKeys = Object.keys(err).filter((k) => k !== "stack");
        if (errKeys.length > 0) {
          console.log("    Full error properties:");
          for (let k = 0; k < errKeys.length; k++) {
            const val = err[errKeys[k]];
            if (val !== undefined && val !== null && val !== "") {
              console.log(
                `      ${errKeys[k]}: ${typeof val === "object" ? JSON.stringify(val) : val}`,
              );
            }
          }
        }
      } catch (e) {
        /* ignore serialization errors */
      }
      console.log("    --- End Error Diagnostic ---\n");
    }

    // ================================================================
    // Step 3: Derive Plants from MARD (Inventory Data)
    // ================================================================
    console.log("Step 3: Reading MARD (deriving inventory plants)...");
    try {
      const result = await sap.readTable("MARD", ["WERKS"], {
        where: PLANT ? [`WERKS = '${PLANT}'`] : [],
        rowCount: 1,
      });
      const mardRows = parseRows(result);
      // Get distinct plants - read without plant filter to find all
      const resultAll = await sap.readTable("MARD", ["WERKS"], {
        rowCount: 500,
      });
      const mardAllRows = parseRows(resultAll);
      const plantSet = new Set();
      for (let i = 0; i < mardAllRows.length; i++) {
        plantSet.add((mardAllRows[i].WERKS || "").trim());
      }
      findings.inventoryPlants = [...plantSet].sort();
      console.log(
        `  ✓ Plants found in MARD: ${findings.inventoryPlants.length}\n`,
      );
      console.log("    Plants found in Inventory:");
      for (let i = 0; i < findings.inventoryPlants.length; i++) {
        const marker =
          findings.inventoryPlants[i] === PLANT ? " ← CURRENT" : "";
        console.log(`      ${findings.inventoryPlants[i]}${marker}`);
      }
      console.log(`    Total Plants: ${findings.inventoryPlants.length}\n`);
    } catch (err) {
      console.log(`  ✗ MARD plant discovery failed: ${err.message}\n`);
    }

    // ================================================================
    // Step 4: Derive Valuation Areas from MBEW
    // ================================================================
    console.log("Step 4: Reading MBEW (deriving valuation areas)...");
    try {
      const result = await sap.readTable("MBEW", ["BWKEY"], { rowCount: 500 });
      const mbewRows = parseRows(result);
      const bwkeySet = new Set();
      for (let i = 0; i < mbewRows.length; i++) {
        bwkeySet.add((mbewRows[i].BWKEY || "").trim());
      }
      findings.valuationAreas = [...bwkeySet].sort();
      console.log(
        `  ✓ Valuation Areas found in MBEW: ${findings.valuationAreas.length}\n`,
      );
      console.log("    Valuation Areas:");
      for (let i = 0; i < findings.valuationAreas.length; i++) {
        console.log(`      ${findings.valuationAreas[i]}`);
      }
      console.log("");
    } catch (err) {
      console.log(`  ✗ MBEW valuation area discovery failed: ${err.message}\n`);
    }

    // ================================================================
    // Step 5: Attempt T001K (Valuation Area → Company Code)
    // ================================================================
    console.log("Step 5: Attempting T001K (Valuation Area → Company Code)...");
    try {
      const result = await sap.readTable("T001K", ["BWKEY", "BUKRS"], {});
      findings.t001kMapping = parseRows(result);
      findings.t001kAccessible = true;
      console.log(
        `  ✓ T001K accessible. Entries: ${findings.t001kMapping.length}\n`,
      );

      console.log("    Valuation Area → Company Code:");
      for (let i = 0; i < findings.t001kMapping.length; i++) {
        const m = findings.t001kMapping[i];
        console.log(
          `      ${(m.BWKEY || "").trim()} → ${(m.BUKRS || "").trim()}`,
        );
      }
      console.log("");
    } catch (err) {
      console.log(`  ✗ T001K not accessible through RFC.`);
      console.log(`    ${err.message}`);
      // Detailed diagnostic
      if (err.code) console.log(`    Code: ${err.code}`);
      if (err.key) console.log(`    Key: ${err.key}`);
      if (err.abapMsgClass)
        console.log(`    ABAP Msg Class: ${err.abapMsgClass}`);
      console.log("    Continuing without valuation area mapping.\n");
    }

    // ================================================================
    // Step 6: Cross Validation
    // ================================================================
    console.log(
      "══════════════════════════════════════════════════════════════",
    );
    console.log("  CROSS VALIDATION");
    console.log(
      "══════════════════════════════════════════════════════════════\n",
    );

    // Determine Plant → Company Code via T001W or T001K
    let plantToCC = null;

    if (findings.t001wAccessible) {
      const plantEntry = findings.t001wPlants.find(
        (p) => (p.WERKS || "").trim() === PLANT,
      );
      if (plantEntry) {
        plantToCC = (plantEntry.BUKRS || "").trim();
        console.log(`  Via T001W: Plant ${PLANT} → Company Code ${plantToCC}`);
      }
    }

    if (
      !plantToCC &&
      findings.t001kAccessible &&
      findings.valuationAreas.length > 0
    ) {
      // Plant often equals its valuation area in SAP
      const vaEntry = findings.t001kMapping.find(
        (m) => (m.BWKEY || "").trim() === PLANT,
      );
      if (vaEntry) {
        plantToCC = (vaEntry.BUKRS || "").trim();
        console.log(
          `  Via T001K: Valuation Area ${PLANT} → Company Code ${plantToCC}`,
        );
      }
    }

    if (!plantToCC) {
      console.log(
        `  Unable to determine Plant → Company Code mapping via tables.`,
      );
      console.log(`  Using configured Company Code: ${COMPANY_CODE}`);
      plantToCC = COMPANY_CODE;
    }

    // Determine how many inventory plants map to the same company code
    let plantsUnderCC = [];
    if (findings.t001wAccessible) {
      plantsUnderCC = findings.t001wPlants
        .filter((p) => (p.BUKRS || "").trim() === COMPANY_CODE)
        .map((p) => (p.WERKS || "").trim());
    } else if (findings.t001kAccessible) {
      // All valuation areas under this CC
      const vasUnderCC = findings.t001kMapping
        .filter((m) => (m.BUKRS || "").trim() === COMPANY_CODE)
        .map((m) => (m.BWKEY || "").trim());
      // Cross with inventory plants
      plantsUnderCC = findings.inventoryPlants.filter((p) =>
        vasUnderCC.includes(p),
      );
      if (plantsUnderCC.length === 0) plantsUnderCC = findings.inventoryPlants;
    } else {
      plantsUnderCC = findings.inventoryPlants;
    }

    console.log(
      `\n  Plants under Company Code ${COMPANY_CODE}: ${plantsUnderCC.length}`,
    );
    for (let i = 0; i < plantsUnderCC.length; i++) {
      const marker = plantsUnderCC[i] === PLANT ? " ← CURRENT" : "";
      console.log(`    ${plantsUnderCC[i]}${marker}`);
    }
    console.log("");

    // ================================================================
    // Step 7: Inventory Account Verification
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
    console.log(`  Configured Accounts: ${configuredAccounts.length}`);

    if (configuredAccounts.length > 0) {
      const sorted = [...configuredAccounts].sort();
      console.log(`  Lowest:  ${sorted[0]}`);
      console.log(`  Highest: ${sorted[sorted.length - 1]}`);
      console.log(`  Range:   ${sorted[0]} → ${sorted[sorted.length - 1]}`);
    }

    // Verify against SKB1
    console.log("\n  Verifying accounts exist in SKB1...");
    try {
      const skb1Result = await sap.readTable("SKB1", ["SAKNR"], {
        where: [`BUKRS = '${COMPANY_CODE}'`],
      });
      const skb1Rows = parseRows(skb1Result);
      const skb1Accounts = new Set(skb1Rows.map((r) => (r.SAKNR || "").trim()));

      let foundCount = 0;
      let missingCount = 0;
      const missing = [];

      for (let i = 0; i < configuredAccounts.length; i++) {
        if (skb1Accounts.has(configuredAccounts[i])) {
          foundCount++;
          findings.accountVerification.push({
            account: configuredAccounts[i],
            status: "FOUND",
          });
        } else {
          missingCount++;
          missing.push(configuredAccounts[i]);
          findings.accountVerification.push({
            account: configuredAccounts[i],
            status: "MISSING",
          });
        }
      }

      console.log(`  ✓ Found: ${foundCount}/${configuredAccounts.length}`);
      if (missingCount > 0) {
        console.log(`  ✗ Missing: ${missingCount}`);
        for (let i = 0; i < missing.length; i++) {
          console.log(`    ${missing[i]}`);
        }
      }
    } catch (err) {
      console.log(`  ✗ SKB1 verification failed: ${err.message}`);
    }
    console.log("");

    // ================================================================
    // Step 8: Architecture Assessment
    // ================================================================
    console.log(
      "══════════════════════════════════════════════════════════════",
    );
    console.log("  ARCHITECTURE ASSESSMENT");
    console.log(
      "══════════════════════════════════════════════════════════════\n",
    );

    const targetCC = findings.companyCodes.find(
      (c) => (c.BUKRS || "").trim() === COMPANY_CODE,
    );
    const chartOfAccounts = targetCC ? (targetCC.KTOPL || "").trim() : "?";

    console.log(`  Inventory Scope`);
    console.log(
      `    Plant(s): ${findings.inventoryPlants.join(", ") || PLANT}`,
    );
    console.log(`  GL Scope`);
    console.log(`    Company Code: ${COMPANY_CODE}`);
    console.log(`  Chart of Accounts: ${chartOfAccounts}`);
    console.log(
      `  Valuation Areas: ${findings.valuationAreas.join(", ") || "?"}`,
    );
    console.log(
      `  Configured Inventory Accounts: ${configuredAccounts.length}`,
    );
    if (configuredAccounts.length > 0) {
      const sorted = [...configuredAccounts].sort();
      console.log(
        `  Account Range: ${sorted[0]} → ${sorted[sorted.length - 1]}`,
      );
    }
    console.log("");

    // Verdict
    const singlePlant = plantsUnderCC.length <= 1;
    const valAreaMatchesCC =
      findings.valuationAreas.includes(COMPANY_CODE) ||
      findings.valuationAreas.includes(PLANT);

    if (
      singlePlant &&
      (valAreaMatchesCC || findings.valuationAreas.length <= 1)
    ) {
      console.log("  ✓ ASSESSMENT: VALID\n");
      console.log("  Current architecture is VALID.");
      console.log(`  Inventory → Plant ${PLANT}`);
      console.log(`  GL → Company Code ${COMPANY_CODE}`);
      console.log("  is an acceptable reconciliation scope.");
      if (!findings.t001wAccessible && !findings.t001kAccessible) {
        console.log(
          "\n  Note: Could not fully verify via T001W/T001K (RFC access issue).",
        );
        console.log("  Assessment based on MARD/MBEW inventory data analysis.");
      }
    } else if (plantsUnderCC.length > 1) {
      console.log("  ⚠ ASSESSMENT: REQUIRES REVIEW\n");
      console.log("  Current implementation reconciles");
      console.log(`    one plant (${PLANT})`);
      console.log("  against");
      console.log(`    company code GL (${COMPANY_CODE}).`);
      console.log(
        `\n  ${plantsUnderCC.length} plants detected under Company Code ${COMPANY_CODE}.`,
      );
      console.log("  Business confirmation required.");
      console.log(
        "  Future enhancement may support multi-plant reconciliation.",
      );
    } else {
      console.log("  ⚠ ASSESSMENT: INCONCLUSIVE\n");
      console.log("  Unable to fully determine organizational mapping");
      console.log(
        "  because required SAP organizational tables are not accessible through RFC.",
      );
      console.log("  Inventory extraction itself remains valid.");
    }
    console.log("");

    // ================================================================
    // Generate Workbook
    // ================================================================
    console.log("Generating Organizational_Mapping.xlsx...");
    await generateWorkbook(findings, plantsUnderCC, {
      companyCode: COMPANY_CODE,
      plant: PLANT,
      chartOfAccounts,
      configuredAccounts,
      singlePlant,
    });

    await sap.disconnect();
    console.log("\nDone.");
  } catch (err) {
    console.error("ERROR:", err.message || err);
    if (err.stack) console.error(err.stack);
  }
}

async function generateWorkbook(findings, plantsUnderCC, meta) {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const filePath = path.join(OUTPUT_DIR, "Organizational_Mapping.xlsx");
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

  // Sheet 2: Inventory Plants
  const s2 = workbook.addWorksheet("Inventory Plants");
  s2.columns = [
    { header: "Plant", key: "plant", width: 10 },
    { header: "Source", key: "source", width: 20 },
    { header: "Company Code", key: "cc", width: 14 },
    { header: "Plant Name", key: "name", width: 35 },
  ];
  if (findings.t001wAccessible) {
    for (const p of findings.t001wPlants) {
      s2.addRow({
        plant: (p.WERKS || "").trim(),
        source: "T001W",
        cc: (p.BUKRS || "").trim(),
        name: (p.NAME1 || "").trim(),
      });
    }
  } else {
    for (const p of findings.inventoryPlants) {
      s2.addRow({
        plant: p,
        source: "MARD (derived)",
        cc: meta.companyCode,
        name: "",
      });
    }
  }

  // Sheet 3: Valuation Areas
  const s3 = workbook.addWorksheet("Valuation Areas");
  s3.columns = [
    { header: "Valuation Area", key: "va", width: 16 },
    { header: "Company Code", key: "cc", width: 14 },
    { header: "Source", key: "source", width: 14 },
  ];
  if (findings.t001kAccessible) {
    for (const m of findings.t001kMapping) {
      s3.addRow({
        va: (m.BWKEY || "").trim(),
        cc: (m.BUKRS || "").trim(),
        source: "T001K",
      });
    }
  } else {
    for (const va of findings.valuationAreas) {
      s3.addRow({ va, cc: "(unknown)", source: "MBEW (derived)" });
    }
  }

  // Sheet 4: Inventory Accounts
  const s4 = workbook.addWorksheet("Inventory Accounts");
  s4.columns = [
    { header: "Account", key: "account", width: 16 },
    { header: "Status", key: "status", width: 12 },
  ];
  for (const av of findings.accountVerification) {
    s4.addRow(av);
  }

  // Sheet 5: Architecture Assessment
  const s5 = workbook.addWorksheet("Architecture Assessment");
  s5.columns = [
    { header: "Item", key: "item", width: 40 },
    { header: "Value", key: "value", width: 40 },
  ];
  const rows = [
    { item: "Inventory Plant", value: meta.plant },
    { item: "GL Company Code", value: meta.companyCode },
    { item: "Chart of Accounts", value: meta.chartOfAccounts },
    {
      item: "Configured Inventory Accounts",
      value: String(meta.configuredAccounts.length),
    },
    { item: "Plants Under Company Code", value: String(plantsUnderCC.length) },
    {
      item: "T001W Accessible",
      value: findings.t001wAccessible ? "YES" : "NO",
    },
    {
      item: "T001K Accessible",
      value: findings.t001kAccessible ? "YES" : "NO",
    },
    { item: "", value: "" },
    { item: "Verdict", value: meta.singlePlant ? "VALID" : "REQUIRES REVIEW" },
  ];
  for (const r of rows) {
    s5.addRow(r);
  }

  await workbook.xlsx.writeFile(filePath);
  console.log(`  File: ${filePath}`);
  console.log(`  Sheets: 5`);
}

testOrganizationalMapping();
