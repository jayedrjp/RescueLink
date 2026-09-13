import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Clock, HeartHandshake, MapPin, Users, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { Card, Screen, SectionHeader, TopBar } from "@/components/rl";
import { tasks, type Task } from "@/lib/data";

export const Route = createFileRoute("/volunteer")({
  head: () => ({
    meta: [
      { title: "Volunteer for Relief Work — RescueLink" },
      {
        name: "description",
        content:
          "Join nearby relief tasks: food and water distribution, medicine delivery, shelter support and rescue assistance.",
      },
      { property: "og:title", content: "Volunteer for Relief Work — RescueLink" },
      {
        property: "og:description",
        content: "Your time and skills can make a difference. Accept nearby relief tasks in minutes.",
      },
    ],
  }),
  component: VolunteerScreen,
});

const urgencyTone = {
  high: "bg-primary/10 text-primary",
  medium: "bg-warn/20 text-warn-foreground",
  low: "bg-accent text-info",
} as const;

function VolunteerScreen() {
  const [registered, setRegistered] = useState(false);
  const [accepted, setAccepted] = useState<string[]>([]);

  const acceptTask = (t: Task) => {
    setAccepted((p) => (p.includes(t.id) ? p : [...p, t.id]));
    toast.success(`You're in for "${t.title}"`, {
      description: `${t.area} · ${t.time}. Organizers will reach out with pickup details.`,
    });
  };

  const showTaskDetails = (t: Task) => {
    toast.message(t.title, {
      description: `${t.area} · ${t.distanceKm} km away · ${t.joined}/${t.needed} volunteers joined · ${t.time}`,
    });
  };

  return (
    <Screen>
      <TopBar title="Volunteer" subtitle={registered ? "Verified volunteer" : "Community relief"} />

      {!registered ? (
        <div className="animate-fade-up px-5 pt-10 text-center">
          <span className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-safe/10">
            <HeartHandshake className="h-9 w-9 text-safe" />
          </span>
          <h2 className="mt-6 text-[24px] font-extrabold leading-tight text-navy">
            Help Your Community
          </h2>
          <p className="mx-auto mt-2 max-w-[300px] text-sm leading-relaxed text-muted-foreground">
            Your time and skills can make a difference. Join verified relief teams working near you.
          </p>

          <div className="mt-8 grid grid-cols-3 gap-2 text-left">
            {[
              { n: "2.4k", l: "Volunteers" },
              { n: "38", l: "Active tasks" },
              { n: "12k", l: "People helped" },
            ].map((s) => (
              <div key={s.l} className="rounded-3xl bg-card p-3 shadow-[var(--shadow-soft)]">
                <p className="text-[17px] font-extrabold text-navy">{s.n}</p>
                <p className="text-[11px] text-muted-foreground">{s.l}</p>
              </div>
            ))}
          </div>

          <button
            onClick={() => setRegistered(true)}
            className="press mt-8 h-14 w-full rounded-2xl bg-safe text-[15px] font-bold text-safe-foreground shadow-[var(--shadow-card)]"
          >
            Become a Volunteer
          </button>
        </div>
      ) : (
        <>
          <div className="px-4 pt-4">
            <Card className="bg-navy text-navy-foreground">
              <p className="text-[15px] font-extrabold">Welcome, Jayed 🎉</p>
              <p className="mt-1 text-[12.5px] text-navy-foreground/80">
                You're a verified RescueLink volunteer in Dhaka North.
              </p>
              <div className="mt-4 grid grid-cols-3 gap-3">
                {[
                  { n: String(accepted.length), l: "Active tasks" },
                  { n: "14", l: "Completed" },
                  { n: "62 hrs", l: "Contributed" },
                ].map((s) => (
                  <div key={s.l} className="rounded-2xl bg-navy-foreground/10 p-2.5">
                    <p className="text-[15px] font-extrabold">{s.n}</p>
                    <p className="text-[10.5px] text-navy-foreground/75">{s.l}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div className="px-4 pt-7">
            <SectionHeader title="Nearby Relief Tasks" />
            <div className="stagger-children space-y-3">
              {tasks.map((t) => {
                const on = accepted.includes(t.id);
                return (
                  <Card key={t.id}>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                      <div className="min-w-0">
                        <p className="text-[15px] font-bold text-navy">{t.title}</p>
                        <p className="mt-1 inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5" /> {t.area} · {t.distanceKm} km
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-extrabold uppercase ${urgencyTone[t.urgency]}`}
                      >
                        {t.urgency}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5" /> {t.joined}/{t.needed} volunteers
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" /> {t.time}
                      </span>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <button
                        onClick={() => acceptTask(t)}
                        className={`press flex h-11 items-center justify-center gap-1.5 rounded-2xl text-[13px] font-bold ${
                          on ? "bg-safe/12 text-safe" : "bg-safe text-safe-foreground"
                        }`}
                      >
                        {on ? (
                          <>
                            <CheckCircle2 className="h-4 w-4" /> Accepted
                          </>
                        ) : (
                          "Accept Task"
                        )}
                      </button>
                      <button
                        onClick={() => showTaskDetails(t)}
                        className="press flex h-11 items-center justify-center rounded-2xl bg-muted text-[13px] font-bold text-navy"
                      >
                        View Details
                      </button>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        </>
      )}
    </Screen>
  );
}
