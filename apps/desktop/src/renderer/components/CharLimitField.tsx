
import { useEffect, useRef, useState } from 'react';
import { Tooltip } from './Tooltip';
import { RefreshCw, Sparkles, X } from 'lucide-react';

/**
 * Fallback char limits for well-known field keys.
 * Used when a manifest doesn't specify max_chars for a field.
 */
export const DEFAULT_CHAR_LIMITS: Record<string, number> = {
  // Illustrator case study
  TEXT_TITLE:                   100,
  TEXT_OVERVIEW:                350,
  TEXT_CHALLENGE:               400,
  TEXT_SOLUTION:                400,
  TEXT_RESULTS:                 400,
  TEXT_STAT_01:                  40,
  TEXT_STAT_02:                  40,
  TEXT_TESTIMONIAL:             250,
  TEXT_TESTIMONIAL_ATTRIBUTION: 100,
  // InDesign whitepaper
  DOC_TITLE:                    100,
  DOC_SUBTITLE:                 150,
  DOC_AUTHOR:                   100,
  DOC_DATE:                      40,
  SECTION_EXECUTIVE_SUMMARY:    600,
  SECTION_BODY:                2500,
  SECTION_CONCLUSION:           500,
  SECTION_CTA:                  160,
  STAT_01:                       40,
  STAT_02:                       40,
  STAT_03:                       40,
};

// ── Quick action definitions ───────────────────────────────────────────────────

const QUICK_ACTIONS = [
  { label: 'Rewrite',  instruction: 'Rewrite this more compellingly. Keep the same meaning.' },
  { label: 'Shorten',  instruction: 'Shorten this significantly. Keep only the essential message.' },
  { label: 'Expand',   instruction: 'Expand this with more specific detail and impact.' },
  { label: 'Formal',   instruction: 'Make this more formal and professional in tone.' },
  { label: 'Punchy',   instruction: 'Make this punchier and more impactful. Cut filler words.' },
  { label: 'Fix',      instruction: 'Fix any grammar, spelling, and clarity issues.' },
];

// ── Inline AI assist popover ───────────────────────────────────────────────────

