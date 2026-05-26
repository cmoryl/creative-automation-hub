import { useEffect, useRef, useState } from 'react';
import { usePlatformStore } from '../state/usePlatformStore';
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, FileSearch, FileText,
  FolderOpen, Image, Play, RefreshCw, Wand2, Zap, Plus, Trash2, GripVertical,
  BookOpen, BarChart2, MessageSquare, MousePointerClick, Layout,
} from 'lucide-react';
import { Tooltip } from '../components/Tooltip';
import { CharLimitField } from '../components/CharLimitField';
import { ImagePickerField } from '../components/ImagePickerField';
import { ClaudeBriefPanel } from '../components/ClaudeBriefPanel';
import { ExportPreviewModal } from '../components/ExportPreviewModal';
import type { PreviewField, PreviewPage } from '../components/ExportPreviewModal';
import { ContentPresets } from '../components/ContentPresets';

// ── Page types ─────────────────────────────────────────────────────────────────

type PageType = 'content' | 'stats' | 'quote' | 'cta' | 'image';

interface PageFieldDef {
  key: string;
  label: string;
  required: boolean;
  rows: number;
  maxChars: number;
  half?: boolean;
}

interface PageTypeDef {
  label: string;
  description: string;
  Icon: any;
  color: string;
  fields: PageFieldDef[];
}

const PAGE_TYPE_DEFS: Record<PageType, PageTypeDef> = {
  content: {
    label: 'Content Page',
    description: 'Heading + body copy — the workhorse of any report',
    Icon: BookOpen,
    color: 'var(--eng-canva)',
    fields: [
      { key: 'HEADING',    label: 'Section Heading', required: true,  rows: 1, maxChars: 100 },
      { key: 'SUBHEADING', label: 'Subheading',       required: false, rows: 1, maxChars: 160 },
      { key: 'BODY',       label: 'Body Copy',         required: true,  rows: 6, maxChars: 1400 },
    ],
  },
  stats: {
    label: 'Stats / Numbers',
    description: '3 key metrics with values and labels',
    Icon: BarChart2,
    color: '#75f5ae',
    fields: [
      { key: 'HEADING',      label: 'Section Heading', required: true,  rows: 1, maxChars: 100 },
      { key: 'STAT_01_VAL',  label: 'Stat 1 Value',    required: true,  rows: 1, maxChars: 30, half: true },
      { key: 'STAT_01_LBL',  label: 'Stat 1 Label',    required: true,  rows: 1, maxChars: 60, half: true },
      { key: 'STAT_02_VAL',  label: 'Stat 2 Value',    required: false, rows: 1, maxChars: 30, half: true },
      { key: 'STAT_02_LBL',  label: 'Stat 2 Label',    required: false, rows: 1, maxChars: 60, half: true },
      { key: 'STAT_03_VAL',  label: 'Stat 3 Value',    required: false, rows: 1, maxChars: 30, half: true },
      { key: 'STAT_03_LBL',  label: 'Stat 3 Label',    required: false, rows: 1, maxChars: 60, half: true },
      { key: 'FOOTNOTE',     label: 'Footnote / Source', required: false, rows: 1, maxChars: 200 },
    ],
  },
  quote: {
    label: 'Pull Quote',
    description: 'Large callout quote with attribution',
    Icon: MessageSquare,
    color: '#ffd76c',
    fields: [
      { key: 'QUOTE',         label: 'Quote Text',  required: true,  rows: 3, maxChars: 300 },
      { key: 'ATTRIBUTION',   label: 'Attribution', required: false, rows: 1, maxChars: 120 },
      { key: 'CONTEXT',       label: 'Context / Subtext', required: false, rows: 1, maxChars: 200 },
    ],
  },
  cta: {
    label: 'Call to Action',
    description: 'Conversion page — heading, body, button text',
    Icon: MousePointerClick,
    color: '#ff7262',
    fields: [
      { key: 'HEADING',  label: 'Heading',         required: true,  rows: 1, maxChars: 100 },
      { key: 'BODY',     label: 'Body',             required: false, rows: 3, maxChars: 400 },
      { key: 'CTA_TEXT', label: 'CTA Button Text',  required: true,  rows: 1, maxChars: 60 },
      { key: 'CTA_URL',  label: 'URL / Contact',    required: false, rows: 1, maxChars: 200 },
    ],
  },
  image: {
    label: 'Full-Bleed Image',
    description: 'Visual divider page with optional caption',
    Icon: Layout,
    color: '#c67dff',
    fields: [
      { key: 'CAPTION', label: 'Caption',    required: false, rows: 1, maxChars: 200 },
      { key: 'LABEL',   label: 'Page Label', required: false, rows: 1, maxChars: 60 },
    ],
  },
};

const COVER_FIELDS: PageFieldDef[] = [
  { key: 'DOC_TITLE',    label: 'Document Title',   required: true,  rows: 1, maxChars: 120 },
  { key: 'DOC_SUBTITLE', label: 'Subtitle',          required: false, rows: 1, maxChars: 180 },
  { key: 'DOC_AUTHOR',   label: 'Author / Company',  required: false, rows: 1, maxChars: 80, half: true },
  { key: 'DOC_DATE',     label: 'Date',              required: false, rows: 1, maxChars: 40, half: true },
  { key: 'DOC_INTRO',    label: 'Cover Intro / Tagline', required: false, rows: 2, maxChars: 300 },
];

