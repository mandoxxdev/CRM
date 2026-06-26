import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import ProtectedModuleRoute from './components/ProtectedModuleRoute';
import ProtectedModuleConfigRoute from './components/ProtectedModuleConfigRoute';
import ProtectedAlmoxConfigRoute from './components/ProtectedAlmoxConfigRoute';
import ErrorBoundary from './components/ErrorBoundary';
import ModuleLoading from './components/ModuleLoading';
import { RequisicoesMaterialProvider } from './components/almoxarifado/RequisicoesMaterialContext';
import { MODULOS_REQUISICAO } from './config/requisicoesMaterialConfig';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './App.css';
import './styles/glass-override.css';
import {
  Login,
  Dashboard,
  OrionIntro,
  Onboarding,
  Clientes,
  ClienteForm,
  Projetos,
  ProjetoForm,
  PropostasList,
  PropostaForm,
  PropostaDetalhe,
  PropostaPreviewEditavel,
  Aprovacoes,
  ConfigTemplateProposta,
  EditorTemplateProposta,
  ProdutosPage,
  FamiliasDoGrupo,
  ProdutosPorFamilia,
  ProdutoForm,
  Atividades,
  Relatorios,
  MaquinasVendidas,
  CustosViagens,
  OrdensServicoComercial,
  OSComercialForm,
  Compras,
  ComprasSolicitacoesCompra,
  GruposFornecedores,
  FornecedoresDoGrupo,
  ItensFornecedor,
  Financeiro,
  Fabrica,
  DashboardMES,
  OrdensServico,
  OSFormPage,
  Colaboradores,
  AtividadesColaboradores,
  ControlePresenca,
  HorasExtras,
  Equipamentos,
  ProducaoMES,
  Configuracoes,
  UsuarioForm,
  Admin,
  Layout,
  CalculosEngenharia,
  CalculoTampo,
  CalculoVolume,
  CalculoMotorImpelidor,
  SelecaoAgitadores,
  CalculoPlataformas,
  TipoSelecao,
  SolicitacaoMaterialEscritorio,
  EngenhariaProjetosHome,
  CadastroMateriaisEscritorio,
  SolicitacaoMaterialEscritorioCesta,
  MinhasSolicitacoesCompra,
  FrotasDashboard,
  FrotasVeiculos,
  FrotasMotoristas,
  FrotasManutencoes,
  FrotasAbastecimentos,
  FrotasMultas,
  FrotasDocumentos,
  FrotasViagens,
  FrotasChecklists,
  FrotasRelatorios,
  AlmoxarifadoDashboard,
  MateriaisAlmoxarifado,
  MaterialAlmoxarifadoForm,
  MovimentacoesAlmoxarifado,
  ConferenciaEstoque,
  RequisicoesList,
  RequisicaoForm,
  RequisicoesMaterialNovaPage,
  RequisicoesMaterialListaPage,
  ConfiguracoesAlmoxarifado,
  MapaLocalizacoesAlmoxarifado,
  RecebimentosAlmoxarifado,
  ChatPage,
  MinhaConta,
} from './routes/lazyModules';

const PrivateRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const [showTipoSelecao, setShowTipoSelecao] = useState(false);
  const location = useLocation();

  // Verificar se a rota atual é uma rota protegida de módulo
  const isProtectedModuleRoute = () => {
    const path = location.pathname;
    return path.startsWith('/comercial') ||
           path.startsWith('/chat') ||
           path.startsWith('/frota') ||
           path.startsWith('/compras') || 
           path.startsWith('/financeiro') || 
           path.startsWith('/fabrica') ||
           path.startsWith('/almoxarifado') ||
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
    return <ModuleLoading module="sistema" compact />;
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  // Se estiver na rota raiz, sempre mostrar tela de seleção de módulos
  if (location.pathname === '/' && user) {
    return (
      <TipoSelecao
          onClose={() => {}}
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
  return <ModuleLoading module="sistema" compact />;
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
        path="/chat"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<ChatPage />} />
      </Route>
      {/* Minha Conta — acessível a qualquer usuário autenticado (página standalone) */}
      <Route
        path="/minha-conta"
        element={
          <PrivateRoute>
            <MinhaConta />
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
        <Route path="propostas" element={<PropostasList />} />
        <Route path="propostas/detalhe/:id" element={<PropostaDetalhe />} />
        <Route path="propostas/:id/preview-editavel" element={<PropostaPreviewEditavel />} />
        <Route path="propostas/nova" element={<PropostaForm />} />
        <Route path="propostas/editar/:id" element={<PropostaForm />} />
        <Route path="propostas/config-template" element={<ConfigTemplateProposta />} />
        <Route path="propostas/editor-template" element={<EditorTemplateProposta />} />
        <Route path="aprovacoes" element={<Aprovacoes />} />
        <Route path="ordens-servico" element={<OrdensServicoComercial />} />
        <Route path="ordens-servico/nova/:propostaId" element={<OSComercialForm />} />
        <Route path="ordens-servico/editar/:id" element={<OSFormPage />} />
        <Route path="produtos" element={<ProdutosPage />} />
        <Route path="produtos/grupo/:grupoId" element={<FamiliasDoGrupo />} />
        <Route path="produtos/familia/:id" element={<ProdutosPorFamilia />} />
        <Route path="produtos/novo" element={<ProdutoForm />} />
        <Route path="produtos/editar/:id" element={<ProdutoForm />} />
        <Route path="atividades" element={<Atividades />} />
        <Route path="relatorios" element={<Relatorios />} />
        <Route path="maquinas-vendidas" element={<MaquinasVendidas />} />
        <Route path="custos-viagens" element={<CustosViagens />} />
        <Route path="requisicoes-material" element={<RequisicoesMaterialListaPage moduloKey="comercial" />} />
        <Route path="requisicoes-material/nova" element={<RequisicoesMaterialNovaPage moduloKey="comercial" />} />
        <Route path="usuarios/novo" element={<UsuarioForm />} />
        <Route path="usuarios/editar/:id" element={<UsuarioForm />} />
      </Route>
      <Route
        path="/frota"
        element={
          <PrivateRoute>
            <ProtectedModuleRoute modulo="frota" nomeModulo="Frota">
              <Layout />
            </ProtectedModuleRoute>
          </PrivateRoute>
        }
      >
        <Route index element={<FrotasDashboard />} />
        <Route path="veiculos" element={<FrotasVeiculos />} />
        <Route path="motoristas" element={<FrotasMotoristas />} />
        <Route path="manutencoes" element={<FrotasManutencoes />} />
        <Route path="abastecimentos" element={<FrotasAbastecimentos />} />
        <Route path="multas" element={<FrotasMultas />} />
        <Route path="documentos" element={<FrotasDocumentos />} />
        <Route path="viagens" element={<FrotasViagens />} />
        <Route path="checklists" element={<FrotasChecklists />} />
        <Route path="relatorios" element={<FrotasRelatorios />} />
        <Route path="requisicoes-material" element={<RequisicoesMaterialListaPage moduloKey="frota" />} />
        <Route path="requisicoes-material/nova" element={<RequisicoesMaterialNovaPage moduloKey="frota" />} />
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
        <Route path="solicitacoes" element={
          <ComprasSolicitacoesCompra />
        } />
        <Route path="*" element={
          <Compras />
        } />
        <Route path="fornecedores" element={
          <Compras />
        } />
        <Route path="pedidos" element={
          <Compras />
        } />
        <Route path="cotacoes" element={
          <Compras />
        } />
        <Route path="fornecedores-homologados" element={
          <GruposFornecedores />
        } />
        <Route path="fornecedores-homologados/grupo/:grupoId" element={
          <FornecedoresDoGrupo />
        } />
        <Route path="fornecedores-homologados/fornecedor/:fornecedorId" element={
          <ItensFornecedor />
        } />
        <Route path="requisicoes-material" element={<RequisicoesMaterialListaPage moduloKey="compras" />} />
        <Route path="requisicoes-material/nova" element={<RequisicoesMaterialNovaPage moduloKey="compras" />} />
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
          <Financeiro />
        } />
        <Route path="contas-pagar" element={
          <Financeiro />
        } />
        <Route path="contas-receber" element={
          <Financeiro />
        } />
        <Route path="fluxo-caixa" element={
          <Financeiro />
        } />
        <Route path="dashboard" element={
          <Financeiro />
        } />
        <Route path="relatorios" element={
          <Financeiro />
        } />
        <Route path="bancos" element={
          <Financeiro />
        } />
        <Route path="requisicoes-material" element={<RequisicoesMaterialListaPage moduloKey="financeiro" />} />
        <Route path="requisicoes-material/nova" element={<RequisicoesMaterialNovaPage moduloKey="financeiro" />} />
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
        <Route path="requisicoes-material" element={<RequisicoesMaterialListaPage moduloKey="operacional" />} />
        <Route path="requisicoes-material/nova" element={<RequisicoesMaterialNovaPage moduloKey="operacional" />} />
        {/* Produção — Chão de fábrica (Kanban de apontamento) */}
        <Route path="producao" element={<ProducaoMES />} />
        {/* Rotas MES - Placeholder para futuras implementações */}
        <Route path="planejamento/*" element={<div style={{ padding: '40px', textAlign: 'center' }}><h2>Planejamento (APS/MRP)</h2><p>Em desenvolvimento...</p></div>} />
        <Route path="supervisao/*" element={<div style={{ padding: '40px', textAlign: 'center' }}><h2>Supervisão (SCADA/HMI)</h2><p>Em desenvolvimento...</p></div>} />
        <Route path="qualidade/*" element={<div style={{ padding: '40px', textAlign: 'center' }}><h2>Controle de Qualidade</h2><p>Em desenvolvimento...</p></div>} />
        <Route path="rastreabilidade/*" element={<div style={{ padding: '40px', textAlign: 'center' }}><h2>Rastreabilidade</h2><p>Em desenvolvimento...</p></div>} />
        <Route path="manutencao/*" element={<div style={{ padding: '40px', textAlign: 'center' }}><h2>Manutenção (CMMS)</h2><p>Em desenvolvimento...</p></div>} />
        <Route path="seguranca/*" element={<div style={{ padding: '40px', textAlign: 'center' }}><h2>Segurança & Conformidade</h2><p>Em desenvolvimento...</p></div>} />
        <Route path="formulacoes/*" element={<div style={{ padding: '40px', textAlign: 'center' }}><h2>Controle de Formulações</h2><p>Em desenvolvimento...</p></div>} />
        <Route path="alarmistica/*" element={<div style={{ padding: '40px', textAlign: 'center' }}><h2>Alarmística</h2><p>Em desenvolvimento...</p></div>} />
        <Route path="logs/*" element={<div style={{ padding: '40px', textAlign: 'center' }}><h2>Logs e Histórico</h2><p>Em desenvolvimento...</p></div>} />
        <Route path="configuracoes" element={
          <ProtectedModuleConfigRoute module="operacional" redirectTo="/fabrica/dashboard">
            <div style={{ padding: '40px', textAlign: 'center' }}><h2>Configurações MES</h2><p>Em desenvolvimento...</p></div>
          </ProtectedModuleConfigRoute>
        } />
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
        <Route path="solicitacao-material-escritorio" element={<SolicitacaoMaterialEscritorio />} />
        <Route path="calculo-tampo" element={<CalculoTampo />} />
        <Route path="calculo-volume" element={<CalculoVolume />} />
        <Route path="calculo-motor-impelidor" element={<CalculoMotorImpelidor />} />
        <Route path="selecao-agitadores" element={<SelecaoAgitadores />} />
        <Route path="calculo-plataformas" element={<CalculoPlataformas />} />
        <Route path="requisicoes-material" element={<RequisicoesMaterialListaPage moduloKey="engenharia" />} />
        <Route path="requisicoes-material/nova" element={<RequisicoesMaterialNovaPage moduloKey="engenharia" />} />
      </Route>
      <Route
        path="/engenharia-projetos"
        element={
          <PrivateRoute>
            <ProtectedModuleRoute modulo="engenharia_projetos" nomeModulo="Engenharia / Projetos">
              <Layout />
            </ProtectedModuleRoute>
          </PrivateRoute>
        }
      >
        <Route index element={<EngenhariaProjetosHome />} />
        <Route path="solicitacao-material-escritorio" element={<SolicitacaoMaterialEscritorioCesta />} />
        <Route path="cadastro-materiais-escritorio" element={<CadastroMateriaisEscritorio />} />
        <Route path="minhas-solicitacoes" element={<MinhasSolicitacoesCompra />} />
        <Route path="requisicoes-material" element={<RequisicoesMaterialListaPage moduloKey="engenharia_projetos" />} />
        <Route path="requisicoes-material/nova" element={<RequisicoesMaterialNovaPage moduloKey="engenharia_projetos" />} />
      </Route>
      <Route
        path="/almoxarifado"
        element={
          <PrivateRoute>
            <ProtectedModuleRoute modulo="almoxarifado" nomeModulo="Almoxarifado">
              <Layout />
            </ProtectedModuleRoute>
          </PrivateRoute>
        }
      >
        <Route index element={<AlmoxarifadoDashboard />} />
        <Route path="materiais" element={<MateriaisAlmoxarifado />} />
        <Route path="materiais/novo" element={<MaterialAlmoxarifadoForm />} />
        <Route path="materiais/editar/:id" element={<MaterialAlmoxarifadoForm />} />
        <Route path="movimentacoes" element={<MovimentacoesAlmoxarifado />} />
        <Route path="movimentacoes/novo" element={<MovimentacoesAlmoxarifado />} />
        <Route path="conferencias" element={<ConferenciaEstoque />} />
        <Route path="requisicoes" element={
          <RequisicoesMaterialProvider override={MODULOS_REQUISICAO.almoxarifado}>
            <RequisicoesList />
          </RequisicoesMaterialProvider>
        } />
        <Route path="requisicoes/nova" element={
          <RequisicoesMaterialProvider override={MODULOS_REQUISICAO.almoxarifado}>
            <RequisicaoForm />
          </RequisicoesMaterialProvider>
        } />
        <Route path="requisicoes-material" element={<RequisicoesMaterialListaPage moduloKey="almoxarifado" />} />
        <Route path="requisicoes-material/nova" element={<RequisicoesMaterialNovaPage moduloKey="almoxarifado" />} />
        <Route path="recebimentos" element={<RecebimentosAlmoxarifado />} />
        <Route path="mapa" element={<MapaLocalizacoesAlmoxarifado />} />
        <Route path="configuracoes" element={<ProtectedAlmoxConfigRoute><ConfiguracoesAlmoxarifado /></ProtectedAlmoxConfigRoute>} />
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
        <Route index element={
          <ProtectedModuleConfigRoute administrativoConfig redirectTo="/">
            <Configuracoes />
          </ProtectedModuleConfigRoute>
        } />
        <Route path="requisicoes-material" element={<RequisicoesMaterialListaPage moduloKey="administrativo" />} />
        <Route path="requisicoes-material/nova" element={<RequisicoesMaterialNovaPage moduloKey="administrativo" />} />
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
        <Route path="requisicoes-material" element={<RequisicoesMaterialListaPage moduloKey="admin" />} />
        <Route path="requisicoes-material/nova" element={<RequisicoesMaterialNovaPage moduloKey="admin" />} />
      </Route>
    </Routes>
  );
}

function App() {
  const [showIntro, setShowIntro] = useState(() => {
    try {
      return sessionStorage.getItem('orion_intro_seen') !== 'true';
    } catch {
      return true;
    }
  });
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    // Verificar se já completou onboarding
    const onboardingCompleted = localStorage.getItem('onboarding_completed');
    if (onboardingCompleted === 'true') {
      setShowOnboarding(false);
    }
  }, []);

  const handleIntroComplete = () => {
    try {
      sessionStorage.setItem('orion_intro_seen', 'true');
    } catch {
      // sessionStorage indisponível
    }
    setShowIntro(false);
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
          {showIntro ? (
            <OrionIntro onComplete={handleIntroComplete} />
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

