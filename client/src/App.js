import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import SplashScreen from './components/SplashScreen';
import Onboarding from './components/Onboarding';
import Clientes from './components/Clientes';
import ClienteForm from './components/ClienteForm';
import Projetos from './components/Projetos';
import ProjetoForm from './components/ProjetoForm';
import Propostas from './components/Propostas';
import PropostaForm from './components/PropostaForm';
import Aprovacoes from './components/Aprovacoes';
import ConfigTemplateProposta from './components/ConfigTemplateProposta';
import EditorTemplateProposta from './components/EditorTemplateProposta';
import ProdutosPage from './components/ProdutosPage';
import ProdutosPorFamilia from './components/ProdutosPorFamilia';
import ProdutoForm from './components/ProdutoForm';
import Atividades from './components/Atividades';
import Relatorios from './components/Relatorios';
import MaquinasVendidas from './components/MaquinasVendidas';
import CustosViagens from './components/CustosViagens';
import OrdensServicoComercial from './components/OrdensServicoComercial';
import OSComercialForm from './components/OSComercialForm';
import Compras from './components/Compras';
import Financeiro from './components/Financeiro';
import Fabrica from './components/Fabrica';
import DashboardMES from './components/mes/DashboardMES';
import OrdensServico from './components/operacional/OrdensServico';
import OSFormPage from './components/operacional/OSFormPage';
import Colaboradores from './components/operacional/Colaboradores';
import AtividadesColaboradores from './components/operacional/AtividadesColaboradores';
import ControlePresenca from './components/operacional/ControlePresenca';
import HorasExtras from './components/operacional/HorasExtras';
import Equipamentos from './components/operacional/Equipamentos';
import Configuracoes from './components/Configuracoes';
import Permissoes from './components/Permissoes';
import Usuarios from './components/Usuarios';
import UsuarioForm from './components/UsuarioForm';
import Admin from './components/Admin';
import Layout from './components/Layout';
import CalculosEngenharia from './components/CalculosEngenharia';
import CalculoTampo from './components/CalculoTampo';
import TipoSelecao from './components/TipoSelecao';
import ProtectedModuleRoute from './components/ProtectedModuleRoute';
import ErrorBoundary from './components/ErrorBoundary';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './App.css';

const PrivateRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const [showTipoSelecao, setShowTipoSelecao] = useState(false);
  const location = useLocation();

  // Verificar se a rota atual é uma rota protegida de módulo
  const isProtectedModuleRoute = () => {
    const path = location.pathname;
    return path.startsWith('/comercial') ||
           path.startsWith('/compras') || 
           path.startsWith('/financeiro') || 
           path.startsWith('/fabrica') || 
           path.startsWith('/engenharia') ||
           path.startsWith('/configuracoes') || 
           path.startsWith('/admin');
  };

  useEffect(() => {
    if (!loading && user) {
      // Se estiver na rota raiz, SEMPRE mostrar seleção de módulos
      if (location.pathname === '/') {
        setShowTipoSelecao(true);
        return;
      }

      // Se estiver tentando acessar uma rota protegida, NUNCA mostrar TipoSelecao
      if (isProtectedModuleRoute()) {
        setShowTipoSelecao(false);
        return;
      }

      // Para qualquer outra rota, não mostrar TipoSelecao
      setShowTipoSelecao(false);
    } else if (!loading && !user) {
      setShowTipoSelecao(false);
    }
  }, [user, loading, location.pathname]);


  if (loading) {
    return (
      <div className="loading">
        <div className="loading-spinner"></div>
        <p>Carregando...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  // Se estiver na rota raiz, sempre mostrar tela de seleção de módulos
  if (location.pathname === '/' && user) {
    return (
      <TipoSelecao 
        onClose={() => {
          // Não fazer nada ao fechar - usuário deve selecionar um módulo
        }}
        forceShow={true}
      />
    );
  }

  // Se não visualizou os módulos e não está na raiz, mostrar tela de seleção
  if (showTipoSelecao) {
    return (
      <TipoSelecao 
        onClose={() => {
          try {
            sessionStorage.setItem('modulosVisualizados', 'true');
          } catch (error) {
            console.error('Erro ao salvar módulos visualizados:', error);
          }
          setShowTipoSelecao(false);
        }}
        forceShow={false}
      />
    );
  }

  // Garantir que sempre retorne algo
  if (children) {
    return children;
  }

  // Fallback caso children não esteja disponível
  return (
    <div className="loading">
      <div className="loading-spinner"></div>
      <p>Carregando...</p>
    </div>
  );
};

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <TipoSelecao forceShow={true} />
          </PrivateRoute>
        }
      />
      <Route
        path="/comercial"
        element={
          <PrivateRoute>
            <ProtectedModuleRoute modulo="comercial" nomeModulo="Comercial">
              <Layout />
            </ProtectedModuleRoute>
          </PrivateRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="clientes" element={<Clientes />} />
        <Route path="clientes/novo" element={<ClienteForm />} />
        <Route path="clientes/editar/:id" element={<ClienteForm />} />
        <Route path="projetos" element={<Projetos />} />
        <Route path="projetos/novo" element={<ProjetoForm />} />
        <Route path="projetos/editar/:id" element={<ProjetoForm />} />
        <Route path="propostas" element={<Propostas />} />
        <Route path="propostas/nova" element={<PropostaForm />} />
        <Route path="propostas/editar/:id" element={<PropostaForm />} />
        <Route path="propostas/config-template" element={<ConfigTemplateProposta />} />
        <Route path="propostas/editor-template" element={<EditorTemplateProposta />} />
        <Route path="aprovacoes" element={<Aprovacoes />} />
        <Route path="ordens-servico" element={<OrdensServicoComercial />} />
        <Route path="ordens-servico/nova/:propostaId" element={<OSComercialForm />} />
        <Route path="ordens-servico/editar/:id" element={<OSFormPage />} />
        <Route path="produtos" element={<ProdutosPage />} />
        <Route path="produtos/familia/:id" element={<ProdutosPorFamilia />} />
        <Route path="produtos/novo" element={<ProdutoForm />} />
        <Route path="produtos/editar/:id" element={<ProdutoForm />} />
        <Route path="atividades" element={<Atividades />} />
        <Route path="relatorios" element={<Relatorios />} />
        <Route path="maquinas-vendidas" element={<MaquinasVendidas />} />
        <Route path="custos-viagens" element={<CustosViagens />} />
        <Route path="usuarios/novo" element={<UsuarioForm />} />
        <Route path="usuarios/editar/:id" element={<UsuarioForm />} />
      </Route>
      <Route
        path="/compras"
        element={
          <PrivateRoute>
            <ProtectedModuleRoute modulo="compras" nomeModulo="Compras">
              <Layout />
            </ProtectedModuleRoute>
          </PrivateRoute>
        }
      >
        <Route path="*" element={
          <ProtectedModuleRoute modulo="compras" nomeModulo="Compras">
            <Compras />
          </ProtectedModuleRoute>
        } />
        <Route path="fornecedores" element={
          <ProtectedModuleRoute modulo="compras" nomeModulo="Compras">
            <Compras />
          </ProtectedModuleRoute>
        } />
        <Route path="pedidos" element={
          <ProtectedModuleRoute modulo="compras" nomeModulo="Compras">
            <Compras />
          </ProtectedModuleRoute>
        } />
        <Route path="cotacoes" element={
          <ProtectedModuleRoute modulo="compras" nomeModulo="Compras">
            <Compras />
          </ProtectedModuleRoute>
        } />
      </Route>
      <Route
        path="/financeiro"
        element={
          <PrivateRoute>
            <ProtectedModuleRoute modulo="financeiro" nomeModulo="Financeiro">
              <Layout />
            </ProtectedModuleRoute>
          </PrivateRoute>
        }
      >
        <Route path="*" element={
          <ProtectedModuleRoute modulo="financeiro" nomeModulo="Financeiro">
            <Financeiro />
          </ProtectedModuleRoute>
        } />
        <Route path="contas-pagar" element={
          <ProtectedModuleRoute modulo="financeiro" nomeModulo="Financeiro">
            <Financeiro />
          </ProtectedModuleRoute>
        } />
        <Route path="contas-receber" element={
          <ProtectedModuleRoute modulo="financeiro" nomeModulo="Financeiro">
            <Financeiro />
          </ProtectedModuleRoute>
        } />
        <Route path="fluxo-caixa" element={
          <ProtectedModuleRoute modulo="financeiro" nomeModulo="Financeiro">
            <Financeiro />
          </ProtectedModuleRoute>
        } />
        <Route path="dashboard" element={
          <ProtectedModuleRoute modulo="financeiro" nomeModulo="Financeiro">
            <Financeiro />
          </ProtectedModuleRoute>
        } />
        <Route path="relatorios" element={
          <ProtectedModuleRoute modulo="financeiro" nomeModulo="Financeiro">
            <Financeiro />
          </ProtectedModuleRoute>
        } />
        <Route path="bancos" element={
          <ProtectedModuleRoute modulo="financeiro" nomeModulo="Financeiro">
            <Financeiro />
          </ProtectedModuleRoute>
        } />
      </Route>
      <Route
        path="/fabrica"
        element={
          <PrivateRoute>
            <ProtectedModuleRoute modulo="operacional" nomeModulo="Operacional">
              <Fabrica />
            </ProtectedModuleRoute>
          </PrivateRoute>
        }
      >
        <Route index element={<DashboardMES />} />
        <Route path="dashboard" element={<DashboardMES />} />
        <Route path="ordens-servico" element={<OrdensServico />} />
        <Route path="ordens-servico/editar/:id" element={<OSFormPage />} />
        <Route path="colaboradores" element={<Colaboradores />} />
        <Route path="atividades" element={<AtividadesColaboradores />} />
        <Route path="presenca" element={<ControlePresenca />} />
        <Route path="horas-extras" element={<HorasExtras />} />
        <Route path="equipamentos" element={<Equipamentos />} />
        {/* Rotas MES - Placeholder para futuras implementações */}
        <Route path="producao/*" element={<div style={{ padding: '40px', textAlign: 'center' }}><h2>Módulo de Produção (MES)</h2><p>Em desenvolvimento...</p></div>} />
        <Route path="planejamento/*" element={<div style={{ padding: '40px', textAlign: 'center' }}><h2>Planejamento (APS/MRP)</h2><p>Em desenvolvimento...</p></div>} />
        <Route path="supervisao/*" element={<div style={{ padding: '40px', textAlign: 'center' }}><h2>Supervisão (SCADA/HMI)</h2><p>Em desenvolvimento...</p></div>} />
        <Route path="qualidade/*" element={<div style={{ padding: '40px', textAlign: 'center' }}><h2>Controle de Qualidade</h2><p>Em desenvolvimento...</p></div>} />
        <Route path="rastreabilidade/*" element={<div style={{ padding: '40px', textAlign: 'center' }}><h2>Rastreabilidade</h2><p>Em desenvolvimento...</p></div>} />
        <Route path="manutencao/*" element={<div style={{ padding: '40px', textAlign: 'center' }}><h2>Manutenção (CMMS)</h2><p>Em desenvolvimento...</p></div>} />
        <Route path="seguranca/*" element={<div style={{ padding: '40px', textAlign: 'center' }}><h2>Segurança & Conformidade</h2><p>Em desenvolvimento...</p></div>} />
        <Route path="formulacoes/*" element={<div style={{ padding: '40px', textAlign: 'center' }}><h2>Controle de Formulações</h2><p>Em desenvolvimento...</p></div>} />
        <Route path="alarmistica/*" element={<div style={{ padding: '40px', textAlign: 'center' }}><h2>Alarmística</h2><p>Em desenvolvimento...</p></div>} />
        <Route path="logs/*" element={<div style={{ padding: '40px', textAlign: 'center' }}><h2>Logs e Histórico</h2><p>Em desenvolvimento...</p></div>} />
        <Route path="configuracoes" element={<div style={{ padding: '40px', textAlign: 'center' }}><h2>Configurações MES</h2><p>Em desenvolvimento...</p></div>} />
      </Route>
      <Route
        path="/engenharia"
        element={
          <PrivateRoute>
            <ProtectedModuleRoute modulo="engenharia" nomeModulo="Cálculos de Engenharia">
              <Layout />
            </ProtectedModuleRoute>
          </PrivateRoute>
        }
      >
        <Route index element={<CalculosEngenharia />} />
        <Route path="calculo-tampo" element={<CalculoTampo />} />
      </Route>
      <Route
        path="/configuracoes"
        element={
          <PrivateRoute>
            <ProtectedModuleRoute modulo="administrativo" nomeModulo="Administrativo">
              <Layout />
            </ProtectedModuleRoute>
          </PrivateRoute>
        }
      >
        <Route index element={<Configuracoes />} />
      </Route>
      <Route
        path="/admin"
        element={
          <PrivateRoute>
            <ProtectedModuleRoute modulo="admin" nomeModulo="Administração">
              <Layout />
            </ProtectedModuleRoute>
          </PrivateRoute>
        }
      >
        <Route index element={<Admin />} />
        <Route path="usuarios/novo" element={<UsuarioForm />} />
        <Route path="usuarios/editar/:id" element={<UsuarioForm />} />
      </Route>
    </Routes>
  );
}

