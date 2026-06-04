import Link from "next/link";
import type { ReactNode } from "react";
import {
  Bell,
  Home,
  MessageSquareText,
  Settings,
  Star,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { LogoMark } from "@/components/logo-mark";

type NavItem = {
  href: string;
  label: string;
  icon: typeof Home;
  activePath?: string;
};

const navItems: NavItem[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/reviews", label: "Reviews", icon: Star },
  { href: "/notifications", label: "Tasks", icon: Bell },
  { href: "/settings", label: "Settings", icon: Settings }
];

const railItems: NavItem[] = [
  { href: "/", label: "Command center", icon: Home },
  { href: "/reviews", label: "Review operations", icon: MessageSquareText },
  { href: "/notifications", label: "Operational tasks", icon: Bell },
  { href: "/settings", label: "Settings", icon: Settings }
];

export function AppShell({
  children,
  current,
  title,
  subtitle,
  action
}: {
  children: ReactNode;
  current: string;
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <main className="rp-shell">
      <aside className="rp-rail" aria-label="Desktop navigation">
        <Link href="/" className="rp-rail-brand">
          <span className="rp-brand-mark">
            <LogoMark />
          </span>
          <span>
            <strong>Review Pilot</strong>
            <small>Mobile review ops</small>
          </span>
        </Link>

        <nav className="rp-rail-nav">
          {railItems.map((item) => {
            const Icon = item.icon;
            const active = current === (item.activePath ?? item.href);
            return (
              <Link key={`${item.label}-${item.href}`} href={item.href} className={cn("rp-rail-link", active && "active")}>
                <Icon aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

      </aside>

      <section className="rp-main">
        <header className="rp-mobile-top">
          <Link href="/" className="rp-mobile-brand">
            <span className="rp-brand-mark">
              <LogoMark />
            </span>
            <span>
              <strong>Review Pilot</strong>
              <small>Mobile review ops</small>
            </span>
          </Link>
        </header>

        <header className="rp-command-strip">
          <div className="rp-title-block">
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
          {action ? (
            <div className="rp-command-controls">
              <div className="rp-command-action">{action}</div>
            </div>
          ) : null}
        </header>

        <div className="rp-content">{children}</div>
      </section>

      <nav className="rp-bottom-nav" aria-label="Mobile navigation">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = current === item.href;
          return (
            <Link key={item.href} href={item.href} className={cn("rp-bottom-link", active && "active")}>
              <Icon aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </main>
  );
}
