import { useCallback, useEffect, useRef, useState, Dispatch, SetStateAction } from 'react';

function readDraft<T>(storageKey: string, initial: T): T {
  try {
    const saved = localStorage.getItem(storageKey);
    return saved ? { ...initial, ...JSON.parse(saved) } : initial;
  } catch {
    return initial;
  }
}

export function useDraft<T extends object>(
  key: string,
  initial: T
): [T, Dispatch<SetStateAction<T>>, () => void] {
  const storageKey = `draft:${key}`;
  const prevKeyRef = useRef(storageKey);
  // Keep a stable ref to initial so clearDraft always uses the current value
  const initialRef = useRef(initial);
  initialRef.current = initial;

  const [state, setState] = useState<T>(() => readDraft(storageKey, initial));

  // When the key changes (template switch), load new draft without triggering a save
  const skipSaveRef = useRef(false);
  useEffect(() => {
    if (prevKeyRef.current === storageKey) return;
    prevKeyRef.current = storageKey;
    skipSaveRef.current = true;
    setState(readDraft(storageKey, initialRef.current));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    if (skipSaveRef.current) { skipSaveRef.current = false; return; }
    try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch {}
  }, [state, storageKey]);

  const clearDraft = useCallback(() => {
    try { localStorage.removeItem(storageKey); } catch {}
    skipSaveRef.current = true;
    setState(initialRef.current);
  }, [storageKey]);

  return [state, setState, clearDraft];
}
