/**
 * Painel "Traduções" da proposta bilíngue (specs/proposta-bilingue/README.md, RN-BI.04/05/06).
 *
 * Lista cada texto em português do documento ao lado da tradução, para revisar e corrigir. "Traduzir pendentes" usa o tradutor do
 * próprio Chrome (grátis, no PC do vendedor) — o clique é o gesto que o Chrome exige para baixar a língua na primeira vez (Fase 2,
 * I11). A correção do vendedor grava como 'manual' e a automática nunca a sobrescreve (RN-BI.06).
 *
 * Os textos vêm do documento bilíngue que o SERVIDOR montou (/premium?bilingue=1): a chave de cada um é a que o servidor procura na
 * memória — nunca há texto que o painel traduz e o documento não acha (Fase 2, I5).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { FiX, FiGlobe, FiSave } from 'react-icons/fi';
import api from '../../services/api';
import { textosDoDocumento, temTradutorDoChrome, criarTradutor, traduzirTexto } from './traducaoChrome';

const NOME_IDIOMA = { en: 'inglês', es: 'espanhol' };
const LOTE = 200;
const MAX_CARACTERES = 5000; // o limite de cada texto no POST /api/traducoes

async function gravar(idioma, origem, itens) {
  let gravadas = 0;
  for (let i = 0; i < itens.length; i += LOTE) {
    const { data } = await api.post('/traducoes', { idioma, origem, itens: itens.slice(i, i + LOTE) });
    gravadas += (data && data.gravadas) || 0;
  }
  return gravadas;
}

export default function PainelTraducoes({ propostaId, idioma, onFechar, onAtualizou }) {
  const [textos, setTextos] = useState([]);
  const [editados, setEditados] = useState({});
  const [carregando, setCarregando] = useState(true);
  const [traduzindo, setTraduzindo] = useState(null); // { feitos, total } | null
  const [salvando, setSalvando] = useState(false);
  const temChrome = temTradutorDoChrome();

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const res = await api.get(`/propostas/${propostaId}/premium?embed=1&bilingue=1`, { responseType: 'text' });
      setTextos(textosDoDocumento(res.data));
      setEditados({});
    } catch (e) {
      toast.error('Erro ao carregar os textos da proposta.');
    } finally {
      setCarregando(false);
    }
  }, [propostaId]);

  useEffect(() => { carregar(); }, [carregar]);

  const pendentes = useMemo(() => textos.filter((t) => t.pendente), [textos]);
  const alterados = Object.keys(editados).filter((k) => {
    const t = textos.find((x) => x.chave === k);
    return t && editados[k].trim() && editados[k].trim() !== t.traducao;
  });

  async function traduzirPendentes() {
    if (!temChrome || pendentes.length === 0) return;
    setTraduzindo({ feitos: 0, total: pendentes.length });
    try {
      let tradutor;
      try {
        tradutor = await criarTradutor(idioma);
      } catch (e) {
        toast.error('Não foi possível usar o tradutor do Chrome. Confira se o Chrome está atualizado, ou preencha a tradução à mão.');
        return;
      }
      const prontos = [];
      let falhas = 0;
      for (let i = 0; i < pendentes.length; i++) {
        // eslint-disable-next-line no-await-in-loop
        const tr = await traduzirTexto(tradutor, pendentes[i].chave, idioma);
        // Acima do limite do servidor o item derrubaria o lote inteiro (Fase 5, 7): fica pendente, para preencher à mão.
        if (tr && tr.length <= MAX_CARACTERES) prontos.push({ texto_origem: pendentes[i].chave, texto_traduzido: tr }); else falhas++;
        setTraduzindo({ feitos: i + 1, total: pendentes.length });
      }
      try {
        if (prontos.length) await gravar(idioma, 'auto', prontos);
      } catch (e) {
        toast.error((e && e.response && e.response.data && e.response.data.error) || 'Erro ao gravar as traduções.');
        return;
      }
      if (falhas) toast.warning(`${falhas} texto(s) não foram traduzidos automaticamente — preencha à mão.`);
      else toast.success(`${prontos.length} texto(s) traduzidos. Confira antes de enviar ao cliente.`);
      await carregar();
      if (onAtualizou) onAtualizou();
    } finally {
      setTraduzindo(null);
    }
  }

  async function salvarCorrecoes() {
    if (alterados.length === 0) return;
    setSalvando(true);
    try {
      await gravar(idioma, 'manual', alterados.map((k) => ({ texto_origem: k, texto_traduzido: editados[k] })));
      toast.success(`${alterados.length} tradução(ões) salva(s).`);
      await carregar();
      if (onAtualizou) onAtualizou();
    } catch (e) {
      toast.error((e && e.response && e.response.data && e.response.data.error) || 'Erro ao salvar as traduções.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="ppe-painel-overlay">
      <div className="ppe-painel ppe-painel-traducoes" role="dialog" aria-label="Traduções da proposta">
        <div className="ppe-painel-header">
          <h2>Traduções — português → {NOME_IDIOMA[idioma] || idioma}</h2>
          <button type="button" className="ppe-painel-fechar" onClick={onFechar} aria-label="Fechar"><FiX /></button>
        </div>
        <div className="ppe-traducoes-acoes">
          <span className="ppe-traducoes-contagem">
            {carregando ? 'Carregando…' : `${textos.length} texto(s) · ${pendentes.length} sem tradução`}
          </span>
          <button type="button" className="ppe-btn" onClick={traduzirPendentes}
            disabled={!temChrome || carregando || !!traduzindo || pendentes.length === 0}>
            <FiGlobe /> {traduzindo ? `Traduzindo ${traduzindo.feitos}/${traduzindo.total}…` : `Traduzir pendentes (${pendentes.length})`}
          </button>
          <button type="button" className="ppe-btn ppe-btn-salvar" onClick={salvarCorrecoes} disabled={alterados.length === 0 || salvando}>
            <FiSave /> {salvando ? 'Salvando…' : `Salvar correções (${alterados.length})`}
          </button>
        </div>
        {!temChrome && (
          <p className="ppe-traducoes-aviso">
            A tradução automática usa o tradutor do próprio Chrome (versão 138 ou mais nova). Neste navegador, preencha a tradução à mão.
          </p>
        )}
        <p className="ppe-traducoes-aviso">
          A tradução vale para todas as propostas: corrigir um texto aqui corrige o mesmo texto onde ele aparecer.
        </p>
        <ul className="ppe-traducoes-lista">
          {textos.map((t) => (
            <li key={t.chave} className={t.pendente ? 'ppe-traducao-pendente' : ''}>
              <div className="ppe-traducao-pt">{t.chave}</div>
              <textarea
                aria-label={`Tradução de: ${t.chave}`}
                value={editados[t.chave] !== undefined ? editados[t.chave] : t.traducao}
                placeholder="Sem tradução"
                onChange={(e) => setEditados((ed) => ({ ...ed, [t.chave]: e.target.value }))}
                rows={Math.min(6, Math.max(1, Math.ceil(t.chave.length / 70)))}
              />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
