import { useEffect, useState } from "react";

const PREFIX = "clinicflow_ui_";

export function readUiState<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeUiState<T>(key: string, value: T) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* quota / private mode */
  }
}

export function useUiState<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(() => readUiState(key, initial));
  useEffect(() => {
    writeUiState(key, state);
  }, [key, state]);
  return [state, setState] as const;
}
