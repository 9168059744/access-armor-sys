import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Lock, Unlock, RotateCcw } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getAdminOverview,
  adminUserAction,
  updateSecuritySettings,
} from "@/lib/security.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

function AdminPage() {
  const qc = useQueryClient();
  const fetchAdmin = useServerFn(getAdminOverview);
  const act = useServerFn(adminUserAction);
  const saveSettings = useServerFn(updateSecuritySettings);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => fetchAdmin({}),
    retry: false,
  });

  if (error) {
    return (
      <AppShell title="Admin console">
        <p className="text-sm text-muted-foreground">
          You don't have administrator access to this console.
        </p>
      </AppShell>
    );
  }

  if (isLoading || !data) {
    return (
      <AppShell title="Admin console">
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  const s = data.settings;
  const enrolled = data.users.filter((u) => u.mfa_enabled).length;

  async function run(userId: string, action: "unlock" | "lock" | "reset_mfa") {
    await act({ data: { userId, action } });
    toast.success("Action applied");
    qc.invalidateQueries({ queryKey: ["admin-overview"] });
  }

  async function patch(payload: Record<string, boolean | number>) {
    await saveSettings({ data: payload });
    toast.success("Policy updated");
    qc.invalidateQueries({ queryKey: ["admin-overview"] });
  }

  return (
    <AppShell
      title="Admin console"
      subtitle="Directory oversight, policy control and account recovery."
      isAdmin
    >
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Identities", value: data.users.length },
          { label: "MFA enrolled", value: `${enrolled} / ${data.users.length}` },
          { label: "Locked accounts", value: data.users.filter((u) => u.is_locked).length },
        ].map((k) => (
          <div key={k.label} className="glass rounded-2xl p-5 shadow-panel">
            <p className="text-xs text-muted-foreground">{k.label}</p>
            <p className="mt-2 font-mono text-2xl font-semibold">{k.value}</p>
          </div>
        ))}
      </div>

      <section className="mt-4 glass rounded-2xl p-6 shadow-panel">
        <h2 className="text-sm font-medium">Security policy</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {(
            [
              ["require_mfa", "Mandatory MFA for all accounts"],
              ["require_backup_codes", "Require recovery codes at enrollment"],
              ["allow_sms_fallback", "Allow SMS fallback (discouraged)"],
            ] as const
          ).map(([key, label]) => (
            <label
              key={key}
              className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/40 px-4 py-3 text-sm"
            >
              <Switch
                checked={Boolean(s?.[key])}
                onCheckedChange={(v) => patch({ [key]: v })}
              />
              {label}
            </label>
          ))}
          {(
            [
              ["lockout_threshold", "Failed attempts before lockout"],
              ["lockout_minutes", "Lockout window (minutes)"],
              ["session_timeout_minutes", "Session timeout (minutes)"],
              ["password_min_length", "Minimum password length"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{label}</Label>
              <Input
                type="number"
                defaultValue={s?.[key] ?? 0}
                onBlur={(e) => patch({ [key]: Number(e.target.value) })}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="mt-4 glass overflow-hidden rounded-2xl shadow-panel">
        <h2 className="border-b border-border/60 px-6 py-4 text-sm font-medium">Directory</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-6 py-3 font-medium">User</th>
                <th className="px-6 py-3 font-medium">Department</th>
                <th className="px-6 py-3 font-medium">MFA</th>
                <th className="px-6 py-3 font-medium">Score</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((u) => (
                <tr key={u.id} className="border-t border-border/50">
                  <td className="px-6 py-3">
                    <p>{u.full_name}</p>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  </td>
                  <td className="px-6 py-3 text-muted-foreground">{u.department}</td>
                  <td className="px-6 py-3">
                    <span className={u.mfa_enabled ? "text-success" : "text-warning"}>
                      {u.mfa_enabled ? "Enrolled" : "Pending"}
                    </span>
                  </td>
                  <td className="px-6 py-3 font-mono">{u.security_score}</td>
                  <td className="px-6 py-3">
                    <span className={u.is_locked ? "text-destructive" : "text-muted-foreground"}>
                      {u.is_locked ? "Locked" : "Active"}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => run(u.id, u.is_locked ? "unlock" : "lock")}
                      >
                        {u.is_locked ? <Unlock className="size-4" /> : <Lock className="size-4" />}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => run(u.id, "reset_mfa")}>
                        <RotateCcw className="size-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-4 glass overflow-hidden rounded-2xl shadow-panel">
        <h2 className="border-b border-border/60 px-6 py-4 text-sm font-medium">
          Recent failed attempts
        </h2>
        <ul className="divide-y divide-border/50">
          {data.failedAttempts.slice(0, 12).map((a) => (
            <li key={a.id} className="flex flex-wrap gap-x-4 px-6 py-3 text-sm">
              <span>{a.email}</span>
              <span className="font-mono text-xs text-muted-foreground">{a.ip_address ?? "—"}</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {new Date(a.created_at).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </AppShell>
  );
}
