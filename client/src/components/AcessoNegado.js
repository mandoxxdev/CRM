import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiAlertTriangle, FiX, FiShield } from 'react-icons/fi';
import api from '../services/api';
import './AcessoNegado.css';

const AcessoNegado = ({ modulo, nomeModulo }) => {
  const navigate = useNavigate();

  useEffect(() => {
    // Esconder a sidebar quando o alerta aparecer
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
      sidebar.style.display = 'none';
    }

    // Adicionar classe ao body para esconder sidebar via CSS
    document.body.classList.add('acesso-negado-active');

    // Registrar tentativa de acesso não autorizado
    const registrarTentativaAcesso = async () => {
      try {
        // Tentar registrar no backend (pode não existir ainda)
        await api.post('/auditoria/tentativa-acesso', {
          modulo: modulo,
          nome_modulo: nomeModulo,
          tipo: 'acesso_negado',
          timestamp: new Date().toISOString()
        }).catch(() => {
          // Se a rota não existir, apenas logar no console
          console.warn('Endpoint de auditoria não disponível. Tentativa de acesso registrada localmente.');
          console.log('Tentativa de acesso negado:', {
            modulo,
            nomeModulo,
            timestamp: new Date().toISOString()
          });
        });
      } catch (error) {
        // Não bloquear a exibição do alerta se houver erro na API
        console.warn('Não foi possível registrar tentativa de acesso:', error);
      }
    };

    registrarTentativaAcesso();

    // Cleanup: restaurar sidebar quando o componente desmontar
    return () => {
      if (sidebar) {
        sidebar.style.display = '';
      }
      document.body.classList.remove('acesso-negado-active');
    };
  }, [modulo, nomeModulo]);

  const handleVoltar = () => {
    navigate('/');
  };

  return (
    <div className="acesso-negado-container">
      <div className="acesso-negado-alert">
        <div className="acesso-negado-header">
          <div className="acesso-negado-icon">
            <FiAlertTriangle />
          </div>
          <h2>Acesso Negado</h2>
        </div>
        
        <div className="acesso-negado-content">
          <p className="acesso-negado-mensagem-principal">
            Você não tem permissão para acessar o módulo <strong>{nomeModulo}</strong>.
          </p>
          
          <div className="acesso-negado-aviso">
            <FiShield className="aviso-icon" />
            <p>
              <strong>Esta tentativa de acesso foi registrada e será notificada para a diretoria.</strong>
            </p>
          </div>

          <p className="acesso-negado-detalhes">
            Se você acredita que deveria ter acesso a este módulo, entre em contato com o administrador do sistema.
          </p>
        </div>

        <div className="acesso-negado-actions">
          <button onClick={handleVoltar} className="btn-voltar">
            Voltar ao Dashboard
          </button>
        </div>
      </div>
    </div>
  );
};

export default AcessoNegado;