function AiAssistPopover({
  label, value, limit, onChange, onClose,
}: {
  label: string;
  value: string;
  limit: number | null;
  onChange: (v: string) => void;
  onClose: () => void;
}) {
  const [custom, setCustom]       = useState('');
  const [loading, setLoading]     = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function runAssist(instruction: string) {
    if (!value.trim()) return;
    setLoading(true); setSuggestion(null); setError(null);
    try {
      const system = [
        'You are a precise content editor.',
        'When given a field value and an instruction, return ONLY the edited text.',
        'No preamble, no explanation, no surrounding quotes.',
        limit ? `Stay within ${limit} characters.` : '',
        'Preserve the original language (do not translate).',
      ].filter(Boolean).join(' ');

      const userMsg = [
        `Field: "${label}"`,
        limit ? `Character limit: ${limit}` : '',
        `Current value:\n${value}`,
        `\nInstruction: ${instruction}`,
      ].filter(Boolean).join('\n');

      const r = await window.creativePlatform.askClaude({
        system,
        messages: [{ role: 'user', content: userMsg }],
      });

      if (r?.ok && r.response) {
        // Strip surrounding quotes if Claude added them
        const cleaned = r.response.trim().replace(/^["']|["']$/g, '');
        // Truncate to limit if needed
        setSuggestion(limit && cleaned.length > limit ? cleaned.slice(0, limit) : cleaned);
      } else {
        setError(r?.message || r?.error || 'Claude could not process this request.');
      }
    } catch (e: any) {
      setError(e?.message || 'Network error');
    } finally {
      setLoading(false);
    }
  }

  function applyAndClose() {
    if (suggestion !== null) { onChange(suggestion); onClose(); }
  }

  return (
    <div
      style={{
        position: 'absolute', zIndex: 200, top: 'calc(100% + 6px)', right: 0,
        width: 320, background: 'var(--bg)', border: '1px solid var(--line)',
        borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,.5)',
        padding: 14,
      }}
      onMouseDown={e => e.stopPropagation()}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <Sparkles size={13} style={{ color: 'var(--accent)' }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', flex: 1 }}>
          AI Assist — {label}
        </span>
        <button onClick={onClose} className="secondary"
          style={{ padding: '3px 6px', borderRadius: 6, lineHeight: 1 }}>
          <X size={11} />
        </button>
      </div>

      {/* Quick actions */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
        {QUICK_ACTIONS.map(a => (
          <button key={a.label} onClick={() => runAssist(a.instruction)}
            disabled={loading || !value.trim()}
            className="secondary"
            style={{ fontSize: 11, padding: '4px 10px', borderRadius: 20, opacity: loading ? .5 : 1 }}>
            {a.label}
          </button>
        ))}
      </div>

      {/* Custom instruction */}
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          ref={inputRef}
          className="field-input"
          value={custom}
          onChange={e => setCustom(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && custom.trim()) runAssist(custom.trim()); }}
          placeholder="Custom instruction… (Enter to run)"
          disabled={loading}
          style={{ flex: 1, fontSize: 12, padding: '6px 10px', margin: 0 }}
        />
        <button onClick={() => runAssist(custom.trim())}
          disabled={loading || !custom.trim() || !value.trim()}
          style={{ padding: '6px 12px', fontSize: 12, flexShrink: 0 }}>
          →
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10,
          fontSize: 12, color: 'var(--muted)' }}>
          <RefreshCw size={11} className="spin" /> Writing…
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--red)',
          padding: '8px 10px', borderRadius: 7, background: 'rgba(255,116,116,.07)' }}>
          {error}
        </div>
      )}

      {/* Suggestion preview */}
      {suggestion !== null && !loading && (
        <div style={{ marginTop: 10 }}>
          <div style={{
            padding: '10px 12px', borderRadius: 8, fontSize: 12, lineHeight: 1.6,
            background: 'rgba(79,134,240,.06)', border: '1px solid rgba(79,134,240,.2)',
            color: 'var(--text)', maxHeight: 140, overflowY: 'auto',
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {suggestion}
          </div>
          {limit && (
            <div style={{ fontSize: 10, color: suggestion.length > limit * 0.8 ? 'var(--yellow)' : 'var(--muted)',
              marginTop: 4 }}>
              {suggestion.length} / {limit} chars
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button onClick={applyAndClose}
              style={{ fontSize: 12, padding: '6px 16px', flex: 1, justifyContent: 'center' }}>
              ✓ Apply
            </button>
            <button onClick={() => setSuggestion(null)} className="secondary"
              style={{ fontSize: 12, padding: '6px 12px' }}>
              Discard
            </button>
          </div>
        </div>
      )}

      {/* No content hint */}
      {!value.trim() && !loading && (
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>
          Type something in the field first, then use AI to refine it.
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface CharLimitFieldProps {
  label: string;
  fieldKey: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  maxChars?: number;   // from manifest; falls back to DEFAULT_CHAR_LIMITS
  rows?: number;
  placeholder?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
  /** Show the ✨ AI assist button. Defaults to true when askClaude is available. */
  aiAssist?: boolean;
}

export function CharLimitField({
  label,
  fieldKey,
  value,
  onChange,
  required = false,
  maxChars,
  rows = 2,
  placeholder,
  disabled = false,
  style,
  aiAssist = true,
}: CharLimitFieldProps) {
  const limit = maxChars ?? DEFAULT_CHAR_LIMITS[fieldKey] ?? null;
  const len   = value.length;
  const pct   = limit ? len / limit : 0;
  const [popoverOpen, setPopoverOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close popover on outside click
  useEffect(() => {
    if (!popoverOpen) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPopoverOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [popoverOpen]);

  const counterColor =
    !limit ? 'var(--muted)' :
    pct >= 1   ? 'var(--red)' :
    pct >= 0.8 ? 'var(--yellow)' :
                 'var(--muted)';

  const counterTooltip =
    pct >= 1   ? `At the character limit — no more characters can be added` :
    pct >= 0.8 ? `Approaching the ${limit}-character limit` :
    limit       ? `${limit - len} characters remaining (limit: ${limit})` :
                  undefined;

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    if (limit && next.length > limit) return; // hard cap
    onChange(next);
  }

  const borderStyle =
    pct >= 1   ? { borderColor: 'var(--red)' } :
    pct >= 0.8 ? { borderColor: 'var(--yellow)' } :
    undefined;

  // Only show AI button when there's a chance askClaude exists
  const showAi = aiAssist && !!window.creativePlatform?.askClaude;

  return (
    <div className="field-group" style={{ ...style, position: 'relative' }} ref={containerRef}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <label style={{ margin: 0 }}>
          {label}{' '}
          {required && (
            <Tooltip text="Required — this field must be filled before the export can run" position="top" delay={250}>
              <span className="required" style={{ cursor: 'default' }}>*</span>
            </Tooltip>
          )}
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {limit !== null && (
            <Tooltip text={counterTooltip} position="top" delay={250}>
              <span style={{ fontSize: 11, color: counterColor, fontVariantNumeric: 'tabular-nums',
                flexShrink: 0, cursor: 'default' }}>
                {len} / {limit}
              </span>
            </Tooltip>
          )}
          {showAi && (
            <Tooltip text="AI Assist — rewrite, shorten, expand, or custom-prompt this field" position="top" delay={150}>
              <button
                onClick={() => setPopoverOpen(o => !o)}
                disabled={disabled}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 22, height: 22, borderRadius: 6, border: 'none', cursor: 'pointer',
                  background: popoverOpen ? 'rgba(79,134,240,.2)' : 'transparent',
                  color: popoverOpen ? 'var(--accent)' : 'var(--muted)',
                  padding: 0, transition: 'all .15s',
                  opacity: disabled ? .4 : 1,
                }}
                onMouseEnter={e => { if (!popoverOpen) (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; (e.currentTarget as HTMLElement).style.background = 'rgba(79,134,240,.1)'; }}
                onMouseLeave={e => { if (!popoverOpen) { (e.currentTarget as HTMLElement).style.color = 'var(--muted)'; (e.currentTarget as HTMLElement).style.background = 'transparent'; } }}
              >
                <Sparkles size={12} />
              </button>
            </Tooltip>
          )}
        </div>
      </div>
      <textarea
        className="field-input"
        rows={rows}
        value={value}
        onChange={handleChange}
        placeholder={placeholder ?? `Enter ${label.toLowerCase()}…`}
        disabled={disabled}
        style={borderStyle}
      />
      {popoverOpen && (
        <AiAssistPopover
          label={label}
          value={value}
          limit={limit}
          onChange={v => { onChange(v); setPopoverOpen(false); }}
          onClose={() => setPopoverOpen(false)}
        />
      )}
    </div>
  );
}
