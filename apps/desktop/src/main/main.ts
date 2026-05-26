import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import https from 'https';
import http from 'http';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { autoUpdater } from 'electron-updater';

const isDev = !app.isPackaged;
const workspaceRoot = path.join(app.getPath('userData'), 'CreativeAutomationWorkspaceV3');

// Engines root: bundled as extraResources when packaged, at repo root in dev
const enginesRoot = isDev
  ? path.join(__dirname, '..', '..', '..', '..', 'engines')
  : path.join(process.resourcesPath, 'engines');

const illustratorEngineRoot = path.join(enginesRoot, 'illustrator');
const indesignEngineRoot = path.join(enginesRoot, 'indesign');

// === WORKSPACE ===

function ensureDir(dir: string) { fs.mkdirSync(dir, { recursive: true }); }

function ensureWorkspace() {
  ensureDir(workspaceRoot);
  [
    'projects', 'templates', 'jobs',
    'outputs/ai', 'outputs/pdf', 'outputs/png',
    'outputs/canva', 'outputs/diagnostics', 'outputs/logs',
    'logs', 'cache', 'integrations'
  ].forEach(folder => ensureDir(path.join(workspaceRoot, folder)));
  const versionFile = path.join(workspaceRoot, 'WORKSPACE_VERSION.json');
  if (!fs.existsSync(versionFile)) {
    fs.writeFileSync(versionFile, JSON.stringify({ version: '3.0.0-alpha', createdAt: new Date().toISOString() }, null, 2), 'utf8');
  }
}

function createWindow() {
  ensureWorkspace();
  const win = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 1120,
    minHeight: 760,
    title: 'Creative Automation Platform',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  if (isDev) win.loadURL('http://127.0.0.1:5173');
  else win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

// Register custom URL scheme so "creativeos://" opens / focuses the app
if (process.defaultApp) {
  if (process.argv.length >= 2) app.setAsDefaultProtocolClient('creativeos', process.execPath, [path.resolve(process.argv[1])]);
} else {
  app.setAsDefaultProtocolClient('creativeos');
}

app.whenReady().then(() => {
  createWindow();
  setupAutoUpdater();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// macOS: URL scheme open event (app already running)
app.on('open-url', (event, _url) => {
  event.preventDefault();
  const win = getMainWindow();
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  else createWindow();
});

// ── Auto-updater ──────────────────────────────────────────────────────────────

function getMainWindow(): BrowserWindow | null {
  return BrowserWindow.getAllWindows()[0] ?? null;
}

function setupAutoUpdater() {
  if (!app.isPackaged) return; // skip in dev

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    getMainWindow()?.webContents.send('platform:update', { status: 'checking' });
  });
  autoUpdater.on('update-available', (info) => {
    getMainWindow()?.webContents.send('platform:update', { status: 'available', version: info.version });
  });
  autoUpdater.on('update-not-available', () => {
    getMainWindow()?.webContents.send('platform:update', { status: 'current' });
  });
  autoUpdater.on('download-progress', (p) => {
    getMainWindow()?.webContents.send('platform:update', { status: 'downloading', percent: Math.round(p.percent) });
  });
  autoUpdater.on('update-downloaded', (info) => {
    getMainWindow()?.webContents.send('platform:update', { status: 'ready', version: info.version });
  });
  autoUpdater.on('error', (err) => {
    getMainWindow()?.webContents.send('platform:update', { status: 'error', message: err.message });
  });

  // Check immediately, then every 4 hours
  autoUpdater.checkForUpdates().catch(() => {});
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 60 * 60 * 1000);
}

ipcMain.handle('platform:checkForUpdates', async () => {
  if (!app.isPackaged) return { ok: false, message: 'Dev build — updates disabled' };
  try { await autoUpdater.checkForUpdates(); return { ok: true }; }
  catch (e: any) { return { ok: false, message: e.message }; }
});

ipcMain.handle('platform:installUpdate', async () => {
  autoUpdater.quitAndInstall(false, true);
  return { ok: true };
});

// === AUTOMATION ENGINE ===

let automationRunning = false;
const AUTOMATION_TIMEOUT_MS = 5 * 60 * 1000;

function sanitizeName(name: string): string {
  return String(name || 'creative_output').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
}

function nextVersionedName(baseName: string): string {
  const safeBase = sanitizeName(baseName).replace(/_v\d{3}$/i, '');
  // Legacy flat dirs
  const flatDirs = ['ai', 'pdf', 'png', 'indesign', 'figma', 'canva', 'adobe_express']
    .map(t => path.join(workspaceRoot, 'outputs', t));
  // New engine/template/date hierarchy — collect all leaf date-folders
  const hierDirs: string[] = [];
  for (const eng of ['illustrator', 'indesign']) {
    const engDir = path.join(workspaceRoot, 'outputs', eng);
    if (!fs.existsSync(engDir)) continue;
    try {
      for (const tmpl of fs.readdirSync(engDir)) {
        const tmplPath = path.join(engDir, tmpl);
        try { for (const d of fs.readdirSync(tmplPath)) hierDirs.push(path.join(tmplPath, d)); } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }
  const allDirs = [...flatDirs, ...hierDirs];
  for (let i = 1; i < 1000; i++) {
    const suffix = `_v${String(i).padStart(3, '0')}`;
    const candidate = `${safeBase}${suffix}`;
    const exists = allDirs.some(d =>
      fs.existsSync(path.join(d, `${candidate}.ai`)) ||
      fs.existsSync(path.join(d, `${candidate}_web.pdf`)) ||
      fs.existsSync(path.join(d, `${candidate}_print.pdf`)) ||
      fs.existsSync(path.join(d, `${candidate}_preview.png`))
    );
    if (!exists) return candidate;
  }
  return `${safeBase}_v999`;
}

function validateJob(job: any, engine: string = 'illustrator', requiredOverride?: string[]) {
  if (!job || typeof job !== 'object') throw new Error('Job must be an object.');
  if (!job.content || typeof job.content !== 'object') throw new Error('Job missing content object.');
  const defaultRequired = engine === 'indesign'
    ? ['DOC_TITLE', 'SECTION_EXECUTIVE_SUMMARY', 'SECTION_BODY']
    : ['TEXT_TITLE', 'TEXT_CHALLENGE', 'TEXT_SOLUTION', 'TEXT_RESULTS'];
  const required = requiredOverride ?? defaultRequired;
  for (const key of required) {
    if (!job.content[key] || !String(job.content[key]).trim()) {
      const err: any = new Error(`Missing required field: ${key}`);
      err.code = 'JOB_VALIDATION';
      throw err;
    }
  }
}

/** Read required field keys from a manifest's editable_objects (where required: true). */
function getManifestRequiredKeys(manifestPath: string): string[] | undefined {
  try {
    if (!fs.existsSync(manifestPath)) return undefined;
    const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (!m.editable_objects || typeof m.editable_objects !== 'object') return undefined;
    const keys = Object.entries(m.editable_objects as Record<string, any>)
      .filter(([, v]) => v?.required === true && v?.type === 'text')
      .map(([k]) => k);
    return keys.length > 0 ? keys : undefined;
  } catch { return undefined; }
}

function checkWritable(dir: string): boolean {
  try {
    ensureDir(dir);
    const test = path.join(dir, `.health_${Date.now()}`);
    fs.writeFileSync(test, 'ok');
    fs.unlinkSync(test);
    return true;
  } catch { return false; }
}

// === CANVA API ===

const CANVA_REDIRECT_PORT = 38472;
const CANVA_REDIRECT_URI = `http://localhost:${CANVA_REDIRECT_PORT}/callback`;
const CANVA_OAUTH_SCOPES = 'design:content:write design:content:read';
// Bundled first-party app credentials — set at build time via env vars.
// Users never need to enter these; they just click "Connect Canva".
const CANVA_BUILTIN_CLIENT_ID = process.env.CANVA_CLIENT_ID || '';
const CANVA_BUILTIN_CLIENT_SECRET = process.env.CANVA_CLIENT_SECRET || '';

interface CanvaCredentials {
  clientId?: string;
  clientSecret?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number; // unix ms
  apiToken?: string;  // legacy manual token (still supported)
}

function canvaConfigPath() { return path.join(workspaceRoot, 'integrations', 'canva_config.json'); }

function getCanvaCredentials(): CanvaCredentials {
  const configPath = canvaConfigPath();
  if (!fs.existsSync(configPath)) return {};
  try { return JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch { return {}; }
}

function saveCanvaCredentials(patch: Partial<CanvaCredentials>): void {
  ensureDir(path.join(workspaceRoot, 'integrations'));
  const existing = getCanvaCredentials();
  fs.writeFileSync(canvaConfigPath(), JSON.stringify({ ...existing, ...patch }, null, 2), 'utf8');
}

function getCanvaToken(): string | null {
  if (process.env.CANVA_API_TOKEN) return process.env.CANVA_API_TOKEN;
  const creds = getCanvaCredentials();
  return creds.accessToken || creds.apiToken || null;
}

function saveCanvaToken(token: string): void {
  saveCanvaCredentials({ apiToken: token, accessToken: token });
}

// === CLAUDE API KEY ===

function claudeConfigPath() { return path.join(workspaceRoot, 'integrations', 'claude_config.json'); }

function getClaudeApiKey(): string | null {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  const p = claudeConfigPath();
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')).apiKey || null; } catch { return null; }
}

function saveClaudeApiKey(key: string): void {
  ensureDir(path.join(workspaceRoot, 'integrations'));
  fs.writeFileSync(claudeConfigPath(), JSON.stringify({ apiKey: key }, null, 2), 'utf8');
}

function anthropicPost(body: object, apiKey: string, betas = 'prompt-caching-2024-07-31'): Promise<any> {
  return new Promise((resolve, reject) => {
    const json = JSON.stringify(body);
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': betas,
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(json),
      },
    }, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode ?? 0, data: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode ?? 0, data: raw }); }
      });
    });
    req.on('error', reject);
    req.write(json);
    req.end();
  });
}

function safelySend(event: Electron.IpcMainInvokeEvent, channel: string, payload: any): void {
  try { if (!event.sender.isDestroyed()) event.sender.send(channel, payload); } catch {}
}

function anthropicStreamChat(
  body: object,
  apiKey: string,
  event: Electron.IpcMainInvokeEvent,
): void {
  const json = JSON.stringify({ ...body, stream: true });
  const req = https.request({
    hostname: 'api.anthropic.com',
    path: '/v1/messages',
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'prompt-caching-2024-07-31',
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(json),
    },
  }, (res) => {
    if ((res.statusCode ?? 0) !== 200) {
      let raw = '';
      res.on('data', (c: Buffer) => { raw += c.toString(); });
      res.on('end', () => {
        try {
          const err = JSON.parse(raw);
          safelySend(event, 'platform:claude:chunk', { error: err?.error?.message || `API error ${res.statusCode}` });
        } catch {
          safelySend(event, 'platform:claude:chunk', { error: `API error ${res.statusCode}` });
        }
      });
      return;
    }
    let buffer = '';
    res.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';
      for (const part of parts) {
        for (const line of part.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;
          try {
            const parsed = JSON.parse(raw);
            if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta' && parsed.delta.text) {
              safelySend(event, 'platform:claude:chunk', { text: parsed.delta.text });
            }
            if (parsed.type === 'message_stop') {
              safelySend(event, 'platform:claude:chunk', { done: true });
            }
            if (parsed.type === 'error') {
              safelySend(event, 'platform:claude:chunk', { error: parsed.error?.message || 'Stream error' });
            }
          } catch {}
        }
      }
    });
    res.on('end', () => safelySend(event, 'platform:claude:chunk', { done: true }));
    res.on('error', (e: Error) => safelySend(event, 'platform:claude:chunk', { error: e.message }));
  });
  req.on('error', (e: Error) => safelySend(event, 'platform:claude:chunk', { error: e.message }));
  req.write(json);
  req.end();
}

