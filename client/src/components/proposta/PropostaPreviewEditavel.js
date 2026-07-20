import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { FiEdit2, FiSave, FiClock, FiX, FiDownload } from 'react-icons/fi';
import api from '../../services/api';
import EditorClausulas from './EditorClausulas';
import HistoricoEdicoes from './HistoricoEdicoes';
import {
  lerClausulasDoSource,
  sincronizarCampoParaSource,
  moverClausulaNoSource,
  removerClausulaDoSource,
  adicionarClausulaAoSource,
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
  const [mostrarClausulas, setMostrarClausulas] = useState(false);
  const [camposEditados, setCamposEditados] = useState({});
  const [clausulas, setClausulas] = useState([]);
  const [clausulasIsDefault, setClausulasIsDefault] = useState(true);
  const [mudancasPendentes, setMudancasPendentes] = useState(false);
  const [baixandoPdf, setBaixandoPdf] = useState(false);
  // Signals that the preview HTML needs a server reload (clause content changed)
  const previewDesatualizadoRef = useRef(false);
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
      previewDesatualizadoRef.current = false;
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
    barra.style.cssText = 'display:flex;gap:4px;justify-content:flex-end;margin-bottom:2px;';
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

  function ativarEdicaoClausulas(doc) {
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
        const valor = campo === 'titulo' ? el.textContent : el.innerHTML;
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

  function aplicarMudancaEstrutural(doc, mutacao) {
    clearTimeout(repaginacaoTimerRef.current);
    edicaoEmAndamentoRef.current = null;
    mutacao();
    const win = doc.defaultView;
    try { win.paginateProposalContent(); } catch (_) { /* preview segue com o layout anterior */ }
    ativarEdicaoClausulas(doc);
    setMudancasPendentes(true);
  }

  async function salvar() {
    if (!mudancasPendentes) return;
    setSalvando(true);
    try {
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

  // Clause changes are already persisted by EditorClausulas on each blur.
  // We only mark that the preview HTML is stale — the reload happens when the panel closes.
  function handleClausulasAlteradas() {
    previewDesatualizadoRef.current = true;
  }

  function fecharClausulas() {
    setMostrarClausulas(false);
    if (previewDesatualizadoRef.current) {
      carregarPreview();
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
            onClick={() => setMostrarClausulas(true)}
            title="Editar cláusulas"
          >
            <FiEdit2 /> Cláusulas
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
              }
              ativarEdicao();
            }}
          />
        )}
      </div>

      {/* Painel de cláusulas */}
      {mostrarClausulas && (
        <div className="ppe-painel-overlay">
          <div className="ppe-painel">
            <div className="ppe-painel-header">
              <h2>Editor de Cláusulas</h2>
              <button className="ppe-painel-fechar" onClick={fecharClausulas}>
                <FiX />
              </button>
            </div>
            <EditorClausulas
              propostaId={id}
              clausulas={clausulas}
              isDefault={clausulasIsDefault}
              onAlterado={handleClausulasAlteradas}
            />
          </div>
        </div>
      )}

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
