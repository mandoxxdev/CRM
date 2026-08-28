import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { FiAlertTriangle, FiRefreshCw, FiChevronDown, FiChevronUp } from 'react-icons/fi';
import { SkeletonTable } from '../SkeletonLoader';
import { useAlmoxPermissoes } from '../../hooks/useAlmoxPermissoes';
import { formatarErroPermissao } from '../../utils/permissaoErro';
import './Almoxarifado.css';

/**
 * Etapa 16, Task 3 — tela `/almoxarifado/alertas` contra o contrato congelado C1 do plano
 * (docs/superpowers/plans/2026-08-28-almoxarifado-etapa16-alertas.md; design
 * docs/superpowers/specs/2026-08-28-almoxarifado-etapa16-alertas-design.md, "Central no front").
 *
 * A central é AO VIVO (RN-05): cada abertura reavalia o MESMO registro que a varredura diária
 * usa — condição resolvida some daqui mesmo que a notificação antiga continue na fila de
 * Notificações. Nenhuma régua é recalculada no cliente (lição G6 herdada da Etapa 11): a tela
 * só renderiza o array `alertas` NA ORDEM em que o servidor manda (ordem do ALERT_REGISTRY).
 *
 * O badge mostra `total`, nunca `linhas.length` — o C1 corta `linhas` em 50 com o total cheio.
 * Entrada com `erro: true` vira aviso visível no cartão (decisão do C1: central parcial
 * honesta, um `listar` quebrado não pode sumir em silêncio nem derrubar os demais).
 */

// Mesmo painel de erro por estado da Etapa 11 (achado 1, Critical, medido pelos dois
// revisores) — copiado de ReposicaoAlmoxarifado.js/NotificacoesAlmoxarifado.js para o módulo
// não ganhar dois jeitos diferentes de dizer "os dados não carregaram". Um 403 de perfil NUNCA
// pode virar "nenhum alerta": PRODUCAO leria isso como fato operacional. O botão de retry é
// opcional porque o gate visual (sem `ver_alertas`) usa o mesmo painel e ali tentar de novo
// não muda o perfil de ninguém.
const PainelErroCarga = ({ mensagem, onTentarNovamente }) => (
  <div
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
        <strong style={{ display: 'block', marginBottom: 4 }}>Dados indisponíveis no momento</strong>
        <span style={{ fontSize: '0.9rem', color: 'var(--gmp-text-light)' }}>{mensagem}</span>
      </div>
    </div>
    {onTentarNovamente && (
      <button type="button" className="btn-almox-secondary" onClick={onTentarNovamente}>
        <FiRefreshCw size={14} /> Tentar novamente
      </button>
    )}
  </div>
);

// Timestamps do SQLite vem em UTC sem sufixo ("YYYY-MM-DD HH:MM:SS") — mesmo ajuste de
// ConferenciaEstoque.js/ReposicaoAlmoxarifado.js (sem o 'Z', o V8 leria como hora local).
// Data PURA ("YYYY-MM-DD" — data_validade, data_necessidade, expira_em) precisa de
// timeZone:'UTC' explicito: sem isso, meia-noite UTC vira o dia ANTERIOR no fuso do Brasil
// (achado Major da revisao da etapa; mesmo antidoto de RelatoriosAlmoxarifado.formatCelula).
const RE_DATA_SO = /^\d{4}-\d{2}-\d{2}$/;
const formatData = (d) => {
  if (!d) return '—';
  if (typeof d === 'string' && RE_DATA_SO.test(d)) {
    return new Date(`${d}T00:00:00Z`).toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC',
    });
  }
  const iso = typeof d === 'string' && d.includes(' ') && !d.includes('T') ? `${d.replace(' ', 'T')}Z` : d;
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
};

const formatMoeda = (v) => (v === null || v === undefined
  ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));

const formatNum = (v) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 4 }));

