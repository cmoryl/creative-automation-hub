/**
 * useVersionHistory
 * Per-brand generation version history backed by localStorage.
 * Key: `versions:{brandId}` → GenerationVersion[]
 */

export interface VersionEngineResult {
  status: 'done' | 'error' | 'skipped';
  templateId?: string;
  fields?: Record<string, string>;
  outputRef?: string;
  error?: string;
}

export interface GenerationVersion {
  id: string;
  versionNum: number;       // monotonic 1, 2, 3 …
  label?: string;           // user-editable friendly name
  createdAt: number;        // Date.now()
  brand: { id: string; name: string; color: string };
  brief: string;
  outputName: string;
  engines: Record<string, VersionEngineResult>;
}

const MAX_VERSIONS = 50;

function storageKey(brandId: string) {
  return `versions:${brandId}`;
}

export function readVersions(brandId: string): GenerationVersion[] {
  try {
    const raw = localStorage.getItem(storageKey(brandId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeVersions(brandId: string, versions: GenerationVersion[]) {
  try {
    localStorage.setItem(storageKey(brandId), JSON.stringify(versions.slice(0, MAX_VERSIONS)));
  } catch { /* ignore storage errors */ }
}

export function saveVersion(params: {
  brandId: string;
  brand: { id: string; name: string; color: string };
  brief: string;
  outputName: string;
  engines: Record<string, VersionEngineResult>;
  label?: string;
}): GenerationVersion {
  const existing = readVersions(params.brandId);
  const nextNum  = existing.length > 0 ? Math.max(...existing.map(v => v.versionNum)) + 1 : 1;

  const version: GenerationVersion = {
    id:         `v${nextNum}_${Date.now()}`,
    versionNum: nextNum,
    label:      params.label,
    createdAt:  Date.now(),
    brand:      params.brand,
    brief:      params.brief,
    outputName: params.outputName,
    engines:    params.engines,
  };

  // Newest first
  writeVersions(params.brandId, [version, ...existing]);
  return version;
}

export function deleteVersion(brandId: string, versionId: string) {
  const versions = readVersions(brandId).filter(v => v.id !== versionId);
  writeVersions(brandId, versions);
}

export function renameVersion(brandId: string, versionId: string, label: string) {
  const versions = readVersions(brandId).map(v =>
    v.id === versionId ? { ...v, label } : v
  );
  writeVersions(brandId, versions);
}
