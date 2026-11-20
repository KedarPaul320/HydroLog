import { useEffect } from 'react';
import { X } from 'lucide-react';
import type { MeterReading } from '../types';
import { formatDateTime, formatFlow, hasAbnormalityRemark } from '../utils/meterLogic';
import { MeterPhoto } from './MeterPhoto';

interface PhotoLightboxProps {
  reading: MeterReading | null;
  onClose: () => void;
}

export function PhotoLightbox({ reading, onClose }: PhotoLightboxProps) {
  useEffect(() => {
    if (!reading) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [reading, onClose]);

  if (!reading) return null;

  const isFlagged = hasAbnormalityRemark(reading.review);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Meter photo evidence for reading #${reading.id}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Meter Evidence #{reading.id}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
              {reading.plant} · {formatDateTime(reading.recordedAt)} · {reading.submittedByName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close photo preview"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-slate-950 flex items-center justify-center max-h-[60vh] overflow-hidden">
          <MeterPhoto
            src={reading.imageUrl}
            alt={`Water meter reading photo for ${reading.plant}`}
            className="w-full max-h-[60vh] object-contain border-0 rounded-none"
          />
        </div>

        <div className="p-5 grid grid-cols-1 sm:grid-cols-4 gap-4 border-t border-slate-200">
          <div>
            <div className="text-xs text-slate-500">Water Flow</div>
            <div className="text-lg font-semibold text-slate-900 font-mono tabular-nums mt-0.5">
              {formatFlow(reading.waterFlow)} m³
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Plant & Operator</div>
            <div className="text-sm font-medium text-slate-900 mt-0.5">
              {reading.plant} · {reading.submittedByName}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Motor & Status</div>
            <div className="text-sm font-medium text-slate-900 mt-0.5">
              {reading.motorName} ·{' '}
              <span
                className={
                  reading.motorStatus === 'Running'
                    ? 'text-emerald-700 font-semibold'
                    : 'text-red-700 font-semibold'
                }
              >
                {reading.motorStatus}
              </span>
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Review / Remarks</div>
            <div
              className={`text-sm mt-0.5 ${
                isFlagged ? 'text-amber-700 font-medium' : 'text-slate-700'
              }`}
            >
              {reading.review || 'Normal operation'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
