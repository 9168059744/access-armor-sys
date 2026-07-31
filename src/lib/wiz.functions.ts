import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase
    .from("user_roles")
    .select("id")
    .eq("user_id", context.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden");
}

export const getWizOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data, error } = await supabaseAdmin
      .from("wiz_findings_seen")
      .select("*")
      .order("first_seen_at", { ascending: false })
      .limit(1000);
    if (error) throw error;

    return { findings: data ?? [] };
  });

export const refreshWizFindings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { fetchWizIssues } = await import("./wiz-alerts.server");

    const issues = await fetchWizIssues(200);
    if (issues.length > 0) {
      const { error } = await supabaseAdmin.from("wiz_findings_seen").upsert(
        issues.map((i) => ({
          finding_id: i.id,
          severity: i.severity,
          title: i.title,
          status: i.status,
          entity_name: i.entityName,
          url: i.url,
        })),
        { onConflict: "finding_id" },
      );
      if (error) throw error;
    }
    return { synced: issues.length };
  });
