import { lazy, Suspense } from 'react';
import ModuleLoading from '../components/ModuleLoading';
import { lazyImportWithRecovery } from '../utils/chunkLoadRecovery';

function lazyWithRetry(factory) {
  return lazy(() => lazyImportWithRecovery(factory));
}

/** Code-split page — Suspense boundary is provided by Layout (Outlet) or parent shell. */
function lazyPage(factory) {
  return lazyWithRetry(factory);
}

/** Shell layout/login — includes Suspense for the initial chunk load. */
function lazyShell(factory, module = 'sistema') {
  const LazyComp = lazyWithRetry(factory);
  function ShellRoute(props) {
    return (
      <Suspense fallback={<ModuleLoading module={module} />}>
        <LazyComp {...props} />
      </Suspense>
    );
  }
  ShellRoute.displayName = 'LazyShell';
  return ShellRoute;
}

const page = (factory) => lazyPage(factory);
const shell = (factory, module = 'sistema') => lazyShell(factory, module);

export const Login = shell(() => import('../components/Login'));
export const Dashboard = page(() => import('../components/Dashboard'));
export const OrionIntro = shell(() => import('../components/OrionIntro'));
export const Onboarding = shell(() => import('../components/Onboarding'));
export const Clientes = page(() => import('../components/Clientes'));
export const ClienteForm = page(() => import('../components/ClienteForm'));
export const Projetos = page(() => import('../components/Projetos'));
export const ProjetoForm = page(() => import('../components/ProjetoForm'));
export const PropostasList = page(() => import('../components/proposta/PropostasList'));
export const PropostaForm = page(() => import('../components/proposta/PropostaForm'));
export const PropostaDetalhe = page(() => import('../components/proposta/PropostaDetalhe'));
export const PropostaPreviewEditavel = page(() => import('../components/proposta/PropostaPreviewEditavel'));
export const Aprovacoes = page(() => import('../components/Aprovacoes'));
export const ConfigTemplateProposta = page(() => import('../components/ConfigTemplateProposta'));
export const EditorTemplateProposta = page(() => import('../components/EditorTemplateProposta'));
export const ProdutosPage = page(() => import('../components/ProdutosPage'));
export const FamiliasDoGrupo = page(() => import('../components/FamiliasDoGrupo'));
export const ProdutosPorFamilia = page(() => import('../components/ProdutosPorFamilia'));
export const ProdutoForm = page(() => import('../components/ProdutoForm'));
export const Atividades = page(() => import('../components/Atividades'));
export const ListaPrecos = page(() => import('../components/ListaPrecos'));
export const Relatorios = page(() => import('../components/Relatorios'));
export const MaquinasVendidas = page(() => import('../components/MaquinasVendidas'));
export const CustosViagens = page(() => import('../components/CustosViagens'));
export const OrdensServicoComercial = page(() => import('../components/OrdensServicoComercial'));
export const OSComercialForm = page(() => import('../components/OSComercialForm'));
export const Compras = page(() => import('../components/Compras'));
export const ComprasSolicitacoesCompra = page(() => import('../components/ComprasSolicitacoesCompra'));
export const GruposFornecedores = page(() => import('../components/GruposFornecedores'));
export const FornecedoresDoGrupo = page(() => import('../components/FornecedoresDoGrupo'));
export const ItensFornecedor = page(() => import('../components/ItensFornecedor'));
export const Financeiro = page(() => import('../components/Financeiro'));
export const Fabrica = shell(() => import('../components/Fabrica'), 'operacional');
export const DashboardMES = page(() => import('../components/mes/DashboardMES'));
export const OrdensServico = page(() => import('../components/operacional/OrdensServico'));
export const OSFormPage = page(() => import('../components/operacional/OSFormPage'));
export const Colaboradores = page(() => import('../components/operacional/Colaboradores'));
export const AtividadesColaboradores = page(() => import('../components/operacional/AtividadesColaboradores'));
export const ControlePresenca = page(() => import('../components/operacional/ControlePresenca'));
export const HorasExtras = page(() => import('../components/operacional/HorasExtras'));
export const Equipamentos = page(() => import('../components/operacional/Equipamentos'));
export const ProducaoMES = page(() => import('../components/operacional/Producao'));
export const ProducaoDashboard = page(() => import('../components/producao/ProducaoDashboard'));
export const OrdensProducao = page(() => import('../components/producao/OrdensProducao'));
export const OrdemProducaoFormPage = page(() => import('../components/producao/OrdemProducaoFormPage'));
export const ApontamentosProducao = page(() => import('../components/producao/ApontamentosProducao'));
export const MaquinasProducao = page(() => import('../components/producao/MaquinasProducao'));
export const ParadasProducao = page(() => import('../components/producao/ParadasProducao'));
export const RoteirosProducao = page(() => import('../components/producao/RoteirosProducao'));
export const RelatoriosProducao = page(() => import('../components/producao/RelatoriosProducao'));
export const ConfiguracoesProducao = page(() => import('../components/producao/ConfiguracoesProducao'));
export const Configuracoes = page(() => import('../components/Configuracoes'));
export const Permissoes = page(() => import('../components/Permissoes'));
export const Usuarios = page(() => import('../components/Usuarios'));
// shell() (não page()) porque /minha-conta é uma rota standalone, sem o Layout/Outlet
// que forneceria o boundary de Suspense — o shell já inclui o próprio Suspense.
export const MinhaConta = shell(() => import('../components/MinhaConta'));
export const UsuarioForm = page(() => import('../components/UsuarioForm'));
export const Admin = page(() => import('../components/Admin'));
export const Layout = shell(() => import('../components/Layout'), 'sistema');
export const CalculosEngenharia = page(() => import('../components/CalculosEngenharia'));
export const CalculoTampo = page(() => import('../components/CalculoTampo'));
export const CalculoVolume = page(() => import('../components/CalculoVolume'));
export const CalculoMotorImpelidor = page(() => import('../components/CalculoMotorImpelidor'));
export const SelecaoAgitadores = page(() => import('../components/SelecaoAgitadores'));
export const CalculoPlataformas = page(() => import('../components/CalculoPlataformas'));
export const TipoSelecao = shell(() => import('../components/TipoSelecao'));
export const SolicitacaoMaterialEscritorio = page(() => import('../components/engenharia/SolicitacaoMaterialEscritorio'));
export const EngenhariaProjetosHome = page(() => import('../components/engenhariaProjetos/EngenhariaProjetosHome'));
export const CadastroMateriaisEscritorio = page(() => import('../components/engenhariaProjetos/CadastroMateriaisEscritorio'));
export const SolicitacaoMaterialEscritorioCesta = page(() => import('../components/engenhariaProjetos/SolicitacaoMaterialEscritorioCesta'));
export const MinhasSolicitacoesCompra = page(() => import('../components/MinhasSolicitacoesCompra'));
export const VeiculosManutencao = page(() => import('../components/VeiculosManutencao'));
export const FrotasDashboard = page(() => import('../components/frotas/FrotasDashboard'));
export const FrotasVeiculos = page(
  () => import('../components/frotas/FrotasEntityPage').then((m) => ({ default: m.FrotasVeiculos }))
);
export const FrotasMotoristas = page(
  () => import('../components/frotas/FrotasEntityPage').then((m) => ({ default: m.FrotasMotoristas }))
);
export const FrotasManutencoes = page(
  () => import('../components/frotas/FrotasEntityPage').then((m) => ({ default: m.FrotasManutencoes }))
);
export const FrotasAbastecimentos = page(
  () => import('../components/frotas/FrotasEntityPage').then((m) => ({ default: m.FrotasAbastecimentos }))
);
export const FrotasMultas = page(
  () => import('../components/frotas/FrotasEntityPage').then((m) => ({ default: m.FrotasMultas }))
);
export const FrotasDocumentos = page(
  () => import('../components/frotas/FrotasEntityPage').then((m) => ({ default: m.FrotasDocumentos }))
);
export const FrotasViagens = page(
  () => import('../components/frotas/FrotasEntityPage').then((m) => ({ default: m.FrotasViagens }))
);
export const FrotasChecklists = page(
  () => import('../components/frotas/FrotasEntityPage').then((m) => ({ default: m.FrotasChecklists }))
);
export const FrotasRelatorios = page(() => import('../components/frotas/FrotasRelatorios'));
export const AlmoxarifadoDashboard = page(() => import('../components/almoxarifado/AlmoxarifadoDashboard'));
export const MateriaisAlmoxarifado = page(() => import('../components/almoxarifado/MateriaisAlmoxarifado'));
export const MaterialAlmoxarifadoForm = page(() => import('../components/almoxarifado/MaterialAlmoxarifadoForm'));
export const MovimentacoesAlmoxarifado = page(() => import('../components/almoxarifado/MovimentacoesAlmoxarifado'));
export const ConferenciaEstoque = page(() => import('../components/almoxarifado/ConferenciaEstoque'));
export const RequisicoesList = page(() => import('../components/almoxarifado/RequisicoesList'));
export const RequisicaoForm = page(() => import('../components/almoxarifado/RequisicaoForm'));
export const RequisicoesMaterialNovaPage = page(
  () => import('../components/almoxarifado/RequisicoesMaterialPages').then((m) => ({
    default: m.RequisicoesMaterialNovaPage,
  }))
);
export const RequisicoesMaterialListaPage = page(
  () => import('../components/almoxarifado/RequisicoesMaterialPages').then((m) => ({
    default: m.RequisicoesMaterialListaPage,
  }))
);
export const ConfiguracoesAlmoxarifado = page(() => import('../components/almoxarifado/ConfiguracoesAlmoxarifado'));
export const MapaLocalizacoesAlmoxarifado = page(() => import('../components/almoxarifado/MapaLocalizacoesAlmoxarifado'));
export const RecebimentosAlmoxarifado = page(() => import('../components/almoxarifado/RecebimentosAlmoxarifado'));
export const ReservasAlmoxarifado = page(() => import('../components/almoxarifado/ReservasAlmoxarifado'));
export const InspecoesAlmoxarifado = page(() => import('../components/almoxarifado/InspecoesAlmoxarifado'));
export const LotesAlmoxarifado = page(() => import('../components/almoxarifado/LotesAlmoxarifado'));
export const DevolucoesAlmoxarifado = page(() => import('../components/almoxarifado/DevolucoesAlmoxarifado'));
export const MateriaisClienteAlmoxarifado = page(() => import('../components/almoxarifado/MateriaisClienteAlmoxarifado'));
export const RemessasTerceirosAlmoxarifado = page(() => import('../components/almoxarifado/RemessasTerceirosAlmoxarifado'));
export const SobrasAlmoxarifado = page(() => import('../components/almoxarifado/SobrasAlmoxarifado'));
export const FerramentasAlmoxarifado = page(() => import('../components/almoxarifado/FerramentasAlmoxarifado'));
export const ReposicaoAlmoxarifado = page(() => import('../components/almoxarifado/ReposicaoAlmoxarifado'));
export const NotificacoesAlmoxarifado = page(() => import('../components/almoxarifado/NotificacoesAlmoxarifado'));
export const RelatoriosAlmoxarifado = page(() => import('../components/almoxarifado/RelatoriosAlmoxarifado'));
export const ChatPage = page(() => import('../components/chat/ChatPage'));
export const TodolistBoard = page(() => import('../components/todolist/TodolistBoard'));

