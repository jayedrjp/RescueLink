export type ShelterStatus = "open" | "limited" | "full";

export type Shelter = {
  id: string;
  name: string;
  area: string;
  distanceKm: number;
  occupied: number;
  capacity: number;
  status: ShelterStatus;
  facilities: string[];
  needs: string[];
  phone: string;
  image: string;
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
  },
];

export type Alert = {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  body: string;
  location: string;
  time: string;
};

export const alerts: Alert[] = [
  {
    id: "a1",
    severity: "critical",
    title: "Flash Flood Warning",
    body: "Heavy rainfall is expected in your area within the next 3 hours. Move to higher ground.",
    location: "Dhaka North",
    time: "8 min ago",
  },
  {
    id: "a2",
    severity: "warning",
    title: "Cyclone Update",
    body: "Cyclone Ashani is moving north-east at 18 km/h. Coastal districts on alert.",
    location: "Khulna, Barishal",
    time: "42 min ago",
  },
  {
    id: "a3",
    severity: "warning",
    title: "Heavy Rainfall Alert",
    body: "120mm rainfall recorded in the last 6 hours. Waterlogging expected in low areas.",
    location: "Mirpur, Kazipara",
    time: "1 hr ago",
  },
  {
    id: "a4",
    severity: "info",
    title: "Road Closure",
    body: "Airport Road southbound is closed due to waterlogging. Use Pragati Sarani.",
    location: "Banani",
    time: "2 hrs ago",
  },
  {
    id: "a5",
    severity: "info",
    title: "Shelter Capacity Update",
    body: "Mirpur Shelter Center now has 28 free beds available for families.",
    location: "Mirpur 10",
    time: "3 hrs ago",
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
  { id: "s1", category: "hospitals", name: "Dhaka Medical College Hospital", distanceKm: 2.1, status: "Emergency open · 24/7", open: true, phone: "+880 2 5561 6193", area: "Bakshi Bazar" },
  { id: "s2", category: "hospitals", name: "Square Hospital", distanceKm: 3.4, status: "Emergency open", open: true, phone: "+880 2 8144 466", area: "Panthapath" },
  { id: "s3", category: "ambulances", name: "Anjuman Ambulance Service", distanceKm: 0.9, status: "3 units available", open: true, phone: "+880 1711 998 877", area: "Mirpur 2" },
  { id: "s4", category: "ambulances", name: "Sadar Emergency Ambulance", distanceKm: 2.8, status: "1 unit available", open: true, phone: "999", area: "Kazipara" },
  { id: "s5", category: "police", name: "Mirpur Model Police Station", distanceKm: 1.4, status: "Open now", open: true, phone: "999", area: "Mirpur 1" },
  { id: "s6", category: "fire", name: "Mirpur Fire Service Station", distanceKm: 1.8, status: "Rescue team on standby", open: true, phone: "102", area: "Mirpur 12" },
  { id: "s7", category: "pharmacies", name: "Lazz Pharma", distanceKm: 0.6, status: "Open · closes 11 PM", open: true, phone: "+880 1811 445 566", area: "Kazipara" },
  { id: "s8", category: "pharmacies", name: "Tamanna Medicine Corner", distanceKm: 1.1, status: "Closed · opens 8 AM", open: false, phone: "+880 1911 224 668", area: "Shewrapara" },
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
  { id: "t1", title: "Food Distribution", area: "Mirpur Shelter Center", distanceKm: 1.2, urgency: "high", needed: 8, joined: 5, time: "Today · 4:00 PM" },
  { id: "t2", title: "Water Delivery", area: "Kazipara Camp", distanceKm: 2.0, urgency: "high", needed: 6, joined: 2, time: "Today · 6:30 PM" },
  { id: "t3", title: "Medicine Delivery", area: "Dhanmondi Community Hall", distanceKm: 2.6, urgency: "medium", needed: 4, joined: 4, time: "Tomorrow · 9:00 AM" },
  { id: "t4", title: "Shelter Support", area: "Uttara Model School Camp", distanceKm: 4.1, urgency: "medium", needed: 10, joined: 3, time: "Tomorrow · 11:00 AM" },
  { id: "t5", title: "Rescue Assistance", area: "Bauniabadh Low Area", distanceKm: 3.3, urgency: "high", needed: 12, joined: 7, time: "Ongoing" },
];

export const liveUpdates = [
  { id: "u1", tone: "critical", text: "Flood water rising in Bauniabadh, evacuation advised.", time: "5 min" },
  { id: "u2", tone: "warning", text: "Cyclone signal 3 raised for coastal districts.", time: "38 min" },
  { id: "u3", tone: "safe", text: "Mirpur Shelter Center opened 28 additional beds.", time: "1 hr" },
  { id: "u4", tone: "info", text: "Airport Road southbound closed by waterlogging.", time: "2 hrs" },
];
