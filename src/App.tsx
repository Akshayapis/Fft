import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { AppDataProvider } from './lib/appdata';
import { ToastProvider, ConfirmProvider, EmptyState } from './components/UI';
import { Splash, ParticleCanvas } from './components/Brand';
import { Layout } from './components/Layout';
import { SETUP_REQUIRED } from './lib/config';
import { AuthPage, SetupRequiredPage } from './pages/Auth';
import { DashboardPage } from './pages/Dashboard';
import { MatchesPage } from './pages/Matches';
import { MatchDetailPage } from './pages/MatchDetail';
import { MyMatchesPage, ResultsPage, WinsPage, LeaderboardPage } from './pages/MyPages';
import { WalletPage } from './pages/Wallet';
import { DepositPage } from './pages/Deposit';
import { WithdrawPage } from './pages/Withdraw';
import { NotificationsPage } from './pages/Notifications';
import { SupportPage, TicketDetailPage } from './pages/Support';
import { ProfilePage } from './pages/Profile';
import { SettingsPage } from './pages/Settings';
import {
  AdminLayout, AdminDashboardPage, AdminUsersPage, AdminTournamentsPage, AdminResultsPage,
  AdminDepositsPage, AdminWithdrawalsPage, AdminTransactionsPage, AdminSupportPage,
  AdminSettingsPage, AdminBannersPage, AdminLogsPage,
} from './pages/Admin';

function BootSplash() {
  const [p, setP] = useState(18);
  useEffect(() => {
    const ids = [window.setTimeout(() => setP(48), 180), window.setTimeout(() => setP(76), 480), window.setTimeout(() => setP(96), 900)];
    return () => ids.forEach(window.clearTimeout);
  }, []);
  return <Splash progress={p} />;
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, booting } = useAuth();
  const location = useLocation();
  if (booting) return <BootSplash />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <>{children}</>;
}

function GuestOnly({ children }: { children: React.ReactNode }) {
  const { user, booting } = useAuth();
  if (booting) return <BootSplash />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function NotFound() {
  return <div style={{ minHeight: '70vh', display: 'grid', placeItems: 'center', position: 'relative' }}><ParticleCanvas />
    <div className="card center" style={{ position: 'relative', zIndex: 2, maxWidth: 420 }}>
      <EmptyState title="Page not found" text="That route does not exist in the tournament circuit." action={<a className="btn primary" href="/dashboard">Back to dashboard</a>} />
    </div></div>;
}

function AppRoutes() {
  const { booting } = useAuth();
  if (SETUP_REQUIRED) return <SetupRequiredPage />;
  if (booting) return <BootSplash />;
  return <Routes>
    <Route path="/login" element={<GuestOnly><AuthPage /></GuestOnly>} />
    <Route path="/admin/login" element={<AuthPage admin />} />
    <Route path="/reset-password" element={<GuestOnly><AuthPage /></GuestOnly>} />
    <Route path="/verify-email" element={<GuestOnly><AuthPage /></GuestOnly>} />
    <Route path="/" element={<RequireAuth><Layout><Navigate to="/dashboard" replace /></Layout></RequireAuth>} />
    <Route path="/dashboard" element={<RequireAuth><Layout><DashboardPage /></Layout></RequireAuth>} />
    <Route path="/matches" element={<RequireAuth><Layout><MatchesPage /></Layout></RequireAuth>} />
    <Route path="/matches/:id" element={<RequireAuth><Layout><MatchDetailPage /></Layout></RequireAuth>} />
    <Route path="/my-matches" element={<RequireAuth><Layout><MyMatchesPage /></Layout></RequireAuth>} />
    <Route path="/results" element={<RequireAuth><Layout><ResultsPage /></Layout></RequireAuth>} />
    <Route path="/wins" element={<RequireAuth><Layout><WinsPage /></Layout></RequireAuth>} />
    <Route path="/leaderboard" element={<RequireAuth><Layout><LeaderboardPage /></Layout></RequireAuth>} />
    <Route path="/wallet" element={<RequireAuth><Layout><WalletPage /></Layout></RequireAuth>} />
    <Route path="/deposit" element={<RequireAuth><Layout><DepositPage /></Layout></RequireAuth>} />
    <Route path="/withdraw" element={<RequireAuth><Layout><WithdrawPage /></Layout></RequireAuth>} />
    <Route path="/notifications" element={<RequireAuth><Layout><NotificationsPage /></Layout></RequireAuth>} />
    <Route path="/support" element={<RequireAuth><Layout><SupportPage /></Layout></RequireAuth>} />
    <Route path="/support/:id" element={<RequireAuth><Layout><TicketDetailPage /></Layout></RequireAuth>} />
    <Route path="/profile" element={<RequireAuth><Layout><ProfilePage /></Layout></RequireAuth>} />
    <Route path="/settings" element={<RequireAuth><Layout><SettingsPage /></Layout></RequireAuth>} />
    <Route path="/admin" element={<RequireAuth><Layout><AdminLayout /></Layout></RequireAuth>}>
      <Route index element={<AdminDashboardPage />} />
      <Route path="users" element={<AdminUsersPage />} />
      <Route path="tournaments" element={<AdminTournamentsPage />} />
      <Route path="results" element={<AdminResultsPage />} />
      <Route path="deposits" element={<AdminDepositsPage />} />
      <Route path="withdrawals" element={<AdminWithdrawalsPage />} />
      <Route path="transactions" element={<AdminTransactionsPage />} />
      <Route path="support" element={<AdminSupportPage />} />
      <Route path="settings" element={<AdminSettingsPage />} />
      <Route path="banners" element={<AdminBannersPage />} />
      <Route path="logs" element={<AdminLogsPage />} />
    </Route>
    <Route path="*" element={<RequireAuth><Layout><NotFound /></Layout></RequireAuth>} />
  </Routes>;
}

export default function App() {
  return <BrowserRouter>
    <ToastProvider><ConfirmProvider><AuthProvider><AppDataProvider><AppRoutes /></AppDataProvider></AuthProvider></ConfirmProvider></ToastProvider>
  </BrowserRouter>;
}
