import React, { useCallback, useEffect, useState } from 'react';
import {
  FiAlertOctagon, FiAlertTriangle, FiCheckSquare, FiChevronDown, FiChevronUp, FiRefreshCw,
} from 'react-icons/fi';
import { toast } from 'react-toastify';
import api from '../../services/api';
import { SkeletonTable } from '../SkeletonLoader';
import { useAlmoxPermissoes } from '../../hooks/useAlmoxPermissoes';
import { formatarErroPermissao } from '../../utils/permissaoErro';
import AnexosDocumento from './AnexosDocumento';
import './Almoxarifado.css';

/**
 * Etapa 43, T5 — a tela do documento numerado de não conformidade (features 08 + 09).
 *
 * O que esta tela É: a lista dos documentos que nascem sozinhos quando a conferência/o fiscal
 * registra quantidade diferente da esperada (origem RECEBIMENTO) ou quando a inspeção reprova
 * (origem INSPECAO), mais a porta de DECIDIR o que se faz com cada um. Sem ela, a Etapa 43
 * repetiria o erro da feature 07: backend correto que ninguém alcança porque não existe botão.
 *
 * Quatro regras que este arquivo TEM de respeitar, e o porquê de cada uma:
 *
 * 1. **`limite`, nunca `limit`.** Convenção medida do módulo (`inspectionService.js:455`,
 *    `reportRegistry.js`, `auditFiltros.js`). Com `limit`, o parâmetro seria ignorado em
 *    silêncio e o usuário receberia 100 linhas achando que recebeu tudo. O serviço clampa em
 *    500 sem erro, então o rodapé abaixo da tabela avisa quando a lista chegou no teto pedido.
 *
 * 2. **Falha de carga NÃO deixa a lista anterior na tela.** Defeito que a Etapa 35 consertou nas
 *    telas irmãs (e a Etapa 11 antes dela, achado 1/Critical): gravar `[]` ou manter o array
 *    velho faz um 403 de perfil parecer fato operacional ("não há não conformidade"), que é a
 *    pior mentira possível numa tela cuja razão de existir é dizer que HÁ problema. Aqui o
 *    `catch` zera para `null` e o painel de erro ocupa o lugar da tabela.
 *
 * 3. **Os enums são repetidos aqui, de propósito.** Nenhuma rota publica `NC_DECISOES` para o
 *    client — é o mesmo desenho das demais telas do módulo (`ENCAMINHAMENTOS` de
 *    `InspecoesAlmoxarifado.js`, `TIPOS` de `AnexosDocumento.js`). O servidor valida de novo e a
 *    mensagem literal (`Decisão inválida`) é dele.
 *
 * 4. **O gate de UI falha ABERTO.** `useAlmoxPermissoes` deixa clicar quando a carga de
 *    permissões falhou, e quem decide de verdade é o `requirePermission('decidir_nao_
 *    conformidade')` do servidor. Aqui o botão só some por STATUS (NC encerrada não se decide de
 *    novo — RN-06, 409); por PERFIL ele continua visível e o clique mostra o 403 traduzido.
 *
 * O que esta tela NÃO faz, e é escolha registrada (letra B), não esquecimento:
 *
 * - **Não oferece abertura manual de NC.** A rota existe (`POST /nao-conformidades`, gate
 *   `registrar_nao_conformidade`) e o T6 a exercita por HTTP, mas o payload dela exige
 *   `referencia_tipo` + `referencia_id` — o id do ITEM de recebimento ou da INSPEÇÃO —, e
 *   nenhuma tela do módulo hoje mostra esses ids para escolher. Oferecer um campo numérico cru
 *   seria convidar a pendurar o documento no registro errado, que é exatamente o que a guarda
 *   `Number.isInteger` do serviço existe para evitar. O caminho reversível é este: a NC nasce
 *   pelos três ganchos (D4), e a abertura manual ganha porta no dia em que a tela de recebimento
 *   tiver um botão "abrir NC deste item" — uma linha, com o id em mãos.
 * - ~~**Não move estoque** (D7): decidir `DEVOLVER` não cria devolução, `SUCATEAR` não baixa
 *   saldo. O documento registra o que se decidiu, com autor e justificativa.~~
 *   **ISTO DEIXOU DE VALER PELA METADE, e fica corrigido à vista em vez de apagado.** Desde a
 *   Etapa 44, decidir **Aceitar** ou **Aceitar sob desvio** numa NC de inspeção **libera** o
 *   material que a reprovação havia bloqueado — e o toast de sucesso passa a dizer quanto saiu do
 *   bloqueio. `DEVOLVER`, `SUBSTITUICAO`, `ANALISE_ENGENHARIA` e `SUCATEAR` continuam só marcando
 *   intenção, e o toast diz isso também (*"Esta decisão não altera o saldo"*), porque um silêncio
 *   ali faria as duas coisas parecerem iguais — que foi o furo C57.
 */

