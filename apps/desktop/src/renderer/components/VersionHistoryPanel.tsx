import { useState, useEffect } from 'react';
import { Check, ChevronRight, Clock, RotateCcw, Tag, Trash2, X, Zap } from 'lucide-react';
import { GenerationVersion, deleteVersion, readVersions, renameVersion } from '../hooks/useVersionHistory';

const ENGINE_COLORS: Record<string, { fg: string; bg: string; border: string }> = {
  illustrator:   { fg: 'var(--eng-illo)',  bg: 'var(--eng-illo-bg)',  border: 'var(--eng-illo-bd)'  },
  indesign:      { fg: 'var(--eng-indd)',  bg: 'var(--eng-indd-bg)',  border: 'var(--eng-indd-bd)'  },
  canva:         { fg: 'var(--eng-canva)', bg: 'var(--eng-canva-bg)', border: 'var(--eng-canva-bd)' },
  adobe_express: { fg: 'var(--eng-expr)',  bg: 'var(--eng-expr-bg)',  border: 'var(--eng-expr-bd)'  },
  figma:         { fg: 'var(--eng-figma)', bg: 'var(--eng-figma-bg)', border: 'var(--eng-figma-bd)' },
};
const ENGINE_LABELS: Record<string, string> = {
  illustrator: 'ILLO', indesign: 'INDD', canva: 'Canva',
  adobe_express: 'Express', figma: 'Figma',
};

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)  return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(ts).toLocaleDateString();
}

function EngineChip({ engine, result }: { engine: string; result: GenerationVersion['engines'][string] }) {
  const ec   = ENGINE_COLORS[engine];
  const ok   = result.status === 'done';
  const skip = result.status === 'skipped';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 99,
      background: ok ? (ec?.bg ?? 'var(--surface-dim)') : skip ? 'var(--surface-dim)' : 'rgba(201,60,60,.08)',
      outline:    `1px solid ${ok ? (ec?.border ?? 'var(--border-subtle)') : skip ? 'var(--border-subtle)' : 'rgba(201,60,60,.3)'}`,
      color:      ok ? (ec?.fg ?? 'var(--muted)') : skip ? 'var(--muted)' : 'var(--red)',
      opacity:    skip ? .45 : 1,
    }}>
      {ok && <Check size={8} strokeWidth={3}/>}
      {ENGINE_LABELS[engine] ?? engine}
    </span>
  );
}

interface VersionCardProps {
  v: GenerationVersion;
  brandId: string;
  isLatest: boolean;
  onRestore: (v: GenerationVersion) => void;
  onDeleted: () => void;
}

