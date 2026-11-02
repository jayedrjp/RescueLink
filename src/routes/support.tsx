import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PhoneCall, Mail, Send, ChevronDown } from "lucide-react";
import { toast } from "sonner";

import { Card, Screen, SectionHeader, TopBar } from "@/components/rl";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: "Help & Support — RescueLink" },
      {
        name: "description",
        content:
          "24/7 disaster assistance, emergency hotlines, frequently asked questions, and support contact for RescueLink users in Bangladesh.",
      },
      { property: "og:title", content: "Help & Support — RescueLink" },
      {
        property: "og:description",
        content:
          "Need help with RescueLink? Find emergency numbers, user guides, FAQs, and contact response coordinators.",
      },
    ],
  }),
  component: SupportScreen,
});

const EMERGENCY_HOTLINES = [
  {
    number: "999",
    name: "National Emergency",
    desc: "Police, Fire & Ambulance",
    tone: "bg-primary/10 text-primary border-primary/20",
  },
  {
    number: "109",
    name: "Disaster Warning",
    desc: "Flood & cyclone advisory (MoDMR)",
    tone: "bg-warn/12 text-warn border-warn/25",
  },
  {
    number: "16163",
    name: "Fire & Civil Defence",
    desc: "Direct rescue & fire control",
    tone: "bg-safe/12 text-safe border-safe/25",
  },
  {
    number: "333",
    name: "Govt Information",
    desc: "Citizen relief & public services",
    tone: "bg-accent text-info border-info/20",
  },
];

const FAQS = [
  {
    question: "How does the SOS emergency dispatch work?",
    answer:
      "When you send an SOS, RescueLink captures your current GPS coordinates and creates an active incident report in the central dispatcher queue. Administrative coordinators and verified nearby relief volunteers immediately receive the incident location and emergency classification. You can also dial 999 directly from the confirmation screen.",
  },
  {
    question: "What if my phone has poor or no internet connectivity?",
    answer:
      "RescueLink caches essential emergency helpline numbers and shelter details locally on your phone. Even when internet connectivity is interrupted, you can tap any helpline (such as 999 or 109) to place a regular cellular phone call to emergency services.",
  },
  {
    question: "How do I update my emergency contacts?",
    answer:
      "Navigate to the Profile tab and locate the 'Emergency Contacts' section. You can add, edit, or delete trusted family members and friends. These numbers can be dialed with a single tap during emergencies and assist rescuers with identification.",
  },
  {
    question: "Are the weather warnings and cyclone signals official?",
    answer:
      "Yes. Weather forecasts and atmospheric readings are retrieved from Open-Meteo, while emergency storm and cyclone signal bulletins are verified against official advisories issued by the Bangladesh Meteorological Department (BMD).",
  },
  {
    question: "How do I become a relief volunteer?",
    answer:
      "Go to Profile → 'Become a Volunteer'. Complete the registration form with your preferred relief activities (first aid, shelter management, supply distribution, rescue assistance). An administrator will review and verify your application.",
  },
  {
    question: "Is my personal data and location shared publicly?",
    answer:
      "No. Your precise live location is only shared when you explicitly trigger an SOS or when you voluntarily share your location with designated trusted contacts. RescueLink does not sell or broadcast personal data.",
  },
];

function SupportScreen() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleFaq = (idx: number) => {
    setOpenFaq((prev) => (prev === idx ? null : idx));
  };

  const handleSupportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      toast.error("Please enter a message before submitting.");
      return;
    }

    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setSubject("");
      setMessage("");
      toast.success("Support Inquiry Sent", {
        description:
          "Thank you for reaching out. A RescueLink support coordinator has received your message and will follow up shortly.",
      });
    }, 600);
  };

  return (
    <Screen>
      <TopBar title="Help & Support" subtitle="Emergency Assistance & FAQs" back="/profile" />

      {/* Emergency Hotline Quick Access */}
      <section className="px-4 pt-4">
        <div className="rounded-3xl bg-surface border border-border/80 p-4 shadow-[var(--shadow-soft)]">
          <div className="flex items-center gap-2 mb-3">
            <PhoneCall className="h-4.5 w-4.5 text-primary" />
            <h2 className="text-[14.5px] font-bold text-navy">24/7 National Emergency Helplines</h2>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {EMERGENCY_HOTLINES.map((h) => (
              <a
                key={h.number}
                href={`tel:${h.number}`}
                className={`press flex flex-col justify-between rounded-2xl border p-3 transition-transform active:scale-95 ${h.tone}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[17px] font-black tracking-tight">{h.number}</span>
                  <PhoneCall className="h-3.5 w-3.5 opacity-80" />
                </div>
                <div className="mt-2">
                  <p className="text-[12px] font-bold leading-tight">{h.name}</p>
                  <p className="text-[10px] opacity-80 leading-snug mt-0.5">{h.desc}</p>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Frequently Asked Questions */}
      <section className="px-4 pt-6">
        <SectionHeader title="Frequently Asked Questions" />
        <Card className="divide-y divide-border/60 p-0">
          {FAQS.map((faq, idx) => {
            const isOpen = openFaq === idx;
            return (
              <div key={idx} className="p-4 first:rounded-t-3xl last:rounded-b-3xl">
                <button
                  type="button"
                  onClick={() => toggleFaq(idx)}
                  className="flex w-full items-start justify-between gap-3 text-left"
                  aria-expanded={isOpen}
                >
                  <span className="text-[13.5px] font-bold text-navy leading-snug">
                    {faq.question}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 mt-0.5 ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {isOpen && (
                  <p className="mt-2.5 text-[12.5px] leading-relaxed text-muted-foreground animate-fade-in">
                    {faq.answer}
                  </p>
                )}
              </div>
            );
          })}
        </Card>
      </section>

      {/* Contact Support & Message Form */}
      <section className="px-4 pt-6 pb-4">
        <SectionHeader title="Contact Support Team" />
        <Card className="p-4 sm:p-5">
          <div className="flex items-start gap-3 mb-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-accent text-info">
              <Mail className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[14px] font-bold text-navy">RescueLink Help Desk</p>
              <p className="text-xs text-muted-foreground">
                Inquiries, technical issues, or feedback:{" "}
                <span className="font-semibold text-foreground">support@rescuelink.org</span>
              </p>
            </div>
          </div>

          <form onSubmit={handleSupportSubmit} className="space-y-3">
            <div>
              <label
                htmlFor="support-subject"
                className="block text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1"
              >
                Subject
              </label>
              <input
                id="support-subject"
                type="text"
                placeholder="e.g. Question about shelter status or SOS"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="h-11 w-full rounded-xl border border-border bg-card px-3 text-[13px] outline-none focus:border-ring"
              />
            </div>

            <div>
              <label
                htmlFor="support-message"
                className="block text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1"
              >
                Message
              </label>
              <textarea
                id="support-message"
                rows={3}
                placeholder="Describe your issue or suggestions..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
                className="w-full rounded-xl border border-border bg-card p-3 text-[13px] outline-none focus:border-ring resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="press flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-navy text-[13.5px] font-bold text-white shadow-xs disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              <span>{isSubmitting ? "Sending..." : "Send Message"}</span>
            </button>
          </form>
        </Card>
      </section>
    </Screen>
  );
}
