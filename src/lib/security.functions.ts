import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const bootstrapAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        fullName: z.string().trim().min(1).max(120),
        department: z.string().trim().max(80).default("General"),
        jobTitle: z.string().trim().max(80).default("Employee"),
        email: z.string().trim().email().max(255),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { userId } = context;

    await supabaseAdmin.from("profiles").upsert(
      {
        id: userId,
        email: data.email,
        full_name: data.fullName,
        department: data.department,
        job_title: data.jobTitle,
        security_score: 45,
      },
      { onConflict: "id" },
    );

    const { count } = await supabaseAdmin
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");

    const role = (count ?? 0) === 0 ? "admin" : "user";
    await supabaseAdmin.from("user_roles").upsert(
      { user_id: userId, role },
      { onConflict: "user_id,role" },
    );

    const { clientMeta } = await import("./request-meta.server");
    const meta = clientMeta();
    await supabaseAdmin.from("auth_events").insert({
      user_id: userId,
      email: data.email,
      event_type: "account_created",
      success: true,
      ip_address: meta.ip,
      user_agent: meta.ua,
      device: meta.device,
      location: meta.location,
      detail: `Registered as ${role}`,
    });

    return { role };
  });

export const startEnrollment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const totp = await import("./totp.server");
    const secret = totp.generateSecret();
    const email = (context.claims.email as string) ?? "user";
    return { secret, uri: totp.otpauthUri({ secret, account: email, issuer: "SecureAuth" }) };
  });

export const confirmEnrollment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        secret: z.string().trim().min(16).max(64),
        code: z.string().trim().regex(/^\d{6}$/),
        deviceName: z.string().trim().min(1).max(60).default("Authenticator app"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const totp = await import("./totp.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const ok = await totp.verifyTotp(data.secret, data.code);
    if (!ok) return { ok: false as const, error: "That code didn't match. Try the current one." };

    await supabaseAdmin.from("mfa_factors").insert({
      user_id: context.userId,
      secret: data.secret,
      device_name: data.deviceName,
      confirmed_at: new Date().toISOString(),
    });

    const codes = totp.generateBackupCodes();
    const hashes = await Promise.all(codes.map((c) => totp.hashCode(c)));
    await supabaseAdmin
      .from("backup_codes")
      .insert(hashes.map((code_hash) => ({ user_id: context.userId, code_hash })));

    await supabaseAdmin
      .from("profiles")
      .update({ mfa_enabled: true, security_score: 92, updated_at: new Date().toISOString() })
      .eq("id", context.userId);

    const { clientMeta } = await import("./request-meta.server");
    const meta = clientMeta();
    await supabaseAdmin.from("auth_events").insert({
      user_id: context.userId,
      email: (context.claims.email as string) ?? null,
      event_type: "mfa_enrolled",
      success: true,
      ip_address: meta.ip,
      user_agent: meta.ua,
      device: meta.device,
      location: meta.location,
      detail: data.deviceName,
    });

    return { ok: true as const, codes };
  });

export const verifyMfaCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ code: z.string().trim().min(6).max(12) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const totp = await import("./totp.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { clientMeta } = await import("./request-meta.server");
    const meta = clientMeta();
    const email = (context.claims.email as string) ?? null;

    const log = (event_type: string, success: boolean, detail?: string) =>
      supabaseAdmin.from("auth_events").insert({
        user_id: context.userId,
        email,
        event_type,
        success,
        ip_address: meta.ip,
        user_agent: meta.ua,
        device: meta.device,
        location: meta.location,
        detail: detail ?? null,
      });

    const { data: factors } = await supabaseAdmin
      .from("mfa_factors")
      .select("id, secret")
      .eq("user_id", context.userId)
      .not("confirmed_at", "is", null);

    for (const factor of factors ?? []) {
      if (await totp.verifyTotp(factor.secret, data.code)) {
        await supabaseAdmin
          .from("mfa_factors")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", factor.id);
        await supabaseAdmin
          .from("profiles")
          .update({ last_login_at: new Date().toISOString() })
          .eq("id", context.userId);
        await log("mfa_challenge", true, "TOTP verified");
        if (email) await supabaseAdmin.from("login_attempts").insert({ email, ip_address: meta.ip, success: true });
        return { ok: true as const, method: "totp" as const };
      }
    }

    // Backup code fallback
    const hash = await totp.hashCode(data.code);
    const { data: backup } = await supabaseAdmin
      .from("backup_codes")
      .select("id")
      .eq("user_id", context.userId)
      .eq("code_hash", hash)
      .is("used_at", null)
      .maybeSingle();

    if (backup) {
      await supabaseAdmin
        .from("backup_codes")
        .update({ used_at: new Date().toISOString() })
        .eq("id", backup.id);
      await log("backup_code_used", true, "Single-use recovery code consumed");
      return { ok: true as const, method: "backup" as const };
    }

    await log("mfa_challenge", false, "Invalid verification code");
    if (email)
      await supabaseAdmin
        .from("login_attempts")
        .insert({ email, ip_address: meta.ip, success: false, reason: "invalid_totp" });

    return { ok: false as const, error: "Invalid verification code." };
  });

