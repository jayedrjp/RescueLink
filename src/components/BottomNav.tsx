import { useState, useRef, useEffect } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Home, MapPin, Bell, User, Users, Building2, MoreHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";

const citizenItems = [
  { to: "/", label: "Home", icon: Home },
  { to: "/map", label: "Map", icon: MapPin },
  { to: "/alerts", label: "Alerts", icon: Bell },
  { to: "/profile", label: "Profile", icon: User },
] as const;

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });
  const isAdminView = pathname.startsWith("/admin");
  const currentAdminTab = new URLSearchParams(searchStr).get("tab") || "home";

  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 398, height: 76 });

  useEffect(() => {
    if (typeof window === "undefined" || !containerRef.current) return;
    const updateSize = () => {
      if (containerRef.current) {
        const w = containerRef.current.offsetWidth;
        const h = containerRef.current.offsetHeight;
        if (w > 0 && h > 0) {
          setDimensions({ width: w, height: h });
        }
      }
    };
    updateSize();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(updateSize);
      ro.observe(containerRef.current);
      return () => ro.disconnect();
    }
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  const isMoreActive =
    (pathname === "/admin" && currentAdminTab === "more") ||
    pathname.startsWith("/admin/alerts") ||
    pathname.startsWith("/admin/donations") ||
    pathname.startsWith("/admin/citizens") ||
    pathname.startsWith("/admin/users") ||
    pathname.startsWith("/admin/reports");

  const isHomeActive = pathname === "/admin" && currentAdminTab === "home" && !isMoreActive;
  const isVolunteersActive = pathname === "/admin" && currentAdminTab === "volunteers";
  const isSheltersActive = pathname === "/admin" && currentAdminTab === "shelters";

  const isCitizenActive = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));

  return (
    <nav
      aria-label="Main navigation"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[1050] flex justify-center pb-[max(14px,env(safe-area-inset-bottom))]"
    >
      <div
        ref={containerRef}
        className="pointer-events-auto relative mx-4 w-full max-w-[398px] animate-fade-up"
      >
        {/* Smooth, symmetrical U-shaped cutout background behind SOS button */}
        <NotchedNavBackground width={dimensions.width} height={dimensions.height} />

        {isAdminView ? (
          /* Admin Navigation: 1. Home, 2. Volunteers, [Spacer / SOS], 4. Shelters, 5. More */
          <div className="relative z-10 grid grid-cols-5 items-end px-2 py-2.5">
            <NavItem
              to="/admin"
              search={{ tab: "home" }}
              label="Home"
              icon={Home}
              active={isHomeActive}
              replace
            />
            <NavItem
              to="/admin"
              search={{ tab: "volunteers" }}
              label="Volunteers"
              icon={Users}
              active={isVolunteersActive}
              replace
            />
            <div aria-hidden className="h-14" />
            <NavItem
              to="/admin"
              search={{ tab: "shelters" }}
              label="Shelters"
              icon={Building2}
              active={isSheltersActive}
              replace
            />
            <NavItem
              to="/admin"
              search={{ tab: "more" }}
              label="More"
              icon={MoreHorizontal}
              active={isMoreActive}
              replace
            />
          </div>
        ) : (
          /* Citizen Navigation: Home, Map, [Spacer / SOS], Alerts, Profile */
          <div className="relative z-10 grid grid-cols-5 items-end px-2 py-2.5">
            {citizenItems.slice(0, 2).map((item) => (
              <NavItem
                key={item.to}
                to={item.to}
                label={item.label}
                icon={item.icon}
                active={isCitizenActive(item.to)}
              />
            ))}
            <div aria-hidden className="h-14" />
            {citizenItems.slice(2).map((item) => (
              <NavItem
                key={item.to}
                to={item.to}
                label={item.label}
                icon={item.icon}
                active={isCitizenActive(item.to)}
              />
            ))}
          </div>
        )}

        {/* Center Floating SOS Button */}
        {isAdminView ? (
          <Link
            to="/admin"
            search={{ tab: "sos" }}
            replace
            aria-label="Admin SOS Emergency Dispatch"
            className={cn(
              "press absolute -top-6 left-1/2 z-20 grid h-[62px] w-[62px] -translate-x-1/2 place-items-center rounded-full border-4 border-surface bg-primary text-primary-foreground shadow-[var(--shadow-sos)] animate-breathe",
              currentAdminTab === "sos" && "ring-4 ring-primary/40",
            )}
          >
            <span className="absolute inset-0 -z-10 rounded-full bg-primary/40 animate-ripple" />
            <span className="text-[13px] font-extrabold tracking-wide">SOS</span>
          </Link>
        ) : (
          <Link
            to="/sos"
            aria-label="Send SOS"
            className="press absolute -top-6 left-1/2 z-20 grid h-[62px] w-[62px] -translate-x-1/2 place-items-center rounded-full border-4 border-surface bg-primary text-primary-foreground shadow-[var(--shadow-sos)] animate-breathe"
          >
            <span className="absolute inset-0 -z-10 rounded-full bg-primary/40 animate-ripple" />
            <span className="text-[13px] font-extrabold tracking-wide">SOS</span>
          </Link>
        )}
      </div>
    </nav>
  );
}

