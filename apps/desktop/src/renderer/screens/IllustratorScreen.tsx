import { useEffect, useRef, useState } from 'react';
import { usePlatformStore } from '../state/usePlatformStore';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, FileImage, FileSearch, FolderOpen, Image, Play, RefreshCw, Wand2, Zap } from 'lucide-react';
import { Tooltip } from '../components/Tooltip';
import { CharLimitField, DEFAULT_CHAR_LIMITS } from '../components/CharLimitField';
import { ImagePickerField } from '../components/ImagePickerField';
import { ClaudeBriefPanel } from '../components/ClaudeBriefPanel';
import { ExportPreviewModal } from '../components/ExportPreviewModal';
import { ContentPresets } from '../components/ContentPresets';

// ── Field helpers ─────────────────────────────────────────────────────────────

function fieldLabel(key: string) {
  return key
    .replace(/^(TEXT_|IMAGE_)/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c: string) => c.toUpperCase());
}

/** Fallback field set — used when no manifest is loaded yet. */
const FALLBACK_FIELDS = [
  { key: 'TEXT_TITLE',       label: 'Title',       required: true,  maxChars: 100 },
  { key: 'TEXT_CHALLENGE',   label: 'Challenge',   required: true,  maxChars: 400 },
  { key: 'TEXT_SOLUTION',    label: 'Solution',    required: true,  maxChars: 400 },
  { key: 'TEXT_RESULTS',     label: 'Results',     required: true,  maxChars: 400 },
  { key: 'TEXT_STAT_01',     label: 'Stat 1',      required: false, maxChars: 40  },
  { key: 'TEXT_STAT_02',     label: 'Stat 2',      required: false, maxChars: 40  },
  { key: 'TEXT_TESTIMONIAL', label: 'Testimonial', required: false, maxChars: 250 },
];

/** Read text fields from a template's manifest editable_objects. */
function getManifestFields(template: any): { key: string; label: string; required: boolean; maxChars?: number }[] {
  const objs = template?.manifest?.editable_objects;
  if (!objs || typeof objs !== 'object') return FALLBACK_FIELDS;
  const fields = Object.entries(objs)
    .filter(([, v]: any) => !v.type || v.type === 'text')
    .map(([key, v]: any) => ({
      key,
      label: fieldLabel(key),
      required: !!v.required,
      maxChars: v.max_chars ?? (DEFAULT_CHAR_LIMITS as any)[key] ?? undefined,
    }));
  return fields.length > 0 ? fields : FALLBACK_FIELDS;
}

/** Read image fields from a template's manifest editable_objects. */
function getManifestImageFields(template: any): { key: string; label: string }[] {
  const objs = template?.manifest?.editable_objects;
  if (!objs || typeof objs !== 'object') return [{ key: 'IMAGE_HERO', label: 'Hero Image' }];
  const img = Object.entries(objs)
    .filter(([, v]: any) => v.type === 'image')
    .map(([key]: any) => ({ key, label: fieldLabel(key) }));
  return img.length > 0 ? img : [{ key: 'IMAGE_HERO', label: 'Hero Image' }];
}

// ── Sub-components ────────────────────────────────────────────────────────────

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
              <FileSearch size={11} /> Open
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
      <div className="doc-template-thumb">
        {thumb
          ? <img src={thumb} alt={template.name} />
          : <>
              <FileImage size={32} className="doc-template-placeholder-icon" />
              <span className="doc-template-placeholder-label">
                {template.dimensions || 'No preview'}
              </span>
            </>}
        {thumb && template.dimensions && (
          <span className="doc-template-dim">{template.dimensions}</span>
        )}
      </div>
      <div className="doc-template-info">
        <div className="doc-template-name" title={template.name}>{template.name}</div>
        <div className="doc-template-health">
          <div className="doc-template-health-bar">
            <div className="doc-template-health-fill" style={{ width: `${health}%`, background: healthColor }} />
          </div>
          <span className="doc-template-health-label" style={{ color: healthColor }}>{healthLabel}</span>
        </div>
      </div>
      {selected && <div className="doc-template-selected-ring" />}
    </button>
  );
}

