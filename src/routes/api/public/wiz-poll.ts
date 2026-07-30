import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/wiz-poll")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expectedKey = process.env.SUPABASE_PUBLISHABLE_KEY;
        const providedKey =
          request.headers.get("apikey") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

        if (!expectedKey || providedKey !== expectedKey) {
          return new Response("Unauthorized", { status: 401 });
        }

        try {
          const { fetchWizIssues, postFindingsToSlack } = await import(
            "@/lib/wiz-alerts.server"
          );
          const { supabaseAdmin } = await import(
            "@/integrations/supabase/client.server"
          );

          const issues = await fetchWizIssues(50);
          if (issues.length === 0) {
            return Response.json({ checked: 0, new: 0 });
          }

          const { data: known, error: readError } = await supabaseAdmin
            .from("wiz_findings_seen")
            .select("finding_id")
            .in(
              "finding_id",
              issues.map((i) => i.id),
            );
          if (readError) throw readError;

          const seen = new Set((known ?? []).map((r) => r.finding_id));
          const fresh = issues.filter((i) => !seen.has(i.id));

          if (fresh.length === 0) {
            return Response.json({ checked: issues.length, new: 0 });
          }

          // Record first so a Slack failure can't cause a duplicate-alert loop
          // on the next run; notified_at is stamped only after a successful post.
          const { error: insertError } = await supabaseAdmin
            .from("wiz_findings_seen")
            .upsert(
              fresh.map((i) => ({
                finding_id: i.id,
                severity: i.severity,
                title: i.title,
                status: i.status,
                entity_name: i.entityName,
                url: i.url,
              })),
              { onConflict: "finding_id", ignoreDuplicates: true },
            );
          if (insertError) throw insertError;

          await postFindingsToSlack(fresh);

          await supabaseAdmin
            .from("wiz_findings_seen")
            .update({ notified_at: new Date().toISOString() })
            .in(
              "finding_id",
              fresh.map((i) => i.id),
            );

          return Response.json({ checked: issues.length, new: fresh.length });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error("[wiz-poll]", message);
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
