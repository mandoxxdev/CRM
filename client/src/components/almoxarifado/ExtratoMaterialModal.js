import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import {
  FiPackage, FiLock, FiEye, FiCheckCircle, FiDollarSign, FiMapPin, FiArrowUp, FiArrowDown
} from 'react-icons/fi';
import { SkeletonTable } from '../SkeletonLoader';
import { prefixarAlmoxarifado } from '../../utils/localizacaoLabel';
import './Almoxarifado.css';

// Tipos de movimento cobrem os 20 valores do motor v2 (ver stockService); mapeamos por
// prefixo/exceção para reaproveitar as mesmas cores de badge do livro (entrada/saida/ajuste)
// sem precisar listar cada valor específico (ex.: SAIDA_PRODUCAO, ENTRADA_DEVOLUCAO).
const TIPO_BADGE_EXCECOES = {
  ESTORNO: 'estorno',
  AJUSTE: 'ajuste',
  AJUSTE_POSITIVO: 'entrada',
  AJUSTE_NEGATIVO: 'saida',
  DEVOLUCAO: 'entrada',
  SUCATA: 'saida',
  PERDA: 'saida',
};

const tipoBadgeCls = (tipo) => {
  if (TIPO_BADGE_EXCECOES[tipo]) return TIPO_BADGE_EXCECOES[tipo];
  if (tipo?.startsWith('ENTRADA')) return 'entrada';
  if (tipo?.startsWith('SAIDA')) return 'saida';
  return 'ajuste';
};

// O tipo por si só não diz se o saldo subiu ou desceu: TRANSFERENCIA, BLOQUEIO,
// DESBLOQUEIO, RESERVA e LIBERACAO_RESERVA não alteram o físico (saldo_posterior ===
// saldo_anterior), e um ESTORNO pode ir em qualquer direção dependendo do que reverte.
// O sinal/cor/seta da quantidade vêm sempre do delta real do par de saldos do livro —
// nunca de uma suposição por tipo.
const deltaSaldo = (m) => (m.saldo_posterior ?? 0) - (m.saldo_anterior ?? 0);

const formatDate = (d) => (d ? new Date(d).toLocaleDateString('pt-BR', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
}) : '—');

// Campos DATE puros (data_necessidade, expira_em). O T12:00 evita o clássico "um dia a
// menos": `new Date('2026-08-10')` é meia-noite UTC, que em UTC-3 cai no dia 09.
const formatDateOnly = (d) => (d
  ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR')
  : '—');

const formatMoney = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Mesma prioridade OS > projeto > centro de custo usada no livro principal.
const vinculoLabel = (m) => {
  if (m.os_id) return `OS #${m.os_id}`;
  if (m.projeto_id) return `Projeto #${m.projeto_id}`;
  if (m.centro_custo_codigo) return m.centro_custo_codigo;
  return null;
};

/**
 * Extrato completo de um material: cartões de saldo (físico/reservado/bloqueado/em
 * inspeção/disponível), custo médio, saldos por localização, últimas movimentações e
 * reservas ativas. Consome GET /almoxarifado/materiais/:id/extrato (Task 7).
 */
