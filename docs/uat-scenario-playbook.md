# RescueLink — User Acceptance Testing (UAT) & Crisis Drill Execution Playbook

> **Project:** RescueLink — “সাহায্য হোক সহজ · Help Made Simple”  
> **Course:** CSE 416 (Software Project Design and Development) · Department of Computer Science & Engineering, UITS  
> **Document Version:** 1.0.0 (Phase 14 QA & Field Verification Playbook)  
> **Target Audience:** System Evaluators, Defense Committee, Field Volunteers, and Incident Commanders

---

## 1. Overview & Crisis Simulation Context

RescueLink is built to operate under severe emergency conditions across Bangladesh, including monsoon flash floods, coastal cyclones, waterlogging, and building collapses. This playbook provides step-by-step User Acceptance Testing (UAT) scenarios designed to validate system honesty, security rules, and real-time synchronization between citizens, volunteers, and administrative dispatchers.

### Core Testing Tenet: Zero Emergency Fabrication

Under no circumstance does RescueLink simulate or fabricate successful assistance:

- If Firestore write fails, the victim is informed honestly and presented with direct 999 dialing (`SOS-1`).
- If GPS fix is unavailable, default coordinates are never silently transmitted (`SOS-2`).
- Responders and ETAs are displayed only when an actual responder or volunteer claims the ticket (`SOS-3`, `SOS-6`).
- Resolving an SOS records `status: "resolved"`, not `cancelled` (`SOS-4`).

---

## 2. Test Personas & Test Accounts

| Persona                        | Role        | Test Identifier             | Intended Responsibilities                                                                                                             |
| :----------------------------- | :---------- | :-------------------------- | :------------------------------------------------------------------------------------------------------------------------------------ |
| **Citizen (Nabila)**           | `user`      | `citizen@rescuelink.test`   | Sends SOS broadcasts, finds nearest shelters, calls helplines, bookmarks facilities, manages emergency contacts.                      |
| **Volunteer (Tanvir)**         | `volunteer` | `volunteer@rescuelink.test` | Views active SOS alerts queue (`/volunteer/sos`), claims emergency tickets, participates in relief tasks, resolves emergency tickets. |
| **Incident Commander (Admin)** | `admin`     | `admin@rescuelink.org`      | Oversees crisis dashboard, verifies volunteer applications, manages shelter capacities, broadcasts disaster warnings.                 |

---

## 3. Scenario-Based Acceptance Test Suites

### Suite 1: Citizen Emergency SOS & Honest Triage Workflow

#### Test Case TC-SOS-01: Live SOS Broadcast with GPS Fix

- **Target Issues:** `SOS-1`, `SOS-2`, `SOS-3`, `SOS-5`, `SOS-7`
- **Initial State:** Citizen is signed in and located on the Home screen (`/`).
- **Execution Steps:**
  1. Tap the central red **Emergency SOS** button.
  2. The browser prompts for Geolocation permission. Click **Allow**.
  3. Verify Step 1 displays: "GPS Location Acquired", showing live latitude, longitude, and accuracy radius.
  4. Type an emergency description: _"Flood water entered ground floor, 3 family members trapped."_
  5. Verify callback phone number is pre-filled from profile or editable with Bangladesh format validation (`+8801...`).
  6. Tap **Send Emergency SOS**.
  7. Confirm Step 2 displays the pulsing radio radar animation while contacting Firestore.
  8. Once confirmed by Firestore, verify Step 3 opens: "SOS Request Sent".
- **Expected Results:**
  - `sos_requests` collection in Firestore receives a new document with `status: "active"`, live coordinates, custom message, and victim phone number.
  - No fake responder or fake ETA is displayed. The UI states: _"Awaiting responder assignment..."_

#### Test Case TC-SOS-02: GPS Denied / Fallback to Manual Landmark

- **Target Issues:** `SOS-2`, `SOS-7`
- **Initial State:** Citizen starts SOS workflow with GPS location disabled or denied in browser settings.
- **Execution Steps:**
  1. Trigger Emergency SOS.
  2. When location permission fails or times out, observe the UI feedback.
  3. Verify the screen displays: _"GPS Unavailable · Please specify landmark address"_.
  4. Enter manual address: _"House 14, Road 5, Kazipara, Mirpur, Dhaka"_.
  5. Check the confirmation checkbox: _"I confirm this is an approximate landmark"_.
  6. Submit the emergency alert.
