# RescueLink — সাহায্য হোক সহজ · Help Made Simple

[![React](https://img.shields.io/badge/React-19-blue.svg)](https://react.dev/)
[![TanStack Start](https://img.shields.io/badge/TanStack%20Start-1.168-ff4154.svg)](https://tanstack.com/start)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-v4-38bdf8.svg)](https://tailwindcss.com/)
[![Firebase Firestore](https://img.shields.io/badge/Firebase-Firestore-ffca28.svg)](https://firebase.google.com/)
[![Leaflet](https://img.shields.io/badge/Leaflet-1.9.4-199900.svg)](https://leafletjs.com/)
[![Capacitor](https://img.shields.io/badge/Capacitor-Android%208.5-1192e8.svg)](https://capacitorjs.com/)

---

## 1. Project Overview & Purpose

**RescueLink** is a modern, high-resilience emergency response and disaster-relief platform engineered for Bangladesh. Developed as a software-only disaster management system, RescueLink connects citizens facing severe flooding, cyclones, waterlogging, building collapses, and natural disasters directly with emergency shelters, active responders, verified helplines, relief supplies, and volunteer teams in real time.

The platform provides:

- Immediate 3-step Emergency SOS submission with live status tracking (`active` → `assigned` → `resolved`).
- Zero fabricated responses, fake units, or simulated ETAs.
- Direct integration with Bangladesh's national `999` emergency hotline and offline phone fallback.
- Dynamic Haversine distance calculations and directions to verified medical facilities, fire stations, police stations, and shelters.
- Full offline-first local cache fallback so critical contact numbers and safety procedures remain available when network connectivity drops.

> **Status:** Academic prototype developed as part of course CSE 416 (Software Project Design and Development) at the University of Information Technology and Sciences (UITS).

---

## 2. Actual Technology Stack

RescueLink uses a modern, unified full-stack TypeScript architecture:

| Layer                  | Technology                                                       | Version / Specifications     | Notes                                                                     |
| :--------------------- | :--------------------------------------------------------------- | :--------------------------- | :------------------------------------------------------------------------ |
| **Framework**          | [TanStack Start](https://tanstack.com/start)                     | `^1.168.32`                  | Full-stack SSR with file-based routing and route-level guards             |
| **Routing**            | [TanStack Router](https://tanstack.com/router)                   | `^1.170.18`                  | Type-safe router, search parameter validation, and navigation lifecycle   |
| **UI Library**         | [React](https://react.dev)                                       | `^19.2.0`                    | React 19 concurrent features                                              |
| **Styling**            | [Tailwind CSS v4](https://tailwindcss.com)                       | `^4.2.1`                     | Mobile-first emergency design system (`#E6293A` primary, `#0F172A` navy)  |
| **Typography**         | Plus Jakarta Sans & Noto Sans Bengali                            | Google Fonts                 | Crisp Latin typography paired with native Bengali rendering               |
| **Icons & Primitives** | Radix UI + Lucide React                                          | Modern primitives            | Accessible dialogs, drawers, dropdowns, and alert badges                  |
| **Database**           | [Cloud Firestore](https://firebase.google.com/docs/firestore)    | `^13.0.0`                    | Real-time listeners, transactions, and role-based security rules          |
| **Authentication**     | [Firebase Authentication](https://firebase.google.com/docs/auth) | `^13.0.0`                    | Email/password, Google OAuth, local browser session persistence           |
| **Mobile Runtime**     | [Capacitor](https://capacitorjs.com)                             | `^8.5.3`                     | Cross-platform Android wrapper, native geolocation, and social login      |
| **Maps & GIS**         | [Leaflet](https://leafletjs.com) + OpenStreetMap                 | `^1.9.4`                     | OpenStreetMap tiles, Nominatim reverse geocoding, Overpass API            |
| **Build & SSR**        | [Vite](https://vitejs.dev) + [Nitro](https://nitro.unjs.io)      | `v8.2.2` / `3.0.260603-beta` | Dual-build: Nitro Cloudflare SSR worker for web, static bundle for mobile |
| **Testing**            | [Vitest](https://vitest.dev)                                     | `^3.2.7`                     | 32 test suites, 662 automated unit/integration tests                      |

---

## 3. Project Structure Overview

```
rescuelink/
├── android/                          # Native Android Capacitor wrapper project
│   ├── app/                          # Android application module (build.gradle, manifest, assets)
│   │   ├── google-services.json      # Android Firebase client configuration
│   │   └── src/main/                 # Android source and Capacitor entrypoint
│   └── build.gradle                  # Top-level Gradle build configuration
├── dist/                             # Compiled mobile client distribution (for Capacitor sync)
├── .output/                          # Nitro/Vite compiled SSR bundle (for Cloudflare / Node deployment)
├── docs/                             # Comprehensive audit trackers and architecture specifications
│   └── master-audit-tracker.md       # Master tracking document for all audit findings
├── firestore.rules                   # Production Cloud Firestore security rules
├── firebase.json                     # Firebase CLI project configuration
├── package.json                      # Single npm package manifest (name: "rescuelink")
├── package-lock.json                 # Authoritative npm lockfile
├── .env.example                      # Documented environment variable template
├── .gitignore                        # Strict secret, runtime, and archive exclusion rules
├── vite.config.ts                    # Web & Nitro SSR build configuration
├── vite.mobile.config.ts             # Mobile production SPA build configuration
└── src/
    ├── components/                   # Shared UI primitives (Screen, Card, TopBar, MiniMapPreview)
    │   ├── ui/                       # Radix UI building blocks (dialog, toast, buttons)
    │   └── rl.tsx                    # RescueLink design system components
    ├── context/                      # React Context providers (AuthContext with non-blocking resolution)
    ├── lib/
    │   ├── firebase/                 # Firebase operations and security interfaces
    │   │   ├── config.ts             # Strict Firebase client initialization with zero silent fallbacks
    │   │   ├── auth.ts               # Sign-in, sign-up, password reset, and registration race mitigation
    │   │   ├── firestore.ts          # Strongly typed queries, listeners, and mutations
    │   │   └── types.ts              # Canonical domain interfaces (UserProfile, SosRequest, Shelter)
    │   ├── map/                      # Leaflet setup, Overpass API query integration, Bangladesh places
    │   │   ├── places.ts             # Verified emergency services directory and Nominatim cache
    │   │   └── types.ts              # GeoJSON and coordinate validation interfaces
    │   ├── data.ts                   # Shelter, donation, and alert models with local fallback seed
    │   ├── date-utils.ts             # Robust ISO/Timestamp formatting and relative time calculations
    │   ├── phone.ts                  # Bangladeshi phone normalization (+880), validation, and dialable URIs
    │   ├── route-guards.ts           # Router-level auth guard (requireSignedIn)
    │   └── push-notifications.ts     # Web push subscription and notification permissions
    └── routes/                       # TanStack Start file-based routing
        ├── __root.tsx                # Application shell, meta tags, and global toast container
        ├── index.tsx                 # Citizen home dashboard and quick SOS action
        ├── sos.tsx                   # 3-step Emergency SOS submission workflow
        ├── map.tsx                   # Full-screen disaster map with live GPS and emergency POIs
        ├── shelters.index.tsx        # Shelters directory with saved filter and occupancy tracking
        ├── shelters.$shelterId.tsx   # Detailed shelter view with bookmarking and capacity breakdown
        ├── alerts.tsx                # Disaster warnings and BMD weather advisories
        ├── donate.tsx                # Financial contributions and relief supply ledger
        ├── volunteer.tsx             # Volunteer application submission and relief task boards
        ├── volunteer_.sos.tsx        # Real-time responder emergency triage queue
        ├── profile.tsx               # Isolated emergency contacts CRUD, saved shelters, and activity
        ├── permissions.tsx           # Transparent browser GPS and notification permissions manager
        ├── instructions.tsx          # Step-by-step disaster preparedness guides
        ├── support.tsx               # Emergency contacts and technical support
        ├── admin.tsx                 # Super-administrator portal (triage, shelters, volunteers)
        ├── admin_.citizens.tsx       # Registered citizen directory
        ├── admin_.alerts.tsx         # Disaster alert creation and broadcast manager
        ├── admin_.reports.tsx        # Response metrics and shelter occupancy analytics
        └── admin_.donations.tsx      # Public relief donations ledger
```

---

## 4. Prerequisites

Before setting up RescueLink, ensure your development environment satisfies:

- **Node.js**: `v20.x` or higher (Active LTS recommended)
- **Package Manager**: `npm` (`v10.x` or higher) — _RescueLink standardizes strictly on npm_
- **Java Development Kit (JDK)**: JDK 17 (Required only for Android builds)
- **Android Studio**: Ladybug / Meerkat or newer with Android SDK Platform 34+ (For mobile builds)
- **Firebase CLI**: `npm install -g firebase-tools` (For deploying Firestore security rules)
- **Git**: `v2.40` or higher

---

## 5. Installation Instructions

1. Clone the repository:

   ```bash
   git clone https://github.com/jayedrjp/RescueLink.git
   cd RescueLink
   ```

2. Install dependencies using npm:
   ```bash
   npm install
   ```
   _Note: RescueLink uses `package-lock.json` as its single authoritative lockfile. Do not run `bun install` or `yarn install`._

---

## 6. Environment Configuration

1. Create a `.env` file in the project root by copying the template:

   ```bash
   cp .env.example .env
   ```

2. Open `.env` and fill in your Firebase Web App credentials obtained from the Firebase Console:
   ```env
   # Required Firebase Client Configuration
   VITE_FIREBASE_API_KEY=AIzaSy...
   VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your-project
   VITE_FIREBASE_APP_ID=1:123456789:web:abcdef

   # Optional Firebase Web App Fields
   VITE_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
   VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
   VITE_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX

   # Optional Security & Integration Features
   VITE_FIREBASE_APPCHECK_KEY=
   VITE_VAPID_PUBLIC_KEY=
   VITE_GOOGLE_WEB_CLIENT_ID=
   VITE_ADMIN_EMAIL=admin@rescuelink.org
   ```

> [!IMPORTANT]
> All `VITE_*` variables are bundled into client-side JavaScript. **Never place private server keys, service account JSON files, or database secrets in `.env`.**

---

## 7. Development Server

Start the local development server with Vite:

```bash
npm run dev
```

The application will be accessible at:

```
http://localhost:3000
```

Hot Module Replacement (HMR) and TanStack file routing are active automatically.

---

## 8. Web Production Build

Compile the production-ready full-stack application:

```bash
npm run build
```

This compiles:

- The client assets into `.output/public/`
- The server Nitro bundle into `.output/server/`

To preview the production build locally:

```bash
npm run preview
```

---

## 9. Capacitor Android Build & Synchronization

RescueLink is fully configured with Capacitor for native Android deployment:

1. **Build mobile web assets:**

   ```bash
   npm run build:mobile
   ```

   _This compiles the SPA distribution bundle into `dist/`._

2. **Sync web assets to the Android native project:**

   ```bash
   npx cap sync android
   ```

3. **Open the native project in Android Studio:**

   ```bash
   npx cap open android
   ```

4. **Build APK directly from terminal (Release):**
   ```bash
   cd android
   ./gradlew assembleRelease
   ```
   _The signed release APK will be generated at `android/app/build/outputs/apk/release/app-release.apk`._

---

## 10. Firebase Project Setup

1. Open [Firebase Console](https://console.firebase.google.com/) and create a project (e.g., `rescue-linkbd`).
2. **Enable Authentication:**
   - Go to **Build → Authentication → Sign-in method**.
   - Enable **Email/Password**.
   - (Optional) Enable **Google** sign-in provider.
3. **Provision Cloud Firestore:**
   - Go to **Build → Firestore Database → Create database**.
   - Choose **Production mode**.
   - Select the closest regional location (e.g., `asia-south1` Mumbai or `asia-east1`).
4. **Register Web App:**
   - Go to **Project Settings → General → Your apps → Add app (Web)**.
   - Copy the configuration snippet values into your local `.env`.

---

## 11. Firestore Rules & Security Deployment

RescueLink enforces zero-trust, role-based access control inside `firestore.rules`:

- Citizens can only edit their own profile and create legitimate SOS requests.
- Administrators can never be created or demoted from client mutations.
- Volunteers are only trusted when `role == 'volunteer' && volunteerStatus == 'approved'`.

### Deploy Security Rules:

```bash
# Login to Firebase
npx firebase login

# Target your project ID
npx firebase use your-project-id

# Deploy rules only
npx firebase deploy --only firestore:rules
```

### Run Local Rules Verification Suite:

```bash
# Runs test suite against local Firestore emulator
npm run test:rules
```

---

## 12. Map Implementation & Data Sources

RescueLink uses an open, cost-effective GIS architecture:

- **Leaflet 1.9.4:** Lightweight interactive map rendering.
- **OpenStreetMap Tiles:** Standard cartographic tiles loaded asynchronously with offline tile caching.
- **Overpass API Integration:** Queries live emergency facilities (hospitals, fire stations, police stations) with bounding box limits (max 50 nodes) and client-side debouncing to prevent rate limiting.
- **Nominatim Reverse Geocoding:** Converts GPS coordinates to human-readable landmark addresses with local cache fallback.
- **Haversine Distance:** All distance calculations (`distanceKm`) are computed dynamically at runtime based on the citizen's current coordinates.

---

## 13. Cloudflare Deployment Configuration

RescueLink's SSR engine is pre-configured for Cloudflare via Nitro's `cloudflare-module` preset:

1. **Configuration:** Defined in `vite.config.ts` using `@lovable.dev/vite-tanstack-config`.
2. **Output:** Running `npm run build` generates a Cloudflare Worker bundle in `.output/server/index.mjs` and static assets in `.output/public/`.
3. **Deployment via Wrangler:**
   ```bash
   # Login to Cloudflare
   npx wrangler login

   # Deploy to Cloudflare Workers / Pages
   npx wrangler deploy
   ```

---

## 14. Known Limitations & External Configuration

- **Background Web Push (VAPID):** In-app toasts and browser notifications function immediately. To enable background push notifications when the browser tab is closed, you must generate a VAPID key (`npx web-push generate-vapid-keys`) and provide `VITE_VAPID_PUBLIC_KEY`.
- **Firebase App Check:** App Check is optional in local development. For production deployments with strict bot protection, register your domain in Firebase App Check with reCAPTCHA v3 and set `VITE_FIREBASE_APPCHECK_KEY`.
- **Native Android Social Login:** Google sign-in on Android requires configuring the SHA-1 fingerprint of your signing keystore in Google Cloud Console / Firebase Console.

---

## 15. Important Setup Notes for Developers

- **Software-Only Application:** RescueLink is strictly a web and mobile software platform. It does not require or depend on wearable hardware, smart bracelets, or Bluetooth peripherals.
- **Super-Administrator Role Provisioning:** For security reasons, the `admin` role **cannot** be granted through the client app. To make an account an administrator:
  1. Register an account through `/register` or create the user in **Firebase Console → Authentication**.
  2. Open **Firebase Console → Firestore Database → `users` collection**.
  3. Find the user's document (`users/{uid}`) and change `"role"` from `"user"` to `"admin"`.
  4. (Optional) Set `VITE_ADMIN_EMAIL=your-admin@example.com` in `.env` to enable typing `admin` in the login username field.

---

## 🧪 Automated Testing & Verification

Run the full testing and quality assurance pipeline:

```bash
# Run complete Vitest suite (32 test files, 662 tests)
npm test

# Run TypeScript strict type-check
npx tsc --noEmit

# Run ESLint validation
npm run lint

# Compile Web production build
npm run build

# Compile Mobile production build
npm run build:mobile
```

---

## 👥 Course & Attribution

- **Course:** CSE 416 — Software Project Design and Development
- **Institution:** University of Information Technology and Sciences (UITS)
- **Supervisor:** Dr. Mahfida Amjad Dipa, Department of Computer Science and Engineering, UITS
- **Project Lead & Full-Stack Developer:** Abdur Rahman Jayed
- **Collaborator:** Rowshon Jahan Poddo

---

## 📄 License

Academic prototype developed for educational research and disaster response optimization in Bangladesh.
