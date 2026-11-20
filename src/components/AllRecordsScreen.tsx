import { useEffect, useState } from 'react';
import { Download, Pencil, RotateCcw, Search, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import {
  MOTOR_STATUSES,
  type AppConfig,
  type MeterReading,
  type MotorStatus,
  type ReadingFilters,
  type User,
} from '../types';
import { formatDateTime, formatFlow, hasAbnormalityRemark } from '../utils/meterLogic';
import { EditReadingModal } from './EditReadingModal';
import { MeterPhoto } from './MeterPhoto';
import { PhotoLightbox } from './PhotoLightbox';

interface AllRecordsScreenProps {
  config: AppConfig;
  refreshKey: number;
  onDataMutated: () => void;
}

export function AllRecordsScreen({ config, refreshKey, onDataMutated }: AllRecordsScreenProps) {
  const [readings, setReadings] = useState<MeterReading[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [filters, setFilters] = useState<ReadingFilters>({
    plant: 'all',
    motorName: 'all',
    motorStatus: 'all',
    userId: 'all',
    dateFrom: '',
    dateTo: '',
    search: '',
  });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingReading, setEditingReading] = useState<MeterReading | null>(null);
  const [previewReading, setPreviewReading] = useState<MeterReading | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

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
        if (active) setError(err instanceof Error ? err.message : 'Unable to load all records.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [filters, refreshKey]);

  async function handleExport() {
    setExporting(true);
    setError(null);
    setNotice(null);
    try {
      const filename = await api.exportReadingsXlsx(filters);
      setNotice(`Exported ${readings.length} records to ${filename}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Excel export failed.');
    } finally {
      setExporting(false);
    }
  }

  async function handleDelete(id: number) {
    setError(null);
    try {
      await api.deleteReading(id);
      setReadings((prev) => prev.filter((r) => r.id !== id));
      setConfirmDeleteId(null);
      setNotice(`Deleted reading #${id}.`);
      onDataMutated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete record.');
    }
  }

  function handleSavedEdit(updated: MeterReading) {
    setReadings((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    setEditingReading(null);
    setNotice(`Saved changes to reading #${updated.id}.`);
    onDataMutated();
  }

  function resetFilters() {
    setFilters({
      plant: 'all',
      motorName: 'all',
      motorStatus: 'all',
      userId: 'all',
      dateFrom: '',
      dateTo: '',
      search: '',
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">All Records</h1>
          <p className="text-sm text-slate-600 mt-1">
            Inspect meter photographs, motor status, edit entries across all operators, and export filtered spreadsheets ({readings.length}{' '}
            {readings.length === 1 ? 'record' : 'records'}).
          </p>
        </div>

        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="min-h-[44px] px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-60 text-slate-800 text-sm font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Download className="w-4 h-4" aria-hidden="true" />
          <span>{exporting ? 'Exporting...' : 'Export Excel (.xlsx)'}</span>
        </button>
      </div>

      {/* Filters (Clean 2-row responsive grid with generous input spacing) */}
      <section
        aria-label="Record filters"
        className="bg-white border border-slate-200 rounded-xl p-4 space-y-3"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
          <div className="sm:col-span-2 lg:col-span-4">
            <label htmlFor="all-search" className="block text-xs font-medium text-slate-600 mb-1">
              Search
            </label>
            <div className="relative">
              <Search
                className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                id="all-search"
                type="search"
                value={filters.search || ''}
                onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
                placeholder="Operator, plant, motor, remarks..."
                className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-700/20 focus:border-sky-700"
              />
            </div>
          </div>

          <div className="lg:col-span-2">
            <label htmlFor="all-plant" className="block text-xs font-medium text-slate-600 mb-1">
              Plant
            </label>
            <select
              id="all-plant"
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
            <label htmlFor="all-motor" className="block text-xs font-medium text-slate-600 mb-1">
              Motor No.
            </label>
            <select
              id="all-motor"
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
            <label htmlFor="all-status" className="block text-xs font-medium text-slate-600 mb-1">
              Motor Status
            </label>
            <select
              id="all-status"
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
            <label htmlFor="all-user" className="block text-xs font-medium text-slate-600 mb-1">
              Submitted By
            </label>
            <select
              id="all-user"
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
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-12 gap-3 items-end pt-1">
          <div className="lg:col-span-3">
            <label htmlFor="all-from" className="block text-xs font-medium text-slate-600 mb-1">
              From Date
            </label>
            <input
              id="all-from"
              type="date"
              value={filters.dateFrom || ''}
              onChange={(e) => setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))}
              className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white font-mono tabular-nums text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-700/20 focus:border-sky-700"
            />
          </div>

          <div className="lg:col-span-3">
            <label htmlFor="all-to" className="block text-xs font-medium text-slate-600 mb-1">
              To Date
            </label>
            <input
              id="all-to"
              type="date"
              value={filters.dateTo || ''}
              onChange={(e) => setFilters((prev) => ({ ...prev, dateTo: e.target.value }))}
              className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white font-mono tabular-nums text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-700/20 focus:border-sky-700"
            />
          </div>

          <div className="lg:col-span-2">
            <button
              type="button"
              onClick={resetFilters}
              className="w-full h-10 px-3 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 flex items-center justify-center gap-1.5 text-xs font-medium cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Reset Filters</span>
            </button>
          </div>
        </div>
      </section>

      {notice && (
        <div
          role="status"
          className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800"
        >
          {notice}
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Table Container */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="divide-y divide-slate-100">
            {[1, 2, 3, 4].map((row) => (
              <div key={row} className="px-6 py-4 flex items-center gap-4 animate-pulse">
                <div className="w-16 h-11 rounded-md bg-slate-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-48 bg-slate-200 rounded" />
                  <div className="h-3 w-72 bg-slate-100 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : readings.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            No meter readings match your filter criteria.
          </div>
        ) : (
          <>
            {/* Desktop High-Density Table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4">Photo</th>
                    <th className="py-3 px-4">Date & Time</th>
                    <th className="py-3 px-4">Plant</th>
                    <th className="py-3 px-4">Motor / Status</th>
                    <th className="py-3 px-4 text-right">Water Flow</th>
                    <th className="py-3 px-4">Submitted By</th>
                    <th className="py-3 px-4">Review / Remarks</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {readings.map((item) => {
                    const flagged = hasAbnormalityRemark(item.review);
                    return (
                      <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4">
                          <MeterPhoto
                            src={item.imageUrl}
                            alt={`Meter evidence for ${item.plant}`}
                            className="w-16 h-11 object-cover rounded-md"
                            onClick={() => setPreviewReading(item)}
                            ariaLabel={`Inspect meter photo for reading #${item.id}`}
                          />
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-700 whitespace-nowrap">
                          {formatDateTime(item.recordedAt)}
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-900 whitespace-nowrap">
                          {item.plant}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-slate-900">{item.motorName}</div>
                          <div
                            className={
                              item.motorStatus === 'Running'
                                ? 'text-xs font-semibold text-emerald-700'
                                : 'text-xs font-semibold text-red-700'
                            }
                          >
                            {item.motorStatus}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                          {formatFlow(item.waterFlow)} m³
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-slate-900">
                            {item.submittedByName}
                          </div>
                          <div className="text-xs text-slate-500">{item.submittedByEmail}</div>
                        </td>
                        <td className="py-3 px-4 max-w-xs">
                          <p
                            className={`text-xs leading-relaxed ${
                              flagged ? 'text-amber-800 font-medium' : 'text-slate-600'
                            }`}
                          >
                            {item.review || 'Normal operation'}
                          </p>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          {confirmDeleteId === item.id ? (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleDelete(item.id)}
                                className="px-2.5 py-1.5 rounded-md bg-red-600 hover:bg-red-700 text-white text-xs font-medium cursor-pointer"
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-2.5 py-1.5 rounded-md border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-100 cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setEditingReading(item)}
                                aria-label={`Edit reading #${item.id}`}
                                className="min-h-[36px] px-2.5 py-1.5 rounded-md border border-slate-200 hover:border-sky-300 hover:bg-sky-50 text-xs font-medium text-slate-700 hover:text-sky-800 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                              >
                                <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>Edit</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(item.id)}
                                aria-label={`Delete reading #${item.id}`}
                                className="min-h-[36px] min-w-[36px] rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 inline-flex items-center justify-center transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile/Tablet Card Rows */}
            <ul className="lg:hidden divide-y divide-slate-200">
              {readings.map((item) => {
                const flagged = hasAbnormalityRemark(item.review);
                return (
                  <li key={item.id} className="p-4 space-y-3">
                    <div className="flex items-start gap-3.5">
                      <MeterPhoto
                        src={item.imageUrl}
                        alt={`Meter evidence for ${item.plant}`}
                        className="w-16 h-14 object-cover rounded-md"
                        onClick={() => setPreviewReading(item)}
                        ariaLabel={`Inspect meter photo for reading #${item.id}`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-mono tabular-nums text-base font-bold text-slate-900">
                            {formatFlow(item.waterFlow)} m³
                          </span>
                          <span className="text-xs font-medium text-slate-700 truncate">
                            {item.plant}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-600 mt-0.5">
                          <span className="font-medium text-slate-800">{item.motorName}</span>
                          <span className="text-slate-300" aria-hidden="true">·</span>
                          <span
                            className={
                              item.motorStatus === 'Running'
                                ? 'font-semibold text-emerald-700'
                                : 'font-semibold text-red-700'
                            }
                          >
                            {item.motorStatus}
                          </span>
                          <span className="text-slate-300" aria-hidden="true">·</span>
                          <span className="text-slate-500">{item.submittedByName}</span>
                        </div>
                        <div className="text-xs text-slate-500 tabular-nums mt-0.5">
                          {formatDateTime(item.recordedAt)}
                        </div>
                        <p
                          className={`text-xs mt-1.5 ${
                            flagged ? 'text-amber-800 font-medium' : 'text-slate-600'
                          }`}
                        >
                          {item.review || 'Normal operation'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setEditingReading(item)}
                        aria-label={`Edit reading #${item.id}`}
                        className="min-h-[40px] px-3.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Edit Record</span>
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      <EditReadingModal
        reading={editingReading}
        config={config}
        onClose={() => setEditingReading(null)}
        onSaved={handleSavedEdit}
      />

      <PhotoLightbox reading={previewReading} onClose={() => setPreviewReading(null)} />
    </div>
  );
}
