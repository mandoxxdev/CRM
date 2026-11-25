import React from 'react';
import './CataventoGMP.css';

/**
 * O catavento da GMP — a mesma peça animada do site gmpindustriais.com
 * (seção "g26"), portada como componente (24/11/2026, pedido do P.O.: "a
 * animação do catavento poderia aparecer em algum lugar").
 *
 * Quatro pás nas cores da marca (verde, amarelo, vermelho, azul), cada uma com
 * um degradê que some em direção ao centro, e um cubo branco. O movimento é o
 * do site:
 *   - `entrada`: dá cinco voltas rápidas desacelerando (2,4s) e depois gira
 *     devagar para sempre (uma volta a cada 80s) — para a tela de módulos;
 *   - `girando`: gira contínuo, uma volta a cada 2,4s — indicador de espera;
 *   - `parado`: só a marca.
 *
 * `legenda` + `legendaDestaque` ("GMP" + "Industriais") escrevem a assinatura
 * embaixo do catavento enquanto ele assenta, no MESMO estilo da frase
 * manuscrita do site ("a inteligência está no projeto, a força está na
 * gravidade"): fonte Caveat, levemente inclinada, revelada da esquerda para a
 * direita, com dois traços sublinhando o destaque — pedido do P.O.
 *
 * Só SVG + CSS: nenhuma dependência, nenhum JavaScript além do React. Os ids
 * dos gradientes levam um sufixo por instância para dois cataventos na mesma
 * tela não disputarem o mesmo `url(#...)`.
 */
let seq = 0;

const PAS = [
  { cor: '#00A887', d: 'M0 0L-66.84 -71.67A98 98 0 0 1 3.42 -97.94Z', x1: -51.15, y1: -54.85, x2: 2.62, y2: -74.95 },
  { cor: '#FFC20E', d: 'M0 0L69.3 -69.3A98 98 0 0 1 98 0Z', x1: 53.03, y1: -53.03, x2: 75, y2: 0 },
  { cor: '#E31B23', d: 'M0 0L69.3 69.3A98 98 0 0 1 0 98Z', x1: 53.03, y1: 53.03, x2: 0, y2: 75 },
  { cor: '#0057A8', d: 'M0 0L-69.3 69.3A98 98 0 0 1 -98 0Z', x1: -53.03, y1: 53.03, x2: -75, y2: 0 },
];

export default function CataventoGMP({ size = 40, modo = 'girando', className = '', title, legenda, legendaDestaque }) {
  const uid = React.useMemo(() => `cv${++seq}`, []);
  const id = (k) => `${uid}-${k}`;
  const temLegenda = Boolean(legenda || legendaDestaque);

  const svg = (
    <svg
      className={`catavento catavento--${modo}${temLegenda ? '' : ` ${className}`}`.trim()}
      viewBox="-100 -100 200 200"
      width={size}
      height={size}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : 'true'}
      focusable="false"
    >
      {title && <title>{title}</title>}
      <defs>
        <radialGradient id={id('fade')} gradientUnits="userSpaceOnUse" cx="0" cy="0" r="100">
          <stop offset=".1" stopColor="#fff" stopOpacity="0" />
          <stop offset=".55" stopColor="#fff" stopOpacity=".9" />
          <stop offset="1" stopColor="#fff" />
        </radialGradient>
        <mask id={id('mask')} maskUnits="userSpaceOnUse" x="-100" y="-100" width="200" height="200">
          <rect x="-100" y="-100" width="200" height="200" fill={`url(#${id('fade')})`} />
        </mask>
        {PAS.map((p, i) => (
          <linearGradient key={i} id={id(`g${i}`)} gradientUnits="userSpaceOnUse" x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2}>
            <stop offset="0" stopColor={p.cor} stopOpacity=".18" />
            <stop offset=".55" stopColor={p.cor} stopOpacity=".85" />
            <stop offset="1" stopColor={p.cor} />
          </linearGradient>
        ))}
      </defs>
      <g className="catavento__rotor">
        <g mask={`url(#${id('mask')})`}>
          {PAS.map((p, i) => <path key={i} fill={`url(#${id(`g${i}`)})`} d={p.d} />)}
        </g>
        {PAS.map((p, i) => <path key={`l${i}`} className="catavento__linha" style={{ stroke: p.cor }} d={p.d} />)}
        <circle className="catavento__cubo" r="7" />
      </g>
    </svg>
  );

  if (!temLegenda) return svg;

  return (
    // --cv-base e o tamanho pedido pela prop; a tela pode sobrepor com --cv-size no CSS
    // (um inline de --cv-size venceria qualquer folha — foi o que travou a tela de modulos em 132px).
    <span className={`catavento-lockup catavento-lockup--${modo} ${className}`.trim()} style={{ '--cv-base': `${size}px` }}>
      {svg}
      {/* A assinatura: revelada da esquerda para a direita (clip-path), como no site;
          os dois tracos embaixo do destaque se desenham depois (stroke-dashoffset). */}
      <span className="catavento__assinatura" aria-hidden="true">
        {legenda && <span className="catavento__assinatura-texto">{legenda} </span>}
        {legendaDestaque && (
          <span className="catavento__assinatura-destaque">
            {legendaDestaque}
            <svg viewBox="0 0 320 24" preserveAspectRatio="none" aria-hidden="true">
              <path className="catavento__traco catavento__traco--a" d="M4 14C70 6 190 2 316 7" />
              <path className="catavento__traco catavento__traco--b" d="M44 20C130 13 222 11 300 14" />
            </svg>
          </span>
        )}
      </span>
    </span>
  );
}
