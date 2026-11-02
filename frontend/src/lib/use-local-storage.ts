"use client"

import { useMemo, useSyncExternalStore } from "react"

// Per-browser storefront conveniences (recent searches, recently viewed,
// chosen region) read through useSyncExternalStore, so they render nothing
// on the server and update every subscriber when written.

const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  window.addEventListener("storage", listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener("storage", listener)
  }
}

function readRaw(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null // storage unavailable (private mode, blocked site data)
  }
}

export function writeStored(key: string, value: unknown) {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage unavailable: these values are conveniences only.
  }
  listeners.forEach((listener) => listener())
}

export function readStored<T>(key: string, fallback: T): T {
  const raw = readRaw(key)
  if (raw === null) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/** `fallback` should be a stable (module-level) value. */
export function useStoredValue<T>(key: string, fallback: T): T {
  const raw = useSyncExternalStore(
    subscribe,
    () => readRaw(key),
    () => null
  )
  return useMemo(() => {
    if (raw === null) return fallback
    try {
      return JSON.parse(raw) as T
    } catch {
      return fallback
    }
  }, [raw, fallback])
}

const subscribeNever = () => () => undefined

/** False during SSR and hydration, true afterwards (for persisted client state). */
export function useHydrated() {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false
  )
}
