// Coalesce startup and paywall requests; never cache failures/empty results.
// Race before publishing the cache so a timed-out request cannot overwrite a retry.
export function createStoreProductLoader<T>(fetch: () => Promise<T[]>, timeoutMs = 9000) {
  let cached: T[] = [];
  let pending: Promise<T[]> | null = null;
  let disposed = false;
  return {
    load(): Promise<T[]> {
      if (disposed) return Promise.reject(new Error("Store closed"));
      if (cached.length) return Promise.resolve(cached);
      if (pending) return pending;
      let timer: ReturnType<typeof setTimeout>;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("App Store prices timed out")), timeoutMs);
      });
      pending = Promise.race([Promise.resolve().then(fetch), timeout]).then((products) => {
        if (disposed) throw new Error("Store closed");
        if (!products.length) throw new Error("App Store returned no products");
        cached = products;
        return products;
      }).finally(() => {
        clearTimeout(timer);
        pending = null;
      });
      return pending;
    },
    dispose() { disposed = true; cached = []; }
  };
}
