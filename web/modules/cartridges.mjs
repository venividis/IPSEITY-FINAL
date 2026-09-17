/** Owned, immutable raw-HTML games. The cartridge gets no wallet or host bridge. */
import { parse, parseFragment, serialize } from 'parse5';
import { getBytes, keccak256, sha256, toUtf8Bytes } from '../vendor/ethers.min.js';
import { pinSnapshot, assertSnapshot, readCall, COLLECTION_ABI, ACCOUNT_ABI } from '../../packages/modules/chain.mjs';
import { boundedJSON } from './host.mjs';

export const CARTRIDGE_RELEASE_TUPLE = 'tuple(address publisher,address archive,bytes32 archiveCodeHash,bytes32 contentHash,bytes32 manifestHash,uint32 byteLength,string manifestJSON,address[] chunks,bytes32[] chunkCodeHashes,uint32[] chunkByteLengths)';
export const CARTRIDGE_LAUNCH_TUPLE = 'tuple(string manifestJSON,bytes32 contentHash,bytes32 manifestHash,uint64 revision,bool frozen,address holder,address controller,uint256 parentArtifactId,uint256 parentOwnershipEpoch,bool authorized,bool onchainContentAvailable)';
export const CARTRIDGE_ABI = ['function artifact() view returns(address)','function ownerOf(uint256) view returns(address)','function releaseOfCartridge(uint256) view returns(uint256)',`function releaseOf(uint256) view returns(${CARTRIDGE_RELEASE_TUPLE})`,`function launchManifest(uint256,address) view returns(${CARTRIDGE_LAUNCH_TUPLE})`];
export const BINDING_ABI = ['function collection() view returns(address)'];
export const CARTRIDGE_ISOLATION_NOTICE = 'This legacy game runs full JavaScript and canvas in an opaque iframe with no wallet, account bridge, shared storage or parent DOM access. CSP blocks ordinary external resources and connections. Game scripts can still attempt to navigate their own frame; the host closes it after a subsequent load. This profile does not guarantee zero network requests or a hard CPU/memory limit.';
export const LEGACY_ISOLATION_NOTICE = CARTRIDGE_ISOLATION_NOTICE;
const MAX_BYTES=1_048_576,MAX_CHUNKS=64,MAX_CHUNK_BYTES=23_000,MAX_MANIFEST_BYTES=16_384;
const utf8=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true}),verified=new WeakSet();
const addr=value=>{if(typeof value!=='string'||!/^0x[0-9a-f]{40}$/i.test(value)||/^0x0{40}$/i.test(value))throw Error('Invalid cartridge identity address.');return value.toLowerCase();};
const positive=(value,label)=>{if(typeof value==='number'&&!Number.isSafeInteger(value))throw Error('Unsafe '+label+'.');const text=String(value);if(!/^[1-9][0-9]*$/.test(text)||text.length>78||BigInt(text)>=2n**256n)throw Error('Invalid '+label+'.');return text;};
const digest=value=>{if(typeof value!=='string'||!/^0x[0-9a-f]{64}$/i.test(value))throw Error('Invalid cartridge digest.');return value.toLowerCase();};
function identityOf(value){return Object.freeze({chainId:positive(value.chainId,'chain ID'),collection:addr(value.collection),tokenId:positive(value.tokenId,'token ID'),account:addr(value.account),owner:addr(value.owner),epoch:positive(value.epoch,'custody epoch'),registry:addr(value.registry)});}
async function codeAt(request,snapshot,address,maximum=24_576){
 const code=await request({method:'eth_getCode',params:[addr(address),snapshot.block]});
 if(typeof code!=='string'||!/^0x(?:[0-9a-f]{2})+$/i.test(code)||(code.length-2)/2>maximum)throw Error('Missing or oversized cartridge code.');
 return code;
}

