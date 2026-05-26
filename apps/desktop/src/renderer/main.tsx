import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/app.css';

// Dev stub templates — one per engine, pre-assigned to TransPerfect
const STUB_TEMPLATES = [
  {
    id: 'TRANSPERFECT_CS_v001', name: 'TransPerfect Case Study', engine: 'illustrator',
    editableObjects: {
      TEXT_TITLE:          { type: 'text', required: true,  max_chars: 120 },
      TEXT_CHALLENGE_BODY: { type: 'text', required: true,  max_chars: 600 },
      TEXT_SOLUTION_BODY:  { type: 'text', required: true,  max_chars: 600 },
      TEXT_RESULTS_BODY:   { type: 'text', required: true,  max_chars: 600 },
      TEXT_STAT_01:        { type: 'text', required: false, max_chars: 30  },
      TEXT_STAT_02:        { type: 'text', required: false, max_chars: 30  },
      TEXT_STAT_03:        { type: 'text', required: false, max_chars: 30  },
    },
  },
  {
    id: 'TRANSPERFECT_ID_v001', name: 'TransPerfect Report', engine: 'indesign',
    editableObjects: {
      DOC_TITLE:                 { type: 'text', required: true,  max_chars: 120  },
      SECTION_EXECUTIVE_SUMMARY: { type: 'text', required: true,  max_chars: 800  },
      SECTION_BODY:              { type: 'text', required: false, max_chars: 1200 },
      SECTION_CHALLENGE:         { type: 'text', required: false, max_chars: 600  },
      SECTION_SOLUTION:          { type: 'text', required: false, max_chars: 600  },
    },
  },
  {
    id: 'TRANSPERFECT_CANVA_v001', name: 'TransPerfect Social Card', engine: 'canva',
    isCanva: true, canvaDesignId: 'DAHJkmrg_LI',
    editableObjects: {
      HEADLINE:    { type: 'text', required: true,  max_chars: 80  },
      SUBHEADLINE: { type: 'text', required: false, max_chars: 150 },
      BODY_COPY:   { type: 'text', required: false, max_chars: 400 },
      CTA_TEXT:    { type: 'text', required: false, max_chars: 40  },
      STAT_01:     { type: 'text', required: false, max_chars: 30  },
      STAT_02:     { type: 'text', required: false, max_chars: 30  },
    },
  },
  {
    id: 'TRANSPERFECT_AE_v001', name: 'TransPerfect Banner', engine: 'adobe_express',
    isAdobeExpress: true,
    editableObjects: {
      HEADLINE:    { type: 'text', required: true,  max_chars: 80  },
      SUBHEADLINE: { type: 'text', required: false, max_chars: 150 },
      BODY_TEXT:   { type: 'text', required: false, max_chars: 400 },
      CTA:         { type: 'text', required: false, max_chars: 40  },
    },
  },
  {
    id: 'TRANSPERFECT_FIGMA_v001', name: 'TransPerfect Deck Slide', engine: 'figma',
    isFigma: true, figmaFileKey: 'DEV_STUB_KEY', figmaNodeId: null,
    editableObjects: {
      TEXT_TITLE:    { type: 'text', required: true,  max_chars: 120 },
      TEXT_SUBTITLE: { type: 'text', required: false, max_chars: 180 },
      TEXT_BODY:     { type: 'text', required: false, max_chars: 600 },
      TEXT_CTA:      { type: 'text', required: false, max_chars: 40  },
      STAT_01:       { type: 'text', required: false, max_chars: 60  },
      STAT_02:       { type: 'text', required: false, max_chars: 60  },
    },
  },
];

// Dev-only localStorage helpers for brand persistence
function __devLoadBrands(): any[] {
  try { return JSON.parse(localStorage.getItem('__cap_dev_brands__') || '[]'); } catch { return []; }
}
function __devSaveBrands(brands: any[]) {
  localStorage.setItem('__cap_dev_brands__', JSON.stringify(brands));
}

