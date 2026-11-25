import { useEffect, useState } from 'react';
import { ArrowRight, Camera, CirclePlay, CircleStop, ClipboardList } from 'lucide-react';
import { api } from '../api/client';
import type { AppConfig, AppRoute, MeterReading, PlantMotorState, User } from '../types';
import {
  applyPlantMotorStatesToReadings,
  buildPlantMotorStatesSignature,
  computeDashboardSummary,
  formatDateTime,
  formatFlow,
  getPlantMotorState,
  hasAbnormalityRemark,
} from '../utils/meterLogic';
import { MeterPhoto } from './MeterPhoto';
import { PhotoLightbox } from './PhotoLightbox';

interface UserHomeProps {
  user: User;
  config: AppConfig;
  plantMotorStates: PlantMotorState[];
  onNavigate: (route: AppRoute) => void;
  refreshKey?: number;
  onDataMutated?: () => void;
}

export function UserHome({
  user,
  config,
  plantMotorStates,
  onNavigate,
  refreshKey = 0,
  onDataMutated,
}: UserHomeProps) {
  const [readings, setReadings] = useState<MeterReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [stoppingPlantId, setStoppingPlantId] = useState<string | null>(null);
  const [previewReading, setPreviewReading] = useState<MeterReading | null>(null);

  const motorStatesSignature = buildPlantMotorStatesSignature(plantMotorStates);

  useEffect(() => {
    let active = true;
    api
      .getMyReadings()
      .then((items) => {
        if (active) {
          setReadings(items);
          setError(null);
        }
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
  }, [refreshKey, motorStatesSignature]);

  async function handleStopPlantMotor(plantId: string, plantName: string, activeMotor: string) {
    setStoppingPlantId(plantId);
    setError(null);
    setNotice(null);
    try {
      const result = await api.stopPlantMotor(plantId, plantName);
      const stoppedLabel = result.stoppedMotor || activeMotor || 'running motor';
      setNotice(`Stopped ${stoppedLabel} in ${plantName}.`);
      const updated = await api.getMyReadings();
      setReadings(updated);
      onDataMutated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to stop running motor.');
    } finally {
      setStoppingPlantId(null);
    }
  }

  const syncedReadings = applyPlantMotorStatesToReadings(readings, plantMotorStates);
  const summary = computeDashboardSummary(syncedReadings);
  const latest = syncedReadings.slice(0, 4);

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
            Record daily water meter readings with photo evidence across all configured plants and motors.
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

      {/* Live Plant Motor Status (Single-Motor Interlock) */}
      <section
        aria-label="Live plant motor status"
        className="bg-white border border-slate-200 rounded-xl p-5"
      >
        <div className="mb-3.5">
          <h2 className="text-base font-semibold text-slate-900">
            Live Plant Motor Status (Single-Motor Interlock)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Only 1 motor can run per plant at a time. Starting another motor in the same plant
            automatically stops the running one, or stop it directly below.
          </p>
        </div>

        {notice && (
          <div
            role="status"
            className="mb-3.5 rounded-lg bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 text-xs font-medium text-emerald-800 flex items-center justify-between gap-3"
          >
            <span>{notice}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="text-emerald-900 hover:underline font-semibold cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {config.plants.map((plantItem) => {
            const state = getPlantMotorState(plantMotorStates, plantItem.name);
            const activeMotor = (state?.activeMotorName ?? '').trim();
            const isRunning = Boolean(activeMotor);
            return (
              <div
                key={plantItem.id}
                className={`rounded-lg border p-3.5 flex items-center justify-between gap-3 ${
                  isRunning
                    ? 'border-emerald-200 bg-emerald-50/40'
                    : 'border-slate-200 bg-slate-50/60'
                }`}
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900 truncate">
                    {plantItem.name}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-xs">
                    {isRunning ? (
                      <>
                        <CirclePlay
                          className="w-3.5 h-3.5 text-emerald-700 shrink-0"
                          aria-hidden="true"
                        />
                        <span className="font-semibold text-emerald-800 truncate">
                          {activeMotor} Running
                        </span>
                      </>
                    ) : (
                      <>
                        <CircleStop
                          className="w-3.5 h-3.5 text-slate-400 shrink-0"
                          aria-hidden="true"
                        />
                        <span className="text-slate-600">All motors stopped</span>
                      </>
                    )}
                  </div>
                  {state?.previousStoppedMotor && (
                    <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                      Last stopped: {state.previousStoppedMotor}
                    </div>
                  )}
                </div>

                {isRunning && (
                  <button
                    type="button"
                    disabled={stoppingPlantId === plantItem.id}
                    onClick={() => handleStopPlantMotor(plantItem.id, plantItem.name, activeMotor)}
                    aria-label={`Stop ${activeMotor} in ${plantItem.name}`}
                    className="min-h-[36px] px-3 py-1.5 rounded-lg border border-red-200 bg-white hover:bg-red-50 disabled:opacity-60 text-xs font-semibold text-red-700 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {stoppingPlantId === plantItem.id ? 'Stopping...' : 'Stop Motor'}
                  </button>
                )}
              </div>
            );
          })}
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
                      photoId={item.photoId}
                      alt={`Meter evidence for ${item.plant}`}
                      className="w-16 h-12 object-cover rounded-md"
                      onClick={() => setPreviewReading(item)}
                      ariaLabel={`View meter photo for reading ${item.id}`}
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
