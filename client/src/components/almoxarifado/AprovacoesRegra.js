/**
 * Etapa 47, T7 — as pendências de regra de aprovação na tela de requisições.
 *
 * Contrato: desenho da etapa, 9.5 e 9.7 (`GET /almoxarifado/requisicoes/:id/aprovacoes-regra`,
 * `GET /almoxarifado/aprovacoes-regra/pendentes`, `PUT …/aprovacoes-regra/:pid/aprovar`).
 *
 * Dois componentes, os dois montados SÓ no modo almoxarifado pela RequisicoesList — as rotas vivem
 * sob o prefixo do módulo, e a mesma lista roda em seis rotas de outros módulos sem essa permissão
 * (o achado F1 da Etapa 34: bloco do almoxarifado disparando GET com 403 fora dele).
 *
 * `podeAssinar` aqui é só para a tela não oferecer um botão que certamente será recusado; quem
 * decide é o backend, e a recusa dele aparece com a literal dele.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { FiCheckSquare, FiPenTool } from 'react-icons/fi';
import api from '../../services/api';
import { canConfigureAlmox } from '../../utils/systemPermissions';
import { getEffectiveUser } from '../../services/permissionsCache';

const formatMoeda = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const STATUS_PENDENCIA = {
  ABERTA: 'Aguardando assinatura',
  APROVADA: 'Assinada',
  OBSOLETA: 'Obsoleta (regra desativada)',
};

/**
 * Espelho da RN-07 para a UI: requisicao ainda aguardando, na lista (ou quem configura o modulo),
 * nao solicitante, e nao assinou outra perna. Fase 5 (autorizacao): o status da requisicao entrou
 * (M-2 - rejeitar nao mexe nas pendencias, e o botao aparecia em requisicao rejeitada) e o admin
 * passou a ser quem configura o modulo, como no servidor (I-1).
 */
export function podeAssinar(pendencia, pendencias, requisicao, user) {
  if (!user?.id || pendencia.status !== 'ABERTA') return false;
  if (!['PENDENTE', 'AGUARDANDO_APROVACAO_VALOR'].includes(requisicao.status)) return false;
  if (Number(user.id) === Number(requisicao.solicitante_id)) return false;
  const naLista = (pendencia.aprovadores || []).map(Number).includes(Number(user.id))
    || user.role === 'admin' || canConfigureAlmox(getEffectiveUser(user));
  if (!naLista) return false;
  return !pendencias.some((p) => p.status === 'APROVADA' && Number(p.aprovador_id) === Number(user.id));
}

