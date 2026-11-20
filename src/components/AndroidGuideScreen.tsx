import { useState } from 'react';
import { Check, Copy, Download, GitBranch, Smartphone } from 'lucide-react';
import { BLUEPRINT_FILES } from '../data/androidBlueprint';

const SHARED_APP_URL =
  'https://hydrolog-water-meter-reading-app-199133736510.asia-east1.run.app';
const RELEASE_TAG_CMD = 'git tag v1.0.0 && git push origin v1.0.0';

export function AndroidGuideScreen() {
  const [selectedId, setSelectedId] = useState(BLUEPRINT_FILES[0].id);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const activeFile =
    BLUEPRINT_FILES.find((f) => f.id === selectedId) ?? BLUEPRINT_FILES[0];

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
          Build and distribute a signed HydroLog Android APK automatically via GitHub Releases, or inspect the Kotlin and API blueprint below.
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
              This repository includes a ready-to-build Android project (<code className="font-mono text-xs text-slate-800">android/</code>) with native camera capture and Downloads-folder Excel export, plus a GitHub Actions workflow (<code className="font-mono text-xs text-slate-800">.github/workflows/android-release.yml</code>) pre-configured with your live server URL.
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
              After ~2–3 minutes, open your GitHub repo&apos;s <strong>Releases</strong> panel on the right, pick the <strong>Latest</strong> release, and download <code className="font-mono text-slate-800">HydroLog-v1.0.0.apk</code> on your Android phone.
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Smartphone className="w-4 h-4 text-sky-700 shrink-0" aria-hidden="true" />
              <span>3. Install & Log Meter Readings</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Tap the downloaded APK, allow installation from your browser once, and launch <strong>HydroLog</strong>. Camera photos, Excel exports to Downloads, and web updates work automatically.
            </p>
          </div>
        </div>
      </section>

      {/* Existing Kotlin & API Blueprint Browser */}
      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Android Studio (Kotlin) &amp; Backend Reference
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            You can also open the <code className="font-mono text-slate-700">android/</code> directory directly in Android Studio to build locally, or review the native Jetpack Compose + Retrofit blueprint below.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* File List Navigation */}
          <nav
            aria-label="Android blueprint files"
            className="lg:col-span-4 bg-white border border-slate-200 rounded-xl divide-y divide-slate-200 overflow-hidden"
          >
            {BLUEPRINT_FILES.map((file) => {
              const active = file.id === activeFile.id;
              return (
                <button
                  key={file.id}
                  type="button"
                  onClick={() => setSelectedId(file.id)}
                  aria-current={active ? 'true' : undefined}
                  className={`w-full text-left px-4 py-3.5 transition-colors cursor-pointer ${
                    active ? 'bg-sky-50 text-sky-900' : 'hover:bg-slate-50 text-slate-800'
                  }`}
                >
                  <div className="text-xs text-slate-500">{file.category}</div>
                  <div className="text-sm font-semibold mt-0.5">{file.title}</div>
                  <div className="text-xs font-mono text-slate-500 truncate mt-0.5">
                    {file.path}
                  </div>
                </button>
              );
            })}
          </nav>

          {/* Active Code Viewer */}
          <section className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-slate-900">{activeFile.title}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{activeFile.summary}</p>
              </div>
              <button
                type="button"
                onClick={() => handleCopyText(activeFile.id, activeFile.code)}
                className="min-h-[40px] px-3.5 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              >
                {copiedId === activeFile.id ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Copy Code</span>
                  </>
                )}
              </button>
            </div>

            <div className="bg-slate-950 text-slate-100 p-5 overflow-x-auto">
              <pre className="text-xs sm:text-[13px] font-mono leading-relaxed">
                <code>{activeFile.code}</code>
              </pre>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
