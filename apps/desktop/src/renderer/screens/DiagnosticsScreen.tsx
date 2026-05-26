import { useEffect, useRef, useState } from 'react';
import {
  Activity, AlertTriangle, Bot, CheckCircle2, ChevronDown, ChevronRight,
  Cpu, Eye, EyeOff, FileText, FolderOpen, Info, Key, Layers,
  RefreshCw, Settings, Wrench, Zap,
} from 'lucide-react';
import { Tooltip } from '../components/Tooltip';

// ── types ──────────────────────────────────────────────────────────────────────

type CheckStatus = 'ok' | 'warn' | 'error' | 'info';

interface CheckResult {
  id: string;
  category: 'workspace' | 'templates' | 'engines' | 'permissions';
  label: string;
  status: CheckStatus;
  detail: string;
  exactFix?: string;
  autoFixAction?: string;
  autoFixLabel?: string;
}

// ── helpers ────────────────────────────────────────────────────────────────────

const CATEGORY_META: Record<string, { label: string; icon: React.ReactNode }> = {
  workspace:   { label: 'Workspace & Folders',  icon: <FolderOpen size={14} /> },
  templates:   { label: 'Templates & Manifests', icon: <Layers size={14} /> },
  engines:     { label: 'Engine Scripts',        icon: <Cpu size={14} /> },
  permissions: { label: 'macOS Permissions',     icon: <Settings size={14} /> },
};

function StatusIcon({ status }: { status: CheckStatus }) {
  if (status === 'ok')    return <CheckCircle2 size={14} color="var(--green)" />;
  if (status === 'error') return <AlertTriangle size={14} color="var(--red)" />;
  if (status === 'warn')  return <AlertTriangle size={14} color="var(--yellow)" />;
  return <Info size={14} color="var(--accent)" />;
}

function statusColor(s: CheckStatus): string {
  if (s === 'ok')    return 'var(--green)';
  if (s === 'error') return 'var(--red)';
  if (s === 'warn')  return 'var(--yellow)';
  return 'var(--accent)';
}

const ACTION_LABELS: Record<string, string> = {
  automation:  'Open Automation Settings',
  fullDisk:    'Open Full Disk Access',
  outputs:     'Open Outputs Folder',
  logs:        'Open Logs Folder',
  templates:   'Open Templates Folder',
  diagnostics: 'Export Diagnostics',
  workspace:   'Open Workspace',
};

