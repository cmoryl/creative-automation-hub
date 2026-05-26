/** Typed interface for window.creativePlatform (mirrored from preload.ts) */
export interface CreativePlatform {
  // Core
  workspace: () => Promise<any>;
  liveStatus: () => Promise<any>;
  engineProfiles: () => Promise<any>;
  createProject: (project: any) => Promise<any>;
  listProjects: () => Promise<any[]>;
  deleteProject: (id: string) => Promise<any>;
  listOutputs: () => Promise<any[]>;
  openPath: (target: string) => Promise<any>;
  generateCanvaHandoff: (payload: any) => Promise<any>;

  // Illustrator
  runIllustratorPreflight: (templateId?: string) => Promise<any>;
  runIllustratorExample: (templateId?: string) => Promise<any>;
  runIllustratorCustom: (job: any) => Promise<any>;

  // InDesign
  runInDesignPreflight: (templateId?: string) => Promise<any>;
  runInDesignExample: (templateId?: string) => Promise<any>;
  runInDesignCustom: (job: any) => Promise<any>;

  // Job utilities
  validateJob: (job: any, engine?: string) => Promise<any>;
  suggestOutputName: (baseName: string) => Promise<any>;

  // Output registry
  listOutputGroups: () => Promise<any>;
  createOutputFolder: (payload: any) => Promise<any>;

  // Template registry
  listTemplates: () => Promise<any[]>;
  replaceTemplate: (engineId: string, templateFileName: string) => Promise<any>;

  // Canva registry
  addCanvaTemplate: (payload: any) => Promise<any>;
  generateCanvaManifest: (payload: any) => Promise<any>;
  openCanvaDesign: (url: string) => Promise<any>;

  // Canva AI design generation
  listCanvaBrandKits: () => Promise<any>;
  generateCanvaDesign: (payload: any) => Promise<any>;
  saveCanvaDesign: (payload: any) => Promise<any>;

  // Canva job runner
  runCanvaJob: (payload: any) => Promise<any>;
  updateCanvaMapping: (payload: any) => Promise<any>;

  // Canva API token + OAuth
  setCanvaToken: (token: string) => Promise<any>;
  getCanvaToken: () => Promise<any>;
  getCanvaCredentials: () => Promise<{
    ok: boolean;
    hasToken: boolean;
    hasOAuth: boolean;
    hasRefreshToken: boolean;
    hasBundledCredentials: boolean;
    clientId: string | null;
    masked: string | null;
    expirySecs: number | null;
    expiresAt: number | null;
  }>;
  setCanvaCredentials: (clientId: string, clientSecret: string) => Promise<any>;
  startCanvaOAuth: () => Promise<{ ok: boolean; message?: string }>;

  // Project linking
  linkOutputToProject: (projectId: string, output: any) => Promise<any>;

  // Template thumbnails
  getTemplateThumbnail: (templateId: string) => Promise<any>;

  // Canva image assets
  pickAndUploadCanvaAsset: () => Promise<any>;

  // Local file picker
  pickLocalFile: (opts?: { title?: string; extensions?: string[] }) => Promise<any>;

  // Local template registration
  addLocalTemplate: (payload: any) => Promise<any>;
  addAdobeExpressTemplate: (payload: any) => Promise<any>;
  updateAdobeExpressTemplate: (payload: any) => Promise<any>;

  // Adobe Express
  runAdobeExpressJob: (payload: any) => Promise<any>;

  // Diagnostics
  errorCatalog: () => Promise<any>;
  exportDiagnostics: () => Promise<any>;
  runSystemCheck: () => Promise<any>;
  autoFix: (action: string) => Promise<any>;
  setClaudeApiKey: (key: string) => Promise<any>;
  getClaudeApiKey: () => Promise<any>;
  askClaudeAboutError: (payload: any) => Promise<any>;
  askClaude: (payload: any) => Promise<any>;
  seedMasterSkills: () => Promise<any>;
  listSkills: () => Promise<any>;
  getSkill: (id: string) => Promise<any>;
  saveSkill: (payload: any) => Promise<any>;
  deleteSkill: (id: string) => Promise<any>;
  exportSkillZip: (id: string) => Promise<any>;
  importSkillZip: () => Promise<any>;
  claudeFillFields: (payload: any) => Promise<any>;
  claudeGenerateBatch: (payload: any) => Promise<any>;

  // Adobe Firefly AI image generation
  generateFireflyImage: (payload: any) => Promise<any>;
  setAdobeFireflyCredentials: (clientId: string, clientSecret: string) => Promise<any>;
  getAdobeFireflyCredentials: () => Promise<any>;

  // File reveal / open
  revealFile: (filePath: string) => Promise<any>;
  openFile: (filePath: string) => Promise<any>;
  openUrl: (url: string) => Promise<{ ok: boolean; message?: string }>;
  sendNotification: (title: string, body: string) => Promise<any>;

  // Engines folder explorer
  scanEnginesFolder: () => Promise<any>;

  // Figma
  setFigmaToken: (token: string) => Promise<any>;
  getFigmaToken: () => Promise<any>;
  getFigmaFileInfo: (fileKey: string) => Promise<any>;
  getFigmaVariables: (fileKey: string) => Promise<any>;
  updateFigmaVariables: (payload: any) => Promise<any>;
  exportFigmaFrames: (payload: any) => Promise<any>;
  runFigmaJob: (payload: any) => Promise<any>;
  addFigmaTemplate: (payload: any) => Promise<any>;
  openFigmaDesign: (url: string) => Promise<any>;

  // Monday.com integration
  getMondayConfig: () => Promise<any>;
  setMondayApiKey: (key: string, enabled: boolean) => Promise<any>;
  setMondayEnabled: (enabled: boolean) => Promise<any>;
  testMondayConnection: () => Promise<any>;
  listMondayBoards: () => Promise<any>;
  listMondayColumns: (boardId: string) => Promise<any>;
  addMondayBoardConfig: (cfg: any) => Promise<any>;
  removeMondayBoardConfig: (id: string) => Promise<any>;
  toggleMondayBoard: (id: string, enabled: boolean) => Promise<any>;
  triggerMondayPoll: () => Promise<any>;
  getMondayActivity: () => Promise<any>;
  setMondayPollInterval: (ms: number) => Promise<any>;

  // Brand profiles
  listBrands: () => Promise<{ brands: any[]; activeId: string | null }>;
  createBrand: (payload: any) => Promise<any>;
  updateBrand: (payload: any) => Promise<any>;
  deleteBrand: (id: string) => Promise<any>;
  setActiveBrand: (id: string | null) => Promise<any>;
  getActiveBrand: () => Promise<any>;

  // Claude streaming chat
  onClaudeChunk: (cb: (chunk: { text?: string; done?: boolean; error?: string }) => void) => () => void;
  claudeAnalyzeImage: (payload: any) => Promise<any>;

  // Auto-updater
  checkForUpdates: () => Promise<{ ok: boolean; message?: string }>;
  installUpdate: () => Promise<{ ok: boolean }>;
  onUpdateStatus: (cb: (info: { status: string; version?: string; percent?: number; message?: string }) => void) => () => void;
}

declare global {
  interface Window {
    creativePlatform: CreativePlatform;
  }
}
