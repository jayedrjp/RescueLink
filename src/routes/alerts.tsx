import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AlertTriangle, CloudRain, Info, MapPin, Wind } from "lucide-react";

import { Card, NotificationButton, Screen, TopBar } from "@/components/rl";
import { alerts } from "@/lib/data";

export const Route = createFileRoute("/alerts")({
  head: () => ({
    meta: [
      { title: "Disaster Alerts & Warnings — RescueLink" },
      {
        name: "description",
        content:
          "Real-time flood, cyclone, rainfall and road closure alerts for your area, sorted by severity.",
      },
      { property: "og:title", content: "Disaster Alerts & Warnings — RescueLink" },
      {
        property: "og:description",
        content: "Critical, warning and information level disaster updates in one calm feed.",
      },
    ],
  }),
  component: AlertsScreen,
});

const tabs = ["All", "Critical", "Warning", "Information"] as const;

const severityMeta = {
  critical: { label: "Critical", icon: AlertTriangle, chip: "bg-primary text-primary-foreground", ring: "bg-primary/10 text-primary" },
  warning: { label: "Warning", icon: Wind, chip: "bg-warn text-warn-foreground", ring: "bg-warn/20 text-warn-foreground" },
  info: { label: "Information", icon: Info, chip: "bg-accent text-info", ring: "bg-accent text-info" },
} as const;

function AlertsScreen() {
  const [tab, setTab] = useState<(typeof tabs)[number]>("All");
  const list = alerts.filter((a) =>
    tab === "All" ? true : severityMeta[a.severity].label === tab,
  );

  return (
    <Screen>
      <TopBar title="Alerts" subtitle="Dhaka, Bangladesh" right={<NotificationButton />} />

      <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-4">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`press shrink-0 rounded-full px-4 py-2 text-[12.5px] font-bold transition-colors ${
              tab === t ? "bg-navy text-navy-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="stagger-children space-y-3 px-4">
        {list.map((a) => {
          const meta = severityMeta[a.severity];
          const Icon = a.title.includes("Rainfall") ? CloudRain : meta.icon;
          return (
            <Card key={a.id} className={a.severity === "critical" ? "border-primary/25" : ""}>
              <div className="flex items-start gap-3">
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${meta.ring}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                    <p className="truncate text-[15px] font-bold text-navy">{a.title}</p>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${meta.chip}`}
                    >
                      {meta.label}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{a.body}</p>
                  <div className="mt-3 flex items-center gap-3 text-[11.5px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" /> {a.location}
                    </span>
                    <span>· {a.time}</span>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
        {list.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-[15px] font-bold text-navy">No alerts here</p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              You're all clear for now. We'll notify you instantly.
            </p>
          </div>
        ) : null}
      </div>
    </Screen>
  );
}
