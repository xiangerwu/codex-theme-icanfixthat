# Interlinked · Codex Night-city HUD

[繁體中文](../README.md) | English

A local experimental Codex desktop port of the [Claude theme](https://github.com/xiangerwu/claude-theme-icanfixthat): a dark lattice backdrop, downward scanning light, portrait, context/limits columns, segmented meters and a status footer. Unknown values stay `—`.

## Install

Tested on Windows with Codex 26.1106.6628.0 and CodeDrobe Core 0.6.1. Requires Node.js 22.4+, npm and Git. Home and narrow layouts are not fully verified.

```powershell
npm install --global @codedrobe/core@0.6.1
git clone https://github.com/xiangerwu/codex-theme-icanfixthat.git
cd codex-theme-icanfixthat
node telemetry.test.mjs
node install.mjs
node pack.mjs
codedrobe apply --app codex --port 9335 --theme ./dist/interlinked-codex.codedrobe-theme --watch --restart-existing
```

Run the final command in an external terminal after saving your work: it restarts Codex. Keep one watcher running. Use `--no-launch` instead of `--restart-existing` if the renderer already exposes CDP.

The installer backs up three Core files before patching, requires version 0.6.1 and stops if source context differs. The full HUD needs this local Core patch; importing the theme package alone is insufficient. Core upgrades may overwrite the integration.

## Real data

The watcher reads only the selected local thread's rollout in `~/.codex/sessions`, validates its ID and clears unavailable/stale data. No credentials are read; no chat contents are transmitted.

Context means **last request tokens / reported model context window**, not precise live context occupancy. Limits are the latest recorded account snapshot, classified by 300/10080-minute windows. Expired or absent windows remain unknown. Reset countdown and elapsed markers derive from the reported window; pace uses a 10-percentage-point tolerance. Tool counts are unique outer calls; turn counts and duration come from lifecycle events. Conversation elapsed includes idle time. Token categories and failure counts remain unknown without reliable data.

## Private assets and motion

This repository excludes portraits, live screenshots, DOM snapshots, backups and packaged output. With no portrait, the HUD shows `NO SIGNAL`. Add your own permitted `assets/portrait.jpg` or `assets/portrait.png` and run `node pack.mjs`; the resulting local package contains that image, so do not publish it without permission.

The slow scan has an explicit local-user exception for reduced motion (16 seconds), without changing system settings. Remove the CSS rule marked `User-approved exception` to fully honor reduced-motion preferences.

## Verify and restore

Run `node telemetry.test.mjs`, then `codedrobe probe` / `codedrobe verify` with `--app codex --port 9335 --theme ./dist/interlinked-codex.codedrobe-theme`.

Stop the watcher with Ctrl+C, then run `codedrobe restore --app codex --port 9335`. Fully quit/reopen Codex if restart is required. Restore the three Core files from `backup-install-<timestamp>/` to their original relative paths under the global `@codedrobe/core` directory (`npm root -g`) to undo the code patch.

Project code: MIT. Core-derived patches: Apache-2.0, with license and notice in `patches/`. Private artwork is excluded from those licenses.
