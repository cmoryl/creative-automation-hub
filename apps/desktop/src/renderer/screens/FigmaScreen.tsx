import { useEffect, useRef, useState } from 'react';
import { usePlatformStore } from '../state/usePlatformStore';
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronRight,
  Clipboard, ClipboardCheck, Download, ExternalLink, Figma,
  FolderOpen, Image, RefreshCw, Wand2, Zap,
} from 'lucide-react';
import { CharLimitField, DEFAULT_CHAR_LIMITS } from '../components/CharLimitField';
import { ImagePickerField } from '../components/ImagePickerField';
import { Tooltip } from '../components/Tooltip';
import { ClaudeBriefPanel } from '../components/ClaudeBriefPanel';
import { ExportPreviewModal } from '../components/ExportPreviewModal';
import { ContentPresets } from '../components/ContentPresets';

const FIGMA_ACCENT = 'var(--eng-figma)';

function fieldLabel(key: string) {
  return key.replace(/^(TEXT_|DOC_|IMAGE_|FIG_)/, '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
}

function getManifestFields(template: any): { key: string; label: string; required: boolean; maxChars?: number }[] {
  const objs = template?.manifest?.editable_objects ?? template?.editableObjects ?? template?.manifest?.editableObjects;
  if (objs && typeof objs === 'object') {
    const textFields = Object.entries(objs)
      .filter(([, v]: any) => !v.type || v.type === 'text')
      .map(([key, v]: any) => ({
        key, label: fieldLabel(key), required: !!v.required,
        maxChars: v.max_chars ?? (DEFAULT_CHAR_LIMITS as any)[key] ?? undefined,
      }));
    if (textFields.length > 0) return textFields;
  }
  return FALLBACK_FIELDS;
}

function getManifestImageFields(template: any): { key: string; label: string }[] {
  const objs = template?.manifest?.editable_objects ?? template?.editableObjects ?? template?.manifest?.editableObjects;
  if (!objs || typeof objs !== 'object') return [];
  return Object.entries(objs)
    .filter(([, v]: any) => v.type === 'image')
    .map(([key]: any) => ({ key, label: fieldLabel(key) }));
}

const FALLBACK_FIELDS = [
  { key: 'TEXT_TITLE',    label: 'Title',          required: true,  maxChars: 120 },
  { key: 'TEXT_SUBTITLE', label: 'Subtitle',       required: false, maxChars: 180 },
  { key: 'TEXT_BODY',     label: 'Body',           required: false, maxChars: 600 },
  { key: 'TEXT_CTA',      label: 'Call to Action', required: false, maxChars: 120 },
  { key: 'STAT_01',       label: 'Stat 1',         required: false, maxChars: 60  },
  { key: 'STAT_02',       label: 'Stat 2',         required: false, maxChars: 60  },
];

function buildJobContent(form: Record<string, string>) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(form)) { if (v.trim()) out[k] = v.trim(); }
  return out;
}

// ── Step chip ─────────────────────────────────────────────────────────────────
function StepChip({ n, label, done, active }: { n: number; label: string; done: boolean; active: boolean }) {
  const color = done ? 'var(--green)' : active ? FIGMA_ACCENT : 'var(--border-mid)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600,
      color: active ? 'var(--text)' : color, whiteSpace: 'nowrap' }}>
      <div style={{
        width: 22, height: 22, borderRadius: '50%', display: 'grid', placeItems: 'center',
        fontSize: 11, fontWeight: 900, border: `1.5px solid ${color}`, color,
        background: done ? 'rgba(117,245,174,.12)' : active ? 'rgba(162,89,255,.12)' : 'transparent',
      }}>{done ? '✓' : n}</div>
      {label}
    </div>
  );
}

// ── Template card ─────────────────────────────────────────────────────────────
function TemplateCard({ template, selected, onSelect }: { template: any; selected: boolean; onSelect: () => void }) {
  const [imgError, setImgError] = useState(false);
  const thumb = template.thumbnailUrl ?? template.manifest?.thumbnailUrl;
  return (
    <button onClick={onSelect} className={`adobe-template-card${selected ? ' selected' : ''}`} title={template.name}>
      <div className="adobe-template-thumb">
        {thumb && !imgError
          ? <img src={thumb} alt={template.name} onError={() => setImgError(true)} />
          : <Figma size={28} style={{ color: FIGMA_ACCENT, opacity: .5 }} />
        }
      </div>
      <div className="adobe-template-info">
        <span className="adobe-template-dim-badge" style={{ borderColor: FIGMA_ACCENT, color: FIGMA_ACCENT }}>Figma</span>
        <span className="adobe-template-name">{template.name}</span>
        {(template.figmaFileKey ?? template.manifest?.figmaFileKey) && (
          <span className="adobe-template-category" style={{ fontFamily: 'monospace', textTransform: 'none', letterSpacing: 0 }}>
            {(template.figmaFileKey ?? template.manifest?.figmaFileKey).slice(0, 8)}…
          </span>
        )}
      </div>
      {selected && <div className="adobe-template-selected-ring" style={{ borderColor: FIGMA_ACCENT, boxShadow: `0 0 0 3px rgba(162,89,255,.15)` }} />}
    </button>
  );
}

