import { useEffect, useState } from 'react';
import { usePlatformStore } from '../state/usePlatformStore';
import { CheckCircle2, Clipboard, ClipboardCheck, ExternalLink, FolderOpen, Image, Layers, RefreshCw, Wand2 } from 'lucide-react';
import { CharLimitField, DEFAULT_CHAR_LIMITS } from '../components/CharLimitField';
import { ImagePickerField } from '../components/ImagePickerField';
import { Tooltip } from '../components/Tooltip';
import { ExportPreviewModal } from '../components/ExportPreviewModal';
import { ContentPresets } from '../components/ContentPresets';
import { ClaudeBriefPanel } from '../components/ClaudeBriefPanel';

function fieldLabel(key: string) {
  return key.replace(/^(TEXT_|DOC_|IMAGE_)/, '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
}

function getManifestFields(template: any): { key: string; label: string; required: boolean; maxChars?: number }[] {
  const objs = template?.manifest?.editable_objects ?? template?.editableObjects;
  if (!objs || typeof objs !== 'object') return [];
  // required_objects array (legacy format) — used as fallback if per-object required flag is absent
  const requiredSet: Set<string> = new Set(template?.manifest?.required_objects ?? []);
  return Object.entries(objs)
    .filter(([, v]: any) => !v.type || v.type === 'text')
    .map(([key, v]: any) => ({
      key,
      label: fieldLabel(key),
      required: !!v.required || requiredSet.has(key),
      maxChars: v.max_chars ?? DEFAULT_CHAR_LIMITS[key] ?? undefined,
    }));
}

function getManifestImageFields(template: any): { key: string; label: string }[] {
  const objs = template?.manifest?.editable_objects ?? template?.editableObjects;
  if (!objs || typeof objs !== 'object') return [];
  return Object.entries(objs)
    .filter(([, v]: any) => v.type === 'image')
    .map(([key]: any) => ({ key, label: fieldLabel(key) }));
}

/** Only used when a template is selected but its manifest has no text fields at all. */
const FALLBACK_FIELDS = [
  { key: 'TEXT_TITLE', label: 'Title', required: true, maxChars: DEFAULT_CHAR_LIMITS.TEXT_TITLE },
];

function buildJobContent(form: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(form)) {
    if (val.trim()) out[key] = val.trim();
  }
  return out;
}

function TemplateCard({ template, selected, onSelect }: { template: any; selected: boolean; onSelect: () => void }) {
  const [imgError, setImgError] = useState(false);
  return (
    <button onClick={onSelect} className={`adobe-template-card${selected ? ' selected' : ''}`}
      title={template.name}>
      <div className="adobe-template-thumb">
        {template.thumbnailUrl && !imgError
          ? <img src={template.thumbnailUrl} alt={template.name} onError={() => setImgError(true)} />
          : <Layers size={28} style={{ color: 'var(--muted)', opacity: .4 }} />
        }
      </div>
      <div className="adobe-template-info">
        <span className="adobe-template-dim-badge">{template.dimensions || template.engine}</span>
        <span className="adobe-template-name">{template.name}</span>
        {template.category && (
          <span className="adobe-template-category">
            {template.category.replace('_', ' ')}
          </span>
        )}
      </div>
      {selected && <div className="adobe-template-selected-ring" />}
    </button>
  );
}

