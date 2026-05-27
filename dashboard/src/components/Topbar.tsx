import { useAppStore } from '../store';

export function Topbar() {
  const workspace = useAppStore((s) => s.workspace);
  const user = useAppStore((s) => s.user);

  return (
    <header className="h-14 bg-black border-b border-white/8 flex items-center justify-between px-6 sticky top-0 z-10">
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-medium text-white">{workspace?.name || 'Workspace'}</h1>
        <span className="text-xs text-gray-500 px-2 py-1 bg-white/5 rounded-2 font-mono uppercase">
          {workspace?.plan || 'free'}
        </span>
      </div>
      <div className="flex items-center gap-4">
        <div className="relative">
          <input
            type="text"
            placeholder="Search..."
            className="w-64 h-8 px-3 text-sm bg-white/5 border border-white/8 rounded-2 text-white placeholder-gray-500 focus:outline-none focus:border-brand-accent"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-2 bg-brand-accent flex items-center justify-center">
            <span className="text-white text-xs font-semibold">
              {user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}
            </span>
          </div>
          <span className="text-sm text-gray-300 hidden sm:block">{user?.email}</span>
        </div>
      </div>
    </header>
  );
}
