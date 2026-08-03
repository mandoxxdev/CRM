import React, { useState, useMemo, useRef } from 'react';
import api from '../services/api';
import {
  FiX, FiUploadCloud, FiDownload, FiAlertTriangle, FiCheck,
  FiPlusCircle, FiRefreshCw, FiLayers, FiShield, FiFileText
} from 'react-icons/fi';
import './ImportarVariaveisModal.css';

/**
 * Importação de variáveis técnicas por planilha, em três passos:
 *
 *   1. upload    — envia o arquivo, o servidor analisa sem gravar
 *   2. revisao   — mostra o que vai acontecer linha a linha; conflitos de
 *                  similaridade ficam no topo e exigem decisão
 *   3. resultado — o que foi de fato gravado
 *
 * Nenhuma decisão é tomada sozinha: linha marcada como conflito só entra depois
 * que o usuário escolhe o que fazer com ela.
 */

const ACOES = {
  CRIAR: 'criar',
  MANTER: 'manter',
  SOBRESCREVER: 'sobrescrever',
  MESCLAR: 'mesclar_opcoes'
};

const ImportarVariaveisModal = ({ onClose, onImportado }) => {
  const [passo, setPasso] = useState('upload');
  const [arquivo, setArquivo] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [analise, setAnalise] = useState(null);
  const [decisoes, setDecisoes] = useState({});
  const [alvos, setAlvos] = useState({});      // chave -> id da variável escolhida
  const [aplicarFamilias, setAplicarFamilias] = useState(true);
  const [confirmando, setConfirmando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [arrastando, setArrastando] = useState(false);
  const inputRef = useRef(null);

  const baixarModelo = async () => {
    try {
      const res = await api.get('/variaveis-tecnicas/importacao/modelo', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'variaveis-tecnicas.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setErro('Não foi possível baixar o modelo.');
    }
  };

  const selecionarArquivo = (f) => {
    if (!f) return;
    if (!/\.(xlsx|xlsm|xls|csv)$/i.test(f.name)) {
      setErro('Formato não suportado. Envie .xlsx, .xls ou .csv');
      return;
    }
    setErro('');
    setArquivo(f);
  };

  const analisar = async () => {
    if (!arquivo) return;
    setEnviando(true);
    setErro('');
    try {
      const fd = new FormData();
      fd.append('arquivo', arquivo);
      const res = await api.post('/variaveis-tecnicas/importacao/analisar', fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setAnalise(res.data);

      // Pré-seleciona o que o servidor sugeriu. Conflito vem sem sugestão de
      // propósito — é o que obriga a passar pelo popup.
      const iniciais = {};
      const alvosIniciais = {};
      (res.data.itens || []).forEach((item) => {
        if (item.acaoSugerida) iniciais[item.chave] = item.acaoSugerida;
        if (item.existente) alvosIniciais[item.chave] = item.existente.id;
        else if (item.similares && item.similares.length > 0) alvosIniciais[item.chave] = item.similares[0].id;
      });
      setDecisoes(iniciais);
      setAlvos(alvosIniciais);
      setPasso('revisao');
    } catch (e) {
      const d = e.response?.data;
      setErro(d?.error || 'Erro ao analisar a planilha.');
      if (d?.erros?.length) {
        setErro((d.error || '') + ' ' + d.erros.map((x) => x.erro).join(' | '));
      }
    } finally {
      setEnviando(false);
    }
  };

  const confirmar = async () => {
    setConfirmando(true);
    setErro('');
    try {
      const payload = { token: analise.token, aplicarFamilias, decisoes: {} };
      (analise.itens || []).forEach((item) => {
        const acao = decisoes[item.chave];
        if (!acao) return;
        payload.decisoes[item.chave] = { acao };
        if (acao === ACOES.SOBRESCREVER || acao === ACOES.MESCLAR) {
          payload.decisoes[item.chave].alvo_id = alvos[item.chave];
        }
      });
      const res = await api.post('/variaveis-tecnicas/importacao/confirmar', payload);
      setResultado(res.data);
      setPasso('resultado');
      if (onImportado) onImportado();
    } catch (e) {
      setErro(e.response?.data?.error || 'Erro ao gravar a importação.');
    } finally {
      setConfirmando(false);
    }
  };

  const itensOrdenados = useMemo(() => {
    if (!analise) return [];
    const peso = { conflito: 0, existente: 1, nova: 2 };
    return [...analise.itens].sort((a, b) => {
      const d = peso[a.situacao] - peso[b.situacao];
      return d !== 0 ? d : a.nome.localeCompare(b.nome, 'pt-BR');
    });
  }, [analise]);

  const conflitosPendentes = useMemo(() => {
    if (!analise) return [];
    return analise.itens.filter((i) => i.situacao === 'conflito' && !decisoes[i.chave]);
  }, [analise, decisoes]);

  const setDecisao = (chave, acao, alvoId) => {
    setDecisoes((d) => ({ ...d, [chave]: acao }));
    if (alvoId != null) setAlvos((a) => ({ ...a, [chave]: alvoId }));
  };

  /* ─────────────────────────────── passo 1 ─────────────────────────────── */
  const renderUpload = () => (
    <div className="iv-body">
      <div className="iv-intro">
        <ol className="iv-passos">
          <li>
            <button type="button" className="iv-link-modelo" onClick={baixarModelo}>
              <FiDownload /> Baixar a planilha
            </button>
            <span>Vem preenchida com tudo que já está cadastrado.</span>
          </li>
          <li>
            <strong>Editar no Excel</strong>
            <span>Uma linha por opção. Acrescente linhas no fim para o que for novo.</span>
          </li>
          <li>
            <strong>Subir de volta</strong>
            <span>Você revisa tudo antes de gravar.</span>
          </li>
        </ol>
      </div>

      <div
        className={`iv-dropzone${arrastando ? ' iv-dropzone-ativo' : ''}${arquivo ? ' iv-dropzone-ok' : ''}`}
        onClick={() => inputRef.current && inputRef.current.click()}
        onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          selecionarArquivo(e.dataTransfer.files && e.dataTransfer.files[0]);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xlsm,.xls,.csv"
          style={{ display: 'none' }}
          onChange={(e) => selecionarArquivo(e.target.files && e.target.files[0])}
        />
        {arquivo ? (
          <>
            <FiFileText className="iv-dropzone-icone" />
            <strong>{arquivo.name}</strong>
            <span>{(arquivo.size / 1024).toFixed(0)} KB — clique para trocar</span>
          </>
        ) : (
          <>
            <FiUploadCloud className="iv-dropzone-icone" />
            <strong>Arraste a planilha aqui</strong>
            <span>ou clique para escolher (.xlsx, .xls, .csv)</span>
          </>
        )}
      </div>

      <div className="iv-nota">
        <FiShield />
        <span>Nada é gravado agora. Você verá tudo o que vai acontecer antes de confirmar.</span>
      </div>
    </div>
  );

  /* ─────────────────────────────── passo 2 ─────────────────────────────── */
  const renderCartaoConflito = (item) => (
    <div className="iv-conflito" key={item.chave}>
      <div className="iv-conflito-topo">
        <FiAlertTriangle className="iv-conflito-icone" />
        <div>
          <div className="iv-conflito-titulo">
            Variável parecida já cadastrada
            <span className="iv-pct">{item.similares[0].percentual}% de similaridade</span>
          </div>
          <div className="iv-conflito-comparacao">
            <div className="iv-lado">
              <span className="iv-lado-rotulo">Na planilha</span>
              <strong>{item.nome}</strong>
              {item.opcoes.length > 0 && (
                <em>{item.opcoes.length} opção(ões): {item.opcoes.slice(0, 3).map((o) => o.valor).join(', ')}{item.opcoes.length > 3 ? '…' : ''}</em>
              )}
            </div>
            <div className="iv-lado">
              <span className="iv-lado-rotulo">Já no sistema</span>
              <strong>{item.similares.find((s) => s.id === alvos[item.chave])?.nome || item.similares[0].nome}</strong>
              {(() => {
                const alvo = item.similares.find((s) => s.id === alvos[item.chave]) || item.similares[0];
                return alvo.opcoes && alvo.opcoes.length > 0
                  ? <em>{alvo.opcoes.length} opção(ões): {alvo.opcoes.slice(0, 3).join(', ')}{alvo.opcoes.length > 3 ? '…' : ''}</em>
                  : <em>sem opções cadastradas</em>;
              })()}
            </div>
          </div>
        </div>
      </div>

      {item.similares.length > 1 && (
        <div className="iv-conflito-seletor">
          <label>Comparar com:</label>
          <select
            value={alvos[item.chave] || item.similares[0].id}
            onChange={(e) => setAlvos((a) => ({ ...a, [item.chave]: Number(e.target.value) }))}
          >
            {item.similares.map((s) => (
              <option key={s.id} value={s.id}>{s.nome} — {s.percentual}%</option>
            ))}
          </select>
        </div>
      )}

      <div className="iv-acoes">
        <button
          type="button"
          className={`iv-acao iv-acao-mesclar${decisoes[item.chave] === ACOES.MESCLAR ? ' iv-acao-on' : ''}`}
          onClick={() => setDecisao(item.chave, ACOES.MESCLAR, alvos[item.chave] || item.similares[0].id)}
        >
          <FiLayers />
          <span>Subir opções para a existente</span>
          <em>Mantém o cadastro atual e só acrescenta as opções da planilha</em>
        </button>
        <button
          type="button"
          className={`iv-acao iv-acao-sobrescrever${decisoes[item.chave] === ACOES.SOBRESCREVER ? ' iv-acao-on' : ''}`}
          onClick={() => setDecisao(item.chave, ACOES.SOBRESCREVER, alvos[item.chave] || item.similares[0].id)}
        >
          <FiRefreshCw />
          <span>Sobrescrever</span>
          <em>A planilha substitui nome, tipo e lista de opções</em>
        </button>
        <button
          type="button"
          className={`iv-acao iv-acao-manter${decisoes[item.chave] === ACOES.MANTER ? ' iv-acao-on' : ''}`}
          onClick={() => setDecisao(item.chave, ACOES.MANTER)}
        >
          <FiCheck />
          <span>Ficar com a atual</span>
          <em>Descarta esta linha da planilha</em>
        </button>
        <button
          type="button"
          className={`iv-acao iv-acao-criar${decisoes[item.chave] === ACOES.CRIAR ? ' iv-acao-on' : ''}`}
          onClick={() => setDecisao(item.chave, ACOES.CRIAR)}
        >
          <FiPlusCircle />
          <span>São diferentes, criar nova</span>
          <em>Cadastra como uma variável separada</em>
        </button>
      </div>
    </div>
  );

  const renderRevisao = () => (
    <div className="iv-body">
      <div className="iv-resumo">
        <div className="iv-kpi"><strong>{analise.resumo.total}</strong><span>linhas</span></div>
        <div className="iv-kpi iv-kpi-nova"><strong>{analise.resumo.novas}</strong><span>novas</span></div>
        <div className="iv-kpi iv-kpi-existente"><strong>{analise.resumo.existentes}</strong><span>já existem</span></div>
        <div className="iv-kpi iv-kpi-conflito"><strong>{analise.resumo.conflitos}</strong><span>conflitos</span></div>
        <div className="iv-kpi"><strong>{analise.resumo.totalOpcoes}</strong><span>opções</span></div>
      </div>

      {analise.avisos && analise.avisos.length > 0 && (
        <div className="iv-avisos">
          {analise.avisos.map((a, i) => <div key={i}>• {a}</div>)}
        </div>
      )}

      {analise.resumo.familiasNaoEncontradas.length > 0 && (
        <div className="iv-avisos iv-avisos-alerta">
          <strong>Famílias não localizadas:</strong> {analise.resumo.familiasNaoEncontradas.join(', ')}.
          As variáveis entram normalmente, mas sem o vínculo com essas famílias.
        </div>
      )}

      {conflitosPendentes.length > 0 && (
        <div className="iv-barra-pendencia">
          <FiAlertTriangle />
          {conflitosPendentes.length} conflito(s) aguardando sua decisão. Sem escolher, essas linhas não entram.
        </div>
      )}

      <label className="iv-check">
        <input type="checkbox" checked={aplicarFamilias} onChange={(e) => setAplicarFamilias(e.target.checked)} />
        Aplicar os vínculos de família (faz a variável aparecer nas propostas dessas famílias)
      </label>

      <div className="iv-lista">
        {itensOrdenados.map((item) => (
          item.situacao === 'conflito' ? renderCartaoConflito(item) : (
            <div className={`iv-linha iv-linha-${item.situacao}`} key={item.chave}>
              <div className="iv-linha-info">
                <div className="iv-linha-nome">
                  {item.nome}
                  <code>{item.chave}</code>
                </div>
                <div className="iv-linha-meta">
                  <span className={`iv-selo iv-selo-${item.situacao}`}>
                    {item.situacao === 'nova' ? 'nova' : 'já existe'}
                  </span>
                  <span>{item.tipo}</span>
                  {item.opcoes.length > 0 && (
                    <span>
                      {item.opcoes.length} opção(ões)
                      {item.situacao === 'existente' && item.opcoesNovas.length > 0 && (
                        <b> · {item.opcoesNovas.length} nova(s)</b>
                      )}
                    </span>
                  )}
                  {item.familiasResolvidas.length > 0 && (
                    <span>{item.familiasResolvidas.length} família(s)</span>
                  )}
                </div>
              </div>
              <div className="iv-linha-acao">
                <select
                  value={decisoes[item.chave] || ''}
                  onChange={(e) => setDecisao(item.chave, e.target.value, item.existente ? item.existente.id : undefined)}
                >
                  {item.situacao === 'nova' ? (
                    <>
                      <option value={ACOES.CRIAR}>Criar</option>
                      <option value={ACOES.MANTER}>Ignorar</option>
                    </>
                  ) : (
                    <>
                      <option value={ACOES.MESCLAR}>Subir opções</option>
                      <option value={ACOES.SOBRESCREVER}>Sobrescrever</option>
                      <option value={ACOES.MANTER}>Ficar com a atual</option>
                    </>
                  )}
                </select>
              </div>
            </div>
          )
        ))}
      </div>
    </div>
  );

  /* ─────────────────────────────── passo 3 ─────────────────────────────── */
  const renderResultado = () => (
    <div className="iv-body">
      <div className="iv-sucesso">
        <FiCheck />
        <div>
          <strong>Importação concluída</strong>
          <span>{resultado.arquivo}</span>
        </div>
      </div>

      <div className="iv-resumo">
        <div className="iv-kpi iv-kpi-nova"><strong>{resultado.criadas}</strong><span>criadas</span></div>
        <div className="iv-kpi iv-kpi-existente"><strong>{resultado.atualizadas}</strong><span>atualizadas</span></div>
        <div className="iv-kpi"><strong>{resultado.ignoradas}</strong><span>ignoradas</span></div>
        <div className="iv-kpi"><strong>{resultado.vinculosFamilia}</strong><span>vínculos de família</span></div>
      </div>

      {resultado.pendentes && resultado.pendentes.length > 0 && (
        <div className="iv-avisos iv-avisos-alerta">
          <strong>{resultado.pendentes.length} linha(s) não entraram</strong> por falta de decisão:
          {resultado.pendentes.map((p, i) => <div key={i}>• {p.nome} — {p.motivo}</div>)}
        </div>
      )}

      <div className="iv-lista">
        {(resultado.detalhes || []).map((d, i) => (
          <div className="iv-linha" key={i}>
            <div className="iv-linha-info">
              <div className="iv-linha-nome">{d.nome} <code>{d.chave}</code></div>
              <div className="iv-linha-meta">
                <span className="iv-selo iv-selo-ok">{d.acao}</span>
                {d.opcoes != null && <span>{d.opcoes} opção(ões)</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="iv-overlay" onClick={onClose}>
      <div className="iv-modal" onClick={(e) => e.stopPropagation()}>
        <div className="iv-header">
          <div>
            <h3>Importar variáveis por planilha</h3>
            <span className="iv-passo">
              {passo === 'upload' && '1 de 3 — escolher arquivo'}
              {passo === 'revisao' && '2 de 3 — revisar e decidir'}
              {passo === 'resultado' && '3 de 3 — resultado'}
            </span>
          </div>
          <button type="button" onClick={onClose} className="iv-close"><FiX /></button>
        </div>

        {erro && <div className="iv-erro">{erro}</div>}

        {passo === 'upload' && renderUpload()}
        {passo === 'revisao' && analise && renderRevisao()}
        {passo === 'resultado' && resultado && renderResultado()}

        <div className="iv-footer">
          {passo === 'upload' && (
            <>
              <button type="button" className="iv-btn-sec" onClick={onClose}>Cancelar</button>
              <button type="button" className="iv-btn-pri" onClick={analisar} disabled={!arquivo || enviando}>
                {enviando ? 'Analisando...' : 'Analisar planilha'}
              </button>
            </>
          )}
          {passo === 'revisao' && (
            <>
              <button type="button" className="iv-btn-sec" onClick={() => { setPasso('upload'); setAnalise(null); }}>
                Voltar
              </button>
              <button type="button" className="iv-btn-pri" onClick={confirmar} disabled={confirmando}>
                {confirmando ? 'Gravando...' : 'Confirmar importação'}
              </button>
            </>
          )}
          {passo === 'resultado' && (
            <button type="button" className="iv-btn-pri" onClick={onClose}>Fechar</button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ImportarVariaveisModal;