function FireflyPanel({
  imageFields, onImagePath, disabled,
}: {
  imageFields: { key: string; label: string }[];
  onImagePath: (key: string, path: string) => void;
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
            placeholder="Describe the image… e.g. 'Healthcare professional reviewing data in a modern clinical setting'" disabled={loading} />
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

// ── Main screen ───────────────────────────────────────────────────────────────

export function IllustratorScreen() {
  const activeBrand       = usePlatformStore(s => s.activeBrand);
  const pendingFill       = usePlatformStore(s => s.pendingFill?.['illustrator']);
  const clearPendingFill  = usePlatformStore(s => s.clearPendingFill);

  const [templates, setTemplates]                 = useState<any[]>([]);
  const [activeTemplate, setActiveTemplate]       = useState('');
  const [connOpen, setConnOpen]                   = useState(false);
  const [preflightResult, setPreflightResult]     = useState<any>(null);
  const [exampleResult, setExampleResult]         = useState<any>(null);
  const [exportResult, setExportResult]           = useState<any>(null);
  const [latestOutput, setLatestOutput]           = useState<any>(null);
  const [loading, setLoading]                     = useState<string | null>(null);
  const [projects, setProjects]                   = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [content, setContentState]                = useState<Record<string, string>>({});
  const [images, setImages]                       = useState<Record<string, string>>({});
  const [outputName, setOutputName]               = useState('');
  const [previewOpen, setPreviewOpen]             = useState(false);
  const [thumbUrl, setThumbUrl]                   = useState<string | null>(null);

  // Derived: active template object + its field definitions
  const templateObj  = templates.find(t => t.id === activeTemplate) ?? null;
  const fields       = templateObj ? getManifestFields(templateObj) : FALLBACK_FIELDS;
  const imageFields  = templateObj ? getManifestImageFields(templateObj) : [{ key: 'IMAGE_HERO', label: 'Hero Image' }];
  const requiredKeys = fields.filter(f => f.required).map(f => f.key);
  const contentReady = requiredKeys.every(k => content[k]?.trim());
  const busy         = loading !== null;

  // Draft persistence
  const draftKey     = activeTemplate ? `draft:illustrator:${activeTemplate}` : null;
  const skipSaveRef  = useRef(false);

  // Restore draft when template changes.
  // Also applies any pending Claude fill on top of the draft so the fill
  // is never wiped by this effect running after the fill effect fires.
  useEffect(() => {
    if (!draftKey) return;
    skipSaveRef.current = true;
    const blank = Object.fromEntries(fields.map(f => [f.key, '']));
    try {
      const saved = localStorage.getItem(draftKey);
      const base = saved ? { ...blank, ...JSON.parse(saved) } : blank;
      // If a Claude fill is already waiting, absorb it here so it isn't overwritten
      const fill = usePlatformStore.getState().pendingFill?.['illustrator'];
      setContentState(fill ? { ...base, ...fill } : base);
      if (fill) clearPendingFill('illustrator');
    } catch { setContentState(blank); }
    setImages({});
    setExportResult(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTemplate]);

  // Save draft on content change
  useEffect(() => {
    if (!draftKey || skipSaveRef.current) { skipSaveRef.current = false; return; }
    try { localStorage.setItem(draftKey, JSON.stringify(content)); } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(content), draftKey]);

  // Consume pre-fill from Claude AI when it arrives after the template is already loaded
  useEffect(() => {
    if (!pendingFill) return;
    setContentState(c => ({ ...c, ...pendingFill }));
    clearPendingFill('illustrator');
  }, [pendingFill]); // eslint-disable-line react-hooks/exhaustive-deps

  // Thumbnail
  useEffect(() => {
    if (!activeTemplate) return;
    setThumbUrl(null);
    window.creativePlatform.getTemplateThumbnail(activeTemplate).then((r: any) => {
      if (r?.ok && r.thumbnailUrl) setThumbUrl(r.thumbnailUrl);
    });
  }, [activeTemplate]);

  // Initial load
  useEffect(() => {
    window.creativePlatform.listProjects().then((p: any[]) => setProjects(p || []));
    window.creativePlatform.listTemplates().then((all: any[]) => {
      const ai = (all || []).filter((t: any) => t.engine === 'illustrator' && !t.isCanva && !t.isAdobeExpress);
      setTemplates(ai);
      if (ai.length > 0) {
        const brandTid  = usePlatformStore.getState().activeBrand?.templates?.illustrator;
        const preferred = brandTid ? ai.find((t: any) => t.id === brandTid) : null;
        const initial   = preferred || ai[0];
        setActiveTemplate(initial.id);
      }
    });
  }, []);

  // Brand switch
  useEffect(() => {
    if (!activeBrand?.templates?.illustrator || templates.length === 0) return;
    const match = templates.find((t: any) => t.id === activeBrand.templates.illustrator);
    if (match) setActiveTemplate(match.id);
  }, [activeBrand?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function setField(key: string, value: string) {
    setContentState(c => ({ ...c, [key]: value }));
  }

  const lineColor = (done: boolean) => done ? 'rgba(117,245,174,.4)' : 'var(--border-dim)';

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
      const r = await window.creativePlatform.runIllustratorPreflight(activeTemplate || undefined);
      setPreflightResult(r);
      // Preflight produces no output files — don't call fetchLatest here
    } finally { setLoading(null); }
  }

  async function runExample() {
    setLoading('example'); setExampleResult(null);
    try {
      const r = await window.creativePlatform.runIllustratorExample(activeTemplate || undefined);
      setExampleResult(r);
      if (r.ok) fetchLatest();
    } finally { setLoading(null); }
  }

  async function autoName() {
    const tmpl = templateObj;
    const base = tmpl ? (tmpl.name || tmpl.id).replace(/\s+/g, '_').toUpperCase() : 'ILLUSTRATOR_CS';
    const r = await window.creativePlatform.suggestOutputName(base);
    if (r.ok) setOutputName(r.output_name);
  }

  async function runExport() {
    setLoading('custom'); setExportResult(null);
    try {
      const imagePayload: Record<string, string> = {};
      for (const [k, v] of Object.entries(images)) { if (v.trim()) imagePayload[k] = v.trim(); }
      const job: any = {
        output_name: outputName,
        template: activeTemplate,
        content,
        ...(Object.keys(imagePayload).length > 0 ? { images: imagePayload } : {}),
      };
      const r = await window.creativePlatform.runIllustratorCustom(job);
      setExportResult(r);
      if (r.ok) {
        fetchLatest(selectedProjectId || undefined);
        if (draftKey) try { localStorage.removeItem(draftKey); } catch {}
      }
    } finally { setLoading(null); }
  }

  return (
    <div className="dashboard">

      {/* ── Panel 1: Engine + Template selection ── */}
      <section className="panel">
        <div className="engine-hdr">
          <FileImage size={20} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <div>
            <div className="engine-hdr-name">Adobe Illustrator</div>
            <div className="engine-hdr-desc">Vector PDF automation · exports AI, PDF, and PNG from template</div>
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

        {/* Connection status banner */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', borderRadius: 8, marginBottom: 14,
          background: preflightResult?.ok ? 'rgba(117,245,174,.06)' : 'rgba(255,215,108,.05)',
          border: `1px solid ${preflightResult?.ok ? 'rgba(117,245,174,.2)' : 'rgba(255,215,108,.18)'}`,
        }}>
          {preflightResult?.ok ? (
            <>
              <CheckCircle2 size={13} style={{ color: 'var(--green)', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>Illustrator connected and ready</span>
            </>
          ) : (
            <>
              <Zap size={13} style={{ color: 'var(--yellow)', flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--yellow)' }}>Connection not verified</span>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>— confirm Illustrator is running and accessible</span>
              <button onClick={() => { setConnOpen(true); runPreflight(); }} disabled={busy}
                style={{ marginLeft: 'auto', fontSize: 11, padding: '5px 12px', flexShrink: 0 }}>
                {loading === 'preflight'
                  ? <><RefreshCw size={11} className="spin" /> Checking…</>
                  : <>Verify connection →</>}
              </button>
            </>
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
              background: 'var(--surface-mid)', color: 'var(--muted)', border: '1px solid var(--border-subtle)',
            }}>
              {templates.length} registered
            </span>
          )}
        </div>
        {templates.length === 0 ? (
          <div className="empty" style={{ fontSize: 13 }}>
            No Illustrator templates registered.{' '}
            Go to <strong>Templates → Upload Template</strong> to add one.
          </div>
        ) : (
          <div className="doc-template-grid">
            {templates.map(t => (
              <TemplateCard key={t.id} template={t} selected={activeTemplate === t.id}
                onSelect={() => {
                  setActiveTemplate(t.id);
                  setPreflightResult(null); setExampleResult(null); setExportResult(null);
                }} />
            ))}
          </div>
        )}

        {/* Connection testing accordion */}
        <div className="conn-accordion">
          <button className="conn-accordion-hdr" onClick={() => setConnOpen(o => !o)}>
            {connOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            <span>Connection Testing</span>
            <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400, marginLeft: 4 }}>
              Preflight · Example Export
            </span>
            {(preflightResult?.ok || exampleResult?.ok) && (
              <CheckCircle2 size={13} style={{ color: 'var(--green)', marginLeft: 'auto' }} />
            )}
          </button>
          {connOpen && (
            <div className="conn-accordion-body">
              <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
                Run Preflight to verify Illustrator responds and the template has all required text frames.
                Run Example Export to test the full pipeline with sample data.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
              {exampleResult   && <ResultPanel result={exampleResult}   latestOutput={latestOutput} />}
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
          <StepChip n={2} label="Content"  done={contentReady}   active={!!activeTemplate && !contentReady} />
          <div style={{ flex: 1, height: 1, background: lineColor(contentReady), margin: '0 12px', minWidth: 20 }} />
          <StepChip n={3} label="Export"   done={false}           active={contentReady && !!activeTemplate} />
        </div>

        {/* Claude brief */}
        <ClaudeBriefPanel
          fields={fields}
          engine="illustrator"
          templateName={templateObj?.name}
          brandContext={activeBrand ? { name: activeBrand.name, description: activeBrand.description, guidelines: activeBrand.guidelines, industry: activeBrand.industry } : undefined}
          onFill={filled => setContentState(c => ({ ...c, ...filled }))}
          disabled={busy}
        />

        {/* ── Dynamic content fields ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '.05em', flex: 1 }}>
            Content Fields
            {templateObj && (
              <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 8 }}>
                — {templateObj.name}
              </span>
            )}
          </span>
        </div>

        <div className="fields-2col">
          {fields.map(f => {
            // Short fields (stats, section headers, labels) → half-width; everything else → full
            const fullWidth = !f.maxChars || f.maxChars > 60;
            return (
              <div key={f.key} className={fullWidth ? 'fields-2col-full' : undefined}>
                <CharLimitField
                  fieldKey={f.key}
                  label={f.label}
                  required={f.required}
                  maxChars={f.maxChars}
                  rows={
                    !f.maxChars || f.maxChars <= 60  ? 1 :
                    f.maxChars  <= 200               ? 2 : 3
                  }
                  value={content[f.key] ?? ''}
                  onChange={v => setField(f.key, v)}
                />
              </div>
            );
          })}
        </div>

        {/* ── Image fields ── */}
        <div className="images-section">
          <div className="images-section-header">
            <Image size={14} style={{ color: 'var(--accent)' }} />
            <span className="images-section-title">Photography / Images</span>
            <span className="images-section-hint">Replaces placed images in the template</span>
          </div>
          {imageFields.map(f => (
            <ImagePickerField key={f.key} label={f.label} fieldKey={f.key}
              value={images[f.key] ?? ''}
              onChange={v => setImages(p => ({ ...p, [f.key]: v }))} />
          ))}
          <FireflyPanel
            imageFields={imageFields}
            onImagePath={(key, path) => setImages(p => ({ ...p, [key]: path }))}
            disabled={busy}
          />
        </div>

        {/* ── Export action bar ── */}
        <div style={{ marginTop: 20, paddingTop: 18, borderTop: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <ContentPresets
              storageKey={`fields:illustrator:${activeTemplate}`}
              content={content}
              onLoad={c => setContentState(prev => ({ ...prev, ...c }))}
              disabled={busy}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div className="field-group" style={{ marginBottom: 0 }}>
              <label>Output Name</label>
              <div className="input-row">
                <input className="field-input" value={outputName}
                  onChange={e => setOutputName(e.target.value)}
                  placeholder="e.g. TPLS_CaseStudy" />
                <button className="secondary" onClick={autoName} title="Auto-generate next version number">
                  Auto-Version
                </button>
              </div>
            </div>
            <div className="field-group" style={{ marginBottom: 0 }}>
              <Tooltip text="Link this export to a project record in the Projects screen" display="block">
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
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setPreviewOpen(true)} disabled={busy || !activeTemplate}
              className="secondary" style={{ fontSize: 13, padding: '11px 18px', whiteSpace: 'nowrap' }}>
              👁 Preview
            </button>
            <button onClick={runExport} disabled={busy || !activeTemplate || !contentReady}
              style={{ fontSize: 14, padding: '11px 28px', flex: 1, justifyContent: 'center' }}>
              {loading === 'custom' ? <RefreshCw size={15} className="spin" /> : <Zap size={15} />}
              {loading === 'custom' ? 'Exporting…' : 'Export  ·  AI · PDF · PNG'}
            </button>
          </div>
          {!contentReady && activeTemplate && requiredKeys.length > 0 && (
            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, textAlign: 'center' }}>
              Fill {fields.filter(f => f.required).map(f => f.label).join(', ')} to enable export.
            </p>
          )}
        </div>

        <ResultPanel result={exportResult} latestOutput={latestOutput} />
      </section>

      <ExportPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        onExport={runExport}
        templateName={templateObj?.name}
        thumbnailUrl={thumbUrl}
        engine="illustrator"
        fields={fields.map(f => ({
          key: f.key, label: f.label, value: content[f.key] ?? '', required: f.required,
          role: (
            f.key === 'TEXT_TITLE'                                         ? 'title'     :
            f.key === 'TEXT_SUBTITLE' || f.key === 'TEXT_OVERVIEW'         ? 'subheading':
            f.key === 'TEXT_SECTION_HEADER'                                ? 'heading'   :
            f.key.startsWith('TEXT_STAT') && f.key.includes('LABEL')      ? 'stat-lbl'  :
            f.key.startsWith('TEXT_STAT')                                  ? 'stat-val'  :
            f.key === 'TEXT_TESTIMONIAL'                                   ? 'quote'     :
            f.key.includes('CHALLENGE') || f.key.includes('SOLUTION') ||
            f.key.includes('RESULTS')   || f.key.includes('SERVICES')     ? 'body'      :
            'default'
          ) as any,
        }))}
        outputName={outputName}
        busy={busy}
      />
    </div>
  );
}
