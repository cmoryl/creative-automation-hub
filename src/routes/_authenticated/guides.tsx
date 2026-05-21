import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import {
  BookOpen,
  Search,
  LayoutTemplate,
  Layers,
  ClipboardCheck,
  ScrollText,
  Sparkles,
  Wand2,
  Image as ImageIcon,
  FileType,
  MessageSquare,
  ShieldCheck,
  Workflow,
  Gauge,
  Building2,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/guides")({
  component: GuidesPage,
  head: () => ({
    meta: [
      { title: "Template Guides & Playbooks" },
      {
        name: "description",
        content:
          "Enterprise playbooks for templates, batches, approvals, and engine selection.",
      },
    ],
  }),
});

type Guide = {
  id: string;
  title: string;
  category: "template" | "batch" | "governance" | "engine";
  minutes: number;
  description: string;
  steps: string[];
  tips?: string[];
  warnings?: string[];
  related?: { to: string; label: string }[];
  code?: { language: string; label: string; body: string };
};

const GUIDES: Guide[] = [
  {
    id: "template-anatomy",
    title: "Template anatomy: variables, slots & guards",
    category: "template",
    minutes: 6,
    description:
      "How a production template is structured and why each variable should declare a type, fallback, and validation guard.",
    steps: [
      "Name variables in snake_case and group by surface (hero_, body_, cta_).",
      "Set a fallback for every variable so partial briefs still render.",
      "Annotate character limits — headlines ≤ 60, body ≤ 240, legal ≤ 320.",
      "Mark sensitive slots (price, claims, disclaimers) as approval-required.",
    ],
    tips: [
      "Mirror variable names across Illustrator, InDesign, and Claude templates so a single brief drives every engine.",
    ],
    warnings: [
      "Do not embed brand colors directly in templates — pull from the Brand record so rebrands cascade.",
    ],
    related: [
      { to: "/templates", label: "Open templates" },
      { to: "/brands", label: "Manage brands" },
    ],
  },
  {
    id: "content-amounts",
    title: "Content amounts: how much copy per surface",
    category: "template",
    minutes: 4,
    description:
      "Recommended character and word counts per surface to keep layouts crisp across engines.",
    steps: [
      "Hero headline: 4–8 words, ≤ 60 characters.",
      "Subhead: 1 sentence, ≤ 120 characters.",
      "Body block: 2–3 sentences, 180–240 characters.",
      "CTA label: 1–3 words, ≤ 18 characters.",
      "Legal / disclaimer: 1–2 sentences, ≤ 320 characters.",
    ],
    tips: [
      "When Claude exceeds the limit, ask it to compress with a target character count in the brief.",
      "For multi-locale runs, budget +30% length for German and +20% for French.",
    ],
  },
  {
    id: "batch-design",
    title: "Designing a batch that won't fail mid-run",
    category: "batch",
    minutes: 7,
    description:
      "Pre-flight checks, row labels, and dispatch order to keep a 200-row batch from blocking on a single bad row.",
    steps: [
      "Validate the source sheet — required columns, no empty rows, normalized casing.",
      "Add a row_label column so every job is traceable in the Outputs view.",
      "Dry-run the first 3 rows on the mock engine before dispatching the rest.",
      "Stagger heavy engines (Illustrator / InDesign) behind lightweight ones (Claude) to surface errors early.",
    ],
    warnings: [
      "Batches over 500 rows should be split — agent heartbeats can drift on long runs.",
    ],
    related: [
      { to: "/batches", label: "Open batches" },
      { to: "/templates/batch", label: "New batch from template" },
    ],
  },
  {
    id: "approvals",
    title: "Approval workflow: reviewer playbook",
    category: "governance",
    minutes: 5,
    description:
      "Who reviews what, how to leave actionable notes, and when to request a re-render vs. an edit.",
    steps: [
      "Submit the batch for review only after a full dry-run pass.",
      "Reviewer checks brand compliance, claim accuracy, and legal slots first.",
      "Use 'Changes requested' with line-item notes — never reject without a reason.",
      "Approved batches are immutable; clone to iterate.",
    ],
    related: [
      { to: "/approvals", label: "Approval queue" },
      { to: "/audit", label: "Audit log" },
    ],
  },
  {
    id: "audit-trail",
    title: "Reading the audit trail",
    category: "governance",
    minutes: 3,
    description:
      "Every dispatch, approval, and reviewer decision is recorded. Here's how to use the log during a compliance review.",
    steps: [
      "Filter by target_type = 'batch' to see lifecycle for a single run.",
      "Filter by action = 'approval.decided' to export reviewer activity.",
      "Use the project filter when assembling a quarterly compliance pack.",
    ],
    related: [{ to: "/audit", label: "Open audit log" }],
  },
  {
    id: "engine-illustrator",
    title: "Engine: Adobe Illustrator",
    category: "engine",
    minutes: 4,
    description:
      "Best for vector-heavy single-page assets — posters, social tiles, packaging mocks.",
    steps: [
      "Run via the local agent on a workstation with Illustrator 2024+.",
      "Templates must use named text frames matching variable keys.",
      "Outputs: PDF (print) + PNG (web preview) generated per job.",
    ],
    tips: ["Embed fonts in the .ai source — agent doesn't ship system fonts."],
  },
  {
    id: "engine-indesign",
    title: "Engine: Adobe InDesign",
    category: "engine",
    minutes: 5,
    description:
      "Best for multi-page documents — brochures, catalogs, datasheets.",
    steps: [
      "Use Data Merge-style placeholders matching variable keys.",
      "Define master pages for repeating elements (page numbers, footers).",
      "Outputs: PDF/X-1a (press-ready) + low-res PDF (review).",
    ],
    warnings: ["Long documents (>32pp) should be split into chapters."],
  },
  {
    id: "engine-indesign-bridge",
    title: "InDesign bridge: payload contract",
    category: "engine",
    minutes: 6,
    description:
      "Reference ExtendScript for the local bridge agent — claims a job, iterates pages with the resolved field-to-page map, exports per-page PNG + PDF and a master PDF.",
    steps: [
      "Agent POSTs /api/public/agent/claim with its bearer token.",
      "Response includes job.template.byPage[] — one entry per spread with fields[] scoped to that page only.",
      "Script opens job.template.source_ref, iterates pages by docIndex, swaps text frames by field.name, places images, then exports.",
      "Agent uploads each output via /api/public/agent/upload-url and POSTs /api/public/agent/complete with metadata.page set so the server can validate per-page completeness.",
    ],
    tips: [
      "Set metadata.scope='master' on the combined PDF + ZIP so the validator recognises them.",
      "Name InDesign text frames identically to variable names — the script uses item(name) lookup scoped to spread.",
    ],
    warnings: [
      "If any page is missing from the uploads, /complete returns a warnings[] array and the job is flagged on the Runs tab.",
    ],
    code: {
      language: "javascript",
      label: "indesign-bridge.jsx (ExtendScript)",
      body: `// Excerpt — full agent handles auth, upload-url, and retries.
// Payload shape from /api/public/agent/claim:
//   job.template.byPage[] = [{ pageIndex, docIndex, fields[], values }]
//   job.template.expectedOutputs = { perPage: ["preview","pdf"], master: ["pdf","zip"] }

var doc = app.open(File(localPathFor(job.template.source_ref)));
var outputs = [];

for (var i = 0; i < job.template.byPage.length; i++) {
  var page = job.template.byPage[i];
  var spread = doc.pages.item(page.docIndex - 1);

  // Scope frame lookups to this spread only — prevents wrong-page swaps.
  for (var f = 0; f < page.fields.length; f++) {
    var field = page.fields[f];
    var val = page.values[field.name];
    if (val === undefined || val === null) continue;

    if (field.type === "image") {
      var frame = spread.rectangles.itemByName(field.name);
      if (frame.isValid) frame.place(File(localPathFor(val)));
    } else {
      var tf = spread.textFrames.itemByName(field.name);
      if (tf.isValid) {
        tf.contents = String(val);
        // Detect overflow and report back instead of silently truncating.
        if (tf.overflows) report("overset", page.pageIndex, field.name);
      }
    }
  }

  // Export this page as preview PNG + PDF (web-safe).
  outputs.push(exportPage(doc, page, "preview"));
  outputs.push(exportPage(doc, page, "pdf"));
}

// Combined master PDF across all spreads + packaged ZIP.
outputs.push(exportMasterPdf(doc));
outputs.push(packageDoc(doc));

// POST /api/public/agent/complete with outputs, each carrying
// { kind, url, metadata: { page: 3, scope: "page" } } or
// { kind: "pdf", metadata: { scope: "master" } } for the combined file.
postComplete(job.id, "succeeded", outputs);`,
    },
    related: [
      { to: "/settings/agent", label: "Pair an agent" },
      { to: "/library", label: "View templates" },
    ],
  },
  {
    id: "engine-claude",
    title: "Engine: Claude (copy generation)",
    category: "engine",
    minutes: 4,
    description:
      "Server-side engine that drafts copy directly from the brief — no agent required.",
    steps: [
      "Define every text variable in the template — Claude fills them all in one pass.",
      "Brief should include voice, audience, and forbidden phrases.",
      "Output is saved as a JSON text artifact ready to merge into design engines.",
    ],
    tips: [
      "Chain Claude → Illustrator in a batch to generate copy then lay it out automatically.",
    ],
  },
  {
    id: "engine-image",
    title: "Engine: Image generation",
    category: "engine",
    minutes: 3,
    description:
      "Generate hero imagery, backgrounds, or product mocks via the AI gateway.",
    steps: [
      "Provide a style reference URL when consistency matters across a batch.",
      "Set aspect ratio in the template — 16:9 social, 1:1 tile, 4:5 portrait.",
      "Outputs are stored alongside design outputs in the project library.",
    ],
  },
];

