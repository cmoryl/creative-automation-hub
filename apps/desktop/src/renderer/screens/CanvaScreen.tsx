import { useEffect, useRef, useState } from 'react';
import { usePlatformStore } from '../state/usePlatformStore';
import { CheckCircle2, ChevronDown, ChevronRight, ExternalLink, FolderOpen, ImagePlus, KeyRound, RefreshCw, RotateCcw, Sparkles, Upload, XCircle } from 'lucide-react';
import { Tooltip } from '../components/Tooltip';
import { ClaudeBriefPanel } from '../components/ClaudeBriefPanel';
import { CanvaGeneratePanel } from '../components/CanvaGeneratePanel';
import { ExportPreviewModal } from '../components/ExportPreviewModal';
import { ContentPresets } from '../components/ContentPresets';

const DEMO_DEFAULTS = {
  title: 'From Complexity to Clarity: TransPerfect Life Sciences',
  challenge:
    'Limited global reach affecting client growth\nComplex regulatory compliance across regions\nInefficient communication slowing project timelines',
  solution:
    'Implemented innovative translation technologies\nStreamlined project management processes\nEnhanced client engagement through tailored strategies',
  results:
    'Increased market access by 30% within a year\nImproved compliance accuracy significantly\nReduced project timelines by 25%',
  testimonial: '"TransPerfect helped us cut regulatory submission time in half while expanding into three new markets simultaneously."',
  testimonialAttribution: 'Jane Smith\nVP Clinical Operations\nBioNovate Therapeutics',
  challengeHeader: 'Challenge',
  solutionHeader: 'Proposed Solutions',
  resultsHeader: 'Results Achieved',
  tagline: 'Lab to Launch. Practitioner to Patient.',
  website: 'lifesciences.transperfect.com',
  email: 'lifesciences@transperfect.com',
  outputName: 'demo_case_study_v001',
};

const FIELD_MAP: Array<{
  key: string;
  label: string;
  required: boolean;
  tall: boolean;
  placeholder: string;
  mapsTo: string;
  type?: 'text' | 'image';
}> = [
  { key: 'imageHero',       label: 'Hero Image',          required: false, tall: false, placeholder: '',                           mapsTo: 'IMAGE_HERO',  type: 'image' },
  { key: 'title',           label: 'Title *',            required: true,  tall: false, placeholder: 'Case study headline',         mapsTo: 'TEXT_TITLE' },
  { key: 'challenge',       label: 'Challenge *',         required: true,  tall: true,  placeholder: 'Key challenges faced...',     mapsTo: 'TEXT_CHALLENGE' },
  { key: 'solution',        label: 'Solution *',          required: true,  tall: true,  placeholder: 'How they were addressed...',  mapsTo: 'TEXT_SOLUTION' },
  { key: 'results',         label: 'Results *',           required: true,  tall: true,  placeholder: 'Measurable outcomes...',      mapsTo: 'TEXT_RESULTS' },
  { key: 'testimonial',            label: 'Testimonial Quote',      required: false, tall: true,  placeholder: '"Quote from client..."',            mapsTo: 'TEXT_TESTIMONIAL' },
  { key: 'testimonialAttribution', label: 'Attribution',            required: false, tall: true,  placeholder: 'Name\nTitle\nCompany',               mapsTo: 'TEXT_TESTIMONIAL_ATTRIBUTION' },
  { key: 'challengeHeader',        label: 'Challenge Header',       required: false, tall: false, placeholder: 'Challenge',                          mapsTo: 'TEXT_CHALLENGE_HEADER' },
  { key: 'solutionHeader',         label: 'Solution Header',        required: false, tall: false, placeholder: 'Proposed Solutions',                 mapsTo: 'TEXT_SOLUTION_HEADER' },
  { key: 'resultsHeader',          label: 'Results Header',         required: false, tall: false, placeholder: 'Results Achieved',                   mapsTo: 'TEXT_RESULTS_HEADER' },
  { key: 'tagline',                label: 'Footer Tagline',         required: false, tall: false, placeholder: 'Lab to Launch. Practitioner to Patient.', mapsTo: 'TEXT_TAGLINE' },
  { key: 'website',                label: 'Footer Website',         required: false, tall: false, placeholder: 'lifesciences.transperfect.com',       mapsTo: 'TEXT_WEBSITE' },
  { key: 'email',                  label: 'Footer Email',           required: false, tall: false, placeholder: 'lifesciences@transperfect.com',       mapsTo: 'TEXT_EMAIL' },
  { key: 'outputName',             label: 'Output Name',            required: false, tall: false, placeholder: 'e.g. demo_case_study_v001',           mapsTo: '' },
];

