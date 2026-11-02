import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { HandCoins, Package, ShieldCheck, Check } from "lucide-react";
import { toast } from "sonner";

import { Card, Screen, SectionHeader, TopBar, shelterImages } from "@/components/rl";
import { getStoredShelters, type Shelter } from "@/lib/data";
import { recordDonation, subscribeToShelters } from "@/lib/firebase/firestore";
import { useAuth } from "@/context/AuthContext";

export const Route = createFileRoute("/donate")({
  head: () => ({
    meta: [
      { title: "Donate to Shelters — RescueLink" },
      {
        name: "description",
        content:
          "Donate money or supplies directly to the shelters that need food, water, medicine and blankets right now.",
      },
      { property: "og:title", content: "Donate to Shelters — RescueLink" },
      {
        property: "og:description",
        content: "Transparent giving: see exactly what each shelter needs before you donate.",
      },
    ],
  }),
  component: DonateScreen,
});

const amounts = [500, 1000, 2500, 5000];
const supplyOptions = ["Food", "Water", "Medicine", "Blankets", "Emergency Supplies"];

function DonateScreen() {
  const { user, profile } = useAuth();
  const [availableShelters, setAvailableShelters] = useState<Shelter[]>(() => getStoredShelters());
  const [mode, setMode] = useState<"money" | "supplies">("money");
  const [amount, setAmount] = useState(1000);
  const [target, setTarget] = useState<string>(() => getStoredShelters()[0]?.id || "mirpur");
  const [supplyItems, setSupplyItems] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const unsub = subscribeToShelters((data) => {
      if (data.length > 0) {
        setAvailableShelters(data);
        setTarget((prev) => (data.some((s) => s.id === prev) ? prev : data[0]!.id));
      }
    });
    return () => unsub();
  }, []);

  const toggleSupplyItem = (item: string) =>
    setSupplyItems((prev) =>
      prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item],
    );

  const shelterName = availableShelters.find((s) => s.id === target)?.name || "Emergency Shelter";
  const canSubmit = mode === "money" || supplyItems.length > 0;

  const handleSubmit = async () => {
    if (!canSubmit || isSubmitting) return;
    setIsSubmitting(true);
    try {
      if (mode === "money") {
        if (user) {
          try {
            const key = `rl_donations_${user.uid}`;
            const prev = Number(localStorage.getItem(key)) || 0;
            localStorage.setItem(key, JSON.stringify(prev + amount));
          } catch {
            // ignore
          }
        }
        await recordDonation({
          donorName: profile?.displayName || user?.displayName || "Anonymous Donor",
          donorEmail: profile?.email || user?.email || "citizen@rescuelink.org",
          ...(user?.uid ? { donorUid: user.uid } : {}),
          type: "money",
          amount,
          shelterId: target,
          shelterName,
          date: new Date().toISOString(),
          status: "completed",
        });
        toast.success(`Donation recorded: ৳${amount} for ${shelterName}.`, {
          description:
            "Thank you! Your donation record and receipt have been stored in the RescueLink system.",
        });
      } else {
        await recordDonation({
          donorName: profile?.displayName || user?.displayName || "Anonymous Donor",
          donorEmail: profile?.email || user?.email || "citizen@rescuelink.org",
          ...(user?.uid ? { donorUid: user.uid } : {}),
          type: "supplies",
          items: supplyItems,
          shelterId: target,
          shelterName,
          date: new Date().toISOString(),
          status: "pledged",
        });
        toast.success("Supply pickup pledge scheduled", {
          description: `${supplyItems.join(", ")} for ${shelterName}. Recorded in coordination network for volunteer pickup.`,
        });
        setSupplyItems([]);
      }
    } catch (err) {
      console.error("Donation recording error:", err);
      toast.error("Could not record donation. Please check connection.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen>
      <TopBar title="Donate" subtitle="Verified shelters only" />

      <div className="px-4 pt-5">
        <h2 className="text-[22px] font-extrabold leading-tight text-navy">
          Help Where It's Needed Most
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
          100% transparent: every financial donation and supply pledge is saved and distributed to
          the verified shelter you choose.
        </p>
      </div>

      <div className="px-4 pt-5">
        <div className="grid grid-cols-2 gap-2 rounded-3xl bg-muted p-1.5">
          {(
            [
              { id: "money", label: "Donate Money", icon: HandCoins },
              { id: "supplies", label: "Donate Supplies", icon: Package },
            ] as const
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              className={`press flex h-12 items-center justify-center gap-2 rounded-2xl text-[13px] font-bold transition-colors ${
                mode === id
                  ? "bg-surface text-navy shadow-[var(--shadow-soft)]"
                  : "text-muted-foreground"
              }`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-7">
        <SectionHeader title="Choose a shelter" />
        <div className="stagger-children space-y-3">
          {availableShelters.map((s) => {
            const imageSrc = shelterImages[s.image] || shelterImages["shelter-1"];
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setTarget(s.id)}
                className={`press w-full rounded-3xl border bg-card p-3 text-left shadow-[var(--shadow-soft)] transition-colors ${
                  target === s.id ? "border-safe" : "border-border/70"
                }`}
              >
                <div className="flex items-center gap-3">
                  <img
                    src={imageSrc}
                    alt={s.name}
                    loading="lazy"
                    width={1024}
                    height={640}
                    className="h-16 w-16 shrink-0 rounded-2xl object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14.5px] font-bold text-navy">{s.name}</p>
                    <p className="mt-1 text-[11.5px] text-muted-foreground">Needs right now</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {s.needs.slice(0, 3).map((n) => (
                        <span
                          key={n}
                          className="rounded-full bg-primary/8 px-2 py-0.5 text-[10.5px] font-semibold text-primary"
                        >
                          {n}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span
                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${
                      target === s.id ? "bg-safe text-safe-foreground" : "bg-muted"
                    }`}
                  >
                    {target === s.id ? <Check className="h-3.5 w-3.5" /> : null}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {mode === "money" ? (
        <div className="px-4 pt-7">
          <SectionHeader title="Select amount" />
          <div className="grid grid-cols-4 gap-2">
            {amounts.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAmount(a)}
                className={`press h-12 rounded-2xl text-[13px] font-bold transition-colors ${
                  amount === a ? "bg-navy text-navy-foreground" : "bg-muted text-navy"
                }`}
              >
                ৳{a}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="px-4 pt-7">
          <SectionHeader title="What can you give?" />
          <div className="flex flex-wrap gap-2">
            {supplyOptions.map((s) => {
              const on = supplyItems.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleSupplyItem(s)}
                  className={`press inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12.5px] font-semibold transition-colors ${
                    on ? "bg-navy text-navy-foreground" : "bg-accent text-info"
                  }`}
                >
                  {on ? <Check className="h-3.5 w-3.5" /> : null}
                  {s}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="px-4 pt-6">
        <Card className="flex items-center gap-2.5 bg-safe/8">
          <ShieldCheck className="h-5 w-5 shrink-0 text-safe" />
          <p className="text-[12px] font-medium text-navy">
            Shelters are verified by local disaster management authorities.
          </p>
        </Card>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="press mt-4 h-14 w-full rounded-2xl bg-safe text-[15px] font-bold text-safe-foreground shadow-[var(--shadow-card)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {mode === "money" ? `Donate ৳${amount}` : "Schedule Supply Pickup"}
        </button>
      </div>
    </Screen>
  );
}
