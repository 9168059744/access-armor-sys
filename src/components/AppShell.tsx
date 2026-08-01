import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  ShieldCheck,
  LayoutDashboard,
  Users,
  FileBarChart,
  UserCog,
  LogOut,
  ShieldAlert,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { clearMfaVerified } from "@/lib/mfa-session";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type NavItem = { to: string; label: string; icon: typeof Users; adminOnly?: boolean };

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/profile", label: "Profile", icon: UserCog },
  { to: "/reports", label: "Reports", icon: FileBarChart },
  { to: "/security", label: "Security", icon: ShieldAlert, adminOnly: true },
  { to: "/admin", label: "Admin", icon: Users, adminOnly: true },
];

export function AppShell({
  children,
  isAdmin = false,
  title,
  subtitle,
}: {
  children: ReactNode;
  isAdmin?: boolean;
  title: string;
  subtitle?: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    clearMfaVerified();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="pointer-events-none fixed inset-0 grid-noise opacity-40" aria-hidden />
      <header className="sticky top-0 z-30 border-b border-border/60 glass">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <ShieldCheck className="size-4" />
            </span>
            <span className="text-sm font-semibold tracking-tight">CyberShield</span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {NAV.filter((item) => !item.adminOnly || isAdmin).map((item) => (
              <Link
                key={item.to}
                to={item.to as never}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                  pathname === item.to && "bg-accent text-foreground",
                )}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto">
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="size-4" />
              Sign out
            </Button>
          </div>
        </div>

        <nav className="flex items-center gap-1 overflow-x-auto border-t border-border/60 px-4 py-2 md:hidden">
          {NAV.filter((item) => !item.adminOnly || isAdmin).map((item) => (
            <Link
              key={item.to}
              to={item.to as never}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-xs text-muted-foreground",
                pathname === item.to && "bg-accent text-foreground",
              )}
            >
              <item.icon className="size-3.5" />
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="animate-rise">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
        <div className="mt-8">{children}</div>
      </main>
    </div>
  );
}
