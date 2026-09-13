import { Link, useRouterState } from "@tanstack/react-router";
import { Home, MapPin, Bell, User } from "lucide-react";

import { cn } from "@/lib/utils";

const items = [
  { to: "/", label: "Home", icon: Home },
  { to: "/map", label: "Map", icon: MapPin },
  { to: "/alerts", label: "Alerts", icon: Bell },
  { to: "/profile", label: "Profile", icon: User },
] as const;

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));

  return (
    <nav
      aria-label="Main navigation"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[max(14px,env(safe-area-inset-bottom))]"
    >
      <div className="pointer-events-auto relative mx-4 w-full max-w-[398px] animate-fade-up">
        <div className="grid grid-cols-5 items-end rounded-[28px] border border-border/60 bg-surface/95 px-2 py-2.5 shadow-[var(--shadow-nav)] backdrop-blur-xl">
          {items.slice(0, 2).map((item) => (
            <NavItem key={item.to} {...item} active={isActive(item.to)} />
          ))}
          <div aria-hidden className="h-14" />
          {items.slice(2).map((item) => (
            <NavItem key={item.to} {...item} active={isActive(item.to)} />
          ))}
        </div>

        <Link
          to="/sos"
          aria-label="Send SOS"
          className="press absolute -top-6 left-1/2 grid h-[62px] w-[62px] -translate-x-1/2 place-items-center rounded-full border-4 border-surface bg-primary text-primary-foreground shadow-[var(--shadow-sos)] animate-breathe"
        >
          <span className="absolute inset-0 -z-10 rounded-full bg-primary/40 animate-ripple" />
          <span className="text-[13px] font-extrabold tracking-wide">SOS</span>
        </Link>
      </div>
    </nav>
  );
}

function NavItem({
  to,
  label,
  icon: Icon,
  active,
}: {
  to: string;
  label: string;
  icon: typeof Home;
  active: boolean;
}) {
  return (
    <Link
      to={to}
      className="group flex flex-col items-center gap-1 rounded-2xl py-1.5 transition-transform duration-200"
    >
      <span
        className={cn(
          "grid h-9 w-9 place-items-center rounded-full transition-all duration-300",
          active
            ? "-translate-y-1 scale-105 bg-accent text-info"
            : "text-muted-foreground",
        )}
      >
        <Icon className="h-[21px] w-[21px]" strokeWidth={active ? 2.4 : 2} />
      </span>
      <span
        className={cn(
          "text-[10.5px] transition-all duration-300",
          active ? "font-bold text-navy" : "font-medium text-muted-foreground",
        )}
      >
        {label}
      </span>
    </Link>
  );
}
