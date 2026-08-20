/**
 * Settings modal state. The gear in the sidebar and every upgrade CTA in the
 * app open this; the modal itself is mounted once in the dashboard shell.
 */

import { create } from 'zustand';

export type SettingsPane = 'general' | 'cv' | 'usage' | 'notifications';

interface SettingsState {
  isOpen: boolean;
  pane: SettingsPane;
  open: (pane?: SettingsPane) => void;
  close: () => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  isOpen: false,
  pane: 'general',
  open: (pane = 'general') => set({ isOpen: true, pane }),
  close: () => set({ isOpen: false }),
}));

/** Open the modal from anywhere, including non-React code. */
export function openSettings(pane: SettingsPane = 'general') {
  useSettingsStore.getState().open(pane);
}

export function isSettingsPane(value: string | null | undefined): value is SettingsPane {
  return value === 'general' || value === 'cv' || value === 'usage' || value === 'notifications';
}
