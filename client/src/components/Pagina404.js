import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiHome, FiCompass } from 'react-icons/fi';
import './Pagina404.css';

/**
 * Página 404.
 *
 * Antes desta rota, um endereço desconhecido no nível de cima (`/qualquercoisa`)
 * não casava com nenhuma rota e o React Router renderizava NADA — tela branca,
 * sem mensagem e sem saída. Os `path="*"` que já existiam são internos de cada
 * módulo (`/compras/*` cai na lista de compras), então nenhum deles cobria esse
 * caso.
 *
 * Duas decisões de conteúdo:
 *
 *  - O endereço tentado aparece na tela. Quando alguém chega aqui por um link
 *    velho de WhatsApp ou por um favorito quebrado, é esse texto que a pessoa
 *    manda no chamado — sem ele o suporte começa perguntando "qual link?".
 *  - "Voltar" usa o histórico e só cai no início quando não há para onde voltar
 *    (link aberto de fora, aba nova). Mandar todo mundo para o início perde o
 *    lugar de quem só errou um clique.
 */
const Pagina404 = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // history.length === 1 significa que esta é a primeira página da aba: não há
  // para onde voltar, e um navigate(-1) sairia do sistema.
  const temParaOndeVoltar = window.history.length > 1;

  return (
    <div className="p404">
      <div className="p404-cartao">
        <div className="p404-numero" aria-hidden="true">
          <span>4</span>
          <FiCompass className="p404-bussola" />
          <span>4</span>
        </div>

        <h1>Esta página não existe</h1>
        <p>
          O endereço pode ter mudado de lugar, ou o link que trouxe você até aqui
          está desatualizado.
        </p>

        <p className="p404-endereco">
          <span>Endereço tentado</span>
          <code>{location.pathname}</code>
        </p>

        <div className="p404-acoes">
          {temParaOndeVoltar && (
            <button type="button" className="p404-btn" onClick={() => navigate(-1)}>
              <FiArrowLeft /> Voltar
            </button>
          )}
          <Link to="/" className="p404-btn p404-btn-primario">
            <FiHome /> Ir para o início
          </Link>
        </div>

        <p className="p404-nota">
          Se você chegou aqui por um link do próprio sistema, avise a TI com o
          endereço acima — é um link quebrado que dá para consertar.
        </p>
      </div>
    </div>
  );
};

export default Pagina404;
