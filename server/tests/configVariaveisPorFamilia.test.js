// Recorte da lista em "Variáveis por equipamento": mostra só o que a família cadastrou.
// Replica a mesma expressão do componente para provar os casos de borda.
const assert = require('assert');
let ok = 0, total = 0;
const t = (n, fn) => { total++; try { fn(); ok++; console.log('  OK   ' + n); } catch (e) { console.error('  FALHA ' + n + ': ' + e.message); process.exitCode = 1; } };

// 83 variaveis do cadastro (amostra representativa do print)
const variaveisList = [
  { id: 1, chave: 'grau_de_proteo_motores', nome: 'GRAU DE PROTEÇÃO MOTORES' },
  { id: 2, chave: 'motor_esquerdo_kw', nome: 'MOTOR ESQUERDO [kW]' },
  { id: 3, chave: 'marca_do_motor_esquerdo', nome: 'MARCA DO MOTOR ESQUERDO' },
  { id: 4, chave: 'rotao_motor_esquerdo_rpm', nome: 'ROTAÇÃO MOTOR ESQUERDO [RPM]' },
  { id: 5, chave: 'carcaa_do_motor_esquerdo', nome: 'CARCAÇA DO MOTOR ESQUERDO' },
  { id: 6, chave: 'volume_til_1', nome: 'VOLUME ÚTIL DE TRABALHO' },
];

function recortar({ daFamilia, selecionadas, mostrarTodas = false, termo = '' }) {
  const filtrandoPelaFamilia = !mostrarTodas && daFamilia && daFamilia.length > 0;
  const permitidas = filtrandoPelaFamilia ? new Set([...daFamilia, ...selecionadas]) : null;
  const base = permitidas ? variaveisList.filter((v) => permitidas.has(v.chave || '')) : variaveisList;
  const chavesDaFamilia = daFamilia ? new Set(daFamilia) : null;
  const tl = termo.trim().toLowerCase();
  const filtradas = tl
    ? base.filter((v) => (v.nome || '').toLowerCase().includes(tl) || (v.chave || '').toLowerCase().includes(tl))
    : base;
  return {
    chaves: filtradas.map((v) => v.chave),
    fora: filtradas.filter((v) => filtrandoPelaFamilia && chavesDaFamilia && !chavesDaFamilia.has(v.chave)).map((v) => v.chave),
    filtrandoPelaFamilia,
  };
}

console.log('\n[caso do usuario] moinho de laboratorio nao tem motor esquerdo');
const MLY = ['grau_de_proteo_motores', 'volume_til_1'];
const r1 = recortar({ daFamilia: MLY, selecionadas: ['grau_de_proteo_motores'] });
t('mostra so as 2 cadastradas na familia', () => assert.deepStrictEqual(r1.chaves, MLY));
t('motor esquerdo desaparece da lista',
  () => assert(!r1.chaves.includes('motor_esquerdo_kw') && !r1.chaves.includes('marca_do_motor_esquerdo')));
t('nada marcado indevidamente como "fora da familia"', () => assert.deepStrictEqual(r1.fora, []));

console.log('\n[borda] marcada aqui mas fora do cadastro da familia');
// Cenario real: alguem marcou carcaca do motor esquerdo antes, depois a familia mudou.
// Se sumisse da lista, seguiria saindo na proposta e sem jeito de desmarcar.
const r2 = recortar({ daFamilia: MLY, selecionadas: ['grau_de_proteo_motores', 'carcaa_do_motor_esquerdo'] });
t('a marcada de fora CONTINUA visivel (da para desmarcar)',
  () => assert(r2.chaves.includes('carcaa_do_motor_esquerdo')));
t('e vem sinalizada como fora da familia',
  () => assert.deepStrictEqual(r2.fora, ['carcaa_do_motor_esquerdo']));
t('as nao marcadas de fora seguem escondidas',
  () => assert(!r2.chaves.includes('motor_esquerdo_kw')));

console.log('\n[borda] familia sem nenhuma variavel cadastrada');
const r3 = recortar({ daFamilia: [], selecionadas: [] });
t('cai para a lista completa em vez de tela vazia',
  () => assert.strictEqual(r3.chaves.length, variaveisList.length));
t('e nao rotula nada de "fora da familia"', () => assert.deepStrictEqual(r3.fora, []));

console.log('\n[borda] falha ao carregar as variaveis da familia (null)');
const r4 = recortar({ daFamilia: null, selecionadas: [] });
t('null = lista completa, tela continua utilizavel',
  () => assert.strictEqual(r4.chaves.length, variaveisList.length));
t('filtro fica desligado', () => assert.strictEqual(!!r4.filtrandoPelaFamilia, false));

console.log('\n[alternador] "Mostrar todas"');
const r5 = recortar({ daFamilia: MLY, selecionadas: [], mostrarTodas: true });
t('volta a lista inteira quando pedido',
  () => assert.strictEqual(r5.chaves.length, variaveisList.length));
t('sem selo de fora da familia com o filtro desligado', () => assert.deepStrictEqual(r5.fora, []));

console.log('\n[busca] a pesquisa opera DENTRO do recorte da familia');
const r6 = recortar({ daFamilia: MLY, selecionadas: [], termo: 'motor' });
t('buscar "motor" nao traz de volta o motor esquerdo',
  () => assert.deepStrictEqual(r6.chaves, ['grau_de_proteo_motores']));
const r7 = recortar({ daFamilia: MLY, selecionadas: [], termo: 'motor', mostrarTodas: true });
t('com "Mostrar todas", a mesma busca acha os 5 de motor',
  () => assert.strictEqual(r7.chaves.length, 5));

console.log(`\n${ok}/${total} checagens`);
console.log(ok === total ? '0 failed' : `${total - ok} failed`);
process.exit(ok === total ? 0 : 1);
