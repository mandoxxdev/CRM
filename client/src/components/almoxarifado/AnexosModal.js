import React from 'react';
import { FiPaperclip } from 'react-icons/fi';
import AnexosDocumento from './AnexosDocumento';
import './Almoxarifado.css';

/**
 * Casca de modal para o bloco de anexos (Etapa 34).
 *
 * Existe porque TRÊS telas do módulo não têm onde receber o bloco inline: Materiais e Devoluções
 * não têm linha expansível nem painel de detalhe, e o item de remessa vive numa tabela de N linhas
 * dentro do painel — inline ali seria N requisições ao abrir a remessa (RN-02).
 *
 * A alternativa descartada foi a linha expansível. Ela exige a affordance INTEIRA — cursor,
 * `title`, chevron nos dois ramos e `aria-expanded` — e foi uma affordance pela metade que custou
 * o fix-round 2 da Etapa 32. Repetir isso em três marcações de tabela diferentes é triplicar a
 * chance do mesmo defeito; um botão com `title` é affordance completa por construção.
 *
 * NÃO decide permissão, de propósito. Quem só tem `visualizar` precisa poder ver e baixar —
 * decisão B68 da Etapa 32, escrita. Gatear a abertura por `anexar_documento` a contradiria em
 * silêncio. Quem esconde o formulário e a lixeira é o `AnexosDocumento` (`:104-106`).
 */
function AnexosModal({ titulo = 'Anexos', subtitulo, entidade, entidadeId, onClose }) {
  // Mesma RN-01 do bloco, aplicada na casca: sem registro no banco não há o que listar. Aqui a
  // guarda serve para não desenhar um overlay vazio — a requisição já é barrada pela guarda
  // própria de `AnexosDocumento.js:117`, e não por esta.
  if (!entidadeId) return null;
  return (
    <div className="almox-modal-overlay" onClick={onClose} data-testid="anexos-modal">
      <div className="almox-modal" onClick={(e) => e.stopPropagation()}>
        <div className="almox-modal-header">
          {/* `h2` e não `h3`: os 44 cabeçalhos de modal desta base usam `h2`, e o CSS estiliza
              **só** `.almox-modal-header h2` (`Almoxarifado.css:432`). Com `h3` o título cai no
              default do navegador (`margin: 1em 0`), empurra o header `flex`/`sticky` e desalinha
              o `✕` — achado da Fase 2, que nenhum cenário desta etapa pegaria sozinho. */}
          <h2><FiPaperclip /> {titulo}</h2>
          <button className="almox-modal-close" onClick={onClose} title="Fechar">✕</button>
        </div>
        <div className="almox-modal-body">
          {subtitulo && (
            <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: 'var(--gmp-text-light)' }}>
              {subtitulo}
            </p>
          )}
          {/* `titulo={null}`: o cabeçalho acima já diz o que é. Sem isso o usuário lê "Anexos"
              duas vezes, uma embaixo da outra. */}
          <AnexosDocumento entidade={entidade} entidadeId={entidadeId} titulo={null} />
        </div>
      </div>
    </div>
  );
}

export default AnexosModal;
