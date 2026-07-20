import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { FiSave, FiClock, FiX, FiDownload, FiRefreshCw } from 'react-icons/fi';
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
} from './clausulasInlineEditor';
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
  const repaginacaoTimerRef = useRef(null);
  const edicaoEmAndamentoRef = useRef(null); // { key, campo, cursorOffset }

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
        edicaoEmAndamentoRef.current = { key, campo, cursorOffset: getCursorOffset(el) };
        clearTimeout(repaginacaoTimerRef.current);
        repaginacaoTimerRef.current = setTimeout(() => repaginarERestaurar(doc), 500);
      };
    });
    doc.querySelectorAll('.proposal-page[data-generated="1"] [data-clausula-key]').forEach((secao) => {
      injetarControlesClausula(doc, secao);
    });
  }

  function repaginarERestaurar(doc) {
    const win = doc.defaultView;
    try { win.paginateProposalContent(); } catch (_) { /* preview segue com o layout anterior */ }
    ativarEdicaoClausulas(doc);
    const pendente = edicaoEmAndamentoRef.current;
    if (pendente) {
      const secao = doc.querySelector(`.proposal-page[data-generated="1"] [data-clausula-key="${pendente.key}"]`);
      const alvo = secao && secao.querySelector(`[data-clausula-campo="${pendente.campo}"]`);
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
      .filter((c) => c.titulo || c.conteudo); // titulo+conteudo vazios = remoção implícita

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

  async function salvar() {
    if (!mudancasPendentes) return;
    setSalvando(true);
    try {
      const doc = iframeRef.current?.contentDocument;
      if (doc) {
        await salvarClausulas(doc);
      }
      if (Object.keys(camposEditados).length > 0) {
        await api.put(`/propostas/${id}/customizacoes`, camposEditados);
      }
      setMudancasPendentes(false);
      toast.success('Alterações salvas com sucesso.');
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
      a.download = `proposta-${id}.pdf`;
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
          <span className="ppe-titulo">Proposta #{id}</span>
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
