import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FiSettings, FiMoon, FiSun, FiX } from 'react-icons/fi';
import { useTheme } from '../context/ThemeContext';
import './PreferenciasMenu.css';

// "Fundo Animado" saiu deste menu (24/11/2026): desde o tema Apple o fundo animado
// nao e mais desenhado em tela nenhuma, entao o interruptor nao fazia nada ("esse
// botao nao tem serventia"). A preferencia continua gravada em localStorage para
// quem ja a tinha, e o Layout ainda a le — so nao ha mais o que ligar.
const PreferenciasMenu = () => {
  const [aberto, setAberto] = useState(false);
  const botaoRef = useRef(null);
  const menuRef = useRef(null);
  const { theme, toggleTheme } = useTheme();

  // Fechar ao clicar fora
  useEffect(() => {
    if (!aberto) return;
    
    const fecharAoClicarFora = (e) => {
      if (botaoRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target)) return;
      setAberto(false);
    };
    
    const timer = setTimeout(() => {
      document.addEventListener('click', fecharAoClicarFora);
    }, 100);
    
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', fecharAoClicarFora);
    };
  }, [aberto]);

  const abrirMenu = () => {
    setAberto(prev => !prev);
  };

  const fecharMenu = () => {
    setAberto(false);
  };

  const alternarTema = () => {
    toggleTheme();
  };

  // Aplicar posição diretamente no elemento
  useEffect(() => {
    if (aberto && menuRef.current) {
      const sidebar = document.querySelector('.sidebar');
      const sidebarWidth = sidebar ? sidebar.offsetWidth : 280;
      menuRef.current.style.left = `${sidebarWidth + 20}px`;
      menuRef.current.style.top = '150px';
      menuRef.current.style.right = 'auto';
      menuRef.current.style.position = 'fixed';
    }
  }, [aberto]);

  const menuContent = aberto ? (
    <div
      ref={menuRef}
      className="dropdown-preferencias"
      style={{ 
        position: 'fixed',
        top: '150px',
        left: '300px',
        right: 'auto',
        zIndex: 99999
      }}
    >
      <div className="header-preferencias">
        <h3>Preferências</h3>
        <button className="fechar-preferencias" onClick={fecharMenu}>
          <FiX />
        </button>
      </div>
      <div className="conteudo-preferencias">
        <div className="item-preferencia">
          <div className="label-preferencia">
            {theme === 'dark' ? <FiMoon /> : <FiSun />}
            <span>Tema {theme === 'dark' ? 'Escuro' : 'Claro'}</span>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={theme === 'dark'}
              onChange={alternarTema}
            />
            <span className="slider"></span>
          </label>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className="menu-preferencias">
      <button
        ref={botaoRef}
        className="botao-preferencias"
        onClick={abrirMenu}
        type="button"
        title="Preferências"
      >
        <FiSettings />
      </button>

      {aberto && createPortal(menuContent, document.body)}
    </div>
  );
};

export default PreferenciasMenu;
