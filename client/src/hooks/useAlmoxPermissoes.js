import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { toast } from 'react-toastify';
import { formatarErroPermissao } from '../utils/permissaoErro';

/**
 * O que o usuário logado pode fazer no módulo Almoxarifado.
 *
 * Serve para barrar a ação ANTES de abrir um formulário — sem isto o usuário preenche as
 * seis seções do cadastro de material e só descobre que não podia no Salvar.
 *
 * A decisão NÃO é calculada aqui: vem resolvida de GET /almoxarifado/minhas-permissoes,
 * que usa o mesmo `can()` dos middlewares. Espelhar a tabela ACAO_PERFIS no front criaria
 * duas fontes de verdade que divergiriam na primeira mudança de regra.
 *
 * Isto é conveniência de interface, NÃO segurança: o bloqueio real continua no backend
 * (requirePermission). Se este hook falhar em carregar, ele deixa passar de propósito —
 * a rota devolve 403 e o interceptor do axios mostra o toast. Falhar fechado aqui
 * esconderia ações de quem tem permissão por causa de um erro de rede.
 */

let cache = null;      // { perfil, acoes }
let inflight = null;

async function carregar() {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = api.get('/almoxarifado/minhas-permissoes')
    .then((res) => {
      cache = res.data || { perfil: null, acoes: {} };
      return cache;
    })
    .catch(() => ({ perfil: null, acoes: {} }))  // sem cache: tenta de novo na próxima
    .finally(() => { inflight = null; });
  return inflight;
}

/** Descarta o cache — use depois de trocar o perfil de alguém. */
export function invalidarAlmoxPermissoes() {
  cache = null;
}

export function useAlmoxPermissoes() {
  const [dados, setDados] = useState(cache);
  const [loading, setLoading] = useState(cache === null);

  useEffect(() => {
    let vivo = true;
    if (cache) { setDados(cache); setLoading(false); return undefined; }
    carregar().then((d) => {
      if (!vivo) return;
      setDados(d);
      setLoading(false);
    });
    return () => { vivo = false; };
  }, []);

  const perfil = dados?.perfil || null;

  /**
   * Enquanto carrega (ou se a carga falhou) devolve true: melhor deixar clicar e receber o
   * 403 do servidor do que esconder ação de quem pode.
   */
  const pode = useCallback((acao) => {
    if (!dados?.acoes) return true;
    const v = dados.acoes[acao];
    return v === undefined ? true : v;
  }, [dados]);

  /**
   * Guard para onClick. Se não pode, mostra o MESMO texto que o backend produziria no 403
   * (formatarErroPermissao) e devolve false — quem chama aborta a navegação.
   *
   *   onClick={(e) => { if (!bloquearSeNaoPode('criar_material', e)) return; navigate(...) }}
   */
  const bloquearSeNaoPode = useCallback((acao, evento) => {
    if (pode(acao)) return true;
    if (evento?.preventDefault) evento.preventDefault();
    toast.error(
      formatarErroPermissao({ acao, perfil })
      || 'Sem permissão para esta operação.'
    );
    return false;
  }, [pode, perfil]);

  return { perfil, pode, bloquearSeNaoPode, loading };
}
