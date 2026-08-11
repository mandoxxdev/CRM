import React, { useState } from 'react';
import { toast } from 'react-toastify';
import { FORMATOS_ETIQUETA, gerarEtiquetasPDF } from '../../utils/etiquetasPdf';

const CHAVE_FORMATO = 'almox_etiqueta_formato';

const formatoInicial = () => {
  const salvo = localStorage.getItem(CHAVE_FORMATO);
  return salvo && FORMATOS_ETIQUETA[salvo] ? salvo : 'A4_GRADE';
};

/**
 * Modal compartilhado de impressão de etiquetas (Etapa 6c — Task 3).
 *
 * Molde visual dos modais de `LotesAlmoxarifado.js` (`.almox-modal-overlay`/`.almox-modal`,
 * `.almox-field`, `.almox-modal-footer`). Chamado por qualquer tela que precise imprimir
 * etiqueta com QR (material, lote, série, recebimento) passando `etiquetas` (descritores
 * `{ codigo, nome, linhaControle, qrUrl }` — ver `utils/etiquetasPdf.js`) e `onClose`.
 *
 * `etiquetas` null/undefined é o sinal de "modal fechado" (as telas chamadoras passam `null`
 * quando não há nada selecionado para imprimir) — o componente não renderiza nada nesse caso,
 * igual aos `{alvo && (...)}` de LotesAlmoxarifado. `etiquetas: []` é diferente: o modal ABRE,
 * mas com o botão Gerar desabilitado e uma explicação — é o caso de, por exemplo, um recebimento
 * cujos itens não geraram nenhuma etiqueta.
 *
 * O formato escolhido é lembrado em localStorage: térmica é o caminho provável do galpão, e a
 * decisão é escolher uma vez, não a cada impressão. Um valor salvo que não existe mais em
 * FORMATOS_ETIQUETA (formato removido/renomeado numa versão futura) cai no default A4_GRADE em
 * vez de quebrar o select com um <option> fantasma.
 *
 * "Cópias" só aparece com uma única etiqueta selecionada — não há caso de uso de "N cópias de
 * cada uma dessas 11 etiquetas" no fluxo do almoxarifado; com lista múltipla, cópias é sempre 1.
 */
const EtiquetasPdfModal = ({ etiquetas, onClose }) => {
  const [formato, setFormato] = useState(formatoInicial);
  const [copias, setCopias] = useState(1);
  const [gerando, setGerando] = useState(false);

  if (!etiquetas) return null;

  const unica = etiquetas.length === 1;
  const cfg = FORMATOS_ETIQUETA[formato];
  const porPagina = cfg.grade.colunas * cfg.grade.linhas;
  const total = etiquetas.length * (unica ? copias : 1);
  const paginas = total > 0 ? Math.ceil(total / porPagina) : 0;

  const gerar = async () => {
    setGerando(true);
    try {
      localStorage.setItem(CHAVE_FORMATO, formato);
      await gerarEtiquetasPDF({ formato, etiquetas, copias: unica ? copias : 1 });
      toast.success('Etiquetas geradas!');
      onClose();
    } catch (err) {
      toast.error(err.message || 'Erro ao gerar etiquetas');
    } finally {
      setGerando(false);
    }
  };

  return (
    <div className="almox-modal-overlay" onClick={() => { if (!gerando) onClose(); }}>
      <div className="almox-modal almox-modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="almox-modal-header">
          <h2>Imprimir etiquetas</h2>
          <button className="almox-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="almox-modal-body">
          <div className="almox-field">
            <label className="almox-label">Formato</label>
            <select className="almox-form-select" value={formato}
              onChange={(e) => setFormato(e.target.value)}>
              {Object.entries(FORMATOS_ETIQUETA).map(([chave, f]) => (
                <option key={chave} value={chave}>{f.label}</option>
              ))}
            </select>
          </div>
          {unica && (
            <div className="almox-field">
              <label className="almox-label">Cópias</label>
              <input className="almox-input" type="number" min="1" step="1" value={copias}
                onChange={(e) => setCopias(Math.max(1, parseInt(e.target.value, 10) || 1))} />
            </div>
          )}
          {etiquetas.length === 0 ? (
            <div className="almox-badge almox-badge-baixo" style={{ display: 'block', padding: '8px 10px', lineHeight: 1.4 }}>
              Nenhuma etiqueta para gerar.
            </div>
          ) : (
            <p style={{ marginTop: 0 }}>
              {total} etiqueta{total !== 1 ? 's' : ''} · {paginas} página{paginas !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        <div className="almox-modal-footer">
          <button className="btn-almox-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-almox-primary" disabled={gerando || etiquetas.length === 0} onClick={gerar}>
            {gerando ? 'Gerando...' : 'Gerar'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EtiquetasPdfModal;