const CATEGORIES = [
  { id: "all", label: "All guides", icon: BookOpen },
  { id: "template", label: "Templates", icon: LayoutTemplate },
  { id: "batch", label: "Batches", icon: Layers },
  { id: "governance", label: "Governance", icon: ShieldCheck },
  { id: "engine", label: "Engines", icon: Wand2 },
] as const;

const ENGINE_ICON: Record<string, typeof Sparkles> = {
  "engine-illustrator": ImageIcon,
  "engine-indesign": FileType,
  "engine-claude": MessageSquare,
  "engine-image": Sparkles,
};

function GuidesPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]["id"]>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return GUIDES.filter((g) => {
      const matchesCat = category === "all" || g.category === category;
      const matchesQ =
        !q ||
        g.title.toLowerCase().includes(q) ||
        g.description.toLowerCase().includes(q) ||
        g.steps.some((s) => s.toLowerCase().includes(q));
      return matchesCat && matchesQ;
    });
  }, [query, category]);

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-8">
      <header className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <BookOpen className="h-4 w-4" /> Knowledge base
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Template guides & playbooks
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          Enterprise patterns for templates, batches, approvals, and engine
          selection. Curated so a new operator can ship a compliant batch on
          day one.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard icon={LayoutTemplate} label="Template patterns" value={GUIDES.filter((g) => g.category === "template").length} />
        <StatCard icon={Workflow} label="Batch playbooks" value={GUIDES.filter((g) => g.category === "batch").length} />
        <StatCard icon={ClipboardCheck} label="Governance" value={GUIDES.filter((g) => g.category === "governance").length} />
        <StatCard icon={Gauge} label="Engine deep dives" value={GUIDES.filter((g) => g.category === "engine").length} />
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search guides…"
            className="pl-9"
          />
        </div>
        <Tabs value={category} onValueChange={(v) => setCategory(v as typeof category)}>
          <TabsList>
            {CATEGORIES.map(({ id, label, icon: Icon }) => (
              <TabsTrigger key={id} value={id} className="gap-1.5">
                <Icon className="h-3.5 w-3.5" /> {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <Tabs value={category}>
        {CATEGORIES.map(({ id }) => (
          <TabsContent key={id} value={id} className="mt-0">
            <div className="grid gap-4 lg:grid-cols-2">
              {filtered.length === 0 && (
                <Card className="col-span-full">
                  <CardContent className="py-10 text-center text-sm text-muted-foreground">
                    No guides match that search.
                  </CardContent>
                </Card>
              )}
              {filtered.map((g) => (
                <GuideCard key={g.id} guide={g} />
              ))}
            </div>
          </TabsContent>
        ))}
      </Tabs>

      <Card className="border-primary/40 bg-primary/5">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <CardTitle>Need a custom rollout playbook?</CardTitle>
          </div>
          <CardDescription>
            For org-wide rollouts (50+ seats), pair these guides with a brand
            audit and a reviewer training session.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Link
            to="/brands"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            Configure brands <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <Link
            to="/approvals"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            Review queue <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <Link
            to="/audit"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            Audit log <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Sparkles;
  label: string;
  value: number;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-5">
        <div className="rounded-md bg-primary/10 p-2 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-2xl font-semibold">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function GuideCard({ guide }: { guide: Guide }) {
  const Icon = ENGINE_ICON[guide.id] ?? categoryIcon(guide.category);
  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="rounded-md bg-muted p-2">
              <Icon className="h-4 w-4" />
            </div>
            <Badge variant="secondary" className="capitalize">
              {guide.category}
            </Badge>
          </div>
          <span className="text-xs text-muted-foreground">
            {guide.minutes} min read
          </span>
        </div>
        <CardTitle className="mt-3 text-lg">{guide.title}</CardTitle>
        <CardDescription>{guide.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <ol className="space-y-2 text-sm">
          {guide.steps.map((s, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-medium text-primary">
                {i + 1}
              </span>
              <span className="text-foreground/90">{s}</span>
            </li>
          ))}
        </ol>

        {guide.tips?.map((t, i) => (
          <div
            key={`tip-${i}`}
            className="flex gap-2 rounded-md border border-primary/20 bg-primary/5 p-3 text-xs text-foreground/90"
          >
            <Lightbulb className="h-4 w-4 shrink-0 text-primary" />
            <span>{t}</span>
          </div>
        ))}

        {guide.warnings?.map((w, i) => (
          <div
            key={`warn-${i}`}
            className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-foreground/90"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
            <span>{w}</span>
          </div>
        ))}

        {guide.related && guide.related.length > 0 && (
          <div className="mt-auto flex flex-wrap gap-2 border-t pt-3">
            {guide.related.map((r) => (
              <Link
                key={r.to}
                to={r.to}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <CheckCircle2 className="h-3 w-3" /> {r.label}
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function categoryIcon(cat: Guide["category"]) {
  switch (cat) {
    case "template":
      return LayoutTemplate;
    case "batch":
      return Layers;
    case "governance":
      return ShieldCheck;
    case "engine":
      return Wand2;
    default:
      return ScrollText;
  }
}