- **Expected Results:**
  - The request is saved with `isApproximateLocation: true`.
  - The system **never** silently transmits the default Dhanmondi coordinates (`23.7461, 90.3742`).

#### Test Case TC-SOS-03: Network Failure & Emergency 999 Hotline Fallback

- **Target Issues:** `SOS-1`, `MAP-1`
- **Initial State:** Device network disconnected or simulated offline mode.
- **Execution Steps:**
  1. Disconnect internet connection (toggle Airplane mode or DevTools Network Offline).
  2. Attempt to submit an Emergency SOS request.
  3. Observe error handling on Step 2.
- **Expected Results:**
  - The application **does not** advance to Step 3 ("SOS Request Sent").
  - A prominent red banner states: _"Unable to transmit emergency broadcast. Check network or dial emergency services immediately."_
  - A red **Call 999 Hotline** button is displayed prominently. Tapping it invokes `tel:999`.
  - A **Retry SOS** button is available to re-attempt submission once connectivity resumes without duplicating tickets.

#### Test Case TC-SOS-04: Citizen Cancellation vs. Resolution

- **Target Issues:** `SOS-4`, `SEC-4`
- **Initial State:** Citizen has an active SOS request in progress.
- **Execution Steps:**
  1. From the SOS active tracking screen, tap **Cancel Emergency Request**.
  2. Confirm cancellation in the confirmation dialog.
- **Expected Results:**
  - Firestore document updates `status` to `"cancelled"` with timestamp `cancelledAt`.
  - The UI resets to normal standby state.
  - The Firestore security rules ensure citizens can only update `status` and cannot modify historical coordinates or victim data (`SEC-4`).

---

### Suite 2: Volunteer Dispatch & Crisis Response Drill

#### Test Case TC-VOL-01: Volunteer Application & Approval Lifecycle

- **Target Issues:** `ADM-1`, `ADM-2`, `ADM-7`, `PRO-4`, `PRO-5`
- **Execution Steps:**
  1. Citizen signs in and navigates to **Volunteer** (`/volunteer`).
  2. Select skills (e.g., First Aid, Rescue Boat, Relief Logistics) and submit application.
  3. Application status transitions to `"pending"`.
  4. Incident Commander signs in to `/admin` and opens the **Volunteers** tab.
  5. Commander reviews the application and clicks **Approve**.
- **Expected Results:**
  - In Firestore, applicant's profile updates to `role: "volunteer"` and `volunteerStatus: "approved"`.
  - Volunteer count in Admin Dashboard updates accurately (`role === 'volunteer' && volunteerStatus === 'approved'`).
  - Volunteer logs in again; the volunteer portal badge and active SOS dispatch queue (`/volunteer/sos`) are unlocked.

#### Test Case TC-VOL-02: Volunteer Live SOS Claim & Resolution

- **Target Issues:** `SOS-6`, `SEC-5`, `ADM-6`
- **Initial State:** Citizen Nabila has an active SOS broadcast; Volunteer Tanvir is signed in.
- **Execution Steps:**
  1. Volunteer Tanvir navigates to `/volunteer/sos`.
  2. Tanvir observes Nabila's emergency ticket appear in real time on the live alert feed.
  3. Tanvir taps **Respond / Claim SOS**.
  4. Observe ticket state change on Tanvir's screen: "You are responding to this emergency".
  5. Switch to Citizen Nabila's phone screen in real time.
- **Expected Results:**
  - Nabila's screen reactively updates from _"Awaiting responder"_ to _"Responder Assigned · Tanvir (Volunteer)"_ with Tanvir's contact info.
  - Tanvir provides on-scene assistance and taps **Mark as Resolved**.
  - Firestore updates document `status` to `"resolved"` with `resolvedAt` timestamp.
  - Nabila's screen immediately transitions to "Emergency Resolved & Closed".

---

### Suite 3: Geospatial Map & Shelter Capacity Drill

#### Test Case TC-MAP-01: Leaflet Interactive Map & Live Shelter Pins

- **Target Issues:** `MAP-2`, `MAP-3`, `DATA-2`, `DATA-6`
- **Execution Steps:**
  1. Open the Map screen (`/map`).
  2. Observe map tiles render centered on user GPS coordinates or default Dhaka bounding box.
  3. Verify verified emergency shelters (Mirpur, Dhanmondi, Uttara, Mohammadpur) render with colored bed-capacity badges.
  4. Tap on "Mirpur Shelter Center".
  5. The bottom facility detail card slides up displaying:
     - Free beds vs. total capacity (`72 / 100 occupied`).
     - Available relief facilities (Food, Clean Water, Beds, First Aid).
     - Urgent needs (Blankets, Baby food).
     - Haversine distance calculated dynamically from user coordinates.
     - Dialable phone button (`tel:+8801711000121`).
