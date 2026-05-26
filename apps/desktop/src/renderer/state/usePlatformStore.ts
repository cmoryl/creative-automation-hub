import { create } from 'zustand';
import type { CreativeEngine, EngineProfile, CreativeProject, OutputRecord } from '../../shared/types/platform';

// Window type is declared in src/renderer/types/platform.d.ts

export interface OutputGroup {
  id: string;
  engine: string;
  templateId: string;
  dateFolder: string;
  folderPath: string;
  files: OutputRecord[];
  latestAt: string;
}

interface PlatformState {
  selectedEngine: CreativeEngine;
  engines: EngineProfile[];
  status?: any;
  projects: CreativeProject[];
  outputs: OutputRecord[];
  outputGroups: OutputGroup[];
  templates: any[];
  activeBrand: any | null;
  // Per-engine pre-fill payload from Claude AI chat generation
  pendingFill: Record<string, Record<string, string>>;
  setPendingFill: (engine: string, content: Record<string, string>) => void;
  clearPendingFill: (engine: string) => void;
  setEngine: (engine: CreativeEngine) => void;
  refresh: () => Promise<void>;
  refreshOutputs: () => Promise<void>;
  refreshTemplates: () => Promise<void>;
  refreshBrand: () => Promise<void>;
}

export const usePlatformStore = create<PlatformState>((set) => ({
  selectedEngine: 'illustrator',
  engines: [],
  projects: [],
  outputs: [],
  outputGroups: [],
  templates: [],
  activeBrand: null,
  pendingFill: {},
  setPendingFill: (engine, content) => set(s => ({ pendingFill: { ...s.pendingFill, [engine]: content } })),
  clearPendingFill: (engine) => set(s => { const pf = { ...s.pendingFill }; delete pf[engine]; return { pendingFill: pf }; }),
  setEngine: (engine) => set({ selectedEngine: engine }),
  refresh: async () => {
    try {
      const [engines, status, projects, outputs, outputGroups, brandRes] = await Promise.all([
        window.creativePlatform.engineProfiles(),
        window.creativePlatform.liveStatus(),
        window.creativePlatform.listProjects(),
        window.creativePlatform.listOutputs(),
        window.creativePlatform.listOutputGroups(),
        window.creativePlatform.getActiveBrand(),
      ]);
      set({ engines, status, projects, outputs, outputGroups: outputGroups ?? [], activeBrand: brandRes?.brand ?? null });
    } catch { /* retain previous state on IPC failure */ }
  },
  refreshOutputs: async () => {
    try {
      const [outputs, outputGroups] = await Promise.all([
        window.creativePlatform.listOutputs(),
        window.creativePlatform.listOutputGroups(),
      ]);
      set({ outputs, outputGroups: outputGroups ?? [] });
    } catch {}
  },
  refreshTemplates: async () => {
    try {
      const templates = await window.creativePlatform.listTemplates();
      set({ templates });
    } catch {}
  },
  refreshBrand: async () => {
    try {
      const res = await window.creativePlatform.getActiveBrand();
      set({ activeBrand: res?.brand ?? null });
    } catch {}
  },
}));
