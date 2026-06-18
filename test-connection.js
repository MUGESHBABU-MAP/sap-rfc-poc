const { Client } = require("node-rfc");
require("dotenv").config();

async function main() {
  const client = new Client({
    user: process.env.SAP_USER,
    passwd: process.env.SAP_PASSWORD,
    ashost: process.env.SAP_ASHOST,
    sysnr: process.env.SAP_SYSNR,
    client: process.env.SAP_CLIENT,
    lang: process.env.SAP_LANG,
  });

  try {
    await client.open();

    console.log("Connected to SAP");

    const result = await client.call("STFC_CONNECTION", {
      REQUTEXT: "KTern RFC Test",
    });

    console.log(result);

    await client.close();
  } catch (err) {
    console.error(err);
  }
}

main();
