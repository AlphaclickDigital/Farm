"use client"

import { useSession } from "next-auth/react"
import { keepPreviousData, useQuery, type UseQueryOptions } from "@tanstack/react-query"

export const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
  }
}

export async function apiFetch<T>(path: string, token: string | undefined, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const message = Array.isArray(body.message) ? body.message.join(", ") : body.message
    throw new ApiError(message || `Request failed (${res.status})`, res.status)
  }
  return res.json()
}

/** Build a query string, skipping empty values. */
export function qs(params: Record<string, string | number | boolean | null | undefined>) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue
    search.set(key, String(value))
  }
  const str = search.toString()
  return str ? `?${str}` : ""
}

/**
 * Authenticated GET backed by React Query: responses are cached per path,
 * shared between components that ask for the same data, and kept on screen
 * while the next page/filter loads.
 */
export function useApi<T>(
  path: string | null,
  options?: Omit<UseQueryOptions<T, ApiError>, "queryKey" | "queryFn">,
) {
  const { data: session, status } = useSession()
  const token = session?.user?.accessToken
  return useQuery<T, ApiError>({
    queryKey: ["api", path],
    queryFn: () => apiFetch<T>(path!, token),
    enabled: !!path && !!token && status === "authenticated" && (options?.enabled ?? true),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    retry: (count, error) => error.status >= 500 && count < 2,
    ...options,
  })
}

export function useAccessToken() {
  const { data: session } = useSession()
  return session?.user?.accessToken
}

/** Fetches a CSV export with the user's token and saves it via a temporary link. */
export async function downloadCsv(path: string, token: string | undefined) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(body.message || "Export failed", res.status)
  }
  const disposition = res.headers.get("content-disposition") ?? ""
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "export.csv"
  const url = URL.createObjectURL(await res.blob())
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
