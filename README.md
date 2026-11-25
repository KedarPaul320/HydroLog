# HydroLog — Water Meter Reading App

HydroLog is a web and Android application for recording daily water meter readings with photo proof across multiple plants and motors. It stores data in Firebase Firestore, keeps track of which motor is running in each plant, displays 4H / 12H / 24H flow and 30-day usage charts, and exports reports directly to Google Sheets or Excel (`.xlsx`).

---

## What You Can Do With HydroLog

- **Photo-Verified Meter Readings**: Field operators take a live meter photo and submit cubic meter (`m³`) readings on-site. Photos are automatically compressed to save storage space.
- **Role-Based Access**: Separate views and permissions for **Administrators** and **Field Operators**. Public self-registration is disabled—admins create and manage user accounts.
- **Single-Motor Safety Interlock**: Only one motor can run per plant at a time. Starting a new motor automatically stops the previous one, and both operators and admins can stop a running motor anytime.
- **Charts & Analytics**: View **4H, 12H, and 24H water flow bar graphs** and **30-day per-plant usage trends** on the Admin Dashboard.
- **Google Sheets & Offline Excel Export**: Export clean multi-sheet workbooks (`All Plants` as the first tab, followed by individual plant tabs) to Google Sheets or download `.xlsx` files offline.
- **Automatic 45-Day Data Cleanup**: Readings and photos are kept for 45 days and automatically deleted on Day 46 to keep cloud storage free and fast.
- **Ready-to-Install Android App**: Includes an Android wrapper with native camera permissions and an automatic GitHub Actions APK builder.

---

## Project Folder Structure

Everything is organized cleanly so source code, tests, documentation, Android files, and configuration templates are easy to find:

```text
.
├── .github/
│   └── workflows/
│       └── android-release.yml          # Automatically builds & publishes Android APKs on GitHub
├── android/                             # Native Android WebView app project (Kotlin / Gradle)
├── docs/
│   └── security-spec.md                 # Plain-English breakdown of Firestore security rules
├── public/
│   └── favicon.ico                      # App icon served by the web app
├── src/
│   ├── api/
│   │   └── client.ts                    # All Firebase Auth & Firestore read/write functions
│   ├── components/                      # React UI screens, dashboards, forms & charts
│   ├── lib/
│   │   └── firebase.ts                  # Firebase app initialization & error handling helpers
│   ├── utils/                           # Pure business logic, Excel/Sheets exporters & unit tests
│   ├── App.tsx                          # Main router & session state
│   ├── index.css                        # Tailwind CSS global styles
│   ├── main.tsx                         # React entry point
│   └── types.ts                         # Shared TypeScript data types
├── tests/
│   └── firestore.rules.test.ts          # Automated security-rule verification tests
├── .env.example                         # Safe environment variable template (no secrets)
├── .gcloudignore                        # Controls what is uploaded when publishing to Cloud Run
├── .gitignore                           # Blocks secrets & private files from ever reaching GitHub
├── eslint.config.js                     # Lints firestore.rules for security mistakes
├── firebase-applet-config.example.json  # Safe Firebase config template (fill in locally)
├── firebase-blueprint.json              # Schema blueprint for all Firestore collections
├── firestore.rules                      # Database security rules
├── index.html                           # Web app HTML entry point
├── package.json                         # Dependencies and npm scripts
├── server.ts                            # Node.js + Express web server (dev & production)
├── tsconfig.json                        # TypeScript compiler settings
└── vite.config.ts                       # Vite bundler settings
```

---

## Keeping Private Files Out of GitHub

This project is pre-configured so **no secrets, keys, private photos, or local files are pushed to GitHub**.

### Automatically Blocked by `.gitignore` (Never Pushed to GitHub)

| What Is Blocked | Example Files / Folders | Why It Stays Private |
| --- | --- | --- |
| **Live Firebase Config** | `firebase-applet-config.json`, `firebase-firestore-config.json`, `google-services.json` | Keeps your live project IDs and web config out of public repos |
| **Secrets & Env Files** | `.env`, `.env.*`, `*.key`, `*.pem`, `*service-account*.json` | Prevents API keys and server secrets from leaking |
| **Android Signing Files** | `*.jks`, `*.keystore`, `keystore.properties`, `android/local.properties`, `*.apk` | Protects your private Android app signing keys and avoids large binary uploads |
| **Private Screenshots & Uploads** | `public/assets/aistudio/`, `uploads/`, `data/`, `.playwright-cli/`, `.aistudio/` | Keeps personal screenshots, local test data, and workspace metadata private |
| **Build & Dependency Caches** | `node_modules/`, `dist/`, `build/`, `*.log` | Rebuilt automatically from `package.json`—never needs to be in Git |

