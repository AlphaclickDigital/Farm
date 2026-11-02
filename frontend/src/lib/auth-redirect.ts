/**
 * Where to send someone after they sign in. Only same-site paths are allowed,
 * so ?callbackUrl= can't be used as an open redirect, and auth pages are
 * skipped so sign-in can't loop back to itself.
 */
export function safeCallbackUrl(value: string | string[] | undefined | null): string | null {
  const url = Array.isArray(value) ? value[0] : value
  if (!url || !url.startsWith("/") || url.startsWith("//") || url.includes("\\")) return null
  if (/^\/(login|register|forgot-password|reset-password)(\/|\?|$)/.test(url)) return null
  return url
}

/** Keeps a callback on links between the auth pages. */
export function withCallback(path: string, callbackUrl: string | null) {
  return callbackUrl ? `${path}?callbackUrl=${encodeURIComponent(callbackUrl)}` : path
}

/** Short context line for the sign-in and register pages. */
export function callbackContext(callbackUrl: string | null): "checkout" | "seller" | "account" | null {
  if (!callbackUrl) return null
  if (callbackUrl.startsWith("/checkout") || callbackUrl.startsWith("/cart")) return "checkout"
  if (callbackUrl.startsWith("/vendor/onboarding")) return "seller"
  if (callbackUrl.startsWith("/orders") || callbackUrl.startsWith("/account")) return "account"
  return null
}
