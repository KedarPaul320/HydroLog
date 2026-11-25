import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type {
  IntervalBarPoint12h,
  IntervalBarPoint24h,
  IntervalBarPoint4h,
  PlantExcelSheetData,
} from '../utils/excelExport';
import { buildIntervalBarChartData } from '../utils/excelExport';
import { formatFlow } from '../utils/meterLogic';

type IntervalViewMode = 'all' | '4h' | '12h' | '24h';

interface IntervalReadingsPanelProps {
  sheets: PlantExcelSheetData[];
  loading: boolean;
  filteredPlant?: string;
  hasActiveFilters: boolean;
  onResetFilters: () => void;
}

const COLOR_4H = '#0369a1'; // Sky-700 (HydroLog primary)
const COLOR_12H = '#16a34a'; // Emerald-600 (12H green)
const COLOR_24H = '#2563eb'; // Blue-600 (24H blue)

const DEFAULT_LIMITS = {
  max4hBars: 12,
  max12hBars: 8,
  max24hBars: 7,
};

function formatCompactNumber(value: unknown): string {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return '';
  return Number.isInteger(num)
    ? new Intl.NumberFormat('en-US').format(num)
    : formatFlow(num);
}

function formatYAxisTick(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) {
    const k = value / 1_000;
    return Number.isInteger(k) ? `${k}k` : `${k.toFixed(1)}k`;
  }
  return String(value);
}

interface Tooltip4hProps {
  active?: boolean;
  payload?: Array<{ payload?: IntervalBarPoint4h }>;
}

function Tooltip4h({ active, payload }: Tooltip4hProps) {
  const item = payload?.[0]?.payload;
  if (!active || !item) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 shadow-lg text-xs min-w-[200px]">
      <div className="font-semibold text-slate-900 pb-1.5 mb-1.5 border-b border-slate-100 flex items-center justify-between gap-4">
        <span className="font-mono tabular-nums">{item.dateText}</span>
        <span className="font-mono tabular-nums text-slate-600">{item.timeText}</span>
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-600">4H Water Flow</span>
          <span className="font-mono tabular-nums font-bold text-sky-800">
            {formatCompactNumber(item.flow)} m³
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-600">Meter Reading</span>
          <span className="font-mono tabular-nums text-slate-900">
            {formatCompactNumber(item.meterReading)} m³
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-600">Uploaded By</span>
          <span className="font-medium text-slate-800">{item.uploadedBy}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-600">Motor</span>
          <span className="text-slate-700">
            {item.motorName} · {item.motorStatus}
          </span>
        </div>
      </div>
    </div>
  );
}

interface Tooltip12hProps {
  active?: boolean;
  payload?: Array<{ payload?: IntervalBarPoint12h }>;
}

function Tooltip12h({ active, payload }: Tooltip12hProps) {
  const item = payload?.[0]?.payload;
  if (!active || !item) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 shadow-lg text-xs min-w-[190px]">
      <div className="font-semibold text-slate-900 pb-1.5 mb-1.5 border-b border-slate-100">
        {item.dateText} · {item.shiftLabel}
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-600">12H Shift Flow</span>
          <span className="font-mono tabular-nums font-bold text-emerald-700">
            {formatCompactNumber(item.flow)} m³
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-600">Readings in Shift</span>
          <span className="font-mono tabular-nums text-slate-800">{item.readingCount}</span>
        </div>
      </div>
    </div>
  );
}

interface Tooltip24hProps {
  active?: boolean;
  payload?: Array<{ payload?: IntervalBarPoint24h }>;
}

function Tooltip24h({ active, payload }: Tooltip24hProps) {
  const item = payload?.[0]?.payload;
  if (!active || !item) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 shadow-lg text-xs min-w-[190px]">
      <div className="font-semibold text-slate-900 pb-1.5 mb-1.5 border-b border-slate-100 font-mono tabular-nums">
        {item.dateText} (24H Cycle)
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-600">24H Water Flow</span>
          <span className="font-mono tabular-nums font-bold text-blue-700">
            {formatCompactNumber(item.flow)} m³
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-600">Readings Logged</span>
          <span className="font-mono tabular-nums text-slate-800">{item.readingCount}</span>
        </div>
      </div>
    </div>
  );
}