// ── Copy content button ───────────────────────────────────────────────────────
function CopyContentButton({ fields, form, templateName }: { fields: any[]; form: Record<string, string>; templateName?: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    const lines = fields
      .filter(f => form[f.key]?.trim())
      .map(f => `${f.label.toUpperCase()}:\n${form[f.key].trim()}`)
      .join('\n\n');
    const text = templateName ? `Template: ${templateName}\n\n${lines}` : lines;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button className={`copy-btn${copied ? ' copied' : ''}`} onClick={copy}
      style={{ color: copied ? 'var(--green)' : FIGMA_ACCENT,
        borderColor: copied ? 'rgba(117,245,174,.3)' : 'rgba(162,89,255,.3)' }}>
      {copied ? <ClipboardCheck size={12} /> : <Clipboard size={12} />}
      {copied ? 'Copied!' : 'Copy all content'}
    </button>
  );
}

// ── Result panel ─────────────────────────────────────────────────────────────
function ResultPanel({ result }: { result: any }) {
  if (!result) return null;
  if (result.ok) return (
    <div className="result-ok">
      <strong><CheckCircle2 size={15} /> {result.mode === 'handoff' ? 'Handoff Ready' : 'Export Complete'}</strong>
      {result.message && <p style={{ margin: '6px 0 0', fontSize: 13 }}>{result.message}</p>}
      {result.variablesUpdated > 0 && (
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--green)' }}>
          ✓ {result.variablesUpdated} Figma variable{result.variablesUpdated !== 1 ? 's' : ''} updated
        </p>
      )}
      {result.exportedFiles?.length > 0 && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {result.exportedFiles.map((f: any, i: number) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--muted)', flex: 1, wordBreak: 'break-all' }}>{f.name}</span>
              <button className="secondary" style={{ fontSize: 11, padding: '3px 8px' }}
                onClick={() => window.creativePlatform.openFile?.(f.path)}>
                Open
              </button>
              <button className="secondary" style={{ fontSize: 11, padding: '3px 8px' }}
                onClick={() => window.creativePlatform.revealFile?.(f.path)}>
                <FolderOpen size={10} /> Reveal
              </button>
            </div>
          ))}
        </div>
      )}
      {result.figmaUrl && (
        <button className="secondary" style={{ fontSize: 11, padding: '5px 12px', marginTop: 8 }}
          onClick={() => window.creativePlatform.openFigmaDesign?.(result.figmaUrl)}>
          <ExternalLink size={11} /> View in Figma
        </button>
      )}
    </div>
  );
  return (
    <div className="result-error">
      <div className="result-error-header">
        <AlertTriangle size={15} />
        <strong>{result.errorTitle || 'Error'}</strong>
        {result.errorCode && <span className="badge">{result.errorCode}</span>}
      </div>
      <p>{result.userMessage || result.error || result.message}</p>
      {result.likelyCauses?.length > 0 && (
        <div className="result-section"><strong>Likely causes</strong>
          <ul>{result.likelyCauses.map((c: string, i: number) => <li key={i}>{c}</li>)}</ul>
        </div>
      )}
      {result.recoverySteps?.length > 0 && (
        <div className="result-section"><strong>Recovery steps</strong>
          <ol>{result.recoverySteps.map((s: string, i: number) => <li key={i}>{s}</li>)}</ol>
        </div>
      )}
    </div>
  );
}

// ── Add Figma template panel ──────────────────────────────────────────────────
function AddFigmaTemplatePanel({ onAdded, disabled }: { onAdded: (t: any) => void; disabled: boolean }) {
  const [open, setOpen]     = useState(false);
  const [url, setUrl]       = useState('');
  const [name, setName]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');

  async function add() {
    if (!url.trim() || !name.trim()) { setError('Both a URL and a name are required.'); return; }
    setLoading(true); setError('');
    try {
      const r = await window.creativePlatform.addFigmaTemplate({ figmaUrl: url.trim(), templateName: name.trim() });
      if (r.ok) { onAdded(r.template); setUrl(''); setName(''); setOpen(false); }
      else { setError(r.message || 'Failed to register template.'); }
    } finally { setLoading(false); }
  }

  if (!open) return (
    <button className="secondary" style={{ fontSize: 12, padding: '7px 14px', marginTop: 10,
      borderColor: 'rgba(162,89,255,.3)', color: FIGMA_ACCENT }}
      onClick={() => setOpen(true)}>
      + Add Figma File
    </button>
  );

  return (
    <div style={{ padding: 14, borderRadius: 12, border: `1px solid rgba(162,89,255,.3)`,
      background: 'rgba(162,89,255,.04)', marginTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Figma size={14} style={{ color: FIGMA_ACCENT }} />
        <strong style={{ fontSize: 13 }}>Register Figma File</strong>
        <button className="secondary" style={{ fontSize: 11, padding: '3px 8px', marginLeft: 'auto' }}
          onClick={() => { setOpen(false); setError(''); }}>Cancel</button>
      </div>
      <div className="field-group">
        <label>Figma File URL</label>
        <input className="field-input" value={url} onChange={e => setUrl(e.target.value)}
          placeholder="https://www.figma.com/design/AbCd1234/My-Template" />
        <span style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3, display: 'block' }}>
          Paste the full URL — file key and node ID are parsed automatically
        </span>
      </div>
      <div className="field-group">
        <label>Template Name</label>
        <input className="field-input" value={name} onChange={e => setName(e.target.value)}
          placeholder="e.g. Case Study Slide Deck"
          onKeyDown={e => e.key === 'Enter' && add()} />
      </div>
      {error && <p style={{ color: 'var(--red)', fontSize: 12, margin: '6px 0' }}>{error}</p>}
      <button onClick={add} disabled={loading || disabled}
        style={{ fontSize: 12, padding: '8px 18px', background: FIGMA_ACCENT, color: '#fff', border: 'none', marginTop: 2 }}>
        {loading ? <><RefreshCw size={12} className="spin" /> Registering…</> : 'Register Template'}
      </button>
    </div>
  );
}

