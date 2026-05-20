# FlowWrite Backend — Firebase

A Firebase project that proxies Claude API calls. Customers sign in with Google;
the desktop app talks only to your Cloud Functions, never to Anthropic directly.

## Architecture

```
Desktop app (Electron)
    │ httpsCallable('generate')
    ▼
Cloud Function `generate`  ─── verifies Firebase ID token
    │                       ─── checks monthly quota
    │                       ─── calls Claude with SERVER-SIDE key
    │                       ─── increments user's usage counter
    ▼
Anthropic API
```

The Anthropic API key never leaves the server. Customers don't need one.

## One-time setup

### 1. Create Firebase project

1. Visit <https://console.firebase.google.com>.
2. Click **Add project** → name it (e.g. `flowwrite-app`).
3. Disable Google Analytics if you don't need it.

### 2. Enable services in the Firebase Console

- **Build → Authentication** → Sign-in method → **Google** → Enable. Add a project support email.
- **Build → Firestore Database** → Create database → **Production mode** → pick a region (e.g. `us-central1`).
- **Build → Functions** → Get started. You'll be asked to upgrade to the **Blaze (pay-as-you-go)** plan; this is mandatory for Cloud Functions but the free tier is generous (2M invocations / month).

### 3. Create Desktop OAuth Client

The desktop app needs its own OAuth client (separate from Firebase's auto-managed web one).

1. Go to <https://console.cloud.google.com/apis/credentials> (same project as Firebase).
2. **Create credentials** → **OAuth client ID**.
3. If prompted, configure the consent screen first (External user type, name "FlowWrite", scopes: `openid`, `profile`, `email`).
4. Application type: **Desktop app**. Name: `FlowWrite Desktop`.
5. Click **Create**. Copy the **Client ID** — you'll need it shortly.

### 4. Grab the Firebase web config

1. Console → **Project Settings** (gear icon) → **Your apps**.
2. Click the `</>` icon to register a **Web app**. Name it `FlowWrite`. Don't enable Hosting.
3. Copy the `firebaseConfig` object shown.

### 5. Wire it into the desktop app

Open `flowwrite/src/utils/firebaseConfig.js` and replace the placeholders:

```js
export const FIREBASE_CONFIG = {
  apiKey:            "AIzaSy...",
  authDomain:        "flowwrite-app.firebaseapp.com",
  projectId:         "flowwrite-app",
  storageBucket:     "flowwrite-app.appspot.com",
  messagingSenderId: "123456789012",
  appId:             "1:123456789012:web:abc123",
};

export const GOOGLE_OAUTH_CLIENT_ID =
  "123-abc.apps.googleusercontent.com";    // from step 3

export const FUNCTIONS_REGION = "us-central1";
```

### 6. Install the Firebase CLI

```bash
npm install -g firebase-tools
firebase login         # opens browser
```

### 7. Set the Anthropic API key as a secret

```bash
cd flowwrite/backend
firebase use --add     # pick your project, alias "default"
firebase functions:secrets:set ANTHROPIC_API_KEY
# Paste your sk-ant-... key when prompted, hit Enter.
```

### 8. Deploy

```bash
cd flowwrite/backend/functions
npm install
cd ..
firebase deploy --only firestore:rules,functions
```

When it finishes you'll see something like:

```
✔  functions[generate(us-central1)]:        Successful create operation.
✔  functions[getOrCreateUser(us-central1)]: Successful create operation.
```

Your backend is live.

### 9. Launch the desktop app

```bash
cd flowwrite
npm run dev
```

On first launch you'll see the **Sign in with Google** screen. After signing in
you land on the Dashboard. Press `⌘⇧W` anywhere → Generate → the request now
goes through your Cloud Function and your usage counter ticks up.

---

## Local development (optional)

Use the Firebase Emulator suite to test without deploying:

```bash
cd flowwrite/backend
firebase emulators:start --only firestore,functions,auth
```

To make the desktop app hit emulators, add to `firebaseConfig.js`:

```js
import { connectAuthEmulator } from 'firebase/auth';
import { connectFirestoreEmulator } from 'firebase/firestore';
import { connectFunctionsEmulator } from 'firebase/functions';
// ...inside firebase.js after init:
connectAuthEmulator(_auth, 'http://127.0.0.1:9099');
connectFirestoreEmulator(_firestore, '127.0.0.1', 8080);
connectFunctionsEmulator(_functions, '127.0.0.1', 5001);
```

(Remove these lines before shipping.)

---

## Files

```
backend/
├── firebase.json               # Firebase project config
├── firestore.rules             # Per-user data isolation
├── firestore.indexes.json      # Composite indexes (empty for now)
└── functions/
    ├── package.json
    ├── index.js                # Function exports
    ├── generate.js             # Claude proxy + quota gate
    └── getOrCreateUser.js      # User doc init on first sign-in
```

## Firestore schema

```
/users/{uid}
   email           string
   displayName     string
   photoURL        string
   plan            'free' | 'pro' | 'team'
   usage           { '2026-05': 12, '2026-04': 7, ... }
   allTimeUsage    number
   createdAt       Timestamp
   lastSeen        Timestamp
   lastUsed        Timestamp   (set by /generate on success)
```

Clients can only READ their own user doc. All writes happen via Cloud Functions.

## Quotas

- **Free**: 30 prompts / calendar month, hard-stop after.
- **Pro / Team**: unlimited (until you add billing in a later phase).

The quota check + increment is atomic inside the Cloud Function. The local
desktop app can't be tampered with to bypass it — the server is the source of
truth.