const ROTA = '/almoxarifado/nao-conformidades';

// Teto pedido ao servidor. O serviço clampa em 500 sem erro; 200 é o que cabe numa tela de fila
// sem virar rolagem infinita, e o rodapé avisa quando a lista encosta neste número.
const LIMITE_LISTA = 200;

const STATUS_FILTROS = [
  { valor: '', rotulo: 'Todos os status' },
  { valor: 'ABERTA', rotulo: 'Abertas' },
  { valor: 'DECIDIDA', rotulo: 'Decididas' },
  { valor: 'CANCELADA', rotulo: 'Canceladas' },
];

const ORIGEM_FILTROS = [
  { valor: '', rotulo: 'Todas as origens' },
  { valor: 'RECEBIMENTO', rotulo: 'Recebimento' },
  { valor: 'INSPECAO', rotulo: 'Inspeção' },
];

// Os seis do enum `NC_DECISOES` (nonConformityService.js:45). Os três do meio são os
// `ENCAMINHAMENTOS` que a inspeção já usa — reusados, não reinventados.
const DECISOES = [
  { valor: 'ACEITAR', rotulo: 'Aceitar' },
  { valor: 'ACEITAR_SOB_DESVIO', rotulo: 'Aceitar sob desvio' },
  { valor: 'DEVOLVER', rotulo: 'Devolver ao fornecedor' },
  { valor: 'SUBSTITUICAO', rotulo: 'Substituição' },
  { valor: 'ANALISE_ENGENHARIA', rotulo: 'Análise da Engenharia' },
  { valor: 'SUCATEAR', rotulo: 'Sucatear' },
];

const ROTULO_DECISAO = Object.fromEntries(DECISOES.map((d) => [d.valor, d.rotulo]));

const ROTULO_ORIGEM = { RECEBIMENTO: 'Recebimento', INSPECAO: 'Inspeção' };

const ROTULO_TIPO = {
  QUANTIDADE: 'Quantidade',
  DIMENSIONAL: 'Dimensional',
  CERTIFICADO_AUSENTE: 'Certificado ausente',
  DANO_FISICO: 'Dano físico',
  MATERIAL_INCORRETO: 'Material incorreto',
  OUTRO: 'Outro',
};

const ROTULO_STATUS = { ABERTA: 'Aberta', DECIDIDA: 'Decidida', CANCELADA: 'Cancelada' };

// Timestamps do SQLite chegam em UTC sem sufixo ("YYYY-MM-DD HH:MM:SS") — sem o 'Z' o V8 leria
// como hora local e a NC decidida às 22h apareceria no dia seguinte. Mesmo ajuste de
// AlertasAlmoxarifado.js/ConferenciaEstoque.js.
const formatDataHora = (valor) => {
  if (!valor) return '—';
  const iso = typeof valor === 'string' && valor.includes(' ') && !valor.includes('T')
    ? `${valor.replace(' ', 'T')}Z` : valor;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(valor);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const formatNum = (v) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 4 }));

