import { createFileRoute } from "@tanstack/react-router";
import { authenticateAgent, json } from "@/lib/agent-auth.server";

export const Route = createFileRoute("/api/public/agent/ping")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const auth = await authenticateAgent(request);
          return json({ ok: true, agent: auth.name, workspaceId: auth.workspaceId });
        } catch (e) {
          if (e instanceof Response) return e;
          return json({ error: String(e) }, { status: 500 });
        }
      },
    },
  },
});
