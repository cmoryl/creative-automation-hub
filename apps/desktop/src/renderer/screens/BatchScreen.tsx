import { useEffect, useRef, useState } from 'react';
import { usePlatformStore } from '../state/usePlatformStore';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Download, FileUp, Image, Loader, Plus, RefreshCw, Square, Trash2, Upload, Wand2, Zap } from 'lucide-react';
import { CharLimitField, DEFAULT_CHAR_LIMITS } from '../components/CharLimitField';
import { ImagePickerField } from '../components/ImagePickerField';
import { CanvaImageField, CanvaImageValue, EMPTY_CANVA_IMAGE } from '../components/CanvaImageField';
import { Tooltip } from '../components/Tooltip';
import { ClaudeBatchPanel } from '../components/ClaudeBatchPanel';
import { PreflightPanel, PreflightEngine, PreflightRow } from '../components/PreflightPanel';

type Engine = 'illustrator' | 'indesign' | 'canva' | 'adobe_express';

interface BatchRow {
  id: string;
  outputName: string;
  content: Record<string, string>;
  status: 'pending' | 'running' | 'done' | 'error';
  result?: any;
  expanded: boolean;
}

interface FieldDef {
  key: string;
  label: string;
  required: boolean;
  maxChars?: number;
}

const ENGINE_LABELS: Record<Engine, string> = {
  illustrator:   'Illustrator',
  indesign:      'InDesign',
  canva:         'Canva',
  adobe_express: 'Adobe Express',
};
const ENGINE_ACCENTS: Record<Engine, { fg: string; bg: string; border: string }> = {
  illustrator:   { fg: 'var(--eng-illo)',  bg: 'var(--eng-illo-bg)',  border: 'var(--eng-illo-bd)'  },
  indesign:      { fg: 'var(--eng-indd)',  bg: 'var(--eng-indd-bg)',  border: 'var(--eng-indd-bd)'  },
  canva:         { fg: 'var(--eng-canva)', bg: 'var(--eng-canva-bg)', border: 'var(--eng-canva-bd)' },
  adobe_express: { fg: 'var(--eng-expr)',  bg: 'var(--eng-expr-bg)',  border: 'var(--eng-expr-bd)'  },
};