// Stub for Vite dev preview — Electron IPC not available outside the packaged app.
if (!(window as any).creativePlatform) {
  const devMsg = (action: string) => ({
    ok: false,
    errorCode: 'DEV_STUB',
    errorTitle: 'Electron not available',
    userMessage: `"${action}" requires the Electron runtime. Run the desktop app to use this feature.`,
    likelyCauses: ['You are viewing the UI in a browser dev preview, not the Electron shell.'],
    recoverySteps: ['Launch the app with: npm run electron (from apps/desktop).'],
  });
  (window as any).creativePlatform = {
    __isDevStub: true,
    workspace: async () => ({ ok: true, workspaceRoot: '~/CreativeAutomationPlatform/workspace', enginesRoot: '~/CreativeAutomationPlatform/engines' }),
    liveStatus: async () => ({
      system:      { label: 'System',      color: 'yellow', ready: false, detail: 'Dev preview — Electron not running' },
      illustrator: { label: 'Illustrator', color: 'gray',   ready: false, detail: 'Not connected in dev preview' },
      indesign:    { label: 'InDesign',    color: 'gray',   ready: false, detail: 'Not configured' },
      canva:       { label: 'Canva',       color: 'yellow', ready: true,  detail: 'Manual handoff mode ready' },
      claude:      { label: 'Claude',      color: 'yellow', ready: true,  detail: 'Skill-ready architecture present' },
      queue:       { label: 'Queue',       color: 'green',  ready: true,  detail: 'Idle' },
      figma:       { label: 'Figma',       color: 'gray',   ready: false, detail: 'Add Figma token to connect' },
    }),
    engineProfiles: async () => [],
    createProject: async () => devMsg('createProject'),
    listProjects: async () => [],
    deleteProject: async (_id: string) => ({ ok: true }),
    listOutputs: async () => [],
    openPath: async () => devMsg('openPath'),
    generateCanvaHandoff: async () => devMsg('generateCanvaHandoff'),
    runIllustratorPreflight: async () => devMsg('runIllustratorPreflight'),
    runIllustratorExample: async () => devMsg('runIllustratorExample'),
    runIllustratorCustom: async () => devMsg('runIllustratorCustom'),
    runInDesignPreflight: async () => devMsg('runInDesignPreflight'),
    runInDesignExample: async () => devMsg('runInDesignExample'),
    runInDesignCustom: async () => devMsg('runInDesignCustom'),
    validateJob: async () => devMsg('validateJob'),
    suggestOutputName: async (base: string) => ({ ok: true, output_name: `${base}_v001` }),
    listTemplates: async () => STUB_TEMPLATES,
    replaceTemplate: async () => devMsg('replaceTemplate'),
    addCanvaTemplate: async (p: any) => ({ ok: true, manifestId: `${p.templateName?.toUpperCase().replace(/\s+/g,'_')}_v001`, canvaDesignId: 'DEV_STUB' }),
    generateCanvaManifest: async (_p: any) => ({ ok: false, message: 'Dev preview — connect Canva account in Electron app to use brand template dataset.' }),
    listCanvaBrandKits: async () => ({ ok: true, kits: [{ id: 'kADrF5pCgKA', name: 'Life Sciences (stub)' }] }),
    generateCanvaDesign: async (_p: any) => ({ ok: false, message: 'Dev preview — Canva AI generation requires the Electron app with a connected Canva account.' }),
    saveCanvaDesign: async (_p: any) => ({ ok: false, message: 'Dev stub.' }),
    openCanvaDesign: async (url: string) => { window.open(url, '_blank'); },
    runCanvaJob: async (p: any) => ({
      ok: true,
      jobId: `canva_job_${Date.now()}`,
      jobPath: `outputs/canva/canva_job_stub.job.json`,
      canvaDesignId: 'DAHJkmrg_LI',
      canvaUrl: 'https://www.canva.com/d/PrEEG-9w0hTc1Oh',
      operationCount: Object.keys(p.content || {}).length,
      unmapped: [],
      mode: 'handoff' as const,
    }),
    updateCanvaMapping: async () => ({ ok: true }),
    setCanvaToken: async () => devMsg('setCanvaToken'),
    getCanvaToken: async () => ({ ok: true, hasToken: false, masked: null }),
    getCanvaCredentials: async () => ({ ok: true, hasToken: false, hasOAuth: false, hasRefreshToken: false, hasBundledCredentials: false, clientId: null, masked: null, expirySecs: null, expiresAt: null }),
    setCanvaCredentials: async () => devMsg('setCanvaCredentials'),
    startCanvaOAuth: async () => devMsg('startCanvaOAuth'),
    linkOutputToProject: async () => devMsg('linkOutputToProject'),
    errorCatalog: async () => ({
      NODE_RUNTIME: { title: 'Automation runtime issue', user_message: 'The app could not start or run the local automation engine.', likely_causes: ['Runner script missing from the engines folder', 'The app was moved after install and relative paths broke', 'node_modules not installed (run npm install in the project root)'], recovery_steps: ['Restart the app — most path issues resolve on relaunch.', 'Open Diagnostics → Export Bundle and check that all engine script paths resolve.', 'If scripts are missing, run: npm install --workspace apps/desktop in the project root.', 'Check the Logs folder for the exact file path that failed.'], actions: [{ label: 'Export Diagnostics', target: 'diagnostics' }, { label: 'Open Logs', target: 'logs' }] },
      ILLUSTRATOR_PERMISSION: { title: 'Illustrator permission blocked', user_message: 'macOS blocked the app from controlling Adobe Illustrator via AppleScript.', likely_causes: ['Automation permission for this app is off in System Settings', 'Full Disk Access is not granted to this app or to Terminal', 'Adobe Illustrator has never been launched on this machine', 'The app was updated and macOS reset its permission entry'], recovery_steps: ['Open System Settings → Privacy & Security → Automation.', 'Find this app in the list and enable the Adobe Illustrator 2026 toggle.', 'Also open Full Disk Access and enable this app, Adobe Illustrator, and Terminal.', 'Launch Adobe Illustrator manually at least once before running automation.', 'Relaunch this app, then click Run Preflight to confirm.'], actions: [{ label: 'Automation Settings', target: 'automation' }, { label: 'Full Disk Access', target: 'fullDisk' }] },
      INDESIGN_PERMISSION: { title: 'InDesign permission blocked', user_message: 'macOS blocked the app from controlling Adobe InDesign via AppleScript.', likely_causes: ['Automation permission for this app is off in System Settings', 'Full Disk Access is not granted', 'Adobe InDesign has never been launched on this machine'], recovery_steps: ['Open System Settings → Privacy & Security → Automation.', 'Enable the Adobe InDesign toggle under this app.', 'Also enable Full Disk Access for this app and for Terminal.', 'Launch InDesign manually at least once, then relaunch this app.', 'Run InDesign Preflight to confirm.'], actions: [{ label: 'Automation Settings', target: 'automation' }, { label: 'Full Disk Access', target: 'fullDisk' }] },
      ILLUSTRATOR_NOT_RESPONDING: { title: 'Adobe app not responding', user_message: 'Illustrator or InDesign did not respond within the automation timeout.', likely_causes: ['The Adobe app is closed — it must be open before running automation', 'A modal dialog is blocking the app (missing fonts, unsaved file prompt, crash report)', 'The automation timed out after 5 minutes on a very large or complex document'], recovery_steps: ['Open Illustrator or InDesign and dismiss any dialogs.', 'Install any missing fonts if prompted on document open.', 'Run Preflight to confirm the app is responding correctly.', 'If the issue persists, force-quit and relaunch the Adobe app, then retry.'], actions: [{ label: 'Open Logs', target: 'logs' }] },
      TEMPLATE_MISSING: { title: 'Template file missing', user_message: 'The source template file (.ai or .indd) could not be found.', likely_causes: ['The template file was moved, renamed, or deleted from the templates folder', 'The manifest references a file that was never placed in the templates folder', 'Wrong template ID was passed to the job'], recovery_steps: ['Go to the Templates screen and open the templates folder.', 'Confirm the .ai or .indd file is present and matches the manifest source_template field.', 'If missing, re-place the file in the templates folder, then run Preflight again.'], actions: [{ label: 'Open Templates Folder', target: 'templates' }] },
      TEMPLATE_OBJECT_MISSING: { title: 'Template text frame missing', user_message: 'The template is missing one or more required named text frames.', likely_causes: ['A text frame name was changed or deleted in the .ai or .indd file', 'Text was converted to outlines, removing it from the text frame list', 'The wrong template version is registered'], recovery_steps: ['Open the template in Illustrator or InDesign and check the Layers panel.', 'For Illustrator: required names are TEXT_TITLE, TEXT_CHALLENGE_BODY, TEXT_SOLUTION_BODY, TEXT_RESULTS_BODY.', 'For InDesign: required names are DOC_TITLE, SECTION_EXECUTIVE_SUMMARY, SECTION_BODY.', 'Rename or restore missing frames, save, and run Preflight again.'], actions: [{ label: 'Open Templates Folder', target: 'templates' }] },
      EXPORT_FAILED: { title: 'Export failed', user_message: 'The app could not write one or more output files.', likely_causes: ['Output folder is not writable (check permissions)', 'A blocking dialog appeared in the Adobe app during export', 'Output name contains special characters that the filesystem rejects', 'Disk is full or nearly full'], recovery_steps: ['Open the Outputs folder and confirm it is accessible.', 'Check Illustrator or InDesign for any open modal dialogs and dismiss them.', 'Keep output names to letters, numbers, underscores, and hyphens only.', 'Run Example Export from the engine screen to isolate the issue.'], actions: [{ label: 'Open Outputs', target: 'outputs' }, { label: 'Open Logs', target: 'logs' }] },
      CANVA_HANDOFF: { title: 'Canva job failed', user_message: 'The Canva job could not be completed.', likely_causes: ['No Canva API token configured — the job runs in manual handoff mode', 'API token is invalid or has expired', 'The canva_design_id in the manifest does not match a brand template in your team', 'Output folder is not writable'], recovery_steps: ['Go to the Canva engine screen → Settings and re-enter a valid Canva API token.', 'Confirm the token has the design:content:write scope in Canva Developer settings.', 'For manual mode: open the handoff JSON in the canva outputs folder and apply it in Canva.', 'Run System Check to confirm the workspace folder is writable.'], actions: [{ label: 'Open Outputs', target: 'outputs' }] },
      CANVA_API_ERROR: { title: 'Canva API error', user_message: 'The Canva Connect API returned an error.', likely_causes: ['API token missing or expired', 'Template ID is not a published brand template in your Canva team', 'Canva rate limit hit — too many requests in a short window', 'Network connectivity issue'], recovery_steps: ['Verify your Canva API token has the design:content:write scope.', 'Confirm the canva_design_id in the manifest is a published brand template.', 'Wait 30 seconds and retry if you may have hit a rate limit.', 'The job JSON has been saved — you can apply it manually in Canva as a fallback.'], actions: [{ label: 'Open Outputs', target: 'outputs' }] },
      ADOBE_EXPRESS_ERROR: { title: 'Adobe Express job failed', user_message: 'The Adobe Express handoff job could not be completed.', likely_causes: ['No Adobe Express API credentials configured', 'Template URN is invalid or the template has been deleted', 'Network connectivity issue reaching the Adobe Express API'], recovery_steps: ['Go to the Adobe Express engine screen and verify your API credentials are saved.', 'Confirm the template URN in the manifest matches an active Adobe Express template.', 'Check your internet connection and retry.', 'The handoff file has been saved locally — you can open it manually in Adobe Express.'], actions: [{ label: 'Open Outputs', target: 'outputs' }, { label: 'Open Logs', target: 'logs' }] },
      FIGMA_ERROR: { title: 'Figma job failed', user_message: 'The Figma automation job could not be completed.', likely_causes: ['Figma Personal Access Token is missing or invalid', 'The Figma file key in the template manifest does not exist or is inaccessible', 'Network connectivity issue reaching the Figma REST API', 'The specified frame or node ID was not found in the Figma file'], recovery_steps: ['Go to the Figma engine screen → Settings and verify your Personal Access Token.', 'Confirm the token has read access to the Figma file.', 'Check that the Figma file is not in a personal draft (team files only).', 'Re-add the template using the Figma file URL to refresh the file key and node ID.'], actions: [{ label: 'Open Logs', target: 'logs' }] },
      FIREFLY_ERROR: { title: 'Adobe Firefly image generation failed', user_message: 'Firefly could not generate the requested image.', likely_causes: ['Adobe credentials are missing or expired', 'The prompt was rejected by Firefly content policy', 'Network connectivity issue reaching the Adobe Firefly API', 'Firefly API rate limit exceeded'], recovery_steps: ['Go to Adobe Express settings and re-authenticate your Adobe account.', 'Revise the image prompt to avoid restricted content.', 'Wait a moment and retry — rate limits reset within a minute.', 'If the issue persists, use Browse to pick a local image instead.'], actions: [{ label: 'Open Logs', target: 'logs' }] },
      JOB_VALIDATION: { title: 'Job missing required content', user_message: 'The job cannot run because one or more required fields are empty.', likely_causes: ['A required field (Title, Challenge, Solution, or Results) was left blank', 'The job was submitted before all required fields were filled in', 'A batch row is missing required content'], recovery_steps: ['Fill in all fields marked with * before exporting.', 'For batch jobs, expand each row and ensure required fields are populated.', 'Use Generate from Brief to auto-fill content, then review and export.'], actions: [] },
      UNKNOWN: { title: 'Unknown error', user_message: 'An unexpected error occurred.', likely_causes: ['An unclassified error from the automation engine or Adobe API', 'Unexpected response from macOS, Illustrator, InDesign, or a cloud API'], recovery_steps: ['Open the Logs folder and read the full error message for clues.', 'Run System Check to identify any configuration issues.', 'Export a Diagnostics Bundle and check the full error log.', 'Restart the app and retry the operation.'], actions: [{ label: 'Export Diagnostics', target: 'diagnostics' }, { label: 'Open Logs', target: 'logs' }] },
    }),
    getTemplateThumbnail: async (_id: string) => ({ ok: false, thumbnailUrl: null }),
    pickAndUploadCanvaAsset: async () => devMsg('pickAndUploadCanvaAsset'),
    pickLocalFile: async () => devMsg('pickLocalFile'),
    addAdobeExpressTemplate: async (p: any) => ({ ok: true, manifestId: p.templateName?.toUpperCase().replace(/\s+/g,'_') + '_v001' }),
    addLocalTemplate: async (p: any) => ({
      ok: true,
      manifestId: p.templateName?.toUpperCase().replace(/\s+/g, '_') + '_v001',
      templatePath: `/engines/${p.engine}/templates/stub${p.engine === 'indesign' ? '.indd' : '.ai'}`,
    }),
    runAdobeExpressJob: async (p: any) => ({
      ok: true,
      jobId: `adobe_job_${Date.now()}`,
      jobPath: `outputs/adobe_express/adobe_job_stub.job.json`,
      editorUrl: p.editorUrl || 'https://www.adobe.com/express/',
      operationCount: Object.keys(p.content || {}).length,
      mode: 'handoff' as const,
    }),
    exportDiagnostics: async () => devMsg('exportDiagnostics'),
    runSystemCheck: async () => ([
      { id: 'stub_workspace', category: 'workspace', label: 'Outputs → AI folder', status: 'ok', detail: '~/workspace/outputs/ai' },
      { id: 'stub_pdf', category: 'workspace', label: 'Outputs → PDF folder', status: 'ok', detail: '~/workspace/outputs/pdf' },
      { id: 'stub_runner', category: 'engines', label: 'Illustrator automation script', status: 'ok', detail: '~/engines/illustrator/run_illustrator_job.js' },
      { id: 'stub_perm', category: 'permissions', label: 'macOS Automation permission', status: 'info', detail: 'Cannot verify without running an export', exactFix: 'Open System Settings → Privacy & Security → Automation.', autoFixAction: 'open:automation', autoFixLabel: 'Open System Settings' },
    ]),
    autoFix: async (action: string) => ({ ok: true, message: `[Dev stub] would run: ${action}` }),
    setClaudeApiKey: async () => ({ ok: true }),
    getClaudeApiKey: async () => ({ ok: true, hasKey: false, masked: null }),
    askClaudeAboutError: async (p: any) => ({ ok: true, response: `[Dev stub] Claude would analyze: "${p.checkLabel}" — ${p.checkDetail}\n\nIn the real Electron app, this calls the Anthropic API with your configured key.` }),
    askClaude: async (p: any) => {
      // In dev/browser preview there's no Electron IPC — return a helpful stub
      const brand = p.brandContext ? ` (brand: ${p.brandContext.name})` : '';
      return { ok: false, message: `Dev preview — no Anthropic API access in browser. Add your API key and run the Electron app to get live Claude responses${brand}.` };
    },
    onClaudeChunk: (_cb: any) => { return () => {}; },
    claudeAnalyzeImage: async (_p: any) => ({ ok: false, message: 'Dev preview — no vision API in browser.' }),
    checkForUpdates: async () => ({ ok: false, message: 'Dev build — updates disabled' }),
    installUpdate: async () => ({ ok: false }),
    onUpdateStatus: (_cb: any) => { return () => {}; },
    claudeFillFields: async (p: any) => ({
      ok: true,
      filledCount: p.fields?.length ?? 4,
      content: Object.fromEntries((p.fields ?? []).map((f: any) => [f.key, `[Dev stub] Generated content for ${f.label} from brief: "${String(p.brief).slice(0, 60)}…"`])),
    }),
    claudeGenerateBatch: async (p: any) => ({
      ok: true,
      count: p.count ?? 3,
      rows: Array.from({ length: p.count ?? 3 }, (_, i) => ({
        output_name: `Generated_Row_v00${i + 1}`,
        ...Object.fromEntries((p.fields ?? []).map((f: any) => [f.key, `[Dev stub] Row ${i + 1} — ${f.label}`])),
      })),
    }),
    generateFireflyImage: async (p: any) => ({
      ok: true,
      imagePath: '',
      localPath: '',
      prompt: p.prompt,
    }),
    // Skills Studio stubs — returns master skill manifests so the UI is visible in browser preview
    seedMasterSkills: async () => ({ ok: true }),

    // Monday.com stubs
    getMondayConfig: async () => ({ ok: true, hasApiKey: false, maskedKey: null, enabled: false, pollIntervalMs: 120000, boards: [], lastPolledAt: null, polling: false }),
    setMondayApiKey: async () => ({ ok: true }),
    setMondayEnabled: async () => ({ ok: true }),
    testMondayConnection: async () => ({ ok: false, message: 'Dev preview — Monday.com integration requires the Electron app.' }),
    listMondayBoards: async () => ({ ok: false, message: 'Dev preview.', boards: [] }),
    listMondayColumns: async () => ({ ok: false, message: 'Dev preview.', columns: [] }),
    addMondayBoardConfig: async () => ({ ok: true }),
    removeMondayBoardConfig: async () => ({ ok: true }),
    toggleMondayBoard: async () => ({ ok: true }),
    triggerMondayPoll: async () => ({ ok: true, processed: 0, errors: 0, skipped: 0 }),
    getMondayActivity: async () => ({ ok: true, log: [] }),
    setMondayPollInterval: async () => ({ ok: true }),
    listSkills: async () => ({ ok: true, skills: [
      { id: 'case-study-generator',  name: 'Case Study Generator',   version: '1.0.0', category: 'Marketing', description: 'Generates complete case study content across all engines from a campaign brief.', triggers: ['case study', 'generate case study'], engines: ['illustrator', 'indesign', 'canva', 'adobe_express', 'figma'], brandAware: true, master: true },
      { id: 'social-media-campaign', name: 'Social Media Campaign',  version: '1.0.0', category: 'Social',    description: 'Generates scroll-stopping social content for Canva, Adobe Express, and Figma templates.', triggers: ['social media', 'social post', 'instagram', 'linkedin post'], engines: ['canva', 'adobe_express', 'figma'], brandAware: true, master: true },
      { id: 'sales-one-pager',       name: 'Sales One-Pager',        version: '1.0.0', category: 'Sales',     description: 'Generates a crisp sales one-pager with value prop, features, and CTA.', triggers: ['one pager', 'sales sheet', 'sell sheet'], engines: ['illustrator', 'indesign', 'canva'], brandAware: true, master: true },
      { id: 'product-launch',        name: 'Product Launch',         version: '1.0.0', category: 'Marketing', description: 'Generates product launch announcement content across all engines.', triggers: ['product launch', 'launch', 'new product'], engines: ['illustrator', 'indesign', 'canva', 'adobe_express', 'figma'], brandAware: true, master: true },
      { id: 'executive-brief',       name: 'Executive Brief',        version: '1.0.0', category: 'Sales',     description: 'Generates a C-suite facing brief with situation, recommendation, and impact.', triggers: ['executive brief', 'exec summary', 'c-suite'], engines: ['illustrator', 'indesign'], brandAware: true, master: true },
      { id: 'roi-report',            name: 'ROI Report',             version: '1.0.0', category: 'Marketing', description: 'Generates a stats-heavy ROI report with four metrics and testimonial.', triggers: ['roi report', 'roi', 'results report'], engines: ['illustrator', 'indesign', 'canva'], brandAware: true, master: true },
      { id: 'event-promotion',       name: 'Event Promotion',        version: '1.0.0', category: 'Events',    description: 'Generates event promo content for Canva, Adobe Express, and Figma.', triggers: ['event', 'webinar', 'conference'], engines: ['canva', 'adobe_express', 'figma'], brandAware: true, master: true },
      { id: 'brand-awareness',       name: 'Brand Awareness',        version: '1.0.0', category: 'Marketing', description: 'Generates brand storytelling content for visual-first awareness campaigns.', triggers: ['brand awareness', 'brand campaign', 'brand story'], engines: ['canva', 'adobe_express', 'figma'], brandAware: true, master: true },
    ]}),
    getSkill: async (id: string) => {
      const STUB_SKILLS: Record<string, any> = {
        'case-study-generator':  { id: 'case-study-generator',  name: 'Case Study Generator',   version: '1.0.0', category: 'Marketing', description: 'Generates complete case study content across all engines from a campaign brief.', triggers: ['case study', 'generate case study', 'create case study'], engines: ['illustrator', 'indesign', 'canva', 'adobe_express', 'figma'], brandAware: true, master: true },
        'social-media-campaign': { id: 'social-media-campaign', name: 'Social Media Campaign',  version: '1.0.0', category: 'Social',    description: 'Generates scroll-stopping social content for Canva, Adobe Express, and Figma templates.', triggers: ['social media', 'social post', 'instagram', 'linkedin post'], engines: ['canva', 'adobe_express', 'figma'], brandAware: true, master: true },
        'sales-one-pager':       { id: 'sales-one-pager',       name: 'Sales One-Pager',        version: '1.0.0', category: 'Sales',     description: 'Generates a crisp sales one-pager with value prop, features, and CTA.', triggers: ['one pager', 'sales sheet', 'sell sheet'], engines: ['illustrator', 'indesign', 'canva'], brandAware: true, master: true },
        'product-launch':        { id: 'product-launch',        name: 'Product Launch',         version: '1.0.0', category: 'Marketing', description: 'Generates product launch announcement content across all engines.', triggers: ['product launch', 'launch', 'new product'], engines: ['illustrator', 'indesign', 'canva', 'adobe_express', 'figma'], brandAware: true, master: true },
        'executive-brief':       { id: 'executive-brief',       name: 'Executive Brief',        version: '1.0.0', category: 'Sales',     description: 'Generates a C-suite facing brief with situation, recommendation, and impact.', triggers: ['executive brief', 'exec summary', 'c-suite'], engines: ['illustrator', 'indesign'], brandAware: true, master: true },
        'roi-report':            { id: 'roi-report',            name: 'ROI Report',             version: '1.0.0', category: 'Marketing', description: 'Generates a stats-heavy ROI report with four metrics and testimonial.', triggers: ['roi report', 'roi', 'results report'], engines: ['illustrator', 'indesign', 'canva'], brandAware: true, master: true },
        'event-promotion':       { id: 'event-promotion',       name: 'Event Promotion',        version: '1.0.0', category: 'Events',    description: 'Generates event promo content for Canva, Adobe Express, and Figma.', triggers: ['event', 'webinar', 'conference'], engines: ['canva', 'adobe_express', 'figma'], brandAware: true, master: true },
        'brand-awareness':       { id: 'brand-awareness',       name: 'Brand Awareness',        version: '1.0.0', category: 'Marketing', description: 'Generates brand storytelling content for visual-first awareness campaigns.', triggers: ['brand awareness', 'brand campaign', 'brand story'], engines: ['canva', 'adobe_express', 'figma'], brandAware: true, master: true },
      };
      const manifest = STUB_SKILLS[id] ?? { id, name: id, version: '1.0.0', category: 'Marketing', description: '', triggers: [''], engines: [], brandAware: true };
      return {
        ok: true,
        skill: {
          manifest,
          systemPrompt: `You are a creative content strategist for the Creative Automation Platform.\n\nYour job: generate precise, publication-ready marketing copy from a campaign brief.\n\nReturn ONLY a valid JSON object with the exact field keys.`,
          userTemplate: `Generate content for {{engine}} template.\n\nBrand: {{brand_name}}\n\nBrief:\n"{{brief}}"\n\nFields:\n{{field_list}}\n\nReturn a JSON object with these exact keys.`,
          readme: `# ${manifest.name}\n\n${manifest.description}`,
          fields: Object.fromEntries(['illustrator', 'indesign', 'canva', 'adobe_express', 'figma'].map(e => [
            e,
            manifest.engines.includes(e) ? [
              { key: 'HEADLINE', label: 'Headline', required: true, maxChars: 80 },
              { key: 'BODY_COPY', label: 'Body', required: false, maxChars: 400 },
              { key: 'CTA_TEXT', label: 'CTA', required: false, maxChars: 40 },
            ] : [],
          ])),
        },
      };
    },
    saveSkill: async () => ({ ok: true, id: 'dev-stub' }),
    deleteSkill: async () => ({ ok: true }),
    exportSkillZip: async () => ({ ok: false, message: 'Dev preview — export requires Electron.' }),
    importSkillZip: async () => ({ ok: false, message: 'Dev preview — import requires Electron.' }),

    setAdobeFireflyCredentials: async () => ({ ok: true }),
    getAdobeFireflyCredentials: async () => ({ ok: false, hasCredentials: false }),
    revealFile: async () => devMsg('revealFile'),
    openFile: async () => devMsg('openFile'),
    openUrl: async (url: string) => { console.info('[dev] openUrl:', url); return { ok: true }; },
    sendNotification: async (_title: string, _body: string) => ({ ok: true }),
    scanEnginesFolder: async () => ({ ok: false, message: 'Electron not running — cannot scan engines folder.', tree: [], enginesRoot: '' }),

    // Figma
    setFigmaToken: async () => ({ ok: true }),
    getFigmaToken: async () => ({ ok: true, hasToken: false, masked: null }),
    getFigmaFileInfo: async () => ({ ok: true, name: 'Dev Stub — Figma File', pageCount: 2, frameCount: 6, lastModified: new Date().toISOString() }),
    getFigmaVariables: async () => ({ ok: true, variableCount: 4, variableNames: ['TEXT_TITLE', 'TEXT_BODY', 'TEXT_CTA', 'STAT_01'], variables: [] }),
    updateFigmaVariables: async () => ({ ok: true, matched: 0, message: '[Dev stub] Variable update requires Electron.' }),
    exportFigmaFrames: async () => devMsg('exportFigmaFrames'),
    runFigmaJob: async (p: any) => ({
      ok: true,
      mode: 'handoff' as const,
      figmaUrl: `https://www.figma.com/file/stub/${p.figmaFileKey || 'template'}`,
      variablesUpdated: 0,
      message: '[Dev stub] Would update Figma variables and export via Figma REST API in Electron.',
    }),
    addFigmaTemplate: async (p: any) => ({
      ok: true,
      templateId: p.templateName?.toUpperCase().replace(/\s+/g, '_') + '_v001',
      template: {
        id: p.templateName?.toUpperCase().replace(/\s+/g, '_') + '_v001',
        name: p.templateName,
        engine: 'figma',
        isFigma: true,
        figmaFileKey: 'DEV_STUB_KEY',
        figmaNodeId: null,
        figmaUrl: p.figmaUrl,
        thumbnailUrl: null,
        editableObjects: {
          TEXT_TITLE:    { type: 'text', required: true,  max_chars: 120 },
          TEXT_SUBTITLE: { type: 'text', required: false, max_chars: 180 },
          TEXT_BODY:     { type: 'text', required: false, max_chars: 600 },
          TEXT_CTA:      { type: 'text', required: false, max_chars: 120 },
          STAT_01:       { type: 'text', required: false, max_chars: 60  },
          STAT_02:       { type: 'text', required: false, max_chars: 60  },
        },
      },
    }),
    openFigmaDesign: async (url: string) => { window.open(url, '_blank'); },

    // Brand profiles — localStorage-backed so brands survive page reloads in dev preview
    listBrands: async () => {
      const brands = __devLoadBrands();
      const activeId = localStorage.getItem('__cap_dev_active_brand__') || null;
      return { ok: true, brands, activeId };
    },
    createBrand: async (p: any) => {
      const brands = __devLoadBrands();
      const brand = {
        id: `brand_${Date.now()}`,
        name: p.name,
        color: p.color || '#6366f1',
        description: p.description || '',
        templates: p.templates || {},
        isMaster: p.isMaster || false,
        subBrands: p.subBrands || [],
        products: p.products || [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      brands.push(brand);
      __devSaveBrands(brands);
      return { ok: true, brand };
    },
    updateBrand: async (p: any) => {
      const brands = __devLoadBrands();
      const idx = brands.findIndex((b: any) => b.id === p.id);
      if (idx === -1) return { ok: false, message: 'Brand not found' };
      brands[idx] = { ...brands[idx], ...p, updatedAt: new Date().toISOString() };
      __devSaveBrands(brands);
      return { ok: true, brand: brands[idx] };
    },
    deleteBrand: async (id: string) => {
      const brands = __devLoadBrands().filter((b: any) => b.id !== id);
      __devSaveBrands(brands);
      if (localStorage.getItem('__cap_dev_active_brand__') === id)
        localStorage.removeItem('__cap_dev_active_brand__');
      return { ok: true };
    },
    setActiveBrand: async (id: string | null) => {
      if (id) localStorage.setItem('__cap_dev_active_brand__', id);
      else localStorage.removeItem('__cap_dev_active_brand__');
      return { ok: true };
    },
    getActiveBrand: async () => {
      const id = localStorage.getItem('__cap_dev_active_brand__');
      if (!id) return { ok: true, brand: null };
      const brand = __devLoadBrands().find((b: any) => b.id === id) || null;
      return { ok: true, brand };
    },
  };

  // Migrate: auto-assign stub templates to TransPerfect if it has none yet
  (() => {
    const brands = __devLoadBrands();
    const tp = brands.find((b: any) => b.id === 'brand_transperfect');
    if (tp && Object.keys(tp.templates || {}).length === 0) {
      tp.templates = {
        illustrator:   'TRANSPERFECT_CS_v001',
        indesign:      'TRANSPERFECT_ID_v001',
        canva:         'TRANSPERFECT_CANVA_v001',
        adobe_express: 'TRANSPERFECT_AE_v001',
        figma:         'TRANSPERFECT_FIGMA_v001',
      };
      __devSaveBrands(brands);
    }
  })();

  // Pre-seed TransPerfect master brand on first launch
  if (__devLoadBrands().length === 0) {
    const tp: any = {
      id: 'brand_transperfect',
      name: 'TransPerfect',
      color: '#4f86f0',
      description: 'Global leader in language and technology solutions',
      templates: {
        illustrator: 'TRANSPERFECT_CS_v001',
        indesign:    'TRANSPERFECT_ID_v001',
        canva:       'TRANSPERFECT_CANVA_v001',
        adobe_express: 'TRANSPERFECT_AE_v001',
        figma:       'TRANSPERFECT_FIGMA_v001',
      },
      isMaster: true,
      subBrands: [
        { id: 'sub_globallink', name: 'GlobalLink', color: '#3b82f6', description: 'Translation management technology platform' },
        { id: 'sub_tls', name: 'TransPerfect Legal Solutions', color: '#8b5cf6', description: 'Legal translation and eDiscovery services' },
        { id: 'sub_dataperfect', name: 'DataPerfect', color: '#06b6d4', description: 'Data management and analytics division' },
      ],
      products: [
        { id: 'prod_go', name: 'GlobalLink GO', description: 'Cloud-based translation ordering portal', category: 'Platform' },
        { id: 'prod_next', name: 'GlobalLink NEXT', description: 'AI-powered translation management system', category: 'Platform' },
        { id: 'prod_media', name: 'Media & Entertainment', description: 'Subtitling, dubbing, and localization for media', category: 'Services' },
        { id: 'prod_lifesci', name: 'Life Sciences', description: 'Regulatory and clinical trial translation services', category: 'Services' },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    __devSaveBrands([tp]);
    localStorage.setItem('__cap_dev_active_brand__', tp.id);
  }
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>
);
