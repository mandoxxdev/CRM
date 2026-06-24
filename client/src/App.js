import React, { useState, useEffect, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import ProtectedModuleRoute from './components/ProtectedModuleRoute';
import ErrorBoundary from './components/ErrorBoundary';
import ModuleLoading from './components/ModuleLoading';
import { LazyPage } from './components/LazyPage';
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
      <Suspense fallback={<ModuleLoading module="sistema" />}>
        <TipoSelecao
          onClose={() => {}}
          forceShow={true}
        />
      </Suspense>
    );
  }

  // Se não visualizou os módulos e não está na raiz, mostrar tela de seleção
  if (showTipoSelecao) {
    return (
      <Suspense fallback={<ModuleLoading module="sistema" />}>
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
      </Suspense>
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
      <Route path="/login" element={<LazyPage component={Login} module="sistema" />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Suspense fallback={<ModuleLoading module="sistema" />}>
              <TipoSelecao forceShow={true} />
            </Suspense>
          </PrivateRoute>
        }
      />
      <Route
        path="/chat"
        element={
          <PrivateRoute>
            <Suspense fallback={<ModuleLoading module="comercial" />}>
              <Layout />
            </Suspense>
          </PrivateRoute>
        }
      >
        <Route index element={<LazyPage component={ChatPage} module="comercial" compact />} />
      </Route>
      <Route
        path="/comercial"
        element={
          <PrivateRoute>
            <ProtectedModuleRoute modulo="comercial" nomeModulo="Comercial">
              <Suspense fallback={<ModuleLoading module="comercial" />}>
                <Layout />
              </Suspense>
            </ProtectedModuleRoute>
          </PrivateRoute>
        }
      >
        <Route index element={<LazyPage component={Dashboard} module="comercial" compact />} />
        <Route path="clientes" element={<LazyPage component={Clientes} module="comercial" compact />} />
        <Route path="clientes/novo" element={<LazyPage component={ClienteForm} module="comercial" compact />} />
        <Route path="clientes/editar/:id" element={<LazyPage component={ClienteForm} module="comercial" compact />} />
        <Route path="projetos" element={<LazyPage component={Projetos} module="comercial" compact />} />
        <Route path="projetos/novo" element={<LazyPage component={ProjetoForm} module="comercial" compact />} />
        <Route path="projetos/editar/:id" element={<LazyPage component={ProjetoForm} module="comercial" compact />} />
        <Route path="propostas" element={<LazyPage component={PropostasList} module="comercial" compact />} />
        <Route path="propostas/detalhe/:id" element={<LazyPage component={PropostaDetalhe} module="comercial" compact />} />
        <Route path="propostas/nova" element={<LazyPage component={PropostaForm} module="comercial" compact />} />
        <Route path="propostas/editar/:id" element={<LazyPage component={PropostaForm} module="comercial" compact />} />
        <Route path="propostas/config-template" element={<LazyPage component={ConfigTemplateProposta} module="comercial" compact />} />
        <Route path="propostas/editor-template" element={<LazyPage component={EditorTemplateProposta} module="comercial" compact />} />
        <Route path="aprovacoes" element={<LazyPage component={Aprovacoes} module="comercial" compact />} />
        <Route path="ordens-servico" element={<LazyPage component={OrdensServicoComercial} module="comercial" compact />} />
        <Route path="ordens-servico/nova/:propostaId" element={<LazyPage component={OSComercialForm} module="comercial" compact />} />
        <Route path="ordens-servico/editar/:id" element={<LazyPage component={OSFormPage} module="comercial" compact />} />
        <Route path="produtos" element={<LazyPage component={ProdutosPage} module="comercial" compact />} />
        <Route path="produtos/grupo/:grupoId" element={<LazyPage component={FamiliasDoGrupo} module="comercial" compact />} />
        <Route path="produtos/familia/:id" element={<LazyPage component={ProdutosPorFamilia} module="comercial" compact />} />
        <Route path="produtos/novo" element={<LazyPage component={ProdutoForm} module="comercial" compact />} />
        <Route path="produtos/editar/:id" element={<LazyPage component={ProdutoForm} module="comercial" compact />} />
        <Route path="atividades" element={<LazyPage component={Atividades} module="comercial" compact />} />
        <Route path="relatorios" element={<LazyPage component={Relatorios} module="comercial" compact />} />
        <Route path="maquinas-vendidas" element={<LazyPage component={MaquinasVendidas} module="comercial" compact />} />
        <Route path="custos-viagens" element={<LazyPage component={CustosViagens} module="comercial" compact />} />
        <Route path="requisicoes-material" element={<LazyPage component={RequisicoesMaterialListaPage} module="comercial" compact moduloKey="comercial" />} />
        <Route path="requisicoes-material/nova" element={<LazyPage component={RequisicoesMaterialNovaPage} module="comercial" compact moduloKey="comercial" />} />
        <Route path="usuarios/novo" element={<LazyPage component={UsuarioForm} module="comercial" compact />} />
        <Route path="usuarios/editar/:id" element={<LazyPage component={UsuarioForm} module="comercial" compact />} />
      </Route>
      <Route
        path="/frota"
        element={
          <PrivateRoute>
            <ProtectedModuleRoute modulo="comercial" nomeModulo="Frota">
              <Suspense fallback={<ModuleLoading module="comercial" />}>
                <Layout />
              </Suspense>
            </ProtectedModuleRoute>
          </PrivateRoute>
        }
      >
        <Route index element={<LazyPage component={FrotasDashboard} module="comercial" compact />} />
        <Route path="veiculos" element={<LazyPage component={FrotasVeiculos} module="comercial" compact />} />
        <Route path="motoristas" element={<LazyPage component={FrotasMotoristas} module="comercial" compact />} />
        <Route path="manutencoes" element={<LazyPage component={FrotasManutencoes} module="comercial" compact />} />
        <Route path="abastecimentos" element={<LazyPage component={FrotasAbastecimentos} module="comercial" compact />} />
        <Route path="multas" element={<LazyPage component={FrotasMultas} module="comercial" compact />} />
        <Route path="documentos" element={<LazyPage component={FrotasDocumentos} module="comercial" compact />} />
        <Route path="viagens" element={<LazyPage component={FrotasViagens} module="comercial" compact />} />
        <Route path="checklists" element={<LazyPage component={FrotasChecklists} module="comercial" compact />} />
        <Route path="relatorios" element={<LazyPage component={FrotasRelatorios} module="comercial" compact />} />
        <Route path="requisicoes-material" element={<LazyPage component={RequisicoesMaterialListaPage} module="comercial" compact moduloKey="frota" />} />
        <Route path="requisicoes-material/nova" element={<LazyPage component={RequisicoesMaterialNovaPage} module="comercial" compact moduloKey="frota" />} />
      </Route>
      <Route
        path="/compras"
        element={
          <PrivateRoute>
            <ProtectedModuleRoute modulo="compras" nomeModulo="Compras">
              <Suspense fallback={<ModuleLoading module="compras" />}>
                <Layout />
              </Suspense>
            </ProtectedModuleRoute>
          </PrivateRoute>
        }
      >
        <Route path="solicitacoes" element={
          <ProtectedModuleRoute modulo="compras" nomeModulo="Compras">
            <LazyPage component={ComprasSolicitacoesCompra} module="compras" compact />
          </ProtectedModuleRoute>
        } />
        <Route path="*" element={
          <ProtectedModuleRoute modulo="compras" nomeModulo="Compras">
            <LazyPage component={Compras} module="compras" compact />
          </ProtectedModuleRoute>
        } />
        <Route path="fornecedores" element={
          <ProtectedModuleRoute modulo="compras" nomeModulo="Compras">
            <LazyPage component={Compras} module="compras" compact />
          </ProtectedModuleRoute>
        } />
        <Route path="pedidos" element={
          <ProtectedModuleRoute modulo="compras" nomeModulo="Compras">
            <LazyPage component={Compras} module="compras" compact />
          </ProtectedModuleRoute>
        } />
        <Route path="cotacoes" element={
          <ProtectedModuleRoute modulo="compras" nomeModulo="Compras">
            <LazyPage component={Compras} module="compras" compact />
          </ProtectedModuleRoute>
        } />
        <Route path="fornecedores-homologados" element={
          <ProtectedModuleRoute modulo="compras" nomeModulo="Compras">
            <LazyPage component={GruposFornecedores} module="compras" compact />
          </ProtectedModuleRoute>
        } />
        <Route path="fornecedores-homologados/grupo/:grupoId" element={
          <ProtectedModuleRoute modulo="compras" nomeModulo="Compras">
            <LazyPage component={FornecedoresDoGrupo} module="compras" compact />
          </ProtectedModuleRoute>
        } />
        <Route path="fornecedores-homologados/fornecedor/:fornecedorId" element={
          <ProtectedModuleRoute modulo="compras" nomeModulo="Compras">
            <LazyPage component={ItensFornecedor} module="compras" compact />
          </ProtectedModuleRoute>
        } />
        <Route path="requisicoes-material" element={<LazyPage component={RequisicoesMaterialListaPage} module="compras" compact moduloKey="compras" />} />
        <Route path="requisicoes-material/nova" element={<LazyPage component={RequisicoesMaterialNovaPage} module="compras" compact moduloKey="compras" />} />
      </Route>
      <Route
        path="/financeiro"
        element={
          <PrivateRoute>
            <ProtectedModuleRoute modulo="financeiro" nomeModulo="Financeiro">
              <Suspense fallback={<ModuleLoading module="financeiro" />}>
                <Layout />
              </Suspense>
            </ProtectedModuleRoute>
          </PrivateRoute>
        }
      >
        <Route path="*" element={
          <ProtectedModuleRoute modulo="financeiro" nomeModulo="Financeiro">
            <LazyPage component={Financeiro} module="financeiro" compact />
          </ProtectedModuleRoute>
        } />
        <Route path="contas-pagar" element={
          <ProtectedModuleRoute modulo="financeiro" nomeModulo="Financeiro">
            <LazyPage component={Financeiro} module="financeiro" compact />
          </ProtectedModuleRoute>
        } />
        <Route path="contas-receber" element={
          <ProtectedModuleRoute modulo="financeiro" nomeModulo="Financeiro">
            <LazyPage component={Financeiro} module="financeiro" compact />
          </ProtectedModuleRoute>
        } />
        <Route path="fluxo-caixa" element={
          <ProtectedModuleRoute modulo="financeiro" nomeModulo="Financeiro">
            <LazyPage component={Financeiro} module="financeiro" compact />
          </ProtectedModuleRoute>
        } />
        <Route path="dashboard" element={
          <ProtectedModuleRoute modulo="financeiro" nomeModulo="Financeiro">
            <LazyPage component={Financeiro} module="financeiro" compact />
          </ProtectedModuleRoute>
        } />
        <Route path="relatorios" element={
          <ProtectedModuleRoute modulo="financeiro" nomeModulo="Financeiro">
            <LazyPage component={Financeiro} module="financeiro" compact />
          </ProtectedModuleRoute>
        } />
        <Route path="bancos" element={
          <ProtectedModuleRoute modulo="financeiro" nomeModulo="Financeiro">
            <LazyPage component={Financeiro} module="financeiro" compact />
          </ProtectedModuleRoute>
        } />
        <Route path="requisicoes-material" element={<LazyPage component={RequisicoesMaterialListaPage} module="financeiro" compact moduloKey="financeiro" />} />
        <Route path="requisicoes-material/nova" element={<LazyPage component={RequisicoesMaterialNovaPage} module="financeiro" compact moduloKey="financeiro" />} />
      </Route>
      <Route
        path="/fabrica"
        element={
          <PrivateRoute>
            <ProtectedModuleRoute modulo="operacional" nomeModulo="Operacional">
              <Suspense fallback={<ModuleLoading module="operacional" />}>
                <Fabrica />
              </Suspense>
            </ProtectedModuleRoute>
          </PrivateRoute>
        }
      >
        <Route index element={<LazyPage component={DashboardMES} module="operacional" compact />} />
        <Route path="dashboard" element={<LazyPage component={DashboardMES} module="operacional" compact />} />
        <Route path="ordens-servico" element={<LazyPage component={OrdensServico} module="operacional" compact />} />
        <Route path="ordens-servico/editar/:id" element={<LazyPage component={OSFormPage} module="operacional" compact />} />
        <Route path="colaboradores" element={<LazyPage component={Colaboradores} module="operacional" compact />} />
        <Route path="atividades" element={<LazyPage component={AtividadesColaboradores} module="operacional" compact />} />
        <Route path="presenca" element={<LazyPage component={ControlePresenca} module="operacional" compact />} />
        <Route path="horas-extras" element={<LazyPage component={HorasExtras} module="operacional" compact />} />
        <Route path="equipamentos" element={<LazyPage component={Equipamentos} module="operacional" compact />} />
        <Route path="requisicoes-material" element={<LazyPage component={RequisicoesMaterialListaPage} module="operacional" compact moduloKey="operacional" />} />
        <Route path="requisicoes-material/nova" element={<LazyPage component={RequisicoesMaterialNovaPage} module="operacional" compact moduloKey="operacional" />} />
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
              <Suspense fallback={<ModuleLoading module="engenharia" />}>
                <Layout />
              </Suspense>
            </ProtectedModuleRoute>
          </PrivateRoute>
        }
      >
        <Route index element={<LazyPage component={CalculosEngenharia} module="engenharia" compact />} />
        <Route path="solicitacao-material-escritorio" element={<LazyPage component={SolicitacaoMaterialEscritorio} module="engenharia" compact />} />
        <Route path="calculo-tampo" element={<LazyPage component={CalculoTampo} module="engenharia" compact />} />
        <Route path="calculo-volume" element={<LazyPage component={CalculoVolume} module="engenharia" compact />} />
        <Route path="calculo-motor-impelidor" element={<LazyPage component={CalculoMotorImpelidor} module="engenharia" compact />} />
        <Route path="selecao-agitadores" element={<LazyPage component={SelecaoAgitadores} module="engenharia" compact />} />
        <Route path="calculo-plataformas" element={<LazyPage component={CalculoPlataformas} module="engenharia" compact />} />
        <Route path="requisicoes-material" element={<LazyPage component={RequisicoesMaterialListaPage} module="engenharia" compact moduloKey="engenharia" />} />
        <Route path="requisicoes-material/nova" element={<LazyPage component={RequisicoesMaterialNovaPage} module="engenharia" compact moduloKey="engenharia" />} />
      </Route>
      <Route
        path="/engenharia-projetos"
        element={
          <PrivateRoute>
            <ProtectedModuleRoute modulo="engenharia_projetos" nomeModulo="Engenharia / Projetos">
              <Suspense fallback={<ModuleLoading module="engenharia_projetos" />}>
                <Layout />
              </Suspense>
            </ProtectedModuleRoute>
          </PrivateRoute>
        }
      >
        <Route index element={<LazyPage component={EngenhariaProjetosHome} module="engenharia_projetos" compact />} />
        <Route path="solicitacao-material-escritorio" element={<LazyPage component={SolicitacaoMaterialEscritorioCesta} module="engenharia_projetos" compact />} />
        <Route path="cadastro-materiais-escritorio" element={<LazyPage component={CadastroMateriaisEscritorio} module="engenharia_projetos" compact />} />
        <Route path="minhas-solicitacoes" element={<LazyPage component={MinhasSolicitacoesCompra} module="engenharia_projetos" compact />} />
        <Route path="requisicoes-material" element={<LazyPage component={RequisicoesMaterialListaPage} module="engenharia_projetos" compact moduloKey="engenharia_projetos" />} />
        <Route path="requisicoes-material/nova" element={<LazyPage component={RequisicoesMaterialNovaPage} module="engenharia_projetos" compact moduloKey="engenharia_projetos" />} />
      </Route>
      <Route
        path="/almoxarifado"
        element={
          <PrivateRoute>
            <ProtectedModuleRoute modulo="almoxarifado" nomeModulo="Almoxarifado">
              <Suspense fallback={<ModuleLoading module="almoxarifado" />}>
                <Layout />
              </Suspense>
            </ProtectedModuleRoute>
          </PrivateRoute>
        }
      >
        <Route index element={<LazyPage component={AlmoxarifadoDashboard} module="almoxarifado" compact />} />
        <Route path="materiais" element={<LazyPage component={MateriaisAlmoxarifado} module="almoxarifado" compact />} />
        <Route path="materiais/novo" element={<LazyPage component={MaterialAlmoxarifadoForm} module="almoxarifado" compact />} />
        <Route path="materiais/editar/:id" element={<LazyPage component={MaterialAlmoxarifadoForm} module="almoxarifado" compact />} />
        <Route path="movimentacoes" element={<LazyPage component={MovimentacoesAlmoxarifado} module="almoxarifado" compact />} />
        <Route path="movimentacoes/novo" element={<LazyPage component={MovimentacoesAlmoxarifado} module="almoxarifado" compact />} />
        <Route path="conferencias" element={<LazyPage component={ConferenciaEstoque} module="almoxarifado" compact />} />
        <Route path="requisicoes" element={
          <RequisicoesMaterialProvider override={MODULOS_REQUISICAO.almoxarifado}>
            <LazyPage component={RequisicoesList} module="almoxarifado" compact />
          </RequisicoesMaterialProvider>
        } />
        <Route path="requisicoes/nova" element={
          <RequisicoesMaterialProvider override={MODULOS_REQUISICAO.almoxarifado}>
            <LazyPage component={RequisicaoForm} module="almoxarifado" compact />
          </RequisicoesMaterialProvider>
        } />
        <Route path="requisicoes-material" element={<LazyPage component={RequisicoesMaterialListaPage} module="almoxarifado" compact moduloKey="almoxarifado" />} />
        <Route path="requisicoes-material/nova" element={<LazyPage component={RequisicoesMaterialNovaPage} module="almoxarifado" compact moduloKey="almoxarifado" />} />
        <Route path="recebimentos" element={<LazyPage component={RecebimentosAlmoxarifado} module="almoxarifado" compact />} />
        <Route path="mapa" element={<LazyPage component={MapaLocalizacoesAlmoxarifado} module="almoxarifado" compact />} />
        <Route path="configuracoes" element={<LazyPage component={ConfiguracoesAlmoxarifado} module="almoxarifado" compact />} />
      </Route>
      <Route
        path="/configuracoes"
        element={
          <PrivateRoute>
            <ProtectedModuleRoute modulo="administrativo" nomeModulo="Administrativo">
              <Suspense fallback={<ModuleLoading module="administrativo" />}>
                <Layout />
              </Suspense>
            </ProtectedModuleRoute>
          </PrivateRoute>
        }
      >
        <Route index element={<LazyPage component={Configuracoes} module="administrativo" compact />} />
        <Route path="requisicoes-material" element={<LazyPage component={RequisicoesMaterialListaPage} module="administrativo" compact moduloKey="administrativo" />} />
        <Route path="requisicoes-material/nova" element={<LazyPage component={RequisicoesMaterialNovaPage} module="administrativo" compact moduloKey="administrativo" />} />
      </Route>
      <Route
        path="/admin"
        element={
          <PrivateRoute>
            <ProtectedModuleRoute modulo="admin" nomeModulo="Administração">
              <Suspense fallback={<ModuleLoading module="admin" />}>
                <Layout />
              </Suspense>
            </ProtectedModuleRoute>
          </PrivateRoute>
        }
      >
        <Route index element={<LazyPage component={Admin} module="admin" compact />} />
        <Route path="usuarios/novo" element={<LazyPage component={UsuarioForm} module="admin" compact />} />
        <Route path="usuarios/editar/:id" element={<LazyPage component={UsuarioForm} module="admin" compact />} />
        <Route path="requisicoes-material" element={<LazyPage component={RequisicoesMaterialListaPage} module="admin" compact moduloKey="admin" />} />
        <Route path="requisicoes-material/nova" element={<LazyPage component={RequisicoesMaterialNovaPage} module="admin" compact moduloKey="admin" />} />
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
            <Suspense fallback={<ModuleLoading module="sistema" />}>
              <OrionIntro onComplete={handleIntroComplete} />
            </Suspense>
          ) : (
            <>
              {showOnboarding && (
                <Suspense fallback={null}>
                  <Onboarding
                    isOpen={showOnboarding}
                    onClose={() => setShowOnboarding(false)}
                    onComplete={handleOnboardingComplete}
                  />
                </Suspense>
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

