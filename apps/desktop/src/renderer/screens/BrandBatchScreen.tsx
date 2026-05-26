import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronRight,
  Download, ExternalLink, FileText, FolderOpen, Image, Layers, Plus,
  RefreshCw, Sparkles, Trash2, Upload, Zap,
} from 'lucide-react';
import { usePlatformStore } from '../state/usePlatformStore';
import { toast } from '../components/Toast';
import { PreflightPanel, PreflightEngine, PreflightRow } from '../components/PreflightPanel';

// ─── Types ────────────────────────────────────────────────────────────────────

type EngineKey = 'illustrator' | 'indesign' | 'canva' | 'adobe_express' | 'figma';
const ENGINE_ORDER: EngineKey[] = ['illustrator', 'indesign', 'canva', 'adobe_express', 'figma'];

const ENGINE_FULL: Record<EngineKey, string> = {
  illustrator: 'Illustrator', indesign: 'InDesign', canva: 'Canva',
  adobe_express: 'Adobe Express', figma: 'Figma',
};
// Short readable labels — NOT "AI" (confusing with AI/LLM)
const ENGINE_SHORT: Record<EngineKey, string> = {
  illustrator: 'ILLO', indesign: 'INDD', canva: 'CANVA',
  adobe_express: 'EXPR', figma: 'FIGMA',
};
const ENGINE_COLORS: Record<EngineKey, { fg: string; bg: string; border: string }> = {
  illustrator:   { fg: 'var(--eng-illo)',  bg: 'var(--eng-illo-bg)',  border: 'var(--eng-illo-bd)'  },
  indesign:      { fg: 'var(--eng-indd)',  bg: 'var(--eng-indd-bg)',  border: 'var(--eng-indd-bd)'  },
  canva:         { fg: 'var(--eng-canva)', bg: 'var(--eng-canva-bg)', border: 'var(--eng-canva-bd)' },
  adobe_express: { fg: 'var(--eng-expr)',  bg: 'var(--eng-expr-bg)',  border: 'var(--eng-expr-bd)'  },
  figma:         { fg: 'var(--eng-figma)', bg: 'var(--eng-figma-bg)', border: 'var(--eng-figma-bd)' },
};

type CellStatus = 'idle' | 'filling' | 'ready' | 'generating' | 'done' | 'error' | 'skipped';

interface EngineCell {
  status: CellStatus;
  content: Record<string, string>;
  /** Image fields (type:'image') — paths or URLs, kept separate from text content */
  images: Record<string, string>;
  output?: any;
  error?: string;
}

interface BatchRow {
  id: string;
  outputName: string;
  brief: string;
  csvData: Record<string, string>;
  engines: Record<EngineKey, EngineCell>;
  expanded: boolean;
  activeEngineTab?: EngineKey;
}

// ─── Field definitions per engine ────────────────────────────────────────────

/** Derive brief fields from a template's manifest editable_objects. Returns null if no manifest. */
function fieldLabelBatch(key: string) {
  return key.replace(/^(TEXT_|DOC_|IMAGE_|SECTION_|STAT_)/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
function getManifestBriefFields(template: any): BriefField[] | null {
  const objs = template?.manifest?.editable_objects ?? template?.editableObjects;
  if (!objs || typeof objs !== 'object') return null;
  const fields = (Object.entries(objs) as [string, any][]).map(([key, v]) => ({
    key,
    label: fieldLabelBatch(key),
    required: !!v.required,
    maxChars: v.max_chars as number | undefined,
    type: (v.type === 'image' ? 'image' : 'text') as 'text' | 'image',
  }));
  return fields.length > 0 ? fields : null;
}

interface BriefField {
  key: string;
  label: string;
  required: boolean;
  maxChars?: number;
  /** 'image' fields are stored in cell.images rather than cell.content */
  type?: 'text' | 'image';
}

const ENGINE_FIELDS: Record<EngineKey, BriefField[]> = {
  illustrator: [
    { key: 'TEXT_TITLE',           label: 'Title / Headline',    required: true,  maxChars: 120 },
    { key: 'TEXT_SUBTITLE',        label: 'Sub-headline',        required: false, maxChars: 180 },
    { key: 'TEXT_CHALLENGE_BODY',  label: 'Challenge Body',      required: false, maxChars: 600 },
    { key: 'TEXT_SOLUTION_BODY',   label: 'Solution Body',       required: false, maxChars: 600 },
    { key: 'TEXT_RESULTS_BODY',    label: 'Results Body',        required: false, maxChars: 600 },
    { key: 'TEXT_SERVICES_BODY',   label: 'Services List',       required: false, maxChars: 350 },
    { key: 'TEXT_STAT_01',         label: 'Stat 1 Value',        required: false, maxChars: 12  },
    { key: 'TEXT_STAT_01_LABEL',   label: 'Stat 1 Label',        required: false, maxChars: 40  },
    { key: 'TEXT_STAT_02',         label: 'Stat 2 Value',        required: false, maxChars: 12  },
    { key: 'TEXT_STAT_02_LABEL',   label: 'Stat 2 Label',        required: false, maxChars: 40  },
    { key: 'TEXT_STAT_03',         label: 'Stat 3 Value',        required: false, maxChars: 12  },
    { key: 'TEXT_STAT_03_LABEL',   label: 'Stat 3 Label',        required: false, maxChars: 40  },
    { key: 'TEXT_STAT_04',         label: 'Stat 4 Value',        required: false, maxChars: 12  },
    { key: 'TEXT_STAT_04_LABEL',   label: 'Stat 4 Label',        required: false, maxChars: 40  },
    { key: 'IMAGE_HERO',           label: 'Hero Image',          required: false, type: 'image' },
  ],
  indesign: [
    { key: 'DOC_TITLE',                  label: 'Document Title',    required: true,  maxChars: 120  },
    { key: 'SECTION_EXECUTIVE_SUMMARY',  label: 'Executive Summary', required: true,  maxChars: 800  },
    { key: 'SECTION_BODY',               label: 'Body Content',      required: false, maxChars: 1200 },
    { key: 'SECTION_CHALLENGE',          label: 'Challenge Section', required: false, maxChars: 600  },
    { key: 'SECTION_SOLUTION',           label: 'Solution Section',  required: false, maxChars: 600  },
    { key: 'IMAGE_HERO',                 label: 'Hero Image',        required: false, type: 'image'  },
    { key: 'IMAGE_FIGURE_01',            label: 'Figure / Chart',    required: false, type: 'image'  },
  ],
  canva: [
    { key: 'HEADLINE',    label: 'Headline',       required: true,  maxChars: 80  },
    { key: 'SUBHEADLINE', label: 'Sub-headline',   required: false, maxChars: 150 },
    { key: 'BODY_COPY',   label: 'Body Copy',      required: false, maxChars: 400 },
    { key: 'CTA_TEXT',    label: 'Call to Action', required: false, maxChars: 40  },
    { key: 'STAT_01',     label: 'Stat 1',         required: false, maxChars: 30  },
    { key: 'STAT_02',     label: 'Stat 2',         required: false, maxChars: 30  },
  ],
  adobe_express: [
    { key: 'HEADLINE',    label: 'Headline',       required: true,  maxChars: 80  },
    { key: 'SUBHEADLINE', label: 'Sub-headline',   required: false, maxChars: 150 },
    { key: 'BODY_TEXT',   label: 'Body Text',      required: false, maxChars: 400 },
    { key: 'CTA',         label: 'Call to Action', required: false, maxChars: 40  },
  ],
  figma: [
    { key: 'TEXT_TITLE',    label: 'Title',     required: true,  maxChars: 120 },
    { key: 'TEXT_SUBTITLE', label: 'Sub-title', required: false, maxChars: 180 },
    { key: 'TEXT_BODY',     label: 'Body',      required: false, maxChars: 600 },
    { key: 'TEXT_CTA',      label: 'CTA',       required: false, maxChars: 40  },
    { key: 'STAT_01',       label: 'Stat 1',    required: false, maxChars: 60  },
    { key: 'STAT_02',       label: 'Stat 2',    required: false, maxChars: 60  },
  ],
};

// ─── CSV parsing ──────────────────────────────────────────────────────────────

function parseCSV(text: string): Record<string, string>[] {
  const clean = text.replace(/^﻿/, '');
  const lines = clean.split(/\r?\n/).filter(l => l.trim() && !l.trim().startsWith('#'));
  if (lines.length < 2) return [];
  const headers = splitCSVLine(lines[0]).map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return lines.slice(1).map(line => {
    const vals = splitCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (vals[i] || '').trim(); });
    return row;
  }).filter(r => Object.values(r).some(v => v));
}

