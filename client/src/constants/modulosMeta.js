import {
  FiTarget, FiTool, FiShoppingCart, FiDollarSign, FiPackage,
  FiSettings, FiSliders, FiBriefcase, FiArchive, FiShield,
} from 'react-icons/fi';

// Ícone + cor de cada módulo (mesmos usados nos cards da tela de seleção de módulos).
export const MODULOS_META = {
  comercial: { nome: 'Comercial', icon: FiTarget, gradient: 'linear-gradient(135deg, #6d28d9 0%, #be185d 100%)' },
  compras: { nome: 'Compras', icon: FiShoppingCart, gradient: 'linear-gradient(135deg, #0f766e 0%, #0891b2 100%)' },
  financeiro: { nome: 'Financeiro', icon: FiDollarSign, gradient: 'linear-gradient(135deg, #047857 0%, #10b981 100%)' },
  operacional: { nome: 'Operacional', icon: FiPackage, gradient: 'linear-gradient(135deg, #1e40af 0%, #4338ca 100%)' },
  engenharia: { nome: 'Cálculos de Engenharia', icon: FiSliders, gradient: 'linear-gradient(135deg, #b45309 0%, #ea580c 100%)' },
  engenharia_projetos: { nome: 'Engenharia / Projetos', icon: FiBriefcase, gradient: 'linear-gradient(135deg, #3730a3 0%, #6366f1 100%)' },
  almoxarifado: { nome: 'Almoxarifado', icon: FiArchive, gradient: 'linear-gradient(135deg, #78350f 0%, #a16207 100%)' },
  frota: { nome: 'Frota', icon: FiTool, gradient: 'linear-gradient(135deg, #ea580c 0%, #b91c1c 100%)' },
  administrativo: { nome: 'Administrativo', icon: FiSettings, gradient: 'linear-gradient(135deg, #334155 0%, #6d28d9 100%)' },
  admin: { nome: 'Admin', icon: FiShield, gradient: 'linear-gradient(135deg, #450a0a 0%, #991b1b 100%)' },
};

// Ordem de exibição das badges.
export const MODULOS_ORDEM = [
  'comercial', 'compras', 'financeiro', 'operacional', 'engenharia',
  'engenharia_projetos', 'almoxarifado', 'frota', 'administrativo', 'admin',
];

/** Módulos que o usuário acessa → admin/superadmin veem todos. */
export function modulosDoUsuario(usuario) {
  if (!usuario) return [];
  if (usuario.is_superadmin || usuario.role === 'admin') return MODULOS_ORDEM;
  const acesso = new Set(usuario.modulos || []);
  return MODULOS_ORDEM.filter((k) => acesso.has(k));
}
