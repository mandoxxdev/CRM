/**
 * Frota Etapa 5 — T1: foto da avaria e do cupom (anexos do registro e do abastecimento).
 *
 *   RN-F5.01  ate 3 fotos por lancamento; o teto vale no mesmo comando que grava (envios simultaneos nao passam de 3)
 *   RN-F5.02  so JPEG/PNG/WEBP ate 10 MB, pelo MIME declarado E pelos primeiros bytes; extensao do MIME, nome aleatorio
 *   RN-F5.03  envia quem tem registrar_operacoes; o motorista so no lancamento dele; Consulta 403
 *   RN-F5.04  recusa nao deixa arquivo no disco
 *   RN-F5.05  listas e meus-registros trazem `anexos` com URL assinada, no escopo das listas
 *   RN-F5.06  o arquivo so sai com assinatura valida do dominio proprio; qualquer falha 404; nosniff + CSP sandbox
 *   RN-F5.07  apagar foto: mesma regua de quem envia; apaga linha e arquivo
 *   RN-F5.08  excluir registro/abastecimento apaga as fotos (linhas e arquivos)
 *
 * Plano: docs/superpowers/plans/2026-10-23-frotas-etapa5-fotos.md
 * Executar: cd server && node tests/api/frotasAnexos.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createFrotasTestApp, ADMIN, MOTORISTA, CONSULTA, MOTORISTA2 } = require('../helpers/frotasTestApp');
const { dbAll, dbRun } = require('../../services/frotas/db');

let passed = 0; let failed = 0;
const testes = [];
function test(name, fn) { testes.push([name, fn]); }

const MSG_SO_OS_SEUS = 'Você só pode alterar os seus próprios registros';
const SEM_VINCULO = { id: 99, nome: 'Sem Vinculo', role: 'usuario' };

const preencher = (cabeca, n = 64) => Buffer.concat([cabeca, Buffer.alloc(n, 7)]);
const JPEG = preencher(Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]));
const PNG = preencher(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]));
const WEBP = preencher(Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x40, 0, 0, 0]), Buffer.from('WEBPVP8 ')]));
const GIF = preencher(Buffer.from('GIF89a'));
const HTML = Buffer.from('<html><script>alert(1)</script></html>');

/** POST multipart no /anexos como `usuario`. `arquivos`: [[campo, buffer, nome, tipo]]. */
function enviar(ctx, usuario, campos, arquivos) {
  let r = ctx.como(usuario)('post', '/api/frotas/anexos');
  for (const [k, v] of Object.entries(campos || {})) r = r.field(k, String(v));
  for (const [campo, buf, nome, tipo] of arquivos || []) r = r.attach(campo, buf, { filename: nome, contentType: tipo });
  return r;
}
const foto = (ctx, usuario, entidade, id, buf = JPEG, nome = 'foto.jpg', tipo = 'image/jpeg') => enviar(ctx, usuario,
  { entidade, entidade_id: id }, [['foto', buf, nome, tipo]]);
const arquivosNaPasta = (ctx) => (fs.existsSync(ctx.uploadsDir) ? fs.readdirSync(ctx.uploadsDir).sort() : []);

function binario(res, cb) {
  res.setEncoding('binary');
  let d = '';
  res.on('data', (c) => { d += c; });
  res.on('end', () => cb(null, Buffer.from(d, 'binary')));
}
const baixar = (ctx, url) => ctx.como(null)('get', url).buffer(true).parse(binario);

