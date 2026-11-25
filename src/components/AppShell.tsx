import type { ReactNode } from 'react';
import {
  BarChart3,
  Camera,
  ClipboardList,
  Code2,
  Droplets,
  Home,
  LogOut,
  SlidersHorizontal,
  Users,
} from 'lucide-react';
import type { AppRoute, User } from '../types';

interface NavItem {
  route: AppRoute;
  label: string;
  shortLabel: string;
  icon: typeof Home;
  mobileGroupRoutes?: AppRoute[];
}

const USER_NAV: NavItem[] = [
  { route: 'user-home', label: 'Home', shortLabel: 'Home', icon: Home },
  { route: 'submit-reading', label: 'Submit Reading', shortLabel: 'Submit', icon: Camera },
  { route: 'my-records', label: 'My Records', shortLabel: 'Records', icon: ClipboardList },
];

const ADMIN_DESKTOP_NAV: NavItem[] = [
  { route: 'admin-dashboard', label: 'Dashboard', shortLabel: 'Dashboard', icon: BarChart3 },
  { route: 'all-records', label: 'All Records', shortLabel: 'Records', icon: ClipboardList },
  { route: 'submit-reading', label: 'Add Reading', shortLabel: 'Add', icon: Camera },
  { route: 'plants-motors', label: 'Plants & Motors', shortLabel: 'Setup', icon: SlidersHorizontal },
  { route: 'user-management', label: 'Users', shortLabel: 'Users', icon: Users },
  { route: 'android-guide', label: 'Android & API', shortLabel: 'Android', icon: Code2 },
];

const ADMIN_MOBILE_NAV: NavItem[] = [
  { route: 'admin-dashboard', label: 'Dashboard', shortLabel: 'Dashboard', icon: BarChart3 },
  { route: 'all-records', label: 'All Records', shortLabel: 'Records', icon: ClipboardList },
  { route: 'submit-reading', label: 'Add Reading', shortLabel: 'Add', icon: Camera },
  {
    route: 'plants-motors',
    label: 'Setup',
    shortLabel: 'Setup',
    icon: SlidersHorizontal,
    mobileGroupRoutes: ['plants-motors', 'user-management'],
  },
  { route: 'android-guide', label: 'Android & API', shortLabel: 'Android', icon: Code2 },
];

const ROUTE_TITLES: Record<AppRoute, string> = {
  'user-home': 'Operator Home',
  'submit-reading': 'Submit Reading',
  'my-records': 'My Records',
  'admin-dashboard': 'Admin Dashboard',
  'all-records': 'All Records',
  'user-management': 'User Management',
  'plants-motors': 'Plants & Motors',
  'android-guide': 'Android Studio & Backend Guide',
};

interface AppShellProps {
  user: User;
  activeRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  onLogout: () => void;
  children: ReactNode;
}

export function AppShell({
  user,
  activeRoute,
  onNavigate,
  onLogout,
  children,
}: AppShellProps) {
  const desktopNav = user.role === 'admin' ? ADMIN_DESKTOP_NAV : USER_NAV;
  const mobileNav = user.role === 'admin' ? ADMIN_MOBILE_NAV : USER_NAV;
  const pageTitle = ROUTE_TITLES[activeRoute];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-white border-r border-slate-200 z-30">
        <div className="h-16 px-5 flex items-center gap-2.5 border-b border-slate-200">
          <div className="w-8 h-8 rounded-lg bg-sky-700 flex items-center justify-center text-white shrink-0">
            <Droplets className="w-4 h-4" aria-hidden="true" />
          </div>
          <span className="font-display text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
            HydroLog
          </span>
        </div>

        <nav aria-label="Primary navigation" className="flex-1 p-3 space-y-1 overflow-y-auto">
          {desktopNav.map((item) => {
            const Icon = item.icon;
            const active = activeRoute === item.route;
            return (
              <button
                key={item.route}
                type="button"
                onClick={() => onNavigate(item.route)}
                aria-current={active ? 'page' : undefined}
                className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-lg flex items-center gap-3 text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-sky-50 text-sky-800'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${active ? 'text-sky-700' : 'text-slate-400'}`}
                  aria-hidden="true"
                />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 space-y-3">
          <div>
            <div className="text-sm font-semibold text-slate-900 truncate">{user.name}</div>
            <div className="text-xs text-slate-500 truncate mt-0.5">
              {user.role === 'admin' ? 'Administrator' : 'Field User'} · {user.email}
            </div>
          </div>

          <button
            type="button"
            onClick={onLogout}
            className="w-full min-h-[40px] px-3 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
          >
            <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Mobile Compact Top Header (48px) */}
      <header className="lg:hidden sticky top-0 z-30 h-12 bg-white/95 backdrop-blur-sm border-b border-slate-200 px-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-md bg-sky-700 flex items-center justify-center text-white shrink-0">
            <Droplets className="w-4 h-4" aria-hidden="true" />
          </div>
          <span className="font-display text-sm font-semibold text-slate-900 truncate">
            {pageTitle}
          </span>
        </div>
        <button
          type="button"
          onClick={onLogout}
          aria-label="Sign out"
          className="min-h-[44px] min-w-[44px] -mr-2 flex items-center justify-center text-slate-600 hover:text-slate-900 cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Desktop Top Bar */}
        <header className="hidden lg:flex h-16 bg-white border-b border-slate-200 px-8 items-center justify-between gap-8 sticky top-0 z-20">
          <div className="flex items-center gap-2 text-sm text-slate-500 min-w-0">
            <span className="whitespace-nowrap">
              {user.role === 'admin' ? 'Admin Console' : 'Field Operations'}
            </span>
            <span aria-hidden="true">/</span>
            <span className="font-semibold text-slate-900 truncate">{pageTitle}</span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {activeRoute !== 'submit-reading' && (
              <button
                type="button"
                onClick={() => onNavigate('submit-reading')}
                className="h-10 px-4 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-sm font-medium flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Camera className="w-4 h-4" aria-hidden="true" />
                <span>Submit Reading</span>
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-20 lg:pb-10">
          {children}
        </main>
      </div>

      {/* Mobile Fixed Bottom Navigation Bar (56px; total sticky 12.3% <= 15%) */}
      <nav
        aria-label="Mobile bottom navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 h-14 bg-white/95 backdrop-blur-sm border-t border-slate-200"
      >
        <div
          className={`h-full grid ${
            mobileNav.length === 5
              ? 'grid-cols-5'
              : mobileNav.length === 3
                ? 'grid-cols-3'
                : 'grid-cols-4'
          } items-center`}
        >
          {mobileNav.map((item) => {
            const Icon = item.icon;
            const active =
              activeRoute === item.route ||
              Boolean(item.mobileGroupRoutes?.includes(activeRoute));
            return (
              <button
                key={item.route}
                type="button"
                onClick={() => onNavigate(item.route)}
                aria-current={active ? 'page' : undefined}
                className={`h-full min-h-[44px] flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors ${
                  active ? 'text-sky-700' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <Icon className="w-5 h-5" aria-hidden="true" />
                <span className="text-[11px] font-medium leading-none whitespace-nowrap">
                  {item.shortLabel}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