function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    // Verificar se já completou onboarding
    const onboardingCompleted = localStorage.getItem('onboarding_completed');
    if (onboardingCompleted === 'true') {
      setShowOnboarding(false);
    }
  }, []);

  const handleSplashComplete = () => {
    setShowSplash(false);
    // Mostrar onboarding apenas se não foi completado
    const onboardingCompleted = localStorage.getItem('onboarding_completed');
    if (onboardingCompleted !== 'true') {
      setTimeout(() => {
        setShowOnboarding(true);
      }, 500);
    }
  };

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
  };

  return (
    <Router>
      <AuthProvider>
        <ThemeProvider>
          {showSplash ? (
            <SplashScreen onComplete={handleSplashComplete} />
          ) : (
            <>
              {showOnboarding && (
                <Onboarding 
                  isOpen={showOnboarding} 
                  onClose={() => setShowOnboarding(false)}
                  onComplete={handleOnboardingComplete}
                />
              )}
              <ErrorBoundary>
              <AppRoutes />
            </ErrorBoundary>
            </>
          )}
          <ToastContainer
            position="top-right"
            autoClose={3000}
            hideProgressBar={false}
            newestOnTop={false}
            closeOnClick
            rtl={false}
            pauseOnFocusLoss
            draggable
            pauseOnHover
            theme="colored"
          />
        </ThemeProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;

