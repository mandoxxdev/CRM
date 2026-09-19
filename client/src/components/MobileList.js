import React from 'react';
import { Link } from 'react-router-dom';
import './MobileList.css';

/**
 * Lista rica para o CELULAR — o padrao de "app" que substitui a tabela achatada.
 *
 * As telas de lista do sistema (clientes, produtos, propostas, materiais...) sao
 * quase todas uma <table>. No celular a tabela vira cartao generico; aqui cada item
 * vira um CARTAO de app: avatar (imagem ou iniciais coloridas), titulo, subtitulo,
 * chips de meta e botoes de acao.
 *
 * A tela continua renderizando a sua <table> normal (para o desktop); o CSS esconde
 * a `.table-container` no celular quando ela tem um `.mlist` como irmao, e esconde o
 * `.mlist` no desktop. Assim o desktop NAO muda.
 *
 * Uso:
 *   <MobileList items={produtos} empty="Nenhum produto" emptyIcon={<FiBox/>}
 *     renderItem={(p) => ({
 *       key: p.id, to: `/.../editar/${p.id}`,
 *       image: urlDaFoto,           // opcional; sem imagem cai nas iniciais
 *       initials: 'PR', tom: 2,     // tom 0..5 (cor do avatar); opcional
 *       title: p.nome, subtitle: p.codigo,
 *       chips: [{label:p.familia}, {label:'R$ 10', tone:'price'}],
 *       actions: [{icon:<FiEdit/>, to:'...', title:'Editar'},
 *                 {icon:<FiTrash2/>, onClick:fn, tone:'danger', title:'Excluir'}],
 *     })}
 *   />
 */

function tomFromText(txt) {
  const s = (txt || '?').toUpperCase();
  return (s.charCodeAt(0) + (s.charCodeAt(1) || 0)) % 6;
}

function initialsFromText(txt) {
  return (txt || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
}

const MobileList = ({ items = [], empty = 'Nada encontrado', emptyIcon = null, renderItem }) => {
  if (!items || items.length === 0) {
    return (
      <div className="mlist">
        <div className="mlist-empty">
          {emptyIcon && <span className="mlist-empty__icon">{emptyIcon}</span>}
          {empty}
        </div>
      </div>
    );
  }

  return (
    <div className="mlist">
      {items.map((item, i) => {
        const c = renderItem(item, i) || {};
        const initials = c.initials || initialsFromText(c.title);
        const tom = c.tom != null ? c.tom : tomFromText(c.title || initials);
        const chips = (c.chips || []).filter(Boolean);
        const actions = (c.actions || []).filter(Boolean);

        const inner = (
          <>
            {c.image ? (
              <img className="mcard__ava mcard__ava--img" src={c.image} alt="" loading="lazy"
                onError={(e) => { e.currentTarget.classList.add('is-broken'); }} />
            ) : (
              <span className={`mcard__ava tom-${tom}`}>{initials}</span>
            )}
            <span className="mcard__body">
              <span className="mcard__title">{c.title}</span>
              {c.subtitle && <span className="mcard__sub">{c.subtitle}</span>}
              {chips.length > 0 && (
                <span className="mcard__meta">
                  {chips.map((ch, j) => (
                    <span key={j} className={`mcard__chip ${ch.tone ? 'is-' + ch.tone : ''}`}>{ch.label}</span>
                  ))}
                </span>
              )}
            </span>
          </>
        );

        return (
          <div className="mcard" key={c.key != null ? c.key : i}>
            {c.to ? (
              <Link to={c.to} className="mcard__hit">{inner}</Link>
            ) : c.onClick ? (
              <button type="button" className="mcard__hit" onClick={c.onClick}>{inner}</button>
            ) : (
              <div className="mcard__hit">{inner}</div>
            )}
            {actions.length > 0 && (
              <div className="mcard__acts">
                {actions.map((a, j) => a.to ? (
                  <Link key={j} to={a.to} className={`mcard__act ${a.tone ? 'is-' + a.tone : ''}`} title={a.title} aria-label={a.title}>{a.icon}</Link>
                ) : (
                  <button key={j} type="button" onClick={a.onClick} className={`mcard__act ${a.tone ? 'is-' + a.tone : ''}`} title={a.title} aria-label={a.title}>{a.icon}</button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default MobileList;
