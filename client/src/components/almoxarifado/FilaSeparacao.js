import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiRefreshCw, FiAlertTriangle, FiInbox, FiExternalLink } from 'react-icons/fi';
import api from '../../services/api';
import AlmoxPageHeader from './AlmoxPageHeader';
import { formatarErroPermissao } from '../../utils/permissaoErro';
import './Almoxarifado.css';

/**
 * Etapa 64 (RN-04): a fila de separação do almoxarife — só leitura.
 *
 * Consome `GET /almoxarifado/fila-separacao` (gate `separar_emitir`, contrato congelado no plano
 * da etapa). Pontos que a tela NÃO pode errar:
 *
 * - A ORDEM é do servidor (acionável primeiro; urgência; data de necessidade; FIFO). A tela não
 *   reordena — só separa visualmente as não acionáveis num grupo "Aguardando", preservando a
 *   ordem relativa de cada grupo.
 * - Uma requisição pode ter várias etapas ao mesmo tempo (`etapas: []`): um chip por etapa.
 * - Quem separou não confere (`posso_conferir === false`): o chip "Conferir" diz isso, senão o
 *   almoxarife clica e toma 403 na conferência.
 * - 403 vira painel de permissão, nunca "fila vazia" — fila vazia é afirmação de que não há
 *   trabalho, e a resposta errada mais enganosa aqui.
 * - "Abrir" leva à tela de requisições de sempre (`?id=`), que abre o detalhe — a fila não tem
 *   regra nova de separar/entregar.
 */

const ETAPA_INFO = {
  SEPARAR: { label: 'Separar', cls: 'aberto' },
  APROVACAO_VALOR: { label: 'Aguardando aprovação de valor', cls: 'baixo' },
  AGUARDANDO_SALDO: { label: 'Aguardando saldo', cls: 'zerado' },
  CONFERIR: { label: 'Conferir', cls: 'devolucao' },
  REABRIR_SEPARACAO: { label: 'Separar de novo para conferir', cls: 'estorno' },
  // Etapa 94 (B460): legado com tudo separado num status pré-separação — "Iniciar Separação" sem quantidade.
  RETOMAR_SEPARACAO: { label: 'Reabrir separação', cls: 'estorno' },
  ENTREGAR: { label: 'Entregar', cls: 'ok' },
  // Fase 5: conferência pendente numa requisição já PRONTA_PARA_RETIRADA, que não pode voltar
  // à separação — não acionável, só o administrador resolve.
  CONFERENCIA_SEM_SAIDA: { label: 'Conferência pendente — peça ao administrador', cls: 'zerado' },
};

const URGENCIA_INFO = {
  CRITICO: { label: 'Crítico', cls: 'critico' },
  URGENTE: { label: 'Urgente', cls: 'baixo' },
  NORMAL: { label: 'Normal', cls: 'zerado' },
};

const fmtQtd = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
};

// 'YYYY-MM-DD' (ou ISO) -> 'DD/MM/AAAA' sem passar por Date: new Date('2026-10-05') é UTC e
// no fuso de Brasília vira o dia anterior.
const fmtData = (s) => {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(s);
};

export const rotuloEtapa = (etapa, req) => {
  const info = ETAPA_INFO[etapa];
  const base = info ? info.label : etapa;
  if (
    etapa === 'CONFERIR'
    && req.posso_conferir === false
    && req.conferencia_pendente
    && req.status === 'EM_SEPARACAO'
  ) {
    return `${base} — você separou, peça a outra pessoa`;
  }
  return base;
};

const descricaoItem = (it) => {
  const un = it.unidade ? ` ${it.unidade}` : '';
  const partes = [];
  if (Number(it.a_separar) > 0) {
    partes.push(`a separar ${fmtQtd(it.a_separar)}${un} (separável agora ${fmtQtd(it.separavel)})`);
  }
  if (Number(it.a_entregar) > 0) {
    // `entregavel` = o separado limitado ao disponível (Fase 5): é o que sai agora.
    partes.push(`a entregar ${fmtQtd(it.a_entregar)}${un} (entregável agora ${fmtQtd(it.entregavel)})`);
  }
  partes.push(`disponível ${fmtQtd(it.disponivel)}`);
  if (it.origem_separacao_codigo) {
    partes.push(`separado de ${it.origem_separacao_codigo}${it.lote_separacao_codigo ? ` — ${it.lote_separacao_codigo}` : ''}`);
  }
  return partes.join(' · ');
};

