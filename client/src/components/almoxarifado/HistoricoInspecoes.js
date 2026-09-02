import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { FiChevronDown, FiChevronUp } from 'react-icons/fi';
import { SkeletonTable } from '../SkeletonLoader';
import { formatarFaixa } from './faixaTolerancia';
import './Almoxarifado.css';

/**
 * Aba "Histórico" da tela de Inspeções (Etapa 29, Task 3 — C35 / D5 / RN-06).
 *
 * A Etapa 27 passou a gravar as medidas de cada inspeção (valor medido, tolerância congelada no
 * ato, instrumento) — e ninguém conseguia lê-las: nenhuma tela mostrava inspeção decidida.
 * Este componente é a leitura. Consome dois contratos (C1/C2 do plano):
 * - `GET /almoxarifado/inspecoes/historico?material_id=` — lista de inspeções decididas com
 *   `medidas_total`/`medidas_nao_conformes` já contados pelo servidor;
 * - `GET /almoxarifado/inspecoes/:id/medidas` — as medidas daquela inspeção, chamado só ao
 *   expandir a linha e UMA vez por id (cache local). Linha com `medidas_total === 0` não expande
 *   e não chama nada: o servidor já disse que não há o que buscar.
 *
 * Duas regras que o componente NÃO pode violar (Global Constraint 6 do plano):
 * - Nenhuma comparação de tolerância aqui. `conforme` vem derivado do servidor e é exibido.
 * - A faixa é SOMA COM SINAL: `inf = nominal + desvio_inferior`, `sup = nominal + desvio_superior`.
 *   `nominal − |desvio_inferior|` está errado para plano unilateral (`+0.005/+0.021` sobre 10
 *   é `[10.005 ; 10.021]`, não `[9.995 ; 10.021]`). A formatação usa o máximo de casas
 *   decimais dos três números como vieram (strings), para não inventar precisão nem escondê-la.
 * - `valor_medido` é string crua do servidor e aparece como veio — nunca `parseFloat`.
 *
 * Recebe `materialFilter` por prop: a tela-mãe já tem o seletor de material e a aba reaproveita
 * (a aba não tem filtro próprio — decisão do C4).
 */

const FLAGS_CURTAS = [
  { key: 'divergencia_quantidade', label: 'Quantidade', title: 'Divergência de quantidade' },
  { key: 'divergencia_dimensional', label: 'Dimensional', title: 'Divergência dimensional' },
  { key: 'certificado_ausente', label: 'Certificado', title: 'Certificado ausente' },
  { key: 'dano_fisico', label: 'Dano', title: 'Dano físico' },
  { key: 'material_incorreto', label: 'Material', title: 'Material incorreto' },
];

const formatDataHora = (d) => (d ? new Date(d).toLocaleDateString('pt-BR') : '—');

// A fórmula da faixa mora em `faixaTolerancia.js`: ela estava duplicada aqui e no modal de
// decisão, e a revisão adversarial da Etapa 29 mediu as duas cópias divergindo. Reexportado
// porque `HistoricoInspecoes.test.js` importa `formatarFaixa` deste módulo.
export { formatarFaixa };

