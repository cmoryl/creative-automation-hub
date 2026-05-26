export type CreativeEngine = 'illustrator' | 'indesign' | 'canva' | 'hybrid';
export interface ProjectModel { id: string; name: string; engine: CreativeEngine; status: string; }
export interface TemplateModel { id: string; engine: CreativeEngine; name: string; category: string; dimensions: string; requiredObjects: string[]; healthScore: number; }
export interface JobModel { id: string; projectId: string; engine: CreativeEngine; payload: Record<string, unknown>; status: string; }
export interface DiagnosticsModel { id: string; jobId?: string; severity: 'info' | 'warn' | 'error' | 'fatal'; message: string; recoverySteps?: string[]; }
