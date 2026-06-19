import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import * as bip39 from "bip39";

/**
 * Get keypair from private key
 * @param privateKey Private key
 * @returns Keypair or null if error
 */
export function getKeypairFromPrivateKey(privateKey: string) {
  const keypair = Ed25519Keypair.fromSecretKey(privateKey);
  return keypair;
}

export function getRandomKeypair() {
  const keypair = new Ed25519Keypair();
  return keypair;
}

export function getKeypairFromMnemonic(mnemonic: string, idx: number = 0) {
  const path = `m/44'/784'/0'/0'/${idx}'`;

  const keypair = Ed25519Keypair.deriveKeypair(mnemonic, path);
  return keypair;
}

export function getAccountInfoFromKeypair(keypair: Ed25519Keypair) {
  const publicKey = keypair.getPublicKey().toSuiPublicKey();
  const privateKey = keypair.getSecretKey();
  const address = keypair.toSuiAddress();

  return { publicKey, privateKey, address };
}

export function genRandomMnemonic() {
  const mnemonic = bip39.generateMnemonic();

  return mnemonic;
}
