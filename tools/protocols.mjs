/* A page refresh must keep the contracts that hold balances and history. */
import { createAddressFromString } from "@ethereumjs/util";
import { sel } from "./evm.mjs";

export const STATEFUL_SITE_KEYS = ["parley", "kiln", "locker", "succession", "consign"];

export async function validateExistingProtocols(c, hub, existing, poolManager) {
  const expected = String(hub).toLowerCase();
  for (const name of STATEFUL_SITE_KEYS) {
    const address = existing[name];
    if (address === undefined) continue; // a new installation may create it
    if (!/^0x[0-9a-fA-F]{40}$/.test(address) || /^0x0{40}$/i.test(address))
      throw new Error(`Invalid existing ${name} address; refusing to replace its history`);
    const code = c.rpc
      ? await c.rpc("eth_getCode", [address, "latest"])
      : await c.vm.stateManager.getCode(createAddressFromString(address));
    if (typeof code === "string" ? code === "0x" || code === "0x0" : !code.length)
      throw new Error(`Existing ${name} has no code on this chain`);
    if (name !== "locker") {
      const result = await c.call(address, sel("HUB()"));
      if (!/^0x[0-9a-fA-F]{64}$/.test(result) || ("0x" + result.slice(-40)).toLowerCase() !== expected)
        throw new Error(`Existing ${name} belongs to a different collection`);
    }
    if (name === "kiln" && poolManager) {
      const result = await c.call(address, sel("POOL_MANAGER()"));
      if (!/^0x[0-9a-fA-F]{64}$/.test(result) || ("0x" + result.slice(-40)).toLowerCase() !== poolManager.toLowerCase())
        throw new Error("Existing kiln uses a different PoolManager; migrate explicitly before replacing it");
    }
  }
}

export function retainedProtocols(record, chainId) {
  if (Number(record.chainId) !== Number(chainId)) throw new Error("Deployment record and RPC chain differ");
  const retained = {};
  for (const key of STATEFUL_SITE_KEYS) {
    if (!record.contracts?.[key]) throw new Error(`Missing ${key} in deployment record; recover it before redeploying`);
    retained[key] = record.contracts[key];
  }
  return retained;
}
