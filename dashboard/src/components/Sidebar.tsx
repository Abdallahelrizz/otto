import { NavLink } from 'react-router-dom';

const navItems = [
  { to: '/workflows', label: 'WORKFLOWS' },
  { to: '/executions', label: 'EXECUTIONS' },
  { to: '/credentials', label: 'CREDENTIALS' },
  { to: '/observability', label: 'OBSERVABILITY' },
  { to: '/settings', label: 'SETTINGS' },
];

export function Sidebar() {
  return (
    <aside className="w-60 h-screen bg-black border-r border-white/8 overflow-y-auto flex-shrink-0">
      <div className="p-6">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-8 h-8 rounded-2 bg-brand-accent flex items-center justify-center">
            <span className="text-white font-bold text-sm">O</span>
          </div>
          <span className="text-white font-semibold text-lg">Otto</span>
        </div>
        <nav className="space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `block px-3 py-2 text-xs font-medium uppercase tracking-wider transition-all duration-150 ${
                  isActive
                    ? 'text-white border-l-2 border-brand-accent bg-white/5'
                    : 'text-gray-400 border-l-2 border-transparent hover:text-white hover:bg-white/5'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </aside>
  );
}
