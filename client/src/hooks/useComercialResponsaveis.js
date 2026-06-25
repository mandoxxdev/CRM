import { useState, useEffect, useRef } from 'react';
import { getEffectiveUser } from '../services/permissionsCache';
import { fetchComercialResponsaveis } from '../utils/userFilters';

/**
 * Loads comercial responsáveis from /api/usuarios/comercial only.
 * Does not expose options until server list is loaded.
 * Shared 60s client cache + inflight dedupe prevent SQLITE_BUSY bursts.
 */
export function useComercialResponsaveis(authUser, authLoading = false) {
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const fetchGen = useRef(0);

  useEffect(() => {
    if (authLoading || !authUser?.id) {
      setUsuarios([]);
      setLoading(true);
      setReady(false);
      return undefined;
    }

    const gen = fetchGen.current + 1;
    fetchGen.current = gen;
    let cancelled = false;

    setUsuarios([]);
    setLoading(true);
    setReady(false);

    const actor = getEffectiveUser(authUser);
    const timer = setTimeout(() => {
      fetchComercialResponsaveis(actor)
        .then((list) => {
          if (cancelled || fetchGen.current !== gen) return;
          setUsuarios(Array.isArray(list) ? list : []);
          setReady(true);
        })
        .catch(() => {
          if (cancelled || fetchGen.current !== gen) return;
          setUsuarios([]);
          setReady(true);
        })
        .finally(() => {
          if (!cancelled && fetchGen.current === gen) setLoading(false);
        });
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [authLoading, authUser?.id, authUser?.is_superadmin]);

  return { usuarios, loading, ready };
}
