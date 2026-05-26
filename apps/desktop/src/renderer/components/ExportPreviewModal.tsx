import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Zap, AlertTriangle, CheckCircle2, FileText, Image, RefreshCw } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

export type FieldRole =
  | 'title' | 'heading' | 'subheading' | 'body'
  | 'stat-val' | 'stat-lbl' | 'quote' | 'cta' | 'url' | 'tag' | 'default';

export interface PreviewField {
  key: string;
  label: string;
  value: string;
  required: boolean;
  role?: FieldRole;
}

export interface PreviewPage {
  id: string;
  label: string;
  typeLabel: string;
  color: string;
  Icon?: any;
  fields: PreviewField[];
}

interface ExportPreviewModalProps {
  open: boolean;
  onClose: () => void;
  onExport: () => void;
  templateName?: string;
  thumbnailUrl?: string | null;
  engine: string;
  /** Multi-page mode — used for InDesign */
  pages?: PreviewPage[];
  /** Single-page mode — used for Illustrator, Canva, etc. */
  fields?: PreviewField[];
  outputName?: string;
  busy?: boolean;
}

// ── Field rendering by role ────────────────────────────────────────────────────

function FieldPreview({ field }: { field: PreviewField }) {
  const missing = !field.value?.trim();

  if (missing) {
    return (
      <div style={{
        padding: '8px 12px', borderRadius: 6, marginBottom: 6,
        border: field.required ? '1.5px dashed rgba(255,116,116,.4)' : '1px dashed var(--border-subtle)',
        background: field.required ? 'rgba(255,116,116,.04)' : 'transparent',
      }}>
        <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '.06em', marginBottom: 3 }}>{field.label}</div>
        <div style={{ fontSize: 12, color: field.required ? 'rgba(255,116,116,.7)' : 'var(--muted)', fontStyle: 'italic' }}>
          {field.required ? '⚠ Required — missing' : 'Optional — empty'}
        </div>
      </div>
    );
  }

  const role = field.role ?? 'default';

  if (role === 'title') return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '.06em', marginBottom: 4 }}>{field.label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', lineHeight: 1.25 }}>{field.value}</div>
    </div>
  );

  if (role === 'heading') return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '.06em', marginBottom: 3 }}>{field.label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{field.value}</div>
    </div>
  );

  if (role === 'subheading') return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '.06em', marginBottom: 3 }}>{field.label}</div>
      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary, var(--text))' }}>{field.value}</div>
    </div>
  );

  if (role === 'body') return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '.06em', marginBottom: 3 }}>{field.label}</div>
      <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6,
        display: '-webkit-box', WebkitLineClamp: 5, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {field.value}
      </div>
    </div>
  );

  if (role === 'stat-val') return (
    <div style={{ textAlign: 'center', padding: '8px 0' }}>
      <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--accent)', lineHeight: 1 }}>{field.value}</div>
    </div>
  );

  if (role === 'stat-lbl') return (
    <div style={{ textAlign: 'center', marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase',
        letterSpacing: '.08em' }}>{field.value}</div>
    </div>
  );

  if (role === 'quote') return (
    <div style={{ marginBottom: 10, padding: '10px 14px', borderLeft: '3px solid var(--accent)',
      background: 'rgba(103,216,255,.05)', borderRadius: '0 6px 6px 0' }}>
      <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '.06em', marginBottom: 4 }}>{field.label}</div>
      <div style={{ fontSize: 14, fontStyle: 'italic', color: 'var(--text)', lineHeight: 1.5 }}>"{field.value}"</div>
    </div>
  );

  if (role === 'cta') return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '.06em', marginBottom: 4 }}>{field.label}</div>
      <div style={{
        display: 'inline-flex', alignItems: 'center', padding: '6px 16px', borderRadius: 20,
        background: 'var(--accent)', color: '#000', fontSize: 12, fontWeight: 700,
      }}>{field.value}</div>
    </div>
  );

  if (role === 'url') return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '.06em', marginBottom: 2 }}>{field.label}</div>
      <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>{field.value}</div>
    </div>
  );

  if (role === 'tag') return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '.06em', marginBottom: 2 }}>{field.label}</div>
      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10,
        background: 'var(--surface-mid)', color: 'var(--muted)' }}>{field.value}</span>
    </div>
  );

  // default
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '.06em', marginBottom: 2 }}>{field.label}</div>
      <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5,
        display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {field.value}
      </div>
    </div>
  );
}

// ── Single-page content preview ────────────────────────────────────────────────

