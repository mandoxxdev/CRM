import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import {
  FiRefreshCw, FiSearch, FiPlus, FiCheckCircle, FiUser, FiClock,
  FiAlertTriangle, FiX, FiTrash2, FiEdit2, FiCalendar,
} from 'react-icons/fi';
import './Todolist.css';

const COLUNAS = [
  { id: 'a_fazer', nome: 'A Fazer', classe: 'a-fazer' },
  { id: 'em_progresso', nome: 'Em Progresso', classe: 'em-progresso' },
  { id: 'em_revisao', nome: 'Em Revisão', classe: 'em-revisao' },
  { id: 'concluido', nome: 'Concluído', classe: 'concluido' },
];

const PRIORIDADES = [
  { value: 'baixa', label: 'Baixa' },
  { value: 'media', label: 'Média' },
  { value: 'alta', label: 'Alta' },
  { value: 'urgente', label: 'Urgente' },
];

const EMPTY_FORM = {
  titulo: '',
  descricao: '',
  prioridade: 'media',
  status: 'a_fazer',
  responsavel_id: '',
  prazo: '',
};

function prioridadeClasse(p) {
  const v = String(p || '').toLowerCase();
  if (v === 'urgente') return 'urgente';
  if (v === 'alta') return 'alta';
  if (v === 'baixa') return 'baixa';
  return 'media';
}

function formatDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return d.toLocaleDateString('pt-BR');
}