// Mesmo painel de erro por estado das telas irmãs (AlertasAlmoxarifado.js, ReposicaoAlmoxarifado.js,
// NotificacoesAlmoxarifado.js) — o módulo não pode ganhar um sétimo jeito de dizer "os dados não
// carregaram". Ver a regra 2 do cabeçalho.
const PainelErroCarga = ({ mensagem, onTentarNovamente }) => (
  <div
    data-testid="nc-erro-carga"
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

const FORM_DECISAO_VAZIO = { decisao: '', justificativa: '' };

const NaoConformidadesAlmoxarifado = () => {
  const { perfil, pode, bloquearSeNaoPode } = useAlmoxPermissoes();

  // `null` = nada carregado (ou carga falhou). `[]` = carregou e não há NC. Os dois estados
  // PRECISAM ser distintos — ver a regra 2 do cabeçalho.
  const [itens, setItens] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [statusFiltro, setStatusFiltro] = useState('ABERTA');
  const [origemFiltro, setOrigemFiltro] = useState('');
  const [recarga, setRecarga] = useState(0);
  const [expandida, setExpandida] = useState(null);

  const [decisaoTarget, setDecisaoTarget] = useState(null);
  const [decisaoForm, setDecisaoForm] = useState(FORM_DECISAO_VAZIO);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      // Regra 1: `limite`, nunca `limit`.
      const params = { limite: LIMITE_LISTA };
      if (statusFiltro) params.status = statusFiltro;
      if (origemFiltro) params.origem = origemFiltro;
      const res = await api.get(ROTA, { params });
      setItens(res.data?.itens || []);
    } catch (err) {
      // Regra 2: NÃO grava [] aqui — seria o mesmo shape de "nenhuma não conformidade".
      // ⚠️ MEDIDO na sabotagem desta task: tirar esta linha sozinha NÃO derruba teste nenhum,
      // porque quem esconde a lista velha é a PRECEDÊNCIA do `erro ?` no render abaixo. Ela fica
      // como segunda trava, para o dia em que alguém reordenar aquele ternário — mas o próximo a
      // ler isto precisa saber que a garantia está no render, não aqui.
      setItens(null);
      const mensagem = formatarErroPermissao(err.response?.data)
        || err.response?.data?.error
        || 'Não foi possível carregar as não conformidades';
      setErro(mensagem);
      toast.error(mensagem);
    } finally {
      setLoading(false);
    }
  }, [statusFiltro, origemFiltro]);

  useEffect(() => { carregar(); }, [carregar, recarga]);

  const abrirDecisao = (nc) => {
    setDecisaoTarget(nc);
    setDecisaoForm(FORM_DECISAO_VAZIO);
  };

  const submeterDecisao = async () => {
    if (!decisaoForm.decisao) {
      toast.error('Escolha a decisão');
      return;
    }
    // Justificativa obrigatória (RN-06). O servidor recusa com 400 e a mensagem literal
    // "Justificativa é obrigatória para decidir a não conformidade"; barrar aqui evita a viagem
    // de ida e volta — e é o único registro de POR QUE se aceitou/devolveu, que é a razão de o
    // documento existir.
    if (!decisaoForm.justificativa.trim()) {
      toast.error('Justificativa é obrigatória para decidir a não conformidade');
      return;
    }
    setSalvando(true);
    try {
      const resp = await api.post(`${ROTA}/${decisaoTarget.id}/decidir`, {
        decisao: decisaoForm.decisao,
        justificativa: decisaoForm.justificativa.trim(),
      });
      // O QUE ACONTECEU COM O SALDO, dito na tela. Sem isto, decidir "aceito sob desvio" e ver a
      // linha virar DECIDIDA parece idêntico a decidir "devolver" — e foi exatamente esse silêncio
      // que criou o furo C57: a decisão que libera material e a que só marca intenção eram
      // indistinguíveis para quem clica.
      //
      // A mensagem vem PRONTA do servidor, nunca montada aqui. Montá-la no client exigiria uma
      // segunda cópia das regras de qual decisão libera, em qual origem, com qual quantidade — e
      // no dia em que as duas divergissem a tela mentiria sobre o saldo, que é o defeito que este
      // aviso existe para evitar. Mesmo critério, já escrito, da pré-visualização de tolerância
      // que a B60 vetou.
      //
      // O `?.` não é decoração: um servidor anterior a esta versão não manda o campo, e
      // concatenar `undefined` mostraria "decidida! undefined" no lugar do aviso.
      const mensagemSaldo = resp?.data?.liberacao?.mensagem;
      toast.success(`Não conformidade ${decisaoTarget.numero} decidida!${mensagemSaldo ? ` ${mensagemSaldo}` : ''}`);
      setDecisaoTarget(null);
      // ⚠️ Achado 11 da revisão adversarial: com o filtro em "Abertas" (o padrão), a NC recém
      // decidida deixa de casar o filtro e a linha SOME junto com o toast — a pessoa decide e a
      // tabela fica vazia, sem nada dizendo que deu certo. Pior num documento cujo valor é
      // justamente ficar: quem acabou de decidir quer VER a decisão gravada, com o próprio nome.
      // Então a tela larga o filtro de status e mostra tudo; o de origem continua onde estava,
      // porque ele não esconde o que você acabou de fazer.
      if (statusFiltro === 'ABERTA') setStatusFiltro('');
      setRecarga((n) => n + 1);
    } catch (err) {
      toast.error(
        formatarErroPermissao(err.response?.data)
        || err.response?.data?.error
        || 'Erro ao decidir a não conformidade',
      );
    } finally {
      setSalvando(false);
    }
  };

  const lista = itens || [];
  const abertas = lista.filter((nc) => nc.status === 'ABERTA').length;

  return (
    <div className="almox-page">
      <div className="almox-header">
        <div>
          <h1><FiAlertOctagon size={20} /> Não Conformidades</h1>
          <p>
            Divergências de recebimento e reprovações de inspeção viram documento numerado (NC-…),
            com o fato congelado na abertura e a decisão gravada com autor e justificativa.
          </p>
        </div>
        <div className="almox-header-actions">
          <button className="btn-almox-secondary" onClick={() => setRecarga((n) => n + 1)}>
            <FiRefreshCw size={13} /> Atualizar
          </button>
        </div>
      </div>

      <div className="almox-filters">
        <select
          className="almox-select"
          aria-label="Filtrar por status"
          value={statusFiltro}
          onChange={(e) => { setExpandida(null); setStatusFiltro(e.target.value); }}
        >
          {STATUS_FILTROS.map((s) => <option key={s.valor || 'todos'} value={s.valor}>{s.rotulo}</option>)}
        </select>
        {/*
          O filtro de ORIGEM existe porque o serviço sempre aceitou `origem` e a tela nunca o
          enviava — achado 12 da revisão adversarial: o roteiro de teste manual mandava "filtre
          por origem Inspeção" e não havia onde. Separar o que veio do recebimento do que veio da
          qualidade é a primeira coisa que quem opera pergunta.
        */}
        <select
          className="almox-select"
          aria-label="Filtrar por origem"
          value={origemFiltro}
          onChange={(e) => { setExpandida(null); setOrigemFiltro(e.target.value); }}
        >
          {ORIGEM_FILTROS.map((o) => <option key={o.valor || 'todas'} value={o.valor}>{o.rotulo}</option>)}
        </select>
        {!loading && !erro && (
          <span style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>
            {lista.length} documento{lista.length !== 1 ? 's' : ''}
            {statusFiltro !== 'ABERTA' && abertas > 0 ? ` · ${abertas} em aberto` : ''}
          </span>
        )}
      </div>

      {erro ? (
        <PainelErroCarga mensagem={erro} onTentarNovamente={() => setRecarga((n) => n + 1)} />
      ) : loading || itens === null ? (
        <div className="almox-table-container"><SkeletonTable rows={6} columns={7} /></div>
      ) : lista.length === 0 ? (
        <div className="almox-table-container">
          <div className="almox-empty">
            <p>
              {statusFiltro
                ? `Nenhuma não conformidade ${ROTULO_STATUS[statusFiltro]?.toLowerCase() || ''}`.trim()
                : 'Nenhuma não conformidade registrada'}
            </p>
          </div>
        </div>
      ) : (
        <div className="almox-table-container">
          <table className="almox-table">
            <thead>
              <tr>
                <th>Número</th>
                <th>Material</th>
                <th>Origem</th>
                <th>Tipo</th>
                <th>O fato</th>
                <th>Status</th>
                <th>Decisão</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((nc) => {
                const aberto = expandida === nc.id;
                return (
                  <React.Fragment key={nc.id}>
                    <tr data-testid={`nc-linha-${nc.id}`}>
                      <td style={{ whiteSpace: 'nowrap', fontWeight: 700 }}>{nc.numero}</td>
                      <td>
                        <div>{nc.material_nome || '—'}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)' }}>
                          {nc.material_codigo || '—'}
                          {nc.recebimento_numero ? ` · ${nc.recebimento_numero}` : ''}
                          {nc.nota_fiscal ? ` · NF ${nc.nota_fiscal}` : ''}
                        </div>
                      </td>
                      <td>{ROTULO_ORIGEM[nc.origem] || nc.origem}</td>
                      <td>{ROTULO_TIPO[nc.tipo] || nc.tipo}</td>
                      {/* O fato é CONGELADO na abertura (D2) e vem PRONTO do servidor: a tela
                          NUNCA refaz `recebida − esperada`. Duas cópias da régua acabam
                          divergindo — é a mesma B60 que veta o pré-cálculo na tela de inspeção. */}
                      <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                        {nc.quantidade_esperada == null && nc.quantidade_recebida == null ? '—' : (
                          <>
                            <div>Esperada {formatNum(nc.quantidade_esperada)} · Recebida {formatNum(nc.quantidade_recebida)}</div>
                            <div style={{ fontWeight: 700, color: 'var(--gmp-error)' }}>
                              Divergência {formatNum(nc.divergencia)}
                            </div>
                          </>
                        )}
                      </td>
                      <td>
                        <span className={`almox-badge almox-badge-nc-${String(nc.status || '').toLowerCase()}`}>
                          {ROTULO_STATUS[nc.status] || nc.status}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.8rem' }}>
                        {nc.decisao ? (
                          <>
                            <div>{ROTULO_DECISAO[nc.decisao] || nc.decisao}</div>
                            <div style={{ color: 'var(--gmp-text-light)' }}>
                              {nc.decidido_por_nome || '—'} · {formatDataHora(nc.decidido_em)}
                            </div>
                          </>
                        ) : nc.status === 'CANCELADA' ? (
                          <div style={{ color: 'var(--gmp-text-light)' }}>
                            Cancelada em {formatDataHora(nc.cancelado_em)}
                          </div>
                        ) : '—'}
                      </td>
                      <td>
                        <div className="almox-actions">
                          {/* Só para NC ABERTA: decidir de novo é 409 (RN-06), e botão que
                              produz erro garantido é armadilha, não gate. O gate de PERFIL fica
                              no clique (falha aberto — regra 4 do cabeçalho). */}
                          {nc.status === 'ABERTA' && (
                            <button
                              type="button"
                              className="almox-btn-icon"
                              title="Decidir a não conformidade"
                              onClick={(e) => {
                                if (!bloquearSeNaoPode('decidir_nao_conformidade', e)) return;
                                abrirDecisao(nc);
                              }}
                            >
                              <FiCheckSquare />
                            </button>
                          )}
                          <button
                            type="button"
                            className="almox-btn-icon"
                            title="Detalhes e anexos"
                            aria-expanded={aberto}
                            onClick={() => setExpandida(aberto ? null : nc.id)}
                          >
                            {aberto ? <FiChevronUp /> : <FiChevronDown />}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {aberto && (
                      <tr data-testid={`nc-detalhe-${nc.id}`}>
                        <td colSpan={8}>
                          <div style={{ padding: '4px 2px 10px' }}>
                            <p style={{ margin: '0 0 8px', fontSize: '0.85rem' }}>
                              <strong>Descrição:</strong> {nc.descricao || '—'}
                            </p>
                            {nc.justificativa && (
                              <p style={{ margin: '0 0 8px', fontSize: '0.85rem' }}>
                                <strong>Justificativa da decisão:</strong> {nc.justificativa}
                              </p>
                            )}
                            {nc.motivo_cancelamento && (
                              <p style={{ margin: '0 0 8px', fontSize: '0.85rem' }}>
                                <strong>Motivo do cancelamento:</strong> {nc.motivo_cancelamento}
                              </p>
                            )}
                            <p style={{ margin: '0 0 8px', fontSize: '0.78rem', color: 'var(--gmp-text-light)' }}>
                              Aberta por {nc.aberto_por_nome || (nc.aberto_automaticamente ? 'gancho automático' : '—')}
                              {nc.aberto_automaticamente ? ' (automática)' : ''} em {formatDataHora(nc.created_at)}
                            </p>
                            {/* Entidade `nao_conformidade` — laudo, foto da peça, relatório
                                dimensional, e-mail do fornecedor. A entidade entra no mapa do
                                servidor (`anexoService.ENTIDADES_ANEXO`) pela T4; até ela subir,
                                o bloco existe e o GET responde 400 "Entidade inválida para
                                anexo", que o próprio AnexosDocumento mostra à vista. */}
                            <AnexosDocumento entidade="nao_conformidade" entidadeId={nc.id} titulo="Anexos" />
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          {lista.length >= LIMITE_LISTA && (
            <p style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)', padding: '8px 12px', margin: 0 }}>
              Mostrando as primeiras {LIMITE_LISTA} — use o filtro de status para reduzir a lista.
            </p>
          )}
        </div>
      )}

      {decisaoTarget && (
        <div className="almox-modal-overlay" onClick={() => { if (!salvando) setDecisaoTarget(null); }}>
          <div className="almox-modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="almox-modal-header">
              <h2>Decidir {decisaoTarget.numero}</h2>
              <button className="almox-modal-close" onClick={() => setDecisaoTarget(null)}>✕</button>
            </div>
            <div className="almox-modal-body">
              <p style={{ marginTop: 0 }}>
                <strong>{decisaoTarget.material_nome || 'Material não identificado'}</strong>
                {decisaoTarget.material_codigo ? ` (${decisaoTarget.material_codigo})` : ''}
                {' — '}
                {ROTULO_TIPO[decisaoTarget.tipo] || decisaoTarget.tipo}
                {' · '}
                {ROTULO_ORIGEM[decisaoTarget.origem] || decisaoTarget.origem}
                {decisaoTarget.divergencia != null && (
                  <>
                    <br />
                    <span style={{ fontSize: '0.82rem', color: 'var(--gmp-text-light)' }}>
                      Esperada {formatNum(decisaoTarget.quantidade_esperada)} · Recebida{' '}
                      {formatNum(decisaoTarget.quantidade_recebida)} · Divergência{' '}
                      {formatNum(decisaoTarget.divergencia)}
                    </span>
                  </>
                )}
              </p>
              {/*
                ⚠️ ESTE PARÁGRAFO É LIDO PELO USUÁRIO NO INSTANTE EM QUE ELE DECIDE — é o único
                lugar da tela que explica o que a decisão faz com o saldo, e por isso ele TEM de
                acompanhar a regra.

                Até a Etapa 44 ele dizia "A decisão fecha o DOCUMENTO, não o estoque … o material
                reprovado continua bloqueado até alguém com ajustar_estoque desbloqueá-lo" — o
                enunciado literal do furo C57. A Etapa 44 fechou o furo e, na primeira passada,
                corrigiu só o comentário de cabeçalho deste arquivo: o texto VISÍVEL ficou
                afirmando o contrário do que o sistema passou a fazer, e o roteiro de apresentação
                mandava abrir justamente este modal. A revisão adversarial pegou.

                Lição que fica escrita aqui: comentário de código corrigido não corrige a tela.
                O cenário `(21)` de `NaoConformidadesAlmoxarifado.test.js` prende esta frase.
              */}
              <p style={{ fontSize: '0.78rem', color: 'var(--gmp-text-light)', marginTop: 0 }}>
                <strong>Aceitar</strong> e <strong>Aceitar sob desvio</strong> liberam o material
                que esta inspeção deixou bloqueado. As outras quatro decisões registram a intenção
                e <strong>não mexem no saldo</strong> — devolver não cria a devolução e sucatear
                não baixa estoque. O aviso ao confirmar diz o que aconteceu.
              </p>
              <div className="almox-field">
                <label className="almox-label">Decisão<span className="required">*</span></label>
                <select
                  className="almox-form-select"
                  value={decisaoForm.decisao}
                  onChange={(e) => setDecisaoForm((f) => ({ ...f, decisao: e.target.value }))}
                >
                  <option value="">Selecionar decisão...</option>
                  {DECISOES.map((d) => <option key={d.valor} value={d.valor}>{d.rotulo}</option>)}
                </select>
              </div>
              <div className="almox-field">
                <label className="almox-label">Justificativa<span className="required">*</span></label>
                <textarea
                  className="almox-input"
                  rows={3}
                  value={decisaoForm.justificativa}
                  placeholder="Por que esta decisão? É o que fica no documento para quem auditar depois."
                  onChange={(e) => setDecisaoForm((f) => ({ ...f, justificativa: e.target.value }))}
                />
              </div>
              {!pode('decidir_nao_conformidade') && (
                <p style={{ fontSize: '0.78rem', color: 'var(--gmp-warning)', margin: 0 }}>
                  {formatarErroPermissao({ acao: 'decidir_nao_conformidade', perfil })
                    || 'Seu perfil provavelmente não pode decidir não conformidade.'}
                </p>
              )}
            </div>
            <div className="almox-modal-footer">
              <button className="btn-almox-secondary" onClick={() => setDecisaoTarget(null)}>Cancelar</button>
              <button className="btn-almox-primary" disabled={salvando} onClick={submeterDecisao}>
                {salvando ? 'Salvando...' : 'Registrar decisão'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NaoConformidadesAlmoxarifado;
