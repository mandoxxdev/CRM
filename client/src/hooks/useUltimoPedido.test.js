/**
 * Etapa 161 (RN-161.01/02/03, C396) — so o ultimo pedido vale.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import useUltimoPedido from './useUltimoPedido';

global.IS_REACT_ACT_ENVIRONMENT = true;

function capturar() {
  const out = {};
  function Sonda() { out.novoPedido = useUltimoPedido(); return null; }
  const el = document.createElement('div');
  const root = createRoot(el);
  return { out, root, Sonda };
}

test('[C396] o primeiro pedido deixa de ser o ultimo quando outro comeca; o mais novo continua valendo', async () => {
  const { out, root, Sonda } = capturar();
  await act(async () => { root.render(<Sonda />); });
  const a = out.novoPedido();
  expect(a()).toBe(true);
  const b = out.novoPedido();
  expect(a()).toBe(false);
  expect(b()).toBe(true);
  out.novoPedido(); // so invalida (a troca de relatorio)
  expect(b()).toBe(false);
  await act(async () => { root.unmount(); });
});

test('[C396] a funcao e estavel entre renderizacoes (pode entrar em dependencias) e o contador sobrevive', async () => {
  const { out, root, Sonda } = capturar();
  await act(async () => { root.render(<Sonda />); });
  const primeira = out.novoPedido;
  const a = primeira();
  await act(async () => { root.render(<Sonda />); });
  expect(out.novoPedido).toBe(primeira);
  expect(a()).toBe(true);
  out.novoPedido();
  expect(a()).toBe(false);
  await act(async () => { root.unmount(); });
});
