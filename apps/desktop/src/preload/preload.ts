import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('creativePlatform', {
  // Core
  workspace: () => ipcRenderer.invoke('platform:workspace'),
  liveStatus: () => ipcRenderer.invoke('platform:liveStatus'),
  engineProfiles: () => ipcRenderer.invoke('platform:engineProfiles'),
  createProject: (project: any) => ipcRenderer.invoke('platform:createProject', project),
  listProjects: () => ipcRenderer.invoke('platform:listProjects'),
  deleteProject: (id: string) => ipcRenderer.invoke('platform:deleteProject', id),
  listOutputs: () => ipcRenderer.invoke('platform:listOutputs'),
  openPath: (target: string) => ipcRenderer.invoke('platform:openPath', target),
  generateCanvaHandoff: (payload: any) => ipcRenderer.invoke('platform:generateCanvaHandoff', payload),

  // Illustrator automation
  runIllustratorPreflight: (templateId?: string) => ipcRenderer.invoke('platform:runIllustratorPreflight', templateId),
  runIllustratorExample: (templateId?: string) => ipcRenderer.invoke('platform:runIllustratorExample', templateId),
  runIllustratorCustom: (job: any) => ipcRenderer.invoke('platform:runIllustratorCustom', job),

  // InDesign automation
  runInDesignPreflight: (templateId?: string) => ipcRenderer.invoke('platform:runInDesignPreflight', templateId),
  runInDesignExample: (templateId?: string) => ipcRenderer.invoke('platform:runInDesignExample', templateId),
  runInDesignCustom: (job: any) => ipcRenderer.invoke('platform:runInDesignCustom', job),

  // Job utilities
  validateJob: (job: any, engine?: string) => ipcRenderer.invoke('platform:validateJob', job, engine),
  suggestOutputName: (baseName: string) => ipcRenderer.invoke('platform:suggestOutputName', baseName),

  // Output registry
  listOutputGroups: () => ipcRenderer.invoke('platform:listOutputGroups'),
  createOutputFolder: (payload: any) => ipcRenderer.invoke('platform:createOutputFolder', payload),

  // Template registry
  listTemplates: () => ipcRenderer.invoke('platform:listTemplates'),
  replaceTemplate: (engineId: string, templateFileName: string) =>
    ipcRenderer.invoke('platform:replaceTemplate', engineId, templateFileName),

  // Canva registry
  addCanvaTemplate: (payload: any) => ipcRenderer.invoke('platform:addCanvaTemplate', payload),
  generateCanvaManifest: (payload: any) => ipcRenderer.invoke('platform:generateCanvaManifest', payload),
  openCanvaDesign: (url: string) => ipcRenderer.invoke('platform:openCanvaDesign', url),

  // Canva AI design generation
  listCanvaBrandKits: () => ipcRenderer.invoke('platform:listCanvaBrandKits'),
  generateCanvaDesign: (payload: any) => ipcRenderer.invoke('platform:generateCanvaDesign', payload),
  saveCanvaDesign: (payload: any) => ipcRenderer.invoke('platform:saveCanvaDesign', payload),

  // Canva job runner
  runCanvaJob: (payload: any) => ipcRenderer.invoke('platform:runCanvaJob', payload),
  updateCanvaMapping: (payload: any) => ipcRenderer.invoke('platform:updateCanvaMapping', payload),

  // Canva API token + OAuth
  setCanvaToken: (token: string) => ipcRenderer.invoke('platform:setCanvaToken', token),
  getCanvaToken: () => ipcRenderer.invoke('platform:getCanvaToken'),
  getCanvaCredentials: () => ipcRenderer.invoke('platform:getCanvaCredentials'),
  setCanvaCredentials: (clientId: string, clientSecret: string) => ipcRenderer.invoke('platform:setCanvaCredentials', clientId, clientSecret),
  startCanvaOAuth: () => ipcRenderer.invoke('platform:startCanvaOAuth'),

  // Project linking
  linkOutputToProject: (projectId: string, output: any) => ipcRenderer.invoke('platform:linkOutputToProject', projectId, output),

  // Template thumbnails
  getTemplateThumbnail: (templateId: string) => ipcRenderer.invoke('platform:getTemplateThumbnail', templateId),

  // Canva image assets
  pickAndUploadCanvaAsset: () => ipcRenderer.invoke('platform:pickAndUploadCanvaAsset'),

  // Local file picker (for Illustrator image replacement)
  pickLocalFile: (opts?: { title?: string; extensions?: string[] }) => ipcRenderer.invoke('platform:pickLocalFile', opts),

  // Local template registration
  addLocalTemplate: (payload: any) => ipcRenderer.invoke('platform:addLocalTemplate', payload),
  addAdobeExpressTemplate: (payload: any) => ipcRenderer.invoke('platform:addAdobeExpressTemplate', payload),
  updateAdobeExpressTemplate: (payload: any) => ipcRenderer.invoke('platform:updateAdobeExpressTemplate', payload),

  // Adobe Express
  runAdobeExpressJob: (payload: any) => ipcRenderer.invoke('platform:runAdobeExpressJob', payload),

  // Diagnostics
  errorCatalog: () => ipcRenderer.invoke('platform:errorCatalog'),
  exportDiagnostics: () => ipcRenderer.invoke('platform:exportDiagnostics'),
  runSystemCheck: () => ipcRenderer.invoke('platform:runSystemCheck'),
  autoFix: (action: string) => ipcRenderer.invoke('platform:autoFix', action),
  setClaudeApiKey: (key: string) => ipcRenderer.invoke('platform:setClaudeApiKey', key),
  getClaudeApiKey: () => ipcRenderer.invoke('platform:getClaudeApiKey'),
  askClaudeAboutError: (payload: any) => ipcRenderer.invoke('platform:askClaudeAboutError', payload),
  askClaude: (payload: any) => ipcRenderer.invoke('platform:askClaude', payload),
  seedMasterSkills: () => ipcRenderer.invoke('platform:seedMasterSkills'),
  listSkills: () => ipcRenderer.invoke('platform:listSkills'),
  getSkill: (id: string) => ipcRenderer.invoke('platform:getSkill', id),
  saveSkill: (payload: any) => ipcRenderer.invoke('platform:saveSkill', payload),
  deleteSkill: (id: string) => ipcRenderer.invoke('platform:deleteSkill', id),
  exportSkillZip: (id: string) => ipcRenderer.invoke('platform:exportSkillZip', id),
  importSkillZip: () => ipcRenderer.invoke('platform:importSkillZip'),
  claudeFillFields: (payload: any) => ipcRenderer.invoke('platform:claudeFillFields', payload),
  claudeGenerateBatch: (payload: any) => ipcRenderer.invoke('platform:claudeGenerateBatch', payload),

  // Adobe Firefly AI image generation
  generateFireflyImage: (payload: any) => ipcRenderer.invoke('platform:generateFireflyImage', payload),
  setAdobeFireflyCredentials: (clientId: string, clientSecret: string) => ipcRenderer.invoke('platform:setAdobeFireflyCredentials', clientId, clientSecret),
  getAdobeFireflyCredentials: () => ipcRenderer.invoke('platform:getAdobeFireflyCredentials'),

  // File reveal / open
  revealFile: (filePath: string) => ipcRenderer.invoke('platform:revealFile', filePath),
  openFile: (filePath: string) => ipcRenderer.invoke('platform:openFile', filePath),
  openUrl: (url: string) => ipcRenderer.invoke('platform:openUrl', url),
  sendNotification: (title: string, body: string) => ipcRenderer.invoke('platform:sendNotification', title, body),

  // Engines folder explorer
  scanEnginesFolder: () => ipcRenderer.invoke('platform:scanEnginesFolder'),

  // Figma
  setFigmaToken: (token: string) => ipcRenderer.invoke('platform:setFigmaToken', token),
  getFigmaToken: () => ipcRenderer.invoke('platform:getFigmaToken'),
  getFigmaFileInfo: (fileKey: string) => ipcRenderer.invoke('platform:getFigmaFileInfo', fileKey),
  getFigmaVariables: (fileKey: string) => ipcRenderer.invoke('platform:getFigmaVariables', fileKey),
  updateFigmaVariables: (payload: any) => ipcRenderer.invoke('platform:updateFigmaVariables', payload),
  exportFigmaFrames: (payload: any) => ipcRenderer.invoke('platform:exportFigmaFrames', payload),
  runFigmaJob: (payload: any) => ipcRenderer.invoke('platform:runFigmaJob', payload),
  addFigmaTemplate: (payload: any) => ipcRenderer.invoke('platform:addFigmaTemplate', payload),
  openFigmaDesign: (url: string) => ipcRenderer.invoke('platform:openFigmaDesign', url),

  // Monday.com integration
  getMondayConfig: () => ipcRenderer.invoke('platform:getMondayConfig'),
  setMondayApiKey: (key: string, enabled: boolean) => ipcRenderer.invoke('platform:setMondayApiKey', key, enabled),
  setMondayEnabled: (enabled: boolean) => ipcRenderer.invoke('platform:setMondayEnabled', enabled),
  testMondayConnection: () => ipcRenderer.invoke('platform:testMondayConnection'),
  listMondayBoards: () => ipcRenderer.invoke('platform:listMondayBoards'),
  listMondayColumns: (boardId: string) => ipcRenderer.invoke('platform:listMondayColumns', boardId),
  addMondayBoardConfig: (cfg: any) => ipcRenderer.invoke('platform:addMondayBoardConfig', cfg),
  removeMondayBoardConfig: (id: string) => ipcRenderer.invoke('platform:removeMondayBoardConfig', id),
  toggleMondayBoard: (id: string, enabled: boolean) => ipcRenderer.invoke('platform:toggleMondayBoard', id, enabled),
  triggerMondayPoll: () => ipcRenderer.invoke('platform:triggerMondayPoll'),
  getMondayActivity: () => ipcRenderer.invoke('platform:getMondayActivity'),
  setMondayPollInterval: (ms: number) => ipcRenderer.invoke('platform:setMondayPollInterval', ms),

  // Brand profiles
  listBrands: () => ipcRenderer.invoke('platform:listBrands'),
  createBrand: (payload: any) => ipcRenderer.invoke('platform:createBrand', payload),
  updateBrand: (payload: any) => ipcRenderer.invoke('platform:updateBrand', payload),
  deleteBrand: (id: string) => ipcRenderer.invoke('platform:deleteBrand', id),
  setActiveBrand: (id: string | null) => ipcRenderer.invoke('platform:setActiveBrand', id),
  getActiveBrand: () => ipcRenderer.invoke('platform:getActiveBrand'),

  // Claude streaming chat
  onClaudeChunk: (cb: (chunk: { text?: string; done?: boolean; error?: string }) => void) => {
    ipcRenderer.on('platform:claude:chunk', (_event, chunk) => cb(chunk));
    return () => ipcRenderer.removeAllListeners('platform:claude:chunk');
  },
  claudeAnalyzeImage: (payload: any) => ipcRenderer.invoke('platform:claudeAnalyzeImage', payload),

  // Auto-updater
  checkForUpdates: () => ipcRenderer.invoke('platform:checkForUpdates'),
  installUpdate: () => ipcRenderer.invoke('platform:installUpdate'),
  onUpdateStatus: (cb: (info: { status: string; version?: string; percent?: number; message?: string }) => void) => {
    ipcRenderer.on('platform:update', (_event, info) => cb(info));
    return () => ipcRenderer.removeAllListeners('platform:update');
  },
});
