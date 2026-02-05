import React, { createContext, useContext, useState, useEffect } from 'react';

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

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
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

