/**
 * Phase 3.11 - Validate Restricted-Use Stock (MCHB integration)
 *
 * Run: node tests/test-restricted-stock.js
 *
 * Validates that restrictedQty and restrictedValue are populated
 * from MCHB batch stock data.
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const SAPService = require("../services/sap.service");
const InventoryDatasetService = require("../services/inventory-dataset.service");

const TEST_PLANT = process.env.TEST_PLANT || "1000";

async function testRestrictedStock() {
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
    console.log("=== Restricted-Use Stock Validation ===\n");

    const service = new InventoryDatasetService(sap);
    const records = await service.getInventoryDataset({ plant: TEST_PLANT });

    console.log(`\nTotal records: ${records.length}`);

    // Find records with restricted stock
    let restrictedCount = 0;
    let totalRestrictedQty = 0;
    let totalRestrictedValue = 0;

    for (let i = 0; i < records.length; i++) {
      if (records[i].restrictedQty > 0) {
        restrictedCount++;
        totalRestrictedQty += records[i].restrictedQty;
        totalRestrictedValue += records[i].restrictedValue;
      }
    }

    console.log(`\n--- Restricted Stock Summary ---`);
    console.log(`  Records with restricted stock: ${restrictedCount}`);
    console.log(`  Total restricted qty: ${totalRestrictedQty}`);
    console.log(`  Total restricted value: ${round2(totalRestrictedValue)}`);

    // Sample records
    if (restrictedCount > 0) {
      console.log(`\n--- Sample Records (first 10 with restricted stock) ---`);
      console.log(
        "Material".padEnd(18) +
          "Plant".padEnd(6) +
          "Location".padEnd(10) +
          "Restricted Qty".padEnd(16) +
          "Restricted Value",
      );
      console.log("-".repeat(66));

      let printed = 0;
      for (let i = 0; i < records.length && printed < 10; i++) {
        if (records[i].restrictedQty > 0) {
          const r = records[i];
          console.log(
            r.material.padEnd(18) +
              r.plant.padEnd(6) +
              r.storageLocation.padEnd(10) +
              String(r.restrictedQty).padEnd(16) +
              String(r.restrictedValue),
          );
          printed++;
        }
      }
    } else {
      console.log("\n  No restricted stock found in MCHB for this plant.");
      console.log(
        "  This is expected if batch management has no blocked/quality batch stock.",
      );
    }

    console.log(
      `\n--- Status: ${restrictedCount > 0 ? "POPULATED" : "ZERO (MCHB may be empty)"} ---`,
    );

    await sap.disconnect();
    console.log("\nDone.");
  } catch (err) {
    console.error("ERROR:", err.message || err);
  }
}

function round2(val) {
  return Math.round(val * 100) / 100;
}

testRestrictedStock();