function generatePKCE(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

async function refreshCanvaAccessToken(): Promise<string | null> {
  const creds = getCanvaCredentials();
  if (!creds.refreshToken || !creds.clientId || !creds.clientSecret) return null;
  const body = `grant_type=refresh_token&refresh_token=${encodeURIComponent(creds.refreshToken)}`;
  const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64');
  try {
    const res = await canvaFormRequest('/rest/v1/oauth/token', basic, body);
    if (res.status === 200 && res.data?.access_token) {
      const expiresAt = Date.now() + (res.data.expires_in ?? 3600) * 1000;
      saveCanvaCredentials({ accessToken: res.data.access_token, expiresAt, refreshToken: res.data.refresh_token || creds.refreshToken });
      return res.data.access_token;
    }
  } catch { /* fall through */ }
  return null;
}

async function getValidCanvaAccessToken(): Promise<string | null> {
  if (process.env.CANVA_API_TOKEN) return process.env.CANVA_API_TOKEN;
  const creds = getCanvaCredentials();
  const token = creds.accessToken || creds.apiToken;
  if (!token) return null;
  // Auto-refresh if expiring within 5 minutes
  if (creds.accessToken && creds.expiresAt && Date.now() > creds.expiresAt - 5 * 60 * 1000) {
    const refreshed = await refreshCanvaAccessToken();
    if (refreshed) return refreshed;
  }
  return token;
}

async function canvaUploadAsset(filePath: string, token: string): Promise<{ ok: boolean; assetId?: string; message?: string }> {
  const fileName = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase().slice(1);
  const mimeType = ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' } as Record<string, string>)[ext] || 'application/octet-stream';
  const fileBuffer = fs.readFileSync(filePath);
  const boundary = `----CapBoundary${crypto.randomBytes(8).toString('hex')}`;
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="name"\r\n\r\n${fileName}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="asset_data"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`),
    fileBuffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.canva.com',
      path: '/rest/v1/assets',
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length },
    }, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try {
          const d = JSON.parse(raw);
          const assetId = d?.asset?.id;
          if ((res.statusCode || 0) < 300 && assetId) resolve({ ok: true, assetId });
          else resolve({ ok: false, message: `Upload failed (${res.statusCode}): ${raw}` });
        } catch { resolve({ ok: false, message: `Upload failed: ${raw}` }); }
      });
    });
    req.on('error', e => resolve({ ok: false, message: e.message }));
    req.write(body);
    req.end();
  });
}

function canvaFormRequest(urlPath: string, basicAuth: string, body: string): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.canva.com',
      path: urlPath,
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode ?? 0, data: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode ?? 0, data: raw }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function canvaRequest(method: 'GET' | 'POST', urlPath: string, token: string, body?: object): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const json = body ? JSON.stringify(body) : undefined;
    const req = https.request({
      hostname: 'api.canva.com',
      path: urlPath,
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(json ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(json) } : {}),
      },
    }, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode ?? 0, data: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode ?? 0, data: raw }); }
      });
    });
    req.on('error', reject);
    if (json) req.write(json);
    req.end();
  });
}

async function pollCanvaAutofill(jobId: string, token: string, maxAttempts = 20): Promise<any> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 1500));
    const { status, data } = await canvaRequest('GET', `/rest/v1/autofills/${jobId}`, token);
    if (status !== 200) return { ok: false, message: `Canva API error ${status}: ${JSON.stringify(data)}` };
    const jobStatus = data?.job?.status;
    if (jobStatus === 'success') return { ok: true, design: data.job.result?.design };
    if (jobStatus === 'failed') return { ok: false, message: `Autofill job failed: ${JSON.stringify(data.job.error || data)}` };
  }
  return { ok: false, message: 'Canva autofill job timed out after 30 seconds' };
}

// === ERROR CATALOG ===
// Error catalog — translates technical failures into user-facing guidance for every engine.

const ERROR_CATALOG: Record<string, any> = {
  NODE_RUNTIME: {
    title: 'Automation runtime issue',
    user_message: 'The app could not start or run the local automation engine.',
    likely_causes: [
      'Runner script missing from the engines folder',
      'The app was moved after install and relative paths broke',
      'node_modules not installed (run npm install in the project root)',
    ],
    recovery_steps: [
      'Restart the app — most path issues resolve on relaunch.',
      'Open Diagnostics → Export Bundle and check that all engine script paths resolve.',
      'If scripts are missing, run: npm install --workspace apps/desktop in the project root.',
      'Check the Logs folder for the exact file path that failed.',
    ],
    actions: [{ label: 'Export Diagnostics', target: 'diagnostics' }, { label: 'Open Logs', target: 'logs' }],
  },
  ILLUSTRATOR_PERMISSION: {
    title: 'Illustrator permission blocked',
    user_message: 'macOS blocked the app from controlling Adobe Illustrator via AppleScript.',
    likely_causes: [
      'Automation permission for this app is off in System Settings',
      'Full Disk Access is not granted to this app or to Terminal',
      'Adobe Illustrator has never been launched on this machine',
      'The app was updated and macOS reset its permission entry',
    ],
    recovery_steps: [
      'Open System Settings → Privacy & Security → Automation.',
      'Find this app in the list and enable the Adobe Illustrator 2026 toggle.',
      'Also open Full Disk Access and enable this app, Adobe Illustrator, and Terminal.',
      'Launch Adobe Illustrator manually at least once before running automation.',
      'Relaunch this app, then click Run Preflight to confirm.',
    ],
    actions: [{ label: 'Automation Settings', target: 'automation' }, { label: 'Full Disk Access', target: 'fullDisk' }],
  },
  INDESIGN_PERMISSION: {
    title: 'InDesign permission blocked',
    user_message: 'macOS blocked the app from controlling Adobe InDesign via AppleScript.',
    likely_causes: [
      'Automation permission for this app is off in System Settings',
      'Full Disk Access is not granted',
      'Adobe InDesign has never been launched on this machine',
    ],
    recovery_steps: [
      'Open System Settings → Privacy & Security → Automation.',
      'Enable the Adobe InDesign toggle under this app.',
      'Also enable Full Disk Access for this app and for Terminal.',
      'Launch InDesign manually at least once, then relaunch this app.',
      'Run InDesign Preflight to confirm.',
    ],
    actions: [{ label: 'Automation Settings', target: 'automation' }, { label: 'Full Disk Access', target: 'fullDisk' }],
  },
  ILLUSTRATOR_NOT_RESPONDING: {
    title: 'Adobe app not responding',
    user_message: 'Illustrator or InDesign did not respond within the automation timeout.',
    likely_causes: [
      'The Adobe app is closed — it must be open before running automation',
      'A modal dialog is blocking the app (missing fonts, unsaved file prompt, crash report)',
      'The automation timed out after 5 minutes on a very large or complex document',
    ],
    recovery_steps: [
      'Open Illustrator or InDesign and dismiss any dialogs.',
      'Install any missing fonts if prompted on document open.',
      'Run Preflight to confirm the app is responding correctly.',
      'If the issue persists, force-quit and relaunch the Adobe app, then retry.',
    ],
    actions: [{ label: 'Open Logs', target: 'logs' }],
  },
  TEMPLATE_MISSING: {
    title: 'Template file missing',
    user_message: 'The source template file (.ai or .indd) could not be found.',
    likely_causes: [
      'The template file was moved, renamed, or deleted from the templates folder',
      'The manifest references a file that was never placed in the templates folder',
      'Wrong template ID was passed to the job',
    ],
    recovery_steps: [
      'Go to the Templates screen and open the templates folder.',
      'Confirm the .ai or .indd file is present and matches the manifest source_template field.',
      'If missing, re-place the file in the templates folder, then run Preflight again.',
    ],
    actions: [{ label: 'Open Templates Folder', target: 'templates' }],
  },
  TEMPLATE_OBJECT_MISSING: {
    title: 'Template text frame missing',
    user_message: 'The template is missing one or more required named text frames.',
    likely_causes: [
      'A text frame name was changed or deleted in the .ai or .indd file',
      'Text was converted to outlines, removing it from the text frame list',
      'The wrong template version is registered (an older file without the named frames)',
    ],
    recovery_steps: [
      'Open the template in Illustrator or InDesign and check the Layers panel.',
      'For Illustrator: required frame names are defined in the template manifest (editable_objects with required: true). Common names: TEXT_TITLE, TEXT_CHALLENGE_BODY.',
      'For InDesign: required names are DOC_TITLE, SECTION_EXECUTIVE_SUMMARY, SECTION_BODY.',
      'Rename or restore missing frames, save, and run Preflight again.',
    ],
    actions: [{ label: 'Open Templates Folder', target: 'templates' }],
  },
  EXPORT_FAILED: {
    title: 'Export failed',
    user_message: 'The app could not write one or more output files.',
    likely_causes: [
      'Output folder is not writable (check permissions)',
      'A blocking dialog appeared in the Adobe app during export',
      'Output name contains special characters that the filesystem rejects',
      'Disk is full or nearly full',
    ],
    recovery_steps: [
      'Open the Outputs folder and confirm it is accessible.',
      'Check Illustrator or InDesign for any open modal dialogs and dismiss them.',
      'Keep output names to letters, numbers, underscores, and hyphens only.',
      'Run Example Export from the engine screen to isolate the issue.',
    ],
    actions: [{ label: 'Open Outputs', target: 'outputs' }, { label: 'Open Logs', target: 'logs' }],
  },
  CANVA_HANDOFF: {
    title: 'Canva job failed',
    user_message: 'The Canva job could not be completed.',
    likely_causes: [
      'No Canva API token configured — the job runs in manual handoff mode',
      'API token is invalid or has expired',
      'The canva_design_id in the manifest does not match a brand template in your team',
      'Output folder is not writable',
    ],
    recovery_steps: [
      'Go to the Canva engine screen → Settings and re-enter a valid Canva API token.',
      'Confirm the token has the design:content:write scope in Canva Developer settings.',
      'For manual mode: open the handoff JSON in the canva outputs folder and apply it in Canva.',
      'Run System Check to confirm the workspace folder is writable.',
    ],
    actions: [{ label: 'Open Outputs', target: 'outputs' }],
  },
  CANVA_API_ERROR: {
    title: 'Canva API error',
    user_message: 'The Canva Connect API returned an error.',
    likely_causes: [
      'API token missing or expired',
      'Template ID is not a published brand template in your Canva team',
      'Canva rate limit hit — too many requests in a short window',
      'Network connectivity issue',
    ],
    recovery_steps: [
      'Verify your Canva API token has the design:content:write scope.',
      'Confirm the canva_design_id in the manifest is a published brand template.',
      'Wait 30 seconds and retry if you may have hit a rate limit.',
      'The job JSON has been saved — you can apply it manually in Canva as a fallback.',
    ],
    actions: [{ label: 'Open Outputs', target: 'outputs' }],
  },
  ADOBE_EXPRESS_ERROR: {
    title: 'Adobe Express job failed',
    user_message: 'The Adobe Express handoff job could not be completed.',
    likely_causes: [
      'No Adobe Express API credentials configured',
      'Template URN is invalid or the template has been deleted',
      'Network connectivity issue reaching the Adobe Express API',
    ],
    recovery_steps: [
      'Go to the Adobe Express engine screen and verify your API credentials are saved.',
      'Confirm the template URN in the manifest matches an active Adobe Express template.',
      'Check your internet connection and retry.',
      'The handoff file has been saved locally — you can open it manually in Adobe Express.',
    ],
    actions: [{ label: 'Open Outputs', target: 'outputs' }, { label: 'Open Logs', target: 'logs' }],
  },
  FIGMA_ERROR: {
    title: 'Figma job failed',
    user_message: 'The Figma automation job could not be completed.',
    likely_causes: [
      'Figma Personal Access Token is missing or invalid',
      'The Figma file key in the template manifest does not exist or is inaccessible',
      'Network connectivity issue reaching the Figma REST API',
      'The specified frame or node ID was not found in the Figma file',
    ],
    recovery_steps: [
      'Go to the Figma engine screen → Settings and verify your Personal Access Token.',
      'Confirm the token has read access to the Figma file.',
      'Check that the Figma file is not in a personal draft (team files only).',
      'Re-add the template using the Figma file URL to refresh the file key and node ID.',
    ],
    actions: [{ label: 'Open Logs', target: 'logs' }],
  },
  FIREFLY_ERROR: {
    title: 'Adobe Firefly image generation failed',
    user_message: 'Firefly could not generate the requested image.',
    likely_causes: [
      'Adobe credentials are missing or expired',
      'The prompt was rejected by Firefly content policy',
      'Network connectivity issue reaching the Adobe Firefly API',
      'Firefly API rate limit exceeded',
    ],
    recovery_steps: [
      'Go to Adobe Express settings and re-authenticate your Adobe account.',
      'Revise the image prompt to avoid restricted content.',
      'Wait a moment and retry — rate limits reset within a minute.',
      'If the issue persists, use Browse to pick a local image instead.',
    ],
    actions: [{ label: 'Open Logs', target: 'logs' }],
  },
  JOB_VALIDATION: {
    title: 'Job missing required content',
    user_message: 'The job cannot run because one or more required fields are empty.',
    likely_causes: [
      'A required field (Title, Challenge, Solution, or Results) was left blank',
      'The job was submitted before all required fields were filled in',
      'A batch row is missing required content',
    ],
    recovery_steps: [
      'Fill in all fields marked with * before exporting.',
      'For batch jobs, expand each row and ensure required fields are populated.',
      'Use Generate from Brief to auto-fill content, then review and export.',
    ],
    actions: [],
  },
  UNKNOWN: {
    title: 'Unknown error',
    user_message: 'An unexpected error occurred.',
    likely_causes: [
      'An unclassified error from the automation engine or Adobe API',
      'Unexpected response from macOS, Illustrator, InDesign, or a cloud API',
    ],
    recovery_steps: [
      'Open the Logs folder and read the full error message for clues.',
      'Run System Check to identify any configuration issues.',
      'Export a Diagnostics Bundle and check the full error log.',
      'Restart the app and retry the operation.',
    ],
    actions: [{ label: 'Export Diagnostics', target: 'diagnostics' }, { label: 'Open Logs', target: 'logs' }],
  },
};

function classifyError(message: string): string {
  const msg = String(message || '').toLowerCase();
  const msgNoPath = msg.replace(/\/[^\s]*/g, '').replace(/\\[^\s]*/g, '');

  // macOS Automation permission errors
  if (msgNoPath.includes('not allowed to send apple events') || msgNoPath.includes('-1743') || msgNoPath.includes('permission denied') || msgNoPath.includes('access denied')) {
    return msg.includes('indesign') ? 'INDESIGN_PERMISSION' : 'ILLUSTRATOR_PERMISSION';
  }

  // Timeout / not responding
  if (msg.includes('timed out') || msg.includes('timeout') || msg.includes('not responding') || msg.includes('sigterm')) return 'ILLUSTRATOR_NOT_RESPONDING';

  // Job content validation — check BEFORE template-object patterns so "missing required field: text_solution"
  // doesn't false-match the "missing" + "text_" template-frame check below.
  if (msg.includes('required field') || msg.includes('missing required') || msg.includes('required content field') || msg.includes('job_validation')) return 'JOB_VALIDATION';
  if (msgNoPath.includes('missing active job') || msgNoPath.includes('active job file')) return 'JOB_VALIDATION';

  // Template issues
  if (msg.includes('template') && (msg.includes('missing') || msg.includes('not found') || msg.includes('file not found'))) return 'TEMPLATE_MISSING';
  if (msg.includes('missing') && (msg.includes('text_') || msg.includes('frame') || msg.includes('object') || msg.includes('doc_') || msg.includes('section_'))) return 'TEMPLATE_OBJECT_MISSING';
  if (msg.includes('preflight failed') || msg.includes('missing text frames')) return 'TEMPLATE_OBJECT_MISSING';

  // Engine-specific cloud errors
  if (msg.includes('figma')) return 'FIGMA_ERROR';
  if (msg.includes('firefly') || msg.includes('image generation')) return 'FIREFLY_ERROR';
  if (msg.includes('adobe express') || msg.includes('express job')) return 'ADOBE_EXPRESS_ERROR';
  if (msg.includes('canva api') || msg.includes('autofill') || msg.includes('brand_template')) return 'CANVA_API_ERROR';
  if (msg.includes('canva')) return 'CANVA_HANDOFF';

  // Export / output issues
  if (msg.includes('export') && (msg.includes('fail') || msg.includes('error') || msg.includes('could not'))) return 'EXPORT_FAILED';
  if ((msg.includes('.pdf') || msg.includes('.png') || msg.includes('.ai') || msg.includes('.indd')) && msg.includes('not found')) return 'EXPORT_FAILED';

  // AppleScript runtime errors (script bugs, not permission)
  if (msg.includes('-1700') || msg.includes('-1728') || msg.includes("can't make") || msg.includes('expected type')) return 'NODE_RUNTIME';

  // Runner / process launch failures
  if (msg.includes('enoent') || msg.includes('spawn') || msg.includes('eacces') || msg.includes('runner script not found') || msg.includes('missing jsx')) return 'NODE_RUNTIME';

  return 'UNKNOWN';
}

function friendlyErrorPayload(message: string, ctx: Record<string, any> = {}) {
  const code = classifyError(message);
  const entry = ERROR_CATALOG[code] || ERROR_CATALOG['UNKNOWN'];
  return {
    ok: false,
    errorCode: code,
    errorTitle: entry.title,
    userMessage: entry.user_message,
    likelyCauses: entry.likely_causes,
    recoverySteps: entry.recovery_steps,
    technical: message,
    context: ctx
  };
}

function normalizeResult(result: any, ctx: Record<string, any> = {}) {
  if (result.timedOut) return friendlyErrorPayload('Automation timed out. Illustrator may be unresponsive or waiting on a dialog.', ctx);
  if (!result.ok) return friendlyErrorPayload(result.stderr || result.error || 'Unknown automation error.', ctx);
  return { ok: true, stdout: result.stdout, context: ctx };
}

function runElectronNode(script: string, args: string[] = [], extraEnv: Record<string, string> = {}): Promise<any> {
  return new Promise((resolve) => {
    const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1', ...extraEnv };
    execFile(
      process.execPath,
      [script, ...args],
      { env, timeout: AUTOMATION_TIMEOUT_MS, maxBuffer: 1024 * 1024 * 10 },
      (error, stdout, stderr) => {
        const timedOut = Boolean(error && (error.killed || (error as any).signal === 'SIGTERM'));
        resolve({ ok: !error, timedOut, stdout: stdout || '', stderr: stderr || '', error: error ? error.message : null });
      }
    );
  });
}

// Two-phase AppleScript execution: child process prepares JSX (no osascript),
// then main process calls osascript directly so macOS attributes the Apple Events
// to the Electron app (which holds the Automation permission), not the child binary.
async function runAppleScriptEngine(
  runnerPath: string,
  args: string[],
  env: Record<string, string>,
  action: string
): Promise<any> {
  // Phase 1: child prepares JSX and emits JSX_READY / APPLESCRIPT / LOG_PATH tokens
  const prep = await runElectronNode(runnerPath, args, env);
  if (!prep.ok) return normalizeResult(prep, { action });

  const jsxPath        = (prep.stdout.match(/JSX_READY:(.+)/))?.[1]?.trim();
  const appleScriptPath = (prep.stdout.match(/APPLESCRIPT:(.+)/))?.[1]?.trim();
  const logPath        = (prep.stdout.match(/LOG_PATH:(.+)/))?.[1]?.trim();
  const isPreflight    = prep.stdout.includes('IS_PREFLIGHT:1');

  if (!jsxPath || !appleScriptPath) {
    return friendlyErrorPayload('Runner did not emit JSX_READY — check runner script.', { action });
  }

  // Phase 2: main process runs osascript (has Automation permission)
  const osaResult = await new Promise<{ ok: boolean; error: string | null; stderr: string }>((resolve) => {
    execFile('osascript', [appleScriptPath, jsxPath], { timeout: AUTOMATION_TIMEOUT_MS }, (err, _stdout, stderr) => {
      resolve({ ok: !err, error: err ? err.message : null, stderr: stderr || '' });
    });
  });

  // Read the log file written by the JSX script
  let logContent = '';
  if (logPath && fs.existsSync(logPath)) {
    logContent = fs.readFileSync(logPath, 'utf8');
  }

  if (!osaResult.ok) {
    // Prefer osascript stderr (contains the actual Illustrator/AppleScript error message)
    // over err.message (which is just "Command failed: osascript ...").
    // Include any JSX log as context.
    const errorMsg = osaResult.stderr?.trim() || osaResult.error || 'Unknown automation error.';
    const techDetail = [errorMsg, logContent ? `\n--- JSX log ---\n${logContent}` : ''].join('').trim();
    const payload = friendlyErrorPayload(errorMsg, { action });
    return { ...payload, technical: techDetail };
  }

  if (isPreflight && logContent.includes('RESULT: FAIL')) {
    const missing = (logContent.match(/FAIL: Missing \S+/g) || []).join(', ');
    return friendlyErrorPayload(
      `Preflight failed — missing text frames: ${missing}. Open the template, check the Layers panel, and rename frames to match the manifest.`,
      { action }
    );
  }

  // Detect partial output failure — JSX ran but one or more expected files were not written
  if (!isPreflight && logContent) {
    const failLines = (logContent.match(/^FAIL: .+ not found$/gm) || []);
    if (failLines.length > 0) {
      return {
        ok: false,
        errorCode: 'OUTPUT_WRITE_FAILED',
        errorTitle: 'Output file(s) not written',
        userMessage: `The template ran but ${failLines.length} expected output file${failLines.length !== 1 ? 's were' : ' was'} not created: ${failLines.join('; ')}`,
        likelyCauses: [
          'Illustrator/InDesign could not save to the output folder — check disk permissions',
          'The output subdirectory was not created before the JSX ran',
          'A font or linked asset is missing, preventing the save',
        ],
        recoverySteps: [
          'Run Preflight to confirm the template is healthy',
          'Check that the outputs folder is writable',
          'Retry the export',
        ],
        technical: failLines.join('\n'),
        context: { action },
      };
    }
  }

  return normalizeResult(
    { ok: true, stdout: logContent ? `--- log ---\n${logContent}` : 'Automation completed.', stderr: '', error: null, timedOut: false },
    { action }
  );
}

async function runAutomationGuarded(task: () => Promise<any>) {
  if (automationRunning) return friendlyErrorPayload('Automation is already running. Wait for the current task to finish.', { action: 'mutex' });
  automationRunning = true;
  try { return await task(); }
  catch (err: any) { return friendlyErrorPayload(err.message || String(err), {}); }
  finally { automationRunning = false; }
}

// === ADOBE APP PROBING ===

async function probeApp(appName: string) {
  return new Promise<any>((resolve) => {
    const script = `try
tell application "${appName}" to return version
on error errMsg
return "ERROR: " & errMsg
end try`;
    execFile('osascript', ['-e', script], { timeout: 6000 }, (error, stdout) => {
      const value = String(stdout || '').trim();
      const ok = !error && !!value && !value.startsWith('ERROR:');
      resolve({ ok, version: value, error: error?.message });
    });
  });
}

async function probeAdobeAppRich(appName: string) {
  const runningScript = `tell application "System Events" to return exists application process "${appName}"`;
  const runningResult = await new Promise<string>((resolve) => {
    execFile('osascript', ['-e', runningScript], { timeout: 4000 }, (_e, stdout) => resolve(String(stdout || '').trim()));
  });

  const versionScript = `try\ntell application "${appName}" to return version\non error errMsg\nreturn "ERROR: " & errMsg\nend try`;
  const versionResult = await new Promise<{ ok: boolean; version: string; error: string | null }>((resolve) => {
    execFile('osascript', ['-e', versionScript], { timeout: 8000 }, (error, stdout) => {
      const v = String(stdout || '').trim();
      resolve({ ok: !error && !!v && !v.startsWith('ERROR:'), version: v, error: error?.message || null });
    });
  });

  return {
    running: runningResult.toLowerCase() === 'true',
    responding: versionResult.ok,
    version: versionResult.version,
    error: versionResult.error || (versionResult.version.startsWith('ERROR:') ? versionResult.version : null)
  };
}

// InDesign ships with a year in its process name (e.g. "Adobe InDesign 2025") so we
// can't use a fixed string. Use bundle-ID targeting for version and a fuzzy process check.
async function probeInDesign() {
  // Check if any process containing "InDesign" is running
  const runningScript = `tell application "System Events"
    set procs to name of every application process
    repeat with n in procs
      if n contains "InDesign" then return "true"
    end repeat
    return "false"
  end tell`;
  const runningResult = await new Promise<string>((resolve) => {
    execFile('osascript', ['-e', runningScript], { timeout: 5000 }, (_e, stdout) => resolve(String(stdout || '').trim()));
  });

  // Get version via bundle ID — works regardless of year suffix
  const versionScript = `try\ntell application id "com.adobe.InDesign" to return version\non error errMsg\nreturn "ERROR: " & errMsg\nend try`;
  const versionResult = await new Promise<{ ok: boolean; version: string; error: string | null }>((resolve) => {
    execFile('osascript', ['-e', versionScript], { timeout: 8000 }, (error, stdout) => {
      const v = String(stdout || '').trim();
      resolve({ ok: !error && !!v && !v.startsWith('ERROR:'), version: v, error: error?.message || null });
    });
  });

  return {
    running: runningResult.toLowerCase() === 'true',
    responding: versionResult.ok,
    version: versionResult.version,
    error: versionResult.error || (versionResult.version.startsWith('ERROR:') ? versionResult.version : null)
  };
}

// === IPC: CORE ===

ipcMain.handle('platform:workspace', async () => {
  ensureWorkspace();
  return { workspaceRoot, version: '3.0.0-alpha' };
});

let liveStatusCache: { result: any; at: number } | null = null;
const LIVE_STATUS_TTL_MS = 5000;

ipcMain.handle('platform:liveStatus', async () => {
  if (liveStatusCache && Date.now() - liveStatusCache.at < LIVE_STATUS_TTL_MS) return liveStatusCache.result;
  ensureWorkspace();

  const templatePath = path.join(illustratorEngineRoot, 'templates', 'CASE_STUDY_LETTER_MASTER_v001.ai');
  const manifestPath = path.join(illustratorEngineRoot, 'references', 'CASE_STUDY_LETTER_MASTER_v001.manifest.json');
  const templateExists = fs.existsSync(templatePath);
  const manifestExists = fs.existsSync(manifestPath);
  const outputsWritable = checkWritable(path.join(workspaceRoot, 'outputs', 'ai'));

  const illustrator = await probeAdobeAppRich('Adobe Illustrator');
  const indesign    = await probeInDesign();

  const indesignManifestExists = fs.existsSync(path.join(indesignEngineRoot, 'references', 'WHITEPAPER_LETTER_MASTER_v001.manifest.json'));
  const indesignTemplateExists = fs.existsSync(path.join(indesignEngineRoot, 'templates', 'WHITEPAPER_LETTER_MASTER_v001.indd'));

  const illustratorReady = illustrator.responding && templateExists && manifestExists;
  const illustratorDetail = illustrator.responding
    ? `v${illustrator.version} · Template ${templateExists ? '✓' : '✗'} · Manifest ${manifestExists ? '✓' : '✗'}`
    : illustrator.running ? 'Running but not responding — check for dialogs' : 'Not connected — open Illustrator and approve permissions';

  const indesignReady = indesign.responding && indesignManifestExists;
  const indesignDetail = indesign.responding
    ? `v${indesign.version} · Manifest ${indesignManifestExists ? '✓' : '✗'} · Template ${indesignTemplateExists ? '✓' : '✗ drop .indd to activate'}`
    : indesign.running
      ? 'Running but not responding — check for dialogs'
      : indesignManifestExists
        ? 'Scaffolded — open InDesign to activate'
        : 'Not running — open InDesign and approve Automation permissions';

  // Yellow = not running but manifests present (usable once opened)
  // Red = genuinely broken (no manifest, or running but not responding)
  const indesignColor = indesignReady ? 'green'
    : indesign.running ? 'yellow'
    : indesignManifestExists ? 'yellow'
    : 'red';

  const result = {
    system: { label: 'System', color: outputsWritable ? 'green' : 'red', ready: outputsWritable, detail: outputsWritable ? 'Workspace writable' : 'Workspace not writable' },
    illustrator: {
      label: 'Illustrator',
      color: illustratorReady ? 'green' : illustrator.running ? 'yellow' : 'red',
      ready: illustratorReady,
      detail: illustratorDetail,
      templateExists,
      manifestExists
    },
    indesign: {
      label: 'InDesign',
      color: indesignColor,
      ready: indesignReady,
      detail: indesignDetail,
      templateExists: indesignTemplateExists,
      manifestExists: indesignManifestExists,
    },
    canva: (() => {
      const token = getCanvaToken();
      return { label: 'Canva', color: token ? 'green' : 'yellow', ready: true, detail: token ? 'API token configured' : 'Manual handoff mode — add API token to enable automation' };
    })(),
    claude: { label: 'Claude', color: 'yellow', ready: true, detail: 'Skill-ready architecture present' },
    queue: { label: 'Queue', color: automationRunning ? 'yellow' : 'green', ready: !automationRunning, detail: automationRunning ? 'Running…' : 'Idle' },
    figma: (() => {
      const cfg = readFigmaConfig();
      const hasTok = !!cfg.token;
      const figmaRefsDir = path.join(enginesRoot, 'figma', 'references');
      let figmaTemplateCount = 0;
      if (fs.existsSync(figmaRefsDir)) {
        try { figmaTemplateCount = fs.readdirSync(figmaRefsDir).filter(f => f.endsWith('.manifest.json')).length; } catch { }
      }
      return { label: 'Figma', color: hasTok && figmaTemplateCount > 0 ? 'green' : hasTok ? 'yellow' : 'gray',
        ready: hasTok && figmaTemplateCount > 0,
        detail: hasTok ? (figmaTemplateCount > 0 ? `Token set · ${figmaTemplateCount} file${figmaTemplateCount !== 1 ? 's' : ''} registered` : 'Token set — add a Figma file to activate') : 'Add Personal Access Token to connect' };
    })(),
  };
  liveStatusCache = { result, at: Date.now() };
  return result;
});

ipcMain.handle('platform:engineProfiles', async () => [
  { id: 'illustrator', label: 'Illustrator', positioning: 'High-impact visual layouts and single-page design systems.', bestFor: ['case study one-sheets', 'posters', 'social graphics', 'custom visuals'], automationModel: 'Local Adobe JSX automation', status: 'implemented' },
  { id: 'indesign', label: 'InDesign', positioning: 'Editorial production, whitepapers, reports, and multi-page documents.', bestFor: ['case studies', 'whitepapers', 'reports', 'brochures'], automationModel: 'InDesign JSX profile scaffold', status: 'scaffolded' },
  { id: 'canva', label: 'Canva', positioning: 'Collaborative team templates and quick campaign assets.', bestFor: ['social posts', 'campaign kits', 'team templates'], automationModel: getCanvaToken() ? 'Canva Connect API autofill' : 'Manual handoff — add CANVA_API_TOKEN to enable automation', status: getCanvaToken() ? 'implemented' : 'manual' },
  { id: 'hybrid', label: 'Hybrid', positioning: 'Multi-engine creative production pipelines.', bestFor: ['campaign systems', 'multi-channel launches', 'enterprise workflows'], automationModel: 'Routes jobs across engines', status: 'planned' }
]);

ipcMain.handle('platform:createProject', async (_event, project) => {
  try {
    ensureWorkspace();
    const id = project.id || `project_${Date.now()}`;
    const now = new Date().toISOString();
    const record = { ...project, id, createdAt: now, updatedAt: now, status: project.status || 'draft' };
    fs.writeFileSync(path.join(workspaceRoot, 'projects', `${id}.json`), JSON.stringify(record, null, 2), 'utf8');
    return { ok: true, project: record };
  } catch (e: any) { return { ok: false, message: e.message }; }
});

ipcMain.handle('platform:listProjects', async () => {
  try {
    ensureWorkspace();
    const dir = path.join(workspaceRoot, 'projects');
    const results: any[] = [];
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
      try { results.push(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))); } catch { /* skip corrupt file */ }
    }
    return results;
  } catch { return []; }
});

ipcMain.handle('platform:linkOutputToProject', async (_event, projectId: string, output: { path: string; name: string; type: string; engine: string }) => {
  ensureWorkspace();
  const projectPath = path.join(workspaceRoot, 'projects', `${projectId}.json`);
  if (!fs.existsSync(projectPath)) return { ok: false, message: 'Project not found' };
  let project: any;
  try { project = JSON.parse(fs.readFileSync(projectPath, 'utf8')); }
  catch { return { ok: false, message: 'Project file is corrupt' }; }
  const outputs: any[] = project.outputs || [];
  if (!outputs.find((o: any) => o.path === output.path)) {
    outputs.push({ ...output, linkedAt: new Date().toISOString() });
  }
  const updated = { ...project, outputs, updatedAt: new Date().toISOString() };
  fs.writeFileSync(projectPath, JSON.stringify(updated, null, 2), 'utf8');
  return { ok: true, project: updated };
});

ipcMain.handle('platform:deleteProject', async (_event, id: string) => {
  try {
    ensureWorkspace();
    const projectPath = path.join(workspaceRoot, 'projects', `${id}.json`);
    if (fs.existsSync(projectPath)) fs.unlinkSync(projectPath);
    return { ok: true };
  } catch (e: any) { return { ok: false, message: e.message }; }
});

// Dirs that should never appear in output listings
const OUTPUT_EXCLUDE_DIRS = new Set(['logs', 'diagnostics', 'jobs']);
// File extensions that are real production outputs (not job metadata)
const OUTPUT_EXTENSIONS = new Set(['ai', 'pdf', 'png', 'jpg', 'jpeg', 'idml', 'indd', 'svg', 'json', 'md']);

function inferEngine(fullPath: string): string {
  if (fullPath.includes('/canva/'))         return 'canva';
  if (fullPath.includes('/adobe_express/')) return 'adobe_express';
  if (fullPath.includes('/indesign/'))      return 'indesign';
  if (fullPath.includes('/figma/'))         return 'figma';
  return 'illustrator';
}

ipcMain.handle('platform:listOutputs', async () => {
  ensureWorkspace();
  const outputsRoot = path.join(workspaceRoot, 'outputs');
  const records: any[] = [];
  function walk(dir: string) {
    if (!fs.existsSync(dir)) return;
    for (const item of fs.readdirSync(dir)) {
      if (item.startsWith('.')) continue;
      const full = path.join(dir, item);
      try {
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          // Skip excluded top-level dirs (logs, diagnostics, jobs)
          const rel = path.relative(outputsRoot, full);
          const topSeg = rel.split(path.sep)[0];
          if (OUTPUT_EXCLUDE_DIRS.has(topSeg)) continue;
          walk(full);
        } else {
          const ext = path.extname(item).replace('.', '').toLowerCase();
          if (!OUTPUT_EXTENSIONS.has(ext)) continue;
          // Derive template and date from new organised path structure
          // Structure: outputs/{engine}/{templateId}/{date}/{file}
          const rel = path.relative(outputsRoot, full);
          const segs = rel.split(path.sep);
          const engine = inferEngine(full);
          const templateId = segs.length >= 3 ? segs[segs.length - 3] : null;
          const dateFolder = segs.length >= 2 ? segs[segs.length - 2] : null;
          const groupId = segs.length >= 3 ? segs.slice(0, segs.length - 1).join('/') : rel;
          records.push({
            id: Buffer.from(full).toString('base64'),
            name: item,
            path: full,
            type: ext || 'file',
            engine,
            templateId,
            dateFolder,
            groupId,
            status: 'success',
            createdAt: stat.mtime.toISOString(),
          });
        }
      } catch { /* skip broken symlinks */ }
    }
  }
  walk(outputsRoot);
  return records.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 200);
});

// Returns outputs structured as groups: engine → templateId → date folder → files
ipcMain.handle('platform:listOutputGroups', async () => {
  ensureWorkspace();
  const outputsRoot = path.join(workspaceRoot, 'outputs');
  if (!fs.existsSync(outputsRoot)) return [];

  const groups: any[] = [];
  let engines: string[];
  try { engines = fs.readdirSync(outputsRoot); } catch { return []; }

  for (const engine of engines) {
    if (OUTPUT_EXCLUDE_DIRS.has(engine) || engine.startsWith('.')) continue;
    const engineDir = path.join(outputsRoot, engine);
    try { if (!fs.statSync(engineDir).isDirectory()) continue; } catch { continue; }

    let templateIds: string[];
    try { templateIds = fs.readdirSync(engineDir); } catch { continue; }

    for (const templateId of templateIds) {
      if (templateId.startsWith('.')) continue;
      const templateDir = path.join(engineDir, templateId);
      try { if (!fs.statSync(templateDir).isDirectory()) continue; } catch { continue; }

      let dateFolders: string[];
      try { dateFolders = fs.readdirSync(templateDir); } catch { continue; }

      for (const dateFolder of dateFolders) {
        if (dateFolder.startsWith('.')) continue;
        const dateDir = path.join(templateDir, dateFolder);
        try { if (!fs.statSync(dateDir).isDirectory()) continue; } catch { continue; }

        let fileNames: string[];
        try { fileNames = fs.readdirSync(dateDir); } catch { continue; }

        const files = fileNames
          .filter(f => !f.startsWith('.'))
          .map(f => {
            const fp = path.join(dateDir, f);
            try {
              const stat = fs.statSync(fp);
              const ext = path.extname(f).replace('.', '').toLowerCase();
              return { id: Buffer.from(fp).toString('base64'), name: f, path: fp, type: ext, engine, createdAt: stat.mtime.toISOString() };
            } catch { return null; }
          })
          .filter(Boolean) as any[];

        if (files.length === 0) continue;

        const latestAt = files.reduce((max: string, f: any) => f.createdAt > max ? f.createdAt : max, '');
        groups.push({
          id: `${engine}/${templateId}/${dateFolder}`,
          engine,
          templateId,
          dateFolder,
          folderPath: dateDir,
          files: files.sort((a: any, b: any) => a.name.localeCompare(b.name)),
          latestAt,
        });
      }
    }
  }
  return groups.sort((a, b) => b.latestAt.localeCompare(a.latestAt));
});

// Create a named output folder for a custom batch/run
ipcMain.handle('platform:createOutputFolder', async (_event, payload: { name: string; engine?: string }) => {
  const { name, engine } = payload || {};
  if (!name?.trim()) return { ok: false, message: 'Folder name is required.' };
  const safeName = name.trim().replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_').slice(0, 80);
  if (!safeName) return { ok: false, message: 'Folder name contains no valid characters.' };
  const dateStr = new Date().toISOString().slice(0, 10);
  const folderPath = engine
    ? path.join(workspaceRoot, 'outputs', engine, safeName, dateStr)
    : path.join(workspaceRoot, 'outputs', 'custom', safeName, dateStr);
  try {
    fs.mkdirSync(folderPath, { recursive: true });
    return { ok: true, folderPath, relativePath: path.relative(workspaceRoot, folderPath) };
  } catch (e: any) {
    return { ok: false, message: e.message };
  }
});

ipcMain.handle('platform:openPath', async (_event, target) => {
  ensureWorkspace();
  const map: Record<string, string> = {
    workspace:    workspaceRoot,
    outputs:             path.join(workspaceRoot, 'outputs'),
    outputs_illustrator: path.join(workspaceRoot, 'outputs', 'illustrator'),
    outputs_indesign:    path.join(workspaceRoot, 'outputs', 'indesign'),
    outputs_canva:       path.join(workspaceRoot, 'outputs', 'canva'),
    outputs_adobe_express: path.join(workspaceRoot, 'outputs', 'adobe_express'),
    outputs_figma:       path.join(workspaceRoot, 'outputs', 'figma'),
    // Legacy paths kept for backward compat (old flat structure may still exist)
    outputs_ai:          path.join(workspaceRoot, 'outputs', 'ai'),
    outputs_pdf:         path.join(workspaceRoot, 'outputs', 'pdf'),
    outputs_png:         path.join(workspaceRoot, 'outputs', 'png'),
    canva_outputs:       path.join(workspaceRoot, 'outputs', 'canva'),
    adobe_outputs:       path.join(workspaceRoot, 'outputs', 'adobe_express'),
    logs:                path.join(workspaceRoot, 'outputs', 'logs'),
    templates:    path.join(workspaceRoot, 'templates'),
    // Engines root + per-engine folders
    engines:                      enginesRoot,
    engines_illustrator:          path.join(enginesRoot, 'illustrator'),
    engines_illustrator_templates: path.join(enginesRoot, 'illustrator', 'templates'),
    engines_illustrator_references: path.join(enginesRoot, 'illustrator', 'references'),
    engines_illustrator_scripts:  path.join(enginesRoot, 'illustrator', 'scripts'),
    engines_indesign:             path.join(enginesRoot, 'indesign'),
    engines_indesign_templates:   path.join(enginesRoot, 'indesign', 'templates'),
    engines_indesign_references:  path.join(enginesRoot, 'indesign', 'references'),
    engines_indesign_scripts:     path.join(enginesRoot, 'indesign', 'scripts'),
    engines_canva:                path.join(enginesRoot, 'canva'),
    engines_canva_references:     path.join(enginesRoot, 'canva', 'references'),
    engines_adobe_express:        path.join(enginesRoot, 'adobe_express'),
    engines_adobe_express_references: path.join(enginesRoot, 'adobe_express', 'references'),
    engines_hybrid:               path.join(enginesRoot, 'hybrid'),
    // macOS privacy prefs
    automation:   'x-apple.systempreferences:com.apple.preference.security?Privacy_Automation',
    fullDisk:     'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles',
    accessibility: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
  };
  const value = map[target] || workspaceRoot;
  if (value.startsWith('x-apple.systempreferences:')) await shell.openExternal(value);
  else await shell.openPath(value);
  return { ok: true, target: value };
});

// ── File reveal / open ────────────────────────────────────────────────────────
// Reveal a specific file in Finder (highlights the file, opens its parent folder).
ipcMain.handle('platform:revealFile', async (_event, filePath: string) => {
  if (!filePath || typeof filePath !== 'string') return { ok: false, message: 'No path provided' };
  if (!fs.existsSync(filePath)) return { ok: false, message: 'File not found: ' + filePath };
  shell.showItemInFolder(filePath);
  return { ok: true, path: filePath };
});

// Send a native OS notification.
ipcMain.handle('platform:sendNotification', async (_event, title: string, body: string) => {
  const { Notification } = await import('electron');
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
  return { ok: true };
});

// Open a file with its default app (e.g. PDF → Preview, .ai → Illustrator).
ipcMain.handle('platform:openFile', async (_event, filePath: string) => {
  if (!filePath || typeof filePath !== 'string') return { ok: false, message: 'No path provided' };
  if (!fs.existsSync(filePath)) return { ok: false, message: 'File not found: ' + filePath };
  await shell.openPath(filePath);
  return { ok: true, path: filePath };
});

ipcMain.handle('platform:openUrl', async (_event, url: string) => {
  if (!url || !url.startsWith('https://')) return { ok: false, message: 'Invalid URL — must start with https://' };
  await shell.openExternal(url);
  return { ok: true };
});

// ── Engines folder tree scanner ───────────────────────────────────────────────
ipcMain.handle('platform:scanEnginesFolder', async () => {
  if (!fs.existsSync(enginesRoot)) return { ok: false, message: 'Engines root not found.', tree: [] };

  function scanDir(dir: string, relBase: string): any[] {
    const entries: any[] = [];
    let items: string[];
    try { items = fs.readdirSync(dir).sort(); } catch { return entries; }
    for (const item of items) {
      if (item.startsWith('.')) continue;
      const full = path.join(dir, item);
      const rel  = path.join(relBase, item);
      let stat: fs.Stats;
      try { stat = fs.statSync(full); } catch { continue; }
      if (stat.isDirectory()) {
        entries.push({ type: 'dir', name: item, path: full, rel, children: scanDir(full, rel) });
      } else {
        const ext = path.extname(item).replace('.', '').toLowerCase();
        const sizeKb = Math.round(stat.size / 1024);
        entries.push({ type: 'file', name: item, path: full, rel, ext, sizeKb, mtime: stat.mtime.toISOString() });
      }
    }
    return entries;
  }

  const tree = scanDir(enginesRoot, '');
  return { ok: true, enginesRoot, tree };
});

ipcMain.handle('platform:generateCanvaHandoff', async (_event, payload) => {
  try {
    ensureWorkspace();
    const safeName = String(payload.outputName || 'canva_handoff').replace(/[^a-zA-Z0-9_-]/g, '_');
    const outDir = path.join(workspaceRoot, 'outputs', 'canva');
    ensureDir(outDir);
    const markdown = `# Canva Handoff Package\n\n## Project\n${payload.projectName || 'Untitled Project'}\n\n## Title\n${payload.title || ''}\n\n## Challenge\n${payload.challenge || ''}\n\n## Solution\n${payload.solution || ''}\n\n## Results\n${payload.results || ''}\n\n## CTA\n${payload.cta || 'Learn More'}\n`;
    const mdPath = path.join(outDir, `${safeName}_canva_handoff.md`);
    const jsonPath = path.join(outDir, `${safeName}_canva_handoff.json`);
    fs.writeFileSync(mdPath, markdown, 'utf8');
    fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), 'utf8');
    return { ok: true, files: [mdPath, jsonPath], markdown };
  } catch (e: any) { return { ok: false, message: e.message }; }
});

