'use strict';

/**
 * Claude Usage Monitor — Stream Deck Plugin
 *
 * Spawns a WSL2 Python script every 60 seconds, parses its JSON output,
 * and renders an SVG image onto the Stream Deck button.
 *
 * Token safety: the Python script reads ~/.claude/.credentials.json read-only
 * and NEVER calls the OAuth refresh endpoint. See project CLAUDE.md for why.
 *
 * Auto-recovery: polling continues during auth/network errors. When Claude Code
 * refreshes the token, the next poll succeeds silently.
 */

const { execFile } = require('child_process');
const WebSocket = require('ws');

// ── Config ────────────────────────────────────────────────────────────────────

const POLL_MS        = 60_000;
const WSL_TIMEOUT_MS = 20_000;

// $HOME is expanded by bash in WSL2, so this works for any Linux username.
// The install.sh script copies get-usage.py to this location.
const WSL_SCRIPT_CMD = 'python3 "$HOME/.local/share/claude-usage/get-usage.py" --json';

// ── Parse Stream Deck launch arguments ───────────────────────────────────────

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : null;
}

const port          = arg('-port');
const pluginUUID    = arg('-pluginUUID');
const registerEvent = arg('-registerEvent');

if (!port || !pluginUUID || !registerEvent) {
  process.stderr.write('[claude-usage] Missing required Stream Deck launch args\n');
  process.exit(1);
}

// ── State ─────────────────────────────────────────────────────────────────────

const contexts = new Set();  // active button contexts (one per placed button)
let ws;
let pollTimer    = null;
let lastData     = null;   // last successful-or-error result
let isConnected  = false;

// ── WebSocket connection ──────────────────────────────────────────────────────

function connect() {
  ws = new WebSocket(`ws://127.0.0.1:${port}`);

  ws.on('open', () => {
    isConnected = true;
    log('Connected, registering…');
    send({ event: registerEvent, uuid: pluginUUID });
    startPolling();
  });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    onMessage(msg);
  });

  ws.on('close', () => {
    isConnected = false;
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    log('WebSocket closed — reconnecting in 5s');
    setTimeout(connect, 5_000);
  });

  ws.on('error', (err) => {
    log(`WebSocket error: ${err.message}`);
    // 'close' event will fire next and handle reconnect
  });
}

function send(obj) {
  if (isConnected && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

// ── Stream Deck event handling ────────────────────────────────────────────────

function onMessage(msg) {
  switch (msg.event) {
    case 'willAppear':
      contexts.add(msg.context);
      // Show last known state immediately so there's no blank button
      if (lastData) {
        renderButton(msg.context, lastData);
      } else {
        setImage(msg.context, svgLoading());
      }
      break;

    case 'willDisappear':
      contexts.delete(msg.context);
      break;

    case 'keyDown':
      // Immediate refresh on button press
      fetchAndUpdate();
      break;
  }
}

// ── Polling ───────────────────────────────────────────────────────────────────

function startPolling() {
  fetchAndUpdate();
  pollTimer = setInterval(fetchAndUpdate, POLL_MS);
}

function fetchAndUpdate() {
  execFile(
    'wsl.exe',
    ['-e', 'bash', '-c', WSL_SCRIPT_CMD],
    { timeout: WSL_TIMEOUT_MS },
    (err, stdout, stderr) => {
      let data;

      if (err) {
        // wsl.exe itself failed (WSL not running, script not found, timeout, etc.)
        const msg = err.killed ? 'timed out' : (err.message || 'unknown').slice(0, 60);
        log(`wsl error: ${msg}`);
        data = { error: 'wsl-error', message: msg };
      } else {
        const raw = (stdout || '').trim();
        try {
          data = JSON.parse(raw);
        } catch {
          log(`JSON parse error — stdout: ${raw.slice(0, 100)}`);
          data = { error: 'parse-error', message: 'bad output from script' };
        }
      }

      lastData = data;
      for (const ctx of contexts) renderButton(ctx, data);
    },
  );
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function renderButton(context, data) {
  setImage(context, data.error ? svgError(data) : svgUsage(data));
}

function setImage(context, svg) {
  send({
    event: 'setImage',
    context,
    payload: {
      image: `data:image/svg+xml,${encodeURIComponent(svg)}`,
      target: 0,
    },
  });
}

function svgUsage(data) {
  const fh = data.five_hour        || {};
  const sd = data.seven_day        || {};
  const ss = data.seven_day_sonnet || {};

  const sessionPct = Math.round(fh.utilization ?? 0);
  const weeklyPct  = Math.round(sd.utilization ?? 0);
  const sonnetPct  = Math.round(ss.utilization ?? 0);
  const resetIn    = esc(fh.resets_in || '?');

  // Thresholds confirmed from Claude Code v2.1.52 binary:
  // five_hour alert fires at utilization=0.9 (90%)
  const sessionColor =
    sessionPct >= 90 ? '#ff4444' :
    sessionPct >= 60 ? '#ffaa00' : '#33cc77';

  return svg(`
    <text x="36" y="13" class="lbl">5h session</text>
    <text x="36" y="38" text-anchor="middle" dominant-baseline="middle"
          fill="${sessionColor}" font-size="26" font-weight="bold"
          font-family="monospace,sans-serif">${sessionPct}%</text>
    <text x="36" y="50" class="dim">&#x21BA; ${resetIn}</text>
    <line x1="12" y1="55" x2="60" y2="55" stroke="#2a2a2a" stroke-width="1"/>
    <text x="36" y="66" class="dim">7d ${weeklyPct}% &#x25C6;${sonnetPct}%</text>
  `);
}

function svgError(data) {
  const code   = data.error || 'error';
  const isAuth = code === 'auth-error';
  return svg(`
    <text x="36" y="26" text-anchor="middle"
          fill="#ff4444" font-size="10" font-family="sans-serif">${esc(code)}</text>
    <text x="36" y="44" class="dim">${isAuth ? 'open Claude Code' : 'retrying…'}</text>
    <text x="36" y="58" class="dim">press to retry</text>
  `);
}

function svgLoading() {
  return svg(`
    <text x="36" y="40" text-anchor="middle" dominant-baseline="middle"
          fill="#555555" font-size="11" font-family="sans-serif">loading&#x2026;</text>
  `);
}

function svg(inner) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72">` +
    `<rect width="72" height="72" fill="#0d1117"/>` +
    `<style>` +
    `.lbl{text-anchor:middle;fill:#555555;font-size:9px;font-family:sans-serif}` +
    `.dim{text-anchor:middle;fill:#666666;font-size:9px;font-family:monospace,sans-serif}` +
    `</style>` +
    inner +
    `</svg>`
  );
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function log(msg) {
  process.stderr.write(`[claude-usage] ${msg}\n`);
}

// ── Start ─────────────────────────────────────────────────────────────────────

connect();
