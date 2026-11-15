import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
const modules=execFileSync(process.platform==='win32'?'cmd.exe':'npm',process.platform==='win32'?['/d','/s','/c','npm root -g']:['root','-g'],{encoding:'utf8'}).trim();
const {CdpSession,listCdpTargets}=await import(pathToFileURL(path.join(modules,'@codedrobe/core/src/cdp/session.mjs')));
const session=await new CdpSession((await listCdpTargets(9335)).find(t=>t.url==='app://-/index.html')).open();
try {
 const result=await session.evaluate(`(()=>{
  const host=window.__CODEDROBE__?.hosts?.codex;if(!host)throw Error('Apply theme first');
  const fixture=document.createElement('main');fixture.className='main-surface';fixture.style.display='none';
  fixture.innerHTML='<div class="composer-surface-chrome"></div>';document.body.prepend(fixture);
  try {
   host.ensure();
   const hud=document.querySelector('#interlinked-hud');
   const composer=[...document.querySelectorAll('main :is(.composer-surface-chrome,[class*="ComposerLayoutRoot-"])')].find(e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0);
   return {attachedToVisibleComposer:!!composer&&hud?.nextElementSibling===composer,visible:!!hud&&hud.getBoundingClientRect().width>0,unique:document.querySelectorAll('#interlinked-hud').length===1,controlsBesideHud:document.querySelector('#interlinked-controls')?.nextElementSibling===hud,backgroundOutsideHiddenFixture:!fixture.contains(document.querySelector('#interlinked-weather'))};
  } finally {fixture.remove();host.ensure();}
 })()`);
 for(const [check,passed] of Object.entries(result))assert.equal(passed,true,check);
 console.log('Passed: hidden cached composer skipped; visible HUD, controls and background; one HUD.');
}finally{session.close()}