/** Bloco no detalhe da requisição: cada pendência, e o "Assinar" de quem pode. */
export function AprovacoesRegraRequisicao({ requisicao, user, onAssinado }) {
  const [pendencias, setPendencias] = useState([]);
  const [assinando, setAssinando] = useState(null);

  const carregar = useCallback(async () => {
    try {
      const res = await api.get(`/almoxarifado/requisicoes/${requisicao.id}/aprovacoes-regra`);
      setPendencias(Array.isArray(res.data) ? res.data : []);
    } catch {
      setPendencias([]); // opcional: sem o bloco a tela continua funcional, e o /aprovar barra no servidor
    }
  }, [requisicao.id]);

  // `pendencias_regra_abertas` na dependência: quando o detalhe é recarregado depois de um gesto,
  // o bloco relê junto.
  useEffect(() => { carregar(); }, [carregar, requisicao.pendencias_regra_abertas]);

  const assinar = async (p) => {
    setAssinando(p.id);
    try {
      const res = await api.put(`/almoxarifado/requisicoes/${requisicao.id}/aprovacoes-regra/${p.id}/aprovar`);
      const faltam = res.data?.pendencias_abertas ?? 0;
      toast.success(faltam > 0
        ? `Aprovação da regra "${p.regra_nome}" assinada. Ainda falta(m) ${faltam}.`
        : `Aprovação da regra "${p.regra_nome}" assinada. A requisição já pode ser aprovada.`);
      await carregar();
      if (onAssinado) await onAssinado();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao assinar a aprovação da regra');
    } finally {
      setAssinando(null);
    }
  };

  if (!pendencias.length) return null;

  return (
    <div data-testid="aprovacoes-regra" style={{ border: '1px solid var(--gmp-border)', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
      <div style={{ fontWeight: 700, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        <FiCheckSquare size={13} /> Aprovações de regra
      </div>
      {pendencias.map((p) => (
        <div key={p.id} data-testid={`pendencia-${p.id}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '6px 0', borderTop: '1px solid var(--gmp-border)', fontSize: '0.85rem' }}>
          <div>
            <strong>{p.regra_nome}</strong>
            <span style={{ color: 'var(--gmp-text-light)' }}>
              {' · '}{STATUS_PENDENCIA[p.status] || p.status}
              {p.status === 'APROVADA' && p.aprovador_nome ? ` por ${p.aprovador_nome}` : ''}
            </span>
          </div>
          {podeAssinar(p, pendencias, requisicao, user) && (
            <button type="button" className="btn-almox-primary" onClick={() => assinar(p)} disabled={assinando === p.id}>
              <FiPenTool size={13} /> Assinar
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/** Painel no topo da lista: o que ESTE usuário pode assinar agora. Some quando não há nada. */
export function FilaAprovacoesRegra({ onAbrir, recarregarEm }) {
  const [fila, setFila] = useState([]);

  useEffect(() => {
    let vivo = true;
    api.get('/almoxarifado/aprovacoes-regra/pendentes')
      .then((res) => { if (vivo) setFila((Array.isArray(res.data) ? res.data : []).filter((p) => p.pode_assinar)); })
      .catch(() => { if (vivo) setFila([]); });
    return () => { vivo = false; };
  }, [recarregarEm]);

  if (!fila.length) return null;

  return (
    <div data-testid="fila-aprovacoes-regra" style={{ background: 'rgba(79,172,254,0.06)', border: '1px solid rgba(79,172,254,0.25)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
      <div style={{ fontWeight: 700, fontSize: '0.875rem', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        <FiPenTool size={14} /> Aprovações de regra aguardando você ({fila.length})
      </div>
      {fila.map((p) => (
        <button key={p.id} type="button" onClick={() => onAbrir(p.requisicao_id)}
          style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: 10, background: 'none', border: 'none', borderTop: '1px solid var(--gmp-border)', padding: '6px 0', cursor: 'pointer', textAlign: 'left', fontSize: '0.85rem', color: 'inherit' }}>
          <span><strong>{p.numero}</strong> · {p.regra_nome} · {p.solicitante_nome}</span>
          <span style={{ color: 'var(--gmp-text-light)' }}>{formatMoeda(p.valor_total)}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Etapa 48 (RN-04) — a fila da aprovação SIMPLES: requisições PENDENTE de OUTRA pessoa, sem assinatura
 * de regra aberta. Sem rota nova: é o recorte de `GET /almoxarifado/requisicoes?status=PENDENTE`, com
 * fetch próprio porque a lista principal pode estar filtrada.
 *
 * A requisição com as regras AINDA NÃO AVALIADAS (`regras_avaliadas_em` nulo — o avaliador falhou no
 * envio) FICA na fila, com uma marca: o /aprovar vai reavaliá-la e pode barrar. Escondê-la a deixaria
 * órfã, porque ela também não está na fila de regras (Fase 2 da Etapa 48, IMPORTANT-1).
 *
 * Quem monta decide a permissão (`pode('aprovar_requisicao')`) e o modo almoxarifado.
 */
export function FilaAprovacaoSimples({ user, onAbrir, recarregarEm }) {
  const [fila, setFila] = useState([]);

  useEffect(() => {
    let vivo = true;
    api.get('/almoxarifado/requisicoes', { params: { status: 'PENDENTE' } })
      .then((res) => {
        if (!vivo) return;
        const linhas = Array.isArray(res.data) ? res.data : [];
        setFila(linhas.filter((r) => r.status === 'PENDENTE'
          && Number(r.solicitante_id) !== Number(user?.id)
          && !(Number(r.pendencias_regra_abertas) > 0)));
      })
      .catch(() => { if (vivo) setFila([]); });
    return () => { vivo = false; };
  }, [recarregarEm, user?.id]);

  if (!fila.length) return null;

  return (
    <div data-testid="fila-aprovacao-simples" style={{ background: 'rgba(26,163,74,0.06)', border: '1px solid rgba(26,163,74,0.25)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
      <div style={{ fontWeight: 700, fontSize: '0.875rem', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        <FiCheckSquare size={14} /> Requisições aguardando sua aprovação ({fila.length})
      </div>
      {fila.map((r) => (
        <button key={r.id} type="button" onClick={() => onAbrir(r.id)}
          style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: 10, background: 'none', border: 'none', borderTop: '1px solid var(--gmp-border)', padding: '6px 0', cursor: 'pointer', textAlign: 'left', fontSize: '0.85rem', color: 'inherit' }}>
          <span>
            <strong>{r.numero}</strong> · {r.solicitante_nome}
            {!r.regras_avaliadas_em && (
              <span style={{ color: 'var(--gmp-warning)' }}> · regras ainda não avaliadas — a aprovação vai conferir</span>
            )}
          </span>
          <span style={{ color: 'var(--gmp-text-light)' }}>{formatMoeda(r.valor_total)}</span>
        </button>
      ))}
    </div>
  );
}