function splitCSVLine(line: string): string[] {
  const result: string[] = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) { result.push(cur); cur = ''; }
    else cur += ch;
  }
  result.push(cur);
  return result;
}

// ─── CSV row → engine content mapping ────────────────────────────────────────

/** Returns text content per engine (image fields excluded — use csvToEngineImages). */
function csvToEngineContent(row: Record<string, string>): Record<EngineKey, Record<string, string>> {
  return {
    illustrator: {
      TEXT_TITLE:          row.headline || row.company_name || '',
      TEXT_SUBTITLE:       row.subheadline || row.tagline || '',
      TEXT_CHALLENGE_BODY: row.challenge_body || row.body_copy || '',
      TEXT_SOLUTION_BODY:  row.solution_body || row.body_copy || '',
      TEXT_RESULTS_BODY:   row.results_body || '',
      TEXT_SERVICES_BODY:  row.services_body || row.services_list || '',
      // Stats: send value + label as separate fields so Baxter-style templates get both frames filled.
      // Master/Healthcare templates only have TEXT_STAT_0N frames (labels skipped silently).
      TEXT_STAT_01:        row.stat_01_value || '',
      TEXT_STAT_01_LABEL:  row.stat_01_label || '',
      TEXT_STAT_02:        row.stat_02_value || '',
      TEXT_STAT_02_LABEL:  row.stat_02_label || '',
      TEXT_STAT_03:        row.stat_03_value || '',
      TEXT_STAT_03_LABEL:  row.stat_03_label || '',
      TEXT_STAT_04:        row.stat_04_value || '',
      TEXT_STAT_04_LABEL:  row.stat_04_label || '',
    },
    indesign: {
      DOC_TITLE:                 row.headline || row.company_name || '',
      SECTION_EXECUTIVE_SUMMARY: row.body_copy || row.subheadline || '',
      SECTION_BODY:              row.body_copy || '',
      SECTION_CHALLENGE:         row.challenge_body || '',
      SECTION_SOLUTION:          row.solution_body || '',
    },
    canva: {
      HEADLINE:    row.headline || '',
      SUBHEADLINE: row.subheadline || row.tagline || '',
      BODY_COPY:   row.body_copy || '',
      CTA_TEXT:    row.cta_text || '',
      STAT_01: [row.stat_01_value, row.stat_01_label].filter(Boolean).join(' '),
      STAT_02: [row.stat_02_value, row.stat_02_label].filter(Boolean).join(' '),
    },
    adobe_express: {
      HEADLINE:    row.headline || '',
      SUBHEADLINE: row.subheadline || row.tagline || '',
      BODY_TEXT:   row.body_copy || '',
      CTA:         row.cta_text || '',
    },
    figma: {
      TEXT_TITLE:    row.headline || '',
      TEXT_SUBTITLE: row.subheadline || row.tagline || '',
      TEXT_BODY:     row.body_copy || '',
      TEXT_CTA:      row.cta_text || '',
      STAT_01: [row.stat_01_value, row.stat_01_label].filter(Boolean).join(' '),
      STAT_02: [row.stat_02_value, row.stat_02_label].filter(Boolean).join(' '),
    },
  };
}

/**
 * Extract image fields from a CSV row.
 * Recognises common column naming patterns:
 *   image_hero, hero_image, hero_img, image_figure_01, figure_01, image_1, img_1, etc.
 * Returns per-engine image maps (same value shared where applicable).
 */
function csvToEngineImages(row: Record<string, string>): Record<EngineKey, Record<string, string>> {
  // Resolve the hero image from several possible column names
  const hero = row.image_hero || row.hero_image || row.hero_img || row.image_1 || row.img_1 || row.image || '';
  const figure01 = row.image_figure_01 || row.figure_01 || row.figure_1 || row.image_2 || row.img_2 || '';
  return {
    illustrator:   { ...(hero     ? { IMAGE_HERO: hero }           : {}) },
    indesign:      { ...(hero     ? { IMAGE_HERO: hero }           : {}),
                     ...(figure01 ? { IMAGE_FIGURE_01: figure01 }  : {}) },
    canva:         {},
    adobe_express: {},
    figma:         {},
  };
}

function synthesizeBrief(row: Record<string, string>): string {
  if (row.brief) return row.brief;
  const parts: string[] = [];
  if (row.company_name) parts.push(row.company_name);
  if (row.tagline)      parts.push(row.tagline);
  if (row.headline)     parts.push(row.headline);
  if (row.subheadline)  parts.push(row.subheadline);
  if (row.body_copy)    parts.push(row.body_copy);
  if (row.challenge_body) parts.push(`Challenge: ${row.challenge_body}`);
  if (row.solution_body)  parts.push(`Solution: ${row.solution_body}`);
  if (row.results_body)   parts.push(`Results: ${row.results_body}`);
  if (row.client_quote)   parts.push(`Quote: ${row.client_quote}${row.client_name ? ' — ' + row.client_name : ''}${row.client_title ? ', ' + row.client_title : ''}`);
  if (row.cta_text)       parts.push(`CTA: ${row.cta_text}`);
  return parts.filter(Boolean).join('. ');
}

function hasDirectContent(row: Record<string, string>): boolean {
  return !!(row.headline || row.body_copy || row.challenge_body || row.solution_body);
}

function blankEngineCell(included: boolean): EngineCell {
  return { status: included ? 'idle' : 'skipped', content: {}, images: {} };
}

