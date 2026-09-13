import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  Bookmark,
  ChevronRight,
  HandCoins,
  HeartHandshake,
  LifeBuoy,
  Lock,
  Phone,
  Plus,
  Settings,
  Siren,
  UserRound,
  X,
} from "lucide-react";

import { Card, Logo, Screen, SectionHeader } from "@/components/rl";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Your Profile & Emergency Contacts — RescueLink" },
      {
        name: "description",
        content:
          "Manage emergency contacts, saved shelters, SOS history, volunteer activity and donation history.",
      },
      { property: "og:title", content: "Your Profile & Emergency Contacts — RescueLink" },
      {
        property: "og:description",
        content: "Keep trusted emergency contacts and your safety history in one place.",
      },
    ],
  }),
  component: ProfileScreen,
});

const initialContacts = [
  { id: "c1", name: "Ammu", relation: "Mother", phone: "+880 1711 220 145" },
  { id: "c2", name: "Rafid", relation: "Brother", phone: "+880 1811 907 620" },
];

function ProfileScreen() {
  const [contacts, setContacts] = useState(initialContacts);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", relation: "", phone: "" });

  const addContact = () => {
    if (!form.name.trim() || !form.phone.trim()) return;
    setContacts((p) => [...p, { id: crypto.randomUUID(), ...form }]);
    setForm({ name: "", relation: "", phone: "" });
    setAdding(false);
  };

  return (
    <Screen>
      <header className="flex items-center justify-between gap-3 px-4 pt-5">
        <Logo />
        <Link
          to="/permissions"
          aria-label="Settings"
          className="press grid h-11 w-11 place-items-center rounded-full bg-muted"
        >
          <Settings className="h-5 w-5 text-navy" />
        </Link>
      </header>

      <div className="animate-fade-up px-4 pt-4">
        <Card className="flex items-center gap-4">
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-accent text-info">
            <UserRound className="h-8 w-8" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[18px] font-extrabold text-navy">Jayed Hasan</p>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">📍 Mirpur, Dhaka</p>
            <span className="mt-2 inline-block rounded-full bg-safe/12 px-2.5 py-1 text-[10.5px] font-extrabold uppercase text-safe">
              Verified volunteer
            </span>
          </div>
        </Card>
      </div>

      <div className="px-4 pt-6">
        <div className="grid grid-cols-3 gap-2">
          {[
            { n: "3", l: "SOS sent" },
            { n: "14", l: "Tasks done" },
            { n: "৳9,500", l: "Donated" },
          ].map((s) => (
            <div key={s.l} className="rounded-3xl bg-card p-3 text-center shadow-[var(--shadow-soft)]">
              <p className="text-[15.5px] font-extrabold text-navy">{s.n}</p>
              <p className="text-[10.5px] text-muted-foreground">{s.l}</p>
            </div>
          ))}
        </div>
      </div>

      <section className="px-4 pt-7">
        <SectionHeader title="Emergency Contacts" />
        <Card className="space-y-3">
          {contacts.map((c) => (
            <div key={c.id} className="flex items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/8 text-primary">
                <Phone className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-bold text-navy">
                  {c.name}
                  {c.relation ? (
                    <span className="ml-1.5 text-[11.5px] font-medium text-muted-foreground">
                      {c.relation}
                    </span>
                  ) : null}
                </p>
                <p className="truncate text-[12px] text-muted-foreground">{c.phone}</p>
              </div>
              <a
                href={`tel:${c.phone.replace(/\s/g, "")}`}
                className="press shrink-0 rounded-full bg-muted px-3 py-2 text-[11.5px] font-bold text-navy"
              >
                Call
              </a>
            </div>
          ))}

          {adding ? (
            <div className="space-y-2 rounded-2xl bg-muted/60 p-3">
              {(
                [
                  ["name", "Name"],
                  ["relation", "Relation"],
                  ["phone", "Phone number"],
                ] as const
              ).map(([key, label]) => (
                <input
                  key={key}
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  placeholder={label}
                  className="h-11 w-full rounded-xl border border-border bg-card px-3 text-[13px] outline-none focus:border-ring"
                />
              ))}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={() => setAdding(false)}
                  className="press flex h-11 items-center justify-center gap-1.5 rounded-xl bg-card text-[12.5px] font-bold text-muted-foreground"
                >
                  <X className="h-4 w-4" /> Cancel
                </button>
                <button
                  onClick={addContact}
                  className="press h-11 rounded-xl bg-navy text-[12.5px] font-bold text-navy-foreground"
                >
                  Save contact
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="press flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border text-[13px] font-bold text-info"
            >
              <Plus className="h-4 w-4" /> Add trusted contact
            </button>
          )}
        </Card>
      </section>

      <section className="px-4 pt-7">
        <SectionHeader title="Your Activity" />
        <Card className="divide-y divide-border/70 p-0">
          {(
            [
              { icon: Bookmark, label: "Saved Shelters", meta: "4 saved", to: "/shelters" },
              { icon: Siren, label: "SOS History", meta: "3 requests", to: "/sos" },
              { icon: HeartHandshake, label: "Volunteer Activity", meta: "14 tasks", to: "/volunteer" },
              { icon: HandCoins, label: "Donation History", meta: "৳9,500", to: "/donate" },
            ] as const
          ).map(({ icon: Icon, label, meta, to }) => (
            <Link
              key={label}
              to={to}
              className="press flex items-center gap-3 px-4 py-4 first:rounded-t-3xl last:rounded-b-3xl"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-accent text-info">
                <Icon className="h-4.5 w-4.5" />
              </span>
              <p className="min-w-0 flex-1 text-[14px] font-semibold text-navy">{label}</p>
              <span className="shrink-0 text-[11.5px] text-muted-foreground">{meta}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </Card>
      </section>

      <section className="px-4 pt-7">
        <SectionHeader title="App" />
        <Card className="divide-y divide-border/70 p-0">
          {(
            [
              { icon: Settings, label: "Settings & Permissions", to: "/permissions" },
              { icon: Lock, label: "Privacy", to: "/permissions" },
              { icon: LifeBuoy, label: "Help & Support", to: "/onboarding" },
            ] as const
          ).map(({ icon: Icon, label, to }) => (
            <Link
              key={label}
              to={to}
              className="press flex items-center gap-3 px-4 py-4 first:rounded-t-3xl last:rounded-b-3xl"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-muted text-navy">
                <Icon className="h-4.5 w-4.5" />
              </span>
              <p className="min-w-0 flex-1 text-[14px] font-semibold text-navy">{label}</p>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </Card>
      </section>
    </Screen>
  );
}
