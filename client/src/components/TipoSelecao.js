import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import {
  FiBriefcase, FiShoppingCart, FiDollarSign, FiUsers,
  FiSettings, FiBarChart2, FiPackage, FiTarget,
  FiLock, FiCheckCircle, FiShield, FiTool
} from 'react-icons/fi';
import SplashScreen from './SplashScreen';
import AnimatedBackground from './AnimatedBackground';
import './TipoSelecao.css';

const TipoSelecao = ({ onClose, forceShow = false }) => {
  const [modulosDisponiveis, setModulosDisponiveis] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSplash, setShowSplash] = useState(false);
  const [splashModule, setSplashModule] = useState(null);
  const [rotaDestino, setRotaDestino] = useState(null);
  const navigate = useNavigate();
  const { user } = useAuth();

  // Todos os módulos disponíveis no sistema
  const todosModulos = [
    {
      id: 'comercial',
      nome: 'COMERCIAL',
      descricao: 'Gestão de vendas, propostas e oportunidades',
      icon: FiTarget,
      modulo: 'comercial',
      rota: '/comercial'
    },
    {
      id: 'compras',
      nome: 'COMPRAS',
      descricao: 'Gestão de fornecedores, pedidos e cotações',
      icon: FiShoppingCart,
      modulo: 'compras',
      rota: '/compras'
    },
    {
      id: 'financeiro',
      nome: 'FINANCEIRO',
      descricao: 'Contas a pagar/receber, fluxo de caixa e bancos',
      icon: FiDollarSign,
      modulo: 'financeiro',
      rota: '/financeiro'
    },
    {
      id: 'operacional',
      nome: 'OPERACIONAL',
      descricao: 'Controle de fábrica, OS e produção',
      icon: FiTool,
      modulo: 'operacional',
      rota: '/fabrica'
    },
    {
      id: 'administrativo',
      nome: 'ADMINISTRATIVO',
      descricao: 'Configurações e gestão do sistema',
      icon: FiSettings,
      modulo: 'administrativo',
      rota: '/configuracoes'
    },
    {
      id: 'admin',
      nome: 'ADMIN',
      descricao: 'Gestão de usuários e permissões',
      icon: FiShield,
      modulo: 'admin',
      rota: '/admin'
    }
  ];

  // Verificar se há rota pendente no sessionStorage (fallback caso componente seja desmontado)
  useEffect(() => {
    const verificarRotaPendente = () => {
      const rotaPendente = sessionStorage.getItem('rotaDestinoModulo');
      if (rotaPendente && !showSplash) {
        console.log('Rota pendente encontrada, navegando:', rotaPendente);
        sessionStorage.removeItem('rotaDestinoModulo');
        sessionStorage.removeItem('moduloDestino');
        navigate(rotaPendente, { replace: true });
      }
    };
    
    // Verificar após um pequeno delay
    const timer = setTimeout(verificarRotaPendente, 1000);
    return () => clearTimeout(timer);
  }, [showSplash, navigate]);

  useEffect(() => {
    const carregarModulosPermitidos = async () => {
      if (!user?.id) {
        setLoading(false);
        // Se não houver usuário, definir pelo menos comercial como disponível
        const modulosComStatus = todosModulos.map(mod => ({
          ...mod,
          disponivel: mod.modulo === 'comercial'
        }));
        setModulosDisponiveis(modulosComStatus);
        return;
      }

      // Verificar se é admin ANTES de fazer qualquer chamada à API
      // Verificação case-insensitive para garantir compatibilidade
      const userRole = String(user.role || '').toLowerCase();
      const isAdmin = userRole === 'admin';
      
      try {
        setLoading(true);
        
        // Se for admin, dar acesso a todos os módulos imediatamente
        if (isAdmin) {
          const modulosComStatus = todosModulos.map(mod => ({
            ...mod,
            disponivel: true
          }));
          setModulosDisponiveis(modulosComStatus);
          setLoading(false);
          return;
        }

        // Para usuários não-admin, buscar permissões
        const response = await api.get(`/usuarios/${user.id}/grupos`);
        const { permissoes } = response.data;

        // Extrair módulos únicos que o usuário tem permissão
        const modulosPermitidos = new Set();
        
        if (permissoes && permissoes.length > 0) {
          // Verificar permissões do usuário
          permissoes.forEach(perm => {
            if (perm.permissao === 1) {
              modulosPermitidos.add(perm.modulo);
            }
          });
        } else {
          // Se não tem permissões específicas, apenas comercial por padrão
          modulosPermitidos.add('comercial');
        }

        // Marcar quais módulos estão disponíveis
        const modulosComStatus = todosModulos.map(mod => ({
          ...mod,
          disponivel: modulosPermitidos.has(mod.modulo)
        }));

        setModulosDisponiveis(modulosComStatus);
      } catch (error) {
        console.error('Erro ao carregar módulos:', error);
        // Em caso de erro, verificar se é admin para dar acesso total
        const userRoleError = String(user.role || '').toLowerCase();
        if (userRoleError === 'admin') {
          const modulosComStatus = todosModulos.map(mod => ({
            ...mod,
            disponivel: true
          }));
          setModulosDisponiveis(modulosComStatus);
        } else {
          // Se não for admin e houver erro, apenas comercial disponível
          const modulosComStatus = todosModulos.map(mod => ({
            ...mod,
            disponivel: mod.modulo === 'comercial'
          }));
          setModulosDisponiveis(modulosComStatus);
        }
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      carregarModulosPermitidos();
    } else {
      setLoading(false);
      // Se não houver usuário, definir pelo menos comercial como disponível
      const modulosComStatus = todosModulos.map(mod => ({
        ...mod,
        disponivel: mod.modulo === 'comercial'
      }));
      setModulosDisponiveis(modulosComStatus);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleModuloClick = (modulo) => {
    if (modulo.disponivel && modulo.rota) {
      console.log('Clicou no módulo:', modulo.modulo, 'Rota:', modulo.rota);
      
      // Marcar que o usuário já viu os módulos ANTES de mostrar splash
      if (!forceShow) {
        sessionStorage.setItem('modulosVisualizados', 'true');
      }
      
      // Salvar a rota no sessionStorage para garantir navegação mesmo se componente desmontar
      sessionStorage.setItem('rotaDestinoModulo', modulo.rota);
      sessionStorage.setItem('moduloDestino', modulo.modulo);
      
      // Salvar a rota de destino antes de mostrar o splash
      setRotaDestino(modulo.rota);
      setSplashModule(modulo.modulo);
      setShowSplash(true);
      
      // NÃO fechar modal ainda - deixar splash controlar quando completar
    }
  };

  const handleSplashComplete = () => {
    // Tentar pegar rota do estado primeiro, senão do sessionStorage
    const rota = rotaDestino || sessionStorage.getItem('rotaDestinoModulo');
    const modulo = splashModule || sessionStorage.getItem('moduloDestino');
    
    console.log('Splash completo. Navegando para:', rota, 'Módulo:', modulo);
    
    // Limpar sessionStorage
    sessionStorage.removeItem('rotaDestinoModulo');
    sessionStorage.removeItem('moduloDestino');
    
    // Limpar estados
    setShowSplash(false);
    setRotaDestino(null);
    setSplashModule(null);
    
    // Fechar modal se existir
    if (onClose) {
      onClose();
    }
    
    // Navegar imediatamente
    if (rota) {
      console.log('Executando navegação para:', rota);
      // Usar replace: true para não criar histórico e evitar voltar
      navigate(rota, { replace: true });
    } else {
      console.error('Nenhuma rota encontrada para navegar!');
    }
  };

  // Se estiver mostrando splash, renderizar apenas o splash
  if (showSplash && splashModule) {
    console.log('Renderizando SplashScreen para módulo:', splashModule);
    return (
      <SplashScreen 
        onComplete={() => {
          console.log('Callback do SplashScreen chamado!');
          handleSplashComplete();
        }} 
        module={splashModule} 
      />
    );
  }

  // Se não houver usuário, mostrar mensagem de carregamento
  if (!user) {
    return (
      <div className="tipo-selecao-container">
        <div className="tipo-selecao-loading">
          <div className="loading-spinner"></div>
          <p>Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="tipo-selecao-container">
      <AnimatedBackground nodeCount={150} connectionDistance={250} />
      <div className="tipo-selecao-background">
        <div className="tipo-selecao-content">
          <div className="tipo-selecao-header">
            <h1>Módulos do Sistema</h1>
            <p>Selecione um módulo para acessar ou visualize os módulos disponíveis</p>
            {user?.role && String(user.role).toLowerCase() === 'admin' && (
              <p style={{ 
                marginTop: '0.5rem', 
                color: 'var(--gmp-success)', 
                fontSize: '0.9rem',
                fontWeight: 600
              }}>
                ✓ Você tem acesso a todos os módulos (Administrador)
              </p>
            )}
          </div>

          {loading ? (
            <div className="tipo-selecao-loading">
              <div className="loading-spinner"></div>
              <p>Carregando módulos...</p>
            </div>
          ) : (
            <>
              <div className="tipo-selecao-grid">
                {modulosDisponiveis.length > 0 ? (
                  modulosDisponiveis.map((modulo) => {
                    const Icon = modulo.icon;
                    const isDisponivel = modulo.disponivel;
                    
                    return (
                      <div
                        key={modulo.id}
                        className={`tipo-card ${isDisponivel ? 'disponivel' : 'bloqueado'} ${isDisponivel ? 'clickable' : ''}`}
                        onClick={() => handleModuloClick(modulo)}
                      >
                        {!isDisponivel && (
                          <div className="tipo-card-lock">
                            <FiLock />
                          </div>
                        )}
                        {isDisponivel && (
                          <div className="tipo-card-check-icon">
                            <FiCheckCircle />
                          </div>
                        )}
                        <div className={`tipo-card-icon ${isDisponivel ? 'ativo' : ''}`}>
                          <Icon className="tipo-card-icon-svg" />
                        </div>
                        <div className="tipo-card-content">
                          <h3>{modulo.nome}</h3>
                          <p>{modulo.descricao}</p>
                          {isDisponivel ? (
                            <span className="tipo-card-disponivel">Acesso permitido</span>
                          ) : (
                            <span className="tipo-card-indisponivel">Sem acesso</span>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', color: 'var(--gmp-text-light)' }}>
                    <p>Nenhum módulo disponível.</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default TipoSelecao;

