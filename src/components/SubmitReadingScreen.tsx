import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  Camera,
  CheckCircle2,
  CirclePlay,
  CircleStop,
  Clock,
  RefreshCw,
  Upload,
  X,
} from 'lucide-react';
import { api } from '../api/client';
import {
  MOTOR_STATUSES,
  type AppConfig,
  type MeterReading,
  type MotorStatus,
} from '../types';
import {
  combineDateAndTime,
  toLocalDateInputValue,
  toLocalTimeInputValue,
  validateReadingInput,
} from '../utils/meterLogic';

interface SubmitReadingScreenProps {
  config: AppConfig;
  onSubmitted: (reading: MeterReading) => void;
}

export function SubmitReadingScreen({ config, onSubmitted }: SubmitReadingScreenProps) {
  const plantNames = config.plants.map((p) => p.name);
  const motorNames = config.motors.map((m) => m.name);

  const [waterFlow, setWaterFlow] = useState('');
  const [plant, setPlant] = useState<string>(() => plantNames[0] || 'Plant A');
  const [motorName, setMotorName] = useState<string>(() => motorNames[0] || 'Motor 1');
  const [motorStatus, setMotorStatus] = useState<MotorStatus>('Running');

  const [timeMode, setTimeMode] = useState<'auto' | 'manual'>('auto');
  const [readingDate, setReadingDate] = useState(() => toLocalDateInputValue());
  const [readingTime, setReadingTime] = useState(() => toLocalTimeInputValue());

  const [review, setReview] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  // Sync selected plant & motor if admin renamed them
  useEffect(() => {
    if (plantNames.length > 0 && !plantNames.includes(plant)) {
      setPlant(plantNames[0]);
    }
  }, [plantNames, plant]);

  useEffect(() => {
    if (motorNames.length > 0 && !motorNames.includes(motorName)) {
      setMotorName(motorNames[0]);
    }
  }, [motorNames, motorName]);

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }

  useEffect(() => {
    return () => {
      stopCamera();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function resetToCurrentDateTime() {
    const now = new Date();
    setReadingDate(toLocalDateInputValue(now));
    setReadingTime(toLocalTimeInputValue(now));
    setTimeMode('auto');
  }

  async function startCamera() {
    setCameraError(null);
    const androidBridge = (
      window as Window & {
        HydroLogAndroid?: {
          hasCameraPermission?: () => boolean;
          openAppSettings?: () => void;
        };
      }
    ).HydroLogAndroid;
    const isAndroidApp =
      Boolean(androidBridge) ||
      (typeof navigator !== 'undefined' && /HydroLogAndroid/i.test(navigator.userAgent));

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (cameraInputRef.current) {
        cameraInputRef.current.click();
        return;
      }
      setCameraError('Live camera preview is unavailable on this browser. Upload a meter photo below.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      });
    } catch {
      const nativePermissionKnown = typeof androidBridge?.hasCameraPermission === 'function';
      const nativePermissionGranted = nativePermissionKnown
        ? Boolean(androidBridge?.hasCameraPermission?.())
        : true;

      if (isAndroidApp && nativePermissionGranted && cameraInputRef.current) {
        cameraInputRef.current.click();
        return;
      }
      setCameraError(
        'Camera permission was denied. Tap Open Camera to allow camera access, or tap Choose Photo File.'
      );
    }
  }

  function captureFromCamera() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `meter-capture-${Date.now()}.jpg`, {
          type: 'image/jpeg',
        });
        applySelectedFile(file);
        stopCamera();
      },
      'image/jpeg',
      0.88
    );
  }

  function applySelectedFile(file: File) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const nextUrl = URL.createObjectURL(file);
    setImageFile(file);
    setPreviewUrl(nextUrl);
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.image;
      return next;
    });
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setFieldErrors((prev) => ({
        ...prev,
        image: 'Select a valid image file (JPEG, PNG, or WebP).',
      }));
      return;
    }
    applySelectedFile(file);
  }

  function clearPhoto() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setImageFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    const effectiveDate = timeMode === 'auto' ? toLocalDateInputValue() : readingDate;
    const effectiveTime = timeMode === 'auto' ? toLocalTimeInputValue() : readingTime;
    const combinedRecordedAt = combineDateAndTime(effectiveDate, effectiveTime);

    const validation = validateReadingInput(
      {
        waterFlow,
        plant,
        motorName,
        motorStatus,
        recordedAt: combinedRecordedAt,
        review,
        hasImage: Boolean(imageFile),
      },
      true,
      plantNames,
      motorNames
    );

    if (!validation.valid || validation.parsedFlow === null || !imageFile) {
      setFieldErrors(validation.errors);
      return;
    }

    setFieldErrors({});
    setSubmitting(true);

    try {
      const created = await api.createReading({
        imageFile,
        waterFlow: validation.parsedFlow,
        plant,
        motorName,
        motorStatus,
        recordedAt: new Date(combinedRecordedAt).toISOString(),
        review: review.trim(),
      });
      onSubmitted(created);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit reading.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Submit Water Meter Reading</h1>
        <p className="text-sm text-slate-600 mt-1">
          Capture meter photo evidence, choose date & time, select plant, motor number, and running status, and record today&apos;s cubic meter flow.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        noValidate
        className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-200"
      >
        {submitError && (
          <div role="alert" className="p-4 bg-red-50 text-sm text-red-700">
            {submitError}
          </div>
        )}

        {/* Section 1: Meter Photo Evidence */}
        <section className="p-6">
          <div className="flex items-center justify-between gap-4 mb-3">
            <div>
              <label htmlFor="meter-photo-input" className="text-sm font-semibold text-slate-900">
                1. Meter Photo Evidence
              </label>
              <p className="text-xs text-slate-500 mt-0.5">
                Required. Use the phone camera or upload an existing photo of the meter register.
              </p>
            </div>
            {previewUrl && (
              <button
                type="button"
                onClick={clearPhoto}
                className="min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-100 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Remove Photo</span>
              </button>
            )}
          </div>

          {cameraActive ? (
            <div className="rounded-lg overflow-hidden border border-slate-200 bg-slate-950">
              <video
                ref={videoRef}
                playsInline
                muted
                className="w-full max-h-80 object-cover"
              />
              <div className="p-3 bg-slate-900 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={captureFromCamera}
                  className="min-h-[44px] px-5 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold flex items-center gap-2 cursor-pointer"
                >
                  <Camera className="w-4 h-4" aria-hidden="true" />
                  <span>Capture Photo</span>
                </button>
                <button
                  type="button"
                  onClick={stopCamera}
                  className="min-h-[44px] px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : previewUrl ? (
            <div className="rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
              <img
                src={previewUrl}
                alt="Captured water meter preview"
                className="w-full max-h-72 object-contain bg-slate-950"
              />
              <div className="px-4 py-2.5 bg-white border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
                <span className="truncate">{imageFile?.name}</span>
                <span className="text-emerald-700 font-medium flex items-center gap-1 shrink-0">
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                  Ready to upload
                </span>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={startCamera}
                className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Camera className="w-4 h-4" aria-hidden="true" />
                <span>Open Camera</span>
              </button>

              <label
                htmlFor="meter-photo-input"
                className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-sm font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Upload className="w-4 h-4" aria-hidden="true" />
                <span>Choose Photo File</span>
              </label>
            </div>
          )}

          <input
            ref={fileInputRef}
            id="meter-photo-input"
            name="image"
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="sr-only"
          />

          <input
            ref={cameraInputRef}
            id="meter-camera-input"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
            className="sr-only"
          />

          {cameraError && (
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <p className="text-xs text-amber-700">{cameraError}</p>
              {typeof window !== 'undefined' &&
                typeof (
                  window as Window & { HydroLogAndroid?: { openAppSettings?: () => void } }
                ).HydroLogAndroid?.openAppSettings === 'function' && (
                  <button
                    type="button"
                    onClick={() =>
                      (
                        window as Window & { HydroLogAndroid?: { openAppSettings?: () => void } }
                      ).HydroLogAndroid?.openAppSettings?.()
                    }
                    className="text-xs font-semibold text-sky-700 underline hover:text-sky-800 cursor-pointer"
                  >
                    Open App Settings
                  </button>
                )}
            </div>
          )}
          {fieldErrors.image && (
            <p role="alert" className="text-xs text-red-700 mt-2 font-medium">
              {fieldErrors.image}
            </p>
          )}
        </section>

        {/* Section 2: Dedicated Date & Time Selection (Auto vs Manual) */}
        <section className="p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                2. Date & Time Selection
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Use the automatic current timestamp or switch to manual date & time entry.
              </p>
            </div>

            <div
              role="radiogroup"
              aria-label="Date and time selection mode"
              className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start sm:self-auto"
            >
              <button
                type="button"
                role="radio"
                aria-checked={timeMode === 'auto'}
                onClick={resetToCurrentDateTime}
                className={`min-h-[38px] px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  timeMode === 'auto'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Auto (Current)
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={timeMode === 'manual'}
                onClick={() => setTimeMode('manual')}
                className={`min-h-[38px] px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  timeMode === 'manual'
                    ? 'bg-white text-sky-800 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Manual Selection
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="reading-date-input"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                Reading Date
              </label>
              <input
                id="reading-date-input"
                name="readingDate"
                type="date"
                required
                value={readingDate}
                onChange={(e) => {
                  setTimeMode('manual');
                  setReadingDate(e.target.value);
                }}
                className="w-full h-11 px-3.5 rounded-lg border border-slate-300 bg-white font-mono tabular-nums text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-700/20 focus:border-sky-700"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="reading-time-input"
                  className="block text-sm font-medium text-slate-700"
                >
                  Reading Time
                </label>
                <button
                  type="button"
                  onClick={resetToCurrentDateTime}
                  className="text-xs font-medium text-sky-700 hover:text-sky-800 flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" aria-hidden="true" />
                  <span>Set to now</span>
                </button>
              </div>
              <input
                id="reading-time-input"
                name="readingTime"
                type="time"
                required
                value={readingTime}
                onChange={(e) => {
                  setTimeMode('manual');
                  setReadingTime(e.target.value);
                }}
                className="w-full h-11 px-3.5 rounded-lg border border-slate-300 bg-white font-mono tabular-nums text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-700/20 focus:border-sky-700"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Clock className="w-3.5 h-3.5 shrink-0 text-slate-400" aria-hidden="true" />
            <span>
              {timeMode === 'auto'
                ? 'Using current system date & time on submit. Edit either field above to override manually.'
                : `Manual timestamp selected: ${readingDate} ${readingTime}`}
            </span>
          </div>

          {fieldErrors.recordedAt && (
            <p role="alert" className="text-xs text-red-700 font-medium">
              {fieldErrors.recordedAt}
            </p>
          )}
        </section>

        {/* Section 3: Plant, Motor No., and Motor Running/Stopped Status */}
        <section className="p-6 space-y-5">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              3. Plant & Motor Details
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Select the plant location, motor number, and whether the motor is currently running or stopped.
            </p>
          </div>

          {/* Plant Selection */}
          <div>
            <span className="block text-sm font-medium text-slate-700 mb-2">
              Select Plant
            </span>
            <div
              role="radiogroup"
              aria-label="Select Plant"
              className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-1 bg-slate-100 rounded-lg"
            >
              {plantNames.map((p) => {
                const selected = plant === p;
                return (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setPlant(p)}
                    className={`min-h-[44px] px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer truncate ${
                      selected
                        ? 'bg-white text-sky-800 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
            {fieldErrors.plant && (
              <p role="alert" className="text-xs text-red-700 mt-1.5 font-medium">
                {fieldErrors.plant}
              </p>
            )}
          </div>

          {/* Motor No. Selection */}
          <div>
            <span className="block text-sm font-medium text-slate-700 mb-2">
              Motor No.
            </span>
            <div
              role="radiogroup"
              aria-label="Select Motor"
              className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-1 bg-slate-100 rounded-lg"
            >
              {motorNames.map((m) => {
                const selected = motorName === m;
                return (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setMotorName(m)}
                    className={`min-h-[44px] px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer truncate ${
                      selected
                        ? 'bg-white text-sky-800 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
            {fieldErrors.motorName && (
              <p role="alert" className="text-xs text-red-700 mt-1.5 font-medium">
                {fieldErrors.motorName}
              </p>
            )}
          </div>

          {/* Motor Operating Status: Running or Stopped */}
          <div>
            <span className="block text-sm font-medium text-slate-700 mb-2">
              Motor Status
            </span>
            <div
              role="radiogroup"
              aria-label="Motor Status"
              className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-lg"
            >
              {MOTOR_STATUSES.map((status) => {
                const selected = motorStatus === status;
                const isRunning = status === 'Running';
                return (
                  <button
                    key={status}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setMotorStatus(status)}
                    className={`min-h-[44px] px-4 py-2 rounded-md text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
                      selected
                        ? isRunning
                          ? 'bg-white text-emerald-700 shadow-sm'
                          : 'bg-white text-red-700 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {isRunning ? (
                      <CirclePlay className="w-4 h-4 shrink-0" aria-hidden="true" />
                    ) : (
                      <CircleStop className="w-4 h-4 shrink-0" aria-hidden="true" />
                    )}
                    <span>{status}</span>
                  </button>
                );
              })}
            </div>
            {fieldErrors.motorStatus && (
              <p role="alert" className="text-xs text-red-700 mt-1.5 font-medium">
                {fieldErrors.motorStatus}
              </p>
            )}
          </div>
        </section>

        {/* Section 4: Water Flow & Abnormality Remarks */}
        <section className="p-6 space-y-5">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              4. Water Flow & Remarks
            </h2>
          </div>

          <div>
            <label
              htmlFor="water-flow-input"
              className="block text-sm font-medium text-slate-700 mb-1.5"
            >
              Water Flow Today (m³)
            </label>
            <div className="relative">
              <input
                id="water-flow-input"
                name="waterFlow"
                type="number"
                step="0.01"
                min="0.01"
                inputMode="decimal"
                required
                value={waterFlow}
                onChange={(e) => {
                  setWaterFlow(e.target.value);
                  if (fieldErrors.waterFlow) {
                    setFieldErrors((prev) => {
                      const next = { ...prev };
                      delete next.waterFlow;
                      return next;
                    });
                  }
                }}
                placeholder="0.00"
                className="w-full h-11 pl-3.5 pr-12 rounded-lg border border-slate-300 bg-white font-mono tabular-nums text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-700/20 focus:border-sky-700"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-mono font-semibold text-slate-500">
                m³
              </span>
            </div>
            {fieldErrors.waterFlow && (
              <p role="alert" className="text-xs text-red-700 mt-1.5 font-medium">
                {fieldErrors.waterFlow}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="review-input"
              className="block text-sm font-medium text-slate-700 mb-1.5"
            >
              Review / Abnormality Remarks
            </label>
            <textarea
              id="review-input"
              name="review"
              rows={3}
              maxLength={500}
              value={review}
              onChange={(e) => setReview(e.target.value)}
              placeholder="Note any leaks, motor vibration, fogged dial glass, pressure drops, or leave blank for normal operation."
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-700/20 focus:border-sky-700"
            />
            <div className="flex items-center justify-between mt-1 text-xs text-slate-500">
              <span>Optional — leave blank if operating normally</span>
              <span className="tabular-nums">{review.length}/500</span>
            </div>
          </div>
        </section>

        {/* Submit Footer */}
        <div className="px-6 py-4 bg-slate-50/60 flex items-center justify-end gap-3 rounded-b-xl">
          <button
            type="submit"
            disabled={submitting}
            className="w-full sm:w-auto min-h-[48px] px-6 py-3 rounded-lg bg-sky-700 hover:bg-sky-800 disabled:opacity-60 text-white text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
          >
            {submitting ? 'Uploading reading...' : 'Submit Reading'}
          </button>
        </div>
      </form>
    </div>
  );
}
