import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, Download, ExternalLink, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { getWizOverview, refreshWizFindings } from "@/lib/wiz.functions";

export const Route = createFileRoute("/_authenticated/security")({
  component: SecurityOverviewPage,
});

const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFORMATIONAL"] as const;

const SEV_COLOR: Record<string, string> = {
  CRITICAL: "var(--color-destructive)",
  HIGH: "var(--color-warning)",
  MEDIUM: "var(--color-primary)",
  LOW: "var(--color-accent-foreground)",
  INFORMATIONAL: "var(--color-muted-foreground)",
};

const SEV_BADGE: Record<string, string> = {
  CRITICAL: "bg-destructive/15 text-destructive",
  HIGH: "bg-warning/15 text-warning",
  MEDIUM: "bg-primary/15 text-primary",
  LOW: "bg-muted text-muted-foreground",
  INFORMATIONAL: "bg-muted text-muted-foreground",
};

const RISK_WEIGHT: Record<string, number> = {
  CRITICAL: 40,
  HIGH: 15,
  MEDIUM: 5,
  LOW: 1,
  INFORMATIONAL: 0,
};

function SecurityOverviewPage() {
  const fetchOverview = useServerFn(getWizOverview);
  const refresh = useServerFn(refreshWizFindings);
  const queryClient = useQueryClient();
  const [severityFilter, setSeverityFilter] = useState<string>("ALL");

  const { data, isLoading, error } = useQuery({
    queryKey: ["wiz-overview"],
    queryFn: () => fetchOverview({}),
    retry: false,
  });

  const sync = useMutation({
    mutationFn: () => refresh({}),
    onSuccess: (res) => {
      toast.success(`Synced ${res.synced} finding${res.synced === 1 ? "" : "s"} from Wiz`);
      queryClient.invalidateQueries({ queryKey: ["wiz-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const findings = data?.findings ?? [];

  const stats = useMemo(() => {
    const bySeverity = SEVERITIES.map((s) => ({
      severity: s,
      label: s.charAt(0) + s.slice(1).toLowerCase(),
      count: findings.filter((f) => (f.severity ?? "").toUpperCase() === s).length,
    }));

    const days = 30;
    const buckets = new Map<string, { day: string; total: number; critical: number }>();
    for (let i = days - 1; i >= 0; i--) {
      const key = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
      buckets.set(key, { day: key.slice(5), total: 0, critical: 0 });
    }
    for (const f of findings) {
      const bucket = buckets.get(String(f.first_seen_at).slice(0, 10));
      if (!bucket) continue;
      bucket.total += 1;
      if ((f.severity ?? "").toUpperCase() === "CRITICAL") bucket.critical += 1;
    }

    const riskScore = Math.min(
      100,
      findings.reduce((sum, f) => sum + (RISK_WEIGHT[(f.severity ?? "").toUpperCase()] ?? 0), 0),
    );

    const open = findings.filter(
      (f) => !f.status || ["OPEN", "IN_PROGRESS"].includes(String(f.status).toUpperCase()),
    ).length;

    const last7 = findings.filter(
      (f) => Date.now() - new Date(f.first_seen_at).getTime() < 7 * 86_400_000,
    ).length;

    return { bySeverity, trend: [...buckets.values()], riskScore, open, last7 };
  }, [findings]);

  const visible = useMemo(
    () =>
      severityFilter === "ALL"
        ? findings
        : findings.filter((f) => (f.severity ?? "").toUpperCase() === severityFilter),
    [findings, severityFilter],
  );

  if (isLoading) {
    return (
      <AppShell title="Security overview" isAdmin>
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell title="Security overview" isAdmin>
        <div className="glass rounded-2xl p-10 text-center shadow-panel">
          <AlertTriangle className="mx-auto size-6 text-warning" />
          <p className="mt-3 text-sm text-muted-foreground">
            {(error as Error).message === "Forbidden"
              ? "Only administrators can view the security overview."
              : (error as Error).message}
          </p>
        </div>
      </AppShell>
    );
  }

  const riskLabel =
    stats.riskScore >= 70 ? "Critical" : stats.riskScore >= 40 ? "Elevated" : stats.riskScore >= 15 ? "Moderate" : "Low";

  return (
    <AppShell
      title="Security overview"
      subtitle="Wiz cloud posture findings, risk concentration and how exposure is trending."
      isAdmin
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => sync.mutate()} disabled={sync.isPending}>
          {sync.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          Sync from Wiz
        </Button>
        <span className="text-xs text-muted-foreground">
          Findings sync automatically every 15 minutes and alert to Slack.
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Risk level" value={riskLabel} hint={`Weighted score ${stats.riskScore}/100`} />
        <Kpi label="Open findings" value={String(stats.open)} hint="Open or in progress" />
        <Kpi
          label="Critical"
          value={String(stats.bySeverity[0].count)}
          hint="Highest severity issues"
          tone="danger"
        />
        <Kpi label="New this week" value={String(stats.last7)} hint="First seen in last 7 days" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <section className="glass rounded-2xl p-6 shadow-panel lg:col-span-2">
          <h2 className="text-sm font-medium">New findings — last 30 days</h2>
          <div className="mt-6 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.trend}>
                <defs>
                  <linearGradient id="wizTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="wizCrit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-destructive)" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="var(--color-destructive)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Area type="monotone" dataKey="total" stroke="var(--color-primary)" fill="url(#wizTotal)" />
                <Area
                  type="monotone"
                  dataKey="critical"
                  stroke="var(--color-destructive)"
                  fill="url(#wizCrit)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="glass rounded-2xl p-6 shadow-panel">
          <h2 className="text-sm font-medium">Findings by severity</h2>
          <div className="mt-6 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.bySeverity} layout="vertical" margin={{ left: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={90}
                  tick={{ fontSize: 11 }}
                  stroke="var(--color-muted-foreground)"
                />
                <Tooltip
                  cursor={{ fill: "var(--color-muted)", opacity: 0.3 }}
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                  {stats.bySeverity.map((s) => (
                    <Cell key={s.severity} fill={SEV_COLOR[s.severity]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <section className="mt-4 glass overflow-hidden rounded-2xl shadow-panel">
        <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-6 py-4">
          <h2 className="mr-auto text-sm font-medium">Findings</h2>
          {["ALL", ...SEVERITIES].map((s) => (
            <button
              key={s}
              onClick={() => setSeverityFilter(s)}
              className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                severityFilter === s
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-6 py-3 font-medium">Severity</th>
                <th className="px-6 py-3 font-medium">Finding</th>
                <th className="px-6 py-3 font-medium">Resource</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">First seen</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((f) => {
                const sev = (f.severity ?? "UNKNOWN").toUpperCase();
                return (
                  <tr key={f.id} className="border-t border-border/50">
                    <td className="px-6 py-3">
                      <span
                        className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                          SEV_BADGE[sev] ?? "bg-muted text-muted-foreground"
                        }`}
                      >
                        {sev.charAt(0) + sev.slice(1).toLowerCase()}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      {f.url ? (
                        <a
                          href={f.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 hover:text-primary"
                        >
                          {f.title ?? "Wiz issue"}
                          <ExternalLink className="size-3.5" />
                        </a>
                      ) : (
                        (f.title ?? "Wiz issue")
                      )}
                    </td>
                    <td className="px-6 py-3 text-muted-foreground">{f.entity_name ?? "—"}</td>
                    <td className="px-6 py-3 text-muted-foreground">{f.status ?? "—"}</td>
                    <td className="px-6 py-3 text-muted-foreground">
                      {new Date(f.first_seen_at).toLocaleString()}
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                    <ShieldCheck className="mx-auto mb-2 size-6 text-success" />
                    No findings recorded for this filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "default" | "danger";
}) {
  return (
    <div className="glass rounded-2xl p-5 shadow-panel">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-2 text-2xl font-semibold ${tone === "danger" ? "text-destructive" : ""}`}
      >
        {value}
      </p>
      <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