export const regenerateBackupCodes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const totp = await import("./totp.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("backup_codes").delete().eq("user_id", context.userId);
    const codes = totp.generateBackupCodes();
    const hashes = await Promise.all(codes.map((c) => totp.hashCode(c)));
    await supabaseAdmin
      .from("backup_codes")
      .insert(hashes.map((code_hash) => ({ user_id: context.userId, code_hash })));
    const { clientMeta } = await import("./request-meta.server");
    const meta = clientMeta();
    await supabaseAdmin.from("auth_events").insert({
      user_id: context.userId,
      email: (context.claims.email as string) ?? null,
      event_type: "backup_codes_regenerated",
      success: true,
      ip_address: meta.ip,
      device: meta.device,
      user_agent: meta.ua,
      location: meta.location,
    });
    return { codes };
  });

export const removeDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("mfa_factors")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    const { count } = await supabaseAdmin
      .from("mfa_factors")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .not("confirmed_at", "is", null);
    if ((count ?? 0) === 0) {
      await supabaseAdmin
        .from("profiles")
        .update({ mfa_enabled: false, security_score: 45 })
        .eq("id", context.userId);
    }
    const { clientMeta } = await import("./request-meta.server");
    const meta = clientMeta();
    await supabaseAdmin.from("auth_events").insert({
      user_id: context.userId,
      email: (context.claims.email as string) ?? null,
      event_type: "mfa_device_removed",
      success: true,
      ip_address: meta.ip,
      user_agent: meta.ua,
      device: meta.device,
      location: meta.location,
    });
    return { ok: true };
  });

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        fullName: z.string().trim().min(1).max(120),
        department: z.string().trim().max(80),
        jobTitle: z.string().trim().max(80),
        phone: z.string().trim().max(40).optional().or(z.literal("")),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({
        full_name: data.fullName,
        department: data.department,
        job_title: data.jobTitle,
        phone: data.phone || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const logAuthEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        eventType: z.string().trim().max(48),
        success: z.boolean().default(true),
        detail: z.string().trim().max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { clientMeta } = await import("./request-meta.server");
    const meta = clientMeta();
    await supabaseAdmin.from("auth_events").insert({
      user_id: context.userId,
      email: (context.claims.email as string) ?? null,
      event_type: data.eventType,
      success: data.success,
      detail: data.detail ?? null,
      ip_address: meta.ip,
      user_agent: meta.ua,
      device: meta.device,
      location: meta.location,
    });
    return { ok: true };
  });

export const recordFailedLogin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        email: z.string().trim().email().max(255),
        reason: z.string().trim().max(60).default("invalid_password"),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { clientMeta } = await import("./request-meta.server");
    const meta = clientMeta();
    await supabaseAdmin
      .from("login_attempts")
      .insert({ email: data.email, ip_address: meta.ip, success: false, reason: data.reason });

    const { data: settings } = await supabaseAdmin
      .from("security_settings")
      .select("lockout_threshold, lockout_minutes")
      .eq("id", 1)
      .maybeSingle();

    const threshold = settings?.lockout_threshold ?? 5;
    const windowStart = new Date(Date.now() - (settings?.lockout_minutes ?? 30) * 60_000).toISOString();

    const { count } = await supabaseAdmin
      .from("login_attempts")
      .select("id", { count: "exact", head: true })
      .eq("email", data.email)
      .eq("success", false)
      .gte("created_at", windowStart);

    const failures = count ?? 0;
    if (failures >= threshold) {
      await supabaseAdmin
        .from("profiles")
        .update({ is_locked: true, locked_at: new Date().toISOString() })
        .eq("email", data.email);
      return { locked: true, failures, threshold };
    }
    return { locked: false, failures, threshold };
  });

export const checkAccountStatus = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ email: z.string().trim().email().max(255) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("is_locked")
      .eq("email", data.email)
      .maybeSingle();
    return { locked: Boolean(profile?.is_locked) };
  });

