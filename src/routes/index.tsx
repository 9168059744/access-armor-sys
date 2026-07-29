import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ShieldCheck,
  KeyRound,
  QrCode,
  Activity,
  LockKeyhole,
  Users,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SecureAuth — MFA Rollout Plan for Enterprise Identity" },
      {
        name: "description",
        content:
          "SecureAuth is a phased multi-factor authentication rollout platform: TOTP enrollment, backup codes, lockout policy, audit logging and admin oversight.",
      },
      { property: "og:title", content: "SecureAuth — MFA Rollout Plan" },
      {
        property: "og:description",
        content:
          "Phased MFA rollout with authenticator enrollment, recovery codes, lockout policy and full authentication audit trails.",
      },
    ],
  }),
  component: Landing,
});

const PILLARS = [
  {
    icon: QrCode,
    title: "Authenticator enrollment",
    body: "Time-based one-time passwords provisioned by QR code and verified server-side against a ±30s drift window.",
  },
  {
    icon: KeyRound,
    title: "Single-use recovery",
    body: "Ten hashed backup codes per identity, consumed exactly once, regenerable from the profile or by an administrator.",
  },
  {
    icon: LockKeyhole,
    title: "Adaptive lockout",
    body: "Failed attempts are counted inside a rolling policy window; breaching the threshold locks the account and pages the admin console.",
  },
  {
    icon: Activity,
    title: "Forensic audit trail",
    body: "Every challenge, refresh and password change is written with IP address, device fingerprint and approximate location.",
  },
];

const PHASES = [
  {
    phase: "Phase 01",
    title: "Pilot — Security & IT",
    body: "24 accounts enrolled, policy baselined at 5 failed attempts / 30 minute lockout window.",
  },
  {
    phase: "Phase 02",
    title: "Privileged access",
    body: "Finance, Legal and Executive identities move to mandatory TOTP with backup codes stored offline.",
  },
  {
    phase: "Phase 03",
    title: "Organisation-wide",
    body: "MFA enforced for every directory account; SMS fallback disabled by default in the policy engine.",
  },
  {
    phase: "Phase 04",
    title: "Continuous assurance",
    body: "Monthly security and authentication reports exported for the audit committee.",
  },
];

const STATS = [
  { value: "99.2%", label: "of pilot logins MFA-verified" },
  { value: "5", label: "attempts before lockout" },
  { value: "30s", label: "TOTP rotation period" },
  { value: "90d", label: "of retained audit history" },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <div className="pointer-events-none fixed inset-0 grid-noise opacity-40" aria-hidden />

      <header className="relative z-20 mx-auto flex h-20 max-w-7xl items-center px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <ShieldCheck className="size-5" />
          </span>
          <span className="font-semibold tracking-tight">SecureAuth</span>
          <span className="ml-2 hidden rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground sm:inline">
            MFA Rollout Plan
          </span>
        </div>
        <Link
          to="/auth"
          className="ml-auto inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-glow transition-transform hover:scale-[1.02]"
        >
          Access console
          <ArrowRight className="size-4" />
        </Link>
      </header>

      <section className="relative mx-auto max-w-4xl px-4 pb-24 pt-16 text-center sm:px-6 sm:pt-24">
        <div
          className="pointer-events-none absolute left-1/2 top-10 -z-10 size-[520px] -translate-x-1/2 rounded-full opacity-40 blur-3xl animate-pulse-ring"
          style={{ background: "var(--gradient-brand)" }}
          aria-hidden
        />
        <p className="inline-flex items-center gap-2 rounded-full border border-border/70 px-3 py-1 text-xs text-muted-foreground">
          <span className="size-1.5 rounded-full bg-success" />
          Capstone deployment · identity assurance programme
        </p>
        <h1 className="mt-6 text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
          Multi-factor authentication,
          <br />
          <span className="text-gradient">rolled out properly.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-balance text-muted-foreground sm:text-lg">
          A working identity-security suite: enforced TOTP enrollment, hashed single-use recovery
          codes, policy-driven account lockout, and an audit trail every reviewer can read.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/auth"
            className="inline-flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-medium text-primary-foreground shadow-glow transition-transform hover:scale-[1.02]"
            style={{ background: "var(--gradient-brand)" }}
          >
            Enroll your authenticator
            <ArrowRight className="size-4" />
          </Link>
        </div>

        <dl className="mx-auto mt-16 grid max-w-3xl grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border/70 bg-border/70 sm:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="bg-card px-4 py-6">
              <dt className="font-mono text-2xl font-semibold text-gradient">{s.value}</dt>
              <dd className="mt-1 text-xs text-muted-foreground">{s.label}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="relative mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">
          Four controls, enforced server-side
        </h2>
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {PILLARS.map((p) => (
            <article key={p.title} className="glass rounded-2xl p-6 shadow-panel">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <p.icon className="size-5" />
              </span>
              <h3 className="mt-4 text-lg font-medium">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="relative mx-auto max-w-4xl px-4 pb-24 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">The rollout plan</h2>
        <ol className="mt-10 space-y-px overflow-hidden rounded-2xl border border-border/70 bg-border/70">
          {PHASES.map((p) => (
            <li key={p.phase} className="flex gap-4 bg-card px-6 py-6">
              <span className="mt-1 font-mono text-xs text-primary">{p.phase}</span>
              <div>
                <h3 className="font-medium">{p.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{p.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="relative mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <div className="glass overflow-hidden rounded-3xl p-8 shadow-glow sm:p-12">
          <div className="grid gap-10 md:grid-cols-2">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                Built for the people who run the programme
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Administrators get a single console for the directory, policy switches, failed
                attempt feeds, lockout monitoring and account recovery — every action written to an
                immutable audit log.
              </p>
              <ul className="mt-6 space-y-3 text-sm">
                {[
                  "Toggle mandatory MFA and SMS fallback",
                  "Tune lockout threshold, window and session timeout",
                  "Unlock accounts and reset authenticator devices",
                  "Export security and authentication summaries",
                ].map((line) => (
                  <li key={line} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                    <span className="text-muted-foreground">{line}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex items-center justify-center rounded-2xl border border-border/70 bg-background/40 p-8">
              <div className="text-center">
                <Users className="mx-auto size-10 text-primary" />
                <p className="mt-4 font-mono text-4xl font-semibold">24</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  sample identities with 90 days of history preloaded
                </p>
                <Link
                  to="/auth"
                  className="mt-6 inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm transition-colors hover:bg-accent"
                >
                  Open the console
                  <ArrowRight className="size-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="relative border-t border-border/60">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-8 text-xs text-muted-foreground sm:flex-row sm:items-center sm:px-6">
          <span>SecureAuth · MFA Rollout Plan · cybersecurity capstone</span>
          <span className="sm:ml-auto">Authentication events retained for 90 days</span>
        </div>
      </footer>
    </div>
  );
}
