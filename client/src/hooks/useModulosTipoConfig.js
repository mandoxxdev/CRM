import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

let cachedConfig = null;
let cachePromise = null;

export function useModulosTipoConfig() {
  const [tipoOverrides, setTipoOverrides] = useState(cachedConfig);
  const [loading, setLoading] = useState(cachedConfig === null);

  const refresh = useCallback(async () => {
    try {
      const res = await api.get('/config/modulos-tipo');
      cachedConfig = res.data || {};
      setTipoOverrides(cachedConfig);
      return cachedConfig;
    } catch {
      cachedConfig = {};
      setTipoOverrides({});
      return {};
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (cachedConfig !== null) {
      setTipoOverrides(cachedConfig);
      setLoading(false);
      return;
    }
    if (!cachePromise) {
      cachePromise = refresh().finally(() => { cachePromise = null; });
    } else {
      cachePromise.then((data) => {
        setTipoOverrides(data);
        setLoading(false);
      });
    }
  }, [refresh]);

  const updateModuloTipo = useCallback(async (moduloId, tipoSetor) => {
    const res = await api.put(`/config/modulos-tipo/${moduloId}`, { tipo_setor: tipoSetor });
    const updated = { ...(cachedConfig || {}), [moduloId]: res.data.tipo_setor };
    cachedConfig = updated;
    setTipoOverrides(updated);
    return res.data;
  }, []);

  return { tipoOverrides: tipoOverrides || {}, loading, refresh, updateModuloTipo };
}

export function invalidateModulosTipoCache() {
  cachedConfig = null;
  cachePromise = null;
}
