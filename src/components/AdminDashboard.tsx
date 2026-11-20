import { useEffect, useState } from 'react';
import { ArrowRight, Download, RotateCcw } from 'lucide-react';
import { api } from '../api/client';
import {
  MOTOR_STATUSES,
  type AppConfig,
  type AppRoute,
  type MeterReading,
  type MotorStatus,
  type ReadingFilters,
  type User,
} from '../types';
import {
  computeDashboardSummary,
  formatDateTime,
  formatFlow,
  hasAbnormalityRemark,
} from '../utils/meterLogic';
import { MeterPhoto } from './MeterPhoto';
import { PhotoLightbox } from './PhotoLightbox';

interface AdminDashboardProps {
  config: AppConfig;
  onNavigate: (route: AppRoute) => void;
  refreshKey: number;
}

export function AdminDashboard({ config, onNavigate, refreshKey }: AdminDashboardProps) {
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
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewReading, setPreviewReading] = useState<MeterReading | null>(null);

  const plantNames = config.plants.map((p) => p.name);
  const motorNames = config.motors.map((m) => m.name);

  useEffect(() => {
    api
      .getUsers()
      .then(setUsers)
      .catch(() => {});
  }, [refreshKey]);

  useEffect(() => {
    let active = true;
    setLoading(true);
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
  }, [filters, refreshKey]);

  const summary = computeDashboardSummary(readings, plantNames);
  const maxDailyFlow = Math.max(...summary.dailyTrend.map((b) => b.totalFlow), 1);
  const hasActiveFilters =
    filters.plant !== 'all' ||
    filters.motorName !== 'all' ||
    filters.motorStatus !== 'all' ||
    filters.userId !== 'all' ||
    Boolean(filters.dateFrom) ||
    Boolean(filters.dateTo);

  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      await api.exportReadingsXlsx(filters);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Excel export failed.');
    } finally {
      setExporting(false);
    }
  }

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

        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="min-h-[44px] px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-sm font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Download className="w-4 h-4" aria-hidden="true" />
          <span>{exporting ? 'Generating .xlsx...' : 'Export Excel (.xlsx)'}</span>
        </button>
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
                userId: e.target.value === 'all' ? 'all' : Number(e.target.value),
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

      {error && (
        <div role="alert" className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 4-Column KPI Summary Strip */}
      <section
        aria-label="Key metrics"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500">Total Water Flow</div>
          <div
            data-testid="kpi-total-flow"
            className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-2"
          >
            {loading ? '—' : `${formatFlow(summary.totalFlow)} m³`}
          </div>
          <div className="text-xs text-slate-500 mt-1">Sum of filtered meter logs</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500">Total Readings</div>
          <div
            data-testid="kpi-reading-count"
            className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-2"
          >
            {loading ? '—' : summary.readingCount}
          </div>
          <div className="text-xs text-slate-500 mt-1 tabular-nums">
            {loading ? '—' : `${summary.runningCount} Running · ${summary.stoppedCount} Stopped`}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500">Average per Reading</div>
          <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-2">
            {loading ? '—' : `${formatFlow(summary.averageFlow)} m³`}
          </div>
          <div className="text-xs text-slate-500 mt-1">Mean flow across entries</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500">Flagged Abnormalities</div>
          <div className="text-2xl font-bold text-amber-700 font-mono tabular-nums mt-2">
            {loading ? '—' : summary.abnormalCount}
          </div>
          <div className="text-xs text-slate-500 mt-1">Readings with operator remarks</div>
        </div>
      </section>

      {/* Breakdown Grid: Plant Distribution + Daily Flow Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-base font-semibold text-slate-900">Volume by Plant</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Cubic meters recorded across each monitoring station
          </p>

          <div className="mt-6 space-y-5">
            {summary.plantBreakdown.map((item) => (
              <div key={item.plant}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium text-slate-900 truncate">{item.plant}</span>
                  <span className="font-mono tabular-nums text-slate-900 font-semibold whitespace-nowrap">
                    {formatFlow(item.totalFlow)} m³{' '}
                    <span className="text-xs font-normal text-slate-500">
                      ({item.sharePercent}% · {item.readingCount})
                    </span>
                  </span>
                </div>
                <div className="mt-2 h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-sky-700 transition-all duration-200"
                    style={{
                      width: `${Math.min(100, Math.max(item.totalFlow > 0 ? 3 : 0, item.sharePercent))}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 flex flex-col">
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
      </div>

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

        {readings.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No readings match the current filter selection.
          </div>
        ) : (
          <ul className="divide-y divide-slate-200">
            {readings.slice(0, 5).map((item) => {
              const flagged = hasAbnormalityRemark(item.review);
              return (
                <li
                  key={item.id}
                  className="px-6 py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <MeterPhoto
                      src={item.imageUrl}
                      alt={`Meter evidence for ${item.plant}`}
                      className="w-14 h-10 object-cover rounded-md"
                      onClick={() => setPreviewReading(item)}
                      ariaLabel={`Inspect meter photo for reading #${item.id}`}
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
