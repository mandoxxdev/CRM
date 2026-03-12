import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { toast } from 'react-toastify';
import './CPQ.css';

export default function CPQProjects() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/cpq/projects').then(r => setList(r.data || [])).catch(() => setList([])).finally(() => setLoading(false));
  }, []);

  const remove = (id) => {
    if (!window.confirm('Excluir este projeto CPQ?')) return;
    api.delete(`/cpq/projects/${id}`).then(() => {
      setList(prev => prev.filter(p => p.id !== id));
      toast.success('Projeto excluído');
    }).catch(() => toast.error('Erro ao excluir'));
  };

  return (
    <div className="cpq-page">
      <header className="cpq-header">
        <h1>Projetos CPQ</h1>
        <Link to="/comercial/cpq/configurador" className="cpq-btn cpq-btn-primary">Novo configurador</Link>
        <Link to="/comercial/cpq/regras" className="cpq-btn cpq-btn-sec">Regras de engenharia</Link>
      </header>
      {loading ? <p>Carregando...</p> : (
        <div className="cpq-table-wrap">
          <table className="cpq-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Título</th>
                <th>Cliente</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr><td colSpan="5">Nenhum projeto. Use o configurador para criar.</td></tr>
              ) : list.map(p => (
                <tr key={p.id}>
                  <td>{p.id}</td>
                  <td>{p.titulo}</td>
                  <td>{p.cliente_nome || '—'}</td>
                  <td><span className="cpq-badge">{p.status}</span></td>
                  <td>
                    <Link to={`/comercial/cpq/projetos/${p.id}`} className="cpq-link">Abrir</Link>
                    <button type="button" className="cpq-link danger" onClick={() => remove(p.id)}>Excluir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
