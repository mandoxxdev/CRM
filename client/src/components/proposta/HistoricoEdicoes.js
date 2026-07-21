import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import './HistoricoEdicoes.css';

// Keys for campo (contact field changes) and tipo (clause event types)
const LABELS = {
  // campo values for contact field edits (tipo='campo')
  cliente_nome: 'Nome/Razão Social',
  cliente_email: 'E-mail',
  cliente_telefone: 'Telefone',
  cliente_contato: 'Contato',
  // tipo values for clause events
  clausula_criada: 'Cláusula criada',
  clausula_editada: 'Cláusula editada',
  clausula_removida: 'Cláusula removida',
  clausula_reordenada: 'Cláusulas reordenadas',
  clausulas_inicializadas: 'Cláusulas inicializadas',
  clausulas_resetadas: 'Cláusulas resetadas para padrão',
  // tipo values for item audit events (save principal da proposta)
  item_adicionado: 'Produto adicionado',
  item_editado: 'Produto editado',
  item_removido: 'Produto removido',
};

function formatarData(str) {
  if (!str) return '—';
  const d = new Date(str);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function stripHtml(str) {
  if (!str) return '';
  return String(str).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function DiffView({ anterior, novo }) {
  if (!anterior && !novo) return null;
  return (
    <div className="he-diff">
      {anterior !== null && anterior !== undefined && (
        <div className="he-diff-antes">
          <span className="he-diff-label">Antes</span>
          <span>{stripHtml(anterior)}</span>
        </div>
      )}
      {novo !== null && novo !== undefined && (
        <div className="he-diff-depois">
          <span className="he-diff-label">Depois</span>
          <span>{stripHtml(novo)}</span>
        </div>
      )}
    </div>
  );
}

export default function HistoricoEdicoes({ propostaId }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagina, setPagina] = useState(1);
  const [total, setTotal] = useState(0);
  const [expandido, setExpandido] = useState(null);
  const POR_PAGINA = 20;

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/propostas/${propostaId}/edicoes-log`, {
        params: { page: pagina, limit: POR_PAGINA },
      });
      setLogs(res.data?.logs || []);
      setTotal(res.data?.total || 0);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [propostaId, pagina]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const totalPaginas = Math.ceil(total / POR_PAGINA);
  const temDiff = (log) => log.valor_anterior !== null || log.valor_novo !== null;

  return (
    <div className="he-container">
      {loading ? (
        <div className="he-loading">Carregando histórico...</div>
      ) : logs.length === 0 ? (
        <div className="he-vazio">Nenhuma alteração registrada para esta proposta.</div>
      ) : (
        <>
          <div className="he-lista">
            {logs.map(log => (
              <div key={log.id} className="he-item">
                <div className="he-item-header">
                  <div className="he-item-info">
                    <span className="he-campo">{LABELS[log.tipo] || LABELS[log.campo] || log.tipo || log.campo}</span>
                    {log.clausula_id && (
                      <span className="he-clausula-id">#{log.clausula_id}</span>
                    )}
                  </div>
                  <div className="he-item-meta">
                    <span className="he-usuario">{log.usuario_nome || 'Usuário'}</span>
                    <span className="he-data">{formatarData(log.criado_em)}</span>
                    {temDiff(log) && (
                      <button
                        className="he-btn-diff"
                        onClick={() => setExpandido(expandido === log.id ? null : log.id)}
                      >
                        {expandido === log.id ? 'Fechar' : 'Ver diff'}
                      </button>
                    )}
                  </div>
                </div>
                {expandido === log.id && (
                  <DiffView anterior={log.valor_anterior} novo={log.valor_novo} />
                )}
              </div>
            ))}
          </div>

          {totalPaginas > 1 && (
            <div className="he-paginacao">
              <button disabled={pagina === 1} onClick={() => setPagina(p => p - 1)}>Anterior</button>
              <span>{pagina} / {totalPaginas}</span>
              <button disabled={pagina === totalPaginas} onClick={() => setPagina(p => p + 1)}>Próximo</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
