import { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Layers,
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react';
import { api, type GoogleSheetsSessionInfo } from '../api/client';
import type { ReadingFilters } from '../types';
import {
  GoogleSheetsAuthError,
  type GoogleSheetsExportResult,
} from '../utils/googleSheetsExport';

interface ExportExcelControlProps {
  plantNames: string[];
  filters: ReadingFilters;
  idPrefix: string;
  onSuccessNotice?: (message: string) => void;
  onError?: (message: string) => void;
}

function openExternalUrlInNewTab(url: string): boolean {
  const androidBridge = (
    window as Window & {
      HydroLogAndroid?: {
        openExternalUrl?: (targetUrl: string) => boolean;
      };
    }
  ).HydroLogAndroid;

  if (typeof androidBridge?.openExternalUrl === 'function') {
    try {
      if (androidBridge.openExternalUrl(url)) {
        return true;
      }
    } catch {
      // Fall through to standard browser link navigation
    }
  }

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  return false;
}

export function ExportExcelControl({
  plantNames,
  filters,
  idPrefix,
  onSuccessNotice,
  onError,
}: ExportExcelControlProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedPlant, setSelectedPlant] = useState<string>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [sheetsSession, setSheetsSession] = useState<GoogleSheetsSessionInfo>(() =>
    api.getGoogleSheetsSession()
  );
  const [connecting, setConnecting] = useState(false);
  const [exportingSheets, setExportingSheets] = useState(false);
  const [exportingXlsx, setExportingXlsx] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [createdSheet, setCreatedSheet] = useState<GoogleSheetsExportResult | null>(null);

  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // Close plant dropdown on outside click or Escape key
  useEffect(() => {
    if (!menuOpen) return;

    function handleMouseDown(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  function toggleDropdown() {
    setSheetsSession(api.getGoogleSheetsSession());
    setMenuOpen((prev) => !prev);
  }

  async function runGoogleSheetsExport(targetPlant: string) {
    setExportingSheets(true);
    setModalError(null);
    setCreatedSheet(null);
    try {
      const result = await api.exportReadingsToGoogleSheets(filters, targetPlant, plantNames);
      setCreatedSheet(result);
      openExternalUrlInNewTab(result.spreadsheetUrl);
      onSuccessNotice?.(
        `Opened "${result.targetSheetTitle}" tab in Google Sheets (${result.sheetCount} ${
          result.sheetCount === 1 ? 'sheet' : 'sheets'
        }, ${result.recordCount} ${result.recordCount === 1 ? 'record' : 'records'}).`
      );
    } catch (err) {
      if (err instanceof GoogleSheetsAuthError) {
        setSheetsSession({ connected: false, accountEmail: null });
      }
      const message =
        err instanceof Error ? err.message : 'Google Sheets export failed.';
      setModalError(message);
      onError?.(message);
    } finally {
      setExportingSheets(false);
    }
  }

  function handleSelectPlantFromDropdown(targetPlant: string) {
    setMenuOpen(false);
    setSelectedPlant(targetPlant);
    setModalError(null);
    setCreatedSheet(null);

    const currentSession = api.getGoogleSheetsSession();
    setSheetsSession(currentSession);
    setModalOpen(true);

    if (currentSession.connected) {
      void runGoogleSheetsExport(targetPlant);
    }
  }

  async function handleGoogleSignIn(switchAccount = false, autoExportAfter = false) {
    setConnecting(true);
    setModalError(null);
    try {
      const session = await api.connectGoogleSheets({ switchAccount });
      setSheetsSession(session);
      if (autoExportAfter && session.connected) {
        await runGoogleSheetsExport(selectedPlant);
      }
    } catch (err) {
      setModalError(
        err instanceof Error ? err.message : 'Unable to connect your Google Sheets account.'
      );
    } finally {
      setConnecting(false);
    }
  }

  async function handleDownloadLocalXlsx(targetPlant = selectedPlant) {
    setMenuOpen(false);
    setExportingXlsx(true);
    setModalError(null);
    try {
      const filename = await api.exportReadingsXlsx(filters, targetPlant, plantNames);
      onSuccessNotice?.(`Downloaded multi-sheet Excel file ${filename}`);
      setModalOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Excel download failed.';
      setModalError(message);
      onError?.(message);
    } finally {
      setExportingXlsx(false);
    }
  }

  const targetTabLabel = selectedPlant === 'all' ? 'All Plants' : selectedPlant;

  return (
    <>
      <div ref={dropdownRef} className="relative inline-block shrink-0">
        <button
          id={`${idPrefix}-export-excel-btn`}
          type="button"
          onClick={toggleDropdown}
          disabled={exportingXlsx}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="min-h-[44px] px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-65 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 shadow-xs"
        >
          {exportingSheets || exportingXlsx ? (
            <Loader2 className="w-4 h-4 shrink-0 animate-spin" aria-hidden="true" />
          ) : (
            <FileSpreadsheet className="w-4 h-4 shrink-0" aria-hidden="true" />
          )}
          <span>{exportingXlsx ? 'Downloading...' : 'Export Excel'}</span>
          <ChevronDown
            className={`w-4 h-4 shrink-0 transition-transform duration-150 ${
              menuOpen ? 'rotate-180' : ''
            }`}
            aria-hidden="true"
          />
        </button>

        {menuOpen && (
          <div
            role="menu"
            aria-label="Choose plant to open in Google Sheets"
            className="absolute left-0 sm:left-auto sm:right-0 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white shadow-xl z-40 overflow-hidden"
          >
            <div className="px-3.5 py-2.5 border-b border-slate-100 bg-slate-50/80">
              <div className="text-xs font-semibold text-slate-900">
                Open in Admin Google Sheets
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                1st sheet: All Plants · Next sheets: each plant
              </div>
            </div>

            <div className="py-1 max-h-64 overflow-y-auto">
              <button
                type="button"
                role="menuitem"
                onClick={() => handleSelectPlantFromDropdown('all')}
                className="w-full min-h-[42px] px-3.5 py-2 text-left hover:bg-emerald-50/70 focus:bg-emerald-50/70 focus:outline-none flex items-center justify-between gap-2 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Layers className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 truncate">
                      All Plants
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Opens 1st sheet (all plants)
                    </div>
                  </div>
                </div>
                <span className="text-[11px] font-mono tabular-nums text-slate-400 shrink-0">
                  Tab 1
                </span>
              </button>

              {plantNames.length > 0 && (
                <div className="my-1 border-t border-slate-100" role="separator" />
              )}

              {plantNames.map((plant, idx) => (
                <button
                  key={plant}
                  type="button"
                  role="menuitem"
                  onClick={() => handleSelectPlantFromDropdown(plant)}
                  className="w-full min-h-[40px] px-3.5 py-2 text-left hover:bg-slate-50 focus:bg-slate-50 focus:outline-none flex items-center justify-between gap-2 transition-colors cursor-pointer"
                >
                  <span className="text-sm font-medium text-slate-800 truncate">{plant}</span>
                  <span className="text-[11px] font-mono tabular-nums text-slate-400 shrink-0">
                    Tab {idx + 2}
                  </span>
                </button>
              ))}
            </div>

            <div className="border-t border-slate-200 bg-slate-50/70 px-3.5 py-2 space-y-1.5">
              {sheetsSession.connected && sheetsSession.accountEmail && (
                <div className="flex items-center justify-between gap-2 text-[11px] text-slate-600">
                  <span className="truncate">
                    Account: <strong className="font-medium text-slate-800">{sheetsSession.accountEmail}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setModalOpen(true);
                      void handleGoogleSignIn(true, false);
                    }}
                    className="text-sky-700 hover:underline font-medium shrink-0 cursor-pointer"
                  >
                    Switch
                  </button>
                </div>
              )}

              <button
                type="button"
                role="menuitem"
                onClick={() => handleDownloadLocalXlsx('all')}
                className="w-full min-h-[34px] text-left text-xs font-medium text-slate-600 hover:text-slate-900 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Download offline .xlsx copy</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${idPrefix}-export-dialog-title`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
          onClick={() => !exportingSheets && !connecting && setModalOpen(false)}
        >
          <div
            className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0">
                  <FileSpreadsheet className="w-4 h-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h2
                    id={`${idPrefix}-export-dialog-title`}
                    className="text-base font-semibold text-slate-900 truncate"
                  >
                    Google Sheets — {targetTabLabel}
                  </h2>
                  <p className="text-xs text-slate-500">
                    Sheet 1: All Plants · Separate tabs for each plant
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={exportingSheets || connecting}
                onClick={() => setModalOpen(false)}
                aria-label="Close export dialog"
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {modalError && (
                <div
                  role="alert"
                  className="rounded-lg bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs text-red-700 leading-relaxed"
                >
                  {modalError}
                </div>
              )}

              {exportingSheets ? (
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-5 flex items-center gap-3">
                  <Loader2
                    className="w-5 h-5 text-emerald-700 animate-spin shrink-0"
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900">
                      Creating Google Sheet &amp; opening {targetTabLabel}...
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Building All Plants (Tab 1) and individual plant tabs with 4H, 12H &amp; 24H formulas.
                    </p>
                  </div>
                </div>
              ) : createdSheet ? (
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 space-y-3">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2
                      className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-emerald-950">
                        Opened {createdSheet.targetSheetTitle} tab in Google Sheets
                      </div>
                      <p className="text-xs text-emerald-800 mt-0.5 break-words">
                        {createdSheet.title} ({createdSheet.recordCount}{' '}
                        {createdSheet.recordCount === 1 ? 'record' : 'records'},{' '}
                        {createdSheet.sheetCount}{' '}
                        {createdSheet.sheetCount === 1 ? 'sheet' : 'sheets'})
                      </p>
                      {createdSheet.accountEmail && (
                        <p className="text-xs text-emerald-700 mt-1">
                          Admin account:{' '}
                          <span className="font-medium">{createdSheet.accountEmail}</span>
                        </p>
                      )}
                    </div>
                  </div>
                  <a
                    href={createdSheet.spreadsheetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => {
                      const androidBridge = (
                        window as Window & {
                          HydroLogAndroid?: { openExternalUrl?: (targetUrl: string) => boolean };
                        }
                      ).HydroLogAndroid;
                      if (typeof androidBridge?.openExternalUrl === 'function') {
                        e.preventDefault();
                        openExternalUrlInNewTab(createdSheet.spreadsheetUrl);
                      }
                    }}
                    className="w-full min-h-[42px] px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>Open {createdSheet.targetSheetTitle} in Google Sheets</span>
                  </a>
                </div>
              ) : !sheetsSession.connected ? (
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-3">
                  <p className="text-xs text-slate-700 leading-relaxed">
                    Sign in with your administrator Google account to create the multi-sheet workbook
                    (1st sheet: <strong>All Plants</strong>, next sheets: each plant) and open the{' '}
                    <strong>{targetTabLabel}</strong> tab automatically.
                  </p>
                  <button
                    type="button"
                    onClick={() => handleGoogleSignIn(false, true)}
                    disabled={connecting}
                    className="w-full min-h-[44px] px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-60 text-slate-800 text-sm font-medium flex items-center justify-center gap-3 shadow-xs transition-colors cursor-pointer"
                  >
                    <svg
                      version="1.1"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 48 48"
                      className="w-5 h-5 shrink-0 block"
                      aria-hidden="true"
                    >
                      <path
                        fill="#EA4335"
                        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                      />
                      <path
                        fill="#4285F4"
                        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                      />
                      <path
                        fill="#34A853"
                        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                      />
                      <path fill="none" d="M0 0h48v48H0z" />
                    </svg>
                    <span>
                      {connecting ? 'Connecting Google Account...' : 'Sign in with Google'}
                    </span>
                  </button>
                </div>
              ) : (
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[11px] font-medium text-slate-500">
                        Admin Google Sheets Account
                      </div>
                      <div className="text-sm font-semibold text-slate-900 truncate">
                        {sheetsSession.accountEmail || 'Connected Google Account'}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={connecting || exportingSheets}
                      onClick={() => handleGoogleSignIn(true, false)}
                      className="px-2.5 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-100 text-xs font-medium text-slate-700 inline-flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" aria-hidden="true" />
                      <span>Switch</span>
                    </button>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Ready to create the multi-sheet workbook and open the{' '}
                    <strong className="font-semibold text-slate-900">{targetTabLabel}</strong> tab.
                  </p>
                </div>
              )}
            </div>

            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                disabled={exportingXlsx || exportingSheets}
                onClick={() => handleDownloadLocalXlsx(selectedPlant)}
                className="text-xs font-medium text-slate-600 hover:text-slate-900 inline-flex items-center gap-1.5 py-1.5 cursor-pointer disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{exportingXlsx ? 'Downloading .xlsx...' : 'Download .xlsx copy'}</span>
              </button>

              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  disabled={exportingSheets || connecting}
                  onClick={() => setModalOpen(false)}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  {createdSheet ? 'Done' : 'Cancel'}
                </button>
                {sheetsSession.connected && !createdSheet && !exportingSheets && (
                  <button
                    type="button"
                    onClick={() => runGoogleSheetsExport(selectedPlant)}
                    className="min-h-[38px] px-4 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Open {targetTabLabel} in Google Sheets</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