// === IPC: CANVA OAUTH + TOKEN ===

ipcMain.handle('platform:setCanvaToken', async (_event, token: string) => {
  if (!token?.trim()) return { ok: false, message: 'Token cannot be empty' };
  saveCanvaToken(token.trim());
  return { ok: true };
});

ipcMain.handle('platform:getCanvaToken', async () => {
  const token = getCanvaToken();
  return { ok: true, hasToken: !!token, masked: token ? `${token.slice(0, 6)}...${token.slice(-4)}` : null };
});

ipcMain.handle('platform:getCanvaCredentials', async () => {
  const creds = getCanvaCredentials();
  const token = creds.accessToken || creds.apiToken;
  const effectiveClientId = CANVA_BUILTIN_CLIENT_ID || creds.clientId;
  const hasOAuth = !!(effectiveClientId && creds.refreshToken);
  const expirySecs = creds.expiresAt ? Math.round((creds.expiresAt - Date.now()) / 1000) : null;
  return {
    ok: true,
    hasToken: !!token,
    hasOAuth,
    hasRefreshToken: !!creds.refreshToken,
    hasBundledCredentials: !!(CANVA_BUILTIN_CLIENT_ID && CANVA_BUILTIN_CLIENT_SECRET),
    clientId: effectiveClientId ? `${effectiveClientId.slice(0, 8)}…` : null,
    masked: token ? `${token.slice(0, 8)}…${token.slice(-4)}` : null,
    expirySecs,
    expiresAt: creds.expiresAt || null,
  };
});

ipcMain.handle('platform:setCanvaCredentials', async (_event, clientId: string, clientSecret: string) => {
  if (!clientId?.trim() || !clientSecret?.trim()) return { ok: false, message: 'Client ID and Client Secret are required' };
  saveCanvaCredentials({ clientId: clientId.trim(), clientSecret: clientSecret.trim() });
  return { ok: true };
});

ipcMain.handle('platform:startCanvaOAuth', async () => {
  const stored = getCanvaCredentials();
  const clientId = CANVA_BUILTIN_CLIENT_ID || stored.clientId;
  const clientSecret = CANVA_BUILTIN_CLIENT_SECRET || stored.clientSecret;
  if (!clientId || !clientSecret) {
    return { ok: false, message: 'Canva credentials are not configured in this build. Use the advanced panel to enter your own Client ID and Secret.' };
  }

  const { verifier, challenge } = generatePKCE();
  const state = crypto.randomBytes(16).toString('hex');

  const authUrl = new URL('https://www.canva.com/api/oauth/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', CANVA_OAUTH_SCOPES);
  authUrl.searchParams.set('redirect_uri', CANVA_REDIRECT_URI);
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('state', state);

  return new Promise<{ ok: boolean; message?: string }>((resolve) => {
    let resolved = false;
    const done = (result: { ok: boolean; message?: string }) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      server.close();
      resolve(result);
    };

    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url!, `http://localhost:${CANVA_REDIRECT_PORT}`);
        const code = url.searchParams.get('code');
        const returnedState = url.searchParams.get('state');
        const error = url.searchParams.get('error');

        const html = (msg: string, ok: boolean) =>
          `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:40px;background:${ok ? '#0a1a0a' : '#1a0a0a'};color:${ok ? '#75f5ae' : '#ff7474'}"><h2>${ok ? '✓' : '✗'} ${msg}</h2><p style="color:#888">You can close this tab and return to the app.</p></body></html>`;

        if (error) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(html(`Canva denied: ${error}`, false));
          done({ ok: false, message: `OAuth denied: ${error}` });
          return;
        }

        if (!code || returnedState !== state) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(html('Invalid callback', false));
          done({ ok: false, message: 'Invalid OAuth callback' });
          return;
        }

        const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        const body = `grant_type=authorization_code&code=${encodeURIComponent(code)}&redirect_uri=${encodeURIComponent(CANVA_REDIRECT_URI)}&code_verifier=${encodeURIComponent(verifier)}`;
        const tokenRes = await canvaFormRequest('/rest/v1/oauth/token', basic, body);

        if (tokenRes.status !== 200 || !tokenRes.data?.access_token) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(html(`Token exchange failed: ${JSON.stringify(tokenRes.data)}`, false));
          done({ ok: false, message: `Token exchange failed (${tokenRes.status}): ${JSON.stringify(tokenRes.data)}` });
          return;
        }

        const expiresAt = Date.now() + (tokenRes.data.expires_in ?? 3600) * 1000;
        saveCanvaCredentials({
          accessToken: tokenRes.data.access_token,
          refreshToken: tokenRes.data.refresh_token,
          expiresAt,
        });

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html('Connected! Canva API is now active.', true));
        done({ ok: true });
      } catch (e: any) {
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end(`Error: ${e.message}`);
        done({ ok: false, message: e.message });
      }
    });

    const timeout = setTimeout(() => done({ ok: false, message: 'OAuth flow timed out — browser window was not completed within 2 minutes.' }), 2 * 60 * 1000);
    server.listen(CANVA_REDIRECT_PORT, () => shell.openExternal(authUrl.toString()));
    server.on('error', (e: NodeJS.ErrnoException) => {
      if (e.code === 'EADDRINUSE') {
        done({ ok: false, message: `Port ${CANVA_REDIRECT_PORT} is already in use — a previous OAuth attempt may still be pending. Wait a moment and try again.` });
      } else {
        done({ ok: false, message: `Could not start callback server: ${e.message}` });
      }
    });
  });
});

ipcMain.handle('platform:pickAndUploadCanvaAsset', async () => {
  const { filePaths, canceled } = await dialog.showOpenDialog({
    title: 'Select Image for Canva',
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths.length) return { ok: false, cancelled: true };
  const token = await getValidCanvaAccessToken();
  if (!token) return { ok: false, message: 'No Canva API token — connect Canva first.' };
  const result = await canvaUploadAsset(filePaths[0], token);
  if (result.ok) return { ok: true, assetId: result.assetId, filePath: filePaths[0], fileName: path.basename(filePaths[0]) };
  return result;
});

ipcMain.handle('platform:pickLocalFile', async (_event, opts: { title?: string; extensions?: string[] } = {}) => {
  const { filePaths, canceled } = await dialog.showOpenDialog({
    title: opts.title || 'Select File',
    filters: [{ name: 'Images', extensions: opts.extensions || ['jpg', 'jpeg', 'png', 'tif', 'tiff'] }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths.length) return { ok: false, cancelled: true };
  return { ok: true, filePath: filePaths[0], fileName: path.basename(filePaths[0]) };
});

// === IMAGE URL DOWNLOAD HELPER ===

/**
 * Download a remote HTTP/HTTPS image URL to a local temp file.
 * Returns the absolute path of the downloaded file.
 * Caller is responsible for cleanup via the returned tempFiles array.
 */
function downloadImageToTemp(url: string, cacheDir: string): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const parsed = new URL(url);
      const ext = path.extname(parsed.pathname).slice(0, 5) || '.jpg';
      const hash = crypto.createHash('md5').update(url).digest('hex').slice(0, 12);
      const dest = path.join(cacheDir, `img_${hash}${ext}`);
      // Return cached copy if it already exists (same URL hash)
      if (fs.existsSync(dest)) { resolve(dest); return; }
      const file = fs.createWriteStream(dest);
      const proto = parsed.protocol === 'https:' ? https : http;
      const req = proto.get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          // Follow one redirect
          file.close();
          fs.unlink(dest, () => {});
          downloadImageToTemp(res.headers.location, cacheDir).then(resolve).catch(reject);
          return;
        }
        if (!res.statusCode || res.statusCode >= 400) {
          file.close();
          fs.unlink(dest, () => {});
          reject(new Error(`HTTP ${res.statusCode} downloading image: ${url}`));
          return;
        }
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(dest); });
        file.on('error', (e) => { fs.unlink(dest, () => {}); reject(e); });
      });
      req.on('error', (e) => { fs.unlink(dest, () => {}); reject(e); });
      req.setTimeout(15000, () => { req.destroy(); reject(new Error(`Timeout downloading image: ${url}`)); });
    } catch (e: any) {
      reject(new Error(`Invalid image URL "${url}": ${e.message}`));
    }
  });
}

/**
 * For each value in the images map that looks like a remote URL, download it to
 * a temp file and replace the value with the local path.
 * Returns { resolved } — the caller writes resolved into the job.
 */
async function resolveImagePaths(
  images: Record<string, string>,
  cacheDir: string
): Promise<{ resolved: Record<string, string> }> {
  ensureDir(cacheDir);
  const resolved: Record<string, string> = {};
  await Promise.all(
    Object.entries(images).map(async ([key, val]) => {
      if (!val) return;
      if (/^https?:\/\//i.test(val)) {
        try {
          resolved[key] = await downloadImageToTemp(val, cacheDir);
        } catch (e: any) {
          // Leave as-is — the JSX will log MISSING_IMG and skip gracefully
          resolved[key] = val;
        }
      } else {
        resolved[key] = val; // already a local path
      }
    })
  );
  return { resolved };
}

// === IPC: ILLUSTRATOR AUTOMATION ===

/**
 * Resolve the actual .ai / .indd filename for a template ID.
 * Variant manifests (HEALTHCARE, TECHNOLOGY) share a source .ai via source_template;
 * this reads that field so the JSX opens the right file.
 */
function resolveActualTemplateId(engineRoot: string, templateId: string, ext = '.ai'): string {
  const manifestPath = path.join(engineRoot, 'references', `${templateId}.manifest.json`);
  if (fs.existsSync(manifestPath)) {
    try {
      const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (m.source_template) {
        return path.basename(m.source_template, path.extname(m.source_template));
      }
    } catch { /* fall through */ }
  }
  return templateId;
}

/** Return a ready-to-show error payload when the physical template file is missing. */
function templateFileMissingPayload(engineLabel: string, templateId: string, expectedPath: string) {
  return {
    ok: false,
    errorCode: 'TEMPLATE_FILE_MISSING',
    errorTitle: `${engineLabel} template file not found`,
    userMessage: `The template file for "${templateId}" hasn't been placed in the templates folder yet.`,
    likelyCauses: [
      'The template is registered in the manifest but the source file was never uploaded',
      'The .ai / .indd file was moved or renamed after registration',
    ],
    recoverySteps: [
      `Open the Templates screen and use "Open Templates Folder" to locate the folder.`,
      `Drop the matching file (${path.basename(expectedPath)}) into the folder.`,
      `Run Preflight again once the file is in place.`,
    ],
    technical: `Expected file not found: ${expectedPath}`,
  };
}

ipcMain.handle('platform:runIllustratorPreflight', (_event, templateId?: string) => runAutomationGuarded(async () => {
  ensureWorkspace();
  const tid = templateId || 'CASE_STUDY_LETTER_MASTER_v001';
  const resolvedId = resolveActualTemplateId(illustratorEngineRoot, tid);
  const expectedFile = path.join(illustratorEngineRoot, 'templates', `${resolvedId}.ai`);
  if (!fs.existsSync(expectedFile)) return templateFileMissingPayload('Illustrator', tid, expectedFile);
  const runnerPath = path.join(illustratorEngineRoot, 'run_illustrator_job.js');
  if (!fs.existsSync(runnerPath)) return friendlyErrorPayload(`Runner script not found: ${runnerPath}`, { action: 'illustrator_preflight' });
  const env = { CAP_ENGINE_ROOT: illustratorEngineRoot, CAP_WORKSPACE_ROOT: workspaceRoot };
  const args = ['--preflight', `--template=${resolvedId}`];
  return runAppleScriptEngine(runnerPath, args, env, 'illustrator_preflight');
}));

ipcMain.handle('platform:runIllustratorExample', (_event, templateId?: string) => runAutomationGuarded(async () => {
  ensureWorkspace();
  const tid = templateId || 'CASE_STUDY_LETTER_MASTER_v001';
  const resolvedId = resolveActualTemplateId(illustratorEngineRoot, tid);
  const expectedFile = path.join(illustratorEngineRoot, 'templates', `${resolvedId}.ai`);
  if (!fs.existsSync(expectedFile)) return templateFileMissingPayload('Illustrator', tid, expectedFile);

  // Build example content from the manifest if available; fall back to master-template defaults
  const exampleManifestPath = path.join(illustratorEngineRoot, 'references', `${tid}.manifest.json`);
  const masterDefaultContent: Record<string, string> = {
    TEXT_TITLE:       'Chaos In. Clarity Out.',
    TEXT_OVERVIEW:    'A structured template system built for life sciences marketing teams who need consistent, automation-ready case study production.',
    TEXT_CHALLENGE:   'Life sciences teams needed a cleaner way to standardize case study production without rebuilding layouts from scratch.',
    TEXT_SOLUTION:    'A structured, automation-ready Illustrator template system was created using semantic text zones, locked brand layers, and export-safe guides.',
    TEXT_RESULTS:     'The workflow creates faster versioning, cleaner QA, and more consistent case study exports across teams and formats.',
    TEXT_STAT_01:     '3× faster production',
    TEXT_STAT_02:     '100% brand-consistent exports',
    TEXT_TESTIMONIAL: 'This gave our team a repeatable system instead of another one-off design file. — Name, Title, Company',
  };
  let exampleContent = masterDefaultContent;
  try {
    if (fs.existsSync(exampleManifestPath)) {
      const m = JSON.parse(fs.readFileSync(exampleManifestPath, 'utf8'));
      if (m?.editable_objects && typeof m.editable_objects === 'object') {
        const built: Record<string, string> = {};
        for (const [key, def] of Object.entries(m.editable_objects as Record<string, any>)) {
          if (def?.type === 'image') continue;
          // Extract example value from the note field if present ("e.g. 'Foo'")
          const noteMatch = def?.note ? (def.note.match(/e\.g\.\s+['"]([^'"]+)['"]/i) || null) : null;
          if (noteMatch) {
            built[key] = noteMatch[1];
          } else if (masterDefaultContent[key]) {
            built[key] = masterDefaultContent[key];
          } else {
            // Generic placeholder derived from key name
            built[key] = `[${key.replace(/^TEXT_/, '').replace(/_/g, ' ')}]`;
          }
        }
        if (Object.keys(built).length > 0) exampleContent = built;
      }
    }
  } catch { /* non-fatal — use master defaults */ }

  // Also inject frame_aliases from the manifest so the versioner resolves field→frame correctly
  let exampleFrameAliases: Record<string, string> | undefined;
  try {
    if (fs.existsSync(exampleManifestPath)) {
      const m = JSON.parse(fs.readFileSync(exampleManifestPath, 'utf8'));
      if (m?.frame_aliases && typeof m.frame_aliases === 'object') exampleFrameAliases = m.frame_aliases;
    }
  } catch { /* non-fatal */ }

  const exampleJob: Record<string, any> = {
    output_name: nextVersionedName('TPLS_CaseStudy'),
    template: resolvedId,
    content: exampleContent,
    ...(exampleFrameAliases ? { frame_aliases: exampleFrameAliases } : {}),
  };
  const jobsDir = path.join(workspaceRoot, 'jobs');
  ensureDir(jobsDir);
  fs.writeFileSync(path.join(jobsDir, 'active_job_illustrator.json'), JSON.stringify(exampleJob, null, 2), 'utf8');
  const runnerPath = path.join(illustratorEngineRoot, 'run_illustrator_job.js');
  if (!fs.existsSync(runnerPath)) return friendlyErrorPayload(`Runner script not found: ${runnerPath}`, { action: 'illustrator_export' });
  const env = { CAP_ENGINE_ROOT: illustratorEngineRoot, CAP_WORKSPACE_ROOT: workspaceRoot };
  return runAppleScriptEngine(runnerPath, [], env, 'illustrator_export');
}));

ipcMain.handle('platform:runIllustratorCustom', (_event, job) => runAutomationGuarded(async () => {
  ensureWorkspace();
  const requestedId = job.template || 'CASE_STUDY_LETTER_MASTER_v001';
  // Load manifest early so we can derive required fields and frame_aliases from it
  const manifestPath = path.join(illustratorEngineRoot, 'references', `${requestedId}.manifest.json`);
  const manifestRequiredKeys = getManifestRequiredKeys(manifestPath);
  try { validateJob(job, 'illustrator', manifestRequiredKeys); } catch (err: any) { return friendlyErrorPayload(err.message, { action: 'illustrator_export' }); }
  const resolvedId = resolveActualTemplateId(illustratorEngineRoot, requestedId);
  const expectedFile = path.join(illustratorEngineRoot, 'templates', `${resolvedId}.ai`);
  if (!fs.existsSync(expectedFile)) return templateFileMissingPayload('Illustrator', requestedId, expectedFile);
  // Resolve any remote image URLs to local temp files before writing the job
  let resolvedImages: Record<string, string> | undefined;
  if (job.images && Object.keys(job.images).length > 0) {
    const imgCacheDir = path.join(workspaceRoot, 'cache', 'img_downloads');
    const { resolved } = await resolveImagePaths(job.images, imgCacheDir);
    resolvedImages = resolved;
  }
  // Load per-template frame_aliases from the manifest so the versioner can override its alias map
  let manifestFrameAliases: Record<string, string> | undefined;
  if (fs.existsSync(manifestPath)) {
    try {
      const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (m.frame_aliases && typeof m.frame_aliases === 'object') manifestFrameAliases = m.frame_aliases;
    } catch { /* non-fatal */ }
  }
  const safeJob = {
    ...job,
    template: resolvedId,
    output_name: nextVersionedName(sanitizeName(job.output_name || 'Creative_Output')),
    ...(resolvedImages ? { images: resolvedImages } : {}),
    ...(manifestFrameAliases ? { frame_aliases: manifestFrameAliases } : {}),
  };
  const jobsDir = path.join(workspaceRoot, 'jobs');
  ensureDir(jobsDir);
  fs.writeFileSync(path.join(jobsDir, 'active_job_illustrator.json'), JSON.stringify(safeJob, null, 2), 'utf8');
  const runnerPath = path.join(illustratorEngineRoot, 'run_illustrator_job.js');
  if (!fs.existsSync(runnerPath)) return friendlyErrorPayload(`Runner script not found: ${runnerPath}`, { action: 'illustrator_export' });
  const env = { CAP_ENGINE_ROOT: illustratorEngineRoot, CAP_WORKSPACE_ROOT: workspaceRoot };
  return runAppleScriptEngine(runnerPath, [], env, 'illustrator_export');
}));

// === IPC: INDESIGN ===

ipcMain.handle('platform:runInDesignPreflight', (_event, templateId?: string) => runAutomationGuarded(async () => {
  ensureWorkspace();
  const tid = templateId || 'WHITEPAPER_LETTER_MASTER_v001';
  const resolvedId = resolveActualTemplateId(indesignEngineRoot, tid, '.indd');
  const expectedFile = path.join(indesignEngineRoot, 'templates', `${resolvedId}.indd`);
  if (!fs.existsSync(expectedFile)) return templateFileMissingPayload('InDesign', tid, expectedFile);
  const runnerPath = path.join(indesignEngineRoot, 'run_indesign_job.js');
  if (!fs.existsSync(runnerPath)) return friendlyErrorPayload(`Runner script not found: ${runnerPath}`, { action: 'indesign_preflight' });
  const env = { CAP_ENGINE_ROOT: indesignEngineRoot, CAP_WORKSPACE_ROOT: workspaceRoot };
  const args = ['--preflight', `--template=${resolvedId}`];
  return runAppleScriptEngine(runnerPath, args, env, 'indesign_preflight');
}));

ipcMain.handle('platform:runInDesignExample', (_event, templateId?: string) => runAutomationGuarded(async () => {
  ensureWorkspace();
  const tid = templateId || 'WHITEPAPER_LETTER_MASTER_v001';
  const resolvedId = resolveActualTemplateId(indesignEngineRoot, tid, '.indd');
  const expectedFile = path.join(indesignEngineRoot, 'templates', `${resolvedId}.indd`);
  if (!fs.existsSync(expectedFile)) return templateFileMissingPayload('InDesign', tid, expectedFile);
  const exampleJob = {
    output_name: nextVersionedName('TPLS_Whitepaper'),
    template: resolvedId,
    content: {
      DOC_TITLE: 'The Future of Creative Automation',
      DOC_SUBTITLE: 'How AI-native workflows are transforming marketing production',
      DOC_AUTHOR: 'Creative Automation Platform Team',
      DOC_DATE: new Date().getFullYear().toString(),
      SECTION_EXECUTIVE_SUMMARY: 'Marketing teams face mounting pressure to produce more content with fewer resources. Creative Automation Platform delivers a structured, AI-native production system that eliminates bottlenecks across Illustrator, InDesign, and Canva workflows.',
      SECTION_BODY: 'Traditional creative production relies on manual handoffs, inconsistent templates, and disconnected toolchains. This whitepaper explores how a platform-first approach — combining InDesign automation, semantic text zones, and AI orchestration — delivers measurable gains in speed, consistency, and brand governance.',
      SECTION_CONCLUSION: 'The shift to automated creative production is not a matter of if, but when. Teams that build automation-ready templates today will compound their advantage as AI tooling matures.',
      SECTION_CTA: 'Request a demo at creativeos.io or contact your account team.',
      STAT_01: '3× faster production',
      STAT_02: '100% brand-consistent',
      STAT_03: '60% fewer revision cycles',
    },
  };
  const jobsDir = path.join(workspaceRoot, 'jobs');
  ensureDir(jobsDir);
  fs.writeFileSync(path.join(jobsDir, 'active_job_indesign.json'), JSON.stringify(exampleJob, null, 2), 'utf8');
  const runnerPath = path.join(indesignEngineRoot, 'run_indesign_job.js');
  if (!fs.existsSync(runnerPath)) return friendlyErrorPayload(`Runner script not found: ${runnerPath}`, { action: 'indesign_export' });
  const env = { CAP_ENGINE_ROOT: indesignEngineRoot, CAP_WORKSPACE_ROOT: workspaceRoot };
  return runAppleScriptEngine(runnerPath, [], env, 'indesign_export');
}));

ipcMain.handle('platform:runInDesignCustom', (_event, job) => runAutomationGuarded(async () => {
  ensureWorkspace();
  const requestedId = job?.template || 'WHITEPAPER_LETTER_MASTER_v001';
  const indesignManifestPath = path.join(indesignEngineRoot, 'references', `${requestedId}.manifest.json`);
  const indesignRequiredKeys = getManifestRequiredKeys(indesignManifestPath);
  try { validateJob(job, 'indesign', indesignRequiredKeys); } catch (err: any) { return friendlyErrorPayload(err.message, { action: 'indesign_export' }); }
  const resolvedId = resolveActualTemplateId(indesignEngineRoot, job.template || 'WHITEPAPER_LETTER_MASTER_v001', '.indd');
  const expectedFile = path.join(indesignEngineRoot, 'templates', `${resolvedId}.indd`);
  if (!fs.existsSync(expectedFile)) return templateFileMissingPayload('InDesign', job.template, expectedFile);
  // Resolve any remote image URLs to local temp files before writing the job
  let resolvedImages: Record<string, string> | undefined;
  if (job.images && Object.keys(job.images).length > 0) {
    const imgCacheDir = path.join(workspaceRoot, 'cache', 'img_downloads');
    const { resolved } = await resolveImagePaths(job.images, imgCacheDir);
    resolvedImages = resolved;
  }
  const safeJob = {
    ...job,
    template: resolvedId,
    output_name: nextVersionedName(sanitizeName(job.output_name || 'Whitepaper')),
    ...(resolvedImages ? { images: resolvedImages } : {}),
  };
  const jobsDir = path.join(workspaceRoot, 'jobs');
  ensureDir(jobsDir);
  fs.writeFileSync(path.join(jobsDir, 'active_job_indesign.json'), JSON.stringify(safeJob, null, 2), 'utf8');
  const runnerPath = path.join(indesignEngineRoot, 'run_indesign_job.js');
  if (!fs.existsSync(runnerPath)) return friendlyErrorPayload(`Runner script not found: ${runnerPath}`, { action: 'indesign_export' });
  const env = { CAP_ENGINE_ROOT: indesignEngineRoot, CAP_WORKSPACE_ROOT: workspaceRoot };
  return runAppleScriptEngine(runnerPath, [], env, 'indesign_export');
}));

// === IPC: JOB UTILITIES ===

ipcMain.handle('platform:validateJob', async (_event, job, engine = 'illustrator') => {
  try {
    // Load manifest-derived required keys if a template ID is present in the job
    let requiredOverride: string[] | undefined;
    if (job?.template) {
      const engineRoot = engine === 'indesign' ? indesignEngineRoot : illustratorEngineRoot;
      const mp = path.join(engineRoot, 'references', `${job.template}.manifest.json`);
      requiredOverride = getManifestRequiredKeys(mp) ?? undefined;
    }
    validateJob(job, engine, requiredOverride);
    return { ok: true, message: 'Job is valid.' };
  } catch (err: any) {
    return friendlyErrorPayload(err.message, { action: 'validate_job', engine });
  }
});

ipcMain.handle('platform:suggestOutputName', async (_event, baseName) => {
  ensureWorkspace();
  return { ok: true, output_name: nextVersionedName(baseName || 'TPLS_CaseStudy') };
});

// === IPC: DIAGNOSTICS ===

ipcMain.handle('platform:errorCatalog', async () => ERROR_CATALOG);

ipcMain.handle('platform:getTemplateThumbnail', async (_event, templateId: string) => {
  if (!fs.existsSync(enginesRoot)) return { ok: false, thumbnailUrl: null };
  const engineDirs = fs.readdirSync(enginesRoot);
  for (const engine of engineDirs) {
    const manifestPath = path.join(enginesRoot, engine, 'references', `${templateId}.manifest.json`);
    if (!fs.existsSync(manifestPath)) continue;
    let manifest: any;
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch { continue; }

    // Canva: fetch live thumbnail from Canva API
    if (manifest.canva_design_id) {
      const token = await getValidCanvaAccessToken();
      if (!token) return { ok: false, thumbnailUrl: null, reason: 'no_token' };
      try {
        const res = await canvaRequest('GET', `/rest/v1/designs/${manifest.canva_design_id}`, token);
        if (res.status === 200 && res.data?.design?.thumbnail?.url) {
          return { ok: true, thumbnailUrl: res.data.design.thumbnail.url };
        }
      } catch { /* fall through */ }
      return { ok: false, thumbnailUrl: null };
    }

    // Illustrator/other: check manifest preview field first, then fall back to _preview.* in references/
    const previewCandidates: string[] = [];
    if (manifest?.preview) previewCandidates.push(path.join(enginesRoot, engine, manifest.preview));
    for (const ext of ['png', 'jpg', 'jpeg', 'svg']) {
      previewCandidates.push(path.join(enginesRoot, engine, 'references', `${templateId}_preview.${ext}`));
    }
    const THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024; // 2 MB — prevents OOM on large preview files
    for (const previewPath of previewCandidates) {
      if (!fs.existsSync(previewPath)) continue;
      try {
        const stat = fs.statSync(previewPath);
        if (stat.size > THUMBNAIL_MAX_BYTES) return { ok: false, thumbnailUrl: null, reason: 'preview_too_large' };
        const ext = path.extname(previewPath).slice(1).toLowerCase();
        const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'png' ? 'image/png' : 'image/jpeg';
        const data = fs.readFileSync(previewPath).toString('base64');
        return { ok: true, thumbnailUrl: `data:${mime};base64,${data}` };
      } catch { continue; }
    }
    return { ok: false, thumbnailUrl: null };
  }
  return { ok: false, thumbnailUrl: null };
});

ipcMain.handle('platform:exportDiagnostics', async () => {
  ensureWorkspace();
  const templatePath = path.join(illustratorEngineRoot, 'templates', 'CASE_STUDY_LETTER_MASTER_v001.ai');
  const manifestPath = path.join(illustratorEngineRoot, 'references', 'CASE_STUDY_LETTER_MASTER_v001.manifest.json');
  const bundle = {
    timestamp: new Date().toISOString(),
    platformVersion: '3.0.0-alpha',
    workspaceRoot,
    enginesRoot,
    illustratorEngineRoot,
    templateExists: fs.existsSync(templatePath),
    manifestExists: fs.existsSync(manifestPath),
    outputsWritable: checkWritable(path.join(workspaceRoot, 'outputs', 'ai')),
    automationRunning
  };
  const outDir = path.join(workspaceRoot, 'outputs', 'diagnostics');
  ensureDir(outDir);
  const outPath = path.join(outDir, `diagnostics_${Date.now()}.json`);
  fs.writeFileSync(outPath, JSON.stringify(bundle, null, 2), 'utf8');
  return { ok: true, output: outPath, bundle };
});

