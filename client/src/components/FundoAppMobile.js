import React from 'react';
import { createPortal } from 'react-dom';

/**
 * Fundo animado do aplicativo de celular — as três manchas de cor que ficam por
 * trás do vidro.
 *
 * Fica num PORTAL para o body, e não dentro do `.layout`, pelo mesmo motivo da
 * barra inferior: o `.layout` tem `overflow: hidden` e o `.main-content` rola por
 * dentro dele. No WebKit, `position: fixed` dentro de um contêiner que rola deixa
 * de ser fixo e passa a acompanhar a rolagem — no iPad isso já mandou a barra
 * inferior para o topo da tela. Ancorado no body, o fundo fica parado enquanto o
 * conteúdo passa por cima.
 *
 * Não há checagem de largura aqui de propósito. Quem decide se isto aparece é o
 * CSS (`.agfx` só existe dentro do media query de 768px), e não JavaScript lendo
 * `window.innerWidth`: assim não é preciso ouvir `resize`, não há um quadro com o
 * fundo errado ao girar o aparelho, e o computador nunca renderiza nada disso.
 *
 * `aria-hidden` porque é decoração pura: não há o que anunciar para quem usa
 * leitor de tela.
 */
const FundoAppMobile = () => createPortal(
  <div className="agfx" aria-hidden="true">
    <span className="agfx-blob agfx-b1" />
    <span className="agfx-blob agfx-b2" />
    <span className="agfx-blob agfx-b3" />
  </div>,
  document.body,
);

export default FundoAppMobile;