export const getMyOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [profileRes, eventsRes, devicesRes, codesRes, settingsRes, roleRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase
        .from("auth_events")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(40),
      supabase.from("mfa_factors").select("*").eq("user_id", userId).order("created_at"),
      supabase.from("backup_codes").select("id, used_at").eq("user_id", userId),
      supabase.from("security_settings").select("*").eq("id", 1).maybeSingle(),
      supabase.from("user_roles").select("id").eq("user_id", userId).eq("role", "admin").maybeSingle(),
    ]);

    return {
      profile: profileRes.data,
      events: eventsRes.data ?? [],
      devices: devicesRes.data ?? [],
      backupCodes: {
        total: codesRes.data?.length ?? 0,
        remaining: (codesRes.data ?? []).filter((c) => !c.used_at).length,
      },
      settings: settingsRes.data,
      isAdmin: Boolean(roleRes.data),
    };
  });

export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase
      .from("user_roles")
      .select("id")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!isAdmin) throw new Error("Forbidden");

    const { supabase } = context;
    const [users, attempts, events, actions, settings] = await Promise.all([
      supabase.from("profiles").select("*").order("full_name"),
      supabase
        .from("login_attempts")
        .select("*")
        .eq("success", false)
        .order("created_at", { ascending: false })
        .limit(60),
      supabase.from("auth_events").select("*").order("created_at", { ascending: false }).limit(80),
      supabase.from("admin_actions").select("*").order("created_at", { ascending: false }).limit(40),
      supabase.from("security_settings").select("*").eq("id", 1).maybeSingle(),
    ]);

    return {
      users: users.data ?? [],
      failedAttempts: attempts.data ?? [],
      events: events.data ?? [],
      actions: actions.data ?? [],
      settings: settings.data,
    };
  });

export const updateSecuritySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        require_mfa: z.boolean().optional(),
        require_backup_codes: z.boolean().optional(),
        allow_sms_fallback: z.boolean().optional(),
        lockout_threshold: z.number().int().min(3).max(20).optional(),
        lockout_minutes: z.number().int().min(5).max(1440).optional(),
        session_timeout_minutes: z.number().int().min(5).max(1440).optional(),
        password_min_length: z.number().int().min(8).max(64).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase
      .from("user_roles")
      .select("id")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("security_settings")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("id", 1);
    await supabaseAdmin.from("admin_actions").insert({
      admin_id: context.userId,
      admin_email: (context.claims.email as string) ?? null,
      action: "policy_update",
      details: Object.entries(data)
        .map(([k, v]) => `${k}=${v}`)
        .join(", "),
    });
    return { ok: true };
  });

export const adminUserAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        action: z.enum(["unlock", "lock", "reset_mfa", "reset_backup_codes"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase
      .from("user_roles")
      .select("id")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: target } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", data.userId)
      .maybeSingle();

    if (data.action === "unlock") {
      await supabaseAdmin
        .from("profiles")
        .update({ is_locked: false, locked_at: null })
        .eq("id", data.userId);
      if (target?.email)
        await supabaseAdmin
          .from("login_attempts")
          .delete()
          .eq("email", target.email)
          .eq("success", false);
    } else if (data.action === "lock") {
      await supabaseAdmin
        .from("profiles")
        .update({ is_locked: true, locked_at: new Date().toISOString() })
        .eq("id", data.userId);
    } else if (data.action === "reset_mfa") {
      await supabaseAdmin.from("mfa_factors").delete().eq("user_id", data.userId);
      await supabaseAdmin
        .from("profiles")
        .update({ mfa_enabled: false, security_score: 40 })
        .eq("id", data.userId);
    } else if (data.action === "reset_backup_codes") {
      await supabaseAdmin.from("backup_codes").delete().eq("user_id", data.userId);
    }

    await supabaseAdmin.from("admin_actions").insert({
      admin_id: context.userId,
      admin_email: (context.claims.email as string) ?? null,
      action: data.action,
      target_user_id: data.userId,
      target_email: target?.email ?? null,
      details: "Performed from the admin console",
    });

    return { ok: true };
  });

export const getReportData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ days: z.number().int().min(1).max(365).default(30) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const since = new Date(Date.now() - data.days * 86_400_000).toISOString();
    const { data: isAdmin } = await context.supabase
      .from("user_roles")
      .select("id")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();

    let eventsQuery = context.supabase
      .from("auth_events")
      .select("*")
      .gte("created_at", since)
      .order("created_at", { ascending: false });
    if (!isAdmin) eventsQuery = eventsQuery.eq("user_id", context.userId);

    const [events, users] = await Promise.all([
      eventsQuery.limit(1000),
      isAdmin
        ? context.supabase.from("profiles").select("id, mfa_enabled, is_locked, department, security_score")
        : Promise.resolve({ data: [] as never[] }),
    ]);

    return { events: events.data ?? [], users: users.data ?? [], isAdmin: Boolean(isAdmin) };
  });
