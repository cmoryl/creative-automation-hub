import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Save (or update) a Figma personal access token for the current workspace.
export const saveFigmaToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ token: z.string().min(20).max(200) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: ws } = await supabase
      .from("workspaces")
      .select("id")
      .eq("owner_id", userId)
      .limit(1)
      .maybeSingle();
    if (!ws) throw new Error("No workspace");

    // Verify token works
    const me = await fetch("https://api.figma.com/v1/me", {
      headers: { "X-Figma-Token": data.token },
    });
    if (!me.ok) throw new Error(`Invalid Figma token (${me.status})`);
    const profile = (await me.json()) as { email?: string; handle?: string };

    const { error } = await supabaseAdmin
      .from("workspace_integrations")
      .upsert(
        {
          workspace_id: ws.id,
          provider: "figma",
          access_token: data.token,
          metadata: { email: profile.email, handle: profile.handle },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "workspace_id,provider" },
      );
    if (error) throw error;
    return { connected: true, handle: profile.handle };
  });

// Import a Figma file as a template entry.
export const importFigmaTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ fileUrl: z.string().url() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: ws } = await supabase
      .from("workspaces")
      .select("id")
      .eq("owner_id", userId)
      .limit(1)
      .maybeSingle();
    if (!ws) throw new Error("No workspace");

    const { data: integ } = await supabaseAdmin
      .from("workspace_integrations")
      .select("access_token")
      .eq("workspace_id", ws.id)
      .eq("provider", "figma")
      .maybeSingle();
    if (!integ) throw new Error("Connect Figma first");

    const match = data.fileUrl.match(/figma\.com\/(?:file|design)\/([A-Za-z0-9]+)/);
    if (!match) throw new Error("Could not parse Figma file key from URL");
    const key = match[1];

    const res = await fetch(`https://api.figma.com/v1/files/${key}?depth=1`, {
      headers: { "X-Figma-Token": integ.access_token },
    });
    if (!res.ok) throw new Error(`Figma API ${res.status}`);
    const file = (await res.json()) as { name: string; thumbnailUrl?: string };

    // Extract first page frames as "variables" stub
    const detailRes = await fetch(`https://api.figma.com/v1/files/${key}?depth=2`, {
      headers: { "X-Figma-Token": integ.access_token },
    });
    const detail = await detailRes.json() as {
      document?: { children?: Array<{ children?: Array<{ id: string; name: string; type: string }> }> };
    };
    const frames = detail.document?.children?.[0]?.children?.filter((c) => c.type === "FRAME") ?? [];
    const variables = frames.map((f) => ({ id: f.id, name: f.name, kind: "frame" }));

    const { data: tpl, error } = await supabase
      .from("templates")
      .insert({
        workspace_id: ws.id,
        name: file.name,
        engine: "figma",
        source_ref: key,
        preview_url: file.thumbnailUrl ?? null,
        variables,
      })
      .select("id, name")
      .single();
    if (error) throw error;
    return tpl;
  });
