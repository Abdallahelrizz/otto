import { create } from 'zustand';
import type { Workspace, User } from '../types';

interface AppState {
  theme: 'dark' | 'light';
  workspace: Workspace | null;
  user: User | null;
  setTheme: (theme: 'dark' | 'light') => void;
  setWorkspace: (workspace: Workspace | null) => void;
  setUser: (user: User | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  theme: 'dark',
  workspace: {
    id: 'demo-workspace',
    name: 'Demo Workspace',
    plan: 'free',
  },
  user: {
    id: 'demo-user',
    email: 'demo@example.com',
    name: 'Demo User',
  },
  setTheme: (theme) => set({ theme }),
  setWorkspace: (workspace) => set({ workspace }),
  setUser: (user) => set({ user }),
}));
