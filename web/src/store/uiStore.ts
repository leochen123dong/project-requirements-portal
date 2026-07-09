import { create } from 'zustand';

export type ToastKind = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
}

interface UIState {
  toasts: Toast[];
  pushToast: (kind: ToastKind, message: string) => void;
  dismissToast: (id: string) => void;

  drawerOpen: boolean;
  drawerContent: React.ReactNode | null;
  openDrawer: (content: React.ReactNode) => void;
  closeDrawer: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  toasts: [],
  pushToast: (kind, message) => {
    const id = Math.random().toString(36).slice(2);
    set((s) => ({ toasts: [...s.toasts, { id, kind, message }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4000);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  drawerOpen: false,
  drawerContent: null,
  openDrawer: (content) => set({ drawerOpen: true, drawerContent: content }),
  closeDrawer: () => set({ drawerOpen: false, drawerContent: null }),
}));