/** Gestor + veiculo + Ana (MOTORISTA, usuario 2) e Bruno (MOTORISTA2, usuario 4) ligados; um registro e um abastecimento de cada. */
async function montar() {
  const ctx = await createFrotasTestApp();
  const gestor = ctx.como(ADMIN);
  const car = (await gestor('post', '/api/frotas/veiculos', { placa: 'CAR0001', km_atual: 1000 })).body;
  const ana = (await gestor('post', '/api/frotas/motoristas', { nome: 'Ana', usuario_id: 2 })).body;
  const bruno = (await gestor('post', '/api/frotas/motoristas', { nome: 'Bruno', usuario_id: 4 })).body;
  const itens = Object.fromEntries((await gestor('get', '/api/frotas/portal/inicio')).body.itens.map((i) => [i.chave, 'OK']));
  const insp = async (quem, km) => {
    const r = await ctx.como(quem)('post', '/api/frotas/portal/registros', {
      tipo: 'inspecao', veiculo_id: car.id, km, itens, avarias: [{ vista: 'lateral_esquerda', tipo: 'A' }],
    });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    return r.body.registro;
  };
  const abast = async (quem, km) => {
    const r = await ctx.como(quem)('post', '/api/frotas/portal/abastecimentos', { veiculo_id: car.id, km, litros: 40 });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    return r.body;
  };
  const regAna = await insp(MOTORISTA, 1100);
  const regBruno = await insp(MOTORISTA2, 1200);
  const abAna = await abast(MOTORISTA, 1300);
  const abBruno = await abast(MOTORISTA2, 1400);
  return { ctx, gestor, car, ana, bruno, regAna, regBruno, abAna, abBruno };
}

// ── RN-F5.03 / RN-F5.02 — quem envia, o que fica no disco ─────────────────────

test('RN-F5.03 a motorista envia a foto do proprio registro: 201, arquivo com nome aleatorio e extensao do MIME', async () => {
  const { ctx, regAna } = await montar();
  const r = await foto(ctx, MOTORISTA, 'registro', regAna.id, JPEG, 'avaria.html', 'image/jpeg');
  assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  assert.strictEqual(r.body.entidade, 'registro');
  assert.strictEqual(r.body.entidade_id, regAna.id);
  assert.strictEqual(r.body.tipo_mime, 'image/jpeg');
  assert.strictEqual(r.body.tamanho, JPEG.length);
  assert.ok(r.body.id > 0 && r.body.created_at, 'id e created_at');
  assert.match(r.body.url, /^\/api\/uploads\/frotas-anexos\/frota-[0-9a-f]{24}\.jpg\?exp=\d+&sig=[0-9a-f]{32}$/, r.body.url);
  const nome = r.body.url.split('/').pop().split('?')[0];
  assert.deepStrictEqual(arquivosNaPasta(ctx), [nome], 'o arquivo esta na pasta, com a extensao do MIME e nao a do nome');
  const [linha] = await dbAll(ctx.db, 'SELECT * FROM frotas_anexos');
  assert.strictEqual(linha.arquivo, nome);
  assert.strictEqual(linha.usuario_id, 2);
});

test('RN-F5.03 gestor envia em qualquer lancamento; Bruno no da Ana 403; Consulta 403; sem vinculo 409', async () => {
  const { ctx, regAna, abAna } = await montar();
  assert.strictEqual((await foto(ctx, ADMIN, 'registro', regAna.id)).status, 201, 'gestor no registro da Ana');
  assert.strictEqual((await foto(ctx, ADMIN, 'abastecimento', abAna.id)).status, 201, 'gestor no abastecimento da Ana');
  const outro = await foto(ctx, MOTORISTA2, 'registro', regAna.id);
  assert.strictEqual(outro.status, 403);
  assert.strictEqual(outro.body.error, MSG_SO_OS_SEUS);
  const outroAb = await foto(ctx, MOTORISTA2, 'abastecimento', abAna.id);
  assert.strictEqual(outroAb.status, 403);
  assert.strictEqual(outroAb.body.error, MSG_SO_OS_SEUS);
  const consulta = await foto(ctx, CONSULTA, 'registro', regAna.id);
  assert.strictEqual(consulta.status, 403);
  assert.strictEqual(consulta.body.error, 'Sem permissão para esta operação');
  const sem = await foto(ctx, SEM_VINCULO, 'registro', regAna.id);
  assert.strictEqual(sem.status, 409);
  assert.strictEqual(sem.body.code, 'MOTORISTA_NAO_VINCULADO');
});

