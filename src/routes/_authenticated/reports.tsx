import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Download } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { getReportData } from "@/lib/security.functions";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
});

function ReportsPage() {
  const fetchReport = useServerFn(getReportData);
  const { data, isLoading } = useQuery({
    queryKey: ["report", 30],
    queryFn: () => fetchReport({ data: { days: 30 } }),
  });

  if (isLoading || !data) {
    return (
      <AppShell title="Reports">
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  const total = data.events.length;
  const failures = data.events.filter((e) => !e.success).length;
  const enrolled = data.users.filter((u) => u.mfa_enabled).length;

  function exportCsv() {
    const rows = [
      ["timestamp", "email", "event", "success", "ip", "device", "location"],
      ...data!.events.map((e) => [
        e.created_at,
        e.email ?? "",
        e.event_type,
        String(e.success),
        e.ip_address ?? "",
        e.device ?? "",
        e.location ?? "",
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "secureauth-authentication-report.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppShell
      title="Reports"
      subtitle="Rolling 30-day authentication summary for the audit committee."
      isAdmin={data.isAdmin}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Events recorded", value: total },
          { label: "Failed challenges", value: failures },
          {
            label: "MFA coverage",
            value: data.isAdmin
              ? `${Math.round((enrolled / Math.max(data.users.length, 1)) * 100)}%`
              : "—",
          },
        ].map((k) => (
          <div key={k.label} className="glass rounded-2xl p-5 shadow-panel">
            <p className="text-xs text-muted-foreground">{k.label}</p>
            <p className="mt-2 font-mono text-2xl font-semibold">{k.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex gap-2">
        <Button onClick={exportCsv}>
          <Download className="size-4" />
          Export CSV
        </Button>
        <Button variant="outline" onClick={() => window.print()}>
          Print / save as PDF
        </Button>
      </div>

      <section className="mt-4 glass overflow-hidden rounded-2xl shadow-panel">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-6 py-3 font-medium">When</th>
                <th className="px-6 py-3 font-medium">Identity</th>
                <th className="px-6 py-3 font-medium">Event</th>
                <th className="px-6 py-3 font-medium">Result</th>
                <th className="px-6 py-3 font-medium">IP</th>
              </tr>
            </thead>
            <tbody>
              {data.events.slice(0, 100).map((e) => (
                <tr key={e.id} className="border-t border-border/50">
                  <td className="px-6 py-3 text-muted-foreground">
                    {new Date(e.created_at).toLocaleString()}
                  </td>
                  <td className="px-6 py-3">{e.email ?? "—"}</td>
                  <td className="px-6 py-3">{String(e.event_type).replace(/_/g, " ")}</td>
                  <td className={`px-6 py-3 ${e.success ? "text-success" : "text-destructive"}`}>
                    {e.success ? "Success" : "Failed"}
                  </td>
                  <td className="px-6 py-3 font-mono text-xs text-muted-foreground">
                    {e.ip_address ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