// === IPC: SYSTEM CHECK ===

ipcMain.handle('platform:runSystemCheck', async () => {
  ensureWorkspace();
  const results: any[] = [];

  // ── 1. Workspace output directories ──────────────────────────────────────
  const requiredDirs = [
    { path: path.join(workspaceRoot, 'outputs', 'ai'),            label: 'Outputs → AI folder' },
    { path: path.join(workspaceRoot, 'outputs', 'pdf'),           label: 'Outputs → PDF folder' },
    { path: path.join(workspaceRoot, 'outputs', 'png'),           label: 'Outputs → PNG folder' },
    { path: path.join(workspaceRoot, 'outputs', 'indesign'),      label: 'Outputs → InDesign folder' },
    { path: path.join(workspaceRoot, 'outputs', 'canva'),         label: 'Outputs → Canva folder' },
    { path: path.join(workspaceRoot, 'outputs', 'adobe_express'), label: 'Outputs → Adobe Express folder' },
    { path: path.join(workspaceRoot, 'outputs', 'diagnostics'),   label: 'Outputs → Diagnostics folder' },
    { path: path.join(workspaceRoot, 'logs'),                     label: 'Logs folder' },
  ];

  for (const dir of requiredDirs) {
    if (!fs.existsSync(dir.path)) {
      results.push({
        id: `dir_${dir.label}`,
        category: 'workspace',
        label: dir.label,
        status: 'error',
        detail: `Directory missing: ${dir.path}`,
        exactFix: `The folder needs to be created. Click "Auto-Fix" to create it instantly, or run:\n  mkdir -p "${dir.path}"`,
        autoFixAction: `mkdir:${dir.path}`,
        autoFixLabel: 'Create Folder',
      });
    } else if (!checkWritable(dir.path)) {
      results.push({
        id: `writable_${dir.label}`,
        category: 'workspace',
        label: dir.label,
        status: 'error',
        detail: `Folder exists but is not writable: ${dir.path}`,
        exactFix: `Run in Terminal:\n  chmod u+w "${dir.path}"\nThen click Run Check again.`,
        autoFixAction: `chmod:${dir.path}`,
        autoFixLabel: 'Fix Permissions',
      });
    } else {
      results.push({ id: `dir_${dir.label}`, category: 'workspace', label: dir.label, status: 'ok', detail: dir.path });
    }
  }

  // ── 2. Engine runner scripts ──────────────────────────────────────────────
  const runners = [
    { scriptPath: path.join(enginesRoot, 'illustrator', 'run_illustrator_job.js'), label: 'Illustrator automation script' },
    { scriptPath: path.join(enginesRoot, 'indesign',    'run_indesign_job.js'),    label: 'InDesign automation script' },
  ];

  for (const runner of runners) {
    if (!fs.existsSync(runner.scriptPath)) {
      results.push({
        id: `runner_${runner.label}`,
        category: 'engines',
        label: runner.label,
        status: 'error',
        detail: `Script not found: ${runner.scriptPath}`,
        exactFix: `The engine runner is missing from the package. Reinstall the application or restore the file from source control:\n  ${runner.scriptPath}`,
      });
    } else {
      results.push({ id: `runner_${runner.label}`, category: 'engines', label: runner.label, status: 'ok', detail: runner.scriptPath });
    }
  }

  // ── 3. Template manifest + file checks ───────────────────────────────────
  if (fs.existsSync(enginesRoot)) {
    let engines: string[] = [];
    try { engines = fs.readdirSync(enginesRoot); } catch { /* skip */ }

    for (const engine of engines) {
      const refsDir      = path.join(enginesRoot, engine, 'references');
      const templatesDir = path.join(enginesRoot, engine, 'templates');
      if (!fs.existsSync(refsDir)) continue;

      let files: string[] = [];
      try { files = fs.readdirSync(refsDir).filter((f: string) => f.endsWith('.manifest.json')); } catch { continue; }

      for (const file of files) {
        const manifestPath = path.join(refsDir, file);
        const templateId   = file.replace('.manifest.json', '');
        let manifest: any  = null;

        // 3a. Manifest JSON validity
        try {
          manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
          results.push({ id: `manifest_${templateId}`, category: 'templates', label: `${templateId} — manifest`, status: 'ok', detail: manifestPath });
        } catch (e: any) {
          results.push({
            id: `manifest_${templateId}`,
            category: 'templates',
            label: `${templateId} — manifest`,
            status: 'error',
            detail: `JSON parse error: ${e.message}`,
            exactFix: `Open the file and fix the JSON syntax error:\n  ${manifestPath}\n\nPaste its contents into https://jsonlint.com to find the exact line.`,
            autoFixAction: `open_file:${manifestPath}`,
            autoFixLabel: 'Open in Editor',
          });
          continue;
        }

        const isCanva        = engine === 'canva'         || !!manifest?.canva_design_id;
        const isAdobeExpress = engine === 'adobe_express' || !!manifest?.adobe_template_urn;

        // 3b. Source file / cloud ID presence
        if (!isCanva && !isAdobeExpress) {
          const srcName = manifest?.source_template ? path.basename(manifest.source_template) : `${templateId}.ai`;
          const tplPath = path.join(templatesDir, srcName);
          if (!fs.existsSync(tplPath)) {
            results.push({
              id: `tpl_file_${templateId}`,
              category: 'templates',
              label: `${templateId} — source file`,
              status: 'error',
              detail: `Template file not found: ${tplPath}`,
              exactFix: `Copy the file "${srcName}" into the templates folder:\n  ${templatesDir}\n\nThen click Run Check to verify.`,
              autoFixAction: `open_dir:${templatesDir}`,
              autoFixLabel: 'Open Templates Folder',
            });
          } else {
            results.push({ id: `tpl_file_${templateId}`, category: 'templates', label: `${templateId} — source file`, status: 'ok', detail: tplPath });
          }
        } else if (isCanva && !manifest?.canva_design_id) {
          results.push({
            id: `tpl_file_${templateId}`,
            category: 'templates',
            label: `${templateId} — Canva design ID`,
            status: 'error',
            detail: `canva_design_id is missing from the manifest`,
            exactFix: `Add the following field to:\n  ${manifestPath}\n\n  "canva_design_id": "YOUR_DESIGN_ID"\n\nCopy the ID from your Canva URL: canva.com/design/DESIGN_ID/edit`,
            autoFixAction: `open_file:${manifestPath}`,
            autoFixLabel: 'Open Manifest',
          });
        } else if (isAdobeExpress && !manifest?.adobe_template_urn) {
          results.push({
            id: `tpl_file_${templateId}`,
            category: 'templates',
            label: `${templateId} — Adobe Express URN`,
            status: 'error',
            detail: `adobe_template_urn is missing from the manifest`,
            exactFix: `Add the following field to:\n  ${manifestPath}\n\n  "adobe_template_urn": "urn:aaid:sc:US:..."\n\nFind the URN in Adobe Express → Template Settings.`,
            autoFixAction: `open_file:${manifestPath}`,
            autoFixLabel: 'Open Manifest',
          });
        }

        // 3c. Required objects defined
        const requiredObjects: string[] = manifest
          ? (manifest.required_objects?.length
              ? manifest.required_objects
              : Object.entries(manifest.editable_objects || {})
                  .filter(([, v]: [string, any]) => v.required)
                  .map(([k]) => k))
          : [];

        if (!isCanva && !isAdobeExpress && requiredObjects.length === 0) {
          results.push({
            id: `req_${templateId}`,
            category: 'templates',
            label: `${templateId} — required objects`,
            status: 'warn',
            detail: `No required objects defined in manifest — exports will skip required-field validation`,
            exactFix: `In the manifest's "editable_objects", add "required": true to fields that must be filled:\n  ${manifestPath}`,
            autoFixAction: `open_file:${manifestPath}`,
            autoFixLabel: 'Open Manifest',
          });
        }

        // 3d. Linked assets present
        const linkedAssets: string[] = manifest?.linked_assets || [];
        for (const rel of linkedAssets) {
          const assetPath = path.join(enginesRoot, engine, rel);
          if (!fs.existsSync(assetPath)) {
            results.push({
              id: `asset_${templateId}_${path.basename(rel)}`,
              category: 'templates',
              label: `${templateId} → ${path.basename(rel)}`,
              status: 'warn',
              detail: `Linked asset not found: ${assetPath}`,
              exactFix: `Copy the file "${path.basename(rel)}" into:\n  ${path.dirname(assetPath)}`,
              autoFixAction: `open_dir:${path.dirname(assetPath)}`,
              autoFixLabel: 'Open Asset Folder',
            });
          }
        }
      }
    }
  }

  // ── 4. macOS permissions hint ─────────────────────────────────────────────
  // We can't check automation permission programmatically without running AppleScript,
  // so we emit an advisory check the user can act on if exports are failing.
  results.push({
    id: 'perm_automation',
    category: 'permissions',
    label: 'macOS Automation permission',
    status: 'info',
    detail: 'Cannot verify without running an export — check here if Illustrator/InDesign jobs fail',
    exactFix: `Open System Settings → Privacy & Security → Automation.\nEnable this app to control Adobe Illustrator and Adobe InDesign.\nThen relaunch the app and run Preflight.`,
    autoFixAction: 'open:automation',
    autoFixLabel: 'Open System Settings',
  });

  results.push({
    id: 'perm_fulldisk',
    category: 'permissions',
    label: 'macOS Full Disk Access',
    status: 'info',
    detail: 'Required for reading/writing Adobe app data — check here if file access errors appear',
    exactFix: `Open System Settings → Privacy & Security → Full Disk Access.\nEnable this app in the list.`,
    autoFixAction: 'open:fulldisk',
    autoFixLabel: 'Open System Settings',
  });

  return results;
});

function isAllowedAutoFixPath(p: string): boolean {
  const resolved = path.resolve(p);
  return resolved.startsWith(path.resolve(workspaceRoot)) || resolved.startsWith(path.resolve(enginesRoot));
}

ipcMain.handle('platform:autoFix', async (_event, action: string) => {
  try {
    if (action.startsWith('mkdir:')) {
      const dirPath = action.slice(6);
      if (!isAllowedAutoFixPath(dirPath)) return { ok: false, message: 'Path is outside the allowed workspace.' };
      fs.mkdirSync(dirPath, { recursive: true });
      return { ok: true, message: `Created: ${dirPath}` };
    }
    if (action.startsWith('chmod:')) {
      const dirPath = action.slice(6);
      if (!isAllowedAutoFixPath(dirPath)) return { ok: false, message: 'Path is outside the allowed workspace.' };
      fs.chmodSync(dirPath, 0o755);
      return { ok: true, message: `Permissions fixed on: ${dirPath}` };
    }
    if (action.startsWith('open_dir:')) {
      const dirPath = action.slice(9);
      shell.showItemInFolder(dirPath);
      return { ok: true, message: `Opened: ${dirPath}` };
    }
    if (action.startsWith('open_file:')) {
      const filePath = action.slice(10);
      await shell.openPath(filePath);
      return { ok: true, message: `Opened: ${filePath}` };
    }
    if (action === 'open:automation') {
      shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Automation');
      return { ok: true, message: 'Opened System Settings → Automation' };
    }
    if (action === 'open:fulldisk') {
      shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles');
      return { ok: true, message: 'Opened System Settings → Full Disk Access' };
    }
    return { ok: false, message: `Unknown fix action: ${action}` };
  } catch (e: any) {
    return { ok: false, message: e.message };
  }
});

// === IPC: CLAUDE AI HELP ===

ipcMain.handle('platform:setClaudeApiKey', async (_event, key: string) => {
  if (!key?.trim()) return { ok: false, message: 'Key cannot be empty' };
  try {
    saveClaudeApiKey(key.trim());
    return { ok: true };
  } catch (e: any) {
    return { ok: false, message: e.message };
  }
});

ipcMain.handle('platform:getClaudeApiKey', async () => {
  const key = getClaudeApiKey();
  if (!key) return { ok: true, hasKey: false, masked: null };
  const masked = key.length > 12
    ? `${key.slice(0, 7)}${'•'.repeat(key.length - 11)}${key.slice(-4)}`
    : '•'.repeat(key.length);
  return { ok: true, hasKey: true, masked };
});

ipcMain.handle('platform:askClaudeAboutError', async (_event, payload: {
  checkLabel: string;
  checkStatus: string;
  checkDetail: string;
  checkExactFix?: string;
  category: string;
}) => {
  const apiKey = getClaudeApiKey();
  if (!apiKey) return { ok: false, message: 'No Claude API key configured. Enter your Anthropic API key in the diagnostics panel.' };

  const systemPrompt = `You are a technical support expert for the Creative Automation Platform — a macOS Electron desktop app that automates Adobe Illustrator, InDesign, Canva, and Adobe Express exports using AppleScript and a Node.js engine layer.

When a user asks about a diagnostic error, provide:
1. A plain-English explanation of what the error means (1–2 sentences)
2. The most likely root cause in their specific context
3. Precise, numbered fix steps (include exact paths, commands, or settings names where relevant)
4. How to verify the fix worked

Be concise and specific. Use backticks for paths, commands, and field names. Avoid generic advice — the user can see the raw detail already.`;

  const userMessage = `My system diagnostic check returned this error:

**Check:** ${payload.checkLabel}
**Category:** ${payload.category}
**Status:** ${payload.checkStatus}
**Detail:** ${payload.checkDetail}
${payload.checkExactFix ? `\n**Suggested fix already shown:** ${payload.checkExactFix}` : ''}

Can you help me understand and resolve this? Please give me specific, actionable steps.`;

  try {
    const { status, data } = await anthropicPost({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }, apiKey);

    if (status === 401) return { ok: false, message: 'Invalid API key — check your Anthropic key and try again.' };
    if (status === 429) return { ok: false, message: 'Rate limit reached — wait a moment and try again.' };
    if (status !== 200) return { ok: false, message: `Anthropic API error ${status}: ${JSON.stringify(data?.error || data)}` };

    const text: string = data?.content?.[0]?.text || '';
    if (!text) return { ok: false, message: 'Empty response from Claude.' };
    return { ok: true, response: text };
  } catch (e: any) {
    return { ok: false, message: `Network error: ${e.message}` };
  }
});

// === IPC: CLAUDE CREATIVE GENERATION ===

ipcMain.handle('platform:claudeFillFields', async (_event, payload: {
  brief: string;
  fields: { key: string; label: string; required: boolean; maxChars?: number }[];
  engine: string;
  templateName?: string;
  brandContext?: { name: string; description?: string; guidelines?: string; industry?: string };
  systemPromptOverride?: string;
  userTemplateOverride?: string;
  imagePath?: string;
}) => {
  const apiKey = getClaudeApiKey();
  if (!apiKey) return { ok: false, message: 'No Claude API key configured. Add your Anthropic API key in Diagnostics.' };
  if (!payload.brief?.trim()) return { ok: false, message: 'Brief cannot be empty.' };

  const fieldList = payload.fields.map(f =>
    `  "${f.key}" — ${f.label}${f.required ? ' [REQUIRED]' : ''}${f.maxChars ? ` [max ${f.maxChars} characters]` : ''}`
  ).join('\n');

  const systemPrompt = payload.systemPromptOverride?.trim() ||
    `You are a creative content strategist for the Creative Automation Platform — an AI-native production system for Illustrator, InDesign, Canva, and Adobe Express.

Your job: extract and generate precise, publication-ready marketing copy from a creative brief for specific template fields.

Rules:
- Extract facts, metrics, names, and language FROM the brief first — do not invent information that isn't there
- Generate professional, brand-aligned content for fields the brief doesn't explicitly cover
- STRICTLY respect character limits — count characters and keep content within the max; end on a complete thought
- For stat fields (max ~40 chars): use specific numbers from the brief, e.g. "68% faster delivery"
- For title fields: be concise, punchy, and impactful — no marketing fluff
- For body fields: be specific and results-oriented, not generic
- Return ONLY a valid JSON object with the exact field keys listed — no markdown fences, no prose explanation, no trailing commas
- Every required field MUST have a non-empty value`;

  // Resolve user template — supports {{variables}} substitution
  let userMessage: string;
  if (payload.userTemplateOverride?.trim()) {
    userMessage = payload.userTemplateOverride
      .replace(/\{\{brief\}\}/g, payload.brief.trim())
      .replace(/\{\{engine\}\}/g, payload.engine)
      .replace(/\{\{templateName\}\}/g, payload.templateName ?? '')
      .replace(/\{\{brand_name\}\}/g, payload.brandContext?.name ?? '')
      .replace(/\{\{brand_description\}\}/g, payload.brandContext?.description ?? '')
      .replace(/\{\{brand_guidelines\}\}/g, payload.brandContext?.guidelines ?? '')
      .replace(/\{\{brand_industry\}\}/g, payload.brandContext?.industry ?? '')
      .replace(/\{\{field_list\}\}/g, fieldList)
      .replace(/\{\{#[^}]+\}\}[\s\S]*?\{\{\/[^}]+\}\}/g, (block) => {
        // Simple mustache-style conditional: {{#var}}content{{/var}}
        const m = block.match(/\{\{#([^}]+)\}\}([\s\S]*?)\{\{\/[^}]+\}\}/);
        if (!m) return block;
        const varName = m[1].trim();
        const content = m[2];
        const val = varName === 'templateName' ? payload.templateName
          : varName === 'brand_name' ? payload.brandContext?.name
          : varName === 'brand_description' ? payload.brandContext?.description
          : varName === 'brand_guidelines' ? payload.brandContext?.guidelines
          : varName === 'brand_industry' ? payload.brandContext?.industry : undefined;
        return val ? content.replace(`{{${varName}}}`, val) : '';
      });
  } else {
    const brandLines: string[] = [];
    if (payload.brandContext?.name) brandLines.push(`Brand: ${payload.brandContext.name}`);
    if (payload.brandContext?.industry) brandLines.push(`Industry: ${payload.brandContext.industry}`);
    if (payload.brandContext?.description) brandLines.push(`About: ${payload.brandContext.description}`);
    if (payload.brandContext?.guidelines) brandLines.push(`Voice & guidelines: ${payload.brandContext.guidelines}`);
    const brandSection = brandLines.length > 0 ? `\n\nBrand context:\n${brandLines.join('\n')}` : '';

    userMessage = `Generate content for a ${payload.engine} template${payload.templateName ? ` (${payload.templateName})` : ''}.${brandSection}

Creative brief:
"${payload.brief.trim()}"

Fields to populate:
${fieldList}

Return a JSON object with these exact keys. Example format:
{ "FIELD_KEY": "content here", "ANOTHER_KEY": "more content" }`;
  }

  // Build tool schema from field definitions
  const toolProps: Record<string, { type: string; description: string }> = {};
  for (const f of payload.fields) {
    toolProps[f.key] = { type: 'string', description: `${f.label}${f.maxChars ? ` (max ${f.maxChars} characters)` : ''}` };
  }
  const requiredFieldKeys = payload.fields.filter(f => f.required).map(f => f.key);
  const fillTool = {
    name: 'fill_template_fields',
    description: 'Output all template field values as structured data extracted and generated from the creative brief.',
    input_schema: { type: 'object', properties: toolProps, required: requiredFieldKeys },
  };

  // Vision: if an image is attached, build multimodal content
  let userContent: any = userMessage;
  if (payload.imagePath) {
    try {
      const imgBuf = fs.readFileSync(payload.imagePath);
      const ext = path.extname(payload.imagePath).slice(1).toLowerCase();
      const mime = ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' } as Record<string,string>)[ext] || 'image/jpeg';
      userContent = [
        { type: 'image', source: { type: 'base64', media_type: mime, data: imgBuf.toString('base64') } },
        { type: 'text', text: userMessage },
      ];
    } catch { /* if image read fails, fall back to text-only */ }
  }

  try {
    const { status, data } = await anthropicPost({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userContent }],
      tools: [fillTool],
      tool_choice: { type: 'tool', name: 'fill_template_fields' },
    }, apiKey);

    if (status === 401) return { ok: false, message: 'Invalid API key — check your Anthropic key in Diagnostics.' };
    if (status === 429) return { ok: false, message: 'Rate limit reached — wait a moment and try again.' };
    if (status !== 200) return { ok: false, message: `Anthropic API error ${status}.` };

    // Extract structured output from tool_use block
    const toolUseBlock = Array.isArray(data?.content) ? data.content.find((c: any) => c.type === 'tool_use') : null;
    let content: Record<string, any>;
    if (toolUseBlock?.input) {
      content = toolUseBlock.input;
    } else {
      // Fallback: regex parse any text block (defensive)
      const textBlock = Array.isArray(data?.content) ? data.content.find((c: any) => c.type === 'text') : null;
      const text: string = textBlock?.text || data?.content?.[0]?.text || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return { ok: false, message: 'Claude did not return structured field data. Try rephrasing your brief.' };
      try { content = JSON.parse(jsonMatch[0]); } catch { return { ok: false, message: 'Could not parse field data from Claude response.' }; }
    }

    // Enforce character limits server-side as a safety net
    for (const field of payload.fields) {
      if (field.maxChars && content[field.key]) {
        const val = String(content[field.key]);
        if (val.length > field.maxChars) {
          content[field.key] = val.slice(0, field.maxChars).replace(/\s+\S*$/, '');
        }
      }
    }
    return { ok: true, content, filledCount: Object.keys(content).length };
  } catch (e: any) {
    return { ok: false, message: `Network error: ${e.message}` };
  }
});

ipcMain.handle('platform:claudeGenerateBatch', async (_event, payload: {
  brief: string;
  count: number;
  fields: { key: string; label: string; required: boolean; maxChars?: number }[];
  engine: string;
  templateName?: string;
  brandContext?: { name: string; description?: string; guidelines?: string; industry?: string };
}) => {
  const apiKey = getClaudeApiKey();
  if (!apiKey) return { ok: false, message: 'No Claude API key configured. Add your Anthropic API key in Diagnostics.' };
  if (!payload.brief?.trim()) return { ok: false, message: 'Brief cannot be empty.' };

  const count = Math.min(Math.max(1, payload.count || 3), 20);
  const fieldList = payload.fields.map(f =>
    `  "${f.key}" — ${f.label}${f.required ? ' [REQUIRED]' : ''}${f.maxChars ? ` [max ${f.maxChars} chars]` : ''}`
  ).join('\n');

  const batchBrandHeader = payload.brandContext?.name
    ? `\n\nActive brand: ${payload.brandContext.name}${payload.brandContext.industry ? ` (${payload.brandContext.industry})` : ''}${payload.brandContext.description ? ` — ${payload.brandContext.description}` : ''}${payload.brandContext.guidelines ? `\nVoice & guidelines: ${payload.brandContext.guidelines}` : ''}`
    : '';
  const systemPrompt = `You are a creative content strategist generating multiple distinct variations for batch production of marketing materials.${batchBrandHeader}

Rules:
- Each variation must be meaningfully different — different angles, metrics, company names, or value propositions
- Include "output_name" in each object: a clean snake_case filename (no spaces, no special chars), e.g. "Acme_CaseStudy_v001"
- STRICTLY respect character limits on every field
- Required fields must have non-empty values in every variation
- Return ONLY a valid JSON array of objects — no markdown fences, no explanation
- If the brief mentions one company, generate variations from different angles (different departments, use cases, or metrics)`;

  const userMessage = `Generate exactly ${count} distinct content variations for a batch ${payload.engine} production run${payload.templateName ? ` using template "${payload.templateName}"` : ''}.

Campaign brief:
"${payload.brief.trim()}"

Each variation must have these fields:
  "output_name" — clean filename (no spaces), e.g. "Company_CaseStudy_v001"
${fieldList}

Return a JSON array of exactly ${count} objects.`;

  // Tool schema for structured batch output
  const batchToolProps: Record<string, { type: string; description: string }> = {};
  for (const f of payload.fields) {
    batchToolProps[f.key] = { type: 'string', description: `${f.label}${f.maxChars ? ` (max ${f.maxChars} chars)` : ''}` };
  }
  const batchRequiredKeys = payload.fields.filter(f => f.required).map(f => f.key);
  const batchTool = {
    name: 'generate_batch_variations',
    description: `Generate exactly ${count} distinct, meaningfully-different content variations for batch production.`,
    input_schema: {
      type: 'object',
      properties: {
        variations: {
          type: 'array',
          description: `Exactly ${count} content variations, each meaningfully different`,
          items: {
            type: 'object',
            properties: {
              output_name: { type: 'string', description: 'Clean snake_case filename, no spaces, e.g. "Acme_CaseStudy_v001"' },
              ...batchToolProps,
            },
            required: ['output_name', ...batchRequiredKeys],
          },
          minItems: count,
          maxItems: count,
        },
      },
      required: ['variations'],
    },
  };

  // Extended thinking for large batches (≥5 rows): significantly improves variation quality
  const useThinking = count >= 5;
  const batchBody: any = {
    model: 'claude-sonnet-4-6',
    max_tokens: useThinking ? 16000 : 4096,
    system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userMessage }],
    tools: [batchTool],
    tool_choice: { type: 'tool', name: 'generate_batch_variations' },
  };
  if (useThinking) batchBody.thinking = { type: 'enabled', budget_tokens: 8000 };
  const batchBetas = useThinking ? 'prompt-caching-2024-07-31,interleaved-thinking-2025-05-14' : 'prompt-caching-2024-07-31';

  try {
    const { status, data } = await anthropicPost(batchBody, apiKey, batchBetas);

    if (status === 401) return { ok: false, message: 'Invalid API key.' };
    if (status === 429) return { ok: false, message: 'Rate limit reached — wait a moment and try again.' };
    if (status !== 200) return { ok: false, message: `Anthropic API error ${status}.` };

    const batchToolUse = Array.isArray(data?.content) ? data.content.find((c: any) => c.type === 'tool_use') : null;
    let rows: any[];
    if (batchToolUse?.input?.variations) {
      rows = batchToolUse.input.variations;
    } else {
      // Fallback: regex parse
      const textBlock = Array.isArray(data?.content) ? data.content.find((c: any) => c.type === 'text') : null;
      const text: string = textBlock?.text || data?.content?.[0]?.text || '';
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return { ok: false, message: 'Could not parse batch content from Claude response.' };
      try { rows = JSON.parse(jsonMatch[0]); } catch { return { ok: false, message: 'Claude returned invalid JSON for the batch. Try simplifying your brief.' }; }
    }

    // Enforce character limits
    for (const row of rows) {
      for (const field of payload.fields) {
        if (field.maxChars && row[field.key]) {
          const val = String(row[field.key]);
          if (val.length > field.maxChars) row[field.key] = val.slice(0, field.maxChars).replace(/\s+\S*$/, '');
        }
      }
    }
    return { ok: true, rows, count: rows.length };
  } catch (e: any) {
    return { ok: false, message: `Network error: ${e.message}` };
  }
});

// === IPC: CLAUDE VISION — ANALYZE IMAGE FOR COPY SUGGESTIONS ===

ipcMain.handle('platform:claudeAnalyzeImage', async (_event, payload: {
  imagePath: string;
  fieldKeys?: string[];
  context?: string;
}) => {
  const apiKey = getClaudeApiKey();
  if (!apiKey) return { ok: false, message: 'No Claude API key configured.' };
  if (!payload.imagePath) return { ok: false, message: 'No image path provided.' };

  try {
    const imgBuf = fs.readFileSync(payload.imagePath);
    const ext = path.extname(payload.imagePath).slice(1).toLowerCase();
    const mime = ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' } as Record<string,string>)[ext] || 'image/jpeg';

    const prompt = payload.context
      ? `Analyze this image in the context of: ${payload.context}. Describe what you see and suggest appropriate marketing copy that complements it.`
      : 'Analyze this image and suggest appropriate headline, body copy, and descriptive text that would complement it in a marketing piece.';

    const { status, data } = await anthropicPost({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mime, data: imgBuf.toString('base64') } },
          { type: 'text', text: prompt },
        ],
      }],
    }, apiKey);

    if (status === 401) return { ok: false, message: 'Invalid API key.' };
    if (status === 429) return { ok: false, message: 'Rate limit reached.' };
    if (status !== 200) return { ok: false, message: `API error ${status}.` };

    const text: string = data?.content?.[0]?.text || '';
    if (!text) return { ok: false, message: 'Empty response from Claude.' };
    return { ok: true, analysis: text };
  } catch (e: any) {
    return { ok: false, message: e.code === 'ENOENT' ? 'Image file not found.' : `Error: ${e.message}` };
  }
});

