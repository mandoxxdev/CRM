const CHUNK_RELOAD_KEY = 'orion_chunk_reload';
const CHUNK_RELOAD_COUNT_KEY = 'orion_chunk_reload_count';
const MAX_PRODUCTION_RELOADS = 3;
const RECOVERY_LOCK_KEY = 'orion_chunk_recovery_lock';

let recoveryPromise = null;

export function isChunkLoadError(error) {
  const msg = error?.message || String(error);
  return (
    msg.includes('Loading chunk') ||
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('ChunkLoadError') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('error loading dynamically imported module')
  );
}

export function clearChunkReloadFlag() {
  try {
    sessionStorage.removeItem(CHUNK_RELOAD_KEY);
    sessionStorage.removeItem(CHUNK_RELOAD_COUNT_KEY);
    sessionStorage.removeItem(RECOVERY_LOCK_KEY);
  } catch {
    /* ignore */
  }
}

/** Call once on successful app boot so the next chunk error can auto-reload again. */
export function markChunkRecoveryReady() {
  clearChunkReloadFlag();
}

async function clearServiceWorkerCaches() {
  if (!('caches' in window)) return;
  try {
    const names = await caches.keys();
    await Promise.all(names.map((name) => caches.delete(name)));
  } catch {
    /* ignore */
  }
}

async function prepareHardReload() {
  await clearServiceWorkerCaches();

  if ('serviceWorker' in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.update()));
    } catch {
      /* ignore */
    }
  }
}

function hardReload() {
  const url = new URL(window.location.href);
  url.searchParams.set('_cb', String(Date.now()));
  window.location.replace(url.toString());
}

function getReloadCount() {
  try {
    return parseInt(sessionStorage.getItem(CHUNK_RELOAD_COUNT_KEY) || '0', 10);
  } catch {
    return 0;
  }
}

/**
 * Attempt automatic recovery for stale/missing chunks (single flight — avoids race with ErrorBoundary).
 * @returns {Promise<'reload' | 'show-prompt'>}
 */
export async function attemptChunkRecovery() {
  if (recoveryPromise) {
    return recoveryPromise;
  }

  recoveryPromise = (async () => {
    const isDev = process.env.NODE_ENV === 'development';

    try {
      if (sessionStorage.getItem(RECOVERY_LOCK_KEY)) {
        return 'show-prompt';
      }
      sessionStorage.setItem(RECOVERY_LOCK_KEY, '1');
    } catch {
      /* continue */
    }

    const reloadCount = getReloadCount();
    const maxReloads = isDev ? 99 : MAX_PRODUCTION_RELOADS;

    if (reloadCount < maxReloads) {
      try {
        sessionStorage.setItem(CHUNK_RELOAD_COUNT_KEY, String(reloadCount + 1));
        sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
      } catch {
        /* ignore */
      }

      await prepareHardReload();
      hardReload();
      return 'reload';
    }

    try {
      sessionStorage.removeItem(RECOVERY_LOCK_KEY);
    } catch {
      /* ignore */
    }

    return 'show-prompt';
  })();

  try {
    return await recoveryPromise;
  } finally {
    recoveryPromise = null;
  }
}

export function lazyImportWithRecovery(factory) {
  return factory().catch(async (err) => {
    if (!isChunkLoadError(err)) {
      throw err;
    }
    const action = await attemptChunkRecovery();
    if (action === 'reload') {
      return new Promise(() => {});
    }
    throw err;
  });
}
