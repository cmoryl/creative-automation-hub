import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronRight,
  Clock, Download, Edit2, ExternalLink, FileText, FolderOpen,
  Layers, Package, RefreshCw, Sparkles, Zap, Boxes,
} from 'lucide-react';
import { usePlatformStore } from '../state/usePlatformStore';
import { toast } from '../components/Toast';
import { ContentPresets } from '../components/ContentPresets';
import { VersionHistoryPanel } from '../components/VersionHistoryPanel';
import { saveVersion, GenerationVersion } from '../hooks/useVersionHistory';

// ─── Field definitions per engine ───────────────────────────────────────────

interface BriefField { key: string; label: string; required: boolean; maxChars?: number; }

/** Derive brief fields from a template's manifest editable_objects. Returns null if no manifest. */
function fieldLabelBrief(key: string) {
  return key.replace(/^(TEXT_|DOC_|IMAGE_|SECTION_|STAT_)/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
function getManifestBriefFields(template: any): BriefField[] | null {
  const objs = template?.manifest?.editable_objects ?? template?.editableObjects;
  if (!objs || typeof objs !== 'object') return null;
  const fields = (Object.entries(objs) as [string, any][])
    .filter(([, v]) => !v.type || v.type === 'text')
    .map(([key, v]) => ({ key, label: fieldLabelBrief(key), required: !!v.required, maxChars: v.max_chars as number | undefined }));
  return fields.length > 0 ? fields : null;
}

/** Fallback field definitions used when no manifest is available (e.g. Figma, Canva without manifest). */
const ENGINE_FIELDS: Record<string, BriefField[]> = {
  illustrator: [
    { key: 'TEXT_TITLE',     label: 'Title / Headline', required: true,  maxChars: 120 },
    { key: 'TEXT_CHALLENGE', label: 'Challenge',        required: true,  maxChars: 600 },
    { key: 'TEXT_SOLUTION',  label: 'Solution',         required: true,  maxChars: 600 },
    { key: 'TEXT_RESULTS',   label: 'Results',          required: true,  maxChars: 600 },
    { key: 'TEXT_STAT_01',   label: 'Stat 1',           required: false, maxChars: 30  },
    { key: 'TEXT_STAT_02',   label: 'Stat 2',           required: false, maxChars: 30  },
    { key: 'TEXT_STAT_03',   label: 'Stat 3',           required: false, maxChars: 30  },
  ],
  indesign: [
    { key: 'DOC_TITLE',                  label: 'Document Title',       required: true,  maxChars: 120  },
    { key: 'SECTION_EXECUTIVE_SUMMARY',  label: 'Executive Summary',    required: true,  maxChars: 800  },
    { key: 'SECTION_BODY',               label: 'Body Content',         required: false, maxChars: 1200 },
    { key: 'SECTION_CHALLENGE',          label: 'Challenge Section',    required: false, maxChars: 600  },
    { key: 'SECTION_SOLUTION',           label: 'Solution Section',     required: false, maxChars: 600  },
  ],
  canva: [
    { key: 'HEADLINE',    label: 'Headline',      required: true,  maxChars: 80  },
    { key: 'SUBHEADLINE', label: 'Sub-headline',  required: false, maxChars: 150 },
    { key: 'BODY_COPY',   label: 'Body Copy',     required: false, maxChars: 400 },
    { key: 'CTA_TEXT',    label: 'Call to Action',required: false, maxChars: 40  },
    { key: 'STAT_01',     label: 'Stat 1',        required: false, maxChars: 30  },
    { key: 'STAT_02',     label: 'Stat 2',        required: false, maxChars: 30  },
  ],
  adobe_express: [
    { key: 'HEADLINE',    label: 'Headline',      required: true,  maxChars: 80  },
    { key: 'SUBHEADLINE', label: 'Sub-headline',  required: false, maxChars: 150 },
    { key: 'BODY_TEXT',   label: 'Body Text',     required: false, maxChars: 400 },
    { key: 'CTA',         label: 'Call to Action',required: false, maxChars: 40  },
  ],
  figma: [
    { key: 'TEXT_TITLE',    label: 'Title',       required: true,  maxChars: 120 },
    { key: 'TEXT_SUBTITLE', label: 'Sub-title',   required: false, maxChars: 180 },
    { key: 'TEXT_BODY',     label: 'Body',        required: false, maxChars: 600 },
    { key: 'TEXT_CTA',      label: 'CTA',         required: false, maxChars: 40  },
    { key: 'STAT_01',       label: 'Stat 1',      required: false, maxChars: 60  },
    { key: 'STAT_02',       label: 'Stat 2',      required: false, maxChars: 60  },
  ],
};

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

const ENGINE_ORDER = ['illustrator', 'indesign', 'canva', 'adobe_express', 'figma'] as const;
type EngineKey = typeof ENGINE_ORDER[number];

type EngineStatus = 'no_template' | 'idle' | 'filling' | 'ready' | 'generating' | 'done' | 'error';

interface EngineState {
  included: boolean;
  status: EngineStatus;
  content: Record<string, string>;
  error?: string;
  output?: any;
  expanded: boolean;
}

function blankEngineState(hasTemplate: boolean): EngineState {
  return {
    included: hasTemplate,
    status: hasTemplate ? 'idle' : 'no_template',
    content: {},
    expanded: false,
  };
}

// ─── CSV template download ───────────────────────────────────────────────────

const CSV_HEADERS = [
  'output_name', 'company_name', 'tagline', 'headline', 'subheadline',
  'body_copy', 'challenge_body', 'solution_body', 'results_body',
  'cta_text',
  'stat_01_value', 'stat_01_label',
  'stat_02_value', 'stat_02_label',
  'stat_03_value', 'stat_03_label',
  'client_quote', 'client_name', 'client_title', 'client_company',
];

const CSV_DESCRIPTIONS = [
  'File name for all outputs (no spaces)',
  'Brand or company name',
  'Brand tagline or sub-headline',
  'Primary headline for all assets',
  'Secondary headline',
  'Main body paragraph',
  'Challenge section (what problem did the client face?)',
  'Solution section (how did you solve it?)',
  'Results section (measurable outcomes)',
  'Call-to-action button text',
  'First stat value (e.g. 68%)', 'First stat label (e.g. Faster Time-to-Market)',
  'Second stat value', 'Second stat label',
  'Third stat value', 'Third stat label',
  'Client testimonial quote (include quotes)',
  'Client first and last name',
  'Client job title',
  'Client company name',
];

const CSV_EXAMPLE = [
  'TransPerfect_CaseStudy_v001',
  'TransPerfect',
  'The Language of Global Business',
  'Powering Global Connections at Scale',
  'The world\'s leading language and technology solutions provider',
  'With 30+ years of expertise TransPerfect delivers seamless multilingual content across 90+ markets and 170+ languages.',
  'Manual translation workflows created costly delays and quality inconsistencies across 90+ global markets impeding time-to-market.',
  'Our AI-powered GlobalLink platform unified all translation workflows enabling real-time collaboration automated QA and seamless CMS integration.',
  '68% reduction in time-to-market · 40% cost savings · 99.8% quality score across 12M+ translated words annually.',
  'Get Started Today',
  '68%', 'Faster Time-to-Market',
  '40%', 'Cost Reduction',
  '99.8%', 'Quality Score',
  '"TransPerfect transformed our global content operations. The ROI was immediate and measurable."',
  'Sarah Chen',
  'Chief Marketing Officer',
  'Fortune 500 Retail Brand',
];

function csvEscape(v: string) {
  if (v.includes(',') || v.includes('"') || v.includes('\n') || v.includes('\t')) {
    return '"' + v.replace(/"/g, '""') + '"';
  }
  return v;
}

function downloadBriefTemplate() {
  const rows = [
    // Row 1: headers
    CSV_HEADERS.join(','),
    // Row 2: descriptions (as a comment row prefixed with #)
    '# ' + CSV_DESCRIPTIONS.map(csvEscape).join(','),
    // Row 3: TransPerfect example
    CSV_EXAMPLE.map(csvEscape).join(','),
  ];
  const csv = rows.join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'creative_automation_master_brief_template.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('CSV template downloaded.');
}

// ─── Engine card ──────────────────────────────────────────────────────────────

function statusColor(s: EngineStatus) {
  if (s === 'done')       return 'var(--green)';
  if (s === 'error')      return 'var(--red)';
  if (s === 'generating') return 'var(--accent)';
  if (s === 'ready')      return 'var(--green)';
  if (s === 'filling')    return 'var(--accent)';
  return 'var(--muted)';
}

function statusLabel(s: EngineStatus) {
  if (s === 'no_template') return 'No template assigned';
  if (s === 'idle')        return 'Waiting for brief';
  if (s === 'filling')     return 'Claude filling…';
  if (s === 'ready')       return 'Fields ready';
  if (s === 'generating')  return 'Generating…';
  if (s === 'done')        return 'Done';
  if (s === 'error')       return 'Error';
  return s;
}

interface EngineCardProps {
  engine: EngineKey;
  state: EngineState;
  templateName?: string;
  template?: any;
  onChange: (patch: Partial<EngineState>) => void;
}

function EngineCard({ engine, state, templateName, template, onChange }: EngineCardProps) {
  const fields = getManifestBriefFields(template) ?? ENGINE_FIELDS[engine] ?? [];
  const disabled = state.status === 'no_template';
  const isRunning = state.status === 'filling' || state.status === 'generating';

  const ec = ENGINE_COLORS[engine];

  return (
    <div style={{
      border: `1px solid ${state.included && !disabled ? ec.border : 'var(--line)'}`,
      borderRadius: 10, background: 'var(--panel)',
      opacity: disabled ? 0.45 : 1,
      transition: 'opacity .15s, border-color .15s',
    }}>
      {/* Header */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', cursor: disabled ? 'default' : 'pointer' }}
        onClick={() => { if (!disabled) onChange({ expanded: !state.expanded }); }}
      >
        {/* Include toggle */}
        {!disabled && (
          <div
            onClick={e => { e.stopPropagation(); onChange({ included: !state.included }); }}
            style={{ width: 28, height: 16, borderRadius: 99, background: state.included ? ec.fg : 'var(--line)', position: 'relative', flexShrink: 0, cursor: 'pointer', transition: 'background .15s' }}
          >
            <div style={{ position: 'absolute', top: 2, left: state.included ? 14 : 2, width: 12, height: 12, borderRadius: '50%', background: 'var(--bg)', transition: 'left .15s' }} />
          </div>
        )}

        <span style={{ fontWeight: 700, fontSize: 13, flex: 1, color: !disabled ? ec.fg : 'var(--muted)' }}>{ENGINE_LABELS[engine]}</span>

        {templateName && (
          <span style={{ fontSize: 11, color: 'var(--muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {templateName}
          </span>
        )}

        <span style={{ fontSize: 11, color: statusColor(state.status), display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {state.status === 'done' && <CheckCircle2 size={11} />}
          {state.status === 'error' && <AlertTriangle size={11} />}
          {isRunning && <RefreshCw size={11} className="spin" />}
          {statusLabel(state.status)}
        </span>

        {!disabled && (
          state.expanded ? <ChevronDown size={13} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                         : <ChevronRight size={13} style={{ color: 'var(--muted)', flexShrink: 0 }} />
        )}
      </div>

      {/* Expanded fields */}
      {state.expanded && !disabled && (
        <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--line)' }}>
          {state.status === 'error' && state.error && (
            <div style={{ margin: '10px 0', padding: '8px 10px', borderRadius: 6, background: 'rgba(255,116,116,.08)', border: '1px solid rgba(255,116,116,.2)', color: 'var(--red)', fontSize: 12 }}>
              <AlertTriangle size={12} style={{ marginRight: 5 }} />{state.error}
            </div>
          )}
          {state.status === 'done' && state.output && (
            <div style={{ margin: '10px 0', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(117,245,174,.2)', background: 'rgba(117,245,174,.04)' }}>
              <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--green)', borderBottom: (state.output.canvaUrl || state.output.editorUrl || state.output.figmaUrl) ? '1px solid rgba(117,245,174,.12)' : 'none' }}>
                <CheckCircle2 size={13} />
                {state.output.mode === 'handoff' ? `Handoff ready · ${state.output.operationCount ?? 0} fields applied` : 'Export complete'}
              </div>
              {(state.output.canvaUrl || state.output.editorUrl || state.output.figmaUrl) && (
                <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  {state.output.canvaUrl && (
                    <a href={state.output.canvaUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6, background: 'var(--eng-canva-bg)', border: '1px solid var(--eng-canva-bd)', color: 'var(--eng-canva)', textDecoration: 'none' }}>
                      <ExternalLink size={10} /> Open in Canva
                    </a>
                  )}
                  {state.output.editorUrl && (
                    <a href={state.output.editorUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6, background: 'var(--eng-expr-bg)', border: '1px solid var(--eng-expr-bd)', color: 'var(--eng-expr)', textDecoration: 'none' }}>
                      <ExternalLink size={10} /> Open in Adobe Express
                    </a>
                  )}
                  {state.output.figmaUrl && (
                    <a href={state.output.figmaUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6, background: 'var(--eng-figma-bg)', border: '1px solid var(--eng-figma-bd)', color: 'var(--eng-figma)', textDecoration: 'none' }}>
                      <ExternalLink size={10} /> Open in Figma
                    </a>
                  )}
                </div>
              )}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
            {fields.map(f => (
              <div key={f.key}>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--muted)', marginBottom: 3 }}>
                  {f.label}{f.required && <span style={{ color: 'var(--red)', marginLeft: 3 }}>*</span>}
                  {f.maxChars && <span style={{ marginLeft: 6, opacity: .6 }}>max {f.maxChars}</span>}
                </label>
                {(f.maxChars ?? 0) > 100 ? (
                  <textarea
                    className="field-input"
                    rows={3}
                    value={state.content[f.key] || ''}
                    onChange={e => onChange({ content: { ...state.content, [f.key]: e.target.value } })}
                    disabled={isRunning}
                    style={{ resize: 'vertical', minHeight: 60 }}
                  />
                ) : (
                  <input
                    className="field-input"
                    value={state.content[f.key] || ''}
                    onChange={e => onChange({ content: { ...state.content, [f.key]: e.target.value } })}
                    disabled={isRunning}
                    style={{ padding: '6px 8px', fontSize: 12 }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── File type badge ──────────────────────────────────────────────────────────

const FILE_TYPE_COLORS: Record<string, { fg: string; bg: string; border: string }> = {
  ai:    { fg: 'var(--eng-illo)',  bg: 'var(--eng-illo-bg)',  border: 'var(--eng-illo-bd)'  },
  pdf:   { fg: 'var(--eng-indd)',    bg: 'var(--eng-indd-bg)',    border: 'var(--eng-indd-bd)'    },
  png:   { fg: 'var(--eng-canva)', bg: 'var(--eng-canva-bg)', border: 'var(--eng-canva-bd)' },
  indd:  { fg: 'var(--eng-indd)',    bg: 'var(--eng-indd-bg)',    border: 'var(--eng-indd-bd)'    },
  json:  { fg: 'var(--muted)',     bg: 'var(--surface-mid)',  border: 'var(--border-subtle)' },
};

function FileTypeBadge({ ext }: { ext: string }) {
  const c = FILE_TYPE_COLORS[ext.toLowerCase()] ?? { fg: 'var(--muted)', bg: 'var(--surface-mid)', border: 'var(--border-subtle)' };
  return (
    <span style={{
      fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4, letterSpacing: '.04em',
      background: c.bg, border: `1px solid ${c.border}`, color: c.fg, flexShrink: 0,
    }}>
      {ext.toUpperCase()}
    </span>
  );
}

// ─── Generated Kit panel ──────────────────────────────────────────────────────

interface KitFile {
  id: string;
  name: string;
  path: string;
  type: string;
  engine: string;
  createdAt: string;
}

interface GeneratedKitProps {
  files: KitFile[];
  engineStates: Record<EngineKey, EngineState>;
  outputName: string;
}

function GeneratedKit({ files, engineStates, outputName }: GeneratedKitProps) {
  // Separate local files from web handoffs
  const localFiles = files.filter(f => f.type !== 'json' || f.engine === 'illustrator' || f.engine === 'indesign');
  const doneEngines = ENGINE_ORDER.filter(e => engineStates[e].status === 'done');

  function revealFile(path: string) {
    window.creativePlatform.revealFile(path);
  }

  function revealFolder() {
    window.creativePlatform.openPath('outputs');
  }

  // Group files by engine
  const byEngine: Record<string, KitFile[]> = {};
  for (const f of files) {
    if (!byEngine[f.engine]) byEngine[f.engine] = [];
    byEngine[f.engine].push(f);
  }

  // Add web engine entries even if no local files
  for (const eng of doneEngines) {
    const output = engineStates[eng].output;
    if (output && (output.canvaUrl || output.editorUrl || output.figmaUrl || output.jobPath)) {
      if (!byEngine[eng]) byEngine[eng] = [];
    }
  }

  const hasContent = doneEngines.length > 0;
  if (!hasContent) return null;

  return (
    <div style={{
      marginBottom: 20,
      borderRadius: 12, overflow: 'hidden',
      border: '1px solid rgba(117,245,174,.25)',
      background: 'rgba(117,245,174,.03)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '13px 16px', borderBottom: '1px solid rgba(117,245,174,.12)',
        background: 'rgba(117,245,174,.04)',
      }}>
        <Package size={15} style={{ color: 'var(--green)', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Generated Kit</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
            {outputName} · {doneEngines.length} engine{doneEngines.length !== 1 ? 's' : ''} · {localFiles.length} local file{localFiles.length !== 1 ? 's' : ''}
          </div>
        </div>
        <button
          onClick={revealFolder}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600,
            padding: '5px 12px', borderRadius: 7, cursor: 'pointer', border: 'none',
            background: 'rgba(117,245,174,.1)', outline: '1px solid rgba(117,245,174,.3)', color: 'var(--green)',
          }}
        >
          <FolderOpen size={11} /> Reveal All
        </button>
      </div>

      {/* Engine rows */}
      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {doneEngines.map(eng => {
          const ec = ENGINE_COLORS[eng];
          const engFiles = byEngine[eng] || [];
          const output = engineStates[eng].output;
          const webUrl = output?.canvaUrl || output?.editorUrl || output?.figmaUrl;
          const nonJobFiles = engFiles.filter(f => !f.name.endsWith('.job.json'));

          return (
            <div key={eng} style={{
              borderRadius: 8, overflow: 'hidden',
              border: `1px solid ${ec.border}`,
              background: ec.bg,
            }}>
              {/* Engine header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: ec.fg, flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: ec.fg, flex: 1 }}>{ENGINE_LABELS[eng]}</span>
                {webUrl ? (
                  <a
                    href={webUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600,
                      padding: '3px 10px', borderRadius: 6, textDecoration: 'none',
                      background: ec.bg, border: `1px solid ${ec.border}`, color: ec.fg,
                    }}
                  >
                    <ExternalLink size={9} /> Open in {ENGINE_LABELS[eng]}
                  </a>
                ) : nonJobFiles.length === 0 ? (
                  <span style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>files processing…</span>
                ) : null}
              </div>

              {/* File list */}
              {nonJobFiles.length > 0 && (
                <div style={{ borderTop: `1px solid ${ec.border}`, background: 'var(--surface-dim)' }}>
                  {nonJobFiles.map(f => (
                    <div key={f.id} style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px',
                      borderBottom: '1px solid var(--border-dim)',
                    }}>
                      <FileTypeBadge ext={f.type} />
                      <span style={{ flex: 1, fontSize: 11, color: 'var(--text)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {f.name}
                      </span>
                      <button
                        onClick={() => revealFile(f.path)}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600,
                          padding: '3px 9px', borderRadius: 5, cursor: 'pointer', border: 'none', flexShrink: 0,
                          background: 'rgba(128,128,128,.12)', outline: '1px solid rgba(128,128,128,.2)', color: 'var(--muted)',
                        }}
                      >
                        <FolderOpen size={9} /> Reveal
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export function BrandGenerateScreen({ onNavigate }: { onNavigate?: (s: string) => void } = {}) {
  const [brands, setBrands]           = useState<any[]>([]);
  const [activeBrandId, setActiveBrandId] = useState<string | null>(null);
  const [allTemplates, setAllTemplates] = useState<any[]>([]);
  const [brief, setBrief]             = useState('');
  const [outputName, setOutputName]   = useState('');
  const [filling, setFilling]         = useState(false);
  const [generating, setGenerating]   = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [outputKit, setOutputKit]     = useState<any[]>([]);
  const generationStartTs             = useRef<number>(0);
  const refreshBrand = usePlatformStore(s => s.refreshBrand);

  const [engineStates, setEngineStates] = useState<Record<EngineKey, EngineState>>(() =>
    Object.fromEntries(ENGINE_ORDER.map(e => [e, blankEngineState(false)])) as Record<EngineKey, EngineState>
  );

  // Track brand for reset without stale closure
  const activeBrandRef = useRef<any>(null);

  function load() {
    Promise.all([
      window.creativePlatform.listBrands(),
      window.creativePlatform.listTemplates(),
    ]).then(([br, tmpl]) => {
      const brandList = br.brands || [];
      const activeId = br.activeId || (brandList[0]?.id ?? null);
      setBrands(brandList);
      setActiveBrandId(activeId);
      setAllTemplates(tmpl || []);
      if (activeId) applyBrand(brandList.find((b: any) => b.id === activeId) || null, tmpl || []);
    });
  }

  useEffect(() => { load(); }, []);

  function applyBrand(brand: any, templates: any[]) {
    activeBrandRef.current = brand;
    if (!brand) return;
    const tpls = brand.templates || {};
    setEngineStates(prev => {
      const next = { ...prev };
      for (const eng of ENGINE_ORDER) {
        const hasTemplate = !!tpls[eng];
        next[eng] = { ...blankEngineState(hasTemplate), expanded: prev[eng]?.expanded ?? false };
      }
      return next;
    });
    if (brand.name && !outputName) {
      setOutputName(brand.name.replace(/\s+/g, '_') + '_v001');
    }
  }

  function handleBrandChange(id: string) {
    setActiveBrandId(id);
    const brand = brands.find(b => b.id === id);
    applyBrand(brand || null, allTemplates);
  }

  function patchEngine(eng: EngineKey, patch: Partial<EngineState>) {
    setEngineStates(prev => ({ ...prev, [eng]: { ...prev[eng], ...patch } }));
  }

  function templateFor(eng: EngineKey) {
    const brand = brands.find(b => b.id === activeBrandId);
    const tid = brand?.templates?.[eng];
    return allTemplates.find(t => t.id === tid);
  }

  // ── Fill all engines from brief ──────────────────────────────────────────

  async function fillAll() {
    if (!brief.trim()) return;
    setFilling(true);

    const brand = brands.find(b => b.id === activeBrandId);
    const enginesNeeded = ENGINE_ORDER.filter(e => engineStates[e].included);

    // Mark all as filling
    for (const eng of enginesNeeded) patchEngine(eng, { status: 'filling', expanded: true });

    await Promise.all(enginesNeeded.map(async (eng) => {
      try {
        const tmplObj = templateFor(eng);
        const claudeFields = getManifestBriefFields(tmplObj) ?? ENGINE_FIELDS[eng] ?? [];
        const res = await window.creativePlatform.claudeFillFields({
          brief: brief.trim(),
          fields: claudeFields,
          engine: eng,
          templateName: tmplObj?.name,
          brandContext: brand ? { name: brand.name, description: brand.description, guidelines: brand.guidelines, industry: brand.industry } : undefined,
        });
        if (res.ok) {
          patchEngine(eng, { status: 'ready', content: res.content });
        } else {
          patchEngine(eng, { status: 'error', error: res.message || 'Fill failed' });
        }
      } catch (e: any) {
        patchEngine(eng, { status: 'error', error: e.message || 'Unexpected error' });
      }
    }));

    setFilling(false);
    toast('Fields filled — review and generate.');
  }

  // ── Generate all selected engines ─────────────────────────────────────────

  async function generateAll() {
    const enginesReady = ENGINE_ORDER.filter(e => engineStates[e].included && engineStates[e].status === 'ready');
    if (enginesReady.length === 0) { toast('Fill fields first, then generate.', 'error'); return; }
    setGenerating(true);
    setOutputKit([]);
    generationStartTs.current = Date.now();

    await Promise.all(enginesReady.map(async (eng) => {
      patchEngine(eng, { status: 'generating' });
      const tmpl = templateFor(eng);
      const content = engineStates[eng].content;
      const base = outputName || 'output';
      try {
        let res: any;
        if (eng === 'illustrator') {
          res = await window.creativePlatform.runIllustratorCustom({ template: tmpl?.id, content, output_name: `${base}_illustrator` });
        } else if (eng === 'indesign') {
          res = await window.creativePlatform.runInDesignCustom({ template: tmpl?.id, content, output_name: `${base}_indesign` });
        } else if (eng === 'canva') {
          res = await window.creativePlatform.runCanvaJob({ templateId: tmpl?.id, content, outputName: `${base}_canva` });
        } else if (eng === 'adobe_express') {
          res = await window.creativePlatform.runAdobeExpressJob({ templateId: tmpl?.id, templateUrn: tmpl?.adobeTemplateUrn, editorUrl: tmpl?.adobeEditorUrl, content, outputName: `${base}_adobe_express` });
        } else if (eng === 'figma') {
          res = await window.creativePlatform.runFigmaJob({ figmaFileKey: tmpl?.figmaFileKey, figmaNodeId: tmpl?.figmaNodeId, content, outputName: `${base}_figma` });
        }
        if (res?.ok) {
          patchEngine(eng, { status: 'done', output: res });
        } else {
          patchEngine(eng, { status: 'error', error: res?.userMessage || res?.message || 'Generation failed' });
        }
      } catch (e: any) {
        patchEngine(eng, { status: 'error', error: e.message || 'Unexpected error' });
      }
    }));

    refreshBrand();
    setGenerating(false);

    // ── Load output file kit ──────────────────────────────────────────────
    try {
      const allOutputs: any[] = await window.creativePlatform.listOutputs();
      const sinceTs = generationStartTs.current - 5000; // 5s buffer
      const fresh = allOutputs.filter((f: any) => {
        const fts = new Date(f.createdAt).getTime();
        return fts >= sinceTs;
      });
      setOutputKit(fresh);
    } catch { /* non-critical */ }

    // ── Record version snapshot ───────────────────────────────────────────
    const activeBrand = brands.find(b => b.id === activeBrandId);
    if (activeBrandId && activeBrand) {
      const engineSnapshot: GenerationVersion['engines'] = {};
      for (const eng of ENGINE_ORDER) {
        const st = engineStates[eng];
        if (!st.included) continue;
        engineSnapshot[eng] = {
          status: st.status === 'done' ? 'done' : st.status === 'error' ? 'error' : 'skipped',
          templateId: templateFor(eng)?.id,
          fields: { ...st.content },
          outputRef: st.output?.outputPath,
          error: st.error,
        };
      }
      saveVersion({
        brandId:    activeBrandId,
        brand:      { id: activeBrand.id, name: activeBrand.name, color: activeBrand.color || 'var(--accent)' },
        brief,
        outputName: outputName || 'output',
        engines:    engineSnapshot,
      });
    }

    const doneCount = ENGINE_ORDER.filter(e => engineStates[e].status === 'done').length;
    toast(`Generation complete — v${doneCount > 0 ? '' : ''}check Outputs for your files.`);
  }

  // ─── Derived ──────────────────────────────────────────────────────────────

  const activeBrand = brands.find(b => b.id === activeBrandId);
  const includedEngines  = ENGINE_ORDER.filter(e => engineStates[e].included);
  const readyEngines     = ENGINE_ORDER.filter(e => engineStates[e].status === 'ready');
  const doneEngines      = ENGINE_ORDER.filter(e => engineStates[e].status === 'done');
  const canFill          = brief.trim().length > 0 && includedEngines.length > 0 && !filling && !generating;
  const canGenerate      = readyEngines.length > 0 && !generating;

  const progressTotal    = includedEngines.length;
  const progressDone     = doneEngines.length;

  return (
    <div style={{ padding: '32px 36px', maxWidth: 860 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Layers size={20} style={{ color: 'var(--accent)' }} /> Brand Generate
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>
            Fill one brief, generate live files across every engine simultaneously.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {onNavigate && (
            <button
              onClick={() => onNavigate('Brand Batch')}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 12, borderRadius: 8, background: 'rgba(117,245,174,.08)', border: '1px solid rgba(117,245,174,.25)', color: 'var(--green)', cursor: 'pointer' }}
            >
              <Boxes size={13} /> Run as Batch
            </button>
          )}
          <button
            onClick={downloadBriefTemplate}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 12, borderRadius: 8, background: 'none', border: '1px solid var(--line)', color: 'var(--muted)', cursor: 'pointer' }}
          >
            <Download size={13} /> Download CSV Template
          </button>
        </div>
      </div>

      {/* Brand selector */}
      <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: '16px 18px', marginBottom: 20 }}>
        <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 8 }}>Active Brand</label>
        {brands.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>No brands found — create one in Brand Profiles first.</p>
        ) : (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {brands.map(b => (
              <button
                key={b.id}
                onClick={() => handleBrandChange(b.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500,
                  background: activeBrandId === b.id ? 'rgba(79,134,240,.12)' : 'var(--bg)',
                  border: `1px solid ${activeBrandId === b.id ? 'rgba(79,134,240,.4)' : 'var(--line)'}`,
                  color: activeBrandId === b.id ? 'var(--accent)' : 'var(--text)',
                  cursor: 'pointer',
                }}
              >
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: b.color || 'var(--accent)', flexShrink: 0 }} />
                {b.name}
                {b.isMaster && <span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 700 }}>MASTER</span>}
              </button>
            ))}
          </div>
        )}

        {/* Engine coverage chips */}
        {activeBrand && (
          <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
            {ENGINE_ORDER.map(eng => {
              const assigned = !!activeBrand.templates?.[eng];
              const ec = ENGINE_COLORS[eng];
              return (
                <span key={eng} style={{
                  fontSize: 11, padding: '3px 9px', borderRadius: 5,
                  background: assigned ? ec.bg : 'var(--surface-dim)',
                  color: assigned ? ec.fg : 'var(--muted)',
                  border: `1px solid ${assigned ? ec.border : 'var(--border-subtle)'}`,
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontWeight: assigned ? 600 : 400,
                }}>
                  {assigned && <span style={{ fontSize: 9 }}>✓</span>}
                  {ENGINE_LABELS[eng]}
                </span>
              );
            })}
            {includedEngines.length === 0 && (
              <span style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>
                No templates assigned to this brand yet — go to Brand Profiles to assign templates.
              </span>
            )}
          </div>
        )}
      </div>

      {/* Output name + Brief */}
      <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: '18px 18px 16px', marginBottom: 20 }}>
        {/* Output name */}
        <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 5 }}>Output Name</label>
        <input
          className="field-input"
          value={outputName}
          onChange={e => setOutputName(e.target.value)}
          placeholder="e.g. TransPerfect_CaseStudy_v001"
          style={{ marginBottom: 16, padding: '7px 10px', fontSize: 13 }}
        />

        {/* Brief */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
          <label style={{ fontSize: 12, color: 'var(--muted)' }}>
            <FileText size={12} style={{ marginRight: 5 }} />Master Brief
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <ContentPresets
              storageKey="brief"
              content={brief}
              onLoad={v => setBrief(v)}
              disabled={filling || generating}
            />
            <button
              onClick={() => setBrief('TransPerfect, the global leader in language and technology solutions, helped a Fortune 500 retailer reduce time-to-market by 68% and cut translation costs by 40% using the GlobalLink platform. The client faced manual, fragmented translation workflows across 90 markets and 170 languages. TransPerfect unified everything into one AI-powered system with automated QA and CMS integration. Stats: 68% faster time-to-market, 40% cost reduction, 99.8% quality score. Client quote: "TransPerfect transformed our global content operations. The ROI was immediate." — Sarah Chen, CMO. CTA: Get Started Today.')}
              style={{ fontSize: 11, padding: '4px 10px', borderRadius: 5, background: 'rgba(79,134,240,.1)', border: '1px solid rgba(79,134,240,.25)', color: 'var(--accent)', cursor: 'pointer' }}
            >
              Example
            </button>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>{brief.length} chars</span>
          </div>
        </div>
        <textarea
          className="field-input"
          rows={6}
          value={brief}
          onChange={e => setBrief(e.target.value)}
          placeholder={`Describe the content for all engines in plain language.\n\nExample: "TransPerfect, the global leader in language and technology solutions, reduced a Fortune 500 retailer's time-to-market by 68% and cut translation costs by 40% using GlobalLink. The client faced manual workflows across 90 markets. Their CMO: 'The ROI was immediate.' CTA: Get Started Today."`}
          disabled={filling || generating}
          style={{ resize: 'vertical', minHeight: 120 }}
        />

        {/* Fill button */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12 }}>
          <button
            onClick={fillAll}
            disabled={!canFill}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', fontSize: 13 }}
          >
            {filling
              ? <><RefreshCw size={13} className="spin" /> Filling {includedEngines.length} engines…</>
              : <><Sparkles size={13} /> Fill All Engines with Claude</>
            }
          </button>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>
            Fills {includedEngines.length} engine{includedEngines.length !== 1 ? 's' : ''} simultaneously · review fields before generating
          </span>
        </div>
      </div>

      {/* Engine panels */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Edit2 size={12} /> Engine Fields
          <span style={{ marginLeft: 4 }}>
            {readyEngines.length > 0 && `${readyEngines.length} ready · `}
            {doneEngines.length > 0 && `${doneEngines.length} done · `}
            Toggle engines on/off with the switch on each row
          </span>
        </div>
        {ENGINE_ORDER.map(eng => (
          <EngineCard
            key={eng}
            engine={eng}
            state={engineStates[eng]}
            templateName={templateFor(eng)?.name}
            template={templateFor(eng)}
            onChange={patch => patchEngine(eng, patch)}
          />
        ))}
      </div>

      {/* Generated Kit */}
      {(outputKit.length > 0 || doneEngines.length > 0) && (
        <GeneratedKit
          files={outputKit}
          engineStates={engineStates}
          outputName={outputName || 'output'}
        />
      )}

      {/* Generate bar */}
      <div style={{
        position: 'sticky', bottom: 0,
        background: 'var(--panel)', border: '1px solid var(--line)',
        borderRadius: 10, padding: '14px 18px',
        display: 'flex', alignItems: 'center', gap: 12,
        boxShadow: '0 -8px 24px rgba(0,0,0,.3)',
      }}>
        <button
          onClick={generateAll}
          disabled={!canGenerate || generating}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 22px', fontSize: 14, fontWeight: 600, flexShrink: 0 }}
        >
          {generating
            ? <><RefreshCw size={14} className="spin" /> Generating…</>
            : <><Zap size={14} /> Generate {readyEngines.length > 0 ? readyEngines.length : includedEngines.length} Live File{(readyEngines.length || includedEngines.length) !== 1 ? 's' : ''}</>
          }
        </button>

        {/* Version history button */}
        <button
          onClick={() => setHistoryOpen(true)}
          title="Version history"
          className="secondary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 12, fontWeight: 600, flexShrink: 0 }}
        >
          <Clock size={13}/> History
        </button>

        {/* Progress */}
        {(generating || progressDone > 0) && (
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>
              <span>{progressDone} / {progressTotal} engines complete</span>
            </div>
            <div style={{ height: 4, borderRadius: 2, background: 'var(--line)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 2,
                background: 'var(--accent)',
                width: `${progressTotal > 0 ? (progressDone / progressTotal) * 100 : 0}%`,
                transition: 'width .4s ease',
              }} />
            </div>
          </div>
        )}

        {!generating && progressDone === 0 && (
          <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 'auto', flexShrink: 0 }}>
            Fill brief → review fields → generate
          </span>
        )}
      </div>

      {/* Version history panel */}
      <VersionHistoryPanel
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        brandId={activeBrandId}
        onRestore={(v) => {
          // Restore brief
          setBrief(v.brief);
          // Restore field values per engine
          setEngineStates(prev => {
            const next = { ...prev };
            for (const [eng, result] of Object.entries(v.engines)) {
              const key = eng as keyof typeof next;
              if (next[key] && result.fields) {
                next[key] = { ...next[key], content: { ...result.fields }, status: 'ready' };
              }
            }
            return next;
          });
          toast(`Restored v${v.versionNum}${v.label ? ` — ${v.label}` : ''} · review fields then generate.`);
        }}
      />
    </div>
  );
}
