import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Swords, Radio, CalendarClock, Trophy, Medal, Wallet, ArrowDownToLine,
  ArrowUpFromLine, Bell, LifeBuoy, UserRound, Settings2, LogOut, Shield, Menu, X,
  ChevronDown, WifiOff, Sparkles, Gamepad2, ChevronRight,
} from 'lucide-react';
import { Logo, ParticleCanvas } from './Brand';
import { useAuth } from '../lib/auth';
import { useAppData } from '../lib/appdata';
import { money, initials } from '../lib/format';
import { useConfirm } from './UI';

const NAV = [
  { to: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { to: '/matches', label: 'All Matches', icon: Swords },
  { to: '/matches?status=upcoming', label: 'Upcoming Matches', icon: CalendarClock },
  { to: '/matches?status=live', label: 'Live Matches', icon: Radio },
  { to: '/my-matches', label: 'My Matches', icon: Gamepad2 },
  { to: '/results', label: 'My Results', icon: Trophy },
  { to: '/wins', label: 'My Wins', icon: Medal },
  { to: '/leaderboard', label: 'Leaderboard', icon: Sparkles },
  { to: '/wallet', label: 'Wallet', icon: Wallet },
  { to: '/deposit', label: 'Deposit', icon: ArrowDownToLine },
  { to: '/withdraw', label: 'Withdraw', icon: ArrowUpFromLine },
  { to: '/notifications', label: 'Notifications', icon: Bell },
  { to: '/support', label: 'Support', icon: LifeBuoy },
  { to: '/profile', label: 'Profile', icon: UserRound },
  { to: '/settings', label: 'Settings', icon: Settings2 },
];
const BOTTOM = [NAV[0], NAV[1], NAV[3], NAV[7], NAV[8]];

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { data, unread, online } = useAppData();
  const location = useLocation();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [drawer, setDrawer] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  useEffect(() => { setDrawer(false); setProfileOpen(false); }, [location.pathname, location.search]);
  const balance = (user?.wallet?.available || 0) + (user?.wallet?.winning || 0);

  return <div className="app-shell">
    <ParticleCanvas />
    <aside className={`sidebar ${drawer ? 'open' : ''}`}>
      <div className="sidebar-top">
        <NavLink to="/dashboard" className="sidebar-logo"><Logo size={40} /></NavLink>
        <button className="icon-btn mobile-only" onClick={() => setDrawer(false)} aria-label="Close menu"><X size={18} /></button>
      </div>
      <nav className="sidebar-nav">
        <div className="nav-caption">MAIN MENU</div>
        {NAV.slice(0, 8).map((n) => <NavItem key={n.to} {...n} badge={n.to === '/notifications' ? unread : 0} />)}
        <div className="nav-caption">FINANCE & ACCOUNT</div>
        {NAV.slice(8).map((n) => <NavItem key={n.to} {...n} badge={n.to === '/notifications' ? unread : 0} />)}
        {user?.role === 'admin' && <>
          <div className="nav-caption">OPERATIONS</div>
          <NavLink to="/admin" className={({ isActive }) => `nav-item admin-link ${isActive ? 'active' : ''}`}><Shield size={18} /><span>Admin Panel</span><ChevronRight size={14} className="nav-arrow" /></NavLink>
        </>}
      </nav>
      <div className="sidebar-foot">
        <div className="sidebar-wallet"><span>Available balance</span><strong>{money(balance)}</strong></div>
        <div className="sidebar-legal">Independent community platform · Not affiliated with any game publisher.</div>
      </div>
    </aside>
    {drawer && <div className="drawer-scrim" onClick={() => setDrawer(false)} />}

    <div className="main-area">
      <header className="topbar">
        <div className="topbar-left">
          <button className="icon-btn mobile-only" onClick={() => setDrawer(true)} aria-label="Open menu"><Menu size={20} /></button>
          <div className="topbar-title"><span>NEXUS ARENA</span><small>{NAV.find((n) => n.to === location.pathname)?.label || 'Tournament Circuit'}</small></div>
        </div>
        <div className="topbar-right">
          {!online && <span className="offline-pill"><WifiOff size={14} /> Offline</span>}
          {data?.settings?.mode === 'practice' && <span className="practice-pill" title={data.settings.complianceNote}>PRACTICE MODE</span>}
          <button className="topbar-wallet" onClick={() => navigate('/wallet')}><Wallet size={16} /><strong>{money(balance)}</strong></button>
          <button className="icon-btn bell" onClick={() => navigate('/notifications')} aria-label="Notifications">
            <Bell size={19} />{unread > 0 && <span className="bell-count">{unread > 99 ? '99+' : unread}</span>}
          </button>
          <div className="profile-menu-wrap">
            <button className="profile-trigger" onClick={() => setProfileOpen((v) => !v)}>
              {user?.avatar ? <img src={user.avatar} alt="" /> : <span className="avatar-fallback">{initials(user?.displayName)}</span>}
              <span className="profile-name">{user?.displayName || 'Player'}</span><ChevronDown size={14} />
            </button>
            {profileOpen && <div className="profile-dropdown">
              <div className="dropdown-head"><strong>{user?.displayName}</strong><small>{user?.email}</small></div>
              <button onClick={() => navigate('/profile')}><UserRound size={15} /> My profile</button>
              <button onClick={() => navigate('/settings')}><Settings2 size={15} /> Settings</button>
              {user?.role === 'admin' && <button onClick={() => navigate('/admin')}><Shield size={15} /> Admin panel</button>}
              <button className="danger-text" onClick={async () => {
                if (await confirm('Sign out of Nexus Arena?', { title: 'Sign out' })) { await logout(); navigate('/login'); }
              }}><LogOut size={15} /> Logout</button>
            </div>}
          </div>
        </div>
      </header>
      {data?.settings?.announcement && <div className="announcement-bar"><Sparkles size={14} /> {data.settings.announcement}</div>}
      <main className="content" key={location.pathname + location.search}><div className="page-fade">{children}</div></main>
      <footer className="app-footer"><span>© {new Date().getFullYear()} Nexus Arena · Original branding · Play responsibly</span><span>{data?.settings?.mode === 'practice' ? 'Practice credits have no cash value' : 'Real-money mode enabled by operator'}</span></footer>
    </div>
    <nav className="bottom-nav">{BOTTOM.map((n) => <NavLink key={n.to} to={n.to} className={({ isActive }) => `bottom-item ${isActive ? 'active' : ''}`}>
      <n.icon size={20} /><span>{n.label.replace(' Matches', '')}</span></NavLink>)}
      <button className={`bottom-item ${drawer ? 'active' : ''}`} onClick={() => setDrawer(true)}><Menu size={20} /><span>More</span></button>
    </nav>
  </div>;
}

function NavItem({ to, label, icon: Icon, badge }: { to: string; label: string; icon: any; badge?: number }) {
  return <NavLink to={to} className={({ isActive }) => `nav-item ${isActive && !to.includes('?') ? 'active' : ''}`}>
    <Icon size={18} /><span>{label}</span>{!!badge && <span className="nav-badge">{badge}</span>}
  </NavLink>;
}
