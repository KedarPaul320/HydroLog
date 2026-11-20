# HydroLog — Water Meter Reading App

Full-stack Water Meter Reading application with role-based access control (Admin & Field User), photo evidence uploads, configurable Plants & Motors, Running/Stopped motor tracking, manual date/time selection, Excel (`.xlsx`) export with separate `DD/MM/YYYY` Date and 12-hour Time columns, and an automated Android APK build pipeline via GitHub Releases.

---

## Automated Android APK Releases (GitHub Actions)

This repository includes a ready-to-build Android wrapper app in `android/` and a GitHub Actions workflow at `.github/workflows/android-release.yml`.

### 1. Push This Repository to GitHub
Push your project to a new or existing GitHub repository (or use AI Studio's **Export to GitHub** button).

### 2. Trigger an Android APK Build & Release
You can build and publish a downloadable `.apk` in **two ways**:

- **Option A — Push a Version Tag**
  ```bash
  git tag v1.0.0
  git push origin v1.0.0
  ```
- **Option B — Click the Manual Trigger in GitHub**
  1. Open your GitHub repository and go to the **Actions** tab.
  2. Click **Build & Release Android APK** in the left sidebar.
  3. Click **Run workflow**, enter a version tag (e.g. `v1.0.0`), and click **Run workflow**.

In ~2–3 minutes, GitHub Actions compiles the Android app and publishes `HydroLog-v1.0.0.apk` under the **Releases** section on the right side of your GitHub repository.

### 3. Install the APK on Your Android Phone
1. Open your GitHub repository's **Releases** page on your Android phone.
2. Tap **HydroLog-v1.0.0.apk** under **Assets** to download it.
3. Open the downloaded file (if prompted, allow installing apps from your browser once) and tap **Install**.
4. Open **HydroLog** from your home screen and sign in.

---

## Server URL & Optional Signing Configuration

- **Default Server URL**: Pre-configured in `android/gradle.properties` to your live HydroLog Shared App URL:
  `https://ais-pre-5tnfqkbxa6fnkmd222jbzd-514499993628.asia-southeast1.run.app`
- **Changing the Server URL Later**: Set a GitHub repository variable named `HYDROLOG_APP_URL` under **Settings → Secrets and variables → Actions → Variables**, or pass `app_url` when running the workflow manually.
- **APK Signing**:
  - Works out of the box with zero secrets configured (builds a directly installable signed APK).
  - For long-term production signing with your own keystore, add these 4 repository secrets under **Settings → Secrets and variables → Actions → Secrets**:
    - `ANDROID_KEYSTORE_BASE64` (base64-encoded `.jks` / `.keystore` file)
    - `ANDROID_KEYSTORE_PASSWORD`
    - `ANDROID_KEY_ALIAS`
    - `ANDROID_KEY_PASSWORD`

---

## Building Locally in Android Studio

1. Open the `android/` directory in **Android Studio** (Ladybug or newer, JDK 17).
2. Let Gradle sync.
3. Click **Run ▶** with an Android phone connected via USB, or choose **Build → Build Bundle(s) / APK(s) → Build APK(s)**.

---

## Running the Web App & Backend Locally

```bash
npm install
npm run dev
```

Seeded demo accounts:
- **Admin**: `admin@aquaflow.io` / `admin123`
- **Field Operator**: `marcus@aquaflow.io` / `field123`
