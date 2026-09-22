/* Regua de tela — mede o app RENDERIZADO num telefone de 360px.
 *
 * Por que existe, alem do `verificar-mobile.js`:
 *
 *   `verificar-mobile.js` le CSS. Pega familia de defeito que aparece no
 *   fonte (largura fixa, grade fixa, blur em movimento). Nao ve o que so
 *   existe depois que o navegador calculou o layout com o dado real.
 *
 *   Esta regua roda DENTRO da pagina. Foi escrita depois que o P.O.
 *   fotografou o Almoxarifado com "Giro / de / estoque" — uma palavra por
 *   linha — numa tela que a minha varredura anterior tinha dado como limpa.
 *   O motivo do ponto cego: eu so media ESTOURO horizontal. Texto espremido
 *   nao estoura nada. Ele cabe. So fica ilegivel.
 *
 * Uso (colar na pagina, com a janela em 360px):
 *   reguaTela.medir()          -> defeitos da tela atual
 *   await reguaTela.varrer()   -> navega por tudo que alcanca e mede
 *
 * Toda regua nova entra junto com um CONTROLE POSITIVO em `autoTeste()`:
 * um detector que nunca acusa e indistinguivel de uma tela limpa, e foi
 * exatamente assim que o Almoxarifado passou como limpo.
 */