function makeRow(csvData: Record<string, string>, includedEngines: EngineKey[]): BatchRow {
  const engines = Object.fromEntries(
    ENGINE_ORDER.map(e => [e, blankEngineCell(includedEngines.includes(e))])
  ) as Record<EngineKey, EngineCell>;

  const brief = synthesizeBrief(csvData);

  if (hasDirectContent(csvData)) {
    const mapped = csvToEngineContent(csvData);
    const mappedImages = csvToEngineImages(csvData);
    for (const e of includedEngines) {
      engines[e] = { status: 'ready', content: mapped[e], images: mappedImages[e] ?? {} };
    }
  } else {
    // Even if there's no text content, still capture any image columns from CSV
    const mappedImages = csvToEngineImages(csvData);
    for (const e of includedEngines) {
      if (Object.keys(mappedImages[e] ?? {}).length > 0) {
        engines[e] = { ...engines[e], images: mappedImages[e] };
      }
    }
  }

  return {
    id: `row_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    outputName: csvData.output_name || `output_${Date.now()}`,
    brief,
    csvData,
    engines,
    expanded: false,
    activeEngineTab: includedEngines[0],
  };
}

// ─── CSV helpers ─────────────────────────────────────────────────────────────

function downloadExampleCSV() {
  const header = [
    'output_name',
    'headline',
    'subheadline',
    'tagline',
    'body_copy',
    'challenge_body',
    'solution_body',
    'results_body',
    'services_body',      // Baxter/Life Sciences right-column services list
    'cta_text',
    'stat_01_value',      // stat number only, e.g. "20%+"
    'stat_01_label',      // stat descriptor, e.g. "Increase in Division Sales"
    'stat_02_value',
    'stat_02_label',
    'stat_03_value',
    'stat_03_label',
    'stat_04_value',      // 4th stat — used by Baxter-style templates
    'stat_04_label',
    'company_name',
    'client_name',
    'client_title',
    'client_quote',
    // ── image columns ──
    'image_hero',         // URL or /absolute/path — maps to IMAGE_HERO in Illustrator & InDesign
    'image_figure_01',    // URL or /absolute/path — maps to IMAGE_FIGURE_01 in InDesign
  ].join(',');

  function row(vals: string[]) {
    return vals.map(v => v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v).join(',');
  }

  const rows = [
    header,
    // ── Row 1: Master / standard case study template ───────────────────────────
    row([
      'TransPerfect_CaseStudy_v1',
      'Translating Growth: How TransPerfect Scaled Global Content 3x',
      'AI-native localization pipelines cut time-to-market in half',
      'Transforming Global Performance',
      'TransPerfect partnered with Fortune 500 clients to deploy automated multilingual content pipelines — reducing production cycles from weeks to hours while maintaining brand consistency across 40+ languages.',
      'Marketing teams struggled to localize campaign assets at the speed of product launches, creating costly delays and inconsistent brand experiences across regions.',
      'TransPerfect implemented an AI-native content pipeline integrating translation memory, automated layout adaptation, and real-time QA — seamlessly connected to existing creative tooling.',
      '3x faster content production · 60% reduction in revision cycles · 100% brand-consistent across all markets',
      '',  // no services column for this template style
      'Request a demo at transperfect.com',
      '3×', 'Faster Production',
      '60%', 'Fewer Revisions',
      '40+', 'Languages Supported',
      '', '',  // no 4th stat
      'TransPerfect',
      'Jane Smith', 'VP Marketing, GlobalCo',
      '"TransPerfect transformed how we go to market globally — what used to take three weeks now takes three days."',
      'https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=1600&q=80',
      'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1200&q=80',
    ]),
    // ── Row 2: Baxter / Life Sciences template (4 stats + services column) ─────
    row([
      'Baxter_HCP_Engagement_v1',
      'Globally Scaling HCP Engagement for Baxter',
      'How TransPerfect helped Baxter drive sales through a multilingual, education-led, global digital campaign.',
      'One Team, Big Impact',
      'TransPerfect partnered with Baxter to design and execute a repeatable, multi-market educational webinar campaign targeting healthcare professionals across APAC.',
      'Baxter needed to drive sales growth through scaled HCP engagement and reach a fragmented, multilingual audience across APAC.',
      'TransPerfect developed a repeatable, multi-market educational webinar campaign including promotion, registration, simultaneous interpretation, hybrid event support, and post-event on-demand content.',
      '',  // no results body — use services list instead
      'Live action production\nEvent videography\nMulti-market campaign strategy\nContent repurposing\nCollateral design\nOn-site and hybrid event planning\nLive-streaming content\nWebsite design and development',
      '',  // no CTA text
      '20%+', 'Increase in Division Sales',
      '10,000+', 'Registrations Generated',
      '5,500+', 'Qualified Leads Delivered',
      '60%', 'Attendance Rate',
      'Baxter',
      '', '', '',
      'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=1600&q=80',  // medical/healthcare IMAGE_HERO
      '',
    ]),
  ];

  const blob = new Blob(['﻿' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'brand_batch_template.csv';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

function downloadResultsCSV(rows: BatchRow[], includedEngines: EngineKey[]) {
  function esc(v: string) {
    if (v.includes(',') || v.includes('"') || v.includes('\n')) return '"' + v.replace(/"/g, '""') + '"';
    return v;
  }
  const headers = ['output_name', 'row_status', ...includedEngines.map(e => `${e}_status`), 'brief'];
  const lines = [
    headers.join(','),
    ...rows.map(r => {
      const rowStatus = includedEngines.every(e => r.engines[e].status === 'done') ? 'done'
        : includedEngines.some(e => r.engines[e].status === 'error') ? 'partial'
        : 'pending';
      return [
        esc(r.outputName), esc(rowStatus),
        ...includedEngines.map(e => esc(r.engines[e].status)),
        esc(r.brief.slice(0, 200)),
      ].join(',');
    }),
  ];
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'brand_batch_results.csv';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ─── Status helpers ───────────────────────────────────────────────────────────

const CELL_COLOR: Record<CellStatus, string> = {
  idle:       'var(--muted)',
  filling:    'var(--accent)',
  ready:      'var(--green)',
  generating: 'var(--accent)',
  done:       'var(--green)',
  error:      'var(--red)',
  skipped:    'var(--border-subtle)',   // adaptive: white-ish on dark, grey on light
};
const CELL_BG: Record<CellStatus, string> = {
  idle:       'var(--surface-dim)',
  filling:    'rgba(79,134,240,.18)',
  ready:      'rgba(117,245,174,.14)',
  generating: 'rgba(79,134,240,.22)',
  done:       'rgba(117,245,174,.18)',
  error:      'rgba(255,116,116,.18)',
  skipped:    'var(--surface-dim)',
};
// Explicit per-status border colors (avoid hex-alpha concat with CSS vars)
const CELL_BORDER: Record<CellStatus, string> = {
  idle:       'rgba(128,128,128,.18)',
  filling:    'rgba(79,134,240,.35)',
  ready:      'rgba(117,245,174,.32)',
  generating: 'rgba(79,134,240,.35)',
  done:       'rgba(117,245,174,.32)',
  error:      'rgba(255,116,116,.32)',
  skipped:    'var(--border-dim)',
};

function rowSummaryStatus(row: BatchRow, engines: EngineKey[]): { label: string; color: string } {
  const active = engines.filter(e => row.engines[e].status !== 'skipped');
  if (active.length === 0) return { label: 'No engines', color: 'var(--muted)' };
  if (active.every(e => row.engines[e].status === 'done'))       return { label: 'Done',        color: 'var(--green)'  };
  if (active.some(e  => row.engines[e].status === 'generating')) return { label: 'Generating…',  color: 'var(--accent)' };
  if (active.some(e  => row.engines[e].status === 'filling'))    return { label: 'Filling…',     color: 'var(--accent)' };
  if (active.every(e => row.engines[e].status === 'ready'))      return { label: 'Ready',        color: 'var(--green)'  };
  if (active.some(e  => row.engines[e].status === 'error'))      return { label: 'Partial error', color: 'var(--yellow)' };
  return { label: 'Idle', color: 'var(--muted)' };
}

// ─── Template Config Panel ────────────────────────────────────────────────────

interface TemplatePanelProps {
  brands: any[];
  activeBrandId: string | null;
  allTemplates: any[];
  onSelectBrand: (id: string) => void;
}

// Lazy-loads a template thumbnail. Falls back to an icon placeholder.
function TemplateThumbnailImg({ templateId, thumbnailUrl }: { templateId: string; thumbnailUrl?: string }) {
  const [src, setSrc] = useState<string | null>(thumbnailUrl ?? null);
  useEffect(() => {
    if (src) return;
    window.creativePlatform.getTemplateThumbnail(templateId).then((r: any) => {
      if (r?.ok && r.thumbnailUrl) setSrc(r.thumbnailUrl);
    });
  }, [templateId]);

  return (
    <div style={{
      width: '100%', aspectRatio: '4/3', overflow: 'hidden',
      background: 'var(--surface-mid)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {src
        ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        : <Image size={18} style={{ color: 'var(--muted)', opacity: .3 }} />}
    </div>
  );
}

function TemplateConfigPanel({ brands, activeBrandId, allTemplates, onSelectBrand }: TemplatePanelProps) {
  const activeBrand = brands.find(b => b.id === activeBrandId);

  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 12, marginBottom: 16, overflow: 'hidden' }}>
      {/* Brand selector row */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
          Active Brand
        </div>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          {brands.map(b => {
            const engCount = ENGINE_ORDER.filter(e => !!b.templates?.[e]).length;
            const isActive = activeBrandId === b.id;
            return (
              <button
                key={b.id}
                onClick={() => onSelectBrand(b.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                  background: isActive ? 'rgba(79,134,240,.14)' : 'var(--surface-dim)',
                  border: `1px solid ${isActive ? 'rgba(79,134,240,.45)' : 'var(--border-subtle)'}`,
                  color: isActive ? 'var(--accent)' : 'var(--text)', cursor: 'pointer',
                  transition: 'border-color .12s, background .12s',
                }}
              >
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: b.color || '#4f86f0', flexShrink: 0 }} />
                {b.name}
                {b.isMaster && <span style={{ fontSize: 9, fontWeight: 700, color: isActive ? 'var(--accent)' : 'var(--muted)', opacity: .7 }}>MASTER</span>}
                <span style={{
                  fontSize: 9, padding: '1px 5px', borderRadius: 4, fontWeight: 700,
                  background: engCount > 0 ? 'rgba(117,245,174,.12)' : 'rgba(255,116,116,.12)',
                  color: engCount > 0 ? 'var(--green)' : 'var(--red)',
                  border: `1px solid ${engCount > 0 ? 'rgba(117,245,174,.25)' : 'rgba(255,116,116,.25)'}`,
                }}>
                  {engCount}/{ENGINE_ORDER.length} engines
                </span>
              </button>
            );
          })}
          {brands.length === 0 && (
            <span style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>No brands yet — create one in Brand Profiles.</span>
          )}
        </div>
      </div>

      {/* Engine template cards */}
      {activeBrand && (
        <div style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
            Templates for this batch
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
            {ENGINE_ORDER.map(eng => {
              const tid = activeBrand.templates?.[eng];
              const tmpl = allTemplates.find((t: any) => t.id === tid);
              const ec = ENGINE_COLORS[eng];
              const assigned = !!tid;

              return (
                <div key={eng} style={{
                  borderRadius: 9, overflow: 'hidden',
                  border: `1px solid ${assigned ? ec.border : 'var(--border-dim)'}`,
                  background: assigned ? ec.bg : 'var(--surface-dim)',
                  opacity: assigned ? 1 : 0.5,
                }}>
                  {/* Engine label bar */}
                  <div style={{
                    padding: '7px 10px',
                    display: 'flex', alignItems: 'center', gap: 6,
                    borderBottom: `1px solid ${assigned ? ec.border : 'var(--border-dim)'}`,
                    background: assigned ? ec.bg : 'transparent',
                  }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: assigned ? ec.fg : 'var(--muted)', flexShrink: 0 }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: assigned ? ec.fg : 'var(--muted)', flex: 1 }}>
                      {ENGINE_FULL[eng]}
                    </span>
                    {assigned
                      ? <CheckCircle2 size={10} style={{ color: ec.fg, flexShrink: 0 }} />
                      : <span style={{ fontSize: 9, color: 'var(--red)', fontWeight: 700 }}>SKIP</span>
                    }
                  </div>
                  {/* Thumbnail */}
                  {assigned && tmpl && (
                    <TemplateThumbnailImg templateId={tmpl.id} thumbnailUrl={tmpl.thumbnailUrl} />
                  )}
                  {/* Template name */}
                  <div style={{ padding: '7px 10px' }}>
                    {assigned && tmpl ? (
                      <>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={tmpl.name}>
                          {tmpl.name}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={tid}>
                          {tid}
                        </div>
                      </>
                    ) : assigned ? (
                      <div style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={tid}>
                        {tid}
                      </div>
                    ) : (
                      <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>
                        No template assigned
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {ENGINE_ORDER.every(e => !activeBrand.templates?.[e]) && (
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--yellow)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertTriangle size={12} />
              No templates assigned to this brand — go to Brand Profiles to assign templates before running a batch.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Engine status pill ───────────────────────────────────────────────────────

function EnginePill({ eng, cell, active }: { eng: EngineKey; cell: EngineCell; active: boolean }) {
  const ec = ENGINE_COLORS[eng];
  const s = cell.status;
  const color  = active ? CELL_COLOR[s]  : 'var(--muted)';
  const bg     = active ? CELL_BG[s]    : 'var(--surface-dim)';
  const border = active ? CELL_BORDER[s] : 'var(--border-dim)';

  return (
    <span
      title={`${ENGINE_FULL[eng]}: ${s}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 5,
        background: bg, color, border: `1px solid ${border}`,
        opacity: active ? 1 : 0.4,
        minWidth: 48, justifyContent: 'center',
      }}
    >
      {s === 'filling' || s === 'generating'
        ? <RefreshCw size={8} className="spin" />
        : s === 'done'  ? <CheckCircle2 size={8} />
        : s === 'error' ? <AlertTriangle size={8} />
        : <div style={{ width: 5, height: 5, borderRadius: '50%', background: active ? ec.fg : 'var(--border-mid)', flexShrink: 0 }} />
      }
      {ENGINE_SHORT[eng]}
    </span>
  );
}

