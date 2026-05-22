// Failure classifier for the smart-retry system.
//
// Decides whether a failed job should be auto-requeued. Transient failures are
// things outside the artwork itself (network blips, app locks, timeouts, disk
// full, agent crash). Permanent failures point at the template/content and
// will fail again on retry — missing fonts, missing links, ExtendScript
// scripting errors. We never auto-retry permanent failures.

export type FailureClassification = {
  transient: boolean;
  reason: string;          // short tag, e.g. "timeout", "missing_font"
  backoff_ms: number;      // ignored when transient = false
};

const TRANSIENT_PATTERNS: Array<{ re: RegExp; reason: string; backoff_ms: number }> = [
  { re: /\b(etimedout|timed?\s*out|deadline\s*exceeded)\b/i, reason: "timeout", backoff_ms: 30_000 },
  { re: /\b(econnreset|econnrefused|enotfound|network)\b/i,   reason: "network", backoff_ms: 30_000 },
  { re: /\b(socket hang up|fetch failed|connect\s*timeout)\b/i, reason: "network", backoff_ms: 30_000 },
  { re: /\b(locked|in use by another|file is open in another)\b/i, reason: "file_locked", backoff_ms: 45_000 },
  { re: /\b(app(lication)? (is )?busy|cannot communicate|host application is busy)\b/i, reason: "app_busy", backoff_ms: 60_000 },
  { re: /\b(no such file|enoent).*tmp/i, reason: "tmp_missing", backoff_ms: 15_000 },
  { re: /\b(disk full|enospc|no space left)\b/i, reason: "disk_full", backoff_ms: 120_000 },
  { re: /\b(upload (failed|aborted)|presigned|s3|signed url expired)\b/i, reason: "upload", backoff_ms: 20_000 },
  { re: /\bhttp\s*5\d\d\b/i, reason: "upstream_5xx", backoff_ms: 30_000 },
];

// These ALWAYS win — even if a transient-looking word appears in the same log.
const PERMANENT_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /font (not found|missing|unavailable)/i, reason: "missing_font" },
  { re: /link (not found|missing)/i,             reason: "missing_link" },
  { re: /undefined is not (an object|a function)/i, reason: "extendscript_bug" },
  { re: /the (object|file|document) (does not exist|is not (open|valid))/i, reason: "doc_invalid" },
  { re: /unsupported (file|format|version)/i,    reason: "unsupported_format" },
  { re: /^\s*syntax\s*error/i,                   reason: "extendscript_bug" },
];

export type CompleteErrorDetail = {
  message?: string;
  stack?: string;
  extendscript_log?: string;
  missing_fonts?: string[];
  missing_links?: string[];
  files?: Array<{ name: string; exists?: boolean }>;
  reason_hints?: string[];
};

// Map agent-side reason_hints to classifier verdicts. Lets the agent pre-tag
// well-known failure modes so we still classify correctly even when the raw
// ExtendScript log is truncated or noisy.
const HINT_VERDICTS: Record<string, FailureClassification> = {
  permission_denied:    { transient: false, reason: "permission_denied",   backoff_ms: 0 },
  missing_pdf_preset:   { transient: false, reason: "missing_pdf_preset",  backoff_ms: 0 },
  color_profile:        { transient: false, reason: "color_profile",       backoff_ms: 0 },
  locked_layer:         { transient: false, reason: "locked_layer",        backoff_ms: 0 },
  file_locked:          { transient: true,  reason: "file_locked",         backoff_ms: 45_000 },
  app_busy:             { transient: true,  reason: "app_busy",            backoff_ms: 60_000 },
  app_crash:            { transient: true,  reason: "app_crash",           backoff_ms: 90_000 },
};

