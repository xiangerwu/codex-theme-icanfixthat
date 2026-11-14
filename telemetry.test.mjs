import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createTelemetryReader} from './telemetry.mjs';
// Synthetic fixtures only: never read by the installed HUD.
const id='00000000-0000-0000-0000-000000000001';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'interlinked-test-'));
const file=path.join(dir,'rollout-'+id+'.jsonl');
const event=(type,payload)=>JSON.stringify({timestamp:'2026-01-01T00:00:00Z',type,payload})+'\n';
await fs.writeFile(file,event('session_meta',{id})+event('event_msg',{type:'task_started',turn_id:'t1',model_context_window:10000})+event('response_item',{type:'function_call',call_id:'c1'})+event('response_item',{type:'function_call',call_id:'c1'}));
const reader=createTelemetryReader(dir);
let d=await reader(id);assert.equal(d.tools,1);assert.equal(d.turns,1);assert.equal(d.tokens,null);
const token=event('event_msg',{type:'token_count',info:{last_token_usage:{total_tokens:2500},model_context_window:10000},rate_limits:{primary:{used_percent:37,window_minutes:10080,resets_at:2000000000},secondary:null}});
await fs.appendFile(file,token.slice(0,-1));assert.equal((await reader(id)).tokens,null);
await fs.appendFile(file,'\n');d=await reader(id);assert.equal(d.tokens,2500);assert.equal(d.window,10000);assert.equal(d.five,null);assert.equal(d.week.percent,37);
await fs.appendFile(file,event('event_msg',{type:'task_complete',turn_id:'t1',duration_ms:1234}));d=await reader(id);assert.equal(d.lastDurationMs,1234);assert.equal(d.status,'complete');
assert.equal(await reader('../bad'),null);assert.equal(await reader('00000000-0000-0000-0000-000000000002'),null);
console.log('Telemetry checks passed (deduplication, partial lines, missing limits, lifecycle, invalid/missing thread). Fixture: '+dir);