// Etapa 188 (RN-188.08 com as emendas C1, I1, M2, M5): a dica de onde pegar. Só exibe o que o servidor calculou — a tela não
// escolhe endereço nem reordena (B821: os itens ficam na ordem do pedido; a ordem de percurso é `ordem_coleta`).
export const textoPegarEm = (it) => {
  const p = it.pegar_em;
  if (!p) return null;
  const un = it.unidade ? ` ${it.unidade}` : '';
  const caminho = p.caminho && String(p.caminho).includes(' / ') ? ` (${p.caminho})` : '';
  const lote = p.lote_codigo ? ` — lote ${p.lote_codigo}` : '';
  const vence = p.lote_codigo && p.lote_validade ? ` (vence ${fmtData(p.lote_validade)})` : '';
  return `Pegar em ${p.localizacao_codigo}${caminho}${lote}${vence} · ${fmtQtd(p.quantidade_sugerida)}${un}`
    + " — escolha este endereço no 'Sai de' ao separar";
};

// Etapa 188, Fase 5 (I-b): com LOTE, trocar a origem e entregar no automático deixa uma linha sem lote negativa (o automático não
// escolhe lote — defeito anterior, B204/C71). A frase manda escolher o lote no "Sai de" da entrega em vez de prometer a saída automática.
const NA_ENTREGA_ESCOLHA_O_LOTE = " Na entrega, escolha o lote no 'Sai de': a saída automática não escolhe lote.";
const codigoDaPlanejada = (it) => {
  const cod = it.origem_separacao_codigo || (it.pegar_em && it.pegar_em.localizacao_codigo) || '—';
  return it.lote_separacao_codigo ? `${cod} — lote ${it.lote_separacao_codigo}` : cod;
};

export const textoAvisoPegarEm = (it) => {
  switch (it.pegar_em_aviso) {
    case 'NENHUM_ENDERECO_COBRE':
      return `Nenhum endereço tem tudo: pegue ${fmtQtd(it.pegar_em ? it.pegar_em.quantidade_sugerida : 0)} aqui. `
        + 'Separar o resto de outro endereço depois troca a origem da separação.'
        + (it.pegar_em && it.pegar_em.lote_codigo ? NA_ENTREGA_ESCOLHA_O_LOTE : '');
    case 'PLANEJADA_NAO_COBRE':
      return `Já separado de ${codigoDaPlanejada(it)}: o resto não cabe lá. `
        + (it.lote_separacao_codigo ? `Separar de outro endereço troca a origem da separação.${NA_ENTREGA_ESCOLHA_O_LOTE}`
          : 'Separar de outro endereço troca a origem da separação (a entrega passa a sair automática).');
    case 'PLANEJADA_INDISPONIVEL':
      // Fase 5 (M-d): a planejada existe mas não serve mais de dica — "o resto não cabe lá" seria mentira.
      return `Já separado de ${codigoDaPlanejada(it)}, que não pode mais ser sugerido (endereço bloqueado ou inativo, em área `
        + 'especial ou lote bloqueado/vencido). Confira antes de separar o resto: separar de outro endereço troca a origem da separação'
        + (it.lote_separacao_codigo ? `.${NA_ENTREGA_ESCOLHA_O_LOTE}` : ' (a entrega passa a sair automática).');
    case 'SEM_ENDERECO_SUGERIVEL':
      return 'Sem endereço para sugerir (o saldo está sem endereço, em endereço bloqueado ou inativo, em área especial '
        + 'ou em lote bloqueado/vencido).';
    default:
      return null;
  }
};

