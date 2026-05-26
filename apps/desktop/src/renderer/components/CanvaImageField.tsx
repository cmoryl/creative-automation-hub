import { useState } from 'react';
import { ImagePlus, Upload, X } from 'lucide-react';

export interface CanvaImageValue {
  assetId: string | null;
  url: string;
  fileName: string | null;
}

export const EMPTY_CANVA_IMAGE: CanvaImageValue = { assetId: null, url: '', fileName: null };

interface CanvaImageFieldProps {
  label: string;
  fieldKey: string;   // e.g. IMAGE_HERO
  value: CanvaImageValue;
  onChange: (v: CanvaImageValue) => void;
  hasElementId?: boolean; // warn when the manifest element_id is blank
  disabled?: boolean;
}

export function CanvaImageField({
  label,
  fieldKey,
  value,
  onChange,
  hasElementId = true,
  disabled = false,
}: CanvaImageFieldProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSet = !!(value.assetId || value.url.trim());

  async function pickAndUpload() {
    setUploading(true);
    setError(null);
    try {
      const r = await window.creativePlatform.pickAndUploadCanvaAsset();
      if ((r as any).cancelled) return;
      if ((r as any).ok) {
        onChange({ assetId: (r as any).assetId, url: '', fileName: (r as any).fileName });
      } else {
        setError((r as any).message || 'Upload failed');
      }
    } finally {
      setUploading(false);
    }
  }

  function clear() {
    onChange(EMPTY_CANVA_IMAGE);
    setError(null);
  }

  return (
    <div className="field-group">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <label style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
          <ImagePlus size={12} style={{ color: 'var(--muted)' }} />
          {label}
          <code style={{ fontSize: 10, color: 'var(--muted)', background: 'var(--surface-mid)', padding: '1px 5px', borderRadius: 3 }}>
            {fieldKey}
          </code>
          {!hasElementId && (
            <span style={{ fontSize: 10, color: 'var(--yellow)' }}>⚠ element ID not mapped</span>
          )}
        </label>
        <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
          optional
        </span>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        {/* Thumbnail / status indicator */}
        <div style={{
          width: 52, height: 52, flexShrink: 0, borderRadius: 6, overflow: 'hidden',
          border: '1px solid var(--line)', background: 'rgba(0,0,0,.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {value.url.trim()
            ? <img src={value.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" onError={() => {}} />
            : value.assetId
              ? <span style={{ fontSize: 9, color: 'var(--green)', textAlign: 'center', padding: 4 }}>✓ uploaded</span>
              : <ImagePlus size={20} style={{ color: 'var(--muted)', opacity: .3 }} />
          }
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {/* URL fallback input (hidden when assetId set) */}
          {!value.assetId && (
            <input
              className="field-input"
              style={{ fontSize: 12 }}
              value={value.url}
              onChange={e => onChange({ ...value, url: e.target.value, assetId: null, fileName: null })}
              placeholder="https://… image URL (or pick file below)"
              disabled={disabled}
            />
          )}

          {/* Status when assetId present */}
          {value.assetId && (
            <div style={{ fontSize: 12, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 6 }}>
              ✓ Uploaded to Canva
              {value.fileName && <span style={{ color: 'var(--muted)', fontSize: 11 }}>{value.fileName}</span>}
              <code style={{ fontSize: 10, color: 'var(--accent)', opacity: .7 }}>{value.assetId.slice(0, 18)}…</code>
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              className="secondary"
              style={{ fontSize: 12, padding: '4px 10px' }}
              onClick={pickAndUpload}
              disabled={uploading || disabled}
            >
              <Upload size={12} /> {uploading ? 'Uploading…' : 'Pick & Upload to Canva'}
            </button>
            {isSet && !disabled && (
              <button className="secondary" style={{ fontSize: 12, padding: '4px 8px' }} onClick={clear}>
                <X size={12} />
              </button>
            )}
          </div>

          {error && <p style={{ fontSize: 11, color: 'var(--red)', margin: 0 }}>{error}</p>}
        </div>
      </div>
    </div>
  );
}
