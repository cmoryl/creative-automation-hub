import { useEffect, useRef, useState } from 'react';
import { BookMarked, ChevronDown, Save, Trash2, X } from 'lucide-react';

// ── Storage helpers ────────────────────────────────────────────────────────────

interface Preset {
  id: string;
  name: string;
  content: any;   // string for briefs, Record<string,string> for field sets
  createdAt: number;
}

function readPresets(key: string): Preset[] {
  try {
    const raw = localStorage.getItem(`presets:${key}`);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function writePresets(key: string, presets: Preset[]) {
  try { localStorage.setItem(`presets:${key}`, JSON.stringify(presets)); } catch {}
}

// ── Save dialog ────────────────────────────────────────────────────────────────

function SaveDialog({ onSave, onClose }: { onSave: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  function commit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed);
    onClose();
  }

  return (
    <div style={{
      position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 300,
      background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 10,
      padding: 12, width: 260, boxShadow: '0 8px 32px rgba(0,0,0,.45)',
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>
        Save preset
      </div>
      <input
        ref={inputRef}
        className="field-input"
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') onClose(); }}
        placeholder="Preset name…"
        style={{ fontSize: 12, padding: '6px 10px', margin: '0 0 8px', width: '100%', boxSizing: 'border-box' }}
      />
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={commit} disabled={!name.trim()}
          style={{ flex: 1, fontSize: 12, padding: '6px', justifyContent: 'center' }}>
          <Save size={11} /> Save
        </button>
        <button onClick={onClose} className="secondary"
          style={{ fontSize: 12, padding: '6px 10px' }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Presets dropdown ───────────────────────────────────────────────────────────

function PresetsDropdown({
  presets, onLoad, onDelete, onClose,
}: {
  presets: Preset[];
  onLoad: (p: Preset) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div style={{
      position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 300,
      background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 10,
      padding: 6, width: 240, boxShadow: '0 8px 32px rgba(0,0,0,.45)',
      maxHeight: 300, overflowY: 'auto',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em',
        color: 'var(--muted)', padding: '4px 8px 6px' }}>Saved Presets</div>
      {presets.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 10px', fontStyle: 'italic' }}>
          No presets saved yet.
        </div>
      )}
      {presets.map(p => (
        <div key={p.id} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '7px 8px', borderRadius: 7,
          cursor: 'pointer', transition: 'background .1s',
        }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-mid)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <button
            onClick={() => { onLoad(p); onClose(); }}
            style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none',
              cursor: 'pointer', padding: 0, color: 'var(--text)', fontSize: 12, fontWeight: 600 }}
          >
            {p.name}
            <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 400, marginTop: 1 }}>
              {new Date(p.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })}
            </div>
          </button>
          <button
            onClick={e => { e.stopPropagation(); onDelete(p.id); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)',
              padding: '2px 4px', borderRadius: 4, lineHeight: 1, opacity: .6,
              transition: 'opacity .1s, color .1s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; (e.currentTarget as HTMLElement).style.color = 'var(--red)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '.6'; (e.currentTarget as HTMLElement).style.color = 'var(--muted)'; }}
            title="Delete preset"
          >
            <Trash2 size={11} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface ContentPresetsProps {
  /** Unique storage key — use 'brief', 'illustrator', 'indesign', etc. */
  storageKey: string;
  /** Current content to save */
  content: any;
  /** Called when user loads a preset */
  onLoad: (content: any) => void;
  /** Optional: show a label */
  label?: string;
  disabled?: boolean;
}

export function ContentPresets({ storageKey, content, onLoad, label, disabled }: ContentPresetsProps) {
  const [presets, setPresets]     = useState<Preset[]>(() => readPresets(storageKey));
  const [showSave, setShowSave]   = useState(false);
  const [showLoad, setShowLoad]   = useState(false);
  const containerRef              = useRef<HTMLDivElement>(null);

  // Reload when key changes
  useEffect(() => { setPresets(readPresets(storageKey)); }, [storageKey]);

  // Close dropdowns on outside click
  useEffect(() => {
    if (!showSave && !showLoad) return;
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSave(false);
        setShowLoad(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showSave, showLoad]);

  function handleSave(name: string) {
    const preset: Preset = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      content,
      createdAt: Date.now(),
    };
    const updated = [preset, ...presets].slice(0, 20); // cap at 20
    setPresets(updated);
    writePresets(storageKey, updated);
  }

  function handleDelete(id: string) {
    const updated = presets.filter(p => p.id !== id);
    setPresets(updated);
    writePresets(storageKey, updated);
  }

  const isEmpty = typeof content === 'string' ? !content.trim() : Object.values(content || {}).every(v => !String(v).trim());

  return (
    <div ref={containerRef} style={{ display: 'flex', alignItems: 'center', gap: 6, position: 'relative' }}>
      {label && (
        <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase',
          letterSpacing: '.06em', whiteSpace: 'nowrap' }}>
          {label}
        </span>
      )}

      {/* Save button */}
      <button
        onClick={() => { setShowLoad(false); setShowSave(s => !s); }}
        disabled={disabled || isEmpty}
        className="secondary"
        style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, padding: '5px 10px',
          opacity: isEmpty || disabled ? .45 : 1 }}
        title="Save current content as a named preset"
      >
        <Save size={11} /> Save
      </button>

      {/* Load button */}
      <button
        onClick={() => { setShowSave(false); setShowLoad(s => !s); }}
        disabled={disabled}
        className="secondary"
        style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, padding: '5px 10px',
          background: presets.length > 0 ? 'rgba(103,216,255,.06)' : undefined,
          borderColor: presets.length > 0 ? 'rgba(103,216,255,.25)' : undefined,
          color: presets.length > 0 ? 'var(--accent)' : 'var(--muted)',
        }}
        title="Load a saved preset"
      >
        <BookMarked size={11} />
        {presets.length > 0 ? `${presets.length} preset${presets.length > 1 ? 's' : ''}` : 'Presets'}
        <ChevronDown size={10} />
      </button>

      {showSave && (
        <SaveDialog onSave={handleSave} onClose={() => setShowSave(false)} />
      )}
      {showLoad && (
        <PresetsDropdown
          presets={presets}
          onLoad={p => onLoad(p.content)}
          onDelete={handleDelete}
          onClose={() => setShowLoad(false)}
        />
      )}
    </div>
  );
}
