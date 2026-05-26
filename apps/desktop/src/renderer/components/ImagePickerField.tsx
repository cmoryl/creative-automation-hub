import { useState } from 'react';
import { ImagePlus, X } from 'lucide-react';

interface ImagePickerFieldProps {
  label: string;
  value: string;
  onChange: (path: string) => void;
  disabled?: boolean;
  fieldKey?: string;
}

export function ImagePickerField({ label, value, onChange, disabled = false, fieldKey }: ImagePickerFieldProps) {
  const [picking, setPicking] = useState(false);
  const preview = value ? `file://${value}` : null;

  async function pick() {
    setPicking(true);
    try {
      const r = await window.creativePlatform.pickLocalFile({
        title: `Select ${label}`,
        extensions: ['jpg', 'jpeg', 'png', 'tif', 'tiff', 'webp'],
      });
      if (r.ok) onChange(r.filePath);
    } finally {
      setPicking(false);
    }
  }

  return (
    <div className="image-picker-field">
      {/* Thumbnail — always visible, shows placeholder when empty */}
      <button
        className={`image-picker-thumb${preview ? ' has-image' : ''}`}
        onClick={pick}
        disabled={picking || disabled}
        title={preview ? 'Click to replace image' : 'Click to pick image'}
      >
        {preview
          ? <img src={preview} alt={label} onError={() => {}} />
          : <>
              <ImagePlus size={22} style={{ color: 'var(--accent)', opacity: .5 }} />
              <span className="image-picker-thumb-hint">Click to add</span>
            </>
        }
        {preview && (
          <div className="image-picker-thumb-overlay">
            <ImagePlus size={16} />
            Replace
          </div>
        )}
      </button>

      {/* Right column */}
      <div className="image-picker-info">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{label}</span>
          {fieldKey && (
            <code style={{ fontSize: 10, color: 'var(--muted)', background: 'var(--surface-mid)', padding: '1px 5px', borderRadius: 3 }}>
              {fieldKey}
            </code>
          )}
          <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 'auto' }}>optional</span>
        </div>

        {/* Path input */}
        <input
          className="field-input"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Absolute path — or click thumbnail to browse…"
          style={{ fontSize: 12 }}
          disabled={disabled}
        />

        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <button
            className="secondary"
            style={{ fontSize: 12, padding: '4px 10px' }}
            onClick={pick}
            disabled={picking || disabled}
          >
            <ImagePlus size={12} /> {picking ? 'Picking…' : 'Browse'}
          </button>
          {value && !disabled && (
            <button
              className="secondary"
              style={{ fontSize: 12, padding: '4px 8px' }}
              onClick={() => onChange('')}
              title="Clear"
            >
              <X size={12} />
            </button>
          )}
          {value && (
            <span style={{ fontSize: 11, color: 'var(--green)', alignSelf: 'center', marginLeft: 4 }}>
              ✓ {value.split('/').pop()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
