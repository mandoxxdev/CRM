// Testes do motor de movimento (25/11/2026). O navegador do painel de revisao ficou
// "hidden" no meio da verificacao (requestAnimationFrame nao roda), entao a prova de
// que a contagem e monotona, nunca negativa e termina no texto exato do React vive
// aqui, com um relogio de quadros controlado.
import { lerNumero, escreverNumero, iniciarMotorDeMovimento } from './motorDeMovimento';

describe('lerNumero / escreverNumero', () => {
  test('moeda pt-BR com agrupamento e decimais', () => {
    const f = lerNumero('R$ 1.234,56');
    expect(f).toMatchObject({ prefixo: 'R$ ', valor: 1234.56, grupo: '.', decimalSep: ',', decimais: 2, sufixo: '' });
    expect(escreverNumero(f, 617.3)).toBe('R$ 617,30');
    expect(escreverNumero(f, 1234.56)).toBe('R$ 1.234,56');
  });
  test('porcentagem, sufixo curto e inteiro simples', () => {
    expect(lerNumero('85%')).toMatchObject({ valor: 85, sufixo: '%' });
    expect(lerNumero('1.2k')).toMatchObject({ valor: 1.2, decimais: 1, sufixo: 'k' });
    expect(lerNumero('3')).toMatchObject({ valor: 3 });
    expect(escreverNumero(lerNumero('3'), 1.4)).toBe('1');
  });
  test('o que NAO e um numero so: data, hora, fracao, traco', () => {
    expect(lerNumero('25/11/2026')).toBeNull();
    expect(lerNumero('12:30')).toBeNull();
    expect(lerNumero('3/5')).toBeNull();
    expect(lerNumero('—')).toBeNull();
    expect(lerNumero('')).toBeNull();
  });
  test('nunca escreve negativo para alvo positivo (t fica entre 0 e 1)', () => {
    const f = lerNumero('2');
    expect(escreverNumero(f, 0)).toBe('0');
    expect(escreverNumero(f, 0.4)).toBe('0');
  });
});

describe('iniciarMotorDeMovimento', () => {
  let quadros; let agora; let raiz; let desligar;
  const microtarefa = () => new Promise((r) => setTimeout(r, 0));
  const quadro = (ms) => { agora += ms; const fila = quadros; quadros = []; fila.forEach((cb) => cb(agora)); };

  beforeEach(() => {
    quadros = []; agora = 1000;
    window.requestAnimationFrame = (cb) => { quadros.push(cb); return quadros.length; };
    window.cancelAnimationFrame = () => { quadros = []; };
    raiz = document.createElement('div');
    document.body.appendChild(raiz);
    desligar = iniciarMotorDeMovimento(raiz);
  });
  afterEach(() => { desligar(); raiz.remove(); });

  const montarKpi = (texto, classe = 'kpi-value') => {
    const pagina = document.createElement('div');
    const el = document.createElement('div');
    el.className = classe;
    el.appendChild(document.createTextNode(texto));
    pagina.appendChild(el);
    raiz.appendChild(pagina);
    return { pagina, el };
  };

  test('conta de 0 ate o valor, monotono, sem negativo, e termina no texto exato', async () => {
    const { el } = montarKpi('1.248');
    await microtarefa();
    const vistos = [];
    for (let i = 0; i < 12; i++) { quadro(130); vistos.push(el.textContent); }
    const nums = vistos.map((v) => Number(v.replace(/\./g, '')));
    expect(nums[0]).toBe(0);
    expect(nums.every((n) => n >= 0)).toBe(true);
    expect(nums.every((n, i) => i === 0 || n >= nums[i - 1])).toBe(true);
    expect(vistos[vistos.length - 1]).toBe('1.248');
    expect(el.firstChild.nodeValue).toBe('1.248'); // o MESMO no do React, so o nodeValue mudou
  });

  test('o React trocando o valor no meio: parte do que esta na tela, nao de zero', async () => {
    const { el } = montarKpi('100');
    await microtarefa();
    quadro(0); quadro(650);
    const noMeio = Number(el.textContent);
    expect(noMeio).toBeGreaterThan(50);
    el.firstChild.nodeValue = '200'; // o React escreveu
    await microtarefa();
    quadro(0);
    expect(Number(el.textContent)).toBeGreaterThanOrEqual(noMeio - 1);
    for (let i = 0; i < 10; i++) quadro(130);
    expect(el.textContent).toBe('200');
  });

  test('remontou na mesma pagina com o mesmo valor: nao conta de novo', async () => {
    const { pagina, el } = montarKpi('42');
    await microtarefa();
    for (let i = 0; i < 12; i++) quadro(130);
    expect(el.textContent).toBe('42');
    el.remove();
    const el2 = document.createElement('div'); el2.className = 'kpi-value'; el2.textContent = '42';
    pagina.appendChild(el2);
    await microtarefa();
    expect(quadros.length).toBe(0); // nenhum quadro pedido = nenhuma contagem
    expect(el2.textContent).toBe('42');
  });

  test('trocou a raiz da rota: conta do zero outra vez', async () => {
    const { pagina } = montarKpi('42');
    await microtarefa();
    for (let i = 0; i < 12; i++) quadro(130);
    pagina.remove();
    const { el } = montarKpi('42');
    await microtarefa();
    quadro(0);
    expect(el.textContent).toBe('0');
    for (let i = 0; i < 12; i++) quadro(130);
    expect(el.textContent).toBe('42');
  });

  test('zero e valores fora da lista de KPI ficam quietos', async () => {
    montarKpi('0');
    montarKpi('99', 'tooltip-value');
    montarKpi('25/11/2026');
    await microtarefa();
    expect(quadros.length).toBe(0);
  });
});
