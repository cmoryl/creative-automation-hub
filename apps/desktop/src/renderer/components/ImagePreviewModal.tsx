import { useEffect } from 'react';
import { X } from 'lucide-react';

interface Props {
  src: string;
  alt?: string;
  onClose: () => void;
}

export function ImagePreviewModal({ src, alt, onClose }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(0,0,0,.85)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'zoom-out',
      }}
      onClick={onClose}
    >
      <button
        onClick={onClose}
        style={{
          position: 'fixed', top: 18, right: 22, zIndex: 2001,
          background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.2)',
          borderRadius: '50%', padding: 6, cursor: 'pointer', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <X size={16} />
      </button>
      <img
        src={src}
        alt={alt || 'Preview'}
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '90vw', maxHeight: '90vh',
          objectFit: 'contain', borderRadius: 8,
          boxShadow: '0 32px 96px rgba(0,0,0,.7)',
          cursor: 'default',
        }}
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
      {alt && (
        <p style={{
          position: 'fixed', bottom: 22, left: '50%', transform: 'translateX(-50%)',
          fontSize: 11, color: 'rgba(255,255,255,.5)', pointerEvents: 'none',
        }}>
          {alt}
        </p>
      )}
    </div>
  );
}
