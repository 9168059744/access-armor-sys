import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ShieldCheck,
  Loader2,
  ArrowRight,
  Copy,
  Check,
  KeyRound,
  Smartphone,
  AlertTriangle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { markMfaVerified, passwordRules, passwordScore } from "@/lib/mfa-session";
import {
  bootstrapAccount,
  startEnrollment,
  confirmEnrollment,
  verifyMfaCode,
  checkAccountStatus,
  recordFailedLogin,
  logAuthEvent,
} from "@/lib/security.functions";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — CyberShield MFA Console" },
      {
        name: "description",
        content:
          "Register or sign in to CyberShield. Every account completes authenticator enrollment and a one-time-password challenge.",
      },
      { property: "og:title", content: "Sign in — CyberShield MFA Console" },
      {
        property: "og:description",
        content: "Multi-step registration with mandatory TOTP enrollment and recovery codes.",
      },
    ],
  }),
  component: AuthPage,
});

type Step = "credentials" | "details" | "enroll" | "challenge" | "codes";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [step, setStep] = useState<Step>("credentials");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [department, setDepartment] = useState("Information Security");
  const [jobTitle, setJobTitle] = useState("Security Analyst");

  const [secret, setSecret] = useState("");
  const [qr, setQr] = useState("");
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const bootstrap = useServerFn(bootstrapAccount);
  const enroll = useServerFn(startEnrollment);
  const confirm = useServerFn(confirmEnrollment);
  const verify = useServerFn(verifyMfaCode);
  const status = useServerFn(checkAccountStatus);
  const failed = useServerFn(recordFailedLogin);
  const logEvent = useServerFn(logAuthEvent);

  // Returning from an OAuth redirect with a live session: jump straight to the
  // second factor instead of the credential form.
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active || !data.session) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("mfa_enabled, full_name")
        .eq("id", data.session.user.id)
        .maybeSingle();
      if (!active) return;
      setEmail(data.session.user.email ?? "");
      if (profile?.mfa_enabled) setStep("challenge");
      else {
        if (!profile) {
          await bootstrap({
            data: {
              fullName:
                (data.session.user.user_metadata?.full_name as string) ||
                (data.session.user.email ?? "New user"),
              department: "General",
              jobTitle: "Employee",
              email: data.session.user.email ?? "",
            },
          });
        }
        await beginEnrollment();
      }
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function beginEnrollment() {
    const res = await enroll({ data: undefined });
    setSecret(res.secret);
    const QRCode = await import("qrcode");
    setQr(await QRCode.toDataURL(res.uri, { margin: 1, width: 240 }));
    setStep("enroll");
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const locked = await status({ data: { email } });
      if (locked.locked) {
        setError("This account is locked. Ask an administrator to unlock it.");
        return;
      }
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        const result = await failed({ data: { email, reason: signInError.message } });
        setError(
          result.locked
            ? "Too many failed attempts — the account is now locked."
            : `Incorrect credentials. ${result.threshold - result.failures} attempt(s) left before lockout.`,
        );
        return;
      }
      const { data: session } = await supabase.auth.getSession();
      const uid = session.session?.user.id;
      const { data: profile } = await supabase
        .from("profiles")
        .select("mfa_enabled")
        .eq("id", uid!)
        .maybeSingle();
      if (profile?.mfa_enabled) {
        setStep("challenge");
      } else {
        await beginEnrollment();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin + "/auth" },
      });
      if (signUpError) {
        setError(signUpError.message);
        return;
      }
      await bootstrap({ data: { fullName, department, jobTitle, email } });
      await beginEnrollment();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await confirm({
        data: { secret, code, deviceName: "Authenticator app" },
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCodes(res.codes);
      setCode("");
      setStep("codes");
    } finally {
      setBusy(false);
    }
  }

  async function handleChallenge(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await verify({ data: { code } });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      await finish(res.method === "backup" ? "Verified with a backup code" : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function finish(detail?: string) {
    const { data } = await supabase.auth.getUser();
    if (data.user) markMfaVerified(data.user.id);
    if (detail) await logEvent({ data: { eventType: "login_success", success: true, detail } });
    toast.success("Authenticated", { description: "Second factor accepted." });
    navigate({ to: "/dashboard" });
  }

  async function googleSignIn() {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + "/auth",
    });
    if (result.error) {
      setError("Google sign-in failed.");
      setBusy(false);
      return;
    }
    if (result.redirected) return;
    window.location.reload();
  }

  const score = passwordScore(password);

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-12">
      <div className="pointer-events-none fixed inset-0 grid-noise opacity-40" aria-hidden />
      <div
        className="pointer-events-none fixed left-1/2 top-0 -z-10 size-[600px] -translate-x-1/2 rounded-full opacity-30 blur-3xl"
        style={{ background: "var(--gradient-brand)" }}
        aria-hidden
      />

      <div className="w-full max-w-md animate-rise">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <ShieldCheck className="size-5" />
          </span>
          <span className="font-semibold tracking-tight">CyberShield</span>
        </div>

        <div className="glass rounded-2xl p-6 shadow-panel sm:p-8">
          <StepRail step={step} />

          {error ? (
            <p className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive-foreground">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          ) : null}

          {step === "credentials" || step === "details" ? (
            <form
              className="mt-6 space-y-4"
              onSubmit={mode === "signin" ? handleSignIn : handleSignUp}
            >
              <h1 className="text-xl font-semibold tracking-tight">
                {mode === "signin" ? "Sign in to the console" : "Create your identity"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {mode === "signin"
                  ? "Password first, then your authenticator code."
                  : "Every new account must enroll an authenticator before it can be used."}
              </p>

              {mode === "signup" ? (
                <>
                  <Field
                    label="Full name"
                    value={fullName}
                    onChange={setFullName}
                    placeholder="Alex Mercer"
                    required
                  />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Department" value={department} onChange={setDepartment} />
                    <Field label="Job title" value={jobTitle} onChange={setJobTitle} />
                  </div>
                </>
              ) : null}

              <Field
                label="Work email"
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="you@company.com"
                required
              />
              <Field
                label="Password"
                type="password"
                value={password}
                onChange={setPassword}
                required
              />

              {mode === "signup" ? (
                <ul className="space-y-1 rounded-lg border border-border/60 bg-background/40 p-3">
                  <li className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${(score / passwordRules.length) * 100}%`,
                          background: "var(--gradient-brand)",
                        }}
                      />
                    </div>
                    {score}/{passwordRules.length}
                  </li>
                  {passwordRules.map((rule) => (
                    <li
                      key={rule.label}
                      className={`flex items-center gap-2 text-xs ${rule.test(password) ? "text-success" : "text-muted-foreground"}`}
                    >
                      <Check className="size-3" />
                      {rule.label}
                    </li>
                  ))}
                </ul>
              ) : null}

              <Button
                type="submit"
                className="w-full"
                disabled={busy || (mode === "signup" && score < passwordRules.length)}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                {mode === "signin" ? "Continue" : "Create account"}
                <ArrowRight className="size-4" />
              </Button>

              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                or
                <span className="h-px flex-1 bg-border" />
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={googleSignIn}
                disabled={busy}
              >
                Continue with Google
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                {mode === "signin" ? "No account yet?" : "Already enrolled?"}{" "}
                <button
                  type="button"
                  className="text-primary underline-offset-4 hover:underline"
                  onClick={() => {
                    setMode(mode === "signin" ? "signup" : "signin");
                    setError(null);
                  }}
                >
                  {mode === "signin" ? "Register" : "Sign in"}
                </button>
              </p>
            </form>
          ) : null}

          {step === "enroll" ? (
            <form className="mt-6 space-y-4" onSubmit={handleConfirm}>
              <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
                <Smartphone className="size-5 text-primary" />
                Enroll your authenticator
              </h1>
              <p className="text-sm text-muted-foreground">
                Scan this with Google Authenticator, 1Password or Authy, then enter the current
                6-digit code to prove it worked.
              </p>
              {qr ? (
                <div className="flex justify-center rounded-xl border border-border/60 bg-background/60 p-4">
                  <img src={qr} alt="Authenticator enrollment QR code" className="rounded-md" />
                </div>
              ) : (
                <div className="flex h-[240px] items-center justify-center">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              )}
              <div className="rounded-lg border border-border/60 bg-background/40 p-3">
                <p className="text-xs text-muted-foreground">Manual entry key</p>
                <p className="mt-1 break-all font-mono text-xs">{secret}</p>
              </div>
              <OtpField value={code} onChange={setCode} />
              <Button type="submit" className="w-full" disabled={busy || code.length !== 6}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                Verify and activate
              </Button>
            </form>
          ) : null}

          {step === "challenge" ? (
            <form className="mt-6 space-y-4" onSubmit={handleChallenge}>
              <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
                <KeyRound className="size-5 text-primary" />
                Two-factor challenge
              </h1>
              <p className="text-sm text-muted-foreground">
                Enter the 6-digit code from your authenticator, or one of your backup codes.
              </p>
              <OtpField value={code} onChange={setCode} allowBackup />
              <Button type="submit" className="w-full" disabled={busy || code.length < 6}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                Verify
              </Button>
            </form>
          ) : null}

          {step === "codes" ? (
            <div className="mt-6 space-y-4">
              <h1 className="text-xl font-semibold tracking-tight">Save your recovery codes</h1>
              <p className="text-sm text-muted-foreground">
                Each code works once. Store them offline — they are the only way back in if you lose
                your device.
              </p>
              <div className="grid grid-cols-2 gap-2 rounded-xl border border-border/60 bg-background/50 p-4 font-mono text-sm">
                {codes.map((c) => (
                  <span key={c}>{c}</span>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => {
                  navigator.clipboard.writeText(codes.join("\n"));
                  setCopied(true);
                  toast.success("Recovery codes copied");
                }}
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                Copy all codes
              </Button>
              <Button
                type="button"
                className="w-full"
                disabled={!copied}
                onClick={() => finish("Completed enrollment")}
              >
                I've saved them — continue
                <ArrowRight className="size-4" />
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function StepRail({ step }: { step: Step }) {
  const order: Step[] = ["credentials", "enroll", "challenge", "codes"];
  const labels: Record<string, string> = {
    credentials: "Identity",
    enroll: "Enroll",
    challenge: "Verify",
    codes: "Recovery",
  };
  const activeIndex = order.indexOf(step === "details" ? "credentials" : step);
  return (
    <div className="flex items-center gap-2">
      {order.map((s, i) => (
        <div key={s} className="flex flex-1 flex-col gap-1.5">
          <div
            className="h-1 rounded-full transition-colors"
            style={{
              background: i <= activeIndex ? "var(--gradient-brand)" : "var(--color-muted)",
            }}
          />
          <span
            className={`text-[10px] uppercase tracking-wide ${i <= activeIndex ? "text-foreground" : "text-muted-foreground"}`}
          >
            {labels[s]}
          </span>
        </div>
      ))}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type={type}
        value={value}
        placeholder={placeholder}
        required={required}
        maxLength={255}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function OtpField({
  value,
  onChange,
  allowBackup,
}: {
  value: string;
  onChange: (v: string) => void;
  allowBackup?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">
        {allowBackup ? "Authenticator or backup code" : "6-digit code"}
      </Label>
      <Input
        inputMode={allowBackup ? "text" : "numeric"}
        autoComplete="one-time-code"
        value={value}
        maxLength={allowBackup ? 12 : 6}
        placeholder={allowBackup ? "123456 or ABCD-1234" : "123456"}
        onChange={(e) =>
          onChange(
            allowBackup
              ? e.target.value.toUpperCase().slice(0, 12)
              : e.target.value.replace(/\D/g, "").slice(0, 6),
          )
        }
        className="text-center font-mono text-lg tracking-[0.4em]"
      />
    </div>
  );
}
