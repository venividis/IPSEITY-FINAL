import { mountWorkbench } from './app.mjs';
const params=new URLSearchParams(location.search),injected=globalThis.IPSEITY_MODULES??{};
const options=Object.fromEntries(['chainId','collection','tokenId','registry','cartridges'].map(key=>[key,String(injected[key]??params.get(key)??'')]));
options.originalHref=injected.originalHref??(options.tokenId?'/token/'+encodeURIComponent(options.tokenId)+'/live':'/');
const workbench=mountWorkbench(document.querySelector('#workbench'),options);
addEventListener('pagehide',()=>workbench.destroy(),{once:true});
