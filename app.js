require("dotenv").config();

const SAPService = require("./services/sap.service");
const InventoryService = require("./services/inventory.service");
const GLService = require("./services/gl.service");
const ReconciliationService = require("./services/reconciliation.service");
const { sumField } = require("./utils/calculations");

async function main() {
  const sapConfig = {
    user: process.env.SAP_USER,
    passwd: process.env.SAP_PASSWORD,
    ashost: process.env.SAP_ASHOST,
    sysnr: process.env.SAP_SYSNR,
    client: process.env.SAP_CLIENT,
    lang: process.env.SAP_LANG,
  };

  const sap = new SAPService(sapConfig);
  const inventory = new InventoryService(sap);
  const gl = new GLService(sap);
  const recon = new ReconciliationService();

  try {
    await sap.connect();
    console.log("Connected to SAP\n");

    // --- Inventory side ---
    console.log("Fetching MARD (inventory)...");
    const inventoryRows = await inventory.getInventory();
    console.log(`  ${inventoryRows.length} rows returned`);

    const inventoryTotal = sumField(inventoryRows, "LABST");
    console.log(`  Unrestricted stock total: ${inventoryTotal}\n`);

    // --- GL side ---
    console.log("Fetching FAGLFLEXT (GL balances)...");
    const glRows = await gl.getBalances();
    console.log(`  ${glRows.length} rows returned`);

    const glTotal = sumField(glRows, "RPMAX");
    console.log(`  GL period max total: ${glTotal}\n`);

    // --- Reconciliation ---
    const result = recon.calculateVariance(inventoryTotal, glTotal);

    console.log("=== Reconciliation Result ===");
    console.log(JSON.stringify(result, null, 2));

    await sap.disconnect();
  } catch (err) {
    console.error("Error:", err);
  }
}

main();
