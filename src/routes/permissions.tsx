import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { MapPin, BellRing, Users, Check } from "lucide-react";
import { toast } from "sonner";

import { Card, Screen, TopBar } from "@/components/rl";
import {
  subscribeToPushNotifications,
  isPushNotificationSupported,
} from "@/lib/weather/push-service";
import { checkLocationPermission, requestLocationPermission } from "@/lib/location";

export const Route = createFileRoute("/permissions")({
  head: () => ({
    meta: [
      { title: "App Permissions — RescueLink" },
      {
        name: "description",
        content:
          "Understand exactly why RescueLink asks for location, notifications and emergency contacts before you allow them.",
      },
      { property: "og:title", content: "App Permissions — RescueLink" },
      {
        property: "og:description",
        content: "Clear, friendly explanations for every permission RescueLink requests.",
      },
    ],
  }),
  component: Permissions,
});

const items = [
  {
    id: "location",
    icon: MapPin,
    tone: "bg-accent text-info",
    title: "Location",
    body: "Your location helps us find nearby shelters and send your position during an SOS.",
    cta: "Allow Location",
  },
  {
    id: "notifications",
    icon: BellRing,
    tone: "bg-primary/10 text-primary",
    title: "Notifications",
    body: "We only notify you about disaster warnings, SOS updates and shelter changes near you.",
    cta: "Allow Notifications",
  },
  {
    id: "contacts",
    icon: Users,
    tone: "bg-safe/10 text-safe",
    title: "Emergency Contacts",
    body: "Add trusted family members and friends so you or first responders can quickly call them during an emergency.",
    cta: "Allow Contacts",
  },
];

function Permissions() {
  const [granted, setGranted] = useState<string[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Check existing notification permission
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      setGranted((p) => (p.includes("notifications") ? p : [...p, "notifications"]));
    }

    // Check existing contacts permission flag
    if (localStorage.getItem("rl_contacts_permission") === "granted") {
      setGranted((p) => (p.includes("contacts") ? p : [...p, "contacts"]));
    }

    // Check location permission
    checkLocationPermission()
      .then((res) => {
        if (res.granted) {
          setGranted((p) => (p.includes("location") ? p : [...p, "location"]));
        }
      })
      .catch(() => {});
  }, []);

  const handleRequest = async (id: string) => {
    if (id === "location") {
      const granted = await requestLocationPermission();
      if (granted) {
        setGranted((p) => (p.includes("location") ? p : [...p, "location"]));
        toast.success("Location access granted", {
          description: "RescueLink can now acquire accurate coordinates during emergencies.",
        });
      } else {
        toast.error("Location permission denied", {
          description:
            "Please enable location in your device or browser settings to track live position.",
        });
      }
    } else if (id === "notifications") {
      if (typeof window === "undefined" || !isPushNotificationSupported()) {
        toast.error("Push notifications are not supported by this browser.");
        return;
      }
      try {
        const result = await subscribeToPushNotifications();
        if (result.success || Notification.permission === "granted") {
          setGranted((p) => (p.includes("notifications") ? p : [...p, "notifications"]));
          toast.success("Notifications enabled", {
            description: "You will receive critical emergency alerts and updates.",
          });
        } else {
          toast.error("Notification permission denied", {
            description: "You can enable notifications in your browser's address bar settings.",
          });
        }
      } catch (e) {
        toast.error("Could not request notification permission.");
      }
    } else if (id === "contacts") {
      localStorage.setItem("rl_contacts_permission", "granted");
      setGranted((p) => (p.includes("contacts") ? p : [...p, "contacts"]));
      toast.success("Emergency contacts access enabled", {
        description: "Your saved contacts can now be dialed with one touch.",
      });
    }
  };

  return (
    <Screen>
      <TopBar title="Permissions" subtitle="You stay in control" back="/profile" />

      <div className="px-4 pt-5">
        <h2 className="text-[21px] font-extrabold leading-tight text-navy">
          Let's set you up for safety
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
          We explain every permission before asking. You can change these anytime in Settings.
        </p>
      </div>

      <div className="stagger-children space-y-3 px-4 pt-6">
        {items.map(({ id, icon: Icon, tone, title, body, cta }) => {
          const on = granted.includes(id);
          return (
            <Card key={id}>
              <div className="flex items-start gap-3">
                <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${tone}`}>
                  <Icon className="h-5.5 w-5.5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[15px] font-bold text-navy">{title}</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{body}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleRequest(id)}
                className={`press mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[13.5px] font-bold ${
                  on ? "bg-safe/12 text-safe" : "bg-navy text-navy-foreground"
                }`}
              >
                {on ? (
                  <>
                    <Check className="h-4 w-4" /> Allowed
                  </>
                ) : (
                  cta
                )}
              </button>
            </Card>
          );
        })}
      </div>

      <div className="px-4 pt-6">
        <Link
          to="/"
          className="press flex h-14 w-full items-center justify-center rounded-2xl bg-primary text-[15px] font-bold text-primary-foreground shadow-[var(--shadow-sos)]"
        >
          Continue to RescueLink
        </Link>
      </div>
    </Screen>
  );
}