test('RN-F5.03 lancamento sem motorista (gestor lancou sem escolher): so o gestor anexa', async () => {
  const { ctx, gestor, car } = await montar();
  const ab = (await gestor('post', '/api/frotas/abastecimentos', { veiculo_id: car.id, data_abastecimento: '2026-10-01', litros: 10 })).body;
  assert.strictEqual(ab.motorista_id, null);
  const ana = await foto(ctx, MOTORISTA, 'abastecimento', ab.id);
  assert.strictEqual(ana.status, 403);
  assert.strictEqual(ana.body.error, MSG_SO_OS_SEUS);
  assert.strictEqual((await foto(ctx, ADMIN, 'abastecimento', ab.id)).status, 201);
});

test('RN-F5.02 tipo: GIF e HTML com cara de PNG -> 400; PNG e WEBP gravam .png/.webp; JPEG declarado PNG -> 400', async () => {
  const { ctx, regAna } = await montar();
  const casos = [
    [GIF, 'a.gif', 'image/gif', 400],
    [HTML, 'a.png', 'image/png', 400],
    [JPEG, 'a.png', 'image/png', 400],
    [PNG, 'a.txt', 'text/plain', 400],
    [Buffer.from('ab'), 'a.jpg', 'image/jpeg', 400],
  ];
  for (const [buf, nome, tipo, st] of casos) {
    const r = await foto(ctx, MOTORISTA, 'registro', regAna.id, buf, nome, tipo);
    assert.strictEqual(r.status, st, `${nome} ${tipo}`);
    assert.strictEqual(r.body.error, 'Formato de imagem não suportado', `${nome} ${tipo}`);
  }
  const png = await foto(ctx, MOTORISTA, 'registro', regAna.id, PNG, 'a.png', 'image/png');
  assert.strictEqual(png.status, 201);
  assert.match(png.body.url, /\.png\?/);
  const webp = await foto(ctx, MOTORISTA, 'registro', regAna.id, WEBP, 'a.webp', 'image/webp');
  assert.strictEqual(webp.status, 201);
  assert.match(webp.body.url, /\.webp\?/);
  assert.strictEqual(arquivosNaPasta(ctx).length, 2, 'so os dois aceitos ficaram no disco');
});

test('RN-F5.02 tamanho e forma do envio: 10 MB + 1 -> 413; dois arquivos / campo errado -> 400; sem arquivo -> 400', async () => {
  const { ctx, regAna } = await montar();
  const grande = preencher(Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), 10 * 1024 * 1024);
  const g = await foto(ctx, MOTORISTA, 'registro', regAna.id, grande);
  assert.strictEqual(g.status, 413);
  assert.strictEqual(g.body.error, 'Arquivo grande demais (máximo 10 MB)');
  // medido: o busboy dispara o limite ao ATINGIR o fileSize (multipart.js: `fileSize === fileSizeLimit`) — 10 MB exatos ja e 413; um
  // byte a menos passa. E assim em todo multer do sistema.
  const exato = await foto(ctx, MOTORISTA, 'registro', regAna.id, preencher(Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), 10 * 1024 * 1024 - 5));
  assert.strictEqual(exato.status, 201, '10 MB menos 1 byte passa');
  const dois = await enviar(ctx, MOTORISTA, { entidade: 'registro', entidade_id: regAna.id },
    [['foto', JPEG, 'a.jpg', 'image/jpeg'], ['foto', JPEG, 'b.jpg', 'image/jpeg']]);
  assert.strictEqual(dois.status, 400);
  assert.strictEqual(dois.body.error, 'Envie uma foto por vez');
  const campo = await enviar(ctx, MOTORISTA, { entidade: 'registro', entidade_id: regAna.id }, [['arquivo', JPEG, 'a.jpg', 'image/jpeg']]);
  assert.strictEqual(campo.status, 400);
  assert.strictEqual(campo.body.error, 'Envie uma foto por vez');
  const nada = await enviar(ctx, MOTORISTA, { entidade: 'registro', entidade_id: regAna.id }, []);
  assert.strictEqual(nada.status, 400);
  assert.strictEqual(nada.body.error, 'Nenhuma foto enviada');
  assert.strictEqual(arquivosNaPasta(ctx).length, 1, 'so o de 10 MB menos 1 byte ficou');
});