const HistoricoInspecoes = ({ materialFilter }) => {
  const [historico, setHistorico] = useState([]);
  const [loading, setLoading] = useState(true);
  // Falha do C1 NAO pode virar estado vazio: "Nenhuma inspecao decidida ainda." e
  // indistinguivel de "nao ha inspecoes", e o toast some em segundos — o operador conclui que o
  // historico esta vazio quando na verdade nao carregou. Mesma regua da RN-08 no modal (falha ao
  // ler o plano nao vira "sem plano"). Achado da revisao adversarial da Etapa 29.
  const [erro, setErro] = useState(null);
  const [abertos, setAbertos] = useState({});          // { [inspecaoId]: boolean }
  const [medidasPorId, setMedidasPorId] = useState({}); // cache: { [inspecaoId]: medidas[] }
  const [carregandoMedidas, setCarregandoMedidas] = useState({});

  const loadHistorico = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const params = {};
      if (materialFilter) params.material_id = materialFilter;
      const res = await api.get('/almoxarifado/inspecoes/historico', { params });
      setHistorico(res.data || []);
    } catch (err) {
      const msg = err.response?.data?.error || 'Erro ao carregar histórico de inspeções';
      toast.error(msg);
      setHistorico([]);
      setErro(msg);
    } finally {
      setLoading(false);
    }
  }, [materialFilter]);

  useEffect(() => { loadHistorico(); }, [loadHistorico]);

  const alternar = async (row) => {
    if (!(row.medidas_total > 0)) return; // servidor já disse que não há medidas: nada a buscar
    const id = row.id;
    const vaiAbrir = !abertos[id];
    setAbertos((s) => ({ ...s, [id]: vaiAbrir }));
    if (!vaiAbrir || medidasPorId[id] || carregandoMedidas[id]) return;
    setCarregandoMedidas((s) => ({ ...s, [id]: true }));
    try {
      const res = await api.get(`/almoxarifado/inspecoes/${id}/medidas`);
      setMedidasPorId((s) => ({ ...s, [id]: res.data || [] }));
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao carregar as medidas da inspeção');
      setAbertos((s) => ({ ...s, [id]: false }));
    } finally {
      setCarregandoMedidas((s) => ({ ...s, [id]: false }));
    }
  };

  if (loading) return <div className="almox-table-container"><SkeletonTable rows={6} columns={6} /></div>;

  if (erro) {
    return (
      <div className="almox-table-container">
        <div className="almox-empty">
          <p>Não foi possível carregar o histórico de inspeções.</p>
          <p style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>{erro}</p>
          <button className="btn-almox-secondary" onClick={loadHistorico}>Tentar de novo</button>
        </div>
      </div>
    );
  }

  if (historico.length === 0) {
    return <div className="almox-table-container"><div className="almox-empty"><p>Nenhuma inspeção decidida ainda.</p></div></div>;
  }

  return (
    <div className="almox-table-container">
      <table className="almox-table">
        <thead>
          <tr>
            <th>Data</th>
            <th>Material</th>
            <th>Aprovada / Reprovada</th>
            <th>Problemas</th>
            <th>Responsável</th>
            <th>Medidas</th>
          </tr>
        </thead>
        <tbody>
          {historico.map((h) => {
            const temMedidas = h.medidas_total > 0;
            const aberto = temMedidas && !!abertos[h.id];
            const flags = FLAGS_CURTAS.filter(({ key }) => !!h[key]);
            const medidas = medidasPorId[h.id];
            return (
              <React.Fragment key={h.id}>
                <tr
                  data-testid={`historico-linha-${h.id}`}
                  aria-expanded={temMedidas ? aberto : undefined}
                  style={temMedidas ? { cursor: 'pointer' } : undefined}
                  title={temMedidas ? 'Clique para ver as medidas' : undefined}
                  onClick={() => alternar(h)}
                >
                  <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>
                    {formatDataHora(h.data_inspecao)}
                  </td>
                  <td>
                    <div>{h.material_nome}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)' }}>
                      {h.material_codigo}
                      {h.recebimento_numero ? ` · ${h.recebimento_numero}` : ''}
                      {h.nota_fiscal ? ` · NF ${h.nota_fiscal}` : ''}
                    </div>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <span style={{ color: 'var(--gmp-success)', fontWeight: 700 }}>{h.quantidade_aprovada}</span>
                    {' / '}
                    <span style={{ color: h.quantidade_reprovada > 0 ? 'var(--gmp-error)' : undefined, fontWeight: 700 }}>
                      {h.quantidade_reprovada}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)' }}> {h.material_unidade}</span>
                  </td>
                  <td>
                    {flags.length === 0 ? (
                      <span className="almox-badge almox-badge-ok">Conforme</span>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {flags.map(({ key, label, title }) => (
                          <span key={key} className="almox-badge almox-badge-critico" title={title}>{label}</span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td>{h.responsavel_nome || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {temMedidas ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span className={`almox-badge ${h.medidas_nao_conformes > 0 ? 'almox-badge-critico' : 'almox-badge-ok'}`}>
                          {h.medidas_total} ({h.medidas_nao_conformes} fora)
                        </span>
                        {aberto ? <FiChevronUp size={13} /> : <FiChevronDown size={13} />}
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>Sem medidas registradas</span>
                    )}
                  </td>
                </tr>
                {aberto && (
                  <tr data-testid={`historico-medidas-${h.id}`}>
                    <td colSpan={6} style={{ background: 'var(--gmp-bg, #fafafa)', padding: '8px 12px' }}>
                      {!medidas ? (
                        <span style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>Carregando medidas...</span>
                      ) : (
                        <table className="almox-table">
                          <thead>
                            <tr>
                              <th>Característica</th>
                              <th>Nominal</th>
                              <th>Faixa</th>
                              <th>Medido</th>
                              <th>Conforme</th>
                              <th>Instrumento</th>
                            </tr>
                          </thead>
                          <tbody>
                            {medidas.map((m) => (
                              <tr key={m.id}>
                                <td>{m.caracteristica}{m.unidade ? <span style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)' }}> ({m.unidade})</span> : null}</td>
                                <td>{m.valor_nominal}</td>
                                <td style={{ whiteSpace: 'nowrap' }}>{formatarFaixa(m.valor_nominal, m.desvio_inferior, m.desvio_superior)}</td>
                                <td style={{ fontWeight: 700 }}>{m.valor_medido}</td>
                                <td>
                                  <span className={`almox-badge ${m.conforme ? 'almox-badge-ok' : 'almox-badge-critico'}`}>
                                    {m.conforme ? 'Conforme' : 'Não conforme'}
                                  </span>
                                </td>
                                <td>{m.ferramenta_nome || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default HistoricoInspecoes;
