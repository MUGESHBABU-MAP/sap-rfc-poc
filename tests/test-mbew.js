/**
 * Phase 1.1 - Validate MBEW (Material Valuation)
 *
 * Fields: MATNR, BWKEY, BWTAR, VPRSV, VERPR, STPRS, SALK3, LBKUM
 * Purpose: Confirm valuation/cost data is accessible.
 *   STPRS = Standard Price
 *   VERPR = Moving Average Price
 *   SALK3 = Total Valuated Stock Value
 *   LBKUM = Total Valuated Stock Quantity
 *   VPRSV = Price Control Indicator (S=standard, V=moving avg)
 *   BWKEY = Valuation Area (usually = plant)
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const SAPService = require("../services/sap.service");
const parseRows = require("../utils/parse-rows");

async function testMbew() {
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
    console.log("Connected to SAP - reading MBEW (Material Valuation)...\n");

    const fields = [
      "MATNR",
      "BWKEY",
      "BWTAR",
      "VPRSV",
      "VERPR",
      "STPRS",
      "SALK3",
      "LBKUM",
    ];

    console.log(`Requesting fields: ${fields.join(", ")}`);
    console.log("---");
    console.log("Key fields:");
    console.log("  STPRS  = Standard Price");
    console.log("  VERPR  = Moving Average Price");
    console.log("  VPRSV  = Price Control (S=Standard, V=Moving Avg)");
    console.log("  SALK3  = Total Valuated Stock Value");
    console.log("  LBKUM  = Total Valuated Stock Quantity");
    console.log("  BWKEY  = Valuation Area (usually = plant)");
    console.log("---");

    const result = await sap.readTable("MBEW", fields, { rowCount: 20 });
    const rows = parseRows(result);

    console.log(`\nRows returned: ${rows.length}`);
    console.log("\nSample records:");
    console.log(JSON.stringify(rows.slice(0, 10), null, 2));

    // Validate field availability and highlight cost fields
    console.log("\n--- Field Availability ---");
    if (rows.length > 0) {
      const sample = rows[0];
      for (const field of fields) {
        const hasValue = sample[field] !== undefined && sample[field] !== "";
        console.log(
          `  ${field}: ${hasValue ? "✓ available" : "✗ empty/missing"} (value: "${sample[field] || ""}")`,
        );
      }

      // Analyze cost availability
      console.log("\n--- Cost Analysis (first 5 records) ---");
      rows.slice(0, 5).forEach((row, i) => {
        const priceControl =
          row.VPRSV === "S"
            ? "Standard"
            : row.VPRSV === "V"
              ? "Moving Avg"
              : row.VPRSV || "?";
        const cost = row.VPRSV === "S" ? row.STPRS : row.VERPR;
        console.log(
          `  [${i}] Material: ${row.MATNR} | Plant: ${row.BWKEY} | Control: ${priceControl} | Cost: ${cost} | Stock Value: ${row.SALK3}`,
        );
      });
    } else {
      console.log("  No rows returned - table may be empty or inaccessible.");
    }

    await sap.disconnect();
    console.log("\nDisconnected.");
  } catch (err) {
    console.error("ERROR:", err.message || err);
  }
}

testMbew();