// === IPC: CLAUDE CONVERSATIONAL CHAT ===

ipcMain.handle('platform:askClaude', async (event, payload: {
  // Chat mode: prompt + optional history + optional brand context
  prompt?: string;
  brandContext?: { name: string; description?: string; guidelines?: string; industry?: string };
  history?: { role: string; content: string }[];
  // Raw override mode (used by inline field assist): bypass built-in system prompt entirely
  system?: string;
  messages?: { role: string; content: string }[];
}) => {
  const apiKey = getClaudeApiKey();
  if (!apiKey) return { ok: false, message: 'No Claude API key configured. Click "Add Key" in the Claude AI screen.' };

  // Raw override mode — caller provides system + messages directly (e.g. CharLimitField inline assist)
  if (payload.messages?.length) {
    try {
      const { status, data } = await anthropicPost({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system: payload.system,
        messages: payload.messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      }, apiKey);
      if (status === 401) return { ok: false, message: 'Invalid API key.' };
      if (status === 429) return { ok: false, message: 'Rate limit reached — wait a moment and try again.' };
      if (status !== 200) return { ok: false, message: `Anthropic API error ${status}.` };
      const text: string = data?.content?.[0]?.text || '';
      if (!text) return { ok: false, message: 'Empty response from Claude.' };
      return { ok: true, response: text };
    } catch (e: any) {
      return { ok: false, message: `Network error: ${e.message}` };
    }
  }

  if (!payload.prompt?.trim()) return { ok: false, message: 'Prompt cannot be empty.' };

  const brandParts: string[] = [];
  if (payload.brandContext?.name) brandParts.push(`- Name: ${payload.brandContext.name}`);
  if (payload.brandContext?.industry) brandParts.push(`- Industry: ${payload.brandContext.industry}`);
  if (payload.brandContext?.description) brandParts.push(`- About: ${payload.brandContext.description}`);
  if (payload.brandContext?.guidelines) brandParts.push(`- Voice & guidelines: ${payload.brandContext.guidelines}`);
  const brandSection = brandParts.length > 0 ? `\n\nActive brand context:\n${brandParts.join('\n')}` : '';

  const systemPrompt = `You are the Claude AI assistant embedded in the Creative Automation Platform — an AI-native production system for generating marketing materials across Adobe Illustrator, InDesign, Canva, Adobe Express, and Figma.

You help creative teams with:
- Writing master campaign briefs and creative strategies
- Generating headlines, body copy, taglines, and CTA variations
- Brainstorming campaign angles and messaging frameworks
- Drafting stat callouts, testimonials, and proof points
- Answering questions about the platform and its engines

Keep responses clear, structured, and actionable. Use markdown formatting (bold, lists) where helpful. Be specific — avoid generic marketing fluff. When you generate copy, make it publication-ready.${brandSection}`;

  const history = (payload.history ?? []).slice(-10).map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  const messages = [
    ...history,
    { role: 'user' as const, content: payload.prompt.trim() },
  ];

  // Chat mode — stream tokens back progressively
  anthropicStreamChat({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1536,
    system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
    messages,
  }, apiKey, event);
  return { ok: true, streaming: true };
});

// === IPC: ADOBE FIREFLY AI ===

function fireflyConfigPath(): string {
  ensureWorkspace();
  return path.join(workspaceRoot, 'integrations', 'adobe_firefly_config.json');
}

function readFireflyConfig(): { clientId?: string; clientSecret?: string } {
  try {
    const p = fireflyConfigPath();
    if (!fs.existsSync(p)) return {};
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch { return {}; }
}

function saveFireflyConfig(cfg: { clientId: string; clientSecret: string }) {
  const p = fireflyConfigPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(cfg, null, 2), 'utf8');
}

async function adobeGetAccessToken(clientId: string, clientSecret: string): Promise<{ ok: boolean; token?: string; message?: string }> {
  return new Promise((resolve) => {
    const body = `grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&scope=openid%2CAdobeID%2Cfirefly_api`;
    const req = https.request({
      hostname: 'ims-na1.adobelogin.com',
      path: '/ims/token/v3',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString());
          if (data.access_token) {
            resolve({ ok: true, token: data.access_token });
          } else {
            resolve({ ok: false, message: data.error_description || 'Adobe IMS token request failed' });
          }
        } catch {
          resolve({ ok: false, message: 'Invalid response from Adobe IMS' });
        }
      });
    });
    req.on('error', (e: Error) => resolve({ ok: false, message: e.message }));
    req.write(body);
    req.end();
  });
}

ipcMain.handle('platform:setAdobeFireflyCredentials', async (_event, clientId: string, clientSecret: string) => {
  if (!clientId?.trim() || !clientSecret?.trim()) return { ok: false, message: 'Client ID and Client Secret are required.' };
  try {
    saveFireflyConfig({ clientId: clientId.trim(), clientSecret: clientSecret.trim() });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, message: e.message };
  }
});

ipcMain.handle('platform:getAdobeFireflyCredentials', async () => {
  const cfg = readFireflyConfig();
  if (!cfg.clientId) return { ok: true, hasCredentials: false };
  const masked = `${cfg.clientId.slice(0, 4)}${'•'.repeat(Math.max(0, (cfg.clientId.length - 8)))}${cfg.clientId.slice(-4)}`;
  return { ok: true, hasCredentials: true, masked };
});

ipcMain.handle('platform:generateFireflyImage', async (_event, payload: {
  prompt: string;
  aspectRatio?: 'widescreen' | 'portrait' | 'square';
  style?: 'photo' | 'art';
}) => {
  const cfg = readFireflyConfig();
  if (!cfg.clientId || !cfg.clientSecret) {
    return { ok: false, noCredentials: true, message: 'Adobe Firefly credentials not configured.' };
  }

  const tokenRes = await adobeGetAccessToken(cfg.clientId, cfg.clientSecret);
  if (!tokenRes.ok || !tokenRes.token) {
    return { ok: false, message: tokenRes.message || 'Failed to get Adobe access token.' };
  }

  const sizeMap: Record<string, { width: number; height: number }> = {
    widescreen: { width: 1792, height: 1024 },
    portrait:   { width: 1024, height: 1280 },
    square:     { width: 1024, height: 1024 },
  };
  const size = sizeMap[payload.aspectRatio || 'widescreen'];

  interface FireflyResponse {
    outputs?: Array<{ image?: { url?: string } }>;
  }

  const firefly = await new Promise<{ ok: boolean; data?: FireflyResponse; message?: string }>((resolve) => {
    const body = JSON.stringify({
      prompt: payload.prompt,
      numVariations: 1,
      size,
      contentClass: payload.style === 'art' ? 'art' : 'photo',
    });
    const req = https.request({
      hostname: 'firefly-api.adobe.io',
      path: '/v3/images/generate',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenRes.token}`,
        'x-api-key': cfg.clientId,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        try {
          const data: FireflyResponse = JSON.parse(Buffer.concat(chunks).toString());
          resolve({ ok: true, data });
        } catch {
          resolve({ ok: false, message: 'Invalid Firefly API response' });
        }
      });
    });
    req.on('error', (e: Error) => resolve({ ok: false, message: e.message }));
    req.write(body);
    req.end();
  });

  if (!firefly.ok || !firefly.data) return { ok: false, message: firefly.message };

  const imageUrl = firefly.data?.outputs?.[0]?.image?.url;
  if (!imageUrl) return { ok: false, message: 'Firefly did not return an image URL.' };

  // Download the image to workspace
  const generatedDir = path.join(workspaceRoot, 'outputs', 'generated_images');
  fs.mkdirSync(generatedDir, { recursive: true });
  const timestamp = Date.now();
  const localPath = path.join(generatedDir, `firefly_${timestamp}.jpg`);

  const downloaded = await new Promise<boolean>((resolve) => {
    const file = fs.createWriteStream(localPath);
    const cleanup = () => { file.destroy(); fs.unlink(localPath, () => {}); resolve(false); };
    file.on('error', cleanup);
    const urlObj = new URL(imageUrl);
    const getReq = https.get({
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      headers: { 'Accept': 'image/jpeg,image/*' },
    }, (res) => {
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(true); });
    });
    getReq.on('error', cleanup);
  });

  if (!downloaded) return { ok: false, message: 'Failed to download generated image.' };

  return {
    ok: true,
    imagePath: `file://${localPath}`,
    localPath,
    prompt: payload.prompt,
  };
});

// === IPC: TEMPLATE REGISTRY ===

ipcMain.handle('platform:listTemplates', async () => {
  ensureWorkspace();
  const records: any[] = [];
  if (!fs.existsSync(enginesRoot)) return records;

  let engines: string[];
  try { engines = fs.readdirSync(enginesRoot); } catch { return records; }

  for (const engine of engines) {
    const refsDir = path.join(enginesRoot, engine, 'references');
    const templatesDir = path.join(enginesRoot, engine, 'templates');
    if (!fs.existsSync(refsDir)) continue;

    let files: string[];
    try { files = fs.readdirSync(refsDir); } catch { continue; }

    for (const file of files) {
      if (!file.endsWith('.manifest.json')) continue;

      const manifestPath = path.join(refsDir, file);
      let manifest: any = null;
      const healthDetails: string[] = [];
      let healthScore = 0;

      try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        healthDetails.push('Manifest readable');
        healthScore += 30;
      } catch {
        healthDetails.push('Manifest unreadable');
      }

      // Detect cloud engine types
      const isCanva = engine === 'canva' || !!manifest?.canva_design_id;
      const isAdobeExpress = engine === 'adobe_express' || !!manifest?.adobe_template_urn;
      const isFigma = engine === 'figma' || !!manifest?.isFigma;
      const figmaFileKey: string | null = manifest?.figmaFileKey || null;
      const figmaNodeId: string | null = manifest?.figmaNodeId || null;
      const figmaUrl: string | null = manifest?.figmaUrl || null;
      const isCloud = isCanva || isAdobeExpress || isFigma;

      const canvaDesignId: string | null = manifest?.canva_design_id || null;
      const canvaUrl: string | null = manifest?.canva_url || (canvaDesignId ? `https://www.canva.com/design/${canvaDesignId}/edit` : null);
      const adobeTemplateUrn: string | null = manifest?.adobe_template_urn || null;
      const adobeEditorUrl: string | null = manifest?.editor_url || null;

      // thumbnail: only embed HTTPS URLs — local files are served via getTemplateThumbnail as data URLs
      const thumbnailUrl: string | null = manifest?.preview_url || manifest?.thumbnailUrl || null;

      // templateFileName: prefer source_template from manifest so multi-vertical manifests can share one .ai file
      const sourceTemplate: string | null = manifest?.source_template
        ? path.basename(manifest.source_template)
        : null;
      const templateFileName = isCloud ? null : (sourceTemplate || file.replace('.manifest.json', '.ai'));
      const templatePath = isCloud ? null : path.join(templatesDir, templateFileName as string);
      const templateExists = isCanva ? !!canvaDesignId : isAdobeExpress ? !!adobeTemplateUrn : isFigma ? !!figmaFileKey : fs.existsSync(templatePath as string);

      if (isFigma) {
        if (figmaFileKey) {
          healthDetails.push('Figma file key registered');
          healthScore += 40;
        } else {
          healthDetails.push('Figma file key missing');
        }
      } else if (isAdobeExpress) {
        if (adobeTemplateUrn) {
          healthDetails.push('Adobe Express template URN registered');
          healthScore += 40;
        } else {
          healthDetails.push('Adobe Express template URN missing');
        }
      } else if (isCanva) {
        if (canvaDesignId) {
          healthDetails.push('Canva design ID registered');
          healthScore += 40;
        } else {
          healthDetails.push('Canva design ID missing');
        }
      } else if (templateExists) {
        healthDetails.push('Template file present');
        healthScore += 40;
      } else {
        healthDetails.push('Template file missing');
      }

      // Support both per-object `required: true` flags (Illustrator) and top-level `required_objects` array (Canva)
      const requiredObjects: string[] = manifest
        ? (manifest.required_objects?.length
            ? manifest.required_objects
            : Object.entries(manifest.editable_objects || {})
                .filter(([, v]: [string, any]) => v.required)
                .map(([k]) => k))
        : [];

      if (requiredObjects.length > 0) {
        healthDetails.push(`${requiredObjects.length} required objects defined`);
        healthScore += 30;
      }

      const linkedAssets: string[] = manifest?.linked_assets || [];
      const missingLinks = linkedAssets.filter((rel: string) =>
        !fs.existsSync(path.join(enginesRoot, engine, rel))
      );
      if (linkedAssets.length > 0) {
        if (missingLinks.length === 0) {
          healthDetails.push(`${linkedAssets.length} linked assets present`);
        } else {
          healthDetails.push(`${missingLinks.length}/${linkedAssets.length} linked assets missing`);
        }
      }

      records.push({
        id: file.replace('.manifest.json', ''),
        name: manifest?.template_name || manifest?.name || file.replace('.manifest.json', ''),
        engine,
        isCanva,
        isAdobeExpress,
        isFigma,
        figmaFileKey,
        figmaNodeId,
        figmaUrl,
        canvaDesignId,
        canvaUrl,
        adobeTemplateUrn,
        adobeEditorUrl,
        thumbnailUrl,
        sourceTemplate,
        brandKitId: manifest?.brand_kit_id || null,
        brandKitName: manifest?.brand_kit_name || null,
        category: manifest?.category || null,
        industry: manifest?.industry || null,
        verticalLabel: manifest?.vertical_label || null,
        dimensions: manifest?.dimensions || null,
        status: manifest?.status || null,
        fonts: manifest?.fonts || [],
        linkedAssets,
        missingLinks,
        manifestPath,
        templatePath,
        templateExists,
        manifest,
        healthScore,
        healthDetails,
        requiredObjects
      });
    }
  }
  return records;
});

ipcMain.handle('platform:runAdobeExpressJob', async (_event, payload: {
  templateId: string;
  templateUrn: string;
  editorUrl: string;
  content: Record<string, string>;
  images?: Record<string, string>; // fieldKey → absolute local path (reference only)
  outputName?: string;
}) => {
  ensureWorkspace();
  const outDir = path.join(workspaceRoot, 'outputs', 'adobe_express');
  ensureDir(outDir);
  const safeName = String(payload.outputName || `adobe_job_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_');
  const jobPath = path.join(outDir, `${safeName}.job.json`);

  // Resolve image references — store filename + path; copy to output dir for easy access
  const imageRefs: Record<string, { fileName: string; sourcePath: string }> = {};
  if (payload.images) {
    for (const [key, srcPath] of Object.entries(payload.images)) {
      if (srcPath && fs.existsSync(srcPath)) {
        const fileName = path.basename(srcPath);
        const destPath = path.join(outDir, `${safeName}_${key}_${fileName}`);
        try { fs.copyFileSync(srcPath, destPath); } catch { /* non-fatal */ }
        imageRefs[key] = { fileName, sourcePath: srcPath };
      }
    }
  }

  const job = {
    jobId: safeName,
    templateId: payload.templateId,
    templateUrn: payload.templateUrn,
    editorUrl: payload.editorUrl,
    content: payload.content,
    ...(Object.keys(imageRefs).length > 0 ? { imageReferences: imageRefs } : {}),
    createdAt: new Date().toISOString(),
    mode: 'handoff',
    status: 'pending',
  };
  fs.writeFileSync(jobPath, JSON.stringify(job, null, 2));
  if (!payload.editorUrl?.startsWith('https://')) {
    return { ok: false, message: 'Template is missing a valid editor URL. Check the manifest editor_url field.' };
  }
  await shell.openExternal(payload.editorUrl);
  const imageCount = Object.keys(imageRefs).length;
  return {
    ok: true,
    jobId: safeName,
    jobPath,
    editorUrl: payload.editorUrl,
    operationCount: Object.keys(payload.content).length,
    imageCount,
    mode: 'handoff' as const,
  };
});

ipcMain.handle('platform:openCanvaDesign', async (_event, url: string) => {
  if (!url || !url.startsWith('https://')) return { ok: false, message: 'Invalid URL.' };
  await shell.openExternal(url);
  return { ok: true };
});

// Fetch the user's Canva brand kits for the generation panel dropdown.
ipcMain.handle('platform:listCanvaBrandKits', async () => {
  const token = await getValidCanvaAccessToken();
  if (!token) return { ok: false, message: 'No Canva access token.', kits: [] };
  const res = await canvaRequest('GET', '/rest/v1/brand-kits', token);
  if (res.status !== 200) return { ok: false, message: `Canva API error ${res.status}`, kits: [] };
  const kits = (res.data?.items ?? res.data?.brand_kits ?? []).map((k: any) => ({
    id: k.id ?? k.brand_kit_id,
    name: k.name ?? k.title ?? k.id,
  }));
  return { ok: true, kits };
});

// AI design generation — wraps Canva's /rest/v1/ai/designs/generate endpoint.
// Returns up to 4 design candidates with thumbnails. Polls until complete (max ~30s).
ipcMain.handle('platform:generateCanvaDesign', async (_event, payload: {
  query: string;
  designType?: string;
  brandKitId?: string;
}) => {
  const { query, designType, brandKitId } = payload;
  if (!query?.trim()) return { ok: false, message: 'A prompt is required.' };

  const token = await getValidCanvaAccessToken();
  if (!token) return { ok: false, message: 'No valid Canva access token — connect your Canva account first.' };

  // Start generation job
  const body: Record<string, any> = { query: query.trim() };
  if (designType) body.design_type = designType;
  if (brandKitId) body.brand_kit_id = brandKitId;

  const startRes = await canvaRequest('POST', '/rest/v1/ai/designs/generate', token, body);
  if (startRes.status === 404) {
    // Endpoint may differ — try alternate path
    const alt = await canvaRequest('POST', '/rest/v1/designs/generate', token, body);
    if (alt.status !== 200 && alt.status !== 202) {
      return { ok: false, message: `Canva AI generation not available (tried /ai/designs/generate and /designs/generate). Status: ${alt.status}` };
    }
    return parseGenerateResponse(alt.data);
  }
  if (startRes.status !== 200 && startRes.status !== 202) {
    return { ok: false, message: `Canva API error ${startRes.status}: ${JSON.stringify(startRes.data)}` };
  }

  // If already complete (synchronous response), return immediately
  const immediate = parseGenerateResponse(startRes.data);
  if (immediate.ok) return immediate;

  // Otherwise poll
  const jobId = startRes.data?.job?.id;
  if (!jobId) return { ok: false, message: `No job ID in response: ${JSON.stringify(startRes.data)}` };

  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 1500));
    const poll = await canvaRequest('GET', `/rest/v1/ai/designs/generate/${jobId}`, token);
    if (poll.status !== 200) return { ok: false, message: `Poll error ${poll.status}: ${JSON.stringify(poll.data)}` };
    const parsed = parseGenerateResponse(poll.data);
    if (parsed.ok || parsed.failed) return parsed;
  }
  return { ok: false, message: 'Generation timed out after 30 seconds.' };
});

function parseGenerateResponse(data: any): { ok: boolean; candidates?: any[]; failed?: boolean; message?: string } {
  const job = data?.job ?? data;
  const jobId: string | undefined = job?.id ?? data?.job?.id;
  const status = job?.status;
  if (status === 'failed') return { ok: false, failed: true, message: `Generation failed: ${JSON.stringify(job?.error ?? data)}` };
  if (status === 'in_progress' || status === 'queued') return { ok: false, message: 'in_progress' };
  const designs: any[] = job?.result?.generated_designs ?? job?.generated_designs ?? [];
  if (!designs.length) {
    if (Array.isArray(data?.generated_designs)) {
      return { ok: true, candidates: data.generated_designs.map((d: any) => normalizeCandidate(d, jobId)) };
    }
    return { ok: false, message: `Unexpected response shape: ${JSON.stringify(data).slice(0, 200)}` };
  }
  return { ok: true, candidates: designs.map((d: any) => normalizeCandidate(d, jobId)) };
}

function normalizeCandidate(d: any, jobId?: string) {
  return {
    candidateId: d.candidate_id ?? d.id,
    jobId: d.job_id ?? jobId,   // per-candidate job_id, or injected from parent job
    url: d.url,
    thumbnailUrl: d.thumbnail?.url ?? d.thumbnails?.[0]?.url ?? null,
  };
}

// Save a generation candidate to the user's Canva account, producing a real editable design.
ipcMain.handle('platform:saveCanvaDesign', async (_event, payload: {
  jobId: string;
  candidateId: string;
}) => {
  const { jobId, candidateId } = payload;
  if (!jobId || !candidateId) return { ok: false, message: 'jobId and candidateId are required.' };

  const token = await getValidCanvaAccessToken();
  if (!token) return { ok: false, message: 'No valid Canva access token.' };

  const body = { job_id: jobId, candidate_id: candidateId };

  // Try the most likely endpoint shapes
  let res = await canvaRequest('POST', '/rest/v1/ai/designs', token, body);
  if (res.status === 404) {
    res = await canvaRequest('POST', '/rest/v1/designs', token, body);
  }
  if (res.status !== 200 && res.status !== 201) {
    return { ok: false, message: `Save failed (${res.status}): ${JSON.stringify(res.data)}` };
  }

  const design = res.data?.design ?? res.data;
  const designId = design?.id ?? design?.design_id;
  const editUrl = design?.urls?.edit_url ?? design?.edit_url ?? (designId ? `https://www.canva.com/design/${designId}/edit` : null);
  return { ok: true, designId, editUrl };
});

ipcMain.handle('platform:addCanvaTemplate', async (_event, payload: {
  canvaUrl: string;
  templateName: string;
  category?: string;
  industry?: string;
  verticalLabel?: string;
  brandKitId?: string;
  brandKitName?: string;
  editableObjects?: Record<string, any>;
}) => {
  ensureWorkspace();

  // Extract design ID from Canva URL: /design/DAxxxxx/...
  const match = payload.canvaUrl.match(/\/design\/([A-Za-z0-9_-]+)/);
  if (!match) return { ok: false, message: 'Could not extract design ID from URL. Expected format: https://www.canva.com/design/DAxxxxx/...' };
  const canvaDesignId = match[1];

  const safeName = (payload.templateName || 'canva_template')
    .toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');
  const manifestId = `${safeName}_v001`;
  const refsDir = path.join(enginesRoot, 'canva', 'references');
  ensureDir(refsDir);

  const manifestPath = path.join(refsDir, `${manifestId}.manifest.json`);
  if (fs.existsSync(manifestPath)) return { ok: false, message: `Template "${manifestId}" is already registered.` };

  const manifest: Record<string, any> = {
    template_name: safeName,
    engine: 'canva',
    category: payload.category || 'general',
    industry: payload.industry || null,
    vertical_label: payload.verticalLabel || null,
    status: 'registered',
    canva_design_id: canvaDesignId,
    canva_url: payload.canvaUrl,
    brand_kit_id: payload.brandKitId || null,
    brand_kit_name: payload.brandKitName || null,
    editable_objects: payload.editableObjects || {}
  };

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  return { ok: true, manifestId, manifestPath, canvaDesignId };
});

// Generate a manifest from a Canva brand template's autofill dataset.
// Pass a BTM... brand template ID; returns the inferred editable_objects and
// (optionally) writes a manifest file when `save: true`.
ipcMain.handle('platform:generateCanvaManifest', async (_event, payload: {
  brandTemplateId: string;
  templateName: string;
  save?: boolean;
  category?: string;
  industry?: string;
  verticalLabel?: string;
  brandKitId?: string;
  brandKitName?: string;
}) => {
  const { brandTemplateId, templateName, save = false } = payload;
  if (!brandTemplateId?.trim()) return { ok: false, message: 'brandTemplateId is required.' };
  // Design IDs (DA...) are not brand templates — reject them with a clear message.
  // Valid brand template IDs include EAG..., BTM..., and other Canva team-specific prefixes.
  if (/^DA[A-Za-z0-9_-]/.test(brandTemplateId)) {
    return { ok: false, message: `"${brandTemplateId}" is a design ID (starts with DA), not a brand template ID. Open the template in Canva → Share → Brand template ID, or find it via the brand templates library URL.` };
  }

  const token = await getValidCanvaAccessToken();
  if (!token) return { ok: false, message: 'No valid Canva access token — connect your Canva account in Settings first.' };

  const { status, data } = await canvaRequest('GET', `/rest/v1/brand-templates/${brandTemplateId}/dataset`, token);
  if (status === 404) return { ok: false, message: `Brand template "${brandTemplateId}" not found in your Canva team. Make sure it is published and accessible.` };
  if (status !== 200) return { ok: false, message: `Canva API error ${status}: ${JSON.stringify(data)}` };

  // Parse dataset schema → editable_objects
  // Canva returns: dataset.type + dataset.data_table.schema.rows (each row has name + kind)
  const schema: Array<{ name: string; kind: string }> = data?.dataset?.data_table?.schema?.rows ?? [];
  const editableObjects: Record<string, any> = {};

  for (const row of schema) {
    const key = (row.name || '').toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');
    if (!key) continue;
    const isImage = (row.kind ?? '').toLowerCase().includes('image');
    editableObjects[key] = {
      type: isImage ? 'image' : 'text',
      required: false,
      dataset_field: row.name,
      note: '',
      ...(isImage ? {} : { max_chars: 400 }),
    };
  }

  // Also fetch the design URL from the brand template
  let canvaUrl = '';
  try {
    const tmplRes = await canvaRequest('GET', `/rest/v1/brand-templates/${brandTemplateId}`, token);
    if (tmplRes.status === 200) {
      canvaUrl = tmplRes.data?.brand_template?.view_url ?? tmplRes.data?.brand_template?.edit_url ?? '';
    }
  } catch { /* non-fatal */ }

  const safeName = (templateName || 'canva_template')
    .toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');
  const manifestId = `${safeName}_v001`;

  const manifest: Record<string, any> = {
    id: manifestId,
    name: templateName,
    engine: 'canva',
    category: payload.category || 'general',
    industry: payload.industry || null,
    vertical_label: payload.verticalLabel || null,
    status: 'production',
    canva_brand_template_id: brandTemplateId,
    canva_url: canvaUrl,
    brand_kit_id: payload.brandKitId || null,
    brand_kit_name: payload.brandKitName || null,
    required_objects: Object.entries(editableObjects)
      .filter(([, v]) => v.required)
      .map(([k]) => k),
    editable_objects: editableObjects,
    health_score: 100,
    _generated_from_dataset: true,
    _dataset_field_count: schema.length,
  };

  if (save) {
    const refsDir = path.join(enginesRoot, 'canva', 'references');
    ensureDir(refsDir);
    const manifestPath = path.join(refsDir, `${manifestId}.manifest.json`);
    if (fs.existsSync(manifestPath)) {
      return { ok: false, message: `Manifest "${manifestId}" already exists. Rename or delete it first.` };
    }
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    return { ok: true, manifestId, manifestPath, manifest, fieldCount: schema.length };
  }

  return { ok: true, manifest, fieldCount: schema.length };
});

ipcMain.handle('platform:addAdobeExpressTemplate', async (_event, payload: {
  editorUrl: string;
  templateUrn?: string;
  templateName: string;
  vertical?: string;
  /** Keys that are required — each gets required: true in editable_objects */
  requiredObjects?: string[];
  /** Full editable_objects map — if provided, used verbatim (overrides requiredObjects) */
  editableObjects?: Record<string, { type?: string; required?: boolean; note?: string; max_chars?: number }>;
}) => {
  const { editorUrl, templateUrn, templateName, vertical, requiredObjects = [], editableObjects } = payload;
  if (!editorUrl?.startsWith('https://') || !templateName?.trim()) {
    return { ok: false, message: 'A valid editor URL and template name are required.' };
  }
  const safeName = templateName.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');
  const refsDir = path.join(enginesRoot, 'adobe_express', 'references');
  ensureDir(refsDir);

  let version = 1;
  let manifestId = `${safeName}_v${String(version).padStart(3, '0')}`;
  while (fs.existsSync(path.join(refsDir, `${manifestId}.manifest.json`))) {
    version++;
    manifestId = `${safeName}_v${String(version).padStart(3, '0')}`;
  }

  // Build editable_objects — prefer explicit map; fall back to required key list
  const requiredSet = new Set(requiredObjects);
  const objs: Record<string, any> = {};
  if (editableObjects && Object.keys(editableObjects).length > 0) {
    // Caller provided full definitions — normalise: ensure type and required are set
    for (const [key, def] of Object.entries(editableObjects)) {
      objs[key] = { type: def.type ?? 'text', required: !!def.required, note: def.note ?? '', ...(def.max_chars ? { max_chars: def.max_chars } : {}) };
    }
  } else {
    // Simple key list — create minimal text entries; mark required ones
    for (const key of requiredObjects) {
      objs[key] = { type: 'text', required: true, note: '' };
    }
  }

  const manifest = {
    id: manifestId,
    template_name: templateName.trim(),   // preserve readable casing
    engine: 'adobe_express',
    category: 'general',
    industry: vertical?.toLowerCase().replace(/\s+/g, '_') || 'general',
    vertical_label: vertical || 'General',
    status: 'registered',
    editor_url: editorUrl,
    ...(templateUrn ? { adobe_template_urn: templateUrn } : {}),
    editable_objects: objs,               // per-object required:true, no legacy required_objects
    linked_assets: [],
  };

  fs.writeFileSync(path.join(refsDir, `${manifestId}.manifest.json`), JSON.stringify(manifest, null, 2), 'utf8');
  return { ok: true, manifestId };
});

// ---------------------------------------------------------------------------
// Update Adobe Express template manifest — edit fields of an existing template
// ---------------------------------------------------------------------------
ipcMain.handle('platform:updateAdobeExpressTemplate', async (_event, payload: {
  manifestId: string;
  /** Partial metadata overrides */
  templateName?: string;
  vertical?: string;
  editorUrl?: string;
  templateUrn?: string;
  /** Full replacement editable_objects map */
  editableObjects?: Record<string, { type?: string; required?: boolean; note?: string; max_chars?: number }>;
}) => {
  const { manifestId, editableObjects, ...meta } = payload;
  if (!manifestId) return { ok: false, message: 'manifestId is required.' };

  const refsDir = path.join(enginesRoot, 'adobe_express', 'references');
  const manifestPath = path.join(refsDir, `${manifestId}.manifest.json`);
  if (!fs.existsSync(manifestPath)) return { ok: false, message: `Manifest not found: ${manifestId}` };

  let existing: any;
  try { existing = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); }
  catch { return { ok: false, message: 'Manifest file is corrupt — cannot update.' }; }

  // Apply metadata overrides
  if (meta.templateName?.trim())  existing.template_name  = meta.templateName.trim();
  if (meta.editorUrl?.trim())     existing.editor_url     = meta.editorUrl.trim();
  if (meta.templateUrn?.trim())   existing.adobe_template_urn = meta.templateUrn.trim();
  if (meta.vertical !== undefined) {
    existing.industry      = meta.vertical.toLowerCase().replace(/\s+/g, '_') || 'general';
    existing.vertical_label = meta.vertical || 'General';
  }

  // Replace editable_objects if provided
  if (editableObjects && Object.keys(editableObjects).length > 0) {
    const objs: Record<string, any> = {};
    for (const [key, def] of Object.entries(editableObjects)) {
      objs[key] = { type: def.type ?? 'text', required: !!def.required, note: def.note ?? '', ...(def.max_chars ? { max_chars: def.max_chars } : {}) };
    }
    existing.editable_objects = objs;
    // Remove legacy required_objects if present
    delete existing.required_objects;
  }

  fs.writeFileSync(manifestPath, JSON.stringify(existing, null, 2), 'utf8');
  return { ok: true, manifestId };
});

// ---------------------------------------------------------------------------
// Canva Job Runner — fills a registered template's element IDs with content
// ---------------------------------------------------------------------------
ipcMain.handle('platform:runCanvaJob', async (_event, payload: {
  templateId: string;
  content: Record<string, string>;
  images?: Record<string, { assetId?: string; url?: string }>;
}) => {
  const { templateId, content, images = {} } = payload;

  // Load manifest
  const manifestPath = path.join(enginesRoot, 'canva', 'references', `${templateId}.manifest.json`);
  if (!fs.existsSync(manifestPath)) return { ok: false, message: `Manifest not found: ${templateId}` };
  let manifest: any;
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); }
  catch { return { ok: false, message: `Manifest file is corrupt: ${templateId}` }; }

  if (!manifest.canva_design_id) return { ok: false, message: 'Manifest missing canva_design_id' };
  if (!manifest.editable_objects) return { ok: false, message: 'Manifest missing editable_objects — re-register template to map element IDs' };

  // Build operation list from content fields → element IDs
  const ops: Array<{ field: string; elementId: string; value: string }> = [];
  for (const [field, value] of Object.entries(content)) {
    if (!value?.trim()) continue;
    const obj = manifest.editable_objects[field];
    if (obj?.element_id) ops.push({ field, elementId: obj.element_id, value: value.trim() });
  }

  if (!ops.length) return { ok: false, message: 'No matching editable fields found for provided content' };

  const jobId = `canva_job_${Date.now()}`;
  const outDir = path.join(workspaceRoot, 'outputs', 'canva');
  ensureDir(outDir);
  const unmapped = Object.keys(content).filter(f => !manifest.editable_objects?.[f]);

  const token = await getValidCanvaAccessToken();
  if (token) {
    // Execute via Canva Connect autofill API — keys must be Canva element IDs, not field names
    const data: Record<string, any> = {};
    for (const op of ops) data[op.elementId] = { type: 'text', text: op.value };
    // Merge image fields
    for (const [field, imgData] of Object.entries(images)) {
      const obj = manifest.editable_objects?.[field];
      if (!obj?.element_id) continue; // skip unmapped image fields
      const elementId = obj.element_id;
      if (imgData.assetId) data[elementId] = { type: 'image', asset_id: imgData.assetId };
      else if (imgData.url) data[elementId] = { type: 'image', url: imgData.url };
    }

    const createRes = await canvaRequest('POST', '/rest/v1/autofills', token, {
      brand_template_id: manifest.canva_design_id,
      title: templateId,
      data,
    });

    if (createRes.status !== 200 && createRes.status !== 201) {
      return { ok: false, message: `Canva API error ${createRes.status}: ${JSON.stringify(createRes.data)}` };
    }

    const canvaJobId: string = createRes.data?.job?.id;
    if (!canvaJobId) return { ok: false, message: `Canva API did not return a job ID: ${JSON.stringify(createRes.data)}` };

    const pollResult = await pollCanvaAutofill(canvaJobId, token);
    if (!pollResult.ok) return pollResult;

    const resultUrl: string = pollResult.design?.url || manifest.canva_url;
    const resultDesignId: string = pollResult.design?.id || manifest.canva_design_id;

    const job = { jobId, templateId, canvaDesignId: manifest.canva_design_id, resultDesignId, resultUrl, createdAt: new Date().toISOString(), operations: ops.map(op => ({ type: 'replace_text', element_id: op.elementId, text: op.value, field: op.field })), status: 'completed' };
    fs.writeFileSync(path.join(outDir, `${jobId}.job.json`), JSON.stringify(job, null, 2), 'utf8');

    return { ok: true, jobId, canvaDesignId: manifest.canva_design_id, resultDesignId, resultUrl, operationCount: ops.length, unmapped, mode: 'api' };
  }

  // No token — write handoff file for manual execution
  const imageOps = Object.entries(images)
    .filter(([field]) => manifest.editable_objects?.[field]?.element_id)
    .map(([field, img]) => ({ type: 'replace_image', field, element_id: manifest.editable_objects[field].element_id, ...img }));
  const job = {
    jobId,
    templateId,
    canvaDesignId: manifest.canva_design_id,
    canvaUrl: manifest.canva_url,
    createdAt: new Date().toISOString(),
    operations: [
      ...ops.map(op => ({ type: 'replace_text', element_id: op.elementId, text: op.value, field: op.field })),
      ...imageOps,
    ],
    status: 'pending',
  };
  const jobPath = path.join(outDir, `${jobId}.job.json`);
  fs.writeFileSync(jobPath, JSON.stringify(job, null, 2), 'utf8');

  return { ok: true, jobId, jobPath, canvaDesignId: manifest.canva_design_id, canvaUrl: manifest.canva_url, operationCount: ops.length, unmapped, mode: 'handoff' };
});

