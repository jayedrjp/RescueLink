export type ShelterStatus = "open" | "limited" | "full";

export type Shelter = {
  id: string;
  name: string;
  area: string;
  distanceKm?: number;
  occupied: number;
  capacity: number;
  status: ShelterStatus;
  facilities: string[];
  needs: string[];
  phone: string;
  image: string;
  coordinates?: { lat: number; lng: number };
  createdAt?: string;
  updatedAt?: string;
  isLocal?: boolean;
};

export const shelters: Shelter[] = [
  {
    id: "mirpur",
    name: "Mirpur Shelter Center",
    area: "Mirpur 10, Dhaka",
    distanceKm: 1.2,
    occupied: 72,
    capacity: 100,
    status: "open",
    facilities: ["Food", "Water", "Beds", "Medicine"],
    needs: ["Blankets", "Baby food", "Drinking water"],
    phone: "+880 1711 000 121",
    image: "shelter-1",
    coordinates: { lat: 23.8068, lng: 90.3688 },
    isLocal: true,
  },
  {
    id: "dhanmondi",
    name: "Dhanmondi Community Hall",
    area: "Dhanmondi 27, Dhaka",
    distanceKm: 2.6,
    occupied: 148,
    capacity: 180,
    status: "limited",
    facilities: ["Food", "Water", "Medicine"],
    needs: ["Medicine", "Mats", "Hygiene kits"],
    phone: "+880 1711 000 208",
    image: "shelter-2",
    coordinates: { lat: 23.7461, lng: 90.3742 },
    isLocal: true,
  },
  {
    id: "uttara",
    name: "Uttara Model School Camp",
    area: "Uttara Sector 7, Dhaka",
    distanceKm: 4.1,
    occupied: 200,
    capacity: 200,
    status: "full",
    facilities: ["Water", "Beds"],
    needs: ["Food", "Medicine", "Power banks"],
    phone: "+880 1711 000 317",
    image: "shelter-3",
    coordinates: { lat: 23.8721, lng: 90.3982 },
    isLocal: true,
  },
  {
    id: "mohammadpur",
    name: "Mohammadpur Relief Center",
    area: "Ring Road, Mohammadpur, Dhaka",
    distanceKm: 3.2,
    occupied: 94,
    capacity: 150,
    status: "open",
    facilities: ["Food", "Water", "Beds", "First Aid"],
    needs: ["Drinking water", "Emergency supplies"],
    phone: "+880 1711 000 412",
    image: "shelter-1",
    coordinates: { lat: 23.7612, lng: 90.3621 },
    isLocal: true,
  },
];

export type Alert = {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  body: string;
  location: string;
  time?: string;
  createdAt?: string;
  updatedAt?: string;
  category?: "flood" | "cyclone" | "rainfall" | "road" | "shelter" | "general";
};

export const alerts: Alert[] = [
  {
    id: "a1",
    severity: "critical",
    title: "Flash Flood Warning",
    body: "Heavy rainfall is expected in your area within the next 3 hours. Move to higher ground.",
    location: "Dhaka North",
    time: "8 min ago",
    createdAt: new Date(Date.now() - 8 * 60000).toISOString(),
    category: "flood",
  },
  {
    id: "a2",
    severity: "warning",
    title: "Cyclone Update",
    body: "Cyclone Ashani is moving north-east at 18 km/h. Coastal districts on alert.",
    location: "Khulna, Barishal",
    time: "42 min ago",
    createdAt: new Date(Date.now() - 42 * 60000).toISOString(),
    category: "cyclone",
  },
  {
    id: "a3",
    severity: "warning",
    title: "Heavy Rainfall Alert",
    body: "120mm rainfall recorded in the last 6 hours. Waterlogging expected in low areas.",
    location: "Mirpur, Kazipara",
    time: "1 hr ago",
    createdAt: new Date(Date.now() - 60 * 60000).toISOString(),
    category: "rainfall",
  },
  {
    id: "a4",
    severity: "info",
    title: "Road Closure",
    body: "Airport Road southbound is closed due to waterlogging. Use Pragati Sarani.",
    location: "Banani",
    time: "2 hrs ago",
    createdAt: new Date(Date.now() - 120 * 60000).toISOString(),
    category: "road",
  },
  {
    id: "a5",
    severity: "info",
    title: "Shelter Capacity Update",
    body: "Mirpur Shelter Center now has 28 free beds available for families.",
    location: "Mirpur 10",
    time: "3 hrs ago",
    createdAt: new Date(Date.now() - 180 * 60000).toISOString(),
    category: "shelter",
  },
];

