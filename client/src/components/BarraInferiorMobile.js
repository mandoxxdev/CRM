import React from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { FiMoreHorizontal } from 'react-icons/fi';
import './BarraInferiorMobile.css';

/**
 * Barra de navegação inferior — só no celular.
 *
 * No desktop a navegação é a sidebar. No celular ela virava uma gaveta atrás de um ícone de
 * hambúrguer no canto, que é o padrão de *site*, não de aplicativo: dois toques para ir a
 * qualquer lugar e o alvo no topo da tela, longe do polegar. A barra de baixo troca isso por
 * um toque, na parte da tela que a mão alcança.
 *
 * **Os itens são os MESMOS `menuItems` da sidebar.** Isso não é economia de código, é a regra:
 * o menu já respeita módulo e permissão do usuário, e uma segunda lista aqui divergiria — a
 * barra mostraria uma tela que a pessoa não pode abrir, ou esconderia uma que ela usa.
 *
 * Cabem 4 destinos mais o "Menu". O corte não esconde nada: o que não coube continua na
 * gaveta, que o quinto botão abre.
 *
 * **Por que um portal para o `body`, e não a árvore normal.** A primeira versão renderizava
 * dentro de `.main-content`, e no iPad a barra apareceu no TOPO, rolando com a página. O
 * motivo, medido depois: `.layout` tem `overflow: hidden` e `.main-content` tem
 * `overflow-y: auto` — ou seja, a barra estava dentro de um container de ROLAGEM, e é
 * justamente aí que o WebKit trata `position: fixed` como se não fosse fixo. O portal tira a
 * barra de qualquer ancestral com overflow e o `fixed` volta a se ancorar na viewport, em
 * todos os navegadores.
 */

const MAX_ATALHOS = 4;

const BarraInferiorMobile = ({ itens = [], aoAbrirMenu, chatUnread = 0, menuAberto = false }) => {
  const location = useLocation();

  if (itens.length === 0) return null;

  const atalhos = itens.slice(0, MAX_ATALHOS);

  // Mesma regra de "ativo" da sidebar: caminho exato, ou prefixo seguido de barra. Sem o
  // `+ '/'`, `/compras` acenderia junto com `/compras-especiais`.
  const estaAtivo = (path) => (
    location.pathname === path || location.pathname.startsWith(`${path}/`)
  );

  const barra = (
    <nav className="bim" aria-label="Navegação principal">
      {atalhos.map((item) => {
        const Icon = item.icon;
        const ativo = estaAtivo(item.path);
        return (
          <Link
            key={item.path}
            to={item.path}
            className={`bim-item${ativo ? ' bim-ativo' : ''}`}
            aria-current={ativo ? 'page' : undefined}
          >
            <span className="bim-icone">
              <Icon />
              {item.path === '/chat' && chatUnread > 0 && (
                <em className="bim-badge">{chatUnread > 9 ? '9+' : chatUnread}</em>
              )}
            </span>
            <span className="bim-rotulo">{item.label}</span>
          </Link>
        );
      })}

      <button
        type="button"
        className={`bim-item${menuAberto ? ' bim-ativo' : ''}`}
        onClick={aoAbrirMenu}
        aria-expanded={menuAberto}
      >
        <span className="bim-icone"><FiMoreHorizontal /></span>
        <span className="bim-rotulo">Menu</span>
      </button>
    </nav>
  );

  return createPortal(barra, document.body);
};

export default BarraInferiorMobile;
