import { useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, RefreshCw, Sparkles, X } from 'lucide-react';

const DESIGN_TYPES = [
  { value: 'flyer',           label: 'Flyer' },
  { value: 'poster',          label: 'Poster' },
  { value: 'instagram_post',  label: 'Instagram Post' },
  { value: 'facebook_post',   label: 'Facebook Post' },
  { value: 'twitter_post',    label: 'Twitter/X Post' },
  { value: 'linkedin_post',   label: 'LinkedIn Post' },
  { value: 'your_story',      label: 'Story (IG/FB)' },
  { value: 'presentation',    label: 'Presentation' },
  { value: 'report',          label: 'Report' },
  { value: 'proposal',        label: 'Proposal' },
  { value: 'document',        label: 'Document' },
  { value: 'email',           label: 'Email' },
  { value: 'infographic',     label: 'Infographic' },
];

interface Candidate {
  candidateId: string;
  jobId?: string;
  url: string;
  thumbnailUrl: string | null;
}

interface CanvaGeneratePanelProps {
  disabled?: boolean;
}

export function CanvaGeneratePanel({ disabled }: CanvaGeneratePanelProps) {
  const [open, setOpen]             = useState(false);
  const [query, setQuery]           = useState('');
  const [designType, setDesignType] = useState('flyer');
  const [brandKits, setBrandKits]   = useState<Array<{ id: string; name: string }>>([]);
  const [selectedKit, setSelectedKit] = useState('');
  const [kitsLoaded, setKitsLoaded] = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  // Per-candidate save state: null | 'saving' | { editUrl } | 'error_...'
  const [saves, setSaves]           = useState<Record<string, any>>({});

  // Fetch brand kits when panel first opens
  useEffect(() => {
    if (!open || kitsLoaded) return;
    window.creativePlatform.listCanvaBrandKits?.().then((res: any) => {
      if (res?.ok && res.kits?.length) {
        setBrandKits(res.kits);
        setSelectedKit(res.kits[0].id);
      }
      setKitsLoaded(true);
    }).catch(() => setKitsLoaded(true));
  }, [open, kitsLoaded]);

  async function generate() {
    if (!query.trim()) return;
    setLoading(true); setError(null); setCandidates([]); setSaves({});
    try {
      const res = await window.creativePlatform.generateCanvaDesign({
        query: query.trim(),
        designType,
        brandKitId: selectedKit || undefined,
      });
      if (res.ok && res.candidates?.length) {
        setCandidates(res.candidates);
      } else {
        setError(res.message || 'No designs returned.');
      }
    } catch (e: any) {
      setError(e.message || 'Unexpected error.');
    } finally {
      setLoading(false);
    }
  }

  async function save(c: Candidate) {
    if (!c.jobId || !c.candidateId) {
      setSaves(s => ({ ...s, [c.candidateId]: 'error' }));
      return;
    }
    setSaves(s => ({ ...s, [c.candidateId]: 'saving' }));
    try {
      const res = await window.creativePlatform.saveCanvaDesign({
        jobId: c.jobId,
        candidateId: c.candidateId,
      });
      if (res.ok) {
        setSaves(s => ({ ...s, [c.candidateId]: { editUrl: res.editUrl } }));
        if (res.editUrl) await window.creativePlatform.openCanvaDesign(res.editUrl);
      } else {
        setSaves(s => ({ ...s, [c.candidateId]: 'error_' + (res.message || 'Save failed') }));
      }
    } catch (e: any) {
      setSaves(s => ({ ...s, [c.candidateId]: 'error_' + (e.message || 'Error') }));
    }
  }

  return (
    <div style={{
      borderRadius: 12, marginBottom: 14,
      border: open ? '1px solid rgba(160,110,255,.35)' : '1px solid rgba(160,110,255,.18)',
      background: open ? 'rgba(160,110,255,.05)' : 'rgba(160,110,255,.03)',
      transition: 'border-color .15s, background .15s',
      overflow: 'hidden',
    }}>
      {/* Toggle header */}
      <button
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px', background: 'transparent', border: 'none',
          color: 'var(--text)', cursor: 'pointer',
        }}
        onClick={() => { setOpen(o => !o); setError(null); }}
        disabled={disabled}
      >
        <Sparkles size={14} style={{ color: 'rgba(160,110,255,1)', flexShrink: 0 }} />
        <span style={{ fontWeight: 700, fontSize: 13, flex: 1, textAlign: 'left', color: 'rgba(160,110,255,1)' }}>
          Generate New Design with AI
        </span>
        {candidates.length > 0 && (
          <span style={{ fontSize: 11, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <CheckCircle2 size={11} /> {candidates.length} candidates
          </span>
        )}
        <span style={{ color: 'var(--muted)', fontSize: 18, lineHeight: 1 }}>{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div style={{ padding: '0 14px 16px' }}>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
            Describe what you want — Canva AI generates four design candidates using your brand kit. Pick one to save as an editable design.
          </p>

          {/* Prompt */}
          <div style={{ position: 'relative' }}>
            <textarea
              className="field-input"
              rows={3}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={`e.g. "A case study flyer for ClinPath Systems — reduced lab errors by 68%, cut costs by 40%. Dark background, professional life sciences feel."`}
              disabled={disabled || loading}
              style={{ resize: 'vertical', minHeight: 72, paddingRight: 32 }}
            />
            {query && (
              <button
                style={{ position: 'absolute', top: 8, right: 8, background: 'none', border: 'none', padding: 4, color: 'var(--muted)', cursor: 'pointer', borderRadius: 4 }}
                onClick={() => { setQuery(''); setError(null); setCandidates([]); }}
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Design type + brand kit row */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
            <select
              className="field-input"
              value={designType}
              onChange={e => setDesignType(e.target.value)}
              disabled={disabled || loading}
              style={{ fontSize: 12, flex: '0 0 auto' }}
            >
              {DESIGN_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>

            {brandKits.length > 0 ? (
              <select
                className="field-input"
                value={selectedKit}
                onChange={e => setSelectedKit(e.target.value)}
                disabled={disabled || loading}
                style={{ fontSize: 12, flex: 1, minWidth: 120 }}
              >
                <option value="">No brand kit</option>
                {brandKits.map(k => (
                  <option key={k.id} value={k.id}>{k.name}</option>
                ))}
              </select>
            ) : kitsLoaded ? (
              <span style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>
                No brand kits found — connect Canva to load kits
              </span>
            ) : (
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>Loading brand kits…</span>
            )}
          </div>

          {/* Generate button */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
            <button
              onClick={generate}
              disabled={disabled || loading || !query.trim()}
              style={{ fontSize: 13, padding: '8px 18px', background: 'rgba(160,110,255,.15)', borderColor: 'rgba(160,110,255,.4)', color: 'rgba(190,150,255,1)' }}
            >
              {loading
                ? <><RefreshCw size={13} className="spin" /> Generating…</>
                : <><Sparkles size={13} /> Generate Designs</>
              }
            </button>
            {candidates.length > 0 && (
              <button className="secondary" style={{ fontSize: 12, padding: '8px 14px' }} onClick={generate} disabled={loading}>
                <RefreshCw size={12} /> Regenerate
              </button>
            )}
            <span style={{ fontSize: 11, color: 'var(--muted)', flex: 1, textAlign: 'right' }}>
              Powered by Canva AI
            </span>
          </div>

          {/* Error */}
          {error && (
            <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, fontSize: 12, background: 'rgba(255,116,116,.08)', border: '1px solid rgba(255,116,116,.25)', color: 'var(--red)' }}>
              {error}
            </div>
          )}

          {/* Candidate grid */}
          {candidates.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <p style={{ fontSize: 11, color: 'var(--muted)', margin: '0 0 10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                Generated Candidates — pick one to save
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                {candidates.map((c, i) => {
                  const saveState = saves[c.candidateId];
                  const saved = saveState && typeof saveState === 'object';
                  const saving = saveState === 'saving';
                  const saveErr = typeof saveState === 'string' && saveState.startsWith('error');

                  return (
                    <div key={c.candidateId} style={{
                      borderRadius: 8, overflow: 'hidden',
                      border: saved ? '1px solid rgba(117,245,174,.4)' : '1px solid var(--border-subtle)',
                      background: 'var(--surface-dim)',
                    }}>
                      {/* Thumbnail */}
                      <div style={{ position: 'relative', paddingBottom: '70%', background: 'var(--surface-emph)' }}>
                        {c.thumbnailUrl ? (
                          <img
                            src={c.thumbnailUrl}
                            alt={`Candidate ${i + 1}`}
                            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : (
                          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Sparkles size={28} style={{ color: 'var(--muted)', opacity: .3 }} />
                          </div>
                        )}
                        <span style={{ position: 'absolute', top: 6, left: 6, fontSize: 10, background: 'rgba(0,0,0,.55)', color: '#fff', padding: '2px 6px', borderRadius: 4 }}>
                          {i + 1}
                        </span>
                      </div>

                      {/* Actions */}
                      <div style={{ padding: '8px 10px', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        <button
                          className="secondary"
                          style={{ fontSize: 11, padding: '4px 9px' }}
                          onClick={() => window.creativePlatform.openCanvaDesign(c.url)}
                        >
                          <ExternalLink size={10} /> Preview
                        </button>

                        {saved ? (
                          <button
                            className="secondary"
                            style={{ fontSize: 11, padding: '4px 9px', color: 'var(--green)', borderColor: 'rgba(117,245,174,.35)' }}
                            onClick={() => saveState?.editUrl && window.creativePlatform.openCanvaDesign(saveState.editUrl)}
                          >
                            <CheckCircle2 size={10} /> Open in Canva
                          </button>
                        ) : (
                          <button
                            style={{ fontSize: 11, padding: '4px 9px' }}
                            disabled={saving || !c.jobId}
                            onClick={() => save(c)}
                            title={!c.jobId ? 'No job ID — cannot save this candidate' : 'Save this design to your Canva account'}
                          >
                            {saving ? <><RefreshCw size={10} className="spin" /> Saving…</> : 'Save & Open'}
                          </button>
                        )}

                        {saveErr && (
                          <span style={{ fontSize: 10, color: 'var(--red)' }}>
                            {saveState.replace('error_', '')}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
