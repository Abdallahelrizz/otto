import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  CaretDown,
  CaretLeft,
  CaretRight,
  ChartLineUp,
  DotsThree,
  GearSix,
  Key,
  Moon,
  PlayCircle,
  SquaresFour,
  Sun,
  Trash,
  Warning,
  X,
} from '@phosphor-icons/react';
import { api } from '../api';
import { useStore } from '../store';
import type { AuthStatus } from '../types';
import { SETTINGS_ITEMS } from './SettingsNav';

const navItems = [
  { label: 'Workflows', path: '/app/workflows', icon: <SquaresFour size={18} weight="duotone" /> },
  { label: 'Executions', path: '/app/executions', icon: <PlayCircle size={18} weight="duotone" /> },
  { label: 'Credentials', path: '/app/credentials', icon: <Key size={18} weight="duotone" /> },
  { label: 'Usage', path: '/app/observability', icon: <ChartLineUp size={18} weight="duotone" /> },
];

interface DashboardShellProps {
  children: ReactNode;
}

export function DashboardShell({ children }: DashboardShellProps) {
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('otto-sidebar-collapsed') === '1'; }
    catch { return false; }
  });
  const [settingsOpen, setSettingsOpen] = useState(() => {
    try { return localStorage.getItem('otto-settings-nav-open') === '1'; }
    catch { return false; }
  });
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < 1024);
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 1024);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  // Collapse to the icon rail when manually collapsed OR the viewport is narrow (e.g. half-screen)
  const isRail = collapsed || narrow;
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const notifications = useStore((s) => s.notifications);
  const unreadCount = useStore((s) => s.unreadCount);
  const markAllRead = useStore((s) => s.markAllRead);
  const clearNotifications = useStore((s) => s.clearNotifications);
  const removeNotification = useStore((s) => s.removeNotification);
  const dismissNotification = useStore((s) => s.dismissNotification);

  // Close notification panel on outside click
  useEffect(() => {
    if (!notifOpen) return;
    const close = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', close as unknown as EventListener);
    return () => document.removeEventListener('mousedown', close as unknown as EventListener);
  }, [notifOpen]);

  const handleBellClick = () => {
    setNotifOpen((o) => !o);
    if (!notifOpen) markAllRead();
  };

  const handleThemeToggle = () => {
    const root = document.documentElement;
    const style = document.createElement('style');
    style.setAttribute('data-otto-theme-swap', '');
    style.appendChild(
      document.createTextNode(
        'html.otto-theme-swapping *, html.otto-theme-swapping *::before, html.otto-theme-swapping *::after {' +
          'transition: none !important;' +
          'animation: none !important;' +
        '}',
      ),
    );
    document.head.appendChild(style);
    root.classList.add('otto-theme-swapping');
    void root.offsetHeight;
    toggleTheme();
    void root.offsetHeight;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        root.classList.remove('otto-theme-swapping');
        style.remove();
      });
    });
  };

  const navigate = useNavigate();
  const location = useLocation();

  const onSettings = location.pathname.startsWith('/app/settings');
  useEffect(() => { if (onSettings) setSettingsOpen(true); }, [onSettings]);
  const toggleSettings = () => setSettingsOpen((o) => {
    const next = !o;
    try { localStorage.setItem('otto-settings-nav-open', next ? '1' : '0'); } catch {}
    return next;
  });

  useEffect(() => {
    let cancelled = false;
    api.authStatus()
      .then((status) => { if (!cancelled) setAuthStatus(status); })
      .catch(() => { if (!cancelled) setAuthStatus(null); });
    return () => { cancelled = true; };
  }, []);

  const userEmail = authStatus?.user?.email ?? '';
  const userName = authStatus?.user?.name || userEmail || 'Developer';
  const initial = userName.trim().charAt(0).toUpperCase() || 'O';

  const handleCollapse = () => {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem('otto-sidebar-collapsed', next ? '1' : '0'); } catch {}
      return next;
    });
  };

  function formatTs(ts: string): string {
    try {
      const date = new Date(ts);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = diffMs / 60_000;
      const diffHours = diffMs / 3_600_000;
      const diffDays = diffMs / 86_400_000;

      if (diffMins < 1) return 'Just now';
      if (diffHours < 12) {
        // Within 12 hours — show clock time
        return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
      }
      if (diffHours < 24) return 'Yesterday';
      if (diffDays < 2) return 'Yesterday';
      if (diffDays < 7) {
        // Within a week — day name
        return date.toLocaleDateString(undefined, { weekday: 'long' });
      }
      if (diffDays < 14) return 'Last week';
      if (diffDays < 30) {
        const weeks = Math.floor(diffDays / 7);
        return `${weeks} weeks ago`;
      }
      if (diffDays < 365) {
        // Same year — month + day
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      }
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch { return ts; }
  }

  function groupLabel(ts: string): string {
    try {
      const diffHours = (Date.now() - new Date(ts).getTime()) / 3_600_000;
      if (diffHours < 12) return 'Recent';
      if (diffHours < 48) return 'Yesterday';
      if (diffHours < 168) return 'This Week';
      if (diffHours < 720) return 'This Month';
      return 'Earlier';
    } catch { return 'Earlier'; }
  }

  return (
    <div className={`otto-dashboard theme-${theme}${isRail ? ' sidebar-collapsed' : ''}`}>
      <div className="otto-sidebar-spacer" aria-hidden="true" />

      <aside className={`otto-dashboard-sidebar${isRail ? ' is-collapsed' : ''}`} aria-label="Dashboard navigation">
        <button className="otto-brand" type="button" onClick={() => navigate('/app/workflows')} title="otto">
          <img src="/otto_logo.svg" alt="" className="otto-brand-logo" aria-hidden="true" />
          <span className="otto-brand-copy">
            <span className="otto-brand-name">otto</span>
            <span className="otto-brand-subtitle">automation control</span>
          </span>
        </button>

        <nav className="otto-dashboard-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              title={item.label}
              className={({ isActive }) =>
                `otto-dashboard-nav-item${isActive || location.pathname.startsWith(item.path) ? ' is-active' : ''}`
              }
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}

          <div className="otto-dashboard-nav-group">
            <button
              type="button"
              className={`otto-dashboard-nav-item otto-nav-group-toggle${onSettings ? ' is-active' : ''}`}
              title="Settings"
              aria-expanded={settingsOpen}
              onClick={isRail ? () => navigate('/app/settings/general') : toggleSettings}
            >
              <GearSix size={18} weight="duotone" />
              <span>Settings</span>
              {!isRail && (
                <CaretDown size={12} weight="bold" className={`otto-nav-caret${settingsOpen ? ' is-open' : ''}`} />
              )}
            </button>
            {!isRail && (
              <div className={`otto-dashboard-subnav-wrap${settingsOpen ? ' is-open' : ''}`}>
                <div className="otto-dashboard-subnav">
                  {SETTINGS_ITEMS.map((item) => (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      tabIndex={settingsOpen ? 0 : -1}
                      className={({ isActive }) =>
                        `otto-dashboard-subnav-item${isActive ? ' is-active' : ''}`
                      }
                    >
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              </div>
            )}
          </div>
        </nav>

        <div className="otto-account-footer">
          <span className="otto-account-avatar" aria-hidden="true">{initial}</span>
          <span className="otto-account-email">{userEmail || userName}</span>
          <button className="otto-icon-button otto-account-dots" type="button" aria-label="Account settings">
            <DotsThree size={18} weight="bold" />
          </button>
        </div>

        <button
          className="otto-sidebar-collapse"
          type="button"
          onClick={handleCollapse}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <CaretRight size={11} weight="bold" /> : <CaretLeft size={11} weight="bold" />}
        </button>
      </aside>

      <div className="otto-dashboard-main">
        {/* ── Global top-right controls ── */}
        <div className="otto-topright-controls">
          {/* Bell */}
          <div className="otto-notif-wrap" ref={notifRef}>
            <button
              className="otto-icon-button otto-btn-bell otto-topright-btn"
              type="button"
              aria-label="Notifications"
              onClick={handleBellClick}
            >
              <Bell size={16} weight="duotone" />
              {unreadCount > 0 && (
                <span className="otto-notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
              )}
            </button>

            {notifOpen && (
              <div className="otto-notif-panel">
                <div className="otto-notif-header">
                  <span>Notifications</span>
                  <button
                    className="otto-icon-button"
                    type="button"
                    title="Close"
                    style={{ width: 26, height: 26 }}
                    onClick={() => setNotifOpen(false)}
                  >
                    <X size={13} weight="bold" />
                  </button>
                </div>

                <div className="otto-notif-list">
                  {notifications.length === 0 ? (
                    <div className="otto-notif-empty">
                      <Bell size={28} weight="duotone" />
                      <p>No notifications</p>
                    </div>
                  ) : (() => {
                    // Group by time bucket
                    const groups: { label: string; items: typeof notifications }[] = [];
                    const ORDER = ['Recent', 'Yesterday', 'This Week', 'This Month', 'Earlier'];
                    for (const n of notifications) {
                      const label = groupLabel(n.timestamp);
                      let g = groups.find(g => g.label === label);
                      if (!g) { g = { label, items: [] }; groups.push(g); }
                      g.items.push(n);
                    }
                    groups.sort((a, b) => ORDER.indexOf(a.label) - ORDER.indexOf(b.label));
                    return groups.map(group => (
                      <div key={group.label}>
                        <div className="otto-notif-group-label">{group.label}</div>
                        {group.items.map((n) => (
                          <div key={n.id} className={`otto-notif-item${n.urgent ? ' is-urgent' : ''}`}>
                            <Warning
                              size={13}
                              weight="fill"
                              style={{ color: n.urgent ? '#f87171' : 'var(--dash-faint)', flexShrink: 0, marginTop: 3 }}
                            />
                            <div className="otto-notif-item-body">
                              <span className="otto-notif-item-title" style={{ color: n.urgent ? 'var(--dash-text)' : 'var(--dash-muted)' }}>
                                {n.title}
                              </span>
                              <span className="otto-notif-item-ts">{formatTs(n.timestamp)}</span>
                            </div>
                            {n.urgent ? (
                              <button
                                className="otto-notif-action"
                                type="button"
                                title="Dismiss"
                                onClick={(e) => { e.stopPropagation(); dismissNotification(n.id); }}
                              >
                                Dismiss
                              </button>
                            ) : (
                              <button
                                className="otto-notif-dismiss"
                                type="button"
                                title="Delete"
                                onClick={(e) => { e.stopPropagation(); removeNotification(n.id); }}
                              >
                                <Trash size={11} weight="duotone" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    ));
                  })()}
                </div>
              </div>
            )}
          </div>

          {/* Theme toggle */}
          <button
            className="otto-icon-button otto-topright-btn"
            type="button"
            onClick={handleThemeToggle}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          >
            {theme === 'dark' ? <Sun size={16} weight="duotone" /> : <Moon size={16} weight="duotone" />}
          </button>
        </div>

        <main className="otto-dashboard-content">{children}</main>
      </div>
    </div>
  );
}
