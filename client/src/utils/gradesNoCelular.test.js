/**
 * Testes de `gradesNoCelular`.
 *
 * O risco desta funcao nao e deixar de agir: e agir demais. Ela escreve
 * `!important` em estilo inline de qualquer `<div>` do software, inclusive
 * das telas de computador. Por isso METADE dos casos aqui sao controles
 * negativos — grades que ela NAO pode tocar.
 *
 * O caso que originou o arquivo esta em "desmonta o painel lateral":
 * `/almoxarifado/requisicoes/nova` tinha 31 elementos terminando em 662px
 * numa tela de 360px, por causa de um `1fr 320px` escrito no JSX.
 */
import { ajustarGrades, motivoParaDesmontar, iniciarGradesNoCelular } from './gradesNoCelular';

function largura(px) {
  window.innerWidth = px;
}

function grade(estilo, dentro = '') {
  document.body.innerHTML = `<div id="g" style="display: grid; grid-template-columns: ${estilo};">${dentro}</div>`;
  const el = document.getElementById('g');
  // jsdom nao faz layout: clientWidth e sempre 0. Finjo a largura util que
  // um telefone de 360px da ao conteudo.
  Object.defineProperty(el, 'clientWidth', { value: 322, configurable: true });
  return el;
}

const CAMPO = '<input type="text" />';

describe('gradesNoCelular', () => {
  beforeEach(() => {
    largura(360);
  });

  describe('o que ele DESMONTA', () => {
    test('desmonta o painel lateral que nao cabe (o caso de requisicoes/nova)', () => {
      const el = grade('1fr 320px');
      expect(ajustarGrades(document)).toBe(1);
      expect(el.style.gridTemplateColumns).toBe('1fr');
      expect(el.getAttribute('data-grade-motivo')).toMatch(/320px/);
    });

    test('desmonta qualquer coluna fixa grande, nao so 320 (vale para modulo futuro)', () => {
      grade('1fr 420px');
      expect(ajustarGrades(document)).toBe(1);
      grade('240px 1fr');
      expect(ajustarGrades(document)).toBe(1);
    });

    test('escreve com `important`, senao um re-render do React desfaz', () => {
      const el = grade('1fr 320px');
      ajustarGrades(document);
      expect(el.style.getPropertyPriority('grid-template-columns')).toBe('important');
    });
  });

  describe('o que ele NAO PODE tocar', () => {
    test('nada acontece no computador', () => {
      largura(1440);
      const el = grade('1fr 320px');
      expect(ajustarGrades(document)).toBe(0);
      expect(el.style.gridTemplateColumns).toBe('1fr 320px');
    });

    test('nao toca em `auto-fill`, que ja se resolve sozinho', () => {
      const el = grade('repeat(auto-fill, minmax(280px, 1fr))');
      expect(ajustarGrades(document)).toBe(0);
      expect(el.style.gridTemplateColumns).toMatch(/auto-fill/);
    });

    test('nao conta o piso do `minmax` como coluna fixa', () => {
      expect(motivoParaDesmontar(
        { style: { gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }, querySelector: () => null },
        322,
      )).toBeNull();
    });

    test('nao desmonta duas colunas de indicador curto (sem campo)', () => {
      const el = grade('1fr 1fr', '<span>81</span><span>49%</span>');
      expect(ajustarGrades(document)).toBe(0);
      expect(el.style.gridTemplateColumns).toBe('1fr 1fr');
    });

    // Cheguei a escrever uma regra que desmontava esta grade, achando que
    // 161px nao daria para preencher. Nao era medida: a varredura das 24
    // telas do Almoxarifado nao achou um campo espremido assim. O teste
    // ficou, virado do avesso, para que a regra nao volte por palpite.
    test('nao desmonta duas colunas COM campo — 161px cada preenche', () => {
      const el = grade('1fr 1fr', CAMPO);
      expect(ajustarGrades(document)).toBe(0);
      expect(el.style.gridTemplateColumns).toBe('1fr 1fr');
    });

    test('nao desmonta coluna fixa pequena, que costuma ser icone ou selo', () => {
      const el = grade('48px 1fr');
      expect(ajustarGrades(document)).toBe(0);
      expect(el.style.gridTemplateColumns).toBe('48px 1fr');
    });

    test('nao toca em grade sem estilo inline (essa e trabalho do CSS)', () => {
      document.body.innerHTML = '<div id="g" class="almox-kpis"></div>';
      expect(ajustarGrades(document)).toBe(0);
    });
  });

  describe('ida e volta', () => {
    test('devolve a grade original quando o aparelho volta ao horizontal', () => {
      const el = grade('1fr 320px');
      ajustarGrades(document);
      expect(el.style.gridTemplateColumns).toBe('1fr');

      largura(1440);
      ajustarGrades(document);
      expect(el.style.gridTemplateColumns).toBe('1fr 320px');
      expect(el.getAttribute('data-grade-motivo')).toBeNull();
    });

    /**
     * O defeito mais caro desta sessao, e o menos visivel.
     *
     * O agendamento usava so `requestAnimationFrame`. rAF so dispara quando a
     * pagina PINTA — aplicativo em segundo plano, tela apagada, aba oculta.
     * Com a trava `if (agendado) return`, um rAF que nunca chega deixa o
     * adaptador pendente PARA SEMPRE e toda mutacao seguinte e descartada
     * calada. Medido no navegador: rAF nao disparou em 1,2s com o documento
     * dizendo `visibilityState: "visible"`.
     *
     * Aqui eu reproduzo isso: um rAF que registra e nunca chama de volta.
     */
    test('adapta mesmo quando a aba nao pinta e o rAF nunca dispara', () => {
      jest.useFakeTimers();
      const rafOriginal = window.requestAnimationFrame;
      window.requestAnimationFrame = () => 1;   // registra e nunca volta

      document.body.innerHTML = '';
      iniciarGradesNoCelular();

      const el = document.createElement('div');
      el.setAttribute('style', 'display: grid; grid-template-columns: 1fr 320px;');
      Object.defineProperty(el, 'clientWidth', { value: 322, configurable: true });
      document.body.appendChild(el);

      // O MutationObserver do jsdom entrega em microtask; forco o passe do
      // relogio, que e o caminho que sobrevive sem pintura.
      return Promise.resolve().then(() => {
        jest.advanceTimersByTime(300);
        expect(el.style.gridTemplateColumns).toBe('1fr');
        window.requestAnimationFrame = rafOriginal;
        jest.useRealTimers();
      });
    });

    test('um segundo passe no celular nao conta de novo nem perde o original', () => {
      const el = grade('1fr 320px');
      expect(ajustarGrades(document)).toBe(1);
      expect(ajustarGrades(document)).toBe(0);
      expect(el.getAttribute('data-grade-original')).toBe('1fr 320px');
    });
  });
});