/** Warm-up do chunk principal de cada módulo (hover na seleção). */
export const MODULE_PREFETCH = {
  comercial: () => import('../components/Dashboard'),
  frota: () => import('../components/frotas/FrotasDashboard'),
  compras: () => import('../components/Compras'),
  financeiro: () => import('../components/Financeiro'),
  operacional: () => import('../components/Fabrica'),
  administrativo: () => import('../components/Configuracoes'),
  engenharia: () => import('../components/CalculosEngenharia'),
  engenharia_projetos: () => import('../components/engenhariaProjetos/EngenhariaProjetosHome'),
  almoxarifado: () => import('../components/almoxarifado/AlmoxarifadoDashboard'),
  todolist: () => import('../components/todolist/TodolistBoard'),
  admin: () => import('../components/Admin'),
};

/** Prefetch de páginas frequentes por rota (hover no menu lateral). */
export const ROUTE_PREFETCH = {
  '/comercial': () => import('../components/Dashboard'),
  '/comercial/clientes': () => import('../components/Clientes'),
  '/comercial/projetos': () => import('../components/Projetos'),
  '/comercial/produtos': () => import('../components/ProdutosPage'),
  '/comercial/propostas': () => import('../components/proposta/PropostasList'),
  '/comercial/aprovacoes': () => import('../components/Aprovacoes'),
  '/comercial/ordens-servico': () => import('../components/OrdensServicoComercial'),
  '/comercial/atividades': () => import('../components/Atividades'),
  '/comercial/relatorios': () => import('../components/Relatorios'),
  '/comercial/maquinas-vendidas': () => import('../components/MaquinasVendidas'),
  '/comercial/custos-viagens': () => import('../components/CustosViagens'),
  '/chat': () => import('../components/chat/ChatPage'),
  '/frota': () => import('../components/frotas/FrotasDashboard'),
  '/frota/veiculos': () => import('../components/frotas/FrotasEntityPage'),
  '/todolist': () => import('../components/todolist/TodolistBoard'),
  '/compras/solicitacoes': () => import('../components/ComprasSolicitacoesCompra'),
  '/compras/fornecedores': () => import('../components/GruposFornecedores'),
  '/financeiro/dashboard': () => import('../components/Financeiro'),
  '/fabrica': () => import('../components/producao/ProducaoDashboard'),
  '/fabrica/ordens-producao': () => import('../components/producao/OrdensProducao'),
  '/fabrica/apontamentos': () => import('../components/producao/ApontamentosProducao'),
  '/fabrica/maquinas': () => import('../components/producao/MaquinasProducao'),
  '/fabrica/paradas': () => import('../components/producao/ParadasProducao'),
  '/fabrica/roteiros': () => import('../components/producao/RoteirosProducao'),
  '/fabrica/relatorios': () => import('../components/producao/RelatoriosProducao'),
  '/fabrica/ordens-servico': () => import('../components/operacional/OrdensServico'),
  '/engenharia': () => import('../components/CalculosEngenharia'),
  '/engenharia-projetos': () => import('../components/engenhariaProjetos/EngenhariaProjetosHome'),
  '/almoxarifado': () => import('../components/almoxarifado/AlmoxarifadoDashboard'),
  '/almoxarifado/sobras': () => import('../components/almoxarifado/SobrasAlmoxarifado'),
  '/almoxarifado/ferramentas': () => import('../components/almoxarifado/FerramentasAlmoxarifado'),
  '/almoxarifado/reposicao': () => import('../components/almoxarifado/ReposicaoAlmoxarifado'),
  '/almoxarifado/notificacoes': () => import('../components/almoxarifado/NotificacoesAlmoxarifado'),
  '/almoxarifado/relatorios': () => import('../components/almoxarifado/RelatoriosAlmoxarifado'),
  '/configuracoes': () => import('../components/Configuracoes'),
  '/admin/usuarios': () => import('../components/Admin'),
};

