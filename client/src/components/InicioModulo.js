import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiChevronRight } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import './InicioModulo.css';

/**
 * Tela de INICIO de um modulo que nao tem dashboard proprio (24/11/2026).
 *
 * Nasceu do Compras: o P.O. abriu o modulo e caiu numa tela em branco ("deveria ter um
 * dashboard"). Em vez de um painel por modulo, uma tela generica, na linguagem do resto do
 * sistema: saudacao, uma fileira de numeros (cada um vem de uma funcao `carregar` que o
 * modulo passa — se a chamada falhar, o numero fica como traco, nunca quebra a tela) e os
 * atalhos para as areas do modulo, em cartoes com icone colorido e descricao.
 *
 * Props:
 *   titulo     — nome do modulo ("Compras")
 *   subtitulo  — uma linha sobre o modulo
 *   kpis       — [{ chave, label, carregar: () => Promise<number|string>, detalhe? }]
 *   atalhos    — [{ path, icon, label, descricao, cor }]
 */
const saudacao = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
};

export default function InicioModulo({ titulo, subtitulo, kpis = [], atalhos = [] }) {
  const { user } = useAuth();
  const [valores, setValores] = useState({});

  useEffect(() => {
    let vivo = true;
    kpis.forEach((k) => {
      Promise.resolve()
        .then(() => k.carregar())
        .then((v) => { if (vivo) setValores((atual) => ({ ...atual, [k.chave]: v })); })
        .catch(() => { if (vivo) setValores((atual) => ({ ...atual, [k.chave]: null })); });
    });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const primeiroNome = String(user?.nome || '').trim().split(/\s+/)[0];
  const dataHoje = (() => {
    const s = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  })();

  return (
    <div className="inicio-modulo">
      <div className="page-header inicio-modulo__header">
        <div>
          <h1>{titulo}</h1>
          <p>{saudacao()}{primeiroNome ? `, ${primeiroNome}` : ''} · {dataHoje}{subtitulo ? ` · ${subtitulo}` : ''}</p>
        </div>
      </div>

      {kpis.length > 0 && (
        <div className="inicio-modulo__kpis">
          {kpis.map((k) => {
            const v = valores[k.chave];
            return (
              <div key={k.chave} className="inicio-modulo__kpi">
                <span className="inicio-modulo__kpi-label">{k.label}</span>
                <span className="inicio-modulo__kpi-valor">{v === undefined ? '…' : (v === null ? '—' : v)}</span>
                {k.detalhe && <span className="inicio-modulo__kpi-detalhe">{k.detalhe}</span>}
              </div>
            );
          })}
        </div>
      )}

      <h2 className="inicio-modulo__secao">Áreas</h2>
      <div className="inicio-modulo__atalhos">
        {atalhos.map((a) => {
          const Icon = a.icon;
          return (
            <Link key={a.path} to={a.path} className="inicio-modulo__atalho" style={{ '--atalho-cor': a.cor || '#0A84FF' }}>
              <span className="inicio-modulo__atalho-icone" aria-hidden="true">{Icon ? <Icon /> : null}</span>
              <span className="inicio-modulo__atalho-texto">
                <span className="inicio-modulo__atalho-nome">{a.label}</span>
                {a.descricao && <span className="inicio-modulo__atalho-desc">{a.descricao}</span>}
              </span>
              <FiChevronRight className="inicio-modulo__atalho-chevron" aria-hidden="true" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