test('RN-F5.03 validacao do lancamento: tipo, id e inexistente, com as mensagens literais', async () => {
  const { ctx } = await montar();
  const casos = [
    [{ entidade: 'multa', entidade_id: 1 }, 400, 'Tipo de lançamento inválido'],
    [{ entidade_id: 1 }, 400, 'Tipo de lançamento inválido'],
    [{ entidade: 'registro', entidade_id: 'abc' }, 400, 'Lançamento inválido'],
    [{ entidade: 'registro', entidade_id: '0' }, 400, 'Lançamento inválido'],
    [{ entidade: 'registro', entidade_id: '1.5' }, 400, 'Lançamento inválido'],
    [{ entidade: 'registro' }, 400, 'Lançamento inválido'],
    [{ entidade: 'registro', entidade_id: 999 }, 404, 'Registro não encontrado'],
    [{ entidade: 'abastecimento', entidade_id: 999 }, 404, 'Abastecimento não encontrado'],
  ];
  for (const [campos, st, msg] of casos) {
    const r = await enviar(ctx, MOTORISTA, campos, [['foto', JPEG, 'a.jpg', 'image/jpeg']]);
    assert.strictEqual(r.status, st, JSON.stringify(campos));
    assert.strictEqual(r.body.error, msg, JSON.stringify(campos));
  }
});

test('RN-F5.04 nenhuma recusa deixa arquivo na pasta', async () => {
  const { ctx, regAna, abAna } = await montar();
  const recusas = [
    () => foto(ctx, CONSULTA, 'registro', regAna.id),
    () => foto(ctx, MOTORISTA2, 'registro', regAna.id),
    () => foto(ctx, SEM_VINCULO, 'registro', regAna.id),
    () => foto(ctx, MOTORISTA, 'registro', 999),
    () => foto(ctx, MOTORISTA, 'multa', regAna.id),
    () => foto(ctx, MOTORISTA, 'registro', 'x'),
    () => foto(ctx, MOTORISTA, 'registro', regAna.id, HTML, 'a.png', 'image/png'),
    () => foto(ctx, MOTORISTA, 'registro', regAna.id, GIF, 'a.gif', 'image/gif'),
    () => foto(ctx, MOTORISTA, 'registro', regAna.id, preencher(JPEG, 10 * 1024 * 1024)),
    () => enviar(ctx, MOTORISTA, { entidade: 'registro', entidade_id: regAna.id },
      [['foto', JPEG, 'a.jpg', 'image/jpeg'], ['foto', JPEG, 'b.jpg', 'image/jpeg']]),
  ];
  for (const [i, f] of recusas.entries()) {
    const r = await f();
    assert.ok(r.status >= 400, `recusa ${i}: ${r.status}`);
    assert.deepStrictEqual(arquivosNaPasta(ctx), [], `recusa ${i} (${r.status} ${JSON.stringify(r.body)}) deixou arquivo`);
  }
  // o teto (409) tambem limpa
  for (let i = 0; i < 3; i++) assert.strictEqual((await foto(ctx, MOTORISTA, 'abastecimento', abAna.id)).status, 201);
  const antes = arquivosNaPasta(ctx);
  const quarta = await foto(ctx, MOTORISTA, 'abastecimento', abAna.id);
  assert.strictEqual(quarta.status, 409);
  assert.deepStrictEqual(arquivosNaPasta(ctx), antes, 'o 409 do teto nao deixou arquivo');
});

// ── RN-F5.01 — teto ──────────────────────────────────────────────────────────

test('RN-F5.01 ate 3 fotos por lancamento; a quarta -> 409 LIMITE_DE_FOTOS; o teto e por lancamento', async () => {
  const { ctx, regAna, abAna } = await montar();
  for (let i = 0; i < 3; i++) assert.strictEqual((await foto(ctx, MOTORISTA, 'registro', regAna.id)).status, 201, `foto ${i + 1}`);
  const quarta = await foto(ctx, ADMIN, 'registro', regAna.id);
  assert.strictEqual(quarta.status, 409);
  assert.strictEqual(quarta.body.error, 'Este lançamento já tem 3 fotos');
  assert.strictEqual(quarta.body.code, 'LIMITE_DE_FOTOS');
  // o abastecimento da Ana (outra entidade) e o registro de id igual nao contam juntos
  assert.strictEqual((await foto(ctx, MOTORISTA, 'abastecimento', abAna.id)).status, 201);
});

