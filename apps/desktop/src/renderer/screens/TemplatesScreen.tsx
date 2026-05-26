import { useEffect, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, ExternalLink,
  File, FileImage, FileText, FolderOpen, FolderClosed, ImageOff,
  LayoutTemplate, Layers, Loader, Minus, PenTool, Play, Plus, RefreshCw, SearchX, Sparkles, Upload, XCircle,
} from 'lucide-react';
import { Tooltip } from '../components/Tooltip';

// ─── Engine color map ────────────────────────────────────────────────────────

const ENGINE_COLORS: Record<string, { fg: string; bg: string; border: string }> = {
  illustrator:   { fg: 'var(--eng-illo)',  bg: 'var(--eng-illo-bg)',  border: 'var(--eng-illo-bd)'  },
  indesign:      { fg: 'var(--eng-indd)',    bg: 'var(--eng-indd-bg)',    border: 'var(--eng-indd-bd)'    },
  canva:         { fg: 'var(--eng-canva)', bg: 'var(--eng-canva-bg)', border: 'var(--eng-canva-bd)' },
  adobe_express: { fg: 'var(--eng-expr)',  bg: 'var(--eng-expr-bg)',  border: 'var(--eng-expr-bd)'  },
  figma:         { fg: 'var(--eng-figma)', bg: 'var(--eng-figma-bg)', border: 'var(--eng-figma-bd)' },
};

// ─── Thumbnail ───────────────────────────────────────────────────────────────

function TemplateThumbnail({ templateId, isCanva, engine, initialUrl }: {
  templateId: string; isCanva: boolean; engine: string; initialUrl?: string | null;
}) {
  const [url, setUrl] = useState<string | null>(initialUrl ?? null);
  const [state, setState] = useState<'loading' | 'loaded' | 'error'>(initialUrl ? 'loaded' : 'loading');

  useEffect(() => {
    if (initialUrl) return;
    let ignore = false;
    window.creativePlatform.getTemplateThumbnail(templateId).then((r: any) => {
      if (ignore) return;
      if (r.ok && r.thumbnailUrl) { setUrl(r.thumbnailUrl); setState('loaded'); }
      else setState('error');
    }).catch(() => { if (!ignore) setState('error'); });
    return () => { ignore = true; };
  }, [templateId, initialUrl]);

  const engineColor =
    engine === 'adobe_express' ? 'linear-gradient(135deg,rgba(255,100,50,.10),rgba(30,40,70,.25))' :
    isCanva                    ? 'linear-gradient(135deg,rgba(103,216,255,.12),rgba(30,60,100,.25))' :
    engine === 'indesign'      ? 'linear-gradient(135deg,rgba(180,100,255,.10),rgba(30,20,60,.25))' :
                                 'linear-gradient(135deg,rgba(255,150,80,.08),rgba(30,40,70,.25))';

  if (state === 'loaded' && url) return <div className="template-thumb"><img src={url} alt={templateId} /></div>;
  return (
    <div className="template-thumb template-thumb-placeholder" style={{ background: engineColor }}>
      {state === 'loading'
        ? <Loader size={22} className="spin" style={{ color: 'var(--muted)', opacity: .5 }} />
        : <>
            <ImageOff size={22} style={{ color: 'var(--muted)', opacity: .4 }} />
            <span style={{ fontSize: 10, color: 'var(--muted)', opacity: .5, marginTop: 4 }}>
              {isCanva ? 'Add API token for preview' : 'No preview image'}
            </span>
          </>
      }
    </div>
  );
}

// ─── Health bar ───────────────────────────────────────────────────────────────

function HealthBar({ score }: { score: number }) {
  const color = score >= 90 ? 'var(--green)' : score >= 50 ? 'var(--yellow)' : 'var(--red)';
  return (
    <div className="health-bar-track">
      <div className="health-bar-fill" style={{ width: `${score}%`, background: color }} />
      <Tooltip text="Template health: percentage of required files, manifests, and assets that are present. Green ≥ 90%, yellow ≥ 50%, red < 50%" position="left">
        <span style={{ color }}>{score}%</span>
      </Tooltip>
    </div>
  );
}

// ─── Grouping helpers ─────────────────────────────────────────────────────────

function groupByVertical(templates: any[]): Record<string, any[]> {
  const groups: Record<string, any[]> = {};
  for (const t of templates) {
    const key = t.verticalLabel || 'General';
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  }
  return groups;
}

const ENGINE_TABS = [
  { id: 'all',           label: 'All' },
  { id: 'illustrator',   label: 'Illustrator' },
  { id: 'indesign',      label: 'InDesign' },
  { id: 'canva',         label: 'Canva' },
  { id: 'adobe_express', label: 'Adobe Express' },
];

function engineOf(t: any): string {
  if (t.isCanva)         return 'canva';
  if (t.isAdobeExpress)  return 'adobe_express';
  return t.engine || 'illustrator';
}

// ─── Unified upload form ──────────────────────────────────────────────────────

type FieldRow = { key: string; type: 'text' | 'image'; required: boolean; note: string; maxChars?: number };

const DEFAULTS: Record<string, FieldRow[]> = {
  illustrator: [
    { key: 'TEXT_TITLE',     type: 'text', required: true,  note: 'Headline',        maxChars: 100 },
    { key: 'TEXT_CHALLENGE', type: 'text', required: true,  note: '',                maxChars: 400 },
    { key: 'TEXT_SOLUTION',  type: 'text', required: true,  note: '',                maxChars: 400 },
    { key: 'TEXT_RESULTS',   type: 'text', required: true,  note: '',                maxChars: 400 },
  ],
  indesign: [
    { key: 'DOC_TITLE',                 type: 'text', required: true,  note: 'Document headline', maxChars: 100  },
    { key: 'SECTION_EXECUTIVE_SUMMARY', type: 'text', required: true,  note: '',                  maxChars: 600  },
    { key: 'SECTION_BODY',              type: 'text', required: true,  note: 'Main body copy',    maxChars: 2500 },
  ],
  canva: [],
  adobe_express: [
    { key: 'TEXT_TITLE', type: 'text', required: true, note: 'Main headline or title', maxChars: 100 },
  ],
};

