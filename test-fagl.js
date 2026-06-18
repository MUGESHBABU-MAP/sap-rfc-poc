require("dotenv").config();

const SAPService = require("./services/sap.service");
const parseRows = require("./utils/parse-rows");

async function testFagl() {
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

    console.log("Connected to SAP - reading FAGLFLEXT...");

    const result = await sap.readTable(
      "FAGLFLEXT",
      [
        "RBUKRS",
        "RACCT",
        "RYEAR",
        "RPMAX",
        "DRCRK",
      ],
      10
    );

    const rows = parseRows(result);

    console.log(JSON.stringify(rows, null, 2));

    await sap.disconnect();
  } catch (err) {
    console.error(err);
  }
}

testFagl();