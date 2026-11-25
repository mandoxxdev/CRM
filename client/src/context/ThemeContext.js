import React, { createContext, useContext, useState, useEffect } from 'react';
import { flushSync } from 'react-dom';

const ThemeContext = createContext({
  theme: 'light',
  toggleTheme: () => {}
});

export const useTheme = () => {
  return useContext(ThemeContext);
};

// Função para obter o tema inicial do localStorage
const getInitialTheme = () => {
  // Verificar se estamos no navegador
  if (typeof window === 'undefined') {
    return 'light';
  }

  try {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark' || savedTheme === 'light') {
      return savedTheme;
    }
  } catch (e) {
    // Ignorar erros
  }
  return 'light'; // Tema padrão
};

// Aplicar tema no DOM imediatamente (antes do React renderizar)
const applyThemeToDOM = (theme) => {
  // Verificar se estamos no navegador
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  try {
    if (document.documentElement) {
      document.documentElement.setAttribute('data-theme', theme);
    }
    if (document.body) {
      if (theme === 'dark') {
        document.body.classList.add('dark-theme');
        document.body.classList.remove('light-theme');
      } else {
        document.body.classList.add('light-theme');
        document.body.classList.remove('dark-theme');
      }
    }
  } catch (e) {
    // Ignorar erros
  }
};

// Aplicar tema inicial imediatamente (apenas no navegador)
if (typeof window !== 'undefined') {
  const initialTheme = getInitialTheme();
  applyThemeToDOM(initialTheme);
}

export const ThemeProvider = ({ children }) => {
  // Obter tema inicial do localStorage
  const [theme, setTheme] = useState(() => getInitialTheme());

  // Aplicar tema quando mudar
  useEffect(() => {
    try {
      localStorage.setItem('theme', theme);
      applyThemeToDOM(theme);
    } catch (e) {
      // Ignorar erros
    }
  }, [theme]);

  // Troca de tema com VARREDURA (24/11/2026). O P.O. comparou a troca claro/escuro
  // com a da referencia (o tema novo entra numa onda que cobre a tela) e a nossa
  // trocava de uma vez. Aqui a troca roda dentro de uma View Transition: o
  // navegador fotografa a tela velha, aplica o tema novo e a CSS
  // (apple-charts.css, "troca de tema") revela a nova por um circulo que cresce a
  // partir do controle que o usuario tocou (o elemento com foco). Onde a API nao
  // existe (Safari antigo) ou o usuario pediu menos movimento, troca como antes.
  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    const doc = typeof document !== 'undefined' ? document : null;
    const reduzMovimento =
      typeof window !== 'undefined' && window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!doc || typeof doc.startViewTransition !== 'function' || reduzMovimento) {
      setTheme(next);
      return;
    }

    let x = window.innerWidth - 40;
    let y = 40;
    const origem = doc.activeElement;
    if (origem && origem !== doc.body) {
      const r = origem.getBoundingClientRect();
      if (r.width > 0) {
        x = r.left + r.width / 2;
        y = r.top + r.height / 2;
      }
    }
    // o raio que cobre a tela inteira a partir da origem
    const raio = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    const raiz = doc.documentElement;
    raiz.style.setProperty('--vt-x', `${x}px`);
    raiz.style.setProperty('--vt-y', `${y}px`);
    raiz.style.setProperty('--vt-r', `${Math.ceil(raio)}px`);

    try {
      doc.startViewTransition(() => {
        flushSync(() => setTheme(next));
        // o efeito acima tambem aplica; aqui garante que a "foto nova" ja saia com o tema.
        applyThemeToDOM(next);
      });
    } catch (e) {
      setTheme(next);
    }
  };

  const value = {
    theme,
    toggleTheme
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