export type Service = {
  id: string;
  category: "hospitals" | "ambulances" | "police" | "fire" | "pharmacies";
  name: string;
  distanceKm: number;
  status: string;
  open: boolean;
  phone: string;
  area: string;
};

export const services: Service[] = [
  {
    id: "s1",
    category: "hospitals",
    name: "Dhaka Medical College Hospital",
    distanceKm: 2.1,
    status: "Emergency open · 24/7",
    open: true,
    phone: "+880 2 5561 6193",
    area: "Bakshi Bazar",
  },
  {
    id: "s2",
    category: "hospitals",
    name: "Square Hospital",
    distanceKm: 3.4,
    status: "Emergency open",
    open: true,
    phone: "+880 2 8144 466",
    area: "Panthapath",
  },
  {
    id: "s3",
    category: "ambulances",
    name: "Anjuman Ambulance Service",
    distanceKm: 0.9,
    status: "3 units available",
    open: true,
    phone: "+880 1711 998 877",
    area: "Mirpur 2",
  },
  {
    id: "s4",
    category: "ambulances",
    name: "Sadar Emergency Ambulance",
    distanceKm: 2.8,
    status: "1 unit available",
    open: true,
    phone: "999",
    area: "Kazipara",
  },
  {
    id: "s5",
    category: "police",
    name: "Mirpur Model Police Station",
    distanceKm: 1.4,
    status: "Open now",
    open: true,
    phone: "999",
    area: "Mirpur 1",
  },
  {
    id: "s6",
    category: "fire",
    name: "Mirpur Fire Service Station",
    distanceKm: 1.8,
    status: "Rescue team on standby",
    open: true,
    phone: "102",
    area: "Mirpur 12",
  },
  {
    id: "s7",
    category: "pharmacies",
    name: "Lazz Pharma",
    distanceKm: 0.6,
    status: "Open · closes 11 PM",
    open: true,
    phone: "+880 1811 445 566",
    area: "Kazipara",
  },
  {
    id: "s8",
    category: "pharmacies",
    name: "Tamanna Medicine Corner",
    distanceKm: 1.1,
    status: "Closed · opens 8 AM",
    open: false,
    phone: "+880 1911 224 668",
    area: "Shewrapara",
  },
];

export type Task = {
  id: string;
  title: string;
  area: string;
  distanceKm: number;
  urgency: "high" | "medium" | "low";
  needed: number;
  joined: number;
  time: string;
};

export const tasks: Task[] = [
  {
    id: "t1",
    title: "Food Distribution",
    area: "Mirpur Shelter Center",
    distanceKm: 1.2,
    urgency: "high",
    needed: 8,
    joined: 5,
    time: "Today · 4:00 PM",
  },
  {
    id: "t2",
    title: "Water Delivery",
    area: "Kazipara Camp",
    distanceKm: 2.0,
    urgency: "high",
    needed: 6,
    joined: 2,
    time: "Today · 6:30 PM",
  },
  {
    id: "t3",
    title: "Medicine Delivery",
    area: "Dhanmondi Community Hall",
    distanceKm: 2.6,
    urgency: "medium",
    needed: 4,
    joined: 4,
    time: "Tomorrow · 9:00 AM",
  },
  {
    id: "t4",
    title: "Shelter Support",
    area: "Uttara Model School Camp",
    distanceKm: 4.1,
    urgency: "medium",
    needed: 10,
    joined: 3,
    time: "Tomorrow · 11:00 AM",
  },
  {
    id: "t5",
    title: "Rescue Assistance",
    area: "Bauniabadh Low Area",
    distanceKm: 3.3,
    urgency: "high",
    needed: 12,
    joined: 7,
    time: "Ongoing",
  },
];

