import fs from 'node:fs/promises';
import path from 'node:path';
/** Replace a generated directory only after every new file is complete. */
export async function atomicDirectory(output, write) {
  output=path.resolve(output); await fs.mkdir(path.dirname(output),{recursive:true});
  const stage=await fs.mkdtemp(path.join(path.dirname(output),'.module-build-'));
  const backup=stage+'-previous';let moved=false;
  try { await write(stage);try {await fs.rename(output,backup);moved=true;}catch(error){if(error.code!=='ENOENT')throw error;}
    try {await fs.rename(stage,output);}catch(error){if(moved)await fs.rename(backup,output);throw error;}
    if(moved)await fs.rm(backup,{recursive:true});
  } finally {await fs.rm(stage,{recursive:true,force:true});}
}
