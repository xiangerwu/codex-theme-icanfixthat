import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync,spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('.',import.meta.url));
const globalModules=execFileSync(process.platform==='win32'?'cmd.exe':'npm',process.platform==='win32'?['/d','/s','/c','npm root -g']:['root','-g'],{encoding:'utf8'}).trim();
const core=path.join(globalModules,'@codedrobe','core');
const pkg=JSON.parse(await fs.readFile(path.join(core,'package.json'),'utf8'));
if(pkg.version!=='0.6.1') throw new Error('This patch requires @codedrobe/core 0.6.1; installed: '+pkg.version);
const patch=path.join(root,'patches','core-0.6.1.patch');
const check=(args)=>spawnSync('git',['apply','--ignore-space-change',...args,patch],{cwd:core,encoding:'utf8'});
const applied=check(['--reverse','--check']).status===0;
if(!applied){
 const result=check(['--check']);
 if(result.status!==0) throw new Error('Core differs from the expected version; no files changed.\n'+result.stderr);
 const backup=path.join(root,'backup-install-'+Date.now());
 for(const rel of ['src/adapters/codex.mjs','src/runtime/injector.mjs','src/runtime/profiles/codex-theme-v1.mjs']){
  const target=path.join(backup,rel);await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(path.join(core,rel),target);
 }
 console.log('Core backup: '+backup);
 const resultApply=check([]);if(resultApply.status!==0) throw new Error(resultApply.stderr);
}
await fs.copyFile(path.join(root,'telemetry.mjs'),path.join(core,'src/runtime/interlinked-telemetry.mjs'));
console.log(applied?'Patch already installed; telemetry synchronized.':'Patch installed; telemetry synchronized.');
