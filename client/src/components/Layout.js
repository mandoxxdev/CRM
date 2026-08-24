import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { canConfigureModule, canAccessAdministrativoConfig } from '../utils/systemPermissions';
import { identificarAtalho } from '../utils/atalhosTeclado';
import api from '../services/api';
import { fetchUserPermissions, getCachedUserPermissions, getEffectiveUser, seedPermissionsFromAuthUser } from '../services/permissionsCache';
import { bypassModuleRestrictions, isSystemAdmin } from '../utils/systemPermissions';
import { MODULOS_META, modulosDoUsuario, nivelAcessoUsuario } from '../constants/modulosMeta';
import {
  FiHome, FiUsers, FiBriefcase, FiFileText,
  FiCalendar, FiLogOut, FiMenu, FiX, FiUserPlus, FiPackage, FiBarChart2, FiMap, FiDollarSign, FiSettings, FiShield, FiMoon, FiSun, FiGrid,
  FiShoppingCart, FiTrendingDown, FiTrendingUp, FiCreditCard, FiTruck, FiFileText as FiFileText2, FiTool, FiCheckCircle,   FiSliders, FiCircle, FiDroplet, FiZap, FiLayers, FiClipboard,
  FiArchive, FiActivity, FiList, FiMessageCircle, FiAlertTriangle, FiCheckSquare, FiLock, FiCornerUpLeft,
  FiScissors
} from 'react-icons/fi';
import Notificacoes from './Notificacoes';
import BuscaGlobal from './BuscaGlobal';
import ReportBuilder from './ReportBuilder';
import WorkflowEngine from './WorkflowEngine';
import AnimatedBackground from './AnimatedBackground';
import HelpGuide from './HelpGuide';
import HelpSearch from './HelpSearch';
import ModuleSplash from './ModuleSplash';
import ErrorBoundary from './ErrorBoundary';
import { RouteLoading } from './LazyPage';
import { prefetchRoute } from '../routes/lazyModules';
import PreferenciasMenu from './PreferenciasMenu';
import './Layout.css';
import '../components/chat/Chat.css';

const CHAT_MENU_ITEM = { path: '/chat', icon: FiMessageCircle, label: 'Chat', global: true };