/** Recheck custody and immutable release identity without downloading the game. */
export async function assertCartridgeAuthority(request,identity,selection,snapshot){
 if(typeof request!=='function')throw Error('Cartridge recovery needs a read-only provider.');
 const current=identityOf({...identity,registry:selection.registry}),cartridgeId=positive(selection.cartridgeId,'cartridge ID');
 snapshot??=await pinSnapshot(request,current.chainId);
 if(String(snapshot.chainId)!==current.chainId)throw Error('Cartridge snapshot belongs to another chain.');
 const read=(to,abi,method,args=[],max=1024)=>readCall(request,snapshot,to,abi,method,args,max);
 const [bindingResult,canonicalResult,ownerResult,statsResult,holderResult,releaseResult,launchResult]=await Promise.all([
  read(current.registry,CARTRIDGE_ABI,'artifact'),read(current.collection,COLLECTION_ABI,'account',[current.tokenId]),read(current.collection,COLLECTION_ABI,'ownerOf',[current.tokenId]),read(current.collection,COLLECTION_ABI,'statsOf',[current.tokenId]),read(current.registry,CARTRIDGE_ABI,'ownerOf',[cartridgeId]),read(current.registry,CARTRIDGE_ABI,'releaseOfCartridge',[cartridgeId]),read(current.registry,CARTRIDGE_ABI,'launchManifest',[cartridgeId,current.owner],22_000)
 ]);
 const binding=addr(bindingResult[0]),releaseId=positive(releaseResult[0],'cartridge release ID'),launch=launchResult[0];
 const [boundCollection,footer,reachOwner]=await Promise.all([read(binding,BINDING_ABI,'collection'),read(current.account,ACCOUNT_ABI,'token'),read(current.account,ACCOUNT_ABI,'owner')]);
 if(addr(boundCollection[0])!==current.collection)throw Error('Cartridge registry belongs to a different collection.');
 if(addr(canonicalResult[0])!==current.account||addr(holderResult[0])!==current.account)throw Error('Cartridge is not held by the selected canonical Reach.');
 if(addr(ownerResult[0])!==current.owner||addr(reachOwner[0])!==current.owner)throw Error('Cartridge controller is not the current NFT owner.');
 if(footer[0]!==BigInt(current.chainId)||addr(footer[1])!==current.collection||footer[2]!==BigInt(current.tokenId))throw Error('Reach token binding differs from the selected NFT.');
 const transfers=statsResult[1];if(transfers>=0xffffffffn||transfers+1n!==BigInt(current.epoch))throw Error('NFT custody epoch changed or is exhausted.');
 if(addr(launch.holder)!==current.account||addr(launch.controller)!==current.owner||launch.parentArtifactId!==BigInt(current.tokenId)||launch.parentOwnershipEpoch!==BigInt(current.epoch)||!launch.authorized||!launch.onchainContentAvailable||!launch.frozen||launch.revision!==1n)throw Error('Cartridge launch authority or immutable content changed.');
 if(selection.releaseId!==undefined&&releaseId!==positive(selection.releaseId,'cartridge release ID'))throw Error('Cartridge release changed.');
 if(selection.contentHash!==undefined&&digest(launch.contentHash)!==digest(selection.contentHash))throw Error('Cartridge content hash changed.');
 await Promise.all([current.registry,binding,current.collection,current.account].map(address=>codeAt(request,snapshot,address)));
 if(selection.archive!==undefined){const code=await codeAt(request,snapshot,selection.archive);if(keccak256(code)!==digest(selection.archiveCodeHash))throw Error('Cartridge archive code hash changed.');}
 await assertSnapshot(request,snapshot);
 return {identity:current,registry:current.registry,cartridgeId,releaseId,binding,launch,snapshot};
}

