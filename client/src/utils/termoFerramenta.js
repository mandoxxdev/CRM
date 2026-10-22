/**
 * Etapa 180 (T3) — regras PURAS do termo de responsabilidade no emprestimo de ferramenta (testaveis sem DOM). Molde: epiEntrega.js.
 *
 * O servidor e quem decide (RN-180.02..05, contrato da "Execucao da T2" no plano da etapa): aqui so se antecipa a recusa dele, com o
 * MESMO texto, para a pessoa nao colher a assinatura do colaborador e so depois ouvir o 400. Se divergirem, vale o `error` do servidor.
 */

/** RN-180.04: o colaborador digita a propria matricula para assinar (a frase do servidor, `conferirMatricula` com acao do termo). */
export function erroDaConfirmacaoTermo(valor) {
  return String(valor ?? '').trim() ? null : 'O colaborador deve digitar a própria matrícula para assinar o termo';
}

/**
 * O corpo multipart do `POST /almoxarifado/ferramentas/:id/emprestar` (contrato da T2): `colaborador_id`, `confirmacao_matricula`,
 * `termo_versao` (a versao que a tela MOSTROU — se a vigente mudou, o servidor responde 409), `data_prevista_devolucao?`,
 * `observacoes?`, `chave_idempotencia?` e o arquivo `assinatura` (PNG). Opcional vazio NAO vai. `colaborador_nome`/`setor` nao vao:
 * o servidor ignora (o snapshot e do cadastro, RN-180.03).
 */
export function montarFormDataEmprestimo(form, assinatura, termoVersao, chave) {
  const fd = new FormData();
  fd.append('colaborador_id', String(Number(form.colaborador_id)));
  fd.append('confirmacao_matricula', String(form.confirmacao_matricula ?? '').trim());
  fd.append('termo_versao', String(termoVersao));
  if (form.data_prevista_devolucao) fd.append('data_prevista_devolucao', form.data_prevista_devolucao);
  const observacoes = String(form.observacoes ?? '').trim();
  if (observacoes) fd.append('observacoes', observacoes);
  if (chave) fd.append('chave_idempotencia', chave);
  fd.append('assinatura', assinatura, 'assinatura.png');
  return fd;
}

/** O 409 de "o texto do termo mudou (versao <n>)" — a tela recarrega o texto e pede nova assinatura. */
export function ehVersaoDoTermoTrocada(err) {
  const r = err && err.response;
  return !!r && r.status === 409 && /^O texto do termo mudou/.test(String(r.data?.error || ''));
}

export const AVISO_VERSAO_TROCADA = 'O texto do termo mudou — releia e assine de novo';

/**
 * A mensagem do erro do POST do emprestimo. O `error` do servidor e literal (inclusive o 409 de quem perdeu a corrida e o 500 que
 * diz se algo foi gravado); sem resposta (a rede caiu), o emprestimo PODE ter sido gravado — e o reenvio com a mesma chave nao
 * duplica, entao a tela manda tentar de novo.
 */
export function mensagemErroEmprestimo(err) {
  const r = err && err.response;
  if (!r) {
    return 'Sem resposta do servidor — o empréstimo pode ter sido registrado. Toque em "Emprestar" de novo: o reenvio não duplica.';
  }
  if (r.data && r.data.error) return r.data.error;
  if (r.status === 413) return 'A imagem da assinatura passou de 2 MB — refaça a assinatura';
  return 'Erro ao emprestar a ferramenta';
}

/** A tela do administrador antecipa as duas recusas do `POST /termos/FERRAMENTA` (mesma regua: o texto aparado). */
export function erroDoNovoTexto(texto, vigente) {
  const t = String(texto ?? '').replace(/\u0000/g, '').trim();
  if (!t) return 'O texto do termo é obrigatório';
  if (t.length > 20000) return 'O texto do termo deve ter no máximo 20000 caracteres';
  if (vigente && String(vigente.texto ?? '').trim() === t) return 'O texto é igual ao da versão vigente';
  return null;
}

/**
 * T4 (conferencia contra a forma real): `evidencia.confirmado_por_matricula` do `GET …/termo` e a FLAG `1` (o colaborador digitou
 * a matricula e ela conferiu com o cadastro — a digitada nao e gravada), nao o texto digitado. A T3 imprimia o campo cru: a tela e o
 * PDF diziam "Matrícula digitada: 1". A matricula que ele digitou e a do cadastro (a fotografia `termo.colaborador.matricula`).
 */
export function matriculaConfirmadaTexto(evidencia, colaborador) {
  const flag = evidencia ? Number(evidencia.confirmado_por_matricula) : NaN;
  if (flag !== 1) return 'Não registrada';
  const m = String(colaborador?.matricula ?? '').trim();
  return m ? `Sim — digitou ${m} (confere com o cadastro)` : 'Sim';
}