### Safe Template Files (Tracked in GitHub)

- `firebase-applet-config.example.json` — Empty placeholder template so new developers know what fields to fill in.
- `.env.example` — Lists optional server settings (`PORT`, `APP_URL`) with empty values.

> **Why is there also a `.gcloudignore` file?**
> GitHub uses `.gitignore`, while Google Cloud Run / AI Studio Publish uses `.gcloudignore`. Having both lets `.gitignore` keep `firebase-applet-config.json` out of GitHub while `.gcloudignore` still allows Cloud Run publishing to bundle it when deploying your live web app.

---

## Quick Start (Run Locally in 4 Steps)

### 1. Create Your Local Firebase Config

Copy the example file and fill in your Firebase web app settings from the Firebase Console:

```bash
cp firebase-applet-config.example.json firebase-applet-config.json
```

> `firebase-applet-config.json` is listed in `.gitignore`, so your personal config stays strictly on your machine.

### 2. (Optional) Create Your Local `.env` File

```bash
cp .env.example .env
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Start the App

```bash
npm run dev
```

Open **http://localhost:3000** in your browser. On your first visit, click **First-time administrator setup** on the Sign In card to initialize your administrator account and default plants/motors.

---

## Firebase Setup Checklist

1. **Authentication Providers**:
   In Firebase Console → **Authentication → Sign-in method**, enable **Google**. If you also want operators and admins to sign in with Email & Password, enable **Email/Password** there too.
2. **Firestore Security Rules**:
   Deploy `firestore.rules` to your Firestore database. Review `docs/security-spec.md` for a plain-language overview of every access rule, and harden any rules as needed before sharing the app widely.
3. **Optional 24/7 Free Auto-Cleanup (Firestore TTL)**:
   HydroLog automatically hides and purges expired records on Day 46 whenever an Admin opens the app. To also let Google clean up expired documents automatically in the background (free, no Cloud Functions needed), open Firebase Console → **Firestore → Time-to-live (TTL)** for your database and add two policies:
   - Collection group: `readings` → Timestamp field: `expiresAt`
   - Collection group: `reading_photos` → Timestamp field: `expiresAt`

---

## Useful Commands

| Command | What It Does |
| --- | --- |
| `npm run dev` | Starts the local development server on port `3000` |
| `npm test` | Runs all unit tests and Firestore security-rule tests |
| `npm run lint` | Checks TypeScript types across the whole project |
| `npx eslint firestore.rules` | Audits `firestore.rules` for security issues |
| `npm run build` | Builds the production web bundle into `dist/` |
| `npm start` | Starts the production Node.js server serving `dist/` |

---

## Building & Installing the Android App (`.apk`)

The `android/` folder contains a ready-to-build Android app, and `.github/workflows/android-release.yml` can build and publish downloadable APKs automatically on GitHub.

### Option 1: Automatic Build via GitHub Releases (Recommended)

1. Push this repository to GitHub.
2. Trigger a release in either of two ways:
   - **Push a version tag**:
     ```bash
     git tag v1.0.6
     git push origin v1.0.6
     ```
   - **Run manually in GitHub**: Open your repo → **Actions** tab → **Build & Release Android APK** → click **Run workflow** and enter a tag like `v1.0.6`.
3. Wait 2–3 minutes, then open the **Releases** page on your Android phone, download `HydroLog-v1.0.6.apk`, and tap **Install** (allow browser installs if prompted once).

### Customizing the Android Server URL & Signing Keys (Optional)

- **Change the Server URL**: In your GitHub repo go to **Settings → Secrets and variables → Actions → Variables** and add `HYDROLOG_APP_URL` pointing to your live deployed web URL (or enter `app_url` when running the workflow manually).
- **Use Your Own Production Signing Keystore**: The workflow builds a working signed APK out of the box with zero secrets. If you want to sign releases with your own long-term Android keystore, add these 4 secrets under **Settings → Secrets and variables → Actions → Secrets** (never commit your `.jks` file directly!):
  - `ANDROID_KEYSTORE_BASE64`
  - `ANDROID_KEYSTORE_PASSWORD`
  - `ANDROID_KEY_ALIAS`
  - `ANDROID_KEY_PASSWORD`

### Option 2: Build Locally in Android Studio

1. Open the `android/` folder in **Android Studio** (Ladybug or newer, JDK 17).
2. Wait for Gradle sync to finish.
3. Click **Run ▶** on a connected phone, or go to **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