test('RN-F5.01 quatro envios simultaneos no mesmo registro: tres 201 e um 409', async () => {
  const { ctx, regAna } = await montar();
  const rs = await Promise.all([1, 2, 3, 4].map(() => foto(ctx, MOTORISTA, 'registro', regAna.id)));
  const st = rs.map((r) => r.status).sort();
  assert.deepStrictEqual(st, [201, 201, 201, 409], JSON.stringify(st));
  const [{ n }] = await dbAll(ctx.db, "SELECT COUNT(*) AS n FROM frotas_anexos WHERE entidade = 'registro' AND entidade_id = ?", [regAna.id]);
  assert.strictEqual(n, 3);
  assert.strictEqual(arquivosNaPasta(ctx).length, 3);
});

// ── RN-F5.06 — servir o arquivo ──────────────────────────────────────────────

test('RN-F5.06 a URL assinada devolve os mesmos bytes com nosniff e CSP sandbox; qualquer adulteracao -> 404', async () => {
  const { ctx, regAna } = await montar();
  const r = await foto(ctx, MOTORISTA, 'registro', regAna.id, PNG, 'a.png', 'image/png');
  const ok = await baixar(ctx, r.body.url);
  assert.strictEqual(ok.status, 200);
  assert.ok(Buffer.compare(ok.body, PNG) === 0, 'mesmos bytes');
  assert.strictEqual(ok.headers['x-content-type-options'], 'nosniff');
  assert.strictEqual(ok.headers['content-security-policy'], "default-src 'none'; sandbox");
  assert.match(ok.headers['content-type'], /^image\/png/);

  const [base, qs] = r.body.url.split('?');
  const nome = base.split('/').pop();
  const params = new URLSearchParams(qs);
  const sig = params.get('sig');
  const exp = params.get('exp');
  const outraSig = (sig[0] === 'a' ? 'b' : 'a') + sig.slice(1);
  const { criarAssinadoresCrm } = require('../../services/uploadsAssinadosCrm');
  const { derivarSegredoUpload } = require('../../services/almoxarifado/urlUpload');
  const crypto = require('crypto');
  // assinatura CORRETA do dominio frotas-anexos, mas vencida
  const vencido = Math.floor(Date.now() / 1000) - 10;
  const sigVencida = crypto.createHmac('sha256', derivarSegredoUpload(ctx.segredoUpload, 'frotas-anexos-v1'))
    .update(`${nome}:${vencido}`).digest('hex').slice(0, 32);
  // assinatura do mesmo nome e do MESMO exp em outro dominio (avatares), com o mesmo segredo raiz — so o dominio difere (a URL
  // de avatar inteira cairia antes, no teto de validade, e nao provaria o dominio)
  const sigAvatar = crypto.createHmac('sha256', derivarSegredoUpload(ctx.segredoUpload, 'avatares-v1'))
    .update(`${nome}:${exp}`).digest('hex').slice(0, 32);
  const qsAvatar = `exp=${exp}&sig=${sigAvatar}`;
  assert.ok(criarAssinadoresCrm(ctx.segredoUpload).fotoSrcAvatar(nome), 'o assinador de avatar existe com o mesmo segredo');
  const ruins = [
    base,
    `${base}?exp=${exp}`,
    `${base}?exp=${exp}&sig=${outraSig}`,
    `${base.replace(nome, `x${nome}`)}?${qs}`,
    `${base}?exp=${vencido}&sig=${sigVencida}`,
    `${base}?${qsAvatar}`,
    `/api/uploads/frotas-anexos/..%2F..%2Fdatabase.sqlite?${qs}`,
    `/api/uploads/frotas-anexos/?${qs}`,
  ];
  for (const u of ruins) {
    const x = await baixar(ctx, u);
    assert.strictEqual(x.status, 404, u);
    assert.ok(!x.body || x.body.length === 0 || Buffer.compare(x.body, PNG) !== 0, `${u} vazou a foto`);
  }
  // controle: a assinatura vencida e montada certo (com exp no futuro ela abre)
  const futuro = Number(exp);
  const sigFutura = crypto.createHmac('sha256', derivarSegredoUpload(ctx.segredoUpload, 'frotas-anexos-v1'))
    .update(`${nome}:${futuro}`).digest('hex').slice(0, 32);
  assert.strictEqual((await baixar(ctx, `${base}?exp=${futuro}&sig=${sigFutura}`)).status, 200, 'controle da assinatura manual');
});

