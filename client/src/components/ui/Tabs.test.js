/**
 * `Tabs` — a barra de abas reutilizavel (Etapa 36, RN-36.09).
 *
 * A primeira tela a usa-la e /configuracoes, nos dois niveis (modulos e abas internas). O que
 * este arquivo prova e o CONTRATO congelado no plano: `role="tablist"`/`role="tab"`,
 * `aria-selected` so na ativa, `aria-controls`, `onChange(id)` no clique e nas setas (com a
 * volta circular na ultima/primeira), e a classe `ui-tab-ativa` — e que nenhuma classe casa com
 * os seletores de `mobile-app.css` (`[class*='header'|'toolbar'|'barra'|'actions']`) que
 * forcariam `flex-wrap: wrap` e matariam a rolagem horizontal.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/ui/Tabs --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import Tabs from './Tabs';

const ABAS = [
  { id: 'empresa', label: 'Empresa' },
  { id: 'sistema', label: 'Sistema' },
  { id: 'email', label: 'E-mail' },
];

let container;
let root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(props) {
  act(() => {
    root.render(<Tabs abas={ABAS} ariaLabel="Abas de teste" {...props} />);
  });
}

const tabs = () => [...container.querySelectorAll('[role="tab"]')];

test('renderiza N role="tab" dentro de um role="tablist" com o aria-label', () => {
  render({ ativa: 'empresa', onChange: jest.fn() });

  const lista = container.querySelector('[role="tablist"]');
  expect(lista).not.toBeNull();
  expect(lista.getAttribute('aria-label')).toBe('Abas de teste');
  expect(tabs()).toHaveLength(3);
  expect(tabs().every(t => lista.contains(t))).toBe(true);
  expect(tabs().map(t => t.textContent.trim())).toEqual(['Empresa', 'Sistema', 'E-mail']);
});

test('so a ativa tem aria-selected="true" e a classe ui-tab-ativa; as outras sao "false"', () => {
  render({ ativa: 'sistema', onChange: jest.fn() });

  const [empresa, sistema, email] = tabs();
  expect(sistema.getAttribute('aria-selected')).toBe('true');
  expect(sistema.classList.contains('ui-tab-ativa')).toBe(true);
  expect(empresa.getAttribute('aria-selected')).toBe('false');
  expect(empresa.classList.contains('ui-tab-ativa')).toBe(false);
  expect(email.getAttribute('aria-selected')).toBe('false');
  // Foco em sequencia (roving tabindex): so a ativa entra no Tab do teclado.
  expect(sistema.getAttribute('tabindex')).toBe('0');
  expect(empresa.getAttribute('tabindex')).toBe('-1');
});

test('sem painelId NENHUMA aba emite aria-controls (nao ha painel por aba nesta base); o id da aba existe', () => {
  render({ ativa: 'empresa', onChange: jest.fn() });

  const [empresa] = tabs();
  expect(empresa.hasAttribute('aria-controls')).toBe(false);
  expect(tabs().every((t) => !t.hasAttribute('aria-controls'))).toBe(true);
  expect(empresa.id).toBe('ui-tab-empresa');
});

test('com painelId todas as abas apontam para o MESMO painel (o unico que troca de conteudo)', () => {
  render({ ativa: 'empresa', onChange: jest.fn(), painelId: 'ui-tabpanel-teste' });

  expect(tabs().map((t) => t.getAttribute('aria-controls'))).toEqual([
    'ui-tabpanel-teste', 'ui-tabpanel-teste', 'ui-tabpanel-teste',
  ]);
});

test('clicar chama onChange(id) da aba clicada, e nao da ativa', () => {
  const onChange = jest.fn();
  render({ ativa: 'empresa', onChange });

  act(() => { tabs()[2].click(); });

  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith('email');
});

test('ArrowRight vai para a proxima; na ultima volta para a primeira', () => {
  const onChange = jest.fn();
  render({ ativa: 'sistema', onChange });

  act(() => {
    tabs()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  });
  expect(onChange).toHaveBeenLastCalledWith('email');

  render({ ativa: 'email', onChange });
  act(() => {
    tabs()[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  });
  expect(onChange).toHaveBeenLastCalledWith('empresa');
  expect(onChange).toHaveBeenCalledTimes(2);
});

test('ArrowLeft vai para a anterior; na primeira volta para a ultima', () => {
  const onChange = jest.fn();
  render({ ativa: 'sistema', onChange });

  act(() => {
    tabs()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  });
  expect(onChange).toHaveBeenLastCalledWith('empresa');

  render({ ativa: 'empresa', onChange });
  act(() => {
    tabs()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  });
  expect(onChange).toHaveBeenLastCalledWith('email');
  expect(onChange).toHaveBeenCalledTimes(2);
});

test('Home e End vao para a primeira e a ultima; outra tecla nao chama onChange', () => {
  const onChange = jest.fn();
  render({ ativa: 'sistema', onChange });

  act(() => {
    tabs()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
  });
  expect(onChange).toHaveBeenLastCalledWith('email');
  act(() => {
    tabs()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
  });
  expect(onChange).toHaveBeenLastCalledWith('empresa');
  act(() => {
    tabs()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  expect(onChange).toHaveBeenCalledTimes(2);
});

test('tamanho "sm" adiciona ui-tabs-sm; o padrao nao', () => {
  render({ ativa: 'empresa', onChange: jest.fn() });
  expect(container.querySelector('[role="tablist"]').classList.contains('ui-tabs-sm')).toBe(false);

  render({ ativa: 'empresa', onChange: jest.fn(), tamanho: 'sm' });
  expect(container.querySelector('[role="tablist"]').classList.contains('ui-tabs-sm')).toBe(true);
});

test('icone opcional e renderizado dentro da aba', () => {
  const Icone = () => <svg data-testid="icone-empresa" />;
  render({
    ativa: 'empresa',
    onChange: jest.fn(),
    abas: [{ id: 'empresa', label: 'Empresa', icon: Icone }, ABAS[1]],
  });
  expect(tabs()[0].querySelector('[data-testid="icone-empresa"]')).not.toBeNull();
  expect(tabs()[1].querySelector('svg')).toBeNull();
});

test('nenhuma classe casa com os seletores que mobile-app.css forca a quebrar linha', () => {
  render({ ativa: 'empresa', onChange: jest.fn(), tamanho: 'sm' });
  // `[class*='header'|'toolbar'|'barra'|'actions'|...]` em mobile-app.css:231-238 poe
  // `flex-wrap: wrap` em qualquer elemento cuja classe contenha esses fragmentos — a barra de
  // abas precisa rolar, nao quebrar.
  const proibidos = ['header', 'cabecalho', 'toolbar', 'barra', 'actions', 'acoes',
    'filters', 'filtros', 'buttons', 'botoes', '-top', '-topo'];
  const classes = [...container.querySelectorAll('*')].flatMap(el => [...el.classList]);
  expect(classes.length).toBeGreaterThan(0);
  for (const cls of classes) {
    for (const frag of proibidos) {
      expect(cls.includes(frag)).toBe(false);
    }
  }
});
