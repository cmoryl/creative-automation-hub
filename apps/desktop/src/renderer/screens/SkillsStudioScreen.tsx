import { useEffect, useState } from 'react';
import {
  ArrowLeft, Bot, ChevronRight, Download, Edit2, FileText, Loader,
  Package, Plus, Save, Trash2, Upload, Wand2, Zap,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

interface SkillField { key: string; label: string; required: boolean; maxChars?: number; }

interface SkillManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  category: string;
  triggers: string[];
  engines: string[];
  brandAware: boolean;
  created?: string;
  updated?: string;
  _folder?: string;
}

interface SkillFull {
  manifest: SkillManifest;
  systemPrompt: string;
  userTemplate: string;
  readme: string;
  fields: Record<string, SkillField[]>;
  exampleInput?: any;
  exampleOutput?: any;
}

const ENGINE_ORDER = ['illustrator', 'indesign', 'canva', 'adobe_express', 'figma'] as const;
const ENGINE_LABELS: Record<string, string> = {
  illustrator: 'Illustrator', indesign: 'InDesign', canva: 'Canva',
  adobe_express: 'Adobe Express', figma: 'Figma',
};
const ENGINE_COLORS: Record<string, { fg: string; bg: string; border: string }> = {
  illustrator:   { fg: 'var(--eng-illo)',  bg: 'var(--eng-illo-bg)',  border: 'var(--eng-illo-bd)'  },
  indesign:      { fg: 'var(--eng-indd)',  bg: 'var(--eng-indd-bg)',  border: 'var(--eng-indd-bd)'  },
  canva:         { fg: 'var(--eng-canva)', bg: 'var(--eng-canva-bg)', border: 'var(--eng-canva-bd)' },
  adobe_express: { fg: 'var(--eng-expr)',  bg: 'var(--eng-expr-bg)',  border: 'var(--eng-expr-bd)'  },
  figma:         { fg: 'var(--eng-figma)', bg: 'var(--eng-figma-bg)', border: 'var(--eng-figma-bd)' },
};
const CATEGORIES = ['Marketing', 'Sales', 'Product', 'Events', 'Social', 'Internal', 'Other'];

const BLANK_MANIFEST: SkillManifest = {
  id: '', name: '', version: '1.0.0', description: '', author: '',
  category: 'Marketing', triggers: [''], engines: [], brandAware: true,
};

const DEFAULT_SYSTEM = `You are a creative content strategist embedded in the Creative Automation Platform.

Your job: generate precise, publication-ready marketing copy from a campaign brief for a specific template.

Rules:
- Extract facts, metrics, and language FROM the brief first
- Generate professional, brand-aligned content for fields the brief doesn't explicitly cover
- Strictly respect character limits
- Return ONLY a valid JSON object with the exact field keys — no markdown fences, no explanation`;

const DEFAULT_USER_TEMPLATE = `Generate content for {{engine}} template{{#templateName}} ({{templateName}}){{/templateName}}.

Brand: {{brand_name}}
{{#brand_description}}Brand context: {{brand_description}}{{/brand_description}}

Campaign brief:
"{{brief}}"

Fields to populate:
{{field_list}}

Return a JSON object with these exact keys.`;

// ── Blank skill builder ────────────────────────────────────────────────────────

function blankSkill(): SkillFull {
  return {
    manifest: { ...BLANK_MANIFEST },
    systemPrompt: DEFAULT_SYSTEM,
    userTemplate: DEFAULT_USER_TEMPLATE,
    readme: '',
    fields: Object.fromEntries(ENGINE_ORDER.map(e => [e, []])),
  };
}

// ── Field row editor ───────────────────────────────────────────────────────────

