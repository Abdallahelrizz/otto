import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { BracketsCurly, ClipboardText, GearSix, Info, Key } from '@phosphor-icons/react';

export interface SettingsNavItem {
  label: string;
  path: string;
  icon: ReactNode;
}

// Single source of truth for the Settings sub-pages — consumed by both the
// DashboardShell sidebar sub-nav and the responsive <SettingsNav /> tab grid.
export const SETTINGS_ITEMS: SettingsNavItem[] = [
  { label: 'General', path: '/app/settings/general', icon: <GearSix size={17} weight="duotone" /> },
  { label: 'API Keys', path: '/app/settings/api-keys', icon: <Key size={17} weight="duotone" /> },
  { label: 'Variables', path: '/app/settings/variables', icon: <BracketsCurly size={17} weight="duotone" /> },
  { label: 'Audit Log', path: '/app/settings/audit', icon: <ClipboardText size={17} weight="duotone" /> },
  { label: 'About', path: '/app/settings/about', icon: <Info size={17} weight="duotone" /> },
];

/**
 * Compact tab grid for navigating between Settings sub-pages.
 *
 * Always rendered at the top of each Settings page, but hidden via CSS until the
 * dashboard sidebar collapses to an icon rail — which happens when the user
 * manually collapses it OR the viewport is narrow (e.g. a half-width window).
 * In that state the sidebar's inline Settings sub-nav disappears, so this grid
 * keeps every sub-page reachable. (Adapts Railway's collapsible-nav pattern.)
 */
export function SettingsNav() {
  return (
    <nav className="otto-settings-tabnav" aria-label="Settings sections">
      {SETTINGS_ITEMS.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          className={({ isActive }) => `otto-settings-tab${isActive ? ' is-active' : ''}`}
        >
          {item.icon}
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