test('RN-F5.06 assinatura valida de um nome que nao existe -> 404 (o fecho depois do static)', async () => {
  const { ctx } = await montar();
  const { criarAssinadorUpload } = require('../../services/almoxarifado/urlUpload');
  const { PASTAS } = require('../../services/uploadsAssinadosCrm');
  const url = criarAssinadorUpload(ctx.segredoUpload, PASTAS.frotasAnexos).assinar('frota-000000000000000000000000.jpg');
  assert.strictEqual((await baixar(ctx, url)).status, 404);
});

// ── RN-F5.05 — leitura no escopo ─────────────────────────────────────────────

test('RN-F5.05 listas: gestor e Consulta veem as fotos de todos; a motorista so as dela; linha sem foto traz []', async () => {
  const { ctx, regAna, regBruno, abAna } = await montar();
  const f1 = (await foto(ctx, MOTORISTA, 'registro', regAna.id)).body;
  const f2 = (await foto(ctx, MOTORISTA2, 'registro', regBruno.id, PNG, 'b.png', 'image/png')).body;
  const f3 = (await foto(ctx, MOTORISTA, 'abastecimento', abAna.id)).body;

  for (const quem of [ADMIN, CONSULTA]) {
    const chk = (await ctx.como(quem)('get', '/api/frotas/checklists')).body;
    assert.deepStrictEqual(chk.find((c) => c.id === regAna.id).anexos.map((a) => a.id), [f1.id]);
    assert.deepStrictEqual(chk.find((c) => c.id === regBruno.id).anexos.map((a) => a.id), [f2.id]);
    const ab = (await ctx.como(quem)('get', '/api/frotas/abastecimentos')).body;
    assert.deepStrictEqual(ab.find((a) => a.id === abAna.id).anexos.map((a) => a.id), [f3.id]);
    assert.ok(ab.every((a) => Array.isArray(a.anexos)), 'toda linha tem anexos');
    const semFoto = ab.filter((a) => a.id !== abAna.id);
    assert.ok(semFoto.length > 0 && semFoto.every((a) => Array.isArray(a.anexos) && a.anexos.length === 0), 'sem foto -> []');
    const item = chk.find((c) => c.id === regAna.id).anexos[0];
    assert.deepStrictEqual(Object.keys(item).sort(), ['created_at', 'id', 'tamanho', 'tipo_mime', 'url']);
    assert.strictEqual((await baixar(ctx, item.url)).status, 200, 'URL da lista abre');
  }
  const daAna = (await ctx.como(MOTORISTA)('get', '/api/frotas/checklists')).body;
  assert.deepStrictEqual(daAna.map((c) => c.id), [regAna.id]);
  const doBruno = JSON.stringify((await ctx.como(MOTORISTA2)('get', '/api/frotas/checklists')).body)
    + JSON.stringify((await ctx.como(MOTORISTA2)('get', '/api/frotas/abastecimentos')).body)
    + JSON.stringify((await ctx.como(MOTORISTA2)('get', '/api/frotas/portal/meus-registros')).body);
  const nomeDe = (f) => f.url.split('/').pop().split('?')[0];
  assert.ok(!doBruno.includes(nomeDe(f1)) && !doBruno.includes(nomeDe(f3)), 'Bruno nao recebe URL das fotos da Ana');
  assert.ok(doBruno.includes(nomeDe(f2)), 'Bruno recebe a dele (metade positiva)');

  const meus = (await ctx.como(MOTORISTA)('get', '/api/frotas/portal/meus-registros')).body;
  assert.deepStrictEqual(meus.registros.find((r) => r.id === regAna.id).anexos.map((a) => a.id), [f1.id]);
  assert.deepStrictEqual(meus.abastecimentos.find((a) => a.id === abAna.id).anexos.map((a) => a.id), [f3.id]);
  const semVinculo = (await ctx.como(SEM_VINCULO)('get', '/api/frotas/portal/meus-registros')).body;
  assert.deepStrictEqual(semVinculo, { registros: [], abastecimentos: [] });
});