// Update a Canva template manifest's element ID mapping
ipcMain.handle('platform:updateCanvaMapping', async (_event, payload: {
  templateId: string;
  fieldMappings: Record<string, string>; // field name → element_id
}) => {
  const manifestPath = path.join(enginesRoot, 'canva', 'references', `${payload.templateId}.manifest.json`);
  if (!fs.existsSync(manifestPath)) return { ok: false, message: 'Manifest not found' };
  let manifest: any;
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); }
  catch { return { ok: false, message: 'Manifest file is corrupt or unreadable' }; }
  if (!manifest.editable_objects) manifest.editable_objects = {};
  for (const [field, elementId] of Object.entries(payload.fieldMappings)) {
    if (!manifest.editable_objects[field]) manifest.editable_objects[field] = {};
    manifest.editable_objects[field].element_id = elementId;
  }
  try { fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8'); }
  catch (e: any) { return { ok: false, message: `Failed to save manifest: ${e.message}` }; }
  return { ok: true };
});

ipcMain.handle('platform:addLocalTemplate', async (_event, payload: {
  engine: 'illustrator' | 'indesign';
  sourcePath: string;
  templateName: string;
  vertical?: string;
  dimensions?: string;
  fields: { key: string; type: 'text' | 'image'; required: boolean; note?: string; maxChars?: number }[];
  fonts?: { family: string; weights: string[] }[];
}) => {
  const { engine, sourcePath, templateName, vertical, dimensions, fields, fonts } = payload;
  if (!sourcePath || !templateName?.trim()) return { ok: false, message: 'Template name and file are required.' };

  const ext = engine === 'indesign' ? '.indd' : '.ai';
  const resolvedSource = path.resolve(sourcePath);
  if (path.extname(resolvedSource).toLowerCase() !== ext) return { ok: false, message: `Expected a ${ext} file for the ${engine} engine.` };
  if (!fs.existsSync(resolvedSource)) return { ok: false, message: 'Source file not found.' };
  const engineDir = path.join(enginesRoot, engine);

  // Generate a unique ID from the template name
  function makeId(name: string, version: number): string {
    const base = name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    return `${base}_v${String(version).padStart(3, '0')}`;
  }
  let version = 1;
  let templateId = makeId(templateName, version);
  while (
    fs.existsSync(path.join(engineDir, 'references', `${templateId}.manifest.json`)) ||
    fs.existsSync(path.join(engineDir, 'templates', `${templateId}${ext}`))
  ) {
    version++;
    templateId = makeId(templateName, version);
  }

  const destTemplate = path.join(engineDir, 'templates', `${templateId}${ext}`);
  const destManifest = path.join(engineDir, 'references', `${templateId}.manifest.json`);

  try {
    ensureDir(path.join(engineDir, 'templates'));
    ensureDir(path.join(engineDir, 'references'));
    fs.copyFileSync(sourcePath, destTemplate);
  } catch (err: any) {
    return { ok: false, message: `Could not copy template file: ${err.message}` };
  }

  const editableObjects: Record<string, any> = {};
  for (const f of fields) {
    editableObjects[f.key] = {
      type: f.type,
      required: f.required,
      ...(f.note ? { note: f.note } : {}),
      ...(f.maxChars && f.type !== 'image' ? { max_chars: f.maxChars } : {}),
    };
  }

  const manifest = {
    id: templateId,
    name: templateName.trim(),
    engine,
    version: `1.0.${version - 1}`,
    status: 'registered',
    category: 'general',
    vertical_label: vertical?.trim() || 'General',
    industry: vertical?.trim().toLowerCase().replace(/\s+/g, '_') || 'general',
    document_format: dimensions || (engine === 'indesign' ? 'Letter (8.5×11)' : 'Letter (8.5×11)'),
    dimensions: dimensions || '',
    source_template: `templates/${templateId}${ext}`,
    editable_objects: editableObjects,
    ...(fonts?.length ? { fonts } : {}),
    linked_assets: [],
  };

  try {
    fs.writeFileSync(destManifest, JSON.stringify(manifest, null, 2), 'utf8');
  } catch (err: any) {
    return { ok: false, message: `Could not write manifest: ${err.message}` };
  }

  return { ok: true, manifestId: templateId, templatePath: destTemplate };
});

ipcMain.handle('platform:replaceTemplate', async (_event, engineId: string, templateFileName: string) => {
  ensureWorkspace();
  const result = await dialog.showOpenDialog({
    title: 'Select Illustrator Template',
    properties: ['openFile'],
    filters: [{ name: 'Adobe Illustrator', extensions: ['ai'] }]
  });
  if (result.canceled || !result.filePaths.length) return { ok: false, message: 'No template selected.' };
  const dest = path.join(enginesRoot, engineId, 'templates', templateFileName);
  ensureDir(path.dirname(dest));
  fs.copyFileSync(result.filePaths[0], dest);
  return { ok: true, dest };
});

// === IPC: FIGMA ===

function figmaConfigPath(): string {
  ensureWorkspace();
  return path.join(workspaceRoot, 'integrations', 'figma_config.json');
}

function readFigmaConfig(): { token?: string } {
  try {
    const p = figmaConfigPath();
    if (!fs.existsSync(p)) return {};
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch { return {}; }
}

function saveFigmaConfig(cfg: { token: string }) {
  const p = figmaConfigPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(cfg, null, 2), 'utf8');
}

async function figmaRequest(
  endpoint: string,
  method: 'GET' | 'POST' = 'GET',
  body?: any
): Promise<any> {
  const cfg = readFigmaConfig();
  if (!cfg.token) throw new Error('Figma token not configured. Add your Personal Access Token on the Figma screen.');
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : undefined;
    const req = https.request({
      hostname: 'api.figma.com',
      path: `/v1${endpoint}`,
      method,
      headers: {
        'X-Figma-Token': cfg.token!,
        'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch { resolve({}); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function parseFigmaFileKey(url: string): string | null {
  const m = url.match(/figma\.com\/(?:file|design)\/([A-Za-z0-9]+)/);
  return m ? m[1] : null;
}

function parseFigmaNodeId(url: string): string | null {
  const m = url.match(/[?&]node-id=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

ipcMain.handle('platform:setFigmaToken', async (_event, token: string) => {
  try { saveFigmaConfig({ token }); return { ok: true }; }
  catch (e: any) { return { ok: false, message: e.message }; }
});

ipcMain.handle('platform:getFigmaToken', async () => {
  const cfg = readFigmaConfig();
  const hasToken = !!cfg.token;
  const masked = hasToken ? `${cfg.token!.slice(0, 6)}…${cfg.token!.slice(-4)}` : null;
  return { ok: true, hasToken, masked };
});

ipcMain.handle('platform:getFigmaFileInfo', async (_event, fileKey: string) => {
  try {
    const data = await figmaRequest(`/files/${fileKey}?depth=1`);
    if (data.err) return { ok: false, message: data.err };
    const pages = data.document?.children ?? [];
    let frameCount = 0;
    for (const page of pages) {
      frameCount += (page.children ?? []).filter((n: any) => n.type === 'FRAME' || n.type === 'COMPONENT').length;
    }
    return { ok: true, name: data.name, lastModified: data.lastModified, thumbnailUrl: data.thumbnailUrl, pageCount: pages.length, frameCount };
  } catch (e: any) {
    return { ok: false, message: e.message,
      likelyCauses: ['Figma token not configured or invalid', 'File key not found or access denied'],
      recoverySteps: ['Enter your Figma Personal Access Token in Connection & Token.', 'Verify the file exists and you have view access.'] };
  }
});

ipcMain.handle('platform:getFigmaVariables', async (_event, fileKey: string) => {
  try {
    const data = await figmaRequest(`/files/${fileKey}/variables/local`);
    if (data.error) return { ok: false, message: data.message ?? String(data.error) };
    const vars = data.meta?.variables ?? {};
    const varList = (Object.values(vars) as any[]).filter(v => v.resolvedType === 'STRING');
    return { ok: true, variableCount: varList.length, variableNames: varList.map(v => v.name), variables: varList };
  } catch (e: any) { return { ok: false, message: e.message }; }
});

ipcMain.handle('platform:updateFigmaVariables', async (_event, payload: { fileKey: string; updates: Record<string, string> }) => {
  try {
    const { fileKey, updates } = payload;
    const data = await figmaRequest(`/files/${fileKey}/variables/local`);
    if (data.error) return { ok: false, message: data.message ?? 'Could not read variables' };
    const vars = data.meta?.variables ?? {};
    const collections = data.meta?.variableCollections ?? {};
    const varList = Object.values(vars) as any[];
    const variableActions: any[] = [];
    for (const [name, value] of Object.entries(updates)) {
      const v = varList.find((x: any) => x.name === name || x.name.toUpperCase() === name.toUpperCase());
      if (!v) continue;
      const coll = collections[v.variableCollectionId];
      if (!coll) continue;
      variableActions.push({ action: 'UPDATE', id: v.id, resolvedDataType: 'STRING',
        valuesByMode: { [coll.defaultModeId]: { type: 'STRING', value } } });
    }
    if (variableActions.length === 0)
      return { ok: false, message: `No matching variables found for: ${Object.keys(updates).join(', ')}` };
    await figmaRequest(`/files/${fileKey}/variables`, 'POST', { variableActions });
    return { ok: true, matched: variableActions.length, message: `Updated ${variableActions.length} variable${variableActions.length !== 1 ? 's' : ''}` };
  } catch (e: any) { return { ok: false, message: e.message }; }
});

async function downloadFigmaExport(url: string, filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(filePath);
    const cleanup = (err: Error) => { fs.unlink(filePath, () => {}); reject(err); };
    file.on('error', cleanup);
    protocol.get(url, (res) => {
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', cleanup);
  });
}

ipcMain.handle('platform:exportFigmaFrames', async (_event, payload: {
  fileKey: string; nodeId?: string; format: 'png' | 'svg' | 'pdf'; scale?: number; outputName?: string;
}) => {
  try {
    const { fileKey, nodeId, format, scale = 2, outputName } = payload;
    const ids = nodeId ? encodeURIComponent(nodeId) : '';
    const qs = `format=${format}&scale=${scale}${ids ? `&ids=${ids}` : ''}`;
    const data = await figmaRequest(`/images/${fileKey}?${qs}`);
    if (data.err) return { ok: false, message: data.err };
    const urls = Object.values(data.images ?? {}) as string[];
    if (urls.length === 0) return { ok: false, message: 'No images returned from Figma API' };
    const outDir = path.join(workspaceRoot, 'outputs', 'figma');
    ensureDir(outDir);
    const safeName = sanitizeName(outputName || `figma_export_${Date.now()}`);
    const exportedFiles: { name: string; path: string }[] = [];
    await Promise.all(urls.map(async (url, i) => {
      const filename = `${safeName}_${i + 1}.${format}`;
      const filePath = path.join(outDir, filename);
      await downloadFigmaExport(url, filePath);
      exportedFiles.push({ name: filename, path: filePath });
    }));
    return { ok: true, exportedFiles, format };
  } catch (e: any) { return { ok: false, message: e.message }; }
});

ipcMain.handle('platform:runFigmaJob', async (_event, payload: {
  templateId?: string; figmaFileKey: string; figmaNodeId?: string; figmaUrl?: string;
  content?: Record<string, string>; images?: Record<string, string>;
  format: 'png' | 'svg' | 'pdf'; outputName?: string; projectId?: string;
}) => {
  try {
    const { figmaFileKey, figmaNodeId, content, format, outputName, figmaUrl } = payload;
    if (!figmaFileKey) return { ok: false, message: 'No Figma file key — register a Figma file first.' };

    // Step 1: try to update Variables if content provided
    let variablesUpdated = 0;
    if (content && Object.keys(content).length > 0) {
      try {
        const varsData = await figmaRequest(`/files/${figmaFileKey}/variables/local`);
        if (!varsData.error) {
          const vars = varsData.meta?.variables ?? {};
          const collections = varsData.meta?.variableCollections ?? {};
          const varList = Object.values(vars) as any[];
          const variableActions: any[] = [];
          for (const [name, value] of Object.entries(content)) {
            const v = varList.find((x: any) => x.name === name || x.name.toUpperCase() === name.toUpperCase());
            if (!v) continue;
            const coll = collections[v.variableCollectionId];
            if (!coll) continue;
            variableActions.push({ action: 'UPDATE', id: v.id, resolvedDataType: 'STRING',
              valuesByMode: { [coll.defaultModeId]: { type: 'STRING', value } } });
          }
          if (variableActions.length > 0) {
            await figmaRequest(`/files/${figmaFileKey}/variables`, 'POST', { variableActions });
            variablesUpdated = variableActions.length;
          }
        }
      } catch { /* variable update is best-effort; continue to export */ }
    }

    // Step 2: Export frame(s)
    const ids = figmaNodeId ? encodeURIComponent(figmaNodeId) : '';
    const qs = `format=${format}&scale=2${ids ? `&ids=${ids}` : ''}`;
    const imgData = await figmaRequest(`/images/${figmaFileKey}?${qs}`);

    if (imgData.err || Object.keys(imgData.images ?? {}).length === 0) {
      return {
        ok: true, mode: 'handoff' as const,
        figmaUrl: figmaUrl ?? `https://www.figma.com/file/${figmaFileKey}`,
        variablesUpdated,
        message: `${variablesUpdated > 0 ? `${variablesUpdated} variable${variablesUpdated !== 1 ? 's' : ''} updated. ` : ''}Open Figma to export manually.`,
      };
    }

    const urls = Object.values(imgData.images) as string[];
    const outDir = path.join(workspaceRoot, 'outputs', 'figma');
    ensureDir(outDir);
    const safeName = sanitizeName(outputName || `figma_${figmaFileKey.slice(0, 8)}_${Date.now()}`);
    const exportedFiles: { name: string; path: string }[] = [];
    await Promise.all(urls.map(async (url, i) => {
      const filename = `${safeName}_${i + 1}.${format}`;
      const filePath = path.join(outDir, filename);
      await downloadFigmaExport(url, filePath);
      exportedFiles.push({ name: filename, path: filePath });
    }));

    return {
      ok: true, mode: 'export' as const, exportedFiles, format, variablesUpdated,
      figmaUrl: figmaUrl ?? `https://www.figma.com/file/${figmaFileKey}`,
      message: `Exported ${exportedFiles.length} file${exportedFiles.length !== 1 ? 's' : ''}${variablesUpdated ? ` · ${variablesUpdated} variable${variablesUpdated !== 1 ? 's' : ''} updated` : ''}.`,
    };
  } catch (e: any) {
    return { ok: false, message: e.message,
      likelyCauses: ['Figma token not configured or invalid', 'File not found or access denied'],
      recoverySteps: ['Set your Figma PAT in Connection & Token.', 'Verify the file key and your access level in Figma.'] };
  }
});

ipcMain.handle('platform:addFigmaTemplate', async (_event, payload: { figmaUrl: string; templateName: string }) => {
  try {
    const { figmaUrl, templateName } = payload;
    const fileKey = parseFigmaFileKey(figmaUrl);
    if (!fileKey) return { ok: false, message: 'Could not parse Figma file key from URL. Expected format: figma.com/design/{key}/... or figma.com/file/{key}/...' };
    const nodeId = parseFigmaNodeId(figmaUrl) ?? undefined;
    const safeName = templateName.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    const refsDir = path.join(enginesRoot, 'figma', 'references');
    ensureDir(refsDir);
    let version = 1;
    let templateId = `${safeName}_v${String(version).padStart(3, '0')}`;
    while (fs.existsSync(path.join(refsDir, `${templateId}.manifest.json`))) {
      version++;
      templateId = `${safeName}_v${String(version).padStart(3, '0')}`;
    }

    let name = templateName;
    let thumbnailUrl: string | undefined;
    try {
      const info = await figmaRequest(`/files/${fileKey}?depth=1`);
      if (!info.err) { name = info.name ?? name; thumbnailUrl = info.thumbnailUrl; }
    } catch { /* proceed with provided name if API call fails */ }
    const manifest: any = {
      id: templateId, name: templateName, engine: 'figma', isFigma: true,
      figmaFileKey: fileKey, figmaNodeId: nodeId ?? null, figmaUrl,
      preview_url: thumbnailUrl ?? null,
      editable_objects: {
        TEXT_TITLE:    { type: 'text', required: true,  max_chars: 120 },
        TEXT_SUBTITLE: { type: 'text', required: false, max_chars: 180 },
        TEXT_BODY:     { type: 'text', required: false, max_chars: 600 },
        TEXT_CTA:      { type: 'text', required: false, max_chars: 120 },
        STAT_01:       { type: 'text', required: false, max_chars: 60  },
        STAT_02:       { type: 'text', required: false, max_chars: 60  },
        STAT_03:       { type: 'text', required: false, max_chars: 60  },
      },
      createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(refsDir, `${templateId}.manifest.json`), JSON.stringify(manifest, null, 2), 'utf8');
    // Return a record shaped like what listTemplates returns
    const template = {
      ...manifest,
      thumbnailUrl: manifest.preview_url,
      manifest: { editable_objects: manifest.editable_objects },
    };
    return { ok: true, template, templateId };
  } catch (e: any) { return { ok: false, message: e.message }; }
});

ipcMain.handle('platform:openFigmaDesign', async (_event, url: string) => {
  try { await shell.openExternal(url); return { ok: true }; }
  catch (e: any) { return { ok: false, message: e.message }; }
});

// === BRAND PROFILES ===

const brandsDir = () => path.join(workspaceRoot, 'brands');
const activeBrandFile = () => path.join(workspaceRoot, 'active_brand_id');

function readAllBrands(): any[] {
  const dir = brandsDir();
  if (!fs.existsSync(dir)) return [];
  try {
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.json'))
      .map(f => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return null; } })
      .filter(Boolean)
      .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  } catch { return []; }
}

function readActiveBrandId(): string | null {
  const f = activeBrandFile();
  if (!fs.existsSync(f)) return null;
  try { return fs.readFileSync(f, 'utf8').trim() || null; } catch { return null; }
}

function saveActiveBrandId(id: string | null) {
  const f = activeBrandFile();
  if (!id) { try { fs.unlinkSync(f); } catch { } return; }
  fs.writeFileSync(f, id, 'utf8');
}

function readActiveBrand(): any | null {
  const id = readActiveBrandId();
  if (!id) return null;
  const f = path.join(brandsDir(), `${id}.json`);
  if (!fs.existsSync(f)) return null;
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; }
}

ipcMain.handle('platform:listBrands', async () => {
  try {
    ensureWorkspace();
    ensureDir(brandsDir());
    return { ok: true, brands: readAllBrands(), activeId: readActiveBrandId() };
  } catch (e: any) { return { ok: false, brands: [], activeId: null, message: e.message }; }
});

ipcMain.handle('platform:createBrand', async (_event, payload: {
  name: string; color?: string; description?: string; isMaster?: boolean;
  subBrands?: Array<{ id: string; name: string; color: string; description: string }>;
  products?: Array<{ id: string; name: string; description: string; category: string }>;
  templates?: Record<string, string>;
  guidelines?: Record<string, any>;
  industry?: string; website?: string;
}) => {
  try {
    ensureWorkspace();
    ensureDir(brandsDir());
    const id = `brand_${Date.now()}`;
    const now = new Date().toISOString();
    const brand: any = {
      id,
      name: String(payload.name || '').trim() || 'Untitled Brand',
      color: payload.color || '#6366f1',
      description: payload.description || '',
      isMaster: payload.isMaster ?? false,
      subBrands: payload.subBrands ?? [],
      products: payload.products ?? [],
      templates: payload.templates ?? {},
      createdAt: now,
      updatedAt: now,
    };
    if (payload.guidelines) brand.guidelines = payload.guidelines;
    if (payload.industry)   brand.industry = payload.industry;
    if (payload.website)    brand.website = payload.website;
    fs.writeFileSync(path.join(brandsDir(), `${id}.json`), JSON.stringify(brand, null, 2), 'utf8');
    return { ok: true, brand };
  } catch (e: any) { return { ok: false, message: e.message }; }
});

ipcMain.handle('platform:updateBrand', async (_event, payload: {
  id: string; name?: string; color?: string; description?: string;
  templates?: Record<string, string>; isMaster?: boolean;
  subBrands?: Array<{ id: string; name: string; color: string; description: string }>;
  products?: Array<{ id: string; name: string; description: string; category: string }>;
  guidelines?: Record<string, any>; industry?: string; website?: string;
}) => {
  try {
    const f = path.join(brandsDir(), `${payload.id}.json`);
    if (!fs.existsSync(f)) return { ok: false, message: 'Brand not found' };
    let brand: any;
    try { brand = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return { ok: false, message: 'Brand file corrupt' }; }
    if (payload.name        !== undefined) brand.name        = String(payload.name).trim() || brand.name;
    if (payload.color       !== undefined) brand.color       = payload.color;
    if (payload.description !== undefined) brand.description = payload.description;
    if (payload.isMaster    !== undefined) brand.isMaster    = payload.isMaster;
    if (payload.subBrands   !== undefined) brand.subBrands   = payload.subBrands;
    if (payload.products    !== undefined) brand.products    = payload.products;
    if (payload.templates   !== undefined) brand.templates   = { ...brand.templates, ...payload.templates };
    if (payload.guidelines  !== undefined) brand.guidelines  = payload.guidelines;
    if (payload.industry    !== undefined) brand.industry    = payload.industry;
    if (payload.website     !== undefined) brand.website     = payload.website;
    brand.updatedAt = new Date().toISOString();
    fs.writeFileSync(f, JSON.stringify(brand, null, 2), 'utf8');
    return { ok: true, brand };
  } catch (e: any) { return { ok: false, message: e.message }; }
});

ipcMain.handle('platform:deleteBrand', async (_event, id: string) => {
  try {
    const f = path.join(brandsDir(), `${id}.json`);
    if (!fs.existsSync(f)) return { ok: false, message: 'Brand not found' };
    fs.unlinkSync(f);
    if (readActiveBrandId() === id) saveActiveBrandId(null);
    return { ok: true };
  } catch (e: any) { return { ok: false, message: e.message }; }
});

ipcMain.handle('platform:setActiveBrand', async (_event, id: string | null) => {
  try {
    ensureWorkspace();
    if (id) {
      const f = path.join(brandsDir(), `${id}.json`);
      if (!fs.existsSync(f)) return { ok: false, message: 'Brand not found' };
    }
    saveActiveBrandId(id);
    return { ok: true };
  } catch (e: any) { return { ok: false, message: e.message }; }
});

ipcMain.handle('platform:getActiveBrand', async () => {
  try {
    ensureWorkspace();
    return { ok: true, brand: readActiveBrand() };
  } catch (e: any) { return { ok: false, brand: null, message: e.message }; }
});

// === IPC: SKILLS STUDIO ===

function skillsDir(): string {
  const d = path.join(workspaceRoot, 'skills');
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  return d;
}

function readManifest(skillPath: string): any | null {
  try {
    const mf = path.join(skillPath, 'manifest.json');
    if (!fs.existsSync(mf)) return null;
    return JSON.parse(fs.readFileSync(mf, 'utf8'));
  } catch { return null; }
}

ipcMain.handle('platform:listSkills', async () => {
  try {
    const dir = skillsDir();
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const skills = entries
      .filter(e => e.isDirectory())
      .map(e => {
        const manifest = readManifest(path.join(dir, e.name));
        if (!manifest) return null;
        return { ...manifest, _folder: e.name };
      })
      .filter(Boolean);
    return { ok: true, skills };
  } catch (e: any) { return { ok: false, skills: [], message: e.message }; }
});

ipcMain.handle('platform:getSkill', async (_event, id: string) => {
  try {
    const skillPath = path.join(skillsDir(), id);
    if (!fs.existsSync(skillPath)) return { ok: false, message: 'Skill not found' };
    const manifest = readManifest(skillPath);
    const readOpt = (rel: string) => { try { return fs.readFileSync(path.join(skillPath, rel), 'utf8'); } catch { return ''; } };
    const readJson = (rel: string) => { try { return JSON.parse(fs.readFileSync(path.join(skillPath, rel), 'utf8')); } catch { return null; } };
    return {
      ok: true,
      skill: {
        manifest,
        systemPrompt: readOpt('prompt/system.md'),
        userTemplate: readOpt('prompt/user_template.md'),
        readme: readOpt('README.md'),
        fields: {
          illustrator:   readJson('fields/illustrator.json')   ?? [],
          indesign:      readJson('fields/indesign.json')      ?? [],
          canva:         readJson('fields/canva.json')         ?? [],
          adobe_express: readJson('fields/adobe_express.json') ?? [],
          figma:         readJson('fields/figma.json')         ?? [],
        },
        exampleInput:  readJson('examples/input.json'),
        exampleOutput: readJson('examples/output.json'),
      },
    };
  } catch (e: any) { return { ok: false, message: e.message }; }
});

ipcMain.handle('platform:saveSkill', async (_event, payload: {
  manifest: any;
  systemPrompt: string;
  userTemplate: string;
  readme?: string;
  fields: Record<string, any[]>;
  exampleInput?: any;
  exampleOutput?: any;
}) => {
  try {
    const id = payload.manifest.id || payload.manifest.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const skillPath = path.join(skillsDir(), id);
    fs.mkdirSync(path.join(skillPath, 'prompt'),   { recursive: true });
    fs.mkdirSync(path.join(skillPath, 'fields'),   { recursive: true });
    fs.mkdirSync(path.join(skillPath, 'examples'), { recursive: true });

    const manifest = { ...payload.manifest, id, updated: new Date().toISOString() };
    fs.writeFileSync(path.join(skillPath, 'manifest.json'), JSON.stringify(manifest, null, 2));
    fs.writeFileSync(path.join(skillPath, 'prompt', 'system.md'), payload.systemPrompt || '');
    fs.writeFileSync(path.join(skillPath, 'prompt', 'user_template.md'), payload.userTemplate || '');
    if (payload.readme) fs.writeFileSync(path.join(skillPath, 'README.md'), payload.readme);

    for (const [eng, fields] of Object.entries(payload.fields)) {
      fs.writeFileSync(path.join(skillPath, 'fields', `${eng}.json`), JSON.stringify(fields, null, 2));
    }
    if (payload.exampleInput)  fs.writeFileSync(path.join(skillPath, 'examples', 'input.json'),  JSON.stringify(payload.exampleInput, null, 2));
    if (payload.exampleOutput) fs.writeFileSync(path.join(skillPath, 'examples', 'output.json'), JSON.stringify(payload.exampleOutput, null, 2));

    return { ok: true, id };
  } catch (e: any) { return { ok: false, message: e.message }; }
});

ipcMain.handle('platform:deleteSkill', async (_event, id: string) => {
  try {
    const skillPath = path.join(skillsDir(), id);
    if (fs.existsSync(skillPath)) fs.rmSync(skillPath, { recursive: true, force: true });
    return { ok: true };
  } catch (e: any) { return { ok: false, message: e.message }; }
});

ipcMain.handle('platform:exportSkillZip', async (_event, id: string) => {
  try {
    const skillPath = path.join(skillsDir(), id);
    if (!fs.existsSync(skillPath)) return { ok: false, message: 'Skill not found' };

    const { filePath } = await dialog.showSaveDialog({
      title: 'Export Skill',
      defaultPath: path.join(app.getPath('downloads'), `${id}.zip`),
      filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
    });
    if (!filePath) return { ok: false, message: 'Cancelled' };

    await new Promise<void>((resolve, reject) => {
      execFile('/usr/bin/zip', ['-r', filePath, '.'], { cwd: skillPath }, (err) => {
        if (err) reject(err); else resolve();
      });
    });
    return { ok: true, path: filePath };
  } catch (e: any) { return { ok: false, message: e.message }; }
});

ipcMain.handle('platform:importSkillZip', async () => {
  try {
    const { filePaths } = await dialog.showOpenDialog({
      title: 'Import Skill',
      filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
      properties: ['openFile'],
    });
    if (!filePaths.length) return { ok: false, message: 'Cancelled' };

    const zipPath = filePaths[0];
    // Peek inside zip to find the root folder name
    const listing = await new Promise<string>((resolve, reject) => {
      execFile('/usr/bin/unzip', ['-l', zipPath], (err, stdout) => {
        if (err) reject(err); else resolve(stdout);
      });
    });

    // Extract to a temp dir, then read manifest to get the canonical id
    const tmp = path.join(app.getPath('temp'), `skill_import_${Date.now()}`);
    fs.mkdirSync(tmp, { recursive: true });
    await new Promise<void>((resolve, reject) => {
      execFile('/usr/bin/unzip', ['-o', zipPath, '-d', tmp], (err) => {
        if (err) reject(err); else resolve();
      });
    });

    // Find manifest.json — could be at root or one level down
    let manifestPath: string | null = null;
    const topLevel = fs.readdirSync(tmp, { withFileTypes: true });
    for (const entry of topLevel) {
      if (entry.isDirectory()) {
        const nested = path.join(tmp, entry.name, 'manifest.json');
        if (fs.existsSync(nested)) { manifestPath = nested; break; }
      }
      if (entry.name === 'manifest.json') { manifestPath = path.join(tmp, 'manifest.json'); break; }
    }
    if (!manifestPath) { fs.rmSync(tmp, { recursive: true }); return { ok: false, message: 'Invalid skill package — no manifest.json found.' }; }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const id = manifest.id || manifest.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (!id) { fs.rmSync(tmp, { recursive: true }); return { ok: false, message: 'Skill manifest missing id/name field.' }; }

    const srcDir = path.dirname(manifestPath);
    const destDir = path.join(skillsDir(), id);
    if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true });
    fs.renameSync(srcDir, destDir);
    fs.rmSync(tmp, { recursive: true, force: true });

    void listing; // suppress unused warning
    return { ok: true, id, manifest };
  } catch (e: any) { return { ok: false, message: e.message }; }
});

