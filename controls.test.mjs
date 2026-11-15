import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
const globalModules=execFileSync(process.platform==='win32'?'cmd.exe':'npm',process.platform==='win32'?['/d','/s','/c','npm root -g']:['root','-g'],{encoding:'utf8'}).trim();
const core=path.join(globalModules,'@codedrobe/core');
const {CdpSession,listCdpTargets}=await import(pathToFileURL(path.join(core,'src/cdp/session.mjs')));
const {default:adapter}=await import(pathToFileURL(path.join(core,'src/adapters/codex.mjs')));
const target=(await listCdpTargets(9335)).find(t=>adapter.matchTarget(t));
assert.ok(target,'Start Codex with CDP on port 9335 and apply this theme first.');
const session=await new CdpSession(target).open();
let original;
let originallyOpen = false;
const read=()=>session.evaluate(`(()=>{
 const q=s=>document.querySelector(s), c=q('#interlinked-controls'), h=q('#interlinked-hud'), w=q('#interlinked-weather');
 const style=(e,p)=>getComputedStyle(e,p), main=w.parentElement;
 const panel=q('#interlinked-control-panel'),r=panel.getBoundingClientRect(),hr=h.getBoundingClientRect(),cr=c.getBoundingClientRect();
 return {count:document.querySelectorAll('#interlinked-controls').length,open:c.open,storage:JSON.parse(localStorage.getItem('interlinked-controls-v1')),city:style(q('#interlinked-city')).display,cityZ:style(q('#interlinked-city')).zIndex,cityDistanceBlur:style(q('#interlinked-city svg')).filter,cityOpacity:style(q('#interlinked-city svg')).opacity,cityHeight:q('#interlinked-city svg').getBoundingClientRect().height/main.getBoundingClientRect().height,cityBlur:style(q('#interlinked-city')).filter,latticeZ:style(main,'::before').zIndex,latticeBlend:style(main,'::before').mixBlendMode,hud:style(h).display,hudWidth:hr.width,containerWidth:c.clientWidth,scan:style(main,'::after').display,scanZ:style(main,'::after').zIndex,scanDuration:style(main,'::after').animationDuration,glass:style(h).backdropFilter,lattice:style(main,'::before').filter,textFilter:style(h).filter,lightColor:style(w,'::before').backgroundImage,light:style(w,'::before').display,rain:style(w.querySelector('i')).display,rainCount:w.querySelectorAll('i:not([hidden])').length,rainDuration:style(w.querySelector('i')).animationDuration,lightOpacity:style(w,'::before').opacity,checkbox:style(c.querySelector('input[type=checkbox]')).appearance,motion:style(w,'::after').animationPlayState,edge:style(w,'::after').backgroundPosition,drop:style(w.querySelector('i')).transform,pointer:style(w).pointerEvents,overflow:panel.scrollWidth>panel.clientWidth,visible:r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,entryAboveHud:cr.bottom<=hr.top+1,focus:document.activeElement===c.querySelector('summary'),clip:{x:r.x,y:r.y,width:r.width,height:r.height,scale:1}};
})()`);
const set=(key,value)=>session.evaluate(`(()=>{const e=document.querySelector('#interlinked-controls input[data-setting="${key}"]');if(e.type==='checkbox')e.checked=${JSON.stringify(value)};else e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
try {
 originallyOpen=await session.evaluate(`document.querySelector('#interlinked-controls').open`);
 original=await session.evaluate(`Object.fromEntries([...document.querySelectorAll('#interlinked-controls input')].map(e=>[e.dataset.setting,e.type==='checkbox'?e.checked:e.type==='color'?e.value:Number(e.value)]))`);
 assert.equal(Object.keys(original).length,14);
 await session.evaluate(`(()=>{const c=document.querySelector('#interlinked-controls');if(!c.open)c.querySelector('summary').click()})()`);
 let s=await read();assert.equal(s.count,1);assert.equal(s.open,true);assert.equal(s.visible,true);assert.equal(s.overflow,false);assert.equal(s.entryAboveHud,true);assert.equal(s.pointer,'none');assert.equal(s.checkbox,'auto');assert.equal(s.scanZ,'-1');
 for(const key of ['city','rain','glass','light','scan','hud','motion'])await set(key,false);
 s=await read();assert.equal(s.city,'none');assert.equal(s.hud,'none');assert.equal(s.rain,'none');assert.equal(s.scan,'none');assert.equal(s.light,'none');assert.equal(s.glass,'none');assert.equal(s.lattice,'none');assert.equal(s.motion,'paused');
 await set('lightColor','#82baff');
 const blue=await read();assert.equal(blue.storage.lightColor,'#82baff');
 await set('lightColor','#ff6688');
 const pink=await read();assert.equal(pink.storage.lightColor,'#ff6688');assert.notEqual(blue.lightColor,pink.lightColor);
 // A hidden HUD must not hide its controls.
 assert.equal(s.visible,true);
 for(const key of ['city','rain','glass','light','scan','hud','motion'])await set(key,true);
 for(const [key,value] of Object.entries({rainAmount:85,rainSpeed:55,glassStrength:20,lightStrength:40,scanSpeed:9,hudSize:110}))await set(key,value);
 s=await read();assert.notEqual(s.city,'none');assert.equal(s.cityZ,'-2');assert.equal(s.cityDistanceBlur,'blur(3.5px)');assert.equal(s.cityOpacity,'0.62');assert.ok(Math.abs(s.cityHeight-.62)<.01);assert.equal(s.latticeZ,'-1');assert.equal(s.cityBlur,'blur(20px)');assert.equal(s.latticeBlend,'screen');assert.notEqual(s.hud,'none');assert.notEqual(s.rain,'none');assert.notEqual(s.scan,'none');assert.notEqual(s.light,'none');assert.match(s.glass,/blur\(20px\)/);assert.equal(s.lattice,'blur(20px)');assert.equal(s.textFilter,'none');assert.equal(s.scanDuration,'9s');assert.equal(s.motion,'running');assert.ok(s.hudWidth<=s.containerWidth+1,'HUD must fit at 110%');assert.equal(s.storage.rainAmount,85);assert.equal(s.rainCount,34);assert.equal(s.rainDuration,'9.24s');assert.equal(s.lightOpacity,'0.4');
 await new Promise(r=>setTimeout(r,450));const next=await read();assert.notEqual(s.edge,next.edge);assert.notEqual(s.drop,next.drop);
 await session.evaluate(`(()=>{const button=document.querySelector('#interlinked-control-panel button');button.focus();button.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));button.dispatchEvent(new KeyboardEvent('keyup',{key:'Escape',bubbles:true,cancelable:true}))})()`);
 s=await read();assert.equal(s.open,false);assert.equal(s.focus,true);
 await session.evaluate(`document.querySelector('#interlinked-controls summary').click();document.querySelector('#interlinked-controls [data-action="reset"]').click()`);
 s=await read();assert.equal(s.storage.city,true);assert.equal(s.storage.rain,false);assert.equal(s.storage.hudSize,100);assert.equal(s.storage.scanSpeed,16);assert.equal(s.storage.lightColor,'#ffe3a8');
 // Screenshot only our panel, with local-only output excluded by .gitignore.
 const shot=await session.send('Page.captureScreenshot',{format:'png',clip:s.clip,captureBeyondViewport:false});
 await fs.mkdir(new URL('./.runtime/',import.meta.url),{recursive:true});
 await fs.writeFile(new URL('./.runtime/controls-actual.png',import.meta.url),Buffer.from(shot.data,'base64'));
 console.log(JSON.stringify({passed:true,toggles:7,sliders:6,colorPicker:true,persistence:true,animatedRainAndBorder:true,keyboardEscape:true,reset:true,panelInsideViewport:true,scanBehindContent:true}));
} finally {
 if(original)for(const [key,value] of Object.entries(original))await set(key,value);
 await session.evaluate(`document.querySelector('#interlinked-controls').open=${originallyOpen}`);
 session.close();
}
