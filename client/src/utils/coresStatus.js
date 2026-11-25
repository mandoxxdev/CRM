// Cor e rotulo de um STATUS, para graficos e etiquetas (25/11/2026).
//
// O P.O. olhou a rosca "Propostas por Status" com tres tons de azul e disse:
// "Rejeitada deveria ser em vermelho". Cor de status e significado, nao
// decoracao: verde e o que deu certo, vermelho o que parou, azul o que esta em
// curso, ambar o que espera alguem, cinza o que ainda nao comecou. Uma regua
// so, por palavra-chave, para servir a todos os modulos (propostas, projetos,
// OPs, pedidos, requisicoes...) sem cada tela inventar a sua.

const VERDE = '#34C759';
const AZUL = '#0A84FF';
const VERMELHO = '#FF3B30';
const AMBAR = '#FF9F0A';
const CINZA = '#8E8E93';
const ROXO = '#AF52DE';
const CIANO = '#32ADE6';

const REGRAS = [
  [/^(aprovad|aceit|conclu|finaliz|entreg|pago|paga|quitad|ativo|ativa|disponivel|liberad|recebid|fechad|ganh|ok$)/i, VERDE],
  [/^(rejeit|recus|cancel|expirad|vencid|atrasad|inativ|bloquead|perdid|reprovad|erro|falh|negad)/i, VERMELHO],
  [/^(pendente|aguardand|em_revisao|em revisao|revisao|analise|em_analise|parcial|alerta|quarentena)/i, AMBAR],
  [/^(rascunho|novo|nova|criad|planejad|nao_iniciad|aberto|aberta)/i, CINZA],
  [/^(aprovada_internamente|interna)/i, CIANO],
  [/^(visualiz)/i, ROXO],
  [/^(enviad|em_andamento|em andamento|andamento|em_producao|producao|executand|separand|em_separacao|processand|em_curso)/i, AZUL],
];

const PALETA_RESERVA = [AZUL, '#8EC1FF', '#0348B5', '#B9C4D6', CIANO, '#1D1D1F'];

/** Cor para um status. Sem regra, cai na paleta neutra pelo indice (quando dado). */
export function corDoStatus(status, indice = 0) {
  const chave = String(status == null ? '' : status).trim();
  for (const [re, cor] of REGRAS) {
    if (re.test(chave)) return cor;
  }
  return PALETA_RESERVA[Math.abs(indice) % PALETA_RESERVA.length];
}

const ROTULOS = {
  rascunho: 'Rascunho', em_revisao: 'Em revisão', aprovada_internamente: 'Aprovada internamente',
  enviada: 'Enviada', visualizada: 'Visualizada', aceita: 'Aceita', aprovada: 'Aprovada',
  rejeitada: 'Rejeitada', cancelada: 'Cancelada', expirada: 'Expirada',
  em_producao: 'Em produção', em_andamento: 'Em andamento', planejada: 'Planejada', planejado: 'Planejado',
  concluida: 'Concluída', concluido: 'Concluído', pendente: 'Pendente', aberto: 'Aberto', aberta: 'Aberta',
};

/** "em_producao" -> "Em produção"; conhecidos pelo mapa, o resto humanizado. */
export function rotuloDoStatus(status) {
  if (status === null || status === undefined) return '';
  const chave = String(status);
  if (ROTULOS[chave]) return ROTULOS[chave];
  const texto = chave.replace(/_/g, ' ').trim();
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