/** Render Claude's markdown-ish response — bold, code, numbered & bullet lists. */
function AiResponse({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div style={{ fontSize: 12.5, lineHeight: 1.75, color: 'var(--text)' }}>
      {lines.map((line, i) => {
        // Render inline bold and backtick-code in a line
        function renderInline(raw: string) {
          const parts: React.ReactNode[] = [];
          let rest = raw;
          let k = 0;
          while (rest.length > 0) {
            const boldIdx  = rest.indexOf('**');
            const codeIdx  = rest.indexOf('`');
            const first    = Math.min(boldIdx === -1 ? Infinity : boldIdx, codeIdx === -1 ? Infinity : codeIdx);
            if (!isFinite(first)) { parts.push(<span key={k++}>{rest}</span>); break; }
            if (first > 0) { parts.push(<span key={k++}>{rest.slice(0, first)}  </span>); rest = rest.slice(first); }
            if (rest.startsWith('**')) {
              const end = rest.indexOf('**', 2);
              if (end === -1) { parts.push(<span key={k++}>{rest}</span>); break; }
              parts.push(<strong key={k++}>{rest.slice(2, end)}</strong>);
              rest = rest.slice(end + 2);
            } else if (rest.startsWith('`')) {
              const end = rest.indexOf('`', 1);
              if (end === -1) { parts.push(<span key={k++}>{rest}</span>); break; }
              parts.push(
                <code key={k++} style={{ background: 'rgba(103,216,255,.1)', padding: '1px 5px', borderRadius: 3, fontSize: 11, fontFamily: 'monospace', color: 'var(--accent)' }}>
                  {rest.slice(1, end)}
                </code>
              );
              rest = rest.slice(end + 1);
            }
          }
          return parts;
        }

        const trimmed = line.trimStart();

        // Headings
        if (trimmed.startsWith('### ')) return <h4 key={i} style={{ margin: '10px 0 4px', fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>{trimmed.slice(4)}</h4>;
        if (trimmed.startsWith('## '))  return <h3 key={i} style={{ margin: '12px 0 4px', fontSize: 13, fontWeight: 700 }}>{trimmed.slice(3)}</h3>;
        if (trimmed.startsWith('# '))   return <h2 key={i} style={{ margin: '14px 0 6px', fontSize: 14, fontWeight: 700 }}>{trimmed.slice(2)}</h2>;

        // Numbered list
        const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
        if (numMatch) return (
          <div key={i} style={{ display: 'flex', gap: 8, margin: '3px 0' }}>
            <span style={{ color: 'var(--accent)', fontWeight: 700, minWidth: 18 }}>{numMatch[1]}.</span>
            <span>{renderInline(numMatch[2])}</span>
          </div>
        );

        // Bullet list
        if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) return (
          <div key={i} style={{ display: 'flex', gap: 8, margin: '2px 0' }}>
            <span style={{ color: 'var(--muted)', minWidth: 14 }}>·</span>
            <span>{renderInline(trimmed.slice(2))}</span>
          </div>
        );

        // Horizontal rule
        if (trimmed === '---' || trimmed === '***') return <hr key={i} style={{ border: 'none', borderTop: '1px solid var(--line)', margin: '10px 0' }} />;

        // Empty line
        if (!trimmed) return <div key={i} style={{ height: 6 }} />;

        // Normal paragraph
        return <p key={i} style={{ margin: '2px 0' }}>{renderInline(trimmed)}</p>;
      })}
    </div>
  );
}

// ── ClaudeKeyBanner ───────────────────────────────────────────────────────────

function ClaudeKeyBanner({ hasKey, masked, onSaved }: {
  hasKey: boolean;
  masked: string | null;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(!hasKey);
  const [keyInput, setKeyInput]   = useState('');
  const [show, setShow]           = useState(false);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string | null>(null);

  async function save() {
    if (!keyInput.trim()) { setError('Enter a key before saving.'); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await window.creativePlatform.setClaudeApiKey(keyInput.trim());
      if (res.ok) { setEditing(false); setKeyInput(''); onSaved(); }
      else setError(res.message || 'Save failed.');
    } finally { setSaving(false); }
  }

  return (
    <div style={{
      padding: '12px 16px', borderRadius: 9,
      background: hasKey ? 'rgba(60,200,120,.07)' : 'rgba(103,216,255,.06)',
      border: `1px solid ${hasKey ? 'rgba(60,200,120,.25)' : 'rgba(103,216,255,.2)'}`,
      marginBottom: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: editing ? 10 : 0 }}>
        <Bot size={15} color={hasKey ? 'var(--green)' : 'var(--accent)'} />
        <span style={{ fontSize: 13, fontWeight: 600 }}>
          {hasKey ? 'Claude AI Help — ready' : 'Enable Claude AI Help'}
        </span>
        {hasKey && masked && (
          <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace', marginLeft: 4 }}>{masked}</span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {hasKey && !editing && (
            <button className="secondary" style={{ fontSize: 11, padding: '3px 9px' }} onClick={() => setEditing(true)}>
              <Key size={10} /> Change Key
            </button>
          )}
        </div>
      </div>

      {!hasKey && !editing && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
          Add your Anthropic API key to get AI-powered explanations and fix suggestions on every diagnostic error.
        </p>
      )}

      {editing && (
        <div>
          {!hasKey && (
            <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--muted)' }}>
              Paste your Anthropic API key — get one free at{' '}
              <span
                style={{ color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline' }}
                onClick={() => (window as any).open?.('https://console.anthropic.com/settings/keys', '_blank')}
              >
                console.anthropic.com
              </span>.
              The key is stored only in your local workspace.
            </p>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                className="field-input"
                type={show ? 'text' : 'password'}
                value={keyInput}
                onChange={e => setKeyInput(e.target.value)}
                placeholder="sk-ant-api03-…"
                style={{ margin: 0, paddingRight: 36, fontFamily: 'monospace', fontSize: 12 }}
                onKeyDown={e => e.key === 'Enter' && save()}
                autoFocus
              />
              <button
                className="secondary"
                style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', padding: '2px 6px', border: 'none', background: 'transparent' }}
                onClick={() => setShow(s => !s)}
                title={show ? 'Hide key' : 'Show key'}
              >
                {show ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
            </div>
            <button onClick={save} disabled={saving || !keyInput.trim()} style={{ padding: '6px 14px', fontSize: 12 }}>
              {saving ? 'Saving…' : 'Save Key'}
            </button>
            {hasKey && (
              <button className="secondary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => { setEditing(false); setKeyInput(''); }}>
                Cancel
              </button>
            )}
          </div>
          {error && <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--red)' }}>{error}</p>}
        </div>
      )}
    </div>
  );
}

// ── CheckRow ──────────────────────────────────────────────────────────────────

function CheckRow({ check, hasAiKey, onFixed }: {
  check: CheckResult;
  hasAiKey: boolean;
  onFixed: () => void;
}) {
  const [open, setOpen]               = useState(check.status === 'error');
  const [fixing, setFixing]           = useState(false);
  const [fixResult, setFixResult]     = useState<{ ok: boolean; message: string } | null>(null);
  const [aiOpen, setAiOpen]           = useState(false);
  const [aiLoading, setAiLoading]     = useState(false);
  const [aiResponse, setAiResponse]   = useState<string | null>(null);
  const [aiError, setAiError]         = useState<string | null>(null);

  const showAiButton = check.status === 'error' || check.status === 'warn' || check.status === 'info';
  const canAskAi = hasAiKey && showAiButton;

  async function runAutoFix() {
    if (!check.autoFixAction) return;
    setFixing(true);
    setFixResult(null);
    try {
      const res = await window.creativePlatform.autoFix(check.autoFixAction);
      setFixResult(res);
      if (res.ok) setTimeout(onFixed, 800);
    } catch (e: any) {
      setFixResult({ ok: false, message: e.message || 'Fix failed' });
    } finally {
      setFixing(false);
    }
  }

  async function askAi() {
    if (aiResponse) { setAiOpen(o => !o); return; }
    setAiOpen(true);
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await window.creativePlatform.askClaudeAboutError({
        checkLabel:    check.label,
        checkStatus:   check.status,
        checkDetail:   check.detail,
        checkExactFix: check.exactFix,
        category:      check.category,
      });
      if (res.ok) setAiResponse(res.response);
      else setAiError(res.message || 'AI help unavailable.');
    } catch (e: any) {
      setAiError(e.message || 'Network error.');
    } finally {
      setAiLoading(false);
    }
  }

  const rowBg =
    check.status === 'error' ? 'rgba(255,60,60,.05)' :
    check.status === 'warn'  ? 'rgba(255,200,60,.04)' :
    'transparent';

  return (
    <div style={{ borderBottom: '1px solid var(--line)', background: rowBg }}>
      {/* Main row */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', cursor: check.exactFix ? 'pointer' : 'default' }}
        onClick={() => check.exactFix && setOpen(o => !o)}
      >
        <StatusIcon status={check.status} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>{check.label}</span>
          <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {check.detail}
          </span>
        </div>

        {/* Auto-fix button */}
        {check.autoFixAction && !fixResult?.ok && (
          <Tooltip text={fixing ? 'Applying fix…' : `Auto-fix: ${check.autoFixLabel}`} delay={200}>
            <button
              className="secondary"
              style={{ fontSize: 11, padding: '3px 10px', flexShrink: 0, color: statusColor(check.status), borderColor: statusColor(check.status) }}
              onClick={(e) => { e.stopPropagation(); runAutoFix(); }}
              disabled={fixing}
              title={check.autoFixLabel}
            >
              {fixing ? <RefreshCw size={10} className="spin" /> : <Zap size={10} />}
              {' '}{fixing ? 'Fixing…' : check.autoFixLabel}
            </button>
          </Tooltip>
        )}

        {/* Fixed confirmation */}
        {fixResult?.ok && (
          <span style={{ fontSize: 11, color: 'var(--green)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
            <CheckCircle2 size={11} /> Fixed
          </span>
        )}

        {/* Ask AI button */}
        {showAiButton && (
          <Tooltip text={hasAiKey ? 'Ask Claude to explain this error and suggest a fix' : 'Add a Claude API key in the section below to enable AI help'} delay={200}>
            <button
              className="secondary"
              style={{
                fontSize: 11, padding: '3px 10px', flexShrink: 0,
                color: !hasAiKey ? 'var(--muted)' : aiOpen ? 'var(--accent)' : 'var(--muted)',
                borderColor: aiOpen ? 'var(--accent)' : undefined,
                opacity: hasAiKey ? 1 : 0.45,
              }}
              onClick={(e) => { e.stopPropagation(); if (canAskAi) askAi(); }}
              disabled={aiLoading || !hasAiKey}
              title="Ask AI for help"
            >
              {aiLoading ? <RefreshCw size={10} className="spin" /> : <Bot size={10} />}
              {' '}{aiLoading ? 'Asking…' : 'Ask AI'}
            </button>
          </Tooltip>
        )}

        {/* Expand chevron for exact-fix instructions */}
        {check.exactFix && (
          <span style={{ color: 'var(--muted)', flexShrink: 0 }}>
            {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </span>
        )}
      </div>

      {/* Exact-fix instructions */}
      {open && check.exactFix && (
        <div style={{ margin: '0 14px 10px 38px', padding: 12, borderRadius: 7, background: 'var(--surface-dim)', border: '1px solid var(--line)' }}>
          <p style={{ margin: '0 0 6px', fontSize: 10, fontWeight: 700, color: statusColor(check.status), textTransform: 'uppercase', letterSpacing: '.07em' }}>
            Exact Fix
          </p>
          <pre style={{ margin: 0, fontSize: 12, color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: 'monospace', lineHeight: 1.65 }}>
            {check.exactFix}
          </pre>
          {fixResult && !fixResult.ok && (
            <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--red)' }}>Auto-fix failed: {fixResult.message}</p>
          )}
        </div>
      )}

      {/* AI response panel */}
      {aiOpen && (
        <div style={{ margin: '0 14px 12px 38px', padding: 14, borderRadius: 8, background: 'rgba(103,216,255,.04)', border: '1px solid rgba(103,216,255,.18)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <Bot size={13} color="var(--accent)" />
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.07em' }}>Claude AI</span>
            {aiResponse && (
              <button
                className="secondary"
                style={{ marginLeft: 'auto', fontSize: 10, padding: '2px 8px' }}
                onClick={() => { setAiResponse(null); setAiOpen(false); }}
                title="Clear AI response"
              >
                Clear
              </button>
            )}
          </div>

          {aiLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: 12 }}>
              <RefreshCw size={13} className="spin" /> Thinking…
            </div>
          )}

          {aiError && (
            <div style={{ fontSize: 12, color: 'var(--red)', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 2 }} />
              {aiError}
            </div>
          )}

          {aiResponse && <AiResponse text={aiResponse} />}
        </div>
      )}
    </div>
  );
}

// ── CheckCategory ─────────────────────────────────────────────────────────────

function CheckCategory({ category, checks, hasAiKey, onFixed }: {
  category: string;
  checks: CheckResult[];
  hasAiKey: boolean;
  onFixed: () => void;
}) {
  const meta   = CATEGORY_META[category] || { label: category, icon: <FileText size={14} /> };
  const errors = checks.filter(c => c.status === 'error').length;
  const warns  = checks.filter(c => c.status === 'warn').length;

  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 9, overflow: 'hidden', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', background: 'var(--surface-dim)', borderBottom: '1px solid var(--line)' }}>
        <span style={{ color: 'var(--accent)' }}>{meta.icon}</span>
        <span style={{ fontSize: 12, fontWeight: 600 }}>{meta.label}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 5 }}>
          {errors > 0 && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: 'rgba(255,60,60,.15)', color: 'var(--red)' }}>
              {errors} error{errors !== 1 ? 's' : ''}
            </span>
          )}
          {warns > 0 && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: 'rgba(255,200,60,.12)', color: 'var(--yellow)' }}>
              {warns} warning{warns !== 1 ? 's' : ''}
            </span>
          )}
          {errors === 0 && warns === 0 && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: 'rgba(60,200,120,.12)', color: 'var(--green)' }}>
              all good
            </span>
          )}
        </span>
      </div>
      {checks.map(c => <CheckRow key={c.id} check={c} hasAiKey={hasAiKey} onFixed={onFixed} />)}
    </div>
  );
}

