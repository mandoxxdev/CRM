import { useState, useEffect, useMemo } from 'react';
import { getEffectiveUser } from '../services/permissionsCache';
import { fetchComercialResponsaveis } from '../utils/userFilters';

/**
 * Loads comercial responsáveis from /api/usuarios/comercial only.
 * Does not expose options until server list is loaded and ghost-filter confirmed.
 */
export function useComercialResponsaveis(authUser, authLoading = false) {
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);

  const effectiveUser = useMemo(() => getEffectiveUser(authUser), [authUser]);

  useEffect(() => {
    if (authLoading || !authUser?.id) {
      setUsuarios([]);
      setLoading(true);
      setReady(false);
      return undefined;
    }

    let cancelled = false;
    setUsuarios([]);
    setLoading(true);
    setReady(false);

    fetchComercialResponsaveis(effectiveUser)
      .then((list) => {
        if (cancelled) return;
        setUsuarios(Array.isArray(list) ? list : []);
        setReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setUsuarios([]);
        setReady(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, authUser?.id, effectiveUser?.id, effectiveUser?.is_superadmin]);

  return { usuarios, loading, ready };
}
