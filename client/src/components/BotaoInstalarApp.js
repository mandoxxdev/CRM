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

/**
 * O aparelho e de toque?
 *
 * `pointer: coarse` pergunta ao sistema se o apontador principal e impreciso —
 * dedo, nao mouse. E a pergunta certa, e nao a largura da janela: uma janela de
 * navegador estreita no PC continua sendo um PC, e um tablet grande continua
 * sendo um aparelho de toque.
 *
 * Existe porque o botao passou a aparecer no navegador do COMPUTADOR. Quando eu
 * tirei a exigencia de iOS para mostrar a instrucao manual (para atender os
 * Android que nao oferecem a instalacao sozinhos), tirei junto a unica coisa que
 * mantinha o botao fora do desktop. O Orion e instalado no celular dos usuarios;
 * no PC o sistema e usado pelo navegador mesmo, e o convite ali so atrapalha.
 */
const ehAparelhoDeToque = () => (
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(pointer: coarse)').matches
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

  // No computador o botao nao aparece NUNCA — nem com o evento do navegador, que
  // o Chrome de desktop tambem dispara. Ver `ehAparelhoDeToque` acima.
  if (!ehAparelhoDeToque() && !ehIOS()) return null;

  if (instalado || dispensado) return null;

  // Sem o evento do navegador nao ha como saber se o app ja esta instalado, entao o
  // respeito a dispensa de 30 dias e o que evita insistir com quem ja resolveu.
  const dispensadoAte = Number(localStorage.getItem(ADIADO_ATE) || 0);

  // ANTES daqui o botao exigia `ehIOS()` para aparecer sem o evento. O resultado era
  // que em Samsung Internet, Firefox e no proprio Chrome quando os criterios de
  // instalabilidade ainda nao tinham sido satisfeitos, NADA aparecia — e esses
  // aparelhos sao justamente os que nao oferecem a instalacao sozinhos. Agora a
  // ausencia do evento nao esconde o botao: ela troca o que o botao faz, de instalar
  // para ensinar a instalar.
  const mostrarManual = Date.now() > dispensadoAte;

  if (!evento && !mostrarManual) return null;

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
              <h3>{ehIOS() ? 'Instalar no iPhone' : 'Instalar no aparelho'}</h3>
              <button type="button" onClick={() => setMostrarIOS(false)} aria-label="Fechar">
                <FiX />
              </button>
            </div>

            {ehIOS() ? (
              <>
                <p>
                  No iPhone, quem instala é o próprio Safari — o site não consegue fazer
                  isso sozinho. São três toques:
                </p>
                <ol>
                  <li>
                    Toque em <FiShare aria-hidden="true" /> <strong>Compartilhar</strong>, na
                    barra de baixo do Safari.
                  </li>
                  <li>Role e escolha <strong>Adicionar à Tela de Início</strong>.</li>
                  <li>Confirme em <strong>Adicionar</strong>.</li>
                </ol>
                <p className="bia-nota">
                  Precisa ser pelo <strong>Safari</strong>. Pelo Chrome do iPhone a opção
                  não existe.
                </p>
              </>
            ) : (
              <>
                <p>
                  Este navegador não oferece a instalação automática. Dá para instalar pelo
                  menu dele:
                </p>
                <ol>
                  <li>
                    Abra o menu do navegador — <strong>⋮</strong> no Chrome,{' '}
                    <strong>☰</strong> no Samsung Internet.
                  </li>
                  <li>
                    Escolha <strong>Instalar aplicativo</strong> ou{' '}
                    <strong>Adicionar à tela inicial</strong>.
                  </li>
                  <li>Confirme em <strong>Instalar</strong>.</li>
                </ol>
                <p className="bia-nota">
                  Se a opção não aparecer, abra <strong>systemgmp.online</strong> pelo
                  <strong> Chrome</strong> — é onde ela sempre existe.
                </p>
              </>
            )}
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
