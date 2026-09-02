"use client";

import { useEffect, useState } from "react";

/**
 * Delays reflecting `value` until it's stopped changing for `delayMs` --
 * used to keep search-as-you-type inputs snappy in the UI while avoiding an
 * API request (and a paginated-list refetch) per keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timeout);
  }, [value, delayMs]);

  return debounced;
}