function formatDateTime(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function toDateInput(value) {
  if (!value) return '';
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export default function TodolistBoard() {
  const [tarefas, setTarefas] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [dragItemId, setDragItemId] = useState(null);
  const [colunaHover, setColunaHover] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/todolist/board');
      setTarefas(data.tarefas || []);
      setUsuarios(data.usuarios || []);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao carregar o quadro');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const tarefasFiltradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return tarefas;
    return tarefas.filter((t) =>
      String(t.titulo || '').toLowerCase().includes(q) ||
      String(t.descricao || '').toLowerCase().includes(q) ||
      String(t.responsavel_nome || '').toLowerCase().includes(q)
    );
  }, [tarefas, busca]);

  const itensPorColuna = useMemo(() => {
    const map = {};
    COLUNAS.forEach((c) => { map[c.id] = []; });
    tarefasFiltradas.forEach((t) => {
      const col = COLUNAS.some((c) => c.id === t.status) ? t.status : 'a_fazer';
      map[col].push(t);
    });
    return map;
  }, [tarefasFiltradas]);

  const totalConcluidos = tarefas.filter((t) => t.status === 'concluido').length;

  const abrirNova = (status = 'a_fazer') => {
    setEditando(null);
    setForm({ ...EMPTY_FORM, status });
    setModalOpen(true);
  };

  const abrirEditar = (tarefa) => {
    setEditando(tarefa);
    setForm({
      titulo: tarefa.titulo || '',
      descricao: tarefa.descricao || '',
      prioridade: tarefa.prioridade || 'media',
      status: tarefa.status || 'a_fazer',
      responsavel_id: tarefa.responsavel_id ? String(tarefa.responsavel_id) : '',
      prazo: toDateInput(tarefa.prazo),
    });
    setModalOpen(true);
  };

  const fecharModal = () => {
    if (salvando) return;
    setModalOpen(false);
    setEditando(null);
    setForm(EMPTY_FORM);
  };

  const salvar = async (e) => {
    e?.preventDefault?.();
    if (!form.titulo.trim()) {
      toast.warn('Informe o título da tarefa');
      return;
    }
    setSalvando(true);
    try {
      const payload = {
        titulo: form.titulo.trim(),
        descricao: form.descricao.trim() || null,
        prioridade: form.prioridade,
        status: form.status,
        responsavel_id: form.responsavel_id ? Number(form.responsavel_id) : null,
        prazo: form.prazo || null,
      };
      if (editando) {
        await api.put(`/todolist/tarefas/${editando.id}`, payload);
        toast.success('Tarefa atualizada');
      } else {
        await api.post('/todolist/tarefas', payload);
        toast.success('Tarefa criada');
      }
      fecharModal();
      carregar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar tarefa');
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async () => {
    if (!editando) return;
    if (!window.confirm('Excluir esta tarefa?')) return;
    setSalvando(true);
    try {
      await api.delete(`/todolist/tarefas/${editando.id}`);
      toast.success('Tarefa excluída');
      fecharModal();
      carregar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao excluir');
    } finally {
      setSalvando(false);
    }
  };

  const moverPara = async (tarefaId, status, ordem) => {
    try {
      await api.put(`/todolist/tarefas/${tarefaId}/mover`, { status, ordem });
      await carregar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao mover tarefa');
      carregar();
    }
  };

  const onDragStart = (e, tarefa) => {
    setDragItemId(tarefa.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(tarefa.id));
  };

  const onDragEnd = () => {
    setDragItemId(null);
    setColunaHover(null);
  };

  const onDrop = (e, colunaId) => {
    e.preventDefault();
    setColunaHover(null);
    const id = dragItemId || Number(e.dataTransfer.getData('text/plain'));
    setDragItemId(null);
    const tarefa = tarefas.find((t) => t.id === id);
    if (!tarefa || tarefa.status === colunaId) return;
    const ordemNaColuna = (itensPorColuna[colunaId] || []).length;
    moverPara(tarefa.id, colunaId, ordemNaColuna);
  };

  return (
    <div className="todolist">
      <div className="todolist-header">
        <div>
          <h1>TODOLIST</h1>
          <p>Kanban de atividades para controle do trabalho de programação</p>
        </div>
        <div className="todolist-header-actions">
          <div className="todolist-search">
            <FiSearch />
            <input
              type="text"
              placeholder="Buscar tarefa, descrição ou responsável..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <button type="button" className="todolist-btn" onClick={carregar} disabled={loading}>
            <FiRefreshCw className={loading ? 'girando' : ''} /> Atualizar
          </button>
          <button type="button" className="todolist-btn todolist-btn--primary" onClick={() => abrirNova()}>
            <FiPlus /> Nova tarefa
          </button>
        </div>
      </div>

      <div className="todolist-resumo">
        <span><FiAlertTriangle /> {tarefas.length} tarefas</span>
        <span><FiCheckCircle /> {totalConcluidos} concluídas</span>
      </div>

      {loading ? (
        <div className="todolist-loading">
          <div className="todolist-spinner" />
          <p>Carregando quadro...</p>
        </div>
      ) : (
        <div className="todolist-board">
          {COLUNAS.map((coluna) => (
            <div
              key={coluna.id}
              className={`todolist-coluna ${coluna.classe}${colunaHover === coluna.id ? ' hover' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setColunaHover(coluna.id); }}
              onDragLeave={() => setColunaHover(null)}
              onDrop={(e) => onDrop(e, coluna.id)}
            >
              <div className="todolist-coluna-header">
                <span>{coluna.nome}</span>
                <div className="todolist-coluna-header-right">
                  <span className="todolist-coluna-count">
                    {(itensPorColuna[coluna.id] || []).length}
                  </span>
                  <button
                    type="button"
                    className="todolist-coluna-add"
                    title={`Nova em ${coluna.nome}`}
                    onClick={() => abrirNova(coluna.id)}
                  >
                    <FiPlus />
                  </button>
                </div>
              </div>
              <div className="todolist-coluna-body">
                {(itensPorColuna[coluna.id] || []).length === 0 ? (
                  <div className="todolist-coluna-vazia">Arraste tarefas aqui</div>
                ) : (
                  (itensPorColuna[coluna.id] || []).map((tarefa) => (
                    <div
                      key={tarefa.id}
                      className={`todolist-card${dragItemId === tarefa.id ? ' arrastando' : ''}`}
                      draggable
                      onDragStart={(e) => onDragStart(e, tarefa)}
                      onDragEnd={onDragEnd}
                      onClick={() => abrirEditar(tarefa)}
                      title="Clique para editar · arraste para mover"
                    >
                      <div className="todolist-card-top">
                        <span className={`todolist-card-prio ${prioridadeClasse(tarefa.prioridade)}`}>
                          {tarefa.prioridade || 'media'}
                        </span>
                        <button
                          type="button"
                          className="todolist-card-edit"
                          onClick={(e) => { e.stopPropagation(); abrirEditar(tarefa); }}
                          title="Editar"
                        >
                          <FiEdit2 />
                        </button>
                      </div>
                      <div className="todolist-card-titulo">{tarefa.titulo}</div>
                      {tarefa.descricao ? (
                        <div className="todolist-card-desc">{tarefa.descricao}</div>
                      ) : null}
                      <div className="todolist-card-meta">
                        {tarefa.responsavel_nome ? (
                          <span><FiUser /> {tarefa.responsavel_nome}</span>
                        ) : (
                          <span className="muted"><FiUser /> Sem responsável</span>
                        )}
                        {tarefa.prazo ? (
                          <span><FiCalendar /> {formatDate(tarefa.prazo)}</span>
                        ) : null}
                      </div>
                      <div className="todolist-card-datas">
                        <span><FiClock /> Criada {formatDate(tarefa.created_at)}</span>
                        {tarefa.data_conclusao ? (
                          <span className="concluida">
                            <FiCheckCircle /> Resolvida {formatDateTime(tarefa.data_conclusao)}
                          </span>
                        ) : null}
                      </div>
                      <div className="todolist-card-mover" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={tarefa.status}
                          onChange={(e) => moverPara(tarefa.id, e.target.value)}
                          aria-label="Mover para coluna"
                        >
                          {COLUNAS.map((c) => (
                            <option key={c.id} value={c.id}>{c.nome}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="todolist-modal-overlay" onClick={fecharModal}>
          <div className="todolist-modal" onClick={(e) => e.stopPropagation()}>
            <div className="todolist-modal-header">
              <h2>{editando ? 'Editar tarefa' : 'Nova tarefa'}</h2>
              <button type="button" className="todolist-modal-close" onClick={fecharModal}>
                <FiX />
              </button>
            </div>
            <form className="todolist-modal-body" onSubmit={salvar}>
              <label>
                Título *
                <input
                  type="text"
                  value={form.titulo}
                  onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
                  placeholder="Ex.: Corrigir bug no login"
                  autoFocus
                  required
                />
              </label>
              <label>
                Descrição
                <textarea
                  rows={4}
                  value={form.descricao}
                  onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
                  placeholder="Detalhes, critérios de aceite, links..."
                />
              </label>
              <div className="todolist-form-row">
                <label>
                  Prioridade
                  <select
                    value={form.prioridade}
                    onChange={(e) => setForm((f) => ({ ...f, prioridade: e.target.value }))}
                  >
                    {PRIORIDADES.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Status
                  <select
                    value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  >
                    {COLUNAS.map((c) => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="todolist-form-row">
                <label>
                  Responsável (programador)
                  <select
                    value={form.responsavel_id}
                    onChange={(e) => setForm((f) => ({ ...f, responsavel_id: e.target.value }))}
                  >
                    <option value="">— Sem responsável —</option>
                    {usuarios.map((u) => (
                      <option key={u.id} value={u.id}>{u.nome}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Prazo
                  <input
                    type="date"
                    value={form.prazo}
                    onChange={(e) => setForm((f) => ({ ...f, prazo: e.target.value }))}
                  />
                </label>
              </div>
              {editando && (
                <div className="todolist-meta-info">
                  <span>Criada em: {formatDateTime(editando.created_at) || '—'}</span>
                  <span>
                    Resolvida em:{' '}
                    {editando.data_conclusao
                      ? formatDateTime(editando.data_conclusao)
                      : '— (preenchido ao concluir)'}
                  </span>
                </div>
              )}
              <div className="todolist-modal-actions">
                {editando ? (
                  <button
                    type="button"
                    className="todolist-btn todolist-btn--danger"
                    onClick={excluir}
                    disabled={salvando}
                  >
                    <FiTrash2 /> Excluir
                  </button>
                ) : <span />}
                <div className="todolist-modal-actions-right">
                  <button type="button" className="todolist-btn todolist-btn--ghost" onClick={fecharModal} disabled={salvando}>
                    Cancelar
                  </button>
                  <button type="submit" className="todolist-btn todolist-btn--primary" disabled={salvando}>
                    {salvando ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