// `linhas` é o objeto CRU da condição e os campos variam por alerta (contrato C1) — o front
// trata por chave. Cada entrada aqui espelha os campos que o registro do servidor
// (services/almoxarifado/alertRegistry.js) põe no corpo do e-mail do MESMO alerta, para a
// central e a caixa de entrada contarem a mesma história.
const COLUNAS_POR_CHAVE = {
  CALIBRACAO_VENCENDO: [
    { titulo: 'Ferramenta', render: (l) => l.nome || '—' },
    { titulo: 'Patrimônio', render: (l) => l.codigo_patrimonio || '—' },
    { titulo: 'Validade', render: (l) => (l.data_validade ? formatData(l.data_validade) : 'Nunca calibrada') },
    { titulo: 'Dias restantes', render: (l) => (l.dias_restantes ?? '—') },
  ],
  ESTOQUE_SEM_CONSUMO: [
    { titulo: 'Material', render: (l) => `${l.codigo} — ${l.nome}` },
    { titulo: 'Quantidade', render: (l) => `${formatNum(l.quantidade_atual)} ${l.unidade || ''}`.trim() },
    { titulo: 'Última saída', render: (l) => (l.ultima_saida ? formatData(l.ultima_saida) : 'Nunca') },
    { titulo: 'Valor parado', render: (l) => formatMoeda(l.valor_parado) },
  ],
  ESTOQUE_EXCESSIVO: [
    { titulo: 'Material', render: (l) => `${l.codigo} — ${l.nome}` },
    { titulo: 'Qtd. atual', render: (l) => `${formatNum(l.quantidade_atual)} ${l.unidade || ''}`.trim() },
    { titulo: 'Qtd. máxima', render: (l) => formatNum(l.quantidade_maxima) },
    { titulo: 'Valor parado', render: (l) => formatMoeda(l.valor_parado) },
  ],
  QUARENTENA_PARADA: [
    { titulo: 'Material', render: (l) => `${l.material_codigo} — ${l.material_nome}` },
    { titulo: 'Recebimento', render: (l) => `${l.recebimento_numero || '—'}${l.nota_fiscal ? ` (NF ${l.nota_fiscal})` : ''}` },
    { titulo: 'Qtd. retida', render: (l) => `${formatNum(l.quantidade_retida)} ${l.material_unidade || ''}`.trim() },
    { titulo: 'Entrada', render: (l) => formatData(l.data_entrada) },
  ],
  // Linha AGREGADA por design (C3): { total, materiais: [até 20] } — alerta por material seria
  // ruído em massa.
  MATERIAL_SEM_ENDERECO: [
    { titulo: 'Total sem endereço', render: (l) => formatNum(l.total) },
    { titulo: 'Primeiros materiais', render: (l) => (l.materiais || []).map((m) => `${m.codigo} — ${m.nome}`).join(', ') || '—' },
  ],
  REQUISICAO_ATRASADA: [
    { titulo: 'Requisição', render: (l) => l.numero || `#${l.id}` },
    { titulo: 'Solicitante', render: (l) => l.solicitante_nome || '—' },
    { titulo: 'Status', render: (l) => l.status || '—' },
    { titulo: 'Necessidade', render: (l) => formatData(l.data_necessidade) },
  ],
  RESERVA_PARADA: [
    { titulo: 'Reserva', render: (l) => `#${l.id}` },
    { titulo: 'Material', render: (l) => `${l.material_codigo} — ${l.material_nome}` },
    { titulo: 'Quantidade', render: (l) => `${formatNum(l.quantidade)} ${l.material_unidade || ''}`.trim() },
    { titulo: 'Criada em', render: (l) => formatData(l.created_at) },
    { titulo: 'Expira em', render: (l) => formatData(l.expira_em) },
  ],
  // ── Etapa 17 (C2): as 4 chaves novas. As colunas espelham os campos que o `listar` do
  // servidor REALMENTE devolve (alertRegistry.js, `listarReprovados` /
  // `listarDivergenciasRecebimento` / `listarDivergenciaConferencia` / o SELECT de lotes) e a
  // ordem do corpo do e-mail do MESMO alerta — as três primeiras chegam aqui pelos dois
  // caminhos (gancho no ato e varredura de rede), então central e caixa de entrada precisam
  // contar a mesma história.
  MATERIAL_REPROVADO: [
    { titulo: 'Material', render: (l) => `${l.material_codigo} — ${l.material_nome}` },
    { titulo: 'Qtd. reprovada', render: (l) => formatNum(l.quantidade_reprovada) },
    { titulo: 'Encaminhamento', render: (l) => l.encaminhamento || '—' },
    { titulo: 'Recebimento', render: (l) => `${l.recebimento_numero || '—'}${l.nota_fiscal ? ` (NF ${l.nota_fiscal})` : ''}` },
    // data_inspecao é DATETIME UTC do SQLite — formatData põe o 'Z' antes de ler.
    { titulo: 'Inspeção em', render: (l) => formatData(l.data_inspecao) },
    { titulo: 'Responsável', render: (l) => l.responsavel_nome || '—' },
  ],
  // `divergencia` vem CALCULADA do servidor (recebida − esperada, mesma régua float-safe do
  // filtro) — a tela nunca refaz a conta (lição G6: régua única, do lado de lá).
  DIVERGENCIA_RECEBIMENTO: [
    { titulo: 'Material', render: (l) => `${l.material_codigo} — ${l.material_nome}` },
    { titulo: 'Qtd. esperada', render: (l) => formatNum(l.quantidade_esperada) },
    { titulo: 'Qtd. recebida', render: (l) => formatNum(l.quantidade_recebida) },
    { titulo: 'Divergência', render: (l) => formatNum(l.divergencia) },
    { titulo: 'Recebimento', render: (l) => `${l.recebimento_numero || '—'}${l.nota_fiscal ? ` (NF ${l.nota_fiscal})` : ''}` },
  ],
  // Linha AGREGADA por conferência (RN-05) e SEM impacto_financeiro — o servidor não seleciona
  // o valor de propósito (B30: e-mail vaza para caixa de entrada; o valor é gateado por
  // `inventario` no relatório), então a central também não tem coluna de valor.
  DIVERGENCIA_INVENTARIO: [
    { titulo: 'Conferência', render: (l) => l.numero || `#${l.conferencia_id}` },
    { titulo: 'Concluída em', render: (l) => formatData(l.data_fim) },
    { titulo: 'Itens divergentes', render: (l) => formatNum(l.itens_divergentes) },
  ],
  // O status entra porque o lote sem certificado NASCE `BLOQUEADO` (receiptService/lotService)
  // — sem a coluna, o alerta pareceria falar de um lote disponível para consumo.
  LOTE_SEM_CERTIFICADO: [
    { titulo: 'Lote', render: (l) => l.codigo || `#${l.id}` },
    { titulo: 'Material', render: (l) => `${l.material_codigo} — ${l.material_nome}` },
    { titulo: 'Saldo', render: (l) => `${formatNum(l.saldo)} ${l.material_unidade || ''}`.trim() },
    { titulo: 'Status', render: (l) => l.status || '—' },
  ],
};

