import { createFileRoute } from "@tanstack/react-router";
import { AuditFeed } from "@/components/AuditFeed";
import { ScrollText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/audit")({
  component: AuditPage,
});

function AuditPage() {
  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <header className="mb-8">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <ScrollText className="h-6 w-6 text-primary" />
          Audit Log
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tamper-evident record of every governance event in your workspace — approvals, batches, templates, and brand changes.
        </p>
      </header>
      <AuditFeed
        limit={100}
        title="All workspace activity"
        description="Newest first. Streams live as events occur."
      />
    </div>
  );
}
