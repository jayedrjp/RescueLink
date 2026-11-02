# RescueLink — সাহায্য হোক সহজ · Help Made Simple

[![React](https://img.shields.io/badge/React-19-blue.svg)](https://react.dev/)
[![TanStack Start](https://img.shields.io/badge/TanStack%20Start-1.168-ff4154.svg)](https://tanstack.com/start)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-v4-38bdf8.svg)](https://tailwindcss.com/)
[![Firebase Firestore](https://img.shields.io/badge/Firebase-Firestore-ffca28.svg)](https://firebase.google.com/)
[![Leaflet](https://img.shields.io/badge/Leaflet-1.9.4-199900.svg)](https://leafletjs.com/)

**RescueLink** is a centralized emergency response and disaster-relief progressive web application engineered for Bangladesh. It connects citizens facing floods, cyclones, building collapses, and natural disasters with emergency shelters, active responders, verified helplines, relief supplies, and volunteer support in real time.

> **Status:** Academic prototype, developed as part of the CSE 416 (Software Project Design and Development) course project at the University of Information Technology and Sciences (UITS).

---

## ✨ Features & Workflows

- **Honest Emergency SOS Dispatch:** Immediate SOS submission with device GPS coordinates or manual landmark address, live Firestore status tracking (`active` → `assigned` → `resolved`), zero fabricated responses/ETAs, and direct 999 emergency hotline integration with automatic retry handling.
- **Interactive Disaster Map:** Live Leaflet and OpenStreetMap integration displaying verified emergency hospitals, fire service units, police stations, pharmacies, and shelters across Bangladesh with dialable helplines, Haversine distance, and directions.
- **Shelter Directory:** Real-time bed capacity and occupancy tracking, facilities checklist, relief needs, search, and dynamic distance calculations.
- **Disaster Alerts:** Live emergency cyclone, flood, and weather warnings categorized by severity (`critical`, `high`, `moderate`) with relative timestamps.
- **Donation & Relief Support:** Financial donations and relief supply contributions (dry food, water purification, medicines, blankets) tracked live.
- **Volunteer Management:** Structured volunteer onboarding, skill selection, administrator verification, and a live SOS responder dispatch queue (`/volunteer/sos`) with atomic claim and resolution transitions.
- **Role-Based Administrator Portal:** Privilege-escalation-proof administration, real-time citizen and volunteer directory oversight, volunteer approvals/rejections with persisted review notes, shelter capacity adjustments, alert broadcasts, and emergency dispatch.
- **User Profile & Safety:** Per-user isolated emergency contacts (`rl_contacts_${uid}`) with full CRUD, saved shelters bookmarking, truthful device permissions dashboard, and volunteer task participation.

---

## 🛠️ Technology Stack

| Layer                  | Technology                                                                                    | Notes / Purpose                                                                  |
| ---------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **Framework**          | [TanStack Start](https://tanstack.com/start) + [TanStack Router](https://tanstack.com/router) | Full-stack SSR and client routing with type-safe route guards                    |
| **UI Library**         | [React 19](https://react.dev)                                                                 | Modern concurrent rendering                                                      |
| **Styling & Icons**    | [Tailwind CSS v4](https://tailwindcss.com) + Radix UI + Lucide React                          | Emergency red design system (`#E6293A`), Plus Jakarta Sans, Noto Sans Bengali    |
| **Backend & Database** | [Google Cloud Firestore](https://firebase.google.com/docs/firestore)                          | Real-time snapshot listeners for SOS, shelters, alerts, and donations            |
| **Authentication**     | [Firebase Authentication](https://firebase.google.com/docs/auth)                              | Email/password + Google OAuth; session persistence with non-blocking resolution  |
| **Maps & Geography**   | [Leaflet](https://leafletjs.com) + OpenStreetMap Nominatim & Overpass API                     | Asynchronous tiles, 50-node query bounding, debouncing, and Haversine formula    |
| **Security Rules**     | Custom Firestore Rules (`firestore.rules`)                                                    | Privilege-escalation defense, citizen/volunteer write restrictions, field guards |
| **Testing**            | [Vitest](https://vitest.dev) + React Testing Library + Local Firestore Evaluator              | 16 test suites, 385+ unit & integration tests                                    |
| **Target Platforms**   | Cloudflare Workers / Node.js SSR / Firebase Hosting                                           | Built with Vite & Nitro                                                          |

---

## 📁 Project Architecture

```
rescuelink/
├── firestore.rules               # Production security rules (users, sos_requests, shelters, alerts, donations)
├── firebase.json                 # Firebase CLI configuration
├── .firebaserc                   # Firebase project binding
├── .env.example                  # Environment configuration template
├── src/
│   ├── components/               # Reusable UI primitives (Screen, Card, TopBar, InteractiveMap, etc.)
│   │   ├── ui/                   # Radix UI styled building blocks (button, dialog, toast, form, etc.)
│   │   └── rl.tsx                # RescueLink domain components (TopBar, BottomNav, StatusBadge, etc.)
│   ├── context/                  # AuthContext with non-blocking initialization & session management
│   ├── lib/
│   │   ├── firebase/             # Firestore operations, Auth client, rules evaluator, typed interfaces
│   │   │   ├── config.ts         # Firebase initialization with zero silent fallbacks
│   │   │   ├── auth.ts           # Authentication workflows & registration race mitigation
│   │   │   ├── firestore.ts      # Profile, SOS, shelter, alert, and donation operations
│   │   │   └── types.ts          # Strongly typed domain models
│   │   ├── map/                  # Verified Bangladesh emergency places, OSM Overpass integration
│   │   ├── data.ts               # Shelters, alerts, donations data models & seed fallback
│   │   ├── phone.ts              # Phone normalization (+880), validation, and dialable sanitization
│   │   └── route-guards.ts       # Role-based route guards (citizen, volunteer, admin)
│   └── routes/                   # TanStack file-based router pages
│       ├── __root.tsx            # Root layout, splash screen, HTML shell
│       ├── index.tsx             # Citizen home screen & emergency overview
│       ├── sos.tsx               # 3-step Emergency SOS submission workflow
│       ├── map.tsx               # Live disaster map & emergency service pins
│       ├── shelters.index.tsx     # Shelters directory, filters, capacity tracking
│       ├── shelters.$shelterId.tsx# Shelter detail, occupancy, bookmarking
│       ├── alerts.tsx            # Disaster warnings & weather advisories
│       ├── donate.tsx            # Financial & supply donation recording
│       ├── volunteer.tsx         # Volunteer onboarding & application
│       ├── volunteer_.sos.tsx    # Volunteer live SOS responder screen
│       ├── profile.tsx           # Emergency contacts CRUD, activity, and account
│       ├── permissions.tsx       # Truthful device GPS & notification permissions
│       ├── admin.tsx             # Administrator oversight & user approvals
│       ├── admin_.alerts.tsx     # Administrator alert creator
│       └── admin_.donations.tsx  # Administrator donations audit
```

---

## 🚀 Environment Setup & Firebase Configuration

### Prerequisites

- **Node.js**: `v20.x` or higher
- **Package Manager**: `npm` (v10+)
- **Firebase Account**: Access to [Firebase Console](https://console.firebase.google.com/)

### 1. Configure Environment Variables

Create `.env` in the root directory by copying `.env.example`:

```bash
cp .env.example .env
```

Populate `.env` with your real Firebase web configuration keys:

```env
# RescueLink Firebase Web Configuration
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=rescue-linkbd.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=rescue-linkbd
VITE_FIREBASE_STORAGE_BUCKET=rescue-linkbd.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=900119595279
VITE_FIREBASE_APP_ID=1:900119595279:web:531abf7f2859721b46167a
VITE_FIREBASE_MEASUREMENT_ID=

# Optional: Admin sign-in shortcut email (grant role: 'admin' in Firestore users/{uid})
VITE_ADMIN_EMAIL=admin@rescuelink.org
```

> [!IMPORTANT]
> RescueLink implements strict configuration verification in `src/lib/firebase/config.ts`. If required variables are missing or contain placeholder values, the application displays a clear "Firebase Configuration Required" banner and refuses to connect to any silent fallback.

---

## 🔒 Firebase Deployment Instructions

### 1. Setup Firebase Project & Authentication

1. Go to [Firebase Console](https://console.firebase.google.com/) and create a project (e.g. `rescue-linkbd`).
2. Navigate to **Build → Authentication**:
   - Enable **Email/Password** provider.
   - (Optional) Enable **Google** provider.
3. Navigate to **Build → Firestore Database**:
   - Click **Create Database**.
   - Choose production mode and select your closest region (e.g., `asia-south1`).

### 2. Deploy Firestore Security Rules

Deploy the hardened security rules that enforce role-based access control and prevent privilege escalation:

```bash
# Login to Firebase CLI
npx firebase login

# Target your project
npx firebase use rescue-linkbd

# Deploy rules
npx firebase deploy --only firestore:rules
```

_Alternatively, copy the complete contents of `firestore.rules` and paste them into Firebase Console → Firestore Database → Rules, then click **Publish**._

### 3. Provision the Initial Administrator Safely

Because client applications are strictly prohibited from granting the `admin` role:

1. Register an account through the RescueLink sign-up page (`/register`) or create the user directly in **Firebase Console → Authentication → Users → Add user**.
2. Open **Firebase Console → Firestore Database → `users` collection**.
3. Locate the user document corresponding to your administrator's UID (`users/{uid}`).
4. Change the `role` field value from `"user"` to `"admin"`.
5. _(Optional)_ Set `VITE_ADMIN_EMAIL` in your `.env` to allow logging in by typing `admin` in the email field.
6. Sign out and sign back in to access the `/admin` portal.

### 4. Data Initialization & Safe Migration

- **Collections:** The application manages five primary Firestore collections:
  - `users`: User profiles with roles (`user`, `volunteer`, `admin`).
  - `sos_requests`: Citizen SOS broadcasts with status transitions (`active`, `assigned`, `resolved`, `cancelled`).
  - `shelters`: Emergency shelter records with real-time capacity and occupancy tracking.
  - `alerts`: Active weather advisories and flood warnings.
  - `donations`: Relief fund and supply contribution records.
- **Automatic Fallback:** When a collection is empty, the application falls back safely to verified in-memory Bangladesh emergency shelters, warnings, and relief posts. Once documents are added by an administrator, the live Firestore collection immediately takes precedence.

---

## 🧪 Testing & Verification

Run all available automated verification suites:

```bash
# Run Vitest test suites (16 files, 385 tests)
npm test

# Type-check TypeScript codebase without emitting
npx tsc --noEmit

# Run ESLint linter
npm run lint

# Compile production bundle with Nitro and Vite
npm run build

# (Optional) Run security rules against local Firestore emulator
npm run test:rules
```

---

## 📦 Packaging & Distribution Guardrails

To protect sensitive credentials and prevent bloated builds, packaging distributions must strictly exclude sensitive and generated directories:

```bash
# Create a clean release archive excluding secrets and build outputs
tar -a -c -f rescuelink_completed.zip --exclude="node_modules" --exclude=".output" --exclude=".wrangler" --exclude=".tanstack" --exclude=".env" *
```

---

## 👥 Course & Team Attribution

- **Course:** CSE 416 — Software Project Design and Development
- **Institution:** University of Information Technology and Sciences (UITS)
- **Supervisor:** Dr. Mahfida Amjad Dipa, Department of Computer Science and Engineering, UITS
- **Project Lead & Full-Stack Developer:** Abdur Rahman Jayed
- **Collaborator:** Rowshon Jahan Poddo

---

## 📄 License

Academic prototype — developed for university coursework and educational disaster relief research.
