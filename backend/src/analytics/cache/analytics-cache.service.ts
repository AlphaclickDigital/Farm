import { Injectable } from '@nestjs/common';

interface Entry {
  expires: number;
  value: Promise<unknown>;
}

const DEFAULT_TTL_MS = Number(process.env.ANALYTICS_CACHE_TTL_MS ?? 60_000);
const MAX_ENTRIES = 1000;

// Short-lived in-process cache for analytics aggregates. Keys are namespaced
// `vendor:<id>:...` or `admin:...` so a write affecting one vendor clears that
// vendor's figures plus the marketplace-wide ones, and nothing else. The
// promise itself is cached so concurrent identical requests share one query.
@Injectable()
export class AnalyticsCacheService {
  private store = new Map<string, Entry>();

  wrap<T>(
    key: string,
    compute: () => Promise<T>,
    ttlMs = DEFAULT_TTL_MS,
  ): Promise<T> {
    const now = Date.now();
    const hit = this.store.get(key);
    if (hit && hit.expires > now) return hit.value as Promise<T>;

    const value = compute();
    this.store.set(key, { expires: now + ttlMs, value });
    value.catch(() => this.store.delete(key));
    if (this.store.size > MAX_ENTRIES) this.prune(now);
    return value;
  }

  static key(scope: string, name: string, params: object = {}) {
    const sorted = Object.keys(params)
      .sort()
      .map(
        (k) => `${k}=${String((params as Record<string, unknown>)[k] ?? '')}`,
      )
      .join('&');
    return `${scope}:${name}:${sorted}`;
  }

  invalidateVendor(vendorId: string) {
    this.deletePrefix(`vendor:${vendorId}:`);
    this.deletePrefix('admin:');
  }

  invalidateVendors(vendorIds: Iterable<string>) {
    for (const id of vendorIds) this.deletePrefix(`vendor:${id}:`);
    this.deletePrefix('admin:');
  }

  invalidateAdmin() {
    this.deletePrefix('admin:');
  }

  private deletePrefix(prefix: string) {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  private prune(now: number) {
    for (const [key, entry] of this.store) {
      if (entry.expires <= now) this.store.delete(key);
    }
    // Still over budget: drop oldest insertions first.
    while (this.store.size > MAX_ENTRIES) {
      const oldest = this.store.keys().next().value;
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }
  }
}
