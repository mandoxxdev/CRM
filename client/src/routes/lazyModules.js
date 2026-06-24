import React, { lazy, Suspense } from 'react';
import ModuleLoading from '../components/ModuleLoading';

function lazyWithRetry(factory) {
  return lazy(() =>
    factory().catch((err) => {
      const key = 'chunk_reload';
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1');
        window.location.reload();
        return new Promise(() => {});
      }
      sessionStorage.removeItem(key);
      throw err;
    })
  );
}

/** Lazy route with its own Suspense boundary (required for tab navigation after code-splitting). */
function lazyModule(factory, module = 'sistema', { compact = true } = {}) {
  const LazyComp = lazyWithRetry(factory);
  function ModuleRoute(props) {
    const fallback = compact
      ? <ModuleLoading module={module} inline />
      : <ModuleLoading module={module} />;
    return (
      <Suspense fallback={fallback}>
        <LazyComp {...props} />
      </Suspense>
    );
  }
  ModuleRoute.displayName = `LazyModule(${module})`;
  return ModuleRoute;
}

const page = (factory, module) => lazyModule(factory, module, { compact: true });
const shell = (factory, module = 'sistema') => lazyModule(factory, module, { compact: false });

export const Login = shell(() => import('../components/Login'));
export const Dashboard = page(() => import('../components/Dashboard'), 'comercial');
export const OrionIntro = shell(() => import('../components/OrionIntro'));
export const Onboarding = shell(() => import('../components/Onboarding'));
export const Clientes = page(() => import('../components/Clientes'), 'comercial');
export const ClienteForm = page(() => import('../components/ClienteForm'), 'comercial');
export const Projetos = page(() => import('../components/Projetos'), 'comercial');
export const ProjetoForm = page(() => import('../components/ProjetoForm'), 'comercial');
export const PropostasList = page(() => import('../components/proposta/PropostasList'), 'comercial');
export const PropostaForm = page(() => import('../components/proposta/PropostaForm'), 'comercial');
export const PropostaDetalhe = page(() => import('../components/proposta/PropostaDetalhe'), 'comercial');
export const Aprovacoes = page(() => import('../components/Aprovacoes'), 'comercial');
export const ConfigTemplateProposta = page(() => import('../components/ConfigTemplateProposta'), 'comercial');
export const EditorTemplateProposta = page(() => import('../components/EditorTemplateProposta'), 'comercial');
export const ProdutosPage = page(() => import('../components/ProdutosPage'), 'comercial');
export const FamiliasDoGrupo = page(() => import('../components/FamiliasDoGrupo'), 'comercial');
export const ProdutosPorFamilia = page(() => import('../components/ProdutosPorFamilia'), 'comercial');
export const ProdutoForm = page(() => import('../components/ProdutoForm'), 'comercial');
export const Atividades = page(() => import('../components/Atividades'), 'comercial');
export const Relatorios = page(() => import('../components/Relatorios'), 'comercial');
export const MaquinasVendidas = page(() => import('../components/MaquinasVendidas'), 'comercial');
export const CustosViagens = page(() => import('../components/CustosViagens'), 'comercial');
export const OrdensServicoComercial = page(() => import('../components/OrdensServicoComercial'), 'comercial');
export const OSComercialForm = page(() => import('../components/OSComercialForm'), 'comercial');
export const Compras = page(() => import('../components/Compras'), 'compras');
export const ComprasSolicitacoesCompra = page(() => import('../components/ComprasSolicitacoesCompra'), 'compras');
export const GruposFornecedores = page(() => import('../components/GruposFornecedores'), 'compras');
export const FornecedoresDoGrupo = page(() => import('../components/FornecedoresDoGrupo'), 'compras');
export const ItensFornecedor = page(() => import('../components/ItensFornecedor'), 'compras');
export const Financeiro = page(() => import('../components/Financeiro'), 'financeiro');
export const Fabrica = shell(() => import('../components/Fabrica'), 'operacional');
export const DashboardMES = page(() => import('../components/mes/DashboardMES'), 'operacional');
export const OrdensServico = page(() => import('../components/operacional/OrdensServico'), 'operacional');
export const OSFormPage = page(() => import('../components/operacional/OSFormPage'), 'operacional');
export const Colaboradores = page(() => import('../components/operacional/Colaboradores'), 'operacional');
export const AtividadesColaboradores = page(() => import('../components/operacional/AtividadesColaboradores'), 'operacional');
export const ControlePresenca = page(() => import('../components/operacional/ControlePresenca'), 'operacional');
export const HorasExtras = page(() => import('../components/operacional/HorasExtras'), 'operacional');
export const Equipamentos = page(() => import('../components/operacional/Equipamentos'), 'operacional');
export const Configuracoes = page(() => import('../components/Configuracoes'), 'administrativo');
export const Permissoes = page(() => import('../components/Permissoes'), 'admin');
export const Usuarios = page(() => import('../components/Usuarios'), 'admin');
export const UsuarioForm = page(() => import('../components/UsuarioForm'), 'admin');
export const Admin = page(() => import('../components/Admin'), 'admin');
export const Layout = shell(() => import('../components/Layout'));
export const CalculosEngenharia = page(() => import('../components/CalculosEngenharia'), 'engenharia');
export const CalculoTampo = page(() => import('../components/CalculoTampo'), 'engenharia');
export const CalculoVolume = page(() => import('../components/CalculoVolume'), 'engenharia');
export const CalculoMotorImpelidor = page(() => import('../components/CalculoMotorImpelidor'), 'engenharia');
export const SelecaoAgitadores = page(() => import('../components/SelecaoAgitadores'), 'engenharia');
export const CalculoPlataformas = page(() => import('../components/CalculoPlataformas'), 'engenharia');
export const TipoSelecao = shell(() => import('../components/TipoSelecao'));
export const SolicitacaoMaterialEscritorio = page(() => import('../components/engenharia/SolicitacaoMaterialEscritorio'), 'engenharia');
export const EngenhariaProjetosHome = page(() => import('../components/engenhariaProjetos/EngenhariaProjetosHome'), 'engenharia_projetos');
export const CadastroMateriaisEscritorio = page(() => import('../components/engenhariaProjetos/CadastroMateriaisEscritorio'), 'engenharia_projetos');
export const SolicitacaoMaterialEscritorioCesta = page(() => import('../components/engenhariaProjetos/SolicitacaoMaterialEscritorioCesta'), 'engenharia_projetos');
export const MinhasSolicitacoesCompra = page(() => import('../components/MinhasSolicitacoesCompra'), 'engenharia_projetos');
export const VeiculosManutencao = page(() => import('../components/VeiculosManutencao'), 'comercial');
export const FrotasDashboard = page(() => import('../components/frotas/FrotasDashboard'), 'comercial');
export const FrotasVeiculos = page(
  () => import('../components/frotas/FrotasEntityPage').then((m) => ({ default: m.FrotasVeiculos })),
  'comercial'
);
export const FrotasMotoristas = page(
  () => import('../components/frotas/FrotasEntityPage').then((m) => ({ default: m.FrotasMotoristas })),
  'comercial'
);
export const FrotasManutencoes = page(
  () => import('../components/frotas/FrotasEntityPage').then((m) => ({ default: m.FrotasManutencoes })),
  'comercial'
);
export const FrotasAbastecimentos = page(
  () => import('../components/frotas/FrotasEntityPage').then((m) => ({ default: m.FrotasAbastecimentos })),
  'comercial'
);
export const FrotasMultas = page(
  () => import('../components/frotas/FrotasEntityPage').then((m) => ({ default: m.FrotasMultas })),
  'comercial'
);
export const FrotasDocumentos = page(
  () => import('../components/frotas/FrotasEntityPage').then((m) => ({ default: m.FrotasDocumentos })),
  'comercial'
);
export const FrotasViagens = page(
  () => import('../components/frotas/FrotasEntityPage').then((m) => ({ default: m.FrotasViagens })),
  'comercial'
);
export const FrotasChecklists = page(
  () => import('../components/frotas/FrotasEntityPage').then((m) => ({ default: m.FrotasChecklists })),
  'comercial'
);
export const FrotasRelatorios = page(() => import('../components/frotas/FrotasRelatorios'), 'comercial');
export const AlmoxarifadoDashboard = page(() => import('../components/almoxarifado/AlmoxarifadoDashboard'), 'almoxarifado');
export const MateriaisAlmoxarifado = page(() => import('../components/almoxarifado/MateriaisAlmoxarifado'), 'almoxarifado');
export const MaterialAlmoxarifadoForm = page(() => import('../components/almoxarifado/MaterialAlmoxarifadoForm'), 'almoxarifado');
export const MovimentacoesAlmoxarifado = page(() => import('../components/almoxarifado/MovimentacoesAlmoxarifado'), 'almoxarifado');
export const ConferenciaEstoque = page(() => import('../components/almoxarifado/ConferenciaEstoque'), 'almoxarifado');
export const RequisicoesList = page(() => import('../components/almoxarifado/RequisicoesList'), 'almoxarifado');
export const RequisicaoForm = page(() => import('../components/almoxarifado/RequisicaoForm'), 'almoxarifado');
export const RequisicoesMaterialNovaPage = page(
  () => import('../components/almoxarifado/RequisicoesMaterialPages').then((m) => ({
    default: m.RequisicoesMaterialNovaPage,
  })),
  'sistema'
);
export const RequisicoesMaterialListaPage = page(
  () => import('../components/almoxarifado/RequisicoesMaterialPages').then((m) => ({
    default: m.RequisicoesMaterialListaPage,
  })),
  'sistema'
);
export const ConfiguracoesAlmoxarifado = page(() => import('../components/almoxarifado/ConfiguracoesAlmoxarifado'), 'almoxarifado');
export const MapaLocalizacoesAlmoxarifado = page(() => import('../components/almoxarifado/MapaLocalizacoesAlmoxarifado'), 'almoxarifado');
export const RecebimentosAlmoxarifado = page(() => import('../components/almoxarifado/RecebimentosAlmoxarifado'), 'almoxarifado');
export const ChatPage = page(() => import('../components/chat/ChatPage'), 'comercial');

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
