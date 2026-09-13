#!/usr/bin/env node
/* Generate an inspectable archive page by executing the real contracts in
   a local EVM. No RPC URL or signing key is accepted by this tool. */
import fs from "node:fs";
import path from "node:path";
import { compile, artifact, ROOT } from "./compile.mjs";
import { Chain, encodeAddressArg } from "./evm.mjs";
import { getter } from "./site.mjs";
const index=process.argv.indexOf("--compiled");
const out=index>=0?JSON.parse(fs.readFileSync(process.argv[index+1],"utf8")):compile({quiet:true,dirs:["src","test/mocks"]});
const A=(file,name)=>artifact(out,"src/"+file+".sol",name||file);
const c=await Chain.open();
const deploy=async(file,args="")=>c.deploy(A(file).bytecode,args,file);
const impl=await deploy("IpseityAccount"),grip=await deploy("GripVault"),engine=await deploy("Engine","0".repeat(64)),sigil=await deploy("Sigil");
const renderer=await deploy("Renderer",encodeAddressArg(engine)+encodeAddressArg(sigil));
const hub=await deploy("Ipseity",encodeAddressArg(renderer)+encodeAddressArg(impl)+encodeAddressArg(grip)+"1".padStart(64,"0")+"1000".padStart(64,"0"));
await c.exec(hub,"mint()",[],{value:10n**16n});
const etch=await deploy("Etch",encodeAddressArg(hub));
const desk=await deploy("DeskEtch",encodeAddressArg(etch));
const page=await deploy("PageEtch",encodeAddressArg(etch)+encodeAddressArg(desk));
const reader=await deploy("Vitrine",encodeAddressArg(etch)+encodeAddressArg(page));
for(const [kind,text] of [[1,"The first memory of the original becoming final"],[2,"Local EVM example\nStored as immutable bytes with author, digest and token identity"]])
 await c.exec(etch,"inscribe(uint256,uint8,bytes)",[1,kind,"0x"+Buffer.from(text).toString("hex")]);
const response=await getter(c,reader)(["token","1"]);
if(response.status!==200)throw Error("Reader did not produce a page");
// This saved document cannot call addresses that exist only in the local VM.
const html=response.body.replace(/<script>[\s\S]*?<\/script>/g,"")
 .replace("<body>","<body><aside style='padding:12px 24px;background:#17354b;color:#e7f6ff;font:13px system-ui'>Local EVM preview. Two example inscriptions were executed locally. Wallet actions are disabled in this saved page.</aside>")
 .replace(/<button /g,"<button disabled ");
fs.mkdirSync(path.join(ROOT,"dist"),{recursive:true});
fs.writeFileSync(path.join(ROOT,"dist/etch-preview.html"),html);
fs.writeFileSync(path.join(ROOT,"dist/etch-preview.json"),JSON.stringify({mode:"local-evm-only",hub,etch,desk,page,reader,inscriptions:2},null,2)+"\n");
console.log("Generated dist/etch-preview.html from deployed local contract responses; no live transactions sent.");