export function prefetchModule(moduloKey) {
  const loader = MODULE_PREFETCH[moduloKey];
  if (loader) {
    loader().catch(() => {});
  }
}

export function prefetchRoute(path) {
  if (!path) return;
  const normalized = path.split('?')[0];
  const loader = ROUTE_PREFETCH[normalized];
  if (loader) {
    loader().catch(() => {});
  }
}

export function prefetchModuleByRoute(rota) {
  if (!rota) return;
  const path = rota.split('?')[0];
  prefetchRoute(path);
  if (path.startsWith('/comercial')) return prefetchModule('comercial');
  if (path.startsWith('/frota')) return prefetchModule('frota');
  if (path.startsWith('/todolist')) return prefetchModule('todolist');
  if (path.startsWith('/compras')) return prefetchModule('compras');
  if (path.startsWith('/financeiro')) return prefetchModule('financeiro');
  if (path.startsWith('/fabrica')) return prefetchModule('operacional');
  if (path.startsWith('/configuracoes')) return prefetchModule('administrativo');
  if (path.startsWith('/engenharia-projetos')) return prefetchModule('engenharia_projetos');
  if (path.startsWith('/engenharia')) return prefetchModule('engenharia');
  if (path.startsWith('/almoxarifado')) return prefetchModule('almoxarifado');
  if (path.startsWith('/admin')) return prefetchModule('admin');
}