export function classifyFailure(
  errorText: string | null | undefined,
  errorStage: string | null | undefined,
  detail: CompleteErrorDetail | null | undefined,
): FailureClassification {
  // Structured signals always win over log-text matching.
  if ((detail?.missing_fonts?.length ?? 0) > 0) {
    return { transient: false, reason: "missing_font", backoff_ms: 0 };
  }
  if ((detail?.missing_links?.length ?? 0) > 0) {
    return { transient: false, reason: "missing_link", backoff_ms: 0 };
  }
  if (detail?.files?.some((f) => f.exists === false)) {
    return { transient: false, reason: "missing_file", backoff_ms: 0 };
  }
  if (errorStage === "fonts") return { transient: false, reason: "missing_font", backoff_ms: 0 };
  if (errorStage === "links") return { transient: false, reason: "missing_link", backoff_ms: 0 };

  // Agent-supplied hints: permanent first (so they beat a transient log line),
  // then transient.
  for (const h of detail?.reason_hints ?? []) {
    const v = HINT_VERDICTS[h];
    if (v && !v.transient) return v;
  }
  for (const h of detail?.reason_hints ?? []) {
    const v = HINT_VERDICTS[h];
    if (v && v.transient) return v;
  }

  const haystack = [errorText, detail?.message, detail?.extendscript_log, detail?.stack]
    .filter(Boolean)
    .join("\n");

  for (const p of PERMANENT_PATTERNS) {
    if (p.re.test(haystack)) return { transient: false, reason: p.reason, backoff_ms: 0 };
  }
  for (const p of TRANSIENT_PATTERNS) {
    if (p.re.test(haystack)) return { transient: true, reason: p.reason, backoff_ms: p.backoff_ms };
  }

  // Unknown failures: do NOT auto-retry. Better to surface than to loop.
  return { transient: false, reason: "unknown", backoff_ms: 0 };
}

// Exponential-ish backoff: base * 2^retryCount, capped at 5 minutes.
export function computeBackoffMs(baseMs: number, retryCount: number): number {
  const factor = Math.min(2 ** retryCount, 8);
  return Math.min(baseMs * factor, 5 * 60_000);
}

// Default remediation hints keyed by the classifier `reason`. Surfaced in the
// substitution / error report UI when the agent doesn't pre-fill suggestions.
const REASON_SUGGESTIONS: Record<string, string[]> = {
  missing_font: [
    "Install the missing font on the render host, or add a fallback in the template's font map.",
    "Confirm the font file is licensed and reachable from the agent's font directory.",
  ],
  missing_link: [
    "Re-upload the linked asset to the project, or update the template to point at the new URL.",
    "If the link is a CDN URL, verify it's still reachable from the agent's network.",
  ],
  missing_file: [
    "The template file referenced doesn't exist on the agent. Re-sync templates from the dashboard.",
  ],
  extendscript_bug: [
    "ExtendScript runtime error — usually a null reference inside the template script. Re-export the .ai/.indd from Illustrator/InDesign and re-upload.",
    "If this started after a template edit, roll back the template's last change and retry.",
  ],
  doc_invalid: [
    "The source document couldn't be opened. Verify the file isn't corrupted and was saved by a supported app version.",
  ],
  unsupported_format: [
    "Illustrator/InDesign version mismatch. Save the template down to a version the render host supports.",
  ],
  timeout: [
    "Network timeout — the agent will auto-retry. If this keeps happening, check the agent's outbound connectivity.",
  ],
  network: [
    "Network blip — auto-retried. Persistent failures usually mean DNS or proxy issues on the agent.",
  ],
  file_locked: [
    "The template file is open in another process on the agent host. Close Illustrator/InDesign and let the retry run.",
  ],
  app_busy: [
    "Illustrator/InDesign is busy (modal dialog or another script). The agent will retry — make sure no dialogs are blocking the UI.",
  ],
  tmp_missing: [
    "Temp working directory was cleared mid-render. The retry will recreate it.",
  ],
  disk_full: [
    "Render host is out of disk space. Free space in the agent's working/output directory.",
  ],
  upload: [
    "Upload to storage failed. The retry will request a fresh signed URL.",
  ],
  upstream_5xx: [
    "Upstream service returned a 5xx. Auto-retrying; check the storage provider's status page if it persists.",
  ],
  unknown: [
    "Unknown failure — review the raw ExtendScript log below and copy diagnostics if you need to share.",
  ],
};

export function suggestionsForReason(reason: string): string[] {
  return REASON_SUGGESTIONS[reason] ?? REASON_SUGGESTIONS.unknown;
}