interface InDesignPage {
  id: string;
  type: PageType;
  label: string;
  content: Record<string, string>;
}

function blankPage(type: PageType, label: string): InDesignPage {
  const fields = PAGE_TYPE_DEFS[type].fields;
  return {
    id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type,
    label,
    content: Object.fromEntries(fields.map(f => [f.key, ''])),
  };
}

const DEFAULT_PAGES: InDesignPage[] = [
  { id: 'p_exec', type: 'content', label: 'Executive Summary', content: { HEADING: 'Executive Summary', SUBHEADING: '', BODY: '' } },
  { id: 'p_body', type: 'content', label: 'Main Content',       content: { HEADING: '', SUBHEADING: '', BODY: '' } },
];

const BRIEF_FIELDS_FOR_CLAUDE = [
  { key: 'DOC_TITLE',    label: 'Title',            required: true,  maxChars: 120 },
  { key: 'DOC_SUBTITLE', label: 'Subtitle',          required: false, maxChars: 180 },
  { key: 'DOC_AUTHOR',   label: 'Author / Company',  required: false, maxChars: 80 },
  { key: 'DOC_DATE',     label: 'Date',              required: false, maxChars: 40 },
  { key: 'DOC_INTRO',    label: 'Cover Intro',        required: false, maxChars: 300 },
  // first page fields flattened
  { key: 'HEADING',      label: 'Section Heading',   required: true,  maxChars: 100 },
  { key: 'BODY',         label: 'Body Copy',          required: true,  maxChars: 1400 },
  { key: 'STAT_01_VAL',  label: 'Stat 1 Value',       required: false, maxChars: 30 },
  { key: 'STAT_01_LBL',  label: 'Stat 1 Label',       required: false, maxChars: 60 },
  { key: 'STAT_02_VAL',  label: 'Stat 2 Value',       required: false, maxChars: 30 },
  { key: 'STAT_02_LBL',  label: 'Stat 2 Label',       required: false, maxChars: 60 },
  { key: 'STAT_03_VAL',  label: 'Stat 3 Value',       required: false, maxChars: 30 },
  { key: 'STAT_03_LBL',  label: 'Stat 3 Label',       required: false, maxChars: 60 },
  { key: 'CTA_TEXT',     label: 'CTA Button Text',    required: false, maxChars: 60 },
];

// ── Small helpers ──────────────────────────────────────────────────────────────

function ResultPanel({ result, latestOutput }: { result: any; latestOutput?: any }) {
  if (!result) return null;
  if (result.ok) return (
    <div className="result-ok">
      <strong><CheckCircle2 size={15} /> Success</strong>
      {result.stdout && <pre className="result-log">{result.stdout.slice(0, 3000)}</pre>}
      {latestOutput && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Output: <code>{latestOutput.name}</code></span>
          {latestOutput.path && (
            <button className="secondary" style={{ fontSize: 11, padding: '4px 10px' }}
              onClick={() => window.creativePlatform.openFile(latestOutput.path)}>
              <FileText size={11} /> Open
            </button>
          )}
          <button className="secondary" style={{ fontSize: 11, padding: '4px 10px' }}
            onClick={() => window.creativePlatform.openPath('outputs')}>
            <FolderOpen size={11} /> Reveal
          </button>
        </div>
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
      <p>{result.userMessage || result.error}</p>
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
      {result.technical && (
        <details><summary>Technical detail</summary>
          <pre className="result-log">{result.technical}</pre>
        </details>
      )}
    </div>
  );
}

function StepChip({ n, label, done, active }: { n: number; label: string; done: boolean; active: boolean }) {
  const color = done ? 'var(--green)' : active ? 'var(--accent)' : 'var(--border-mid)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600,
      color: active ? 'var(--text)' : color, whiteSpace: 'nowrap' }}>
      <div style={{
        width: 22, height: 22, borderRadius: '50%', display: 'grid', placeItems: 'center',
        fontSize: 11, fontWeight: 900, border: `1.5px solid ${color}`, color,
        background: done ? 'rgba(117,245,174,.12)' : active ? 'rgba(103,216,255,.12)' : 'transparent',
      }}>{done ? '✓' : n}</div>
      {label}
    </div>
  );
}

