import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function htmlResponse(title: string, body: string, status = 200) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;background:#0b0b10;color:#eaeaf0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px}.card{max-width:480px;background:#15151d;border:1px solid #25252f;border-radius:12px;padding:28px;text-align:center}h1{margin:0 0 8px;font-size:18px}p{margin:6px 0;color:#a0a0b0;font-size:14px}a{color:#7c9cff}</style>
</head><body><div class="card">${body}</div>
<script>setTimeout(()=>{try{window.close()}catch(e){}},2500)</script>
</body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export const Route = createFileRoute("/api/public/oauth/canva/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const errorParam = url.searchParams.get("error");

        if (errorParam) {
          return htmlResponse(
            "Canva connection failed",
            `<h1>Canva connection failed</h1><p>${errorParam}: ${url.searchParams.get("error_description") ?? ""}</p><p><a href="/settings/integrations">Back to integrations</a></p>`,
            400,
          );
        }
        if (!code || !state) {
          return htmlResponse("Missing parameters", `<h1>Missing code or state</h1>`, 400);
        }

        // Find the integration row whose pending state matches
        const { data: rows, error: lookupErr } = await supabaseAdmin
          .from("workspace_integrations")
          .select("workspace_id, access_token, metadata")
          .eq("provider", "canva");
        if (lookupErr) {
          console.error("[canva-oauth] lookup error", lookupErr);
          return htmlResponse("Error", `<h1>Something went wrong</h1><p>Please try connecting again.</p><p><a href="/settings/integrations">Back to integrations</a></p>`, 500);
        }
        const match = (rows ?? []).find(
          (r: any) => r.metadata?.oauth_pending?.state === state,
        );
        if (!match) {
          return htmlResponse("Invalid state", `<h1>Invalid or expired state</h1><p>Try connecting again.</p>`, 400);
        }

        const meta = match.metadata as any;
        const verifier = meta.oauth_pending.verifier as string;
        const redirectUri = meta.oauth_pending.redirect_uri as string;
        const clientId = meta.client_id as string;
        const clientSecret = match.access_token as string;

        if (!clientId || !clientSecret || !verifier) {
          return htmlResponse("Missing credentials", `<h1>Missing Canva credentials</h1>`, 400);
        }

        const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
        const tokenRes = await fetch("https://api.canva.com/rest/v1/oauth/token", {
          method: "POST",
          headers: {
            Authorization: `Basic ${basic}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            code,
            code_verifier: verifier,
            redirect_uri: redirectUri,
          }).toString(),
        });

        const tokenJson = (await tokenRes.json().catch(() => ({}))) as any;
        if (!tokenRes.ok) {
          console.error("[canva-oauth] token exchange failed", tokenRes.status, tokenJson);
          return htmlResponse(
            "Token exchange failed",
            `<h1>Token exchange failed</h1><p>Please try connecting again.</p><p><a href="/settings/integrations">Back</a></p>`,
            500,
          );
        }

        const expiresAt = tokenJson.expires_in
          ? new Date(Date.now() + Number(tokenJson.expires_in) * 1000).toISOString()
          : null;

        const nextMeta = {
          client_id: clientId,
          status: "connected",
          token_type: tokenJson.token_type ?? "Bearer",
          access_token: tokenJson.access_token,
          refresh_token: tokenJson.refresh_token ?? null,
          expires_at: expiresAt,
          scope: tokenJson.scope ?? null,
          connected_at: new Date().toISOString(),
        };

        const { error: updErr } = await supabaseAdmin
          .from("workspace_integrations")
          .update({
            access_token: clientSecret,
            metadata: nextMeta,
            updated_at: new Date().toISOString(),
          })
          .eq("workspace_id", match.workspace_id)
          .eq("provider", "canva");
        if (updErr) {
          return htmlResponse("Save failed", `<h1>Could not save tokens</h1><p>${updErr.message}</p>`, 500);
        }

        return htmlResponse(
          "Canva connected",
          `<h1>✓ Canva connected</h1><p>You can close this window and return to the app.</p><p><a href="/settings/integrations">Back to integrations</a></p>`,
        );
      },
    },
  },
});