test('RN-F5.05 as fotos saem na ordem em que foram enviadas', async () => {
  const { ctx, regAna } = await montar();
  const ids = [];
  for (let i = 0; i < 3; i++) ids.push((await foto(ctx, MOTORISTA, 'registro', regAna.id)).body.id);
  const chk = (await ctx.como(ADMIN)('get', '/api/frotas/checklists')).body;
  assert.deepStrictEqual(chk.find((c) => c.id === regAna.id).anexos.map((a) => a.id), ids);
});

// ── RN-F5.07 — apagar a foto ─────────────────────────────────────────────────

test('RN-F5.07 apagar: Bruno 403, Consulta 403, inexistente 404; a Ana apaga a dela e o arquivo e a URL somem', async () => {
  const { ctx, regAna } = await montar();
  const f = (await foto(ctx, MOTORISTA, 'registro', regAna.id)).body;
  const b = await ctx.como(MOTORISTA2)('delete', `/api/frotas/anexos/${f.id}`);
  assert.strictEqual(b.status, 403);
  assert.strictEqual(b.body.error, MSG_SO_OS_SEUS);
  const c = await ctx.como(CONSULTA)('delete', `/api/frotas/anexos/${f.id}`);
  assert.strictEqual(c.status, 403);
  assert.strictEqual(c.body.error, 'Sem permissão para esta operação');
  for (const id of ['999', 'abc']) {
    const n = await ctx.como(MOTORISTA)('delete', `/api/frotas/anexos/${id}`);
    assert.strictEqual(n.status, 404, id);
    assert.strictEqual(n.body.error, 'Foto não encontrada', id);
  }
  assert.strictEqual(arquivosNaPasta(ctx).length, 1, 'as recusas nao apagaram');
  const ok = await ctx.como(MOTORISTA)('delete', `/api/frotas/anexos/${f.id}`);
  assert.strictEqual(ok.status, 200);
  assert.deepStrictEqual(ok.body, { success: true });
  assert.deepStrictEqual(arquivosNaPasta(ctx), []);
  assert.strictEqual((await dbAll(ctx.db, 'SELECT * FROM frotas_anexos')).length, 0);
  assert.strictEqual((await baixar(ctx, f.url)).status, 404, 'a URL velha morre');
  const gestor = (await foto(ctx, MOTORISTA, 'registro', regAna.id)).body;
  assert.strictEqual((await ctx.como(ADMIN)('delete', `/api/frotas/anexos/${gestor.id}`)).status, 200, 'o gestor apaga a de qualquer um');
});

// ── RN-F5.08 — excluir o lancamento ──────────────────────────────────────────

test('RN-F5.08 o gestor exclui o registro e o abastecimento: as fotos (linhas e arquivos) vao junto; as dos outros ficam', async () => {
  const { ctx, gestor, regAna, regBruno, abAna } = await montar();
  const f1 = (await foto(ctx, MOTORISTA, 'registro', regAna.id)).body;
  await foto(ctx, MOTORISTA, 'registro', regAna.id);
  const f2 = (await foto(ctx, MOTORISTA2, 'registro', regBruno.id)).body;
  await foto(ctx, MOTORISTA, 'abastecimento', abAna.id);
  assert.strictEqual(arquivosNaPasta(ctx).length, 4);
  assert.strictEqual((await gestor('delete', `/api/frotas/checklists/${regAna.id}`)).status, 200);
  assert.strictEqual((await gestor('delete', `/api/frotas/abastecimentos/${abAna.id}`)).status, 200);
  const sobra = await dbAll(ctx.db, 'SELECT entidade, entidade_id FROM frotas_anexos');
  assert.deepStrictEqual(sobra, [{ entidade: 'registro', entidade_id: regBruno.id }]);
  assert.deepStrictEqual(arquivosNaPasta(ctx), [f2.url.split('/').pop().split('?')[0]]);
  assert.strictEqual((await baixar(ctx, f1.url)).status, 404);
});

