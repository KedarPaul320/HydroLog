import { useState, type FormEvent } from 'react';
import { Check, Pencil, Plus, X } from 'lucide-react';
import { api } from '../api/client';
import type { AppConfig, AppRoute } from '../types';

interface PlantsMotorsScreenProps {
  config: AppConfig;
  onConfigUpdated: (config: AppConfig) => void;
  onNavigate: (route: AppRoute) => void;
}

export function PlantsMotorsScreen({
  config,
  onConfigUpdated,
  onNavigate,
}: PlantsMotorsScreenProps) {
  const [editingPlantId, setEditingPlantId] = useState<string | null>(null);
  const [plantDraft, setPlantDraft] = useState('');
  const [newPlantName, setNewPlantName] = useState('');

  const [editingMotorId, setEditingMotorId] = useState<string | null>(null);
  const [motorDraft, setMotorDraft] = useState('');
  const [newMotorName, setNewMotorName] = useState('');

  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function savePlantRename(id: string) {
    const trimmed = plantDraft.trim();
    if (trimmed.length < 2) {
      setError('Plant name must be at least 2 characters.');
      return;
    }
    setBusyKey(`plant-${id}`);
    setError(null);
    setNotice(null);
    try {
      const res = await api.renamePlant(id, trimmed);
      onConfigUpdated(res.config);
      setEditingPlantId(null);
      setNotice(`Renamed plant to "${res.plant.name}". All matching records were updated.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to rename plant.');
    } finally {
      setBusyKey(null);
    }
  }

  async function handleAddPlant(e: FormEvent) {
    e.preventDefault();
    const trimmed = newPlantName.trim();
    if (trimmed.length < 2) {
      setError('Enter a plant name (at least 2 characters).');
      return;
    }
    setBusyKey('add-plant');
    setError(null);
    setNotice(null);
    try {
      const res = await api.createPlant(trimmed);
      onConfigUpdated(res.config);
      setNewPlantName('');
      setNotice(`Added plant "${res.plant.name}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add plant.');
    } finally {
      setBusyKey(null);
    }
  }

  async function saveMotorRename(id: string) {
    const trimmed = motorDraft.trim();
    if (trimmed.length < 2) {
      setError('Motor name must be at least 2 characters.');
      return;
    }
    setBusyKey(`motor-${id}`);
    setError(null);
    setNotice(null);
    try {
      const res = await api.renameMotor(id, trimmed);
      onConfigUpdated(res.config);
      setEditingMotorId(null);
      setNotice(`Renamed motor to "${res.motor.name}". All matching records were updated.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to rename motor.');
    } finally {
      setBusyKey(null);
    }
  }

  async function handleAddMotor(e: FormEvent) {
    e.preventDefault();
    const trimmed = newMotorName.trim();
    if (trimmed.length < 2) {
      setError('Enter a motor name (at least 2 characters).');
      return;
    }
    setBusyKey('add-motor');
    setError(null);
    setNotice(null);
    try {
      const res = await api.createMotor(trimmed);
      onConfigUpdated(res.config);
      setNewMotorName('');
      setNotice(`Added motor "${res.motor.name}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add motor.');
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Mobile switcher between Users and Plants & Motors */}
      <div className="lg:hidden flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
        <button
          type="button"
          onClick={() => onNavigate('user-management')}
          className="flex-1 min-h-[40px] rounded-md text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
        >
          Users
        </button>
        <button
          type="button"
          aria-current="page"
          className="flex-1 min-h-[40px] rounded-md text-xs font-medium bg-white text-slate-900 shadow-sm cursor-pointer"
        >
          Plants & Motors
        </button>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Plants & Motors</h1>
        <p className="text-sm text-slate-600 mt-1">
          Rename plants and motor units at any time. Renaming automatically updates existing meter records, filters, and submission forms.
        </p>
      </div>

      {notice && (
        <div
          role="status"
          className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800"
        >
          {notice}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Editable Plants Panel */}
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="text-base font-semibold text-slate-900">
              Plants ({config.plants.length})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Customize plant names (e.g. Plant A, Plant B, Plant C)
            </p>
          </div>

          <ul className="divide-y divide-slate-200">
            {config.plants.map((plant) => {
              const isEditing = editingPlantId === plant.id;
              return (
                <li key={plant.id} className="px-6 py-3.5 flex items-center justify-between gap-3">
                  {isEditing ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        savePlantRename(plant.id);
                      }}
                      className="flex-1 flex items-center gap-2"
                    >
                      <input
                        type="text"
                        aria-label={`Edit name for ${plant.name}`}
                        value={plantDraft}
                        onChange={(e) => setPlantDraft(e.target.value)}
                        maxLength={60}
                        autoFocus
                        className="flex-1 h-10 px-3 rounded-lg border border-sky-600 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-700/20"
                      />
                      <button
                        type="submit"
                        disabled={busyKey === `plant-${plant.id}`}
                        aria-label={`Save plant name for ${plant.name}`}
                        className="min-h-[40px] px-3 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                      >
                        <Check className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Save</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingPlantId(null)}
                        aria-label={`Cancel renaming ${plant.name}`}
                        className="min-h-[40px] min-w-[40px] rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </form>
                  ) : (
                    <>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-900 truncate">
                          {plant.name}
                        </div>
                        <div className="text-xs text-slate-500 font-mono tabular-nums">
                          Plant #{plant.sortOrder}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingPlantId(plant.id);
                          setPlantDraft(plant.name);
                          setError(null);
                          setNotice(null);
                        }}
                        aria-label={`Rename ${plant.name}`}
                        className="min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-200 hover:border-sky-300 hover:bg-sky-50 text-xs font-medium text-slate-700 hover:text-sky-800 inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Rename</span>
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>

          <form
            onSubmit={handleAddPlant}
            className="px-6 py-4 bg-slate-50/70 border-t border-slate-200 flex items-center gap-2.5"
          >
            <input
              type="text"
              aria-label="Add new plant name"
              value={newPlantName}
              onChange={(e) => setNewPlantName(e.target.value)}
              placeholder="Add another plant (e.g. Plant D)"
              maxLength={60}
              className="flex-1 h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-700/20 focus:border-sky-700"
            />
            <button
              type="submit"
              disabled={busyKey === 'add-plant'}
              className="min-h-[40px] px-3.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Add Plant</span>
            </button>
          </form>
        </section>

        {/* Editable Motors Panel */}
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="text-base font-semibold text-slate-900">
              Motors ({config.motors.length})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Customize motor labels (e.g. Motor 1, Motor 2, Motor 3)
            </p>
          </div>

          <ul className="divide-y divide-slate-200">
            {config.motors.map((motor) => {
              const isEditing = editingMotorId === motor.id;
              return (
                <li key={motor.id} className="px-6 py-3.5 flex items-center justify-between gap-3">
                  {isEditing ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        saveMotorRename(motor.id);
                      }}
                      className="flex-1 flex items-center gap-2"
                    >
                      <input
                        type="text"
                        aria-label={`Edit name for ${motor.name}`}
                        value={motorDraft}
                        onChange={(e) => setMotorDraft(e.target.value)}
                        maxLength={60}
                        autoFocus
                        className="flex-1 h-10 px-3 rounded-lg border border-sky-600 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-700/20"
                      />
                      <button
                        type="submit"
                        disabled={busyKey === `motor-${motor.id}`}
                        aria-label={`Save motor name for ${motor.name}`}
                        className="min-h-[40px] px-3 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                      >
                        <Check className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Save</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingMotorId(null)}
                        aria-label={`Cancel renaming ${motor.name}`}
                        className="min-h-[40px] min-w-[40px] rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </form>
                  ) : (
                    <>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-900 truncate">
                          {motor.name}
                        </div>
                        <div className="text-xs text-slate-500 font-mono tabular-nums">
                          Motor #{motor.sortOrder}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingMotorId(motor.id);
                          setMotorDraft(motor.name);
                          setError(null);
                          setNotice(null);
                        }}
                        aria-label={`Rename ${motor.name}`}
                        className="min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-200 hover:border-sky-300 hover:bg-sky-50 text-xs font-medium text-slate-700 hover:text-sky-800 inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Rename</span>
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>

          <form
            onSubmit={handleAddMotor}
            className="px-6 py-4 bg-slate-50/70 border-t border-slate-200 flex items-center gap-2.5"
          >
            <input
              type="text"
              aria-label="Add new motor name"
              value={newMotorName}
              onChange={(e) => setNewMotorName(e.target.value)}
              placeholder="Add another motor (e.g. Motor 4)"
              maxLength={60}
              className="flex-1 h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-700/20 focus:border-sky-700"
            />
            <button
              type="submit"
              disabled={busyKey === 'add-motor'}
              className="min-h-[40px] px-3.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Add Motor</span>
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
