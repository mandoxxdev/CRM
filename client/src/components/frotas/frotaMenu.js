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
  FiSmartphone,
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

export function menuFrotaDoPerfil(perfil) {
  return perfil === PERFIS_FROTA.MOTORISTA ? MENU_FROTA_MOTORISTA : MENU_FROTA_GESTOR;
}
