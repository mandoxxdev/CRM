/**
 * Identificacao do colaborador que assina na tela — a regua comum da entrega de EPI (Etapa 178) e do termo de responsabilidade
 * de ferramenta (Etapa 180). Extraida de `epiService.js` na T1 da 180 (menores da revisao da Fase 2) SEM mudar o comportamento:
 * as mensagens sao as literais da 178, e os testes `epi*.api.test.js` passam sem mudanca de assercao.
 *
 * Plano: docs/superpowers/plans/2026-10-22-almoxarifado-etapa180-termo-de-responsabilidade-de-ferramenta.md
 */
const fs = require('fs');
const { dbGet } = require('./db');
const { textoLimpo } = require('./evidenciaAssinaturaService');

const PNG_ASSINATURA = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const erro = (msg, status = 400) => Object.assign(new Error(msg), { status });

/** RN-178.03: o colaborador do CADASTRO, ativo. Lanca 400 com as literais da 178. */
async function colaboradorAtivo(db, colaboradorId) {
  const id = Number(colaboradorId);
  if (colaboradorId === undefined || colaboradorId === null || String(colaboradorId).trim() === '') {
    throw erro('O colaborador é obrigatório');
  }
  if (!Number.isInteger(id) || id <= 0) throw erro(`Colaborador #${colaboradorId} não encontrado`);
  const c = await dbGet(db, 'SELECT id, nome, matricula, setor, cpf, status FROM colaboradores WHERE id = ?', [id]);
  if (!c) throw erro(`Colaborador #${id} não encontrado`);
  if (String(c.status == null ? '' : c.status).trim().toLowerCase() !== 'ativo') throw erro(`Colaborador ${c.nome} não está ativo`);
  return c;
}

/**
 * Fase 5 da 178 (importante 4): o colaborador digita a PROPRIA matricula no tablet, junto da assinatura, e ela tem de bater com o
 * cadastro. Compara sem caixa, sem as pontas e sem espacos internos; zeros a esquerda contam. Sem matricula no cadastro, recusa
 * (nao ha como confirmar a identidade). `acao` so muda a frase do "digite" (a entrega diz "recebimento"; o termo, "o termo").
 */
function conferirMatricula(colab, digitada, { acao = 'confirmar o recebimento' } = {}) {
  const norm = (v) => String(v).replace(/\s+/g, '').toUpperCase();
  const cadastro = textoLimpo(colab.matricula);
  if (!cadastro) {
    throw erro(`Colaborador ${colab.nome} sem matrícula cadastrada — não é possível confirmar a identidade`);
  }
  const conf = textoLimpo(digitada);
  if (!conf) throw erro(`O colaborador deve digitar a própria matrícula para ${acao}`);
  if (norm(conf) !== norm(cadastro)) throw erro('A matrícula informada não confere com a do colaborador');
}

/** I5 da 178: o PNG de verdade — a assinatura do arquivo (o MIME o multer ja filtrou). */
function conferirPng(caminho) {
  let cabeca = Buffer.alloc(0);
  try {
    const fd = fs.openSync(caminho, 'r');
    try {
      cabeca = Buffer.alloc(8);
      const lidos = fs.readSync(fd, cabeca, 0, 8, 0);
      cabeca = cabeca.subarray(0, lidos);
    } finally { fs.closeSync(fd); }
  } catch (e) { /* arquivo ilegivel = nao e PNG */ }
  if (!cabeca.equals(PNG_ASSINATURA)) throw erro('A assinatura deve ser uma imagem PNG');
}

/** Fase 5 da 178 (M2): a chave de idempotencia (uuid do front) — opcional; fora do formato, 400. */
function chaveIdempotencia(v) {
  const c = textoLimpo(v);
  if (c === null) return null;
  if (!/^[A-Za-z0-9-]{8,100}$/.test(c)) throw erro('Chave de idempotência inválida');
  return c;
}

module.exports = { colaboradorAtivo, conferirMatricula, conferirPng, chaveIdempotencia, PNG_ASSINATURA };
