import { useEffect, useState } from 'react';
import { ArrowRight, Camera, ClipboardList } from 'lucide-react';
import { api } from '../api/client';
import type { AppRoute, MeterReading, User } from '../types';
import {
  computeDashboardSummary,
  formatDateTime,
  formatFlow,
  hasAbnormalityRemark,
} from '../utils/meterLogic';
import { MeterPhoto } from './MeterPhoto';
import { PhotoLightbox } from './PhotoLightbox';

interface UserHomeProps {
  user: User;
  onNavigate: (route: AppRoute) => void;
}

export function UserHome({ user, onNavigate }: UserHomeProps) {
  const [readings, setReadings] = useState<MeterReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewReading, setPreviewReading] = useState<MeterReading | null>(null);

  useEffect(() => {
    let active = true;
    api
      .getMyReadings()
      .then((items) => {
        if (active) setReadings(items);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load readings.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const summary = computeDashboardSummary(readings);
  const latest = readings.slice(0, 4);

  return (
    <div className="space-y-6">
      {/* Operator Welcome & Primary Action */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
        <div>
          <p className="text-xs font-medium text-slate-500">Field Operator Workspace</p>
          <h1 className="text-2xl font-bold text-slate-900 mt-1 text-balance">
            Welcome back, {user.name}
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Record daily water meter readings with photo evidence across Plant A, Plant B, and Plant C.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('submit-reading')}
          className="min-h-[48px] px-5 py-3 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Camera className="w-4 h-4" aria-hidden="true" />
          <span>Submit New Reading</span>
        </button>
      </section>

      {/* Personal Summary Strip */}
      <section aria-label="Your submission metrics" className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="col-span-2 sm:col-span-1 bg-white border border-slate-200 rounded-xl p-4 sm:p-5">
          <div className="text-xs font-medium text-slate-500">My Logged Volume</div>
          <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1.5">
            {loading ? '—' : `${formatFlow(summary.totalFlow)} m³`}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">Across your submitted entries</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5">
          <div className="text-xs font-medium text-slate-500">My Submissions</div>
          <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1.5">
            {loading ? '—' : summary.readingCount}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">Photo records</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5">
          <div className="text-xs font-medium text-slate-500">Flagged Remarks</div>
          <div className="text-2xl font-bold text-amber-700 font-mono tabular-nums mt-1.5">
            {loading ? '—' : summary.abnormalCount}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">With remarks</div>
        </div>
      </section>

      {/* Recent Submissions */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Recent Submissions</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Only records submitted under your account are shown here.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('my-records')}
            className="min-h-[40px] px-3 py-1.5 rounded-lg text-sm font-medium text-sky-700 hover:bg-sky-50 flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <span>View All</span>
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {error && (
          <div role="alert" className="p-6 text-sm text-red-700 bg-red-50">
            {error}
          </div>
        )}

        {loading ? (
          <div className="divide-y divide-slate-100">
            {[1, 2, 3].map((idx) => (
              <div key={idx} className="px-6 py-4 flex items-center gap-4 animate-pulse">
                <div className="w-16 h-12 rounded-md bg-slate-200 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 bg-slate-200 rounded" />
                  <div className="h-3 w-56 bg-slate-100 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : latest.length === 0 ? (
          <div className="p-10 text-center">
            <ClipboardList className="w-8 h-8 text-slate-300 mx-auto" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-slate-900 mt-3">
              No meter readings logged yet
            </h3>
            <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
              Capture your first water meter photograph and record today&apos;s flow in cubic meters.
            </p>
            <button
              type="button"
              onClick={() => onNavigate('submit-reading')}
              className="mt-4 min-h-[44px] px-4 py-2 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-sm font-medium transition-colors cursor-pointer"
            >
              Submit First Reading
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-slate-200">
            {latest.map((item) => {
              const flagged = hasAbnormalityRemark(item.review);
              return (
                <li
                  key={item.id}
                  className="px-6 py-4 flex items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <MeterPhoto
                      src={item.imageUrl}
                      alt={`Meter evidence for ${item.plant}`}
                      className="w-16 h-12 object-cover rounded-md"
                      onClick={() => setPreviewReading(item)}
                      ariaLabel={`View meter photo for reading #${item.id}`}
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                        <span className="font-semibold text-slate-900 font-mono tabular-nums">
                          {formatFlow(item.waterFlow)} m³
                        </span>
                        <span className="text-slate-300" aria-hidden="true">·</span>
                        <span className="font-medium text-slate-700">{item.plant}</span>
                        <span className="text-slate-300" aria-hidden="true">·</span>
                        <span className="text-slate-700">{item.motorName}</span>
                        <span className="text-slate-300" aria-hidden="true">·</span>
                        <span
                          className={
                            item.motorStatus === 'Running'
                              ? 'text-xs font-semibold text-emerald-700'
                              : 'text-xs font-semibold text-red-700'
                          }
                        >
                          {item.motorStatus}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 tabular-nums mt-0.5">
                        {formatDateTime(item.recordedAt)}
                      </div>
                      <p
                        className={`text-xs mt-1 truncate ${
                          flagged ? 'text-amber-700 font-medium' : 'text-slate-500'
                        }`}
                      >
                        {item.review || 'Normal operation'}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <PhotoLightbox reading={previewReading} onClose={() => setPreviewReading(null)} />
    </div>
  );
}
