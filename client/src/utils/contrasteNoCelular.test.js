/**
 * Testes de `contrasteNoCelular`.
 *
 * Como em `gradesNoCelular`, o risco desta função não é deixar de agir: é
 * agir demais. Ela reescreve a cor de qualquer elemento com `style` inline.
 * Por isso a maior parte dos casos aqui é de coisas que ela NÃO pode tocar.
 *
 * jsdom não pinta nada, então o teste controla as cores diretamente e mede o
 * contraste pela mesma conta que o navegador usaria.
 */
import { ajustarContrastes } from './contrasteNoCelular';
import { corLegivel } from './tabelasComoCartoes';

function largura(px) {
  window.innerWidth = px;
}

/** Monta um elemento com cor inline sobre um fundo opaco conhecido. */
function cena(corTexto, corFundo, texto = 'Em estoque') {
  document.body.innerHTML = `
    <div id="fundo" style="background-color: ${corFundo};">
      <span id="alvo" style="color: ${corTexto};">${texto}</span>
    </div>`;
  return document.getElementById('alvo');
}

function razao(a, b) {
  const lum = (c) => {
    const [r, g, bb] = c.match(/\d+/g).map(Number);
    const f = (v) => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bb);
  };
  const la = lum(a);
  const lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe('contrasteNoCelular', () => {
  beforeEach(() => largura(360));

  describe('o que ele CONSERTA', () => {
    test('escurece a letra clara demais sobre fundo claro', () => {
      // O caso real: selo "aprovado" verde-claro sobre cartao branco, 1,87.
      const el = cena('rgb(46, 204, 113)', 'rgb(255, 255, 255)', 'aprovado');
      expect(ajustarContrastes(document)).toBe(1);
      expect(razao(el.style.color, 'rgb(255,255,255)')).toBeGreaterThanOrEqual(4.5);
    });

    test('clareia a letra escura demais sobre fundo escuro', () => {
      // O caso real: "Em estoque" em verde-escuro (#047857) no tema escuro.
      const el = cena('rgb(4, 120, 87)', 'rgb(24, 24, 24)');
      expect(ajustarContrastes(document)).toBe(1);
      expect(razao(el.style.color, 'rgb(24,24,24)')).toBeGreaterThanOrEqual(4.5);
    });

    test('escreve com `important`, senao um re-render do React desfaz', () => {
      const el = cena('rgb(46, 204, 113)', 'rgb(255, 255, 255)');
      ajustarContrastes(document);
      expect(el.style.getPropertyPriority('color')).toBe('important');
    });

    test('preserva o matiz: verde continua verde', () => {
      const el = cena('rgb(46, 204, 113)', 'rgb(255, 255, 255)');
      ajustarContrastes(document);
      const [r, g, b] = el.style.color.match(/\d+/g).map(Number);
      expect(g).toBeGreaterThan(r);
      expect(g).toBeGreaterThan(b);
    });
  });

  describe('o que ele NAO PODE tocar', () => {
    test('nada acontece no computador', () => {
      largura(1440);
      const el = cena('rgb(46, 204, 113)', 'rgb(255, 255, 255)');
      expect(ajustarContrastes(document)).toBe(0);
      expect(el.style.color).toBe('rgb(46, 204, 113)');
    });

    test('nao toca em cor que ja passa', () => {
      const el = cena('rgb(20, 40, 60)', 'rgb(255, 255, 255)');
      expect(ajustarContrastes(document)).toBe(0);
      expect(el.style.color).toBe('rgb(20, 40, 60)');
    });

    test('nao toca em elemento sem texto proprio', () => {
      // So embrulha filhos: nao ha letra dele para ficar ilegivel, e mexer
      // aqui mudaria a cor de tudo que esta dentro.
      document.body.innerHTML = `
        <div id="fundo" style="background-color: rgb(255,255,255);">
          <div id="alvo" style="color: rgb(46,204,113);"><b>aprovado</b></div>
        </div>`;
      expect(ajustarContrastes(document)).toBe(0);
    });

    test('nao toca quando o fundo e imagem ou degrade', () => {
      // Sobre degrade nao da para saber a cor pintada; chutar branco foi o que
      // ja produziu acusacao falsa na regua de tela.
      document.body.innerHTML = `
        <div style="background-image: linear-gradient(#fff, #000);">
          <span id="alvo" style="color: rgb(46,204,113);">aprovado</span>
        </div>`;
      expect(ajustarContrastes(document)).toBe(0);
    });

    test('nao toca em elemento sem cor inline', () => {
      document.body.innerHTML = `
        <div style="background-color: rgb(255,255,255);">
          <span class="selo">aprovado</span>
        </div>`;
      expect(ajustarContrastes(document)).toBe(0);
    });
  });

  describe('corLegivel', () => {
    test('devolve null quando ja esta bom — sinal de "nao mexa"', () => {
      expect(corLegivel('rgb(20,40,60)', 'rgb(255,255,255)')).toBeNull();
    });

    test('preto sobre preto clareia ate ficar legivel', () => {
      // Escrevi este teste esperando `null`, imaginando que preto sobre preto
      // nao teria saida. Tem: o fundo e escuro, entao a letra caminha para o
      // branco e para no primeiro tom que passa. Nao ha matiz para preservar
      // num cinza, e legivel e melhor do que fiel a uma cor invisivel.
      const nova = corLegivel('rgb(0,0,0)', 'rgb(0,0,0)');
      expect(nova).not.toBeNull();
      expect(razao(nova, 'rgb(0,0,0)')).toBeGreaterThanOrEqual(4.5);
    });

    test('aguenta entrada invalida sem quebrar', () => {
      expect(corLegivel('', 'rgb(255,255,255)')).toBeNull();
      expect(corLegivel('rgb(1,2,3)', 'nao-e-cor')).toBeNull();
    });
  });
});
