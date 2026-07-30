import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { FiSave, FiClock, FiX, FiDownload, FiRefreshCw, FiImage } from 'react-icons/fi';
import api from '../../services/api';
import HistoricoEdicoes from './HistoricoEdicoes';
import {
  lerClausulasDoSource,
  sincronizarCampoParaSource,
  moverClausulaNoSource,
  removerClausulaDoSource,
  adicionarClausulaAoSource,
  atualizarKeyNoSource,
  diffClausulas,
  htmlParaTexto,
  renumerarClausulas,
  ehClausulaNovaVazia,
} from './clausulasInlineEditor';
import { aplicarMascaraNoNoEditavel } from '../../utils/telefoneContentEditable';
import './PropostaPreviewEditavel.css';

const CAMPOS_EDITAVEIS = [
  { campo: 'cliente_nome', label: 'Nome/Razão Social', seletor: '[data-edit="cliente_nome"]' },
  { campo: 'cliente_email', label: 'E-mail', seletor: '[data-edit="cliente_email"]' },
  { campo: 'cliente_telefone', label: 'Telefone', seletor: '[data-edit="cliente_telefone"]' },
  { campo: 'cliente_contato', label: 'Contato', seletor: '[data-edit="cliente_contato"]' },
];

export default function PropostaPreviewEditavel() {
  const { id } = useParams();
  const iframeRef = useRef(null);

  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [mostrarHistorico, setMostrarHistorico] = useState(false);
  const [camposEditados, setCamposEditados] = useState({});
  const [clausulas, setClausulas] = useState([]);
  const [clausulasIsDefault, setClausulasIsDefault] = useState(true);
  const [mudancasPendentes, setMudancasPendentes] = useState(false);
  const [baixandoPdf, setBaixandoPdf] = useState(false);
  const [enviandoFotos, setEnviandoFotos] = useState(false);
  const fotoInputRef = useRef(null);
  const repaginacaoTimerRef = useRef(null);
  const edicaoEmAndamentoRef = useRef(null); // { key, campo, cursorOffset }

  // Número real da proposta (ex.: "062-03-MH-2026-REV01") — o que o cliente reconhece,
  // em vez do id interno da tabela. Extraído do HTML do preview, que já está carregado:
  // evita uma segunda requisição a GET /propostas/:id, cuja query usa `pr.*` e traz
  // html_rendered (~5MB) junto só para ler um campo.
  // A âncora .page-header-num é estável de propósito — há teste de regressão garantindo
  // que o número do cabeçalho não suma (tests/propostaHeaderNumero.test.js).
  const numeroProposta = (() => {
    const m = /class="page-header-num"[^>]*>([^<]*)</.exec(html || '');
    if (!m) return '';
    return m[1].replace(/^\s*N[ºo°]?\s*/i, '').trim();
  })();

  const carregarPreview = useCallback(async () => {
    setLoading(true);
    try {
      const [htmlRes, clausulasRes] = await Promise.all([
        api.get(`/propostas/${id}/premium?embed=1`, { responseType: 'text' }),
        api.get(`/propostas/${id}/clausulas`),
      ]);
      setHtml(htmlRes.data);
      setClausulas(clausulasRes.data?.clausulas || []);
      setClausulasIsDefault(clausulasRes.data?.isDefault ?? true);
      setCamposEditados({});
      setMudancasPendentes(false);
    } catch (e) {
      toast.error('Erro ao carregar proposta.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    carregarPreview();
  }, [carregarPreview]);

  function injetarAtributosEdicao(doc) {
    const tds = doc.querySelectorAll('td');
    tds.forEach(td => {
      const th = td.previousElementSibling;
      if (!th) return;
      const label = th.textContent?.trim().toLowerCase();
      if (label === 'razão social' || label === 'empresa') td.setAttribute('data-edit', 'cliente_nome');
      else if (label === 'e-mail') td.setAttribute('data-edit', 'cliente_email');
      else if (label === 'telefone') td.setAttribute('data-edit', 'cliente_telefone');
      else if (label === 'contato') td.setAttribute('data-edit', 'cliente_contato');
    });
  }

  function ativarEdicao() {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;

    CAMPOS_EDITAVEIS.forEach(({ campo, seletor }) => {
      const el = doc.querySelector(seletor);
      if (!el) return;
      el.contentEditable = 'true';
      el.style.outline = '2px dashed #f59e0b';
      el.style.background = '#fffde7';
      el.style.borderRadius = '3px';
      el.style.cursor = 'text';
      el.oninput = () => {
        // O telefone é mascarado AQUI, enquanto se digita. Antes a máscara só existia no
        // servidor: o usuário apagava o campo, digitava um número novo e nada acontecia —
        // a formatação só aparecia depois de salvar, quando o preview era regerado.
        // Num nó contentEditable reescrever o texto tira o cursor do lugar, então
        // aplicarMascaraNoNoEditavel o reancora pela contagem de dígitos.
        if (campo === 'cliente_telefone') {
          aplicarMascaraNoNoEditavel(el, getCursorOffset, setCursorOffset);
        }
        setCamposEditados(prev => ({ ...prev, [campo]: el.textContent }));
        setMudancasPendentes(true);
      };
    });
  }

  function getCursorOffset(el) {
    const sel = el.ownerDocument.defaultView.getSelection();
    if (!sel || sel.rangeCount === 0) return 0;
    const range = sel.getRangeAt(0);
    const preRange = range.cloneRange();
    preRange.selectNodeContents(el);
    preRange.setEnd(range.endContainer, range.endOffset);
    return preRange.toString().length;
  }

  function setCursorOffset(el, offset) {
    const doc = el.ownerDocument;
    const win = doc.defaultView;
    const range = doc.createRange();
    let restante = offset;
    let node = null;
    const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    while (walker.nextNode()) {
      const len = walker.currentNode.textContent.length;
      if (restante <= len) { node = walker.currentNode; break; }
      restante -= len;
    }
    if (node) {
      range.setStart(node, restante);
      range.collapse(true);
    } else {
      range.selectNodeContents(el);
      range.collapse(false);
    }
    const sel = win.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function injetarControlesClausula(doc, secao) {
    const existente = secao.querySelector(':scope > .ppe-clausula-controles');
    if (existente) existente.remove();
    const key = secao.getAttribute('data-clausula-key');
    const barra = doc.createElement('div');
    barra.className = 'ppe-clausula-controles';
    barra.setAttribute('contenteditable', 'false');
    // A barra fica FORA do fluxo. A paginação já fechou as páginas medindo o conteúdo
    // sem ela; qualquer altura somada aqui empurra o fim da página para baixo do rodapé,
    // que corta com overflow:hidden — a cláusula some sem nenhuma repaginação acontecer.
    secao.style.position = 'relative';
    barra.style.cssText = 'position:absolute;top:0;right:0;z-index:5;display:flex;gap:4px;justify-content:flex-end;';
    const botao = (texto, titulo, onClick) => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.textContent = texto;
      b.title = titulo;
      b.style.cssText = 'font-size:11px;padding:2px 6px;border:1px solid #f59e0b;background:#fffde7;border-radius:4px;cursor:pointer;';
      b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); onClick(); };
      return b;
    };
    barra.appendChild(botao('↑', 'Mover para cima', () => aplicarMudancaEstrutural(doc, () => moverClausulaNoSource(doc, key, -1))));
    barra.appendChild(botao('↓', 'Mover para baixo', () => aplicarMudancaEstrutural(doc, () => moverClausulaNoSource(doc, key, 1))));
    barra.appendChild(botao('+ cláusula', 'Adicionar cláusula depois desta', () => aplicarMudancaEstrutural(doc, () => adicionarClausulaAoSource(doc, key))));
    barra.appendChild(botao('🗑', 'Remover cláusula', () => aplicarMudancaEstrutural(doc, () => removerClausulaDoSource(doc, key))));
    secao.insertAdjacentElement('afterbegin', barra);
  }

  // Placeholder do corpo da cláusula é puramente visual (CSS ::before), então nunca
  // entra no innerHTML/textContent lido por lerClausulasDoSource — uma cláusula nova
  // sem digitação continua salvando como vazia. Injetado uma única vez por documento
  // (checa o id antes de recriar), já que ativarEdicaoClausulas roda a cada repaginação.
  function injetarEstiloPlaceholderClausula(doc) {
    if (doc.getElementById('ppe-clausula-placeholder-style')) return;
    const style = doc.createElement('style');
    style.id = 'ppe-clausula-placeholder-style';
    style.textContent = `
      [data-clausula-campo="conteudo"]:empty::before,
      [data-clausula-campo="conteudo"] > p:only-child:empty::before {
        content: 'Clique para escrever o conteúdo da cláusula...';
        color: #9ca3af;
        font-style: italic;
        pointer-events: none;
      }
      /* Área clicável só para o corpo VAZIO. Como regra de folha de estilo (e não estilo
         inline aplicado depois da paginação), já está valendo quando a paginação mede as
         alturas — então não empurra conteúdo para debaixo do rodapé. */
      [data-clausula-campo="conteudo"]:empty,
      [data-clausula-campo="conteudo"] > p:only-child:empty {
        display: block;
        min-height: 3em;
      }
    `;
    (doc.head || doc.documentElement).appendChild(style);
  }

  function ativarEdicaoClausulas(doc) {
    injetarEstiloPlaceholderClausula(doc);
    const paginasGeradas = doc.querySelectorAll('.proposal-page[data-generated="1"] [data-clausula-campo]');
    paginasGeradas.forEach((el) => {
      el.contentEditable = 'true';
      el.style.outline = '2px dashed #f59e0b';
      el.style.background = '#fffde7';
      el.style.borderRadius = '3px';
      el.style.cursor = 'text';
      el.oninput = () => {
        const secao = el.closest('[data-clausula-key]');
        if (!secao) return;
        const key = secao.getAttribute('data-clausula-key');
        const campo = el.getAttribute('data-clausula-campo');
        // Uma cláusula grande pode ser dividida em vários fragmentos (todos com o mesmo
        // data-clausula-key) pela paginação. Se sincronizássemos só o innerHTML do
        // fragmento editado, sobrescreveríamos a cláusula inteira na fonte, perdendo os
        // parágrafos que estão nos outros fragmentos. Por isso o conteúdo é remontado a
        // partir de TODOS os fragmentos visíveis dessa key, na ordem do documento.
        const valor = campo === 'titulo'
          ? el.textContent
          : Array.from(
              doc.querySelectorAll('.proposal-page[data-generated="1"] [data-clausula-campo="conteudo"]')
            ).filter((f) => {
              const s = f.closest('[data-clausula-key]');
              return s && s.getAttribute('data-clausula-key') === key;
            }).map((f) => f.innerHTML).join('');
        sincronizarCampoParaSource(doc, key, campo, valor);
        setMudancasPendentes(true);
        const pagina = el.closest('.proposal-page');
        if (pagina) pagina.style.overflow = 'visible';
        edicaoEmAndamentoRef.current = { tipo: 'clausula', key, campo, cursorOffset: getCursorOffset(el) };
        clearTimeout(repaginacaoTimerRef.current);
        repaginacaoTimerRef.current = setTimeout(() => repaginarERestaurar(doc), 500);
      };
    });
    // :not([data-clausula-slot]) — os blocos de texto da 5.23 (abertura e condição de
    // pagamento) têm o TEXTO editável como qualquer cláusula, mas não ganham a barra de
    // mover/remover/adicionar: eles moram entre a tabela de preços e as tabelas fiscais,
    // e reordená-los ali quebraria a ordem "tabela completa → condição de pagamento" (I4).
    doc.querySelectorAll('.proposal-page[data-generated="1"] [data-clausula-key]:not([data-clausula-slot])').forEach((secao) => {
      injetarControlesClausula(doc, secao);
    });
    ativarEdicaoFotos(doc);
    ativarEdicaoVariaveisManuais(doc);
  }

  // Variáveis técnicas do tipo "Manual na Proposta": o template as renderiza na seção 4
  // como <span data-variavel-manual data-variavel-item> (vazio = espaço sublinhado).
  // A edição espelha o padrão das cláusulas: digita na página gerada, o valor é sincronizado
  // para o #proposalSource (fonte que sobrevive às repaginações) e persiste no "Salvar".
  function ativarEdicaoVariaveisManuais(doc) {
    doc.querySelectorAll('.proposal-page[data-generated="1"] [data-variavel-manual]').forEach((el) => {
      el.contentEditable = 'true';
      el.style.outline = '2px dashed #f59e0b';
      el.style.background = '#fffde7';
      el.style.borderRadius = '3px';
      el.style.cursor = 'text';
      // Enter = quebra de linha DENTRO do valor (o campo aceita várias linhas). Inserimos
      // '\n' como TEXTO (o CSS white-space: pre-wrap o exibe como linha nova) em vez de
      // deixar o contentEditable criar <div>/<br> — assim o valor continua texto puro e
      // persiste/re-renderiza sem HTML.
      el.onkeydown = (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        try {
          doc.execCommand('insertText', false, '\n');
        } catch (_) {
          const sel = doc.defaultView.getSelection();
          if (sel && sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            range.deleteContents();
            const no = doc.createTextNode('\n');
            range.insertNode(no);
            range.setStartAfter(no);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
          }
          el.oninput && el.oninput();
        }
      };
      el.oninput = () => {
        const chave = el.getAttribute('data-variavel-manual');
        const item = el.getAttribute('data-variavel-item');
        const fonte = doc.querySelector(
          `#proposalSource [data-variavel-manual="${chave}"][data-variavel-item="${item}"]`
        );
        // innerText (e não textContent): converte <br>/<div> que o navegador porventura
        // crie (ex.: texto colado) em '\n', mantendo o valor como texto puro multi-linha.
        if (fonte) fonte.textContent = el.innerText;
        setMudancasPendentes(true);

        // MESMA sequência da edição de cláusula. Sem isto, digitar um texto longo aqui
        // aumentava o bloco e NADA repaginava: a seção 4 transbordava a caixa da página e
        // as últimas linhas iam para debaixo do rodapé (relatado em 30/07/2026 — o
        // "Espaçador" desapareceu sob o rodapé da pág. 5 depois de preencher a nota
        // técnica). O PDF saía certo porque o servidor repagina do zero; era só o preview.
        const pagina = el.closest('.proposal-page');
        if (pagina) pagina.style.overflow = 'visible';
        edicaoEmAndamentoRef.current = {
          tipo: 'manual',
          chave: el.getAttribute('data-variavel-manual'),
          item: el.getAttribute('data-variavel-item'),
          cursorOffset: getCursorOffset(el),
        };
        clearTimeout(repaginacaoTimerRef.current);
        repaginacaoTimerRef.current = setTimeout(() => repaginarERestaurar(doc), 500);
      };
    });
  }

  function lerVariaveisManuaisDoSource(doc) {
    return Array.from(doc.querySelectorAll('#proposalSource [data-variavel-manual]')).map((el) => ({
      item_id: Number(el.getAttribute('data-variavel-item')),
      chave: el.getAttribute('data-variavel-manual'),
      valor: (el.textContent || '').trim(),
    })).filter((v) => v.chave && Number.isFinite(v.item_id));
  }

  // Guias de centralização (estilo Word): enquanto se arrasta uma foto, quando o centro
  // dela chega perto do centro da página a foto "gruda" ali e uma linha marca o eixo.
  // Os limites são os da folha A4 em mm — a mesma unidade em que a posição é gravada,
  // então o alinhamento vale igual no preview e no PDF, independente do zoom.
  // As linhas são overlays transitórios (criados no arrasto, removidos ao soltar), então
  // não entram na medição da paginação nem no PDF, que é regerado no servidor.
  const SNAP_TOLERANCIA_MM = 2.5;
  const A4_LARGURA_MM = 210;
  const A4_ALTURA_MM = 297;

  function limparGuias(doc) {
    doc.querySelectorAll('.ppe-guia-centro').forEach((g) => g.remove());
  }

  function desenharGuia(doc, pagina, orientacao) {
    if (pagina.querySelector(`.ppe-guia-${orientacao}`)) return;
    const g = doc.createElement('div');
    g.className = `ppe-guia-centro ppe-guia-${orientacao}`;
    g.style.cssText = orientacao === 'v'
      ? 'position:absolute;top:0;bottom:0;left:50%;width:0;border-left:1px dashed #e11d48;z-index:7;pointer-events:none;'
      : 'position:absolute;left:0;right:0;top:50%;height:0;border-top:1px dashed #e11d48;z-index:7;pointer-events:none;';
    pagina.appendChild(g);
  }

  // Fotos avulsas: o template as renderiza como overlays .proposta-foto (posição em mm
  // sobre a página) e as recria a CADA repaginação — por isso o wiring roda junto de
  // ativarEdicaoClausulas (load + MutationObserver) e usa a flag ppeWired para não
  // duplicar listeners num overlay já tratado.
  function ativarEdicaoFotos(doc) {
    doc.querySelectorAll('.proposta-foto').forEach((el) => {
      if (el.dataset.ppeWired === '1') return;
      el.dataset.ppeWired = '1';
      const fotoId = el.getAttribute('data-foto-id');
      el.style.cursor = 'move';
      el.style.outline = '2px dashed #f59e0b';

      // tabIndex: sem foco o elemento não recebe keydown — é o que habilita apagar com Del.
      el.tabIndex = 0;

      // Oito alças, como no Word. Todas redimensionam PROPORCIONALMENTE: a foto é um
      // <img> com height:auto, então a altura decorre da largura — e só a largura é
      // persistida (coluna `largura`). Esticar um lado sozinho distorceria a imagem e
      // exigiria gravar a altura também. O que muda por alça é a ÂNCORA: o canto/lado
      // oposto ao que se arrasta fica parado, como se espera de um resize.
      const ALCAS = [
        ['nw', 'top:-5px;left:-5px;cursor:nwse-resize;'],
        ['n', 'top:-5px;left:50%;margin-left:-5px;cursor:ns-resize;'],
        ['ne', 'top:-5px;right:-5px;cursor:nesw-resize;'],
        ['e', 'top:50%;right:-5px;margin-top:-5px;cursor:ew-resize;'],
        ['se', 'bottom:-5px;right:-5px;cursor:nwse-resize;'],
        ['s', 'bottom:-5px;left:50%;margin-left:-5px;cursor:ns-resize;'],
        ['sw', 'bottom:-5px;left:-5px;cursor:nesw-resize;'],
        ['w', 'top:50%;left:-5px;margin-top:-5px;cursor:ew-resize;'],
      ];
      const alcas = ALCAS.map(([dir, pos]) => {
        const h = doc.createElement('div');
        h.className = 'ppe-alca';
        h.title = 'Redimensionar';
        h.style.cssText = `position:absolute;z-index:6;width:10px;height:10px;background:#fff;border:1px solid #b45309;border-radius:2px;${pos}`;
        h.onmousedown = (e) => iniciarResize(e, dir);
        el.appendChild(h);
        return h;
      });

      const pxPorMm = () => {
        const pg = el.closest('.proposal-page');
        return pg ? pg.getBoundingClientRect().width / 210 : 96 / 25.4;
      };

      const persistir = () => {
        const pg = el.closest('.proposal-page');
        if (!pg) return;
        const paginas = Array.from(doc.querySelectorAll('.proposal-page')).filter((p) => p.style.display !== 'none');
        const k = pg.getBoundingClientRect().width / 210;
        const r = el.getBoundingClientRect();
        const rp = pg.getBoundingClientRect();
        const novo = {
          pagina: paginas.indexOf(pg) + 1,
          pos_x: (r.left - rp.left) / k,
          pos_y: (r.top - rp.top) / k,
          largura: r.width / k,
        };
        // Sincroniza a lista em memória do template: a repaginação REAPLICA as fotos a
        // partir dela — sem isto, qualquer repaginação devolvia a foto à posição antiga.
        const win = doc.defaultView;
        if (win && Array.isArray(win.__FOTOS_PROPOSTA)) {
          const f = win.__FOTOS_PROPOSTA.find((x) => String(x.id) === String(fotoId));
          if (f) { f.pagina = novo.pagina; f.x = novo.pos_x; f.y = novo.pos_y; f.largura = novo.largura; }
        }
        api.put(`/propostas/${id}/fotos/${fotoId}`, novo)
          .catch(() => toast.error('Erro ao salvar a posição da foto.'));
      };

      el.onmousedown = (e) => {
        if (alcas.includes(e.target)) return;
        e.preventDefault();
        el.focus(); // seleciona a foto: habilita apagar com Del
        // Offset do clique dentro da foto: a foto segue o cursor mantendo o ponto pego.
        const rectInicial = el.getBoundingClientRect();
        const offX = e.clientX - rectInicial.left;
        const offY = e.clientY - rectInicial.top;
        const aoMover = (ev) => {
          // Reparenta DURANTE o arrasto para a página sob o cursor. Sem isso a foto
          // "sumia" ao cruzar a borda: .proposal-page tem overflow:hidden, então o
          // trecho fora da página-mãe era cortado até o mouseup.
          const paginas = Array.from(doc.querySelectorAll('.proposal-page')).filter((p) => p.style.display !== 'none');
          let alvo = paginas.find((p) => {
            const rr = p.getBoundingClientRect();
            return ev.clientY >= rr.top && ev.clientY <= rr.bottom;
          });
          if (!alvo) alvo = el.closest('.proposal-page');
          if (!alvo) return;
          if (alvo !== el.parentElement) alvo.appendChild(el);
          const rp = alvo.getBoundingClientRect();
          const k = rp.width / 210;
          const r = el.getBoundingClientRect();
          const larguraMm = r.width / k;
          const alturaMm = r.height / k;
          let leftMm = (ev.clientX - offX - rp.left) / k;
          let topMm = (ev.clientY - offY - rp.top) / k;

          // Imã de centralização. Alt pressionado desliga o encaixe (igual ao Word),
          // para quando o usuário quer posicionar livremente perto do centro.
          limparGuias(doc);
          if (!ev.altKey) {
            const centroX = A4_LARGURA_MM / 2;
            if (Math.abs(leftMm + larguraMm / 2 - centroX) <= SNAP_TOLERANCIA_MM) {
              leftMm = centroX - larguraMm / 2;
              desenharGuia(doc, alvo, 'v');
            }
            const centroY = A4_ALTURA_MM / 2;
            if (Math.abs(topMm + alturaMm / 2 - centroY) <= SNAP_TOLERANCIA_MM) {
              topMm = centroY - alturaMm / 2;
              desenharGuia(doc, alvo, 'h');
            }
          }
          el.style.left = `${leftMm}mm`;
          el.style.top = `${topMm}mm`;
        };
        const aoSoltar = () => {
          doc.removeEventListener('mousemove', aoMover);
          doc.removeEventListener('mouseup', aoSoltar);
          limparGuias(doc);
          persistir();
        };
        doc.addEventListener('mousemove', aoMover);
        doc.addEventListener('mouseup', aoSoltar);
      };

      function iniciarResize(e, dir) {
        e.preventDefault();
        e.stopPropagation();
        el.focus();
        const k = pxPorMm();
        const r0 = el.getBoundingClientRect();
        const pg = el.closest('.proposal-page');
        const rp0 = pg.getBoundingClientRect();
        const startX = e.clientX;
        const startY = e.clientY;
        const left0 = (r0.left - rp0.left) / k;
        const top0 = (r0.top - rp0.top) / k;
        const w0 = r0.width / k;
        const h0 = r0.height / k;
        const proporcao = w0 > 0 ? h0 / w0 : 1;
        // Lados que ficam PARADOS enquanto se arrasta esta alça.
        const ancoraDireita = dir.includes('w');
        const ancoraInferior = dir.includes('n');

        const aoMover = (ev) => {
          const dx = (ev.clientX - startX) / k;
          const dy = (ev.clientY - startY) / k;
          // Alças de topo/base não têm componente horizontal: a largura vem do arrasto
          // vertical convertido pela proporção, senão elas não redimensionariam nada.
          let novaLargura;
          if (dir === 'n') novaLargura = w0 - dy / proporcao;
          else if (dir === 's') novaLargura = w0 + dy / proporcao;
          else novaLargura = w0 + (ancoraDireita ? -dx : dx);
          novaLargura = Math.max(10, novaLargura);
          const novaAltura = novaLargura * proporcao;
          el.style.width = `${novaLargura}mm`;
          if (ancoraDireita) el.style.left = `${left0 + w0 - novaLargura}mm`;
          if (ancoraInferior) el.style.top = `${top0 + h0 - novaAltura}mm`;
        };
        const aoSoltar = () => {
          doc.removeEventListener('mousemove', aoMover);
          doc.removeEventListener('mouseup', aoSoltar);
          persistir();
        };
        doc.addEventListener('mousemove', aoMover);
        doc.addEventListener('mouseup', aoSoltar);
      }

      async function excluirFoto() {
        if (!window.confirm('Remover esta foto da proposta?')) return;
        try {
          await api.delete(`/propostas/${id}/fotos/${fotoId}`);
          // Tira também da lista em memória — senão a próxima repaginação recriava a foto.
          const win = doc.defaultView;
          if (win && Array.isArray(win.__FOTOS_PROPOSTA)) {
            const idx = win.__FOTOS_PROPOSTA.findIndex((x) => String(x.id) === String(fotoId));
            if (idx >= 0) win.__FOTOS_PROPOSTA.splice(idx, 1);
          }
          el.remove();
          toast.success('Foto removida.');
        } catch (_) {
          toast.error('Erro ao remover foto.');
        }
      }

      // Del/Backspace com a foto selecionada. O listener fica NO elemento (que só recebe
      // teclado quando focado), então digitar Del dentro de uma cláusula não apaga foto.
      el.onkeydown = (ev) => {
        if (ev.key !== 'Delete' && ev.key !== 'Backspace') return;
        ev.preventDefault();
        excluirFoto();
      };

      // Botão direito: menu com "Excluir foto", no lugar do antigo ✕ sempre visível.
      el.oncontextmenu = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        el.focus();
        doc.querySelectorAll('.ppe-menu-foto').forEach((m) => m.remove());
        const menu = doc.createElement('div');
        menu.className = 'ppe-menu-foto';
        menu.style.cssText = 'position:fixed;z-index:9999;background:#fff;border:1px solid #d1d5db;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.15);padding:4px;font-family:sans-serif;font-size:13px;';
        menu.style.left = `${ev.clientX}px`;
        menu.style.top = `${ev.clientY}px`;
        const item = doc.createElement('button');
        item.type = 'button';
        item.textContent = '🗑  Excluir foto';
        item.style.cssText = 'display:block;width:100%;text-align:left;padding:6px 14px;border:none;background:none;cursor:pointer;color:#dc2626;white-space:nowrap;';
        item.onmouseenter = () => { item.style.background = '#fee2e2'; };
        item.onmouseleave = () => { item.style.background = 'none'; };
        item.onclick = () => { menu.remove(); excluirFoto(); };
        menu.appendChild(item);
        doc.body.appendChild(menu);
        const fechar = () => { menu.remove(); doc.removeEventListener('mousedown', fechar); };
        setTimeout(() => doc.addEventListener('mousedown', fechar), 0);
      };
    });
  }

  // Página mais visível no viewport do iframe agora — é nela que a foto nova entra
  // (adicionar sempre na capa obrigava o usuário a arrastar a foto pelo documento inteiro).
  function paginaVisivelAtual() {
    const doc = iframeRef.current?.contentDocument;
    const win = iframeRef.current?.contentWindow;
    if (!doc || !win) return 1;
    const paginas = Array.from(doc.querySelectorAll('.proposal-page')).filter((p) => p.style.display !== 'none');
    const meioViewport = win.innerHeight / 2;
    let melhor = 1;
    let melhorDist = Infinity;
    paginas.forEach((p, i) => {
      const r = p.getBoundingClientRect();
      const dist = Math.abs((r.top + r.bottom) / 2 - meioViewport);
      if (dist < melhorDist) { melhorDist = dist; melhor = i + 1; }
    });
    return melhor;
  }

  async function enviarFotos(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    setEnviandoFotos(true);
    const pagina = paginaVisivelAtual();
    try {
      const novas = [];
      for (const file of files) {
        const fd = new FormData();
        fd.append('foto', file);
        fd.append('pagina', String(pagina));
        const res = await api.post(`/propostas/${id}/fotos`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        novas.push(res.data);
      }
      // Injeta as fotos novas SEM recarregar o iframe: recarregar piscava a tela e voltava
      // para o topo do documento. O template expõe __FOTOS_PROPOSTA/aplicarFotosProposta;
      // se não estiverem disponíveis (preview antigo em cache), cai no reload completo.
      const doc = iframeRef.current?.contentDocument;
      const win = iframeRef.current?.contentWindow;
      const base = String(api.defaults.baseURL || '/api').replace(/\/$/, '');
      if (doc && win && Array.isArray(win.__FOTOS_PROPOSTA) && typeof win.aplicarFotosProposta === 'function') {
        novas.forEach((f) => {
          win.__FOTOS_PROPOSTA.push({
            id: f.id,
            pagina: f.pagina || pagina,
            x: f.pos_x != null ? f.pos_x : 20,
            y: f.pos_y != null ? f.pos_y : 60,
            largura: f.largura != null ? f.largura : 80,
            src: `${base}/uploads/proposta-fotos/${encodeURIComponent(f.arquivo)}`,
          });
        });
        win.aplicarFotosProposta();
        ativarEdicaoFotos(doc);
      } else {
        carregarPreview();
      }
      toast.success(files.length > 1 ? `${files.length} fotos adicionadas. Arraste-as para posicionar.` : 'Foto adicionada. Arraste-a para posicionar.');
    } catch (_) {
      toast.error('Erro ao enviar foto.');
    } finally {
      setEnviandoFotos(false);
    }
  }

  function repaginarERestaurar(doc) {
    const win = doc.defaultView;
    try { win.paginateProposalContent(); } catch (_) { /* preview segue com o layout anterior */ }
    ativarEdicaoClausulas(doc);
    const pendente = edicaoEmAndamentoRef.current;
    if (pendente) {
      // A repaginação destrói e recria os nós, então o campo é reencontrado pelos atributos
      // de dados — nunca por referência ao elemento antigo, que já não está no documento.
      let alvo = null;
      if (pendente.tipo === 'manual') {
        alvo = doc.querySelector(
          `.proposal-page[data-generated="1"] [data-variavel-manual="${pendente.chave}"][data-variavel-item="${pendente.item}"]`
        );
      } else {
        const secao = doc.querySelector(`.proposal-page[data-generated="1"] [data-clausula-key="${pendente.key}"]`);
        alvo = secao && secao.querySelector(`[data-clausula-campo="${pendente.campo}"]`);
      }
      if (alvo) {
        alvo.focus();
        setCursorOffset(alvo, pendente.cursorOffset);
      }
    }
  }

  // O HTML gerado repagina sozinho, fora do controle do React: o próprio script
  // embutido roda paginateProposalContent() de novo ~250ms após o load (para
  // acomodar imagens que terminam de carregar tarde) e também em resize/beforeprint.
  // Cada repaginação destrói e recria os nós .proposal-page[data-generated="1"],
  // descartando contentEditable/listeners aplicados por ativarEdicaoClausulas — sem
  // isso, a edição para de funcionar pouco depois do carregamento inicial, mesmo sem
  // nenhuma edição do usuário. Um MutationObserver reaplica automaticamente sempre
  // que essas páginas forem trocadas, não importa o que disparou a repaginação.
  function observarRepaginacoesClausulas(doc) {
    const container = doc.getElementById('proposalDocument');
    const MutationObserverImpl = doc.defaultView && doc.defaultView.MutationObserver;
    if (!container || !MutationObserverImpl) return;
    const observer = new MutationObserverImpl(() => {
      ativarEdicaoClausulas(doc);
    });
    observer.observe(container, { childList: true });
  }

  function aplicarMudancaEstrutural(doc, mutacao) {
    clearTimeout(repaginacaoTimerRef.current);
    edicaoEmAndamentoRef.current = null;
    mutacao();
    renumerarClausulas(doc);
    const win = doc.defaultView;
    try { win.paginateProposalContent(); } catch (_) { /* preview segue com o layout anterior */ }
    ativarEdicaoClausulas(doc);
    setMudancasPendentes(true);
  }

  async function salvarClausulas(doc) {
    const snapshotOriginal = clausulas; // carregado por carregarPreview() ao abrir a proposta
    let listaAtual = lerClausulasDoSource(doc)
      .map((c) => ({ ...c, titulo: (c.titulo || '').trim(), conteudo: htmlParaTexto(c.conteudo) }))
      // Remoção implícita: corpo+título vazios, OU cláusula nova (temp-*) intocada cujo
      // título ainda é o placeholder "Nova Cláusula" (renumerarClausulas o prefixa com
      // "5.x ", então o filtro antigo `titulo || conteudo` nunca a descartava).
      .filter((c) => (c.titulo || c.conteudo) && !ehClausulaNovaVazia(c));

    if (clausulasIsDefault) {
      const houveMudanca = listaAtual.length !== snapshotOriginal.length
        || listaAtual.some((c, i) => {
          const original = snapshotOriginal[i];
          if (!original) return true;
          const tituloOriginal = `${original.numero} ${original.titulo}`;
          return c.titulo !== tituloOriginal || c.conteudo !== htmlParaTexto(original.conteudo);
        });
      if (!houveMudanca) return;

      await api.post(`/propostas/${id}/clausulas/inicializar`);
      const res = await api.get(`/propostas/${id}/clausulas`);
      const frescas = res.data?.clausulas || [];

      // As linhas recém-criadas preservam a mesma ordem de getClausulasDefault() (ordem = índice),
      // que é a mesma ordem de snapshotOriginal — então relaciona por posição, não por texto
      // (o usuário pode ter editado o título antes deste primeiro save).
      const indicePorDefaultKey = new Map(snapshotOriginal.map((c, i) => [`default-${c.numero}`, i]));
      listaAtual = listaAtual.map((c) => {
        if (!c.key.startsWith('default-')) return c;
        const indice = indicePorDefaultKey.get(c.key);
        const fresca = indice != null ? frescas[indice] : null;
        return fresca ? { ...c, key: String(fresca.id) } : c;
      });

      const diff = diffClausulas(frescas.map((c) => ({ id: c.id, titulo: c.titulo, conteudo: c.conteudo })), listaAtual);
      await aplicarDiffClausulas(diff, listaAtual, doc);
      return;
    }

    const diff = diffClausulas(snapshotOriginal.map((c) => ({ id: c.id, titulo: c.titulo, conteudo: c.conteudo })), listaAtual);
    await aplicarDiffClausulas(diff, listaAtual, doc);
  }

  async function aplicarDiffClausulas(diff, listaAtual, doc) {
    const idsPorTempKey = new Map();
    for (const nova of diff.novas) {
      const res = await api.post(`/propostas/${id}/clausulas`, { titulo: nova.titulo, conteudo: nova.conteudo });
      idsPorTempKey.set(nova.key, String(res.data.id));
      atualizarKeyNoSource(doc, nova.key, String(res.data.id));
    }
    for (const alterada of diff.alteradas) {
      await api.put(`/propostas/${id}/clausulas/${alterada.key}`, { titulo: alterada.titulo, conteudo: alterada.conteudo });
    }
    for (const removida of diff.removidas) {
      await api.delete(`/propostas/${id}/clausulas/${removida.id}`);
    }
    if (diff.ordemMudou || idsPorTempKey.size > 0) {
      const idsFinais = listaAtual
        .map((c) => (c.key.startsWith('temp-') ? idsPorTempKey.get(c.key) : c.key))
        .filter(Boolean);
      if (idsFinais.length > 0) {
        await api.put(`/propostas/${id}/clausulas/reordenar`, { ordem: idsFinais });
      }
    }
  }

  // Próxima revisão, lida do sufixo REV do número da proposta (070-08-AJ-2026-REV06 → 7).
  // Sai do NÚMERO e não de um campo separado porque é o número que o cliente enxerga no
  // documento — e é ele que o servidor também usa como fonte ao emitir a revisão.
  function proximaRevisao() {
    const m = /REV\s*(\d+)\s*$/i.exec(numeroProposta || '');
    return (m ? parseInt(m[1], 10) : 0) + 1;
  }

  async function salvar() {
    if (!mudancasPendentes) return;

    const rev = proximaRevisao();
    const revFormatada = `REV${String(rev).padStart(2, '0')}`;
    const confirmado = window.confirm(
      'Deseja salvar esta alteração?\n\n'
      + 'Ela será registrada no histórico e a proposta será emitida como '
      + `revisão ${rev} (${revFormatada}).`
    );
    if (!confirmado) return;

    setSalvando(true);
    try {
      const doc = iframeRef.current?.contentDocument;
      if (doc) {
        await salvarClausulas(doc);
        const variaveisManuais = lerVariaveisManuaisDoSource(doc);
        if (variaveisManuais.length > 0) {
          await api.put(`/propostas/${id}/variaveis-manuais`, { valores: variaveisManuais });
        }
      }
      if (Object.keys(camposEditados).length > 0) {
        await api.put(`/propostas/${id}/customizacoes`, camposEditados);
      }
      // A revisão é emitida só DEPOIS de tudo gravar: se algum passo acima falhasse,
      // o número avançaria sem que a alteração correspondente existisse.
      const { data } = await api.post(`/propostas/${id}/revisao`);
      setMudancasPendentes(false);
      toast.success(`Alterações salvas. Proposta emitida como ${data?.numero_proposta || revFormatada}.`);
      carregarPreview();
    } catch (e) {
      toast.error('Erro ao salvar alterações.');
    } finally {
      setSalvando(false);
    }
  }

  async function baixarPdf() {
    setBaixandoPdf(true);
    try {
      const res = await api.get(`/propostas/${id}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      // O servidor manda o nome certo no Content-Disposition, mas baixamos via blob:
      // nesse caminho o navegador ignora o cabeçalho e usa o `download` daqui. Sanitiza
      // os caracteres que o Windows não aceita em nome de arquivo.
      a.download = numeroProposta
        ? `proposta-${numeroProposta.replace(/[\\/:*?"<>|]/g, '-')}.pdf`
        : `proposta-${id}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (e) {
      console.error('baixarPdf error:', e);
      toast.error('Erro ao gerar PDF.');
    } finally {
      setBaixandoPdf(false);
    }
  }

  async function resetarClausulas() {
    if (!window.confirm('Tem certeza? Todas as edições feitas nas cláusulas desta proposta serão perdidas.')) return;
    try {
      await api.post(`/propostas/${id}/clausulas/resetar`);
      toast.success('Cláusulas voltaram ao padrão.');
      carregarPreview();
    } catch (e) {
      toast.error('Erro ao resetar cláusulas.');
    }
  }

  return (
    <div className="ppe-container">
      {/* Toolbar */}
      <div className="ppe-toolbar">
        <div className="ppe-toolbar-left">
          <span className="ppe-titulo">
            {numeroProposta ? `Proposta Nº ${numeroProposta}` : `Proposta #${id}`}
          </span>
          {mudancasPendentes && <span className="ppe-badge-pendente">Alterações não salvas</span>}
        </div>
        <div className="ppe-toolbar-actions">
          <button
            className="ppe-btn"
            onClick={resetarClausulas}
            title="Resetar cláusulas para o padrão"
          >
            <FiRefreshCw /> Resetar cláusulas
          </button>
          <button
            className="ppe-btn"
            onClick={() => fotoInputRef.current && fotoInputRef.current.click()}
            disabled={enviandoFotos}
            title="Adicionar foto(s) à proposta — depois arraste para posicionar onde quiser"
          >
            <FiImage /> {enviandoFotos ? 'Enviando...' : 'Adicionar foto'}
          </button>
          <input
            ref={fotoInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            multiple
            style={{ display: 'none' }}
            onChange={enviarFotos}
          />
          <button
            className="ppe-btn"
            onClick={() => setMostrarHistorico(true)}
            title="Ver histórico de edições"
          >
            <FiClock /> Histórico
          </button>
          <button
            className="ppe-btn"
            onClick={baixarPdf}
            disabled={baixandoPdf}
            title="Baixar PDF desta proposta"
          >
            <FiDownload /> {baixandoPdf ? 'Gerando...' : 'Baixar PDF'}
          </button>
          <button
            className={`ppe-btn ppe-btn-salvar ${!mudancasPendentes ? 'ppe-btn-disabled' : ''}`}
            onClick={salvar}
            disabled={!mudancasPendentes || salvando}
          >
            <FiSave /> {salvando ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </div>
      </div>

      {/* Preview */}
      <div className="ppe-preview-wrapper">
        {loading ? (
          <div className="ppe-loading">Carregando proposta...</div>
        ) : (
          <iframe
            ref={iframeRef}
            className="ppe-iframe"
            title="Preview da proposta"
            srcDoc={html}
            sandbox="allow-same-origin allow-scripts"
            onLoad={() => {
              const doc = iframeRef.current?.contentDocument;
              if (doc) {
                injetarAtributosEdicao(doc);
                ativarEdicaoClausulas(doc);
                observarRepaginacoesClausulas(doc);
              }
              ativarEdicao();
            }}
          />
        )}
      </div>

      {/* Painel de histórico */}
      {mostrarHistorico && (
        <div className="ppe-painel-overlay">
          <div className="ppe-painel">
            <div className="ppe-painel-header">
              <h2>Histórico de Edições</h2>
              <button className="ppe-painel-fechar" onClick={() => setMostrarHistorico(false)}>
                <FiX />
              </button>
            </div>
            <HistoricoEdicoes propostaId={id} />
          </div>
        </div>
      )}
    </div>
  );
}
