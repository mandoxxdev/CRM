import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { FiBell, FiX, FiFileText, FiAlertCircle } from 'react-icons/fi';
import { formatarDataDoBanco } from '../utils/dataLocal'; // Etapa 165 (B1058): a data do lembrete no dia gravado (antes a vespera)
import './Notificacoes.css';

const Notificacoes = () => {
  const [notificacoes, setNotificacoes] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0 });
  const dropdownRef = useRef(null);
  const buttonRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadNotificacoes();
    // Atualizar notificações a cada 30 segundos
    const interval = setInterval(loadNotificacoes, 30000);
    return () => clearInterval(interval);
  }, []);

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadNotificacoes = async () => {
    try {
      setLoading(true);
      console.log('🔔 Carregando notificações...');
      const response = await api.get('/notificacoes');
      console.log('🔔 Notificações recebidas:', response.data);
      setNotificacoes(response.data || []);
    } catch (error) {
      console.error('❌ Erro ao carregar notificações:', error);
      console.error('❌ Detalhes do erro:', error.response?.data || error.message);
      // Em caso de erro, definir array vazio para não quebrar a UI
      setNotificacoes([]);
    } finally {
      setLoading(false);
    }
  };

  const handleNotificationClick = (notificacao) => {
    if (notificacao.proposta_id) {
      // Etapa 154 (RN-154.03): a tela da proposta mora dentro de /comercial (sem o prefixo, o clique caia na rota inexistente)
      navigate(`/comercial/propostas/editar/${notificacao.proposta_id}`);
    }
    setShowDropdown(false);
  };

  const getPrioridadeColor = (prioridade) => {
    switch (prioridade) {
      case 'vencido':
        return '#e74c3c';
      case 'hoje':
        return '#f39c12';
      default:
        return '#3498db';
    }
  };

  const getPrioridadeLabel = (prioridade) => {
    switch (prioridade) {
      case 'vencido':
        return 'Vencido';
      case 'hoje':
        return 'Hoje';
      default:
        return 'Próximos 7 dias';
    }
  };

  const notificacoesPendentes = notificacoes.filter(n => n.prioridade === 'vencido' || n.prioridade === 'hoje');
  const countPendentes = notificacoesPendentes.length;


  console.log('🔔 Notificacoes renderizando - total:', notificacoes.length, 'pendentes:', countPendentes);

  return (
    <div 
      className="notificacoes-container" 
      ref={dropdownRef}
    >
      <button
        ref={buttonRef}
        className="notificacoes-bell"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          console.log('🔔 Clicou no sininho');
          
          // Calcular posição do dropdown
          if (buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setDropdownPosition({
              top: rect.bottom + 5, // Posicionar logo abaixo do botão
              right: window.innerWidth - rect.right
            });
          }
          
          setShowDropdown(!showDropdown);
        }}
        title="Notificações"
        type="button"
      >
        <FiBell />
        {countPendentes > 0 && (
          <span className="notificacoes-badge">{countPendentes}</span>
        )}
      </button>

      {showDropdown && (
        <div 
          className="notificacoes-dropdown"
          style={{
            position: 'fixed',
            top: `${dropdownPosition.top}px`,
            right: `${dropdownPosition.right}px`,
            zIndex: 10000
          }}
        >
          <div className="notificacoes-header">
            <h3>Notificações</h3>
            <button
              className="btn-close"
              onClick={() => setShowDropdown(false)}
            >
              <FiX />
            </button>
          </div>

          <div className="notificacoes-list">
            {loading ? (
              <div className="notificacoes-loading">Carregando...</div>
            ) : notificacoes.length === 0 ? (
              <div className="notificacoes-empty">
                <FiBell />
                <p>Nenhuma notificação</p>
              </div>
            ) : (
              notificacoes.map((notificacao) => (
                <div
                  key={notificacao.id}
                  className={`notificacao-item ${notificacao.prioridade}`}
                  onClick={() => handleNotificationClick(notificacao)}
                >
                  <div className="notificacao-icon">
                    <FiFileText />
                  </div>
                  <div className="notificacao-content">
                    <div className="notificacao-header-item">
                      <span className="notificacao-titulo">{notificacao.titulo}</span>
                      <span
                        className="notificacao-prioridade"
                        style={{ color: getPrioridadeColor(notificacao.prioridade) }}
                      >
                        {getPrioridadeLabel(notificacao.prioridade)}
                      </span>
                    </div>
                    <p className="notificacao-mensagem">{notificacao.mensagem}</p>
                    <div className="notificacao-meta">
                      <span>{notificacao.cliente_nome}</span>
                      {notificacao.data && (
                        <span>
                          {formatarDataDoBanco(notificacao.data, '-', { soData: true })}
                        </span>
                      )}
                    </div>
                  </div>
                  {notificacao.prioridade === 'vencido' && (
                    <div className="notificacao-alert">
                      <FiAlertCircle />
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {notificacoes.length > 0 && (
            <div className="notificacoes-footer">
              <button
                className="btn-ver-todas"
                onClick={() => {
                  navigate('/comercial/propostas');
                  setShowDropdown(false);
                }}
              >
                Ver todas as propostas
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Notificacoes;