// === MASTER SKILLS LIBRARY ===

const MASTER_SKILLS: Array<{
  id: string;
  manifest: object;
  systemPrompt: string;
  userTemplate: string;
  readme: string;
  fields: Record<string, object[]>;
}> = [
  {
    id: 'case-study-generator',
    manifest: {
      id: 'case-study-generator',
      name: 'Case Study Generator',
      version: '1.0.0',
      description: 'Generates complete case study content across all engines — challenge, solution, results, stats, and testimonial — from a campaign brief.',
      author: 'Creative Automation Platform',
      category: 'Marketing',
      triggers: ['case study', 'generate case study', 'create case study', 'client case study'],
      engines: ['illustrator', 'indesign', 'canva', 'adobe_express', 'figma'],
      brandAware: true,
      master: true,
    },
    systemPrompt: `You are a B2B case study strategist for the Creative Automation Platform.

Your job: extract and craft precise, publication-ready case study copy from a campaign brief.

Rules:
- Lead with the client's measurable outcome (stat or % improvement) in the title
- Challenge: describe the pain point in the client's own language — specific, not generic
- Solution: focus on the mechanism, not the vendor — what actually changed operationally
- Results: lead with the strongest quantified outcome, then support with 2–3 more
- Stats: extract the single most powerful number from the brief (e.g. "68% faster")
- Testimonial: write as a direct quote from a plausible executive title — punchy, 1–2 sentences
- STRICTLY respect character limits — truncate on a complete word
- Return ONLY a valid JSON object with the exact field keys — no markdown fences, no explanation`,
    userTemplate: `Generate case study content for a {{engine}} template{{#templateName}} ({{templateName}}){{/templateName}}.

Brand: {{brand_name}}
{{#brand_description}}Context: {{brand_description}}{{/brand_description}}

Campaign brief:
"{{brief}}"

Fields to populate:
{{field_list}}

Return a JSON object with these exact keys.`,
    readme: `# Case Study Generator

Generates full case study content from a campaign brief across Illustrator, InDesign, Canva, Adobe Express, and Figma.

## How to use
In Claude AI chat, type anything containing "case study" — e.g.:
- "generate a case study for TransPerfect's GlobalLink launch"
- "create a case study about our 40% cost reduction for Acme Corp"

## Tips
- Include at least one quantified stat in your brief for best results
- Mention the client name and industry for more specific language
- Add a testimonial quote if you have one — Claude will preserve it verbatim`,
    fields: {
      illustrator: [
        { key: 'TEXT_TITLE',          label: 'Title',     required: true,  maxChars: 120 },
        { key: 'TEXT_CHALLENGE_BODY', label: 'Challenge', required: true,  maxChars: 600 },
        { key: 'TEXT_SOLUTION_BODY',  label: 'Solution',  required: true,  maxChars: 600 },
        { key: 'TEXT_RESULTS_BODY',   label: 'Results',   required: true,  maxChars: 600 },
        { key: 'TEXT_STAT_01',        label: 'Stat 1',    required: false, maxChars: 30  },
        { key: 'TEXT_STAT_02',        label: 'Stat 2',    required: false, maxChars: 30  },
      ],
      indesign: [
        { key: 'DOC_TITLE',                 label: 'Title',     required: true,  maxChars: 120 },
        { key: 'SECTION_EXECUTIVE_SUMMARY', label: 'Summary',   required: true,  maxChars: 800 },
        { key: 'SECTION_CHALLENGE',         label: 'Challenge', required: true,  maxChars: 600 },
        { key: 'SECTION_SOLUTION',          label: 'Solution',  required: true,  maxChars: 600 },
      ],
      canva: [
        { key: 'HEADLINE',    label: 'Headline',    required: true,  maxChars: 80  },
        { key: 'SUBHEADLINE', label: 'Sub-headline',required: false, maxChars: 150 },
        { key: 'BODY_COPY',   label: 'Body',        required: false, maxChars: 400 },
        { key: 'CTA_TEXT',    label: 'CTA',         required: false, maxChars: 40  },
      ],
      adobe_express: [
        { key: 'HEADLINE',    label: 'Headline',    required: true,  maxChars: 80  },
        { key: 'SUBHEADLINE', label: 'Sub-headline',required: false, maxChars: 150 },
        { key: 'BODY_TEXT',   label: 'Body',        required: false, maxChars: 400 },
        { key: 'CTA',         label: 'CTA',         required: false, maxChars: 40  },
      ],
      figma: [
        { key: 'TEXT_TITLE',    label: 'Title',    required: true,  maxChars: 120 },
        { key: 'TEXT_SUBTITLE', label: 'Subtitle', required: false, maxChars: 180 },
        { key: 'TEXT_BODY',     label: 'Body',     required: false, maxChars: 600 },
        { key: 'TEXT_CTA',      label: 'CTA',      required: false, maxChars: 40  },
      ],
    },
  },
  {
    id: 'social-media-campaign',
    manifest: {
      id: 'social-media-campaign',
      name: 'Social Media Campaign',
      version: '1.0.0',
      description: 'Generates punchy social-first content — headlines, short body copy, hashtags, and CTAs — optimised for Canva, Adobe Express, and Figma social templates.',
      author: 'Creative Automation Platform',
      category: 'Social',
      triggers: ['social media', 'social post', 'social campaign', 'social content', 'instagram', 'linkedin post'],
      engines: ['canva', 'adobe_express', 'figma'],
      brandAware: true,
      master: true,
    },
    systemPrompt: `You are a social media copywriter for the Creative Automation Platform.

Your job: write scroll-stopping social content from a campaign brief.

Rules:
- Headlines must hook in 6 words or fewer — lead with the outcome or tension
- Sub-headlines deliver the proof point or context — specific numbers preferred
- Body copy is conversational, punchy, never corporate — max 2 short sentences
- CTAs are action verbs + clear benefit: "See the results", "Get started free"
- Hashtags: 3–5 relevant tags, capitalised for readability (e.g. #AIAutomation)
- Adapt tone to platform if mentioned (LinkedIn = professional, Instagram = energetic)
- STRICTLY respect character limits
- Return ONLY a valid JSON object with the exact field keys`,
    userTemplate: `Generate social media content for a {{engine}} template{{#templateName}} ({{templateName}}){{/templateName}}.

Brand: {{brand_name}}
{{#brand_description}}Context: {{brand_description}}{{/brand_description}}

Campaign brief:
"{{brief}}"

Fields to populate:
{{field_list}}

Return a JSON object with these exact keys.`,
    readme: `# Social Media Campaign

Generates scroll-stopping social content for Canva, Adobe Express, and Figma templates.

## Trigger phrases
- "social media campaign for Q3 launch"
- "instagram post about our 40% cost reduction"
- "linkedin post announcing TransPerfect partnership"

## Tips
- Mention the platform (LinkedIn/Instagram/Twitter) for tone-matched copy
- Include a stat or number — it dramatically improves headline performance
- Specify the campaign goal (awareness, lead gen, event) for better CTAs`,
    fields: {
      illustrator: [],
      indesign: [],
      canva: [
        { key: 'HEADLINE',    label: 'Headline',   required: true,  maxChars: 60  },
        { key: 'SUBHEADLINE', label: 'Stat / Hook',required: false, maxChars: 100 },
        { key: 'BODY_COPY',   label: 'Body copy',  required: false, maxChars: 200 },
        { key: 'CTA_TEXT',    label: 'CTA',        required: true,  maxChars: 35  },
        { key: 'HASHTAGS',    label: 'Hashtags',   required: false, maxChars: 120 },
      ],
      adobe_express: [
        { key: 'HEADLINE',    label: 'Headline',   required: true,  maxChars: 60  },
        { key: 'SUBHEADLINE', label: 'Stat / Hook',required: false, maxChars: 100 },
        { key: 'BODY_TEXT',   label: 'Body copy',  required: false, maxChars: 200 },
        { key: 'CTA',         label: 'CTA',        required: true,  maxChars: 35  },
        { key: 'HASHTAGS',    label: 'Hashtags',   required: false, maxChars: 120 },
      ],
      figma: [
        { key: 'TEXT_TITLE',    label: 'Headline',   required: true,  maxChars: 60  },
        { key: 'TEXT_SUBTITLE', label: 'Stat / Hook',required: false, maxChars: 100 },
        { key: 'TEXT_BODY',     label: 'Body copy',  required: false, maxChars: 200 },
        { key: 'TEXT_CTA',      label: 'CTA',        required: true,  maxChars: 35  },
      ],
    },
  },
  {
    id: 'sales-one-pager',
    manifest: {
      id: 'sales-one-pager',
      name: 'Sales One-Pager',
      version: '1.0.0',
      description: 'Generates a crisp sales one-pager — value proposition, three key features, proof points, and CTA — for Illustrator, InDesign, and Canva.',
      author: 'Creative Automation Platform',
      category: 'Sales',
      triggers: ['one pager', 'one-pager', 'sales sheet', 'sell sheet', 'sales one pager', 'product sheet'],
      engines: ['illustrator', 'indesign', 'canva'],
      brandAware: true,
      master: true,
    },
    systemPrompt: `You are a B2B sales copywriter for the Creative Automation Platform.

Your job: write a sharp sales one-pager from a campaign brief.

Rules:
- Value proposition: one sentence — outcome + mechanism + differentiator
- Feature names: 2–4 words, noun phrases, not sentences ("Automated Translation", not "We automate translations")
- Feature descriptions: 1 sentence each — benefit-led, specific, no jargon
- Stats: the most credible, specific numbers from the brief (format: "68% faster delivery")
- CTA: conversational and low-friction ("See it in action" beats "Contact Sales")
- Headline: bold outcome statement — leads with the number if available
- STRICTLY respect character limits
- Return ONLY a valid JSON object with the exact field keys`,
    userTemplate: `Generate sales one-pager content for a {{engine}} template{{#templateName}} ({{templateName}}){{/templateName}}.

Brand: {{brand_name}}
{{#brand_description}}Context: {{brand_description}}{{/brand_description}}

Campaign brief:
"{{brief}}"

Fields to populate:
{{field_list}}

Return a JSON object with these exact keys.`,
    readme: `# Sales One-Pager

Creates a crisp, persuasive sales sheet from a brief for Illustrator, InDesign, and Canva.

## Trigger phrases
- "sales one pager for GlobalLink"
- "create a sell sheet for our Q3 campaign"
- "one-pager about our translation platform"

## Tips
- Provide 2–3 specific features or differentiators in your brief
- Include your target buyer persona for better language calibration
- A stat or proof point makes the value prop significantly stronger`,
    fields: {
      illustrator: [
        { key: 'TEXT_TITLE',          label: 'Headline',          required: true,  maxChars: 100 },
        { key: 'TEXT_CHALLENGE_BODY', label: 'Value Proposition', required: true,  maxChars: 300 },
        { key: 'TEXT_SOLUTION_BODY',  label: 'Feature 1',         required: true,  maxChars: 200 },
        { key: 'TEXT_RESULTS_BODY',   label: 'Feature 2',         required: true,  maxChars: 200 },
        { key: 'TEXT_STAT_01',        label: 'Stat 1',            required: false, maxChars: 30  },
        { key: 'TEXT_STAT_02',        label: 'CTA',               required: false, maxChars: 40  },
      ],
      indesign: [
        { key: 'DOC_TITLE',                 label: 'Headline',          required: true,  maxChars: 100 },
        { key: 'SECTION_EXECUTIVE_SUMMARY', label: 'Value Proposition', required: true,  maxChars: 400 },
        { key: 'SECTION_CHALLENGE',         label: 'Feature 1',         required: false, maxChars: 300 },
        { key: 'SECTION_SOLUTION',          label: 'Feature 2',         required: false, maxChars: 300 },
      ],
      canva: [
        { key: 'HEADLINE',    label: 'Headline',          required: true,  maxChars: 80  },
        { key: 'SUBHEADLINE', label: 'Value Proposition', required: true,  maxChars: 150 },
        { key: 'BODY_COPY',   label: 'Key Features',      required: false, maxChars: 400 },
        { key: 'CTA_TEXT',    label: 'CTA',               required: true,  maxChars: 40  },
      ],
      adobe_express: [],
      figma: [],
    },
  },
  {
    id: 'product-launch',
    manifest: {
      id: 'product-launch',
      name: 'Product Launch',
      version: '1.0.0',
      description: 'Generates product launch content — announcement headline, three key benefits, pricing/offer, and launch CTA — across all engines.',
      author: 'Creative Automation Platform',
      category: 'Marketing',
      triggers: ['product launch', 'launch campaign', 'new product', 'product announcement', 'launch'],
      engines: ['illustrator', 'indesign', 'canva', 'adobe_express', 'figma'],
      brandAware: true,
      master: true,
    },
    systemPrompt: `You are a product launch copywriter for the Creative Automation Platform.

Your job: generate launch announcement copy that creates urgency and drives action.

Rules:
- Headline: lead with the product name + the single biggest benefit or transformation
- Tagline: a short, memorable phrase (under 10 words) that captures the product's essence
- Benefits: each is a short, outcome-focused statement — not a feature list
- Launch offer/pricing: only include if mentioned in brief; keep concise and specific
- CTA: urgency-driven without being pushy ("Available now", "Join the waitlist", "Get early access")
- STRICTLY respect character limits
- Return ONLY a valid JSON object with the exact field keys`,
    userTemplate: `Generate product launch content for a {{engine}} template{{#templateName}} ({{templateName}}){{/templateName}}.

Brand: {{brand_name}}
{{#brand_description}}Context: {{brand_description}}{{/brand_description}}

Launch brief:
"{{brief}}"

Fields to populate:
{{field_list}}

Return a JSON object with these exact keys.`,
    readme: `# Product Launch

Generates announcement content across all five engines from a product launch brief.

## Trigger phrases
- "product launch for GlobalLink Connect 2.0"
- "launch campaign for our new AI translation feature"
- "new product announcement — automated glossary management"

## Tips
- Include the product name explicitly in your brief
- Mention the target audience for benefit-tuned copy
- Add pricing, availability date, or launch offer if relevant`,
    fields: {
      illustrator: [
        { key: 'TEXT_TITLE',          label: 'Headline',       required: true,  maxChars: 100 },
        { key: 'TEXT_CHALLENGE_BODY', label: 'Key Benefit 1',  required: true,  maxChars: 200 },
        { key: 'TEXT_SOLUTION_BODY',  label: 'Key Benefit 2',  required: true,  maxChars: 200 },
        { key: 'TEXT_RESULTS_BODY',   label: 'Key Benefit 3',  required: true,  maxChars: 200 },
        { key: 'TEXT_STAT_01',        label: 'Tagline',        required: false, maxChars: 60  },
        { key: 'TEXT_STAT_02',        label: 'CTA',            required: false, maxChars: 40  },
      ],
      indesign: [
        { key: 'DOC_TITLE',                 label: 'Headline',         required: true,  maxChars: 100 },
        { key: 'SECTION_EXECUTIVE_SUMMARY', label: 'Launch Overview',  required: true,  maxChars: 600 },
        { key: 'SECTION_CHALLENGE',         label: 'Key Benefits',     required: false, maxChars: 500 },
        { key: 'SECTION_SOLUTION',          label: 'Getting Started',  required: false, maxChars: 400 },
      ],
      canva: [
        { key: 'HEADLINE',    label: 'Headline', required: true,  maxChars: 70  },
        { key: 'SUBHEADLINE', label: 'Tagline',  required: true,  maxChars: 120 },
        { key: 'BODY_COPY',   label: 'Benefits', required: false, maxChars: 300 },
        { key: 'CTA_TEXT',    label: 'CTA',      required: true,  maxChars: 35  },
      ],
      adobe_express: [
        { key: 'HEADLINE',    label: 'Headline', required: true,  maxChars: 70  },
        { key: 'SUBHEADLINE', label: 'Tagline',  required: true,  maxChars: 120 },
        { key: 'BODY_TEXT',   label: 'Benefits', required: false, maxChars: 300 },
        { key: 'CTA',         label: 'CTA',      required: true,  maxChars: 35  },
      ],
      figma: [
        { key: 'TEXT_TITLE',    label: 'Headline', required: true,  maxChars: 100 },
        { key: 'TEXT_SUBTITLE', label: 'Tagline',  required: true,  maxChars: 140 },
        { key: 'TEXT_BODY',     label: 'Benefits', required: false, maxChars: 300 },
        { key: 'TEXT_CTA',      label: 'CTA',      required: true,  maxChars: 35  },
      ],
    },
  },
  {
    id: 'executive-brief',
    manifest: {
      id: 'executive-brief',
      name: 'Executive Brief',
      version: '1.0.0',
      description: 'Generates a C-suite facing executive brief — situation, recommendation, business impact, and next steps — for Illustrator and InDesign.',
      author: 'Creative Automation Platform',
      category: 'Sales',
      triggers: ['executive brief', 'exec summary', 'exec brief', 'c-suite', 'board summary', 'executive summary'],
      engines: ['illustrator', 'indesign'],
      brandAware: true,
      master: true,
    },
    systemPrompt: `You are a management consultant writing executive-facing documents for the Creative Automation Platform.

Your job: distil a campaign brief into a concise, decision-ready executive summary.

Rules:
- Situation: 2 sentences max — describe the business context and the specific problem
- Recommendation: 1 clear action sentence — what should be done and why now
- Business impact: 2–3 bullet-style outcomes with specific numbers where available
- Next steps: 2–3 concrete, time-bound actions with clear owners
- Stats: the most credible ROI or efficiency number from the brief
- Language: formal but direct — no buzzwords, no passive voice
- STRICTLY respect character limits
- Return ONLY a valid JSON object with the exact field keys`,
    userTemplate: `Generate executive brief content for a {{engine}} template{{#templateName}} ({{templateName}}){{/templateName}}.

Brand: {{brand_name}}
{{#brand_description}}Context: {{brand_description}}{{/brand_description}}

Brief:
"{{brief}}"

Fields to populate:
{{field_list}}

Return a JSON object with these exact keys.`,
    readme: `# Executive Brief

Creates concise C-suite facing summaries from campaign or project briefs.

## Trigger phrases
- "executive brief on our Q4 translation program"
- "exec summary for the board on GlobalLink ROI"
- "c-suite summary of our cost reduction initiative"

## Tips
- Include business context (budget, timeline, stakeholders) for better framing
- Provide the strongest ROI metric available — executives respond to numbers
- Mention the decision that needs to be made for a sharper recommendation`,
    fields: {
      illustrator: [
        { key: 'TEXT_TITLE',          label: 'Brief Title',      required: true,  maxChars: 100 },
        { key: 'TEXT_CHALLENGE_BODY', label: 'Situation',        required: true,  maxChars: 400 },
        { key: 'TEXT_SOLUTION_BODY',  label: 'Recommendation',   required: true,  maxChars: 400 },
        { key: 'TEXT_RESULTS_BODY',   label: 'Business Impact',  required: true,  maxChars: 400 },
        { key: 'TEXT_STAT_01',        label: 'Key Metric',       required: false, maxChars: 30  },
        { key: 'TEXT_STAT_02',        label: 'Next Step',        required: false, maxChars: 60  },
      ],
      indesign: [
        { key: 'DOC_TITLE',                 label: 'Brief Title',      required: true,  maxChars: 100 },
        { key: 'SECTION_EXECUTIVE_SUMMARY', label: 'Situation',        required: true,  maxChars: 800 },
        { key: 'SECTION_CHALLENGE',         label: 'Recommendation',   required: true,  maxChars: 500 },
        { key: 'SECTION_SOLUTION',          label: 'Business Impact',  required: true,  maxChars: 500 },
      ],
      canva: [],
      adobe_express: [],
      figma: [],
    },
  },
  {
    id: 'roi-report',
    manifest: {
      id: 'roi-report',
      name: 'ROI Report',
      version: '1.0.0',
      description: 'Generates a stats-heavy ROI report with four key metrics, a results narrative, and a client testimonial for Illustrator, InDesign, and Canva.',
      author: 'Creative Automation Platform',
      category: 'Marketing',
      triggers: ['roi report', 'roi', 'results report', 'performance report', 'impact report', 'roi summary'],
      engines: ['illustrator', 'indesign', 'canva'],
      brandAware: true,
      master: true,
    },
    systemPrompt: `You are a B2B results analyst writing ROI reports for the Creative Automation Platform.

Your job: extract and present measurable business outcomes from a campaign brief.

Rules:
- Title: lead with the primary ROI metric — e.g. "68% Faster Time-to-Market: [Client] ROI Report"
- Stats: extract the 4 most credible, specific numbers from the brief (format: "68%", "3×", "$2.4M")
- Stat labels: short descriptor for each number (max 35 chars) — "Faster delivery", "Cost reduction"
- Results narrative: structured as Before → After → Impact; use client's actual metrics
- Testimonial: write as a direct executive quote; 1–2 sentences, specific outcome, avoid superlatives
- Conclusion: one forward-looking sentence — what this result enables for the future
- STRICTLY respect character limits
- Return ONLY a valid JSON object with the exact field keys`,
    userTemplate: `Generate ROI report content for a {{engine}} template{{#templateName}} ({{templateName}}){{/templateName}}.

Brand: {{brand_name}}
{{#brand_description}}Context: {{brand_description}}{{/brand_description}}

Results brief:
"{{brief}}"

Fields to populate:
{{field_list}}

Return a JSON object with these exact keys.`,
    readme: `# ROI Report

Generates a numbers-first ROI report with four metrics, a results narrative, and testimonial.

## Trigger phrases
- "roi report for TransPerfect GlobalLink implementation"
- "results report — 40% cost reduction for Acme Corp"
- "performance report on our Q2 localization programme"

## Tips
- The more specific your metrics, the better the output — include raw numbers
- Mention the time period (e.g. "over 6 months") for context-rich framing
- Include a client name and industry for personalised copy`,
    fields: {
      illustrator: [
        { key: 'TEXT_TITLE',          label: 'Report Title',     required: true,  maxChars: 100 },
        { key: 'TEXT_CHALLENGE_BODY', label: 'Results Narrative',required: true,  maxChars: 600 },
        { key: 'TEXT_SOLUTION_BODY',  label: 'Testimonial',      required: false, maxChars: 300 },
        { key: 'TEXT_RESULTS_BODY',   label: 'Conclusion',       required: false, maxChars: 200 },
        { key: 'TEXT_STAT_01',        label: 'Stat 1 (number)',  required: true,  maxChars: 20  },
        { key: 'TEXT_STAT_02',        label: 'Stat 2 (number)',  required: true,  maxChars: 20  },
      ],
      indesign: [
        { key: 'DOC_TITLE',                 label: 'Report Title',      required: true,  maxChars: 100 },
        { key: 'SECTION_EXECUTIVE_SUMMARY', label: 'Executive Summary', required: true,  maxChars: 800 },
        { key: 'SECTION_CHALLENGE',         label: 'Results Detail',    required: true,  maxChars: 600 },
        { key: 'SECTION_SOLUTION',          label: 'Methodology',       required: false, maxChars: 500 },
      ],
      canva: [
        { key: 'HEADLINE',    label: 'Headline',        required: true,  maxChars: 80  },
        { key: 'SUBHEADLINE', label: 'Primary stat',    required: true,  maxChars: 100 },
        { key: 'BODY_COPY',   label: 'Results summary', required: false, maxChars: 300 },
        { key: 'CTA_TEXT',    label: 'CTA',             required: false, maxChars: 40  },
      ],
      adobe_express: [],
      figma: [],
    },
  },
  {
    id: 'event-promotion',
    manifest: {
      id: 'event-promotion',
      name: 'Event Promotion',
      version: '1.0.0',
      description: 'Generates event promotional content — event name, date, location, speaker highlights, and registration CTA — for Canva, Adobe Express, and Figma.',
      author: 'Creative Automation Platform',
      category: 'Events',
      triggers: ['event', 'webinar', 'conference', 'seminar', 'event promotion', 'event campaign'],
      engines: ['canva', 'adobe_express', 'figma'],
      brandAware: true,
      master: true,
    },
    systemPrompt: `You are an event marketing copywriter for the Creative Automation Platform.

Your job: write compelling event promotion content from a brief.

Rules:
- Event name: use the exact name from the brief; if not specified, generate a punchy 4–6 word title
- Tagline: captures the event's value in one sentence — what will attendees gain?
- Date/location: extract exactly from brief; if not specified, write "Date TBC" or "Virtual Event"
- Speaker/highlight: name + title + 1-sentence credibility hook if provided; else omit
- Description: 2–3 sentences — the problem the event addresses + who should attend + what they'll learn
- CTA: low-friction registration prompt ("Reserve your seat", "Register free", "Join us")
- STRICTLY respect character limits
- Return ONLY a valid JSON object with the exact field keys`,
    userTemplate: `Generate event promotion content for a {{engine}} template{{#templateName}} ({{templateName}}){{/templateName}}.

Brand: {{brand_name}}
{{#brand_description}}Context: {{brand_description}}{{/brand_description}}

Event brief:
"{{brief}}"

Fields to populate:
{{field_list}}

Return a JSON object with these exact keys.`,
    readme: `# Event Promotion

Generates event promotion content for Canva, Adobe Express, and Figma templates.

## Trigger phrases
- "event promotion for our AI localization webinar"
- "conference campaign — TransPerfect Summit 2026"
- "webinar promo: how to scale translation 40% faster"

## Tips
- Include date, time, and location (or "virtual") for accurate copy
- Name the speaker and their title for credibility hooks
- Specify the target audience for benefit-tuned descriptions`,
    fields: {
      illustrator: [],
      indesign: [],
      canva: [
        { key: 'HEADLINE',    label: 'Event Name',    required: true,  maxChars: 70  },
        { key: 'SUBHEADLINE', label: 'Tagline',       required: true,  maxChars: 120 },
        { key: 'BODY_COPY',   label: 'Description',   required: false, maxChars: 300 },
        { key: 'CTA_TEXT',    label: 'Register CTA',  required: true,  maxChars: 35  },
      ],
      adobe_express: [
        { key: 'HEADLINE',    label: 'Event Name',    required: true,  maxChars: 70  },
        { key: 'SUBHEADLINE', label: 'Date & Location',required: false, maxChars: 100 },
        { key: 'BODY_TEXT',   label: 'Description',   required: false, maxChars: 300 },
        { key: 'CTA',         label: 'Register CTA',  required: true,  maxChars: 35  },
      ],
      figma: [
        { key: 'TEXT_TITLE',    label: 'Event Name',     required: true,  maxChars: 70  },
        { key: 'TEXT_SUBTITLE', label: 'Date & Location',required: false, maxChars: 120 },
        { key: 'TEXT_BODY',     label: 'Description',    required: false, maxChars: 300 },
        { key: 'TEXT_CTA',      label: 'Register CTA',   required: true,  maxChars: 35  },
      ],
    },
  },
  {
    id: 'brand-awareness',
    manifest: {
      id: 'brand-awareness',
      name: 'Brand Awareness',
      version: '1.0.0',
      description: 'Generates brand storytelling content — brand narrative, key messages, and awareness CTA — optimised for visual-first Canva, Adobe Express, and Figma campaigns.',
      author: 'Creative Automation Platform',
      category: 'Marketing',
      triggers: ['brand awareness', 'brand campaign', 'awareness campaign', 'brand story', 'brand narrative'],
      engines: ['canva', 'adobe_express', 'figma'],
      brandAware: true,
      master: true,
    },
    systemPrompt: `You are a brand strategist for the Creative Automation Platform.

Your job: write brand-building copy that communicates identity, values, and differentiation.

Rules:
- Headline: a bold, singular brand statement — what you stand for in 6 words or fewer
- Tagline: the brand's promise or positioning line — memorable, timeless, not campaign-specific
- Key message 1: the primary audience pain point this brand solves — empathy-first language
- Key message 2: the brand's unique approach or method — what makes it different
- Brand story: 2–3 sentences — origin → mission → impact; human and specific
- CTA: low-commitment awareness prompt ("Learn our story", "See how we work", "Explore the platform")
- STRICTLY respect character limits
- Return ONLY a valid JSON object with the exact field keys`,
    userTemplate: `Generate brand awareness content for a {{engine}} template{{#templateName}} ({{templateName}}){{/templateName}}.

Brand: {{brand_name}}
{{#brand_description}}Context: {{brand_description}}{{/brand_description}}

Campaign brief:
"{{brief}}"

Fields to populate:
{{field_list}}

Return a JSON object with these exact keys.`,
    readme: `# Brand Awareness

Creates brand storytelling content for visual-first awareness campaigns on Canva, Adobe Express, and Figma.

## Trigger phrases
- "brand awareness campaign for TransPerfect"
- "brand story for our Q4 awareness push"
- "brand narrative for GlobalLink rebrand"

## Tips
- Include brand values, mission, or founding story for authentic copy
- Mention the campaign channel (display ads, social, OOH) for format-appropriate tone
- Specify a primary audience persona for message-market fit`,
    fields: {
      illustrator: [],
      indesign: [],
      canva: [
        { key: 'HEADLINE',    label: 'Brand Statement', required: true,  maxChars: 60  },
        { key: 'SUBHEADLINE', label: 'Tagline',         required: true,  maxChars: 100 },
        { key: 'BODY_COPY',   label: 'Brand Story',     required: false, maxChars: 350 },
        { key: 'CTA_TEXT',    label: 'CTA',             required: false, maxChars: 40  },
      ],
      adobe_express: [
        { key: 'HEADLINE',    label: 'Brand Statement', required: true,  maxChars: 60  },
        { key: 'SUBHEADLINE', label: 'Tagline',         required: true,  maxChars: 100 },
        { key: 'BODY_TEXT',   label: 'Brand Story',     required: false, maxChars: 350 },
        { key: 'CTA',         label: 'CTA',             required: false, maxChars: 40  },
      ],
      figma: [
        { key: 'TEXT_TITLE',    label: 'Brand Statement', required: true,  maxChars: 60  },
        { key: 'TEXT_SUBTITLE', label: 'Tagline',         required: true,  maxChars: 120 },
        { key: 'TEXT_BODY',     label: 'Brand Story',     required: false, maxChars: 350 },
        { key: 'TEXT_CTA',      label: 'CTA',             required: false, maxChars: 40  },
      ],
    },
  },
];

