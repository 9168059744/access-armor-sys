import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ShieldCheck,
  ShieldAlert,
  KeyRound,
  Smartphone,
  Activity,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { getMyOverview } from "@/lib/security.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const fetchOverview = useServerFn(getMyOverview);
  const { data, isLoading } = useQuery({
    queryKey: ["my-overview"],
    queryFn: () => fetchOverview({}),
  });

  if (isLoading || !data) {
    return (
      <AppShell title="Security dashboard">
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  const profile = data.profile;
  const score = profile?.security_score ?? 0;
  const events = data.events;

  const buckets = new Map<string, { day: string; success: number; failed: number }>();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    buckets.set(d, { day: d.slice(5), success: 0, failed: 0 });
  }
  for (const e of events) {
    const key = String(e.created_at).slice(0, 10);
    const bucket = buckets.get(key);
    if (bucket) bucket[e.success ? "success" : "failed"] += 1;
  }
  const chart = [...buckets.values()];

  return (
    <AppShell
      title={`Welcome back, ${profile?.full_name?.split(" ")[0] ?? "there"}`}
      subtitle="Your account posture, enrolled factors and recent authentication activity."
      isAdmin={data.isAdmin}
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="glass rounded-2xl p-6 shadow-panel">
          <p className="text-sm text-muted-foreground">Security score</p>
          <Gauge value={score} />
          <p className="mt-3 text-xs text-muted-foreground">
            {score >= 90
              ? "Strong. MFA active with recovery codes issued."
              : "Complete authenticator enrollment to raise your score."}
          </p>
        </section>

        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2">
          <Stat
            icon={profile?.mfa_enabled ? ShieldCheck : ShieldAlert}
            tone={profile?.mfa_enabled ? "success" : "warning"}
            label="Multi-factor"
            value={profile?.mfa_enabled ? "Enabled" : "Not enrolled"}
            hint="TOTP, 30 second rotation"
          />
          <Stat
            icon={KeyRound}
            tone={data.backupCodes.remaining > 3 ? "success" : "warning"}
            label="Backup codes"
            value={`${data.backupCodes.remaining} / ${data.backupCodes.total}`}
            hint="Single-use recovery codes remaining"
          />
          <Stat
            icon={Smartphone}
            tone="default"
            label="Trusted devices"
            value={String(data.devices.length)}
            hint={data.devices[0]?.device_name ?? "No authenticator registered"}
          />
          <Stat
            icon={Activity}
            tone={profile?.is_locked ? "danger" : "default"}
            label="Account status"
            value={profile?.is_locked ? "Locked" : "Active"}
            hint={profile?.department ?? ""}
          />
        </div>
      </div>

      <section className="mt-4 glass rounded-2xl p-6 shadow-panel">
        <h2 className="text-sm font-medium">Authentication activity — last 14 days</h2>
        <div className="mt-6 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chart}>
              <defs>
                <linearGradient id="ok" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="bad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-destructive)" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="var(--color-destructive)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11 }}
                stroke="var(--color-muted-foreground)"
              />
              <Tooltip
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 12,
                  fontSize: 12,
                }}
              />
              <Area
                type="monotone"
                dataKey="success"
                stroke="var(--color-primary)"
                fill="url(#ok)"
              />
              <Area
                type="monotone"
                dataKey="failed"
                stroke="var(--color-destructive)"
                fill="url(#bad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="mt-4 glass overflow-hidden rounded-2xl shadow-panel">
        <h2 className="border-b border-border/60 px-6 py-4 text-sm font-medium">Activity log</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-6 py-3 font-medium">Event</th>
                <th className="px-6 py-3 font-medium">When</th>
                <th className="px-6 py-3 font-medium">IP address</th>
                <th className="px-6 py-3 font-medium">Device</th>
                <th className="px-6 py-3 font-medium">Location</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-t border-border/50">
                  <td className="px-6 py-3">
                    <span className="flex items-center gap-2">
                      {e.success ? (
                        <CheckCircle2 className="size-4 text-success" />
                      ) : (
                        <XCircle className="size-4 text-destructive" />
                      )}
                      {String(e.event_type).replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-muted-foreground">
                    {new Date(e.created_at).toLocaleString()}
                  </td>
                  <td className="px-6 py-3 font-mono text-xs text-muted-foreground">
                    {e.ip_address ?? "—"}
                  </td>
                  <td className="px-6 py-3 text-muted-foreground">{e.device ?? "—"}</td>
                  <td className="px-6 py-3 text-muted-foreground">{e.location ?? "—"}</td>
                </tr>
              ))}
              {events.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-muted-foreground">
                    No activity recorded yet.
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

function Gauge({ value }: { value: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative mt-4 flex items-center justify-center">
      <svg viewBox="0 0 130 130" className="size-40 -rotate-90">
        <circle cx="65" cy="65" r={r} fill="none" stroke="var(--color-muted)" strokeWidth="10" />
        <circle
          cx="65"
          cy="65"
          r={r}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * Math.min(value, 100)) / 100}
        />
      </svg>
      <span className="absolute font-mono text-3xl font-semibold">{value}</span>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: typeof ShieldCheck;
  label: string;
  value: string;
  hint: string;
  tone: "default" | "success" | "warning" | "danger";
}) {
  const toneClass = {
    default: "bg-primary/15 text-primary",
    success: "bg-success/15 text-success",
    warning: "bg-warning/15 text-warning",
    danger: "bg-destructive/15 text-destructive",
  }[tone];
  return (
    <div className="glass rounded-2xl p-5 shadow-panel">
      <span className={`flex size-9 items-center justify-center rounded-lg ${toneClass}`}>
        <Icon className="size-4" />
      </span>
      <p className="mt-4 text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
      <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
