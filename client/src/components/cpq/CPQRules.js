import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { toast } from 'react-toastify';
import './CPQ.css';

export default function CPQRules() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/cpq/engineering-rules').then(r => setRules(r.data || [])).catch(() => setRules([])).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="cpq-page"><p>Carregando...</p></div>;

  return (
    <div className="cpq-page">
      <header className="cpq-header">
        <Link to="/comercial/cpq/projetos">← Projetos CPQ</Link>
        <h1>Regras de engenharia</h1>
      </header>
      <div className="cpq-table-wrap">
        <table className="cpq-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Condição</th>
              <th>Resultado</th>
              <th>Prioridade</th>
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 ? (
              <tr><td colSpan="4">Nenhuma regra. As regras padrão são inseridas ao iniciar o servidor.</td></tr>
            ) : rules.map(r => (
              <tr key={r.id}>
                <td>{r.nome || '—'}</td>
                <td>{r.condicao_expr || [r.condicao_campo, r.condicao_operador, r.condicao_valor].filter(Boolean).join(' ')}</td>
                <td>{r.resultado_equipamento || r.resultado_especificacao || '—'}</td>
                <td>{r.prioridade}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
