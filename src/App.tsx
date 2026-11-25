import { useEffect, useRef, useState } from 'react';
import { api } from './api/client';
import { AdminDashboard } from './components/AdminDashboard';
import { AllRecordsScreen } from './components/AllRecordsScreen';
import { AndroidGuideScreen } from './components/AndroidGuideScreen';
import { AppShell } from './components/AppShell';
import { LoginScreen } from './components/LoginScreen';
import { MyRecordsScreen } from './components/MyRecordsScreen';
import { PlantsMotorsScreen } from './components/PlantsMotorsScreen';
import { SubmitReadingScreen } from './components/SubmitReadingScreen';
import { UserHome } from './components/UserHome';
import { UserManagementScreen } from './components/UserManagementScreen';
import {
  DEFAULT_MOTORS,
  DEFAULT_PLANTS,
  type AppConfig,
  type AppRoute,
  type MeterReading,
  type PlantMotorState,
  type User,
} from './types';
import { canAccessRoute, formatFlow, getDefaultRouteForRole } from './utils/meterLogic';

const FALLBACK_CONFIG: AppConfig = {
  plants: DEFAULT_PLANTS.map((name, idx) => ({ id: `plant-${idx + 1}`, name, sortOrder: idx + 1 })),
  motors: DEFAULT_MOTORS.map((name, idx) => ({ id: `motor-${idx + 1}`, name, sortOrder: idx + 1 })),
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [config, setConfig] = useState<AppConfig>(FALLBACK_CONFIG);
  const [plantMotorStates, setPlantMotorStates] = useState<PlantMotorState[]>([]);
  const [checkingSession, setCheckingSession] = useState(true);
  const [route, setRoute] = useState<AppRoute>('user-home');
  const [refreshKey, setRefreshKey] = useState(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const prevUserIdRef = useRef<string | null>(null);

  async function loadConfig() {
    try {
      const next = await api.getConfig();
      if (next.plants.length > 0 && next.motors.length > 0) {
        setConfig(next);
      }
    } catch {
      // Fallback config remains active until Firestore responds
    }
  }

  useEffect(() => {
    const unsubscribe = api.subscribeAuth(
      async (sessionState) => {
        setPendingVerificationEmail(sessionState.pendingVerificationEmail);
        if (sessionState.user) {
          setAuthError(null);
          const isNewSignIn = prevUserIdRef.current !== sessionState.user.id;
          prevUserIdRef.current = sessionState.user.id;
          setUser(sessionState.user);
          if (isNewSignIn) {
            setRoute(getDefaultRouteForRole(sessionState.user.role));
          }
          await loadConfig();
        } else {
          prevUserIdRef.current = null;
          setUser(null);
        }
        setCheckingSession(false);
      },
      (message) => {
        setAuthError(message);
        setCheckingSession(false);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setPlantMotorStates([]);
      return;
    }
    const unsubscribeStates = api.subscribePlantMotorStates(setPlantMotorStates);
    return () => unsubscribeStates();
  }, [user]);

  useEffect(() => {
    if (!user || user.role !== 'admin') return;
    const HOURLY_SWEEP_MS = 60 * 60 * 1000;
    const intervalId = window.setInterval(() => {
      void api.purgeExpiredRecords(false);
    }, HOURLY_SWEEP_MS);
    return () => window.clearInterval(intervalId);
  }, [user]);

  async function handleLoginSuccess(loggedInUser: User) {
    prevUserIdRef.current = loggedInUser.id;
    setUser(loggedInUser);
    setPendingVerificationEmail(null);
    setAuthError(null);
    setRoute(getDefaultRouteForRole(loggedInUser.role));
    setToastMessage(null);
    await loadConfig();
  }

  async function handleLogout() {
    try {
      await api.logout();
    } finally {
      prevUserIdRef.current = null;
      setUser(null);
      setPendingVerificationEmail(null);
      setToastMessage(null);
    }
  }

  function handleNavigate(nextRoute: AppRoute) {
    if (!user) return;
    if (!canAccessRoute(user.role, nextRoute)) {
      return;
    }
    setRoute(nextRoute);
    setToastMessage(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleReadingSubmitted(reading: MeterReading) {
    setRefreshKey((k) => k + 1);
    if (reading.autoStoppedMotor) {
      setToastMessage(
        `Auto-stopped ${reading.autoStoppedMotor} in ${reading.plant} and started ${reading.motorName} (${formatFlow(reading.waterFlow)} m³).`
      );
    } else {
      setToastMessage(
        `Submitted ${formatFlow(reading.waterFlow)} m³ for ${reading.plant} · ${reading.motorName} (${reading.motorStatus}).`
      );
    }
    setRoute(user?.role === 'admin' ? 'all-records' : 'my-records');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleConfigUpdated(nextConfig: AppConfig) {
    setConfig(nextConfig);
    setRefreshKey((k) => k + 1);
  }

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-sm text-slate-500">Verifying session...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <LoginScreen
        onLoginSuccess={handleLoginSuccess}
        pendingVerificationEmail={pendingVerificationEmail}
        initialError={authError}
      />
    );
  }

  const safeRoute: AppRoute = canAccessRoute(user.role, route)
    ? route
    : getDefaultRouteForRole(user.role);

  return (
    <AppShell
      user={user}
      activeRoute={safeRoute}
      onNavigate={handleNavigate}
      onLogout={handleLogout}
    >
      {toastMessage && (
        <div
          role="status"
          className="mb-5 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800 flex items-center justify-between gap-4"
        >
          <span>{toastMessage}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="text-xs font-semibold text-emerald-900 hover:underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {safeRoute === 'user-home' && (
        <UserHome
          user={user}
          config={config}
          plantMotorStates={plantMotorStates}
          onNavigate={handleNavigate}
          refreshKey={refreshKey}
          onDataMutated={() => setRefreshKey((k) => k + 1)}
        />
      )}

      {safeRoute === 'submit-reading' && (
        <SubmitReadingScreen
          config={config}
          plantMotorStates={plantMotorStates}
          onSubmitted={handleReadingSubmitted}
        />
      )}

      {safeRoute === 'my-records' && (
        <MyRecordsScreen
          config={config}
          plantMotorStates={plantMotorStates}
          onNavigate={handleNavigate}
          refreshKey={refreshKey}
        />
      )}

      {safeRoute === 'admin-dashboard' && (
        <AdminDashboard
          config={config}
          plantMotorStates={plantMotorStates}
          onNavigate={handleNavigate}
          refreshKey={refreshKey}
          onDataMutated={() => setRefreshKey((k) => k + 1)}
        />
      )}

      {safeRoute === 'all-records' && (
        <AllRecordsScreen
          config={config}
          plantMotorStates={plantMotorStates}
          refreshKey={refreshKey}
          onDataMutated={() => setRefreshKey((k) => k + 1)}
        />
      )}

      {safeRoute === 'plants-motors' && (
        <PlantsMotorsScreen
          config={config}
          onConfigUpdated={handleConfigUpdated}
          onNavigate={handleNavigate}
        />
      )}

      {safeRoute === 'user-management' && (
        <UserManagementScreen currentUserId={user.id} onNavigate={handleNavigate} />
      )}

      {safeRoute === 'android-guide' && <AndroidGuideScreen />}
    </AppShell>
  );
}
