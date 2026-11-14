import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { FiRefreshCw, FiFileText, FiCornerUpLeft } from 'react-icons/fi';
import { SkeletonTable } from '../SkeletonLoader';
import { useAlmoxPermissoes } from '../../hooks/useAlmoxPermissoes';
import { gerarPosicaoClientePDF } from '../../utils/posicaoClientePdf';
// Etapa 199 (RN-199.01, C448): a quantidade no formato do papel da posicao (pt-BR, ate 4 casas, vazio -> 0). Nao os formatNum locais de
// outras telas: mostram um travessao para vazio, e o papel mostra 0.
import { formatarQuantidade } from '../../utils/pdfTexto';
import { situacaoDoLote } from '../../utils/situacaoDoLote';
import { fraseDoLoteDasSeries } from '../../utils/loteDasSeries';
import './Almoxarifado.css';

/**
 * Materiais de Clientes (Etapa 8, Task 8).
 *
 * Até a Etapa 8 material de cliente vivia numa ilha (`materiais_cliente_almoxarifado`) sem tela
 * nenhuma — nem interface para alimentá-la existiu. Agora ele é material normal com dono
 * (`materiais_almoxarifado.proprietario_cliente_id`), e esta tela é a leitura consolidada disso:
 * escolher o cliente traz recebido, consumido, devolvido e saldo, onde cada item foi aplicado, o
 * PDF de posição e o botão de devolver ao cliente.
 *
 * Escolher o cliente primeiro, depois listar — mesma forma de `LotesAlmoxarifado` (o GET é por
 * cliente). Os números vêm do LIVRO de movimentações (`clienteEstoqueService`), não de colunas
 * acumuladoras: era o que a ilha fazia, e coluna acumuladora que diverge em silêncio já custou
 * caro neste projeto.
 *
 * O `useEffect` da posição carrega com flag `cancelado`, e aqui isso vale mais que de costume:
 * trocar de cliente antes da resposta chegar, sem a guarda, pinta o saldo de um cliente sob o
 * nome de outro — não é bug de UI, é informação errada sobre patrimônio de terceiro.
 *
 * "Devolver ao cliente" chama a rota DEDICADA (`POST /materiais-cliente/devolucoes`), não a v2
 * genérica: `DEVOLUCAO_CLIENTE` exige material com dono e número do documento de devolução, e a
 * v2 não tem como exigir documento sem exigir de todos os tipos. Não confundir com
 * `/almoxarifado/devolucoes` (Etapa 7), onde o material VOLTA para o estoque — aqui ele SAI do
 * prédio de volta para quem é dele.
 */
// Etapa 235 (Fase 2, achado 3): literal congelada no plano.
const FRASE_EXIGE_LOTE = 'Este material tem controle por lote: a devolução pede o lote, e esta janela ainda não o oferece.';

