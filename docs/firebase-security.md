# Firebase security model (Phase 2)

## Roles

| Role             | How it is granted                                                                                | What it can do                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `user` (citizen) | Automatic on sign-up                                                                             | Own profile, own SOS requests                                                                  |
| `volunteer`      | Admin approves an application in the app (`role: volunteer` **and** `volunteerStatus: approved`) | Read open SOS requests, accept one for themselves, resolve their own                           |
| `admin`          | **Never from the app.** Firebase Console / Admin SDK only                                        | Approve/reject volunteers, dispatch, resolve or cancel SOS requests, delete non-admin profiles |

Only `users/{uid}.role` (or the trusted custom claims `admin: true` / `role: "volunteer"`) is honoured.
Legacy fields (`isAdmin`, `admin`, `Role`, `userRole`, `volunteer_status`) are ignored by both the app and the rules.

### The admin account and the "admin" username shortcut

- The administrator's Firebase Authentication user is created **by you** in Firebase Console -> Authentication -> Users -> Add user
  (never through public sign-up; the sign-up form refuses `VITE_ADMIN_EMAIL`).
- `VITE_ADMIN_EMAIL` is optional and has **no default**. If set, typing `admin` on the sign-in form signs in with that email.
  It grants nothing by itself: the admin role is read from Firestore (`users/{uid}.role`).

### Creating the first administrator

1. Sign up normally in the app (this creates `users/{uid}` with `role: "user"`).
2. Firebase Console -> Firestore Database -> `users` -> that document -> set `role` to `admin`.
   (Alternative: set the custom claim `{ "admin": true }` with the Admin SDK.)
3. Sign out and back in.

## Deploying the rules

```bash
npm i -g firebase-tools          # or use npx firebase-tools
firebase login
firebase use <your-project-id>
firebase deploy --only firestore:rules
```

Or paste `firestore.rules` into Firebase Console -> Firestore Database -> Rules -> Publish.

## Required environment variables (no built-in fallbacks)

`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`
(plus `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, optional `VITE_FIREBASE_MEASUREMENT_ID`).
They are inlined at **build time**, so set them in your hosting provider's build settings as well as in `.env`.
If any are missing the app shows "Firebase Configuration Required" instead of connecting to some other project.

## Testing the rules

- `npm test` - runs the rules against a local evaluator (no emulator needed) plus client/rules compatibility tests.
- `npm run test:rules` - runs the same scenarios against the real Firestore emulator (needs Java 11+ and network
  access for `firebase-tools` to download the emulator on first run).