/**
 * Renders the navbar's white outer rounded rectangle with a smooth, symmetrical,
 * deep rounded U-shaped notch that curves downward around the lower part of the
 * SOS circle and smoothly rises back to the straight horizontal top edge on both sides.
 */
function NotchedNavBackground({ width, height }: { width: number; height: number }) {
  const W = width;
  const H = height;
  const cx = W / 2;
  const cy = 7; // Center of SOS circle relative to navbar top edge (y=0)
  const Rn = 37; // Radius of notch cradle (SOS button radius 31px + 6px uniform clearance)
  const Rs = 10; // Radius of shoulder fillets
  const d = Rn + Rs; // 47
  const dy = Rs - cy; // 3
  const xs = Math.sqrt(d * d - dy * dy); // ~46.90

  const p1x = cx - xs; // ~cx - 46.90
  const p2x = cx - (Rn / d) * xs; // ~cx - 36.92
  const p2y = cy + (Rn / d) * dy; // ~9.36
  const p3x = cx + (Rn / d) * xs; // ~cx + 36.92
  const p3y = p2y; // ~9.36
  const p4x = cx + xs; // ~cx + 46.90

  const rCorner = 28;

  const path =
    `M ${rCorner},0 ` +
    `L ${p1x.toFixed(2)},0 ` +
    `A ${Rs} ${Rs} 0 0 1 ${p2x.toFixed(2)},${p2y.toFixed(2)} ` +
    `A ${Rn} ${Rn} 0 0 0 ${p3x.toFixed(2)},${p3y.toFixed(2)} ` +
    `A ${Rs} ${Rs} 0 0 1 ${p4x.toFixed(2)},0 ` +
    `L ${(W - rCorner).toFixed(2)},0 ` +
    `A ${rCorner} ${rCorner} 0 0 1 ${W},${rCorner} ` +
    `L ${W},${(H - rCorner).toFixed(2)} ` +
    `A ${rCorner} ${rCorner} 0 0 1 ${(W - rCorner).toFixed(2)},${H} ` +
    `L ${rCorner},${H} ` +
    `A ${rCorner} ${rCorner} 0 0 1 0,${(H - rCorner).toFixed(2)} ` +
    `L 0,${rCorner} ` +
    `A ${rCorner} ${rCorner} 0 0 1 ${rCorner},0 Z`;

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 h-full w-full overflow-visible"
      viewBox={`0 0 ${W} ${H}`}
      style={{
        filter:
          "drop-shadow(0 -3px 18px rgba(7, 27, 51, 0.10)) drop-shadow(0 2px 6px rgba(7, 27, 51, 0.04))",
      }}
    >
      <path
        d={path}
        fill="var(--surface, #FFFFFF)"
        stroke="var(--border, #E2E8F0)"
        strokeWidth="1"
        strokeOpacity="0.8"
      />
    </svg>
  );
}

function NavItem({
  to,
  search,
  label,
  icon: Icon,
  active,
  replace = false,
}: {
  to: "/" | "/map" | "/alerts" | "/profile" | "/admin";
  search?: { tab?: string; sub?: string } | undefined;
  label: string;
  icon: typeof Home;
  active: boolean;
  /** Admin tabs are siblings: replace the history entry instead of stacking one per tab. */
  replace?: boolean;
}) {
  const content = (
    <>
      <span
        className={cn(
          "grid h-9 w-9 place-items-center rounded-full transition-all duration-300",
          active ? "-translate-y-1 scale-105 bg-accent text-info" : "text-muted-foreground",
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
    </>
  );

  const className =
    "group flex flex-col items-center gap-1 rounded-2xl py-1.5 transition-transform duration-200";

  if (search) {
    return (
      <Link to={to} search={search} replace={replace} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <Link to={to} replace={replace} className={className}>
      {content}
    </Link>
  );
}
