import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, AlertTriangle, ArrowRight, Bot, Boxes, Building2, CheckCircle2,
  ChevronDown, ChevronRight, Circle, ExternalLink, Figma, FileImage,
  FileText, FolderOpen, FolderSearch, Image, Key, Layers, Loader,
  Moon, PenTool, Plus, RefreshCw, Rocket, Save, Send, Shield,
  Sparkles, Sun, LayoutDashboard, Zap, Package,
} from 'lucide-react';
import { Tooltip } from './components/Tooltip';
import { usePlatformStore } from './state/usePlatformStore';
import { IllustratorScreen } from './screens/IllustratorScreen';
import { TemplatesScreen } from './screens/TemplatesScreen';
import { DiagnosticsScreen } from './screens/DiagnosticsScreen';
import { CanvaScreen } from './screens/CanvaScreen';
import { AdobeExpressScreen } from './screens/AdobeExpressScreen';
import { BatchScreen } from './screens/BatchScreen';
import { ProjectsScreen } from './screens/ProjectsScreen';
import { InDesignScreen } from './screens/InDesignScreen';
import { FigmaScreen } from './screens/FigmaScreen';
import { BrandsScreen } from './screens/BrandsScreen';
import { BrandGenerateScreen } from './screens/BrandGenerateScreen';
import { BrandBatchScreen } from './screens/BrandBatchScreen';
import { SkillsStudioScreen } from './screens/SkillsStudioScreen';
import { MondayScreen } from './screens/MondayScreen';
import { ToastContainer } from './components/Toast';

// ── nav structure ─────────────────────────────────────────────────────────────

const NAV_GROUPS = [
  {
    label: 'Workspace',
    items: [
      { id: 'Dashboard',     icon: LayoutDashboard, label: 'Dashboard'    },
      { id: 'Brands',        icon: Building2,       label: 'Brands'       },
      { id: 'Generate',      icon: Zap,             label: 'Generate'     },
      { id: 'Brand Batch',   icon: Boxes,           label: 'Brand Batch'  },
      { id: 'Projects',      icon: FolderOpen,      label: 'Projects'     },
      { id: 'Outputs',       icon: Boxes,           label: 'Outputs'      },
    ],
  },
  {
    label: 'Engines',
    items: [
      { id: 'Illustrator',   icon: PenTool,   label: 'Illustrator',   statusKey: 'illustrator', accent: '#ffd76c' },
      { id: 'InDesign',      icon: FileText,  label: 'InDesign',      statusKey: 'indesign',    accent: '#ff8c42' },
      { id: 'Canva',         icon: Sparkles,  label: 'Canva',         statusKey: 'canva',       accent: '#67d8ff' },
      { id: 'Adobe Express', icon: Layers,    label: 'Adobe Express',                           accent: '#ff6432' },
      { id: 'Figma',         icon: Figma,     label: 'Figma',         statusKey: 'figma',       accent: '#a259ff' },
      { id: 'Batch',         icon: Boxes,     label: 'Batch',                                   accent: '#75f5ae' },
    ],
  },
  {
    label: 'Tools',
    items: [
      { id: 'Templates',      icon: FileImage,  label: 'Templates'     },
      { id: 'Claude',         icon: Bot,        label: 'Claude AI'     },
      { id: 'Skills Studio',  icon: Package,    label: 'Skills Studio' },
      { id: 'Diagnostics',    icon: Activity,   label: 'Diagnostics'   },
    ],
  },
];

// ── wizard step definitions ───────────────────────────────────────────────────

type CheckState = 'idle' | 'checking' | 'pass' | 'fail' | 'manual';

interface WizardStep {
  id: string;
  title: string;
  detail: string;
  tag: string;
  tagColor: string;
  navTarget: string | null;
  systemActions?: { label: string; path: string }[];
  checkMode: 'auto' | 'manual';
  manualNote?: string;
}

const WIZARD_STEPS: WizardStep[] = [
  {
    id: 'permissions',
    title: 'Approve macOS permissions',
    detail: 'Grant Automation, Full Disk Access, and Accessibility so the platform can control Illustrator and InDesign.',
    tag: 'System', tagColor: 'var(--muted)', navTarget: null,
    checkMode: 'manual',
    manualNote: 'Cannot be verified automatically — open System Settings and confirm the toggles are on.',
    systemActions: [
      { label: 'Automation',      path: 'automation'    },
      { label: 'Full Disk Access', path: 'fullDisk'     },
      { label: 'Accessibility',   path: 'accessibility' },
    ],
  },
  {
    id: 'illustrator',
    title: 'Connect Illustrator',
    detail: 'Preflight checks that Illustrator is running and can receive automation commands.',
    tag: 'Illustrator', tagColor: 'var(--yellow)', navTarget: 'Illustrator',
    checkMode: 'auto',
  },
  {
    id: 'indesign',
    title: 'Connect InDesign',
    detail: 'Preflight checks that InDesign is running and the document engine can receive jobs.',
    tag: 'InDesign', tagColor: '#ff8c42', navTarget: 'InDesign',
    checkMode: 'auto',
  },
  {
    id: 'canva',
    title: 'Connect Canva',
    detail: 'Checks whether a Canva API token or OAuth credentials are stored.',
    tag: 'Canva', tagColor: 'var(--accent)', navTarget: 'Canva',
    checkMode: 'auto',
  },
  {
    id: 'adobe_express',
    title: 'Register an Adobe Express template',
    detail: 'Checks whether any Adobe Express templates are registered.',
    tag: 'Adobe Express', tagColor: '#ff6432', navTarget: 'Adobe Express',
    checkMode: 'auto',
  },
  {
    id: 'figma',
    title: 'Connect Figma',
    detail: 'Checks whether a Figma Personal Access Token is saved and at least one Figma file is registered.',
    tag: 'Figma', tagColor: '#A259FF', navTarget: 'Figma',
    checkMode: 'auto',
  },
  {
    id: 'templates',
    title: 'Confirm template library',
    detail: 'Checks that at least one template is registered across any engine.',
    tag: 'Templates', tagColor: 'var(--muted)', navTarget: 'Templates',
    checkMode: 'auto',
  },
  {
    id: 'batch',
    title: 'Run your first batch job',
    detail: 'Add rows manually or import a CSV, select a template, and run a batch.',
    tag: 'Batch', tagColor: 'var(--green)', navTarget: 'Batch',
    checkMode: 'manual',
    manualNote: "Mark done once you've successfully run a batch export.",
  },
  {
    id: 'project',
    title: 'Create your first project',
    detail: 'Projects tie a template, content fields, and engine output together.',
    tag: 'Projects', tagColor: 'var(--green)', navTarget: 'Projects',
    checkMode: 'manual',
    manualNote: "Mark done once you've created and exported your first project.",
  },
];

// ── wizard persistence ────────────────────────────────────────────────────────

const LS_KEY      = 'cap_wizard_steps_v1';
const LS_SEEN_KEY = 'cap_wizard_seen_v1';

function loadDone(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(LS_KEY) || '[]')); } catch { return new Set(); }
}
function saveDone(done: Set<string>) {
  localStorage.setItem(LS_KEY, JSON.stringify([...done]));
  localStorage.setItem(LS_SEEN_KEY, '1');
}
function isReturningUser(): boolean {
  return localStorage.getItem(LS_SEEN_KEY) === '1';
}

// ── setup wizard (full panel, used in sidebar/modal) ─────────────────────────

