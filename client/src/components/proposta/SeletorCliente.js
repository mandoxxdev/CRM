import React, { useEffect, useRef, useState } from 'react';
import { FiSearch, FiX } from 'react-icons/fi';
import api from '../../services/api';
import './SeletorCliente.css';

/**
 * Campo de cliente da proposta com busca (27/11/2026: "essa parte de selecionar o cliente está ruim, pensa nisso com 5k de clientes").
 * Antes era um <select> com TODOS os clientes, carregados ao abrir a tela. Agora: digita-se parte da razão social, do nome fantasia ou
 * do CNPJ (com ou sem pontuação) e o servidor devolve os primeiros que batem (GET /clientes?search=&limite=). Mouse ou teclado
 * (↑ ↓ Enter Esc). Ao clicar no campo a lista já abre (27/11/2026: "ao clicar deve abrir um menu"), com os primeiros clientes em
 * ordem alfabética; digitando, filtra entre todos.
 *
 * Props: `valor` (id do cliente ou ''), `rotulo` (o nome do cliente escolhido, para mostrar sem buscar), `onEscolher(id, cliente)`.
 */
export const LIMITE_BUSCA_CLIENTE = 20;
export const MINIMO_BUSCA_CLIENTE = 1;
const ESPERA_MS = 250;

const nomeDoCliente = (c) => (c && (c.razao_social || c.nome_fantasia)) || (c && c.id ? `#${c.id}` : '');

export default function SeletorCliente({ valor, rotulo, onEscolher, id = 'proposta-cliente' }) {
  const [texto, setTexto] = useState(rotulo || '');
  const [aberto, setAberto] = useState(false);
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState(false);
  const [ativo, setAtivo] = useState(-1);
  const [termoBusca, setTermoBusca] = useState('');
  const primeiros = useRef(null); // a lista de quando se clica sem digitar: busca uma vez e guarda
  const pedido = useRef(0);
  const espera = useRef(null);
  const listaRef = useRef(null);

  // O rótulo muda quando a proposta carrega (edição) ou quando se escolhe: o campo mostra o nome escolhido.
  useEffect(() => { if (!aberto) setTexto(rotulo || ''); }, [rotulo, aberto]);
  useEffect(() => () => clearTimeout(espera.current), []);

  const mostrar = (lista) => { setResultados(lista); setErro(false); setAtivo(lista.length ? 0 : -1); };

  const carregar = (t) => {
    const meu = ++pedido.current; // resposta atrasada de um termo anterior não pinta a lista
    setBuscando(true);
    const params = t ? { status: 'ativo', search: t, limite: LIMITE_BUSCA_CLIENTE } : { status: 'ativo', limite: LIMITE_BUSCA_CLIENTE };
    api.get('/clientes', { params })
      .then(({ data }) => {
        if (meu !== pedido.current) return;
        const lista = Array.isArray(data) ? data : [];
        if (!t) primeiros.current = lista;
        mostrar(lista);
      })
      .catch(() => { if (meu === pedido.current) { setResultados([]); setErro(true); } })
      .finally(() => { if (meu === pedido.current) setBuscando(false); });
  };

  const buscar = (termo) => {
    clearTimeout(espera.current);
    const t = termo.trim();
    setTermoBusca(t);
    if (t.length < MINIMO_BUSCA_CLIENTE) {
      // Sem termo: os primeiros clientes (em ordem alfabética), na hora; buscados uma vez só.
      if (primeiros.current) { pedido.current += 1; setBuscando(false); mostrar(primeiros.current); return; }
      carregar('');
      return;
    }
    setBuscando(true);
    espera.current = setTimeout(() => carregar(t), ESPERA_MS);
  };

  const abrir = () => {
    if (aberto) return;
    setAberto(true);
    buscar('');
  };

  const escolher = (c) => {
    onEscolher(String(c.id), c);
    setTexto(nomeDoCliente(c));
    setAberto(false); setResultados([]); setAtivo(-1);
  };

  const limpar = () => {
    onEscolher('', null);
    setTexto(''); setAberto(true); buscar('');
  };

  const aoDigitar = (e) => {
    setTexto(e.target.value);
    setAberto(true);
    buscar(e.target.value);
  };

  const aoTeclar = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!aberto) { abrir(); return; }
      setAtivo((i) => Math.min(resultados.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAtivo((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      if (aberto && ativo >= 0 && resultados[ativo]) { e.preventDefault(); escolher(resultados[ativo]); }
    } else if (e.key === 'Escape') {
      setAberto(false); setTexto(rotulo || '');
    }
  };

  // Mantém a opção ativa à vista ao andar com as setas.
  useEffect(() => {
    const el = listaRef.current && listaRef.current.querySelector('[aria-selected="true"]');
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }, [ativo]);

  const aviso = !aberto ? null
    : buscando && resultados.length === 0 ? 'Buscando…'
      : erro ? 'Não foi possível buscar agora. Tente de novo.'
        : resultados.length === 0 ? (termoBusca ? 'Nenhum cliente ativo encontrado.' : 'Nenhum cliente ativo cadastrado.')
          : null;

  return (
    <div className="seletor-cliente" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) { setAberto(false); setTexto(rotulo || ''); } }}>
      <div className="seletor-cliente-campo">
        <FiSearch className="seletor-cliente-lupa" aria-hidden="true" />
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={aberto}
          aria-controls={`${id}-lista`}
          aria-autocomplete="list"
          aria-activedescendant={aberto && ativo >= 0 ? `${id}-op-${ativo}` : undefined}
          autoComplete="off"
          placeholder="Buscar por nome, nome fantasia ou CNPJ"
          value={texto}
          onChange={aoDigitar}
          onKeyDown={aoTeclar}
          onFocus={(e) => { if (valor) e.target.select(); abrir(); }}
          onMouseDown={() => abrir()}
        />
        {valor && (
          <button type="button" className="seletor-cliente-limpar" onClick={limpar} aria-label="Trocar cliente" title="Trocar cliente">
            <FiX />
          </button>
        )}
      </div>
      {aberto && (
        <div className="seletor-cliente-painel">
          {aviso && <div className="seletor-cliente-aviso">{aviso}</div>}
          {!aviso && !termoBusca && <div className="seletor-cliente-aviso">Digite para buscar entre todos os clientes.</div>}
          {!aviso && (
            <ul id={`${id}-lista`} role="listbox" ref={listaRef} className="seletor-cliente-lista">
              {resultados.map((c, i) => {
                const fantasia = c.nome_fantasia && c.nome_fantasia !== c.razao_social ? c.nome_fantasia : '';
                const local = [c.cidade, c.estado].filter(Boolean).join('/');
                const detalhe = [fantasia, c.cnpj, local].filter(Boolean).join(' · ');
                return (
                  <li
                    key={c.id}
                    id={`${id}-op-${i}`}
                    role="option"
                    aria-selected={i === ativo}
                    className={i === ativo ? 'ativo' : ''}
                    onMouseDown={(e) => { e.preventDefault(); escolher(c); }}
                    onMouseEnter={() => setAtivo(i)}
                  >
                    <strong>{nomeDoCliente(c)}</strong>
                    {detalhe && <small>{detalhe}</small>}
                  </li>
                );
              })}
            </ul>
          )}
          {!aviso && termoBusca && resultados.length >= LIMITE_BUSCA_CLIENTE && (
            <div className="seletor-cliente-aviso">Mostrando os {LIMITE_BUSCA_CLIENTE} primeiros — continue digitando para refinar.</div>
          )}
        </div>
      )}
    </div>
  );
}