// Fase 5 (I-a): a retenção (inspeção, bloqueio, terceiros) é do material, não do endereço — o sistema não sabe onde estão as retidas.
export const textoAlertaPegarEm = (it) => (it.pegar_em && it.pegar_em_alerta === 'RETENCAO_NO_MATERIAL'
  ? 'Parte do saldo deste material está retida (em inspeção, bloqueada ou em terceiros) e o sistema não sabe em qual endereço — '
    + 'confira antes de pegar.'
  : null);

const PainelErro = ({ titulo, mensagem, onTentarNovamente, testid }) => (
  <div
    data-testid={testid}
    style={{
      marginBottom: 16,
      padding: '14px 18px',
      borderRadius: 10,
      border: '1px solid rgba(239, 68, 68, 0.35)',
      background: 'rgba(239, 68, 68, 0.08)',
      color: 'var(--gmp-text)',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 16,
      flexWrap: 'wrap',
    }}
  >
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <FiAlertTriangle size={18} style={{ color: '#ef4444', flexShrink: 0, marginTop: 2 }} />
      <div>
        <strong style={{ display: 'block', marginBottom: 4 }}>{titulo}</strong>
        {mensagem && <span style={{ fontSize: '0.9rem', color: 'var(--gmp-text-light)' }}>{mensagem}</span>}
      </div>
    </div>
    {onTentarNovamente && (
      <button type="button" className="btn-almox-secondary" onClick={onTentarNovamente}>
        <FiRefreshCw size={13} /> Tentar novamente
      </button>
    )}
  </div>
);