function SetupWizard({ onNavigate, onClose }: { onNavigate: (s: string) => void; onClose?: () => void }) {
  const [done, setDone]             = useState<Set<string>>(loadDone);
  const [openStep, setOpenStep]     = useState<string | null>(null);
  const [checking, setChecking]     = useState(false);
  const [stepStatus, setStepStatus] = useState<Record<string, CheckState>>({});
  const [stepMsg, setStepMsg]       = useState<Record<string, string>>({});

  function markDone(id: string, value = true) {
    setDone(prev => {
      const next = new Set(prev);
      value ? next.add(id) : next.delete(id);
      saveDone(next);
      return next;
    });
  }

  function toggleDone(id: string) {
    markDone(id, !done.has(id));
    if (!done.has(id)) setStepStatus(p => ({ ...p, [id]: 'idle' }));
  }

  function resetWizard() {
    const empty = new Set<string>();
    saveDone(empty);
    setDone(empty);
    setStepStatus({});
    setStepMsg({});
    localStorage.removeItem(LS_SEEN_KEY);
  }

  async function runAutoCheck() {
    setChecking(true);
    const newDone   = new Set(done);
    const newStatus: Record<string, CheckState> = {};
    const newMsg:    Record<string, string>     = {};

    function update(id: string, state: CheckState, msg = '') {
      newStatus[id] = state; newMsg[id] = msg;
      setStepStatus({ ...newStatus }); setStepMsg({ ...newMsg });
    }

    update('permissions', 'manual', 'Open System Settings → Privacy & Security to verify.');

    update('illustrator', 'checking');
    try {
      const live = await window.creativePlatform.liveStatus();
      const illo = live?.illustrator;
      if (illo?.templateExists && illo?.manifestExists) {
        if (illo?.ready) {
          update('illustrator', 'pass', 'Illustrator connected · template and manifest ready.');
        } else {
          update('illustrator', 'pass', 'Template and manifest ready. Open Illustrator before exporting.');
        }
        newDone.add('illustrator');
      } else if (illo?.manifestExists) {
        update('illustrator', 'fail', 'Manifest found but template .ai file is missing. Drop it into engines/illustrator/templates/.');
      } else {
        update('illustrator', 'fail', 'No Illustrator template found. Add a template on the Templates screen.');
      }
    } catch (e: any) { update('illustrator', 'fail', e.message || 'Could not check Illustrator setup.'); }

    update('indesign', 'checking');
    try {
      const live = await window.creativePlatform.liveStatus();
      const id = live?.indesign;
      if (id?.templateExists && id?.manifestExists) {
        if (id?.ready) {
          update('indesign', 'pass', 'InDesign connected · template and manifest ready.');
        } else {
          update('indesign', 'pass', 'Template and manifest ready. Open InDesign before exporting.');
        }
        newDone.add('indesign');
      } else if (id?.manifestExists) {
        update('indesign', 'fail', 'Manifest found but template .indd file is missing. Drop it into engines/indesign/templates/.');
      } else {
        update('indesign', 'fail', 'No InDesign template found. Add a template on the Templates screen.');
      }
    } catch (e: any) { update('indesign', 'fail', e.message || 'Could not check InDesign setup.'); }

    update('canva', 'checking');
    try {
      const r = await window.creativePlatform.getCanvaCredentials();
      if (r.hasToken || r.hasOAuth) { update('canva', 'pass', 'Canva credentials found.'); newDone.add('canva'); }
      else update('canva', 'fail', 'No Canva token found. Enter your token on the Canva screen.');
    } catch (e: any) { update('canva', 'fail', e.message || 'Could not check Canva credentials.'); }

    update('adobe_express', 'checking');
    try {
      const all = await window.creativePlatform.listTemplates();
      const ae  = (all || []).filter((t: any) => t.isAdobeExpress || t.engine === 'adobe_express');
      if (ae.length > 0) { update('adobe_express', 'pass', `${ae.length} template${ae.length !== 1 ? 's' : ''} registered.`); newDone.add('adobe_express'); }
      else update('adobe_express', 'fail', 'No Adobe Express templates found.');
    } catch (e: any) { update('adobe_express', 'fail', e.message || 'Could not load templates.'); }

    update('figma', 'checking');
    try {
      const ft = await window.creativePlatform.getFigmaToken?.();
      const all = await window.creativePlatform.listTemplates();
      const figs = (all || []).filter((t: any) => t.engine === 'figma' || t.isFigma);
      if (ft?.hasToken && figs.length > 0) {
        update('figma', 'pass', `Token saved · ${figs.length} file${figs.length !== 1 ? 's' : ''} registered.`);
        newDone.add('figma');
      } else if (ft?.hasToken) {
        update('figma', 'fail', 'Token saved but no Figma files registered. Add a Figma file on the Figma screen.');
      } else {
        update('figma', 'fail', 'No Figma token found. Enter your Personal Access Token on the Figma screen.');
      }
    } catch (e: any) { update('figma', 'fail', e.message || 'Could not check Figma configuration.'); }

    update('templates', 'checking');
    try {
      const all = await window.creativePlatform.listTemplates();
      if ((all || []).length > 0) { update('templates', 'pass', `${all.length} template${all.length !== 1 ? 's' : ''} registered.`); newDone.add('templates'); }
      else update('templates', 'fail', 'No templates found. Check the engines folder via Templates.');
    } catch (e: any) { update('templates', 'fail', e.message || 'Could not load templates.'); }

    update('batch',   'manual', 'Run a batch export to mark this complete.');
    update('project', 'manual', 'Create and export a project to mark this complete.');

    saveDone(newDone);
    setDone(newDone);

    const failed = Object.entries(newStatus).filter(([, s]) => s === 'fail').map(([id]) => id);
    setOpenStep(failed[0] ?? null);
    setChecking(false);
  }

  const completedCount = done.size;
  const totalCount     = WIZARD_STEPS.length;
  const allDone        = completedCount === totalCount;
  const failCount      = Object.values(stepStatus).filter(s => s === 'fail').length;
  const hasAnyCheck    = Object.keys(stepStatus).length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <Rocket size={16} color={allDone ? 'var(--green)' : 'var(--accent)'} />
        <span style={{ fontWeight: 800, fontSize: 15, flex: 1 }}>
          {allDone ? 'Setup complete' : 'Setup & Configuration'}
        </span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{completedCount}/{totalCount}</span>
        {onClose && (
          <button className="secondary" style={{ fontSize: 11, padding: '3px 10px' }} onClick={onClose}>
            Close
          </button>
        )}
        <button style={{ fontSize: 12, padding: '6px 14px' }} onClick={runAutoCheck} disabled={checking}>
          {checking ? <><Loader size={12} className="spin" /> Checking…</> : <><Zap size={12} /> Auto-Check</>}
        </button>
      </div>

      {/* Progress bar */}
      <div style={{ height: 4, borderRadius: 3, background: 'var(--line)', marginBottom: 16, overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 3, transition: 'width .4s', width: `${Math.round((completedCount / totalCount) * 100)}%`, background: allDone ? 'var(--green)' : failCount > 0 ? 'var(--red)' : 'var(--accent)' }} />
      </div>

      {/* Status banner */}
      {hasAnyCheck && !checking && (
        <div style={{ padding: '9px 14px', borderRadius: 10, marginBottom: 12, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, background: failCount > 0 ? 'rgba(255,116,116,.07)' : 'rgba(117,245,174,.07)', border: `1px solid ${failCount > 0 ? 'rgba(255,116,116,.25)' : 'rgba(117,245,174,.2)'}` }}>
          {failCount > 0
            ? <><AlertTriangle size={13} color="var(--red)" /><span><strong style={{ color: 'var(--red)' }}>{failCount} check{failCount !== 1 ? 's' : ''} failed</strong> — expand below to see what needs attention.</span></>
            : <><CheckCircle2 size={13} color="var(--green)" /><span style={{ color: 'var(--green)' }}><strong>All automated checks passed.</strong></span></>
          }
        </div>
      )}

      {/* Steps */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {WIZARD_STEPS.map(step => {
          const isDone     = done.has(step.id);
          const isOpen     = openStep === step.id;
          const status     = stepStatus[step.id] ?? 'idle';
          const msg        = stepMsg[step.id] ?? '';
          const isChecking = status === 'checking';

          return (
            <div key={step.id} className={`wizard-step${isDone ? ' done' : status === 'fail' ? ' fail' : ''}`}>
              <Tooltip text={isDone ? 'Mark as incomplete' : "Mark complete"} position="right" delay={200}>
                <button className="wizard-step-check"
                  style={{ color: isDone ? 'var(--green)' : status === 'fail' ? 'var(--red)' : 'var(--muted)' }}
                  onClick={() => toggleDone(step.id)} disabled={isChecking}>
                  {isChecking ? <Loader size={16} className="spin" /> : isDone ? <CheckCircle2 size={16} /> : status === 'fail' ? <AlertTriangle size={16} /> : <Circle size={16} style={{ opacity: .35 }} />}
                </button>
              </Tooltip>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <strong style={{ fontSize: 13, flex: 1, textDecoration: isDone ? 'line-through' : 'none', opacity: isDone ? .55 : 1 }}>
                    {step.title}
                  </strong>
                  {!isDone && (
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: step.tagColor, border: `1px solid ${step.tagColor}`, borderRadius: 999, padding: '2px 7px', flexShrink: 0, opacity: .8 }}>
                      {step.tag}
                    </span>
                  )}
                  {status === 'pass' && msg && !isOpen && (
                    <span style={{ fontSize: 11, color: 'var(--green)', opacity: .8, flexShrink: 0, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{msg}</span>
                  )}
                  <button style={{ background: 'none', padding: '2px 4px', border: 'none', color: 'var(--muted)', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                    onClick={() => setOpenStep(isOpen ? null : step.id)}>
                    {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </button>
                </div>

                {status === 'fail' && !isOpen && msg && (
                  <p style={{ fontSize: 11, color: 'var(--red)', margin: '3px 0 0', lineHeight: 1.5, opacity: .85 }}>{msg}</p>
                )}

                {isOpen && (
                  <div style={{ paddingTop: 8 }}>
                    <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 6px', lineHeight: 1.6 }}>{step.detail}</p>
                    {msg && (
                      <p style={{ fontSize: 12, margin: '0 0 10px', lineHeight: 1.5, color: status === 'pass' ? 'var(--green)' : status === 'fail' ? 'var(--red)' : 'var(--muted)' }}>
                        {status === 'pass' ? '✓ ' : status === 'fail' ? '✗ ' : ''}{msg}
                      </p>
                    )}
                    {step.checkMode === 'manual' && step.manualNote && (
                      <p style={{ fontSize: 11, color: 'var(--muted)', margin: '0 0 10px', opacity: .7, fontStyle: 'italic' }}>{step.manualNote}</p>
                    )}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      {step.navTarget && (
                        <button className="secondary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => onNavigate(step.navTarget!)}>
                          <ArrowRight size={12} /> Go to {step.navTarget}
                        </button>
                      )}
                      {step.systemActions?.map(a => (
                        <button key={a.path} className="secondary" style={{ fontSize: 12, padding: '5px 12px' }}
                          onClick={() => window.creativePlatform.openPath(a.path)}>
                          <Shield size={12} /> {a.label}
                        </button>
                      ))}
                      {step.checkMode === 'auto' && (
                        <button className="secondary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={runAutoCheck} disabled={checking}>
                          {checking ? <Loader size={12} className="spin" /> : <Zap size={12} />} Re-check
                        </button>
                      )}
                      {!isDone
                        ? <button className="secondary" style={{ fontSize: 12, padding: '5px 12px', marginLeft: 'auto' }} onClick={() => { markDone(step.id, true); setOpenStep(null); }}>
                            <CheckCircle2 size={12} /> Mark done
                          </button>
                        : <button className="secondary" style={{ fontSize: 12, padding: '5px 12px', marginLeft: 'auto', opacity: .6 }} onClick={() => markDone(step.id, false)}>
                            Mark incomplete
                          </button>
                      }
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
        <Save size={11} color="var(--green)" style={{ opacity: .6 }} />
        <span style={{ fontSize: 11, color: 'var(--muted)', flex: 1 }}>Progress saved locally — restarting the app won't reset your setup.</span>
        <button className="secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={resetWizard}>Reset</button>
      </div>
    </div>
  );
}

// ── output center (full screen) ───────────────────────────────────────────────

const ENGINE_FILTER_TABS = [
  { id: 'all',           label: 'All' },
  { id: 'illustrator',   label: 'Illustrator' },
  { id: 'indesign',      label: 'InDesign' },
  { id: 'canva',         label: 'Canva' },
  { id: 'adobe_express', label: 'Adobe Express' },
  { id: 'figma',         label: 'Figma' },
];

const FILE_TYPE_COLOR: Record<string, string> = {
  ai:   'var(--eng-illo)',
  pdf:  'var(--eng-indd)',
  png:  'var(--eng-canva)',
  jpg:  'var(--eng-canva)',
  jpeg: 'var(--eng-canva)',
  idml: 'var(--eng-indd)',
  indd: 'var(--eng-indd)',
  json: 'var(--muted)',
  md:   'var(--muted)',
};

function fileTypeBadge(type: string) {
  const color = FILE_TYPE_COLOR[type?.toLowerCase()] ?? 'var(--muted)';
  return (
    <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', padding: '1px 5px', borderRadius: 3,
      background: `color-mix(in srgb, ${color} 15%, transparent)`, color, border: `1px solid color-mix(in srgb, ${color} 30%, transparent)` }}>
      {type}
    </span>
  );
}

function OutputGroupCard({ group, defaultOpen }: { group: any; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const previewFile = group.files.find((f: any) => ['png', 'jpg', 'jpeg'].includes(f.type?.toLowerCase()));
  const thumbBg = group.engine === 'canva'
    ? 'linear-gradient(135deg,rgba(103,216,255,.12),rgba(10,30,60,.35))'
    : group.engine === 'adobe_express'
    ? 'linear-gradient(135deg,rgba(255,100,50,.10),rgba(30,40,70,.35))'
    : group.engine === 'indesign'
    ? 'linear-gradient(135deg,rgba(180,100,255,.10),rgba(30,20,60,.35))'
    : group.engine === 'figma'
    ? 'linear-gradient(135deg,rgba(130,200,255,.10),rgba(20,30,60,.35))'
    : 'linear-gradient(135deg,rgba(255,150,80,.10),rgba(10,25,50,.35))';

  const templateLabel = (group.templateId as string)
    .replace(/_v\d+$/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c: string) => c.toUpperCase());

  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden', marginBottom: 10 }}>
      {/* Group header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'rgba(255,255,255,.03)', cursor: 'pointer' }}
        onClick={() => setOpen(o => !o)}>
        {/* Mini preview thumbnail */}
        <div style={{ width: 44, height: 44, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: thumbBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {previewFile
            ? <img src={`file://${previewFile.path}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            : <FileText size={18} style={{ color: 'var(--muted)', opacity: .4 }} />
          }
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {templateLabel}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
            <span style={{ textTransform: 'capitalize' }}>{group.engine.replace('_', ' ')}</span>
            <span>·</span>
            <span>{group.dateFolder}</span>
            <span>·</span>
            <span>{group.files.length} file{group.files.length !== 1 ? 's' : ''}</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <Tooltip text="Open this folder in Finder" delay={200}>
            <button className="secondary" style={{ fontSize: 11, padding: '4px 8px' }}
              onClick={e => { e.stopPropagation(); window.creativePlatform.revealFile?.(group.folderPath); }}>
              <FolderOpen size={12} />
            </button>
          </Tooltip>
          {open ? <ChevronDown size={14} style={{ color: 'var(--muted)' }} /> : <ChevronRight size={14} style={{ color: 'var(--muted)' }} />}
        </div>
      </div>

      {/* File list */}
      {open && (
        <div style={{ borderTop: '1px solid var(--line)', padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {group.files.map((f: any) => {
            const isImage = ['png', 'jpg', 'jpeg'].includes(f.type?.toLowerCase());
            return (
              <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {fileTypeBadge(f.type)}
                <span style={{ fontSize: 11, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                {isImage && (
                  <div style={{ width: 28, height: 28, borderRadius: 4, overflow: 'hidden', flexShrink: 0, background: thumbBg }}>
                    <img src={`file://${f.path}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  </div>
                )}
                <button className="secondary" style={{ fontSize: 10, padding: '3px 7px', flexShrink: 0 }}
                  onClick={() => window.creativePlatform.openFile?.(f.path)}>
                  <ExternalLink size={10} /> Open
                </button>
                <button className="secondary" style={{ fontSize: 10, padding: '3px 7px', flexShrink: 0 }}
                  onClick={() => window.creativePlatform.revealFile?.(f.path)}>
                  <FolderSearch size={10} /> Reveal
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CreateFolderWidget({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen]         = useState(false);
  const [name, setName]         = useState('');
  const [engine, setEngine]     = useState('');
  const [saving, setSaving]     = useState(false);
  const [result, setResult]     = useState<{ ok: boolean; text: string } | null>(null);

  async function create() {
    if (!name.trim()) return;
    setSaving(true); setResult(null);
    try {
      const r = await window.creativePlatform.createOutputFolder({ name: name.trim(), engine: engine || undefined });
      if (r.ok) {
        setResult({ ok: true, text: `Created: ${r.relativePath}` });
        setName(''); setEngine('');
        onCreated();
        setTimeout(() => { setOpen(false); setResult(null); }, 1500);
      } else {
        setResult({ ok: false, text: r.message || 'Failed to create folder.' });
      }
    } finally { setSaving(false); }
  }

  if (!open) return (
    <Tooltip text="Create a named output folder to organise a batch run or project">
      <button className="secondary" onClick={() => setOpen(true)}><Plus size={13} /> New Folder</button>
    </Tooltip>
  );

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '8px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'rgba(255,255,255,.03)' }}>
      <input className="field-input" style={{ fontSize: 12, padding: '5px 10px', width: 200 }}
        value={name} onChange={e => setName(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && create()}
        placeholder="Folder name…" autoFocus />
      <select className="field-input" style={{ fontSize: 12, padding: '5px 8px', width: 140 }}
        value={engine} onChange={e => setEngine(e.target.value)}>
        <option value="">Any engine</option>
        <option value="illustrator">Illustrator</option>
        <option value="indesign">InDesign</option>
        <option value="canva">Canva</option>
        <option value="adobe_express">Adobe Express</option>
        <option value="figma">Figma</option>
      </select>
      <button style={{ fontSize: 12, padding: '5px 12px' }} onClick={create} disabled={saving || !name.trim()}>
        {saving ? <><RefreshCw size={12} className="spin" /> Creating…</> : 'Create'}
      </button>
      <button className="secondary" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => { setOpen(false); setResult(null); }}>Cancel</button>
      {result && <span style={{ fontSize: 11, color: result.ok ? 'var(--green)' : 'var(--red)', width: '100%' }}>{result.text}</span>}
    </div>
  );
}

function OutputCenter({ onNavigate }: { onNavigate: (s: string) => void }) {
  const { outputGroups, refreshOutputs } = usePlatformStore();
  const [engineFilter, setEngineFilter] = useState('all');
  const [search, setSearch]             = useState('');

  useEffect(() => { refreshOutputs(); }, []);

  const filtered = outputGroups.filter((g: any) => {
    if (engineFilter !== 'all' && g.engine !== engineFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return g.templateId.toLowerCase().includes(q) || g.dateFolder.includes(q) ||
        g.files.some((f: any) => f.name.toLowerCase().includes(q));
    }
    return true;
  });

  return (
    <section className="panel">
      <h2><Boxes size={22} /> Output Library</h2>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>
        All production outputs organised by engine, template, and date. Each group contains all files from a single export run.
      </p>

      {/* Toolbar */}
      <div className="button-row" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <Tooltip text="Reload outputs from disk">
          <button className="secondary" onClick={refreshOutputs}><RefreshCw size={14} /> Refresh</button>
        </Tooltip>
        <Tooltip text="Open the top-level workspace outputs folder in Finder">
          <button className="secondary" onClick={() => window.creativePlatform.openPath('outputs')}>
            <FolderOpen size={14} /> Open All
          </button>
        </Tooltip>
        <button className="secondary" onClick={() => onNavigate('Projects')}>
          <Package size={14} /> View Projects
        </button>
        <CreateFolderWidget onCreated={refreshOutputs} />
        <input
          className="field-input"
          style={{ fontSize: 12, padding: '5px 10px', width: 200, marginLeft: 'auto' }}
          placeholder="Search outputs…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Engine filter tabs */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
        {ENGINE_FILTER_TABS.map(tab => {
          const count = tab.id === 'all' ? outputGroups.length : outputGroups.filter((g: any) => g.engine === tab.id).length;
          return (
            <button key={tab.id} className={engineFilter === tab.id ? '' : 'secondary'}
              style={{ fontSize: 12, padding: '5px 12px' }}
              onClick={() => setEngineFilter(tab.id)}>
              {tab.label}
              {count > 0 && <span style={{ marginLeft: 5, opacity: .65, fontSize: 10 }}>{count}</span>}
            </button>
          );
        })}
      </div>

      {/* Groups */}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <Package size={48} className="empty-state-icon" />
          <h3>{outputGroups.length === 0 ? 'No outputs yet' : 'No matching outputs'}</h3>
          <p>{outputGroups.length === 0
            ? 'Run an export from any engine. Files will be grouped here by template and date.'
            : 'Try clearing the search or switching the engine filter.'}</p>
        </div>
      ) : (
        <>
          <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>
            {filtered.length} group{filtered.length !== 1 ? 's' : ''} · {filtered.reduce((n: number, g: any) => n + g.files.length, 0)} files
          </p>
          {filtered.map((group: any, i: number) => (
            <OutputGroupCard key={group.id} group={group} defaultOpen={i === 0} />
          ))}
        </>
      )}
    </section>
  );
}

// ── claude screen ─────────────────────────────────────────────────────────────

// ── Chat types ────────────────────────────────────────────────────────────────

type GenEngineStatus = 'filling' | 'ready' | 'generating' | 'done' | 'error' | 'skipped';

interface GenEngineResult {
  status: GenEngineStatus;
  error?: string;
  output?: any;
}

interface GenerationCard {
  cardId: string;
  outputName: string;
  brandName: string;
  engines: Record<string, GenEngineResult>;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  ts: number;
  streaming?: boolean;
  card?: GenerationCard;
}

// ── Engine field definitions for chat generation ──────────────────────────────

const CHAT_ENGINE_ORDER = ['illustrator', 'indesign', 'canva', 'adobe_express', 'figma'] as const;

/**
 * Extract field definitions from a template's manifest editable_objects.
 * Returns null if no usable manifest is present (caller should fall back to CHAT_ENGINE_FIELDS).
 */
function getManifestFieldDefs(template: any): { key: string; label: string; required: boolean; maxChars?: number }[] | null {
  const objs = template?.manifest?.editable_objects;
  if (!objs || typeof objs !== 'object') return null;
  const fields = Object.entries(objs)
    .filter(([, v]: any) => !v.type || v.type === 'text')
    .map(([key, v]: any) => ({
      key,
      label: key.replace(/^(TEXT_|IMAGE_|DOC_|SECTION_)/, '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
      required: !!v.required,
      maxChars: v.max_chars as number | undefined,
    }));
  return fields.length > 0 ? fields : null;
}

const CHAT_ENGINE_FIELDS: Record<string, { key: string; label: string; required: boolean; maxChars?: number }[]> = {
  illustrator:   [
    { key: 'TEXT_TITLE',          label: 'Title',     required: true,  maxChars: 120 },
    { key: 'TEXT_CHALLENGE_BODY', label: 'Challenge', required: true,  maxChars: 600 },
    { key: 'TEXT_SOLUTION_BODY',  label: 'Solution',  required: true,  maxChars: 600 },
    { key: 'TEXT_RESULTS_BODY',   label: 'Results',   required: true,  maxChars: 600 },
    { key: 'TEXT_STAT_01',        label: 'Stat 1',    required: false, maxChars: 30  },
    { key: 'TEXT_STAT_02',        label: 'Stat 2',    required: false, maxChars: 30  },
  ],
  indesign:      [
    { key: 'DOC_TITLE',                 label: 'Title',   required: true,  maxChars: 120 },
    { key: 'SECTION_EXECUTIVE_SUMMARY', label: 'Summary', required: true,  maxChars: 800 },
    { key: 'SECTION_CHALLENGE',         label: 'Challenge',required: false, maxChars: 600 },
    { key: 'SECTION_SOLUTION',          label: 'Solution', required: false, maxChars: 600 },
  ],
  canva:         [
    { key: 'HEADLINE',    label: 'Headline',    required: true,  maxChars: 80  },
    { key: 'SUBHEADLINE', label: 'Sub-headline',required: false, maxChars: 150 },
    { key: 'BODY_COPY',   label: 'Body',        required: false, maxChars: 400 },
    { key: 'CTA_TEXT',    label: 'CTA',         required: false, maxChars: 40  },
  ],
  adobe_express: [
    { key: 'HEADLINE',    label: 'Headline',    required: true,  maxChars: 80  },
    { key: 'SUBHEADLINE', label: 'Sub-headline',required: false, maxChars: 150 },
    { key: 'BODY_TEXT',   label: 'Body',        required: false, maxChars: 400 },
    { key: 'CTA',         label: 'CTA',         required: false, maxChars: 40  },
  ],
  figma:         [
    { key: 'TEXT_TITLE',    label: 'Title',    required: true,  maxChars: 120 },
    { key: 'TEXT_SUBTITLE', label: 'Sub-title',required: false, maxChars: 180 },
    { key: 'TEXT_BODY',     label: 'Body',     required: false, maxChars: 600 },
    { key: 'TEXT_CTA',      label: 'CTA',      required: false, maxChars: 40  },
  ],
};

const CHAT_ENGINE_LABELS: Record<string, string> = {
  illustrator: 'Illustrator', indesign: 'InDesign', canva: 'Canva',
  adobe_express: 'Adobe Express', figma: 'Figma',
};

const CHAT_ENGINE_COLORS: Record<string, string> = {
  illustrator: '#ffd76c', indesign: '#ff8c42', canva: '#67d8ff',
  adobe_express: '#ff6432', figma: '#a259ff',
};

function detectGenerateIntent(text: string): boolean {
  const t = text.toLowerCase();
  const actions = ['generate', 'create', 'make', 'build', 'produce', 'export', 'run', 'launch'];
  const assets  = ['file', 'asset', 'case study', 'report', 'banner', 'social', 'brochure', 'deck', 'slide', 'design', 'template', 'output', 'live'];
  return actions.some(a => t.includes(a)) && assets.some(a => t.includes(a));
}

function extractOutputName(text: string, brandName: string): string {
  const named = text.match(/(?:called|named|output\s+name[:\s]+)["']?([A-Za-z0-9_\-]+)["']?/i);
  if (named) return named[1];
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `${brandName.replace(/\s+/g, '_')}_v${stamp}`;
}

const QUICK_PROMPTS = [
  { label: 'Master brief',     icon: FileText,   prompt: (b: string) => `Write a master brief for ${b} for a case study campaign` },
  { label: '5 headlines',      icon: Sparkles,   prompt: (b: string) => `Generate 5 headline variations for ${b}'s case study template` },
  { label: 'Campaign angles',  icon: Zap,        prompt: (b: string) => `Suggest 3 campaign angles for ${b} that work across print and digital` },
  { label: 'Stat callouts',    icon: Activity,   prompt: (b: string) => `Generate 6 compelling stat callouts for ${b} showing ROI and impact` },
  { label: 'CTA options',      icon: ArrowRight, prompt: (b: string) => `Write 5 call-to-action options for ${b} collateral` },
  { label: 'Generate files',   icon: Zap,        prompt: (b: string) => `Create a case study output file for ${b} using all assigned engines` },
];

function ClaudeScreen({ onNavigate }: { onNavigate: (s: string) => void }) {
  const activeBrand   = usePlatformStore(s => s.activeBrand);
  const { templates, refreshBrand, setPendingFill } = usePlatformStore();
  const [messages, setMessages]         = useState<ChatMessage[]>(() => {
    try {
      const raw = localStorage.getItem('claude_chat_history');
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });
  const [input, setInput]               = useState('');
  const [sending, setSending]           = useState(false);
  const [hasKey, setHasKey]             = useState(false);
  const [maskedKey, setMaskedKey]       = useState<string | null>(null);
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [keyDraft, setKeyDraft]         = useState('');
  const [savingKey, setSavingKey]       = useState(false);
  const [skills, setSkills]             = useState<any[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const streamingActiveRef = useRef(false);

  useEffect(() => {
    window.creativePlatform.getClaudeApiKey().then((r: any) => {
      setHasKey(r.hasKey); setMaskedKey(r.masked);
    });
    window.creativePlatform.listSkills().then((r: any) => {
      if (r.ok) setSkills(r.skills ?? []);
    });
  }, []);

  useEffect(() => {
    try { localStorage.setItem('claude_chat_history', JSON.stringify(messages.slice(-100))); } catch {}
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function patchCard(cardId: string, enginePatch: Record<string, Partial<GenEngineResult>>) {
    setMessages(prev => prev.map(m => {
      if (!m.card || m.card.cardId !== cardId) return m;
      const engines = { ...m.card.engines };
      for (const [eng, patch] of Object.entries(enginePatch)) {
        engines[eng] = { ...engines[eng], ...patch };
      }
      return { ...m, card: { ...m.card, engines } };
    }));
  }

  async function runGeneration(brief: string, skill?: any) {
    if (!activeBrand) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'No active brand selected. Go to Brands and set an active brand first.', ts: Date.now() }]);
      return;
    }

    // If skill specifies engines, filter to those that are also assigned in the brand
    const skillEngines = skill?.manifest?.engines as string[] | undefined;
    const assignedEngines = CHAT_ENGINE_ORDER.filter(e =>
      !!activeBrand.templates?.[e] && (skillEngines ? skillEngines.includes(e) : true)
    );
    if (assignedEngines.length === 0) {
      setMessages(prev => [...prev, { role: 'assistant', content: `${activeBrand.name} has no engine templates assigned. Go to Brands → Edit to assign templates.`, ts: Date.now() }]);
      return;
    }

    const outputName = extractOutputName(brief, activeBrand.name);
    const cardId = `gen_${Date.now()}`;
    const initialEngines: Record<string, GenEngineResult> = {};
    for (const e of CHAT_ENGINE_ORDER) {
      initialEngines[e] = assignedEngines.includes(e) ? { status: 'filling' } : { status: 'skipped' };
    }

    const cardMsg: ChatMessage = {
      role: 'assistant',
      content: '',
      ts: Date.now(),
      card: { cardId, outputName, brandName: activeBrand.name, engines: initialEngines },
    };
    setMessages(prev => [...prev, cardMsg]);

    // Phase 1: fill fields via Claude for each engine in parallel
    const filledContent: Record<string, Record<string, string>> = {};
    await Promise.all(assignedEngines.map(async eng => {
      try {
        const tmpl = templates.find((t: any) => t.id === activeBrand.templates?.[eng]);
        // Prefer: skill fields → template manifest → engine defaults
        const manifestFields = tmpl ? getManifestFieldDefs(tmpl) : null;
        const fieldDefs = (skill?.fields?.[eng]?.length > 0) ? skill.fields[eng]
          : (manifestFields ?? CHAT_ENGINE_FIELDS[eng]);
        const res: any = await window.creativePlatform.claudeFillFields({
          brief,
          fields: fieldDefs,
          engine: eng,
          templateName: tmpl?.name,
          brandContext: { name: activeBrand.name, description: activeBrand.description, guidelines: activeBrand.guidelines, industry: activeBrand.industry },
          systemPromptOverride: skill?.systemPrompt || undefined,
          userTemplateOverride: skill?.userTemplate || undefined,
        });
        if (res.ok) {
          filledContent[eng] = res.content;
          patchCard(cardId, { [eng]: { status: 'generating' } });
        } else {
          patchCard(cardId, { [eng]: { status: 'error', error: res.message || 'Fill failed' } });
        }
      } catch (e: any) {
        patchCard(cardId, { [eng]: { status: 'error', error: e.message } });
      }
    }));

    // Store filled content in global store so engine screens can consume it
    for (const [eng, content] of Object.entries(filledContent)) {
      setPendingFill(eng, content);
    }

    // Phase 2: run generation for each engine that has filled content
    await Promise.all(assignedEngines.map(async eng => {
      if (!filledContent[eng]) return;
      const tmpl = templates.find((t: any) => t.id === activeBrand.templates?.[eng]);
      const content = filledContent[eng];
      try {
        let res: any;
        if (eng === 'illustrator')   res = await window.creativePlatform.runIllustratorCustom({ template: tmpl?.id, content, output_name: `${outputName}_illustrator` });
        else if (eng === 'indesign') res = await window.creativePlatform.runInDesignCustom({ template: tmpl?.id, content, output_name: `${outputName}_indesign` });
        else if (eng === 'canva')    res = await window.creativePlatform.runCanvaJob({ canvaDesignId: tmpl?.canvaDesignId || tmpl?.id, content, outputName: `${outputName}_canva` });
        else if (eng === 'adobe_express') res = await window.creativePlatform.runAdobeExpressJob({ templateId: tmpl?.id, editorUrl: tmpl?.editorUrl, content, outputName: `${outputName}_adobe_express` });
        else if (eng === 'figma')    res = await window.creativePlatform.runFigmaJob({ figmaFileKey: tmpl?.figmaFileKey, content, outputName: `${outputName}_figma` });
        if (res?.ok) patchCard(cardId, { [eng]: { status: 'done', output: res } });
        else patchCard(cardId, { [eng]: { status: 'error', error: res?.userMessage || res?.message || 'Generation failed' } });
      } catch (e: any) {
        patchCard(cardId, { [eng]: { status: 'error', error: e.message } });
      }
    }));

    refreshBrand();
  }

  async function send(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: msg, ts: Date.now() }]);

    // Batch intent → navigate to Brand Batch with brief pre-loaded
    const lower = msg.toLowerCase();
    const isBatch = lower.includes('batch') || lower.includes('all brands') || lower.includes('every brand') || lower.includes('multiple brand') || lower.includes('bulk');
    if (isBatch) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Taking you to Brand Batch — I've loaded your brief so you can kick off a multi-brand run.\n\n*Brief:* "${msg.slice(0, 120)}${msg.length > 120 ? '…' : ''}"`,
        ts: Date.now(),
      }]);
      setPendingFill('__batch_brief__', { brief: msg });
      setTimeout(() => onNavigate('Brand Batch'), 900);
      return;
    }

    // Skill trigger matching — check installed skills before default generation/chat
    const matchedSkill = skills.find(sk =>
      (sk.triggers ?? []).some((t: string) => t.trim() && lower.includes(t.trim().toLowerCase()))
    );

    if (matchedSkill) {
      // Load full skill then run generation with its custom system prompt + fields
      setSending(true);
      try {
        const sr: any = await window.creativePlatform.getSkill(matchedSkill.id ?? matchedSkill._folder);
        if (sr.ok) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `Activating skill **${matchedSkill.name}** — running generation with custom prompts and field mappings.`,
            ts: Date.now(),
          }]);
          await runGeneration(msg, sr.skill);
        } else {
          await runGeneration(msg);
        }
      } catch {
        await runGeneration(msg);
      }
      setSending(false);
      return;
    }

    if (detectGenerateIntent(msg)) {
      setSending(true);
      await runGeneration(msg);
      setSending(false);
      return;
    }

    setSending(true);
    streamingActiveRef.current = true;
    setMessages(prev => [...prev, { role: 'assistant', content: '', ts: Date.now(), streaming: true }]);

    const unsub = window.creativePlatform.onClaudeChunk?.((chunk: { text?: string; done?: boolean; error?: string }) => {
      if (chunk.text) {
        setMessages(prev => {
          if (!prev.length) return prev;
          const last = prev[prev.length - 1];
          if (!last.streaming) return prev;
          return [...prev.slice(0, -1), { ...last, content: last.content + chunk.text }];
        });
      }
      if (chunk.done || chunk.error) {
        streamingActiveRef.current = false;
        unsub?.();
        setMessages(prev => {
          if (!prev.length) return prev;
          const last = prev[prev.length - 1];
          if (!last.streaming) return prev;
          return [...prev.slice(0, -1), {
            ...last,
            streaming: false,
            content: chunk.error ? `⚠ ${chunk.error}` : last.content,
          }];
        });
        setSending(false);
      }
    });

    const history = messages.slice(-6).map(m => ({ role: m.role, content: m.content }));
    window.creativePlatform.askClaude({
      prompt: msg,
      brandContext: activeBrand ? { name: activeBrand.name, description: activeBrand.description, guidelines: activeBrand.guidelines, industry: activeBrand.industry } : undefined,
      history,
    }).then((r: any) => {
      if (r && !r.streaming && !r.ok) {
        // Non-streaming response (error case or API key missing)
        streamingActiveRef.current = false;
        unsub?.();
        setMessages(prev => {
          if (!prev.length) return prev;
          const last = prev[prev.length - 1];
          if (!last.streaming) return prev;
          return [...prev.slice(0, -1), { ...last, streaming: false, content: `⚠ ${r.message ?? 'Unknown error'}` }];
        });
        setSending(false);
      }
    }).catch((e: any) => {
      streamingActiveRef.current = false;
      unsub?.();
      setMessages(prev => {
        if (!prev.length) return prev;
        const last = prev[prev.length - 1];
        if (!last.streaming) return prev;
        return [...prev.slice(0, -1), { ...last, streaming: false, content: `⚠ ${e.message}` }];
      });
      setSending(false);
    });
  }

  async function saveKey() {
    if (!keyDraft.trim()) return;
    setSavingKey(true);
    const r: any = await window.creativePlatform.setClaudeApiKey(keyDraft.trim());
    if (r.ok) { setHasKey(true); setMaskedKey(keyDraft.slice(0, 8) + '…'); setShowKeyInput(false); setKeyDraft(''); }
    setSavingKey(false);
  }

  const brandName = activeBrand?.name ?? 'your brand';

  return (
    <div className="screen-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <Bot size={22} style={{ color: 'var(--accent)' }} />
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, letterSpacing: '-.02em' }}>Claude AI Assistant</h1>
            {messages.length > 0 && (
              <button
                onClick={() => { setMessages([]); localStorage.removeItem('claude_chat_history'); }}
                style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)', background: 'none', border: '1px solid var(--line)', borderRadius: 6, padding: '3px 9px', cursor: 'pointer' }}
              >
                Clear history
              </button>
            )}
          </div>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
            Generate briefs, write copy, brainstorm campaigns — with full brand context.
          </p>
        </div>

        {/* API key status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 10, background: hasKey ? 'rgba(117,245,174,.07)' : 'rgba(255,116,116,.07)', border: `1px solid ${hasKey ? 'rgba(117,245,174,.25)' : 'rgba(255,116,116,.25)'}` }}>
          <Key size={13} style={{ color: hasKey ? 'var(--green)' : 'var(--red)', flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: hasKey ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
            {hasKey ? `Key set · ${maskedKey}` : 'No API key'}
          </span>
          <button
            className="secondary"
            style={{ fontSize: 11, padding: '3px 9px', marginLeft: 4 }}
            onClick={() => setShowKeyInput(v => !v)}
          >
            {showKeyInput ? 'Cancel' : hasKey ? 'Change' : 'Add Key'}
          </button>
        </div>
      </div>

      {/* Key input panel */}
      {showKeyInput && (
        <div style={{ padding: '14px 16px', borderRadius: 12, background: 'var(--panel)', border: '1px solid var(--line)', display: 'flex', gap: 10, alignItems: 'center' }}>
          <Key size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
          <input
            type="password"
            placeholder="sk-ant-api03-…"
            value={keyDraft}
            onChange={e => setKeyDraft(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && saveKey()}
            style={{ flex: 1, background: 'rgba(0,0,0,.3)', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, fontFamily: 'monospace', outline: 'none' }}
            autoFocus
          />
          <button onClick={saveKey} disabled={savingKey || !keyDraft.trim()} style={{ fontSize: 12, padding: '7px 16px' }}>
            {savingKey ? <><Loader size={12} className="spin" /> Saving…</> : 'Save Key'}
          </button>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)' }}>
            Stored locally in <code style={{ color: 'var(--accent)' }}>claude_config.json</code> — never transmitted.
            <button className="secondary" style={{ fontSize: 11, padding: '2px 8px', marginLeft: 8 }} onClick={() => window.open('https://console.anthropic.com/settings/keys', '_blank')}>
              <ExternalLink size={10} /> Get key
            </button>
          </p>
        </div>
      )}

      {/* Quick prompts */}
      <div>
        <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted)' }}>
          Quick prompts {activeBrand && <span style={{ color: 'var(--accent)', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>· {activeBrand.name} context active</span>}
        </p>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          {QUICK_PROMPTS.map(qp => (
            <button
              key={qp.label}
              className="secondary"
              disabled={sending}
              onClick={() => send(qp.prompt(brandName))}
              style={{ fontSize: 12, padding: '6px 12px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <qp.icon size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              {qp.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chat window */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden', minHeight: 340 }}>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {messages.length === 0 && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--muted)', padding: '40px 20px' }}>
              <Bot size={36} style={{ opacity: .25 }} />
              <div style={{ fontSize: 14, fontWeight: 600, opacity: .5 }}>Ask Claude anything</div>
              <div style={{ fontSize: 12, opacity: .4, textAlign: 'center', maxWidth: 320 }}>
                Use a quick prompt above or type your own — brief writing, copy variations, campaign brainstorming, or anything else.
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start', gap: 4 }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>
                {m.role === 'user' ? 'You' : 'Claude'}
              </div>
              {m.card ? (
                <div style={{
                  maxWidth: '92%', padding: '12px 14px', borderRadius: '14px 14px 14px 4px',
                  background: 'rgba(255,255,255,.04)', border: '1px solid var(--line)', minWidth: 280,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 2, color: 'var(--text)' }}>
                    {m.card.outputName}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 10 }}>
                    Brand: {m.card.brandName}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {CHAT_ENGINE_ORDER.map(eng => {
                      const res = m.card!.engines[eng];
                      if (!res) return null;
                      const ec = CHAT_ENGINE_COLORS[eng] ?? '#999';
                      const statusColor =
                        res.status === 'done'       ? '#75f5ae' :
                        res.status === 'error'      ? '#ff6b6b' :
                        res.status === 'generating' || res.status === 'filling' ? ec : 'var(--muted)';
                      const statusIcon =
                        res.status === 'done'       ? '✓' :
                        res.status === 'error'      ? '✗' :
                        res.status === 'generating' || res.status === 'filling' ? '…' : '–';
                      return (
                        <div key={eng} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{
                            width: 16, height: 16, borderRadius: 4, flexShrink: 0, display: 'inline-flex',
                            alignItems: 'center', justifyContent: 'center',
                            background: `${ec}22`, border: `1px solid ${ec}55`,
                            fontSize: 9, fontWeight: 800, color: ec,
                          }}>
                            {statusIcon}
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--text)', flex: 1 }}>
                            {CHAT_ENGINE_LABELS[eng]}
                          </span>
                          <span style={{ fontSize: 10, color: statusColor, fontWeight: 600 }}>
                            {res.status === 'ready'      ? 'Ready' :
                             res.status === 'filling'    ? 'Filling…' :
                             res.status === 'generating' ? 'Generating…' :
                             res.status === 'done'       ? 'Done' :
                             res.status === 'skipped'    ? 'Skipped' :
                             res.error ?? 'Error'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {/* "Open in engine" quick-nav buttons for completed engines */}
                  {(() => {
                    const doneEngines = CHAT_ENGINE_ORDER.filter(e => m.card!.engines[e]?.status === 'done');
                    const ENGINE_SCREEN: Record<string, string> = {
                      illustrator: 'Illustrator', indesign: 'InDesign', canva: 'Canva',
                      adobe_express: 'Adobe Express', figma: 'Figma',
                    };
                    if (doneEngines.length === 0) return null;
                    return (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {doneEngines.map(eng => {
                          const ec = CHAT_ENGINE_COLORS[eng] ?? '#999';
                          return (
                            <button key={eng} onClick={() => onNavigate(ENGINE_SCREEN[eng])} style={{
                              fontSize: 10, padding: '3px 9px', borderRadius: 6, cursor: 'pointer',
                              background: `${ec}18`, border: `1px solid ${ec}44`, color: ec, fontWeight: 600,
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                            }}>
                              Open in {CHAT_ENGINE_LABELS[eng]} →
                            </button>
                          );
                        })}
                        <button onClick={() => onNavigate('Projects')} style={{
                          fontSize: 10, padding: '3px 9px', borderRadius: 6, cursor: 'pointer',
                          background: 'rgba(255,255,255,.05)', border: '1px solid var(--line)', color: 'var(--muted)', fontWeight: 600,
                        }}>
                          View in Projects →
                        </button>
                      </div>
                    );
                  })()}
                  {m.content ? (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)', fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
                      {m.content}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div style={{
                  maxWidth: '82%', padding: '10px 14px', borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  background: m.role === 'user' ? 'rgba(79,134,240,.18)' : 'rgba(255,255,255,.05)',
                  border: `1px solid ${m.role === 'user' ? 'rgba(79,134,240,.3)' : 'var(--line)'}`,
                  fontSize: 13, lineHeight: 1.6, color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  {m.content}{m.streaming && <span style={{ display: 'inline-block', width: 2, height: '1em', background: 'var(--accent)', marginLeft: 2, verticalAlign: 'text-bottom', animation: 'blink 1s step-end infinite' }} />}
                </div>
              )}
            </div>
          ))}
          {sending && !streamingActiveRef.current && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ padding: '10px 14px', borderRadius: '14px 14px 14px 4px', background: 'rgba(255,255,255,.05)', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: 13 }}>
                <Loader size={12} className="spin" /> Thinking…
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input row */}
        <div style={{ borderTop: '1px solid var(--line)', padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          {activeBrand && (
            <div style={{ position: 'absolute', bottom: 72, left: 190, fontSize: 10, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: activeBrand.color || 'var(--accent)' }} />
              {activeBrand.name}
            </div>
          )}
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={`Message Claude${activeBrand ? ` · ${activeBrand.name} context active` : ''}… (Enter to send, Shift+Enter for new line)`}
            disabled={sending}
            rows={2}
            style={{
              flex: 1, background: 'rgba(0,0,0,.25)', border: '1px solid var(--line)', borderRadius: 10,
              padding: '9px 12px', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit',
              resize: 'none', outline: 'none', lineHeight: 1.5,
            }}
          />
          <button
            onClick={() => send()}
            disabled={sending || !input.trim()}
            style={{ padding: '9px 16px', borderRadius: 10, flexShrink: 0, opacity: (!input.trim() || sending) ? .45 : 1 }}
          >
            {sending ? <Loader size={14} className="spin" /> : <Send size={14} />}
          </button>
        </div>
      </div>

      {/* Capability footer */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
        {[
          { title: 'Brand-aware', icon: Building2, desc: 'Automatically includes active brand name, description, and context in every prompt.' },
          { title: 'Diagnostics', icon: Activity,  desc: 'Ask AI on any error in System Check to get root cause analysis and exact fix steps.' },
          { title: 'Template fill', icon: Sparkles, desc: 'Powers "Fill All Engines" in Brand Generate and "Fill with Claude" in Brand Batch.' },
        ].map(c => (
          <div key={c.title} style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid var(--line)', background: 'rgba(103,216,255,.03)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <c.icon size={14} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 3 }}>{c.title}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>{c.desc}</div>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}

// ── helpers ───────────────────────────────────────────────────────────────────

function Dot({ color }: { color?: string }) {
  return <span className={`dot ${color || 'gray'}`} />;
}

function ElectronStatus() {
  const [copied, setCopied] = useState(false);
  const isElectron = !(window as any).creativePlatform?.__isDevStub;
  const CMD = 'cd ~/CreativeAutomationPlatform && npm --workspace apps/desktop run electron';

  function copyCommand() {
    navigator.clipboard.writeText(CMD).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  if (isElectron) {
    return (
      <div className="electron-status">
        <Dot color="green" /><span>Electron connected</span>
      </div>
    );
  }
  return (
    <Tooltip text={CMD} position="right">
      <button
        className="electron-connect-btn"
        onClick={copyCommand}
        style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto', paddingTop: 14, borderTop: '1px solid var(--line)', width: '100%', background: 'none', border: 0, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: copied ? 'var(--green)' : 'var(--muted)' }}
      >
        <Dot color={copied ? 'green' : 'red'} />
        {copied ? 'Copied!' : 'Launch Electron app'}
      </button>
    </Tooltip>
  );
}

// ── dashboard ─────────────────────────────────────────────────────────────────

const ENGINE_CARDS = [
  { id: 'Illustrator',   statusKey: 'illustrator', icon: PenTool,   label: 'Illustrator',   accent: '#ffd76c', desc: 'AI automation for .ai files' },
  { id: 'InDesign',      statusKey: 'indesign',    icon: FileText,  label: 'InDesign',       accent: '#ff8c42', desc: 'Document-scale .indd exports' },
  { id: 'Canva',         statusKey: 'canva',       icon: Sparkles,  label: 'Canva',          accent: '#67d8ff', desc: 'API-driven template autofills' },
  { id: 'Adobe Express', statusKey: null,     icon: Layers,    label: 'Adobe Express',  accent: '#ff6432', desc: 'Browser handoff editor flow'        },
  { id: 'Figma',         statusKey: 'figma', icon: Figma,     label: 'Figma',          accent: '#A259FF', desc: 'Design frames → PNG, SVG, PDF + Variables' },
];

const QUICK_ACTIONS = [
  { label: 'Brand Generate',    icon: Zap,        target: 'Generate',    desc: 'One brief → live files across all engines', accent: 'rgba(79,134,240,.12)',  accentBorder: 'rgba(79,134,240,.35)' },
  { label: 'Brand Batch',       icon: Layers,     target: 'Brand Batch', desc: 'CSV → all rows × all engines in one run',   accent: 'rgba(117,245,174,.08)', accentBorder: 'rgba(117,245,174,.25)' },
  { label: 'New Project',       icon: Plus,       target: 'Projects',    desc: 'Create a project from any template',  accent: 'rgba(103,216,255,.08)', accentBorder: 'rgba(103,216,255,.22)' },
  { label: 'Run Batch',         icon: Boxes,      target: 'Batch',       desc: 'Bulk-export from a CSV or manual rows', accent: 'rgba(117,245,174,.08)', accentBorder: 'rgba(117,245,174,.25)' },
  { label: 'Browse Templates',  icon: FileImage,  target: 'Templates',   desc: 'Inspect your full template library',  accent: 'rgba(255,215,108,.07)', accentBorder: 'rgba(255,215,108,.22)' },
  { label: 'System Check',      icon: Activity,   target: 'Diagnostics', desc: 'Run diagnostics and AI-assisted fixes', accent: 'rgba(255,116,116,.06)', accentBorder: 'rgba(255,116,116,.2)' },
];

function Dashboard({ onNavigate }: { onNavigate: (s: string) => void }) {
  const { engines, status, projects, outputs, templates, refresh } = usePlatformStore();
  const [showSetup, setShowSetup] = useState(false);
  const [wizardDone, setWizardDone] = useState(() => loadDone().size);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 30_000);
    return () => clearInterval(t);
  }, []);

  // Refresh wizard count when setup modal closes
  useEffect(() => {
    if (!showSetup) setWizardDone(loadDone().size);
  }, [showSetup]);

  const statusNodes = useMemo(() => status ? status : {}, [status]);
  const recentProjects = useMemo(
    () => [...projects].sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()).slice(0, 5),
    [projects]
  );
  const recentOutputs = useMemo(
    () => [...outputs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 8),
    [outputs]
  );

  const completeProjects = projects.filter(p => p.status === 'complete').length;
  const totalAssets      = projects.reduce((s, p) => s + (p.outputs?.length || 0), 0);
  const totalTemplates   = templates.length;
  const setupTotal       = WIZARD_STEPS.length;
  const setupPct         = Math.round((wizardDone / setupTotal) * 100);
  const setupDone        = wizardDone === setupTotal;

  // Determine ready engine count
  const readyEngines = ENGINE_CARDS.filter(e => e.statusKey && statusNodes[e.statusKey]?.ready).length;

  return (
    <div className="dashboard screen-fade-in">

      {/* ── Setup modal overlay ── */}
      {showSetup && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.65)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowSetup(false); }}>
          <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 22, padding: 28, width: '100%', maxWidth: 680, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 32px 80px rgba(0,0,0,.55)' }}>
            <SetupWizard onNavigate={(s) => { setShowSetup(false); onNavigate(s); }} onClose={() => setShowSetup(false)} />
          </div>
        </div>
      )}

      {/* ── Header row ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, letterSpacing: '-.03em' }}>Creative Automation Platform</h1>
            <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', opacity: .7 }}>v3</span>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
            {readyEngines} of {ENGINE_CARDS.length} engines ready
            {!setupDone && ` · Setup ${setupPct}% complete`}
          </p>
        </div>

        {/* Header stats */}
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { val: projects.length,  label: 'Projects',  icon: FolderOpen, color: 'var(--accent)' },
            { val: totalAssets,      label: 'Assets',    icon: Image,      color: '#67d8ff'       },
            { val: totalTemplates,   label: 'Templates', icon: Layers,     color: '#ffd76c'       },
            { val: outputs.length,   label: 'Outputs',   icon: Package,    color: '#75f5ae'       },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center', padding: '8px 16px', borderRadius: 10, background: 'rgba(255,255,255,.04)', border: '1px solid var(--line)', minWidth: 72 }}>
              <s.icon size={13} style={{ color: s.color, opacity: .75, marginBottom: 3 }} />
              <div style={{ fontSize: 22, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.val}</div>
              <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginTop: 3 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Header actions */}
        <div style={{ display: 'flex', gap: 8 }}>
          <Tooltip text="Open the workspace root folder in Finder" delay={200}>
            <button className="secondary" style={{ fontSize: 12, padding: '7px 14px' }} onClick={() => window.creativePlatform.openPath('workspace')}>
              <FolderOpen size={13} /> Workspace
            </button>
          </Tooltip>
          <Tooltip text="Refresh all engine status readings" delay={200}>
            <button className="secondary" style={{ fontSize: 12, padding: '7px 14px' }} onClick={refresh}>
              <RefreshCw size={13} /> Refresh
            </button>
          </Tooltip>
          <Tooltip text={setupDone ? 'All setup steps complete' : `${wizardDone}/${setupTotal} setup steps complete — click to continue`} delay={150}>
            <button
              style={{ fontSize: 12, padding: '7px 14px', background: setupDone ? 'var(--green)' : 'var(--accent)', color: '#06121f' }}
              onClick={() => setShowSetup(true)}
            >
              {setupDone ? <><CheckCircle2 size={13} /> Setup Done</> : <><Rocket size={13} /> Setup {setupPct}%</>}
            </button>
          </Tooltip>
        </div>
      </div>

      {/* ── First-time welcome banner ── */}
      {readyEngines === 0 && !setupDone && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 20,
          padding: '18px 22px', borderRadius: 10,
          background: 'linear-gradient(135deg,rgba(79,134,240,.09),rgba(79,134,240,.04))',
          border: '1px solid rgba(79,134,240,.22)',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 5 }}>Connect your creative tools to get started</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
              CreativeOS unifies Illustrator, InDesign, Canva, Figma, and Adobe Express into a single automation workflow.
              Click any engine card below to open it, or use the guided setup to connect each app step by step.
            </div>
          </div>
          <button style={{ fontSize: 13, padding: '10px 20px', flexShrink: 0 }} onClick={() => setShowSetup(true)}>
            <Rocket size={13} /> Start setup
          </button>
        </div>
      )}

      {/* ── Engine health row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10 }}>
        {ENGINE_CARDS.map(eng => {
          const node   = eng.statusKey ? statusNodes[eng.statusKey] : null;
          const color  = node?.color ?? 'gray';
          const ready  = node?.ready ?? false;
          const detail = node?.detail ?? 'Not connected';
          return (
            <button
              key={eng.id}
              className="engine-health-card"
              onClick={() => onNavigate(eng.id)}
              style={{
                display: 'flex', flexDirection: 'column', gap: 6,
                padding: '14px 16px', borderRadius: 10, textAlign: 'left',
                background: ready ? `rgba(${eng.accent.replace('#','').match(/.{2}/g)?.map(h=>parseInt(h,16)).join(',') ?? '255,255,255'},.06)` : 'rgba(255,255,255,.03)',
                border: `1px solid ${ready ? eng.accent + '55' : 'var(--line)'}`,
                cursor: 'pointer', transition: 'border-color .15s, background .15s',
                color: 'var(--text)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <eng.icon size={15} style={{ color: eng.accent, flexShrink: 0 }} />
                <span style={{ fontWeight: 700, fontSize: 13, flex: 1 }}>{eng.label}</span>
                <Tooltip text={ready ? 'Ready' : detail} position="left" delay={150}>
                  <span className={`dot ${color}`} style={{ marginTop: 0, flexShrink: 0 }} />
                </Tooltip>
              </div>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)', lineHeight: 1.4 }}>{eng.desc}</p>
              <span style={{ fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4,
                color: ready ? 'var(--green)' : eng.statusKey ? 'var(--accent)' : 'var(--muted)' }}>
                {ready
                  ? <><CheckCircle2 size={9} /> Ready</>
                  : eng.statusKey
                  ? <><Zap size={9} /> Connect →</>
                  : <>Open →</>}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Quick actions + recent projects ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 12 }}>

        {/* Quick actions 2-col grid */}
        <div>
          <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted)' }}>Quick Actions</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {QUICK_ACTIONS.map(action => (
              <button
                key={action.label}
                onClick={() => onNavigate(action.target)}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '12px 14px', borderRadius: 12, textAlign: 'left',
                  background: action.accent, border: `1px solid ${action.accentBorder}`,
                  cursor: 'pointer', color: 'var(--text)', transition: 'border-color .15s, background .15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = action.accentBorder.replace('.35', '.6').replace('.25', '.5').replace('.22', '.45').replace('.2)', '.45)'); }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = action.accentBorder; }}
              >
                <div style={{ width: 30, height: 30, borderRadius: 8, background: action.accentBorder.replace('Border','').replace(/\.[0-9]+\)$/, '.18)'), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                  <action.icon size={15} style={{ color: 'var(--accent)' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 12, lineHeight: 1.3 }}>{action.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, lineHeight: 1.4 }}>{action.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Recent projects */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted)', flex: 1 }}>Recent Projects</p>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>{completeProjects}/{projects.length} complete</span>
            <button className="secondary" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => onNavigate('Projects')}>
              View all <ArrowRight size={10} />
            </button>
          </div>

          {recentProjects.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '28px 16px', border: '1px dashed var(--line)', borderRadius: 14, color: 'var(--muted)', fontSize: 13 }}>
              <FolderOpen size={24} style={{ opacity: .3 }} />
              No projects yet
              <button style={{ fontSize: 12, padding: '6px 16px' }} onClick={() => onNavigate('Projects')}>
                <Plus size={12} /> New Project
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {recentProjects.map(p => {
                const statusColor = p.status === 'complete' ? 'var(--green)' : p.status === 'failed' ? 'var(--red)' : 'var(--yellow)';
                const statusTip   = p.status === 'complete' ? 'Export complete' : p.status === 'failed' ? 'Export failed' : 'In progress';
                const assetCount  = p.outputs?.length ?? 0;
                return (
                  <div
                    key={p.id}
                    onClick={() => onNavigate('Projects')}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 12, border: '1px solid var(--line)', background: 'rgba(255,255,255,.03)', cursor: 'pointer', transition: 'border-color .15s, background .15s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(103,216,255,.3)'; (e.currentTarget as HTMLElement).style.background = 'rgba(103,216,255,.04)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--line)'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.03)'; }}
                  >
                    <Tooltip text={statusTip} position="right" delay={150}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
                    </Tooltip>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
                        {p.engine} · {(p as any).templateName || (p as any).templateId || '—'}
                      </div>
                    </div>
                    {assetCount > 0 && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: 'rgba(103,216,255,.1)', color: 'var(--accent)', flexShrink: 0 }}>
                        {assetCount} asset{assetCount !== 1 ? 's' : ''}
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>
                      {new Date(p.updatedAt || p.createdAt).toLocaleDateString()}
                    </span>
                    <ChevronRight size={12} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                  </div>
                );
              })}
              {projects.length > 5 && (
                <button className="secondary" style={{ fontSize: 12, padding: '7px', borderRadius: 10, justifyContent: 'center' }} onClick={() => onNavigate('Projects')}>
                  View {projects.length - 5} more projects <ArrowRight size={11} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Recent outputs strip ── */}
      {recentOutputs.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted)', flex: 1 }}>Recent Outputs</p>
            <button className="secondary" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => onNavigate('Outputs')}>
              View all {outputs.length} <ArrowRight size={10} />
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: 8 }}>
            {recentOutputs.map((out: any) => {
              const isImage = ['png', 'jpg', 'jpeg'].includes(out.type?.toLowerCase());
              const thumbBg = 'linear-gradient(135deg,rgba(103,216,255,.1),rgba(0,0,0,.35))';
              return (
                <div
                  key={out.id}
                  title={out.name}
                  style={{ borderRadius: 12, border: '1px solid var(--line)', overflow: 'hidden', cursor: 'pointer', background: 'rgba(255,255,255,.03)', transition: 'border-color .15s' }}
                  onClick={() => window.creativePlatform.revealFile?.(out.path) || window.creativePlatform.openPath('outputs')}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(103,216,255,.3)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--line)'; }}
                >
                  <div style={{ height: 70, background: thumbBg, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {isImage
                      ? <img src={`file://${out.path}`} alt={out.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      : <FileText size={22} style={{ color: 'var(--muted)', opacity: .4 }} />
                    }
                  </div>
                  <div style={{ padding: '6px 8px' }}>
                    <div style={{ fontSize: 10, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{out.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 700, marginTop: 2 }}>{out.type?.toUpperCase()}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Setup progress banner (if incomplete) ── */}
      {!setupDone && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderRadius: 16, background: 'rgba(103,216,255,.05)', border: '1px solid rgba(103,216,255,.2)' }}>
          <Rocket size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>Setup in progress</span>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{wizardDone} of {setupTotal} steps complete</span>
            </div>
            <div style={{ height: 4, borderRadius: 3, background: 'rgba(255,255,255,.1)', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 3, background: 'var(--accent)', width: `${setupPct}%`, transition: 'width .4s' }} />
            </div>
          </div>
          <button style={{ fontSize: 12, padding: '8px 18px', flexShrink: 0 }} onClick={() => setShowSetup(true)}>
            Continue Setup <ArrowRight size={12} />
          </button>
        </div>
      )}

    </div>
  );
}

// ── top bar ───────────────────────────────────────────────────────────────────

function TopBar({ screen, theme, onToggleTheme }: { screen: string; theme: 'dark' | 'light'; onToggleTheme: () => void }) {
  const isElectron = !(window as any).creativePlatform?.__isDevStub;
  const activeBrand = usePlatformStore(s => s.activeBrand);

  return (
    <header className="app-top-bar">
      <div className="app-top-bar-brand">
        <CheckCircle2 size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        CreativeOS
      </div>
      <div className="app-top-bar-sep" />
      <span className="app-top-bar-screen">{screen}</span>
      <div className="app-top-bar-right">
        {activeBrand && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: activeBrand.color || 'var(--accent)', flexShrink: 0 }} />
            {activeBrand.name}
          </div>
        )}
        <Tooltip text={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} position="bottom">
          <button className="theme-toggle" onClick={onToggleTheme} aria-label="Toggle theme">
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </Tooltip>
        <div className="app-top-bar-electron">
          <Dot color={isElectron ? 'green' : 'red'} />
          <span>{isElectron ? 'Connected' : 'Dev preview'}</span>
        </div>
      </div>
    </header>
  );
}

