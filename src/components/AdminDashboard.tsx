import { useEffect, useState } from 'react';
import { ArrowRight, CirclePlay, CircleStop, RotateCcw } from 'lucide-react';
import { api } from '../api/client';
import {
  MOTOR_STATUSES,
  type AppConfig,
  type AppRoute,
  type MeterReading,
  type MotorStatus,
  type PlantMotorState,
  type ReadingFilters,
  type User,
} from '../types';
import {
  applyPlantMotorStatesToReadings,
  buildPlantMotorStatesSignature,
  computeDashboardSummary,
  formatDateTime,
  formatFlow,
  getPlantMotorState,
  hasAbnormalityRemark,
} from '../utils/meterLogic';
import { buildPlantExcelSheetsData } from '../utils/excelExport';
import { ExportExcelControl } from './ExportExcelControl';
import { IntervalReadingsPanel } from './IntervalReadingsPanel';
import { MeterPhoto } from './MeterPhoto';
import { PhotoLightbox } from './PhotoLightbox';
import { PlantUsageTrendChart } from './PlantUsageTrendChart';

interface AdminDashboardProps {
  config: AppConfig;
  plantMotorStates: PlantMotorState[];
  onNavigate: (route: AppRoute) => void;
  refreshKey: number;
  onDataMutated?: () => void;
}

