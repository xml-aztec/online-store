"use client";

import { createContext, useContext } from "react";

/** DOM node rendered by AdminLayout via a ref callback (not an effect --
 * this needs to be available the instant it mounts, not one render later),
 * inside the theme-scoped wrapper. Drawer/CommandPalette/Toast/
 * ShortcutsCheatsheet portal here instead of document.body so dark-mode CSS
 * variables (scoped to that wrapper, see globals.css) still reach them
 * despite portals living outside the React tree's DOM position. */
const AdminPortalContext = createContext<HTMLElement | null>(null);

export const AdminPortalProvider = AdminPortalContext.Provider;

export function useAdminPortalRoot(): HTMLElement | null {
  return useContext(AdminPortalContext);
}