function SinglePagePreview({ fields }: { fields: PreviewField[] }) {
  const filled   = fields.filter(f => f.value?.trim());
  const missing  = fields.filter(f => !f.value?.trim() && f.required);
  const optional = fields.filter(f => !f.value?.trim() && !f.required);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <CheckCircle2 size={13} style={{ color: filled.length === fields.length ? 'var(--green)' : 'var(--yellow)' }} />
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          {filled.length} / {fields.length} fields filled
          {missing.length > 0 && <span style={{ color: 'var(--red)', marginLeft: 6 }}>· {missing.length} required missing</span>}
          {optional.length > 0 && <span style={{ marginLeft: 6 }}>· {optional.length} optional empty</span>}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {fields.map(f => <FieldPreview key={f.key} field={f} />)}
      </div>
    </div>
  );
}

// ── Multi-page content preview (InDesign) ─────────────────────────────────────

function MultiPagePreview({ pages }: { pages: PreviewPage[] }) {
  const [activePage, setActivePage] = useState(pages[0]?.id ?? 'cover');
  const page = pages.find(p => p.id === activePage) ?? pages[0];

  const totalFields   = pages.flatMap(p => p.fields).length;
  const filledFields  = pages.flatMap(p => p.fields).filter(f => f.value?.trim()).length;
  const missingReq    = pages.flatMap(p => p.fields).filter(f => !f.value?.trim() && f.required).length;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <CheckCircle2 size={13} style={{ color: missingReq === 0 ? 'var(--green)' : 'var(--yellow)' }} />
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          {filledFields} / {totalFields} fields · {pages.length} pages
          {missingReq > 0 && <span style={{ color: 'var(--red)', marginLeft: 6 }}>· {missingReq} required missing</span>}
        </span>
      </div>

      {/* Page tabs */}
      <div style={{ display: 'flex', gap: 4, overflowX: 'auto', marginBottom: 14, paddingBottom: 4 }}>
        {pages.map(p => {
          const isActive = activePage === p.id;
          const pageMissing = p.fields.filter(f => !f.value?.trim() && f.required).length;
          const Icon = p.Icon;
          return (
            <button key={p.id} onClick={() => setActivePage(p.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6,
                border: isActive ? `1.5px solid ${p.color}` : '1.5px solid var(--line)',
                background: isActive ? `${p.color}12` : 'transparent',
                flexShrink: 0, cursor: 'pointer',
              }}>
              {Icon && <Icon size={11} style={{ color: isActive ? p.color : 'var(--muted)' }} />}
              <span style={{ fontSize: 11, fontWeight: 600, color: isActive ? 'var(--text)' : 'var(--muted)',
                whiteSpace: 'nowrap' }}>{p.label}</span>
              {pageMissing > 0 && <span style={{ fontSize: 9, color: 'var(--red)' }}>●</span>}
              {pageMissing === 0 && p.fields.some(f => f.value?.trim()) &&
                <span style={{ fontSize: 9, color: 'var(--green)' }}>✓</span>}
            </button>
          );
        })}
      </div>

      {/* Page content */}
      {page && (
        <div style={{ padding: '12px 14px', background: 'var(--surface-dim)',
          borderRadius: 8, border: `1px solid var(--border-subtle)` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            {page.Icon && <page.Icon size={13} style={{ color: page.color }} />}
            <span style={{ fontSize: 12, fontWeight: 700, color: page.color }}>{page.typeLabel}</span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>— {page.label}</span>
          </div>
          {page.fields.map(f => <FieldPreview key={f.key} field={f} />)}
        </div>
      )}
    </div>
  );
}

// ── Engine label ───────────────────────────────────────────────────────────────

const ENGINE_META: Record<string, { label: string; color: string }> = {
  illustrator:  { label: 'Illustrator', color: 'var(--eng-illo)' },
  indesign:     { label: 'InDesign',    color: 'var(--eng-indd)' },
  canva:        { label: 'Canva',       color: 'var(--eng-canva)' },
  adobe_express:{ label: 'Adobe Express', color: 'var(--eng-expr)' },
  figma:        { label: 'Figma',       color: 'var(--eng-figma)' },
};

// ── Main modal ─────────────────────────────────────────────────────────────────

export function ExportPreviewModal({
  open, onClose, onExport,
  templateName, thumbnailUrl,
  engine, pages, fields,
  outputName, busy,
}: ExportPreviewModalProps) {
  if (!open) return null;

  const meta        = ENGINE_META[engine] ?? { label: engine, color: 'var(--accent)' };
  const isMultiPage = !!pages && pages.length > 0;
  const allFields   = isMultiPage ? pages!.flatMap(p => p.fields) : (fields ?? []);
  const missingReq  = allFields.filter(f => !f.value?.trim() && f.required).length;
  const canExport   = missingReq === 0;

  return createPortal(
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,.65)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div style={{
        width: '100%', maxWidth: 860, maxHeight: '90vh',
        background: 'var(--bg)', border: '1px solid var(--line)',
        borderRadius: 16, boxShadow: '0 24px 80px rgba(0,0,0,.6)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px',
          borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%', background: meta.color, flexShrink: 0,
          }} />
          <span style={{ fontSize: 14, fontWeight: 700 }}>Export Preview</span>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>—</span>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{templateName ?? 'Template'}</span>
          <div style={{
            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8,
          }}>
            {!canExport && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12,
                color: 'var(--red)', padding: '4px 10px', borderRadius: 6,
                background: 'rgba(255,116,116,.08)', border: '1px solid rgba(255,116,116,.2)' }}>
                <AlertTriangle size={11} />
                {missingReq} required field{missingReq > 1 ? 's' : ''} missing
              </div>
            )}
            {canExport && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12,
                color: 'var(--green)', padding: '4px 10px', borderRadius: 6,
                background: 'rgba(117,245,174,.07)', border: '1px solid rgba(117,245,174,.2)' }}>
                <CheckCircle2 size={11} />
                Ready to export
              </div>
            )}
            <button onClick={onClose} className="secondary"
              style={{ padding: '5px 8px', borderRadius: 7, lineHeight: 1 }}>
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* Left: thumbnail */}
          <div style={{
            width: 220, flexShrink: 0, padding: 20,
            borderRight: '1px solid var(--line)',
            display: 'flex', flexDirection: 'column', gap: 14,
            overflowY: 'auto',
          }}>
            {/* Template thumb */}
            <div style={{
              width: '100%', aspectRatio: '3/4', borderRadius: 10,
              background: 'var(--panel)', border: '1px solid var(--line)',
              overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {thumbnailUrl
                ? <img src={thumbnailUrl} alt={templateName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <FileText size={40} style={{ color: 'var(--muted)', opacity: .3 }} />}
            </div>

            {/* Meta */}
            <div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Template</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{templateName ?? '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Engine</div>
              <span style={{ fontSize: 12, fontWeight: 700, color: meta.color }}>{meta.label}</span>
            </div>
            {outputName && (
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Output name</div>
                <div style={{ fontSize: 12, fontFamily: 'monospace', wordBreak: 'break-all' }}>{outputName}</div>
              </div>
            )}
            {isMultiPage && pages && (
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Pages</div>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{pages.length}</div>
              </div>
            )}

            {/* Completeness bar */}
            <div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>Completeness</div>
              <div style={{ height: 6, borderRadius: 3, background: 'var(--border-dim)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 3,
                  width: `${allFields.length === 0 ? 0 : Math.round((allFields.filter(f => f.value?.trim()).length / allFields.length) * 100)}%`,
                  background: canExport ? 'var(--green)' : 'var(--yellow)',
                  transition: 'width .3s',
                }} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                {allFields.filter(f => f.value?.trim()).length} / {allFields.length} fields
              </div>
            </div>

            {/* Image placeholder indicator */}
            <div style={{ padding: '8px 10px', borderRadius: 7, background: 'var(--surface-dim)',
              border: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--muted)' }}>
                <Image size={11} />
                <span>Images applied at export time</span>
              </div>
            </div>
          </div>

          {/* Right: content preview */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em',
              color: 'var(--muted)', marginBottom: 16 }}>Content Preview</div>

            {isMultiPage && pages
              ? <MultiPagePreview pages={pages} />
              : fields && <SinglePagePreview fields={fields} />}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px',
          borderTop: '1px solid var(--line)', flexShrink: 0, background: 'var(--bg)' }}>
          <button onClick={onClose} className="secondary" style={{ fontSize: 13, padding: '9px 20px' }}>
            ← Back to edit
          </button>
          <div style={{ flex: 1 }} />
          {!canExport && (
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              Fill required fields to enable export
            </span>
          )}
          <button
            onClick={() => { onExport(); onClose(); }}
            disabled={busy || !canExport}
            style={{ fontSize: 13, padding: '9px 24px', opacity: canExport ? 1 : .4 }}
          >
            {busy
              ? <><RefreshCw size={13} className="spin" /> Exporting…</>
              : <><Zap size={13} /> Export Now</>}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
