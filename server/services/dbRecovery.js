/**
 * SQLite startup recovery: backup WAL artifacts, integrity check, checkpoint.
 * Mitigates OneDrive sync + hard-refresh burst corruption risk.
 */

const fs = require('fs');
const path = require('path');

function fileSizeIfExists(filePath) {
  try {
    if (fs.existsSync(filePath)) return fs.statSync(filePath).size;
  } catch {
    /* ignore */
  }
  return 0;
}

function promisifyDb(db, method, sql, params = []) {
  return new Promise((resolve, reject) => {
    if (method === 'get') {
      db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
    } else if (method === 'run') {
      db.run(sql, params, function onRun(err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    } else {
      reject(new Error(`Unsupported method: ${method}`));
    }
  });
}

function backupDatabaseFiles(dbPath) {
  const dir = path.dirname(dbPath);
  const backupDir = path.join(dir, 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const copied = [];

  for (const suffix of ['', '-wal', '-shm']) {
    const src = dbPath + suffix;
    if (!fs.existsSync(src)) continue;
    // O `.sqlite` vem ANTES do sufixo: o SQLite pareia `F` com `F-wal`/`F-shm`, então o
    // acompanhante de `database-X.sqlite` tem de ser `database-X.sqlite-wal`. Nomeando
    // `database-X-wal` (o que esta linha fazia) o acompanhante virava órfão: o backup não
    // enxergava o WAL e restaurava SEM as transações que só existiam nele.
    const dest = path.join(backupDir, `database-${stamp}.sqlite${suffix}`);
    fs.copyFileSync(src, dest);
    copied.push(dest);
  }

  if (copied.length) {
    console.log(`[DB Recovery] Backup criado (${copied.length} arquivo(s)) em server/data/backups/`);
  }
  return copied;
}

async function runIntegrityCheck(db) {
  const row = await promisifyDb(db, 'get', 'PRAGMA integrity_check');
  const value = row?.integrity_check ?? row;
  const ok = String(value).toLowerCase() === 'ok';
  return { ok, result: value };
}

async function checkpointWal(db) {
  await promisifyDb(db, 'run', 'PRAGMA wal_checkpoint(TRUNCATE)');
}

/**
 * Run before migrations / heavy traffic. Returns integrity result.
 */
async function prepareDatabaseOnStartup(db, dbPath) {
  const walBefore = fileSizeIfExists(dbPath + '-wal');
  if (walBefore > 1024 * 1024) {
    console.warn(`[DB Recovery] WAL grande (${Math.round(walBefore / 1024)} KB) — checkpoint antes de migrations`);
  }

  backupDatabaseFiles(dbPath);

  const integrity = await runIntegrityCheck(db);
  if (!integrity.ok) {
    console.error('[DB Recovery] FALHA integrity_check:', integrity.result);
    console.error('[DB Recovery] Restaure a partir de server/data/backups/ mais recente');
    throw new Error(`Database integrity check failed: ${integrity.result}`);
  }

  try {
    await checkpointWal(db);
    const walAfter = fileSizeIfExists(dbPath + '-wal');
    console.log(`[DB Recovery] integrity OK | WAL ${walBefore} → ${walAfter} bytes`);
  } catch (err) {
    console.warn('[DB Recovery] WAL checkpoint falhou (não fatal):', err.message);
  }

  return integrity;
}

const MANTER_DIAS_PADRAO = 30;
const PISO_COPIAS_PADRAO = 3;
const TETO_COPIAS_PADRAO = 10;

const ehCopiaDeBackup = (nome) => /^database-.+\.sqlite$/.test(nome);
const ehAcompanhante = (nome) => /^database-.+-(wal|shm)$/.test(nome);

/**
 * Os DOIS nomes possíveis do `.sqlite` a que um acompanhante pertence.
 *
 * Formato novo (pós-Etapa 21): `database-X.sqlite-wal` → `database-X.sqlite`.
 * Formato ANTIGO (o passivo): `database-X-wal`         → `database-X` + `.sqlite`.
 * 130 dos 132 órfãos reais estão no formato antigo; reconhecer só o novo limparia 2 arquivos.
 */
function copiasCandidatas(nomeAcompanhante) {
  const semSufixo = nomeAcompanhante.slice(0, -4);   // tira -wal / -shm
  return [semSufixo, `${semSufixo}.sqlite`];
}

/** Todos os acompanhantes que uma cópia pode ter, nos dois formatos de nome. */
function acompanhantesDaCopia(nomeCopia) {
  const base = nomeCopia.replace(/\.sqlite$/, '');
  return ['-wal', '-shm'].flatMap((s) => [nomeCopia + s, base + s]);
}

/**
 * Régua de retenção — PURA. Recebe `agora` por parâmetro e nunca chama Date.now() dentro,
 * para o teste não depender do relógio.
 *
 * @param {{nome: string, mtimeMs: number}[]} arquivos  TUDO que está no diretório,
 *   inclusive -wal/-shm órfãos.
 * @param {{manterDias?: any, pisoCopias?: number, tetoCopias?: number, agora?: number}|number} opcoes
 *   Um Number é lido como TETO (o sentido histórico de `keep`).
 * @returns {{apagar: string[], motivo: object}}
 *
 * Ordem da régua:
 *   0. Fora de `database-*`, não toca — o diretório é onde alguém salvaria uma cópia manual
 *      antes de restaurar, e esta função APAGA arquivos.
 *   1. Órfão (acompanhante cujo `.sqlite` não está na lista, em QUALQUER dos dois formatos de
 *      nome) → apagar sempre, sem olhar data.
 *   2. Piso de 3 (as mais novas nunca saem) e teto de 10 (da 11ª em diante sai sempre).
 *      Piso sem teto removeria o limite de tamanho: ~2,9 GB em 30 dias no ritmo de boots real.
 *   3. Das demais, apagar as mais velhas que `manterDias` JUNTO com seus acompanhantes — se
 *      esquecê-los, a regra 3 recria o passivo que a regra 1 acabou de limpar.
 */
function decidirRemocao(arquivos, opcoes = {}) {
  // Compatibilidade EXPLÍCITA: desestruturar um Number não lança em JS — ele é encaixotado, os
  // campos viram undefined e a função vira NO-OP SILENCIOSO. Para uma limpeza, o pior desfecho.
  const opts = typeof opcoes === 'number' ? { tetoCopias: opcoes } : (opcoes || {});
  const {
    pisoCopias = PISO_COPIAS_PADRAO,
    tetoCopias = TETO_COPIAS_PADRAO,
    agora = 0,
  } = opts;

  // RN-03: valor inválido cai no padrão e é SINALIZADO (quem loga é o chamador — pura aqui).
  const dias = Number(opts.manterDias);
  const diasValido = opts.manterDias !== null && opts.manterDias !== ''
    && Number.isFinite(dias) && dias >= 1;
  const manterDias = diasValido ? dias : MANTER_DIAS_PADRAO;

  // `teto < piso`: o TETO vence. Inverter faria `pruneOldBackups(dbPath, 1)` manter 3 cópias, e
  // esse é o contrato congelado em tests/api/dbRecoveryBackup.api.test.js:138.
  const pisoEfetivo = Math.max(0, Math.min(pisoCopias, tetoCopias));

  const motivo = {
    orfaos: [],
    acimaDoTeto: [],
    porIdade: [],
    acompanhantes: [],
    protegidasPeloPiso: [],
    ignorados: [],
    manterDias,
    manterDiasInvalido: !diasValido,
    pisoEfetivo,
    tetoCopias,
  };

  const copias = [];
  const acompanhantes = [];
  for (const a of arquivos) {
    if (ehCopiaDeBackup(a.nome)) copias.push(a);
    else if (ehAcompanhante(a.nome)) acompanhantes.push(a);
    else motivo.ignorados.push(a.nome);        // regra 0
  }

  const nomesDeCopia = new Set(copias.map((c) => c.nome));
  const apagar = new Set();

  // Regra 1 — órfãos
  for (const a of acompanhantes) {
    if (!copiasCandidatas(a.nome).some((n) => nomesDeCopia.has(n))) {
      motivo.orfaos.push(a.nome);
      apagar.add(a.nome);
    }
  }

  // Regra 2 — piso e teto
  const ordenadas = copias.slice().sort((x, y) => y.mtimeMs - x.mtimeMs);
  motivo.protegidasPeloPiso = ordenadas.slice(0, pisoEfetivo).map((c) => c.nome);
  const descartar = [];
  ordenadas.slice(pisoEfetivo).forEach((c, i) => {
    if (pisoEfetivo + i >= tetoCopias) {          // teto: sai por mais nova que seja
      motivo.acimaDoTeto.push(c.nome);
      descartar.push(c.nome);
    } else if (agora - c.mtimeMs > manterDias * 24 * 60 * 60 * 1000) {   // regra 3: idade
      motivo.porIdade.push(c.nome);
      descartar.push(c.nome);
    }
  });

  // Regra 3 (parte que faltava no código antigo) — os acompanhantes vão junto, nos dois formatos
  const presentes = new Set(arquivos.map((a) => a.nome));
  for (const nome of descartar) {
    apagar.add(nome);
    for (const acomp of acompanhantesDaCopia(nome)) {
      if (presentes.has(acomp) && !apagar.has(acomp)) {
        motivo.acompanhantes.push(acomp);
        apagar.add(acomp);
      }
    }
  }

  return { apagar: [...apagar], motivo };
}

/**
 * @param {string} dbPath
 * @param {{manterDias?: any, pisoCopias?: number, tetoCopias?: number}|number} opcoes
 *   Número = TETO de cópias (assinatura histórica `(dbPath, keep = 10)`).
 */
function pruneOldBackups(dbPath, opcoes = {}) {
  const backupDir = path.join(path.dirname(dbPath), 'backups');
  if (!fs.existsSync(backupDir)) return { apagados: [], motivo: null };

  const arquivos = fs.readdirSync(backupDir).map((nome) => {
    let mtimeMs = 0;
    try { mtimeMs = fs.statSync(path.join(backupDir, nome)).mtimeMs; } catch { /* sumiu */ }
    return { nome, mtimeMs };
  });

  const { apagar, motivo } = decidirRemocao(arquivos, { ...(typeof opcoes === 'number'
    ? { tetoCopias: opcoes } : (opcoes || {})), agora: Date.now() });

  if (motivo.manterDiasInvalido && typeof opcoes === 'object' && opcoes && 'manterDias' in opcoes) {
    console.warn(`[DB Recovery] backup_manter_dias invalido (${JSON.stringify(opcoes.manterDias)}) `
      + `— usando o padrao de ${motivo.manterDias} dias`);
  }

  const apagados = [];
  for (const nome of apagar) {
    try {
      fs.unlinkSync(path.join(backupDir, nome));
      apagados.push(nome);
    } catch {
      /* ignore: pode ter sumido entre o readdir e o unlink */
    }
  }
  if (motivo.orfaos.length) {
    console.log(`[DB Recovery] ${motivo.orfaos.length} acompanhante(s) orfao(s) removido(s)`);
  }
  return { apagados, motivo };
}

/**
 * Traduz a linha de `configuracoes` (chave `backup_manter_dias`) nas opções de
 * `pruneOldBackups`. Recebe exatamente o par `(err, row)` do callback do `db.get`.
 *
 * **NUNCA lança, nem no erro de leitura** — e isso é o ponto, não um detalhe defensivo. O prune
 * roda no boot; no PRIMEIRO boot de uma instalação nova a tabela `configuracoes` pode não
 * existir ainda (`no such table: configuracoes`). Se este caminho estourasse, ou o `.catch` do
 * boot marcaria `dbStartupFailed` e o `/health` mentiria sobre a integridade do banco pelo resto
 * da vida do processo, ou seria rejeição não tratada — que no Node 24 ENCERRA o processo, e o
 * backup do boot (a rede de segurança do sistema) nunca rodaria.
 *
 * O valor inválido cai no padrão **aqui**, já normalizado, e o aviso da RN-03 sai daqui — é o
 * único lugar que sabe distinguir "a chave tem lixo" de "não deu para ler a chave".
 * `pruneOldBackups` então recebe sempre um número válido e não duplica o log.
 *
 * @param {Error|null} err   erro do `db.get` (tabela ausente, banco fechado, …)
 * @param {{valor?: any}|undefined} row
 * @returns {{manterDias: number, tetoCopias: number, usouPadrao: boolean}}
 */
function opcoesDeRetencao(err, row) {
  const bruto = err ? undefined : (row ? row.valor : undefined);
  const dias = Number(bruto);
  const valido = bruto !== undefined && bruto !== null && String(bruto).trim() !== ''
    && Number.isFinite(dias) && dias >= 1;

  if (err) {
    console.warn(`[DB Recovery] nao consegui ler backup_manter_dias (${err.message}) `
      + `— usando o padrao de ${MANTER_DIAS_PADRAO} dias`);
  } else if (!valido) {
    console.warn(`[DB Recovery] backup_manter_dias invalido (${JSON.stringify(bruto)}) `
      + `— usando o padrao de ${MANTER_DIAS_PADRAO} dias`);
  }

  return {
    manterDias: valido ? dias : MANTER_DIAS_PADRAO,
    tetoCopias: TETO_COPIAS_PADRAO,
    usouPadrao: !valido,
  };
}

module.exports = {
  backupDatabaseFiles,
  runIntegrityCheck,
  checkpointWal,
  prepareDatabaseOnStartup,
  pruneOldBackups,
  decidirRemocao,
  opcoesDeRetencao,
  fileSizeIfExists,
  MANTER_DIAS_PADRAO,
  PISO_COPIAS_PADRAO,
  TETO_COPIAS_PADRAO,
};