export const liveUpdates = [
  {
    id: "u1",
    tone: "critical",
    text: "Flood water rising in Bauniabadh, evacuation advised.",
    time: "5 min",
  },
  {
    id: "u2",
    tone: "warning",
    text: "Cyclone signal 3 raised for coastal districts.",
    time: "38 min",
  },
  {
    id: "u3",
    tone: "safe",
    text: "Mirpur Shelter Center opened 28 additional beds.",
    time: "1 hr",
  },
  {
    id: "u4",
    tone: "info",
    text: "Airport Road southbound closed by waterlogging.",
    time: "2 hrs",
  },
];

export type DonationRecord = {
  id: string;
  donorName: string;
  donorEmail: string;
  donorUid?: string;
  type: "money" | "supplies";
  amount?: number;
  items?: string[];
  shelterId: string;
  shelterName: string;
  date: string;
  status?: "completed" | "pledged";
};

export const initialDonations: DonationRecord[] = [
  {
    id: "don-1",
    donorName: "Tanvir Ahmed",
    donorEmail: "tanvir.ahmed@gmail.com",
    type: "money",
    amount: 5000,
    shelterId: "mirpur",
    shelterName: "Mirpur Shelter Center",
    date: new Date(Date.now() - 35 * 60000).toISOString(),
    status: "completed",
  },
  {
    id: "don-2",
    donorName: "Farhana Yasmin",
    donorEmail: "farhana.y@yahoo.com",
    type: "supplies",
    items: ["Blankets", "Baby food", "Water"],
    shelterId: "mirpur",
    shelterName: "Mirpur Shelter Center",
    date: new Date(Date.now() - 110 * 60000).toISOString(),
    status: "pledged",
  },
  {
    id: "don-3",
    donorName: "Kazi Mahmudul Hasan",
    donorEmail: "hasan.kazi@gmail.com",
    type: "money",
    amount: 2500,
    shelterId: "dhanmondi",
    shelterName: "Dhanmondi Community Hall",
    date: new Date(Date.now() - 240 * 60000).toISOString(),
    status: "completed",
  },
  {
    id: "don-4",
    donorName: "Nusrat Jahan",
    donorEmail: "nusrat.jahan@outlook.com",
    type: "money",
    amount: 1000,
    shelterId: "uttara",
    shelterName: "Uttara Model School Camp",
    date: new Date(Date.now() - 480 * 60000).toISOString(),
    status: "completed",
  },
];

/**
 * Safely computes occupancy percentage without division by zero (DATA-5).
 */
export function safeOccupancyPercent(occupied: number, capacity: number): number {
  if (!capacity || capacity <= 0) return 0;
  const pct = Math.round((Math.max(0, occupied) / capacity) * 100);
  return Math.min(100, Math.max(0, pct));
}

/**
 * Formats an alert's createdAt timestamp into human-readable relative time.
 * If createdAt is absent, falls back to the static time string.
 */
export function formatAlertTime(alert: Alert): string {
  if (!alert.createdAt) return alert.time || "Recently";
  const diffMs = Date.now() - new Date(alert.createdAt).getTime();
  if (isNaN(diffMs) || diffMs < 0) return alert.time || "Just now";
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs} hr${diffHrs > 1 ? "s" : ""} ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
}

export function isFallbackShelter(id: string): boolean {
  return ["mirpur", "dhanmondi", "uttara", "mohammadpur"].includes(id);
}

// Persistent Helpers for Shelters
export function getStoredShelters(): Shelter[] {
  if (typeof window === "undefined") return shelters.map((s) => ({ ...s, isLocal: true }));
  try {
    const raw = localStorage.getItem("rl_custom_shelters");
    if (!raw) return shelters.map((s) => ({ ...s, isLocal: true }));
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return shelters.map((s) => ({ ...s, isLocal: true }));
    }
    return parsed.map((s: Shelter) => ({
      ...s,
      isLocal: typeof s.isLocal === "boolean" ? s.isLocal : isFallbackShelter(s.id),
    }));
  } catch {
    return shelters.map((s) => ({ ...s, isLocal: true }));
  }
}

export function getShelterById(id: string): Shelter | undefined {
  const all = getStoredShelters();
  return all.find((s) => s.id === id) || shelters.find((s) => s.id === id);
}