// ── Firefly AI image generation panel ─────────────────────────────────────────
function FireflyPanel({
  imageFields,
  onImagePath,
  disabled,
}: {
  imageFields: { key: string; label: string }[];
  onImagePath: (fieldKey: string, path: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen]               = useState(false);
  const [prompt, setPrompt]           = useState('');
  const [aspectRatio, setAspectRatio] = useState<'widescreen' | 'portrait' | 'square'>('widescreen');
  const [style, setStyle]             = useState<'photo' | 'art'>('photo');
  const [loading, setLoading]         = useState(false);
  const [result, setResult]           = useState<any>(null);
  const [noCredentials, setNoCredentials] = useState(false);

  async function generate() {
    if (!prompt.trim()) return;
    setLoading(true); setResult(null); setNoCredentials(false);
    try {
      const r = await window.creativePlatform.generateFireflyImage({ prompt: prompt.trim(), aspectRatio, style });
      if (r.ok) { setResult(r); }
      else if (r.noCredentials) { setNoCredentials(true); }
      else { setResult(r); }
    } finally { setLoading(false); }
  }

  return (
    <div className={`firefly-panel${open ? ' open' : ''}`}>
      <button className="firefly-panel-hdr" onClick={() => setOpen(o => !o)}>
        <Wand2 size={13} style={{ color: '#FF7262' }} />
        <span>Generate Image with Adobe Firefly</span>
        <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 400, marginLeft: 4, flex: 1 }}>
          AI image → auto-fill image slot
        </span>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>
      {open && (
        <div className="firefly-panel-body">
          <textarea className="field-input" rows={2} value={prompt} onChange={e => setPrompt(e.target.value)}
            placeholder="Describe the image… e.g. 'Professional team in a modern creative studio'" disabled={loading} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            {(['widescreen', 'portrait', 'square'] as const).map(r => (
              <button key={r} className={aspectRatio === r ? '' : 'secondary'}
                style={{ flex: 1, fontSize: 11, padding: '5px 8px' }} onClick={() => setAspectRatio(r)}>{r}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            {(['photo', 'art'] as const).map(s => (
              <button key={s} className={style === s ? '' : 'secondary'}
                style={{ flex: 1, fontSize: 11, padding: '5px 8px' }} onClick={() => setStyle(s)}>{s}</button>
            ))}
          </div>
          <button onClick={generate} disabled={loading || !prompt.trim() || disabled}
            style={{ marginTop: 10, width: '100%', justifyContent: 'center', fontSize: 12, padding: '8px' }}>
            {loading ? <><RefreshCw size={12} className="spin" /> Generating…</> : <><Wand2 size={12} /> Generate</>}
          </button>
          {noCredentials && (
            <div style={{ marginTop: 10, padding: 12, borderRadius: 8, background: 'rgba(255,116,116,.07)',
              border: '1px solid rgba(255,116,116,.2)', fontSize: 12 }}>
              <strong style={{ color: 'var(--red)' }}>Adobe Firefly credentials not configured</strong>
              <p style={{ margin: '4px 0 0', color: 'var(--muted)', lineHeight: 1.6 }}>
                Get a Client ID + Secret at <strong>developer.adobe.com</strong> → Adobe Firefly API.
                Set them in <strong>Diagnostics → Firefly Credentials</strong>.
              </p>
            </div>
          )}
          {result && !result.ok && (
            <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: 'rgba(255,116,116,.07)',
              fontSize: 12, color: 'var(--red)' }}>
              {result.error || result.message || 'Generation failed.'}
            </div>
          )}
          {result?.ok && result.imagePath && (
            <div style={{ marginTop: 10 }}>
              <img src={result.imagePath} alt="Generated"
                style={{ width: '100%', borderRadius: 8, border: '1px solid var(--line)' }} />
              {imageFields.length > 0 && (
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  {imageFields.map(f => (
                    <button key={f.key} className="secondary" style={{ fontSize: 11, padding: '5px 10px' }}
                      onClick={() => onImagePath(f.key, result.localPath || result.imagePath)}>
                      Use as {f.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Figma Context / MCP bridge panel ─────────────────────────────────────────
function FigmaContextPanel({ template, disabled }: { template: any; disabled: boolean }) {
  const [open, setOpen]         = useState(false);
  const [info, setInfo]         = useState<any>(null);
  const [variables, setVariables] = useState<any>(null);
  const [loading, setLoading]   = useState<string | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [aiError, setAiError]       = useState<string | null>(null);

  const fileKey = template?.figmaFileKey ?? template?.manifest?.figmaFileKey;

  async function fetchInfo() {
    if (!fileKey) return;
    setLoading('info'); setInfo(null);
    try {
      const r = await window.creativePlatform.getFigmaFileInfo(fileKey);
      if (r.ok) setInfo(r);
      else setInfo(r);
    } finally { setLoading(null); }
  }

  async function fetchVariables() {
    if (!fileKey) return;
    setLoading('vars'); setVariables(null);
    try {
      const r = await window.creativePlatform.getFigmaVariables(fileKey);
      setVariables(r);
    } finally { setLoading(null); }
  }

  async function analyzeWithClaude() {
    if (!template) return;
    setLoading('ai'); setAiAnalysis(null); setAiError(null);
    try {
      const contextDetail = [
        info?.name     ? `File: "${info.name}"` : '',
        info?.pageCount ? `${info.pageCount} page(s), ${info.frameCount} frame(s)` : '',
        variables?.variableCount ? `${variables.variableCount} local string variables: ${(variables.variableNames ?? []).slice(0, 8).join(', ')}` : '',
        template.name  ? `Template: ${template.name}` : '',
      ].filter(Boolean).join(' · ');
      const r = await window.creativePlatform.askClaudeAboutError({
        checkLabel: `Figma File: ${template.name}`,
        checkDetail: contextDetail || 'Use Fetch File Info to load design context first.',
        category: 'figma',
        suggestedFix: 'Analyze the Figma design structure and suggest how to map content fields to Figma variables or text layers.',
      });
      if (r.ok) setAiAnalysis(r.response);
      else setAiError(r.message || 'AI analysis unavailable.');
    } catch (e: any) {
      setAiError(e.message || 'Request failed.');
    } finally { setLoading(null); }
  }

  if (!template) return null;
  const busy = !!loading || disabled;

  return (
    <div style={{ borderRadius: 12, border: `1px solid rgba(162,89,255,.2)`,
      background: 'rgba(162,89,255,.03)', overflow: 'hidden', marginBottom: 12 }}>
      <button style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
        background: 'transparent', border: 'none', color: 'var(--text)', fontSize: 12,
        fontWeight: 600, cursor: 'pointer', textAlign: 'left', justifyContent: 'flex-start' }}
        onClick={() => setOpen(o => !o)}>
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <Figma size={13} style={{ color: FIGMA_ACCENT }} />
        <span>Figma Context</span>
        <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400, marginLeft: 4, flex: 1 }}>
          File info · Variables · MCP bridge
        </span>
        {info?.ok && <CheckCircle2 size={12} style={{ color: 'var(--green)', marginLeft: 'auto' }} />}
      </button>
      {open && (
        <div style={{ padding: 14, borderTop: '1px solid rgba(162,89,255,.15)',
          display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
            Fetch live file data from Figma, inspect variables, and use Claude AI to analyze design structure
            and suggest content mappings for this template.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="secondary" style={{ fontSize: 11, padding: '6px 12px' }}
              onClick={fetchInfo} disabled={busy || !fileKey}>
              {loading === 'info' ? <RefreshCw size={11} className="spin" /> : <Figma size={11} />}
              Fetch File Info
            </button>
            <button className="secondary" style={{ fontSize: 11, padding: '6px 12px' }}
              onClick={fetchVariables} disabled={busy || !fileKey}>
              {loading === 'vars' ? <RefreshCw size={11} className="spin" /> : <Zap size={11} />}
              Get Variables
            </button>
            <Tooltip text="Sends design context to Claude AI for content mapping suggestions">
              <button className="secondary" style={{ fontSize: 11, padding: '6px 12px',
                borderColor: 'rgba(162,89,255,.3)', color: FIGMA_ACCENT }}
                onClick={analyzeWithClaude} disabled={busy}>
                {loading === 'ai' ? <RefreshCw size={11} className="spin" /> : <Wand2 size={11} />}
                Analyze with Claude
              </button>
            </Tooltip>
            <button className="secondary" style={{ fontSize: 11, padding: '6px 12px', marginLeft: 'auto' }}
              onClick={() => window.creativePlatform.openFigmaDesign?.(
                template.figmaUrl ?? template.manifest?.figmaUrl
              )}>
              <ExternalLink size={11} /> Open in Figma
            </button>
          </div>

          {info && (
            <div style={{ fontSize: 12, background: info.ok ? 'rgba(117,245,174,.05)' : 'rgba(255,116,116,.05)',
              border: `1px solid ${info.ok ? 'rgba(117,245,174,.2)' : 'rgba(255,116,116,.2)'}`,
              borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 3 }}>
              {info.ok ? (
                <>
                  <div><strong>File:</strong> {info.name}</div>
                  {info.pageCount > 0 && <div><strong>Pages:</strong> {info.pageCount} · <strong>Frames:</strong> {info.frameCount}</div>}
                  {info.lastModified && <div style={{ color: 'var(--muted)' }}>Last modified: {new Date(info.lastModified).toLocaleDateString()}</div>}
                </>
              ) : (
                <div style={{ color: 'var(--red)' }}>{info.message || 'Could not fetch file info'}</div>
              )}
            </div>
          )}

          {variables && variables.ok && variables.variableCount > 0 && (
            <div style={{ fontSize: 12 }}>
              <strong style={{ display: 'block', marginBottom: 6 }}>
                String Variables ({variables.variableCount})
              </strong>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {(variables.variableNames as string[]).slice(0, 16).map((v: string) => (
                  <span key={v} style={{ padding: '2px 7px', borderRadius: 4,
                    background: 'rgba(162,89,255,.1)', color: FIGMA_ACCENT, fontSize: 10, fontWeight: 600 }}>
                    {v}
                  </span>
                ))}
                {variables.variableCount > 16 && (
                  <span style={{ fontSize: 10, color: 'var(--muted)', alignSelf: 'center' }}>
                    +{variables.variableCount - 16} more
                  </span>
                )}
              </div>
            </div>
          )}

          {variables && variables.ok && variables.variableCount === 0 && (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
              No string variables found. Content fields will be used for handoff only.
            </p>
          )}

          {aiError && (
            <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--red)' }}>{aiError}</p>
          )}
          {aiAnalysis && (
            <div style={{ padding: 12, borderRadius: 8, background: 'rgba(162,89,255,.07)',
              border: '1px solid rgba(162,89,255,.2)', fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
              {aiAnalysis}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Figma screen ─────────────────────────────────────────────────────────
export function FigmaScreen() {
  const pendingFill = usePlatformStore(s => s.pendingFill?.['figma']);
  const clearPendingFill = usePlatformStore(s => s.clearPendingFill);
  const activeBrand = usePlatformStore(s => s.activeBrand);
  const [templates, setTemplates]               = useState<any[]>([]);
  const [activeTemplate, setActiveTemplate]     = useState<any>(null);
  const [connOpen, setConnOpen]                 = useState(false);
  const [token, setToken]                       = useState('');
  const [hasToken, setHasToken]                 = useState(false);
  const [tokenMasked, setTokenMasked]           = useState<string | null>(null);
  const [savingToken, setSavingToken]           = useState(false);
  const [connResult, setConnResult]             = useState<any>(null);
  const [form, setForm]                         = useState<Record<string, string>>({});
  const [images, setImages]                     = useState<Record<string, string>>({});
  const [loading, setLoading]                   = useState<string | null>(null);
  const [exportResult, setExportResult]         = useState<any>(null);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [projects, setProjects]                 = useState<any[]>([]);
  const [outputName, setOutputName]             = useState('');
  const [previewOpen, setPreviewOpen]           = useState(false);
  const [thumbUrl, setThumbUrl]                 = useState<string | null>(null);

  useEffect(() => {
    if (!pendingFill) return;
    setForm(f => ({ ...f, ...pendingFill }));
    clearPendingFill('figma');
  }, [pendingFill]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!activeTemplate?.id) return;
    setThumbUrl(null);
    window.creativePlatform.getTemplateThumbnail(activeTemplate.id).then((r: any) => {
      if (r?.ok && r.thumbnailUrl) setThumbUrl(r.thumbnailUrl);
    });
  }, [activeTemplate?.id]);

  useEffect(() => {
    window.creativePlatform.listProjects().then((p: any[]) => setProjects(p || []));
    window.creativePlatform.listTemplates().then((all: any[]) => {
      const figs = (all || []).filter((t: any) => t.engine === 'figma' || t.isFigma);
      setTemplates(figs);
      if (figs.length > 0) setActiveTemplate(figs[0]);
    });
    window.creativePlatform.getFigmaToken?.().then((r: any) => {
      if (r?.ok) { setHasToken(r.hasToken); setTokenMasked(r.masked); }
    });
  }, []);

  // Reset form when template changes, loading draft if available
  const figmaDraftKey = activeTemplate?.id ? `draft:figma:${activeTemplate.id}` : null;
  const figmaSkipSaveRef = useRef(false);

  useEffect(() => {
    if (!activeTemplate) return;
    const fields = getManifestFields(activeTemplate);
    const blank = Object.fromEntries(fields.map(f => [f.key, '']));
    figmaSkipSaveRef.current = true;
    try {
      const saved = figmaDraftKey ? localStorage.getItem(figmaDraftKey) : null;
      const base = saved ? { ...blank, ...JSON.parse(saved) } : blank;
      // Absorb any pending Claude fill on top of the restored draft
      const fill = usePlatformStore.getState().pendingFill?.['figma'];
      setForm(fill ? { ...base, ...fill } : base);
      if (fill) clearPendingFill('figma');
    } catch { setForm(blank); }
    setImages({});
    setExportResult(null);
  }, [activeTemplate?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!figmaDraftKey || figmaSkipSaveRef.current) { figmaSkipSaveRef.current = false; return; }
    if (Object.keys(form).length === 0) return;
    try { localStorage.setItem(figmaDraftKey, JSON.stringify(form)); } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(form), figmaDraftKey]);

  async function saveToken() {
    if (!token.trim()) return;
    setSavingToken(true);
    try {
      const r = await window.creativePlatform.setFigmaToken(token.trim());
      if (r.ok) {
        setHasToken(true);
        setTokenMasked(token.slice(0, 6) + '…' + token.slice(-4));
        setToken('');
      }
    } finally { setSavingToken(false); }
  }

  async function testConnection() {
    setLoading('conn'); setConnResult(null);
    try {
      if (!activeTemplate) {
        setConnResult({ ok: false, message: 'No template selected — register a Figma file first.' }); return;
      }
      const fileKey = activeTemplate.figmaFileKey ?? activeTemplate.manifest?.figmaFileKey;
      if (!fileKey) {
        setConnResult({ ok: false, message: 'Template has no Figma file key.' }); return;
      }
      const r = await window.creativePlatform.getFigmaFileInfo(fileKey);
      setConnResult(r);
    } finally { setLoading(null); }
  }

  async function autoName() {
    const base = activeTemplate?.name?.replace(/\s+/g, '_').toUpperCase() || 'FIGMA_EXPORT';
    const r = await window.creativePlatform.suggestOutputName(base);
    if (r.ok) setOutputName(r.output_name);
  }

  async function runExport(format: 'png' | 'svg' | 'pdf') {
    if (!activeTemplate) return;
    setLoading(format); setExportResult(null);
    try {
      const fileKey  = activeTemplate.figmaFileKey  ?? activeTemplate.manifest?.figmaFileKey;
      const nodeId   = activeTemplate.figmaNodeId   ?? activeTemplate.manifest?.figmaNodeId;
      const figmaUrl = activeTemplate.figmaUrl      ?? activeTemplate.manifest?.figmaUrl;
      const r = await window.creativePlatform.runFigmaJob({
        templateId: activeTemplate.id,
        figmaFileKey: fileKey,
        figmaNodeId: nodeId,
        figmaUrl,
        content: buildJobContent(form),
        images: Object.fromEntries(Object.entries(images).filter(([, v]) => v.trim())),
        format,
        outputName: outputName || undefined,
        projectId: selectedProjectId || undefined,
      });
      setExportResult(r);
      if (r.ok && figmaDraftKey) try { localStorage.removeItem(figmaDraftKey); } catch {}
    } finally { setLoading(null); }
  }

  async function openInFigma() {
    const url = activeTemplate?.figmaUrl ?? activeTemplate?.manifest?.figmaUrl;
    if (url) await window.creativePlatform.openFigmaDesign?.(url);
  }

  const fields      = activeTemplate ? getManifestFields(activeTemplate) : FALLBACK_FIELDS;
  const imageFields = activeTemplate ? getManifestImageFields(activeTemplate) : [];
  const requiredKeys = fields.filter(f => f.required).map(f => f.key);
  const contentReady = requiredKeys.length === 0
    ? Object.values(form).some(v => v.trim())
    : requiredKeys.every(k => form[k]?.trim());
  const busy = loading !== null;
  const lineColor = (done: boolean) => done ? 'rgba(117,245,174,.4)' : 'var(--border-dim)';

  return (
    <div className="dashboard">

      {/* ── Panel 1: Engine identity + Template selection ── */}
      <section className="panel">
        <div className="engine-hdr">
          <Figma size={20} style={{ color: FIGMA_ACCENT, flexShrink: 0 }} />
          <div>
            <div className="engine-hdr-name">Figma</div>
            <div className="engine-hdr-desc">
              Design automation · export frames as PNG, SVG &amp; PDF · Variables API · MCP bridge
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexShrink: 0 }}>
            <button className="secondary" style={{ fontSize: 11, padding: '5px 10px' }}
              onClick={() => window.creativePlatform.openPath('outputs')}>
              <FolderOpen size={11} /> Open Outputs
            </button>
          </div>
        </div>

        {/* Template gallery */}
        <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em',
          color: 'var(--muted)', marginBottom: 10 }}>
          Figma Files
          {templates.length > 0 && (
            <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 6 }}>
              — {templates.length} registered
            </span>
          )}
        </p>
        {templates.length === 0 ? (
          <div className="empty" style={{ fontSize: 13 }}>
            No Figma files registered yet. Click <strong>+ Add Figma File</strong> below to connect one.
          </div>
        ) : (
          <div className="adobe-template-grid">
            {templates.map(t => (
              <TemplateCard key={t.id} template={t} selected={activeTemplate?.id === t.id}
                onSelect={() => setActiveTemplate(t)} />
            ))}
          </div>
        )}

        <AddFigmaTemplatePanel
          onAdded={t => {
            setTemplates(prev => [...prev.filter(x => x.id !== t.id), t]);
            setActiveTemplate(t);
          }}
          disabled={busy}
        />

        {/* Connection accordion */}
        <div className="conn-accordion" style={{ borderColor: 'rgba(162,89,255,.2)', marginTop: 14 }}>
          <button className="conn-accordion-hdr" onClick={() => setConnOpen(o => !o)}>
            {connOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            <span>Connection &amp; Token</span>
            <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400, marginLeft: 4 }}>
              Figma Personal Access Token
            </span>
            {hasToken && <CheckCircle2 size={13} style={{ color: 'var(--green)', marginLeft: 'auto' }} />}
          </button>
          {connOpen && (
            <div className="conn-accordion-body">
              <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
                A Personal Access Token (PAT) is required for exports and variable updates.
                Create one at <strong>figma.com → Settings → Personal access tokens</strong>.
                Enable scopes: <strong>File content</strong> and <strong>Variables</strong>.
              </p>
              {hasToken && tokenMasked && (
                <div style={{ fontSize: 12, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckCircle2 size={12} /> Token saved: <code>{tokenMasked}</code>
                </div>
              )}
              <div className="input-row">
                <input className="field-input" type="password" value={token}
                  onChange={e => setToken(e.target.value)}
                  placeholder={hasToken ? 'Enter new token to replace…' : 'figd_…'}
                  style={{ flex: 1 }} />
                <button onClick={saveToken} disabled={savingToken || !token.trim()}
                  style={{ fontSize: 12, padding: '8px 14px', background: FIGMA_ACCENT,
                    color: '#fff', border: 'none' }}>
                  {savingToken ? <RefreshCw size={12} className="spin" /> : 'Save'}
                </button>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button onClick={testConnection} disabled={busy || !activeTemplate}
                  style={{ fontSize: 12, padding: '7px 14px' }}>
                  {loading === 'conn' ? <RefreshCw size={12} className="spin" /> : <Figma size={12} />}
                  {loading === 'conn' ? 'Testing…' : 'Test Connection'}
                </button>
                <button className="secondary" style={{ fontSize: 12, padding: '7px 14px' }}
                  onClick={() => window.open('https://www.figma.com/settings', '_blank')}>
                  <ExternalLink size={11} /> Figma Settings
                </button>
              </div>
              {connResult && (
                connResult.ok ? (
                  <div className="result-ok" style={{ marginTop: 8 }}>
                    <strong><CheckCircle2 size={13} /> Connected</strong>
                    {connResult.name && <p style={{ margin: '4px 0 0', fontSize: 12 }}>File: {connResult.name}</p>}
                    {connResult.pageCount > 0 && (
                      <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--muted)' }}>
                        {connResult.pageCount} page{connResult.pageCount !== 1 ? 's' : ''} · {connResult.frameCount} frame{connResult.frameCount !== 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="result-error" style={{ marginTop: 8 }}>
                    <AlertTriangle size={13} /> {connResult.message || 'Connection failed'}
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── Panel 2: Content + Export ── */}
      <section className="panel">
        {/* Workflow steps */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20, paddingBottom: 16,
          borderBottom: '1px solid var(--line)' }}>
          <StepChip n={1} label="Template" done={!!activeTemplate} active={!activeTemplate} />
          <div style={{ flex: 1, height: 1, background: lineColor(!!activeTemplate), margin: '0 12px', minWidth: 20 }} />
          <StepChip n={2} label="Content" done={contentReady} active={!!activeTemplate && !contentReady} />
          <div style={{ flex: 1, height: 1, background: lineColor(contentReady), margin: '0 12px', minWidth: 20 }} />
          <StepChip n={3} label="Export" done={false} active={contentReady && !!activeTemplate} />
        </div>

        {/* Figma context / MCP bridge */}
        <FigmaContextPanel template={activeTemplate} disabled={busy} />

        {/* Claude brief */}
        <ClaudeBriefPanel
          fields={fields.map(f => ({ key: f.key, label: f.label, required: f.required, maxChars: f.maxChars }))}
          engine="figma"
          templateName={activeTemplate?.name}
          brandContext={activeBrand ? { name: activeBrand.name, description: activeBrand.description, guidelines: activeBrand.guidelines, industry: activeBrand.industry } : undefined}
          onFill={content => setForm(f => ({ ...f, ...content }))}
          disabled={busy}
        />

        {/* Content fields divider + copy button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, marginTop: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '.07em', color: 'var(--muted)' }}>
            Content Fields
          </span>
          <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
          <CopyContentButton fields={fields} form={form} templateName={activeTemplate?.name} />
        </div>

        {/* 2-col field grid */}
        <div className="fields-2col">
          {fields.map(f => (
            <div key={f.key} style={{
              gridColumn: (f.key.startsWith('STAT_') || (f.maxChars && f.maxChars <= 80)) ? 'auto' : '1/-1'
            }}>
              <CharLimitField
                fieldKey={f.key}
                label={f.label}
                required={f.required}
                rows={f.maxChars && f.maxChars > 200 ? 3 : 1}
                value={form[f.key] || ''}
                onChange={v => setForm(prev => ({ ...prev, [f.key]: v }))}
                maxChars={f.maxChars}
              />
            </div>
          ))}
        </div>

        {/* Image fields */}
        {imageFields.length > 0 && (
          <div className="images-section">
            <div className="images-section-header">
              <Image size={14} style={{ color: FIGMA_ACCENT }} />
              <span className="images-section-title">Images</span>
              <span className="images-section-hint">Image assets for the Figma template</span>
            </div>
            {imageFields.map(f => (
              <ImagePickerField key={f.key} label={f.label} fieldKey={f.key}
                value={images[f.key] || ''} onChange={v => setImages(prev => ({ ...prev, [f.key]: v }))} />
            ))}
          </div>
        )}

        {/* Firefly panel */}
        <FireflyPanel
          imageFields={imageFields}
          onImagePath={(k, p) => setImages(prev => ({ ...prev, [k]: p }))}
          disabled={busy}
        />

        {/* Export action bar */}
        <div style={{ marginTop: 20, paddingTop: 18, borderTop: '1px solid var(--line)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div className="field-group" style={{ marginBottom: 0 }}>
              <label>Output Name</label>
              <div className="input-row">
                <input className="field-input" value={outputName}
                  onChange={e => setOutputName(e.target.value)}
                  placeholder="e.g. Q1_Case_Study" />
                <button className="secondary" onClick={autoName} title="Auto-generate next version number">
                  Auto-Version
                </button>
              </div>
            </div>
            <div className="field-group" style={{ marginBottom: 0 }}>
              <Tooltip text="Link this export to a project record" display="block">
                <label>
                  Link to Project{' '}
                  <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                </label>
              </Tooltip>
              <select className="field-input" value={selectedProjectId}
                onChange={e => setSelectedProjectId(e.target.value)}>
                <option value="">— No project —</option>
                {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>

          {/* Presets */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
            <ContentPresets
              storageKey={`fields:figma:${activeTemplate?.id}`}
              content={form}
              onLoad={c => setForm(f => ({ ...f, ...c }))}
              disabled={loading !== null}
            />
          </div>

          {/* Preview + Export */}
          <button className="secondary" onClick={() => setPreviewOpen(true)} disabled={!activeTemplate}
            style={{ width: '100%', justifyContent: 'center', fontSize: 13, padding: '9px', marginBottom: 8 }}>
            👁 Preview Content
          </button>

          {/* PNG / SVG / PDF export buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
            {(['png', 'svg', 'pdf'] as const).map(fmt => (
              <button key={fmt} onClick={() => runExport(fmt)}
                disabled={busy || !activeTemplate}
                style={{ fontSize: 13, padding: '10px', justifyContent: 'center',
                  background: loading === fmt ? 'rgba(162,89,255,.15)' : 'rgba(162,89,255,.08)',
                  border: `1px solid rgba(162,89,255,.3)`,
                  color: loading === fmt ? FIGMA_ACCENT : 'var(--text)' }}>
                {loading === fmt
                  ? <><RefreshCw size={13} className="spin" /> Exporting…</>
                  : <><Download size={13} /> Export {fmt.toUpperCase()}</>
                }
              </button>
            ))}
          </div>

          {/* Open in Figma */}
          <button onClick={openInFigma} disabled={!activeTemplate}
            style={{ width: '100%', justifyContent: 'center', fontSize: 14, padding: '11px',
              background: 'transparent', border: `1.5px solid rgba(162,89,255,.4)`,
              color: FIGMA_ACCENT }}>
            <ExternalLink size={15} /> Open in Figma
          </button>

          {!contentReady && activeTemplate && requiredKeys.length > 0 && (
            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, textAlign: 'center' }}>
              Fill required fields to enable export.
            </p>
          )}
        </div>

        <ResultPanel result={exportResult} />
      </section>

      <ExportPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        onExport={() => runExport('png')}
        templateName={activeTemplate?.name}
        thumbnailUrl={thumbUrl}
        engine="figma"
        fields={fields.map((f: any) => ({
          key: f.key, label: f.label, value: form[f.key] ?? '', required: !!f.required,
          role: (
            f.key === 'HEADLINE' || f.key === 'TEXT_TITLE' ? 'title' :
            f.key === 'BODY_COPY' || f.key === 'TEXT_BODY' ? 'body' :
            f.key === 'CTA_TEXT' ? 'cta' :
            f.key === 'SUBHEADLINE' || f.key === 'TEXT_SUBTITLE' ? 'subheading' :
            f.key === 'URL' || f.key === 'WEBSITE' ? 'url' :
            'default'
          ) as any,
        }))}
        outputName={outputName}
        busy={loading !== null}
      />
    </div>
  );
}
