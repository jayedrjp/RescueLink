import { Link } from "@tanstack/react-router";
import { ChevronLeft, Bell } from "lucide-react";
import type { ReactNode } from "react";

import logoAsset from "@/assets/rescuelink-logo.png.asset.json";
import shelter1 from "@/assets/shelter-1.jpg";
import shelter2 from "@/assets/shelter-2.jpg";
import shelter3 from "@/assets/shelter-3.jpg";
import { cn } from "@/lib/utils";

export const shelterImages: Record<string, string> = {
  "shelter-1": shelter1,
  "shelter-2": shelter2,
  "shelter-3": shelter3,
};

export function Logo({ className }: { className?: string }) {
  return (
    <img
      src={logoAsset.url}
      alt="RescueLink logo"
      className={cn("h-9 w-9 object-contain", className)}
    />
  );
}

export function BrandRow() {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Logo />
      <div className="min-w-0 leading-tight">
        <p className="truncate text-base font-extrabold text-navy">RescueLink</p>
        <p className="bn truncate text-[11px] text-muted-foreground">সাহায্য হোক সহজ</p>
      </div>
    </div>
  );
}

/** Mobile-first phone-width canvas used by every screen. */
export function Screen({
  children,
  className,
  padBottom = true,
}: {
  children: ReactNode;
  className?: string;
  padBottom?: boolean;
}) {
  return (
    <div className="mx-auto min-h-screen w-full max-w-[430px] bg-background">
      <div className={cn(padBottom && "pb-32", className)}>{children}</div>
    </div>
  );
}

export function TopBar({
  title,
  subtitle,
  back = "/",
  right,
}: {
  title: string;
  subtitle?: string;
  back?: string;
  right?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-border/70 bg-surface/90 px-4 py-3 backdrop-blur-xl">
      <Link
        to={back}
        aria-label="Go back"
        className="press grid h-11 w-11 shrink-0 place-items-center rounded-full bg-muted text-foreground"
      >
        <ChevronLeft className="h-5 w-5" />
      </Link>
      <div className="min-w-0">
        <h1 className="truncate text-[17px] font-bold text-navy">{title}</h1>
        {subtitle ? (
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      <div className="shrink-0">{right}</div>
    </header>
  );
}

export function NotificationButton() {
  return (
    <Link
      to="/alerts"
      aria-label="Alerts"
      className="press relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-muted"
    >
      <Bell className="h-5 w-5 text-navy" />
      <span className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-surface" />
    </Link>
  );
}

export function SectionHeader({
  title,
  actionLabel,
  to,
}: {
  title: string;
  actionLabel?: string;
  to?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-1 pb-3">
      <h2 className="text-[15px] font-bold text-navy">{title}</h2>
      {actionLabel && to ? (
        <Link to={to} className="text-xs font-semibold text-info">
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-border/70 bg-card p-4 shadow-[var(--shadow-card)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

const pillTones = {
  open: "bg-safe/12 text-safe",
  limited: "bg-warn/20 text-warn-foreground",
  full: "bg-primary/10 text-primary",
  info: "bg-accent text-accent-foreground",
  navy: "bg-navy/8 text-navy",
} as const;

export function Pill({
  tone = "info",
  children,
  className,
}: {
  tone?: keyof typeof pillTones;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide",
        pillTones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function OccupancyBar({ value, tone }: { value: number; tone: "open" | "limited" | "full" }) {
  const color =
    tone === "open" ? "bg-safe" : tone === "limited" ? "bg-warn" : "bg-primary";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn("h-full rounded-full transition-[width] duration-700 ease-out", color)}
        style={{ width: `${Math.min(100, value)}%` }}
      />
    </div>
  );
}