export function saveShelters(list: Shelter[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("rl_custom_shelters", JSON.stringify(list));
  } catch {
    // ignore
  }
}

export function updateStoredShelter(id: string, updates: Partial<Shelter>): Shelter[] {
  const current = getStoredShelters();
  const exists = current.some((s) => s.id === id);
  let next: Shelter[];

  if (exists) {
    next = current.map((s) => {
      if (s.id === id) {
        const merged = { ...s, ...updates };
        const cap = Number(merged.capacity) > 0 ? Number(merged.capacity) : 1;
        merged.capacity = cap;
        merged.occupied = Math.max(0, Math.min(Number(merged.occupied) || 0, cap));
        const ratio = merged.occupied / cap;
        merged.status = ratio >= 1 ? "full" : ratio >= 0.8 ? "limited" : "open";
        merged.facilities = Array.isArray(merged.facilities)
          ? merged.facilities
          : s.facilities || [];
        merged.needs = Array.isArray(merged.needs) ? merged.needs : s.needs || [];
        merged.updatedAt = new Date().toISOString();
        return merged;
      }
      return s;
    });
  } else {
    const cap = Number(updates.capacity) > 0 ? Number(updates.capacity) : 1;
    const occ = Math.max(0, Math.min(Number(updates.occupied) || 0, cap));
    const ratio = occ / cap;
    const normalized: Shelter = {
      ...updates,
      id,
      name: updates.name || "Shelter",
      area: updates.area || "Area",
      capacity: cap,
      occupied: occ,
      status: ratio >= 1 ? "full" : ratio >= 0.8 ? "limited" : "open",
      phone: updates.phone || "",
      image: updates.image || "shelter-1",
      facilities: Array.isArray(updates.facilities) ? updates.facilities : [],
      needs: Array.isArray(updates.needs) ? updates.needs : [],
      createdAt: updates.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isLocal: updates.isLocal ?? false,
    };
    next = [...current, normalized];
  }

  saveShelters(next);
  return next;
}

export function addStoredShelter(newShelter: Shelter): Shelter[] {
  const current = getStoredShelters();
  const cap = Number(newShelter.capacity) > 0 ? Number(newShelter.capacity) : 1;
  const occ = Math.max(0, Math.min(Number(newShelter.occupied) || 0, cap));
  const normalized: Shelter = {
    ...newShelter,
    capacity: cap,
    occupied: occ,
    status: occ >= cap ? "full" : occ >= cap * 0.8 ? "limited" : "open",
    createdAt: newShelter.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const next = [normalized, ...current.filter((s) => s.id !== newShelter.id)];
  saveShelters(next);
  return next;
}

// Persistent Helpers for Disaster Alerts
export function getStoredAlerts(): Alert[] {
  if (typeof window === "undefined") return alerts;
  try {
    const raw = localStorage.getItem("rl_custom_alerts");
    if (!raw) return alerts;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : alerts;
  } catch {
    return alerts;
  }
}

export function saveAlerts(list: Alert[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("rl_custom_alerts", JSON.stringify(list));
  } catch {
    // ignore
  }
}

export function addStoredAlert(newAlert: Alert): Alert[] {
  const current = getStoredAlerts();
  const alertWithTime: Alert = {
    ...newAlert,
    createdAt: newAlert.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const next = [alertWithTime, ...current.filter((a) => a.id !== newAlert.id)];
  saveAlerts(next);
  return next;
}

export function deleteStoredAlert(id: string): Alert[] {
  const current = getStoredAlerts();
  const next = current.filter((a) => a.id !== id);
  saveAlerts(next);
  return next;
}

// Persistent Helpers for Donations
export function getStoredDonations(): DonationRecord[] {
  if (typeof window === "undefined") return initialDonations;
  try {
    const raw = localStorage.getItem("rl_donations_log");
    if (!raw) {
      localStorage.setItem("rl_donations_log", JSON.stringify(initialDonations));
      return initialDonations;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : initialDonations;
  } catch {
    return initialDonations;
  }
}

export function addStoredDonation(record: DonationRecord): DonationRecord[] {
  const current = getStoredDonations();
  const next = [record, ...current];
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem("rl_donations_log", JSON.stringify(next));
    } catch {
      // ignore
    }
  }
  return next;
}
