import React, { useState, useRef, Suspense } from 'react';
import { useLocation, useNavigate, Outlet } from 'react-router-dom';
import BarraInferiorMobile from '../BarraInferiorMobile';
import ErrorBoundary from '../ErrorBoundary';
import { RouteLoading } from '../LazyPage';
import { useAuth } from '../../context/AuthContext';
import CataventoGMP from '../CataventoGMP';
import usePilulaDoMenu from '../../hooks/usePilulaDoMenu';
import { useMotorDeMovimento } from '../../utils/motorDeMovimento';
import { getEffectiveUser } from '../../services/permissionsCache';
import { canConfigureModule } from '../../utils/systemPermissions';
import {
  FiBarChart2, FiClipboard, FiUsers, FiActivity, FiClock,
  FiTrendingUp, FiTool, FiSettings, FiGrid, FiList,
  FiLayers, FiTarget, FiAlertTriangle, FiZap, FiMenu, FiX,
} from 'react-icons/fi';
import './MESLayout.css';

const MESLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  // No celular a sidebar comeca FECHADA. Com `true` fixo ela abria por cima do conteudo
  // toda vez que o modulo carregava — no desktop ela ocupa a coluna da esquerda, mas no
  // celular o `.mes-sidebar.open` a traz para cima da tela inteira.
  const [sidebarOpen, setSidebarOpen] = useState(() => (
    typeof window === 'undefined' || window.innerWidth > 768
  ));
  const { user } = useAuth();
  const canConfigureMes = canConfigureModule(getEffectiveUser(user), 'operacional');
  // Movimento da referencia (25/11/2026), igual ao Layout: contagem dos KPIs e pilula que desliza.
  const navRef = useRef(null);
  const mainRef = useRef(null);
  useMotorDeMovimento(mainRef);
  usePilulaDoMenu(navRef, '.mes-nav-link.active', [location.pathname, sidebarOpen]);

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: FiBarChart2, path: '/fabrica/dashboard' },
    { id: 'ordens-producao', label: 'Ordens de Produção', icon: FiLayers, path: '/fabrica/ordens-producao' },
    { id: 'apontamentos', label: 'Apontamentos', icon: FiActivity, path: '/fabrica/apontamentos' },
    { id: 'maquinas', label: 'Máquinas', icon: FiTool, path: '/fabrica/maquinas' },
    { id: 'paradas', label: 'Paradas / OEE', icon: FiAlertTriangle, path: '/fabrica/paradas' },
    { id: 'roteiros', label: 'Roteiros', icon: FiTarget, path: '/fabrica/roteiros' },
    { id: 'producao-kanban', label: 'Kanban OS (legado)', icon: FiClipboard, path: '/fabrica/producao-kanban' },
    { id: 'relatorios', label: 'Relatórios', icon: FiBarChart2, path: '/fabrica/relatorios' },
    { type: 'divider', id: 'div-operacional' },
    { id: 'ordens-servico', label: 'Ordens de Serviço', icon: FiClipboard, path: '/fabrica/ordens-servico' },
    { id: 'colaboradores', label: 'Colaboradores', icon: FiUsers, path: '/fabrica/colaboradores' },
    { id: 'atividades', label: 'Atividades', icon: FiActivity, path: '/fabrica/atividades' },
    { id: 'presenca', label: 'Presença', icon: FiClock, path: '/fabrica/presenca' },
    { id: 'horas-extras', label: 'Horas Extras', icon: FiTrendingUp, path: '/fabrica/horas-extras' },
    { id: 'equipamentos', label: 'Equipamentos', icon: FiTool, path: '/fabrica/equipamentos' },
    { type: 'divider', id: 'div-materiais' },
    { id: 'requisicoes-nova', label: 'Solicitar Material', icon: FiClipboard, path: '/fabrica/requisicoes-material/nova' },
    { id: 'requisicoes-lista', label: 'Minhas Requisições', icon: FiList, path: '/fabrica/requisicoes-material' },
    { id: 'configuracoes', label: 'Configurações', icon: FiSettings, path: '/fabrica/configuracoes', adminOnly: true },
  ];

  // A barra inferior usa a MESMA `menuItems` da sidebar, tirando o que nao e destino:
  // separadores (`type: 'divider'`) e itens de admin quando o usuario nao pode configurar.
  // Sem esse filtro, um separador viraria botao na barra.
  const itensNavegaveis = menuItems.filter(
    (i) => i.type !== 'divider' && (!i.adminOnly || canConfigureMes),
  );

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <div className="mes-layout">
      <aside className={`mes-sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
        <div className="mes-sidebar-header">
          <div className="mes-logo">
            <FiZap />
            <span>Produção GMP</span>
          </div>
          <button
            className="mes-sidebar-toggle"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            type="button"
          >
            {sidebarOpen ? <FiX /> : <FiMenu />}
          </button>
        </div>

        <nav className="mes-nav" ref={navRef}>
          <div
            className="mes-nav-link mes-nav-module-selector"
            onClick={() => { window.location.href = '/'; }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && (window.location.href = '/')}
          >
            <FiGrid />
            {sidebarOpen && <span>Selecionar Módulo</span>}
          </div>
          {menuItems.map((item) => {
            if (item.type === 'divider') {
              return sidebarOpen ? <div key={item.id} className="mes-nav-divider" /> : null;
            }
            if (item.adminOnly && !canConfigureMes) return null;
            return (
              <div key={item.id} className="mes-nav-item">
                <div
                  className={`mes-nav-link ${isActive(item.path) ? 'active' : ''}`}
                  onClick={() => navigate(item.path)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && navigate(item.path)}
                >
                  <item.icon />
                  {sidebarOpen && <span>{item.label}</span>}
                </div>
              </div>
            );
          })}
        </nav>
        {/* A marca da GMP no rodape, como na barra lateral dos outros modulos (24/11/2026:
            "GMP Industriais e o catavento em todos os dashboards"). */}
        <div className="sidebar-marca mes-marca" aria-label="GMP Industriais">
          <CataventoGMP size={44} modo="entrada" title="GMP Industriais" />
          {sidebarOpen && (
            <span className="sidebar-marca__texto" aria-hidden="true"><b>GMP</b> Industriais</span>
          )}
        </div>
      </aside>

      <BarraInferiorMobile
        itens={itensNavegaveis}
        menuAberto={sidebarOpen}
        aoAbrirMenu={() => setSidebarOpen((v) => !v)}
      />

      <main className="mes-main" ref={mainRef}>
        <ErrorBoundary>
          <Suspense fallback={<RouteLoading module="operacional" />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
};

export default MESLayout;
