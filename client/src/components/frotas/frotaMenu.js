/**
 * Menu lateral do modulo Frota por perfil (Frota Etapa 1, T7).
 *
 * MOTORISTA ve so o que e dele: "Meu painel" (o portal do motorista) e as requisicoes de material. O resto do modulo (cadastro,
 * painel do gestor, relatorios) o servidor ja recusa para ele (RN-F1.14/16) — mostrar o item so produziria tela de erro.
 * ADMIN_FROTA e CONSULTA veem tudo e mais o "Portal do motorista" (F2-17). O perfil sai de `perfilFrota(user)`, a mesma regua do
 * servidor; quem decide continua sendo o servidor.
 */
import {
  FiHome, FiTruck, FiUsers, FiTool, FiDroplet, FiFileText, FiMap, FiClipboard, FiAlertTriangle, FiBarChart2, FiList,
  FiSmartphone, FiShield, FiMapPin,
} from 'react-icons/fi';
import { PERFIS_FROTA } from '../../utils/systemPermissions';

const SOLICITAR = { path: '/frota/requisicoes-material/nova', icon: FiClipboard, label: 'Solicitar Material' };
const MINHAS = { path: '/frota/requisicoes-material', icon: FiList, label: 'Minhas Requisições' };

export const MENU_FROTA_GESTOR = Object.freeze([
  { path: '/frota', icon: FiHome, label: 'Dashboard Frota' },
  { path: '/frota/veiculos', icon: FiTruck, label: 'Veículos' },
  { path: '/frota/motoristas', icon: FiUsers, label: 'Motoristas' },
  { path: '/frota/manutencoes', icon: FiTool, label: 'Manutenções' },
  { path: '/frota/abastecimentos', icon: FiDroplet, label: 'Abastecimentos' },
  { path: '/frota/documentos', icon: FiFileText, label: 'Documentos' },
  { path: '/frota/viagens', icon: FiMap, label: 'Viagens' },
  // Frota Etapa 8 (RN-F8.36): destinos cadastrados — gestor e Consulta; o motorista nao tem o item (cadastra pelo portal).
  // O MENU_FROTA_ADMIN herda (ele corta em /frota/relatorios por indice, nao por posicao fixa).
  { path: '/frota/destinos', icon: FiMapPin, label: 'Destinos' },
  { path: '/frota/checklists', icon: FiClipboard, label: 'Checklist Diário' },
  { path: '/frota/multas', icon: FiAlertTriangle, label: 'Multas' },
  { path: '/frota/relatorios', icon: FiBarChart2, label: 'Relatórios' },
  { path: '/frota/motorista', icon: FiSmartphone, label: 'Portal do motorista' },
  SOLICITAR,
  MINHAS,
]);

export const MENU_FROTA_MOTORISTA = Object.freeze([
  { path: '/frota/motorista', icon: FiSmartphone, label: 'Meu painel' },
  SOLICITAR,
  MINHAS,
]);

// Frota Etapa 2 (RN-F2.10): "Perfis de acesso" so para o ADMIN_FROTA (o servidor recusa `configurar` aos outros). CONSULTA fica com o
// menu do gestor sem ele; o MOTORISTA nao muda.
const PERFIS = { path: '/frota/perfis', icon: FiShield, label: 'Perfis de acesso' };
const iRelatorios = MENU_FROTA_GESTOR.findIndex((i) => i.path === '/frota/relatorios');
export const MENU_FROTA_ADMIN = Object.freeze([
  ...MENU_FROTA_GESTOR.slice(0, iRelatorios + 1),
  PERFIS,
  ...MENU_FROTA_GESTOR.slice(iRelatorios + 1),
]);

export function menuFrotaDoPerfil(perfil) {
  if (perfil === PERFIS_FROTA.MOTORISTA) return MENU_FROTA_MOTORISTA;
  if (perfil === PERFIS_FROTA.ADMIN_FROTA) return MENU_FROTA_ADMIN;
  return MENU_FROTA_GESTOR;
}