function seedMasterSkills(): void {
  try {
    const dir = skillsDir();
    for (const skill of MASTER_SKILLS) {
      const skillPath = path.join(dir, skill.id);
      const manifestPath = path.join(skillPath, 'manifest.json');
      // Only seed if not already present — never overwrite user edits
      if (fs.existsSync(manifestPath)) continue;

      fs.mkdirSync(path.join(skillPath, 'prompt'),   { recursive: true });
      fs.mkdirSync(path.join(skillPath, 'fields'),   { recursive: true });
      fs.mkdirSync(path.join(skillPath, 'examples'), { recursive: true });

      const manifest = { ...skill.manifest, created: new Date().toISOString() };
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      fs.writeFileSync(path.join(skillPath, 'prompt', 'system.md'), skill.systemPrompt);
      fs.writeFileSync(path.join(skillPath, 'prompt', 'user_template.md'), skill.userTemplate);
      fs.writeFileSync(path.join(skillPath, 'README.md'), skill.readme);
      for (const [eng, fields] of Object.entries(skill.fields)) {
        fs.writeFileSync(path.join(skillPath, 'fields', `${eng}.json`), JSON.stringify(fields, null, 2));
      }
    }
  } catch (e) {
    // Seeding is best-effort — never crash the app
  }
}

ipcMain.handle('platform:seedMasterSkills', async () => {
  try { seedMasterSkills(); return { ok: true }; }
  catch (e: any) { return { ok: false, message: e.message }; }
});

// ============================================================================
// MONDAY.COM INTEGRATION
// ============================================================================

interface MondayBoardConfig {
  id: string;
  boardId: string;
  boardName: string;
  templateId: string;
  engine: string;
  triggerColumnId: string;
  triggerColumnTitle: string;
  triggerValue: string;
  doneValue: string;
  errorValue: string;
  enabled: boolean;
}

interface MondayActivityEntry {
  timestamp: string;
  boardId: string;
  boardName: string;
  itemId: string;
  itemName: string;
  engine: string;
  status: 'success' | 'error' | 'skipped';
  message: string;
  outputPath?: string;
}

function mondayConfigPath() { return path.join(workspaceRoot, 'integrations', 'monday_config.json'); }

function getMondayConfig(): { apiKey?: string; enabled?: boolean; pollIntervalMs?: number; boards: MondayBoardConfig[] } {
  try {
    if (!fs.existsSync(mondayConfigPath())) return { boards: [] };
    return JSON.parse(fs.readFileSync(mondayConfigPath(), 'utf8'));
  } catch { return { boards: [] }; }
}

function saveMondayConfig(config: ReturnType<typeof getMondayConfig>) {
  ensureDir(path.join(workspaceRoot, 'integrations'));
  fs.writeFileSync(mondayConfigPath(), JSON.stringify(config, null, 2), 'utf8');
}

// Activity log — last 100 entries persisted to disk
function mondayLogPath() { return path.join(workspaceRoot, 'integrations', 'monday_activity.json'); }

function readMondayLog(): MondayActivityEntry[] {
  try {
    if (!fs.existsSync(mondayLogPath())) return [];
    return JSON.parse(fs.readFileSync(mondayLogPath(), 'utf8'));
  } catch { return []; }
}

function appendMondayLog(entry: MondayActivityEntry) {
  const log = readMondayLog();
  log.unshift(entry);
  if (log.length > 100) log.length = 100;
  ensureDir(path.join(workspaceRoot, 'integrations'));
  try { fs.writeFileSync(mondayLogPath(), JSON.stringify(log, null, 2), 'utf8'); } catch { /* non-fatal */ }
}

// Monday.com GraphQL HTTP request
function mondayGraphQL(query: string, variables: Record<string, any>, apiKey: string): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query, variables });
    const req = https.request({
      hostname: 'api.monday.com',
      path: '/v2',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'API-Version': '2024-01',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let raw = '';
      res.on('data', c => { raw += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode ?? 0, data: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode ?? 0, data: raw }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Normalize a Monday column title to a template field key
function normalizeColumnTitle(title: string): string {
  return title.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
}

// Dispatch a render job from Monday.com item data — internal (no IPC round-trip)
async function dispatchMondayRender(
  boardConfig: MondayBoardConfig,
  itemId: string,
  itemName: string,
  content: Record<string, string>
): Promise<{ ok: boolean; message: string; outputPath?: string }> {
  const { templateId, engine } = boardConfig;
  const outputName = nextVersionedName(sanitizeName(itemName || 'monday_render'));

  if (engine === 'canva') {
    const manifestPath = path.join(enginesRoot, 'canva', 'references', `${templateId}.manifest.json`);
    if (!fs.existsSync(manifestPath)) return { ok: false, message: `Canva manifest not found: ${templateId}` };
    let manifest: any;
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch { return { ok: false, message: 'Manifest corrupt' }; }
    if (!manifest.canva_design_id) return { ok: false, message: 'Manifest missing canva_design_id' };

    const token = await getValidCanvaAccessToken();
    if (!token) return { ok: false, message: 'No Canva access token' };

    const data: Record<string, any> = {};
    for (const [field, value] of Object.entries(content)) {
      const obj = manifest.editable_objects?.[field];
      if (obj?.element_id) data[obj.element_id] = { type: 'text', text: value };
    }
    if (!Object.keys(data).length) return { ok: false, message: 'No matching element IDs for content fields' };

    const createRes = await canvaRequest('POST', '/rest/v1/autofills', token, {
      brand_template_id: manifest.canva_design_id,
      title: outputName,
      data,
    });
    if (createRes.status !== 200 && createRes.status !== 201) {
      return { ok: false, message: `Canva autofill error ${createRes.status}: ${JSON.stringify(createRes.data)}` };
    }
    const canvaJobId = createRes.data?.job?.id;
    if (!canvaJobId) return { ok: false, message: 'Canva did not return a job ID' };
    const poll = await pollCanvaAutofill(canvaJobId, token);
    if (!poll.ok) return { ok: false, message: poll.message || 'Canva autofill failed' };
    return { ok: true, message: `Canva design created`, outputPath: poll.design?.url || manifest.canva_url };
  }

  if (engine === 'illustrator' || engine === 'indesign') {
    if (automationRunning) return { ok: false, message: 'Automation engine busy — item will retry on next poll' };
    const engineRoot  = engine === 'illustrator' ? illustratorEngineRoot : indesignEngineRoot;
    const ext         = engine === 'illustrator' ? '.ai' : '.indd';
    const runnerName  = engine === 'illustrator' ? 'run_illustrator_job.js' : 'run_indesign_job.js';
    const jobFileName = `active_job_${engine}.json`;

    const resolvedId = resolveActualTemplateId(engineRoot, templateId, ext);
    const templateFile = path.join(engineRoot, 'templates', `${resolvedId}${ext}`);
    if (!fs.existsSync(templateFile)) return { ok: false, message: `Template file not found: ${templateFile}` };

    const runnerPath = path.join(engineRoot, runnerName);
    if (!fs.existsSync(runnerPath)) return { ok: false, message: `Runner not found: ${runnerPath}` };

    // Load frame_aliases from manifest if present
    let frameAliases: Record<string, string> | undefined;
    const manifestPath = path.join(engineRoot, 'references', `${resolvedId}.manifest.json`);
    if (fs.existsSync(manifestPath)) {
      try { const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); if (m.frame_aliases) frameAliases = m.frame_aliases; } catch { /* non-fatal */ }
    }

    const safeJob = {
      template: resolvedId,
      output_name: outputName,
      content,
      ...(frameAliases ? { frame_aliases: frameAliases } : {}),
    };
    const jobsDir = path.join(workspaceRoot, 'jobs');
    ensureDir(jobsDir);
    fs.writeFileSync(path.join(jobsDir, jobFileName), JSON.stringify(safeJob, null, 2), 'utf8');

    const env = { CAP_ENGINE_ROOT: engineRoot, CAP_WORKSPACE_ROOT: workspaceRoot };
    const result = await runAutomationGuarded(async () => runAppleScriptEngine(runnerPath, [], env, `${engine}_export`));
    if (!result.ok) return { ok: false, message: result.message || 'Render failed' };
    const outPath = result.outputs?.[0] || result.outputPath || '';
    return { ok: true, message: `Rendered: ${outPath.split('/').pop() || outputName}`, outputPath: outPath };
  }

  return { ok: false, message: `Engine "${engine}" not supported for Monday.com automation (use illustrator, indesign, or canva)` };
}

// Poll one cycle — checks all enabled boards and dispatches renders
async function runMondayPoll(): Promise<{ processed: number; errors: number; skipped: number }> {
  const config = getMondayConfig();
  if (!config.apiKey || !config.enabled) return { processed: 0, errors: 0, skipped: 0 };

  let processed = 0, errors = 0, skipped = 0;

  for (const boardConfig of config.boards.filter(b => b.enabled)) {
    try {
      // Fetch items for this board
      const query = `
        query GetBoardItems($boardId: ID!) {
          boards(ids: [$boardId]) {
            name
            items_page(limit: 50) {
              items {
                id
                name
                column_values { id title text value type }
              }
            }
          }
        }`;
      const res = await mondayGraphQL(query, { boardId: boardConfig.boardId }, config.apiKey);
      if (res.status !== 200) { errors++; continue; }

      const items: any[] = res.data?.data?.boards?.[0]?.items_page?.items ?? [];

      for (const item of items) {
        const statusCol = item.column_values.find((cv: any) => cv.id === boardConfig.triggerColumnId);
        if (!statusCol || statusCol.text !== boardConfig.triggerValue) { skipped++; continue; }

        // Mark as "Processing" immediately to prevent double-render
        const processingMutation = `
          mutation UpdateStatus($boardId: ID!, $itemId: ID!, $colId: String!, $value: String!) {
            change_simple_column_value(board_id: $boardId, item_id: $itemId, column_id: $colId, value: $value) { id }
          }`;
        await mondayGraphQL(processingMutation, {
          boardId: boardConfig.boardId, itemId: item.id,
          colId: boardConfig.triggerColumnId, value: 'Processing',
        }, config.apiKey);

        // Auto-map columns to template fields by title normalisation
        const content: Record<string, string> = {};
        for (const cv of item.column_values) {
          if (!cv.text?.trim()) continue;
          const key = normalizeColumnTitle(cv.title);
          if (key) content[key] = cv.text.trim();
          // Also try TEXT_ prefix variant
          content[`TEXT_${key}`] = cv.text.trim();
        }
        // item.name → useful as fallback for a title field
        if (item.name) content['ITEM_NAME'] = item.name;

        const renderResult = await dispatchMondayRender(boardConfig, item.id, item.name, content);

        const newStatus = renderResult.ok ? boardConfig.doneValue : boardConfig.errorValue;
        await mondayGraphQL(processingMutation, {
          boardId: boardConfig.boardId, itemId: item.id,
          colId: boardConfig.triggerColumnId, value: newStatus,
        }, config.apiKey);

        // Post update comment on the item
        const statusEmoji = renderResult.ok ? '✅' : '❌';
        const updateBody = `${statusEmoji} Creative Automation Platform — ${renderResult.message}${renderResult.outputPath ? `\n📁 ${renderResult.outputPath}` : ''}`;
        await mondayGraphQL(
          `mutation CreateUpdate($itemId: ID!, $body: String!) { create_update(item_id: $itemId, body: $body) { id } }`,
          { itemId: item.id, body: updateBody },
          config.apiKey
        );

        appendMondayLog({
          timestamp: new Date().toISOString(),
          boardId: boardConfig.boardId,
          boardName: boardConfig.boardName,
          itemId: item.id,
          itemName: item.name,
          engine: boardConfig.engine,
          status: renderResult.ok ? 'success' : 'error',
          message: renderResult.message,
          outputPath: renderResult.outputPath,
        });

        renderResult.ok ? processed++ : errors++;
      }
    } catch (e: any) {
      errors++;
      appendMondayLog({
        timestamp: new Date().toISOString(),
        boardId: boardConfig.boardId,
        boardName: boardConfig.boardName,
        itemId: '',
        itemName: '',
        engine: boardConfig.engine,
        status: 'error',
        message: `Poll error: ${e.message}`,
      });
    }
  }

  // Update lastPolledAt
  const config2 = getMondayConfig();
  (config2 as any).lastPolledAt = new Date().toISOString();
  saveMondayConfig(config2);

  return { processed, errors, skipped };
}

// Polling interval handle
let mondayPollTimer: NodeJS.Timeout | null = null;

function startMondayPolling() {
  stopMondayPolling();
  const config = getMondayConfig();
  if (!config.apiKey || !config.enabled || !config.boards.some(b => b.enabled)) return;
  const interval = config.pollIntervalMs ?? 120_000;
  mondayPollTimer = setInterval(() => { runMondayPoll().catch(() => {}); }, interval);
}

function stopMondayPolling() {
  if (mondayPollTimer) { clearInterval(mondayPollTimer); mondayPollTimer = null; }
}

// Start polling on app ready if already configured
app.whenReady().then(() => {
  const cfg = getMondayConfig();
  if (cfg.apiKey && cfg.enabled && cfg.boards.some(b => b.enabled)) startMondayPolling();
});

// ── IPC handlers ──────────────────────────────────────────────────────────────

ipcMain.handle('platform:getMondayConfig', async () => {
  const config = getMondayConfig();
  return {
    ok: true,
    hasApiKey: !!config.apiKey,
    maskedKey: config.apiKey ? `${config.apiKey.slice(0, 6)}…${config.apiKey.slice(-4)}` : null,
    enabled: !!config.enabled,
    pollIntervalMs: config.pollIntervalMs ?? 120_000,
    boards: config.boards,
    lastPolledAt: (config as any).lastPolledAt ?? null,
    polling: mondayPollTimer !== null,
  };
});

ipcMain.handle('platform:setMondayApiKey', async (_event, apiKey: string, enabled: boolean) => {
  const config = getMondayConfig();
  config.apiKey = apiKey.trim();
  config.enabled = enabled;
  saveMondayConfig(config);
  if (enabled) startMondayPolling(); else stopMondayPolling();
  return { ok: true };
});

ipcMain.handle('platform:setMondayEnabled', async (_event, enabled: boolean) => {
  const config = getMondayConfig();
  config.enabled = enabled;
  saveMondayConfig(config);
  if (enabled) startMondayPolling(); else stopMondayPolling();
  return { ok: true };
});

ipcMain.handle('platform:testMondayConnection', async () => {
  const config = getMondayConfig();
  if (!config.apiKey) return { ok: false, message: 'No API key saved.' };
  try {
    const res = await mondayGraphQL(`query { me { name email } }`, {}, config.apiKey);
    if (res.status === 200 && res.data?.data?.me?.email) {
      return { ok: true, user: res.data.data.me };
    }
    const err = res.data?.errors?.[0]?.message || JSON.stringify(res.data);
    return { ok: false, message: `API error: ${err}` };
  } catch (e: any) { return { ok: false, message: e.message }; }
});

ipcMain.handle('platform:listMondayBoards', async () => {
  const config = getMondayConfig();
  if (!config.apiKey) return { ok: false, message: 'No API key saved.', boards: [] };
  try {
    const res = await mondayGraphQL(`query { boards(limit: 100, order_by: created_at) { id name description } }`, {}, config.apiKey);
    if (res.status !== 200) return { ok: false, message: `API error ${res.status}`, boards: [] };
    const boards = res.data?.data?.boards ?? [];
    return { ok: true, boards };
  } catch (e: any) { return { ok: false, message: e.message, boards: [] }; }
});

ipcMain.handle('platform:listMondayColumns', async (_event, boardId: string) => {
  const config = getMondayConfig();
  if (!config.apiKey) return { ok: false, message: 'No API key saved.', columns: [] };
  try {
    const res = await mondayGraphQL(
      `query GetColumns($boardId: ID!) { boards(ids: [$boardId]) { columns { id title type } } }`,
      { boardId }, config.apiKey
    );
    if (res.status !== 200) return { ok: false, message: `API error ${res.status}`, columns: [] };
    const columns = res.data?.data?.boards?.[0]?.columns ?? [];
    return { ok: true, columns };
  } catch (e: any) { return { ok: false, message: e.message, columns: [] }; }
});

ipcMain.handle('platform:addMondayBoardConfig', async (_event, boardCfg: Omit<MondayBoardConfig, 'id'>) => {
  const config = getMondayConfig();
  const newEntry: MondayBoardConfig = { ...boardCfg, id: `mbrd_${Date.now()}` };
  config.boards.push(newEntry);
  saveMondayConfig(config);
  if (config.enabled) startMondayPolling();
  return { ok: true, board: newEntry };
});

ipcMain.handle('platform:removeMondayBoardConfig', async (_event, id: string) => {
  const config = getMondayConfig();
  config.boards = config.boards.filter(b => b.id !== id);
  saveMondayConfig(config);
  return { ok: true };
});

ipcMain.handle('platform:toggleMondayBoard', async (_event, id: string, enabled: boolean) => {
  const config = getMondayConfig();
  const board = config.boards.find(b => b.id === id);
  if (board) board.enabled = enabled;
  saveMondayConfig(config);
  return { ok: true };
});

ipcMain.handle('platform:triggerMondayPoll', async () => {
  try {
    const result = await runMondayPoll();
    return { ok: true, ...result };
  } catch (e: any) { return { ok: false, message: e.message }; }
});

ipcMain.handle('platform:getMondayActivity', async () => {
  return { ok: true, log: readMondayLog() };
});

ipcMain.handle('platform:setMondayPollInterval', async (_event, ms: number) => {
  const config = getMondayConfig();
  config.pollIntervalMs = Math.max(30_000, ms);
  saveMondayConfig(config);
  if (config.enabled) startMondayPolling();
  return { ok: true };
});
