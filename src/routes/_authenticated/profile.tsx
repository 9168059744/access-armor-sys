import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, KeyRound, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getMyOverview,
  updateProfile,
  regenerateBackupCodes,
  removeDevice,
} from "@/lib/security.functions";

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const qc = useQueryClient();
  const fetchOverview = useServerFn(getMyOverview);
  const save = useServerFn(updateProfile);
  const regen = useServerFn(regenerateBackupCodes);
  const drop = useServerFn(removeDevice);
  const [codes, setCodes] = useState<string[]>([]);
  const [form, setForm] = useState<Record<string, string> | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["my-overview"],
    queryFn: () => fetchOverview({}),
  });

  if (isLoading || !data) {
    return (
      <AppShell title="Profile">
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  const p = data.profile;
  const values = form ?? {
    fullName: p?.full_name ?? "",
    department: p?.department ?? "",
    jobTitle: p?.job_title ?? "",
    phone: p?.phone ?? "",
  };
  const set = (k: string, v: string) => setForm({ ...values, [k]: v });

  return (
    <AppShell
      title="Profile & recovery"
      subtitle="Keep your directory details current and manage your second factor."
      isAdmin={data.isAdmin}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <form
          className="glass space-y-4 rounded-2xl p-6 shadow-panel"
          onSubmit={async (e) => {
            e.preventDefault();
            await save({
              data: {
                fullName: values.fullName,
                department: values.department,
                jobTitle: values.jobTitle,
                phone: values.phone,
              },
            });
            toast.success("Profile updated");
            qc.invalidateQueries({ queryKey: ["my-overview"] });
          }}
        >
          <h2 className="text-sm font-medium">Directory details</h2>
          {(
            [
              ["fullName", "Full name"],
              ["department", "Department"],
              ["jobTitle", "Job title"],
              ["phone", "Phone"],
            ] as const
          ).map(([k, label]) => (
            <div key={k} className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{label}</Label>
              <Input value={values[k]} maxLength={120} onChange={(e) => set(k, e.target.value)} />
            </div>
          ))}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Email (read only)</Label>
            <Input value={p?.email ?? ""} readOnly disabled />
          </div>
          <Button type="submit">Save changes</Button>
        </form>

        <div className="space-y-4">
          <section className="glass rounded-2xl p-6 shadow-panel">
            <h2 className="text-sm font-medium">Authenticator devices</h2>
            <ul className="mt-4 space-y-2">
              {data.devices.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/40 px-4 py-3 text-sm"
                >
                  <span>{d.device_name}</span>
                  <span className="text-xs text-muted-foreground">
                    added {new Date(d.created_at).toLocaleDateString()}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto"
                    onClick={async () => {
                      await drop({ data: { id: d.id } });
                      toast.success("Device removed");
                      qc.invalidateQueries({ queryKey: ["my-overview"] });
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
              {data.devices.length === 0 ? (
                <li className="text-sm text-muted-foreground">No authenticator registered.</li>
              ) : null}
            </ul>
          </section>

          <section className="glass rounded-2xl p-6 shadow-panel">
            <h2 className="flex items-center gap-2 text-sm font-medium">
              <KeyRound className="size-4 text-primary" />
              Recovery codes
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {data.backupCodes.remaining} of {data.backupCodes.total} codes remaining.
              Regenerating invalidates every previous code.
            </p>
            {codes.length ? (
              <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl border border-border/60 bg-background/50 p-4 font-mono text-sm">
                {codes.map((c) => (
                  <span key={c}>{c}</span>
                ))}
              </div>
            ) : null}
            <Button
              className="mt-4"
              variant="outline"
              onClick={async () => {
                const res = await regen({});
                setCodes(res.codes);
                toast.success("New recovery codes issued");
                qc.invalidateQueries({ queryKey: ["my-overview"] });
              }}
            >
              Regenerate codes
            </Button>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