// ── sidebar ───────────────────────────────────────────────────────────────────

const ENGINE_NAV = [
  { id: 'Illustrator',   icon: PenTool,  label: 'Illustrator',   color: '#d4960a', statusKey: 'illustrator'  },
  { id: 'InDesign',      icon: FileText, label: 'InDesign',      color: '#e06020', statusKey: 'indesign'     },
  { id: 'Canva',         icon: Sparkles, label: 'Canva',         color: '#0ea5c9', statusKey: 'canva'        },
  { id: 'Adobe Express', icon: Layers,   label: 'Adobe Express', color: '#e04520'                            },
  { id: 'Figma',         icon: Figma,    label: 'Figma',         color: '#8b46e8', statusKey: 'figma'        },
  { id: 'Batch',         icon: Boxes,    label: 'Batch',         color: '#22c37a'                            },
] as const;

function Sidebar({ screen, onNavigate, status }: { screen: string; onNavigate: (s: string) => void; status: any }) {
  const activeBrand  = usePlatformStore(s => s.activeBrand);
  const isElectron   = !(window as any).creativePlatform?.__isDevStub;

  function statusColor(key?: string) {
    if (!key || !status) return undefined;
    return status[key]?.color ?? 'gray';
  }

  function NavItem({ id, icon: Icon, label, engineColor, statusKey, small }: {
    id: string; icon: React.ComponentType<any>; label: string;
    engineColor?: string; statusKey?: string; small?: boolean;
  }) {
    const active = screen === id;
    const dc     = statusColor(statusKey);
    const dotBg  = dc === 'green' ? '#22c37a' : dc === 'yellow' ? '#ffd76c' : dc === 'red' ? '#ff7474' : 'rgba(128,128,128,.3)';
    const tipText = dc === 'green' ? 'Engine ready' : dc === 'yellow' ? 'Warnings' : dc === 'red' ? 'Not connected' : 'Unknown';

    return (
      <button
        onClick={() => onNavigate(id)}
        className="nav-item-btn"
        style={{
          fontWeight: active ? 600 : 400,
          fontSize: small ? 11.5 : 12.5,
          color: active ? 'var(--text)' : small ? 'rgba(128,128,128,.55)' : 'var(--muted)',
          background: active
            ? engineColor ? `${engineColor}14` : 'rgba(79,134,240,.1)'
            : 'transparent',
          boxShadow: active ? `inset 2.5px 0 0 ${engineColor ?? 'var(--accent)'}` : undefined,
        }}
      >
        <Icon
          size={small ? 12 : 13}
          style={{ flexShrink: 0, color: active ? (engineColor ?? 'var(--accent)') : engineColor ? `${engineColor}88` : 'var(--muted)' }}
        />
        <span style={{ flex: 1, textAlign: 'left' }}>{label}</span>
        {statusKey && dc && (
          <Tooltip text={tipText} position="right" delay={300}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', flexShrink: 0, background: dotBg, display: 'inline-block' }} />
          </Tooltip>
        )}
      </button>
    );
  }

  return (
    <aside style={{ display: 'flex', flexDirection: 'column' }}>

      {/* ── Brand pill ── */}
      <button
        onClick={() => onNavigate('Brands')}
        title={activeBrand ? `Switch brand` : 'Select a brand'}
        style={{
          display: 'flex', alignItems: 'center', gap: 9,
          width: '100%', padding: '8px 10px', marginBottom: 14,
          borderRadius: 9, cursor: 'pointer', border: 'none',
          background: activeBrand
            ? `linear-gradient(135deg, ${activeBrand.color || 'var(--accent)'}18, ${activeBrand.color || 'var(--accent)'}08)`
            : 'rgba(128,128,128,.06)',
          outline: `1px solid ${activeBrand ? (activeBrand.color || 'var(--accent)') + '35' : 'rgba(128,128,128,.14)'}`,
          transition: 'background .15s, outline-color .15s',
        }}
      >
        <div style={{
          width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
          background: activeBrand ? (activeBrand.color || 'var(--accent)') : 'rgba(128,128,128,.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 800, color: '#fff', letterSpacing: '-.01em',
        }}>
          {activeBrand ? activeBrand.name.charAt(0).toUpperCase() : '?'}
        </div>
        <span style={{ fontSize: 12, fontWeight: activeBrand ? 600 : 400, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: activeBrand ? 'var(--text)' : 'var(--muted)' }}>
          {activeBrand ? activeBrand.name : 'No brand'}
        </span>
        <ChevronDown size={11} style={{ color: 'var(--muted)', flexShrink: 0, opacity: .6 }} />
      </button>

      {/* ── Workspace ── */}
      <NavItem id="Dashboard"   icon={LayoutDashboard} label="Dashboard"   />
      <NavItem id="Generate"    icon={Zap}             label="Generate"    />
      <NavItem id="Brands"      icon={Building2}       label="Brands"      />
      <NavItem id="Brand Batch" icon={Boxes}           label="Brand Batch" />
      <NavItem id="Projects"    icon={FolderOpen}      label="Projects"    />
      <NavItem id="Outputs"     icon={Boxes}           label="Outputs"     />

      {/* ── Divider: Engines ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 2px 6px' }}>
        <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
        <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', opacity: .4 }}>Engines</span>
        <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
      </div>

      {/* ── Engines ── */}
      {ENGINE_NAV.map(e => (
        <NavItem key={e.id} id={e.id} icon={e.icon} label={e.label} engineColor={e.color} statusKey={(e as any).statusKey} />
      ))}

      {/* ── Spacer ── */}
      <div style={{ flex: 1 }} />

      {/* ── Divider: Tools ── */}
      <div style={{ height: 1, background: 'var(--line)', margin: '10px 2px 8px' }} />

      {/* ── Tools (subtle) ── */}
      <NavItem id="Templates"     icon={FileImage} label="Templates"     small />
      <NavItem id="Claude"        icon={Bot}       label="Claude AI"     small />
      <NavItem id="Monday"        icon={Zap}       label="Monday.com"    small />
      <NavItem id="Skills Studio" icon={Package}   label="Skills Studio" small />
      <NavItem id="Diagnostics"   icon={Activity}  label="Diagnostics"   small />

      {/* ── Electron status / copy-launch ── */}
      <ElectronStatus />
    </aside>
  );
}

