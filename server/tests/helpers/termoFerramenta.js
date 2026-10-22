/**
 * Etapa 180 (I1 da revisao da Fase 2): o emprestimo de ferramenta passou a exigir o colaborador do CADASTRO e o termo assinado
 * (multipart: colaborador_id, confirmacao_matricula, termo_versao, assinatura PNG). Os testes da 9b mandavam JSON so com
 * `colaborador_nome`; este helper preserva a intencao deles: o `colaborador_nome` vira um colaborador ativo do cadastro com esse
 * nome (criado na primeira vez, reusado depois), com matricula, e o resto do empréstimo vai no multipart.
 *
 * Uso: `await emprestarComTermo(app, db, fid, { colaborador_nome: 'Joao' }).expect(201)` (o `.expect` confere o status e devolve a
 * resposta, como o do supertest) ou `const r = await emprestarComTermo(...)` (a resposta, sem conferir).
 * Sobrescritas: `colaborador_id`, `confirmacao_matricula`, `termo_versao`, `semAssinatura`, `assinatura` (Buffer), `chave_idempotencia`.
 */
const assert = require('assert');
const request = require('supertest');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64');

let seq = 0;

/** O colaborador ativo com esse nome (criado com matricula `MT-<n>` e setor, se nao existe). */
async function colaboradorDoCadastro(db, nome, { setor = null } = {}) {
  const ja = await dbGet(db, "SELECT id, matricula FROM colaboradores WHERE nome = ? AND LOWER(status) = 'ativo'", [nome]);
  if (ja) return ja;
  seq += 1;
  const matricula = `MT-${Date.now() % 100000}-${seq}`;
  const r = await dbRun(db, "INSERT INTO colaboradores (nome, matricula, cpf, status, setor) VALUES (?, ?, NULL, 'ativo', ?)",
    [nome, matricula, setor]);
  return { id: r.lastID, matricula };
}

async function versaoVigente(db) {
  const v = await dbGet(db, "SELECT MAX(versao) AS v FROM termos_responsabilidade_versao WHERE tipo = 'FERRAMENTA'");
  return v && v.v != null ? Number(v.v) : 1;
}

function emprestarComTermo(app, db, ferramentaId, campos = {}) {
  const run = async () => {
    const col = campos.colaborador_id !== undefined
      ? { id: campos.colaborador_id, matricula: campos.confirmacao_matricula }
      : await colaboradorDoCadastro(db, campos.colaborador_nome || 'Colaborador Teste', { setor: campos.setor || null });
    const req = request(app).post(`/api/almoxarifado/ferramentas/${ferramentaId}/emprestar`);
    const campo = (k, v) => { if (v !== undefined && v !== null) req.field(k, String(v)); };
    campo('colaborador_id', col.id);
    campo('confirmacao_matricula', campos.confirmacao_matricula !== undefined ? campos.confirmacao_matricula : col.matricula);
    campo('termo_versao', campos.termo_versao !== undefined ? campos.termo_versao : await versaoVigente(db));
    campo('data_prevista_devolucao', campos.data_prevista_devolucao);
    campo('observacoes', campos.observacoes);
    campo('chave_idempotencia', campos.chave_idempotencia);
    if (!campos.semAssinatura) {
      req.attach('assinatura', campos.assinatura || PNG_1PX, { filename: 'assinatura.png', contentType: campos.contentType || 'image/png' });
    }
    return req;
  };
  const p = run();
  return {
    then: (ok, ko) => p.then(ok, ko),
    catch: (ko) => p.catch(ko),
    async expect(status) {
      const r = await p;
      assert.strictEqual(r.status, status, `expected ${status}, got ${r.status}: ${JSON.stringify(r.body)}`);
      return r;
    },
  };
}

module.exports = { emprestarComTermo, colaboradorDoCadastro, versaoVigente, PNG_1PX };
