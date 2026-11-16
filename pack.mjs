import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('.',import.meta.url));
const globalModules=execFileSync(process.platform==='win32'?'cmd.exe':'npm',process.platform==='win32'?['/d','/s','/c','npm root -g']:['root','-g'],{encoding:'utf8'}).trim();
const manifest=JSON.parse(await fs.readFile(path.join(root,'theme.json'),'utf8'));
for(const name of ['portrait.jpg','portrait.png']){
 try{await fs.access(path.join(root,'assets',name));manifest.images.portrait='assets/'+name;break;}catch{}
}
const local=path.join(root,'theme.local.json');
await fs.writeFile(local,JSON.stringify(manifest,null,2)+'\n');
await fs.mkdir(path.join(root,'dist'),{recursive:true});
execFileSync(process.execPath,[path.join(globalModules,'@codedrobe/core/bin/codedrobe.mjs'),'theme','pack',local,'--output',path.join(root,'dist/interlinked-codex.codedrobe-theme'),'--force'],{stdio:'inherit'});
console.log(manifest.images.portrait?'Portrait included in local package; see docs/AVATAR-CREDITS.md. Do not publish private replacements.':'No private portrait: HUD uses NO SIGNAL.');