// ── main screen ───────────────────────────────────────────────────────────────

export function DiagnosticsScreen() {
  const [checks, setChecks]           = useState<CheckResult[]>([]);
  const [running, setRunning]         = useState(false);
  const [lastRun, setLastRun]         = useState<Date | null>(null);
  const [catalog, setCatalog]         = useState<Record<string, any> | null>(null);
  const [catalogExpanded, setCatalogExpanded] = useState<string | null>(null);
  const [exportResult, setExportResult] = useState<any>(null);
  const [exporting, setExporting]     = useState(false);
  const [hasAiKey, setHasAiKey]       = useState(false);
  const [aiKeyMasked, setAiKeyMasked] = useState<string | null>(null);
  const [workspaceRoot, setWorkspaceRoot] = useState<string>('');
  const runRef = useRef(false);

  useEffect(() => {
    window.creativePlatform.errorCatalog().then(setCatalog);
    refreshAiKeyStatus();
    runCheck();
    window.creativePlatform.workspace().then((w: any) => {
      if (w?.workspaceRoot) setWorkspaceRoot(w.workspaceRoot);
    });
  }, []);

  async function refreshAiKeyStatus() {
    const res = await window.creativePlatform.getClaudeApiKey();
    setHasAiKey(res.hasKey ?? false);
    setAiKeyMasked(res.masked ?? null);
  }

  async function runCheck() {
    if (runRef.current) return;
    runRef.current = true;
    setRunning(true);
    try {
      const results = await window.creativePlatform.runSystemCheck();
      setChecks(results || []);
      setLastRun(new Date());
    } finally {
      setRunning(false);
      runRef.current = false;
    }
  }

  async function exportBundle() {
    setExporting(true);
    try { setExportResult(await window.creativePlatform.exportDiagnostics()); }
    finally { setExporting(false); }
  }

  async function runCatalogAction(target: string) {
    if (target === 'diagnostics') { await exportBundle(); return; }
    await window.creativePlatform.openPath(target);
  }

  const categoryOrder = ['workspace', 'engines', 'templates', 'permissions'];
  const grouped: Record<string, CheckResult[]> = {};
  for (const c of checks) {
    if (!grouped[c.category]) grouped[c.category] = [];
    grouped[c.category].push(c);
  }

  const totalErrors = checks.filter(c => c.status === 'error').length;
  const totalWarns  = checks.filter(c => c.status === 'warn').length;
  const totalOk     = checks.filter(c => c.status === 'ok').length;

  return (
    <div className="dashboard">

      {/* ── System Check ── */}
      <section className="panel">
        <h2><Activity size={22} /> System Diagnostics</h2>

        {/* Claude AI key banner */}
        <ClaudeKeyBanner
          hasKey={hasAiKey}
          masked={aiKeyMasked}
          onSaved={refreshAiKeyStatus}
        />

        {/* Action bar */}
        <div className="button-row" style={{ marginBottom: 16 }}>
          <Tooltip text="Re-run all workspace, template, and engine checks">
            <button onClick={runCheck} disabled={running}>
              <RefreshCw size={14} className={running ? 'spin' : ''} />
              {running ? 'Checking…' : 'Run Check'}
            </button>
          </Tooltip>
          <Tooltip text="Write a full diagnostics bundle to outputs/diagnostics/ as JSON" delay={200}>
            <button className="secondary" onClick={exportBundle} disabled={exporting}>
              <Activity size={14} /> {exporting ? 'Exporting…' : 'Export Bundle'}
            </button>
          </Tooltip>
          <Tooltip text="Open the workspace outputs folder in Finder" delay={200}>
            <button className="secondary" onClick={() => window.creativePlatform.openPath('outputs')}>
              <FolderOpen size={14} /> Open Outputs
            </button>
          </Tooltip>
        </div>

        {/* Workspace path */}
        {workspaceRoot && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            padding: '8px 12px', borderRadius: 7,
            background: 'var(--surface-dim)', border: '1px solid var(--line)',
            marginBottom: 16,
          }}>
            <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>Workspace</span>
            <code style={{ fontSize: 11, color: 'var(--text)', flex: 1, wordBreak: 'break-all', fontFamily: 'monospace' }}>
              {workspaceRoot}
            </code>
            <button className="secondary" style={{ fontSize: 11, padding: '3px 8px', flexShrink: 0 }}
              onClick={() => window.creativePlatform.revealFile?.(workspaceRoot)}>
              <FolderOpen size={11} /> Reveal
            </button>
          </div>
        )}

        {/* Summary row */}
        {checks.length > 0 && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 18, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 5, background: 'rgba(60,200,120,.12)', color: 'var(--green)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
              <CheckCircle2 size={10} /> {totalOk} OK
            </span>
            {totalWarns > 0 && (
              <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 5, background: 'rgba(255,200,60,.12)', color: 'var(--yellow)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
                <AlertTriangle size={10} /> {totalWarns} Warning{totalWarns !== 1 ? 's' : ''}
              </span>
            )}
            {totalErrors > 0 && (
              <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 5, background: 'rgba(255,60,60,.14)', color: 'var(--red)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
                <AlertTriangle size={10} /> {totalErrors} Error{totalErrors !== 1 ? 's' : ''}
              </span>
            )}
            {lastRun && (
              <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 'auto' }}>
                Last checked {lastRun.toLocaleTimeString()}
              </span>
            )}
          </div>
        )}

        {running && checks.length === 0 && (
          <div style={{ padding: '28px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            <RefreshCw size={22} className="spin" style={{ display: 'block', margin: '0 auto 12px' }} />
            Running checks…
          </div>
        )}

        {/* Check results by category */}
        {categoryOrder.map(cat => {
          const items = grouped[cat];
          if (!items?.length) return null;
          return (
            <CheckCategory
              key={cat}
              category={cat}
              checks={items}
              hasAiKey={hasAiKey}
              onFixed={runCheck}
            />
          );
        })}

        {/* Export bundle result */}
        {exportResult && (
          <div className={exportResult.ok ? 'result-ok' : 'result-error'} style={{ marginTop: 14 }}>
            {exportResult.ok
              ? <><strong>Bundle saved</strong><pre className="result-log">{JSON.stringify(exportResult.bundle, null, 2)}</pre></>
              : <p>{exportResult.userMessage || 'Export failed.'}</p>}
          </div>
        )}
      </section>

      {/* ── Error Catalog ── */}
      {catalog && (
        <section className="panel">
          <h2><Wrench size={22} /> Error Code Reference</h2>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}>
            Every error code the platform can emit — with plain-English causes, step-by-step recovery, and direct fix actions.
          </p>
          <div className="catalog-list">
            {Object.entries(catalog).map(([code, entry]: [string, any]) => (
              <div className="catalog-item" key={code}>
                <button
                  className="catalog-header"
                  onClick={() => setCatalogExpanded(catalogExpanded === code ? null : code)}
                >
                  {catalogExpanded === code ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  <code style={{ fontSize: 11, padding: '1px 6px', borderRadius: 4, background: 'var(--surface-mid)' }}>{code}</code>
                  <span style={{ flex: 1, textAlign: 'left' }}>{entry.title}</span>
                </button>
                {catalogExpanded === code && (
                  <div className="catalog-body">
                    <p style={{ margin: '0 0 10px', fontSize: 13 }}>{entry.user_message}</p>

                    <strong style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)' }}>Likely causes</strong>
                    <ul style={{ margin: '6px 0 12px' }}>
                      {entry.likely_causes.map((c: string, i: number) => <li key={i} style={{ fontSize: 12 }}>{c}</li>)}
                    </ul>

                    <strong style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)' }}>Recovery steps</strong>
                    <ol style={{ margin: '6px 0 12px' }}>
                      {entry.recovery_steps.map((s: string, i: number) => <li key={i} style={{ fontSize: 12 }}>{s}</li>)}
                    </ol>

                    {entry.actions?.length > 0 && (
                      <>
                        <strong style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)' }}>Fix actions</strong>
                        <div className="button-row" style={{ marginTop: 8 }}>
                          {entry.actions.map((a: any, i: number) => (
                            <button
                              key={i}
                              className="secondary"
                              style={{ fontSize: 12, padding: '6px 12px' }}
                              onClick={() => runCatalogAction(a.target)}
                              title={ACTION_LABELS[a.target] || a.label}
                            >
                              {ACTION_LABELS[a.target] || a.label}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
