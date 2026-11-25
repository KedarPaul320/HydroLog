import { useState } from 'react';
import { Check, Clock, Copy, Download, ExternalLink, GitBranch, Smartphone } from 'lucide-react';
import { FIREBASE_TTL_POLICY_URL } from '../lib/firebase';

const SHARED_APP_URL =
  'https://hydrolog-water-meter-reading-app-199133736510.asia-east1.run.app';
const RELEASE_TAG_CMD = 'git tag v1.0.6 && git push origin v1.0.6';

export function AndroidGuideScreen() {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function handleCopyText(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      // Clipboard API may be blocked in restricted iframes
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Android APK & GitHub Releases
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Build and distribute a signed HydroLog Android APK automatically via GitHub Releases and configure automatic Firestore retention.
        </p>
      </div>

      {/* Automated APK & GitHub Release Card */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-slate-900">
              Publish & Install Android APK via GitHub Releases
            </h2>
            <p className="text-sm text-slate-600 max-w-2xl">
              This repository includes a ready-to-build Android project (<code className="font-mono text-xs text-slate-800">android/</code>) with native camera permissions, persistent Firebase Firestore sync (45-day retention with Day-46 auto-deletion), native Google Sheets export &amp; OAuth support, and Downloads-folder Excel export via GitHub Actions (<code className="font-mono text-xs text-slate-800">.github/workflows/android-release.yml</code>).
            </p>
          </div>
          <div className="shrink-0 text-xs text-slate-500 font-mono bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 max-w-full overflow-x-auto">
            <div className="text-[11px] font-sans font-medium text-slate-500 mb-0.5">
              Configured Server URL
            </div>
            <div className="text-slate-800">{SHARED_APP_URL}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <GitBranch className="w-4 h-4 text-sky-700 shrink-0" aria-hidden="true" />
              <span>1. Push & Trigger Release</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Push this repo to GitHub. Then either open <strong>Actions → Build &amp; Release Android APK → Run workflow</strong>, or push a version tag:
            </p>
            <div className="flex items-center justify-between gap-2 rounded-md bg-slate-900 text-slate-100 px-3 py-2">
              <code className="text-xs font-mono truncate">{RELEASE_TAG_CMD}</code>
              <button
                type="button"
                onClick={() => handleCopyText('tag-cmd', RELEASE_TAG_CMD)}
                aria-label="Copy git tag command"
                className="min-h-[32px] min-w-[32px] inline-flex items-center justify-center rounded text-slate-300 hover:text-white cursor-pointer shrink-0"
              >
                {copiedId === 'tag-cmd' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                ) : (
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Download className="w-4 h-4 text-sky-700 shrink-0" aria-hidden="true" />
              <span>2. Download APK from Releases</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              After ~2–3 minutes, open your GitHub repo&apos;s <strong>Releases</strong> panel on the right, pick the <strong>Latest</strong> release, and download <code className="font-mono text-slate-800">HydroLog-v1.0.6.apk</code> on your Android phone.
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Smartphone className="w-4 h-4 text-sky-700 shrink-0" aria-hidden="true" />
              <span>3. Install & Log Meter Readings</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Tap the downloaded APK, allow installation from your browser once, and launch <strong>HydroLog</strong>. Camera photos, direct Google Sheets exports, offline Excel downloads, and web updates work automatically.
            </p>
          </div>
        </div>
      </section>

      {/* Zero-Cost Cloud Photo Storage & Automatic Day-46 Firestore TTL Card */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-sky-700 shrink-0" aria-hidden="true" />
              <h2 className="text-base font-semibold text-slate-900">
                Zero-Cost Cloud Photo Storage &amp; Automatic Day-46 Deletion (Firestore TTL)
              </h2>
            </div>
            <p className="text-sm text-slate-600 max-w-3xl">
              Every meter reading (<code className="font-mono text-xs text-slate-800">readings</code>) and its compressed meter photo (<code className="font-mono text-xs text-slate-800">reading_photos</code>) is stored in your free-tier Firebase Firestore database with an exact Day-46 <code className="font-mono text-xs text-slate-800">expiresAt</code> timestamp. Admins automatically see all operator photos, and expired records + photos are automatically purged whenever an Admin signs in.
            </p>
          </div>
          <a
            href={FIREBASE_TTL_POLICY_URL}
            target="_blank"
            rel="noreferrer"
            className="min-h-[42px] px-4 py-2 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <span>Open Firestore TTL Console</span>
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
          </a>
        </div>
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 text-xs text-slate-700 space-y-1.5">
          <p className="font-semibold text-slate-900">
            Optional 1-time setup for 24/7 background Day-46 deletion (Free — no Cloud Functions or billing required):
          </p>
          <ol className="list-decimal list-inside space-y-1 text-slate-600">
            <li>
              Click <strong>Open Firestore TTL Console</strong> above and create a TTL policy for collection group <code className="font-mono text-slate-800">readings</code> on timestamp field <code className="font-mono text-slate-800">expiresAt</code>.
            </li>
            <li>
              Create a second TTL policy for collection group <code className="font-mono text-slate-800">reading_photos</code> on timestamp field <code className="font-mono text-slate-800">expiresAt</code>.
            </li>
            <li>
              Firestore will then automatically delete both the reading and its photo on Day 46 even if nobody opens the app.
            </li>
          </ol>
        </div>
      </section>

    </div>
  );
}
