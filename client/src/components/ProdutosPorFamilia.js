import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import Produtos from './Produtos';
import './Loading.css';

const ProdutosPorFamilia = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [familia, setFamilia] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.get(`/familias/${id}`)
      .then((res) => {
        if (!cancelled && res.data) setFamilia(res.data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.error || 'Família não encontrada');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return (
      <div className="loading">
        <div className="loading-spinner"></div>
        <p>Carregando família...</p>
      </div>
    );
  }
  if (error || !familia) {
    return (
      <div style={{ padding: '24px' }}>
        <p>{error || 'Família não encontrada'}</p>
        <button type="button" className="btn-primary" onClick={() => navigate('/comercial/produtos')}>
          Voltar para famílias
        </button>
      </div>
    );
  }

  return <Produtos familiaFromUrl={familia.nome} familiaNome={familia.nome} />;
};

export default ProdutosPorFamilia;
