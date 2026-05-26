import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronRight,
  Clock, ExternalLink, Eye, FileText, FolderOpen,
  Loader, Play, RefreshCw, ShieldCheck, XCircle,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface PreflightFieldDef {
  key: string;
  label: string;
  required: boolean;
  maxChars?: number;
}

export interface PreflightEngine {
  key: string;
  label: string;      // 'Illustrator'
  badge: string;      // 'ILLO'
  fg: string; bg: string; border: string;
  templateId?: string;
  templateName?: string;
  configured: boolean;
  fields?: PreflightFieldDef[];
  /** Only defined for AppleScript engines (Illustrator, InDesign). */
  runPreflightIpc?: () => Promise<{ ok: boolean; message?: string; userMessage?: string }>;
}

export interface PreflightRow {
  id: string;
  label: string;
  hasContent: boolean;
  /** Actual field values per engine — used for content validation. */
  contentByEngine?: Record<string, Record<string, string>>;
}

export interface PreflightPanelProps {
  engines: PreflightEngine[];
  rows: PreflightRow[];
  onRunProof: (rowId: string) => Promise<Record<string, { ok: boolean; output?: any; error?: string }>>;
  disabled?: boolean;
}

// ── Internal types ─────────────────────────────────────────────────────────────

type CheckStatus = 'idle' | 'checking' | 'ok' | 'warn' | 'fail';

interface ValidationIssue {
  rowId: string;
  rowLabel: string;
  engineKey: string;
  engineLabel: string;
  kind: 'missing' | 'overlimit';
  fieldLabel: string;
  detail: string;
}

interface ProofFile {
  engine: string; name: string; path: string; type: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function StatusIcon({ status, size = 13 }: { status: CheckStatus; size?: number }) {
  if (status === 'checking') return <Loader size={size} className="spin" style={{ color: 'var(--accent)', flexShrink: 0 }} />;
  if (status === 'ok')       return <CheckCircle2 size={size} style={{ color: 'var(--green)', flexShrink: 0 }} />;
  if (status === 'warn')     return <AlertTriangle size={size} style={{ color: 'var(--yellow)', flexShrink: 0 }} />;
  if (status === 'fail')     return <XCircle size={size} style={{ color: 'var(--red)', flexShrink: 0 }} />;
  return <div style={{ width: size, height: size, borderRadius: '50%', background: 'var(--border-subtle)', flexShrink: 0 }} />;
}

function EngineBadge({ eng, size = 'sm' }: { eng: PreflightEngine; size?: 'sm' | 'xs' }) {
  return (
    <span style={{
      fontSize: size === 'xs' ? 9 : 10, fontWeight: 800, letterSpacing: '.04em',
      padding: size === 'xs' ? '1px 4px' : '2px 6px', borderRadius: 4,
      background: eng.bg, color: eng.fg, border: `1px solid ${eng.border}`, flexShrink: 0,
    }}>
      {eng.badge}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--muted)', marginBottom: 10 }}>
      {children}
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: 'var(--line)', margin: '2px 0' }} />;
}

function validateContent(engines: PreflightEngine[], rows: PreflightRow[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const row of rows) {
    for (const eng of engines) {
      if (!eng.fields || !eng.configured) continue;
      const content = row.contentByEngine?.[eng.key] ?? {};
      for (const f of eng.fields) {
        const val = content[f.key] ?? '';
        if (f.required && !val.trim()) {
          issues.push({
            rowId: row.id, rowLabel: row.label,
            engineKey: eng.key, engineLabel: eng.label,
            kind: 'missing', fieldLabel: f.label,
            detail: `Required field "${f.label}" is empty`,
          });
        } else if (f.maxChars && val.length > f.maxChars) {
          issues.push({
            rowId: row.id, rowLabel: row.label,
            engineKey: eng.key, engineLabel: eng.label,
            kind: 'overlimit', fieldLabel: f.label,
            detail: `"${f.label}" is ${val.length - f.maxChars} chars over limit (${val.length}/${f.maxChars})`,
          });
        }
      }
    }
  }
  return issues;
}