type UploadEngine = 'illustrator' | 'indesign' | 'canva' | 'adobe_express';

const ENGINE_LABELS: Record<UploadEngine, string> = {
  illustrator:   'Illustrator (.ai)',
  indesign:      'InDesign (.indd)',
  canva:         'Canva',
  adobe_express: 'Adobe Express',
};

function AddTemplateForm({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen]           = useState(false);
  const [saving, setSaving]       = useState(false);
  const [picking, setPicking]     = useState(false);
  const [result, setResult]       = useState<any>(null);
  const [engine, setEngine]       = useState<UploadEngine>('illustrator');
  const [sourcePath, setSourcePath] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [vertical, setVertical]   = useState('');
  const [dimensions, setDimensions] = useState('');
  const [fields, setFields]       = useState<FieldRow[]>(DEFAULTS.illustrator);
  // Canva-specific
  const [canvaUrl, setCanvaUrl]   = useState('');
  const [brandKit, setBrandKit]   = useState('');
  // Canva brand template dataset auto-import
  const [canvaMode, setCanvaMode] = useState<'url' | 'dataset'>('url');
  const [brandTemplateId, setBrandTemplateId] = useState('');
  const [datasetPreview, setDatasetPreview] = useState<any>(null);
  const [fetching, setFetching]   = useState(false);
  // Adobe Express-specific
  const [editorUrl, setEditorUrl] = useState('');
  const [templateUrn, setTemplateUrn] = useState('');

  function switchEngine(e: UploadEngine) {
    setEngine(e);
    setSourcePath(''); setResult(null);
    setFields(DEFAULTS[e]);
    setCanvaMode('url'); setDatasetPreview(null); setBrandTemplateId('');
  }

  async function fetchDataset() {
    if (!brandTemplateId.trim()) return;
    setFetching(true); setDatasetPreview(null); setResult(null);
    try {
      const r = await window.creativePlatform.generateCanvaManifest({
        brandTemplateId: brandTemplateId.trim(),
        templateName: templateName.trim() || 'Preview',
        save: false,
      });
      setDatasetPreview(r);
    } finally { setFetching(false); }
  }

  async function pickFile() {
    setPicking(true);
    try {
      const ext   = engine === 'indesign' ? ['indd'] : ['ai'];
      const label = engine === 'indesign' ? 'InDesign Template' : 'Illustrator Template';
      const r = await window.creativePlatform.pickLocalFile({ title: `Select ${label}`, extensions: ext });
      if (r.ok) setSourcePath(r.filePath);
    } finally { setPicking(false); }
  }

  function addField()   { setFields(f => [...f, { key: '', type: 'text', required: false, note: '', maxChars: undefined }]); }
  function removeField(i: number) { setFields(f => f.filter((_, idx) => idx !== i)); }
  function updateField(i: number, patch: Partial<FieldRow>) {
    setFields(f => f.map((row, idx) => idx === i ? { ...row, ...patch } : row));
  }

  async function save() {
    setSaving(true); setResult(null);
    try {
      let r: any;
      if (engine === 'canva' && canvaMode === 'dataset') {
        r = await window.creativePlatform.generateCanvaManifest({
          brandTemplateId: brandTemplateId.trim(),
          templateName: templateName.trim(),
          save: true,
          category: 'general',
          industry: vertical.trim().toLowerCase().replace(/\s+/g, '_') || null,
          verticalLabel: vertical.trim() || null,
          brandKitId: null,
          brandKitName: brandKit.trim() || null,
        });
      } else if (engine === 'canva') {
        r = await window.creativePlatform.addCanvaTemplate({
          canvaUrl: canvaUrl.trim(),
          templateName: templateName.trim(),
          category: 'general',
          industry: vertical.trim().toLowerCase().replace(/\s+/g, '_') || null,
          verticalLabel: vertical.trim() || null,
          brandKitName: brandKit.trim() || null,
          editableObjects: {},
        });
      } else if (engine === 'adobe_express') {
        const editableObjects: Record<string, any> = {};
        for (const f of fields.filter(fr => fr.key.trim())) {
          editableObjects[f.key] = { type: f.type, required: f.required, note: f.note || '', ...(f.maxChars ? { max_chars: f.maxChars } : {}) };
        }
        r = await window.creativePlatform.addAdobeExpressTemplate({
          editorUrl: editorUrl.trim(),
          templateUrn: templateUrn.trim() || undefined,
          templateName: templateName.trim(),
          vertical: vertical.trim() || undefined,
          editableObjects,
        });
      } else {
        r = await window.creativePlatform.addLocalTemplate({
          engine,
          sourcePath,
          templateName: templateName.trim(),
          vertical: vertical.trim() || undefined,
          dimensions: dimensions.trim() || undefined,
          fields: fields.filter(f => f.key.trim()),
        });
      }
      setResult(r);
      if (r.ok) {
        setSourcePath(''); setTemplateName(''); setVertical(''); setDimensions('');
        setCanvaUrl(''); setBrandKit(''); setEditorUrl(''); setTemplateUrn('');
        setBrandTemplateId(''); setDatasetPreview(null);
        setFields(DEFAULTS[engine]);
        onAdded();
      }
    } finally { setSaving(false); }
  }

  const canSave = !saving && templateName.trim() && (
    (engine === 'canva' && canvaMode === 'dataset' && brandTemplateId.trim().length > 4) ||
    (engine === 'canva' && canvaMode === 'url'     && canvaUrl.trim()) ||
    (engine === 'adobe_express' && editorUrl.trim().startsWith('https://')) ||
    ((engine === 'illustrator' || engine === 'indesign') && sourcePath)
  );

  const fileName = sourcePath ? sourcePath.split('/').pop() : null;

  if (!open) return (
    <div className="button-row" style={{ marginBottom: 4 }}>
      <Tooltip text="Register a new template — Illustrator (.ai), InDesign (.indd), Canva, or Adobe Express">
        <button onClick={() => setOpen(true)}><Upload size={14} /> Upload Template</button>
      </Tooltip>
    </div>
  );

  return (
    <div className="panel" style={{ marginBottom: 16, background: 'rgba(255,200,80,.04)', border: '1px solid rgba(255,200,80,.18)' }}>
      <h3 style={{ margin: '0 0 14px', fontSize: 14 }}>Register Template</h3>

      {/* Engine selector */}
      <div className="field-group">
        <label>Engine</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(Object.keys(ENGINE_LABELS) as UploadEngine[]).map(e => (
            <button key={e} className={engine === e ? '' : 'secondary'}
              style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => switchEngine(e)}>
              {ENGINE_LABELS[e]}
            </button>
          ))}
        </div>
      </div>

      {/* File picker — Illustrator / InDesign */}
      {(engine === 'illustrator' || engine === 'indesign') && (
        <div className="field-group">
          <label>Template File *</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="secondary" style={{ fontSize: 12, padding: '5px 12px', flexShrink: 0 }}
              onClick={pickFile} disabled={picking}>
              <Upload size={12} /> {picking ? 'Picking…' : 'Pick File'}
            </button>
            {fileName
              ? <code style={{ fontSize: 11, color: 'var(--green)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName}</code>
              : <span style={{ fontSize: 11, color: 'var(--muted)' }}>No file selected</span>
            }
          </div>
        </div>
      )}

      {/* Canva — mode toggle + fields */}
      {engine === 'canva' && (
        <>
          {/* Mode selector */}
          <div className="field-group">
            <label>Import Mode</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className={canvaMode === 'url' ? '' : 'secondary'}
                style={{ fontSize: 12, padding: '5px 12px' }}
                onClick={() => { setCanvaMode('url'); setDatasetPreview(null); }}>
                Design URL
              </button>
              <button className={canvaMode === 'dataset' ? '' : 'secondary'}
                style={{ fontSize: 12, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 4 }}
                onClick={() => { setCanvaMode('dataset'); }}>
                <Sparkles size={12} /> Auto-detect from Brand Template
              </button>
            </div>
            {canvaMode === 'dataset' && (
              <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
                Paste a Brand Template ID (e.g. <code>EAGmDeqhwtw</code>) — fields are read automatically from the Canva autofill dataset. Requires a connected Canva account with autofill configured on the template.
              </p>
            )}
          </div>

          {canvaMode === 'url' ? (
            <div className="field-group">
              <label>Canva URL *</label>
              <input className="field-input" value={canvaUrl} onChange={e => setCanvaUrl(e.target.value)}
                placeholder="https://www.canva.com/design/DAxxxxxx/edit" />
            </div>
          ) : (
            <div className="field-group">
              <label>Brand Template ID *</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input className="field-input" style={{ flex: 1 }}
                  value={brandTemplateId} onChange={e => setBrandTemplateId(e.target.value)}
                  placeholder="EAG... or BTM..." />
                <button className="secondary" style={{ fontSize: 12, padding: '5px 12px', flexShrink: 0 }}
                  onClick={fetchDataset} disabled={fetching || !brandTemplateId.trim()}>
                  {fetching ? <><RefreshCw size={11} className="spin" /> Fetching…</> : 'Preview Fields'}
                </button>
              </div>
              {datasetPreview && !datasetPreview.ok && (
                <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--red)' }}>
                  {datasetPreview.message}
                </p>
              )}
              {datasetPreview?.ok && (
                <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 6, background: 'rgba(117,245,174,.06)', border: '1px solid rgba(117,245,174,.2)', fontSize: 11 }}>
                  <span style={{ color: 'var(--green)', fontWeight: 600 }}>
                    {datasetPreview.fieldCount} fields detected
                  </span>
                  <span style={{ color: 'var(--muted)', marginLeft: 8 }}>
                    {Object.entries(datasetPreview.manifest?.editable_objects ?? {})
                      .map(([k]) => k).join(', ')}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="field-group">
            <label>Brand Kit Name</label>
            <input className="field-input" value={brandKit} onChange={e => setBrandKit(e.target.value)}
              placeholder="e.g. Life Sciences" />
          </div>
        </>
      )}

      {/* Adobe Express URL + URN */}
      {engine === 'adobe_express' && (
        <>
          <div className="field-group">
            <label>Editor URL *</label>
            <input className="field-input" value={editorUrl} onChange={e => setEditorUrl(e.target.value)}
              placeholder="https://adobesparkpost.app.link/…" />
          </div>
          <div className="field-group">
            <label>Template URN <span style={{ color: 'var(--muted)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
            <input className="field-input" value={templateUrn} onChange={e => setTemplateUrn(e.target.value)}
              placeholder="urn:aaid:sc:VA6C2:…" />
          </div>
        </>
      )}

      {/* Shared metadata */}
      <div className="field-group">
        <label>Template Name *</label>
        <input className="field-input" value={templateName} onChange={e => setTemplateName(e.target.value)}
          placeholder="e.g. Case Study Healthcare" />
      </div>
      <div className="field-group">
        <label>Vertical</label>
        <input className="field-input" value={vertical} onChange={e => setVertical(e.target.value)}
          placeholder="e.g. Life Sciences" />
      </div>
      {(engine === 'illustrator' || engine === 'indesign') && (
        <div className="field-group">
          <label>Dimensions</label>
          <input className="field-input" value={dimensions} onChange={e => setDimensions(e.target.value)}
            placeholder="e.g. 8.5 × 11 in" />
        </div>
      )}

      {/* Content fields — local + Adobe Express */}
      {engine !== 'canva' && (
        <div className="field-group">
          <label style={{ marginBottom: 8, display: 'block' }}>
            {engine === 'adobe_express' ? 'Editable Fields (Required Objects)' : 'Content Fields'}
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 50px 1fr 60px 28px', gap: 6, fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', paddingBottom: 4, borderBottom: '1px solid var(--line)' }}>
              <span>Field Key</span><span>Type</span><span>Req</span><span>Note</span><span>Max&nbsp;Chars</span><span />
            </div>
            {fields.map((row, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 50px 1fr 60px 28px', gap: 6, alignItems: 'center' }}>
                <input className="field-input" style={{ fontSize: 11, padding: '4px 8px' }}
                  value={row.key}
                  onChange={e => updateField(i, { key: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })}
                  placeholder="TEXT_TITLE" />
                <select className="field-input" style={{ fontSize: 11, padding: '4px 6px' }}
                  value={row.type} onChange={e => updateField(i, { type: e.target.value as 'text' | 'image' })}>
                  <option value="text">text</option>
                  <option value="image">image</option>
                </select>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <input type="checkbox" checked={row.required}
                    onChange={e => updateField(i, { required: e.target.checked })}
                    style={{ width: 16, height: 16, accentColor: 'var(--accent)', cursor: 'pointer' }} />
                </div>
                <input className="field-input" style={{ fontSize: 11, padding: '4px 8px' }}
                  value={row.note} onChange={e => updateField(i, { note: e.target.value })}
                  placeholder="Short description…" />
                <input className="field-input" style={{ fontSize: 11, padding: '4px 8px' }}
                  type="number" min={1} max={9999}
                  value={row.maxChars ?? ''}
                  onChange={e => updateField(i, { maxChars: e.target.value ? Number(e.target.value) : undefined })}
                  placeholder="—"
                  disabled={row.type === 'image'} />
                <Tooltip text="Remove this field from the manifest" delay={200}>
                  <button className="secondary" style={{ padding: '4px', fontSize: 11, minWidth: 0 }}
                    onClick={() => removeField(i)}><Minus size={11} /></button>
                </Tooltip>
              </div>
            ))}
            <button className="secondary" style={{ fontSize: 12, alignSelf: 'flex-start', marginTop: 4 }}
              onClick={addField}><Plus size={12} /> Add Field</button>
          </div>
        </div>
      )}

      <div className="button-row">
        <Tooltip text="Copy the template file to the engines folder and save the manifest">
          <button onClick={save} disabled={!canSave}>
            {saving ? <RefreshCw size={14} className="spin" /> : <Upload size={14} />}
            {saving ? 'Registering…' : 'Register Template'}
          </button>
        </Tooltip>
        <button className="secondary" onClick={() => { setOpen(false); setResult(null); }}>Cancel</button>
      </div>
      {result && (
        <p style={{ fontSize: 12, marginTop: 10, color: result.ok ? 'var(--green)' : 'var(--red)' }}>
          {result.ok ? `Registered as ${result.manifestId}` : result.message}
        </p>
      )}
    </div>
  );
}

// ─── Template card ────────────────────────────────────────────────────────────

function TemplateCard({ t, expanded, onToggleExpand, onReplace, onNavigate, replaceMsg, replacing, onUpdated }: {
  t: any;
  expanded: boolean;
  onToggleExpand: () => void;
  onReplace: () => void;
  onNavigate?: (screen: string) => void;
  replaceMsg?: string;
  replacing?: boolean;
  onUpdated?: () => void;
}) {
  const eng = engineOf(t);

  // ── Inline "Edit Fields" state (Adobe Express only) ─────────────────────
  const [editingFields, setEditingFields] = useState(false);
  const [editFields, setEditFields]       = useState<FieldRow[]>([]);
  const [savingFields, setSavingFields]   = useState(false);
  const [editMsg, setEditMsg]             = useState<{ ok: boolean; text: string } | null>(null);

  function openEditFields() {
    const objs: Record<string, any> = t.manifest?.editable_objects ?? {};
    const rows: FieldRow[] = Object.entries(objs).map(([key, def]: [string, any]) => ({
      key,
      type: (def.type ?? 'text') as 'text' | 'image',
      required: !!def.required,
      note: def.note ?? '',
      maxChars: def.max_chars as number | undefined,
    }));
    if (rows.length === 0) rows.push({ key: 'TEXT_TITLE', type: 'text', required: true, note: '', maxChars: 100 });
    setEditFields(rows);
    setEditMsg(null);
    setEditingFields(true);
  }

  function addEditField()   { setEditFields(f => [...f, { key: '', type: 'text', required: false, note: '', maxChars: undefined }]); }
  function removeEditField(i: number) { setEditFields(f => f.filter((_, idx) => idx !== i)); }
  function updateEditField(i: number, patch: Partial<FieldRow>) {
    setEditFields(f => f.map((row, idx) => idx === i ? { ...row, ...patch } : row));
  }

  async function saveEditFields() {
    setSavingFields(true); setEditMsg(null);
    try {
      const editableObjects: Record<string, any> = {};
      for (const f of editFields.filter(fr => fr.key.trim())) {
        editableObjects[f.key] = { type: f.type, required: f.required, note: f.note || '', ...(f.maxChars ? { max_chars: f.maxChars } : {}) };
      }
      const r = await window.creativePlatform.updateAdobeExpressTemplate({
        manifestId: t.id,
        editableObjects,
      });
      if (r.ok) {
        setEditMsg({ ok: true, text: 'Fields saved — manifest updated.' });
        onUpdated?.();
        setTimeout(() => setEditingFields(false), 900);
      } else {
        setEditMsg({ ok: false, text: r.message ?? 'Update failed.' });
      }
    } finally { setSavingFields(false); }
  }

  function handleUse() {
    if (eng === 'illustrator') { onNavigate?.('Illustrator'); return; }
    if (eng === 'indesign')    { onNavigate?.('InDesign');    return; }
    if (eng === 'canva')       { window.creativePlatform.openCanvaDesign(t.canvaUrl); return; }
    if (eng === 'adobe_express') { window.open(t.adobeEditorUrl, '_blank'); return; }
  }

  const useLabel =
    eng === 'illustrator'   ? <><PenTool size={12} /> Use in Illustrator</> :
    eng === 'indesign'      ? <><Layers size={12} /> Use in InDesign</> :
    eng === 'canva'         ? <><ExternalLink size={12} /> Open in Canva</> :
    eng === 'adobe_express' ? <><ExternalLink size={12} /> Open in Adobe Express</> :
                              <><Play size={12} /> Use Template</>;

  const ec = ENGINE_COLORS[t.engine] ?? { fg: 'var(--accent)', bg: 'var(--eng-canva-bg)', border: 'var(--eng-canva-bd)' };

  return (
    <div className="template-card" style={{ borderLeft: `3px solid ${ec.fg}`, borderRadius: '18px' }}>
      <TemplateThumbnail templateId={t.id} isCanva={t.isCanva} engine={t.engine} initialUrl={t.thumbnailUrl} />

      <div className="template-card-header">
        <Tooltip text="Rendering engine this template targets">
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', padding: '2px 7px', borderRadius: 4, background: ec.bg, color: ec.fg, border: `1px solid ${ec.border}`, display: 'inline-flex', alignItems: 'center' }}>{t.engine.replace('_', ' ')}</span>
        </Tooltip>
        {t.manifest?.document_format && (
          <Tooltip text="Document format / canvas size">
            <span className="badge">{t.manifest.document_format}</span>
          </Tooltip>
        )}
        {t.category && (
          <Tooltip text="Template category or use-case type">
            <span className="badge badge-category">{t.category.replace('_', ' ')}</span>
          </Tooltip>
        )}
        {t.status === 'production' && (
          <Tooltip text="This template is marked as production-ready">
            <span className="badge badge-production">production</span>
          </Tooltip>
        )}
        {t.status === 'registered' && eng === 'canva' && (
          <Tooltip text="Canva-hosted template — no local file required">
            <span className="badge badge-canva">canva</span>
          </Tooltip>
        )}
      </div>

      <h3>{t.name}</h3>
      {t.dimensions && <p style={{ fontSize: 11, color: 'var(--muted)', margin: '2px 0 6px' }}>{t.dimensions}</p>}
      {t.brandKitName && <p style={{ fontSize: 11, color: 'var(--accent)', margin: '0 0 6px' }}>Brand kit: {t.brandKitName}</p>}
      <HealthBar score={t.healthScore} />

      <div className="template-checks">
        <div className="template-check">
          {t.templateExists
            ? <Tooltip text="Present and valid" delay={150}><CheckCircle2 size={13} color="var(--green)" /></Tooltip>
            : <Tooltip text="Missing or invalid — see the engines folder" delay={150}><XCircle size={13} color="var(--red)" /></Tooltip>}
          <span>{t.isCanva ? 'Design ID registered' : 'Template file'}</span>
        </div>
        <div className="template-check">
          {t.manifest
            ? <Tooltip text="Present and valid" delay={150}><CheckCircle2 size={13} color="var(--green)" /></Tooltip>
            : <Tooltip text="Missing or invalid — see the engines folder" delay={150}><XCircle size={13} color="var(--red)" /></Tooltip>}
          <span>Manifest</span>
        </div>
        {!t.isCanva && t.linkedAssets?.length > 0 && (
          <div className="template-check">
            {t.missingLinks?.length === 0
              ? <Tooltip text="Present and valid" delay={150}><CheckCircle2 size={13} color="var(--green)" /></Tooltip>
              : <Tooltip text="Missing or invalid — see the engines folder" delay={150}><AlertTriangle size={13} color="var(--yellow)" /></Tooltip>}
            <span>{t.missingLinks?.length === 0
              ? `${t.linkedAssets.length} linked assets`
              : `${t.missingLinks.length} assets missing`}</span>
          </div>
        )}
      </div>

      {!t.isCanva && t.fonts?.length > 0 && (
        <div className="template-objects" style={{ marginTop: 8 }}>
          <small>Fonts</small>
          <div className="object-list">
            {t.fonts.map((f: any) => <code key={f.family}>{f.family} · {f.weights?.join(', ')}</code>)}
          </div>
        </div>
      )}

      {t.requiredObjects?.length > 0 && (
        <div className="template-objects">
          <small style={{ cursor: 'pointer', userSelect: 'none' }} onClick={onToggleExpand}>
            {t.isCanva ? 'Fields' : 'Required objects'} {expanded ? '▾' : '▸'}
          </small>
          {expanded && (
            <div className="object-list">
              {t.requiredObjects.map((obj: string) => {
                const def = t.manifest?.editable_objects?.[obj];
                return (
                  <div key={obj} style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <code>{obj}</code>
                    {def?.note && <span style={{ fontSize: 10, color: 'var(--muted)' }}>{def.note}</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Primary CTA */}
      <Tooltip
        text={eng === 'canva' || eng === 'adobe_express' ? 'Open the template editor in the browser' : 'Open this template in the engine screen to run exports'}
        display="block"
      >
        <button style={{ width: '100%', justifyContent: 'center', marginTop: 12, fontSize: 12 }}
          onClick={handleUse}>
          {useLabel}
        </button>
      </Tooltip>

      {/* Secondary: replace file for local templates */}
      {(eng === 'illustrator' || eng === 'indesign') && (
        <Tooltip text="Pick a new .ai or .indd file to replace the current template — use this after updating the design" display="block">
          <button className="secondary" style={{ width: '100%', justifyContent: 'center', marginTop: 6, fontSize: 12 }}
            onClick={onReplace} disabled={replacing}>
            {replacing ? <><RefreshCw size={11} className="spin" /> Replacing…</> : 'Replace File'}
          </button>
        </Tooltip>
      )}
      {replaceMsg && <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>{replaceMsg}</p>}

      {/* Adobe Express — Edit Fields panel */}
      {eng === 'adobe_express' && !editingFields && (
        <Tooltip text="Update the editable fields defined in this template's manifest — changes take effect immediately" display="block">
          <button className="secondary" style={{ width: '100%', justifyContent: 'center', marginTop: 6, fontSize: 12 }}
            onClick={openEditFields}>
            <FileText size={11} /> Edit Fields
          </button>
        </Tooltip>
      )}

      {eng === 'adobe_express' && editingFields && (
        <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, background: 'rgba(255,200,80,.05)', border: '1px solid rgba(255,200,80,.18)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Edit Editable Fields</span>
            <button className="secondary" style={{ fontSize: 11, padding: '3px 8px', minWidth: 0 }}
              onClick={() => setEditingFields(false)}>✕</button>
          </div>

          {/* Column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 44px 1fr 56px 24px', gap: 4, fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', paddingBottom: 4, borderBottom: '1px solid var(--line)', marginBottom: 4 }}>
            <span>Key</span><span>Type</span><span>Req</span><span>Note</span><span>Max</span><span />
          </div>

          {editFields.map((row, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 44px 1fr 56px 24px', gap: 4, alignItems: 'center', marginBottom: 4 }}>
              <input className="field-input" style={{ fontSize: 11, padding: '3px 6px' }}
                value={row.key}
                onChange={e => updateEditField(i, { key: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })}
                placeholder="TEXT_TITLE" />
              <select className="field-input" style={{ fontSize: 11, padding: '3px 4px' }}
                value={row.type} onChange={e => updateEditField(i, { type: e.target.value as 'text' | 'image' })}>
                <option value="text">text</option>
                <option value="image">image</option>
              </select>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <input type="checkbox" checked={row.required}
                  onChange={e => updateEditField(i, { required: e.target.checked })}
                  style={{ width: 14, height: 14, accentColor: 'var(--accent)', cursor: 'pointer' }} />
              </div>
              <input className="field-input" style={{ fontSize: 11, padding: '3px 6px' }}
                value={row.note} onChange={e => updateEditField(i, { note: e.target.value })}
                placeholder="Description…" />
              <input className="field-input" style={{ fontSize: 11, padding: '3px 6px' }}
                type="number" min={1} max={9999}
                value={row.maxChars ?? ''}
                onChange={e => updateEditField(i, { maxChars: e.target.value ? Number(e.target.value) : undefined })}
                placeholder="—"
                disabled={row.type === 'image'} />
              <button className="secondary" style={{ padding: '2px', fontSize: 10, minWidth: 0 }}
                onClick={() => removeEditField(i)}><Minus size={10} /></button>
            </div>
          ))}

          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button className="secondary" style={{ fontSize: 11, padding: '4px 10px' }}
              onClick={addEditField}><Plus size={11} /> Add Field</button>
            <button style={{ fontSize: 11, padding: '4px 12px', flex: 1, justifyContent: 'center' }}
              onClick={saveEditFields} disabled={savingFields}>
              {savingFields ? <><RefreshCw size={11} className="spin" /> Saving…</> : 'Save Fields'}
            </button>
          </div>
          {editMsg && <p style={{ fontSize: 11, marginTop: 6, color: editMsg.ok ? 'var(--green)' : 'var(--red)' }}>{editMsg.text}</p>}
        </div>
      )}
    </div>
  );
}

// ─── Engines folder explorer ─────────────────────────────────────────────────

const FILE_ICON_MAP: Record<string, React.ReactNode> = {
  ai:   <span style={{ fontSize: 9, fontWeight: 900, color: 'var(--eng-illo)',  background: 'var(--eng-illo-bg)',  borderRadius: 3, padding: '1px 4px' }}>AI</span>,
  indd: <span style={{ fontSize: 9, fontWeight: 900, color: 'var(--eng-indd)',    background: 'var(--eng-indd-bg)',    borderRadius: 3, padding: '1px 4px' }}>INDD</span>,
  jsx:  <span style={{ fontSize: 9, fontWeight: 900, color: 'var(--eng-canva)', background: 'var(--eng-canva-bg)', borderRadius: 3, padding: '1px 4px' }}>JSX</span>,
  json: <span style={{ fontSize: 9, fontWeight: 900, color: 'var(--eng-illo)',  background: 'var(--eng-illo-bg)',  borderRadius: 3, padding: '1px 4px' }}>JSON</span>,
};

function fileIcon(ext: string): React.ReactNode {
  return FILE_ICON_MAP[ext] ?? <File size={12} style={{ color: 'var(--muted)', opacity: .5, flexShrink: 0 }} />;
}

// Label for each subfolder — makes them easier to read at a glance
const FOLDER_LABELS: Record<string, string> = {
  templates:  'Template files (.ai / .indd)',
  references: 'Manifests & metadata (.json)',
  scripts:    'Automation scripts (.jsx)',
  links:      'Linked assets',
  previews:   'Preview images',
  fonts:      'Embedded fonts',
};

type TreeNode = {
  type: 'file' | 'dir';
  name: string;
  path: string;
  rel: string;
  ext?: string;
  sizeKb?: number;
  mtime?: string;
  children?: TreeNode[];
};

// Path alias for reveal button — maps known subfolders to openPath keys
function openPathKey(rel: string): string {
  const parts = rel.replace(/\\/g, '/').split('/').filter(Boolean);
  if (parts.length === 0) return 'engines';
  const engine = parts[0].replace(/[^a-z_]/g, '');
  if (parts.length === 1) return `engines_${engine}`;
  const sub = parts[1];
  return `engines_${engine}_${sub}`;
}

function FileRow({ node, depth }: { node: TreeNode; depth: number }) {
  return (
    <div
      className="explorer-file"
      style={{ paddingLeft: 12 + depth * 18 }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
        {fileIcon(node.ext ?? '')}
        <span className="explorer-filename" title={node.path}>{node.name}</span>
        {node.sizeKb !== undefined && node.sizeKb > 0 && (
          <span className="explorer-meta">{node.sizeKb} KB</span>
        )}
      </span>
      <button
        className="explorer-reveal"
        title={`Reveal in Finder: ${node.path}`}
        onClick={() => window.creativePlatform.openPath(openPathKey(node.rel.split('/').slice(0, -1).join('/')))}
      >
        <FolderOpen size={11} /> Reveal
      </button>
    </div>
  );
}

function DirNode({ node, depth, defaultOpen }: { node: TreeNode; depth: number; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? depth < 2);
  const hint = FOLDER_LABELS[node.name];
  const fileCount = (node.children || []).filter(c => c.type === 'file').length;
  const subDirCount = (node.children || []).filter(c => c.type === 'dir').length;

  return (
    <div>
      <button
        className="explorer-dir"
        style={{ paddingLeft: 8 + depth * 18 }}
        onClick={() => setOpen(o => !o)}
      >
        {open
          ? <FolderOpen size={13} style={{ color: 'var(--accent)', opacity: .8, flexShrink: 0 }} />
          : <FolderClosed size={13} style={{ color: 'var(--muted)', opacity: .6, flexShrink: 0 }} />
        }
        <span className="explorer-dirname">{node.name}</span>
        {hint && <span className="explorer-hint">{hint}</span>}
        <span className="explorer-meta" style={{ marginLeft: 'auto' }}>
          {fileCount > 0 && `${fileCount} file${fileCount !== 1 ? 's' : ''}`}
          {fileCount > 0 && subDirCount > 0 && ' · '}
          {subDirCount > 0 && `${subDirCount} folder${subDirCount !== 1 ? 's' : ''}`}
        </span>
        <button
          className="explorer-reveal"
          style={{ marginLeft: 6 }}
          title={`Open in Finder: ${node.path}`}
          onClick={e => { e.stopPropagation(); window.creativePlatform.openPath(openPathKey(node.rel)); }}
        >
          <FolderOpen size={11} /> Open
        </button>
        {open
          ? <ChevronDown size={12} style={{ color: 'var(--muted)', flexShrink: 0 }} />
          : <ChevronRight size={12} style={{ color: 'var(--muted)', flexShrink: 0 }} />
        }
      </button>

      {open && (node.children || []).map(child =>
        child.type === 'dir'
          ? <DirNode key={child.rel} node={child} depth={depth + 1} />
          : <FileRow key={child.rel} node={child} depth={depth + 1} />
      )}
    </div>
  );
}

function EnginesExplorer() {
  const [tree, setTree]         = useState<TreeNode[]>([]);
  const [enginesRoot, setRoot]  = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [loaded, setLoaded]     = useState(false);

  async function scan() {
    setLoading(true);
    setError('');
    try {
      const r = await window.creativePlatform.scanEnginesFolder();
      if (r.ok) { setTree(r.tree); setRoot(r.enginesRoot); setLoaded(true); }
      else setError(r.message || 'Could not scan engines folder.');
    } finally { setLoading(false); }
  }

  return (
    <section className="panel">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <FolderOpen size={20} /> Engines Folder
        </h2>
        <span style={{ fontSize: 12, color: 'var(--muted)', flex: 1 }}>
          Browse and manage template files, manifests, and scripts. Open any folder in Finder to add or replace files manually.
        </span>
        <Tooltip text="Open the engines root directory in Finder">
          <button
            className="secondary"
            style={{ fontSize: 12, padding: '5px 12px' }}
            onClick={() => window.creativePlatform.openPath('engines')}
          >
            <FolderOpen size={12} /> Open Root in Finder
          </button>
        </Tooltip>
        <Tooltip text="Scan the engines folder and update the file tree">
          <button
            className="secondary"
            style={{ fontSize: 12, padding: '5px 12px' }}
            onClick={scan}
            disabled={loading}
          >
            {loading ? <Loader size={12} className="spin" /> : <RefreshCw size={12} />}
            {loaded ? 'Refresh' : 'Scan Folder'}
          </button>
        </Tooltip>
      </div>

      {enginesRoot && (
        <p style={{ fontSize: 11, color: 'var(--muted)', margin: '0 0 12px', fontFamily: 'monospace' }}>
          {enginesRoot}
        </p>
      )}

      {error && (
        <div className="result-error" style={{ marginBottom: 12 }}>
          <p style={{ margin: 0 }}>{error}</p>
        </div>
      )}

      {!loaded && !loading && !error && (
        <div className="empty" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Click <strong>Scan Folder</strong> to browse the engines directory and see all template files, manifests, and scripts.</span>
        </div>
      )}

      {loaded && tree.length === 0 && (
        <div className="empty">Engines folder is empty or could not be read.</div>
      )}

      {loaded && tree.length > 0 && (
        <div className="explorer-tree">
          {tree.map(node =>
            node.type === 'dir'
              ? <DirNode key={node.rel} node={node} depth={0} defaultOpen={true} />
              : <FileRow key={node.rel} node={node} depth={0} />
          )}
        </div>
      )}

      {/* Quick folder access */}
      {loaded && (
        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14, marginTop: 14 }}>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', margin: '0 0 10px' }}>
            Quick access — open in Finder
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {[
              { label: 'Illustrator templates', key: 'engines_illustrator_templates' },
              { label: 'Illustrator references', key: 'engines_illustrator_references' },
              { label: 'Illustrator scripts', key: 'engines_illustrator_scripts' },
              { label: 'InDesign templates', key: 'engines_indesign_templates' },
              { label: 'InDesign references', key: 'engines_indesign_references' },
              { label: 'InDesign scripts', key: 'engines_indesign_scripts' },
              { label: 'Canva references', key: 'engines_canva_references' },
              { label: 'Adobe Express references', key: 'engines_adobe_express_references' },
            ].map(({ label, key }) => (
              <Tooltip key={key} text={`Open ${label} in Finder`}>
                <button
                  className="secondary"
                  style={{ fontSize: 11, padding: '4px 10px' }}
                  onClick={() => window.creativePlatform.openPath(key)}
                >
                  <FolderOpen size={11} /> {label}
                </button>
              </Tooltip>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function TemplatesScreen({ onNavigate }: { onNavigate?: (screen: string) => void }) {
  const [templates, setTemplates]       = useState<any[]>([]);
  const [loading, setLoading]           = useState(false);
  const [replaceResult, setReplaceResult] = useState<Record<string, string>>({});
  const [replacing, setReplacing]         = useState<Set<string>>(new Set());
  const [expanded, setExpanded]         = useState<string | null>(null);
  const [engineFilter, setEngineFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  async function load() {
    setLoading(true);
    try { setTemplates(await window.creativePlatform.listTemplates() || []); }
    finally { setLoading(false); }
  }

  async function replace(engineId: string, templateFileName: string, templateId: string) {
    if (replacing.has(templateId)) return;
    setReplacing(prev => new Set(prev).add(templateId));
    try {
      const r = await window.creativePlatform.replaceTemplate(engineId, templateFileName);
      setReplaceResult(prev => ({ ...prev, [templateId]: r.ok ? `Replaced → ${r.dest}` : r.message || 'Cancelled.' }));
      if (r.ok) load();
    } finally {
      setReplacing(prev => { const s = new Set(prev); s.delete(templateId); return s; });
    }
  }

  useEffect(() => { load(); }, []);

  const filteredByEngine = engineFilter === 'all' ? templates : templates.filter(t => engineOf(t) === engineFilter);
  const sq = searchQuery.toLowerCase().trim();
  const filtered = sq
    ? filteredByEngine.filter(t =>
        (t.name || '').toLowerCase().includes(sq) ||
        (t.id || '').toLowerCase().includes(sq)
      )
    : filteredByEngine;
  const counts = Object.fromEntries(ENGINE_TABS.map(tab => [
    tab.id,
    tab.id === 'all' ? templates.length : templates.filter(t => engineOf(t) === tab.id).length,
  ]));

  return (
    <div className="dashboard">
    <section className="panel">
      <h2><FileImage size={22} /> Template Registry</h2>
      <p>All automation-registered templates across engines, with health scores, required objects, and asset manifests.</p>

      <div className="button-row" style={{ marginBottom: 16 }}>
        <Tooltip text="Reload the template registry from disk">
          <button className="secondary" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
          </button>
        </Tooltip>
      </div>

      <AddTemplateForm onAdded={load} />

      {/* Engine filter tabs + search */}
      {templates.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
          {ENGINE_TABS.map(tab => {
            const filterTooltip: Record<string, string> = {
              all:           'Show all registered templates',
              illustrator:   'Show Illustrator (.ai) templates',
              indesign:      'Show InDesign (.indd) templates',
              canva:         'Show Canva brand templates',
              adobe_express: 'Show Adobe Express templates',
            };
            return (
              <Tooltip key={tab.id} text={filterTooltip[tab.id]}>
                <button
                  className={engineFilter === tab.id ? '' : 'secondary'}
                  style={{ fontSize: 12, padding: '5px 14px' }}
                  onClick={() => setEngineFilter(tab.id)}
                >
                  {tab.label}
                  {counts[tab.id] > 0 && (
                    <span style={{ marginLeft: 6, fontSize: 10, opacity: .7 }}>
                      {counts[tab.id]}
                    </span>
                  )}
                </button>
              </Tooltip>
            );
          })}
        </div>
      )}

      {templates.length > 0 && (
        <input
          className="field-input"
          style={{ fontSize: 12, padding: '5px 10px', marginBottom: 16, maxWidth: 300 }}
          placeholder="Search templates…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
      )}

      {filtered.length === 0 && !loading && (
        <div className="empty-state">
          {sq
            ? <SearchX size={44} className="empty-state-icon" />
            : <LayoutTemplate size={44} className="empty-state-icon" />}
          <h3>
            {templates.length === 0
              ? 'No templates found'
              : sq
              ? `No templates match "${searchQuery}"`
              : `No ${engineFilter} templates yet`}
          </h3>
          <p>
            {templates.length === 0
              ? <>Ensure the engines directory contains <code>.manifest.json</code> files.</>
              : sq
              ? 'Try a different search term or engine filter.'
              : `No ${engineFilter} templates are registered yet.`}
          </p>
        </div>
      )}

      {Object.entries(groupByVertical(filtered)).map(([vert, group]) => (
        <div key={vert} className="vertical-group">
          <div className="vertical-heading">
            <span className="vertical-label">{vert}</span>
            <span className="vertical-count">{group.length} template{group.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="template-grid">
            {group.map(t => (
              <TemplateCard
                key={t.id}
                t={t}
                expanded={expanded === t.id}
                onToggleExpand={() => setExpanded(expanded === t.id ? null : t.id)}
                onReplace={() => replace(t.engine, t.sourceTemplate || `${t.id}.${t.engine === 'indesign' ? 'indd' : 'ai'}`, t.id)}
                onNavigate={onNavigate}
                replaceMsg={replaceResult[t.id]}
                replacing={replacing.has(t.id)}
                onUpdated={load}
              />
            ))}
          </div>
        </div>
      ))}
    </section>

    <EnginesExplorer />
    </div>
  );
}