(function () {
  'use strict';

  var LARGURA = 360;
  var medidor = document.createElement('canvas').getContext('2d');

  function fonteDe(c) {
    return c.fontWeight + ' ' + c.fontSize + ' ' + c.fontFamily;
  }
  // Quantas linhas o texto REALMENTE ocupa.
  //
  // A primeira versao dividia a altura da caixa pela altura de linha. Errado:
  // um botao com `min-height: 44px` e uma linha de texto dava 44/17 = 3, e a
  // regua acusou doze botoes de Relatorios que estavam perfeitos — todos com
  // `white-space: nowrap`, incapazes de quebrar.
  //
  // `Range` devolve um retangulo por CAIXA DE LINHA de verdade. Nao depende
  // de padding, de min-height nem de line-height declarado.
  function linhasDe(el, c, r) {
    try {
      var faixa = document.createRange();
      faixa.selectNodeContents(el);
      var caixas = faixa.getClientRects();
      if (caixas.length) {
        // Linhas distintas = topos distintos (um rect por fragmento inline).
        var topos = {};
        for (var i = 0; i < caixas.length; i++) topos[Math.round(caixas[i].top)] = 1;
        return Object.keys(topos).length;
      }
    } catch (e) { /* cai no calculo aproximado */ }
    var lh = parseFloat(c.lineHeight) || parseFloat(c.fontSize) * 1.2;
    return Math.max(1, Math.round(r.height / lh));
  }
  function visivel(c, r) {
    return c.display !== 'none' && c.visibility !== 'hidden' &&
           parseFloat(c.opacity) > 0.05 && r.width > 3 && r.height > 3;
  }

  /* ── As reguas ────────────────────────────────────────────────────────── */

  // ESPREMIDO: o defeito do Almoxarifado. Largura menor que a maior palavra,
  // ou quase uma linha por palavra. Nao estoura nada; so fica ilegivel.
  function espremido(el, c, r, txt) {
    if (txt.length < 8 || !/\s/.test(txt)) return null;
    // Dentro de um SVG o texto e escalado pelo `viewBox`, e a fonte
    // computada nao descreve o tamanho desenhado: medir com canvas da
    // numero sem sentido. Em `/almoxarifado/mapa` foram doze acusacoes
    // ("Corredor A cabe em 20px") de rotulos que na tela estao inteiros.
    // O estouro continua valendo ali, porque e retangulo, nao fonte.
    if (el.ownerSVGElement) return null;
    // Reticencias sao escolha de desenho, nao defeito: o usuario ve que o
    // texto continua. Quem corta sem avisar e a regra `cortado`.
    if (c.textOverflow === 'ellipsis') return null;
    medidor.font = fonteDe(c);
    var palavras = txt.split(/\s+/);
    var maior = 0;
    for (var i = 0; i < palavras.length; i++) {
      maior = Math.max(maior, medidor.measureText(palavras[i]).width);
    }
    // Texto que nao pode quebrar nunca esta "espremido em varias linhas".
    if (c.whiteSpace === 'nowrap' || c.whiteSpace === 'pre') {
      return r.width < maior * 1.05 ? 'ESPREMIDO: nowrap em ' + Math.round(r.width) + 'px' : null;
    }
    var linhas = linhasDe(el, c, r);
    if (r.width < maior * 1.05) {
      return 'ESPREMIDO: cabe ' + Math.round(r.width) + 'px, a maior palavra pede ' + Math.round(maior) + 'px';
    }
    if (palavras.length >= 3 && linhas >= palavras.length * 0.8) {
      return 'ESPREMIDO: ' + palavras.length + ' palavras em ' + linhas + ' linhas';
    }
    return null;
  }

  // CORTADO: `overflow: hidden` escondendo texto SEM reticencias. Com
  // reticencias o usuario ao menos sabe que falta; sem elas, a frase
  // simplesmente termina no meio e parece completa.
  function cortado(el, c, txt) {
    if (!txt) return null;
    var esconde = c.overflowX === 'hidden' || c.overflow === 'hidden';
    if (!esconde || c.textOverflow === 'ellipsis') return null;
    if (el.scrollWidth > el.clientWidth + 2) {
      return 'CORTADO: ' + (el.scrollWidth - el.clientWidth) + 'px escondidos, sem reticencias';
    }
    return null;
  }

  // Um antepassado que rola de lado de proposito (`overflow-x: auto`) torna
  // legitimo tudo que passa da tela dentro dele. E o padrao de "trilho que
  // se arrasta": o stepper de `/almoxarifado/requisicoes` tem seis etapas
  // que somam 688px dentro de um trilho de 322px — e para arrastar, nao e
  // defeito. A primeira versao da regua acusou as seis.
  function dentroDeRolador(el) {
    for (var p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      var ox = getComputedStyle(p).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
    }
    return false;
  }

  // ESTOURO: o que eu ja media antes. Conteudo passando da largura da tela.
  function estouro(el, c, r) {
    if (c.position === 'fixed') return null;
    if (el.closest('[aria-hidden="true"]')) return null;
    if (r.right > LARGURA + 1 && r.width <= LARGURA) {
      if (dentroDeRolador(el)) return null;
      return 'ESTOURO: termina em ' + Math.round(r.right) + 'px';
    }
    return null;
  }

  /* CONTRASTE BAIXO ────────────────────────────────────────────────────────
   * O dado mais importante da tela sendo o menos legivel ja aconteceu duas
   * vezes aqui: o numero principal do Dashboard media 2,30, e os rotulos do
   * Mapa de Areas 2,41 — cinza claro sobre cartao quase branco. Nenhuma das
   * outras reguas ve isso: o texto cabe, nao estoura e nao e cortado.
   *
   * WCAG pede 4,5 para texto normal e 3 para texto grande (>=24px, ou >=19px
   * em negrito). Uso esses dois limites.
   *
   * Honestidade da medida: se qualquer camada acima tiver imagem ou
   * gradiente de fundo, eu NAO sei a cor que foi pintada e devolvo nulo em
   * vez de chutar. Chutar branco foi o que fez a primeira versao acusar os
   * rotulos do SVG do mapa de "branco sobre branco".
   */
  function canal(cor) {
    var m = cor && cor.match(/[\d.]+/g);
    if (!m) return null;
    return { r: +m[0], g: +m[1], b: +m[2], a: m[3] === undefined ? 1 : +m[3] };
  }
  function luminancia(c) {
    function f(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }
  function fundoPintado(el) {
    var pilha = [];
    for (var p = el; p && p !== document.documentElement; p = p.parentElement) {
      var c = getComputedStyle(p);
      if (c.backgroundImage && c.backgroundImage !== 'none') return null; // nao da para saber
      var cor = canal(c.backgroundColor);
      if (cor && cor.a > 0) {
        pilha.push(cor);
        if (cor.a >= 0.999) break;
      }
    }
    if (!pilha.length) return null;
    // Compoe de tras para frente sobre o que ja e opaco.
    var base = pilha[pilha.length - 1];
    if (base.a < 0.999) return null;
    var out = base;
    for (var i = pilha.length - 2; i >= 0; i--) {
      var t = pilha[i];
      out = {
        r: t.r * t.a + out.r * (1 - t.a),
        g: t.g * t.a + out.g * (1 - t.a),
        b: t.b * t.a + out.b * (1 - t.a),
        a: 1
      };
    }
    return out;
  }
  function contrasteBaixo(el, c, txt) {
    if (!txt || txt.length < 3) return null;
    var frente = canal(c.color);
    var fundo = fundoPintado(el);
    if (!frente || !fundo || frente.a < 0.95) return null;

    var lf = luminancia(frente), lb = luminancia(fundo);
    var razao = (Math.max(lf, lb) + 0.05) / (Math.min(lf, lb) + 0.05);

    var tam = parseFloat(c.fontSize);
    var negrito = parseInt(c.fontWeight, 10) >= 700;
    var grande = tam >= 24 || (tam >= 19 && negrito);
    var exigido = grande ? 3 : 4.5;

    if (razao >= exigido) return null;
    return 'CONTRASTE ' + razao.toFixed(2) + ' (pede ' + exigido + ')';
  }

  // ALVO PEQUENO: controle menor que 40px. O dedo nao acerta.
  //
  // Um checkbox nativo mede 16px e nao ha CSS que mude isso de verdade — mas
  // quando ele esta dentro de um `<label>`, o alvo de toque e o rotulo
  // inteiro, porque tocar no texto marca a caixa. Em `materiais/novo` sao
  // rotulos de 110x64px; a primeira versao da regua acusou os dezessete.
  function alvoPequeno(el, r) {
    if (!el.matches('button, a[href], [role="button"], input[type="checkbox"], input[type="radio"], select')) return null;
    var rotulo = el.closest('label');
    if (!rotulo && el.id) rotulo = document.querySelector('label[for="' + el.id + '"]');

    // O alvo e o MAIOR dos dois, nunca o rotulo sozinho: um `<label>` que
    // envolve um `<select>` pode ser `display: inline` e devolver so a caixa
    // de linha do texto (medido: 110x19 em volta de um select de 198x44).
    // Trocar um pelo outro transformou 11 controles bons em acusacao.
    var alvoL = Math.max(r.width, rotulo ? rotulo.getBoundingClientRect().width : 0);
    var alvoA = Math.max(r.height, rotulo ? rotulo.getBoundingClientRect().height : 0);

    // 39,5 e nao 40: o retangulo vem em subpixel e um botao com `width: 40px`
    // computado pode medir 39,4. Acusar isso e acusar arredondamento, nao
    // defeito — perdi uma rodada inteira "consertando" um botao que ja
    // estava no tamanho certo.
    if (alvoL >= 39.5 && alvoA >= 39.5) return null;
    if (alvoA < 12) return null;   // provavel link dentro de texto corrido
    return 'ALVO PEQUENO: ' + Math.round(alvoL) + 'x' + Math.round(alvoA) + 'px';
  }

  function medir() {
    var achados = [];
    var todos = document.querySelectorAll('body *');
    for (var i = 0; i < todos.length; i++) {
      var el = todos[i];
      if (el.closest('.agfx')) continue;            // fundo decorativo
      // `<option>` e desenhado pelo sistema operacional, nao pelo CSS da
      // pagina: medir a largura dele nao diz nada sobre o que o usuario ve.
      // Foram doze acusacoes falsas em `/almoxarifado/mapa`.
      if (el.tagName === 'OPTION' || el.tagName === 'OPTGROUP') continue;
      // A atribuicao do Leaflet ("Leaflet | OpenStreetMap") e um controle de
      // terceiro, exigido por licenca e desenhado de proposito para ser
      // discreto. Nao e conteudo do software e nao cabe a mim reestiliza-lo.
      if (el.closest('.leaflet-control-attribution')) continue;
      // Os avisos flutuantes (toast) entram e saem sozinhos e se EMPILHAM
      // durante uma varredura, porque ninguem os dispensa. Contei 13, 24,
      // 36... 108 achados em rotas seguidas, crescendo sempre: nao era o app
      // piorando, era a minha propria varredura sujando a medida. Numero que
      // so cresce com o tempo de teste e sinal de contaminacao, nao de bug.
      if (el.closest('.Toastify')) continue;
      // A tela de abertura e uma sobreposicao transitoria: ela cobre o app
      // por instantes e some. Medi-la nao diz nada sobre a tela que o
      // usuario vai usar — e como ela remonta a cada modulo, sujava a
      // varredura inteira do Comercial.
      if (el.closest('.splash-screen')) continue;
      // Decoracao pura: sem texto, posicionada fora do fluxo e desfocada.
      // Sao os halos da tela de abertura, que ficam montados por um instante
      // e "estouram" 510px de proposito — o desfoque precisa vazar. Medi o
      // app enquanto a abertura ainda estava na tela e contei seis telas
      // sujas por isso.
      if (!(el.textContent || '').trim()) {
        var cc = getComputedStyle(el);
        if (cc.filter && cc.filter.indexOf('blur') !== -1 &&
            (cc.position === 'absolute' || cc.position === 'fixed')) continue;
      }
      var c = getComputedStyle(el);
      var r = el.getBoundingClientRect();
      if (!visivel(c, r)) continue;

      var folha = el.children.length === 0;
      var txt = folha ? (el.textContent || '').trim() : '';
      var problemas = [];

      if (folha) {
        problemas.push(espremido(el, c, r, txt));
        problemas.push(cortado(el, c, txt));
        problemas.push(contrasteBaixo(el, c, txt));
      }
      problemas.push(estouro(el, c, r));
      problemas.push(alvoPequeno(el, r));

      for (var j = 0; j < problemas.length; j++) {
        if (!problemas[j]) continue;
        achados.push({
          onde: String(el.className).split(' ')[0] || el.tagName.toLowerCase(),
          texto: (txt || el.textContent || '').trim().slice(0, 30),
          problema: problemas[j]
        });
      }
    }
    return achados;
  }

  /* ── Auto-teste: controle positivo E negativo ─────────────────────────── */
  //
  // Positivo: uma regua que nunca acusa e indistinguivel de uma tela limpa —
  // foi assim que o Almoxarifado passou como limpo. Planto um defeito de cada
  // familia e confiro que ela ve os tres.
  //
  // Negativo: uma regua que acusa tudo tambem nao serve, e custa pior — manda
  // consertar o que esta certo. A primeira versao desta regua acusou doze
  // botoes de Relatorios de "3 palavras em 3 linhas" quando todos tinham
  // `nowrap` e uma linha so; ela estava dividindo `min-height: 44px` pela
  // altura de linha. Os casos abaixo sao tudo o que ela NAO pode acusar.
  function autoTeste() {
    var caixa = document.createElement('div');
    caixa.style.cssText = 'position:fixed;top:0;left:0;z-index:-1';
    caixa.innerHTML =
      // devem ser acusados
      '<div class="cp-espremido" style="width:27px;font:600 12px system-ui">Giro de estoque</div>' +
      '<div class="cp-cortado" style="width:40px;overflow:hidden;white-space:nowrap;font:12px system-ui">texto bem maior que a caixa</div>' +
      '<button class="cp-alvo" style="width:20px;height:20px;padding:0;min-height:0">x</button>' +
      // NAO podem ser acusados
      '<button class="cn-botao-ok" style="width:145px;min-height:44px;padding:12px 20px;white-space:nowrap;font:12px system-ui">Materiais sem endereço</button>' +
      '<div class="cn-texto-ok" style="width:280px;font:12px system-ui">Uma frase inteira que cabe sem aperto nenhum</div>' +
      '<div class="cn-reticencias" style="width:40px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:12px system-ui">texto longo com reticencias</div>' +
      '<div style="width:100px;overflow-x:auto"><div class="cn-trilho" style="width:700px;font:12px system-ui">etapas de um trilho que se arrasta</div></div>' +
      '<label class="cn-rotulo" style="display:flex;align-items:center;gap:8px;width:110px;height:64px;font:12px system-ui"><input type="checkbox" class="cn-caixa"><span>Controla lote</span></label>' +
      '<select class="cn-lista" style="width:198px;height:44px"><option class="cn-opcao">Corredor A</option></select>' +
      '<div style="background:#ffffff"><span class="cp-contraste" style="color:#a7a7a7;font:12px system-ui">rotulo cinza claro</span></div>' +
      '<div style="background:#ffffff"><span class="cn-contraste-ok" style="color:#14182B;font:12px system-ui">texto escuro legivel</span></div>' +
      '<div style="background-image:linear-gradient(#fff,#000)"><span class="cn-sobre-gradiente" style="color:#888;font:12px system-ui">nao da para saber a cor do fundo</span></div>';
    document.body.appendChild(caixa);
    var vistos = medir().map(function (a) { return a.onde; });
    caixa.remove();

    var cega = ['cp-espremido', 'cp-cortado', 'cp-alvo', 'cp-contraste'].filter(function (k) {
      return vistos.indexOf(k) === -1;
    });
    if (cega.length) throw new Error('CONTROLE POSITIVO FALHOU, regua cega para: ' + cega.join(', '));

    var ruidosa = ['cn-botao-ok', 'cn-texto-ok', 'cn-reticencias', 'cn-trilho', 'cn-caixa', 'cn-opcao', 'cn-contraste-ok', 'cn-sobre-gradiente'].filter(function (k) {
      return vistos.indexOf(k) !== -1;
    });
    if (ruidosa.length) throw new Error('CONTROLE NEGATIVO FALHOU, regua acusa o que esta certo: ' + ruidosa.join(', '));
    return true;
  }

  /* ── Navegacao ────────────────────────────────────────────────────────── */
  // O app e uma SPA: trocar `location.href` recarrega tudo e perde a sessao.
  // `pushState` + `popstate` e como o React Router ouve a mudanca de rota.
  function ir(rota) {
    history.pushState({}, '', rota);
    dispatchEvent(new PopStateEvent('popstate'));
  }
  function esperar(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  function rotasVisiveis() {
    var hrefs = [].map.call(document.querySelectorAll('a[href^="/"]'), function (a) {
      return a.getAttribute('href');
    });
    return hrefs.filter(function (h, i) {
      return h && h !== '/login' && h.indexOf(':') === -1 && hrefs.indexOf(h) === i;
    });
  }

  // A tela de abertura cobre o app por alguns segundos. Medir por cima dela
  // nao mede nada do que interessa.
  async function esperarAbertura() {
    for (var i = 0; i < 20; i++) {
      if (!document.querySelector('.splash-screen')) return true;
      await esperar(250);
    }
    return false;   // desisti de esperar; a medicao segue, marcada abaixo
  }

  async function varrer(rotas, pausa) {
    autoTeste();
    await esperarAbertura();
    rotas = rotas || rotasVisiveis();
    var relatorio = [];
    for (var i = 0; i < rotas.length; i++) {
      // Some com o que sobrou da rota anterior antes de medir a proxima.
      var sujeira = document.querySelector('.Toastify');
      if (sujeira) sujeira.innerHTML = '';
      ir(rotas[i]);
      await esperar(pausa || 900);
      // Esperar a abertura sair vale por ROTA, nao so no comeco: cada modulo
      // remonta a sua. Sem isto eu media o app por baixo de uma cortina.
      await esperarAbertura();
      var a = medir();
      if (a.length) relatorio.push({ rota: rotas[i], quantos: a.length, achados: a.slice(0, 8) });
    }
    return relatorio;
  }

  window.reguaTela = {
    medir: medir,
    varrer: varrer,
    autoTeste: autoTeste,
    ir: ir,
    rotasVisiveis: rotasVisiveis
  };
})();
