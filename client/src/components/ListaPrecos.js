import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { toast } from 'react-toastify';
import {
  FiUploadCloud, FiSearch, FiTrash2, FiFileText, FiChevronLeft, FiChevronRight, FiList,
} from 'react-icons/fi';
import api from '../services/api';
import './ListaPrecos.css';

const PAGE_SIZE = 50;

export default function ListaPrecos() {
  const fileRef = useRef(null);
  const [listas, setListas] = useState([]);
  const [listaId, setListaId] = useState('');
  const [colunas, setColunas] = useState([]);
  const [itens, setItens] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [busca, setBusca] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [carregando, setCarregando] = useState(false);

  const carregarListas = useCallback(async () => {
    try {
      const { data } = await api.get('/comercial/listas-precos');
      setListas(data || []);
      // seleciona a primeira automaticamente se nenhuma estiver selecionada
      setListaId((atual) => atual || (data && data[0] ? String(data[0].id) : ''));
    } catch (e) {
      toast.error('Erro ao carregar as listas de preços.');
    }
  }, []);

  useEffect(() => { carregarListas(); }, [carregarListas]);

  // Carrega colunas quando troca de lista
  useEffect(() => {
    if (!listaId) { setColunas([]); setItens([]); setTotal(0); return; }
    let cancel = false;
    (async () => {
      try {
        const { data } = await api.get(`/comercial/listas-precos/${listaId}`);
        if (!cancel) { setColunas(data.colunas || []); setOffset(0); }
      } catch (e) {
        if (!cancel) setColunas([]);
      }
    })();
    return () => { cancel = true; };
  }, [listaId]);

  // Carrega itens (busca + paginação)
  useEffect(() => {
    if (!listaId) return;
    let cancel = false;
    setCarregando(true);
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get(`/comercial/listas-precos/${listaId}/itens`, {
          params: { q: busca, limit: PAGE_SIZE, offset },
        });
        if (!cancel) { setItens(data.itens || []); setTotal(data.total || 0); }
      } catch (e) {
        if (!cancel) { setItens([]); setTotal(0); }
      } finally {
        if (!cancel) setCarregando(false);
      }
    }, 250); // debounce da busca
    return () => { cancel = true; clearTimeout(t); };
  }, [listaId, busca, offset]);

  const onArquivo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setEnviando(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
      if (!json.length) {
        toast.error('A planilha está vazia ou sem cabeçalho.');
        return;
      }
      const cols = Object.keys(json[0]);
      const nomeBase = file.name.replace(/\.(xlsx|xls|csv)$/i, '');
      const nome = window.prompt('Nome desta lista de preços:', nomeBase) || nomeBase;
      const { data } = await api.post('/comercial/listas-precos', {
        nome,
        arquivo_nome: file.name,
        colunas: cols,
        itens: json,
      });
      toast.success(`Lista "${nome}" importada (${data.total_itens} itens).`);
      await carregarListas();
      setListaId(String(data.id));
      setBusca('');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao importar a planilha.');
    } finally {
      setEnviando(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const excluirLista = async () => {
    if (!listaId) return;
    const lista = listas.find((l) => String(l.id) === String(listaId));
    if (!window.confirm(`Excluir a lista "${lista?.nome || ''}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await api.delete(`/comercial/listas-precos/${listaId}`);
      toast.success('Lista excluída.');
      setListaId('');
      await carregarListas();
    } catch (e) {
      toast.error('Erro ao excluir a lista.');
    }
  };

  const pagina = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPaginas = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="lp-page">
      <div className="lp-header">
        <div>
          <h1><FiList /> Lista de Preços</h1>
          <p>Importe uma planilha de preços e pesquise os itens dentro do sistema</p>
        </div>
        <div className="lp-header-actions">
          <button className="lp-btn lp-btn-primary" onClick={() => fileRef.current?.click()} disabled={enviando}>
            <FiUploadCloud /> {enviando ? 'Importando...' : 'Importar planilha'}
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={onArquivo} />
        </div>
      </div>

      {listas.length === 0 ? (
        <div className="lp-vazio">
          <FiFileText size={42} />
          <h3>Nenhuma lista de preços ainda</h3>
          <p>Clique em <strong>Importar planilha</strong> e selecione um arquivo .xlsx, .xls ou .csv.</p>
        </div>
      ) : (
        <>
          <div className="lp-toolbar">
            <div className="lp-select-wrap">
              <label>Lista</label>
              <select value={listaId} onChange={(e) => { setListaId(e.target.value); setBusca(''); setOffset(0); }}>
                {listas.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nome} ({l.total_itens} itens)
                  </option>
                ))}
              </select>
            </div>
            <div className="lp-search">
              <FiSearch />
              <input
                type="text"
                placeholder="Buscar preço por código, descrição..."
                value={busca}
                onChange={(e) => { setBusca(e.target.value); setOffset(0); }}
              />
            </div>
            {listaId && (
              <button className="lp-btn lp-btn-danger" onClick={excluirLista} title="Excluir esta lista">
                <FiTrash2 /> Excluir lista
              </button>
            )}
          </div>

          <div className="lp-table-wrap">
            <table className="lp-table">
              <thead>
                <tr>
                  {colunas.map((c) => <th key={c}>{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {carregando ? (
                  <tr><td colSpan={colunas.length || 1} className="lp-msg">Carregando...</td></tr>
                ) : itens.length === 0 ? (
                  <tr><td colSpan={colunas.length || 1} className="lp-msg">Nenhum item encontrado.</td></tr>
                ) : (
                  itens.map((item) => (
                    <tr key={item._id}>
                      {colunas.map((c) => <td key={c}>{item[c] != null ? String(item[c]) : ''}</td>)}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="lp-footer">
            <span className="lp-total">{total} item(ns){busca ? ' encontrado(s)' : ''}</span>
            {total > PAGE_SIZE && (
              <div className="lp-paginacao">
                <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
                  <FiChevronLeft /> Anterior
                </button>
                <span>Página {pagina} de {totalPaginas}</span>
                <button disabled={pagina >= totalPaginas} onClick={() => setOffset(offset + PAGE_SIZE)}>
                  Próxima <FiChevronRight />
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
