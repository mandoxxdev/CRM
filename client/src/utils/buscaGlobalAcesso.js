/**
 * Etapa 155 (RN-155.02, C364, B999) — quem a busca do topo (Ctrl+K) atende.
 *
 * O servidor filtra cada tipo de resultado pelo modulo da tela que ele abre (`TIPOS_DA_BUSCA_GLOBAL` em server/index.js, Etapa 153): hoje
 * os seis tipos levam ao Comercial. Quem a regua da tela nao deixa entrar em nenhum desses modulos recebe sempre `[]` — a tela dizia
 * "Nenhum resultado encontrado" a toda busca. Aqui a mesma regua da moldura (`hasModuleAccess`, a do `ProtectedModuleRoute`) decide se a
 * busca busca ou diz por que nao busca. O servidor continua decidindo; isto so evita a busca que nunca acha nada.
 *
 * O conjunto abaixo e o dos modulos de `TIPOS_DA_BUSCA_GLOBAL` — o teste do servidor (paineisBuscaGlobalPortao) le os dois e cai se
 * divergirem (um tipo novo de outro modulo no servidor exige entrar aqui).
 */
import { hasModuleAccess } from '../services/permissionsCache';
import { bypassModuleRestrictions } from './systemPermissions';

export const MODULOS_DA_BUSCA_GLOBAL = ['comercial'];

/**
 * true: busca; false: diz por que nao busca; null: o cache de permissoes esta frio — quem chama le as permissoes e decide depois.
 * Sem usuario: true (falha aberto — o servidor decide).
 */
export function podeUsarBuscaGlobal(user, cached) {
  if (!user?.id) return true;
  if (bypassModuleRestrictions(user)) return true;
  if (!cached) return null;
  return MODULOS_DA_BUSCA_GLOBAL.some((modulo) => hasModuleAccess(cached.permissoes, modulo, user));
}

export const FRASE_BUSCA_SEM_MODULO = 'A busca do topo procura clientes, projetos, propostas, atividades e produtos do Comercial, e você não tem acesso ao Comercial.';
export const FRASE_BUSCA_FALHOU = 'Não foi possível buscar agora. Tente de novo em instantes.';
