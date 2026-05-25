import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";

export function getKeyPairByPrivateKey(privateKey: string): Ed25519Keypair {
  const { secretKey } = decodeSuiPrivateKey(privateKey);

  return Ed25519Keypair.fromSecretKey(secretKey);
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

export function getPrivateKeyFromMnemonic(mnemonic: string, idx: number = 0) {
  const path = `m/44'/784'/0'/0'/${idx}'`;

  const keypair = Ed25519Keypair.deriveKeypair(mnemonic, path);
  return keypair.getSecretKey();
}