function TemplateCard({ template, selected, onSelect }: { template: any; selected: boolean; onSelect: () => void }) {
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => {
    window.creativePlatform.getTemplateThumbnail(template.id).then((r: any) => {
      if (r?.ok && r.thumbnailUrl) setThumb(r.thumbnailUrl);
    });
  }, [template.id]);

  const health      = template.healthScore ?? 100;
  const healthColor = health >= 90 ? 'var(--green)' : health >= 50 ? 'var(--yellow)' : 'var(--red)';
  const healthLabel = health >= 90 ? 'Healthy' : health >= 50 ? 'Partial' : 'Issues';

  return (
    <button
      className={`doc-template-card${selected ? ' selected' : ''}`}
      onClick={onSelect}
      title={`${template.name}${template.dimensions ? ` — ${template.dimensions}` : ''}`}
    >
      {/* Thumbnail */}
      <div className="doc-template-thumb">
        {thumb
          ? <img src={thumb} alt={template.name} />
          : <>
              <FileText size={32} className="doc-template-placeholder-icon" />
              <span className="doc-template-placeholder-label">
                {template.dimensions || 'No preview'}
              </span>
            </>}
        {/* Dimension pill — only when thumbnail is loaded (otherwise shown in placeholder) */}
        {thumb && template.dimensions && (
          <span className="doc-template-dim">{template.dimensions}</span>
        )}
      </div>

      {/* Info strip */}
      <div className="doc-template-info">
        <div className="doc-template-name" title={template.name}>
          {template.name}
        </div>
        <div className="doc-template-health">
          <div className="doc-template-health-bar">
            <div className="doc-template-health-fill"
              style={{ width: `${health}%`, background: healthColor }} />
          </div>
          <span className="doc-template-health-label" style={{ color: healthColor }}>
            {healthLabel}
          </span>
        </div>
      </div>

      {selected && <div className="doc-template-selected-ring" />}
    </button>
  );
}

