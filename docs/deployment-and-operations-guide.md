# RescueLink — Production Deployment & Operations Guide

> **Project:** RescueLink — “সাহায্য হোক সহজ · Help Made Simple”  
> **Target Environment:** Cloud Firestore, Firebase Authentication, Cloudflare Nitro / Firebase Hosting  
> **Document Version:** 1.0.0 (Phase 12 Deployment Readiness)

This runbook provides end-to-end instructions for configuring, deploying, seeding, and operating RescueLink in production environments.

---

## 1. Prerequisites

Before beginning deployment, ensure you have:

1. **Node.js**: v20+ or v24+ (`node -v`).
2. **NPM**: v10+ (`npm -v`).
3. **Firebase Account**: Access to the [Firebase Console](https://console.firebase.google.com/).
4. **Firebase CLI**: Installed globally or executed via `npx --yes firebase-tools`.
5. **Cloudflare Account (Optional/Recommended for Nitro SSR)**: For deploying the serverless edge worker (`npx wrangler`).

---

## 2. Environment Variables Configuration

RescueLink strictly validates all required environment variables at boot time without silent hardcoded fallbacks (`CFG-1`).

Create or populate `.env` in the project root:

```ini
# ==============================================================================
# RescueLink Production Environment Configuration
# ==============================================================================

# Firebase Web App Credentials (from Firebase Console -> Project Settings -> General)
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=rescue-linkbd.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=rescue-linkbd
VITE_FIREBASE_STORAGE_BUCKET=rescue-linkbd.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=900119595279
VITE_FIREBASE_APP_ID=1:900119595279:web:531abf7f2859721b46167a

# Optional Analytics & Performance Monitoring
VITE_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX

# Administrative Account Shortcut (Optional)
# If provided, entering "admin" in the login screen resolves to this address.
# NOTE: Admin privileges are strictly authorized by Firestore security rules.
VITE_ADMIN_EMAIL=admin@rescuelink.org
```

> [!IMPORTANT]
> Because Vite inlines `VITE_*` variables at compile time, all environment variables must be defined **prior to running `npm run build`** in both local and CI/CD environments.

---

## 3. Firebase Project & Authentication Setup

### Step 1: Create or Select Firebase Project

1. Open [Firebase Console](https://console.firebase.google.com/).
2. Select or create project `rescue-linkbd`.

### Step 2: Enable Authentication Providers

1. Go to **Build -> Authentication -> Sign-in method**.
2. **Email/Password**: Enable "Email/Password" (leave "Email link" disabled).
3. **Google Sign-In**: Enable Google provider, configure the project support email, and save.
4. **Authorized Domains**: Add your production domain (e.g. `rescuelink.org` or `*.pages.dev`) under **Settings -> Authorized domains**.

### Step 3: Enable Cloud Firestore

1. Go to **Build -> Firestore Database**.
2. Click **Create database**.
3. Choose **Production mode** (rules will be deployed in the next step).
4. Select the location closest to Bangladesh (e.g., `asia-south1` Mumbai or `asia-southeast1` Singapore) for minimal network latency.

---

## 4. Deploying Hardened Firestore Security Rules

RescueLink includes custom, hardened Firestore security rules (`firestore.rules`) designed to prevent privilege escalation (`SEC-2`), user enumeration (`SEC-1`), unauthorized ticket tampering (`SEC-3`, `SEC-4`, `SEC-5`), and unauthorized directory access.

### Deploying via Firebase CLI

```bash
# 1. Authenticate with Google
npx --yes firebase-tools login

# 2. Link your Firebase project
npx --yes firebase-tools use rescue-linkbd

# 3. Deploy the rules file
npx --yes firebase-tools deploy --only firestore:rules
```

### Alternative: Deploy via Firebase Console

1. Open `firestore.rules` from this repository.
2. Go to **Firebase Console -> Firestore Database -> Rules**.
3. Paste the contents of `firestore.rules` into the editor.
4. Click **Publish**.

---

## 5. Provisioning the First Administrator

Under RescueLink's zero-trust security architecture, no client user can register themselves as an administrator (`SEC-2`). The initial administrator must be provisioned via the Firebase Console:

1. Open RescueLink in your browser and click **Register**.
2. Create an account with your administrator email (e.g., `admin@rescuelink.org`).
3. Open **Firebase Console -> Firestore Database -> Data**.
4. Navigate to the `users` collection and locate the document matching your `uid`.
5. Edit the document fields:
   - Change `role` from `"user"` to `"admin"`.
   - Ensure `volunteerStatus` is set to `"approved"`.
6. Return to RescueLink, sign out, and sign back in. The navigation bar will now present the **Admin Portal** link.

---

## 6. Safe Initial Data Seeding

RescueLink is designed with built-in zero-downtime fallback: if Firestore collections are empty, the app serves verified in-memory Bangladesh shelters and disaster alerts. However, seeding collections into Firestore allows real-time dynamic administrative updates across the network:

### Initial Shelters Collection (`shelters`)

Administrators can create shelters directly via `/admin?tab=shelters` -> **+ New Shelter**, or write the initial documents to Firestore:

```json
// Collection: shelters / Document: mirpur
{
  "name": "Mirpur Shelter Center",
  "area": "Mirpur 10, Dhaka",
  "occupied": 72,
  "capacity": 100,
  "status": "open",
  "facilities": ["Food", "Water", "Beds", "Medicine"],
  "needs": ["Blankets", "Baby food", "Drinking water"],
  "phone": "+880 1711 000 121",
  "image": "shelter-1",
  "coordinates": { "lat": 23.8068, "lng": 90.3688 },
  "createdAt": "2026-10-24T00:00:00.000Z"
}
```

```json
// Collection: shelters / Document: dhanmondi
{
  "name": "Dhanmondi Community Hall",
  "area": "Dhanmondi 27, Dhaka",
  "occupied": 148,
  "capacity": 180,
  "status": "limited",
  "facilities": ["Food", "Water", "Medicine"],
  "needs": ["Medicine", "Mats", "Hygiene kits"],
  "phone": "+880 1711 000 208",
  "image": "shelter-2",
  "coordinates": { "lat": 23.7461, "lng": 90.3742 },
  "createdAt": "2026-10-24T00:00:00.000Z"
}
```

### Initial Emergency Alerts Collection (`alerts`)

Admins can broadcast alerts from `/admin/alerts`, creating documents in `alerts`:

```json
// Collection: alerts / Document: a1
{
  "severity": "critical",
  "title": "Flash Flood Warning",
  "body": "Heavy rainfall is expected in your area within the next 3 hours. Move to higher ground.",
  "location": "Dhaka North",
  "category": "flood",
  "createdAt": "2026-10-24T00:00:00.000Z"
}
```

---

## 7. Production Build & Hosting Deployment

### Option A: Cloudflare Pages / Workers (Primary Serverless SSR Target)

RescueLink's Nitro engine is configured for Cloudflare Workers out-of-the-box:

```bash
# 1. Build the production application
npm run build

# 2. Deploy prebuilt bundle to Cloudflare
npx wrangler deploy
```

### Option B: Local / Node SSR Preview

```bash
# Test the production build locally
npm run preview
```

---

## 8. Post-Deployment Verification Checklist

Execute this checklist immediately following deployment to confirm production integrity:

- [ ] **Config Check**: Verify no "Firebase Configuration Required" banner appears on the login screen.
- [ ] **Auth Check**: Sign in with test citizen account; confirm display name appears on Profile without page unmount.
- [ ] **SOS Test (Citizen)**:
  - Trigger an SOS request with real GPS enabled.
  - Verify Firestore `sosRequests` document is created with `status: "active"`, live coordinates, and valid callback phone.
  - Verify cancel transition sets `status: "cancelled"`.
- [ ] **Volunteer Dispatch Test**:
  - Sign in as an approved volunteer.
  - Open `/volunteer/sos`. Confirm active SOS alert appears in real-time.
  - Click **Respond** / self-assign; verify responder info is attached to the ticket.
  - Mark ticket **Resolved**; verify status changes to `"resolved"`.
- [ ] **Admin Portal Test**:
  - Sign in as administrator.
  - Open `/admin`. Verify user directory, shelters, alerts, and live SOS requests load.
  - Add a shelter with coordinates; verify it immediately renders on `/shelters` and `/map`.
- [ ] **Mobile Responsive & GPS Test**:
  - Open app on physical mobile device.
  - Test pinch-to-zoom on map and shelter list (`UX-1`).
  - Verify emergency helpline button (`tel:999`) invokes native phone dialer.