function VersionCard({ v, brandId, isLatest, onRestore, onDeleted }: VersionCardProps) {
  const [expanded,  setExpanded]  = useState(false);
  const [editing,   setEditing]   = useState(false);
  const [labelVal,  setLabelVal]  = useState(v.label ?? '');
  const [confirmDel, setConfirmDel] = useState(false);

  const successEngines = Object.entries(v.engines).filter(([, r]) => r.status === 'done');
  const errorEngines   = Object.entries(v.engines).filter(([, r]) => r.status === 'error');

  function saveLabel() {
    renameVersion(brandId, v.id, labelVal.trim());
    setEditing(false);
  }

  function handleDelete() {
    if (!confirmDel) { setConfirmDel(true); return; }
    deleteVersion(brandId, v.id);
    onDeleted();
  }

  return (
    <div style={{
      borderRadius: 12, overflow: 'hidden',
      background: isLatest ? 'rgba(79,134,240,.05)' : 'rgba(128,128,128,.04)',
      outline: `1px solid ${isLatest ? 'rgba(79,134,240,.22)' : 'rgba(128,128,128,.12)'}`,
      marginBottom: 8,
    }}>
      {/* Header row */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', cursor: 'pointer' }}
      >
        {/* Version badge */}
        <div style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          background: isLatest ? 'rgba(79,134,240,.15)' : 'rgba(128,128,128,.1)',
          outline: `1px solid ${isLatest ? 'rgba(79,134,240,.3)' : 'rgba(128,128,128,.18)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 800, color: isLatest ? 'var(--accent)' : 'var(--muted)',
          letterSpacing: '-.01em',
        }}>
          v{v.versionNum}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Label / name row */}
          {editing ? (
            <input
              autoFocus
              value={labelVal}
              onChange={e => setLabelVal(e.target.value)}
              onBlur={saveLabel}
              onKeyDown={e => { if (e.key === 'Enter') saveLabel(); if (e.key === 'Escape') setEditing(false); }}
              onClick={e => e.stopPropagation()}
              placeholder="Add a label…"
              style={{
                width: '100%', background: 'var(--panel2)', border: '1px solid var(--accent)',
                borderRadius: 5, padding: '2px 6px', fontSize: 12, color: 'var(--text)',
                outline: 'none', fontFamily: 'inherit',
              }}
            />
          ) : (
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {v.label || v.outputName || `Generation v${v.versionNum}`}
            </div>
          )}
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock size={9}/>
            {timeAgo(v.createdAt)}
            {isLatest && (
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.05em', padding: '1px 5px', borderRadius: 99, background: 'rgba(79,134,240,.15)', color: 'var(--accent)' }}>LATEST</span>
            )}
          </div>
        </div>

        {/* Engine dots summary */}
        <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
          {successEngines.slice(0, 5).map(([eng]) => (
            <div key={eng} style={{ width: 7, height: 7, borderRadius: '50%', background: ENGINE_COLORS[eng]?.fg ?? 'var(--muted)' }}/>
          ))}
          {errorEngines.length > 0 && (
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--red)' }}/>
          )}
        </div>

        <ChevronRight size={13} style={{ color: 'var(--muted)', transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform .15s', flexShrink: 0 }}/>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: '0 14px 14px', borderTop: '1px solid rgba(128,128,128,.1)' }}>

          {/* Engine chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, margin: '12px 0 10px' }}>
            {Object.entries(v.engines).map(([eng, res]) => (
              <EngineChip key={eng} engine={eng} result={res}/>
            ))}
          </div>

          {/* Brief snippet */}
          {v.brief && (
            <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 12, padding: '8px 10px', borderRadius: 8, background: 'rgba(128,128,128,.06)', outline: '1px solid rgba(128,128,128,.1)' }}>
              "{v.brief.length > 180 ? v.brief.slice(0, 180) + '…' : v.brief}"
            </div>
          )}

          {/* Error details */}
          {errorEngines.length > 0 && (
            <div style={{ fontSize: 11, color: 'var(--red)', marginBottom: 10 }}>
              {errorEngines.map(([eng, r]) => (
                <div key={eng}>✗ {ENGINE_LABELS[eng]}: {r.error || 'Failed'}</div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              onClick={e => { e.stopPropagation(); onRestore(v); }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700,
                padding: '5px 12px', borderRadius: 7, cursor: 'pointer', border: 'none',
                background: 'rgba(79,134,240,.12)', outline: '1.5px solid rgba(79,134,240,.35)', color: 'var(--accent)',
              }}
            >
              <RotateCcw size={11}/> Restore fields
            </button>
            <button
              onClick={e => { e.stopPropagation(); setEditing(true); setLabelVal(v.label ?? ''); }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, padding: '5px 10px', borderRadius: 7, cursor: 'pointer', border: 'none', background: 'rgba(128,128,128,.08)', outline: '1px solid rgba(128,128,128,.15)', color: 'var(--muted)' }}
            >
              <Tag size={10}/> {v.label ? 'Rename' : 'Label'}
            </button>
            <div style={{ flex: 1 }}/>
            {confirmDel ? (
              <button onClick={e => { e.stopPropagation(); handleDelete(); }}
                style={{ fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 7, cursor: 'pointer', border: 'none', background: 'rgba(201,60,60,.12)', outline: '1.5px solid rgba(201,60,60,.4)', color: 'var(--red)' }}>
                Confirm?
              </button>
            ) : (
              <button onClick={e => { e.stopPropagation(); handleDelete(); }}
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 7, padding: 0, cursor: 'pointer', border: 'none', background: 'rgba(128,128,128,.07)', outline: '1px solid rgba(128,128,128,.14)', color: 'var(--muted)' }}>
                <Trash2 size={12}/>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Panel ──────────────────────────────────────────────────────────────────────

interface VersionHistoryPanelProps {
  open: boolean;
  onClose: () => void;
  brandId: string | null;
  onRestore: (v: GenerationVersion) => void;
}

export function VersionHistoryPanel({ open, onClose, brandId, onRestore }: VersionHistoryPanelProps) {
  const [versions, setVersions] = useState<GenerationVersion[]>([]);

  useEffect(() => {
    if (open && brandId) setVersions(readVersions(brandId));
  }, [open, brandId]);

  function refresh() {
    if (brandId) setVersions(readVersions(brandId));
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,.25)', backdropFilter: 'blur(2px)' }}/>

      {/* Slide-in panel */}
      <div style={{
        position: 'fixed', top: 48, right: 0, bottom: 0, zIndex: 201,
        width: 360, background: 'var(--panel)', borderLeft: '1px solid var(--line)',
        display: 'flex', flexDirection: 'column',
        boxShadow: '-8px 0 32px rgba(0,0,0,.2)',
        animation: 'slideInRight .18s ease both',
      }}>
        <style>{`@keyframes slideInRight{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
          <Clock size={15} style={{ color: 'var(--accent)', flexShrink: 0 }}/>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Version History</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
              {versions.length} generation{versions.length !== 1 ? 's' : ''} saved
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}>
            <X size={15}/>
          </button>
        </div>

        {/* Version list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 20px' }}>
          {versions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--muted)' }}>
              <Zap size={32} style={{ opacity: .2, marginBottom: 12 }}/>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, opacity: .6 }}>No versions yet</div>
              <div style={{ fontSize: 12, lineHeight: 1.5, opacity: .45 }}>
                Every time you generate files, a snapshot is saved here automatically.
              </div>
            </div>
          ) : (
            versions.map((v, i) => (
              <VersionCard
                key={v.id}
                v={v}
                brandId={brandId!}
                isLatest={i === 0}
                onRestore={version => { onRestore(version); onClose(); }}
                onDeleted={refresh}
              />
            ))
          )}
        </div>

        {/* Footer hint */}
        {versions.length > 0 && (
          <div style={{ padding: '12px 18px', borderTop: '1px solid var(--line)', fontSize: 11, color: 'var(--muted)', lineHeight: 1.5, flexShrink: 0, opacity: .6 }}>
            Restore loads the brief and field values from that version back into the form.
          </div>
        )}
      </div>
    </>
  );
}