// ── Firefly panel ──────────────────────────────────────────────────────────────
function FireflyPanel({
  imageFields, onImagePath, disabled,
}: { imageFields: { key: string; label: string }[]; onImagePath: (k: string, p: string) => void; disabled: boolean }) {
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
      if (r.ok) setResult(r);
      else if (r.noCredentials) setNoCredentials(true);
      else setResult(r);
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
            placeholder="Describe the image… e.g. 'Corporate headquarters, aerial view, golden hour'" disabled={loading} />
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
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                {imageFields.map(f => (
                  <button key={f.key} className="secondary" style={{ fontSize: 11, padding: '5px 10px' }}
                    onClick={() => onImagePath(f.key, result.localPath || result.imagePath)}>
                    Use as {f.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page tab strip ─────────────────────────────────────────────────────────────
function PageTab({
  label, type, index, active, complete, onSelect, onRemove, isOnly,
}: {
  label: string; type: PageType | 'cover'; index: number;
  active: boolean; complete: boolean; onSelect: () => void; onRemove?: () => void; isOnly: boolean;
}) {
  const isCover = type === 'cover';
  const def = isCover ? null : PAGE_TYPE_DEFS[type as PageType];
  const color = isCover ? 'var(--eng-canva)' : def!.color;
  const Icon  = isCover ? FileText : def!.Icon;

  return (
    <button
      onClick={onSelect}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px',
        borderRadius: 8, border: active ? `1.5px solid ${color}` : '1.5px solid var(--line)',
        background: active ? `${color}12` : 'var(--panel)',
        cursor: 'pointer', flexShrink: 0, position: 'relative',
        transition: 'all .15s',
      }}
    >
      <Icon size={13} style={{ color: active ? color : 'var(--muted)', flexShrink: 0 }} />
      <span style={{ fontSize: 12, fontWeight: 600, color: active ? 'var(--text)' : 'var(--muted)', whiteSpace: 'nowrap' }}>
        {isCover ? 'Cover' : label}
      </span>
      {complete && !isCover && (
        <span style={{ fontSize: 9, color: 'var(--green)', fontWeight: 800 }}>✓</span>
      )}
      {!isCover && !isOnly && (
        <span
          onClick={e => { e.stopPropagation(); onRemove?.(); }}
          title="Remove page"
          style={{
            marginLeft: 2, color: 'var(--muted)', cursor: 'pointer', lineHeight: 1,
            fontSize: 13, opacity: .5, transition: 'opacity .1s',
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '.5')}
        >×</span>
      )}
    </button>
  );
}

// ── Add-page picker ────────────────────────────────────────────────────────────
function AddPagePicker({ onAdd }: { onAdd: (type: PageType, label: string) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="secondary"
        style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '6px 12px' }}
      >
        <Plus size={12} /> Add Page
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 100,
          background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10,
          padding: 6, width: 230, boxShadow: '0 8px 32px rgba(0,0,0,.4)',
        }}>
          {(Object.entries(PAGE_TYPE_DEFS) as [PageType, PageTypeDef][]).map(([type, def]) => {
            const { Icon } = def;
            return (
              <button key={type} className="secondary"
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 10px',
                  width: '100%', textAlign: 'left', borderRadius: 7, border: 'none',
                  marginBottom: 2,
                }}
                onClick={() => { onAdd(type, def.label); setOpen(false); }}
              >
                <Icon size={15} style={{ color: def.color, marginTop: 1, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{def.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.4, marginTop: 1 }}>{def.description}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Per-page field editor ──────────────────────────────────────────────────────
function PageEditor({
  page,
  onChange,
  onLabelChange,
}: {
  page: InDesignPage;
  onChange: (key: string, value: string) => void;
  onLabelChange: (label: string) => void;
}) {
  const def = PAGE_TYPE_DEFS[page.type];
  const { Icon } = def;

  return (
    <div>
      {/* Page label editor */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16,
        padding: '10px 14px', background: `${def.color}08`, borderRadius: 8,
        border: `1px solid ${def.color}22` }}>
        <Icon size={14} style={{ color: def.color, flexShrink: 0 }} />
        <input
          className="field-input"
          value={page.label}
          onChange={e => onLabelChange(e.target.value)}
          placeholder="Page name…"
          style={{ flex: 1, margin: 0, fontSize: 13, fontWeight: 600, background: 'transparent', border: 'none',
            padding: '2px 0', color: 'var(--text)' }}
        />
        <span style={{ fontSize: 11, color: def.color, fontWeight: 600, flexShrink: 0 }}>{def.label}</span>
      </div>

      {/* Fields */}
      <div className="fields-2col">
        {def.fields.map(f => (
          <div key={f.key} style={{ gridColumn: f.half ? 'auto' : '1 / -1' }}>
            <CharLimitField
              fieldKey={f.key}
              label={f.label}
              required={f.required}
              rows={f.rows}
              value={page.content[f.key] ?? ''}
              onChange={v => onChange(f.key, v)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Cover editor ───────────────────────────────────────────────────────────────
function CoverEditor({
  content, onChange,
}: { content: Record<string, string>; onChange: (key: string, value: string) => void }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16,
        padding: '10px 14px', background: 'rgba(103,216,255,.05)', borderRadius: 8,
        border: '1px solid rgba(103,216,255,.15)' }}>
        <FileText size={14} style={{ color: 'var(--eng-canva)', flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Cover Page</span>
        <span style={{ fontSize: 11, color: 'var(--eng-canva)', fontWeight: 600, marginLeft: 'auto' }}>Always first</span>
      </div>
      <div className="fields-2col">
        {COVER_FIELDS.map(f => (
          <div key={f.key} style={{ gridColumn: f.half ? 'auto' : '1 / -1' }}>
            <CharLimitField
              fieldKey={f.key} label={f.label} required={f.required} rows={f.rows}
              value={content[f.key] ?? ''}
              onChange={v => onChange(f.key, v)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────
export function InDesignScreen() {
  const activeBrand    = usePlatformStore(s => s.activeBrand);
  const pendingFill    = usePlatformStore(s => s.pendingFill?.['indesign']);
  const clearPendingFill = usePlatformStore(s => s.clearPendingFill);

  const [templates, setTemplates]         = useState<any[]>([]);
  const [activeTemplate, setActiveTemplate] = useState('');
  const [connOpen, setConnOpen]           = useState(false);
  const [preflightResult, setPreflightResult] = useState<any>(null);
  const [exampleResult, setExampleResult] = useState<any>(null);
  const [exportResult, setExportResult]   = useState<any>(null);
  const [latestOutput, setLatestOutput]   = useState<any>(null);
  const [loading, setLoading]             = useState<string | null>(null);
  const [projects, setProjects]           = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [outputName, setOutputName]       = useState('');
  const [previewOpen, setPreviewOpen]     = useState(false);
  const [thumbUrl, setThumbUrl]           = useState<string | null>(null);

  // Cover content
  const [cover, setCover] = useState<Record<string, string>>(
    Object.fromEntries(COVER_FIELDS.map(f => [f.key, '']))
  );

  // Pages
  const [pages, setPages]           = useState<InDesignPage[]>(DEFAULT_PAGES.map(p => ({ ...p, content: { ...p.content } })));
  const [activePageId, setActivePageId] = useState<string>('cover');

  // Images
  const [images, setImages] = useState<Record<string, string>>({ IMAGE_HERO: '', IMAGE_FIGURE_01: '' });

  // Draft persistence
  const draftKey = activeTemplate ? `draft:indesign:${activeTemplate}` : null;
  const skipSaveRef = useRef(false);

  useEffect(() => {
    if (!draftKey) return;
    skipSaveRef.current = true;
    try {
      const saved = localStorage.getItem(draftKey);
      let newCover = Object.fromEntries(COVER_FIELDS.map(f => [f.key, '']));
      let newPages = DEFAULT_PAGES.map(p => ({ ...p, content: { ...p.content } }));
      if (saved) {
        const { cover: sc, pages: sp } = JSON.parse(saved);
        if (sc) newCover = { ...newCover, ...sc };
        if (sp) newPages = sp;
      }
      // Absorb any pending Claude fill on top of the draft
      const fill = usePlatformStore.getState().pendingFill?.['indesign'];
      if (fill) {
        const coverKeys = new Set(COVER_FIELDS.map(f => f.key));
        const remaining: Record<string, string> = {};
        for (const [k, v] of Object.entries(fill)) {
          if (coverKeys.has(k)) newCover[k] = v as string;
          else remaining[k] = v as string;
        }
        if (Object.keys(remaining).length > 0) {
          newPages = newPages.map((p, i) => i === 0 ? { ...p, content: { ...p.content, ...remaining } } : p);
        }
        clearPendingFill('indesign');
      }
      setCover(newCover);
      setPages(newPages);
    } catch {}
  }, [draftKey]);

  useEffect(() => {
    if (!draftKey || skipSaveRef.current) { skipSaveRef.current = false; return; }
    try { localStorage.setItem(draftKey, JSON.stringify({ cover, pages })); } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(cover), JSON.stringify(pages), draftKey]);

  // Pending fill from Claude chat — fires when fill arrives after template is already loaded
  useEffect(() => {
    if (!pendingFill) return;
    const coverKeys = new Set(COVER_FIELDS.map(f => f.key));
    const newCover: Record<string, string> = {};
    const remaining: Record<string, string> = {};
    for (const [k, v] of Object.entries(pendingFill)) {
      if (coverKeys.has(k)) newCover[k] = v as string;
      else remaining[k] = v as string;
    }
    if (Object.keys(newCover).length > 0) setCover(c => ({ ...c, ...newCover }));
    if (Object.keys(remaining).length > 0) {
      setPages(ps => ps.map((p, i) => i === 0 ? { ...p, content: { ...p.content, ...remaining } } : p));
    }
    clearPendingFill('indesign');
  }, [pendingFill]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch thumbnail when active template changes
  useEffect(() => {
    if (!activeTemplate) return;
    setThumbUrl(null);
    window.creativePlatform.getTemplateThumbnail(activeTemplate).then((r: any) => {
      if (r?.ok && r.thumbnailUrl) setThumbUrl(r.thumbnailUrl);
    });
  }, [activeTemplate]);

  // Load templates + projects
  useEffect(() => {
    window.creativePlatform.listProjects().then((p: any[]) => setProjects(p || []));
    window.creativePlatform.listTemplates().then((all: any[]) => {
      const id = (all || []).filter((t: any) => t.engine === 'indesign' && !t.isCanva && !t.isAdobeExpress);
      setTemplates(id);
      if (id.length > 0) {
        const brandTid = usePlatformStore.getState().activeBrand?.templates?.indesign;
        const preferred = brandTid ? id.find((t: any) => t.id === brandTid) : null;
        const initial = preferred || id[0];
        setActiveTemplate(initial.id);
      }
    });
  }, []);

  useEffect(() => {
    if (!activeBrand?.templates?.indesign || templates.length === 0) return;
    const match = templates.find((t: any) => t.id === activeBrand.templates.indesign);
    if (match) setActiveTemplate(match.id);
  }, [activeBrand?.id]);

  const busy = loading !== null;
  const coverReady = !!(cover.DOC_TITLE?.trim());
  const pagesReady = pages.some(p => {
    const def = PAGE_TYPE_DEFS[p.type];
    return def.fields.filter(f => f.required).every(f => p.content[f.key]?.trim());
  });
  const contentReady = coverReady && pagesReady;

  async function fetchLatest(projectId?: string) {
    const outputs = await window.creativePlatform.listOutputs();
    if (!outputs?.length) return;
    const latest = outputs[0];
    setLatestOutput(latest);
    if (projectId) {
      await window.creativePlatform.linkOutputToProject(projectId, {
        path: latest.path, name: latest.name, type: latest.type, engine: latest.engine,
      });
    }
  }

  async function runPreflight() {
    setLoading('preflight'); setPreflightResult(null);
    try {
      const r = await window.creativePlatform.runInDesignPreflight(activeTemplate || undefined);
      setPreflightResult(r);
      // Preflight produces no output file — do NOT call fetchLatest here
    } finally { setLoading(null); }
  }

  async function runExample() {
    setLoading('example'); setExampleResult(null);
    try {
      const r = await window.creativePlatform.runInDesignExample(activeTemplate || undefined);
      setExampleResult(r);
      if (r.ok) fetchLatest();
    } finally { setLoading(null); }
  }

  async function autoName() {
    const tmpl = templates.find((t: any) => t.id === activeTemplate);
    const base = tmpl ? (tmpl.name || tmpl.id).replace(/\s+/g, '_').toUpperCase() : 'INDESIGN_DOC';
    const r = await window.creativePlatform.suggestOutputName(base);
    if (r.ok) setOutputName(r.output_name);
  }

  // Serialise pages → flat content object for the InDesign job
  function buildContent(): Record<string, string> {
    const content: Record<string, string> = { ...cover };
    // Legacy field aliases for backward compat with existing ExtendScripts
    content['DOC_TITLE']    = cover.DOC_TITLE    ?? '';
    content['DOC_SUBTITLE'] = cover.DOC_SUBTITLE ?? '';
    content['DOC_AUTHOR']   = cover.DOC_AUTHOR   ?? '';
    content['DOC_DATE']     = cover.DOC_DATE     ?? '';
    // Page count
    content['PAGE_COUNT']   = String(pages.length);
    pages.forEach((page, i) => {
      const n = String(i + 1).padStart(2, '0');
      content[`PAGE_${n}_TYPE`]  = page.type;
      content[`PAGE_${n}_LABEL`] = page.label;
      for (const [k, v] of Object.entries(page.content)) {
        content[`PAGE_${n}_${k}`] = v;
      }
      // Convenience aliases for the first content page
      if (i === 0) {
        for (const [k, v] of Object.entries(page.content)) {
          if (!content[k]) content[k] = v;
        }
      }
    });
    // Legacy frame-name aliases — the .indd template uses these frame names.
    // SECTION_EXECUTIVE_SUMMARY ← first page body; SECTION_BODY ← remaining pages joined.
    if (!content['SECTION_EXECUTIVE_SUMMARY']) {
      content['SECTION_EXECUTIVE_SUMMARY'] = pages[0]?.content?.BODY ?? pages[0]?.content?.HEADING ?? '';
    }
    if (!content['SECTION_BODY']) {
      content['SECTION_BODY'] = pages.slice(1)
        .map(p => [p.content.HEADING, p.content.BODY].filter(Boolean).join('\n\n'))
        .filter(Boolean)
        .join('\n\n') || pages[0]?.content?.BODY || '';
    }
    return content;
  }

  async function runExport() {
    setLoading('custom'); setExportResult(null);
    try {
      const imagePayload: Record<string, string> = {};
      for (const [k, v] of Object.entries(images)) { if (v.trim()) imagePayload[k] = v.trim(); }
      const job: any = {
        output_name: outputName,
        template: activeTemplate,
        content: buildContent(),
      };
      if (Object.keys(imagePayload).length > 0) job.images = imagePayload;
      const r = await window.creativePlatform.runInDesignCustom(job);
      setExportResult(r);
      if (r.ok) {
        fetchLatest(selectedProjectId || undefined);
        if (draftKey) try { localStorage.removeItem(draftKey); } catch {}
      }
    } finally { setLoading(null); }
  }

  // Pages helpers
  function addPage(type: PageType, label: string) {
    const page = blankPage(type, label);
    setPages(ps => [...ps, page]);
    setActivePageId(page.id);
  }

  function removePage(id: string) {
    setPages(ps => ps.filter(p => p.id !== id));
    setActivePageId(prev => {
      if (prev !== id) return prev;
      const remaining = pages.filter(p => p.id !== id);
      return remaining.length > 0 ? remaining[remaining.length - 1].id : 'cover';
    });
  }

  function updatePageContent(id: string, key: string, value: string) {
    setPages(ps => ps.map(p => p.id === id ? { ...p, content: { ...p.content, [key]: value } } : p));
  }

  function updatePageLabel(id: string, label: string) {
    setPages(ps => ps.map(p => p.id === id ? { ...p, label } : p));
  }

  function isPageComplete(page: InDesignPage) {
    return PAGE_TYPE_DEFS[page.type].fields.filter(f => f.required).every(f => page.content[f.key]?.trim());
  }

  // Build preview pages for the ExportPreviewModal
  function buildPreviewPages(): PreviewPage[] {
    const roleMap: Record<string, string> = {
      HEADING: 'heading', SUBHEADING: 'subheading', BODY: 'body',
      STAT_01_VAL: 'stat-val', STAT_01_LBL: 'stat-lbl',
      STAT_02_VAL: 'stat-val', STAT_02_LBL: 'stat-lbl',
      STAT_03_VAL: 'stat-val', STAT_03_LBL: 'stat-lbl',
      QUOTE: 'quote', CTA_TEXT: 'cta', CTA_URL: 'url',
      CAPTION: 'default', LABEL: 'tag', FOOTNOTE: 'default',
      ATTRIBUTION: 'default', CONTEXT: 'default',
    };
    const coverPage: PreviewPage = {
      id: 'cover', label: 'Cover', typeLabel: 'Cover Page', color: 'var(--eng-canva)', Icon: FileText,
      fields: COVER_FIELDS.map(f => ({
        key: f.key, label: f.label, value: cover[f.key] ?? '', required: f.required,
        role: (f.key === 'DOC_TITLE' ? 'title' : f.key === 'DOC_SUBTITLE' ? 'subheading' : 'default') as any,
      })),
    };
    const contentPages: PreviewPage[] = pages.map(p => {
      const def = PAGE_TYPE_DEFS[p.type];
      return {
        id: p.id, label: p.label, typeLabel: def.label, color: def.color, Icon: def.Icon,
        fields: def.fields.map(f => ({
          key: f.key, label: f.label, value: p.content[f.key] ?? '', required: f.required,
          role: (roleMap[f.key] ?? 'default') as any,
        })),
      };
    });
    return [coverPage, ...contentPages];
  }

  const lineColor = (done: boolean) => done ? 'rgba(117,245,174,.4)' : 'var(--border-dim)';
  const activePage = pages.find(p => p.id === activePageId);

  // Claude brief: distribute filled fields across cover + first content page
  function handleClaudeFill(filled: Record<string, string>) {
    const coverKeys = new Set(COVER_FIELDS.map(f => f.key));
    const newCover: Record<string, string> = { ...cover };
    const remaining: Record<string, string> = {};
    for (const [k, v] of Object.entries(filled)) {
      if (coverKeys.has(k)) newCover[k] = v;
      else remaining[k] = v;
    }
    setCover(newCover);
    if (Object.keys(remaining).length > 0) {
      setPages(ps => ps.map((p, i) => i === 0 ? { ...p, content: { ...p.content, ...remaining } } : p));
    }
  }

  return (
    <div className="dashboard">

      {/* ── Panel 1: Engine + Template ── */}
      <section className="panel">
        <div className="engine-hdr">
          <FileText size={20} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <div>
            <div className="engine-hdr-name">Adobe InDesign</div>
            <div className="engine-hdr-desc">Multi-page document automation · exports INDD, PDF, and PNG</div>
          </div>
          <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexShrink: 0 }}>
            <button className="secondary" style={{ fontSize: 11, padding: '5px 10px' }}
              title="Open System Settings → Automation to grant macOS permission"
              onClick={() => window.creativePlatform.openPath('automation')}>
              macOS Permissions
            </button>
            <button className="secondary" style={{ fontSize: 11, padding: '5px 10px' }}
              onClick={() => window.creativePlatform.openPath('outputs')}>
              <FolderOpen size={11} /> Open Outputs
            </button>
          </div>
        </div>

        {/* Connection status */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', borderRadius: 8, marginBottom: 14,
          background: preflightResult?.ok ? 'rgba(117,245,174,.06)' : 'rgba(255,215,108,.05)',
          border: `1px solid ${preflightResult?.ok ? 'rgba(117,245,174,.2)' : 'rgba(255,215,108,.18)'}`,
        }}>
          {preflightResult?.ok ? (
            <><CheckCircle2 size={13} style={{ color: 'var(--green)', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>InDesign connected and ready</span></>
          ) : (
            <><Zap size={13} style={{ color: 'var(--yellow)', flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--yellow)' }}>Connection not verified</span>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>— confirm InDesign is running and accessible</span>
              <button onClick={() => { setConnOpen(true); runPreflight(); }} disabled={busy}
                style={{ marginLeft: 'auto', fontSize: 11, padding: '5px 12px', flexShrink: 0 }}>
                {loading === 'preflight'
                  ? <><RefreshCw size={11} className="spin" /> Checking…</>
                  : <>Verify connection →</>}
              </button></>
          )}
        </div>

        {/* Template gallery */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--muted)' }}>
            Templates
          </span>
          {templates.length > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
              background: 'var(--surface-mid)', color: 'var(--muted)',
              border: '1px solid var(--border-subtle)',
            }}>
              {templates.length} registered
            </span>
          )}
        </div>
        {templates.length === 0 ? (
          <div className="empty" style={{ fontSize: 13 }}>
            No InDesign templates registered. Go to <strong>Templates → Upload Template</strong> to add one.
          </div>
        ) : (
          <div className="doc-template-grid">
            {templates.map(t => (
              <TemplateCard key={t.id} template={t} selected={activeTemplate === t.id}
                onSelect={() => { setActiveTemplate(t.id); setPreflightResult(null); setExampleResult(null); setExportResult(null); }} />
            ))}
          </div>
        )}

        {/* Connection testing */}
        <div className="conn-accordion">
          <button className="conn-accordion-hdr" onClick={() => setConnOpen(o => !o)}>
            {connOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            <span>Connection Testing</span>
            <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400, marginLeft: 4 }}>Preflight · Example Export</span>
            {(preflightResult?.ok || exampleResult?.ok) && <CheckCircle2 size={13} style={{ color: 'var(--green)', marginLeft: 'auto' }} />}
          </button>
          {connOpen && (
            <div className="conn-accordion-body">
              <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
                Run Preflight to verify InDesign responds and the template has all required text frames.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={runPreflight} disabled={busy || !activeTemplate} style={{ fontSize: 12, padding: '8px 16px' }}>
                  {loading === 'preflight' ? <RefreshCw size={13} className="spin" /> : <FileSearch size={13} />}
                  {loading === 'preflight' ? 'Running…' : 'Run Preflight'}
                </button>
                <button onClick={runExample} disabled={busy || !activeTemplate} style={{ fontSize: 12, padding: '8px 16px' }}>
                  {loading === 'example' ? <RefreshCw size={13} className="spin" /> : <Play size={13} />}
                  {loading === 'example' ? 'Exporting…' : 'Example Export'}
                </button>
              </div>
              {preflightResult && <ResultPanel result={preflightResult} latestOutput={latestOutput} />}
              {exampleResult && <ResultPanel result={exampleResult} latestOutput={latestOutput} />}
            </div>
          )}
        </div>
      </section>

      {/* ── Panel 2: Multi-page document builder ── */}
      <section className="panel">

        {/* Step bar */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20, paddingBottom: 16,
          borderBottom: '1px solid var(--line)' }}>
          <StepChip n={1} label="Template" done={!!activeTemplate} active={!activeTemplate} />
          <div style={{ flex: 1, height: 1, background: lineColor(!!activeTemplate), margin: '0 12px', minWidth: 20 }} />
          <StepChip n={2} label="Pages" done={contentReady} active={!!activeTemplate && !contentReady} />
          <div style={{ flex: 1, height: 1, background: lineColor(contentReady), margin: '0 12px', minWidth: 20 }} />
          <StepChip n={3} label="Export" done={false} active={contentReady && !!activeTemplate} />
        </div>

        {/* Claude brief */}
        <ClaudeBriefPanel
          fields={BRIEF_FIELDS_FOR_CLAUDE}
          engine="indesign"
          templateName={templates.find(t => t.id === activeTemplate)?.name}
          brandContext={activeBrand ? { name: activeBrand.name, description: activeBrand.description, guidelines: activeBrand.guidelines, industry: activeBrand.industry } : undefined}
          onFill={handleClaudeFill}
          disabled={busy}
        />

        {/* ── Page navigator ── */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <GripVertical size={13} style={{ color: 'var(--muted)' }} />
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--muted)' }}>
                Document Pages
              </span>
              <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>
                — {1 + pages.length} page{pages.length !== 0 ? 's' : ''}
              </span>
            </div>
            <AddPagePicker onAdd={addPage} />
          </div>

          {/* Tab strip */}
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
            {/* Cover tab */}
            <PageTab
              label="Cover" type="cover" index={0}
              active={activePageId === 'cover'}
              complete={coverReady}
              onSelect={() => setActivePageId('cover')}
              isOnly={false}
            />
            {/* Content page tabs */}
            {pages.map((page, i) => (
              <PageTab
                key={page.id}
                label={page.label || PAGE_TYPE_DEFS[page.type].label}
                type={page.type} index={i + 1}
                active={activePageId === page.id}
                complete={isPageComplete(page)}
                onSelect={() => setActivePageId(page.id)}
                onRemove={() => removePage(page.id)}
                isOnly={pages.length === 1}
              />
            ))}
          </div>
        </div>

        {/* Active page editor */}
        <div style={{ padding: '16px 0', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)', marginBottom: 16 }}>
          {activePageId === 'cover' ? (
            <CoverEditor content={cover} onChange={(k, v) => setCover(c => ({ ...c, [k]: v }))} />
          ) : activePage ? (
            <PageEditor
              page={activePage}
              onChange={(k, v) => updatePageContent(activePage.id, k, v)}
              onLabelChange={label => updatePageLabel(activePage.id, label)}
            />
          ) : null}
        </div>

        {/* Images (always shown) */}
        <div className="images-section">
          <div className="images-section-header">
            <Image size={14} style={{ color: 'var(--accent)' }} />
            <span className="images-section-title">Photography / Images</span>
            <span className="images-section-hint">Replaces placed image frames in the InDesign template</span>
          </div>
          <ImagePickerField label="Hero Image" fieldKey="IMAGE_HERO"
            value={images.IMAGE_HERO} onChange={v => setImages(p => ({ ...p, IMAGE_HERO: v }))} />
          <ImagePickerField label="Figure 1" fieldKey="IMAGE_FIGURE_01"
            value={images.IMAGE_FIGURE_01} onChange={v => setImages(p => ({ ...p, IMAGE_FIGURE_01: v }))} />
          <FireflyPanel
            imageFields={[
              { key: 'IMAGE_HERO',      label: 'Hero Image' },
              { key: 'IMAGE_FIGURE_01', label: 'Figure 1' },
            ]}
            onImagePath={(key, path) => setImages(p => ({ ...p, [key]: path }))}
            disabled={busy}
          />
        </div>

        {/* Export action bar */}
        <div style={{ marginTop: 20, paddingTop: 18, borderTop: '1px solid var(--line)' }}>
          {/* Document presets */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <ContentPresets
              storageKey={`doc:indesign:${activeTemplate}`}
              content={{ cover, pages }}
              onLoad={saved => { if (saved?.cover) setCover(saved.cover); if (saved?.pages) setPages(saved.pages); }}
              disabled={busy}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div className="field-group" style={{ marginBottom: 0 }}>
              <label>Output Name</label>
              <div className="input-row">
                <input className="field-input" value={outputName}
                  onChange={e => setOutputName(e.target.value)}
                  placeholder="e.g. TPLS_Whitepaper" />
                <button className="secondary" onClick={autoName} title="Auto-generate next version number">
                  Auto-Version
                </button>
              </div>
            </div>
            <div className="field-group" style={{ marginBottom: 0 }}>
              <Tooltip text="Link this export to a project record in the Projects screen" display="block">
                <label>Link to Project <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
              </Tooltip>
              <select className="field-input" value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)}>
                <option value="">— No project —</option>
                {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>

          {/* Page count summary */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>
              Document: Cover +{' '}
              {pages.map(p => PAGE_TYPE_DEFS[p.type].label).join(', ') || 'no pages'}
              {' '}→ {1 + pages.length} pages total
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setPreviewOpen(true)} disabled={busy || !activeTemplate}
              className="secondary"
              style={{ fontSize: 13, padding: '11px 18px', whiteSpace: 'nowrap' }}>
              👁 Preview
            </button>
            <button onClick={runExport} disabled={busy || !activeTemplate || !contentReady}
              style={{ fontSize: 14, padding: '11px 28px', flex: 1, justifyContent: 'center' }}>
              {loading === 'custom' ? <RefreshCw size={15} className="spin" /> : <Zap size={15} />}
              {loading === 'custom' ? 'Exporting…' : `Export ${1 + pages.length}-Page Document  ·  INDD · PDF · PNG`}
            </button>
          </div>
          {!contentReady && activeTemplate && (
            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, textAlign: 'center' }}>
              Fill the Cover title and at least one content page to enable export.
            </p>
          )}
        </div>

        <ResultPanel result={exportResult} latestOutput={latestOutput} />
      </section>

      <ExportPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        onExport={runExport}
        templateName={templates.find(t => t.id === activeTemplate)?.name}
        thumbnailUrl={thumbUrl}
        engine="indesign"
        pages={buildPreviewPages()}
        outputName={outputName}
        busy={busy}
      />
    </div>
  );
}