const ExtratoMaterialModal = ({ materialId, onClose }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [series, setSeries] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/almoxarifado/materiais/${materialId}/extrato`);
      setData(res.data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao carregar extrato do material');
      onClose();
    } finally {
      setLoading(false);
    }
  }, [materialId, onClose]);

  useEffect(() => {
    if (materialId) load();
  }, [materialId, load]);

  useEffect(() => {
    if (!data?.material || !data.material.controle_serie) {
      setSeries(null);
      return;
    }
    let cancelado = false;
    (async () => {
      try {
        const res = await api.get(`/almoxarifado/materiais/${materialId}/series?status=EM_ESTOQUE`);
        if (!cancelado) setSeries(res.data || []);
      } catch {
        if (!cancelado) setSeries(null);
      }
    })();
    return () => { cancelado = true; };
  }, [materialId, data?.material?.controle_serie]);

  if (!materialId) return null;

  const material = data?.material;

  return (
    <div className="almox-modal-overlay" onClick={onClose}>
      <div className="almox-modal almox-modal-lg" onClick={e => e.stopPropagation()}>
        <div className="almox-modal-header">
          <h2>📊 Extrato{material ? ` — ${material.nome}` : ''}</h2>
          <button className="almox-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="almox-modal-body">
          {loading ? (
            <SkeletonTable rows={6} columns={5} />
          ) : !material ? (
            <div className="almox-empty"><p>Material não encontrado</p></div>
          ) : (
            <>
              <div style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)', marginBottom: 16 }}>
                {material.codigo}{material.categoria ? ` · ${material.categoria}` : ''}
              </div>

              <div className="almox-kpis" style={{ marginBottom: 24 }}>
                <div className="almox-kpi-card">
                  <div className="almox-kpi-icon primary"><FiPackage /></div>
                  <div className="almox-kpi-info">
                    <div className="almox-kpi-value">{material.quantidade_atual}</div>
                    <div className="almox-kpi-label">Físico ({material.unidade})</div>
                  </div>
                </div>
                <div className="almox-kpi-card">
                  <div className="almox-kpi-icon warning"><FiLock /></div>
                  <div className="almox-kpi-info">
                    <div className="almox-kpi-value">{material.quantidade_reservada || 0}</div>
                    <div className="almox-kpi-label">Reservado</div>
                  </div>
                </div>
                <div className="almox-kpi-card">
                  <div className="almox-kpi-icon danger"><FiLock /></div>
                  <div className="almox-kpi-info">
                    <div className="almox-kpi-value">{material.quantidade_bloqueada || 0}</div>
                    <div className="almox-kpi-label">Bloqueado</div>
                  </div>
                </div>
                <div className="almox-kpi-card">
                  <div className="almox-kpi-icon purple"><FiEye /></div>
                  <div className="almox-kpi-info">
                    <div className="almox-kpi-value">{material.quantidade_em_inspecao || 0}</div>
                    <div className="almox-kpi-label">Em inspeção</div>
                  </div>
                </div>
                <div className="almox-kpi-card">
                  <div className="almox-kpi-icon success"><FiCheckCircle /></div>
                  <div className="almox-kpi-info">
                    <div className="almox-kpi-value" style={{ color: 'var(--gmp-success)' }}>{material.quantidade_disponivel}</div>
                    <div className="almox-kpi-label">Disponível</div>
                  </div>
                </div>
                <div className="almox-kpi-card">
                  <div className="almox-kpi-icon primary"><FiDollarSign /></div>
                  <div className="almox-kpi-info">
                    <div className="almox-kpi-value" style={{ fontSize: '1.1rem' }}>{formatMoney(material.custo_medio)}</div>
                    <div className="almox-kpi-label">Custo médio</div>
                  </div>
                </div>
                {material.controle_serie === 1 && (
                  <div className="almox-kpi-card">
                    <div className="almox-kpi-icon primary"><FiPackage /></div>
                    <div className="almox-kpi-info">
                      <div className="almox-kpi-value">{series !== null ? series.length : '—'}</div>
                      <div className="almox-kpi-label">Séries em estoque</div>
                    </div>
                  </div>
                )}
              </div>

              <div className="almox-section-title">Saldos por localização</div>
              {/* Achado de review (fix round 1, Task 9): esta tabela tinha colunas "Reservada" e
                  "Bloqueada" lendo `s.quantidade_reservada`/`s.quantidade_bloqueada`. As duas
                  colunas foram REMOVIDAS de `estoque_saldo_almoxarifado` na Etapa 6 (`015e94c`) —
                  retenção é do lote inteiro por status ou do material, nunca por localização (ver
                  spec 10, "Decidir se retenção passa a ser por lote"). `consultarSaldosPorLocalizacao`
                  faz `SELECT s.*`, então as chaves nem chegavam mais no cliente: as duas colunas
                  mostravam 0 para sempre, silenciosamente, desde a migração. A retenção de
                  verdade já está nos cartões do topo (Reservado/Bloqueado), que leem do
                  MATERIAL — o nível onde ela realmente mora. Repetir esses totais em toda linha
                  de localização criaria a impressão de que a retenção é por localização, que
                  nunca foi verdade. */}
              {data.saldos_localizacao?.length ? (
                <div className="almox-table-container" style={{ marginBottom: 24 }}>
                  <table className="almox-table">
                    <thead>
                      <tr>
                        <th>Localização</th>
                        <th>Lote</th>
                        <th>Quantidade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.saldos_localizacao.map(s => (
                        <tr key={s.id}>
                          <td>
                            <FiMapPin size={11} style={{ marginRight: 4, opacity: 0.6 }} />
                            {prefixarAlmoxarifado(s.localizacao_codigo, s.almoxarifado_codigo) || 'Sem localização'}
                            {s.localizacao_descricao && (
                              <span style={{ color: 'var(--gmp-text-light)', fontSize: '0.75rem' }}> — {s.localizacao_descricao}</span>
                            )}
                          </td>
                          <td>{s.lote || '—'}</td>
                          <td style={{ fontWeight: 600 }}>{s.quantidade} {material.unidade}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p style={{ color: 'var(--gmp-text-light)', fontSize: '0.85rem', marginBottom: 24 }}>
                  Nenhum saldo por localização registrado.
                </p>
              )}

              <div className="almox-section-title">Últimas movimentações</div>
              {data.movimentacoes?.length ? (
                <div className="almox-table-container" style={{ marginBottom: 24, maxHeight: 320, overflowY: 'auto' }}>
                  <table className="almox-table">
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Tipo</th>
                        <th>Quantidade</th>
                        <th>Saldo Posterior</th>
                        <th>Motivo / Vínculo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.movimentacoes.map(m => {
                        const cls = tipoBadgeCls(m.tipo);
                        const vinculo = vinculoLabel(m);
                        const delta = deltaSaldo(m);
                        const deltaColor = delta > 0 ? 'var(--gmp-success)' : delta < 0 ? 'var(--gmp-error)' : 'var(--gmp-text-light)';
                        const DeltaArrow = delta > 0 ? FiArrowUp : delta < 0 ? FiArrowDown : null;
                        return (
                          <tr key={m.id} style={{ opacity: m.cancelado ? 0.55 : 1 }}>
                            <td style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)', whiteSpace: 'nowrap' }}>
                              {formatDate(m.created_at)}
                            </td>
                            <td>
                              <span className={`almox-badge almox-badge-${cls}`}>
                                {DeltaArrow ? <DeltaArrow size={10} /> : null}
                                {m.tipo}
                              </span>
                              {m.cancelado ? (
                                <span className="almox-badge almox-badge-cancelado" style={{ marginLeft: 6 }}>ESTORNADA</span>
                              ) : null}
                            </td>
                            <td style={{ fontWeight: 700, color: deltaColor }}>
                              {delta === 0 ? `${m.quantidade} ${material.unidade}` : `${delta > 0 ? '+' : '−'}${m.quantidade}`}
                            </td>
                            <td style={{ fontWeight: 600 }}>{m.saldo_posterior}</td>
                            <td style={{ fontSize: '0.8rem' }}>
                              {m.motivo || '—'}
                              {vinculo && <div style={{ color: 'var(--gmp-text-light)' }}>{vinculo}</div>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p style={{ color: 'var(--gmp-text-light)', fontSize: '0.85rem', marginBottom: 24 }}>
                  Nenhuma movimentação registrada.
                </p>
              )}

              <div className="almox-section-title">Reservas ativas</div>
              {data.reservas?.length ? (
                <div className="almox-table-container">
                  <table className="almox-table">
                    <thead>
                      <tr>
                        <th>Quantidade</th>
                        <th>Utilizada</th>
                        <th>Saldo</th>
                        <th>Origem / Vínculo</th>
                        <th>Solicitante</th>
                        <th>Prazos</th>
                        <th>Data</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.reservas.map(r => {
                        // Saldo é o que a reserva AINDA segura. Depois que a entrega de
                        // requisição passou a baixar contra a reserva (Etapa 4), uma reserva
                        // consumida pela metade é o caso normal — e só "quantidade" faria
                        // parecer que ela ainda prende o dobro do real.
                        const utilizada = r.quantidade_utilizada || 0;
                        const saldo = r.quantidade - utilizada;
                        const daRequisicao = r.origem === 'REQUISICAO';
                        return (
                        <tr key={r.id}>
                          <td style={{ fontWeight: 600 }}>{r.quantidade} {material.unidade}</td>
                          <td>{utilizada} {material.unidade}</td>
                          <td style={{ fontWeight: 700 }}>{saldo} {material.unidade}</td>
                          <td style={{ fontSize: '0.8rem' }}>
                            <span className={`almox-badge almox-badge-${daRequisicao ? 'ajuste' : 'vazio'}`}>
                              {daRequisicao ? `REQ #${r.requisicao_id ?? '—'}` : 'MANUAL'}
                            </span>
                            <div style={{ marginTop: 4 }}>
                              {r.os_referencia || (r.os_id ? `OS #${r.os_id}` : (r.projeto_id ? `Projeto #${r.projeto_id}` : '—'))}
                            </div>
                          </td>
                          <td style={{ fontSize: '0.8rem' }}>{r.solicitante_nome || '—'}</td>
                          <td style={{ fontSize: '0.78rem', color: 'var(--gmp-text-light)' }}>
                            {r.data_necessidade && <div>Necessidade: {formatDateOnly(r.data_necessidade)}</div>}
                            {r.expira_em ? <div>Expira: {formatDateOnly(r.expira_em)}</div> : <div>Sem prazo</div>}
                          </td>
                          <td style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>{formatDate(r.created_at)}</td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p style={{ color: 'var(--gmp-text-light)', fontSize: '0.85rem' }}>Nenhuma reserva ativa.</p>
              )}
            </>
          )}
        </div>
        <div className="almox-modal-footer">
          <button type="button" className="btn-almox-secondary" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
};

export default ExtratoMaterialModal;
