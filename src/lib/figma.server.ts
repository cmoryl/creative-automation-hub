// Cloud-only Figma render helper. Uses a Figma Personal Access Token (PAT)
// stored in process.env.FIGMA_PAT. Render-only: text/image substitution
// requires a Figma plugin (REST API is read-only for nodes).

const FIGMA_API = "https://api.figma.com/v1";

export type FigmaTarget = {
  fileKey: string;
  nodeId: string | null; // null = first top-level frame
};

export function parseFigmaUrl(url: string): FigmaTarget {
  // Examples:
  //   https://www.figma.com/file/ABC123/MyDesign?node-id=12%3A45
  //   https://www.figma.com/design/ABC123/MyDesign?node-id=12-45
  const m = url.match(/figma\.com\/(?:file|design|proto)\/([a-zA-Z0-9]+)/);
  if (!m) throw new Error(`Unrecognized Figma URL: ${url}`);
  const fileKey = m[1];
  const nodeParam = new URL(url).searchParams.get("node-id");
  const nodeId = nodeParam ? decodeURIComponent(nodeParam).replace("-", ":") : null;
  return { fileKey, nodeId };
}

function requirePat(): string {
  const pat = process.env.FIGMA_PAT;
  if (!pat) {
    throw new Error("FIGMA_PAT is not configured. Add it as a project secret to enable Figma rendering.");
  }
  return pat;
}

export async function figmaFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${FIGMA_API}${path}`, {
    headers: { "X-Figma-Token": requirePat() },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 403) throw new Error(`Figma 403: PAT invalid or no access to file. ${body}`);
    if (res.status === 404) throw new Error(`Figma 404: file or node not found. ${body}`);
    throw new Error(`Figma API ${res.status}: ${body}`);
  }
  return (await res.json()) as T;
}

export type FigmaImageFormat = "png" | "jpg" | "svg" | "pdf";

export async function renderNode(opts: {
  fileKey: string;
  nodeIds: string[];
  format?: FigmaImageFormat;
  scale?: number;
}): Promise<Record<string, string>> {
  const format = opts.format ?? "png";
  const scale = opts.scale ?? 2;
  const ids = opts.nodeIds.join(",");
  const q = new URLSearchParams({ ids, format, scale: String(scale) });
  const data = await figmaFetch<{ images: Record<string, string>; err: string | null }>(
    `/images/${opts.fileKey}?${q.toString()}`,
  );
  if (data.err) throw new Error(`Figma render error: ${data.err}`);
  return data.images;
}

export type FigmaNodeSummary = {
  id: string;
  name: string;
  type: string;
  children?: FigmaNodeSummary[];
};

export async function getFileTopLevel(fileKey: string, depth = 2): Promise<{
  name: string;
  lastModified: string;
  document: FigmaNodeSummary;
}> {
  const data = await figmaFetch<{
    name: string;
    lastModified: string;
    document: any;
  }>(`/files/${fileKey}?depth=${depth}`);
  return {
    name: data.name,
    lastModified: data.lastModified,
    document: trimNode(data.document, depth),
  };
}

function trimNode(node: any, depth: number): FigmaNodeSummary {
  return {
    id: node.id,
    name: node.name,
    type: node.type,
    children: depth > 0 && Array.isArray(node.children)
      ? node.children.map((c: any) => trimNode(c, depth - 1))
      : undefined,
  };
}

// Fetch a specific node subtree with full detail (used by template import to
// discover TEXT layer names → variables).
export async function getNodeDetail(fileKey: string, nodeId: string): Promise<any> {
  const data = await figmaFetch<{ nodes: Record<string, { document: any }> }>(
    `/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}`,
  );
  const entry = data.nodes[nodeId] ?? data.nodes[Object.keys(data.nodes)[0]];
  return entry?.document ?? null;
}

// Walk a node tree and collect text/image layer names. Names like `{{headline}}`
// or `var:headline` are treated as variable bindings; otherwise the raw layer
// name is used.
export function extractVariables(root: any): Array<{ name: string; type: "text" | "image"; label?: string }> {
  const out = new Map<string, { name: string; type: "text" | "image"; label?: string }>();
  const norm = (s: string) => {
    const m = String(s ?? "").match(/(?:\{\{\s*([^}]+?)\s*\}\}|^var:(.+)$)/);
    return (m ? (m[1] ?? m[2]) : s).trim();
  };
  function walk(n: any) {
    if (!n || typeof n !== "object") return;
    const nm = typeof n.name === "string" ? n.name.trim() : "";
    if (nm && (n.type === "TEXT" || n.type === "RECTANGLE" || n.type === "ELLIPSE" || n.type === "FRAME")) {
      const key = norm(nm);
      if (key && !key.startsWith("_") && key.length <= 80) {
        const isImage = n.type !== "TEXT" && (n.fills ?? []).some((f: any) => f.type === "IMAGE");
        if (n.type === "TEXT" && !out.has(key)) {
          out.set(key, { name: key, type: "text", label: nm !== key ? nm : undefined });
        } else if (isImage && !out.has(key)) {
          out.set(key, { name: key, type: "image", label: nm !== key ? nm : undefined });
        }
      }
    }
    if (Array.isArray(n.children)) for (const c of n.children) walk(c);
  }
  walk(root);
  return Array.from(out.values());
}


export async function downloadAsBuffer(url: string): Promise<{ buffer: Uint8Array; contentType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Figma image download ${res.status}`);
  const buffer = new Uint8Array(await res.arrayBuffer());
  return { buffer, contentType: res.headers.get("content-type") ?? "image/png" };
}
