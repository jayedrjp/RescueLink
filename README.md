# RescueLink — সাহায্য হোক সহজ

RescueLink is a proposed centralized digital disaster-response platform for Bangladesh, connecting disaster-affected people with shelters, emergency services, volunteers, NGOs, and donors during floods, cyclones, storms, and other natural disasterss.

This repository is the **monorepo** for RescueLink — it contains the public website, the mobile application, and (where applicable) the admin/NGO interface.

> **Status:** Academic prototype, developed as part of the CSE 416 (Software Project Design and Development) course project at the University of Information Technology and Sciences (UITS).

---

## ✨ Overview

RescueLink is designed as a mobile-first emergency response platform, made up of three connected parts:

- **Website** — public landing page introducing RescueLink, its features, and access points for downloading the app, volunteering, and donating.
- **Mobile App** — the core end-user application (SOS, shelter finder, live map, alerts, volunteer & donation modules).
- **Admin / NGO Interface** — management dashboard for shelters, SOS requests, alerts, volunteers, and donations.

**Website features:**
- Hero section with app preview · Impact/trust statistics · About RescueLink
- Feature highlights (SOS, Live Map, Shelters, Alerts, Volunteer, Donate)
- App showcase · How It Works · Live Map preview with legend
- Volunteer & Donation sections · Disaster alerts · Why RescueLink
- Final call-to-action · Full footer with navigation and social links

**Mobile app features:** Authentication, Home, SOS System, Shelter Finder, Emergency Services, Live Map, Disaster Alerts, Volunteer Module, Donation Module, User Profile.

**Admin interface features:** Admin Authentication, User Management, Shelter Management, SOS Management, Alert Management, Volunteer Management, Donation Management.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Website | HTML5, CSS3, vanilla JavaScript (current) → Next.js, TypeScript, Tailwind CSS, Framer Motion, Lucide React (planned) |
| Mobile App | React Native, Expo, TypeScript |
| Admin Interface | React Native / Expo or Next.js (see `admin/` for the actual implementation) |
| Backend | Firebase |
| Database | Cloud Firestore |
| Authentication | Firebase Authentication |
| Storage | Firebase Storage |
| Notifications | Firebase Cloud Messaging |
| Location / Map | Google Maps Platform |
| Deployment | Vercel (website), Expo/EAS (mobile app) |

---

## 📁 Project Structure

```
├── website/             # Public landing page (HTML/CSS/JS, migrating to Next.js)
│   ├── index.html
│   └── images/
│       └── rescuelink-logo.png
├── mobile-app/           # RescueLink mobile application (React Native / Expo)
├── admin/                # Admin / NGO management interface
└── README.md
```

> 📝 **Note:** Folder names above (`website/`, `mobile-app/`, `admin/`) are a suggested convention — rename to match however you structure the actual repo once the mobile app and admin interface are added.

---

## 🚀 Getting Started

Clone the repository:
```bash
git clone https://github.com/<your-username>/rescuelink.git
cd rescuelink
```

### Website
No build tools required for the current static version:
```bash
cd website
npx serve .
```
Visit `http://localhost:3000` (or the port shown in your terminal).

### Mobile App
```bash
cd mobile-app
npm install
npx expo start
```
Scan the QR code with the Expo Go app, or run on an emulator.

### Admin Interface
```bash
cd admin
npm install
npm run dev
```

> Setup steps for `mobile-app/` and `admin/` will be finalized once those codebases are pushed — update this section to match their actual `package.json` scripts.

---

## 🎨 Design System

Shared design tokens used across the website, mobile app, and admin interface, to keep all three visually consistent. Reference this section when building any new screen or component.

| Token | Value | Usage |
|---|---|---|
| `color.emergency-red` | `#EF1B23` | Primary CTA, SOS, alerts, warnings |
| `color.navy` | `#071B33` | Primary text, headers, dark sections |
| `color.safety-green` | `#22A447` | Success states, confirmations, safe status |
| `color.soft-blue` | `#EAF4FF` | Backgrounds, cards, subtle highlights |
| `color.background` | `#FAFAF9` | Page/app background |
| `font.primary` | Hind Siliguri | All UI text (Bangla + English) |
| `logo` | `website/images/rescuelink-logo.png` | Use as-is — do not redesign, recolor, or recreate |

> As the mobile app and admin interface are added, consider moving these tokens into a shared `packages/design-tokens/` module (e.g. a small JSON/TS file) so all three apps import from one source instead of duplicating values.

---

## 📌 Roadmap

- [x] Website landing page
- [ ] Mobile application (React Native / Expo)
- [ ] Admin / NGO management interface
- [ ] Firebase backend integration (Auth, Firestore, Storage, FCM)
- [ ] Live map integration (Google Maps Platform)
- [ ] Website migration to Next.js + Tailwind CSS

---

## 👥 Team

| Member | Role |
|---|---|
| Abdur Rahman Jayed | Mobile application development, backend/database integration |
| Rowshon Jahan Poddo | Website development, admin system, UI/UX design, documentation |

**Course:** CSE 416 — Software Project Design and Development

**Supervisor:** Dr. Mahfida Amjad Dipa, Department of Computer Science and Engineering, UITS

---

## 📄 License

This project is developed for academic purposes as part of a university course project. License to be determined.
