import { lazy } from 'react';

export const Login = lazy(() => import('../components/Login'));
export const Dashboard = lazy(() => import('../components/Dashboard'));
export const OrionIntro = lazy(() => import('../components/OrionIntro'));
export const Onboarding = lazy(() => import('../components/Onboarding'));
export const Clientes = lazy(() => import('../components/Clientes'));
export const ClienteForm = lazy(() => import('../components/ClienteForm'));
export const Projetos = lazy(() => import('../components/Projetos'));
export const ProjetoForm = lazy(() => import('../components/ProjetoForm'));
export const PropostasList = lazy(() => import('../components/proposta/PropostasList'));
export const PropostaForm = lazy(() => import('../components/proposta/PropostaForm'));
export const PropostaDetalhe = lazy(() => import('../components/proposta/PropostaDetalhe'));
export const Aprovacoes = lazy(() => import('../components/Aprovacoes'));
export const ConfigTemplateProposta = lazy(() => import('../components/ConfigTemplateProposta'));
export const EditorTemplateProposta = lazy(() => import('../components/EditorTemplateProposta'));
export const ProdutosPage = lazy(() => import('../components/ProdutosPage'));
export const FamiliasDoGrupo = lazy(() => import('../components/FamiliasDoGrupo'));
export const ProdutosPorFamilia = lazy(() => import('../components/ProdutosPorFamilia'));
export const ProdutoForm = lazy(() => import('../components/ProdutoForm'));
export const Atividades = lazy(() => import('../components/Atividades'));
export const Relatorios = lazy(() => import('../components/Relatorios'));
export const MaquinasVendidas = lazy(() => import('../components/MaquinasVendidas'));
export const CustosViagens = lazy(() => import('../components/CustosViagens'));
export const OrdensServicoComercial = lazy(() => import('../components/OrdensServicoComercial'));
export const OSComercialForm = lazy(() => import('../components/OSComercialForm'));
export const Compras = lazy(() => import('../components/Compras'));
export const ComprasSolicitacoesCompra = lazy(() => import('../components/ComprasSolicitacoesCompra'));
export const GruposFornecedores = lazy(() => import('../components/GruposFornecedores'));
export const FornecedoresDoGrupo = lazy(() => import('../components/FornecedoresDoGrupo'));
export const ItensFornecedor = lazy(() => import('../components/ItensFornecedor'));
export const Financeiro = lazy(() => import('../components/Financeiro'));
export const Fabrica = lazy(() => import('../components/Fabrica'));
export const DashboardMES = lazy(() => import('../components/mes/DashboardMES'));
export const OrdensServico = lazy(() => import('../components/operacional/OrdensServico'));
export const OSFormPage = lazy(() => import('../components/operacional/OSFormPage'));
export const Colaboradores = lazy(() => import('../components/operacional/Colaboradores'));
export const AtividadesColaboradores = lazy(() => import('../components/operacional/AtividadesColaboradores'));
export const ControlePresenca = lazy(() => import('../components/operacional/ControlePresenca'));
export const HorasExtras = lazy(() => import('../components/operacional/HorasExtras'));
export const Equipamentos = lazy(() => import('../components/operacional/Equipamentos'));
export const Configuracoes = lazy(() => import('../components/Configuracoes'));
export const Permissoes = lazy(() => import('../components/Permissoes'));
export const Usuarios = lazy(() => import('../components/Usuarios'));
export const UsuarioForm = lazy(() => import('../components/UsuarioForm'));
export const Admin = lazy(() => import('../components/Admin'));
export const Layout = lazy(() => import('../components/Layout'));
export const CalculosEngenharia = lazy(() => import('../components/CalculosEngenharia'));
export const CalculoTampo = lazy(() => import('../components/CalculoTampo'));
export const CalculoVolume = lazy(() => import('../components/CalculoVolume'));
export const CalculoMotorImpelidor = lazy(() => import('../components/CalculoMotorImpelidor'));
export const SelecaoAgitadores = lazy(() => import('../components/SelecaoAgitadores'));
export const CalculoPlataformas = lazy(() => import('../components/CalculoPlataformas'));
export const TipoSelecao = lazy(() => import('../components/TipoSelecao'));
export const SolicitacaoMaterialEscritorio = lazy(() => import('../components/engenharia/SolicitacaoMaterialEscritorio'));
export const EngenhariaProjetosHome = lazy(() => import('../components/engenhariaProjetos/EngenhariaProjetosHome'));
export const CadastroMateriaisEscritorio = lazy(() => import('../components/engenhariaProjetos/CadastroMateriaisEscritorio'));
export const SolicitacaoMaterialEscritorioCesta = lazy(() => import('../components/engenhariaProjetos/SolicitacaoMaterialEscritorioCesta'));
export const MinhasSolicitacoesCompra = lazy(() => import('../components/MinhasSolicitacoesCompra'));
export const VeiculosManutencao = lazy(() => import('../components/VeiculosManutencao'));
export const FrotasDashboard = lazy(() => import('../components/frotas/FrotasDashboard'));
export const FrotasVeiculos = lazy(() => import('../components/frotas/FrotasEntityPage').then((m) => ({ default: m.FrotasVeiculos })));
export const FrotasMotoristas = lazy(() => import('../components/frotas/FrotasEntityPage').then((m) => ({ default: m.FrotasMotoristas })));
export const FrotasManutencoes = lazy(() => import('../components/frotas/FrotasEntityPage').then((m) => ({ default: m.FrotasManutencoes })));
export const FrotasAbastecimentos = lazy(() => import('../components/frotas/FrotasEntityPage').then((m) => ({ default: m.FrotasAbastecimentos })));
export const FrotasMultas = lazy(() => import('../components/frotas/FrotasEntityPage').then((m) => ({ default: m.FrotasMultas })));
export const FrotasDocumentos = lazy(() => import('../components/frotas/FrotasEntityPage').then((m) => ({ default: m.FrotasDocumentos })));
export const FrotasViagens = lazy(() => import('../components/frotas/FrotasEntityPage').then((m) => ({ default: m.FrotasViagens })));
export const FrotasChecklists = lazy(() => import('../components/frotas/FrotasEntityPage').then((m) => ({ default: m.FrotasChecklists })));
export const FrotasRelatorios = lazy(() => import('../components/frotas/FrotasRelatorios'));
export const AlmoxarifadoDashboard = lazy(() => import('../components/almoxarifado/AlmoxarifadoDashboard'));
export const MateriaisAlmoxarifado = lazy(() => import('../components/almoxarifado/MateriaisAlmoxarifado'));
export const MaterialAlmoxarifadoForm = lazy(() => import('../components/almoxarifado/MaterialAlmoxarifadoForm'));
export const MovimentacoesAlmoxarifado = lazy(() => import('../components/almoxarifado/MovimentacoesAlmoxarifado'));
export const ConferenciaEstoque = lazy(() => import('../components/almoxarifado/ConferenciaEstoque'));
export const RequisicoesList = lazy(() => import('../components/almoxarifado/RequisicoesList'));
export const RequisicaoForm = lazy(() => import('../components/almoxarifado/RequisicaoForm'));
export const RequisicoesMaterialNovaPage = lazy(() =>
  import('../components/almoxarifado/RequisicoesMaterialPages').then((m) => ({
    default: m.RequisicoesMaterialNovaPage,
  }))
);
export const RequisicoesMaterialListaPage = lazy(() =>
  import('../components/almoxarifado/RequisicoesMaterialPages').then((m) => ({
    default: m.RequisicoesMaterialListaPage,
  }))
);
export const ConfiguracoesAlmoxarifado = lazy(() => import('../components/almoxarifado/ConfiguracoesAlmoxarifado'));
export const MapaLocalizacoesAlmoxarifado = lazy(() => import('../components/almoxarifado/MapaLocalizacoesAlmoxarifado'));
export const RecebimentosAlmoxarifado = lazy(() => import('../components/almoxarifado/RecebimentosAlmoxarifado'));
export const ChatPage = lazy(() => import('../components/chat/ChatPage'));

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
  admin: () => import('../components/Admin'),
};

export function prefetchModule(moduloKey) {
  const loader = MODULE_PREFETCH[moduloKey];
  if (loader) {
    loader();
  }
}

export function prefetchModuleByRoute(rota) {
  if (!rota) return;
  const path = rota.split('?')[0];
  if (path.startsWith('/comercial')) return prefetchModule('comercial');
  if (path.startsWith('/frota')) return prefetchModule('frota');
  if (path.startsWith('/compras')) return prefetchModule('compras');
  if (path.startsWith('/financeiro')) return prefetchModule('financeiro');
  if (path.startsWith('/fabrica')) return prefetchModule('operacional');
  if (path.startsWith('/configuracoes')) return prefetchModule('administrativo');
  if (path.startsWith('/engenharia-projetos')) return prefetchModule('engenharia_projetos');
  if (path.startsWith('/engenharia')) return prefetchModule('engenharia');
  if (path.startsWith('/almoxarifado')) return prefetchModule('almoxarifado');
  if (path.startsWith('/admin')) return prefetchModule('admin');
}
