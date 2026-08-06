export type SidebarPreference = 'expanded' | 'collapsed';

export const SIDEBAR_STORAGE_KEY = 'gateway-control:sidebar:v1';
export const DEFAULT_SIDEBAR_PREFERENCE: SidebarPreference = 'expanded';

export function parseSidebarPreference(value: unknown): SidebarPreference {
  return value === 'collapsed' ? 'collapsed' : DEFAULT_SIDEBAR_PREFERENCE;
}

export function readSidebarPreference(
  storage: Pick<Storage, 'getItem'>,
): SidebarPreference {
  try {
    return parseSidebarPreference(storage.getItem(SIDEBAR_STORAGE_KEY));
  } catch {
    return DEFAULT_SIDEBAR_PREFERENCE;
  }
}

export function persistSidebarPreference(
  preference: SidebarPreference,
  storage: Pick<Storage, 'setItem'>,
): void {
  try {
    storage.setItem(SIDEBAR_STORAGE_KEY, preference);
  } catch {
    // Storage may be unavailable in strict privacy contexts; the live UI still works.
  }
}

export function applySidebarPreference(
  preference: SidebarPreference,
  root: HTMLElement,
): void {
  root.dataset.sidebar = preference;
}
