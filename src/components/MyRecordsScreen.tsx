import { useEffect, useState } from 'react';
import { Camera, ClipboardList, Search } from 'lucide-react';
import { api } from '../api/client';
import type { AppConfig, AppRoute, MeterReading } from '../types';
import { formatDateTime, formatFlow, hasAbnormalityRemark } from '../utils/meterLogic';
import { MeterPhoto } from './MeterPhoto';
import { PhotoLightbox } from './PhotoLightbox';

interface MyRecordsScreenProps {
  config: AppConfig;
  onNavigate: (route: AppRoute) => void;
  refreshKey: number;
}

export function MyRecordsScreen({ config, onNavigate, refreshKey }: MyRecordsScreenProps) {
  const [readings, setReadings] = useState<MeterReading[]>([]);
  const [plantFilter, setPlantFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewReading, setPreviewReading] = useState<MeterReading | null>(null);

  const plantNames = config.plants.map((p) => p.name);

  useEffect(() => {
    if (plantFilter !== 'all' && !plantNames.includes(plantFilter)) {
      setPlantFilter('all');
    }
  }, [plantNames, plantFilter]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .getMyReadings({ plant: plantFilter, search })
      .then((items) => {
        if (active) {
          setReadings(items);
          setError(null);
        }
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Unable to load records.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [plantFilter, search, refreshKey]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Records</h1>
          <p className="text-sm text-slate-600 mt-1">
            Water meter readings submitted under your account ({readings.length}{' '}
            {readings.length === 1 ? 'record' : 'records'}).
          </p>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('submit-reading')}
          className="min-h-[44px] px-4 py-2 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Camera className="w-4 h-4" aria-hidden="true" />
          <span>Submit Reading</span>
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div
          role="group"
          aria-label="Filter by plant"
          className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto"
        >
          {['all', ...plantNames].map((option) => {
            const active = plantFilter === option;
            return (
              <button
                key={option}
                type="button"
                onClick={() => setPlantFilter(option)}
                className={`min-h-[38px] px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {option === 'all' ? 'All Plants' : option}
              </button>
            );
          })}
        </div>

        <div className="relative w-full md:w-72">
          <Search
            className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            aria-label="Search my records"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search plant, motor, remarks..."
            className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-700/20 focus:border-sky-700"
          />
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Records List / Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="divide-y divide-slate-100">
            {[1, 2, 3].map((row) => (
              <div key={row} className="px-6 py-4 flex items-center gap-4 animate-pulse">
                <div className="w-16 h-12 rounded-md bg-slate-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-40 bg-slate-200 rounded" />
                  <div className="h-3 w-64 bg-slate-100 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : readings.length === 0 ? (
          <div className="p-12 text-center">
            <ClipboardList className="w-8 h-8 text-slate-300 mx-auto" aria-hidden="true" />
            <h2 className="text-base font-semibold text-slate-900 mt-3">
              {plantFilter !== 'all' || search ? 'No matching readings found' : 'No readings submitted yet'}
            </h2>
            <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
              {plantFilter !== 'all' || search
                ? 'Try clearing your plant filter or search query.'
                : 'Submit your first meter reading with photo evidence to populate your log.'}
            </p>
            {plantFilter === 'all' && !search && (
              <button
                type="button"
                onClick={() => onNavigate('submit-reading')}
                className="mt-4 min-h-[44px] px-4 py-2 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-sm font-medium transition-colors cursor-pointer"
              >
                Submit First Reading
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4">Photo</th>
                    <th className="py-3 px-4">Date & Time</th>
                    <th className="py-3 px-4">Plant</th>
                    <th className="py-3 px-4">Motor / Status</th>
                    <th className="py-3 px-4 text-right">Water Flow</th>
                    <th className="py-3 px-4">Review / Remarks</th>
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
                        <td className="py-3 px-4 max-w-md">
                          <span
                            className={
                              flagged ? 'text-amber-800 font-medium' : 'text-slate-600'
                            }
                          >
                            {item.review || 'Normal operation'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile List */}
            <ul className="md:hidden divide-y divide-slate-200">
              {readings.map((item) => {
                const flagged = hasAbnormalityRemark(item.review);
                return (
                  <li key={item.id} className="p-4 flex items-start gap-3.5">
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
                        <span className="text-slate-500 tabular-nums">
                          {formatDateTime(item.recordedAt)}
                        </span>
                      </div>
                      <p
                        className={`text-xs mt-1.5 ${
                          flagged ? 'text-amber-800 font-medium' : 'text-slate-600'
                        }`}
                      >
                        {item.review || 'Normal operation'}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      <PhotoLightbox reading={previewReading} onClose={() => setPreviewReading(null)} />
    </div>
  );
}
