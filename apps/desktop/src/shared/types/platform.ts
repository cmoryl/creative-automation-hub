export type CreativeEngine = 'illustrator' | 'indesign' | 'canva' | 'adobe_express' | 'hybrid';
export type ConnectionColor = 'green' | 'yellow' | 'red' | 'gray';

export interface StatusNode {
  label: string;
  color: ConnectionColor;
  detail: string;
  ready: boolean;
}

export interface EngineProfile {
  id: CreativeEngine;
  label: string;
  positioning: string;
  bestFor: string[];
  automationModel: string;
  status: 'implemented' | 'scaffolded' | 'manual' | 'planned';
}

export interface LinkedOutput {
  path: string;
  name: string;
  type: string;
  engine: string;
  linkedAt: string;
}

export interface CreativeProject {
  id: string;
  name: string;
  engine: CreativeEngine;
  status: 'draft' | 'ready' | 'processing' | 'complete' | 'failed' | 'archived';
  createdAt: string;
  updatedAt: string;
  outputs?: LinkedOutput[];
}

export interface OutputRecord {
  id: string;
  engine: CreativeEngine;
  type: string;
  name: string;
  path: string;
  status: 'queued' | 'processing' | 'success' | 'warning' | 'failed' | 'archived';
  createdAt: string;
}

export interface JobContent {
  TEXT_TITLE: string;
  TEXT_CHALLENGE: string;
  TEXT_SOLUTION: string;
  TEXT_RESULTS: string;
  TEXT_OVERVIEW?: string;
  TEXT_CHALLENGE_HEADER?: string;
  TEXT_SOLUTION_HEADER?: string;
  TEXT_RESULTS_HEADER?: string;
  TEXT_TESTIMONIAL?: string;
  TEXT_TESTIMONIAL_ATTRIBUTION?: string;
  TEXT_STAT_01?: string;
  TEXT_STAT_02?: string;
  TEXT_TAGLINE?: string;
  TEXT_WEBSITE?: string;
  TEXT_EMAIL?: string;
  [key: string]: string | undefined;
}

export interface IllustratorJob {
  output_name: string;
  template?: string;
  content: JobContent;
}

export interface AutomationResult {
  ok: boolean;
  stdout?: string;
  errorCode?: string;
  errorTitle?: string;
  userMessage?: string;
  likelyCauses?: string[];
  recoverySteps?: string[];
  technical?: string;
  context?: Record<string, unknown>;
}

export type ErrorCode =
  | 'NODE_RUNTIME'
  | 'ILLUSTRATOR_PERMISSION'
  | 'ILLUSTRATOR_NOT_RESPONDING'
  | 'TEMPLATE_MISSING'
  | 'TEMPLATE_OBJECT_MISSING'
  | 'EXPORT_FAILED'
  | 'CANVA_HANDOFF'
  | 'CANVA_API_ERROR'
  | 'JOB_VALIDATION'
  | 'UNKNOWN';

export interface ErrorCatalogEntry {
  title: string;
  user_message: string;
  likely_causes: string[];
  recovery_steps: string[];
}
