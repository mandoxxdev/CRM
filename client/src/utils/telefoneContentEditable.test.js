/**
 * Mascara de telefone no campo da CAPA da proposta (contentEditable) — 28/07/2026.
 *
 * BUG RELATADO PELO USUARIO, na sequencia exata dele:
 *   "Eu apago o campo todo, começo a escrever de novo, preencho um telefone mas mesmo assim
 *    nao insere a mascara, so insere se eu salvar (ele recarrega a tela e volta com mascara)."
 *
 * Causa: o campo da capa nao e <input>, e um no contentEditable dentro do iframe do preview.
 * O oninput apenas registrava o texto; a mascara que aparecia depois vinha do SERVIDOR, ao
 * regerar o HTML no save. Uma correcao ingenua (reescrever textContent a cada tecla) conserta
 * a mascara e QUEBRA a digitacao: o cursor volta para o inicio e o usuario digita ao contrario.
 * Por isso o teste exercita o cursor tanto quanto o texto.
 *
 * Executar: cd client && CI=true npx react-scripts test src/utils/telefoneContentEditable.test.js --watchAll=false
 */
import {
  aplicarMascaraNoNoEditavel,
  indiceAposNDigitos,
  digitosAntesDe,
} from './telefoneContentEditable';

/**
 * Simula o no editavel + cursor, sem depender de Selection/Range do jsdom (que nao os
 * implementa de forma confiavel). O componente real injeta getCursorOffset/setCursorOffset,
 * que tem exatamente esta assinatura: offset em caracteres desde o inicio do no.
 */
function criarCampo(textoInicial = '', cursorInicial = null) {
  const el = { textContent: textoInicial };
  let cursor = cursorInicial === null ? textoInicial.length : cursorInicial;
  return {
    el,
    get texto() { return el.textContent; },
    get cursor() { return cursor; },
    /** Digita uma tecla NA POSICAO DO CURSOR e roda a mascara, como o oninput faria. */
    digitar(tecla) {
      el.textContent = el.textContent.slice(0, cursor) + tecla + el.textContent.slice(cursor);
      cursor += tecla.length;
      aplicarMascaraNoNoEditavel(el, () => cursor, (_, novo) => { cursor = novo; });
      return el.textContent;
    },
    /** Backspace no cursor. */
    apagar() {
      if (cursor > 0) {
        el.textContent = el.textContent.slice(0, cursor - 1) + el.textContent.slice(cursor);
        cursor -= 1;
      }
      aplicarMascaraNoNoEditavel(el, () => cursor, (_, novo) => { cursor = novo; });
      return el.textContent;
    },
    limpar() {
      el.textContent = '';
      cursor = 0;
      aplicarMascaraNoNoEditavel(el, () => cursor, (_, novo) => { cursor = novo; });
    },
  };
}

describe('campo da capa: a sequencia exata relatada pelo usuario', () => {
  test('apagar o campo todo e digitar de novo aplica a mascara SEM salvar', () => {
    // Comeca com o valor que o servidor imprimiu
    const campo = criarCampo('(11) 98888-7777');

    // 1) apaga o campo todo
    campo.limpar();
    expect(campo.texto).toBe('');

    // 2) escreve um telefone novo, digito a digito
    '21997231500'.split('').forEach((t) => campo.digitar(t));

    // 3) a mascara tem de estar la AGORA, sem salvar nem recarregar
    expect(campo.texto).toBe('(21) 99723-1500');
  });

  test('apagar tudo com backspace repetido tambem funciona', () => {
    const campo = criarCampo('(11) 98888-7777');
    for (let i = 0; i < 40; i++) campo.apagar();
    expect(campo.texto).toBe('');
    '1129145011'.split('').forEach((t) => campo.digitar(t));
    expect(campo.texto).toBe('(11) 2914-5011');
  });
});

describe('o cursor nao pode escapar (senao o usuario digita de tras para frente)', () => {
  test('o cursor fica sempre no fim quando se digita em sequencia', () => {
    const campo = criarCampo('');
    '11988887777'.split('').forEach((t) => {
      campo.digitar(t);
      expect(campo.cursor).toBe(campo.texto.length);
    });
    expect(campo.texto).toBe('(11) 98888-7777');
  });

  test('digitar NO MEIO mantem o cursor logo apos o digito inserido', () => {
    // "(11) 98888-777" com o cursor depois do "8" do meio (7 digitos digitados)
    const campo = criarCampo('(11) 98888-777');
    // posiciona o cursor logo apos o 7o digito
    const pos = indiceAposNDigitos(campo.texto, 7);
    const campoMeio = criarCampo(campo.texto, pos);
    campoMeio.digitar('9');
    // o digito entrou como 8o; o cursor tem de estar logo depois dele
    expect(digitosAntesDe(campoMeio.texto, campoMeio.cursor)).toBe(8);
  });

  test('o cursor nunca volta para o inicio depois de mascarar', () => {
    const campo = criarCampo('');
    '119'.split('').forEach((t) => campo.digitar(t));
    // "(11) 9" — se a implementacao reescrevesse o texto sem recolocar o cursor, seria 0
    expect(campo.cursor).toBeGreaterThan(0);
    expect(campo.texto).toBe('(11) 9');
  });
});

describe('nao mexe no DOM a toa', () => {
  test('texto ja mascarado nao e reescrito nem move o cursor', () => {
    const el = { textContent: '(11) 98888-7777' };
    let escreveu = false;
    const saida = aplicarMascaraNoNoEditavel(el, () => 5, () => { escreveu = true; });
    expect(saida).toBe('(11) 98888-7777');
    expect(escreveu).toBe(false); // nao chamou o setter de cursor
  });
});

describe('helpers de ancoragem por digito', () => {
  test('indiceAposNDigitos cai depois do n-esimo digito', () => {
    expect(indiceAposNDigitos('(11) 98888-7777', 0)).toBe(0);
    expect(indiceAposNDigitos('(11) 98888-7777', 2)).toBe(3);   // "(11"
    expect(indiceAposNDigitos('(11) 98888-7777', 3)).toBe(6);   // "(11) 9"
    expect(indiceAposNDigitos('(11) 98888-7777', 99)).toBe(15); // alem do fim
  });

  test('digitosAntesDe conta so digitos', () => {
    expect(digitosAntesDe('(11) 98888-7777', 0)).toBe(0);
    expect(digitosAntesDe('(11) 98888-7777', 3)).toBe(2);
    expect(digitosAntesDe('(11) 98888-7777', 6)).toBe(3);
    expect(digitosAntesDe('(11) 98888-7777', 15)).toBe(11);
  });
});