// Friendly label from field key
function fieldLabel(key: string): string {
  return key
    .replace(/^(TEXT_|DOC_|SECTION_|STAT_|IMAGE_)/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

// Extract FieldDefs from a template manifest's editable_objects
function getTemplateFields(template: any): FieldDef[] {
  const objs = template?.manifest?.editable_objects ?? template?.editableObjects;
  if (!objs || typeof objs !== 'object') return [];
  return Object.entries(objs)
    .filter(([, v]: any) => !v.type || v.type === 'text')
    .map(([key, v]: any) => ({
      key,
      label: fieldLabel(key),
      required: !!v.required,
      maxChars: v.max_chars ?? DEFAULT_CHAR_LIMITS[key] ?? undefined,
    }));
}

// Required fields for engines that have no manifest or empty manifest
const FALLBACK_FIELDS: Record<Engine, FieldDef[]> = {
  illustrator: [
    { key: 'TEXT_TITLE',     label: 'Title',     required: true,  maxChars: 100 },
    { key: 'TEXT_CHALLENGE', label: 'Challenge', required: true,  maxChars: 400 },
    { key: 'TEXT_SOLUTION',  label: 'Solution',  required: true,  maxChars: 400 },
    { key: 'TEXT_RESULTS',   label: 'Results',   required: true,  maxChars: 400 },
  ],
  indesign: [
    { key: 'DOC_TITLE',                 label: 'Title',             required: true,  maxChars: 100  },
    { key: 'SECTION_EXECUTIVE_SUMMARY', label: 'Executive Summary', required: true,  maxChars: 600  },
    { key: 'SECTION_BODY',              label: 'Body Copy',         required: true,  maxChars: 2500 },
  ],
  canva: [
    { key: 'TEXT_TITLE',     label: 'Title',     required: true,  maxChars: 100 },
    { key: 'TEXT_CHALLENGE', label: 'Challenge', required: false, maxChars: 400 },
    { key: 'TEXT_SOLUTION',  label: 'Solution',  required: false, maxChars: 400 },
    { key: 'TEXT_RESULTS',   label: 'Results',   required: false, maxChars: 400 },
  ],
  adobe_express: [
    { key: 'TEXT_TITLE',     label: 'Title',     required: true,  maxChars: 100 },
    { key: 'TEXT_CHALLENGE', label: 'Challenge', required: false, maxChars: 400 },
    { key: 'TEXT_SOLUTION',  label: 'Solution',  required: false, maxChars: 400 },
    { key: 'TEXT_RESULTS',   label: 'Results',   required: false, maxChars: 400 },
  ],
};

// CSV column aliases → canonical field key or 'output_name'
const CSV_ALIASES: Record<string, string> = {
  name: 'output_name', output: 'output_name', output_name: 'output_name',
  title: 'TEXT_TITLE',          text_title: 'TEXT_TITLE',
  challenge: 'TEXT_CHALLENGE',  text_challenge: 'TEXT_CHALLENGE',
  solution: 'TEXT_SOLUTION',    text_solution: 'TEXT_SOLUTION',
  results: 'TEXT_RESULTS',      text_results: 'TEXT_RESULTS',
  overview: 'TEXT_OVERVIEW',    text_overview: 'TEXT_OVERVIEW',
  stat_1: 'TEXT_STAT_01',       stat1: 'TEXT_STAT_01', text_stat_01: 'TEXT_STAT_01',
  stat_2: 'TEXT_STAT_02',       stat2: 'TEXT_STAT_02', text_stat_02: 'TEXT_STAT_02',
  stat_3: 'TEXT_STAT_03',       stat3: 'TEXT_STAT_03', text_stat_03: 'TEXT_STAT_03',
  stat_4: 'TEXT_STAT_04',       stat4: 'TEXT_STAT_04', text_stat_04: 'TEXT_STAT_04',
  // Stat label aliases (e.g. "stat_1_label" or "stat1_label")
  stat_1_label: 'TEXT_STAT_01_LABEL', stat1_label: 'TEXT_STAT_01_LABEL', text_stat_01_label: 'TEXT_STAT_01_LABEL',
  stat_2_label: 'TEXT_STAT_02_LABEL', stat2_label: 'TEXT_STAT_02_LABEL', text_stat_02_label: 'TEXT_STAT_02_LABEL',
  stat_3_label: 'TEXT_STAT_03_LABEL', stat3_label: 'TEXT_STAT_03_LABEL', text_stat_03_label: 'TEXT_STAT_03_LABEL',
  stat_4_label: 'TEXT_STAT_04_LABEL', stat4_label: 'TEXT_STAT_04_LABEL', text_stat_04_label: 'TEXT_STAT_04_LABEL',
  // Other common field aliases
  subtitle: 'TEXT_SUBTITLE',    text_subtitle: 'TEXT_SUBTITLE',
  section_header: 'TEXT_SECTION_HEADER', text_section_header: 'TEXT_SECTION_HEADER',
  services: 'TEXT_SERVICES',    text_services: 'TEXT_SERVICES',
  services_body: 'TEXT_SERVICES_BODY', text_services_body: 'TEXT_SERVICES_BODY',
  testimonial: 'TEXT_TESTIMONIAL', text_testimonial: 'TEXT_TESTIMONIAL',
  attribution: 'TEXT_TESTIMONIAL_ATTRIBUTION',
  text_testimonial_attribution: 'TEXT_TESTIMONIAL_ATTRIBUTION',
  challenge_header: 'TEXT_CHALLENGE_HEADER',
  solution_header: 'TEXT_SOLUTION_HEADER',
  results_header: 'TEXT_RESULTS_HEADER',
  tagline: 'TEXT_TAGLINE', website: 'TEXT_WEBSITE', email: 'TEXT_EMAIL',
  // Adobe Express cover fields (subtitle/text_subtitle already mapped above)
  client: 'TEXT_CLIENT', text_client: 'TEXT_CLIENT',
  date: 'TEXT_DATE', text_date: 'TEXT_DATE',
  // Adobe Express marketing poster fields
  // NOTE: 'headline'/'subheadline' intentionally map to TEXT_HEADLINE/SUBHEADLINE (AE-specific).
  //       Generic 'body'/'body_copy'/'cta' kept as InDesign aliases below to avoid collisions;
  //       use 'text_body' / 'text_cta' for AE-specific variants.
  headline: 'TEXT_HEADLINE', text_headline: 'TEXT_HEADLINE',
  subheadline: 'TEXT_SUBHEADLINE', text_subheadline: 'TEXT_SUBHEADLINE',
  text_body: 'TEXT_BODY',
  cta_text: 'TEXT_CTA', text_cta: 'TEXT_CTA',
  // Adobe Express research poster fields
  authors: 'TEXT_AUTHORS', text_authors: 'TEXT_AUTHORS',
  abstract: 'TEXT_ABSTRACT', text_abstract: 'TEXT_ABSTRACT',
  key_findings: 'TEXT_KEY_FINDINGS', text_key_findings: 'TEXT_KEY_FINDINGS',
  institution: 'TEXT_INSTITUTION', text_institution: 'TEXT_INSTITUTION',
  // InDesign
  doc_title: 'DOC_TITLE', doc_subtitle: 'DOC_SUBTITLE',
  doc_author: 'DOC_AUTHOR', doc_date: 'DOC_DATE',
  executive_summary: 'SECTION_EXECUTIVE_SUMMARY',
  section_executive_summary: 'SECTION_EXECUTIVE_SUMMARY',
  body: 'SECTION_BODY', body_copy: 'SECTION_BODY', section_body: 'SECTION_BODY',
  conclusion: 'SECTION_CONCLUSION', section_conclusion: 'SECTION_CONCLUSION',
  cta: 'SECTION_CTA', section_cta: 'SECTION_CTA',
};

// ── CSV download helpers ──────────────────────────────────────────────────────

// Canonical field key → friendly short alias (used in downloadable CSV headers)
const FIELD_TO_ALIAS: Record<string, string> = {
  TEXT_TITLE:     'title',       TEXT_CHALLENGE:  'challenge',
  TEXT_SOLUTION:  'solution',    TEXT_RESULTS:    'results',
  TEXT_OVERVIEW:  'overview',    TEXT_STAT_01:    'stat_1',
  TEXT_STAT_02:   'stat_2',      TEXT_TESTIMONIAL: 'testimonial',
  TEXT_TESTIMONIAL_ATTRIBUTION: 'attribution',
  TEXT_TAGLINE:   'tagline',     TEXT_WEBSITE:    'website',    TEXT_EMAIL: 'email',
  TEXT_SUBTITLE:  'subtitle',    TEXT_CLIENT:     'client',     TEXT_DATE:  'date',
  TEXT_HEADLINE:  'headline',    TEXT_SUBHEADLINE: 'subheadline',
  TEXT_BODY:      'body',        TEXT_CTA:        'cta',
  TEXT_AUTHORS:   'authors',     TEXT_ABSTRACT:   'abstract',
  TEXT_KEY_FINDINGS: 'key_findings', TEXT_INSTITUTION: 'institution',
  DOC_TITLE:       'doc_title',
  DOC_SUBTITLE:   'doc_subtitle', DOC_AUTHOR:     'doc_author',
  DOC_DATE:       'doc_date',
  SECTION_EXECUTIVE_SUMMARY: 'executive_summary',
  SECTION_BODY:   'body',        SECTION_CONCLUSION: 'conclusion',
  SECTION_CTA:    'cta',         STAT_01: 'stat_1',
  STAT_02:        'stat_2',      STAT_03: 'stat_3',
};

// Two sample rows per engine used to populate the downloadable example CSV
const EXAMPLE_ROWS: Record<Engine, Record<string, string>[]> = {
  illustrator: [
    {
      output_name:  'Acme_CaseStudy_v001',
      title:        'Cutting Time-to-Market by 60%',
      overview:     'Acme partnered with us to overhaul their production pipeline, halving cycle times within two quarters.',
      challenge:    'Manual handoffs between design and production were causing 3-week delays per campaign, with no visibility into bottlenecks.',
      solution:     'An automated versioning layer replaced all manual handoffs, generating print-ready files directly from approved briefs in under 4 minutes.',
      results:      'Campaign production time fell from 3 weeks to 4 days. Error rate dropped to near-zero. The team redirected 60% of their bandwidth to strategy.',
      stat_1:       '60% faster delivery',
      stat_2:       'Zero print errors',
      testimonial:  '"We\'re shipping work we\'re proud of, faster than ever." — Head of Creative, Acme Corp',
    },
    {
      output_name:  'Nexus_CaseStudy_v001',
      title:        'From 2 Weeks to 2 Hours Per Version',
      overview:     'Nexus needed to produce 40 localised variants of every campaign asset. Manual production was unsustainable.',
      challenge:    'Localising a single campaign across 12 markets took 14 days and involved 6 agencies, with constant version-control conflicts.',
      solution:     'A single master template with dynamic field injection replaced the agency network. All 40 variants now render from one approved brief.',
      results:      '40 localised variants in under 2 hours. Agency spend reduced by $280K per quarter. Brand consistency score rose from 61% to 97%.',
      stat_1:       '2 hrs for 40 variants',
      stat_2:       '$280K/quarter saved',
      testimonial:  '"Our global teams are finally aligned. Same brand, every market." — VP Marketing, Nexus',
    },
  ],
  indesign: [
    {
      output_name:      'Q3_Whitepaper_v001',
      doc_title:        'The State of Creative Automation in Enterprise',
      doc_subtitle:     'How leading teams are scaling output without scaling headcount',
      doc_author:       'Research Team',
      doc_date:         'Q3 2026',
      executive_summary: 'Enterprise marketing teams adopting creative automation are producing 4× more output at 60% lower cost per asset. This paper examines the workflows, tooling, and governance models behind the most successful implementations.',
      body:             'The shift from manual to automated creative production began in earnest in 2024, initially confined to digital display formats. By 2026 it has expanded to include print, video, and long-form document production. Teams that invested early are now compounding their advantage.',
      conclusion:       'The window for first-mover advantage in creative automation is narrowing. Teams that build the infrastructure now will be positioned to deliver faster, more consistent creative at scale — while competitors continue to rely on manual processes.',
      cta:              'Request a workflow audit at creativesystems.io/audit',
    },
    {
      output_name:      'AI_Report_v001',
      doc_title:        'AI in B2B Marketing: ROI Benchmarks for 2026',
      doc_subtitle:     'A data-driven look at what\'s working and what isn\'t',
      doc_author:       'Strategy & Insights Team',
      doc_date:         'Q4 2026',
      executive_summary: 'Based on data from 340 B2B marketing teams, AI-assisted content production delivers an average 3.2× ROI within 12 months when deployed with clear governance and a trained in-house operator.',
      body:             'The biggest source of failed AI implementations is not the technology itself but the absence of a structured briefing process. Teams that define clear input standards before deploying AI tooling achieve significantly higher output quality and adoption rates.',
      conclusion:       'Sustainable AI ROI in marketing requires investment in three areas: quality input standards, human review workflows, and iterative template governance. Shortcutting any of these consistently undermines results.',
      cta:              'Download the full benchmark dataset at creativesystems.io/benchmarks',
    },
  ],
  canva: [
    {
      output_name:  'Canva_Acme_Social',
      title:        'Your Results Headline Here',
      challenge:    'A concise statement of the client challenge (1–2 sentences).',
      solution:     'The solution you delivered, in plain language.',
      results:      'The outcome and key metrics achieved.',
      testimonial:  'A short quote from the client.',
      attribution:  'Name | Title | Company',
    },
    {
      output_name:  'Canva_Nexus_Social',
      title:        'Second Variant Headline Here',
      challenge:    'Different client challenge for this version.',
      solution:     'The approach taken to solve it.',
      results:      'Key results with specific numbers where possible.',
      testimonial:  'Second client quote here.',
      attribution:  'Name | Title | Company',
    },
  ],
  adobe_express: [
    {
      output_name:  'Express_Acme_v001',
      title:        'Your Headline Here',
      challenge:    'Short challenge statement.',
      solution:     'Your solution description.',
      results:      'Key results and metrics.',
      testimonial:  'Client quote.',
    },
    {
      output_name:  'Express_Nexus_v001',
      title:        'Second Variant Headline',
      challenge:    'Second challenge statement.',
      solution:     'Second solution.',
      results:      'Second set of results.',
      testimonial:  'Second client quote.',
    },
  ],
};

function csvEscape(val: string): string {
  if (!val) return '';
  if (val.includes(',') || val.includes('"') || val.includes('\n') || val.includes('\t')) {
    return '"' + val.replace(/"/g, '""') + '"';
  }
  return val;
}

function newRow(index: number): BatchRow {
  return { id: `row_${Date.now()}_${index}`, outputName: '', content: {}, status: 'pending', expanded: true };
}

function parseCSV(text: string): { rows: { outputName: string; content: Record<string, string> }[]; error?: string } {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { rows: [], error: 'CSV must have a header row and at least one data row.' };

  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    let i = 0;
    while (i < line.length) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i += 2; continue; } // RFC 4180 escaped quote
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
      i++;
    }
    result.push(current.trim());
    return result;
  };

  // Strip UTF-8 BOM that Excel adds to the first header cell
  const firstLine = lines[0].replace(/^﻿/, '');
  const headers = parseRow(firstLine).map(h => h.toLowerCase().replace(/\s+/g, '_'));
  const mapped = headers.map(h => CSV_ALIASES[h] || h.toUpperCase());

  const rows = lines.slice(1).map(line => {
    const vals = parseRow(line);
    const content: Record<string, string> = {};
    let outputName = '';
    mapped.forEach((key, i) => {
      if (!key) return;
      const val = vals[i] || '';
      if (key === 'output_name') outputName = val;
      else if (val.trim()) content[key] = val;
    });
    return { outputName, content };
  }).filter(r => Object.values(r.content).some(v => v.trim()));

  if (rows.length === 0) return { rows: [], error: 'No data rows found after parsing.' };
  return { rows };
}