export function AdminDashboard({
  config,
  plantMotorStates,
  onNavigate,
  refreshKey,
  onDataMutated,
}: AdminDashboardProps) {
  const [readings, setReadings] = useState<MeterReading[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [filters, setFilters] = useState<ReadingFilters>({
    plant: 'all',
    motorName: 'all',
    motorStatus: 'all',
    userId: 'all',
    dateFrom: '',
    dateTo: '',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [stoppingPlantId, setStoppingPlantId] = useState<string | null>(null);
  const [previewReading, setPreviewReading] = useState<MeterReading | null>(null);

  const plantNames = config.plants.map((p) => p.name);
  const motorNames = config.motors.map((m) => m.name);
  const motorStatesSignature = buildPlantMotorStatesSignature(plantMotorStates);

  useEffect(() => {
    api
      .getUsers()
      .then(setUsers)
      .catch(() => {});
  }, [refreshKey]);

  useEffect(() => {
    let active = true;
    api
      .getAllReadings(filters)
      .then((items) => {
        if (active) {
          setReadings(items);
          setError(null);
        }
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Unable to load dashboard data.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [filters, refreshKey, motorStatesSignature]);

  const displayedReadings =
    filters.motorStatus && filters.motorStatus !== 'all'
      ? applyPlantMotorStatesToReadings(readings, plantMotorStates).filter(
          (r) => r.motorStatus === filters.motorStatus
        )
      : applyPlantMotorStatesToReadings(readings, plantMotorStates);
  const summary = computeDashboardSummary(displayedReadings, plantNames);
  const tzOffset = new Date().getTimezoneOffset();
  const intervalSheets = buildPlantExcelSheetsData(displayedReadings, {
    tzOffsetMinutes: tzOffset,
    emptyFallbackPlant: filters.plant,
  });
  const maxDailyFlow = Math.max(...summary.dailyTrend.map((b) => b.totalFlow), 1);
  const hasActiveFilters =
    filters.plant !== 'all' ||
    filters.motorName !== 'all' ||
    filters.motorStatus !== 'all' ||
    filters.userId !== 'all' ||
    Boolean(filters.dateFrom) ||
    Boolean(filters.dateTo);

  function resetFilters() {
    setFilters({
      plant: 'all',
      motorName: 'all',
      motorStatus: 'all',
      userId: 'all',
      dateFrom: '',
      dateTo: '',
    });
  }

  async function handleStopPlantMotor(plantId: string, plantName: string, activeMotor: string) {
    setStoppingPlantId(plantId);
    setError(null);
    setNotice(null);
    try {
      const result = await api.stopPlantMotor(plantId, plantName);
      const stoppedLabel = result.stoppedMotor || activeMotor || 'running motor';
      setNotice(`Stopped ${stoppedLabel} in ${plantName}.`);
      const updated = await api.getAllReadings(filters);
      setReadings(updated);
      onDataMutated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to stop running motor.');
    } finally {
      setStoppingPlantId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Water Flow Overview</h1>
          <p className="text-sm text-slate-600 mt-1">
            Aggregated consumption across configured plants and motor units with live filter breakdowns.
          </p>
        </div>

        <ExportExcelControl
          plantNames={plantNames}
          filters={filters}
          idPrefix="dash"
          onSuccessNotice={(msg) => {
            setError(null);
            setNotice(msg);
          }}
          onError={(msg) => setError(msg)}
        />
      </div>

      {/* Filter Bar */}
      <section
        aria-label="Dashboard filters"
        className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end"
      >
        <div className="lg:col-span-2">
          <label htmlFor="dash-plant" className="block text-xs font-medium text-slate-600 mb-1">
            Plant
          </label>
          <select
            id="dash-plant"
            value={filters.plant || 'all'}
            onChange={(e) => setFilters((prev) => ({ ...prev, plant: e.target.value }))}
            className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-700/20 focus:border-sky-700"
          >
            <option value="all">All Plants</option>
            {plantNames.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div className="lg:col-span-2">
          <label htmlFor="dash-motor" className="block text-xs font-medium text-slate-600 mb-1">
            Motor No.
          </label>
          <select
            id="dash-motor"
            value={filters.motorName || 'all'}
            onChange={(e) => setFilters((prev) => ({ ...prev, motorName: e.target.value }))}
            className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-700/20 focus:border-sky-700"
          >
            <option value="all">All Motors</option>
            {motorNames.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div className="lg:col-span-2">
          <label htmlFor="dash-status" className="block text-xs font-medium text-slate-600 mb-1">
            Motor Status
          </label>
          <select
            id="dash-status"
            value={filters.motorStatus || 'all'}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                motorStatus: e.target.value as MotorStatus | 'all',
              }))
            }
            className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-700/20 focus:border-sky-700"
          >
            <option value="all">All Statuses</option>
            {MOTOR_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="lg:col-span-2">
          <label htmlFor="dash-user" className="block text-xs font-medium text-slate-600 mb-1">
            Submitted By
          </label>
          <select
            id="dash-user"
            value={filters.userId === 'all' || filters.userId === undefined ? 'all' : String(filters.userId)}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                userId: e.target.value === 'all' ? 'all' : e.target.value,
              }))
            }
            className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-700/20 focus:border-sky-700"
          >
            <option value="all">All Users</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>

        <div className="lg:col-span-2">
          <label htmlFor="dash-date-from" className="block text-xs font-medium text-slate-600 mb-1">
            From Date
          </label>
          <input
            id="dash-date-from"
            type="date"
            value={filters.dateFrom || ''}
            onChange={(e) => setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))}
            className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white font-mono tabular-nums text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-700/20 focus:border-sky-700"
          />
        </div>

        <div className="lg:col-span-2 flex items-end gap-2">
          <div className="flex-1 min-w-0">
            <label htmlFor="dash-date-to" className="block text-xs font-medium text-slate-600 mb-1">
              To Date
            </label>
            <input
              id="dash-date-to"
              type="date"
              value={filters.dateTo || ''}
              onChange={(e) => setFilters((prev) => ({ ...prev, dateTo: e.target.value }))}
              className="w-full h-10 px-2.5 rounded-lg border border-slate-300 bg-white font-mono tabular-nums text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-700/20 focus:border-sky-700"
            />
          </div>
          <button
            type="button"
            onClick={resetFilters}
            disabled={!hasActiveFilters}
            aria-label="Reset Filters"
            title="Reset Filters"
            className="h-10 w-10 shrink-0 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-45 disabled:hover:bg-transparent flex items-center justify-center transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </section>

      {notice && (
        <div
          role="status"
          className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800 flex items-center justify-between gap-4"
        >
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-xs font-semibold text-emerald-900 hover:underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Flagged Abnormalities Summary */}
      <section
        aria-label="Flagged abnormalities summary"
        className="bg-white border border-slate-200 rounded-xl px-5 py-3.5 flex items-center justify-between gap-4"
      >
        <div>
          <div className="text-sm font-semibold text-slate-900">Flagged Abnormalities</div>
          <div className="text-xs text-slate-500 mt-0.5">Readings with operator remarks</div>
        </div>
        <div
          data-testid="kpi-abnormal-count"
          className="text-2xl font-bold text-amber-700 font-mono tabular-nums shrink-0"
        >
          {loading ? '—' : summary.abnormalCount}
        </div>
      </section>

      {/* 4H / 12H / 24H Interval Bar Graph */}
      <IntervalReadingsPanel
        sheets={intervalSheets}
        loading={loading}
        filteredPlant={filters.plant}
        hasActiveFilters={hasActiveFilters}
        onResetFilters={resetFilters}
      />

      {/* Live Plant Motor Interlock Status */}
      <section
        aria-label="Live plant motor status"
        className="bg-white border border-slate-200 rounded-xl p-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Live Plant Motor Status (Single-Motor Interlock)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Only 1 motor can run per plant at a time. Starting a new motor in a plant automatically
              stops the previously running motor.
            </p>
          </div>
        </div>

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

      {/* 30-Day Per-Plant Water Usage Trends (Recharts) */}
      <PlantUsageTrendChart
        readings={displayedReadings}
        plantNames={
          filters.plant && filters.plant !== 'all' ? [filters.plant] : plantNames
        }
        loading={loading}
        anchorDateKey={filters.dateTo || undefined}
        hasActiveFilters={hasActiveFilters}
        onResetFilters={resetFilters}
      />

      {/* Daily Flow Totals */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col">
        <h2 className="text-base font-semibold text-slate-900">Daily Flow Totals (m³)</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Combined volume by reading date (up to 7 most recent active days)
        </p>

        {summary.dailyTrend.length === 0 ? (
          <div className="flex-1 flex items-center justify-center py-10 text-sm text-slate-500">
            No readings match the selected filters.
          </div>
        ) : (
          <div className="mt-6 flex-1 flex items-end gap-3 sm:gap-4 min-h-[180px] pt-4">
            {summary.dailyTrend.map((day) => {
              const heightPct = Math.max(8, Math.round((day.totalFlow / maxDailyFlow) * 100));
              return (
                <div key={day.date} className="flex-1 flex flex-col items-center gap-2 min-w-0">
                  <span className="text-[11px] font-mono tabular-nums text-slate-600 truncate max-w-full">
                    {Math.round(day.totalFlow)}
                  </span>
                  <div className="w-full h-36 bg-slate-100 rounded-md flex items-end overflow-hidden">
                    <div
                      className="w-full bg-sky-700/90 hover:bg-sky-700 rounded-t-md transition-all duration-200"
                      style={{ height: `${heightPct}%` }}
                      title={`${day.label}: ${formatFlow(day.totalFlow)} m³ (${day.readingCount} readings)`}
                    />
                  </div>
                  <span className="text-xs text-slate-600 whitespace-nowrap">{day.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Recent Filtered Readings */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Latest Filtered Readings</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Showing up to 5 most recent entries matching your active filters
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('all-records')}
            className="min-h-[40px] px-3 py-1.5 rounded-lg text-sm font-medium text-sky-700 hover:bg-sky-50 flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <span>Manage All Records</span>
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {displayedReadings.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No readings match the current filter selection.
          </div>
        ) : (
          <ul className="divide-y divide-slate-200">
            {displayedReadings.slice(0, 5).map((item) => {
              const flagged = hasAbnormalityRemark(item.review);
              return (
                <li
                  key={item.id}
                  className="px-6 py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <MeterPhoto
                      src={item.imageUrl}
                      photoId={item.photoId}
                      alt={`Meter evidence for ${item.plant}`}
                      className="w-14 h-10 object-cover rounded-md"
                      onClick={() => setPreviewReading(item)}
                      ariaLabel={`Inspect meter photo for reading ${item.id}`}
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                        <span className="font-semibold font-mono tabular-nums text-slate-900">
                          {formatFlow(item.waterFlow)} m³
                        </span>
                        <span className="text-slate-300" aria-hidden="true">·</span>
                        <span className="font-medium text-slate-700">{item.plant}</span>
                        <span className="text-slate-300" aria-hidden="true">·</span>
                        <span className="text-xs font-medium text-slate-700">{item.motorName}</span>
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
                        <span className="text-slate-300" aria-hidden="true">·</span>
                        <span className="text-xs text-slate-600">{item.submittedByName}</span>
                        <span className="text-slate-300" aria-hidden="true">·</span>
                        <span className="text-xs text-slate-500 tabular-nums">
                          {formatDateTime(item.recordedAt)}
                        </span>
                      </div>
                      <p
                        className={`text-xs mt-0.5 truncate ${
                          flagged ? 'text-amber-800 font-medium' : 'text-slate-500'
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
