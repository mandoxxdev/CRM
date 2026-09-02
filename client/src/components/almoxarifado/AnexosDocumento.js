import React, { useCallback, useEffect, useState } from 'react';
import { FiDownload, FiPaperclip, FiTrash2, FiUploadCloud } from 'react-icons/fi';
import { toast } from 'react-toastify';
import api from '../../services/api';
import './Almoxarifado.css';

/**
 * Anexos de documento — bloco genérico por entidade (Etapa 32).
 *
 * Genérico de propósito: a mesma tabela `anexos_documento_almoxarifado` atende inspeção,
 * material, requisição, recebimento, devolução e item de remessa. Quem decide o que pode ser
 * anexado é sempre o backend (`requirePermission('anexar_documento' | 'remover_anexo')`); este
 * componente só desenha a superfície.
 *
 * Cinco regras que este arquivo TEM de respeitar, e o porquê de cada uma:
 *
 * 1. **O download é `blob`, não link.** A rota `GET /anexos/:id/arquivo` é autenticada, e
 *    `<a href>`/`<img src>` saem do navegador SEM o `Authorization` que o interceptor do axios
 *    injeta (`services/api.js:42-60`) — tomariam 401. O fluxo obrigatório é
 *    `api.get(url, { responseType: 'blob' })` → `URL.createObjectURL` → `<a download>` sintético
 *    → `URL.revokeObjectURL` no fim. Sem revogar, cada download vaza o blob até o reload.
 *
 * 2. **⚠️ Com `responseType: 'blob'`, `e.response?.data?.error` é SEMPRE `undefined`** — o axios
 *    entrega o CORPO DO ERRO como Blob também. Esta base já pagou por isso uma vez
 *    (`RelatoriosAlmoxarifado.js:325-340`, onde 403, 400 e 404 apareciam como a mesma frase
 *    genérica); o `catch` de lá é o molde copiado abaixo: `await bruto.text()` → `JSON.parse` →
 *    `corpo.error`, com fallback. O caso real que isto atende é o anexo cuja LINHA existe e cujo
 *    ARQUIVO sumiu (restore de banco sem restore de uploads), que a rota responde com um 404
 *    próprio — "Arquivo do anexo não encontrado" — e que o usuário precisa conseguir distinguir
 *    de "sem permissão".
 *
 * 3. **`FormData` sem `Content-Type` manual.** O interceptor de `services/api.js:43-49` REMOVE o
 *    header quando o corpo é `FormData`, para o navegador pôr o `boundary`. Definir
 *    `multipart/form-data` à mão quebra o upload.
 *
 * 4. **Guarda de `entidadeId` falsy antes do efeito.** Requisição em rascunho, recebimento em
 *    digitação e a fila de inspeções pendentes ainda não têm `id`; disparar o GET ali seria uma
 *    requisição por linha, com `entidade_id=undefined`, para nada.
 *
 * 5. **Sem cache de módulo na listagem.** Mesma razão do `useCategoriasMaterial` da Etapa 26:
 *    com cache, o anexo recém-enviado não apareceria até um reload — que é exatamente o "a tela
 *    mente" que esta etapa existe para corrigir. Por isso o `POST` e o `DELETE` recarregam.
 *
 * As mensagens de erro vêm do SERVIDOR, com fallback genérico: as literais desta etapa são
 * contrato (`Anexo deve ser PDF ou imagem`, `Registro não encontrado para anexar`, ...) e
 * reescrevê-las aqui faria a tela e o servidor divergirem em silêncio.
 */

const ROTA = '/almoxarifado/anexos';

