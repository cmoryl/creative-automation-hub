import { useEffect, useState } from 'react';
import { usePlatformStore } from '../state/usePlatformStore';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, ExternalLink, FileText, Film, FolderOpen, FolderSearch, FolderPlus, Image, Layers, Loader, Plus, RefreshCw, SearchX, Trash2, Zap } from 'lucide-react';
import { toast } from '../components/Toast';
import { ImagePreviewModal } from '../components/ImagePreviewModal';
import { CharLimitField } from '../components/CharLimitField';
import { ImagePickerField } from '../components/ImagePickerField';
import { CanvaImageField, CanvaImageValue, EMPTY_CANVA_IMAGE } from '../components/CanvaImageField';
import { Tooltip } from '../components/Tooltip';
import { ClaudeBriefPanel } from '../components/ClaudeBriefPanel';

// ── helpers ──────────────────────────────────────────────────────────────────

function fieldLabel(key: string): string {
  return key.replace(/^TEXT_/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

const STANDARD_FIELDS = [
  { key: 'TEXT_TITLE',     label: 'Title',     required: true,  note: 'Hero headline or company name' },
  { key: 'TEXT_CHALLENGE', label: 'Challenge', required: true,  note: 'Challenge or problem statement' },
  { key: 'TEXT_SOLUTION',  label: 'Solution',  required: true,  note: 'Solution or product description' },
  { key: 'TEXT_RESULTS',   label: 'Results',   required: true,  note: 'Outcomes and metrics' },
  { key: 'TEXT_OVERVIEW',  label: 'Overview',  required: false, note: 'Short intro paragraph (optional)' },
  { key: 'TEXT_STAT_01',   label: 'Stat 1',    required: false, note: 'e.g. "68% faster"' },
  { key: 'TEXT_STAT_02',   label: 'Stat 2',    required: false, note: 'e.g. "95% consistent"' },
  { key: 'TEXT_TESTIMONIAL', label: 'Testimonial', required: false, note: 'Pull quote (optional)' },
];

function getFields(template: any): { key: string; label: string; required: boolean; note: string; maxChars?: number }[] {
  const objs = template?.manifest?.editable_objects;
  if (!objs) return STANDARD_FIELDS;
  return Object.entries(objs)
    .filter(([, v]: any) => !v.type || v.type === 'text')
    .map(([key, v]: any) => ({
      key,
      label: fieldLabel(key),
      required: !!v.required,
      note: v.note || '',
      maxChars: v.max_chars ?? undefined,
    }));
}

function getImageFields(template: any): { key: string; label: string }[] {
  const objs = template?.manifest?.editable_objects;
  if (!objs) return [];
  return Object.entries(objs)
    .filter(([, v]: any) => v.type === 'image')
    .map(([key, v]: any) => ({
      key,
      label: (v.note || key.replace(/^IMAGE_/, '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())),
    }));
}

function engineColor(engine: string) {
  if (engine === 'canva') return 'var(--eng-canva-bg)';
  if (engine === 'adobe_express') return 'var(--eng-expr-bg)';
  return 'var(--eng-illo-bg)';
}

// ── output type styling ───────────────────────────────────────────────────────

interface OutputTypeStyle {
  icon: React.ReactNode;
  color: string;
  bg: string;
  label: string;
  openLabel: string;
}

function getOutputStyle(type: string): OutputTypeStyle {
  switch (type.toLowerCase()) {
    case 'ai':
      return { icon: <Layers size={11} />, color: 'var(--eng-illo)',  bg: 'var(--eng-illo-bg)',  label: 'AI', openLabel: 'Open in Illustrator' };
    case 'pdf':
      return { icon: <FileText size={11} />, color: 'var(--eng-indd)',    bg: 'var(--eng-indd-bg)',    label: 'PDF', openLabel: 'Open in Preview' };
    case 'png':
    case 'jpg':
    case 'jpeg':
      return { icon: <Image size={11} />, color: 'var(--eng-canva)', bg: 'var(--eng-canva-bg)', label: type.toUpperCase(), openLabel: 'Open Image' };
    case 'idml':
    case 'indd':
      return { icon: <Layers size={11} />, color: 'var(--eng-figma)', bg: 'var(--eng-figma-bg)', label: type.toUpperCase(), openLabel: 'Open in InDesign' };
    case 'handoff':
      return { icon: <Film size={11} />, color: 'var(--green)', bg: 'rgba(74,222,128,.12)', label: 'Handoff', openLabel: 'Open Job File' };
    default:
      return { icon: <FileText size={11} />, color: 'var(--muted)', bg: 'var(--surface-mid)', label: type, openLabel: 'Open' };
  }
}

// ── template picker ───────────────────────────────────────────────────────────

function TemplatePicker({ templates, selected, onSelect }: {
  templates: any[];
  selected: any;
  onSelect: (t: any) => void;
}) {
  if (templates.length === 0) {
    return <p style={{ fontSize: 12, color: 'var(--muted)' }}>No templates found. Add templates in the Templates screen first.</p>;
  }

  const groups: Record<string, any[]> = {};
  for (const t of templates) {
    const g = t.verticalLabel || t.engine || 'General';
    if (!groups[g]) groups[g] = [];
    groups[g].push(t);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {Object.entries(groups).map(([group, ts]) => (
        <div key={group}>
          <p style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', margin: '0 0 6px' }}>{group}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
            {ts.map(t => (
              <Tooltip key={t.id} text="Select this template to use it for your new project" display="block">
                <div
                  onClick={() => onSelect(t)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: `2px solid ${selected?.id === t.id ? 'var(--accent)' : 'var(--line)'}`,
                    background: selected?.id === t.id ? 'var(--eng-canva-bg)' : engineColor(t.engine),
                    cursor: 'pointer',
                    transition: 'border-color .15s',
                  }}
                >
                  <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                    <span className="badge" style={{ fontSize: 10 }}>{t.engine}</span>
                    {t.manifest?.document_format && <span className="badge" style={{ fontSize: 10 }}>{t.manifest.document_format}</span>}
                  </div>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 500, lineHeight: 1.3 }}>{t.name}</p>
                </div>
              </Tooltip>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── new project panel ─────────────────────────────────────────────────────────

function NewProjectPanel({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const activeBrand = usePlatformStore(s => s.activeBrand);
  const [templates, setTemplates] = useState<any[]>([]);
  const [step, setStep] = useState<'pick' | 'fill'>('pick');
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [projectName, setProjectName] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [images, setImages] = useState<Record<string, string>>({});
  const [canvaImages, setCanvaImages] = useState<Record<string, CanvaImageValue>>({});
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    window.creativePlatform.listTemplates().then((ts: any[]) => setTemplates(ts || []));
  }, []);

  function pickTemplate(t: any) {
    setSelectedTemplate(t);
    setFields({});
    setImages({});
    setCanvaImages({});
    setResult(null);
    setStep('fill');
  }

  function setField(key: string, value: string) {
    setFields(prev => ({ ...prev, [key]: value }));
  }

  function setImage(key: string, value: string) {
    setImages(prev => ({ ...prev, [key]: value }));
  }

  async function runExport() {
    setRunning(true);
    setResult(null);
    try {
      let jobResult: any;
      const t = selectedTemplate;

      const imagePayload: Record<string, string> = {};
      for (const [k, v] of Object.entries(images)) { if (v.trim()) imagePayload[k] = v.trim(); }
      const hasImages = Object.keys(imagePayload).length > 0;

      if (t.engine === 'illustrator') {
        jobResult = await window.creativePlatform.runIllustratorCustom({
          output_name: projectName.trim() || undefined,
          template: t.id,
          content: fields,
          ...(hasImages ? { images: imagePayload } : {}),
        });
      } else if (t.engine === 'indesign') {
        jobResult = await window.creativePlatform.runInDesignCustom({
          output_name: projectName.trim() || undefined,
          template: t.id,
          content: fields,
          ...(hasImages ? { images: imagePayload } : {}),
        });
      } else if (t.isCanva) {
        const canvaImagePayload: Record<string, { assetId?: string; url?: string }> = {};
        for (const [k, v] of Object.entries(canvaImages)) {
          if (v.assetId) canvaImagePayload[k] = { assetId: v.assetId };
          else if (v.url.trim()) canvaImagePayload[k] = { url: v.url.trim() };
        }
        jobResult = await window.creativePlatform.runCanvaJob({
          templateId: t.id,
          content: fields,
          ...(Object.keys(canvaImagePayload).length > 0 ? { images: canvaImagePayload } : {}),
        });
      } else if (t.isAdobeExpress) {
        jobResult = await window.creativePlatform.runAdobeExpressJob({
          templateId: t.id,
          templateUrn: t.adobeTemplateUrn,
          editorUrl: t.adobeEditorUrl,
          content: fields,
          ...(hasImages ? { images: imagePayload } : {}),
          outputName: projectName.trim() || undefined,
        });
      } else {
        jobResult = { ok: false, userMessage: 'Unknown engine.' };
      }

      const finalName = projectName.trim() || fields['TEXT_TITLE'] || fields['DOC_TITLE'] || 'Untitled Project';
      const projectRes = await window.creativePlatform.createProject({
        name: finalName,
        engine: t.engine,
        templateId: t.id,
        templateName: t.name,
        status: jobResult.ok ? 'complete' : 'failed',
        content: fields,
      });

      if (jobResult.ok && projectRes.ok) {
        const outputs = await window.creativePlatform.listOutputs();
        const latest = outputs?.[0];
        if (latest) {
          await window.creativePlatform.linkOutputToProject(projectRes.project.id, {
            path: latest.path,
            name: latest.name,
            type: latest.type,
            engine: latest.engine,
          });
        } else if (t.isAdobeExpress && jobResult.jobPath) {
          await window.creativePlatform.linkOutputToProject(projectRes.project.id, {
            path: jobResult.jobPath,
            name: `${finalName}.job.json`,
            type: 'handoff',
            engine: 'adobe_express',
          });
        }
      }

      setResult({ ...jobResult, projectCreated: projectRes.ok });
      if (jobResult.ok && projectRes.ok) {
        setTimeout(() => { onCreated(); }, 1200);
      }
    } finally {
      setRunning(false);
    }
  }

  const templateFields = selectedTemplate ? getFields(selectedTemplate) : [];
  const templateImageFields = selectedTemplate ? getImageFields(selectedTemplate) : [];
  const supportsImages = ['illustrator', 'indesign'].includes(selectedTemplate?.engine);
  const supportsCanvaImages = !!selectedTemplate?.isCanva;
  const supportsAdobeExpressImages = !!selectedTemplate?.isAdobeExpress;
  const requiredMet = selectedTemplate
    ? templateFields.filter(f => f.required).every(f => fields[f.key]?.trim())
    : false;

  return (
    <div style={{ border: '1px solid var(--accent)', borderRadius: 10, padding: 20, marginBottom: 20, background: 'var(--eng-canva-bg)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>
          {step === 'pick' ? 'Select a Template' : `Fill Content — ${selectedTemplate?.name}`}
        </h3>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {step === 'fill' && (
            <Tooltip text="Return to template selection" delay={200}>
              <button className="secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setStep('pick')} disabled={running}>
                ← Back
              </button>
            </Tooltip>
          )}
          <button className="secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={onCancel} disabled={running}>
            Cancel
          </button>
        </div>
      </div>

      {step === 'pick' && (
        <TemplatePicker templates={templates} selected={selectedTemplate} onSelect={pickTemplate} />
      )}

      {step === 'fill' && selectedTemplate && (
        <div>
          <div className="field-group">
            <label>Project Name</label>
            <input
              className="field-input"
              value={projectName}
              onChange={e => setProjectName(e.target.value)}
              placeholder={fields['TEXT_TITLE'] || 'e.g. Acme Corp Case Study'}
              disabled={running}
            />
          </div>

          <div style={{ height: 1, background: 'var(--line)', margin: '12px 0' }} />

          <ClaudeBriefPanel
            fields={templateFields.map(f => ({ key: f.key, label: f.label, required: f.required, maxChars: f.maxChars }))}
            engine={selectedTemplate?.engine || (selectedTemplate?.isCanva ? 'canva' : selectedTemplate?.isAdobeExpress ? 'adobe_express' : 'illustrator')}
            templateName={selectedTemplate?.name}
            brandContext={activeBrand ? { name: activeBrand.name, description: activeBrand.description, guidelines: activeBrand.guidelines, industry: activeBrand.industry } : undefined}
            onFill={content => setFields(prev => ({ ...prev, ...content }))}
            disabled={running}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {templateFields.map(f => (
              <div
                key={f.key}
                style={{ gridColumn: f.key === 'TEXT_TITLE' || f.key === 'DOC_TITLE' ? '1 / -1' : 'auto' }}
              >
                <CharLimitField
                  fieldKey={f.key}
                  label={f.label}
                  required={f.required}
                  maxChars={f.maxChars}
                  rows={f.key === 'TEXT_TITLE' || f.key === 'DOC_TITLE' ? 1 : 2}
                  value={fields[f.key] || ''}
                  onChange={v => setField(f.key, v)}
                  placeholder={f.note || `${f.label}…`}
                />
              </div>
            ))}
          </div>

          {supportsImages && templateImageFields.length > 0 && (
            <div className="images-section">
              <div className="images-section-header">
                <Image size={14} style={{ color: 'var(--accent)' }} />
                <span className="images-section-title">Photography / Images</span>
                <span className="images-section-hint">Replaces placed images in the template</span>
              </div>
              {templateImageFields.map(f => (
                <ImagePickerField key={f.key} label={f.label} fieldKey={f.key} value={images[f.key] || ''} onChange={v => setImage(f.key, v)} disabled={running} />
              ))}
            </div>
          )}

          {supportsCanvaImages && templateImageFields.length > 0 && (
            <div className="images-section">
              <div className="images-section-header">
                <Image size={14} style={{ color: 'var(--accent)' }} />
                <span className="images-section-title">Photography / Images</span>
                <span className="images-section-hint">Uploaded to Canva Assets — injected via API</span>
              </div>
              {templateImageFields.map(f => {
                const obj = selectedTemplate?.manifest?.editable_objects?.[f.key];
                return (
                  <CanvaImageField key={f.key} fieldKey={f.key} label={f.label} value={canvaImages[f.key] ?? EMPTY_CANVA_IMAGE} onChange={v => setCanvaImages(prev => ({ ...prev, [f.key]: v }))} hasElementId={!!obj?.element_id} disabled={running} />
                );
              })}
            </div>
          )}

          {supportsAdobeExpressImages && templateImageFields.length > 0 && (
            <div className="images-section">
              <div className="images-section-header">
                <Image size={14} style={{ color: 'var(--accent)' }} />
                <span className="images-section-title">Photography / Images</span>
                <span className="images-section-hint">Saved as references — copied to output folder, place manually in Express</span>
              </div>
              {templateImageFields.map(f => (
                <ImagePickerField key={f.key} label={f.label} fieldKey={f.key} value={images[f.key] || ''} onChange={v => setImage(f.key, v)} disabled={running} />
              ))}
            </div>
          )}

          {result && (
            <div style={{ marginTop: 14, padding: 12, borderRadius: 8, background: result.ok ? 'rgba(60,200,120,.1)' : 'rgba(255,60,60,.08)', border: `1px solid ${result.ok ? 'rgba(60,200,120,.3)' : 'rgba(255,60,60,.3)'}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                {result.ok
                  ? <><CheckCircle2 size={15} color="var(--green)" /> <strong>Export complete — project saved</strong></>
                  : <><AlertTriangle size={15} color="var(--red)" /> <strong>{result.errorTitle || 'Export failed'}</strong></>}
              </div>
              {!result.ok && (result.userMessage || result.message) && (
                <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--muted)' }}>{result.userMessage || result.message}</p>
              )}
              {result.ok && result.editorUrl && (
                <div style={{ marginTop: 8 }}>
                  <button className="secondary" style={{ fontSize: 12 }} onClick={() => window.open(result.editorUrl, '_blank')}>
                    <ExternalLink size={12} /> Open in Adobe Express
                  </button>
                </div>
              )}
              {result.ok && result.canvaUrl && (
                <div style={{ marginTop: 8 }}>
                  <button className="secondary" style={{ fontSize: 12 }} onClick={() => window.creativePlatform.openCanvaDesign(result.canvaUrl)}>
                    <ExternalLink size={12} /> Open in Canva
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="button-row" style={{ marginTop: 14 }}>
            {!running ? (
              <Tooltip text="Run the export and save the result as a tracked project">
                <button onClick={runExport} disabled={!requiredMet || !!result?.ok}>
                  <Zap size={15} />
                  {selectedTemplate.isAdobeExpress ? 'Create Project & Open in Adobe Express'
                    : selectedTemplate.isCanva ? 'Create Project & Send to Canva'
                    : 'Create Project & Export'}
                </button>
              </Tooltip>
            ) : (
              <button disabled>
                <Loader size={15} className="spin" /> Running…
              </button>
            )}
          </div>
          {!requiredMet && (
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>Fill in all required fields (*) to continue.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── output row ────────────────────────────────────────────────────────────────

function OutputRow({ output }: { output: any }) {
  const style = getOutputStyle(output.type);
  const [actioning, setActioning] = useState(false);

  async function reveal() {
    setActioning(true);
    try { await window.creativePlatform.revealFile(output.path); } catch(e) {}
    finally { setActioning(false); }
  }

  async function openFile() {
    setActioning(true);
    try { await window.creativePlatform.openFile(output.path); } catch(e) {}
    finally { setActioning(false); }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--border-dim)' }}>
      {/* Type badge */}
      <Tooltip text={output.label || style.label} delay={200}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 3,
          padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 600,
          color: style.color, background: style.bg, flexShrink: 0,
        }}>
          {style.icon} {style.label}
        </span>
      </Tooltip>

      {/* Label + filename */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {output.label && (
          <span style={{ fontSize: 10, color: 'var(--muted)', display: 'block', marginBottom: 1 }}>{output.label}</span>
        )}
        <span style={{ fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
          {output.name}
        </span>
      </div>

      {/* Date */}
      <span style={{ fontSize: 10, color: 'var(--muted)', flexShrink: 0 }}>
        {new Date(output.linkedAt).toLocaleDateString()}
      </span>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        <button
          className="secondary"
          style={{ fontSize: 11, padding: '3px 8px' }}
          onClick={openFile}
          disabled={actioning}
          title={style.openLabel}
        >
          <ExternalLink size={10} /> Open
        </button>
        <button
          className="secondary"
          style={{ fontSize: 11, padding: '3px 8px' }}
          onClick={reveal}
          disabled={actioning}
          title="Show this file highlighted in Finder"
        >
          <FolderSearch size={10} /> Reveal
        </button>
      </div>
    </div>
  );
}

// ── project card ──────────────────────────────────────────────────────────────

function ProjectCard({ project, onDelete }: { project: any; onDelete: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);

  const statusColor =
    project.status === 'complete' ? 'var(--green)' :
    project.status === 'failed'   ? 'var(--red)'   :
    project.status === 'ready'    ? 'var(--accent)' :
    'var(--yellow)';

  const outputs: any[] = project.outputs || [];
  const previewOutput = outputs.find((o: any) => ['png', 'jpg', 'jpeg'].includes(o.type?.toLowerCase()));
  const nonPreviewOutputs = outputs.filter((o: any) => !['png', 'jpg', 'jpeg'].includes(o.type?.toLowerCase()));
  const allOutputs = [...nonPreviewOutputs, ...outputs.filter((o: any) => ['png', 'jpg', 'jpeg'].includes(o.type?.toLowerCase()))];

  // Derive output folder type from the first output
  const folderTarget = outputs[0]?.engine === 'canva' ? 'canva_outputs'
    : outputs[0]?.engine === 'indesign' ? 'outputs'
    : 'outputs';

  function openFolder() {
    window.creativePlatform.openPath(folderTarget);
  }

  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden', background: 'var(--surface-dim)' }}>
      {/* Header row */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setExpanded(e => !e)}
      >
        <Tooltip
          text={
            project.status === 'complete' ? 'Complete — all outputs exported successfully' :
            project.status === 'failed'   ? 'Export failed — expand to see details' :
            project.status === 'ready'    ? 'Ready — content filled, waiting to export' :
            'In progress'
          }
          position="right"
          delay={150}
        >
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
        </Tooltip>
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</strong>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>
            {project.engine} · {project.templateName || project.templateId || '—'} · {new Date(project.createdAt).toLocaleDateString()}
          </span>
        </div>
        {/* Asset count chip */}
        {outputs.length > 0 && (
          <Tooltip text="Number of output files linked to this project" delay={200}>
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
              background: 'var(--eng-canva-bg)', color: 'var(--accent)', flexShrink: 0,
            }}>
              {outputs.length} asset{outputs.length !== 1 ? 's' : ''}
            </span>
          </Tooltip>
        )}
        {confirmDelete ? (
          <button
            onClick={e => { e.stopPropagation(); onDelete(project.id); }}
            style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: 'rgba(255,116,116,.15)', border: '1px solid rgba(255,116,116,.4)', color: 'var(--red)', cursor: 'pointer', flexShrink: 0 }}
          >
            Confirm?
          </button>
        ) : (
          <button
            onClick={e => { e.stopPropagation(); setConfirmDelete(true); setTimeout(() => setConfirmDelete(false), 3000); }}
            title="Delete project"
            style={{ background: 'none', border: 'none', padding: '2px 4px', borderRadius: 4, color: 'var(--muted)', cursor: 'pointer', flexShrink: 0 }}
          >
            <Trash2 size={13} />
          </button>
        )}
        <Tooltip text="Expand to see linked output files and preview" delay={150}>
          {expanded ? <ChevronDown size={14} color="var(--muted)" /> : <ChevronRight size={14} color="var(--muted)" />}
        </Tooltip>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--line)', padding: '12px 16px' }}>

          {/* PNG preview thumbnail */}
          {previewOutput && (
            <div style={{ marginBottom: 12 }}>
              <img
                src={`file://${previewOutput.path}`}
                alt="Preview"
                style={{
                  width: '100%', maxHeight: 200, objectFit: 'contain',
                  borderRadius: 6, border: '1px solid var(--line)',
                  background: 'var(--surface-emph)', display: 'block',
                  cursor: 'zoom-in',
                }}
                onClick={() => setPreviewSrc(`file://${previewOutput.path}`)}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              <p style={{ margin: '4px 0 0', fontSize: 10, color: 'var(--muted)', textAlign: 'center' }}>
                {previewOutput.label || 'Preview'} — {previewOutput.name} <span style={{ opacity: .5 }}>(click to enlarge)</span>
              </p>
            </div>
          )}
          {previewSrc && (
            <ImagePreviewModal
              src={previewSrc}
              alt={previewOutput?.name}
              onClose={() => setPreviewSrc(null)}
            />
          )}

          {/* Output file list */}
          {allOutputs.length > 0 ? (
            <div>
              {allOutputs.map((o: any) => <OutputRow key={o.path ?? o.name ?? o.label} output={o} />)}
            </div>
          ) : (
            <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--muted)' }}>
              {project.notes
                ? project.notes
                : 'No outputs linked yet. Run an export to generate files.'}
            </p>
          )}

          {/* Folder shortcut */}
          <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
            <button
              className="secondary"
              style={{ fontSize: 11, padding: '4px 10px' }}
              onClick={openFolder}
              title="Open the workspace outputs folder in Finder"
            >
              <FolderOpen size={11} /> Open Outputs Folder
            </button>
            {outputs.length > 0 && (
              <button
                className="secondary"
                style={{ fontSize: 11, padding: '4px 10px' }}
                onClick={() => window.creativePlatform.revealFile(outputs[0].path)}
                title="Reveal the first linked file in Finder"
              >
                <FolderSearch size={11} /> Reveal in Finder
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── main screen ───────────────────────────────────────────────────────────────

export function ProjectsScreen() {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState('');

  async function load() {
    setLoading(true);
    try { setProjects(await window.creativePlatform.listProjects() || []); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  function handleCreated() {
    setCreating(false);
    load();
  }

  async function handleDelete(id: string) {
    const res = await window.creativePlatform.deleteProject(id);
    if (res?.ok !== false) {
      toast('Project deleted.', 'success');
      load();
    }
  }

  const sorted = [...projects].sort((a, b) =>
    new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()
  );
  const q = query.toLowerCase().trim();
  const visible = q
    ? sorted.filter(p =>
        p.name?.toLowerCase().includes(q) ||
        p.engine?.toLowerCase().includes(q) ||
        (p.templateName || '').toLowerCase().includes(q)
      )
    : sorted;

  const completeCount = projects.filter(p => p.status === 'complete').length;
  const totalAssets = projects.reduce((sum, p) => sum + (p.outputs?.length || 0), 0);

  return (
    <section className="panel">
      <h2><FolderOpen size={22} /> Projects</h2>

      {/* Summary stats */}
      {projects.length > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          {[
            { label: 'Total',       value: projects.length, tip: 'Total number of projects in the workspace' },
            { label: 'Complete',    value: completeCount,   tip: 'Projects that have been exported successfully' },
            { label: 'Live Assets', value: totalAssets,     tip: 'Total output files linked across all projects' },
          ].map(s => (
            <Tooltip key={s.label} text={s.tip} position="bottom" display="block">
              <div style={{
                padding: '6px 12px', borderRadius: 6,
                background: 'var(--surface-dim)', border: '1px solid var(--line)',
                display: 'flex', gap: 6, alignItems: 'baseline',
              }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>{s.value}</span>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{s.label}</span>
              </div>
            </Tooltip>
          ))}
          <Tooltip text="Open the workspace outputs folder in Finder" delay={200}>
            <button className="secondary" style={{ fontSize: 11, padding: '4px 10px', marginLeft: 'auto' }}
              onClick={() => window.creativePlatform.openPath('outputs')}>
              <FolderOpen size={11} /> Open Outputs
            </button>
          </Tooltip>
        </div>
      )}

      <div className="button-row" style={{ marginBottom: 8 }}>
        <Tooltip text="Create a new project — select a template, fill content, and export in one flow" position="bottom">
          <button onClick={() => setCreating(c => !c)}>
            <Plus size={15} /> New from Template
          </button>
        </Tooltip>
        <Tooltip text="Reload the project list from the workspace" delay={200}>
          <button className="secondary" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
          </button>
        </Tooltip>
        {projects.length > 0 && (
          <input
            className="field-input"
            style={{ flex: 1, maxWidth: 240, fontSize: 12, padding: '5px 10px' }}
            placeholder="Search projects…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        )}
      </div>

      {creating && (
        <NewProjectPanel onCreated={handleCreated} onCancel={() => setCreating(false)} />
      )}

      {sorted.length === 0 && !creating && (
        <div className="empty-state">
          <FolderPlus size={48} className="empty-state-icon" />
          <h3>No projects yet</h3>
          <p>Click "New from Template" to create your first project.</p>
        </div>
      )}
      {sorted.length > 0 && visible.length === 0 && (
        <div className="empty-state">
          <SearchX size={40} className="empty-state-icon" />
          <h3>No projects match "{query}"</h3>
          <p>Try a different search term.</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {visible.map(p => <ProjectCard key={p.id} project={p} onDelete={handleDelete} />)}
      </div>
    </section>
  );
}