// Alerta que o registro do servidor ganhar amanhã e esta tabela ainda não conhecer não pode
// sumir nem quebrar: colunas derivadas dos campos da primeira linha, valor cru.
const colunasGenericas = (linhas) => {
  const primeira = linhas && linhas[0];
  if (!primeira) return [];
  return Object.keys(primeira).slice(0, 6).map((k) => ({
    titulo: k.replace(/_/g, ' '),
    render: (l) => {
      const v = l[k];
      if (v == null) return '—';
      return typeof v === 'object' ? JSON.stringify(v) : String(v);
    },
  }));
};

const AlertasAlmoxarifado = () => {
  const { pode, perfil, loading: permissoesCarregando } = useAlmoxPermissoes();
  // Gate VISUAL apenas (a decisão de verdade é do requirePermission no servidor): barra antes
  // do GET para o perfil sem `ver_alertas` não ver nem o esqueleto da central. O hook falha
  // ABERTO de propósito — se a carga de permissões falhou, deixa buscar e o 403 do servidor
  // cai no painel de erro abaixo.
  const podeVer = pode('ver_alertas');

  const [alertas, setAlertas] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null); // { status, mensagem } — achado 1 da Etapa 11
  const [reload, setReload] = useState(0);
  const [abertos, setAbertos] = useState({}); // chave -> bool

  const carregar = useCallback(() => {
    let cancelado = false;
    if (permissoesCarregando || !podeVer) { setLoading(false); return undefined; }
    setLoading(true);
    setErro(null);
    api.get('/almoxarifado/alertas/central')
      .then((r) => { if (!cancelado) setAlertas(r.data?.alertas || []); })
      .catch((err) => {
        if (cancelado) return;
        // Achado 1 (Critical, medido na Etapa 11): NAO grava [] aqui — seria o mesmo shape de
        // "nenhum alerta" e a tela mentiria estado operacional para um 403 de perfil.
        setAlertas(null);
        const mensagem = err.response?.data?.error || 'Não foi possível carregar a central de alertas';
        setErro({ status: err.response?.status, mensagem });
        toast.error(mensagem);
      })
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [permissoesCarregando, podeVer]);

  useEffect(() => carregar(), [carregar, reload]);

  const semPermissao = !permissoesCarregando && !podeVer;

  return (
    <div className="almox-page">
      <div className="almox-header">
        <div>
          <h1><FiAlertTriangle size={20} /> Alertas</h1>
          <p>Central de alertas operacionais — avaliação ao vivo das condições que a varredura diária notifica</p>
        </div>
        <div className="almox-header-actions">
          <button className="btn-almox-secondary" onClick={() => setReload((t) => t + 1)} disabled={semPermissao}>
            <FiRefreshCw size={13} /> Atualizar
          </button>
        </div>
      </div>

      {semPermissao ? (
        <PainelErroCarga
          mensagem={formatarErroPermissao({ acao: 'ver_alertas', perfil })
            || 'Sem permissão para ver a central de alertas. Solicite acesso a um administrador.'}
        />
      ) : erro ? (
        <PainelErroCarga mensagem={erro.mensagem} onTentarNovamente={() => setReload((t) => t + 1)} />
      ) : loading || alertas === null ? (
        <div className="almox-table-container"><SkeletonTable rows={6} columns={4} /></div>
      ) : alertas.length === 0 ? (
        <div className="almox-table-container">
          <div className="almox-empty"><p>Nenhum alerta cadastrado no registro do servidor</p></div>
        </div>
      ) : (
        <>
          <p style={{ fontSize: '0.78rem', color: 'var(--gmp-text-light)', margin: '0 0 12px' }}>
            Resolver a condição (entregar a requisição, calibrar a ferramenta...) tira o alerta
            daqui na hora — a fila da tela de Notificações não muda (RN-05).
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {alertas.map((a) => {
              const aberto = !!abertos[a.chave];
              const linhas = a.linhas || [];
              const colunas = COLUNAS_POR_CHAVE[a.chave] || colunasGenericas(linhas);
              return (
                <div
                  key={a.chave}
                  data-testid={`alerta-card-${a.chave}`}
                  style={{ background: 'var(--gmp-surface)', border: '1px solid var(--gmp-border)', borderRadius: 10, padding: '14px 18px' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--gmp-text)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        {a.titulo}
                        {!a.erro && (
                          <span
                            data-testid={`alerta-total-${a.chave}`}
                            className={`almox-badge ${a.total > 0 ? 'almox-badge-critico' : 'almox-badge-ok'}`}
                          >
                            {a.total}
                          </span>
                        )}
                        {a.dias != null && (
                          <span className="almox-badge almox-badge-baixo" title="Janela configurada em Configurações Gerais">
                            {a.dias} dias
                          </span>
                        )}
                      </div>
                      {a.descricao && (
                        <div style={{ fontSize: '0.78rem', color: 'var(--gmp-text-light)', marginTop: 4 }}>{a.descricao}</div>
                      )}
                    </div>
                    {!a.erro && linhas.length > 0 && (
                      <button
                        type="button"
                        className="btn-almox-secondary"
                        style={{ flexShrink: 0 }}
                        aria-expanded={aberto}
                        onClick={() => setAbertos((s) => ({ ...s, [a.chave]: !s[a.chave] }))}
                      >
                        {aberto ? <FiChevronUp size={13} /> : <FiChevronDown size={13} />} Detalhes
                      </button>
                    )}
                  </div>

                  {a.erro && (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, fontSize: '0.82rem', color: 'var(--gmp-warning)' }}>
                      <FiAlertTriangle size={14} style={{ flexShrink: 0 }} />
                      Não foi possível avaliar este alerta agora — os demais continuam válidos.
                      Tente atualizar; persistindo, avise o administrador.
                    </div>
                  )}

                  {aberto && !a.erro && linhas.length > 0 && (
                    <div className="almox-table-container" style={{ marginTop: 12 }}>
                      <table className="almox-table">
                        <thead>
                          <tr>{colunas.map((c) => <th key={c.titulo}>{c.titulo}</th>)}</tr>
                        </thead>
                        <tbody>
                          {linhas.map((linha, i) => (
                            <tr key={linha.id ?? i}>
                              {colunas.map((c) => <td key={c.titulo}>{c.render(linha)}</td>)}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {linhas.length < a.total && (
                        <p style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)', padding: '8px 12px', margin: 0 }}>
                          Mostrando as primeiras {linhas.length} de {a.total} — o badge acima é o número cheio.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default AlertasAlmoxarifado;