// ── Firefly AI image generation panel ──────────────────────────────────────
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
    setLoading(true);
    setResult(null);
    setNoCredentials(false);
    try {
      const r = await window.creativePlatform.generateFireflyImage({ prompt: prompt.trim(), aspectRatio, style });
      if (r.ok) {
        setResult(r);
      } else if (r.noCredentials) {
        setNoCredentials(true);
      } else {
        setResult({ error: r.message || 'Generation failed.' });
      }
    } catch (e: any) {
      setResult({ error: e.message || 'Unexpected error.' });
    } finally {
      setLoading(false);
    }
  }

  const ratios: { value: typeof aspectRatio; label: string }[] = [
    { value: 'widescreen', label: 'Widescreen 16:9' },
    { value: 'portrait',   label: 'Portrait 4:5' },
    { value: 'square',     label: 'Square 1:1' },
  ];

  return (
    <div className={`firefly-panel${open ? ' open' : ''}`}>
      <button className="firefly-panel-hdr" onClick={() => setOpen(o => !o)} disabled={disabled}>
        <Wand2 size={14} style={{ color: '#FF7A30', flexShrink: 0 }} />
        <span style={{ color: '#FF7A30', flex: 1 }}>Generate Image with Adobe Firefly</span>
        <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>
          AI image → auto-fill image slot
        </span>
        <span style={{ color: 'var(--muted)', marginLeft: 8, fontSize: 13 }}>{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div style={{ padding: '0 14px 14px' }}>
          {noCredentials ? (
            <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(255,120,50,.08)',
              border: '1px solid rgba(255,120,50,.3)', fontSize: 12, color: '#FF7A30', lineHeight: 1.6 }}>
              <strong>Adobe Firefly credentials not configured.</strong>
              <br />
              Register a Firefly API app at <strong>developer.adobe.com</strong>, then add your
              Client ID and Client Secret via the platform settings.
              The credentials are stored securely in your workspace config.
            </div>
          ) : (
            <>
              <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--muted)', lineHeight: 1.55 }}>
                Describe the image you need — Firefly generates a studio-quality photo and auto-fills an image slot.
                The generated image is saved to your workspace outputs folder.
              </p>

              <textarea
                className="field-input"
                rows={3}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder={'Describe the image…\n\nExample: "Modern lab technician at microscope, soft natural light, professional healthcare setting, diverse team in background"'}
                disabled={loading}
                style={{ resize: 'vertical', minHeight: 70, marginBottom: 10 }}
              />

              <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--muted)' }}>Aspect Ratio</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {ratios.map(r => (
                      <button key={r.value} className="secondary"
                        style={{ fontSize: 11, padding: '4px 10px', borderColor: aspectRatio === r.value ? '#FF7A30' : undefined, color: aspectRatio === r.value ? '#FF7A30' : undefined }}
                        onClick={() => setAspectRatio(r.value)} disabled={loading}>
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--muted)' }}>Style</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {(['photo', 'art'] as const).map(s => (
                      <button key={s} className="secondary"
                        style={{ fontSize: 11, padding: '4px 10px', textTransform: 'capitalize', borderColor: style === s ? '#FF7A30' : undefined, color: style === s ? '#FF7A30' : undefined }}
                        onClick={() => setStyle(s)} disabled={loading}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button onClick={generate} disabled={loading || disabled || !prompt.trim()}
                style={{ fontSize: 13, padding: '8px 18px', background: '#FF7A30', color: '#fff', marginBottom: 10 }}>
                {loading ? <RefreshCw size={13} className="spin" /> : <Wand2 size={13} />}
                {loading ? 'Generating…' : 'Generate with Firefly'}
              </button>

              {result?.imagePath && (
                <div>
                  <img src={result.imagePath} alt="Firefly generated"
                    style={{ width: '100%', borderRadius: 10, border: '1px solid var(--line)', display: 'block', marginBottom: 8 }} />
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {imageFields.length > 0 ? (
                      imageFields.map(f => (
                        <button key={f.key} className="secondary" style={{ fontSize: 11, padding: '5px 12px' }}
                          onClick={() => onImagePath(f.key, result.localPath || result.imagePath)}>
                          ↑ Use as {f.label}
                        </button>
                      ))
                    ) : (
                      <button className="secondary" style={{ fontSize: 11, padding: '5px 12px' }}
                        onClick={() => onImagePath('IMAGE_HERO', result.localPath || result.imagePath)}>
                        ↑ Use as Hero Image
                      </button>
                    )}
                    <span style={{ fontSize: 11, color: 'var(--muted)', alignSelf: 'center', marginLeft: 4 }}>
                      Saved: <code style={{ fontSize: 10 }}>{result.imagePath?.split('/').slice(-1)[0]}</code>
                    </span>
                  </div>
                </div>
              )}

              {result?.error && (
                <p style={{ fontSize: 12, color: 'var(--red)', margin: 0 }}>{result.error}</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Clipboard copy helper ────────────────────────────────────────────────────
function CopyContentButton({ fields, form, templateName }: {
  fields: { key: string; label: string }[];
  form: Record<string, string>;
  templateName?: string;
}) {
  const [copied, setCopied] = useState(false);

  function copy() {
    const lines: string[] = [];
    if (templateName) lines.push(`=== ${templateName} ===`, '');
    for (const f of fields) {
      const val = form[f.key]?.trim();
      if (val) lines.push(`${f.label.toUpperCase()}:`, val, '');
    }
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button className={`copy-btn${copied ? ' copied' : ''}`} onClick={copy}
      title="Copy all content as formatted text — paste each field manually in Adobe Express">
      {copied ? <ClipboardCheck size={11} /> : <Clipboard size={11} />}
      {copied ? 'Copied!' : 'Copy all content'}
    </button>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export function AdobeExpressScreen() {
  const pendingFill = usePlatformStore(s => s.pendingFill?.['adobe_express']);
  const clearPendingFill = usePlatformStore(s => s.clearPendingFill);
  const activeBrand = usePlatformStore(s => s.activeBrand);
  const [templates, setTemplates]       = useState<any[]>([]);
  const [selectedId, setSelectedId]     = useState<string | null>(null);
  const [form, setForm]                 = useState<Record<string, string>>({});
  const [images, setImages]             = useState<Record<string, string>>({});
  const [loading, setLoading]           = useState(false);
  const [result, setResult]             = useState<any>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [previewOpen, setPreviewOpen]   = useState(false);
  const [thumbUrl, setThumbUrl]         = useState<string | null>(null);

  // Consume pending Claude fill when it arrives after the template is already selected
  useEffect(() => {
    if (!pendingFill) return;
    setForm(f => ({ ...f, ...pendingFill }));
    clearPendingFill('adobe_express');
  }, [pendingFill]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedId) return;
    setThumbUrl(null);
    window.creativePlatform.getTemplateThumbnail(selectedId).then((r: any) => {
      if (r?.ok && r.thumbnailUrl) setThumbUrl(r.thumbnailUrl);
    });
  }, [selectedId]);

  useEffect(() => {
    window.creativePlatform.listTemplates().then((all: any[]) => {
      const express = (all || []).filter((t: any) => t.isAdobeExpress || t.engine === 'adobe_express');
      setTemplates(express);
      if (express.length > 0 && !selectedId) setSelectedId(express[0].id);
    });
  }, []);

  const selectedTemplate = templates.find(t => t.id === selectedId);
  const fields = selectedTemplate
    ? (getManifestFields(selectedTemplate).length > 0 ? getManifestFields(selectedTemplate) : FALLBACK_FIELDS)
    : FALLBACK_FIELDS;
  const imageFields = selectedTemplate ? getManifestImageFields(selectedTemplate) : [];

  // Reset form when template changes; absorb any pending fill on top so it isn't overwritten
  useEffect(() => {
    const fill = usePlatformStore.getState().pendingFill?.['adobe_express'];
    setForm(fill ? { ...fill } : {});
    setImages({});
    setResult(null);
    if (fill) clearPendingFill('adobe_express');
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  function setField(key: string, value: string) {
    setForm(f => ({ ...f, [key]: value }));
    setResult(null);
  }

  const canRun = fields.filter(f => f.required).every(f => form[f.key]?.trim());

  // Derived workflow state
  const templateSelected = !!selectedId;
  const contentReady = canRun;
  const lineColor = (done: boolean) => done ? 'rgba(117,245,174,.4)' : 'var(--border-dim)';

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

  async function openInExpress() {
    if (!selectedTemplate) return;
    setLoading(true);
    setResult(null);
    try {
      const imagePayload: Record<string, string> = {};
      for (const [k, v] of Object.entries(images)) {
        if (v.trim()) imagePayload[k] = v.trim();
      }
      const r = await window.creativePlatform.runAdobeExpressJob({
        templateId: selectedTemplate.id,
        templateUrn: selectedTemplate.adobeTemplateUrn,
        editorUrl: selectedTemplate.adobeEditorUrl,
        content: buildJobContent(form),
        ...(Object.keys(imagePayload).length > 0 ? { images: imagePayload } : {}),
        outputName: `adobe_${selectedTemplate.id}_${Date.now()}`,
      });
      setResult(r);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="dashboard">

      {/* ── Panel 1: Engine identity + Template gallery ── */}
      <section className="panel">
        <div className="engine-hdr">
          <Layers size={20} style={{ color: 'var(--eng-expr)', flexShrink: 0 }} />
          <div>
            <div className="engine-hdr-name">Adobe Express</div>
            <div className="engine-hdr-desc">
              Editor handoff · content is pre-filled then opened in Adobe Express for final design
            </div>
          </div>
          <button className="secondary" style={{ fontSize: 11, padding: '5px 10px', marginLeft: 'auto', flexShrink: 0 }}
            onClick={() => window.creativePlatform.openPath('adobe_outputs')}>
            <FolderOpen size={11} /> Open Outputs
          </button>
        </div>

        {/* Template gallery */}
        <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em',
          color: 'var(--muted)', marginBottom: 10 }}>
          Templates
          {templates.length > 0 && (
            <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 6 }}>
              — {templates.length} registered
            </span>
          )}
        </p>
        {templates.length === 0 ? (
          <div className="empty" style={{ fontSize: 13 }}>
            No Adobe Express templates found.{' '}
            Go to <strong>Templates → Upload Template</strong> to add one.
          </div>
        ) : (
          <div className="adobe-template-grid">
            {templates.map(t => (
              <TemplateCard key={t.id} template={t} selected={selectedId === t.id}
                onSelect={() => setSelectedId(t.id)} />
            ))}
          </div>
        )}
      </section>

      {/* ── Panel 2: AI + Content + Export ── */}
      <section className="panel">
        {/* Workflow steps */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20, paddingBottom: 16,
          borderBottom: '1px solid var(--line)' }}>
          <StepChip n={1} label="Template" done={templateSelected} active={!templateSelected} />
          <div style={{ flex: 1, height: 1, background: lineColor(templateSelected), margin: '0 12px', minWidth: 20 }} />
          <StepChip n={2} label="Content" done={contentReady} active={templateSelected && !contentReady} />
          <div style={{ flex: 1, height: 1, background: lineColor(contentReady), margin: '0 12px', minWidth: 20 }} />
          <StepChip n={3} label="Open in Express" done={false} active={contentReady} />
        </div>

        {/* Claude brief — generates text content */}
        <ClaudeBriefPanel
          fields={fields}
          engine="adobe_express"
          templateName={selectedTemplate?.name}
          brandContext={activeBrand ? { name: activeBrand.name, description: activeBrand.description, guidelines: activeBrand.guidelines, industry: activeBrand.industry } : undefined}
          onFill={content => setForm(f => ({ ...f, ...content }))}
          disabled={loading}
        />

        {/* Firefly — generates images */}
        <FireflyPanel
          imageFields={imageFields}
          onImagePath={(fieldKey, path) => setImages(prev => ({ ...prev, [fieldKey]: path }))}
          disabled={loading}
        />

        {/* Content fields divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0, fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '.05em', flex: 1 }}>
            Content Fields
            {selectedTemplate && (
              <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 8 }}>
                — {selectedTemplate.name}
              </span>
            )}
          </p>
          <CopyContentButton
            fields={fields}
            form={form}
            templateName={selectedTemplate?.name}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
          {fields.map(f => (
            <div key={f.key}
              style={{ gridColumn: f.key === 'TEXT_TITLE' || f.key === 'DOC_TITLE' ? '1 / -1' : 'auto' }}>
              <CharLimitField
                fieldKey={f.key}
                label={f.label}
                required={f.required}
                maxChars={f.maxChars}
                rows={f.key === 'TEXT_TITLE' || f.key === 'DOC_TITLE' ? 1 : 3}
                value={form[f.key] ?? ''}
                onChange={v => setField(f.key, v)}
              />
            </div>
          ))}
        </div>

        {/* Image reference fields */}
        {imageFields.length > 0 && (
          <div className="images-section">
            <div className="images-section-header">
              <Image size={14} style={{ color: 'var(--accent)' }} />
              <span className="images-section-title">Photography / Images</span>
              <span className="images-section-hint">
                Stored as references — place them in Express after opening · or generate with Firefly above
              </span>
            </div>
            {imageFields.map(f => (
              <ImagePickerField
                key={f.key}
                fieldKey={f.key}
                label={f.label}
                value={images[f.key] ?? ''}
                onChange={v => setImages(prev => ({ ...prev, [f.key]: v }))}
                disabled={loading}
              />
            ))}
          </div>
        )}

        {/* Presets + action buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16, marginBottom: 8 }}>
          <ContentPresets
            storageKey={`fields:adobe_express:${selectedId}`}
            content={form}
            onLoad={c => setForm(f => ({ ...f, ...c }))}
            disabled={loading}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 0, flexWrap: 'wrap' }}>
          <button className="secondary" onClick={() => setPreviewOpen(true)} disabled={!selectedTemplate}
            style={{ fontSize: 13, padding: '9px 14px' }}>
            👁 Preview
          </button>
          <button onClick={openInExpress} disabled={loading || !canRun || !selectedTemplate}
            style={{ fontSize: 13, padding: '10px 22px' }}>
            {loading ? <RefreshCw size={14} className="spin" /> : <ExternalLink size={14} />}
            {loading ? 'Opening…' : 'Open in Adobe Express'}
          </button>
          {confirmClear ? (
            <button
              style={{ fontSize: 13, padding: '10px 16px', background: 'rgba(255,116,116,.15)', border: '1px solid rgba(255,116,116,.4)', color: 'var(--red)', borderRadius: 12, cursor: 'pointer', fontWeight: 600 }}
              onClick={() => { setForm({}); setImages({}); setResult(null); setConfirmClear(false); }}
            >
              Clear all?
            </button>
          ) : (
            <button className="secondary" onClick={() => { setConfirmClear(true); setTimeout(() => setConfirmClear(false), 3000); }}>
              Clear Fields
            </button>
          )}
          {!canRun && fields.filter(f => f.required).length > 0 && (
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>
              Fill {fields.filter(f => f.required).map(f => f.label).join(', ')} to continue.
            </span>
          )}
        </div>

        {/* Result */}
        {result && (
          <div className={result.ok ? 'result-ok' : 'result-error'} style={{ marginTop: 16 }}>
            {result.ok ? (
              <>
                <strong style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CheckCircle2 size={14} />
                  Adobe Express opened — {result.operationCount} field{result.operationCount !== 1 ? 's' : ''} ready to paste
                  <Tooltip text="Content was saved to a handoff JSON file — open Adobe Express and paste each field" delay={150}>
                    <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 400,
                      background: 'var(--surface-mid)', padding: '2px 7px', borderRadius: 99 }}>handoff</span>
                  </Tooltip>
                </strong>
                <p style={{ fontSize: 12, margin: '6px 0 4px', color: 'var(--muted)' }}>
                  Job saved: <code style={{ color: 'var(--accent)' }}>{result.jobPath?.split('/').slice(-1)[0]}</code>
                </p>
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button className="secondary" style={{ fontSize: 12 }}
                    onClick={() => window.creativePlatform.openPath('adobe_outputs')}>
                    <FolderOpen size={12} /> Open Adobe Outputs
                  </button>
                  {result.jobPath && (
                    <button className="secondary" style={{ fontSize: 12 }}
                      onClick={() => window.creativePlatform.revealFile(result.jobPath)}>
                      <FolderOpen size={12} /> Reveal Job File
                    </button>
                  )}
                  <CopyContentButton fields={fields} form={form} templateName={selectedTemplate?.name} />
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                    Tip: copy content above and paste each field in Adobe Express
                  </span>
                </div>
              </>
            ) : (
              <p style={{ margin: 0 }}>{result.message || 'Job failed.'}</p>
            )}
          </div>
        )}
      </section>

      <ExportPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        onExport={openInExpress}
        templateName={templates.find(t => t.id === selectedId)?.name}
        thumbnailUrl={thumbUrl}
        engine="adobe_express"
        fields={fields.map((f: any) => ({
          key: f.key, label: f.label, value: form[f.key] ?? '', required: !!f.required,
          role: (
            f.key === 'HEADLINE' || f.key === 'TEXT_TITLE' ? 'title' :
            f.key === 'BODY_COPY' || f.key === 'TEXT_BODY' ? 'body' :
            f.key === 'CTA_TEXT' ? 'cta' :
            f.key === 'SUBHEADLINE' || f.key === 'TEXT_SUBTITLE' ? 'subheading' :
            'default'
          ) as any,
        }))}
        busy={loading}
      />
    </div>
  );
}
