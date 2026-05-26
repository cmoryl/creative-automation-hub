import { useState } from 'react';
import { AlertTriangle, Bot, CheckCircle2, ChevronDown, ChevronRight, Plus, RefreshCw, Sparkles, X } from 'lucide-react';

export interface BriefField {
  key: string;
  label: string;
  required: boolean;
  maxChars?: number;
}

interface GeneratedRow {
  output_name: string;
  [key: string]: string;
}

interface ClaudeBatchPanelProps {
  fields: BriefField[];
  engine: string;
  templateName?: string;
  /** Active brand context — injected into Claude prompt for brand-aligned output */
  brandContext?: { name: string; description?: string; guidelines?: string; industry?: string };
  /** Called with the array of generated rows to add to the batch queue */
  onAddRows: (rows: GeneratedRow[]) => void;
  disabled?: boolean;
}

/**
 * "Generate batch from brief" panel.
 * One campaign brief → N distinct content variations → batch rows.
 * Shows a preview before adding so the user can review.
 */
export function ClaudeBatchPanel({ fields, engine, templateName, brandContext, onAddRows, disabled }: ClaudeBatchPanelProps) {
  const [open, setOpen]           = useState(false);
  const [brief, setBrief]         = useState('');
  const [count, setCount]         = useState(3);
  const [loading, setLoading]     = useState(false);
  const [preview, setPreview]     = useState<GeneratedRow[] | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const [added, setAdded]         = useState(false);

  async function generate() {
    if (!brief.trim()) return;
    setLoading(true);
    setPreview(null);
    setError(null);
    setAdded(false);
    try {
      const res = await window.creativePlatform.claudeGenerateBatch({
        brief: brief.trim(),
        count,
        fields,
        engine,
        templateName,
        brandContext,
      });
      if (res.ok) setPreview(res.rows);
      else setError(res.message || 'Generation failed.');
    } catch (e: any) {
      setError(e.message || 'Unexpected error.');
    } finally {
      setLoading(false);
    }
  }

  function addAll() {
    if (!preview?.length) return;
    onAddRows(preview);
    setAdded(true);
    // Reset after a beat
    setTimeout(() => { setOpen(false); setBrief(''); setPreview(null); setAdded(false); }, 1200);
  }

  const textFields = fields.filter(f => f.required).slice(0, 3); // summary fields for preview

  return (
    <div style={{
      borderRadius: 12, marginBottom: 12,
      border: open ? '1px solid rgba(103,216,255,.35)' : '1px solid rgba(103,216,255,.18)',
      background: open ? 'rgba(103,216,255,.05)' : 'rgba(103,216,255,.03)',
      transition: 'border-color .15s',
      overflow: 'hidden',
    }}>
      {/* Toggle */}
      <button
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'transparent', border: 'none', color: 'var(--text)', cursor: 'pointer', borderRadius: 0 }}
        onClick={() => { setOpen(o => !o); }}
        disabled={disabled}
      >
        <Bot size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        <span style={{ fontWeight: 700, fontSize: 13, flex: 1, textAlign: 'left', color: 'var(--accent)' }}>
          Generate Batch from Brief
        </span>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>Claude writes N variations → add to queue</span>
        <span style={{ color: 'var(--muted)', marginLeft: 8 }}>
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
      </button>

      {open && (
        <div style={{ padding: '0 14px 14px' }}>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
            Describe one campaign or company — Claude generates multiple distinct variations, each ready to export.
            Ideal for industry verticals, regional variants, or A/B copy tests.
          </p>

          {/* Brief + count row */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10 }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <textarea
                className="field-input"
                rows={4}
                value={brief}
                onChange={e => setBrief(e.target.value)}
                placeholder={`Campaign brief — who is the customer, what did they achieve, what were their stats?\n\nExample: "Healthcare data platform, reduced lab processing time 68%, operates in 12 hospital systems, targeting CFOs and CMOs"`}
                disabled={disabled || loading}
                style={{ resize: 'vertical', minHeight: 80 }}
              />
              {brief && (
                <button style={{ position: 'absolute', top: 8, right: 8, background: 'none', border: 'none', padding: 4, color: 'var(--muted)', cursor: 'pointer', borderRadius: 4 }}
                  onClick={() => { setBrief(''); setPreview(null); setError(null); }} title="Clear">
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Count picker */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', fontWeight: 700 }}>Rows</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {[2, 3, 5, 10].map(n => (
                  <button
                    key={n}
                    className="secondary"
                    style={{ fontSize: 12, padding: '4px 14px', fontWeight: count === n ? 800 : 500, borderColor: count === n ? 'var(--accent)' : undefined, color: count === n ? 'var(--accent)' : undefined }}
                    onClick={() => setCount(n)}
                    disabled={loading}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Generate button */}
          <button onClick={generate} disabled={disabled || loading || !brief.trim()} style={{ fontSize: 13, padding: '8px 20px', marginBottom: 12 }}>
            {loading
              ? <><RefreshCw size={13} className="spin" /> Generating {count} rows…</>
              : <><Sparkles size={13} /> Generate {count} Variations</>
            }
          </button>

          {/* Error */}
          {error && (
            <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(255,116,116,.08)', border: '1px solid rgba(255,116,116,.25)', display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: 'var(--red)', marginBottom: 10 }}>
              <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
              {error}
            </div>
          )}

          {/* Preview */}
          {preview && !added && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)', flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckCircle2 size={13} /> {preview.length} rows generated — review before adding
                </span>
                <button className="secondary" style={{ fontSize: 11, padding: '3px 10px' }} onClick={generate} disabled={loading}>
                  <RefreshCw size={10} /> Regenerate
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto', marginBottom: 10 }}>
                {preview.map((row, i) => (
                  <div key={i} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface-dim)', fontSize: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', padding: '1px 6px', borderRadius: 4, background: 'var(--eng-canva-bg)' }}>
                        Row {i + 1}
                      </span>
                      <code style={{ fontSize: 11, color: 'var(--muted)' }}>{row.output_name}</code>
                    </div>
                    {textFields.map(f => row[f.key] && (
                      <div key={f.key} style={{ marginBottom: 3 }}>
                        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', fontWeight: 700 }}>{f.label}: </span>
                        <span style={{ color: 'var(--text)' }}>{String(row[f.key]).slice(0, 120)}{String(row[f.key]).length > 120 ? '…' : ''}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              <button onClick={addAll} style={{ fontSize: 13, padding: '8px 20px' }}>
                <Plus size={13} /> Add {preview.length} Rows to Batch
              </button>
            </div>
          )}

          {added && (
            <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(117,245,174,.08)', border: '1px solid rgba(117,245,174,.25)', display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: 'var(--green)' }}>
              <CheckCircle2 size={13} /> Rows added to batch queue — scroll down to review and export.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
