import { useState, useEffect } from 'react';
import { AlertTriangle, Bot, CheckCircle2, ChevronDown, ChevronRight, Image, RefreshCw, Sparkles, X } from 'lucide-react';

export interface BriefField {
  key: string;
  label: string;
  required: boolean;
  maxChars?: number;
}

interface ClaudeBriefPanelProps {
  /** Template fields to populate */
  fields: BriefField[];
  /** Engine name for context (illustrator, indesign, canva, adobe_express) */
  engine: string;
  /** Human-readable template name for richer prompts */
  templateName?: string;
  /** Active brand context — injected into Claude prompt for brand-aligned output */
  brandContext?: { name: string; description?: string; guidelines?: string; industry?: string };
  /** Called when Claude fills fields — merge these into your form state */
  onFill: (content: Record<string, string>) => void;
  disabled?: boolean;
}

/**
 * Collapsible "Generate from Brief" panel.
 * Paste or type a creative brief → Claude fills all template fields.
 * Drop this above any field form — it calls onFill(content) when done.
 */
export function ClaudeBriefPanel({ fields, engine, templateName, brandContext, onFill, disabled }: ClaudeBriefPanelProps) {
  const [open, setOpen]           = useState(false);
  const [brief, setBrief]         = useState('');
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [loading, setLoading]     = useState(false);
  const [result, setResult]       = useState<{ ok: boolean; message?: string; filledCount?: number } | null>(null);

  const [hasKey, setHasKey] = useState(true); // optimistic; verified on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await window.creativePlatform.getClaudeApiKey?.();
        setHasKey(!!(res?.hasKey));
      } catch {
        // dev stub or older preload — assume key present so panel stays usable
        setHasKey(true);
      }
    })();
  }, []);
  const charLen = brief.length;

  async function generate() {
    if (!brief.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await window.creativePlatform.claudeFillFields({
        brief: brief.trim(),
        fields,
        engine,
        templateName,
        brandContext,
        imagePath: attachedImage ?? undefined,
      });
      if (res.ok) {
        onFill(res.content);
        setResult({ ok: true, filledCount: res.filledCount });
        // Keep panel open so user can see what was filled, then re-generate if needed
      } else {
        setResult({ ok: false, message: res.message });
      }
    } catch (e: any) {
      setResult({ ok: false, message: e.message || 'Unexpected error.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      borderRadius: 12, marginBottom: 14,
      border: open ? '1px solid rgba(103,216,255,.35)' : '1px solid rgba(103,216,255,.18)',
      background: open ? 'rgba(103,216,255,.05)' : 'rgba(103,216,255,.03)',
      transition: 'border-color .15s, background .15s',
      overflow: 'hidden',
    }}>
      {/* Toggle header */}
      <button
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px', background: 'transparent', border: 'none',
          color: 'var(--text)', cursor: 'pointer', borderRadius: 0,
        }}
        onClick={() => { setOpen(o => !o); setResult(null); }}
        disabled={disabled}
      >
        <Bot size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        <span style={{ fontWeight: 700, fontSize: 13, flex: 1, textAlign: 'left', color: 'var(--accent)' }}>
          Generate from Brief
        </span>
        {result?.ok && (
          <span style={{ fontSize: 11, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <CheckCircle2 size={11} /> {result.filledCount} fields filled
          </span>
        )}
        <span style={{ color: 'var(--muted)' }}>
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
      </button>

      {/* Expanded body */}
      {open && (
        <div style={{ padding: '0 14px 14px' }}>
          <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
            Describe your content in plain language — Claude will extract and write every template field from your brief.
            The more specific you are (company name, metrics, outcomes), the better the result.
          </p>

          {/* Brief textarea */}
          <div style={{ position: 'relative' }}>
            <textarea
              className="field-input"
              rows={5}
              value={brief}
              onChange={e => setBrief(e.target.value)}
              placeholder={`Describe what this ${engine} piece is about…\n\nExample: "ClinPath Systems, a healthcare data analytics company, reduced lab errors by 68% and cut operating costs by 40% after implementing our platform. Their challenge was manual data entry across 12 hospital systems. Quote from their CTO: 'The ROI was immediate.'"`}
              disabled={disabled || loading}
              style={{ resize: 'vertical', minHeight: 100, paddingRight: 36 }}
            />
            {brief && (
              <button
                style={{ position: 'absolute', top: 8, right: 8, background: 'none', border: 'none', padding: 4, color: 'var(--muted)', cursor: 'pointer', borderRadius: 4 }}
                onClick={() => { setBrief(''); setResult(null); }}
                title="Clear brief"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Image attachment — Claude Vision */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <button
              className="secondary"
              style={{ fontSize: 11, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
              disabled={disabled || loading}
              onClick={async () => {
                const picked = await window.creativePlatform.pickLocalFile?.({ title: 'Attach image for Claude Vision', extensions: ['png', 'jpg', 'jpeg', 'webp'] });
                if (picked) setAttachedImage(picked);
              }}
              title="Attach an image — Claude will analyze it alongside your brief (Vision)"
            >
              <Image size={11} /> {attachedImage ? 'Change image' : 'Attach image'}
            </button>
            {attachedImage && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--accent)', flex: 1, minWidth: 0 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {attachedImage.split('/').pop()}
                </span>
                <button
                  style={{ background: 'none', border: 'none', padding: 2, color: 'var(--muted)', cursor: 'pointer', flexShrink: 0 }}
                  onClick={() => setAttachedImage(null)}
                  title="Remove image"
                >
                  <X size={10} />
                </button>
              </div>
            )}
            {attachedImage && (
              <span style={{ fontSize: 10, color: 'var(--muted)', flexShrink: 0 }}>Vision active</span>
            )}
          </div>

          {/* Char count + field summary */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0 10px', fontSize: 11, color: 'var(--muted)' }}>
            <span>{charLen} chars</span>
            <span>·</span>
            <span>Filling {fields.length} fields ({fields.filter(f => f.required).length} required)</span>
            {templateName && <><span>·</span><span style={{ color: 'var(--accent)' }}>{templateName}</span></>}
          </div>

          {/* Generate button */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={generate}
              disabled={disabled || loading || !brief.trim()}
              style={{ fontSize: 13, padding: '8px 18px' }}
            >
              {loading
                ? <><RefreshCw size={13} className="spin" /> Generating…</>
                : <><Sparkles size={13} /> Generate Fields</>
              }
            </button>

            {result?.ok && (
              <button
                className="secondary"
                style={{ fontSize: 12, padding: '8px 14px' }}
                onClick={generate}
                disabled={loading}
              >
                <RefreshCw size={12} /> Regenerate
              </button>
            )}

            <span style={{ fontSize: 11, color: 'var(--muted)', flex: 1, textAlign: 'right' }}>
              Powered by Claude · review all fields before exporting
            </span>
          </div>

          {/* Result message */}
          {result && (
            <div style={{
              marginTop: 10, padding: '8px 12px', borderRadius: 8, fontSize: 12,
              background: result.ok ? 'rgba(117,245,174,.08)' : 'rgba(255,116,116,.08)',
              border: `1px solid ${result.ok ? 'rgba(117,245,174,.25)' : 'rgba(255,116,116,.25)'}`,
              display: 'flex', alignItems: 'flex-start', gap: 8, color: result.ok ? 'var(--green)' : 'var(--red)',
            }}>
              {result.ok
                ? <><CheckCircle2 size={13} style={{ flexShrink: 0, marginTop: 1 }} /><span><strong>{result.filledCount} fields filled</strong> — review the content below and edit anything that needs adjustment before exporting.</span></>
                : <><AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} /><span><strong>Generation failed:</strong> {result.message}</span></>
              }
            </div>
          )}
        </div>
      )}
    </div>
  );
}
