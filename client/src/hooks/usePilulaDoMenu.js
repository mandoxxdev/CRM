import { useLayoutEffect } from 'react';

// A pilula do menu que DESLIZA ate o item ativo (25/11/2026) — na referencia a
// pilula escura da navegacao escorrega de "Overview" para "Manage"; aqui ela vai de
// uma linha da barra lateral para a outra. O CSS (apple-motion.css) desenha a pilula
// num ::before do <nav> e tira o fundo do item ativo quando o nav tem `data-pilula`;
// este gancho so mede onde o ativo esta e grava --pilula-y/--pilula-h/--pilula-o.
//
// Se nada for medido (celular, nenhum ativo, nav sem o atributo), o item ativo
// continua com a pilula estatica de sempre — nada depende do JavaScript para ler.
export default function usePilulaDoMenu(navRef, seletorAtivo, dependencias) {
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return undefined;

    const medir = () => {
      const ativo = nav.querySelector(seletorAtivo);
      const desktop = window.innerWidth >= 769;
      if (!ativo || !desktop) {
        nav.style.setProperty('--pilula-o', '0');
        return;
      }
      nav.setAttribute('data-pilula', '1');
      // Posicao RELATIVA AO NAV pelos retangulos, nao offsetTop: na Fabrica o link mora
      // num .mes-nav-item posicionado, e o offsetTop dava 0 para todos (pilula presa no topo).
      const r = ativo.getBoundingClientRect();
      const n = nav.getBoundingClientRect();
      nav.style.setProperty('--pilula-y', `${Math.round(r.top - n.top + nav.scrollTop)}px`);
      nav.style.setProperty('--pilula-h', `${Math.round(r.height)}px`);
      nav.style.setProperty('--pilula-o', '1');
    };

    medir();
    // de novo apos o primeiro quadro: a fonte e o layout podem ter mudado a altura
    const quadro = requestAnimationFrame(medir);
    window.addEventListener('resize', medir);
    let fontes;
    if (document.fonts && document.fonts.ready) {
      fontes = document.fonts.ready.then(medir).catch(() => {});
    }
    return () => {
      cancelAnimationFrame(quadro);
      window.removeEventListener('resize', medir);
      void fontes;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navRef, seletorAtivo, ...(dependencias || [])]);
}
