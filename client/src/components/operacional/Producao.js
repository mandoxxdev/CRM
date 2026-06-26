import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import {
  FiRefreshCw, FiSearch, FiClock, FiCheckCircle, FiUser, FiPackage, FiAlertTriangle, FiX,
} from 'react-icons/fi';
import './Producao.css';

const COL_INICIAR = 'A iniciar';
const COL_CONCLUIDO = 'Concluído';

function prioridadeClasse(p) {
  const v = String(p || '').toLowerCase();
  if (v === 'urgente') return 'urgente';
  if (v === 'alta') return 'alta';
  return 'normal';
}

export default function Producao() {
  const [etapas, setEtapas] = useState([]);
  const [colaboradores, setColaboradores] = useState([]);
  const [itens, setItens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [dragItemId, setDragItemId] = useState(null);
  const [colunaHover, setColunaHover] = useState(null);

  // Modal de apontamento
  const [apontar, setApontar] = useState(null); // { item, etapaDestino } | null
  const [form, setForm] = useState({ colaborador_id: '', percentual_conclusao: 0, quantidade: '', observacoes: '' });
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/operacional/producao/kanban');
      setEtapas(data.etapas || []);
      setColaboradores(data.colaboradores || []);
      setItens(data.itens || []);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao carregar o quadro de produção');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Colunas = A iniciar + etapas + Concluído
  const colunas = useMemo(() => [COL_INICIAR, ...etapas, COL_CONCLUIDO], [etapas]);

  // Resolve em qual coluna cada item aparece
  const colunaDoItem = useCallback((item) => {
    if (item.status_item === 'concluido') return COL_CONCLUIDO;
    if (item.etapa_fabricacao && etapas.includes(item.etapa_fabricacao)) return item.etapa_fabricacao;
    return COL_INICIAR;
  }, [etapas]);

  const itensFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return itens;
    return itens.filter(it =>
      String(it.numero_os || '').toLowerCase().includes(q) ||
      String(it.descricao || '').toLowerCase().includes(q) ||
      String(it.cliente || '').toLowerCase().includes(q)
    );
  }, [itens, busca]);

  const itensPorColuna = useMemo(() => {
    const map = {};
    colunas.forEach(c => { map[c] = []; });
    itensFiltrados.forEach(it => {
      const col = colunaDoItem(it);
      (map[col] || (map[col] = [])).push(it);
    });
    return map;
  }, [itensFiltrados, colunas, colunaDoItem]);

  // ---- Drag & drop ----
  const onDragStart = (e, item) => {
    setDragItemId(item.id);
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDragEnd = () => { setDragItemId(null); setColunaHover(null); };

  const podeSoltarNa = (coluna) => coluna !== COL_INICIAR; // não se aponta para "A iniciar"

  const onDrop = (e, coluna) => {
    e.preventDefault();
    setColunaHover(null);
    const item = itens.find(i => i.id === dragItemId);
    setDragItemId(null);
    if (!item || !podeSoltarNa(coluna)) return;
    if (colunaDoItem(item) === coluna) return; // mesma coluna, nada a fazer
    abrirApontamento(item, coluna);
  };

  // ---- Modal de apontamento ----
  const abrirApontamento = (item, etapaDestino) => {
    const destino = etapaDestino || colunaDoItem(item);
    if (destino === COL_INICIAR) return;
    const concluido = destino === COL_CONCLUIDO;
    setForm({
      colaborador_id: item.colaborador_id ? String(item.colaborador_id) : '',
      percentual_conclusao: concluido ? 100 : (item.percentual_conclusao || 0),
      quantidade: item.quantidade != null ? String(item.quantidade) : '',
      observacoes: '',
    });
    setApontar({ item, etapaDestino: destino });
  };

  const confirmarApontamento = async () => {
    if (!apontar) return;
    setSalvando(true);
    try {
      await api.post('/operacional/producao/apontar', {
        item_id: apontar.item.id,
        os_id: apontar.item.os_id,
        etapa: apontar.etapaDestino,
        status: apontar.etapaDestino === COL_CONCLUIDO ? 'concluido' : 'em_andamento',
        percentual_conclusao: Number(form.percentual_conclusao) || 0,
        colaborador_id: form.colaborador_id ? Number(form.colaborador_id) : null,
        quantidade: form.quantidade !== '' ? Number(form.quantidade) : null,
        observacoes: form.observacoes || null,
      });
      toast.success('Apontamento registrado!');
      setApontar(null);
      carregar();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao registrar apontamento');
    } finally {
      setSalvando(false);
    }
  };

  const totalItens = itens.length;
  const totalConcluidos = itens.filter(i => i.status_item === 'concluido').length;

  return (
    <div className="producao">
      <div className="producao-header">
        <div>
          <h1>Produção — Chão de Fábrica</h1>
          <p>Aponte o avanço de cada item pelas etapas de fabricação</p>
        </div>
        <div className="producao-header-actions">
          <div className="producao-search">
            <FiSearch />
            <input
              type="text"
              placeholder="Buscar por OS, item ou cliente..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <button className="producao-btn" onClick={carregar} disabled={loading}>
            <FiRefreshCw className={loading ? 'girando' : ''} /> Atualizar
          </button>
        </div>
      </div>

      <div className="producao-resumo">
        <span><FiPackage /> {totalItens} itens em produção</span>
        <span><FiCheckCircle /> {totalConcluidos} concluídos</span>
      </div>

      {loading ? (
        <div className="producao-loading">
          <div className="producao-spinner" />
          <p>Carregando quadro de produção...</p>
        </div>
      ) : (
        <div className="producao-board">
          {colunas.map((coluna) => (
            <div
              key={coluna}
              className={`producao-coluna${colunaHover === coluna ? ' hover' : ''}${coluna === COL_CONCLUIDO ? ' concluido' : ''}${coluna === COL_INICIAR ? ' iniciar' : ''}`}
              onDragOver={(e) => { if (podeSoltarNa(coluna)) { e.preventDefault(); setColunaHover(coluna); } }}
              onDragLeave={() => setColunaHover(null)}
              onDrop={(e) => onDrop(e, coluna)}
            >
              <div className="producao-coluna-header">
                <span>{coluna}</span>
                <span className="producao-coluna-count">{(itensPorColuna[coluna] || []).length}</span>
              </div>
              <div className="producao-coluna-body">
                {(itensPorColuna[coluna] || []).length === 0 ? (
                  <div className="producao-coluna-vazia">—</div>
                ) : (
                  (itensPorColuna[coluna] || []).map((item) => (
                    <div
                      key={item.id}
                      className={`producao-card${dragItemId === item.id ? ' arrastando' : ''}`}
                      draggable
                      onDragStart={(e) => onDragStart(e, item)}
                      onDragEnd={onDragEnd}
                      onClick={() => abrirApontamento(item, coluna === COL_INICIAR ? (etapas[0] || COL_CONCLUIDO) : coluna)}
                      title="Clique para apontar / arraste para mover de etapa"
                    >
                      <div className="producao-card-top">
                        <span className="producao-card-os">OS {item.numero_os}</span>
                        <span className={`producao-card-prio ${prioridadeClasse(item.prioridade)}`}>
                          {prioridadeClasse(item.prioridade) === 'urgente' && <FiAlertTriangle />}
                          {item.prioridade || 'normal'}
                        </span>
                      </div>
                      <div className="producao-card-desc">{item.descricao}</div>
                      {item.cliente && <div className="producao-card-cliente">{item.cliente}</div>}
                      <div className="producao-card-meta">
                        <span><FiPackage /> {item.quantidade} {item.unidade || 'un'}</span>
                        {item.data_prevista && <span><FiClock /> {new Date(item.data_prevista).toLocaleDateString('pt-BR')}</span>}
                      </div>
                      {coluna !== COL_INICIAR && coluna !== COL_CONCLUIDO && (
                        <div className="producao-card-progress">
                          <div className="producao-card-progress-bar">
                            <div style={{ width: `${item.percentual_conclusao || 0}%` }} />
                          </div>
                          <span>{item.percentual_conclusao || 0}%</span>
                        </div>
                      )}
                      {item.colaborador_nome && (
                        <div className="producao-card-colab"><FiUser /> {item.colaborador_nome}</div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {apontar && (
        <div className="producao-modal-overlay" onClick={() => !salvando && setApontar(null)}>
          <div className="producao-modal" onClick={(e) => e.stopPropagation()}>
            <div className="producao-modal-header">
              <h2>Apontar produção</h2>
              <button onClick={() => setApontar(null)} disabled={salvando}><FiX /></button>
            </div>
            <p className="producao-modal-item">
              <strong>OS {apontar.item.numero_os}</strong> — {apontar.item.descricao}
            </p>
            <p className="producao-modal-etapa">
              Etapa: <strong>{apontar.etapaDestino}</strong>
              {apontar.etapaDestino === COL_CONCLUIDO && <span className="producao-tag-ok"> (item será marcado como concluído)</span>}
            </p>

            <label>Responsável</label>
            <select
              value={form.colaborador_id}
              onChange={(e) => setForm(f => ({ ...f, colaborador_id: e.target.value }))}
              disabled={salvando}
            >
              <option value="">Sem responsável</option>
              {colaboradores.map(c => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>

            {apontar.etapaDestino !== COL_CONCLUIDO && (
              <>
                <label>Percentual de conclusão: {form.percentual_conclusao}%</label>
                <input
                  type="range" min="0" max="100" step="5"
                  value={form.percentual_conclusao}
                  onChange={(e) => setForm(f => ({ ...f, percentual_conclusao: Number(e.target.value) }))}
                  disabled={salvando}
                />
              </>
            )}

            <label>Quantidade apontada</label>
            <input
              type="number" min="0"
              value={form.quantidade}
              onChange={(e) => setForm(f => ({ ...f, quantidade: e.target.value }))}
              placeholder={`Qtd (total do item: ${apontar.item.quantidade})`}
              disabled={salvando}
            />

            <label>Observações</label>
            <textarea
              rows={3}
              value={form.observacoes}
              onChange={(e) => setForm(f => ({ ...f, observacoes: e.target.value }))}
              placeholder="Opcional..."
              disabled={salvando}
            />

            <div className="producao-modal-actions">
              <button className="producao-btn-secundario" onClick={() => setApontar(null)} disabled={salvando}>
                Cancelar
              </button>
              <button className="producao-btn-primario" onClick={confirmarApontamento} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Registrar apontamento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
