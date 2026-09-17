import React, { useState, useEffect } from 'react';
import { FiDownload, FiX, FiShare } from 'react-icons/fi';
import './BotaoInstalarApp.css';

/**
 * Botão "Instalar aplicativo".
 *
 * Sem ele, a única forma de instalar o PWA é o menu ⋮ do Chrome — que ninguém no chão de
 * fábrica vai procurar. O botão aparece só quando faz sentido:
 *
 *  - **Já instalado** → não aparece. A checagem é `display-mode: standalone` (e
 *    `navigator.standalone`, que é como o iOS responde).
 *  - **Android/Chrome** → o navegador dispara `beforeinstallprompt` quando os critérios de
 *    instalabilidade estão satisfeitos. Guardamos o evento e o botão o dispara no clique.
 *    O evento é de uso ÚNICO: depois de chamado, tem de ser descartado.
 *  - **iPhone** → o Safari não tem `beforeinstallprompt` e não existe API de instalação.
 *    O único caminho é Compartilhar → "Adicionar à Tela de Início", então ali o botão abre
 *    as instruções em vez de fingir que instala.
 *  - **Desktop / navegador sem suporte** → nada aparece.
 */

const ADIADO_ATE = 'orion-instalar-adiado-ate';

const estaInstalado = () => (
  window.matchMedia('(display-mode: standalone)').matches
  || window.matchMedia('(display-mode: minimal-ui)').matches
  || window.navigator.standalone === true
);

const ehIOS = () => (
  /iphone|ipad|ipod/i.test(window.navigator.userAgent)
  // iPad recente se declara como Mac; o toque é o que o entrega.
  || (/macintosh/i.test(window.navigator.userAgent) && navigator.maxTouchPoints > 1)
);

const BotaoInstalarApp = ({ compacto = false }) => {
  const [evento, setEvento] = useState(null);
  const [mostrarIOS, setMostrarIOS] = useState(false);
  const [instalado, setInstalado] = useState(estaInstalado);
  // Separado de `instalado` de proposito: dispensar nao e instalar. Reusar o mesmo estado
  // mentiria sobre a situacao e ainda desligaria o listener de `beforeinstallprompt`,
  // porque o efeito depende dele.
  const [dispensado, setDispensado] = useState(false);

  useEffect(() => {
    if (instalado) return undefined;

    const aoPoderInstalar = (e) => {
      // Sem o preventDefault o Chrome mostra a barra dele, e ficariam dois convites na tela.
      e.preventDefault();
      setEvento(e);
    };
    const aoInstalar = () => { setInstalado(true); setEvento(null); };

    window.addEventListener('beforeinstallprompt', aoPoderInstalar);
    window.addEventListener('appinstalled', aoInstalar);
    return () => {
      window.removeEventListener('beforeinstallprompt', aoPoderInstalar);
      window.removeEventListener('appinstalled', aoInstalar);
    };
  }, [instalado]);

  const instalar = async () => {
    if (!evento) return;
    evento.prompt();
    try {
      await evento.userChoice;
    } catch (e) {
      /* o usuário fechou; nada a fazer */
    }
    // Uso único: o mesmo evento não pode ser disparado duas vezes.
    setEvento(null);
  };

  if (instalado || dispensado) return null;

  // No iPhone o botão só aparece se o usuário não tiver dispensado nos últimos 30 dias —
  // não há evento do sistema para saber se já instalou, então o respeito à dispensa é o
  // que evita insistir com quem já resolveu.
  const iosDispensadoAte = Number(localStorage.getItem(ADIADO_ATE) || 0);
  const mostrarNoIOS = ehIOS() && Date.now() > iosDispensadoAte;

  if (!evento && !mostrarNoIOS) return null;

  const dispensarIOS = () => {
    try {
      localStorage.setItem(ADIADO_ATE, String(Date.now() + 30 * 24 * 60 * 60 * 1000));
    } catch (e) { /* modo privado: só não lembra */ }
    setMostrarIOS(false);
    setDispensado(true);
  };

  return (
    <>
      <button
        type="button"
        className={`bia-botao${compacto ? ' bia-compacto' : ''}`}
        onClick={() => (evento ? instalar() : setMostrarIOS(true))}
        title="Instalar o Orion como aplicativo no aparelho"
      >
        <FiDownload />
        {!compacto && <span>Instalar aplicativo</span>}
      </button>

      {mostrarIOS && (
        <div className="bia-overlay" onClick={() => setMostrarIOS(false)}>
          <div className="bia-modal" onClick={(e) => e.stopPropagation()}>
            <div className="bia-modal-topo">
              <h3>Instalar no iPhone</h3>
              <button type="button" onClick={() => setMostrarIOS(false)} aria-label="Fechar">
                <FiX />
              </button>
            </div>
            <p>
              No iPhone, quem instala é o próprio Safari — o site não consegue fazer isso
              sozinho. São três toques:
            </p>
            <ol>
              <li>
                Toque em <FiShare aria-hidden="true" /> <strong>Compartilhar</strong>, na barra
                de baixo do Safari.
              </li>
              <li>Role e escolha <strong>Adicionar à Tela de Início</strong>.</li>
              <li>Confirme em <strong>Adicionar</strong>.</li>
            </ol>
            <p className="bia-nota">
              Precisa ser pelo <strong>Safari</strong>. Pelo Chrome do iPhone a opção não existe.
            </p>
            <div className="bia-modal-acoes">
              <button type="button" className="bia-secundario" onClick={dispensarIOS}>
                Não mostrar de novo
              </button>
              <button type="button" className="bia-primario" onClick={() => setMostrarIOS(false)}>
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default BotaoInstalarApp;