export function IntervalReadingsPanel({
  sheets,
  loading,
  filteredPlant,
  hasActiveFilters,
  onResetFilters,
}: IntervalReadingsPanelProps) {
  const populatedSheets = useMemo(
    () => sheets.filter((s) => s.rows.length > 0),
    [sheets]
  );
  const [selectedPlantName, setSelectedPlantName] = useState<string>('');
  const [viewMode, setViewMode] = useState<IntervalViewMode>('all');
  const [showAllPoints, setShowAllPoints] = useState(false);

  // Keep active plant tab valid when filters or data update
  useEffect(() => {
    if (populatedSheets.length === 0) {
      setSelectedPlantName('');
      return;
    }
    if (
      filteredPlant &&
      filteredPlant !== 'all' &&
      populatedSheets.some((s) => s.plantName === filteredPlant)
    ) {
      setSelectedPlantName(filteredPlant);
      return;
    }
    if (!populatedSheets.some((s) => s.plantName === selectedPlantName)) {
      setSelectedPlantName(populatedSheets[0].plantName);
    }
  }, [populatedSheets, filteredPlant, selectedPlantName]);

  // Collapse back to recent window when switching plants
  useEffect(() => {
    setShowAllPoints(false);
  }, [selectedPlantName]);

  const activeSheet =
    populatedSheets.find((s) => s.plantName === selectedPlantName) ??
    populatedSheets[0] ??
    null;

  const chartData = useMemo(() => {
    if (!activeSheet) return null;
    return buildIntervalBarChartData(
      activeSheet,
      showAllPoints ? {} : DEFAULT_LIMITS
    );
  }, [activeSheet, showAllPoints]);

  const hasHiddenPoints = Boolean(
    chartData &&
      (chartData.total4hCount > DEFAULT_LIMITS.max4hBars ||
        chartData.total12hCount > DEFAULT_LIMITS.max12hBars ||
        chartData.total24hCount > DEFAULT_LIMITS.max24hBars)
  );

  const show4h = viewMode === 'all' || viewMode === '4h';
  const show12h = viewMode === 'all' || viewMode === '12h';
  const show24h = viewMode === 'all' || viewMode === '24h';

  const chartHeight4h = viewMode === '4h' ? 'h-[310px]' : 'h-[235px]';
  const chartHeight12h = viewMode === '12h' ? 'h-[310px]' : 'h-[225px]';
  const chartHeight24h = viewMode === '24h' ? 'h-[310px]' : 'h-[225px]';

  return (
    <section
      aria-label="4H, 12H and 24H water flow bar graphs"
      className="bg-white border border-slate-200 rounded-xl overflow-hidden"
    >
      {/* Header + Interval Mode Switcher + Plant Switcher */}
      <div className="px-5 py-4 border-b border-slate-200 flex flex-col gap-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              4H, 12H &amp; 24H Water Flow Bar Graph
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Interval flow volume (m³) aligned to ~9:00 AM and ~9:00 PM shift windows
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Interval Focus Selector */}
            <div
              role="group"
              aria-label="Select interval bar graph view"
              className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg"
            >
              {(
                [
                  { id: 'all', label: 'All (4H · 12H · 24H)' },
                  { id: '4h', label: '4H' },
                  { id: '12h', label: '12H' },
                  { id: '24h', label: '24H' },
                ] as const
              ).map((option) => {
                const active = viewMode === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setViewMode(option.id)}
                    className={`min-h-[34px] px-2.5 sm:px-3 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            {/* Plant Switcher */}
            {populatedSheets.length > 1 && (
              <div
                role="tablist"
                aria-label="Select plant for interval bar graph"
                className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg"
              >
                {populatedSheets.map((sheet) => {
                  const active = activeSheet?.plantName === sheet.plantName;
                  return (
                    <button
                      key={sheet.plantName}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setSelectedPlantName(sheet.plantName)}
                      className={`min-h-[34px] px-3 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        active
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {sheet.plantName}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="p-6 space-y-4 animate-pulse">
          <div className="h-[220px] rounded-lg bg-slate-50 border border-slate-100 flex items-end gap-3 p-6">
            {[45, 72, 60, 35, 80, 52, 68].map((h, i) => (
              <div
                key={i}
                className="flex-1 bg-slate-200/80 rounded-t"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </div>
      ) : !activeSheet || !chartData ? (
        <div className="p-10 text-center space-y-3">
          <p className="text-sm text-slate-500">
            No readings available to plot 4H, 12H, and 24H bar graphs.
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={onResetFilters}
              className="min-h-[38px] px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 cursor-pointer"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : !chartData.hasChartData ? (
        <div className="p-10 text-center space-y-2">
          <p className="text-sm font-medium text-slate-800">
            {chartData.plantName} needs at least 2 readings to plot 4H, 12H, and 24H flow bars
          </p>
          {chartData.baselineReading && (
            <p className="text-xs text-slate-500 font-mono tabular-nums">
              Baseline reading logged: {formatCompactNumber(chartData.baselineReading.waterFlow)} m³ on{' '}
              {chartData.baselineReading.dateText} at {chartData.baselineReading.timeText}
            </p>
          )}
        </div>
      ) : (
        <>
          {/* Active Plant Strip */}
          <div className="px-5 py-2.5 bg-slate-50/90 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-wide text-slate-900">
                {chartData.plantName}
              </span>
              <span className="text-slate-300" aria-hidden="true">·</span>
              <span className="text-slate-600 tabular-nums">
                {chartData.total4hCount} 4H {chartData.total4hCount === 1 ? 'interval' : 'intervals'}
              </span>
              <span className="text-slate-300" aria-hidden="true">·</span>
              <span className="text-slate-600 tabular-nums">
                {chartData.total12hCount} 12H {chartData.total12hCount === 1 ? 'shift' : 'shifts'}
              </span>
              <span className="text-slate-300" aria-hidden="true">·</span>
              <span className="text-slate-600 tabular-nums">
                {chartData.total24hCount} 24H {chartData.total24hCount === 1 ? 'day' : 'days'}
              </span>
            </div>

            <div className="flex items-center gap-4 text-slate-600">
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <span className="w-2.5 h-2.5 rounded-xs" style={{ backgroundColor: COLOR_4H }} aria-hidden="true" />
                4H Flow
              </span>
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <span className="w-2.5 h-2.5 rounded-xs" style={{ backgroundColor: COLOR_12H }} aria-hidden="true" />
                12H Shift
              </span>
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <span className="w-2.5 h-2.5 rounded-xs" style={{ backgroundColor: COLOR_24H }} aria-hidden="true" />
                24H Day
              </span>
            </div>
          </div>

          {/* 4-Hour Bar Graph */}
          {show4h && (
            <div
              className={`p-5 ${show12h || show24h ? 'border-b border-slate-200' : ''}`}
              data-testid="interval-bar-chart-4h"
            >
              <div className="flex items-baseline justify-between gap-2 mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    4-Hour Interval Flow (m³)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Water flow delta between consecutive meter readings
                  </p>
                </div>
                <span className="text-xs font-mono tabular-nums text-slate-500 whitespace-nowrap">
                  Showing {chartData.bars4h.length} of {chartData.total4hCount}
                </span>
              </div>

              <div className={`${chartHeight4h} w-full`}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData.bars4h}
                    margin={{ top: 22, right: 12, left: 0, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis
                      dataKey="axisLabel"
                      tick={{ fill: '#475569', fontSize: 11 }}
                      tickLine={false}
                      axisLine={{ stroke: '#cbd5e1' }}
                      interval="preserveStartEnd"
                      minTickGap={14}
                      dy={6}
                    />
                    <YAxis
                      tickFormatter={formatYAxisTick}
                      tick={{ fill: '#64748b', fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      width={44}
                    />
                    <Tooltip
                      content={<Tooltip4h />}
                      cursor={{ fill: 'rgba(148, 163, 184, 0.12)' }}
                    />
                    <Bar
                      dataKey="flow"
                      name="4H Water Flow (m³)"
                      fill={COLOR_4H}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={44}
                      isAnimationActive={false}
                    >
                      {chartData.bars4h.length <= 16 && (
                        <LabelList
                          dataKey="flow"
                          position="top"
                          formatter={formatCompactNumber}
                          style={{
                            fill: '#0f172a',
                            fontSize: 11,
                            fontWeight: 600,
                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                          }}
                        />
                      )}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* 12-Hour & 24-Hour Bar Graphs */}
          {(show12h || show24h) && (
            <div
              className={`grid grid-cols-1 ${
                show12h && show24h ? 'lg:grid-cols-2 lg:divide-x lg:divide-slate-200' : ''
              }`}
            >
              {/* 12-Hour Shift Bar Graph */}
              {show12h && (
                <div
                  className={`p-5 ${show24h ? 'border-b lg:border-b-0 border-slate-200' : ''}`}
                  data-testid="interval-bar-chart-12h"
                >
                  <div className="flex items-baseline justify-between gap-2 mb-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">
                        12-Hour Shift Flow (m³)
                      </h3>
                      <p className="text-xs text-slate-500">
                        Morning (9 PM – 9 AM) &amp; Evening (9 AM – 9 PM) shift totals
                      </p>
                    </div>
                    <span className="text-xs font-mono tabular-nums text-slate-500 whitespace-nowrap">
                      {chartData.bars12h.length} {chartData.bars12h.length === 1 ? 'shift' : 'shifts'}
                    </span>
                  </div>

                  <div className={`${chartHeight12h} w-full`}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={chartData.bars12h}
                        margin={{ top: 22, right: 12, left: 0, bottom: 4 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis
                          dataKey="axisLabel"
                          tick={{ fill: '#475569', fontSize: 11 }}
                          tickLine={false}
                          axisLine={{ stroke: '#cbd5e1' }}
                          interval="preserveStartEnd"
                          minTickGap={12}
                          dy={6}
                        />
                        <YAxis
                          tickFormatter={formatYAxisTick}
                          tick={{ fill: '#64748b', fontSize: 11 }}
                          tickLine={false}
                          axisLine={false}
                          width={44}
                        />
                        <Tooltip
                          content={<Tooltip12h />}
                          cursor={{ fill: 'rgba(22, 163, 74, 0.08)' }}
                        />
                        <Bar
                          dataKey="flow"
                          name="12H Shift Flow (m³)"
                          fill={COLOR_12H}
                          radius={[4, 4, 0, 0]}
                          maxBarSize={56}
                          isAnimationActive={false}
                        >
                          {chartData.bars12h.length <= 12 && (
                            <LabelList
                              dataKey="flow"
                              position="top"
                              formatter={formatCompactNumber}
                              style={{
                                fill: '#14532d',
                                fontSize: 11,
                                fontWeight: 600,
                                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                              }}
                            />
                          )}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* 24-Hour Operational Day Bar Graph */}
              {show24h && (
                <div className="p-5" data-testid="interval-bar-chart-24h">
                  <div className="flex items-baseline justify-between gap-2 mb-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">
                        24-Hour Day Flow (m³)
                      </h3>
                      <p className="text-xs text-slate-500">
                        Full operational day cycle totals (~9:00 PM to ~9:00 PM)
                      </p>
                    </div>
                    <span className="text-xs font-mono tabular-nums text-slate-500 whitespace-nowrap">
                      {chartData.bars24h.length} {chartData.bars24h.length === 1 ? 'day' : 'days'}
                    </span>
                  </div>

                  <div className={`${chartHeight24h} w-full`}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={chartData.bars24h}
                        margin={{ top: 22, right: 12, left: 0, bottom: 4 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis
                          dataKey="axisLabel"
                          tick={{ fill: '#475569', fontSize: 11 }}
                          tickLine={false}
                          axisLine={{ stroke: '#cbd5e1' }}
                          interval="preserveStartEnd"
                          minTickGap={12}
                          dy={6}
                        />
                        <YAxis
                          tickFormatter={formatYAxisTick}
                          tick={{ fill: '#64748b', fontSize: 11 }}
                          tickLine={false}
                          axisLine={false}
                          width={44}
                        />
                        <Tooltip
                          content={<Tooltip24h />}
                          cursor={{ fill: 'rgba(37, 99, 235, 0.08)' }}
                        />
                        <Bar
                          dataKey="flow"
                          name="24H Day Flow (m³)"
                          fill={COLOR_24H}
                          radius={[4, 4, 0, 0]}
                          maxBarSize={64}
                          isAnimationActive={false}
                        >
                          {chartData.bars24h.length <= 12 && (
                            <LabelList
                              dataKey="flow"
                              position="top"
                              formatter={formatCompactNumber}
                              style={{
                                fill: '#1e3a8a',
                                fontSize: 11,
                                fontWeight: 600,
                                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                              }}
                            />
                          )}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Expand/Collapse Footer when older data points exist */}
          {hasHiddenPoints && (
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-center">
              <button
                type="button"
                onClick={() => setShowAllPoints((prev) => !prev)}
                className="min-h-[36px] px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 inline-flex items-center gap-1.5 cursor-pointer"
              >
                {showAllPoints ? (
                  <>
                    <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Show Latest Window</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Show All History ({chartData.total4hCount} Intervals)</span>
                  </>
                )}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