// `tipo` é string livre no schema (`z.string().min(1).max(60)`); a lista fechada aqui é só
// usabilidade — nomes que servem às seis entidades do mapa, não uma regra de negócio.
const TIPOS = [
  { valor: 'CERTIFICADO', rotulo: 'Certificado' },
  { valor: 'RELATORIO_DIMENSIONAL', rotulo: 'Relatório dimensional' },
  { valor: 'LAUDO', rotulo: 'Laudo' },
  { valor: 'NOTA_FISCAL', rotulo: 'Nota fiscal' },
  { valor: 'FOTO', rotulo: 'Foto' },
  { valor: 'OUTRO', rotulo: 'Outro' },
];

function formatarTamanho(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatarData(valor) {
  if (!valor) return '';
  const d = new Date(String(valor).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return String(valor);
  return d.toLocaleDateString('pt-BR');
}

/**
 * Lê a mensagem de erro do servidor tolerando as DUAS formas em que o axios a entrega:
 * JSON normal (`data.error`) e Blob (quando a requisição pediu `responseType: 'blob'`).
 * Molde medido: `RelatoriosAlmoxarifado.js:325-340`.
 */
async function mensagemDoServidor(err, generica) {
  try {
    const bruto = err?.response?.data;
    if (bruto && typeof bruto.text === 'function') {
      const corpo = JSON.parse(await bruto.text());
      if (corpo && corpo.error) return corpo.error;
    } else if (bruto && bruto.error) {
      return bruto.error;
    }
  } catch (parseErr) { /* corpo não-JSON: fica a genérica */ }
  return generica;
}

function AnexosDocumento({ entidade, entidadeId, titulo = 'Anexos', somenteLeitura = false }) {
  const [anexos, setAnexos] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [baixando, setBaixando] = useState(null);
  const [arquivo, setArquivo] = useState(null);
  const [tipo, setTipo] = useState(TIPOS[0].valor);
  const [descricao, setDescricao] = useState('');

  // Regra 4: enquanto o registro-pai não tem `id`, não existe nada para listar nem para anexar.
  const habilitado = Boolean(entidade) && Boolean(entidadeId);

  const carregar = useCallback(async () => {
    if (!habilitado) return;
    setCarregando(true);
    try {
      // Regra 5: sem cache. `entidade` e `entidade_id` vão nos params — a rota filtra pelos dois.
      const res = await api.get(ROTA, { params: { entidade, entidade_id: Number(entidadeId) } });
      setAnexos(Array.isArray(res.data) ? res.data : []);
      setErro('');
    } catch (err) {
      setErro(await mensagemDoServidor(err, 'Erro ao carregar os anexos'));
      setAnexos([]);
    } finally {
      setCarregando(false);
    }
  }, [entidade, entidadeId, habilitado]);

  useEffect(() => { carregar(); }, [carregar]);

  const enviar = async () => {
    if (enviando || !habilitado) return;
    if (!arquivo) {
      setErro('Arquivo é obrigatório');
      return;
    }
    setEnviando(true);
    const corpo = new FormData();
    corpo.append('entidade', entidade);
    corpo.append('entidade_id', String(Number(entidadeId)));
    corpo.append('tipo', tipo);
    if (descricao.trim()) corpo.append('descricao', descricao.trim());
    corpo.append('arquivo', arquivo);
    try {
      // Regra 3: NENHUM header aqui. O interceptor tira o `Content-Type` e o navegador põe o
      // boundary do multipart.
      await api.post(ROTA, corpo);
      setArquivo(null);
      setDescricao('');
      setErro('');
      toast.success('Anexo enviado');
      await carregar();
    } catch (err) {
      const msg = await mensagemDoServidor(err, 'Erro ao enviar o anexo');
      setErro(msg);
      toast.error(msg);
    } finally {
      setEnviando(false);
    }
  };

  const baixar = async (anexo) => {
    if (baixando) return;
    setBaixando(anexo.id);
    let url = null;
    try {
      // Regra 1: pela rota autenticada, como blob.
      const res = await api.get(`${ROTA}/${anexo.id}/arquivo`, { responseType: 'blob' });
      url = window.URL.createObjectURL(new Blob([res.data], { type: anexo.mime_type || undefined }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', anexo.nome_original || `anexo-${anexo.id}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setErro('');
    } catch (err) {
      // Regra 2: a mensagem está DENTRO do Blob, não em `err.response.data.error`.
      const msg = await mensagemDoServidor(err, 'Erro ao baixar o anexo');
      setErro(msg);
      toast.error(msg);
    } finally {
      // Sempre revoga — inclusive se o `click` falhar depois de a URL já existir.
      if (url) window.URL.revokeObjectURL(url);
      setBaixando(null);
    }
  };

  const remover = async (anexo) => {
    // O servidor faz soft delete (D5): some da lista, sobrevive na auditoria e no disco.
    if (!window.confirm(`Remover o anexo "${anexo.nome_original}"?`)) return;
    try {
      await api.delete(`${ROTA}/${anexo.id}`);
      setErro('');
      toast.success('Anexo removido');
      await carregar();
    } catch (err) {
      const msg = await mensagemDoServidor(err, 'Erro ao remover o anexo');
      setErro(msg);
      toast.error(msg);
    }
  };

  if (!habilitado) return null;

  return (
    <div className="almox-anexos" data-testid="anexos-documento">
      <h4 className="almox-anexos-titulo"><FiPaperclip /> {titulo}</h4>

      {erro && (
        <p className="almox-anexos-erro" data-testid="anexo-erro" style={{ color: 'var(--gmp-error)' }}>
          {erro}
        </p>
      )}

      {carregando && anexos.length === 0 && <p className="almox-anexos-vazio">Carregando anexos...</p>}
      {!carregando && anexos.length === 0 && (
        <p className="almox-anexos-vazio" data-testid="anexo-vazio">Nenhum anexo.</p>
      )}

      {anexos.length > 0 && (
        <ul className="almox-anexos-lista">
          {anexos.map((a) => (
            <li className="almox-anexos-item" data-testid={`anexo-linha-${a.id}`} key={a.id}>
              <span className="almox-anexos-nome">{a.nome_original}</span>
              <span className="almox-anexos-meta">
                {[TIPOS.find((t) => t.valor === a.tipo)?.rotulo || a.tipo,
                  formatarTamanho(a.tamanho_bytes),
                  a.uploaded_by_nome,
                  formatarData(a.created_at)].filter(Boolean).join(' · ')}
              </span>
              {a.descricao && <span className="almox-anexos-desc">{a.descricao}</span>}
              <button
                type="button"
                className="almox-btn-icon primary"
                title="Baixar"
                data-testid={`anexo-baixar-${a.id}`}
                disabled={baixando === a.id}
                onClick={() => baixar(a)}
              >
                <FiDownload />
              </button>
              {!somenteLeitura && (
                <button
                  type="button"
                  className="almox-btn-icon danger"
                  title="Remover"
                  data-testid={`anexo-remover-${a.id}`}
                  onClick={() => remover(a)}
                >
                  <FiTrash2 />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!somenteLeitura && (
        <div className="almox-anexos-form">
          <select
            className="almox-input"
            data-testid="anexo-tipo"
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
          >
            {TIPOS.map((t) => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
          </select>
          <input
            className="almox-input"
            type="text"
            placeholder="Descrição (opcional)"
            data-testid="anexo-descricao"
            maxLength={300}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
          />
          <input
            type="file"
            data-testid="anexo-arquivo"
            accept="application/pdf,image/jpeg,image/jpg,image/png,image/webp"
            onChange={(e) => setArquivo(e.target.files?.[0] || null)}
          />
          <button
            type="button"
            className="btn-almox-secondary"
            data-testid="anexo-enviar"
            disabled={enviando}
            onClick={enviar}
          >
            <FiUploadCloud /> {enviando ? 'Enviando...' : 'Anexar'}
          </button>
        </div>
      )}
    </div>
  );
}

export default AnexosDocumento;
