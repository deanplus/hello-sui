import * as utils from "../src/utils/keypair";

function getRandomKeypair() {
  const keypair = utils.getRandomKeypair();
  const accountInfo = utils.getAccountInfoFromKeypair(keypair);
  console.log(accountInfo);
}

function getRandomMnemonic() {
  const mnemonic = utils.genRandomMnemonic();
  console.log(mnemonic);
}

async function main() {
  // getRandomKeypair();
  getRandomMnemonic();
}

main();
