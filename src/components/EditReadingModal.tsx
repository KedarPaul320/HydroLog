import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { CirclePlay, CircleStop, Upload, X } from 'lucide-react';
import { api } from '../api/client';
import {
  MOTOR_STATUSES,
  type AppConfig,
  type MeterReading,
  type MotorStatus,
} from '../types';
import {
  combineDateAndTime,
  splitIsoToLocalDateAndTime,
  validateReadingInput,
} from '../utils/meterLogic';
import { MeterPhoto } from './MeterPhoto';

interface EditReadingModalProps {
  reading: MeterReading | null;
  config: AppConfig;
  onClose: () => void;
  onSaved: (updated: MeterReading) => void;
}

export function EditReadingModal({ reading, config, onClose, onSaved }: EditReadingModalProps) {
  const plantNames = config.plants.map((p) => p.name);
  const motorNames = config.motors.map((m) => m.name);

  const [waterFlow, setWaterFlow] = useState('');
  const [plant, setPlant] = useState<string>(plantNames[0] || 'Plant A');
  const [motorName, setMotorName] = useState<string>(motorNames[0] || 'Motor 1');
  const [motorStatus, setMotorStatus] = useState<MotorStatus>('Running');
  const [readingDate, setReadingDate] = useState('');
  const [readingTime, setReadingTime] = useState('');
  const [review, setReview] = useState('');
  const [newImageFile, setNewImageFile] = useState<File | null>(null);
  const [newPreviewUrl, setNewPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!reading) return;
    setWaterFlow(String(reading.waterFlow));
    setPlant(reading.plant);
    setMotorName(reading.motorName);
    setMotorStatus(reading.motorStatus);
    const { date, time } = splitIsoToLocalDateAndTime(reading.recordedAt);
    setReadingDate(date);
    setReadingTime(time);
    setReview(reading.review);
    setNewImageFile(null);
    setNewPreviewUrl(null);
    setError(null);
  }, [reading]);

  useEffect(() => {
    return () => {
      if (newPreviewUrl) URL.revokeObjectURL(newPreviewUrl);
    };
  }, [newPreviewUrl]);

  if (!reading) return null;

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (newPreviewUrl) URL.revokeObjectURL(newPreviewUrl);
    setNewImageFile(file);
    setNewPreviewUrl(URL.createObjectURL(file));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!reading) return;
    setError(null);

    const combinedRecordedAt = combineDateAndTime(readingDate, readingTime);
    const validation = validateReadingInput(
      {
        waterFlow,
        plant,
        motorName,
        motorStatus,
        recordedAt: combinedRecordedAt,
        review,
        hasImage: true,
      },
      false,
      plantNames,
      motorNames
    );

    if (!validation.valid || validation.parsedFlow === null) {
      const firstErr = Object.values(validation.errors)[0] || 'Check form values.';
      setError(firstErr);
      return;
    }

    setSaving(true);
    try {
      const updated = await api.updateReading(reading.id, {
        waterFlow: validation.parsedFlow,
        plant,
        motorName,
        motorStatus,
        recordedAt: new Date(combinedRecordedAt).toISOString(),
        review: review.trim(),
        imageFile: newImageFile,
      });
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save changes.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Edit reading #${reading.id}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Edit Reading #{reading.id}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Originally submitted by {reading.submittedByName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close edit dialog"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto p-6 space-y-4">
          {error && (
            <div role="alert" className="rounded-lg bg-red-50 border border-red-200 px-3.5 py-2.5 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex items-center gap-4">
            <MeterPhoto
              src={newPreviewUrl || reading.imageUrl}
              alt={`Current meter evidence for reading #${reading.id}`}
              className="w-24 h-18 object-cover rounded-lg"
            />
            <div>
              <div className="text-xs font-medium text-slate-700">Meter Photo</div>
              <label
                htmlFor="edit-meter-photo"
                className="mt-1.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Replace Photo</span>
              </label>
              <input
                id="edit-meter-photo"
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="sr-only"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="edit-water-flow"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Water Flow (m³)
              </label>
              <input
                id="edit-water-flow"
                type="number"
                step="0.01"
                min="0.01"
                required
                value={waterFlow}
                onChange={(e) => setWaterFlow(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 font-mono tabular-nums text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-700/20 focus:border-sky-700"
              />
            </div>

            <div>
              <label
                htmlFor="edit-plant"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Plant
              </label>
              <select
                id="edit-plant"
                value={plant}
                onChange={(e) => setPlant(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-700/20 focus:border-sky-700"
              >
                {plantNames.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="edit-motor"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Motor No.
              </label>
              <select
                id="edit-motor"
                value={motorName}
                onChange={(e) => setMotorName(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-700/20 focus:border-sky-700"
              >
                {motorNames.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span className="block text-sm font-medium text-slate-700 mb-1">
                Motor Status
              </span>
              <div
                role="radiogroup"
                aria-label="Edit Motor Status"
                className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg h-10"
              >
                {MOTOR_STATUSES.map((status) => {
                  const active = motorStatus === status;
                  const isRunning = status === 'Running';
                  return (
                    <button
                      key={status}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setMotorStatus(status)}
                      className={`rounded-md text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer transition-colors ${
                        active
                          ? isRunning
                            ? 'bg-white text-emerald-700 shadow-sm'
                            : 'bg-white text-red-700 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {isRunning ? (
                        <CirclePlay className="w-3.5 h-3.5" aria-hidden="true" />
                      ) : (
                        <CircleStop className="w-3.5 h-3.5" aria-hidden="true" />
                      )}
                      <span>{status}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="edit-reading-date"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Reading Date
              </label>
              <input
                id="edit-reading-date"
                type="date"
                required
                value={readingDate}
                onChange={(e) => setReadingDate(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 font-mono tabular-nums text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-700/20 focus:border-sky-700"
              />
            </div>

            <div>
              <label
                htmlFor="edit-reading-time"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Reading Time
              </label>
              <input
                id="edit-reading-time"
                type="time"
                required
                value={readingTime}
                onChange={(e) => setReadingTime(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 font-mono tabular-nums text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-700/20 focus:border-sky-700"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="edit-review"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Review / Remarks
            </label>
            <textarea
              id="edit-review"
              rows={3}
              maxLength={500}
              value={review}
              onChange={(e) => setReview(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-700/20 focus:border-sky-700"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-[40px] px-5 py-2 rounded-lg bg-sky-700 hover:bg-sky-800 disabled:opacity-60 text-white text-sm font-semibold cursor-pointer"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
