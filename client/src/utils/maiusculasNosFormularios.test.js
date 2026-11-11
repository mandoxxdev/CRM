/**
 * Etapa 210 — testes de `maiusculasNosFormularios` (RN-210.01 a RN-210.03).
 *
 * O que importa provar: (1) o ESTADO do React recebe o maiusculo — nao basta o campo mostrar —, ao
 * digitar e ao colar; (2) o cursor nao pula; (3) os campos de fora ficam como estao. Metade dos
 * casos sao negativos, e cada um tem no mesmo teste um campo que SOBE (senao passaria com a regra
 * desligada).
 */
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { campoVaiEmMaiusculas, subirValor, iniciarMaiusculasNosFormularios } from './maiusculasNosFormularios';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/** Simula o navegador: troca o valor pelo setter nativo e dispara o `input` (e o que digitar e colar fazem). */
function digitar(el, valor, cursor = valor.length) {
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, valor);
  try { el.setSelectionRange(cursor, cursor); } catch (e) { /* type=email nao tem selecao */ }
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function Formulario({ onValores }) {
  const [v, setV] = useState({ nome: '', obs: '', email: '', busca: '' });
  const muda = (k) => (e) => {
    const novo = { ...v, [k]: e.target.value };
    setV(novo);
    onValores(novo);
  };
  return (
    <form>
      <input id="nome" value={v.nome} onChange={muda('nome')} />
      <textarea id="obs" value={v.obs} onChange={muda('obs')} />
      <input id="email" type="email" value={v.email} onChange={muda('email')} />
      <input id="busca" placeholder="Buscar material..." value={v.busca} onChange={muda('busca')} />
    </form>
  );
}

describe('maiusculasNosFormularios', () => {
  let desligar;
  let host;
  let root;

  beforeEach(() => {
    desligar = iniciarMaiusculasNosFormularios(document);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    desligar();
  });

  test('RN-210.01: o estado do React recebe o maiusculo com acento, no input e no textarea', () => {
    let ultimo = null;
    act(() => root.render(<Formulario onValores={(x) => { ultimo = x; }} />));
    const nome = host.querySelector('#nome');
    act(() => digitar(nome, 'são joão peças'));
    expect(nome.value).toBe('SÃO JOÃO PEÇAS');
    expect(ultimo.nome).toBe('SÃO JOÃO PEÇAS');
    const obs = host.querySelector('#obs');
    act(() => digitar(obs, 'entregar na portaria\nfalar com zé'));
    expect(ultimo.obs).toBe('ENTREGAR NA PORTARIA\nFALAR COM ZÉ');
  });

  test('RN-210.01: colar um texto inteiro sobe tudo de uma vez', () => {
    let ultimo = null;
    act(() => root.render(<Formulario onValores={(x) => { ultimo = x; }} />));
    const nome = host.querySelector('#nome');
    act(() => digitar(nome, 'Rolamento 6205 2rs - aço inox'));
    expect(ultimo.nome).toBe('ROLAMENTO 6205 2RS - AÇO INOX');
  });

  test('RN-210.01: corrigir no meio nao pula o cursor para o fim', () => {
    act(() => root.render(<Formulario onValores={() => {}} />));
    const nome = host.querySelector('#nome');
    act(() => digitar(nome, 'ABCxDEF', 4));
    expect(nome.value).toBe('ABCXDEF');
    expect(nome.selectionStart).toBe(4);
    expect(nome.selectionEnd).toBe(4);
  });

  test('RN-210.02: e-mail e busca ficam como foram digitados; o nome, no mesmo formulario, sobe', () => {
    let ultimo = null;
    act(() => root.render(<Formulario onValores={(x) => { ultimo = x; }} />));
    act(() => digitar(host.querySelector('#email'), 'fulano@gmp.com.br'));
    act(() => digitar(host.querySelector('#busca'), 'rolamento'));
    act(() => digitar(host.querySelector('#nome'), 'abc'));
    expect(ultimo.email).toBe('fulano@gmp.com.br');
    expect(ultimo.busca).toBe('rolamento');
    expect(ultimo.nome).toBe('ABC');
  });

  test('RN-210.03: no meio da composicao do teclado nao mexe; ao fechar a palavra, sobe e avisa o React', () => {
    let ultimo = null;
    act(() => root.render(<Formulario onValores={(x) => { ultimo = x; }} />));
    const nome = host.querySelector('#nome');
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(nome, 'sã');
      const ev = new Event('input', { bubbles: true });
      Object.defineProperty(ev, 'isComposing', { value: true });
      nome.dispatchEvent(ev);
    });
    expect(ultimo.nome).toBe('sã');
    act(() => nome.dispatchEvent(new Event('compositionend', { bubbles: true })));
    expect(ultimo.nome).toBe('SÃ');
  });
});

describe('campoVaiEmMaiusculas (RN-210.02)', () => {
  function campo(html) {
    document.body.innerHTML = html;
    return document.body.querySelector('input, textarea');
  }

  test('sobem: input sem tipo, type=text, textarea', () => {
    expect(campoVaiEmMaiusculas(campo('<input />'))).toBe(true);
    expect(campoVaiEmMaiusculas(campo('<input type="text" name="razao_social" />'))).toBe(true);
    expect(campoVaiEmMaiusculas(campo('<textarea name="observacoes"></textarea>'))).toBe(true);
  });

  test('ficam fora: nao texto, e-mail, senha, site, busca, dentro de data-sem-maiusculas, somente leitura', () => {
    expect(campoVaiEmMaiusculas(campo('<input type="number" />'))).toBe(false);
    expect(campoVaiEmMaiusculas(campo('<input type="email" />'))).toBe(false);
    expect(campoVaiEmMaiusculas(campo('<input type="password" />'))).toBe(false);
    expect(campoVaiEmMaiusculas(campo('<input type="search" />'))).toBe(false);
    expect(campoVaiEmMaiusculas(campo('<input name="email_contato" />'))).toBe(false);
    expect(campoVaiEmMaiusculas(campo('<input name="site" />'))).toBe(false);
    expect(campoVaiEmMaiusculas(campo('<input id="smtp_host" />'))).toBe(false);
    expect(campoVaiEmMaiusculas(campo('<input placeholder="Buscar usuário..." />'))).toBe(false);
    expect(campoVaiEmMaiusculas(campo('<input placeholder="seu@email.com" />'))).toBe(false);
    expect(campoVaiEmMaiusculas(campo('<input placeholder="smtp.gmail.com" />'))).toBe(false);
    expect(campoVaiEmMaiusculas(campo('<div data-sem-maiusculas><input /></div>'))).toBe(false);
    expect(campoVaiEmMaiusculas(campo('<input readonly />'))).toBe(false);
    // a metade positiva: um campo comum, no mesmo teste, sobe
    expect(campoVaiEmMaiusculas(campo('<input placeholder="Nome do grupo" />'))).toBe(true);
  });

  test('subirValor recalcula o cursor quando o comprimento muda (ß -> SS)', () => {
    const el = campo('<input />');
    el.value = 'straße x';
    el.setSelectionRange(6, 6); // depois do "ß"
    expect(subirValor(el)).toBe(true);
    expect(el.value).toBe('STRASSE X');
    expect(el.selectionStart).toBe(7);
  });
});
