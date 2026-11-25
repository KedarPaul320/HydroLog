import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { MeterReading, PlantTrendSeries } from '../types';
import { buildPlantUsageTrend, formatFlow, formatShortDate } from '../utils/meterLogic';

type ChartStyle = 'trend' | 'stacked';

interface PlantUsageTrendChartProps {
  readings: readonly MeterReading[];
  plantNames: readonly string[];
  loading?: boolean;
  anchorDateKey?: string;
  hasActiveFilters?: boolean;
  onResetFilters?: () => void;
}

interface CustomTooltipPayloadItem {
  dataKey?: string | number;
  name?: string;
  value?: number;
  color?: string;
}

interface CustomTooltipProps {
  active?: boolean;
  label?: string;
  payload?: CustomTooltipPayloadItem[];
  seriesMap: Map<string, PlantTrendSeries>;
}

function PlantTrendTooltip({ active, label, payload, seriesMap }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const rows = payload
    .map((entry) => {
      const key = String(entry.dataKey ?? '');
      const meta = seriesMap.get(key);
      const value = Number(entry.value ?? 0);
      return {
        key,
        name: meta?.plant ?? entry.name ?? key,
        color: meta?.color ?? entry.color ?? '#0369a1',
        value,
      };
    })
    .sort((a, b) => b.value - a.value);

  const dayTotal = Math.round(rows.reduce((sum, r) => sum + r.value, 0) * 100) / 100;

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 shadow-lg text-xs min-w-[190px]">
      <div className="font-semibold text-slate-900 pb-1.5 mb-1.5 border-b border-slate-100 flex items-center justify-between gap-4">
        <span>{label}</span>
        <span className="font-mono tabular-nums text-slate-600">{formatFlow(dayTotal)} m³</span>
      </div>
      <ul className="space-y-1">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2 text-slate-700 min-w-0">
              <span
                className="w-2.5 h-2.5 rounded-xs shrink-0"
                style={{ backgroundColor: row.color }}
                aria-hidden="true"
              />
              <span className="truncate">{row.name}</span>
            </span>
            <span
              className={`font-mono tabular-nums whitespace-nowrap ${
                row.value > 0 ? 'font-semibold text-slate-900' : 'text-slate-400'
              }`}
            >
              {formatFlow(row.value)} m³
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatYAxisTick(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) {
    const k = value / 1_000;
    return Number.isInteger(k) ? `${k}k` : `${k.toFixed(1)}k`;
  }
  return String(value);
}