test('RN-F5.08 foto de lancamento que sumiu por fora: so o gestor apaga (o motorista 403)', async () => {
  const { ctx, regAna } = await montar();
  const f = (await foto(ctx, MOTORISTA, 'registro', regAna.id)).body;
  await dbRun(ctx.db, 'DELETE FROM frotas_checklists WHERE id = ?', [regAna.id]);
  const m = await ctx.como(MOTORISTA)('delete', `/api/frotas/anexos/${f.id}`);
  assert.strictEqual(m.status, 403);
  assert.strictEqual(m.body.error, MSG_SO_OS_SEUS);
  assert.strictEqual((await ctx.como(ADMIN)('delete', `/api/frotas/anexos/${f.id}`)).status, 200);
});

test('RN-F5.08 (Fase 2, T-1) exclusao e envios em paralelo: nenhuma linha nem arquivo orfao', async () => {
  for (let rodada = 0; rodada < 5; rodada++) {
    const { ctx, gestor, regAna } = await montar();
    await foto(ctx, MOTORISTA, 'registro', regAna.id);
    const rs = await Promise.all([
      foto(ctx, MOTORISTA, 'registro', regAna.id),
      gestor('delete', `/api/frotas/checklists/${regAna.id}`),
      foto(ctx, MOTORISTA, 'registro', regAna.id),
      foto(ctx, ADMIN, 'registro', regAna.id),
    ]);
    assert.strictEqual(rs[1].status, 200);
    for (const r of [rs[0], rs[2], rs[3]]) assert.ok([201, 404].includes(r.status), `${r.status} ${JSON.stringify(r.body)}`);
    const linhas = await dbAll(ctx.db, 'SELECT arquivo FROM frotas_anexos');
    assert.deepStrictEqual(linhas, [], `rodada ${rodada}: linha orfa`);
    assert.deepStrictEqual(arquivosNaPasta(ctx), [], `rodada ${rodada}: arquivo orfao`);
  }
});

test('RN-F5.03 (Fase 2, 9) o gestor troca o motorista entre a conferencia e a gravacao -> 403, sem linha nem arquivo', async () => {
  const { ctx, abAna, bruno } = await montar();
  const frotasService = require('../../services/frotas/frotasService');
  const original = frotasService.escopoDoUsuario;
  frotasService.escopoDoUsuario = async (db, user) => {
    const esc = await original(db, user);
    // depois da conferencia (que ja leu a linha da Ana), o gestor passa o abastecimento para o Bruno
    await dbRun(ctx.db, 'UPDATE frotas_abastecimentos SET motorista_id = ? WHERE id = ?', [bruno.id, abAna.id]);
    return esc;
  };
  let r;
  try { r = await foto(ctx, MOTORISTA, 'abastecimento', abAna.id); } finally { frotasService.escopoDoUsuario = original; }
  assert.strictEqual(r.status, 403, JSON.stringify(r.body));
  assert.strictEqual(r.body.error, MSG_SO_OS_SEUS);
  assert.strictEqual((await dbAll(ctx.db, 'SELECT * FROM frotas_anexos')).length, 0);
  assert.deepStrictEqual(arquivosNaPasta(ctx), []);
});

// ── Injecao ──────────────────────────────────────────────────────────────────

test('DI: o registrador sem pasta ou sem segredo lanca (nao sobe sem foto em silencio)', async () => {
  const express = require('express');
  const registrar = require('../../routes/frotas');
  const noop = () => (req, res, next) => next();
  const sqlite3 = require('sqlite3');
  const db = new sqlite3.Database(':memory:');
  assert.throws(() => registrar(express(), db, noop(), noop), /dataDir/);
  assert.throws(() => registrar(express(), db, noop(), noop, { dataDir: path.join(require('os').tmpdir(), 'x') }), /segredoUpload/);
  db.close();
});

(async () => {
  console.log('\nFrota Etapa 5 — T1 (fotos do registro e do abastecimento)\n');
  for (const [name, fn] of testes) {
    try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}: ${e.stack || e.message}`); }
  }
  console.log(`\nResultado: ${passed} passou, ${failed} falhou\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
