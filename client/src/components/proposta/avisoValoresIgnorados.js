// Etapa 144 (RN-144.05, D (142)): o preview aberto numa aba velha manda ids de itens que não existem mais (o salvamento da proposta
// apaga e reinsere os itens, com ids novos). O servidor não grava esses valores e responde quantos foram (`ignorados`); a tela deixa de
// dizer "Alterações salvas." e avisa — antes o vendedor achava que tinha salvo.

/** Soma o `ignorados` das respostas do salvamento do preview. Resposta sem o campo (servidor antigo) conta 0. */
export function somarIgnorados(...respostas) {
  return respostas.reduce((soma, r) => {
    const n = Number(r && r.data && r.data.ignorados);
    return soma + (Number.isFinite(n) && n > 0 ? n : 0);
  }, 0);
}

/** O aviso do preview quando algum valor não foi gravado, ou `null` quando foram todos. */
export function avisoValoresIgnorados(n) {
  const k = Number(n) || 0;
  if (k <= 0) return null;
  // Sem número de propósito (Fase 2 I-1): o preview manda todos os campos do documento, então o número seria o de campos, não o do que
  // o vendedor editou.
  return 'Alguns campos dos itens não foram gravados: os itens desta proposta mudaram depois que o preview abriu (ela foi salva em outra aba ou por outra pessoa). O preview foi recarregado — confira e preencha de novo.';
}

/**
 * Etapa 147 (Fase 5 r1 I-1, RN-147.08): o preview achava que a proposta ainda usava as cláusulas padrão, mas o servidor já as tinha
 * gravado (um salvamento anterior que falhou no meio, a cópia que ficou pela metade, outra aba). Relacionar as gravadas pela posição, aí,
 * gravava o texto de uma cláusula na vizinha e apagava a última — calado. As mudanças nas cláusulas não são gravadas e o preview recarrega.
 */
export const AVISO_CLAUSULAS_JA_GRAVADAS = 'As cláusulas desta proposta já estavam gravadas (por um salvamento anterior que não terminou ou por outra aba) e as mudanças nelas não foram gravadas agora. O preview foi recarregado com o que está gravado — confira as cláusulas e faça as mudanças de novo.';

/**
 * O desfecho do salvar() do preview (Fase 5, r3): qual toast, com que texto, e o que o salvar() devolve — por valor, num lugar só.
 * Com algum campo ignorado, ou com as cláusulas já gravadas (Etapa 147): aviso e `ok: false` (o Emitir revisão não emite, B940); senão
 * "Alterações salvas." e `ok: true`.
 */
export function desfechoDoSalvar(respostaVariaveis, respostaDescricoes, clausulasJaGravadas = false) {
  const avisos = [];
  if (clausulasJaGravadas === true) avisos.push(AVISO_CLAUSULAS_JA_GRAVADAS);
  const aviso = avisoValoresIgnorados(somarIgnorados(respostaVariaveis, respostaDescricoes));
  if (aviso) avisos.push(aviso);
  if (avisos.length > 0) return { tipo: 'warning', mensagem: avisos.join(' '), ok: false };
  return { tipo: 'success', mensagem: 'Alterações salvas.', ok: true };
}

/**
 * Etapa 147 (RN-147.07, B962): o aviso vermelho quando o salvar() do preview falha — a frase do servidor (o campo error da resposta: as das
 * cláusulas, "Acesso negado ao módulo", ...) e, sem ela (rede caída, resposta sem corpo ou sem texto), o "Erro ao salvar alterações.".
 * Sem a frase, o vendedor não sabia que a cópia das cláusulas tinha ficado pela metade e que precisava usar o Resetar cláusulas (C340).
 */
export function mensagemDaFalhaDoSalvar(e) {
  const doServidor = e && e.response && e.response.data && e.response.data.error;
  return typeof doServidor === 'string' && doServidor.trim() ? doServidor : 'Erro ao salvar alterações.';
}