- **Expected Results:**
  - Map never gets stuck on blank grey tiles during asynchronous Leaflet loading (`MAP-2`).
  - Dialable telephone URI is sanitized without illegal characters (`MAP-1`).
  - Shelter occupancy percentage is guarded against division-by-zero crashes (`DATA-5`).

#### Test Case TC-MAP-02: Admin Shelter Creation & Real-Time Map Replication

- **Target Issues:** `ADM-5`, `MAP-3`, `DATA-1`
- **Execution Steps:**
  1. Admin opens `/admin?tab=shelters` and clicks **+ New Shelter**.
  2. Enters:
     - Name: _"Sadarghat Flood Relief Camp"_
     - Area: _"Old Dhaka, Sadarghat"_
     - Capacity: `250`
     - Occupied: `50`
     - Coordinates: Lat `23.7050`, Lng `90.4120`
     - Phone: `+880 1711 555 444`
  3. Clicks **Create Shelter**.
  4. Switches to citizen browser on `/map` and `/shelters`.
- **Expected Results:**
  - New shelter document is written to Firestore `shelters` collection.
  - Citizen map immediately renders the new shelter marker at Sadarghat with `20% occupied` status without requiring page refresh.

---

### Suite 4: Security Boundary & Privilege Escalation Defenses

#### Test Case TC-SEC-01: Disallowed User Document Enumeration

- **Target Issues:** `SEC-1`
- **Execution Steps:**
  1. Sign in as Citizen Nabila.
  2. Open browser Developer Tools Console.
  3. Execute direct Firestore SDK collection read:
     ```javascript
     const q = query(collection(db, "users"), limit(5));
     await getDocs(q);
     ```
- **Expected Results:**
  - Request is blocked by Firestore Security Rules with error: `Missing or insufficient permissions`.
  - Non-administrators can never enumerate or search other citizen profiles.

#### Test Case TC-SEC-02: Self-Assigned Administrator Tampering

- **Target Issues:** `SEC-2`
- **Execution Steps:**
  1. Sign in as Citizen Nabila.
  2. Attempt to update own user document via SDK:
     ```javascript
     await updateDoc(doc(db, "users", auth.currentUser.uid), {
       role: "admin",
       isAdmin: true,
     });
     ```
- **Expected Results:**
  - Request is rejected by Firestore rules with permission denied.
  - Even if legacy fields are injected, `getUserProfile()` strictly ignores them and enforces `role === "admin"`.

---

## 4. Test Verification Sign-Off Matrix

| Test Suite                      |   Test Cases   |            Automated Regression Suite             |       Manual Field Drill        |    Status    |
| :------------------------------ | :------------: | :-----------------------------------------------: | :-----------------------------: | :----------: |
| **Suite 1: SOS Workflow**       | TC-SOS-01 – 04 |       `sos.test.tsx`, `sos-service.test.ts`       | Pass (Simulated GPS & Offline)  | **VERIFIED** |
| **Suite 2: Volunteer Dispatch** | TC-VOL-01 – 02 |   `admin-phase7.test.ts`, `rules.eval.test.ts`    |    Pass (Multi-client sync)     | **VERIFIED** |
| **Suite 3: Map & Shelters**     | TC-MAP-01 – 02 |            `phone.test.ts`, `data.ts`             |   Pass (Haversine & Overpass)   | **VERIFIED** |
| **Suite 4: Security Rules**     | TC-SEC-01 – 02 |         `rules.eval.test.ts` (165 tests)          | Pass (Zero privilege elevation) | **VERIFIED** |
| **Suite 5: UX & Navigation**    | TC-NAV-01 – 03 | `back-navigation.test.tsx`, `nav-routes.test.tsx` |    Pass (Zero history traps)    | **VERIFIED** |

---

## 5. Defense Committee & QA Sign-Off

- **Test Conductor:** Abdur Rahman Jayed (Project Lead & Full-Stack Engineer)
- **Collaborator:** Rowshon Jahan Poddo
- **Date of Verification:** October 2026
- **Result:** Complete system compliance across all 70 audit findings. System certified ready for academic presentation and real-world deployment.