/** Recover only the registry's committed STOP-prefixed raw chunks at one block. */
export async function recoverOwnedCartridge({request,chainId,collection,tokenId,account,owner,epoch,registry,cartridgeId}){
 const identity=identityOf({chainId,collection,tokenId,account,owner,epoch,registry});
 const authority=await assertCartridgeAuthority(request,identity,{registry,cartridgeId}),{snapshot,releaseId,launch}=authority;
 const [raw]=await readCall(request,snapshot,identity.registry,CARTRIDGE_ABI,'releaseOf',[releaseId],32_768);
 const length=Number(raw.byteLength),chunks=[...raw.chunks];
 if(!Number.isSafeInteger(length)||length<1||length>MAX_BYTES||chunks.length<1||chunks.length>MAX_CHUNKS||raw.chunkCodeHashes.length!==chunks.length||raw.chunkByteLengths.length!==chunks.length)throw Error('Cartridge content or chunk count exceeds its bound.');
 const manifestText=raw.manifestJSON;if(typeof manifestText!=='string'||!utf8.encode(manifestText).length||utf8.encode(manifestText).length>MAX_MANIFEST_BYTES)throw Error('Cartridge manifest exceeds its bound.');
 const manifest=boundedJSON(JSON.parse(manifestText),MAX_MANIFEST_BYTES);
 if(!manifest||typeof manifest!=='object'||Array.isArray(manifest))throw Error('Cartridge manifest must be a JSON object.');
 const contentHash=digest(raw.contentHash),manifestHash=digest(raw.manifestHash),archive=addr(raw.archive),archiveCodeHash=digest(raw.archiveCodeHash);
 if(keccak256(toUtf8Bytes(manifestText))!==manifestHash||launch.manifestJSON!==manifestText||digest(launch.manifestHash)!==manifestHash||digest(launch.contentHash)!==contentHash)throw Error('Cartridge manifest or release digest does not match.');
 if(keccak256(await codeAt(request,snapshot,archive))!==archiveCodeHash)throw Error('Cartridge archive code hash changed.');
 const bytes=new Uint8Array(length);let cursor=0;
 for(let index=0;index<chunks.length;index++){
  const size=Number(raw.chunkByteLengths[index]);if(!Number.isSafeInteger(size)||size<1||size>MAX_CHUNK_BYTES||cursor+size>length)throw Error('Cartridge chunk length exceeds its bound.');
  const code=await codeAt(request,snapshot,chunks[index],MAX_CHUNK_BYTES+1),part=getBytes(code);
  if(part.length!==size+1||part[0]!==0||keccak256(code)!==digest(raw.chunkCodeHashes[index]))throw Error('Cartridge chunk hash, STOP prefix or length changed.');
  bytes.set(part.subarray(1),cursor);cursor+=size;
 }
 if(cursor!==length||sha256(bytes)!==contentHash)throw Error('Cartridge content SHA-256 or length does not match.');
 const html=decoder.decode(bytes);
 await assertSnapshot(request,snapshot);
 const release=Object.freeze({publisher:addr(raw.publisher),archive,archiveCodeHash,contentHash,manifestHash,byteLength:length,manifestJSON:manifestText,chunks:Object.freeze(chunks.map(addr)),chunkCodeHashes:Object.freeze([...raw.chunkCodeHashes].map(digest)),chunkByteLengths:Object.freeze([...raw.chunkByteLengths].map(Number))});
 const recovered=Object.freeze({html,bytes,manifest,release,identity,registry:identity.registry,cartridgeId:authority.cartridgeId,releaseId,archive,archiveCodeHash,contentHash,snapshot,isolationNotice:CARTRIDGE_ISOLATION_NOTICE});
 verified.add(recovered);return recovered;
}

