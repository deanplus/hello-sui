import dotenv from "dotenv";
dotenv.config();
import { Cetus } from "../src/cetus";
import config from "../src/config";
import * as keypairHelper from "../src/helpers/keypair";
import { Transaction } from "@mysten/sui/transactions";
import * as rpc from "../src/rpc";

const suiClient = rpc.getSuiClient();

async function getPool() {
  const cetus = new Cetus();

  let coinTypeA = "0x2::sui::SUI";

  const coinTypeB = config.MAINNET.USDC_COIN_TYPE;

  const pool = await cetus.getPool(coinTypeA, coinTypeB);

  console.log("====pool====\n", pool);
}

async function getPoolId() {
  const cetus = new Cetus();

  const coinTypeA = "0x2::sui::SUI";
  const coinTypeB = config.MAINNET.USDC_COIN_TYPE;

  const poolId = await cetus.getPoolId(coinTypeA, coinTypeB);

  console.log("poolId", poolId);
}

async function swapByCoin() {
  const cetus = new Cetus();

  const privateKey = process.env.SUI_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("SUI_PRIVATE_KEY is not set");
  }
  const keypair = getKeypairFromPrivateKey(privateKey);

  // wal -> usdc
  const fromCoinType = config.MAINNET.WALRUS_COIN_TYPE;
  const toCoinType = config.MAINNET.USDC_COIN_TYPE;

  const inputCoinObjectId =
    "0x0ed49338d6a2e8c6725dd3e6dfc3108f5b9ae372c7ec1ec1964683df61b43254";

  const txb = new Transaction();
  txb.setGasBudget(100000000);
  const inputCoin = txb.object(inputCoinObjectId);

  const resp = await cetus.swapByCoin(
    txb,
    {
      fromCoinType,
      toCoinType,
      inputCoin,
    },
    keypair,
  );

  console.log(resp);
}

async function parseSwapEvent() {
  const cetus = new Cetus();
  const txDigest = "5pGuvFZmtU2nkfKNRESYGw6NprTwUsi3xiPwgfBzcDcf";
  const txData = await rpc.getTransactionBlock(txDigest, suiClient);
  const events = txData.events;
  if (!events) {
    throw new Error("No events found");
  }

  for (const event of events) {
    const parsedEvent = await cetus.parseSwapEvent(event);
    console.log(parsedEvent);
  }
}

async function main() {
  // await getPoolId();
  // await getPool();
  await swapByCoin();
  // await parseSwapEvent();
}

main();
