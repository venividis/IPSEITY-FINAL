import { mountWorkbench } from './app.mjs';
const params=new URLSearchParams(location.search),injected=globalThis.IPSEITY_MODULES??{};
const options=Object.fromEntries(['chainId','collection','tokenId','registry','cartridges'].map(key=>[key,String(injected[key]??params.get(key)??'')]));
options.originalHref=injected.originalHref??(options.tokenId?'/token/'+encodeURIComponent(options.tokenId)+'/live':'/');
options.initialTab=location.hash.slice(1);
const workbench=mountWorkbench(document.querySelector('#workbench'),options);
// A fragment selects a view only. Browser history and links between journal
// and cartridges can change the hash without loading a new document.
const selectView=()=>{
 const requested=location.hash.slice(1);
 const tab=['catalog','installed','history','journal','games'].includes(requested)?requested:'catalog';
 document.querySelector('#workbench [data-tab="'+tab+'"]').click();
};
addEventListener('hashchange',selectView);
addEventListener('pagehide',()=>{removeEventListener('hashchange',selectView);workbench.destroy();},{once:true});