// This reduces initial navigation/resource surfaces; arbitrary full-DOM scripts
// remain able to attempt self-navigation. The notice above states that limit.
function gameDocument(html){
 if(typeof html!=='string'||utf8.encode(html).length>MAX_BYTES)throw Error('Cartridge HTML exceeds 1 MiB.');
 const document=parse(html),queue=[{node:document,depth:0}];let count=0;
 const media=value=>/^data:(?:image\/(?:png|jpeg|gif|webp|svg\+xml)|audio\/[a-z0-9.+-]+|video\/[a-z0-9.+-]+);/i.test(value);
 const css=value=>value.replace(/@import\b[^;]*(?:;|$)/gi,'').replace(/url\(\s*(['"]?)([^'"\)]+)\1\s*\)/gi,(_,quote,url)=>media(url.trim())?'url("'+url.trim().replaceAll('"','%22')+'")':'url("")');
 while(queue.length){const {node,depth}=queue.pop();if(++count>50_000||depth>256)throw Error('Cartridge HTML is too deeply nested or complex.');
  if(!node.childNodes)continue;const kept=[];
  for(const child of node.childNodes){const tag=child.tagName;
   if(['base','iframe','frame','frameset','object','embed','link','form'].includes(tag))continue;
   const attrs=child.attrs??[],attribute=name=>attrs.find(attr=>attr.name===name)?.value;
   if(tag==='meta'&&attribute('http-equiv'))continue;
   if(tag==='script'&&(attribute('src')||attribute('href')||attribute('xlink:href')))continue;
   child.attrs=attrs.filter(attr=>!['srcdoc','srcset','action','formaction','target','download','ping','nonce','integrity','crossorigin','background','manifest'].includes(attr.name)).filter(attr=>{
    if(['href','xlink:href'].includes(attr.name))return attr.value.startsWith('#');
    if(['src','poster'].includes(attr.name))return media(attr.value);
    if(attr.name==='style')attr.value=css(attr.value);return true;
   });
   if(tag==='style')for(const part of child.childNodes??[])if(part.nodeName==='#text')part.value=css(part.value);
   if(child.content)queue.push({node:child.content,depth:depth+1});
   kept.push(child);queue.push({node:child,depth:depth+1});
  }node.childNodes=kept;
 }
 // No nonce: hostile code could read a nonce and attach it to an external script.
 // unsafe-inline permits the game's bundled script while no source permits a URL.
 const csp="default-src 'none'; script-src 'unsafe-inline'; worker-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
 const policies=parseFragment(`<meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="referrer" content="no-referrer">`).childNodes;
 const head=document.childNodes.find(node=>node.tagName==='html')?.childNodes.find(node=>node.tagName==='head');
 if(!head)throw Error('Cartridge HTML has no document head.');
 for(const policy of policies)policy.parentNode=head;head.childNodes.unshift(...policies);
 return serialize(document);
}

/** A legacy game is isolated from the host, never given a wallet or RPC channel. */
export function mountCartridge({container,recovered,verifyContext,window:win=globalThis.window}){
 if(!verified.has(recovered)||typeof verifyContext!=='function'||!container?.ownerDocument||!win)throw Error('Launch requires a recovered owned cartridge and a custody verifier.');
 const iframe=container.ownerDocument.createElement('iframe');
 iframe.title=String(recovered.manifest.name??recovered.manifest.title??'Owned cartridge').slice(0,160)+' · isolated game';
 iframe.setAttribute('sandbox','allow-scripts');iframe.setAttribute('referrerpolicy','no-referrer');
 iframe.setAttribute('allow',"camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'; payment 'none'; usb 'none'; serial 'none'");
 iframe.srcdoc=gameDocument(recovered.html);
 let closed=false,loads=0,checking=false,timer,heartbeat;
 const destroy=()=>{if(closed)return;closed=true;win.clearTimeout(timer);win.clearInterval(heartbeat);iframe.onload=null;iframe.remove();};
 const check=async()=>{if(closed||checking)return;checking=true;try{await verifyContext(recovered.identity,recovered);}catch{destroy();}finally{checking=false;}};
 iframe.onload=()=>{if(++loads>1)destroy();};
 container.replaceChildren(iframe);timer=win.setTimeout(destroy,300_000);heartbeat=win.setInterval(check,5000);
 // A fresh check runs immediately as well as during play; it cannot grant the
 // frame authority, and any failure removes the entire frame.
 void check();
 return {iframe,destroy,get closed(){return closed;}};
}