const LinhaFila = ({ req, onAbrir }) => {
  const urg = URGENCIA_INFO[String(req.urgencia || '').toUpperCase()] || URGENCIA_INFO.NORMAL;
  const data = fmtData(req.data_necessidade);
  const separadores = (req.separadores || []).map((s) => s.nome).filter(Boolean);
  const solicitante = [req.solicitante_nome, req.setor].filter(Boolean).join(' · ');
  return (
    <li
      className="almox-card"
      data-testid={`fila-req-${req.id}`}
      style={{
        listStyle: 'none',
        padding: '12px 16px',
        marginBottom: 10,
        borderRadius: 10,
        border: '1px solid var(--gmp-border, rgba(0,0,0,0.1))',
        background: 'var(--gmp-surface, transparent)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <strong data-testid="fila-numero">{req.numero || `#${req.id}`}</strong>
            <span className={`almox-badge almox-badge-${urg.cls}`} data-testid="fila-urgencia">{urg.label}</span>
            <span style={{ fontSize: '0.85rem', color: 'var(--gmp-text-light)' }}>
              {data ? `Necessário em ${data}` : 'Sem data de necessidade'}
            </span>
          </div>
          {solicitante && (
            <div style={{ fontSize: '0.85rem', color: 'var(--gmp-text-light)', marginTop: 4 }}>{solicitante}</div>
          )}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {(req.etapas || []).map((etapa) => (
              <span
                key={etapa}
                className={`almox-badge almox-badge-${(ETAPA_INFO[etapa] || {}).cls || 'ajuste'}`}
                data-testid={`fila-etapa-${etapa}`}
              >
                {rotuloEtapa(etapa, req)}
              </span>
            ))}
          </div>
          {separadores.length > 0 && (
            <div style={{ fontSize: '0.85rem', marginTop: 6 }} data-testid="fila-separadores">
              Separado por: {separadores.join(', ')}
            </div>
          )}
        </div>
        <button type="button" className="btn-almox-primary" onClick={() => onAbrir(req.id)} data-testid={`fila-abrir-${req.id}`}>
          <FiExternalLink size={13} /> Abrir
        </button>
      </div>
      {(req.itens || []).length > 0 && (
        <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: '0.88rem' }}>
          {req.itens.map((it) => {
            const pegarEm = textoPegarEm(it);
            const aviso = textoAvisoPegarEm(it);
            const alerta = textoAlertaPegarEm(it);
            return (
              <li key={it.item_id} data-testid={`fila-item-${it.item_id}`}>
                <strong>{it.material_codigo}</strong> — {it.material_nome}: {descricaoItem(it)}
                {pegarEm && (
                  <div data-testid={`fila-pegar-em-${it.item_id}`} style={{ marginTop: 2 }}>{pegarEm}</div>
                )}
                {alerta && (
                  <div
                    data-testid={`fila-pegar-em-alerta-${it.item_id}`}
                    style={{ marginTop: 2, color: 'var(--gmp-warning, #b45309)' }}
                  >
                    {alerta}
                  </div>
                )}
                {aviso && (
                  <div
                    data-testid={`fila-pegar-em-aviso-${it.item_id}`}
                    style={{ marginTop: 2, color: 'var(--gmp-text-light)' }}
                  >
                    {aviso}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {Array.isArray(req.ordem_coleta) && req.ordem_coleta.length >= 2 && (
        <div data-testid={`fila-ordem-coleta-${req.id}`} style={{ marginTop: 10, fontSize: '0.88rem' }}>
          <strong>Ordem de coleta</strong>
          <ol style={{ margin: '4px 0 0', paddingLeft: 22 }}>
            {req.ordem_coleta.map((p) => (
              <li key={p.item_id}>
                {`${p.caminho} — ${p.material_codigo} · ${fmtQtd(p.quantidade_sugerida)}${p.lote_codigo ? ` — lote ${p.lote_codigo}` : ''}`}
              </li>
            ))}
          </ol>
        </div>
      )}
    </li>
  );
};

const FilaSeparacao = () => {
  const navigate = useNavigate();
  const [fila, setFila] = useState([]);
  const [loading, setLoading] = useState(true);
  const [semPermissao, setSemPermissao] = useState(null); // null | { detalhe }
  const [erro, setErro] = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    setSemPermissao(null);
    try {
      const res = await api.get('/almoxarifado/fila-separacao');
      setFila(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setFila([]);
      const status = err.response?.status;
      if (status === 403) {
        setSemPermissao({ detalhe: formatarErroPermissao(err.response?.data) });
      } else if (!err.response) {
        setErro('Não foi possível conectar ao servidor.');
      } else {
        setErro(err.response?.data?.error || 'Não foi possível carregar a fila de separação.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const abrir = (id) => navigate(`/almoxarifado/requisicoes?id=${id}`);

  // Filtra preservando a ordem do servidor dentro de cada grupo.
  const acionaveis = fila.filter((r) => r.acionavel !== false);
  const aguardando = fila.filter((r) => r.acionavel === false);

  return (
    <div className="almox-page">
      <AlmoxPageHeader
        title="Fila de separação"
        subtitle="O que separar, conferir e entregar agora — na ordem de urgência, necessidade e chegada."
        breadcrumbs={[{ label: 'Fila de separação' }]}
        actions={(
          <button type="button" className="btn-almox-secondary" onClick={carregar} disabled={loading} data-testid="fila-atualizar">
            <FiRefreshCw size={13} /> Atualizar
          </button>
        )}
      />

      {semPermissao ? (
        <PainelErro
          testid="fila-sem-permissao"
          titulo="Você não tem permissão para a fila de separação."
          mensagem={semPermissao.detalhe}
        />
      ) : erro ? (
        <PainelErro testid="fila-erro" titulo="Não foi possível carregar a fila" mensagem={erro} onTentarNovamente={carregar} />
      ) : loading && fila.length === 0 ? (
        <p data-testid="fila-carregando">Carregando…</p>
      ) : fila.length === 0 ? (
        <div className="almox-empty" data-testid="fila-vazia">
          <FiInbox size={28} />
          <p>Nada para separar ou entregar agora.</p>
        </div>
      ) : (
        <>
          {acionaveis.length > 0 && (
            <ul style={{ padding: 0, margin: 0 }} data-testid="fila-acionaveis">
              {acionaveis.map((r) => <LinhaFila key={r.id} req={r} onAbrir={abrir} />)}
            </ul>
          )}
          {aguardando.length > 0 && (
            <section style={{ marginTop: 20 }} data-testid="fila-aguardando">
              <h2 style={{ fontSize: '1rem', marginBottom: 8 }}>Aguardando</h2>
              <ul style={{ padding: 0, margin: 0 }}>
                {aguardando.map((r) => <LinhaFila key={r.id} req={r} onAbrir={abrir} />)}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
};

export default FilaSeparacao;