type FormState = Record<string, string>;

function buildContent(form: FormState): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of FIELD_MAP) {
    if (f.mapsTo && f.type !== 'image' && form[f.key]?.trim()) out[f.mapsTo] = form[f.key].trim();
  }
  return out;
}

interface ImageFieldState {
  url: string;
  assetId: string | null;
  fileName: string | null;
  uploading: boolean;
  preview: string | null; // data URL for local preview
}

function ImageField({
  mapsTo, label, selectedMeta, value, onChange
}: {
  mapsTo: string; label: string; selectedMeta: any;
  value: ImageFieldState; onChange: (v: ImageFieldState) => void;
}) {
  const urlInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const obj = selectedMeta?.manifest?.editable_objects?.[mapsTo];
  const hasElementId = !!obj?.element_id;

  async function pickFile() {
    setUploadError(null);
    const r = await window.creativePlatform.pickAndUploadCanvaAsset();
    if ((r as any).cancelled) return;
    if ((r as any).ok) {
      onChange({ ...value, assetId: (r as any).assetId, fileName: (r as any).fileName, url: '', preview: null, uploading: false });
    } else {
      setUploadError((r as any).message || 'Upload failed');
    }
  }

  function onUrlChange(url: string) {
    onChange({ ...value, url, assetId: null, fileName: null, preview: null });
  }

  const isSet = !!(value.assetId || value.url);

  return (
    <div className="field-group">
      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <ImagePlus size={13} style={{ color: 'var(--muted)' }} />
        {label}
        <code style={{ fontSize: 10, color: 'var(--muted)', background: 'var(--surface-mid)', padding: '1px 5px', borderRadius: 3 }}>{mapsTo}</code>
        {hasElementId
          ? <Tooltip text="Element ID registered — automated image injection is enabled for this slot" delay={200}><span style={{ fontSize: 10, color: 'var(--green)', marginLeft: 4 }}>mapped</span></Tooltip>
          : <Tooltip text="No Canva element ID configured — image injection is disabled until an element ID is added" delay={200}><span style={{ fontSize: 10, color: 'var(--yellow)', marginLeft: 4 }}>⚠ element ID not set</span></Tooltip>
        }
      </label>

      {!hasElementId && (
        <ElementIdSetup templateId={selectedMeta?.id} field={mapsTo} onSaved={() => {/* refresh handled by parent */}} />
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: hasElementId ? 0 : 8 }}>
        <div style={{
          width: 64, height: 64, borderRadius: 8, flexShrink: 0,
          background: 'var(--surface-emph)', border: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        }}>
          {value.url
            ? <img src={value.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={() => {}} />
            : value.assetId
              ? <span style={{ fontSize: 9, color: 'var(--green)', textAlign: 'center', padding: 4 }}>✓ uploaded</span>
              : <ImagePlus size={22} style={{ color: 'var(--muted)', opacity: .3 }} />
          }
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Tooltip text="Public image URL as an alternative to uploading a local file — must be publicly accessible to Canva" display="block">
            <input
              ref={urlInputRef}
              className="field-input"
              style={{ fontSize: 12, width: '100%', boxSizing: 'border-box' }}
              value={value.assetId ? '' : value.url}
              placeholder="https://… image URL"
              onChange={e => onUrlChange(e.target.value)}
              disabled={!!value.assetId}
            />
          </Tooltip>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <Tooltip text="Pick a local image and upload it to your Canva Assets library" delay={200}>
              <button className="secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={pickFile}>
                <Upload size={11} /> Pick & Upload
              </button>
            </Tooltip>
            {isSet && (
              <>
                {value.assetId && <code style={{ fontSize: 10, color: 'var(--accent)' }}>{value.assetId.slice(0, 16)}…</code>}
                {value.fileName && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{value.fileName}</span>}
                <button className="secondary" style={{ fontSize: 10, padding: '3px 8px' }}
                  onClick={() => onChange({ url: '', assetId: null, fileName: null, uploading: false, preview: null })}>
                  Clear
                </button>
              </>
            )}
          </div>
          {uploadError && (
            <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--red)' }}>{uploadError}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ElementIdSetup({ templateId, field, onSaved }: { templateId?: string; field: string; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [elementId, setElementId] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!elementId.trim() || !templateId) return;
    setSaving(true);
    try {
      await window.creativePlatform.updateCanvaMapping({ templateId, fieldMappings: { [field]: elementId.trim() } });
      setEditing(false);
      setElementId('');
      onSaved();
    } finally { setSaving(false); }
  }

  if (!editing) return (
    <button className="secondary" style={{ fontSize: 11, padding: '4px 10px', marginBottom: 6 }}
      onClick={() => setEditing(true)}>
      Set element ID to enable
    </button>
  );

  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
      <input className="field-input" style={{ fontSize: 11, flex: 1 }} value={elementId}
        onChange={e => setElementId(e.target.value)}
        placeholder="Paste Canva element ID from your design…"
        onKeyDown={e => e.key === 'Enter' && save()} />
      <button style={{ fontSize: 11, padding: '5px 10px', flexShrink: 0 }} onClick={save} disabled={saving || !elementId.trim()}>
        {saving ? <RefreshCw size={11} className="spin" /> : 'Save'}
      </button>
      <button className="secondary" style={{ fontSize: 11, padding: '5px 8px', flexShrink: 0 }} onClick={() => setEditing(false)}>✕</button>
    </div>
  );
}

function MappingBadge({ mapsTo }: { mapsTo: string }) {
  if (!mapsTo) return null;
  return (
    <code style={{ fontSize: 10, color: 'var(--muted)', background: 'var(--surface-mid)', padding: '1px 5px', borderRadius: 3, marginLeft: 6 }}>
      {mapsTo}
    </code>
  );
}

export function CanvaScreen() {
  const pendingFill = usePlatformStore(s => s.pendingFill?.['canva']);
  const clearPendingFill = usePlatformStore(s => s.clearPendingFill);
  const activeBrand = usePlatformStore(s => s.activeBrand);
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [form, setForm] = useState<FormState>(DEMO_DEFAULTS);
  const [images, setImages] = useState<Record<string, ImageFieldState>>({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [showMapping, setShowMapping] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [thumbUrl, setThumbUrl]       = useState<string | null>(null);

  // Credential / OAuth management
  const [creds, setCreds] = useState<any>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [manualToken, setManualToken] = useState('');
  const [oauthState, setOauthState] = useState<'idle' | 'waiting' | 'done' | 'error'>('idle');
  const [oauthMsg, setOauthMsg] = useState('');
  const [saving, setSaving] = useState(false);

  async function refreshCreds() {
    const r = await window.creativePlatform.getCanvaCredentials();
    setCreds(r);
  }

  useEffect(() => {
    if (!pendingFill) return;
    setForm(f => ({ ...f, ...pendingFill }));
    clearPendingFill('canva');
  }, [pendingFill]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedTemplate) return;
    setThumbUrl(null);
    window.creativePlatform.getTemplateThumbnail(selectedTemplate).then((r: any) => {
      if (r?.ok && r.thumbnailUrl) setThumbUrl(r.thumbnailUrl);
    });
  }, [selectedTemplate]);

  useEffect(() => {
    window.creativePlatform.listTemplates().then((all: any[]) => {
      const canva = (all || []).filter((t: any) => t.isCanva);
      setTemplates(canva);
      if (canva.length > 0) setSelectedTemplate(t => t || canva[0].id);
    });
    refreshCreds();
  }, []);

  // Reset form when template changes so previous content doesn't bleed into a new template;
  // absorb any pending Claude fill on top of the reset so the fill isn't wiped.
  useEffect(() => {
    if (!selectedTemplate) return;
    const fill = usePlatformStore.getState().pendingFill?.['canva'];
    setForm(fill ? { ...DEMO_DEFAULTS, ...fill } : DEMO_DEFAULTS);
    if (fill) clearPendingFill('canva');
  }, [selectedTemplate]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveCustomCredentials() {
    if (!clientId.trim() || !clientSecret.trim()) return;
    setSaving(true);
    try {
      await window.creativePlatform.setCanvaCredentials(clientId.trim(), clientSecret.trim());
      await refreshCreds();
    } finally { setSaving(false); }
  }

  async function startOAuth() {
    setOauthState('waiting');
    setOauthMsg('Browser opened — authorize in Canva, then return here…');
    try {
      const r = await window.creativePlatform.startCanvaOAuth();
      if (r.ok) {
        setOauthState('done');
        setOauthMsg('Connected! Token saved and auto-refresh is active.');
        setShowAdvanced(false);
        await refreshCreds();
      } else {
        setOauthState('error');
        setOauthMsg(r.message || 'OAuth failed.');
      }
    } catch (e: any) {
      setOauthState('error');
      setOauthMsg(e.message || 'Unexpected error.');
    }
  }

  async function saveManualToken() {
    if (!manualToken.trim()) return;
    setSaving(true);
    try {
      await window.creativePlatform.setCanvaToken(manualToken.trim());
      setManualToken('');
      setShowAdvanced(false);
      await refreshCreds();
    } finally { setSaving(false); }
  }

  // Compute expiry label
  const expiryLabel = (() => {
    if (!creds?.expiresAt) return null;
    const secs = Math.round((creds.expiresAt - Date.now()) / 1000);
    if (secs <= 0) return 'Expired';
    if (secs < 60) return `Expires in ${secs}s`;
    if (secs < 3600) return `Expires in ${Math.round(secs / 60)}m`;
    return `Expires in ${Math.round(secs / 3600)}h`;
  })();

  function setField(key: string, value: string) {
    setForm(f => ({ ...f, [key]: value }));
    setResult(null);
  }

  function setImageField(key: string, value: ImageFieldState) {
    setImages(prev => ({ ...prev, [key]: value }));
    setResult(null);
  }

  function getImageState(key: string): ImageFieldState {
    return images[key] ?? { url: '', assetId: null, fileName: null, uploading: false, preview: null };
  }

  function loadDefaults() {
    setForm(DEMO_DEFAULTS);
    setImages({});
    setResult(null);
  }

  async function runJob() {
    setLoading(true);
    setResult(null);
    try {
      // Build image payload (only fields with assetId or url set)
      const imagePayload: Record<string, { assetId?: string; url?: string }> = {};
      for (const f of FIELD_MAP.filter(f => f.type === 'image')) {
        const img = getImageState(f.key);
        if (img.assetId) imagePayload[f.mapsTo] = { assetId: img.assetId };
        else if (img.url.trim()) imagePayload[f.mapsTo] = { url: img.url.trim() };
      }
      const r = await window.creativePlatform.runCanvaJob({
        templateId: selectedTemplate,
        content: buildContent(form),
        images: imagePayload,
      });
      setResult(r);
    } finally {
      setLoading(false);
    }
  }

  const selectedMeta = templates.find(t => t.id === selectedTemplate);
  const canRun = !!selectedMeta && FIELD_MAP.filter(f => f.required).every(f => form[f.key]?.trim());

  return (
    <div className="dashboard">

      {/* Canva API connection panel */}
      <section className="panel" style={{ padding: '16px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <KeyRound size={16} style={{ color: 'var(--muted)', flexShrink: 0 }} />
          <span style={{ fontWeight: 700, fontSize: 13 }}>Canva API</span>

          {creds === null ? (
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Loading…</span>
          ) : creds.hasToken ? (
            <>
              <Tooltip text="Connected — API autofill is active" delay={150}>
                <CheckCircle2 size={14} style={{ color: 'var(--green)' }} />
              </Tooltip>
              <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>Connected</span>
              <code style={{ fontSize: 11, color: 'var(--muted)' }}>{creds.masked}</code>
              {creds.hasRefreshToken && (
                <Tooltip text="OAuth refresh token present — access token renews automatically before expiry" delay={150}>
                  <span style={{ fontSize: 11, color: 'var(--accent)', background: 'rgba(103,216,255,.1)', borderRadius: 99, padding: '2px 8px' }}>
                    <RotateCcw size={10} style={{ marginRight: 4, verticalAlign: 'middle' }} />auto-refresh on
                  </span>
                </Tooltip>
              )}
              {expiryLabel && (
                <Tooltip text="Time until the current access token expires — auto-renewed if a refresh token is present" delay={150}>
                  <span style={{ fontSize: 11, color: expiryLabel.startsWith('Expired') ? 'var(--red)' : 'var(--muted)' }}>{expiryLabel}</span>
                </Tooltip>
              )}
            </>
          ) : (
            <>
              <Tooltip text="Not connected — jobs will be saved as handoff files for manual application in Canva" delay={150}>
                <XCircle size={14} style={{ color: 'var(--yellow)' }} />
              </Tooltip>
              <span style={{ fontSize: 12, color: 'var(--yellow)', fontWeight: 600 }}>Not connected</span>
            </>
          )}

          {/* Primary connect / reconnect button */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            {oauthState === 'waiting' ? (
              <>
                <span style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <RefreshCw size={12} className="spin" /> Waiting for browser…
                </span>
                <button className="secondary" style={{ fontSize: 11, padding: '4px 10px' }}
                  onClick={() => { setOauthState('idle'); setOauthMsg(''); }}>Cancel</button>
              </>
            ) : (
              <button style={{ fontSize: 12, padding: '5px 14px' }}
                onClick={startOAuth}>
                <ExternalLink size={12} style={{ marginRight: 6 }} />
                {creds?.hasToken ? 'Reconnect' : 'Connect Canva'}
              </button>
            )}
          </div>
        </div>

        {/* Status / error message */}
        {oauthMsg && (
          <p style={{ margin: '10px 0 0', fontSize: 12, color: oauthState === 'done' ? 'var(--green)' : oauthState === 'error' ? 'var(--red)' : 'var(--muted)' }}>
            {oauthMsg}
            {(oauthState === 'done' || oauthState === 'error') && (
              <button className="secondary" style={{ fontSize: 11, padding: '2px 8px', marginLeft: 10 }}
                onClick={() => { setOauthState('idle'); setOauthMsg(''); }}>Dismiss</button>
            )}
          </p>
        )}

        {/* Advanced: custom credentials or manual token */}
        <div style={{ marginTop: 12 }}>
          <button className="secondary" style={{ fontSize: 11, padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 5, color: 'var(--muted)' }}
            onClick={() => setShowAdvanced(v => !v)}>
            {showAdvanced ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            Advanced
          </button>

          {showAdvanced && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Custom OAuth credentials */}
              <div style={{ background: 'var(--bg-subtle, rgba(255,255,255,.04))', borderRadius: 8, padding: '12px 14px' }}>
                <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
                  Override with your own Canva app credentials. Leave blank to use the bundled app.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <div className="field-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: 11 }}>Client ID</label>
                    <input className="field-input" style={{ fontSize: 12 }} value={clientId}
                      onChange={e => setClientId(e.target.value)} placeholder="OAuthClient…" />
                  </div>
                  <div className="field-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: 11 }}>Client Secret</label>
                    <input className="field-input" style={{ fontSize: 12 }} type="password" value={clientSecret}
                      onChange={e => setClientSecret(e.target.value)} placeholder="secret…" />
                  </div>
                </div>
                <button style={{ fontSize: 11 }} disabled={saving || !clientId.trim() || !clientSecret.trim()}
                  onClick={async () => { await saveCustomCredentials(); await startOAuth(); }}>
                  {saving ? <RefreshCw size={11} className="spin" /> : <><ExternalLink size={11} /> Save &amp; Authorize</>}
                </button>
              </div>

              {/* Manual token paste */}
              <div style={{ background: 'var(--bg-subtle, rgba(255,255,255,.04))', borderRadius: 8, padding: '12px 14px' }}>
                <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--muted)' }}>Paste a manual access token (expires periodically).</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="field-input" style={{ flex: 1, fontSize: 12 }} type="password"
                    value={manualToken} onChange={e => setManualToken(e.target.value)}
                    placeholder="Paste access token…" onKeyDown={e => e.key === 'Enter' && saveManualToken()} />
                  <button onClick={saveManualToken} disabled={saving || !manualToken.trim()} style={{ flexShrink: 0, fontSize: 11 }}>
                    {saving ? <RefreshCw size={11} className="spin" /> : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="panel">
        <h2 style={{ margin: '0 0 4px' }}><Sparkles size={20} /> AI Design Generation</h2>
        <p style={{ margin: '0 0 14px', color: 'var(--muted)', fontSize: 13 }}>
          Generate new on-brand Canva designs from a prompt — no template required.
        </p>
        <CanvaGeneratePanel disabled={loading} />
      </section>

      <section className="panel">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0 }}><Sparkles size={22} /> Canva Job Runner</h2>
            <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13 }}>
              Fill content fields — each maps directly to an element ID in the registered Canva template.
            </p>
          </div>
          <Tooltip text="Fill all content fields with sample data to test a job immediately" position="bottom">
            <button className="secondary" style={{ fontSize: 12 }} onClick={loadDefaults}>
              Load Demo Defaults
            </button>
          </Tooltip>
        </div>

        {/* Template selector */}
        <div className="field-group" style={{ marginBottom: 20 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            Template
            {selectedMeta?.canvaUrl && (
              <Tooltip text="Open the registered Canva template in your browser" delay={200}>
                <button className="secondary" style={{ fontSize: 11, padding: '1px 7px' }}
                  onClick={() => window.creativePlatform.openCanvaDesign(selectedMeta.canvaUrl)}>
                  <ExternalLink size={11} /> Open in Canva
                </button>
              </Tooltip>
            )}
          </label>
          <select className="field-input" value={selectedTemplate}
            onChange={e => { setSelectedTemplate(e.target.value); setResult(null); }}>
            {templates.length === 0
              ? <option value="">No Canva templates registered yet</option>
              : templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.id})</option>)
            }
          </select>
          {selectedMeta && (
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
              {selectedMeta.dimensions && <span>{selectedMeta.dimensions} · </span>}
              {selectedMeta.brandKitName && <span>Brand kit: {selectedMeta.brandKitName} · </span>}
              <Tooltip text="Show the mapping between content field keys and their Canva element IDs" delay={200}>
                <span
                  style={{ color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline' }}
                  onClick={() => setShowMapping(m => !m)}>
                  {showMapping ? 'hide' : 'show'} element map
                </span>
              </Tooltip>
            </div>
          )}
        </div>

        {/* Element ID map table */}
        {showMapping && (
          <div style={{ marginBottom: 20, background: 'var(--surface-dim)', borderRadius: 6, padding: '12px 14px', border: '1px solid var(--border-subtle)' }}>
            <p style={{ fontSize: 11, color: 'var(--muted)', margin: '0 0 8px', fontWeight: 600 }}>ELEMENT ID MAP — {selectedTemplate}</p>
            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: 'var(--muted)' }}>
                  <th style={{ textAlign: 'left', padding: '2px 8px 2px 0' }}>Field</th>
                  <th style={{ textAlign: 'left', padding: '2px 0' }}>Element ID</th>
                </tr>
              </thead>
              <tbody>
                {FIELD_MAP.filter(f => f.mapsTo).map(f => {
                  const obj = selectedMeta?.manifest?.editable_objects?.[f.mapsTo];
                  return (
                    <tr key={f.key} style={{ borderTop: '1px solid var(--border-dim)' }}>
                      <td style={{ padding: '3px 8px 3px 0', color: 'var(--fg)' }}>{f.mapsTo}</td>
                      <td style={{ padding: '3px 0', color: obj?.element_id ? 'var(--accent)' : 'var(--red)', fontFamily: 'monospace' }}>
                        {obj?.element_id ?? '— not mapped'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Content fields */}
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 16, marginBottom: 4 }}>
          <p style={{ fontSize: 11, color: 'var(--muted)', margin: '0 0 12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>
            Content Fields
          </p>
        </div>

        <ClaudeBriefPanel
          fields={FIELD_MAP
            .filter(f => f.type !== 'image' && f.mapsTo)
            .map(f => ({ key: f.key, label: f.label.replace(' *', ''), required: f.required, maxChars: f.tall ? 400 : 120 }))}
          engine="canva"
          templateName={selectedMeta?.name}
          brandContext={activeBrand ? { name: activeBrand.name, description: activeBrand.description, guidelines: activeBrand.guidelines, industry: activeBrand.industry } : undefined}
          onFill={content => setForm(f => ({ ...f, ...content }))}
          disabled={loading}
        />

        {FIELD_MAP.map(f => f.type === 'image' ? (
          <ImageField
            key={f.key}
            mapsTo={f.mapsTo}
            label={f.label}
            selectedMeta={selectedMeta}
            value={getImageState(f.key)}
            onChange={v => { setImageField(f.key, v); }}
          />
        ) : (
          <div className="field-group" key={f.key}>
            <label style={{ display: 'flex', alignItems: 'center' }}>
              {f.label}
              <MappingBadge mapsTo={f.mapsTo} />
            </label>
            {f.tall ? (
              <textarea
                className="field-input"
                rows={3}
                value={form[f.key] ?? ''}
                placeholder={f.placeholder}
                onChange={e => setField(f.key, e.target.value)}
              />
            ) : (
              <input
                className="field-input"
                value={form[f.key] ?? ''}
                placeholder={f.placeholder}
                onChange={e => setField(f.key, e.target.value)}
              />
            )}
          </div>
        ))}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
          <ContentPresets
            storageKey={`fields:canva:${selectedTemplate}`}
            content={form}
            onLoad={c => setForm(f => ({ ...f, ...c }))}
            disabled={loading}
          />
        </div>

        <div className="button-row" style={{ marginTop: 0 }}>
          <button className="secondary" onClick={() => setPreviewOpen(true)} disabled={!selectedTemplate}
            style={{ fontSize: 13, padding: '9px 14px' }}>
            👁 Preview
          </button>
          <Tooltip text="Inject content into the Canva template via API (if authenticated) or create a handoff file">
            <button onClick={runJob} disabled={loading || !canRun}>
              {loading ? <RefreshCw size={14} className="spin" /> : <Sparkles size={14} />}
              {loading ? 'Running Job…' : 'Run Canva Job'}
            </button>
          </Tooltip>
          <Tooltip text="Open the Canva outputs folder — contains handoff JSON files" delay={200}>
            <button className="secondary" onClick={() => window.creativePlatform.openPath('canva_outputs')}>
              <FolderOpen size={14} /> Open Canva Outputs
            </button>
          </Tooltip>
        </div>

        {!canRun && (
          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
            Fill in Title, Challenge, Solution, and Results to run the job.
          </p>
        )}

        {result && (
          <div className={result.ok ? 'result-ok' : 'result-error'} style={{ marginTop: 16 }}>
            {result.ok ? (
              <>
                <strong style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {result.mode === 'api' ? (
                    <><CheckCircle2 size={14} /> Design filled — {result.operationCount} field{result.operationCount !== 1 ? 's' : ''} applied via API</>
                  ) : (
                    <><CheckCircle2 size={14} /> Job queued — {result.operationCount} field{result.operationCount !== 1 ? 's' : ''} mapped</>
                  )}
                  <Tooltip text="API: content was injected directly into Canva. Handoff: a JSON file was written for manual application" delay={150}>
                    <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 400, background: 'var(--surface-mid)', padding: '2px 7px', borderRadius: 99 }}>
                      {result.mode === 'api' ? 'API' : 'handoff'}
                    </span>
                  </Tooltip>
                </strong>

                {result.mode === 'handoff' && result.jobPath && (
                  <p style={{ fontSize: 12, margin: '6px 0 0', color: 'var(--muted)' }}>
                    Handoff file: <code style={{ color: 'var(--accent)' }}>{result.jobPath.split('/').slice(-1)[0]}</code>
                  </p>
                )}

                {result.unmapped?.length > 0 && (
                  <p style={{ fontSize: 11, color: 'var(--yellow)', margin: '6px 0 0' }}>
                    Fields with no element ID: {result.unmapped.join(', ')}
                  </p>
                )}

                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  {result.mode === 'api' && result.resultUrl && (
                    <button className="secondary" style={{ fontSize: 12 }}
                      onClick={() => window.creativePlatform.openCanvaDesign(result.resultUrl)}>
                      <ExternalLink size={12} /> Open Result in Canva
                    </button>
                  )}
                  {result.mode === 'handoff' && result.canvaUrl && (
                    <button className="secondary" style={{ fontSize: 12 }}
                      onClick={() => window.creativePlatform.openCanvaDesign(result.canvaUrl)}>
                      <ExternalLink size={12} /> Open Template in Canva
                    </button>
                  )}
                  <button className="secondary" style={{ fontSize: 12 }}
                    onClick={() => window.creativePlatform.openPath('canva_outputs')}>
                    <FolderOpen size={12} /> Open Canva Outputs
                  </button>
                </div>
              </>
            ) : (
              <p style={{ margin: 0 }}>{result.message || 'Job failed.'}</p>
            )}
          </div>
        )}
      </section>

      <ExportPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        onExport={runJob}
        templateName={(() => { const m = templates.find(t => t.id === selectedTemplate); return m?.name || m?.templateName; })()}
        thumbnailUrl={thumbUrl}
        engine="canva"
        fields={FIELD_MAP.filter(f => f.type !== 'image').map(f => ({
          key: f.key, label: f.label.replace(' *', ''), value: form[f.key] ?? '', required: f.required,
          role: (
            f.key === 'title' ? 'title' :
            f.key === 'challenge' || f.key === 'solution' || f.key === 'results' ? 'body' :
            f.key === 'testimonial' ? 'quote' :
            f.key === 'testimonialAttribution' ? 'default' :
            f.key === 'tagline' ? 'tag' :
            f.key === 'website' || f.key === 'email' ? 'url' :
            f.key === 'challengeHeader' || f.key === 'solutionHeader' || f.key === 'resultsHeader' ? 'heading' :
            'default'
          ) as any,
        }))}
        outputName={form.outputName}
        busy={loading}
      />
    </div>
  );
}