function FieldEditor({ fields, onChange }: { fields: SkillField[]; onChange: (f: SkillField[]) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {fields.map((f, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 60px 80px auto', gap: 6, alignItems: 'center' }}>
          <input
            placeholder="FIELD_KEY"
            value={f.key}
            onChange={e => { const n = [...fields]; n[i] = { ...n[i], key: e.target.value.toUpperCase().replace(/\s/g, '_') }; onChange(n); }}
            style={{ background: 'var(--surface-emph)', border: '1px solid var(--line)', borderRadius: 6, padding: '5px 8px', color: 'var(--text)', fontSize: 11, fontFamily: 'monospace' }}
          />
          <input
            placeholder="Label"
            value={f.label}
            onChange={e => { const n = [...fields]; n[i] = { ...n[i], label: e.target.value }; onChange(n); }}
            style={{ background: 'var(--surface-emph)', border: '1px solid var(--line)', borderRadius: 6, padding: '5px 8px', color: 'var(--text)', fontSize: 11 }}
          />
          <input
            type="number"
            placeholder="Max"
            value={f.maxChars ?? ''}
            onChange={e => { const n = [...fields]; n[i] = { ...n[i], maxChars: e.target.value ? Number(e.target.value) : undefined }; onChange(n); }}
            style={{ background: 'var(--surface-emph)', border: '1px solid var(--line)', borderRadius: 6, padding: '5px 8px', color: 'var(--text)', fontSize: 11 }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--muted)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={f.required}
              onChange={e => { const n = [...fields]; n[i] = { ...n[i], required: e.target.checked }; onChange(n); }}
            />
            Required
          </label>
          <button onClick={() => onChange(fields.filter((_, j) => j !== i))}
            style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', padding: 4 }}>
            <Trash2 size={12} />
          </button>
        </div>
      ))}
      <button onClick={() => onChange([...fields, { key: '', label: '', required: false }])}
        style={{ alignSelf: 'flex-start', fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px dashed var(--line)', background: 'none', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
        <Plus size={11} /> Add field
      </button>
    </div>
  );
}

// ── Skill card (library view) ─────────────────────────────────────────────────

function SkillCard({ skill, onEdit, onDelete, onExport }: {
  skill: SkillManifest;
  onEdit: () => void;
  onDelete: () => void;
  onExport: () => void;
}) {
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  return (
    <div style={{
      padding: '14px 16px', borderRadius: 14, border: '1px solid var(--line)',
      background: 'var(--surface-dim)', display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: (skill as any).master ? 'var(--eng-illo-bg)' : 'rgba(79,134,240,.1)', border: `1px solid ${(skill as any).master ? 'var(--eng-illo-bd)' : 'rgba(79,134,240,.2)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Wand2 size={14} style={{ color: (skill as any).master ? 'var(--eng-illo)' : 'var(--accent)' }} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{skill.name}</span>
              {(skill as any).master && (
                <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.06em', padding: '1px 5px', borderRadius: 3, background: 'var(--eng-illo-bg)', color: 'var(--eng-illo)', border: '1px solid var(--eng-illo-bd)', textTransform: 'uppercase' }}>MASTER</span>
              )}
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>v{skill.version} · {skill.category}</div>
          </div>
        </div>
        <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: skill.brandAware ? 'rgba(117,245,174,.1)' : 'var(--surface-mid)', color: skill.brandAware ? 'var(--green)' : 'var(--muted)', border: `1px solid ${skill.brandAware ? 'rgba(117,245,174,.25)' : 'var(--border-subtle)'}`, flexShrink: 0 }}>
          {skill.brandAware ? 'Brand-aware' : 'Generic'}
        </span>
      </div>

      <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>{skill.description || 'No description'}</p>

      {skill.triggers?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {skill.triggers.filter(Boolean).map(t => (
            <span key={t} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: 'var(--surface-mid)', color: 'var(--accent)', border: '1px solid var(--border-subtle)' }}>"{t}"</span>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {skill.engines?.map(e => {
          const ec = ENGINE_COLORS[e];
          return ec ? (
            <span key={e} style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.03em', padding: '2px 8px', borderRadius: 4, background: ec.bg, color: ec.fg, border: `1px solid ${ec.border}` }}>
              {ENGINE_LABELS[e] ?? e}
            </span>
          ) : (
            <span key={e} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: 'var(--surface-mid)', color: 'var(--muted)', border: '1px solid var(--border-subtle)' }}>
              {ENGINE_LABELS[e] ?? e}
            </span>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center' }}>
        {/* Edit */}
        <button
          onClick={onEdit}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            fontSize: 11, fontWeight: 700, padding: '7px 0', borderRadius: 8,
            background: 'rgba(79,134,240,.12)', outline: '1.5px solid rgba(79,134,240,.35)',
            color: 'var(--accent)', cursor: 'pointer', border: 'none',
          }}
        >
          <Edit2 size={11} /> Edit
        </button>
        {/* Export .zip */}
        <button
          onClick={async () => { setExporting(true); await onExport(); setExporting(false); }}
          disabled={exporting}
          title="Export as .zip"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            fontSize: 11, fontWeight: 600, padding: '7px 12px', borderRadius: 8,
            background: 'var(--surface-mid)', outline: '1px solid var(--border-subtle)',
            color: 'var(--muted)', cursor: exporting ? 'not-allowed' : 'pointer',
            border: 'none', opacity: exporting ? .6 : 1,
          }}
        >
          {exporting ? <Loader size={11} className="spin" /> : <Download size={11} />}
          {!exporting && <span>Export</span>}
        </button>
        {/* Delete */}
        <button
          onClick={async () => { setDeleting(true); await onDelete(); setDeleting(false); }}
          disabled={deleting}
          title="Delete skill"
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 32, height: 32, borderRadius: 8, padding: 0,
            background: 'rgba(201,60,60,.08)', outline: '1px solid rgba(201,60,60,.22)',
            color: 'var(--red)', cursor: deleting ? 'not-allowed' : 'pointer',
            border: 'none', opacity: deleting ? .6 : 1, flexShrink: 0,
          }}
        >
          {deleting ? <Loader size={11} className="spin" /> : <Trash2 size={11} />}
        </button>
      </div>
    </div>
  );
}

// ── Skill editor (multi-step wizard) ──────────────────────────────────────────

const STEPS = ['Metadata', 'Prompts', 'Engines & Fields', 'Preview & Save'] as const;
type Step = typeof STEPS[number];

function SkillEditor({ initial, onSave, onCancel }: {
  initial: SkillFull;
  onSave: (skill: SkillFull) => Promise<void>;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<Step>('Metadata');
  const [skill, setSkill] = useState<SkillFull>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const stepIdx = STEPS.indexOf(step);
  const setM = (patch: Partial<SkillManifest>) => setSkill(s => ({ ...s, manifest: { ...s.manifest, ...patch } }));

  async function save() {
    if (!skill.manifest.name.trim()) { setError('Skill name is required.'); return; }
    if (skill.manifest.triggers.filter(Boolean).length === 0) { setError('At least one trigger phrase is required.'); return; }
    setSaving(true);
    setError('');
    try { await onSave(skill); } catch (e: any) { setError(e.message); }
    setSaving(false);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, height: '100%' }}>
      {/* Step bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '0 0 18px 0', borderBottom: '1px solid var(--line)', marginBottom: 22 }}>
        <button onClick={onCancel} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: '4px 8px 4px 0', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, marginRight: 12 }}>
          <ArrowLeft size={13} /> Library
        </button>
        {STEPS.map((s, i) => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            {i > 0 && <ChevronRight size={13} style={{ color: 'var(--line)', margin: '0 4px' }} />}
            <button onClick={() => setStep(s)} style={{
              fontSize: 12, padding: '4px 10px', borderRadius: 20,
              background: s === step ? 'rgba(103,216,255,.12)' : 'none',
              color: s === step ? 'var(--accent)' : i < stepIdx ? 'var(--text)' : 'var(--muted)',
              border: s === step ? '1px solid rgba(103,216,255,.25)' : '1px solid transparent',
              fontWeight: s === step ? 700 : 400,
              cursor: 'pointer',
            }}>{s}</button>
          </div>
        ))}
      </div>

      {/* Step content */}
      <div style={{ flex: 1, overflowY: 'auto', paddingRight: 2 }}>
        {step === 'Metadata' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="field-group">
              <label>Skill Name <span style={{ color: 'var(--red)' }}>*</span></label>
              <input className="field-input" placeholder="e.g. Case Study Generator" value={skill.manifest.name}
                onChange={e => setM({ name: e.target.value })} />
            </div>
            <div className="field-group">
              <label>Description</label>
              <textarea className="field-input" rows={2} placeholder="What does this skill do?" value={skill.manifest.description}
                onChange={e => setM({ description: e.target.value })}
                style={{ resize: 'none', fontFamily: 'inherit' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field-group" style={{ marginBottom: 0 }}>
                <label>Category</label>
                <select value={skill.manifest.category} onChange={e => setM({ category: e.target.value })}
                  style={{ background: 'var(--surface-emph)', border: '1px solid var(--line)', borderRadius: 8, padding: '7px 10px', color: 'var(--text)', fontSize: 13, width: '100%' }}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="field-group" style={{ marginBottom: 0 }}>
                <label>Version</label>
                <input className="field-input" value={skill.manifest.version}
                  onChange={e => setM({ version: e.target.value })} />
              </div>
            </div>
            <div className="field-group">
              <label>Author</label>
              <input className="field-input" placeholder="Your name or team" value={skill.manifest.author ?? ''}
                onChange={e => setM({ author: e.target.value })} />
            </div>
            <div className="field-group" style={{ marginBottom: 0 }}>
              <label>Trigger phrases <span style={{ color: 'var(--red)' }}>*</span> <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 11 }}>— Claude detects these in chat to activate this skill</span></label>
              {skill.manifest.triggers.map((t, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  <input className="field-input" style={{ flex: 1, marginBottom: 0 }} placeholder={`e.g. "generate case study"`} value={t}
                    onChange={e => { const tr = [...skill.manifest.triggers]; tr[i] = e.target.value; setM({ triggers: tr }); }} />
                  {skill.manifest.triggers.length > 1 && (
                    <button onClick={() => setM({ triggers: skill.manifest.triggers.filter((_, j) => j !== i) })}
                      style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: '0 6px' }}>
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              ))}
              <button onClick={() => setM({ triggers: [...skill.manifest.triggers, ''] })}
                style={{ alignSelf: 'flex-start', fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px dashed var(--line)', background: 'none', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                <Plus size={11} /> Add trigger
              </button>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={skill.manifest.brandAware}
                onChange={e => setM({ brandAware: e.target.checked })} />
              Brand-aware — inject active brand name and description into every prompt
            </label>
          </div>
        )}

        {step === 'Prompts' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Bot size={12} style={{ color: 'var(--accent)' }} /> System Prompt
                <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 400 }}>— Claude's instructions and persona for this skill</span>
              </div>
              <textarea value={skill.systemPrompt}
                onChange={e => setSkill(s => ({ ...s, systemPrompt: e.target.value }))}
                rows={10}
                style={{ width: '100%', background: 'var(--surface-emph)', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', color: 'var(--text)', fontSize: 12, fontFamily: 'monospace', resize: 'vertical', lineHeight: 1.6, boxSizing: 'border-box', outline: 'none' }}
              />
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <FileText size={12} style={{ color: 'var(--accent)' }} /> User Prompt Template
                <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 400 }}>— variables: {'{{brief}}'}, {'{{brand_name}}'}, {'{{brand_description}}'}, {'{{engine}}'}, {'{{templateName}}'}, {'{{field_list}}'}</span>
              </div>
              <textarea value={skill.userTemplate}
                onChange={e => setSkill(s => ({ ...s, userTemplate: e.target.value }))}
                rows={10}
                style={{ width: '100%', background: 'var(--surface-emph)', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', color: 'var(--text)', fontSize: 12, fontFamily: 'monospace', resize: 'vertical', lineHeight: 1.6, boxSizing: 'border-box', outline: 'none' }}
              />
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>README <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 11 }}>— shown on skill card and in exported package</span></div>
              <textarea value={skill.readme}
                onChange={e => setSkill(s => ({ ...s, readme: e.target.value }))}
                rows={4} placeholder="Describe how to use this skill, what briefs work best, example inputs…"
                style={{ width: '100%', background: 'var(--surface-emph)', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', color: 'var(--text)', fontSize: 12, resize: 'vertical', lineHeight: 1.6, boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none' }}
              />
            </div>
          </div>
        )}

        {step === 'Engines & Fields' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
                Toggle engines this skill targets, then define the fields Claude should populate for each.
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                {ENGINE_ORDER.map(e => {
                  const active = skill.manifest.engines.includes(e);
                  const ec = ENGINE_COLORS[e];
                  return (
                    <button key={e} onClick={() => setM({
                      engines: active ? skill.manifest.engines.filter(x => x !== e) : [...skill.manifest.engines, e],
                    })} style={{
                      fontSize: 11, fontWeight: active ? 700 : 400,
                      padding: '5px 14px', borderRadius: 20, cursor: 'pointer', border: 'none',
                      background: active ? ec.bg : 'var(--surface-dim)',
                      color: active ? ec.fg : 'var(--muted)',
                      outline: `1.5px solid ${active ? ec.border : 'var(--border-subtle)'}`,
                      transition: 'background .12s, color .12s, outline-color .12s',
                    }}>{ENGINE_LABELS[e]}</button>
                  );
                })}
              </div>
            </div>
            {ENGINE_ORDER.filter(e => skill.manifest.engines.includes(e)).map(eng => {
              const ec = ENGINE_COLORS[eng];
              return (
                <div key={eng} style={{ padding: '12px 14px', borderRadius: 12, border: `1px solid ${ec.border}`, background: ec.bg }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: ec.fg, marginBottom: 10 }}>{ENGINE_LABELS[eng]} fields</div>
                  <FieldEditor
                    fields={skill.fields[eng] ?? []}
                    onChange={f => setSkill(s => ({ ...s, fields: { ...s.fields, [eng]: f } }))}
                  />
                </div>
              );
            })}
            {skill.manifest.engines.length === 0 && (
              <div style={{ textAlign: 'center', padding: 32, color: 'var(--muted)', fontSize: 13 }}>
                Select at least one engine above to define fields.
              </div>
            )}
          </div>
        )}

        {step === 'Preview & Save' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ padding: '14px 16px', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface-dim)' }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{skill.manifest.name || '(no name)'}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>v{skill.manifest.version} · {skill.manifest.category}{skill.manifest.author ? ` · ${skill.manifest.author}` : ''}</div>
              <div style={{ fontSize: 12, color: 'var(--text)', marginBottom: 10, lineHeight: 1.5 }}>{skill.manifest.description}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                {skill.manifest.triggers.filter(Boolean).map(t => (
                  <span key={t} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: 'var(--surface-mid)', color: 'var(--accent)', border: '1px solid var(--border-subtle)' }}>"{t}"</span>
                ))}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {skill.manifest.engines.map(e => {
                  const ec = ENGINE_COLORS[e];
                  return ec ? (
                    <span key={e} style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: ec.bg, color: ec.fg, border: `1px solid ${ec.border}` }}>
                      {ENGINE_LABELS[e] ?? e} · {(skill.fields[e] ?? []).length} field{(skill.fields[e] ?? []).length !== 1 ? 's' : ''}
                    </span>
                  ) : (
                    <span key={e} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: 'var(--surface-mid)', color: 'var(--muted)', border: '1px solid var(--border-subtle)' }}>
                      {e} · {(skill.fields[e] ?? []).length} fields
                    </span>
                  );
                })}
              </div>
            </div>

            <div style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid var(--line)', background: 'rgba(0,0,0,.15)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6, color: 'var(--muted)' }}>SYSTEM PROMPT PREVIEW</div>
              <pre style={{ margin: 0, fontSize: 11, color: 'var(--text)', whiteSpace: 'pre-wrap', lineHeight: 1.6, maxHeight: 140, overflowY: 'auto' }}>{skill.systemPrompt.slice(0, 400)}{skill.systemPrompt.length > 400 ? '…' : ''}</pre>
            </div>

            {error && (
              <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(255,80,80,.08)', border: '1px solid rgba(255,80,80,.2)', color: 'var(--red)', fontSize: 12 }}>
                {error}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16, borderTop: '1px solid var(--line)', marginTop: 16 }}>
        <button onClick={() => setStep(STEPS[Math.max(0, stepIdx - 1)])} disabled={stepIdx === 0}
          style={{ fontSize: 12, padding: '6px 14px', borderRadius: 8, opacity: stepIdx === 0 ? .35 : 1 }}>
          ← Back
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          {step !== 'Preview & Save' ? (
            <button onClick={() => setStep(STEPS[stepIdx + 1])}
              style={{ fontSize: 12, padding: '6px 16px', borderRadius: 8 }}>
              Next →
            </button>
          ) : (
            <button onClick={save} disabled={saving}
              style={{ fontSize: 12, padding: '6px 18px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              {saving ? <Loader size={12} className="spin" /> : <Save size={12} />}
              Save Skill
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export function SkillsStudioScreen() {
  const [skills, setSkills] = useState<SkillManifest[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<SkillFull | null>(null);
  const [importing, setImporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [toast, setToast] = useState('');

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  }

  async function load() {
    setLoading(true);
    // Seed master skills first (no-op if already present)
    await window.creativePlatform.seedMasterSkills();
    const r: any = await window.creativePlatform.listSkills();
    // Sort: master skills first, then alphabetical
    const sorted = (r.skills ?? []).sort((a: any, b: any) => {
      if (a.master && !b.master) return -1;
      if (!a.master && b.master) return 1;
      return (a.name ?? '').localeCompare(b.name ?? '');
    });
    setSkills(sorted);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleRestoreDefaults() {
    setRestoring(true);
    // Delete all master skills then re-seed fresh copies
    const masterIds = skills.filter((s: any) => s.master).map((s: any) => s.id ?? s._folder);
    for (const id of masterIds) {
      await window.creativePlatform.deleteSkill(id);
    }
    await window.creativePlatform.seedMasterSkills();
    showToast('Master skills restored to defaults.');
    setRestoring(false);
    load();
  }

  async function handleNew() {
    setEditing(blankSkill());
  }

  async function handleEdit(id: string) {
    const r: any = await window.creativePlatform.getSkill(id);
    if (r.ok) setEditing(r.skill);
  }

  async function handleSave(skill: SkillFull) {
    const r: any = await window.creativePlatform.saveSkill({
      manifest: skill.manifest,
      systemPrompt: skill.systemPrompt,
      userTemplate: skill.userTemplate,
      readme: skill.readme,
      fields: skill.fields,
    });
    if (!r.ok) throw new Error(r.message);
    setEditing(null);
    showToast(`Skill "${skill.manifest.name}" saved.`);
    load();
  }

  async function handleDelete(id: string, name: string) {
    const r: any = await window.creativePlatform.deleteSkill(id);
    if (r.ok) { showToast(`"${name}" deleted.`); load(); }
  }

  async function handleExport(id: string) {
    const r: any = await window.creativePlatform.exportSkillZip(id);
    if (r.ok) showToast(`Exported to ${r.path}`);
    else if (r.message !== 'Cancelled') showToast(`Export failed: ${r.message}`);
  }

  async function handleImport() {
    setImporting(true);
    const r: any = await window.creativePlatform.importSkillZip();
    setImporting(false);
    if (r.ok) { showToast(`Imported "${r.manifest?.name ?? r.id}".`); load(); }
    else if (r.message !== 'Cancelled') showToast(`Import failed: ${r.message}`);
  }

  if (editing) {
    return (
      <div style={{ padding: '28px 32px', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
        <SkillEditor initial={editing} onSave={handleSave} onCancel={() => setEditing(null)} />
      </div>
    );
  }

  return (
    <div style={{ padding: '28px 32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 22 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <Package size={20} style={{ color: 'var(--accent)' }} />
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, letterSpacing: '-.02em' }}>Skills Studio</h1>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
            Build, manage, and export Claude AI skills — reusable prompt packages with field mappings and trigger phrases.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button onClick={handleRestoreDefaults} disabled={restoring}
            style={{ fontSize: 12, padding: '7px 14px', borderRadius: 9, background: 'var(--eng-illo-bg)', border: '1px solid var(--eng-illo-bd)', color: 'var(--eng-illo)', display: 'flex', alignItems: 'center', gap: 6 }}>
            {restoring ? <Loader size={12} className="spin" /> : <Wand2 size={12} />} Restore defaults
          </button>
          <button onClick={handleImport} disabled={importing}
            style={{ fontSize: 12, padding: '7px 14px', borderRadius: 9, background: 'var(--surface-mid)', display: 'flex', alignItems: 'center', gap: 6 }}>
            {importing ? <Loader size={12} className="spin" /> : <Upload size={12} />} Import .zip
          </button>
          <button onClick={handleNew}
            style={{ fontSize: 12, padding: '7px 14px', borderRadius: 9, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={12} /> New Skill
          </button>
        </div>
      </div>

      {/* How it works */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 24 }}>
        {[
          { icon: Zap, title: 'Trigger-based', desc: 'Claude detects trigger phrases in chat and activates the matching skill automatically.' },
          { icon: Bot, title: 'Custom prompts', desc: 'Each skill has its own system prompt, overriding the default for that generation run.' },
          { icon: Download, title: 'Portable packages', desc: 'Export as .zip and share with teammates. Import on any machine to reuse instantly.' },
        ].map(c => (
          <div key={c.title} style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid var(--line)', background: 'rgba(103,216,255,.03)', display: 'flex', gap: 10 }}>
            <c.icon size={14} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 3 }}>{c.title}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>{c.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Skill library */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--muted)', fontSize: 13, padding: 32 }}>
          <Loader size={14} className="spin" /> Loading skills…
        </div>
      ) : skills.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 32px', border: '1px dashed var(--line)', borderRadius: 16 }}>
          <Package size={36} style={{ opacity: .2, marginBottom: 12 }} />
          <div style={{ fontSize: 14, fontWeight: 600, opacity: .5, marginBottom: 6 }}>No skills yet</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 20 }}>Create your first skill or import a .zip package.</div>
          <button onClick={handleNew} style={{ fontSize: 13, padding: '8px 20px', borderRadius: 10, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Plus size={13} /> Create your first skill
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {skills.map(s => (
            <SkillCard key={s.id ?? s._folder}
              skill={s}
              onEdit={() => handleEdit(s.id ?? s._folder ?? '')}
              onDelete={() => handleDelete(s.id ?? s._folder ?? '', s.name)}
              onExport={() => handleExport(s.id ?? s._folder ?? '')}
            />
          ))}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10,
          padding: '10px 18px', fontSize: 12, color: 'var(--text)', zIndex: 9999,
          boxShadow: '0 8px 32px rgba(0,0,0,.4)',
        }}>{toast}</div>
      )}
    </div>
  );
}