function getActiveModuleFromPath(path) {
  if (path.startsWith('/frota')) return 'frota';
  if (path.startsWith('/todolist')) return 'todolist';
  if (path.startsWith('/compras')) return 'compras';
  if (path.startsWith('/financeiro')) return 'financeiro';
  if (path.startsWith('/fabrica')) return 'operacional';
  if (path.startsWith('/configuracoes')) return 'administrativo';
  if (path.startsWith('/admin')) return 'admin';
  if (path.startsWith('/engenharia-projetos')) return 'engenharia_projetos';
  if (path.startsWith('/engenharia')) return 'engenharia';
  if (path.startsWith('/almoxarifado')) return 'almoxarifado';
  if (path.startsWith('/comercial')) return 'crm';
  return 'crm';
}

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
  const [permissionsReady, setPermissionsReady] = useState(false);
  const [buscaGlobalOpen, setBuscaGlobalOpen] = useState(false);
  const [reportBuilderOpen, setReportBuilderOpen] = useState(false);
  const [workflowEngineOpen, setWorkflowEngineOpen] = useState(false);
  const [helpSearchOpen, setHelpSearchOpen] = useState(false);
  const [animatedBackgroundEnabled, setAnimatedBackgroundEnabled] = useState(
    localStorage.getItem('animatedBackground') !== 'false'
  );
  const [chatUnread, setChatUnread] = useState(0);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      const atalho = identificarAtalho(e);
      if (!atalho) return;

      switch (atalho) {
        case 'sidebar':
          // Ctrl+B - Toggle sidebar (apenas no mobile)
          if (window.innerWidth > 768) return;
          e.preventDefault();
          setSidebarOpen(prev => !prev);
          break;
        case 'busca':
          // Ctrl+K - Busca global
          e.preventDefault();
          setBuscaGlobalOpen(true);
          break;
        case 'report':
          // Ctrl+R - Report Builder
          e.preventDefault();
          setReportBuilderOpen(true);
          break;
        case 'workflow':
          // Ctrl+W - Workflow Engine
          e.preventDefault();
          setWorkflowEngineOpen(true);
          break;
        case 'ajuda':
          // Ctrl+/ ou F1 - Help Search
          e.preventDefault();
          setHelpSearchOpen(true);
          break;
        default:
          break;
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

  const loadChatUnread = useCallback(async () => {
    if (!user?.id) return;
    try {
      const response = await api.get('/chat/nao-lidas');
      setChatUnread(response.data.total || 0);
    } catch {
      /* chat module may not be ready yet */
    }
  }, [user?.id]);

  useEffect(() => {
    loadChatUnread();
    const interval = setInterval(loadChatUnread, 30000);
    const onUnreadChanged = () => loadChatUnread();
    window.addEventListener('chat-unread-changed', onUnreadChanged);
    return () => {
      clearInterval(interval);
      window.removeEventListener('chat-unread-changed', onUnreadChanged);
    };
  }, [loadChatUnread]);

  useEffect(() => {
    const path = location.pathname;
    if (path.startsWith('/chat')) return;
    const module = getActiveModuleFromPath(path);
    try {
      sessionStorage.setItem('orion_active_module', module);
    } catch {
      /* ignore */
    }
  }, [location.pathname]);

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
      if (bypassModuleRestrictions(user) || isSystemAdmin(user)) {
        seedPermissionsFromAuthUser(user);
        const cached = getCachedUserPermissions(user.id);
        setUserGrupos(cached?.grupos || []);
        setPermissionsReady(true);
        return;
      }
      const cached = getCachedUserPermissions(user.id);
      const data = cached || await fetchUserPermissions(user.id);
      setUserGrupos(data.grupos || []);
      setPermissionsReady(true);
    } catch (error) {
      console.error('Erro ao carregar grupos do usuário:', error);
      setUserGrupos([]);
      setPermissionsReady(true);
    }
  };

  const effectiveUser = getEffectiveUser(user);

  const canSeeAdminOnlyItem = (item) => {
    if (!item.adminOnly) return true;
    if (activeModule === 'administrativo') {
      return canAccessAdministrativoConfig(effectiveUser);
    }
    return canConfigureModule(effectiveUser, activeModule);
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

  // Detectar qual módulo está ativo (menu lateral)
  const getActiveModule = () => {
    const path = location.pathname;
    if (path.startsWith('/chat')) {
      try {
        return sessionStorage.getItem('orion_active_module') || 'crm';
      } catch {
        return 'crm';
      }
    }
    return getActiveModuleFromPath(path);
  };

  const activeModule = getActiveModule();

  // Menu do CRM (padrão)
  const crmMenuItems = [
    { path: '/comercial', icon: FiHome, label: 'Dashboard' },
    { path: '/comercial/clientes', icon: FiUsers, label: 'Clientes' },
    { path: '/comercial/produtos', icon: FiPackage, label: 'Produtos' },
    { path: '/comercial/propostas', icon: FiFileText, label: 'Propostas' },
    { path: '/comercial/lista-precos', icon: FiDollarSign, label: 'Lista de Preços' },
    { path: '/comercial/aprovacoes', icon: FiCheckCircle, label: 'Aprovações' },
    { path: '/comercial/ordens-servico', icon: FiTool, label: 'Ordens de Serviço' },
    { path: '/comercial/atividades', icon: FiCalendar, label: 'Atividades' },
    { path: '/comercial/requisicoes-material/nova', icon: FiClipboard, label: 'Solicitar Material' },
    { path: '/comercial/requisicoes-material', icon: FiList, label: 'Minhas Requisições' },
    { path: '/comercial/relatorios', icon: FiBarChart2, label: 'Relatórios' },
    { path: '/comercial/maquinas-vendidas', icon: FiMap, label: 'Máquinas Vendidas' },
    { path: '/comercial/custos-viagens', icon: FiDollarSign, label: 'Custos de Viagens' },
  ];

  // Menu do módulo de Compras
  const comprasMenuItems = [
    { path: '/compras/solicitacoes', icon: FiCheckCircle, label: 'Solicitações de Compra' },
    { path: '/compras/fornecedores', icon: FiTruck, label: 'Fornecedores' },
    { path: '/compras/fornecedores-homologados', icon: FiPackage, label: 'Fornecedores homologados' },
    { path: '/compras/pedidos', icon: FiShoppingCart, label: 'Pedidos de Compra' },
    { path: '/compras/cotacoes', icon: FiFileText2, label: 'Cotações' },
    { path: '/compras/requisicoes-material/nova', icon: FiClipboard, label: 'Solicitar Material' },
    { path: '/compras/requisicoes-material', icon: FiList, label: 'Minhas Requisições' },
    { path: '/almoxarifado/recebimentos', icon: FiPackage, label: 'Recebimento NF/Material' },
  ];

  // Menu do módulo Financeiro (estilo Painel Financeiro / FinanceHub)
  const financeiroMenuItems = [
    { path: '/financeiro/dashboard', icon: FiGrid, label: 'Dashboard' },
    { path: '/financeiro/contas-pagar', icon: FiTrendingDown, label: 'Contas a Pagar' },
    { path: '/financeiro/contas-receber', icon: FiTrendingUp, label: 'Contas a Receber' },
    { path: '/financeiro/fluxo-caixa', icon: FiBarChart2, label: 'Fluxo de Caixa' },
    { path: '/financeiro/relatorios', icon: FiBarChart2, label: 'Relatórios' },
    { path: '/financeiro/bancos', icon: FiCreditCard, label: 'Conciliação Bancária' },
    { path: '/financeiro/requisicoes-material/nova', icon: FiClipboard, label: 'Solicitar Material' },
    { path: '/financeiro/requisicoes-material', icon: FiList, label: 'Minhas Requisições' },
    { path: '/almoxarifado/recebimentos', icon: FiPackage, label: 'Entrada de NF' },
  ];

  // Menu do módulo Operacional (Fábrica)
  const operacionalMenuItems = [
    { path: '/fabrica/ordens-servico', icon: FiFileText2, label: 'Ordens de Serviço' },
    { path: '/fabrica/producao', icon: FiBriefcase, label: 'Produção' },
    { path: '/fabrica/equipamentos', icon: FiPackage, label: 'Equipamentos' },
    { path: '/fabrica/requisicoes-material/nova', icon: FiClipboard, label: 'Solicitar Material' },
    { path: '/fabrica/requisicoes-material', icon: FiList, label: 'Minhas Requisições' },
  ];

  // Menu do módulo Frota
  const frotaMenuItems = [
    { path: '/frota', icon: FiHome, label: 'Dashboard Frota' },
    { path: '/frota/veiculos', icon: FiTruck, label: 'Veículos' },
    { path: '/frota/motoristas', icon: FiUsers, label: 'Motoristas' },
    { path: '/frota/manutencoes', icon: FiTool, label: 'Manutenções' },
    { path: '/frota/abastecimentos', icon: FiDroplet, label: 'Abastecimentos' },
    { path: '/frota/documentos', icon: FiFileText, label: 'Documentos' },
    { path: '/frota/viagens', icon: FiMap, label: 'Viagens' },
    { path: '/frota/checklists', icon: FiClipboard, label: 'Checklist Diário' },
    { path: '/frota/multas', icon: FiAlertTriangle, label: 'Multas' },
    { path: '/frota/relatorios', icon: FiBarChart2, label: 'Relatórios' },
    { path: '/frota/requisicoes-material/nova', icon: FiClipboard, label: 'Solicitar Material' },
    { path: '/frota/requisicoes-material', icon: FiList, label: 'Minhas Requisições' },
  ];

  const todolistMenuItems = [
    { path: '/todolist', icon: FiCheckSquare, label: 'Quadro Kanban' },
  ];

  // Menu do módulo Admin
  const adminMenuItems = [
    { path: '/admin/usuarios', icon: FiUsers, label: 'Usuários' },
    { path: '/admin/permissoes', icon: FiShield, label: 'Permissões' },
    { path: '/admin/requisicoes-material/nova', icon: FiClipboard, label: 'Solicitar Material' },
    { path: '/admin/requisicoes-material', icon: FiList, label: 'Minhas Requisições' },
  ];

  // Menu do módulo Cálculos de Engenharia
  const engenhariaMenuItems = [
    { path: '/engenharia', icon: FiSliders, label: 'Início' },
    { path: '/engenharia/requisicoes-material/nova', icon: FiClipboard, label: 'Solicitar Material' },
    { path: '/engenharia/requisicoes-material', icon: FiList, label: 'Minhas Requisições' },
    { path: '/engenharia/solicitacao-material-escritorio', icon: FiShoppingCart, label: 'Material escritório' },
    { path: '/engenharia/calculo-tampo', icon: FiCircle, label: 'Cálculo de Tampo' },
    { path: '/engenharia/calculo-volume', icon: FiDroplet, label: 'Cálculo de Volume' },
    { path: '/engenharia/calculo-motor-impelidor', icon: FiZap, label: 'Motor + Impelidor' },
    { path: '/engenharia/selecao-agitadores', icon: FiLayers, label: 'Seleção de Agitadores' },
  ];

  // Menu do módulo Almoxarifado
  const almoxarifadoMenuItems = [
    { path: '/almoxarifado', icon: FiArchive, label: 'Dashboard' },
    { path: '/almoxarifado/materiais', icon: FiList, label: 'Materiais' },
    { path: '/almoxarifado/requisicoes', icon: FiCheckCircle, label: 'Requisições (almox.)' },
    { path: '/almoxarifado/requisicoes-material/nova', icon: FiClipboard, label: 'Solicitar Material' },
    { path: '/almoxarifado/requisicoes-material', icon: FiList, label: 'Minhas Requisições' },
    { path: '/almoxarifado/recebimentos', icon: FiPackage, label: 'Recebimentos' },
    { path: '/almoxarifado/inspecoes', icon: FiCheckSquare, label: 'Inspeções' },
    { path: '/almoxarifado/movimentacoes', icon: FiActivity, label: 'Movimentações' },
    { path: '/almoxarifado/lotes', icon: FiLayers, label: 'Lotes e Séries' },
    { path: '/almoxarifado/devolucoes', icon: FiCornerUpLeft, label: 'Devoluções' },
    // Etapa 8: "Devoluções" acima é a da Etapa 7 (o material VOLTA para o estoque); a devolução
    // AO cliente mora dentro desta tela, e é o movimento oposto. Nomes vizinhos de propósito
    // separados por rótulo — "Materiais de Clientes" é onde se olha o que é de terceiro.
    { path: '/almoxarifado/materiais-cliente', icon: FiBriefcase, label: 'Materiais de Clientes' },
    // Etapa 8b: "Remessas a Terceiros" é material NOSSO que está FORA do prédio para beneficiar.
    // Não confundir com "Devoluções" (Etapa 7, o material volta PARA o estoque) nem com "Materiais
    // de Clientes" (Etapa 8, material que é de outro dono e está AQUI).
    { path: '/almoxarifado/remessas-terceiros', icon: FiTruck, label: 'Remessas a Terceiros' },
    // Etapa 9: "Sobras e Retalhos" e o pedaco que SOBROU de cortar uma chapa/tubo/barra — nao
    // confundir com "Devoluções" (Etapa 7, a peça inteira que volta ao estoque) nem com "Materiais
    // de Clientes" (Etapa 8, o dono e outro). O retalho pode ate ser de material de cliente (o
    // dono e herdado), mas o que o separa das Devoluções e a ORIGEM: aqui nasceu de um corte, com
    // dimensao remanescente registrada — la, voltou inteiro do chao de fabrica.
    { path: '/almoxarifado/sobras', icon: FiScissors, label: 'Sobras e Retalhos' },
    // Etapa 9b: ferramenta e PATRIMONIO emprestavel (furadeira, paquimetro...), nao estoque —
    // tela nova para emprestimo/devolucao, manutencao, avaria/perda e calibracao (design D9).
    { path: '/almoxarifado/ferramentas', icon: FiTool, label: 'Ferramentas' },
    // Etapa 11: sugestao de compra por fornecedor, estoque parado e acompanhamento das
    // solicitacoes — gate proprio (gerenciar_reposicao) resolvido pelo backend, sem adminOnly
    // aqui (o perfil COMPRAS/GESTOR tambem acessa, nao so admin do modulo).
    { path: '/almoxarifado/reposicao', icon: FiShoppingCart, label: 'Reposição e Compras' },
    { path: '/almoxarifado/reservas', icon: FiLock, label: 'Reservas' },
    { path: '/almoxarifado/conferencias', icon: FiClipboard, label: 'Conferência' },
    { path: '/almoxarifado/mapa', icon: FiMap, label: 'Mapa de Áreas' },
    { path: '/almoxarifado/configuracoes', icon: FiSettings, label: 'Configurações', adminOnly: true },
  ];

  // Menu do módulo Engenharia / Projetos (separado)
  const engenhariaProjetosMenuItems = [
    { path: '/engenharia-projetos', icon: FiBriefcase, label: 'Início' },
    { path: '/engenharia-projetos/requisicoes-material/nova', icon: FiClipboard, label: 'Solicitar Material' },
    { path: '/engenharia-projetos/requisicoes-material', icon: FiList, label: 'Minhas Requisições' },
    { path: '/engenharia-projetos/solicitacao-material-escritorio', icon: FiShoppingCart, label: 'Solicitação (cesta)' },
    { path: '/engenharia-projetos/cadastro-materiais-escritorio', icon: FiPackage, label: 'Cadastro materiais' },
    { path: '/engenharia-projetos/minhas-solicitacoes', icon: FiCheckCircle, label: 'Minhas solicitações' },
  ];

  // Menu do módulo Administrativo
  const administrativoMenuItems = [
    { path: '/configuracoes', icon: FiSettings, label: 'Configurações', adminOnly: true },
    { path: '/configuracoes/requisicoes-material/nova', icon: FiClipboard, label: 'Solicitar Material' },
    { path: '/configuracoes/requisicoes-material', icon: FiList, label: 'Minhas Requisições' },
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
      case 'frota':
        return frotaMenuItems;
      case 'todolist':
        return todolistMenuItems;
      case 'admin':
        return adminMenuItems;
      case 'administrativo':
        return administrativoMenuItems;
      case 'engenharia':
        return engenhariaMenuItems;
      case 'engenharia_projetos':
        return engenhariaProjetosMenuItems;
      case 'almoxarifado':
        return almoxarifadoMenuItems;
      default:
        return crmMenuItems;
    }
  };

  const menuItems = [...getMenuItems(), CHAT_MENU_ITEM];

  return (
    <div className="layout">
      <div className="orion-version-badge" aria-hidden="true">Orion-BETA-V0</div>
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
            if (item.adminOnly) {
              if (!permissionsReady) return null;
              if (!canSeeAdminOnlyItem(item)) return null;
            }
            const Icon = item.icon;
            // Verificar se a rota está ativa
            let isActive = false;
            
            // Se for o Dashboard, só ativo quando está exatamente em /comercial
            if (item.path === '/comercial') {
              isActive = location.pathname === '/comercial';
            } else if (item.path === '/chat') {
              isActive = location.pathname === '/chat';
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
                onMouseEnter={() => prefetchRoute(item.path)}
                onFocus={() => prefetchRoute(item.path)}
              >
                <Icon />
                {sidebarOpen && <span>{item.label}</span>}
                {item.path === '/chat' && chatUnread > 0 && sidebarOpen && (
                  <span className="chat-nav-badge">{chatUnread > 99 ? '99+' : chatUnread}</span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <div className="user-info">
            {user?.foto_url && (
              <img
                className="user-avatar-mini"
                src={`${api.defaults.baseURL}/uploads/avatares/${user.foto_url}`}
                alt={user?.nome || 'Perfil'}
              />
            )}
            {sidebarOpen && (
              <div className="user-info-text">
                <div className="user-name">{user?.nome}</div>
                <div className="user-role">
                  {(() => {
                    const nivel = nivelAcessoUsuario(user);
                    return (
                      <span className={`user-access-tier tier-${nivel.tier}`}>
                        {nivel.label}
                      </span>
                    );
                  })()}
                </div>
                {(() => {
                  const mods = modulosDoUsuario(user);
                  if (mods.length === 0) return null;
                  return (
                    <div className="user-modulos-badges">
                      {mods.map((key) => {
                        const meta = MODULOS_META[key];
                        if (!meta) return null;
                        const Icon = meta.icon;
                        return (
                          <span
                            key={key}
                            className="modulo-badge"
                            style={{ background: meta.gradient }}
                            title={meta.nome}
                          >
                            <Icon />
                          </span>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
          {(isSystemAdmin(user) || user?.pode_editar_conta !== 0) && (
            <Link to="/minha-conta" className="account-button">
              <FiSettings />
              {sidebarOpen && <span>Minha Conta</span>}
            </Link>
          )}
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
          <ErrorBoundary>
            <Suspense fallback={<RouteLoading module={activeModule === 'crm' ? 'comercial' : activeModule} />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </ModuleSplash>
      </div>
      <BuscaGlobal isOpen={buscaGlobalOpen} onClose={() => setBuscaGlobalOpen(false)} />
      <ReportBuilder isOpen={reportBuilderOpen} onClose={() => setReportBuilderOpen(false)} />
      <WorkflowEngine isOpen={workflowEngineOpen} onClose={() => setWorkflowEngineOpen(false)} />
      <HelpGuide />
      <HelpSearch isOpen={helpSearchOpen} onClose={() => setHelpSearchOpen(false)} />
    </div>
  );
};

export default Layout;