function StatusIcon({ status }: { status: BatchRow['status'] }) {
  if (status === 'done')    return <Tooltip text="Complete — output file saved successfully" delay={150}><CheckCircle2 size={15} color="var(--green)" /></Tooltip>;
  if (status === 'error')   return <Tooltip text="Failed — expand this row to see the error details" delay={150}><AlertTriangle size={15} color="var(--red)" /></Tooltip>;
  if (status === 'running') return <Tooltip text="Processing…" delay={150}><Loader size={15} className="spin" color="var(--accent)" /></Tooltip>;
  return <Tooltip text="Pending — waiting to run" delay={150}><span style={{ width: 15, height: 15, display: 'inline-block', borderRadius: '50%', background: 'var(--line)' }} /></Tooltip>;
}

// Lazy-loads a template thumbnail via IPC. Falls back to an icon placeholder.
function TemplateThumbnailImg({ templateId, thumbnailUrl }: { templateId: string; thumbnailUrl?: string }) {
  const [src, setSrc] = useState<string | null>(thumbnailUrl ?? null);
  useEffect(() => {
    if (src) return; // already have one (from listTemplates embed)
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
        : <Image size={22} style={{ color: 'var(--muted)', opacity: .3 }} />}
    </div>
  );
}

export function BatchScreen() {
  const activeBrand = usePlatformStore(s => s.activeBrand);
  const [engine, setEngine]               = useState<Engine>('illustrator');
  const [templates, setTemplates]         = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [sharedImages, setSharedImages]   = useState<Record<string, string>>({});
  const [sharedCanvaImages, setSharedCanvaImages] = useState<Record<string, CanvaImageValue>>({});
  const [rows, setRows]                   = useState<BatchRow[]>([newRow(0)]);
  const [running, setRunning]             = useState(false);
  const [csvText, setCsvText]             = useState('');
  const [csvError, setCsvError]           = useState('');
  const [csvOpen, setCsvOpen]             = useState(false);
  const [fireflyAuto, setFireflyAuto]     = useState(false);
  const [fireflyAspect, setFireflyAspect] = useState<'widescreen'|'portrait'|'square'>('widescreen');
  const [fireflyStyle, setFireflyStyle]   = useState<'photo'|'art'>('photo');
  const [elapsed, setElapsed]             = useState(0);   // seconds
  const [rowTimes, setRowTimes]           = useState<number[]>([]); // ms per completed row
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const cancelRef                         = useRef(false);
  const timerRef                          = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef                      = useRef<number>(0);
  const fileInputRef                      = useRef<HTMLInputElement>(null);
  const rowsRef                           = useRef(rows);
  useEffect(() => { rowsRef.current = rows; }, [rows]);

  useEffect(() => {
    window.creativePlatform.listTemplates().then((ts: any[]) => setTemplates(ts || []));
  }, []);

  const engineTemplates = templates.filter(t => {
    if (engine === 'canva')         return !!t.isCanva;
    if (engine === 'adobe_express') return !!t.isAdobeExpress || t.engine === 'adobe_express';
    return t.engine === engine && !t.isCanva && !t.isAdobeExpress;
  });

  useEffect(() => {
    setSelectedTemplate(engineTemplates[0]?.id || '');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, templates.length]);

  // Derive field definitions from selected template manifest (or fall back to hardcoded)
  const activeTemplate = engineTemplates.find(t => t.id === selectedTemplate);
  const allFields: FieldDef[] = activeTemplate
    ? (getTemplateFields(activeTemplate).length > 0 ? getTemplateFields(activeTemplate) : FALLBACK_FIELDS[engine])
    : FALLBACK_FIELDS[engine];

  const requiredFields = allFields.filter(f => f.required);

  // Image fields from active template manifest (all engines)
  const supportsImages = engine === 'illustrator' || engine === 'indesign';
  const imageFields: { key: string; label: string }[] = activeTemplate
    ? Object.entries(activeTemplate?.manifest?.editable_objects ?? {})
        .filter(([, v]: any) => v.type === 'image')
        .map(([key, v]: any) => ({
          key,
          label: v.note || key.replace(/^IMAGE_/, '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
        }))
    : [];

  function updateRow(id: string, patch: Partial<BatchRow>) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  }
  function updateContent(id: string, key: string, value: string) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, content: { ...r.content, [key]: value } } : r));
  }
  function addRow()              { setRows(prev => [...prev, newRow(prev.length)]); }
  function removeRow(id: string) { setRows(prev => prev.filter(r => r.id !== id)); }

  // ── CSV download ─────────────────────────────────────────────────────────────
  function downloadExampleCSV() {
    // Build header from allFields, using friendly short aliases
    const fieldCols = allFields.map(f => FIELD_TO_ALIAS[f.key] || f.key.toLowerCase());
    const headers = ['output_name', ...fieldCols];

    // Get 2 sample rows for this engine; filter to only columns in our header
    const sampleRows = (EXAMPLE_ROWS[engine] || []).map(row => {
      return headers.map(col => csvEscape(row[col] || ''));
    });

    const lines = [headers.join(','), ...sampleRows.map(r => r.join(','))];
    const csv = lines.join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${engine}_batch_example.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── Results CSV download ──────────────────────────────────────────────────────
  function downloadResultsCSV() {
    const fieldCols = allFields.map(f => FIELD_TO_ALIAS[f.key] || f.key.toLowerCase());
    const headers = ['output_name', 'status', 'error', ...fieldCols];
    const dataRows = rows.map(r => {
      const status = r.status === 'done' ? 'success' : r.status === 'error' ? 'failed' : r.status;
      const error = r.status === 'error' ? (r.result?.userMessage || r.result?.error || 'unknown') : '';
      return headers.map(col => {
        if (col === 'output_name') return csvEscape(r.outputName);
        if (col === 'status')      return csvEscape(status);
        if (col === 'error')       return csvEscape(error);
        // Try both possible canonical keys for this alias (e.g. stat_1 → TEXT_STAT_01 or STAT_01)
        const candidates = Object.entries(FIELD_TO_ALIAS)
          .filter(([, alias]) => alias === col)
          .map(([k]) => k);
        const fieldKey = candidates.find(k => r.content[k] !== undefined) ?? candidates[0] ?? col.toUpperCase();
        return csvEscape(r.content[fieldKey] || '');
      });
    });
    const csv = [headers.join(','), ...dataRows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${engine}_batch_results_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── CSV file upload ───────────────────────────────────────────────────────────
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      if (text) {
        setCsvText(text);
        setCsvOpen(true);
        setCsvError('');
      }
    };
    reader.readAsText(file);
    // Reset so the same file can be re-selected
    e.target.value = '';
  }

  function applyCSV() {
    setCsvError('');
    const { rows: parsed, error } = parseCSV(csvText);
    if (error) { setCsvError(error); return; }
    setRows(parsed.map((p, i) => ({ ...newRow(i), outputName: p.outputName, content: p.content, expanded: false })));
    setCsvOpen(false);
  }

  async function runRow(row: BatchRow): Promise<any> {
    if (!activeTemplate) return { ok: false, userMessage: 'No template selected.' };

    // Build shared images payload — only non-empty paths
    const imagePayload: Record<string, string> = {};
    for (const [k, v] of Object.entries(sharedImages)) { if (v.trim()) imagePayload[k] = v.trim(); }

    // Auto-generate a unique Firefly image for this row if the toggle is on
    if (fireflyAuto && (engine === 'illustrator' || engine === 'indesign') && imageFields.length > 0) {
      const heroField = imageFields.find(f => f.key === 'IMAGE_HERO') || imageFields[0];
      const title = row.content['TEXT_TITLE'] || row.content['DOC_TITLE'] || row.outputName || 'professional marketing';
      const context = (row.content['TEXT_RESULTS'] || row.content['TEXT_SOLUTION'] || row.content['TEXT_CHALLENGE'] || row.content['SECTION_EXECUTIVE_SUMMARY'] || '').slice(0, 120);
      const prompt = `${title}${context ? '. ' + context : ''} — professional marketing photography`;
      try {
        const result = await window.creativePlatform.generateFireflyImage({
          prompt,
          aspectRatio: fireflyAspect,
          style: fireflyStyle,
        });
        if (result?.localPath || result?.imagePath) {
          imagePayload[heroField.key] = result.localPath || result.imagePath;
        }
      } catch { /* non-fatal — proceed without auto-image */ }
    }

    const hasImages = Object.keys(imagePayload).length > 0;

    if (engine === 'illustrator') {
      return window.creativePlatform.runIllustratorCustom({
        output_name: row.outputName || undefined,
        template: activeTemplate.id,
        content: row.content,
        ...(hasImages ? { images: imagePayload } : {}),
      });
    }
    if (engine === 'indesign') {
      return window.creativePlatform.runInDesignCustom({
        output_name: row.outputName || undefined,
        template: activeTemplate.id,
        content: row.content,
        ...(hasImages ? { images: imagePayload } : {}),
      });
    }
    if (engine === 'canva') {
      const canvaImgPayload: Record<string, { assetId?: string; url?: string }> = {};
      for (const [k, v] of Object.entries(sharedCanvaImages)) {
        if (v.assetId) canvaImgPayload[k] = { assetId: v.assetId };
        else if (v.url.trim()) canvaImgPayload[k] = { url: v.url.trim() };
      }
      return window.creativePlatform.runCanvaJob({
        templateId: activeTemplate.id,
        content: row.content,
        ...(Object.keys(canvaImgPayload).length > 0 ? { images: canvaImgPayload } : {}),
      });
    }
    if (engine === 'adobe_express') {
      return window.creativePlatform.runAdobeExpressJob({
        templateId: activeTemplate.id,
        templateUrn: activeTemplate.adobeTemplateUrn,
        editorUrl: activeTemplate.adobeEditorUrl,
        content: row.content,
        ...(hasImages ? { images: imagePayload } : {}),
        outputName: row.outputName || undefined,
      });
    }
    return { ok: false, userMessage: 'Unknown engine.' };
  }

  function formatTime(secs: number) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  }

  async function runBatch() {
    cancelRef.current = false;
    setRunning(true);
    setElapsed(0);
    setRowTimes([]);
    startTimeRef.current = Date.now();

    // Start elapsed timer — tick every second
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);

    // Snapshot row IDs at start — rows added after clicking Run are excluded.
    // Content is read from rowsRef.current each iteration so edits before a row's turn are picked up.
    const batchIds = rowsRef.current.map(r => r.id);
    setRows(prev => prev.map(r => batchIds.includes(r.id) ? { ...r, status: 'pending', result: undefined } : r));

    const completedTimes: number[] = [];
    for (const rowId of batchIds) {
      if (cancelRef.current) break;
      const row = rowsRef.current.find(r => r.id === rowId);
      if (!row) continue; // deleted mid-run
      const rowStart = Date.now();
      updateRow(rowId, { status: 'running' });
      try {
        const result = await runRow(row);
        const ms = Date.now() - rowStart;
        completedTimes.push(ms);
        setRowTimes([...completedTimes]);
        updateRow(rowId, { status: result.ok ? 'done' : 'error', result, expanded: !result.ok });
      } catch (e: any) {
        const ms = Date.now() - rowStart;
        completedTimes.push(ms);
        setRowTimes([...completedTimes]);
        updateRow(rowId, { status: 'error', result: { ok: false, userMessage: e.message }, expanded: true });
      }
    }

    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    setRunning(false);

    const doneCount = rowsRef.current.filter(r => r.status === 'done').length;
    const failCount = rowsRef.current.filter(r => r.status === 'error').length;
    const notifBody = failCount > 0
      ? `${doneCount} succeeded, ${failCount} failed`
      : `${doneCount} row${doneCount !== 1 ? 's' : ''} exported successfully`;
    try { await window.creativePlatform.sendNotification('Batch complete', notifBody); } catch {}
  }

  function cancelBatch() { cancelRef.current = true; }

  // ── Proof render (single row) ─────────────────────────────────────────────
  async function runProofRow(rowId: string): Promise<Record<string, { ok: boolean; output?: any; error?: string }>> {
    const row = rowsRef.current.find(r => r.id === rowId);
    if (!row) return {};
    try {
      const res = await runRow(row);
      return { [engine]: res?.ok ? { ok: true, output: res } : { ok: false, error: res?.userMessage || 'Failed' } };
    } catch (e: any) {
      return { [engine]: { ok: false, error: e.message } };
    }
  }

  async function retryRow(rowId: string) {
    const row = rowsRef.current.find(r => r.id === rowId);
    if (!row || row.status === 'running') return;
    updateRow(rowId, { status: 'running', result: undefined });
    try {
      const result = await runRow(row);
      updateRow(rowId, { status: result.ok ? 'done' : 'error', result, expanded: !result.ok });
    } catch (e: any) {
      updateRow(rowId, { status: 'error', result: { ok: false, userMessage: e.message }, expanded: true });
    }
  }

  const done        = rows.filter(r => r.status === 'done').length;
  const failed      = rows.filter(r => r.status === 'error').length;
  const inProgress  = rows.filter(r => r.status === 'running').length;
  const completed   = done + failed;
  const remaining   = rows.length - completed - inProgress;

  // ETA: average ms per completed row × remaining rows
  const avgMs = rowTimes.length > 0 ? rowTimes.reduce((a, b) => a + b, 0) / rowTimes.length : 0;
  const etaSecs = running && avgMs > 0 && remaining > 0
    ? Math.round((avgMs * (remaining + inProgress)) / 1000)
    : 0;

  const requiredMet = rows.every(r => requiredFields.every(f => r.content[f.key]?.trim()));

  const csvHint = [
    'output_name',
    ...allFields.map(f => f.key.toLowerCase()),
  ].join(',');

  return (
    <div className="dashboard">

      {/* Sticky progress banner — visible while a run is active or just finished */}
      {(running || (elapsed > 0 && completed > 0)) && (
        <div style={{
          position: 'sticky', top: 0, zIndex: 50,
          background: 'var(--panel)',
          backdropFilter: 'blur(8px)',
          borderBottom: '1px solid var(--line)',
          padding: '8px 20px',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          {/* Segmented mini-bar */}
          <div style={{ width: 120, height: 4, background: 'var(--line)', borderRadius: 2, overflow: 'hidden', display: 'flex', flexShrink: 0 }}>
            {done > 0 && (
              <div style={{ height: '100%', width: `${(done / rows.length) * 100}%`, background: 'var(--green)', transition: 'width .3s' }} />
            )}
            {failed > 0 && (
              <div style={{ height: '100%', width: `${(failed / rows.length) * 100}%`, background: 'var(--red)', transition: 'width .3s' }} />
            )}
            {inProgress > 0 && (
              <div style={{ height: '100%', width: `${(inProgress / rows.length) * 100}%`, background: 'var(--accent)', opacity: 0.7, animation: 'pulse 1.2s ease-in-out infinite' }} />
            )}
          </div>

          {/* Counts */}
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            {completed} / {rows.length}
          </span>
          {done   > 0 && <span style={{ fontSize: 12, color: 'var(--green)' }}>✓ {done}</span>}
          {failed > 0 && <span style={{ fontSize: 12, color: 'var(--red)' }}>✗ {failed}</span>}
          {running && inProgress > 0 && (
            <span style={{ fontSize: 12, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Loader size={11} className="spin" /> {inProgress} running
            </span>
          )}

          {/* Timer + ETA */}
          <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            ⏱ {formatTime(elapsed)}
            {etaSecs > 0 && <span style={{ opacity: .65 }}>· ~{formatTime(etaSecs)} left</span>}
            {!running && completed === rows.length && (
              <span style={{ color: failed > 0 ? 'var(--yellow)' : 'var(--green)', fontWeight: 600 }}>· done</span>
            )}
          </span>

          {/* Inline stop / cancel */}
          {running && (
            <button className="secondary" style={{ fontSize: 11, padding: '3px 10px', marginLeft: 8 }} onClick={cancelBatch}>
              <Square size={11} /> Stop
            </button>
          )}
        </div>
      )}

      <section className="panel">
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}><Zap size={20} /> Batch Renderer</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>Select an engine and template, then add rows — each row becomes a separate output file.</p>
        </div>

        {/* Engine + Template selector — combined card layout */}
        <div style={{ marginBottom: 20 }}>
          {/* Engine selector row */}
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
            Engine
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
            {(['illustrator', 'indesign', 'canva', 'adobe_express'] as Engine[]).map(e => {
              const ec = ENGINE_ACCENTS[e];
              const isActive = engine === e;
              const engineDesc: Record<Engine, string> = {
                illustrator:   'AI · PDF · PNG',
                indesign:      'INDD · PDF · JPEG',
                canva:         'Autofill · Handoff',
                adobe_express: 'Handoff · Editor URL',
              };
              return (
                <button
                  key={e}
                  onClick={() => setEngine(e)}
                  disabled={running}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                    gap: 2, padding: '8px 14px', borderRadius: 9, cursor: 'pointer',
                    border: `1px solid ${isActive ? ec.border : 'var(--line)'}`,
                    background: isActive ? ec.bg : 'var(--surface-dim)',
                    transition: 'border-color .12s, background .12s',
                    minWidth: 110,
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 700, color: isActive ? ec.fg : 'var(--text)' }}>
                    {isActive && <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: ec.fg, marginRight: 5, verticalAlign: 'middle' }} />}
                    {ENGINE_LABELS[e]}
                  </span>
                  <span style={{ fontSize: 10, color: isActive ? ec.fg : 'var(--muted)', opacity: isActive ? .75 : .55 }}>
                    {engineDesc[e]}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Template card picker */}
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
            Template
            <span style={{ fontSize: 10, fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 8, opacity: .6 }}>
              All rows in this batch render against the selected template
            </span>
          </div>

          {engineTemplates.length === 0 ? (
            <div style={{ padding: '14px 16px', borderRadius: 9, border: '1px dashed var(--border-subtle)', background: 'var(--surface-dim)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <AlertTriangle size={14} style={{ color: 'var(--yellow)', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>No {ENGINE_LABELS[engine]} templates registered</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                  Go to the {ENGINE_LABELS[engine]} engine tab and register a template first.
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
              {engineTemplates.map(t => {
                const ec = ENGINE_ACCENTS[engine];
                const isSelected = selectedTemplate === t.id;
                // Derive format badges from template metadata
                const badges: string[] = [];
                if (engine === 'illustrator') { badges.push('AI'); badges.push('PDF'); badges.push('PNG'); }
                else if (engine === 'indesign') { badges.push('INDD'); badges.push('PDF'); }
                else if (engine === 'canva') { badges.push('Canva'); }
                else if (engine === 'adobe_express') { badges.push('Express'); }

                return (
                  <div
                    key={t.id}
                    onClick={() => !running && setSelectedTemplate(t.id)}
                    style={{
                      borderRadius: 9, overflow: 'hidden', cursor: running ? 'default' : 'pointer',
                      border: `1px solid ${isSelected ? ec.border : 'var(--line)'}`,
                      background: isSelected ? ec.bg : 'var(--surface-dim)',
                      outline: isSelected ? `2px solid ${ec.border}` : 'none',
                      outlineOffset: 1,
                      transition: 'border-color .12s, background .12s',
                    }}
                  >
                    {/* Thumbnail */}
                    <TemplateThumbnailImg templateId={t.id} thumbnailUrl={t.thumbnailUrl} />
                    {/* Color bar */}
                    <div style={{ height: 3, background: isSelected ? ec.fg : 'var(--border-dim)' }} />
                    <div style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 6 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 12, fontWeight: 700,
                            color: isSelected ? ec.fg : 'var(--text)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {t.name}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {t.id}
                          </div>
                        </div>
                        {isSelected && (
                          <CheckCircle2 size={14} style={{ color: ec.fg, flexShrink: 0, marginTop: 1 }} />
                        )}
                      </div>
                      {/* Format badges */}
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {badges.map(b => (
                          <span key={b} style={{
                            fontSize: 9, fontWeight: 800, padding: '2px 5px', borderRadius: 3,
                            background: isSelected ? ec.bg : 'var(--surface-dim)',
                            color: isSelected ? ec.fg : 'var(--muted)',
                            border: `1px solid ${isSelected ? ec.border : 'var(--border-subtle)'}`,
                            letterSpacing: '.04em',
                          }}>
                            {b}
                          </span>
                        ))}
                        {t.category && (
                          <span style={{ fontSize: 9, color: 'var(--muted)', padding: '2px 5px', borderRadius: 3, background: 'var(--surface-dim)', border: '1px solid var(--border-subtle)' }}>
                            {t.category}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pre-check & Proof */}
        {activeTemplate && (() => {
          const ec = ENGINE_ACCENTS[engine];
          const ENGINE_BADGE: Record<Engine, string> = { illustrator: 'ILLO', indesign: 'INDD', canva: 'CANVA', adobe_express: 'EXPR' };
          const preflightEngines: PreflightEngine[] = [{
            key: engine, label: ENGINE_LABELS[engine], badge: ENGINE_BADGE[engine],
            fg: ec.fg, bg: ec.bg, border: ec.border,
            templateId: activeTemplate.id, templateName: activeTemplate.name,
            configured: true,
            fields: allFields.map(f => ({ key: f.key, label: f.label, required: !!f.required, maxChars: f.maxChars })),
            runPreflightIpc: engine === 'illustrator'
              ? () => window.creativePlatform.runIllustratorPreflight(activeTemplate.id)
              : engine === 'indesign'
              ? () => window.creativePlatform.runInDesignPreflight(activeTemplate.id)
              : undefined,
          }];
          const preflightRows: PreflightRow[] = rows.map((r, i) => ({
            id: r.id,
            label: r.outputName || `Row ${i + 1}`,
            hasContent: Object.values(r.content).some(v => v?.trim()),
            contentByEngine: { [engine]: r.content ?? {} },
          }));
          return (
            <PreflightPanel
              engines={preflightEngines}
              rows={preflightRows}
              onRunProof={runProofRow}
              disabled={running}
            />
          );
        })()}

        {/* CSV import + download */}
        <div style={{ marginBottom: 4 }}>
          {/* Hidden file input for CSV upload */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />

          {/* Action bar */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Tooltip text="Toggle the CSV paste panel — paste rows to bulk-populate the list">
              <button
                className="secondary"
                style={{ fontSize: 12, padding: '5px 10px' }}
                onClick={() => setCsvOpen(v => !v)}
                disabled={running}
              >
                <Upload size={12} /> {csvOpen ? 'Hide CSV Import' : 'Import from CSV'}
                {csvOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>
            </Tooltip>
            <button
              className="secondary"
              style={{ fontSize: 12, padding: '5px 10px' }}
              onClick={() => fileInputRef.current?.click()}
              disabled={running}
              title="Pick a .csv file from disk — auto-loads into the import panel"
            >
              <FileUp size={12} /> Upload CSV File
            </button>
            <button
              className="secondary"
              style={{ fontSize: 12, padding: '5px 10px' }}
              onClick={downloadExampleCSV}
              disabled={running}
              title={`Download a starter CSV for the ${ENGINE_LABELS[engine]} engine with correct headers and 2 example rows`}
            >
              <Download size={12} /> Download Example CSV
            </button>
          </div>

          {csvOpen && (
            <div style={{ marginTop: 10, padding: 12, background: 'var(--surface-dim)', borderRadius: 8, border: '1px solid var(--line)' }}>
              <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
                Paste CSV or upload a file above. First row must be headers.<br />
                Supported columns for <strong style={{ color: 'var(--text)' }}>{ENGINE_LABELS[engine]}</strong>:{' '}
                <code style={{ fontSize: 10 }}>{csvHint}</code>
              </p>
              <textarea
                className="field-input"
                rows={6}
                value={csvText}
                onChange={e => setCsvText(e.target.value)}
                placeholder={`output_name,title,challenge,solution,results\nAcme Corp,"Scaling Lab Operations",...`}
                style={{ fontFamily: 'monospace', fontSize: 11 }}
              />
              {csvError && <p style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>{csvError}</p>}
              <div className="button-row" style={{ marginTop: 8 }}>
                <Tooltip text="Parse the CSV above and replace all current rows with the parsed data">
                  <button style={{ fontSize: 12 }} onClick={applyCSV} disabled={!csvText.trim()}>Apply CSV</button>
                </Tooltip>
                <Tooltip text="Clear the CSV text and reset any parse errors">
                  <button className="secondary" style={{ fontSize: 12 }} onClick={() => { setCsvText(''); setCsvError(''); }}>Clear</button>
                </Tooltip>
              </div>
            </div>
          )}
        </div>

        {/* Shared images — Illustrator & InDesign (local file) */}
        {supportsImages && imageFields.length > 0 && (
          <div className="images-section" style={{ marginTop: 16 }}>
            <div className="images-section-header">
              <Image size={14} style={{ color: 'var(--accent)' }} />
              <span className="images-section-title">Photography / Images</span>
              <span className="images-section-hint">Shared fallback — auto-Firefly overrides per row when enabled</span>
            </div>
            {imageFields.map(f => (
              <ImagePickerField
                key={f.key}
                label={f.label}
                fieldKey={f.key}
                value={sharedImages[f.key] || ''}
                onChange={v => setSharedImages(prev => ({ ...prev, [f.key]: v }))}
                disabled={running || fireflyAuto}
              />
            ))}

            {/* Firefly auto-generation per row */}
            <div style={{ marginTop: 10, padding: 12, background: 'rgba(255,185,0,.04)', border: '1px solid rgba(255,185,0,.18)', borderRadius: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={fireflyAuto}
                  onChange={e => setFireflyAuto(e.target.checked)}
                  disabled={running}
                  style={{ accentColor: 'var(--yellow)' }}
                />
                <Wand2 size={13} style={{ color: 'var(--yellow)' }} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>Auto-generate unique image per row with Firefly</span>
              </label>
              <p style={{ fontSize: 11, color: 'var(--muted)', margin: '4px 0 0 22px' }}>
                Generates a distinct {imageFields.find(f => f.key === 'IMAGE_HERO') ? 'hero image' : imageFields[0]?.label} for each row using its title + content as the prompt.
              </p>
              {fireflyAuto && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8, marginLeft: 22 }}>
                  <select
                    className="field-input"
                    style={{ fontSize: 11, padding: '4px 8px', flex: 1 }}
                    value={fireflyAspect}
                    onChange={e => setFireflyAspect(e.target.value as 'widescreen'|'portrait'|'square')}
                    disabled={running}
                  >
                    <option value="widescreen">Widescreen (16:9)</option>
                    <option value="portrait">Portrait (4:5)</option>
                    <option value="square">Square (1:1)</option>
                  </select>
                  <select
                    className="field-input"
                    style={{ fontSize: 11, padding: '4px 8px', flex: 1 }}
                    value={fireflyStyle}
                    onChange={e => setFireflyStyle(e.target.value as 'photo'|'art')}
                    disabled={running}
                  >
                    <option value="photo">Photography</option>
                    <option value="art">Artistic</option>
                  </select>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Shared images — Canva (upload to Canva Assets API) */}
        {engine === 'canva' && imageFields.length > 0 && (
          <div className="images-section" style={{ marginTop: 16 }}>
            <div className="images-section-header">
              <Image size={14} style={{ color: 'var(--accent)' }} />
              <span className="images-section-title">Photography / Images</span>
              <span className="images-section-hint">Uploaded once to Canva Assets — applied to every row</span>
            </div>
            {imageFields.map(f => {
              const obj = activeTemplate?.manifest?.editable_objects?.[f.key];
              return (
                <CanvaImageField
                  key={f.key}
                  fieldKey={f.key}
                  label={f.label}
                  value={sharedCanvaImages[f.key] ?? EMPTY_CANVA_IMAGE}
                  onChange={v => setSharedCanvaImages(prev => ({ ...prev, [f.key]: v }))}
                  hasElementId={!!obj?.element_id}
                  disabled={running}
                />
              );
            })}
          </div>
        )}

        {/* Shared images — Adobe Express (reference only, placed manually) */}
        {engine === 'adobe_express' && imageFields.length > 0 && (
          <div className="images-section" style={{ marginTop: 16 }}>
            <div className="images-section-header">
              <Image size={14} style={{ color: 'var(--accent)' }} />
              <span className="images-section-title">Photography / Images</span>
              <span className="images-section-hint">Copied to output folder — place manually in Express after each job opens</span>
            </div>
            {imageFields.map(f => (
              <ImagePickerField
                key={f.key}
                label={f.label}
                fieldKey={f.key}
                value={sharedImages[f.key] || ''}
                onChange={v => setSharedImages(prev => ({ ...prev, [f.key]: v }))}
                disabled={running}
              />
            ))}
          </div>
        )}
      </section>

      {/* Rows */}
      <section className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>
            Rows <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 400 }}>({rows.length})</span>
          </h2>
          <div style={{ display: 'flex', gap: 6 }}>
            <Tooltip text="Add a new empty row — fill in content fields then run the batch">
              <button className="secondary" style={{ fontSize: 12, padding: '5px 10px' }} onClick={addRow} disabled={running}>
                <Plus size={12} /> Add Row
              </button>
            </Tooltip>
            {rows.length > 0 && !running && (
              confirmClearAll ? (
                <button
                  style={{ fontSize: 12, padding: '5px 10px', background: 'rgba(255,116,116,.15)', border: '1px solid rgba(255,116,116,.4)', color: 'var(--red)', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
                  onClick={() => { setRows([newRow(0)]); setConfirmClearAll(false); }}
                >
                  Clear All?
                </button>
              ) : (
                <button className="secondary" style={{ fontSize: 12, padding: '5px 10px' }}
                  onClick={() => { setConfirmClearAll(true); setTimeout(() => setConfirmClearAll(false), 3000); }}
                >
                  Clear All
                </button>
              )
            )}
          </div>
        </div>

        <ClaudeBatchPanel
          fields={allFields.map(f => ({ key: f.key, label: f.label, required: f.required, maxChars: f.maxChars }))}
          engine={engine}
          templateName={activeTemplate?.name}
          brandContext={activeBrand ? { name: activeBrand.name, description: activeBrand.description, guidelines: activeBrand.guidelines, industry: activeBrand.industry } : undefined}
          onAddRows={generated => {
            const newRows: BatchRow[] = generated.map((g, i) => ({
              id: `row_claude_${Date.now()}_${i}`,
              outputName: g.output_name || '',
              content: Object.fromEntries(Object.entries(g).filter(([k]) => k !== 'output_name')),
              status: 'pending',
              expanded: false,
            }));
            setRows(prev => [...prev, ...newRows]);
          }}
          disabled={running}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map((row, idx) => (
            <div
              key={row.id}
              style={{
                border: `1px solid ${row.status === 'error' ? 'var(--red)' : row.status === 'done' ? 'rgba(60,200,120,.3)' : 'var(--line)'}`,
                borderRadius: 8,
                overflow: 'hidden',
              }}
            >
              {/* Row header */}
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', background: 'var(--surface-dim)', cursor: 'pointer', userSelect: 'none' }}
                onClick={() => updateRow(row.id, { expanded: !row.expanded })}
              >
                <StatusIcon status={row.status} />
                <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, minWidth: 22, textAlign: 'center' }}>
                  {idx + 1}
                </span>
                <span style={{ fontSize: 13, fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.outputName || row.content['TEXT_TITLE'] || row.content['DOC_TITLE'] || <em style={{ color: 'var(--muted)', fontWeight: 400 }}>Untitled row</em>}
                </span>
                {/* Template badge */}
                {activeTemplate && (
                  <span style={{
                    fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4, flexShrink: 0,
                    background: ENGINE_ACCENTS[engine].bg, color: ENGINE_ACCENTS[engine].fg,
                    border: `1px solid ${ENGINE_ACCENTS[engine].border}`,
                    maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }} title={activeTemplate.name}>
                    {activeTemplate.name}
                  </span>
                )}
                {row.status === 'done'    && <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}><CheckCircle2 size={11} /> Done</span>}
                {row.status === 'error'   && <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--red)',   display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}><AlertTriangle size={11} /> Failed</span>}
                {row.status === 'running' && <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}><RefreshCw size={10} className="spin" /> Running…</span>}
                {!running && (row.status === 'done' || row.status === 'error') && (
                  <Tooltip text="Re-run this single row" delay={150}>
                    <button
                      className="secondary"
                      style={{ fontSize: 11, padding: '2px 6px' }}
                      onClick={e => { e.stopPropagation(); retryRow(row.id); }}
                    >
                      <RefreshCw size={11} /> Retry
                    </button>
                  </Tooltip>
                )}
                {!running && (
                  <Tooltip text="Remove this row from the batch" delay={200}>
                    <button
                      className="secondary"
                      style={{ fontSize: 11, padding: '2px 6px' }}
                      onClick={e => { e.stopPropagation(); removeRow(row.id); }}
                    >
                      <Trash2 size={11} />
                    </button>
                  </Tooltip>
                )}
                {row.expanded ? <ChevronDown size={14} style={{ color: 'var(--muted)' }} /> : <ChevronRight size={14} style={{ color: 'var(--muted)' }} />}
              </div>

              {/* Row fields */}
              {row.expanded && (
                <div style={{ padding: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {/* Output name */}
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div className="field-group" style={{ margin: 0 }}>
                      <Tooltip text="Optional file name base — auto-generated from the title if left blank" display="block">
                        <label>Output Name <span style={{ color: 'var(--muted)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
                      </Tooltip>
                      <input
                        className="field-input"
                        style={{ fontSize: 12 }}
                        value={row.outputName}
                        onChange={e => updateRow(row.id, { outputName: e.target.value })}
                        placeholder="Auto-generated if blank"
                        disabled={running}
                      />
                    </div>
                  </div>

                  {allFields.map(f => (
                    <div
                      key={f.key}
                      style={{ gridColumn: f.key === 'TEXT_TITLE' || f.key === 'DOC_TITLE' || f.key === 'SECTION_BODY' ? '1 / -1' : 'auto' }}
                    >
                      <CharLimitField
                        fieldKey={f.key}
                        label={f.label}
                        required={f.required}
                        maxChars={f.maxChars}
                        rows={f.key === 'SECTION_BODY' ? 4 : f.key === 'TEXT_TITLE' || f.key === 'DOC_TITLE' ? 1 : 2}
                        value={row.content[f.key] || ''}
                        onChange={v => updateContent(row.id, f.key, v)}
                        disabled={running}
                        style={{ margin: 0 }}
                      />
                    </div>
                  ))}

                  {row.status === 'error' && row.result && (
                    <div style={{ gridColumn: '1 / -1', marginTop: 4, padding: 8, background: 'rgba(255,60,60,.08)', borderRadius: 6, fontSize: 12, color: 'var(--red)' }}>
                      {row.result.userMessage || row.result.error || 'Unknown error'}
                    </div>
                  )}
                  {row.status === 'done' && row.result && engine === 'adobe_express' && row.result.editorUrl && (
                    <div style={{ gridColumn: '1 / -1', marginTop: 4 }}>
                      <button className="secondary" style={{ fontSize: 12 }} onClick={() => window.open(row.result.editorUrl, '_blank')}>
                        Open in Adobe Express
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {rows.length === 0 && (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--muted)', border: '1px dashed var(--border-subtle)', borderRadius: 10, marginTop: 8 }}>
            <FileUp size={28} style={{ opacity: .25, marginBottom: 10 }} />
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, opacity: .6 }}>No rows yet</div>
            <div style={{ fontSize: 12, opacity: .4 }}>Add a row manually or import from CSV above.</div>
          </div>
        )}

        {/* Segmented progress bar */}
        {(running || completed > 0) && (
          <div style={{ marginTop: 16 }}>
            {/* Bar */}
            <div style={{ height: 6, background: 'var(--line)', borderRadius: 3, overflow: 'hidden', display: 'flex' }}>
              {/* Done (green) */}
              {done > 0 && (
                <div style={{
                  height: '100%',
                  width: `${(done / rows.length) * 100}%`,
                  background: 'var(--green)',
                  transition: 'width .3s',
                }} />
              )}
              {/* Failed (red) */}
              {failed > 0 && (
                <div style={{
                  height: '100%',
                  width: `${(failed / rows.length) * 100}%`,
                  background: 'var(--red)',
                  transition: 'width .3s',
                }} />
              )}
              {/* In-progress (accent, pulsing) */}
              {inProgress > 0 && (
                <div style={{
                  height: '100%',
                  width: `${(inProgress / rows.length) * 100}%`,
                  background: 'var(--accent)',
                  opacity: 0.7,
                  animation: 'pulse 1.2s ease-in-out infinite',
                }} />
              )}
              {/* Pending (implicit — rest of bar stays as --border bg) */}
            </div>

            {/* Stats row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6, fontSize: 12 }}>
              <span style={{ color: 'var(--muted)' }}>
                {completed} / {rows.length}
              </span>
              {done    > 0 && <span style={{ color: 'var(--green)' }}>✓ {done} done</span>}
              {failed  > 0 && <span style={{ color: 'var(--red)' }}>✗ {failed} failed</span>}
              {running && inProgress > 0 && (
                <span style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Loader size={11} className="spin" /> {inProgress} running
                </span>
              )}
              {remaining > 0 && (
                <span style={{ color: 'var(--muted)', opacity: .6 }}>{remaining} pending</span>
              )}

              {/* Elapsed + ETA — right-aligned */}
              <span style={{ marginLeft: 'auto', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
                {(running || elapsed > 0) && (
                  <span>⏱ {formatTime(elapsed)}</span>
                )}
                {etaSecs > 0 && (
                  <span style={{ opacity: .7 }}>· ~{formatTime(etaSecs)} left</span>
                )}
                {!running && elapsed > 0 && completed === rows.length && (
                  <span style={{ color: failed > 0 ? 'var(--yellow)' : 'var(--green)' }}>
                    · finished
                  </span>
                )}
              </span>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="button-row" style={{ marginTop: 16 }}>
          {!running ? (
            <Tooltip text="Process all rows through the selected template — each row produces a separate output file">
              <button onClick={runBatch} disabled={rows.length === 0 || !selectedTemplate || !requiredMet}>
                <Zap size={15} /> Run Batch ({rows.length} {rows.length === 1 ? 'row' : 'rows'})
              </button>
            </Tooltip>
          ) : (
            <Tooltip text="Gracefully cancel — the current row will finish before the batch stops">
              <button className="secondary" onClick={cancelBatch}>
                <Square size={15} /> Stop After Current
              </button>
            </Tooltip>
          )}
          {!running && (
            <Tooltip text="Reset all row statuses to pending so the batch can be re-run">
              <button className="secondary" onClick={() => { setRows(prev => prev.map(r => ({ ...r, status: 'pending', result: undefined }))); setElapsed(0); setRowTimes([]); }}>
                <RefreshCw size={14} /> Reset Status
              </button>
            </Tooltip>
          )}
          {!running && completed > 0 && (
            <Tooltip text="Download a CSV summary of all batch results with status and error details">
              <button className="secondary" onClick={downloadResultsCSV}>
                <Download size={14} /> Export Results CSV
              </button>
            </Tooltip>
          )}
        </div>

        {!requiredMet && rows.length > 0 && (
          <p style={{ fontSize: 12, color: 'var(--yellow)', marginTop: 8 }}>
            Some rows are missing required fields ({requiredFields.map(f => f.label).join(', ')}).
          </p>
        )}
      </section>
    </div>
  );
}