// ── app shell ─────────────────────────────────────────────────────────────────

// ── Update banner ─────────────────────────────────────────────────────────────

function UpdateBanner() {
  const [update, setUpdate] = useState<{ status: string; version?: string; percent?: number } | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!window.creativePlatform.onUpdateStatus) return;
    const unsub = window.creativePlatform.onUpdateStatus((info) => {
      if (info.status === 'current' || info.status === 'checking') return;
      setUpdate(info);
      setDismissed(false);
    });
    return unsub;
  }, []);

  if (!update || dismissed) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
      background: update.status === 'ready' ? 'var(--green)' : 'var(--accent)',
      color: '#000', fontSize: 13, fontWeight: 600,
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
      padding: '7px 16px',
    }}>
      {update.status === 'downloading' && `Downloading update… ${update.percent ?? 0}%`}
      {update.status === 'available' && `Update available — v${update.version} is downloading…`}
      {update.status === 'ready' && (
        <>
          v{update.version} ready to install
          <button
            onClick={() => window.creativePlatform.installUpdate?.()}
            style={{ fontSize: 12, padding: '3px 12px', background: 'rgba(0,0,0,.2)', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 700, color: '#fff' }}
          >
            Restart &amp; Install
          </button>
          <button onClick={() => setDismissed(true)} style={{ fontSize: 11, background: 'none', border: 'none', cursor: 'pointer', opacity: 0.6, color: '#000' }}>Later</button>
        </>
      )}
      {update.status === 'error' && (
        <>
          Update check failed
          <button onClick={() => setDismissed(true)} style={{ fontSize: 11, background: 'none', border: 'none', cursor: 'pointer', opacity: 0.6, color: '#000' }}>✕</button>
        </>
      )}
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState('Dashboard');
  const { status } = usePlatformStore();

  // ── theme ──────────────────────────────────────────────────────────────────
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('app-theme') as 'dark' | 'light') || 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('app-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  return (
    <div className="app-shell">
      <UpdateBanner />
      <TopBar screen={screen} theme={theme} onToggleTheme={toggleTheme} />
      <Sidebar screen={screen} onNavigate={setScreen} status={status} />
      <main>
        <div key={screen} className="screen-fade-in" style={{ height: '100%' }}>
          {screen === 'Dashboard'     && <Dashboard onNavigate={setScreen} />}
          {screen === 'Illustrator'   && <IllustratorScreen />}
          {screen === 'InDesign'      && <InDesignScreen />}
          {screen === 'Projects'      && <ProjectsScreen />}
          {screen === 'Templates'     && <TemplatesScreen onNavigate={setScreen} />}
          {screen === 'Outputs'       && <OutputCenter onNavigate={setScreen} />}
          {screen === 'Canva'         && <CanvaScreen />}
          {screen === 'Adobe Express' && <AdobeExpressScreen />}
          {screen === 'Figma'         && <FigmaScreen />}
          {screen === 'Brands'        && <BrandsScreen onNavigate={setScreen} />}
          {screen === 'Generate'      && <BrandGenerateScreen onNavigate={setScreen} />}
          {screen === 'Brand Batch'   && <BrandBatchScreen />}
          {screen === 'Batch'         && <BatchScreen />}
          {screen === 'Claude'        && <ClaudeScreen onNavigate={setScreen} />}
          {screen === 'Monday'        && <MondayScreen />}
          {screen === 'Skills Studio' && <SkillsStudioScreen />}
          {screen === 'Diagnostics'   && <DiagnosticsScreen />}
        </div>
      </main>
      <ToastContainer />
    </div>
  );
}
