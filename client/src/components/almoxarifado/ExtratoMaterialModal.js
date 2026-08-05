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
              </div>

              <div className="almox-section-title">Saldos por localização</div>
              {data.saldos_localizacao?.length ? (
                <div className="almox-table-container" style={{ marginBottom: 24 }}>
                  <table className="almox-table">
                    <thead>
                      <tr>
                        <th>Localização</th>
                        <th>Lote</th>
                        <th>Quantidade</th>
                        <th>Reservada</th>
                        <th>Bloqueada</th>
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
                          <td>{s.quantidade_reservada || 0}</td>
                          <td>{s.quantidade_bloqueada || 0}</td>
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
                        <th>Vínculo</th>
                        <th>Solicitante</th>
                        <th>Data</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.reservas.map(r => (
                        <tr key={r.id}>
                          <td style={{ fontWeight: 600 }}>{r.quantidade} {material.unidade}</td>
                          <td>{r.quantidade_utilizada || 0} {material.unidade}</td>
                          <td style={{ fontSize: '0.8rem' }}>
                            {r.os_referencia || (r.os_id ? `OS #${r.os_id}` : (r.projeto_id ? `Projeto #${r.projeto_id}` : '—'))}
                          </td>
                          <td style={{ fontSize: '0.8rem' }}>{r.solicitante_nome || '—'}</td>
                          <td style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>{formatDate(r.created_at)}</td>
                        </tr>
                      ))}
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