function fmtMs(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ── Proof file card ────────────────────────────────────────────────────────────

function ProofFileCard({ file, eng }: { file: ProofFile; eng: PreflightEngine | undefined }) {
  const [imgErr, setImgErr] = useState(false);
  const isPng = file.type === 'png' || file.name.toLowerCase().endsWith('.png');
  const src   = isPng && !imgErr ? `file://${file.path}` : null;
  const fg     = eng?.fg ?? 'var(--muted)';
  const bg     = eng?.bg ?? 'var(--surface-dim)';
  const border = eng?.border ?? 'var(--border-subtle)';
  // Use portrait ratio for document engines, widescreen for web
  const docEngine = file.engine === 'illustrator' || file.engine === 'indesign';

  return (
    <div style={{
      borderRadius: 9, overflow: 'hidden',
      border: `1px solid ${border}`, background: bg,
      width: docEngine ? 110 : 140, flexShrink: 0,
    }}>
      <div style={{
        width: '100%', aspectRatio: docEngine ? '8.5/11' : '16/9', overflow: 'hidden',
        background: 'var(--surface-mid)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {src
          ? <img src={src} alt={file.name} onError={() => setImgErr(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          : <FileText size={22} style={{ color: 'var(--muted)', opacity: .3 }} />}
      </div>
      <div style={{ padding: '5px 7px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: fg, textTransform: 'uppercase', letterSpacing: '.04em' }}>
          {file.type.toUpperCase()}
        </div>
        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={file.name}>
          {file.name}
        </div>
      </div>
    </div>
  );
}

// ── Content preview pane ───────────────────────────────────────────────────────

function ContentPreviewPane({ row, engines }: { row: PreflightRow; engines: PreflightEngine[] }) {
  const [activeEng, setActiveEng] = useState(engines[0]?.key ?? '');
  const eng  = engines.find(e => e.key === activeEng);
  const vals = row.contentByEngine?.[activeEng] ?? {};
  const hasAny = Object.values(vals).some(v => v?.trim());

  return (
    <div style={{ background: 'var(--surface-dim)', borderRadius: 8, border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
      {/* Engine tab strip */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', overflowX: 'auto' }}>
        {engines.map(e => (
          <button key={e.key} onClick={() => setActiveEng(e.key)} style={{
            padding: '6px 12px', border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 700,
            letterSpacing: '.04em', flexShrink: 0,
            background: activeEng === e.key ? e.bg : 'transparent',
            color: activeEng === e.key ? e.fg : 'var(--muted)',
            borderBottom: activeEng === e.key ? `2px solid ${e.fg}` : '2px solid transparent',
          }}>
            {e.badge}
          </button>
        ))}
      </div>

      {/* Field values */}
      <div style={{ padding: '10px 12px', maxHeight: 200, overflowY: 'auto' }}>
        {!hasAny ? (
          <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>
            No content filled for {eng?.label ?? activeEng} yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(eng?.fields ?? Object.keys(vals).map(k => ({ key: k, label: k, required: false, maxChars: undefined } as PreflightFieldDef))).map(f => {
              const val = vals[f.key] ?? '';
              const over = f.maxChars && val.length > f.maxChars;
              const missing = f.required && !val.trim();
              if (!val && !f.required) return null;
              return (
                <div key={f.key}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: missing ? 'var(--red)' : over ? 'var(--yellow)' : 'var(--muted)' }}>
                      {f.label}
                    </span>
                    {f.required && !val && <span style={{ fontSize: 9, color: 'var(--red)', fontWeight: 700 }}>REQUIRED</span>}
                    {f.maxChars && val && (
                      <span style={{ fontSize: 9, color: over ? 'var(--red)' : 'var(--muted)', marginLeft: 'auto' }}>
                        {val.length}/{f.maxChars}
                      </span>
                    )}
                  </div>
                  {val ? (
                    <div style={{
                      fontSize: 11, color: 'var(--text)', lineHeight: 1.4,
                      padding: '4px 8px', borderRadius: 5,
                      background: over ? 'rgba(255,116,116,.06)' : 'var(--surface-mid)',
                      border: `1px solid ${over ? 'rgba(255,116,116,.2)' : 'var(--border-dim)'}`,
                      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                      maxHeight: 72, overflowY: 'auto',
                    }}>
                      {val}
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: 'var(--red)', fontStyle: 'italic', padding: '3px 8px' }}>
                      — empty —
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function PreflightPanel({ engines, rows, onRunProof, disabled }: PreflightPanelProps) {
  const [expanded,     setExpanded]     = useState(false);
  const [engStatuses,  setEngStatuses]  = useState<Record<string, CheckStatus>>({});
  const [engMessages,  setEngMessages]  = useState<Record<string, string>>({});
  const [engTimes,     setEngTimes]     = useState<Record<string, number>>({});  // ms taken
  const [checkingAll,  setCheckingAll]  = useState(false);
  const [proofRowId,   setProofRowId]   = useState<string>('');
  const [proofRunning, setProofRunning] = useState(false);
  const [proofResults, setProofResults] = useState<Record<string, { ok: boolean; output?: any; error?: string; ms?: number }> | null>(null);
  const [proofFiles,   setProofFiles]   = useState<ProofFile[]>([]);
  const [proofTs,      setProofTs]      = useState<number | null>(null);
  const [showPreview,  setShowPreview]  = useState(false);
  const [validIssues,  setValidIssues]  = useState<ValidationIssue[]>([]);
  const [issuesOpen,   setIssuesOpen]   = useState(false);
  const didAutoCheck = useRef(false);

  // Keep proofRowId in sync when rows change
  useEffect(() => {
    if (!proofRowId && rows.length > 0) setProofRowId(rows[0].id);
  }, [rows.length]);

  // Auto-run health checks the first time panel expands
  useEffect(() => {
    if (expanded && !didAutoCheck.current) {
      didAutoCheck.current = true;
      runAllPreflight();
    }
  }, [expanded]);

  // Re-validate content whenever rows change
  useEffect(() => {
    setValidIssues(validateContent(engines, rows));
  }, [rows, engines]);

  // ── Derived state ──────────────────────────────────────────────────────────

  const configured    = engines.filter(e => e.configured);
  const unconfigured  = engines.filter(e => !e.configured);
  const allStatuses   = configured.map(e => engStatuses[e.key] ?? 'idle');
  const anyFail       = allStatuses.some(s => s === 'fail');
  const anyChecking   = allStatuses.some(s => s === 'checking');
  const allOk         = allStatuses.length > 0 && allStatuses.every(s => s === 'ok');
  const summaryStatus: CheckStatus = anyFail ? 'fail' : anyChecking ? 'checking' : allOk ? 'ok' : 'idle';
  const readyRows     = rows.filter(r => r.hasContent);
  const selectedRow   = rows.find(r => r.id === proofRowId);
  const missingIssues = validIssues.filter(i => i.kind === 'missing');
  const limitIssues   = validIssues.filter(i => i.kind === 'overlimit');
  const blockingIssueCount = missingIssues.length; // required fields only block

  // ── Engine health checks ───────────────────────────────────────────────────

  async function runAllPreflight() {
    if (checkingAll) return;
    setCheckingAll(true);
    await Promise.all(configured.map(async (eng) => {
      setEngStatuses(prev => ({ ...prev, [eng.key]: 'checking' }));
      const t0 = Date.now();
      if (eng.runPreflightIpc) {
        try {
          const r = await eng.runPreflightIpc();
          const ms = Date.now() - t0;
          setEngTimes(prev => ({ ...prev, [eng.key]: ms }));
          setEngStatuses(prev => ({ ...prev, [eng.key]: r.ok ? 'ok' : 'fail' }));
          setEngMessages(prev => ({ ...prev, [eng.key]: r.ok ? (r.message || 'Connected · template verified') : (r.userMessage || r.message || 'Connection failed') }));
        } catch (err: any) {
          setEngTimes(prev => ({ ...prev, [eng.key]: Date.now() - t0 }));
          setEngStatuses(prev => ({ ...prev, [eng.key]: 'fail' }));
          setEngMessages(prev => ({ ...prev, [eng.key]: err.message || 'Connection failed' }));
        }
      } else {
        await new Promise(r => setTimeout(r, 180));
        const ms = Date.now() - t0;
        setEngTimes(prev => ({ ...prev, [eng.key]: ms }));
        setEngStatuses(prev => ({ ...prev, [eng.key]: eng.templateId ? 'ok' : 'warn' }));
        setEngMessages(prev => ({ ...prev, [eng.key]: eng.templateId ? `Template configured — ${eng.templateName || eng.templateId}` : 'No template assigned' }));
      }
    }));
    setCheckingAll(false);
  }

  async function recheckOne(eng: PreflightEngine) {
    setEngStatuses(prev => ({ ...prev, [eng.key]: 'checking' }));
    const t0 = Date.now();
    try {
      const r = await eng.runPreflightIpc!();
      setEngTimes(prev => ({ ...prev, [eng.key]: Date.now() - t0 }));
      setEngStatuses(prev => ({ ...prev, [eng.key]: r.ok ? 'ok' : 'fail' }));
      setEngMessages(prev => ({ ...prev, [eng.key]: r.ok ? (r.message || 'Connected · template verified') : (r.userMessage || r.message || 'Failed') }));
    } catch (err: any) {
      setEngTimes(prev => ({ ...prev, [eng.key]: Date.now() - t0 }));
      setEngStatuses(prev => ({ ...prev, [eng.key]: 'fail' }));
      setEngMessages(prev => ({ ...prev, [eng.key]: err.message }));
    }
  }

  // ── Proof render ───────────────────────────────────────────────────────────

  async function runProof() {
    if (!proofRowId || proofRunning) return;
    setProofRunning(true);
    setProofResults(null);
    setProofFiles([]);
    setProofTs(null);
    setShowPreview(false);

    const tsStart = Date.now();
    try {
      const results = await onRunProof(proofRowId);
      setProofResults(results);
      setProofTs(Date.now());

      const allFiles: any[] = await window.creativePlatform.listOutputs();
      setProofFiles(allFiles.filter(f => new Date(f.createdAt).getTime() >= tsStart - 3000));
    } catch (err: any) {
      setProofResults({ __error: { ok: false, error: err.message } });
      setProofTs(Date.now());
    } finally {
      setProofRunning(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  // Collapsed header background tints based on state
  const headerBg = anyFail ? 'rgba(255,116,116,.04)'
    : allOk && proofResults ? 'rgba(117,245,174,.03)'
    : 'transparent';

  return (
    <div style={{
      borderRadius: 12, overflow: 'hidden', marginBottom: 16,
      background: 'var(--panel)', border: `1px solid ${anyFail ? 'rgba(255,116,116,.3)' : allOk ? 'rgba(117,245,174,.2)' : 'var(--line)'}`,
      transition: 'border-color .2s',
    }}>

      {/* ── Collapsed header ── */}
      <div
        onClick={() => !disabled && setExpanded(e => !e)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '11px 16px', cursor: disabled ? 'default' : 'pointer',
          background: headerBg, userSelect: 'none',
        }}
      >
        <ShieldCheck size={14} style={{
          color: summaryStatus === 'ok' ? 'var(--green)' : summaryStatus === 'fail' ? 'var(--red)'
               : summaryStatus === 'checking' ? 'var(--accent)' : 'var(--muted)',
          flexShrink: 0,
        }} />
        <span style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>Pre-check &amp; Proof</span>

        {/* Engine health dots */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {configured.map(eng => (
            <div key={eng.key} title={`${eng.label}: ${engMessages[eng.key] || engStatuses[eng.key] || 'not checked'}`}>
              <StatusIcon status={engStatuses[eng.key] ?? 'idle'} size={12} />
            </div>
          ))}
        </div>

        {/* Validation issue count */}
        {blockingIssueCount > 0 && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
            background: 'rgba(255,116,116,.1)', color: 'var(--red)', border: '1px solid rgba(255,116,116,.28)',
          }}>
            {blockingIssueCount} issue{blockingIssueCount !== 1 ? 's' : ''}
          </span>
        )}
        {limitIssues.length > 0 && blockingIssueCount === 0 && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
            background: 'rgba(255,215,108,.1)', color: 'var(--yellow)', border: '1px solid rgba(255,215,108,.25)',
          }}>
            {limitIssues.length} warning{limitIssues.length !== 1 ? 's' : ''}
          </span>
        )}
        {allOk && blockingIssueCount === 0 && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
            background: 'rgba(117,245,174,.12)', color: 'var(--green)', border: '1px solid rgba(117,245,174,.28)',
          }}>All clear</span>
        )}
        {proofTs && !proofRunning && (
          <span style={{ fontSize: 10, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
            <Clock size={9} /> Proof {new Date(proofTs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}

        <ChevronRight size={13} style={{
          color: 'var(--muted)', flexShrink: 0,
          transform: expanded ? 'rotate(90deg)' : 'none',
          transition: 'transform .15s',
        }} />
      </div>

      {/* ── Expanded body ── */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--line)' }}>

          {/* ── Blocking warning banner ── */}
          {anyFail && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px',
              background: 'rgba(255,116,116,.07)', borderBottom: '1px solid rgba(255,116,116,.18)',
            }}>
              <XCircle size={13} style={{ color: 'var(--red)', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: 'var(--red)', fontWeight: 600 }}>
                Engine check failed — fix connection issues before running the full batch.
              </span>
            </div>
          )}

          <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* ──────────── SECTION 1: ENGINE HEALTH ──────────── */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <SectionLabel>Engine Health</SectionLabel>
                <button
                  onClick={runAllPreflight}
                  disabled={checkingAll || disabled || configured.length === 0}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 7,
                    cursor: (checkingAll || disabled) ? 'not-allowed' : 'pointer', border: 'none',
                    background: 'rgba(79,134,240,.1)', outline: '1px solid rgba(79,134,240,.3)',
                    color: 'var(--accent)', opacity: (checkingAll || disabled) ? .5 : 1,
                  }}
                >
                  {checkingAll
                    ? <><RefreshCw size={10} className="spin" /> Checking…</>
                    : <><ShieldCheck size={10} /> {allOk ? 'Re-run All' : 'Run All Checks'}</>}
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {configured.map(eng => {
                  const status = engStatuses[eng.key] ?? 'idle';
                  const msg    = engMessages[eng.key];
                  const ms     = engTimes[eng.key];
                  return (
                    <div key={eng.key} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '9px 12px', borderRadius: 8,
                      background: status === 'ok'       ? 'rgba(117,245,174,.05)'
                                : status === 'fail'     ? 'rgba(255,116,116,.06)'
                                : status === 'warn'     ? 'rgba(255,215,108,.05)'
                                : status === 'checking' ? 'rgba(79,134,240,.04)'
                                : 'var(--surface-dim)',
                      border: `1px solid ${
                        status === 'ok'       ? 'rgba(117,245,174,.2)'
                      : status === 'fail'     ? 'rgba(255,116,116,.22)'
                      : status === 'warn'     ? 'rgba(255,215,108,.18)'
                      : status === 'checking' ? 'rgba(79,134,240,.2)'
                      : 'var(--border-dim)'}`,
                    }}>
                      <StatusIcon status={status} size={13} />
                      <EngineBadge eng={eng} />

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
                          {eng.label}
                          {eng.templateName && (
                            <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--muted)', marginLeft: 6 }}>
                              — {eng.templateName}
                            </span>
                          )}
                        </div>
                        {msg && (
                          <div style={{
                            fontSize: 11, marginTop: 1,
                            color: status === 'ok' ? 'var(--green)' : status === 'fail' ? 'var(--red)' : 'var(--yellow)',
                          }}>
                            {msg}
                          </div>
                        )}
                        {!msg && status === 'idle' && (
                          <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>Not checked yet</div>
                        )}
                      </div>

                      {ms !== undefined && status !== 'checking' && (
                        <span style={{ fontSize: 10, color: 'var(--muted)', flexShrink: 0 }}>
                          {fmtMs(ms)}
                        </span>
                      )}

                      {eng.runPreflightIpc && status !== 'checking' && (
                        <button
                          onClick={e => { e.stopPropagation(); recheckOne(eng); }}
                          style={{
                            fontSize: 10, padding: '2px 8px', borderRadius: 5, cursor: 'pointer',
                            border: '1px solid var(--border-subtle)', background: 'var(--surface-dim)',
                            color: 'var(--muted)', flexShrink: 0,
                          }}
                        >
                          Re-check
                        </button>
                      )}
                    </div>
                  );
                })}

                {unconfigured.length > 0 && (
                  <div style={{
                    fontSize: 11, color: 'var(--muted)', padding: '7px 10px', borderRadius: 7,
                    background: 'var(--surface-dim)', border: '1px solid var(--border-dim)',
                  }}>
                    <span style={{ fontWeight: 600 }}>Skipped:</span>{' '}
                    {unconfigured.map(e => e.label).join(', ')} — no template assigned to this brand
                  </div>
                )}
              </div>
            </div>

            <Divider />

            {/* ──────────── SECTION 2: CONTENT VALIDATION ──────────── */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <SectionLabel>Content Validation</SectionLabel>
                {validIssues.length > 0 && (
                  <button
                    onClick={() => setIssuesOpen(o => !o)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      fontSize: 11, padding: '3px 10px', borderRadius: 6, cursor: 'pointer',
                      background: 'none', border: '1px solid var(--border-subtle)', color: 'var(--muted)',
                    }}
                  >
                    {issuesOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                    {issuesOpen ? 'Collapse' : 'Show all'}
                  </button>
                )}
              </div>

              {/* Row + engine stats */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: validIssues.length > 0 ? 10 : 0 }}>
                <StatChip value={rows.length}           label="total rows"        color={rows.length > 0 ? 'var(--text)' : 'var(--muted)'} />
                <StatChip value={readyRows.length}      label="ready to render"   color={readyRows.length > 0 ? 'var(--green)' : 'var(--muted)'} />
                <StatChip value={rows.length - readyRows.length} label="need filling" color={rows.length - readyRows.length > 0 ? 'var(--yellow)' : 'var(--muted)'} />
                {missingIssues.length > 0 && (
                  <StatChip value={missingIssues.length} label="missing required" color="var(--red)" />
                )}
                {limitIssues.length > 0 && (
                  <StatChip value={limitIssues.length} label="over char limit" color="var(--yellow)" />
                )}
              </div>

              {rows.length === 0 && (
                <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>
                  No rows yet — import a CSV or add rows to start.
                </div>
              )}

              {/* Issue list */}
              {issuesOpen && validIssues.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
                  {validIssues.map((issue, i) => {
                    const eng = engines.find(e => e.key === issue.engineKey);
                    return (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: 7,
                        padding: '5px 10px', borderRadius: 6,
                        background: issue.kind === 'missing' ? 'rgba(255,116,116,.06)' : 'rgba(255,215,108,.05)',
                        border: `1px solid ${issue.kind === 'missing' ? 'rgba(255,116,116,.18)' : 'rgba(255,215,108,.15)'}`,
                        fontSize: 11,
                      }}>
                        {issue.kind === 'missing'
                          ? <XCircle size={10} style={{ color: 'var(--red)', flexShrink: 0 }} />
                          : <AlertTriangle size={10} style={{ color: 'var(--yellow)', flexShrink: 0 }} />}
                        {eng && <EngineBadge eng={eng} size="xs" />}
                        <span style={{ color: 'var(--muted)', fontWeight: 600, flexShrink: 0 }}>{issue.rowLabel}</span>
                        <span style={{ color: issue.kind === 'missing' ? 'var(--red)' : 'var(--yellow)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {issue.detail}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <Divider />

            {/* ──────────── SECTION 3: PROOF RENDER ──────────── */}
            <div>
              <SectionLabel>Proof Render</SectionLabel>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12, lineHeight: 1.55 }}>
                Render one row through all engines to verify content, imagery, and layout before committing the full batch.
              </div>

              {/* Row selector + actions */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <select
                    value={proofRowId}
                    onChange={e => { setProofRowId(e.target.value); setProofResults(null); setProofFiles([]); setProofTs(null); }}
                    disabled={rows.length === 0 || proofRunning || disabled}
                    style={{
                      width: '100%', fontSize: 12, padding: '6px 10px', borderRadius: 7,
                      background: 'var(--panel2)', border: '1px solid var(--line)',
                      color: 'var(--text)', cursor: rows.length === 0 ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {rows.length === 0
                      ? <option value="">— no rows —</option>
                      : rows.map((r, i) => (
                        <option key={r.id} value={r.id}>
                          {r.label || `Row ${i + 1}`}
                          {!r.hasContent ? ' ⚠ no content' : ''}
                        </option>
                      ))
                    }
                  </select>
                </div>

                {/* Preview content button */}
                {selectedRow?.hasContent && (
                  <button
                    onClick={() => setShowPreview(v => !v)}
                    title="Preview content that will be injected"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      fontSize: 11, fontWeight: 600, padding: '6px 11px', borderRadius: 7,
                      cursor: 'pointer', border: 'none',
                      background: showPreview ? 'rgba(79,134,240,.14)' : 'var(--surface-mid)',
                      outline: showPreview ? '1px solid rgba(79,134,240,.35)' : '1px solid var(--border-subtle)',
                      color: showPreview ? 'var(--accent)' : 'var(--muted)',
                    }}
                  >
                    <Eye size={11} /> Preview
                  </button>
                )}

                <button
                  onClick={runProof}
                  disabled={!proofRowId || rows.length === 0 || proofRunning || disabled || !selectedRow?.hasContent}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    fontSize: 12, fontWeight: 700, padding: '7px 18px', borderRadius: 8,
                    cursor: 'pointer', border: 'none',
                    background: 'rgba(79,134,240,.14)', outline: '1.5px solid rgba(79,134,240,.4)',
                    color: 'var(--accent)',
                    opacity: (!proofRowId || rows.length === 0 || proofRunning || disabled || !selectedRow?.hasContent) ? .4 : 1,
                    transition: 'opacity .15s',
                  }}
                >
                  {proofRunning
                    ? <><Loader size={12} className="spin" /> Rendering…</>
                    : proofResults
                    ? <><RefreshCw size={11} /> Re-run Proof</>
                    : <><Play size={12} /> Render Proof</>}
                </button>
              </div>

              {/* No-content warning for selected row */}
              {selectedRow && !selectedRow.hasContent && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6, fontSize: 11,
                  color: 'var(--yellow)', padding: '6px 10px', borderRadius: 7,
                  background: 'rgba(255,215,108,.06)', border: '1px solid rgba(255,215,108,.2)',
                  marginBottom: 10,
                }}>
                  <AlertTriangle size={11} style={{ flexShrink: 0 }} />
                  This row has no content filled — use "Fill Rows" first or select a different row.
                </div>
              )}

              {/* Content preview pane */}
              {showPreview && selectedRow && engines.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>
                    Content that will be injected for <span style={{ color: 'var(--text)' }}>{selectedRow.label}</span>:
                  </div>
                  <ContentPreviewPane row={selectedRow} engines={configured} />
                </div>
              )}

              {/* Proof running state */}
              {proofRunning && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
                  color: 'var(--muted)', padding: '10px 12px', borderRadius: 8,
                  background: 'rgba(79,134,240,.05)', border: '1px solid rgba(79,134,240,.15)',
                }}>
                  <Loader size={13} className="spin" style={{ color: 'var(--accent)', flexShrink: 0 }} />
                  <span>
                    Rendering proof through {configured.length} engine{configured.length !== 1 ? 's' : ''}
                    <span style={{ color: 'var(--muted)', fontStyle: 'italic', marginLeft: 6 }}>— this may take 30–90s for AppleScript engines</span>
                  </span>
                </div>
              )}

              {/* Proof results */}
              {proofResults && !proofRunning && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

                  {/* Per-engine result rows */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {Object.entries(proofResults).filter(([k]) => k !== '__error').map(([engKey, res]) => {
                      const eng = engines.find(e => e.key === engKey);
                      if (!eng) return null;
                      const engFiles = proofFiles.filter(f => f.engine === engKey);
                      return (
                        <div key={engKey} style={{
                          padding: '8px 12px', borderRadius: 8,
                          background: res.ok ? 'rgba(117,245,174,.05)' : 'rgba(255,116,116,.06)',
                          border: `1px solid ${res.ok ? 'rgba(117,245,174,.2)' : 'rgba(255,116,116,.22)'}`,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <StatusIcon status={res.ok ? 'ok' : 'fail'} size={12} />
                            <EngineBadge eng={eng} />
                            <span style={{ fontSize: 12, fontWeight: 600, color: res.ok ? 'var(--green)' : 'var(--red)', flex: 1 }}>
                              {res.ok ? 'Passed' : (res.error || 'Failed')}
                            </span>
                            {res.ms && (
                              <span style={{ fontSize: 10, color: 'var(--muted)' }}>{fmtMs(res.ms)}</span>
                            )}
                            {res.ok && res.output?.url && (
                              <a href="#"
                                onClick={e => { e.preventDefault(); window.creativePlatform.openUrl?.(res.output.url); }}
                                style={{ fontSize: 11, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 3 }}>
                                <ExternalLink size={10} /> View
                              </a>
                            )}
                          </div>
                          {/* Inline file chips for this engine */}
                          {engFiles.length > 0 && (
                            <div style={{ display: 'flex', gap: 5, marginTop: 7, flexWrap: 'wrap' }}>
                              {engFiles.map((f, i) => (
                                <span key={i} style={{
                                  fontSize: 10, padding: '2px 7px', borderRadius: 5,
                                  background: eng.bg, color: eng.fg, border: `1px solid ${eng.border}`,
                                  fontWeight: 700, letterSpacing: '.03em',
                                }}>
                                  {f.type.toUpperCase()} · {f.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {proofResults['__error'] && (
                      <div style={{
                        fontSize: 12, color: 'var(--red)', padding: '8px 12px', borderRadius: 8,
                        background: 'rgba(255,116,116,.06)', border: '1px solid rgba(255,116,116,.22)',
                      }}>
                        ✗ {proofResults['__error'].error}
                      </div>
                    )}
                  </div>

                  {/* File preview strip — PNG thumbnails */}
                  {proofFiles.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>{proofFiles.length} file{proofFiles.length !== 1 ? 's' : ''} generated</span>
                        <button
                          onClick={() => window.creativePlatform.openPath('outputs')}
                          style={{
                            fontSize: 10, padding: '2px 8px', borderRadius: 5, cursor: 'pointer',
                            background: 'none', border: '1px solid var(--border-subtle)', color: 'var(--muted)',
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                          }}
                        >
                          <FolderOpen size={9} /> Open folder
                        </button>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {proofFiles.map((f, i) => (
                          <ProofFileCard
                            key={i}
                            file={f}
                            eng={engines.find(e => e.key === f.engine)}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {proofFiles.length === 0 && Object.entries(proofResults).filter(([k]) => k !== '__error').some(([, r]) => r.ok) && (
                    <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>
                      No local files generated — web engine outputs (Canva, Express, Figma) live in their respective dashboards.
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}

// ── Stat chip ──────────────────────────────────────────────────────────────────

function StatChip({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'baseline', gap: 5,
      padding: '5px 12px', borderRadius: 7,
      background: 'var(--surface-dim)', border: '1px solid var(--border-dim)',
    }}>
      <span style={{ fontSize: 17, fontWeight: 800, color, lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: 10, color: 'var(--muted)' }}>{label}</span>
    </div>
  );
}
