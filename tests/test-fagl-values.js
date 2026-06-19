/**
 * Phase 1.1 - Validate FAGLFLEXT Amount Fields
 *
 * Goal: Read ALL amount-related fields from FAGLFLEXT to identify
 * which fields represent the GL balances used by transaction FAGLB03.
 *
 * Key amount fields in FAGLFLEXT:
 *   HSLxx = Amount in Local Currency (periods 01-16)
 *   TSLxx = Amount in Transaction Currency (periods 01-16)
 *   KSLxx = Amount in Group Currency (periods 01-16)
 *   HSLVT = Carry-forward balance (local currency)
 *   TSLVT = Carry-forward balance (transaction currency)
 *   KSLVT = Carry-forward balance (group currency)
 *
 * FAGLB03 typically uses:
 *   HSL01-HSL16 for period balances in local currency
 *   HSLVT for carry-forward
 *   Cumulative balance = HSLVT + HSL01 + HSL02 + ... + HSLxx (up to current period)
 *
 * DRCRK: Debit/Credit indicator (S=Debit, H=Credit)
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const SAPService = require("../services/sap.service");
const parseRows = require("../utils/parse-rows");

async function testFaglValues() {
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
    console.log(
      "Connected to SAP - reading FAGLFLEXT (All Amount Fields)...\n",
    );

    // --- Part 1: Key identification fields + carry-forward + period amounts (local currency) ---
    const identFields = ["RBUKRS", "RACCT", "RYEAR", "DRCRK", "RRCTY", "RVERS"];
    const carryForward = ["HSLVT", "TSLVT", "KSLVT"];
    const periodFieldsHSL = [
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
    ];

    // RFC_READ_TABLE has a field limit per call, so we split into batches
    console.log(
      "=== Batch 1: Identity + Carry-forward + HSL (Local Currency Periods) ===",
    );
    const batch1Fields = [...identFields, ...carryForward, ...periodFieldsHSL];
    console.log(`Fields: ${batch1Fields.join(", ")}`);

    const result1 = await sap.readTable("FAGLFLEXT", batch1Fields, {
      rowCount: 10,
    });
    const rows1 = parseRows(result1);

    console.log(`\nRows returned: ${rows1.length}`);
    console.log("\nSample records (first 5):");
    console.log(JSON.stringify(rows1.slice(0, 5), null, 2));

    // --- Part 2: Transaction currency period amounts ---
    console.log(
      "\n\n=== Batch 2: Identity + TSL (Transaction Currency Periods) ===",
    );
    const periodFieldsTSL = [
      "TSL01",
      "TSL02",
      "TSL03",
      "TSL04",
      "TSL05",
      "TSL06",
      "TSL07",
      "TSL08",
      "TSL09",
      "TSL10",
      "TSL11",
      "TSL12",
    ];
    const batch2Fields = [...identFields, ...periodFieldsTSL];
    console.log(`Fields: ${batch2Fields.join(", ")}`);

    const result2 = await sap.readTable("FAGLFLEXT", batch2Fields, {
      rowCount: 10,
    });
    const rows2 = parseRows(result2);

    console.log(`\nRows returned: ${rows2.length}`);
    console.log("\nSample records (first 3):");
    console.log(JSON.stringify(rows2.slice(0, 3), null, 2));

    // --- Analysis ---
    console.log("\n\n=== ANALYSIS ===");
    console.log("FAGLB03 uses these fields for GL balance display:");
    console.log("  - HSLVT: Balance carry-forward (local currency)");
    console.log("  - HSL01..HSL16: Period amounts (local currency)");
    console.log("  - Cumulative balance = HSLVT + sum(HSL01..HSLxx)");
    console.log("  - DRCRK: S=Debit side, H=Credit side");
    console.log("  - RRCTY: Record type (0=actual, 1=plan)");
    console.log("  - RVERS: Version (001=actual)");

    if (rows1.length > 0) {
      console.log("\n--- Non-zero Amount Fields (first record) ---");
      const sample = rows1[0];
      const amountFields = [...carryForward, ...periodFieldsHSL];
      for (const field of amountFields) {
        const val = parseFloat(sample[field]) || 0;
        if (val !== 0) {
          console.log(`  ${field}: ${sample[field]} (numeric: ${val})`);
        }
      }

      console.log("\n--- Record Type & Version Distribution ---");
      const rrctySet = new Set(rows1.map((r) => r.RRCTY));
      const rversSet = new Set(rows1.map((r) => r.RVERS));
      console.log(`  RRCTY values found: ${[...rrctySet].join(", ")}`);
      console.log(`  RVERS values found: ${[...rversSet].join(", ")}`);
      console.log(
        "  (Use RRCTY='0' and RVERS='001' to filter to actual postings)",
      );
    }

    await sap.disconnect();
    console.log("\nDisconnected.");
  } catch (err) {
    console.error("ERROR:", err.message || err);
  }
}

testFaglValues();
