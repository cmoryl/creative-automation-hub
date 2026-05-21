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
