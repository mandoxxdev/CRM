import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import api from '../../services/api';
import { toast } from 'react-toastify';
import OSDetalhesForm from '../OSDetalhesForm';
import './Operacional.css';

const OSFormPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [os, setOs] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Detectar se veio do módulo comercial ou operacional
  const isFromComercial = location.pathname.includes('/comercial/ordens-servico');

  useEffect(() => {
    if (id) {
      loadOS();
    } else {
      setLoading(false);
    }
  }, [id]);

  const loadOS = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/operacional/ordens-servico/${id}`);
      if (response.data) {
        setOs(response.data);
      } else {
        throw new Error('OS não encontrada');
      }
    } catch (error) {
      console.error('Erro ao carregar OS:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Erro ao carregar ordem de serviço';
      toast.error(errorMessage);
      setTimeout(() => {
        navigate(isFromComercial ? '/comercial/ordens-servico' : '/fabrica/ordens-servico');
      }, 2000);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    navigate(isFromComercial ? '/comercial/ordens-servico' : '/fabrica/ordens-servico');
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <p>Carregando...</p>
      </div>
    );
  }

  return (
    <div style={{ 
      padding: '30px', 
      minHeight: '100vh',
      backgroundColor: '#f8fafc'
    }}>
      <OSDetalhesForm os={os} onClose={handleClose} isFromComercial={isFromComercial} />
    </div>
  );
};

export default OSFormPage;
