import React, { useState, useRef, useEffect } from 'react';
import { toast } from 'react-toastify';
import { FiPlus, FiTrash2, FiRefreshCw, FiChevronUp, FiChevronDown, FiChevronRight } from 'react-icons/fi';
import api from '../../services/api';
import './EditorClausulas.css';

function htmlToText(html) {
  if (!html) return '';
  return String(html)
    .replace(/<\/p>/gi, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<\/li>/gi, '\n').replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n').trim();
}

function normalizeClausulas(list) {
  return (list || []).map(c => ({ ...c, conteudo: htmlToText(c.conteudo) }));
}

function AutoTextarea({ value, onChange, onBlur, placeholder }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
    // Rola para manter o campo visível após crescer
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [value]);

  return (
    <textarea
      ref={ref}
      className="ec-conteudo-input"
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      placeholder={placeholder}
      rows={4}
    />
  );
}

export default function EditorClausulas({ propostaId, clausulas: clausulasIniciais, isDefault, onAlterado }) {
  const [clausulas, setClausulas] = useState(() => normalizeClausulas(clausulasIniciais));
  const [inicializado, setInicializado] = useState(!isDefault);
  const [salvando, setSalvando] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [expandido, setExpandido] = useState(null);
  const reordenarTimerRef = useRef(null);
  const clausulasRef = useRef(clausulas);
  const savingTempIds = useRef(new Set());

  function setClausulasSync(updater) {
    setClausulas(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      clausulasRef.current = next;
      return next;
    });
  }

  async function inicializarClausulas() {
    setSalvando(true);
    try {
      await api.post(`/propostas/${propostaId}/clausulas/inicializar`);
      const res = await api.get(`/propostas/${propostaId}/clausulas`);
      const lista = normalizeClausulas(res.data?.clausulas || []);
      setClausulasSync(lista);
      setInicializado(true);
      toast.success('Cláusulas padrão carregadas. Agora você pode editar.');
      onAlterado?.();
    } catch (e) {
      toast.error('Erro ao inicializar cláusulas.');
    } finally {
      setSalvando(false);
    }
  }

  async function salvarClausula(clausulaKey) {
    const clausula = clausulasRef.current.find(c =>
      clausulaKey.id ? c.id === clausulaKey.id : c._tempId === clausulaKey._tempId
    );
    if (!clausula) return;

    if (clausula.id) {
      try {
        await api.put(`/propostas/${propostaId}/clausulas/${clausula.id}`, {
          titulo: clausula.titulo,
          conteudo: clausula.conteudo,
        });
        onAlterado?.();
      } catch (e) {
        toast.error('Erro ao salvar cláusula.');
      }
    } else {
      if (savingTempIds.current.has(clausula._tempId)) return;
      savingTempIds.current.add(clausula._tempId);
      try {
        const res = await api.post(`/propostas/${propostaId}/clausulas`, {
          titulo: clausula.titulo,
          conteudo: clausula.conteudo,
        });
        setClausulasSync(prev => prev.map(c =>
          c._tempId === clausula._tempId ? { ...c, id: res.data.id } : c
        ));
        onAlterado?.();
      } catch (e) {
        toast.error('Erro ao salvar cláusula.');
      } finally {
        savingTempIds.current.delete(clausula._tempId);
      }
    }
  }

  async function removerClausula(e, clausula) {
    e.stopPropagation();
    if (!clausula.id) {
      setClausulasSync(prev => prev.filter(c => c._tempId !== clausula._tempId));
      return;
    }
    try {
      await api.delete(`/propostas/${propostaId}/clausulas/${clausula.id}`);
      setClausulasSync(prev => prev.filter(c => c.id !== clausula.id));
      if (expandido === (clausula.id || clausula._tempId)) setExpandido(null);
      toast.success('Cláusula removida.');
      onAlterado?.();
    } catch (e) {
      toast.error('Erro ao remover cláusula.');
    }
  }

  function moverClausula(e, index, direcao) {
    e.stopPropagation();
    const novaLista = [...clausulasRef.current];
    const alvo = index + direcao;
    if (alvo < 0 || alvo >= novaLista.length) return;
    [novaLista[index], novaLista[alvo]] = [novaLista[alvo], novaLista[index]];
    setClausulasSync(novaLista);

    clearTimeout(reordenarTimerRef.current);
    reordenarTimerRef.current = setTimeout(async () => {
      const ids = novaLista.filter(c => c.id).map(c => c.id);
      if (ids.length === 0) return;
      try {
        await api.put(`/propostas/${propostaId}/clausulas/reordenar`, { ordem: ids });
        onAlterado?.();
      } catch (e) {
        toast.error('Erro ao reordenar cláusulas.');
      }
    }, 400);
  }

  function adicionarClausula() {
    const nova = { _tempId: Date.now(), titulo: 'Nova Cláusula', conteudo: '' };
    setClausulasSync(prev => [...prev, nova]);
    setExpandido(nova._tempId);
  }

  async function resetar() {
    setSalvando(true);
    try {
      await api.post(`/propostas/${propostaId}/clausulas/resetar`);
      setClausulasSync([]);
      setInicializado(false);
      setConfirmReset(false);
      setExpandido(null);
      toast.success('Cláusulas voltaram ao padrão.');
      onAlterado?.();
    } catch (e) {
      toast.error('Erro ao resetar cláusulas.');
    } finally {
      setSalvando(false);
    }
  }

  function atualizarCampo(clausula, campo, valor) {
    setClausulasSync(prev => prev.map(c => {
      const match = c.id ? c.id === clausula.id : c._tempId === clausula._tempId;
      return match ? { ...c, [campo]: valor } : c;
    }));
  }

  function toggleExpandido(key) {
    setExpandido(prev => prev === key ? null : key);
  }

  if (!inicializado) {
    return (
      <div className="ec-vazio">
        <p>Esta proposta ainda usa as cláusulas padrão.</p>
        <p className="ec-muted">Ao inicializar, você poderá editar, remover e adicionar cláusulas específicas para esta proposta.</p>
        <button className="ec-btn-primario" onClick={inicializarClausulas} disabled={salvando}>
          {salvando ? 'Inicializando...' : 'Inicializar cláusulas para edição'}
        </button>
      </div>
    );
  }

  return (
    <div className="ec-container">
      <div className="ec-acoes-topo">
        <button className="ec-btn-secundario" onClick={adicionarClausula}>
          <FiPlus /> Adicionar cláusula
        </button>
        <button className="ec-btn-perigo" onClick={() => setConfirmReset(true)} disabled={salvando}>
          <FiRefreshCw /> Resetar para padrão
        </button>
      </div>

      {confirmReset && (
        <div className="ec-confirm">
          <p>Tem certeza? Todas as edições feitas nas cláusulas desta proposta serão perdidas.</p>
          <div className="ec-confirm-btns">
            <button className="ec-btn-secundario" onClick={() => setConfirmReset(false)}>Cancelar</button>
            <button className="ec-btn-perigo" onClick={resetar}>Confirmar reset</button>
          </div>
        </div>
      )}

      <div className="ec-lista">
        {clausulas.map((clausula, index) => {
          const key = clausula.id || clausula._tempId;
          const aberto = expandido === key;
          return (
            <div key={key} className={`ec-clausula${aberto ? ' ec-clausula--aberta' : ''}`}>
              {/* Cabeçalho clicável */}
              <div className="ec-clausula-header" onClick={() => toggleExpandido(key)}>
                <div className="ec-ordem-btns">
                  <button
                    onClick={e => moverClausula(e, index, -1)}
                    disabled={index === 0}
                    title="Mover para cima"
                    tabIndex={-1}
                  >
                    <FiChevronUp />
                  </button>
                  <button
                    onClick={e => moverClausula(e, index, 1)}
                    disabled={index === clausulas.length - 1}
                    title="Mover para baixo"
                    tabIndex={-1}
                  >
                    <FiChevronDown />
                  </button>
                </div>

                <span className="ec-titulo-texto">{clausula.titulo || 'Sem título'}</span>

                <div className="ec-header-acoes">
                  <button
                    className="ec-btn-remover"
                    onClick={e => removerClausula(e, clausula)}
                    title="Remover cláusula"
                    tabIndex={-1}
                  >
                    <FiTrash2 />
                  </button>
                  <FiChevronRight className={`ec-chevron${aberto ? ' ec-chevron--aberto' : ''}`} />
                </div>
              </div>

              {/* Painel de edição — só visível quando aberto */}
              {aberto && (
                <div className="ec-clausula-corpo">
                  <label className="ec-label">Título</label>
                  <input
                    className="ec-titulo-input"
                    value={clausula.titulo || ''}
                    onChange={e => atualizarCampo(clausula, 'titulo', e.target.value)}
                    onBlur={() => salvarClausula(clausula)}
                    placeholder="Título da cláusula"
                    autoFocus
                  />
                  <label className="ec-label">Conteúdo</label>
                  <AutoTextarea
                    value={clausula.conteudo || ''}
                    onChange={e => atualizarCampo(clausula, 'conteudo', e.target.value)}
                    onBlur={() => salvarClausula(clausula)}
                    placeholder="Digite o conteúdo desta cláusula..."
                  />
                  <span className="ec-clausula-hint">Salvo automaticamente ao sair do campo</span>
                </div>
              )}
            </div>
          );
        })}

        {clausulas.length === 0 && (
          <div className="ec-vazio">
            <p>Nenhuma cláusula. Clique em "Adicionar cláusula" para criar.</p>
          </div>
        )}
      </div>
    </div>
  );
}
