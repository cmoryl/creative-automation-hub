import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, X } from 'lucide-react';

export interface ToastItem {
  id: number;
  message: string;
  type: 'success' | 'error';
}

let _emit: ((item: ToastItem) => void) | null = null;
let _nextId = 1;

export function toast(message: string, type: 'success' | 'error' = 'success') {
  _emit?.({ id: _nextId++, message, type });
}

export function ToastContainer() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    _emit = (item) => {
      setItems(prev => [...prev, item]);
      setTimeout(() => setItems(prev => prev.filter(t => t.id !== item.id)), 3500);
    };
    return () => { _emit = null; };
  }, []);

  if (items.length === 0) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      display: 'flex', flexDirection: 'column', gap: 8,
      pointerEvents: 'none',
    }}>
      {items.map(item => (
        <div key={item.id} style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px',
          borderRadius: 10,
          background: 'var(--panel)',
          border: `1px solid ${item.type === 'success' ? 'rgba(117,245,174,.35)' : 'rgba(255,116,116,.35)'}`,
          boxShadow: '0 8px 32px rgba(0,0,0,.45)',
          fontSize: 13,
          color: 'var(--text)',
          minWidth: 220,
          maxWidth: 360,
          pointerEvents: 'auto',
          animation: 'toastIn .18s ease',
        }}>
          {item.type === 'success'
            ? <CheckCircle2 size={15} style={{ color: 'var(--green)', flexShrink: 0 }} />
            : <XCircle size={15} style={{ color: 'var(--red)', flexShrink: 0 }} />}
          <span style={{ flex: 1, lineHeight: 1.4 }}>{item.message}</span>
          <button
            onClick={() => setItems(prev => prev.filter(t => t.id !== item.id))}
            style={{ background: 'none', border: 'none', padding: 2, color: 'var(--muted)', cursor: 'pointer', flexShrink: 0, borderRadius: 4 }}
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