export function PlantUsageTrendChart({
  readings,
  plantNames,
  loading = false,
  anchorDateKey,
  hasActiveFilters = false,
  onResetFilters,
}: PlantUsageTrendChartProps) {
  const [chartStyle, setChartStyle] = useState<ChartStyle>('trend');
  const [hiddenPlants, setHiddenPlants] = useState<Record<string, boolean>>({});

  const trend = useMemo(
    () =>
      buildPlantUsageTrend(readings, plantNames, {
        days: 30,
        ...(anchorDateKey ? { endDateKey: anchorDateKey } : {}),
      }),
    [readings, plantNames, anchorDateKey]
  );

  const seriesMap = useMemo(
    () => new Map(trend.series.map((s) => [s.dataKey, s])),
    [trend.series]
  );

  const visibleSeries = useMemo(
    () => trend.series.filter((s) => !hiddenPlants[s.plant]),
    [trend.series, hiddenPlants]
  );

  const hasHiddenPlants = trend.series.some((s) => hiddenPlants[s.plant]);

  function togglePlant(plant: string) {
    setHiddenPlants((prev) => {
      const next = { ...prev, [plant]: !prev[plant] };
      const remainingVisible = trend.series.filter((s) => !next[s.plant]).length;
      if (remainingVisible === 0) {
        return {};
      }
      return next;
    });
  }

  const rangeLabel = `${formatShortDate(trend.startDate)} – ${formatShortDate(trend.endDate)}`;

  return (
    <section
      aria-label="30-day water usage trend by plant"
      className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6"
    >
      {/* Header & Chart Mode Switch */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            30-Day Water Usage Trends by Plant (m³)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
            {rangeLabel}
            <span className="mx-1.5 text-slate-300" aria-hidden="true">·</span>
            <span>{formatFlow(trend.totalFlow)} m³ logged across {trend.activeDays} active {trend.activeDays === 1 ? 'day' : 'days'}</span>
          </p>
        </div>

        <div
          role="group"
          aria-label="Chart visualization style"
          className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start shrink-0"
        >
          <button
            type="button"
            onClick={() => setChartStyle('trend')}
            aria-pressed={chartStyle === 'trend'}
            className={`min-h-[40px] sm:min-h-[34px] px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              chartStyle === 'trend'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Trend Lines
          </button>
          <button
            type="button"
            onClick={() => setChartStyle('stacked')}
            aria-pressed={chartStyle === 'stacked'}
            className={`min-h-[40px] sm:min-h-[34px] px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              chartStyle === 'stacked'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Stacked Bars
          </button>
        </div>
      </div>

      {/* Interactive Plant Series Legend */}
      {trend.series.length > 0 && (
        <div
          role="group"
          aria-label="Toggle plant series visibility"
          className="mt-4 pt-3.5 border-t border-slate-100 flex flex-wrap items-center gap-x-4 gap-y-1.5"
        >
          {trend.series.map((s) => {
            const hidden = Boolean(hiddenPlants[s.plant]);
            return (
              <button
                key={s.plant}
                type="button"
                onClick={() => togglePlant(s.plant)}
                aria-pressed={!hidden}
                className={`min-h-[40px] sm:min-h-[34px] inline-flex items-center gap-2 text-xs transition-opacity cursor-pointer whitespace-nowrap ${
                  hidden ? 'opacity-40 hover:opacity-70' : 'opacity-100 hover:opacity-80'
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-xs shrink-0"
                  style={{ backgroundColor: s.color }}
                  aria-hidden="true"
                />
                <span className="font-medium text-slate-800">{s.plant}</span>
                <span className="font-mono tabular-nums text-slate-500">
                  {formatFlow(s.totalFlow)} m³
                </span>
              </button>
            );
          })}
          {hasHiddenPlants && (
            <button
              type="button"
              onClick={() => setHiddenPlants({})}
              className="min-h-[34px] text-xs font-medium text-sky-700 hover:text-sky-800 hover:underline cursor-pointer whitespace-nowrap"
            >
              Show All Plants
            </button>
          )}
        </div>
      )}

      {/* Chart Canvas */}
      <div className="mt-4">
        {loading ? (
          <div className="h-[300px] w-full rounded-lg bg-slate-50 border border-slate-100 animate-pulse flex items-end gap-2 p-6">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="flex-1 bg-slate-200/80 rounded-t"
                style={{ height: `${25 + ((i * 19) % 60)}%` }}
              />
            ))}
          </div>
        ) : !trend.hasAnyData ? (
          <div className="h-[260px] flex flex-col items-center justify-center text-center px-4 rounded-lg border border-dashed border-slate-200 bg-slate-50/50">
            <p className="text-sm font-medium text-slate-700">
              No water usage readings recorded in this 30-day window
            </p>
            <p className="text-xs text-slate-500 mt-1 max-w-md">
              Readings logged between {rangeLabel} will appear here automatically grouped by plant.
            </p>
            {hasActiveFilters && onResetFilters && (
              <button
                type="button"
                onClick={onResetFilters}
                className="mt-3 min-h-[38px] px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 cursor-pointer"
              >
                Reset Active Filters
              </button>
            )}
          </div>
        ) : (
          <div className="h-[260px] sm:h-[310px] w-full" data-testid="plant-usage-trend-chart">
            <ResponsiveContainer width="100%" height="100%">
              {chartStyle === 'trend' ? (
                <AreaChart
                  data={trend.points}
                  margin={{ top: 10, right: 8, left: 0, bottom: 4 }}
                >
                  <defs>
                    {visibleSeries.map((s) => (
                      <linearGradient
                        key={s.dataKey}
                        id={`grad-${s.dataKey}`}
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop offset="5%" stopColor={s.color} stopOpacity={0.18} />
                        <stop offset="95%" stopColor={s.color} stopOpacity={0.01} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis
                    dataKey="label"
                    minTickGap={28}
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: '#cbd5e1' }}
                    dy={6}
                  />
                  <YAxis
                    tickFormatter={formatYAxisTick}
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={42}
                  />
                  <Tooltip
                    content={<PlantTrendTooltip seriesMap={seriesMap} />}
                    cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '3 3' }}
                  />
                  {visibleSeries.map((s) => (
                    <Area
                      key={s.dataKey}
                      type="monotone"
                      dataKey={s.dataKey}
                      name={s.plant}
                      stroke={s.color}
                      strokeWidth={2}
                      fill={`url(#grad-${s.dataKey})`}
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 2, stroke: '#ffffff', fill: s.color }}
                      isAnimationActive={false}
                    />
                  ))}
                </AreaChart>
              ) : (
                <BarChart
                  data={trend.points}
                  margin={{ top: 10, right: 8, left: 0, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis
                    dataKey="label"
                    minTickGap={28}
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: '#cbd5e1' }}
                    dy={6}
                  />
                  <YAxis
                    tickFormatter={formatYAxisTick}
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={42}
                  />
                  <Tooltip
                    content={<PlantTrendTooltip seriesMap={seriesMap} />}
                    cursor={{ fill: 'rgba(148, 163, 184, 0.12)' }}
                  />
                  {visibleSeries.map((s, idx) => (
                    <Bar
                      key={s.dataKey}
                      dataKey={s.dataKey}
                      name={s.plant}
                      stackId="plants"
                      fill={s.color}
                      radius={
                        idx === visibleSeries.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]
                      }
                      maxBarSize={24}
                      isAnimationActive={false}
                    />
                  ))}
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </section>
  );
}
