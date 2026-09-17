#!/usr/bin/env node
import {createModuleFixture} from './modules-stack.mjs';

if(process.argv.length>2){
 if(process.argv.length===3&&process.argv[2]==='--help'){
  console.log('node tools/modules-local.mjs\nStarts the complete IPSEITY instrument and module workbench on a disposable loopback Hardhat chain. No RPC URL or private key is accepted.');
  process.exit(0);
 }
 throw Error('No deployment arguments are accepted. Use --help.');
}
const f=await createModuleFixture({site:true,seed:true,gateway:true});
console.log(`\nOriginal instrument: ${f.url}/token/1/live\nModule workbench:    ${f.modulesUrl}\nExtension directory: ${f.url}/extensions\nLocal wallet RPC:    ${f.rpcUrl}\nChain ID:           31337\nToken 1 owner:      ${f.owner}\n\nUse Hardhat's public development wallet for this disposable chain. Published examples start uninstalled; choose a release and review each installation in the workbench. Two game cartridges are already held by the token's Reach.\nPress Ctrl+C to stop the local chain and gateway.`);
await new Promise(resolve=>{process.once('SIGINT',resolve);process.once('SIGTERM',resolve);});
await f.close();
