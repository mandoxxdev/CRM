import { lerInstanteDoBanco } from '../../utils/dataLocal';

/**
 * Etapa 161 (RN-161.06, C397) — o `created_at` (e os outros `CURRENT_TIMESTAMP`/`datetime('now')`) mostrado na hora LOCAL.
 *
 * O banco grava `'AAAA-MM-DD HH:MM:SS'` em UTC e sem fuso; `new Date(texto)` o lia como hora local (3 h adiantada no Brasil: o ato das
 * 22h30 de 19/10 aparecia 20/10 01:30). `lerInstanteDoBanco` le como UTC; ISO com `Z` continua como esta. Vazio -> `vazio`; valor que
 * nao vira data aparece CRU (nao some — como a Auditoria). As `opcoes` sao as do `toLocaleDateString` de cada tela (com ou sem hora).
 */
export function formatarInstanteDoBanco(valor, opcoes, vazio = '—') {
  if (valor === null || valor === undefined || valor === '') return vazio;
  const d = lerInstanteDoBanco(valor);
  if (!d) return String(valor);
  return d.toLocaleDateString('pt-BR', opcoes);
}

export default formatarInstanteDoBanco;
