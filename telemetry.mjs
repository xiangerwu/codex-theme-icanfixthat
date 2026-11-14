import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const finite = v => typeof v === 'number' && Number.isFinite(v) && v >= 0;

// Read only the selected local thread; no account credentials or message text leave this module.
export function createTelemetryReader(root = path.join(os.homedir(), '.codex', 'sessions')) {
  let active = null;
  let files = [], indexedAt = 0;
  return async function read(threadId) {
    if (!uuid.test(threadId ?? '')) { active = null; return null; }
    try {
      if (!active || active.id !== threadId) {
        let relative = files.find(f => f.endsWith(`-${threadId}.jsonl`));
        if (!relative && Date.now() - indexedAt > 10000) {
          files = await fs.readdir(root, {recursive:true}); indexedAt = Date.now();
          relative = files.find(f => f.endsWith(`-${threadId}.jsonl`));
        }
        if (!relative) return null;
        active = {id:threadId, file:path.join(root,relative), offset:0, pending:Buffer.alloc(0), valid:false,
          started:new Set(), calls:new Set(), completed:new Set(), data:{threadId}};
      }
      const stat = await fs.stat(active.file);
      if (stat.size < active.offset) { active = null; return null; }
      if (stat.size > active.offset) {
        const handle = await fs.open(active.file,'r');
        let chunk;
        try {
          chunk=Buffer.alloc(stat.size-active.offset);
          const {bytesRead}=await handle.read(chunk,0,chunk.length,active.offset);
          chunk=chunk.subarray(0,bytesRead); active.offset+=bytesRead;
        } finally {await handle.close();}
        const buffer=Buffer.concat([active.pending,chunk]);
        const end=buffer.lastIndexOf(10);
        if(end>=0) {
          for(const line of buffer.subarray(0,end).toString('utf8').split('\n')) {
            let event; try {event=JSON.parse(line);} catch {active.valid=false; continue;}
            const p=event.payload ?? {};
            if(event.type==='session_meta') {
              active.valid=p.id===threadId;
              if(active.valid) active.data.startedAt=Date.parse(event.timestamp);
              continue;
            }
            if(!active.valid) continue;
            const d=active.data;
            if(event.type==='event_msg') {
              if(p.type==='task_started' && typeof p.turn_id==='string') {
                active.started.add(p.turn_id); d.activeTurn=p.turn_id; d.status='working';
                d.tokens=null; d.window=finite(p.model_context_window)?p.model_context_window:null;
              }
              if(p.type==='task_complete' && typeof p.turn_id==='string') {
                active.completed.add(p.turn_id);
                if(p.turn_id===d.activeTurn) d.status='complete';
                if(finite(p.duration_ms)) d.lastDurationMs=p.duration_ms;
              }
              if(p.type==='turn_aborted') d.status='aborted';
              if(p.type==='token_count') {
                d.observedAt=Date.parse(event.timestamp);
                const info=p.info;
                if(info) {
                  d.tokens=finite(info.last_token_usage?.total_tokens)?info.last_token_usage.total_tokens:null;
                  d.window=finite(info.model_context_window)&&info.model_context_window>0?info.model_context_window:null;
                }
                if(p.rate_limits) {
                  d.five=null; d.week=null;
                  for(const w of [p.rate_limits.primary,p.rate_limits.secondary]) {
                    if(!w || !finite(w.used_percent) || w.used_percent>100 || !finite(w.resets_at)) continue;
                    const value={percent:w.used_percent,resetAt:w.resets_at*1000,windowMinutes:w.window_minutes};
                    if(w.window_minutes===300) d.five=value;
                    if(w.window_minutes===10080) d.week=value;
                  }
                }
              }
            }
            if(event.type==='response_item' && ['function_call','custom_tool_call'].includes(p.type) && typeof p.call_id==='string') active.calls.add(p.call_id);
          }
          active.pending=buffer.subarray(end+1);
        } else active.pending=buffer;
      }
      if(!active.valid) return null;
      return {...active.data,turns:active.started.size,tools:active.calls.size,completed:active.completed.size,readAt:Date.now()};
    } catch { active=null; return null; }
  };
}
export const readTelemetry = createTelemetryReader();

export async function refreshHudTelemetry(session) {
  const id=await session.evaluate(`(()=>{const e=document.querySelector('[data-app-action-sidebar-thread-selected="true"][data-app-action-sidebar-thread-id]');return e?.getAttribute('data-app-action-sidebar-thread-id')??null;})()`);
  const threadId=typeof id==='string' && id.startsWith('local:')?id.slice(6):null;
  const data=await readTelemetry(threadId);
  // Recheck selection after IO: a route change must never show the previous thread's figures.
  await session.evaluate(`(()=>{const e=document.querySelector('[data-app-action-sidebar-thread-selected="true"][data-app-action-sidebar-thread-id]');const id=e?.getAttribute('data-app-action-sidebar-thread-id');window.__INTERLINKED_TELEMETRY__=id===${JSON.stringify(id)}?${JSON.stringify(data)}:null;})()`);
}
