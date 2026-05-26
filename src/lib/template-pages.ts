// Shared isomorphic helpers for resolving which page a template variable
// belongs to. Used by both the React form (CreateVariationsTab) and the
// server-side agent claim endpoint so the bridge gets the same answer as
// the editor UI.

export type TemplatePageLite = {
  name?: string;
  width?: number;
  height?: number;
  unit?: string;
  kind?: string;
  page_index?: number;
  artboard_index?: number;
};

export type TemplateVariableLite = {
  name: string;
  label?: string;
  type?: string;
  multiline?: boolean;
  layer?: string;
  page?: number;
};

/**
 * 1-based page index. See CreateVariationsTab.inferFieldPage for the
 * authoring rationale. Kept identical here so server payloads match the UI.
 */
export function resolveFieldPage(
  v: TemplateVariableLite,
  pages: TemplatePageLite[],
): number {
  if (typeof v.page === "number" && v.page > 0) return v.page;
  if (!pages.length) return 1;
  const n = v.name.toLowerCase();
  for (let i = 0; i < pages.length; i++) {
    const slug = (pages[i]?.name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_");
    if (slug && (n.startsWith(slug + "_") || n === slug)) return i + 1;
  }
  const num = n.match(/(?:story|feature|slide|page|panel|p)_?(\d+)/);
  if (num) {
    const idx = parseInt(num[1], 10);
    if (idx >= 1 && idx <= pages.length) return idx;
  }
  if (/^(cover|masthead|issue|magazine_title|company|tagline|brand|hero|lead|intro|front)/.test(n)) return 1;
  if (/^(back|closing|footer_note|ask)/.test(n)) return pages.length;
  return 1;
}

/**
 * Decorate template variables with a resolved `page` so the bridge agent
 * can scope text-frame / placeholder lookups to a specific spread instead
 * of searching the whole document (a frequent source of swapped-on-wrong-page
 * bugs in InDesign automation).
 */
export function enrichVariablesWithPages<T extends TemplateVariableLite>(
  variables: T[],
  pages: TemplatePageLite[],
): (T & { page: number })[] {
  return variables.map((v) => ({ ...v, page: resolveFieldPage(v, pages) }));
}