const MateriaisClienteAlmoxarifado = () => {
  const { bloquearSeNaoPode } = useAlmoxPermissoes();
  const [clientes, setClientes] = useState([]);
  const [clienteId, setClienteId] = useState('');
  const [posicao, setPosicao] = useState(null);
  const [loading, setLoading] = useState(false);
  // `reloadToken` é o gatilho de "recarregar com o mesmo cliente" (botão Atualizar e depois de
  // cada devolução) — `clienteId` sozinho não muda, então não dispararia o efeito.
  const [reloadToken, setReloadToken] = useState(0);

  const [devTarget, setDevTarget] = useState(null);
  const [devQtd, setDevQtd] = useState('');
  const [devDoc, setDevDoc] = useState('');
  const [devSaving, setDevSaving] = useState(false);
  // Etapa 235 (B1538): material com série — as séries em estoque para marcar. Até a 235 a janela não as oferecia e o servidor recusava
  // a devolução ("informe 1 serie(s)"): material de cliente com série não era devolvível por aqui.
  const [devSeries, setDevSeries] = useState([]);
  const [devSerieIds, setDevSerieIds] = useState([]);
  // Fase 2 (235, achado 3): material com controle de lote — a devolução pede o lote e esta janela ainda não tem seletor (D (235) 1); o
  // servidor recusaria sempre ("exige lote"). A janela diz antes, em vez de oferecer séries que nunca saem.
  const exigeLoteSemSeletor = devTarget?.controle_lote === 1;
  const pedeSerie = devTarget?.controle_serie === 1 && !exigeLoteSemSeletor;

  useEffect(() => {
    setDevSeries([]); setDevSerieIds([]);
    if (!devTarget || devTarget.controle_serie !== 1 || devTarget.controle_lote === 1) return undefined;
    let cancelado = false;
    api.get(`/almoxarifado/materiais/${devTarget.material_id}/series?status=EM_ESTOQUE`)
      .then((r) => { if (!cancelado) setDevSeries(Array.isArray(r.data) ? r.data : []); })
      .catch(() => { if (!cancelado) { setDevSeries([]); toast.error('Não foi possível carregar as séries do material'); } });
    return () => { cancelado = true; };
  }, [devTarget]);

  useEffect(() => {
    let cancelado = false;
    api.get('/almoxarifado/materiais-cliente/clientes')
      .then((r) => { if (!cancelado) setClientes(Array.isArray(r.data) ? r.data : []); })
      .catch(() => { if (!cancelado) toast.error('Não foi possível carregar os clientes'); });
    return () => { cancelado = true; };
  }, []);

  useEffect(() => {
    if (!clienteId) { setPosicao(null); return undefined; }
    let cancelado = false;
    setLoading(true);
    api.get(`/almoxarifado/materiais-cliente/posicao?cliente_id=${clienteId}`)
      .then((r) => { if (!cancelado) setPosicao(r.data); })
      // Limpa a posição no erro de propósito: deixar a tabela do cliente ANTERIOR na tela com o
      // nome do novo selecionado no topo é exatamente a confusão que esta tela não pode criar.
      .catch(() => { if (!cancelado) { setPosicao(null); toast.error('Não foi possível carregar a posição do cliente'); } })
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [clienteId, reloadToken]);

  const abrirDevolucao = useCallback((item, evento) => {
    if (!bloquearSeNaoPode('movimentar', evento)) return;
    setDevTarget(item); setDevQtd(''); setDevDoc('');
  }, [bloquearSeNaoPode]);

  const confirmarDevolucao = async () => {
    const qtd = Number(devQtd);
    if (!(qtd > 0)) { toast.error('Informe a quantidade a devolver'); return; }
    if (!devDoc.trim()) { toast.error('Informe o número do documento de devolução'); return; }
    if (exigeLoteSemSeletor) { toast.error(FRASE_EXIGE_LOTE); return; }
    if (pedeSerie) {
      if (devSerieIds.length !== qtd) { toast.error('Selecione exatamente a quantidade de séries informada'); return; }
      // RN-235.09: séries de lotes diferentes com o lote em branco — o servidor recusaria (B1535); a janela para antes.
      const lote = fraseDoLoteDasSeries(devSeries, devSerieIds, 'devolução');
      if (lote?.mistura) { toast.error(lote.texto); return; }
    }
    setDevSaving(true);
    try {
      // Material sem série: o corpo é o de sempre (sem a chave `serie_ids`).
      await api.post('/almoxarifado/materiais-cliente/devolucoes', {
        material_id: devTarget.material_id, quantidade: qtd, documento_devolucao: devDoc.trim(),
        ...(pedeSerie ? { serie_ids: devSerieIds } : {}),
      });
      toast.success('Devolução ao cliente registrada!');
      setDevTarget(null);
      setReloadToken((t) => t + 1);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao registrar a devolução ao cliente');
    } finally { setDevSaving(false); }
  };

  const aplicacoesDo = (materialId) =>
    (posicao?.aplicacoes || []).filter((a) => a.material_id === materialId);

  const clienteNome = posicao?.cliente?.razao_social || '';

  return (
    <div className="almox-page">
      <div className="almox-header">
        <div>
          <h1>Materiais de Clientes</h1>
          <p>
            {!posicao ? 'Selecione um cliente para ver a posição do material dele'
              : `${posicao.itens.length} ${posicao.itens.length === 1 ? 'item' : 'itens'} de ${clienteNome}`}
          </p>
        </div>
        <div className="almox-header-actions">
          <button className="btn-almox-secondary" disabled={!clienteId}
            onClick={() => setReloadToken((t) => t + 1)}>
            <FiRefreshCw size={13} /> Atualizar
          </button>
          {/* O PDF é gerado no NAVEGADOR (utils/posicaoClientePdf.js, molde de etiquetasPdf.js da
              Etapa 6c) — zero mudança de servidor. `geradoEm` sai daqui porque o documento precisa
              dizer de quando é a foto: posição de cliente muda a cada movimento. */}
          <button className="btn-almox-primary" disabled={!posicao}
            onClick={(e) => {
              if (!bloquearSeNaoPode('visualizar', e)) return;
              gerarPosicaoClientePDF({ ...posicao, geradoEm: new Date().toISOString() });
            }}>
            <FiFileText size={13} /> PDF da posição
          </button>
        </div>
      </div>

      {/* Filtro — escolher o cliente primeiro, o GET da posição é por cliente */}
      <div className="almox-filters">
        <select className="almox-select" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
          <option value="">Selecionar cliente...</option>
          {clientes.map((c) => (
            <option key={c.cliente_id} value={c.cliente_id}>
              {c.cliente_nome} ({c.materiais} {c.materiais === 1 ? 'item' : 'itens'})
            </option>
          ))}
        </select>
        {/* Reaproveita o selo `.almox-badge-cliente` da Task 9 (Materiais/Movimentações/Extrato) —
            é o mesmo significado ("isto não é nosso") e criar um segundo estilo faria a mesma
            informação ter duas caras no módulo. Aqui ele fica no topo, não por linha: a tela
            inteira já é de um dono só, e repetir o selo em toda linha seria ruído. */}
        {posicao && (
          <span className="almox-badge almox-badge-cliente" style={{ marginLeft: 8 }}>
            Material de {clienteNome}
          </span>
        )}
      </div>

      <div className="almox-table-container">
        {!clienteId ? (
          <div className="almox-empty"><p>Selecione um cliente para ver a posição do material dele</p></div>
        ) : loading ? <SkeletonTable rows={6} columns={9} /> : !posicao || posicao.itens.length === 0 ? (
          <div className="almox-empty"><p>Nenhum material deste cliente no almoxarifado</p></div>
        ) : (
          <table className="almox-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Material</th>
                <th>Un.</th>
                <th>Recebido</th>
                <th>Consumido</th>
                <th>Devolvido</th>
                <th>Saldo</th>
                <th>Aplicado em</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {posicao.itens.map((i) => {
                const aplicacoes = aplicacoesDo(i.material_id);
                const temSaldo = Number(i.saldo) > 0;
                return (
                  <tr key={i.material_id}>
                    <td>{i.codigo}</td>
                    <td>{i.nome}</td>
                    <td>{i.unidade}</td>
                    <td>{formatarQuantidade(i.recebido)}</td>
                    <td>{formatarQuantidade(i.consumido)}</td>
                    <td>{formatarQuantidade(i.devolvido)}</td>
                    <td>
                      {/* `ok` e `zerado` existem em Almoxarifado.css — classe inventada aqui sairia
                          sem cor nenhuma e nenhum teste pegaria (aconteceu na Etapa 7). */}
                      <span className={`almox-badge almox-badge-${temSaldo ? 'ok' : 'zerado'}`}>{formatarQuantidade(i.saldo)}</span>
                    </td>
                    <td style={{ fontSize: '0.8rem' }}>
                      {aplicacoes.length === 0 ? '—' : aplicacoes.map((a, k) => (
                        <div key={k}>
                          {a.numero_os ? `OS ${a.numero_os}` : (a.projeto_nome || '—')} — {formatarQuantidade(a.quantidade)}
                        </div>
                      ))}
                    </td>
                    <td>
                      <div className="almox-actions">
                        {/* Desabilitado (não escondido) com saldo zero, e o title diz por quê:
                            botão que some deixa o operador procurando a ação. */}
                        <button className="btn-almox-secondary" disabled={!temSaldo}
                          title={temSaldo ? 'Devolver ao cliente' : 'Sem saldo para devolver'}
                          onClick={(e) => abrirDevolucao(i, e)}>
                          <FiCornerUpLeft size={13} /> Devolver
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal — devolver ao cliente */}
      {devTarget && (
        <div className="almox-modal-overlay" onClick={() => { if (!devSaving) setDevTarget(null); }}>
          <div className="almox-modal almox-modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="almox-modal-header">
              <h2>Devolver ao cliente</h2>
              <button className="almox-modal-close" onClick={() => setDevTarget(null)}>✕</button>
            </div>
            <div className="almox-modal-body">
              <p style={{ marginTop: 0 }}>
                <strong>{devTarget.codigo}</strong> — {devTarget.nome}
                {clienteNome ? <> · devolvendo para <strong>{clienteNome}</strong></> : null}
              </p>
              <div className="almox-field">
                <label className="almox-label">
                  Quantidade (saldo: {formatarQuantidade(devTarget.saldo)} {devTarget.unidade})<span className="required">*</span>
                </label>
                <input className="almox-input" type="number" min="0" value={devQtd}
                  onChange={(e) => setDevQtd(e.target.value)} />
              </div>
              {exigeLoteSemSeletor && (
                <small id="dev-exige-lote" style={{ display: 'block', color: 'var(--gmp-error)', fontSize: '0.75rem', marginBottom: 8 }}>
                  {FRASE_EXIGE_LOTE}
                </small>
              )}
              {pedeSerie && (
                <div className="almox-field">
                  <label className="almox-label">Séries a devolver<span className="required">*</span></label>
                  <div id="dev-series" style={{ maxHeight: 140, overflowY: 'auto', border: '1px solid var(--gmp-border)', borderRadius: 6, padding: 6 }}>
                    {devSeries.map((s) => {
                      // RN-235.08: a série de lote impedido (bloqueado, reprovado, vencido — a devolução ao cliente não é descarte, B1537)
                      // vem apagada, com o lote e a situação (as palavras do extrato).
                      const impedida = s.lote_esta_impedido === true;
                      return (
                        <label key={s.id} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.85rem',
                          ...(impedida ? { opacity: 0.6 } : {}) }}>
                          <input type="checkbox" data-serie-id={s.id} checked={devSerieIds.includes(s.id)} disabled={impedida}
                            onChange={(e) => setDevSerieIds((ids) => (e.target.checked
                              ? [...ids, s.id] : ids.filter((id) => id !== s.id)))} />
                          {s.numero}
                          {impedida ? (
                            <span data-serie-situacao={s.id} style={{ color: 'var(--gmp-error)', fontSize: '0.75rem' }}>
                              {` · lote ${s.lote_codigo} — ${situacaoDoLote(s)}: não sai`}
                            </span>
                          ) : (s.lote_codigo ? ` · lote ${s.lote_codigo}` : '')}
                        </label>
                      );
                    })}
                    {devSeries.length === 0 && <small>Nenhuma série disponível em estoque.</small>}
                  </div>
                  {devSeries.some((s) => s.lote_esta_impedido === true) && (
                    <small id="dev-series-impedidas" style={{ color: 'var(--gmp-text-light)', fontSize: '0.75rem' }}>
                      Séries de lote bloqueado, reprovado ou vencido vêm apagadas: só saem depois que o lote for liberado na tela Lotes e Séries.
                    </small>
                  )}
                  {(() => {
                    // RN-235.09: de qual lote as séries marcadas saem (o servidor grava a devolução nele, B1535)
                    const f = fraseDoLoteDasSeries(devSeries, devSerieIds, 'devolução');
                    return f && (
                      <small id="dev-series-lote-da-devolucao"
                        style={{ display: 'block', color: f.mistura ? 'var(--gmp-error)' : 'var(--gmp-text-light)', fontSize: '0.75rem' }}>
                        {f.texto}
                      </small>
                    );
                  })()}
                  <small id="dev-series-contador" style={{ display: 'block' }}>
                    {devSerieIds.length}/{devQtd || 0} série(s) selecionada(s)
                  </small>
                </div>
              )}
              <div className="almox-field">
                <label className="almox-label">Número do documento de devolução<span className="required">*</span></label>
                <input className="almox-input" value={devDoc} onChange={(e) => setDevDoc(e.target.value)} />
                <small style={{ color: 'var(--gmp-text-light)', fontSize: '0.75rem' }}>
                  Obrigatório: é o papel que prova que o material voltou para o dono. O servidor
                  também recusa sem ele.
                </small>
              </div>
            </div>
            <div className="almox-modal-footer">
              <button className="btn-almox-secondary" onClick={() => setDevTarget(null)} disabled={devSaving}>
                Cancelar
              </button>
              <button className="btn-almox-primary" onClick={confirmarDevolucao} disabled={devSaving}>
                {devSaving ? 'Registrando...' : 'Confirmar devolução'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MateriaisClienteAlmoxarifado;
