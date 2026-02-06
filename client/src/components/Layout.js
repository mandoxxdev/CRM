import React, { useState, useEffect, useCallback } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import {
  FiHome, FiUsers, FiBriefcase, FiFileText,
  FiCalendar, FiLogOut, FiMenu, FiX, FiUserPlus, FiPackage, FiBarChart2, FiMap, FiDollarSign, FiSettings, FiShield, FiMoon, FiSun, FiGrid,
  FiShoppingCart, FiTrendingDown, FiTrendingUp, FiCreditCard, FiTruck, FiFileText as FiFileText2, FiTool, FiCheckCircle, FiMessageCircle
} from 'react-icons/fi';
import Notificacoes from './Notificacoes';
import BuscaGlobal from './BuscaGlobal';
import ReportBuilder from './ReportBuilder';
import WorkflowEngine from './WorkflowEngine';
import AnimatedBackground from './AnimatedBackground';
import HelpGuide from './HelpGuide';
import HelpSearch from './HelpSearch';
import ModuleSplash from './ModuleSplash';
import PreferenciasMenu from './PreferenciasMenu';
import ChatIA from './ChatIA';
import './Layout.css';

const Layout = () => {
  // No mobile, sidebar começa fechada. No desktop, sempre aberta
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth > 768;
    }
    return true;
  });

  // Manter sidebar sempre aberta no desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) {
        setSidebarOpen(true);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const [userGrupos, setUserGrupos] = useState([]);
  const [buscaGlobalOpen, setBuscaGlobalOpen] = useState(false);
  const [reportBuilderOpen, setReportBuilderOpen] = useState(false);
  const [workflowEngineOpen, setWorkflowEngineOpen] = useState(false);
  const [helpSearchOpen, setHelpSearchOpen] = useState(false);
  const [chatIAOpen, setChatIAOpen] = useState(false);
  const [animatedBackgroundEnabled, setAnimatedBackgroundEnabled] = useState(
    localStorage.getItem('animatedBackground') !== 'false'
  );
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl+B - Toggle sidebar (apenas no mobile)
      if (e.ctrlKey && e.key === 'b' && window.innerWidth <= 768) {
        e.preventDefault();
        setSidebarOpen(prev => !prev);
      }
      // Ctrl+K - Busca global
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        setBuscaGlobalOpen(true);
      }
      // Ctrl+R - Report Builder
      if (e.ctrlKey && e.key === 'r') {
        e.preventDefault();
        setReportBuilderOpen(true);
      }
      // Ctrl+W - Workflow Engine
      if (e.ctrlKey && e.key === 'w') {
        e.preventDefault();
        setWorkflowEngineOpen(true);
      }
      // Ctrl+? ou F1 - Help Search
      if ((e.ctrlKey && e.key === '/') || e.key === 'F1') {
        e.preventDefault();
        setHelpSearchOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (user?.id) {
      loadUserGrupos();
    }
  }, [user?.id]);

  // Escutar mudanças na preferência do fundo animado
  useEffect(() => {
    const handleAnimatedBackgroundChange = () => {
      setAnimatedBackgroundEnabled(localStorage.getItem('animatedBackground') !== 'false');
    };

    window.addEventListener('animatedBackgroundChanged', handleAnimatedBackgroundChange);
    
    // Verificar ao carregar
    setAnimatedBackgroundEnabled(localStorage.getItem('animatedBackground') !== 'false');

    return () => {
      window.removeEventListener('animatedBackgroundChanged', handleAnimatedBackgroundChange);
    };
  }, []);

  const loadUserGrupos = async () => {
    try {
      const response = await api.get(`/usuarios/${user.id}/grupos`);
      setUserGrupos(response.data.grupos || []);
    } catch (error) {
      console.error('Erro ao carregar grupos do usuário:', error);
      setUserGrupos([]);
    }
  };

  // Fechar sidebar ao clicar em um item no mobile (memoizado)
  const handleNavClick = useCallback(() => {
    if (window.innerWidth <= 768) {
      setSidebarOpen(false);
    }
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Detectar qual módulo está ativo
  const getActiveModule = () => {
    const path = location.pathname;
    if (path.startsWith('/compras')) return 'compras';
    if (path.startsWith('/financeiro')) return 'financeiro';
    if (path.startsWith('/fabrica')) return 'operacional';
    if (path.startsWith('/admin')) return 'admin';
    if (path.startsWith('/comercial')) return 'crm';
    return 'crm'; // Default para CRM
  };

  const activeModule = getActiveModule();

  // Menu do CRM (padrão)
  const crmMenuItems = [
    { path: '/comercial', icon: FiHome, label: 'Dashboard' },
    { path: '/comercial/clientes', icon: FiUsers, label: 'Clientes' },
    { path: '/comercial/projetos', icon: FiBriefcase, label: 'Projetos' },
    { path: '/comercial/produtos', icon: FiPackage, label: 'Produtos' },
    { path: '/comercial/propostas', icon: FiFileText, label: 'Propostas' },
    { path: '/comercial/aprovacoes', icon: FiCheckCircle, label: 'Aprovações' },
    { path: '/comercial/ordens-servico', icon: FiTool, label: 'Ordens de Serviço' },
    { path: '/comercial/atividades', icon: FiCalendar, label: 'Atividades' },
    { path: '/comercial/relatorios', icon: FiBarChart2, label: 'Relatórios' },
    { path: '/comercial/maquinas-vendidas', icon: FiMap, label: 'Máquinas Vendidas' },
    { path: '/comercial/custos-viagens', icon: FiDollarSign, label: 'Custos de Viagens' },
  ];

  // Menu do módulo de Compras
  const comprasMenuItems = [
    { path: '/compras/fornecedores', icon: FiTruck, label: 'Fornecedores' },
    { path: '/compras/pedidos', icon: FiShoppingCart, label: 'Pedidos de Compra' },
    { path: '/compras/cotacoes', icon: FiFileText2, label: 'Cotações' },
  ];

  // Menu do módulo Financeiro
  const financeiroMenuItems = [
    { path: '/financeiro/contas-pagar', icon: FiTrendingDown, label: 'Contas a Pagar' },
    { path: '/financeiro/contas-receber', icon: FiTrendingUp, label: 'Contas a Receber' },
    { path: '/financeiro/fluxo-caixa', icon: FiBarChart2, label: 'Fluxo de Caixa' },
    { path: '/financeiro/bancos', icon: FiCreditCard, label: 'Bancos' },
  ];

  // Menu do módulo Operacional (Fábrica)
  const operacionalMenuItems = [
    { path: '/fabrica/ordens-servico', icon: FiFileText2, label: 'Ordens de Serviço' },
    { path: '/fabrica/producao', icon: FiBriefcase, label: 'Produção' },
    { path: '/fabrica/equipamentos', icon: FiPackage, label: 'Equipamentos' },
  ];

  // Menu do módulo Admin
  const adminMenuItems = [
    { path: '/admin/usuarios', icon: FiUsers, label: 'Usuários' },
    { path: '/admin/permissoes', icon: FiShield, label: 'Permissões' },
  ];

  // Selecionar menu baseado no módulo ativo
  const getMenuItems = () => {
    switch (activeModule) {
      case 'compras':
        return comprasMenuItems;
      case 'financeiro':
        return financeiroMenuItems;
      case 'operacional':
        return operacionalMenuItems;
      case 'admin':
        return adminMenuItems;
      default:
        return crmMenuItems;
    }
  };

  const menuItems = getMenuItems();

  return (
    <div className="layout">
      {animatedBackgroundEnabled && <AnimatedBackground />}
      <div className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <img src="/logo.png" alt="GMP INDUSTRIAIS" className="logo-image" />
          </div>
          <div className="sidebar-header-actions">
            <PreferenciasMenu key="preferencias-menu-fixed" />
          </div>
        </div>
        <nav className="sidebar-nav">
          <button
            className="nav-item nav-item-button nav-item-module-selector"
            onClick={() => {
              navigate('/');
              handleNavClick();
            }}
            title="Selecionar Módulo"
          >
            <FiGrid />
            {sidebarOpen && <span>Selecionar Módulo</span>}
          </button>
          {menuItems.map((item) => {
            // Verificar se é rota admin e se usuário é admin
            // Se não houver role definido, mostrar para todos (compatibilidade)
            if (item.adminOnly && user?.role && user?.role !== 'admin') {
              return null;
            }
            const Icon = item.icon;
            // Verificar se a rota está ativa
            let isActive = false;
            
            // Se for o Dashboard, só ativo quando está exatamente em /comercial
            if (item.path === '/comercial') {
              isActive = location.pathname === '/comercial';
            } else {
              // Para outras rotas, verificar se começa com o path
              // Ex: /comercial/produtos ou /comercial/produtos/novo devem ativar "Produtos"
              isActive = location.pathname === item.path || 
                        location.pathname.startsWith(item.path + '/');
            }
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`nav-item ${isActive ? 'active' : ''}`}
                onClick={handleNavClick}
              >
                <Icon />
                {sidebarOpen && <span>{item.label}</span>}
              </Link>
            );
          })}
          {/* Aba de IA */}
          <button
            className={`nav-item nav-item-button ${chatIAOpen ? 'active' : ''}`}
            onClick={() => setChatIAOpen(!chatIAOpen)}
            title="Assistente IA"
          >
            <FiMessageCircle />
            {sidebarOpen && <span>Assistente IA</span>}
          </button>
        </nav>
        <div className="sidebar-footer">
          <div className="user-info">
            {sidebarOpen && (
              <>
                <div className="user-name">{user?.nome}</div>
                <div className="user-role">
                  {userGrupos.length > 0 ? (
                    userGrupos.map((grupo, index) => (
                      <span key={grupo.id}>
                        {grupo.nome}
                        {index < userGrupos.length - 1 && ', '}
                      </span>
                    ))
                  ) : (
                    <span>Sem grupo</span>
                  )}
                </div>
              </>
            )}
          </div>
          <button className="logout-button" onClick={handleLogout}>
            <FiLogOut />
            {sidebarOpen && <span>Sair</span>}
          </button>
        </div>
      </div>
      <div className="main-content">
        {/* Botão hambúrguer para mobile */}
        {!sidebarOpen && (
          <button 
            className="mobile-menu-toggle"
            onClick={() => setSidebarOpen(true)}
          >
            <FiMenu />
          </button>
        )}
        {/* Overlay para fechar sidebar no mobile */}
        {sidebarOpen && (
          <div 
            className="sidebar-overlay"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <ModuleSplash>
          <Outlet />
        </ModuleSplash>
      </div>
      <BuscaGlobal isOpen={buscaGlobalOpen} onClose={() => setBuscaGlobalOpen(false)} />
      <ReportBuilder isOpen={reportBuilderOpen} onClose={() => setReportBuilderOpen(false)} />
      <WorkflowEngine isOpen={workflowEngineOpen} onClose={() => setWorkflowEngineOpen(false)} />
      <HelpGuide />
      <HelpSearch isOpen={helpSearchOpen} onClose={() => setHelpSearchOpen(false)} />
      <ChatIA isOpen={chatIAOpen} onClose={() => setChatIAOpen(false)} />
    </div>
  );
};

export default Layout;