// ─── Row expanded panel (tabbed) ──────────────────────────────────────────────

interface RowDetailProps {
  row: BatchRow;
  includedEngines: EngineKey[];
  isRunning: boolean;
  /** Map of engine key → resolved template object (with manifest) */
  templateMap: Partial<Record<EngineKey, any>>;
  onPatchRow: (p: Partial<BatchRow>) => void;
  onPatchCell: (eng: EngineKey, p: Partial<EngineCell>) => void;
}

function RowDetailPanel({ row, includedEngines, isRunning, templateMap, onPatchRow, onPatchCell }: RowDetailProps) {
  const activeTab = row.activeEngineTab ?? includedEngines[0];

  if (includedEngines.length === 0) {
    return (
      <div style={{ padding: '20px 16px', color: 'var(--muted)', fontSize: 12, textAlign: 'center' }}>
        <AlertTriangle size={16} style={{ marginBottom: 6, opacity: .5 }} /><br />
        No templates assigned to the active brand. Assign templates in Brand Profiles first.
      </div>
    );
  }

  const activeCell = row.engines[activeTab];
  const fields = getManifestBriefFields(templateMap[activeTab]) ?? ENGINE_FIELDS[activeTab] ?? [];
  const ec = ENGINE_COLORS[activeTab];

  return (
    <div style={{ borderTop: '1px solid var(--line)' }}>
      {/* Brief */}
      <div style={{ padding: '12px 14px 0' }}>
        <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 5 }}>
          Master Brief
          <span style={{ marginLeft: 8, opacity: .5 }}>Used by Claude to fill all engine fields</span>
        </label>
        <textarea
          className="field-input"
          rows={3}
          value={row.brief}
          onChange={e => onPatchRow({ brief: e.target.value })}
          placeholder="Describe the content for this row…"
          disabled={isRunning}
          style={{ resize: 'vertical', minHeight: 56, marginBottom: 0, fontSize: 12 }}
        />
      </div>

      {/* Engine tab bar */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', gap: 2,
        padding: '10px 14px 0', borderBottom: '1px solid var(--line)',
        overflowX: 'auto',
      }}>
        {includedEngines.map(eng => {
          const cell = row.engines[eng];
          const ec2  = ENGINE_COLORS[eng];
          const isActive = eng === activeTab;
          const s = cell.status;
          return (
            <button
              key={eng}
              onClick={() => onPatchRow({ activeEngineTab: eng })}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '6px 12px', border: 'none', cursor: 'pointer',
                borderRadius: '7px 7px 0 0', fontSize: 11, fontWeight: 600, flexShrink: 0,
                background: isActive ? 'var(--bg)' : 'transparent',
                color: isActive ? ec2.fg : 'var(--muted)',
                borderBottom: isActive ? `2px solid ${ec2.fg}` : '2px solid transparent',
                marginBottom: isActive ? -1 : 0,
                transition: 'color .12s',
              }}
            >
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: isActive ? ec2.fg : 'var(--muted)', flexShrink: 0 }} />
              {ENGINE_FULL[eng]}
              {/* Status dot */}
              <span style={{
                fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
                background: CELL_BG[s], color: CELL_COLOR[s],
                border: `1px solid ${CELL_BORDER[s]}`,
              }}>
                {s === 'done' ? '✓' : s === 'error' ? '!' : s === 'ready' ? '●' : s === 'filling' || s === 'generating' ? '…' : '○'}
              </span>
            </button>
          );
        })}
      </div>

      {/* Active tab content */}
      <div style={{ padding: '14px', background: 'var(--bg)' }}>
        {/* Error banner */}
        {activeCell.status === 'error' && activeCell.error && (
          <div style={{ marginBottom: 12, padding: '8px 10px', borderRadius: 7, background: 'rgba(255,116,116,.08)', border: '1px solid rgba(255,116,116,.2)', color: 'var(--red)', fontSize: 12, display: 'flex', gap: 7, alignItems: 'flex-start' }}>
            <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
            {activeCell.error}
          </div>
        )}

        {/* Done banner */}
        {activeCell.status === 'done' && (
          <div style={{ marginBottom: 12, padding: '8px 10px', borderRadius: 7, background: 'rgba(117,245,174,.06)', border: '1px solid rgba(117,245,174,.2)', color: 'var(--green)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 7 }}>
            <CheckCircle2 size={13} />
            Generated successfully
            {activeCell.output?.canvaUrl && (
              <a href={activeCell.output.canvaUrl} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: ENGINE_COLORS.canva.fg, textDecoration: 'none' }}>
                <ExternalLink size={10} /> Open in Canva
              </a>
            )}
            {activeCell.output?.editorUrl && (
              <a href={activeCell.output.editorUrl} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: ENGINE_COLORS.adobe_express.fg, textDecoration: 'none' }}>
                <ExternalLink size={10} /> Open in Adobe Express
              </a>
            )}
            {activeCell.output?.figmaUrl && (
              <a href={activeCell.output.figmaUrl} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: ENGINE_COLORS.figma.fg, textDecoration: 'none' }}>
                <ExternalLink size={10} /> Open in Figma
              </a>
            )}
          </div>
        )}

        {/* Template badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <span style={{ fontSize: 10, color: 'var(--muted)', flexShrink: 0 }}>Template:</span>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
            background: ec.bg, color: ec.fg, border: `1px solid ${ec.border}`,
          }}>
            {ENGINE_FULL[activeTab]}
          </span>
          <span style={{ fontSize: 11, color: 'var(--muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {(() => {
              const textFilled  = fields.filter(f => f.type !== 'image').filter(f => activeCell.content[f.key]).length;
              const textTotal   = fields.filter(f => f.type !== 'image').length;
              const imgFilled   = fields.filter(f => f.type === 'image').filter(f => activeCell.images?.[f.key]).length;
              const imgTotal    = fields.filter(f => f.type === 'image').length;
              const parts = [`${textFilled}/${textTotal} text fields`];
              if (imgTotal > 0) parts.push(`${imgFilled}/${imgTotal} image${imgTotal !== 1 ? 's' : ''}`);
              return parts.join(' · ');
            })()}
          </span>
        </div>

        {/* Fields */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {fields.map(f => {
            if (f.type === 'image') {
              const imgVal = activeCell.images?.[f.key] || '';
              const isUrl  = /^https?:\/\//i.test(imgVal);
              const isPath = imgVal.startsWith('/') || imgVal.startsWith('file://');
              const previewSrc = isPath ? (imgVal.startsWith('file://') ? imgVal : `file://${imgVal}`) : isUrl ? imgVal : null;
              return (
                <div key={f.key} style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--muted)', marginBottom: 5 }}>
                    <Image size={10} style={{ color: ec.fg, flexShrink: 0 }} />
                    {f.label}
                    <span style={{ fontSize: 9, opacity: .55, marginLeft: 2 }}>URL or local path</span>
                  </label>
                  <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                    {/* Thumbnail preview */}
                    <div style={{
                      width: 56, height: 56, borderRadius: 6, flexShrink: 0, overflow: 'hidden',
                      background: 'var(--surface-mid)', border: `1px solid ${imgVal ? ec.border : 'var(--border-dim)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {previewSrc
                        ? <img src={previewSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={e2 => (e2.currentTarget.style.display = 'none')} />
                        : <Image size={18} style={{ color: 'var(--muted)', opacity: .3 }} />}
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <input
                        className="field-input"
                        placeholder="https://example.com/photo.jpg  or  /local/path/to/image.jpg"
                        value={imgVal}
                        onChange={e2 => onPatchCell(activeTab, {
                          images: { ...(activeCell.images || {}), [f.key]: e2.target.value },
                          status: 'ready',
                        })}
                        disabled={isRunning}
                        style={{ padding: '5px 8px', fontSize: 11 }}
                      />
                      {/* Local file browse */}
                      <label style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        fontSize: 10, fontWeight: 600, padding: '4px 10px', borderRadius: 6,
                        cursor: isRunning ? 'not-allowed' : 'pointer',
                        background: 'var(--surface-mid)', border: '1px solid var(--border-subtle)',
                        color: 'var(--muted)', width: 'fit-content', opacity: isRunning ? .5 : 1,
                      }}>
                        <FolderOpen size={10} />
                        Browse local file…
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/tiff,image/gif,image/webp,image/svg+xml"
                          style={{ display: 'none' }}
                          disabled={isRunning}
                          onChange={ev => {
                            const file = ev.target.files?.[0];
                            if (!file) return;
                            onPatchCell(activeTab, {
                              images: { ...(activeCell.images || {}), [f.key]: (file as any).path || file.name },
                              status: 'ready',
                            });
                            ev.target.value = '';
                          }}
                        />
                      </label>
                      {imgVal && (
                        <button
                          onClick={() => onPatchCell(activeTab, { images: { ...(activeCell.images || {}), [f.key]: '' } })}
                          disabled={isRunning}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, padding: '2px 8px', borderRadius: 5, cursor: 'pointer', border: '1px solid rgba(255,116,116,.3)', background: 'none', color: 'var(--red)', width: 'fit-content' }}
                        >
                          <Trash2 size={9} /> Clear
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            }

            const isLong = (f.maxChars ?? 0) > 100;
            return (
              <div key={f.key} style={isLong ? { gridColumn: '1 / -1' } : {}}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>
                  {f.required && <span style={{ color: ec.fg, fontWeight: 700 }}>*</span>}
                  {f.label}
                  {f.maxChars && <span style={{ marginLeft: 'auto', opacity: .5 }}>max {f.maxChars}</span>}
                </label>
                {isLong ? (
                  <textarea
                    className="field-input"
                    rows={2}
                    value={activeCell.content[f.key] || ''}
                    onChange={e => onPatchCell(activeTab, { content: { ...activeCell.content, [f.key]: e.target.value }, status: 'ready' })}
                    disabled={isRunning}
                    style={{ resize: 'vertical', minHeight: 48, fontSize: 11 }}
                  />
                ) : (
                  <input
                    className="field-input"
                    value={activeCell.content[f.key] || ''}
                    onChange={e => onPatchCell(activeTab, { content: { ...activeCell.content, [f.key]: e.target.value }, status: 'ready' })}
                    disabled={isRunning}
                    style={{ padding: '5px 8px', fontSize: 11 }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function BrandBatchScreen() {
  const [brands, setBrands]               = useState<any[]>([]);
  const [activeBrandId, setActiveBrandId] = useState<string | null>(null);
  const [allTemplates, setAllTemplates]   = useState<any[]>([]);
  const [rows, setRows]                   = useState<BatchRow[]>([]);
  const [globalFilling, setGlobalFilling] = useState(false);
  const [globalGenerating, setGlobalGenerating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const refreshBrand = usePlatformStore(s => s.refreshBrand);
  const pendingBatchBrief = usePlatformStore(s => s.pendingFill?.['__batch_brief__']?.brief);
  const clearPendingFill  = usePlatformStore(s => s.clearPendingFill);

  function load() {
    Promise.all([
      window.creativePlatform.listBrands(),
      window.creativePlatform.listTemplates(),
    ]).then(([br, tmpl]) => {
      const brandList = br.brands || [];
      setBrands(brandList);
      setAllTemplates(tmpl || []);
      const activeId = br.activeId || brandList[0]?.id || null;
      setActiveBrandId(activeId);
      if (pendingBatchBrief) {
        const engines = Object.fromEntries(ENGINE_ORDER.map(e => [e, blankEngineCell(true)])) as Record<EngineKey, EngineCell>;
        setRows([{ id: `row_${Date.now()}`, outputName: '', brief: pendingBatchBrief, csvData: {}, expanded: true, engines, activeEngineTab: 'illustrator' }]);
        clearPendingFill('__batch_brief__');
      }
    });
  }

  useEffect(() => { load(); }, []);

  const activeBrand      = brands.find(b => b.id === activeBrandId);
  const includedEngines  = ENGINE_ORDER.filter(e => !!activeBrand?.templates?.[e]);

  function templateFor(eng: EngineKey) {
    const tid = activeBrand?.templates?.[eng];
    return allTemplates.find(t => t.id === tid);
  }

  // ── Row helpers ──────────────────────────────────────────────────────────

  function patchRow(id: string, patch: Partial<BatchRow>) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  }

  function patchEngineCell(rowId: string, eng: EngineKey, patch: Partial<EngineCell>) {
    setRows(prev => prev.map(r => r.id === rowId
      ? { ...r, engines: { ...r.engines, [eng]: { ...r.engines[eng], ...patch } } }
      : r
    ));
  }

  function addBlankRow() {
    const row = makeRow({}, includedEngines);
    row.outputName = `output_${rows.length + 1}`;
    row.activeEngineTab = includedEngines[0];
    setRows(prev => [...prev, row]);
  }

  function removeRow(id: string) {
    setRows(prev => prev.filter(r => r.id !== id));
  }

  // ── CSV import ───────────────────────────────────────────────────────────

  function handleCSVImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      const parsed = parseCSV(text);
      if (!parsed.length) { toast('No valid rows found in CSV.', 'error'); return; }
      const newRows = parsed.map(d => makeRow(d, includedEngines));
      setRows(prev => [...prev, ...newRows]);
      toast(`Imported ${newRows.length} row${newRows.length !== 1 ? 's' : ''}.`);
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  // ── Fill with Claude ─────────────────────────────────────────────────────

  async function fillRow(row: BatchRow) {
    if (!row.brief.trim()) return;
    const toFill = includedEngines.filter(e => row.engines[e].status === 'idle');
    for (const e of toFill) patchEngineCell(row.id, e, { status: 'filling' });

    await Promise.all(toFill.map(async (eng) => {
      try {
        const tmplObj = templateFor(eng);
        const claudeFields = (getManifestBriefFields(tmplObj) ?? ENGINE_FIELDS[eng] ?? []).filter(f => f.type !== 'image');
        const res = await window.creativePlatform.claudeFillFields({
          brief: row.brief,
          fields: claudeFields,
          engine: eng,
          templateName: tmplObj?.name,
          brandContext: activeBrand ? { name: activeBrand.name, description: activeBrand.description, guidelines: activeBrand.guidelines, industry: activeBrand.industry } : undefined,
        });
        patchEngineCell(row.id, eng, res.ok
          ? { status: 'ready', content: res.content }  // images preserved via patchEngineCell merge
          : { status: 'error', error: res.message || 'Fill failed' }
        );
      } catch (e: any) {
        patchEngineCell(row.id, eng, { status: 'error', error: e.message });
      }
    }));
  }

  async function fillAll() {
    const idleRows = rows.filter(r =>
      includedEngines.some(e => r.engines[e].status === 'idle') && r.brief.trim()
    );
    if (!idleRows.length) { toast('No rows need filling.', 'error'); return; }
    setGlobalFilling(true);
    await Promise.all(idleRows.map(fillRow));
    setGlobalFilling(false);
    toast(`Filled ${idleRows.length} row${idleRows.length !== 1 ? 's' : ''}.`);
  }

  // ── Generate ─────────────────────────────────────────────────────────────

  async function generateRow(row: BatchRow) {
    const toRun = includedEngines.filter(e => row.engines[e].status === 'ready');
    for (const e of toRun) patchEngineCell(row.id, e, { status: 'generating' });

    await Promise.all(toRun.map(async (eng) => {
      const tmpl = templateFor(eng);
      const content = row.engines[eng].content;
      const images  = row.engines[eng].images;
      const base = row.outputName;
      try {
        let res: any;
        if (eng === 'illustrator')        res = await window.creativePlatform.runIllustratorCustom({ template: tmpl?.id, content, images, output_name: `${base}_ai` });
        else if (eng === 'indesign')      res = await window.creativePlatform.runInDesignCustom({ template: tmpl?.id, content, images, output_name: `${base}_id` });
        else if (eng === 'canva')         res = await window.creativePlatform.runCanvaJob({ templateId: tmpl?.id, content, outputName: `${base}_canva` });
        else if (eng === 'adobe_express') res = await window.creativePlatform.runAdobeExpressJob({ templateId: tmpl?.id, templateUrn: tmpl?.adobeTemplateUrn, editorUrl: tmpl?.adobeEditorUrl, content, outputName: `${base}_ae` });
        else if (eng === 'figma')         res = await window.creativePlatform.runFigmaJob({ figmaFileKey: tmpl?.figmaFileKey, figmaNodeId: tmpl?.figmaNodeId, content, outputName: `${base}_figma` });

        patchEngineCell(row.id, eng, res?.ok
          ? { status: 'done', output: res }
          : { status: 'error', error: res?.userMessage || res?.message || 'Failed' }
        );
      } catch (e: any) {
        patchEngineCell(row.id, eng, { status: 'error', error: e.message });
      }
    }));
  }

  async function generateAll() {
    const readyRows = rows.filter(r => includedEngines.some(e => r.engines[e].status === 'ready'));
    if (!readyRows.length) { toast('No rows ready. Fill briefs first.', 'error'); return; }
    setGlobalGenerating(true);
    for (const row of readyRows) await generateRow(row);
    refreshBrand();
    setGlobalGenerating(false);
    toast(`Batch complete — ${readyRows.length} row${readyRows.length !== 1 ? 's' : ''} processed.`);
  }

  // ── Proof render (single row, all engines) ──────────────────────────────

  async function runProofRow(rowId: string): Promise<Record<string, { ok: boolean; output?: any; error?: string }>> {
    const row = rows.find(r => r.id === rowId);
    if (!row) return {};
    const results: Record<string, { ok: boolean; output?: any; error?: string }> = {};
    await Promise.all(includedEngines.map(async (eng) => {
      const tmpl = templateFor(eng);
      const content = row.engines[eng].content;
      const images  = row.engines[eng].images;
      const base = row.outputName || 'proof';
      try {
        let res: any;
        if (eng === 'illustrator')        res = await window.creativePlatform.runIllustratorCustom({ template: tmpl?.id, content, images, output_name: `PROOF_${base}_ai` });
        else if (eng === 'indesign')      res = await window.creativePlatform.runInDesignCustom({ template: tmpl?.id, content, images, output_name: `PROOF_${base}_id` });
        else if (eng === 'canva')         res = await window.creativePlatform.runCanvaJob({ templateId: tmpl?.id, content, outputName: `PROOF_${base}_canva` });
        else if (eng === 'adobe_express') res = await window.creativePlatform.runAdobeExpressJob({ templateId: tmpl?.id, templateUrn: tmpl?.adobeTemplateUrn, editorUrl: tmpl?.adobeEditorUrl, content, outputName: `PROOF_${base}_ae` });
        else if (eng === 'figma')         res = await window.creativePlatform.runFigmaJob({ figmaFileKey: tmpl?.figmaFileKey, figmaNodeId: tmpl?.figmaNodeId, content, outputName: `PROOF_${base}_figma` });
        results[eng] = res?.ok ? { ok: true, output: res } : { ok: false, error: res?.userMessage || res?.message || 'Failed' };
      } catch (e: any) {
        results[eng] = { ok: false, error: e.message };
      }
    }));
    return results;
  }

  // ── Derived stats ────────────────────────────────────────────────────────

  const totalCells = rows.length * includedEngines.length;
  const doneCells  = rows.reduce((n, r) => n + includedEngines.filter(e => r.engines[e].status === 'done').length, 0);
  const readyRows  = rows.filter(r => includedEngines.some(e => r.engines[e].status === 'ready'));
  const idleRows   = rows.filter(r => includedEngines.some(e => r.engines[e].status === 'idle') && r.brief.trim());
  const canFillAll = idleRows.length > 0 && !globalFilling && !globalGenerating;
  const canGenAll  = readyRows.length > 0 && !globalGenerating;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '32px 36px', maxWidth: 960 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Layers size={20} style={{ color: 'var(--accent)' }} /> Brand Batch
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>
            Import a brief CSV · Claude fills every engine per row · generate all outputs in one run.
          </p>
        </div>
        {rows.length > 0 && doneCells > 0 && (
          <button
            onClick={() => downloadResultsCSV(rows, includedEngines)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 12, borderRadius: 8, background: 'none', border: '1px solid var(--line)', color: 'var(--muted)', cursor: 'pointer' }}
          >
            <Download size={13} /> Export Results
          </button>
        )}
      </div>

      {/* Brand + Template Config */}
      <TemplateConfigPanel
        brands={brands}
        activeBrandId={activeBrandId}
        allTemplates={allTemplates}
        onSelectBrand={setActiveBrandId}
      />

      {/* Pre-check & Proof */}
      {activeBrand && includedEngines.length > 0 && (() => {
        const preflightEngines: PreflightEngine[] = includedEngines.map(eng => {
          const tmpl = templateFor(eng);
          const ec   = ENGINE_COLORS[eng];
          return {
            key: eng, label: ENGINE_FULL[eng], badge: ENGINE_SHORT[eng],
            fg: ec.fg, bg: ec.bg, border: ec.border,
            templateId: tmpl?.id, templateName: tmpl?.name,
            configured: true,
            fields: (getManifestBriefFields(tmpl) ?? ENGINE_FIELDS[eng] ?? []).filter((f: BriefField) => f.type !== 'image'),
            runPreflightIpc: (eng === 'illustrator' || eng === 'indesign')
              ? async () => {
                  try {
                    const live = await window.creativePlatform.liveStatus();
                    const s = live?.[eng];
                    const label = eng === 'illustrator' ? 'Illustrator' : 'InDesign';
                    const ext   = eng === 'illustrator' ? '.ai' : '.indd';
                    if (s?.templateExists && s?.manifestExists) {
                      if (s?.ready) {
                        return { ok: true, message: `${label} connected · template and manifest ready` };
                      } else {
                        return { ok: true, message: `Template${ext} and manifest found · open ${label} before exporting` };
                      }
                    } else if (s?.manifestExists) {
                      return { ok: false, userMessage: `Manifest found but template ${ext} file is missing. Add the template file and try again.` };
                    } else if (s?.templateExists) {
                      return { ok: false, userMessage: `Template ${ext} found but no manifest. Re-link the template in the ${label} screen.` };
                    } else {
                      return { ok: false, userMessage: `No ${label} template configured for this brand. Set one up in the ${label} screen.` };
                    }
                  } catch (e: any) {
                    return { ok: false, userMessage: e.message || `Could not check ${eng} status.` };
                  }
                }
              : undefined,
          };
        });
        const preflightRows: PreflightRow[] = rows.map((r, i) => ({
          id: r.id,
          label: r.outputName || `Row ${i + 1}`,
          hasContent: includedEngines.some(e => r.engines[e].status === 'ready'),
          contentByEngine: Object.fromEntries(
            includedEngines.map(e => [e, r.engines[e].content ?? {}])
          ),
        }));
        return (
          <PreflightPanel
            engines={preflightEngines}
            rows={preflightRows}
            onRunProof={runProofRow}
            disabled={globalGenerating || globalFilling}
          />
        );
      })()}

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleCSVImport} />
        <button
          onClick={() => fileInputRef.current?.click()}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 13 }}
        >
          <Upload size={13} /> Import CSV
        </button>
        <button
          onClick={downloadExampleCSV}
          title="Download a filled example CSV with all supported columns including image fields"
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 13, background: 'none', border: '1px solid var(--line)', color: 'var(--muted)', borderRadius: 8, cursor: 'pointer' }}
        >
          <Download size={13} /> CSV Template
        </button>
        <button
          onClick={addBlankRow}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 13, background: 'none', border: '1px solid var(--line)', color: 'var(--text)', borderRadius: 8, cursor: 'pointer' }}
        >
          <Plus size={13} /> Add Row
        </button>

        {rows.length > 0 && (
          <>
            <div style={{ width: 1, height: 24, background: 'var(--line)' }} />
            <button
              onClick={fillAll}
              disabled={!canFillAll}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 13, background: 'none', border: '1px solid rgba(79,134,240,.35)', color: 'var(--accent)', borderRadius: 8, cursor: canFillAll ? 'pointer' : 'not-allowed', opacity: canFillAll ? 1 : .45 }}
            >
              {globalFilling ? <><RefreshCw size={13} className="spin" /> Filling…</> : <><Sparkles size={13} /> Fill All Rows</>}
            </button>
            <button
              onClick={generateAll}
              disabled={!canGenAll}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 13 }}
            >
              {globalGenerating ? <><RefreshCw size={13} className="spin" /> Generating…</> : <><Zap size={13} /> Generate All</>}
            </button>
          </>
        )}

        {rows.length > 0 && (
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>
            {rows.length} row{rows.length !== 1 ? 's' : ''} · {includedEngines.length} engine{includedEngines.length !== 1 ? 's' : ''} · {doneCells}/{totalCells} outputs
          </span>
        )}
      </div>

      {/* Progress bar */}
      {totalCells > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>
            <span>{doneCells} of {totalCells} engine outputs complete</span>
            <span>{Math.round((doneCells / totalCells) * 100)}%</span>
          </div>
          <div style={{ height: 4, borderRadius: 2, background: 'var(--line)', overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 2, background: 'var(--accent)', width: `${(doneCells / totalCells) * 100}%`, transition: 'width .4s' }} />
          </div>
        </div>
      )}

      {/* Empty state */}
      {rows.length === 0 && (
        <div className="empty-state" style={{ marginTop: 40 }}>
          <FileText size={48} className="empty-state-icon" />
          <h3>No rows yet</h3>
          <p>Import the master brief CSV or add rows manually. Each row generates a full set of files across all assigned engines.</p>
          <div className="button-row">
            <button onClick={() => fileInputRef.current?.click()} style={{ fontSize: 13, padding: '8px 18px' }}>
              <Upload size={13} /> Import CSV
            </button>
            <button onClick={addBlankRow} style={{ fontSize: 13, padding: '8px 18px', background: 'none', border: '1px solid var(--line)', color: 'var(--text)', borderRadius: 8, cursor: 'pointer' }}>
              <Plus size={13} /> Add Row Manually
            </button>
          </div>
        </div>
      )}

      {/* Row list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.map((row, idx) => {
          const summary   = rowSummaryStatus(row, includedEngines);
          const isRunning = includedEngines.some(e => ['filling', 'generating'].includes(row.engines[e].status));
          const isReady   = includedEngines.some(e => row.engines[e].status === 'ready');
          const canFillRow = includedEngines.some(e => row.engines[e].status === 'idle') && row.brief.trim().length > 0;

          return (
            <div
              key={row.id}
              style={{
                border: `1px solid ${summary.label === 'Done' ? 'rgba(117,245,174,.25)' : summary.label.startsWith('Partial') ? 'rgba(255,200,60,.2)' : 'var(--line)'}`,
                borderRadius: 10,
                background: 'var(--panel)',
                overflow: 'hidden',
                transition: 'border-color .15s',
              }}
            >
              {/* Row header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
                {/* Row number */}
                <span style={{
                  fontSize: 11, color: 'var(--muted)', fontWeight: 700,
                  width: 22, flexShrink: 0, textAlign: 'center',
                }}>
                  {idx + 1}
                </span>

                {/* Output name */}
                <input
                  value={row.outputName}
                  onChange={e => patchRow(row.id, { outputName: e.target.value })}
                  style={{
                    width: 180, padding: '4px 8px', borderRadius: 6,
                    border: '1px solid var(--line)', background: 'var(--bg)',
                    color: 'inherit', fontSize: 12, flexShrink: 0,
                  }}
                  disabled={isRunning}
                  placeholder="output_name"
                />

                {/* Brief snippet */}
                <span style={{ flex: 1, fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                  {row.brief
                    ? row.brief.slice(0, 90) + (row.brief.length > 90 ? '…' : '')
                    : <em style={{ opacity: .6 }}>No brief — expand to edit</em>
                  }
                </span>

                {/* Engine status pills */}
                <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                  {ENGINE_ORDER.map(e => (
                    <EnginePill key={e} eng={e} cell={row.engines[e]} active={includedEngines.includes(e)} />
                  ))}
                </div>

                {/* Row summary status */}
                <span style={{
                  fontSize: 11, fontWeight: 600, color: summary.color,
                  flexShrink: 0, minWidth: 80, textAlign: 'right',
                  display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end',
                }}>
                  {summary.label === 'Done' && <CheckCircle2 size={11} />}
                  {summary.label.startsWith('Partial') && <AlertTriangle size={11} />}
                  {(summary.label.includes('…')) && <RefreshCw size={10} className="spin" />}
                  {summary.label}
                </span>

                {/* Row actions */}
                <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
                  {canFillRow && (
                    <button
                      onClick={() => fillRow(row)}
                      disabled={isRunning}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(79,134,240,.1)', border: '1px solid rgba(79,134,240,.3)', color: 'var(--accent)', padding: '4px 9px', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                    >
                      <Sparkles size={10} /> Fill
                    </button>
                  )}
                  {isReady && (
                    <button
                      onClick={() => generateRow(row)}
                      disabled={isRunning}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(117,245,174,.1)', border: '1px solid rgba(117,245,174,.3)', color: 'var(--green)', padding: '4px 9px', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                    >
                      <Zap size={10} /> Run
                    </button>
                  )}
                  <button
                    onClick={() => patchRow(row.id, { expanded: !row.expanded })}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '3px 5px', display: 'flex', alignItems: 'center' }}
                  >
                    {row.expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  </button>
                  <button
                    onClick={() => removeRow(row.id)}
                    disabled={isRunning}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '3px 5px', display: 'flex', alignItems: 'center', opacity: isRunning ? .4 : 1 }}
                    title="Remove row"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              {/* Expanded: tabbed engine field panels */}
              {row.expanded && (
                <RowDetailPanel
                  row={row}
                  includedEngines={includedEngines}
                  isRunning={isRunning}
                  templateMap={Object.fromEntries(ENGINE_ORDER.map(e => [e, templateFor(e)])) as Partial<Record<EngineKey, any>>}
                  onPatchRow={patch => patchRow(row.id, patch)}
                  onPatchCell={(eng, patch) => patchEngineCell(row.id, eng, patch)}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom padding so sticky bar doesn't overlap last row */}
      {rows.length > 0 && <div style={{ height: 90 }} />}

      {/* Sticky generate bar */}
      {rows.length > 0 && (
        <div style={{
          position: 'sticky', bottom: 0,
          background: 'var(--panel)', border: '1px solid var(--line)',
          borderRadius: 10, padding: '12px 18px',
          display: 'flex', alignItems: 'center', gap: 14,
          boxShadow: '0 -8px 32px rgba(0,0,0,.35)',
        }}>
          <button
            onClick={fillAll}
            disabled={!canFillAll}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', fontSize: 13,
              background: 'none', border: '1px solid rgba(79,134,240,.4)',
              color: 'var(--accent)', borderRadius: 8,
              cursor: canFillAll ? 'pointer' : 'not-allowed', opacity: canFillAll ? 1 : .4,
            }}
          >
            {globalFilling
              ? <><RefreshCw size={13} className="spin" /> Filling {idleRows.length} rows…</>
              : <><Sparkles size={13} /> Fill {idleRows.length} Row{idleRows.length !== 1 ? 's' : ''}</>
            }
          </button>

          <button
            onClick={generateAll}
            disabled={!canGenAll}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 22px', fontSize: 14, fontWeight: 600 }}
          >
            {globalGenerating
              ? <><RefreshCw size={14} className="spin" /> Generating…</>
              : <><Zap size={14} /> Generate {readyRows.length} Row{readyRows.length !== 1 ? 's' : ''} × {includedEngines.length} Engine{includedEngines.length !== 1 ? 's' : ''}</>
            }
          </button>

          {/* Progress */}
          {totalCells > 0 && (
            <div style={{ flex: 1 }}>
              <div style={{ height: 4, borderRadius: 2, background: 'var(--line)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 2, background: 'var(--accent)',
                  width: `${totalCells > 0 ? (doneCells / totalCells) * 100 : 0}%`,
                  transition: 'width .4s',
                }} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                {doneCells} / {totalCells} outputs · {rows.length} rows × {includedEngines.length} engines
              </div>
            </div>
          )}

          {/* Reveal outputs folder */}
          {doneCells > 0 && (
            <button
              onClick={() => window.creativePlatform.openPath('outputs')}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '7px 13px', fontSize: 12,
                background: 'rgba(117,245,174,.08)', border: '1px solid rgba(117,245,174,.25)',
                color: 'var(--green)', borderRadius: 8, cursor: 'pointer', flexShrink: 0,
              }}
            >
              <FolderOpen size={12} /> Reveal Outputs
            </button>
          )}
        </div>
      )}
    </div>
  );
}
