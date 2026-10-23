/**
 * Frota Etapa 5 (T2) — fotos da avaria e do cupom (RN-F5.09, RN-F5.10, RN-F5.11).
 * Contrato e textos literais: docs/superpowers/plans/2026-10-23-frotas-etapa5-fotos.md.
 *
 *  - FotosAntesDeSalvar: "Tirar foto" no formulario do portal; as fotos ficam so na tela ate o lancamento ser salvo.
 *  - enviarFotosDoLancamento: depois do 201, sobe uma por vez; devolve o texto do aviso se alguma falhou (ou null).
 *  - MiniaturasFotos / BotaoMaisFoto: "Meus registros" (ver, remover, reenviar).
 *  - ColunaFotos: lista do gestor, so a 1a miniatura + "+N" (cada miniatura e um GET no limite de requisicoes — B58).
 */
import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { enviarFotoFrota, removerFotoFrota } from '../../utils/frotasApi';
import { resolverUrlAssinada } from '../../utils/resolveUploadAssinadoUrl';

export const MAX_FOTOS = 3;
export const PREFIXO_FOTO_FROTA = '/api/uploads/frotas-anexos/';
export const DICA_LIMITE = 'Limite de 3 fotos.';
export const MSG_FALHA_FOTO_GENERICA = 'Confira a internet e tente de novo em Meus registros.';
export const MSG_FALHA_MAIS_FOTO = 'Não foi possível enviar a foto. Confira a internet e tente de novo.';
export const MSG_FALHA_REMOVER = 'Não foi possível remover a foto. Confira a internet e tente de novo.';

export const urlDaFoto = (anexo) => resolverUrlAssinada(anexo?.url, PREFIXO_FOTO_FROTA);
export const anexosDe = (linha) => (Array.isArray(linha?.anexos) ? linha.anexos : []);

const criarPrevia = (file) => {
  try {
    return typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : '';
  } catch (_) {
    return '';
  }
};
const revogarPrevia = (url) => {
  try {
    if (url && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
  } catch (_) { /* nada */ }
};

/** O input de camera escondido atras de um botao (o input tambem tem o rotulo, para leitor de tela). */
function EntradaCamera({ rotulo, desabilitado, onEscolher, classeBotao = 'portal-botao secundario' }) {
  const ref = useRef(null);
  return (
    <>
      <button type="button" className={classeBotao} disabled={desabilitado} onClick={() => ref.current && ref.current.click()}>
        {rotulo}
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        capture="environment"
        aria-label={rotulo}
        className="frota-fotos-input"
        disabled={desabilitado}
        onChange={(e) => {
          const arquivos = Array.from(e.target.files || []);
          e.target.value = '';
          if (arquivos.length) onEscolher(arquivos);
        }}
      />
    </>
  );
}

/**
 * `fotos` = [{ chave, file, previa }] (estado do formulario). A tela cria a previa ao escolher e a revoga ao remover e ao sair.
 */
export function FotosAntesDeSalvar({ legenda, dica, fotos, onChange, desabilitado }) {
  const fotosRef = useRef(fotos);
  fotosRef.current = fotos;
  // Ao sair do formulario (salvou ou voltou), as previas que sobraram sao liberadas.
  useEffect(() => () => { (fotosRef.current || []).forEach((f) => revogarPrevia(f.previa)); }, []);

  const cheio = fotos.length >= MAX_FOTOS;
  const escolher = (arquivos) => {
    const cabem = arquivos.slice(0, Math.max(0, MAX_FOTOS - fotosRef.current.length));
    if (!cabem.length) return;
    const novas = cabem.map((file) => ({ chave: `${Date.now()}-${Math.random()}`, file, previa: criarPrevia(file) }));
    onChange([...fotosRef.current, ...novas]);
  };
  const remover = (chave) => {
    const alvo = fotosRef.current.find((f) => f.chave === chave);
    if (alvo) revogarPrevia(alvo.previa);
    onChange(fotosRef.current.filter((f) => f.chave !== chave));
  };

  return (
    <fieldset className="portal-grupo" data-testid="fotos-antes-de-salvar">
      <legend>{legenda}</legend>
      <p className="portal-dica" data-testid="dica-fotos">{cheio ? DICA_LIMITE : dica}</p>
      {fotos.length > 0 && (
        <ul className="frota-fotos-lista">
          {fotos.map((f, i) => (
            <li key={f.chave} className="frota-fotos-item">
              {f.previa
                ? <img className="frota-fotos-miniatura" src={f.previa} alt={`Foto ${i + 1}`} />
                : <span className="frota-fotos-miniatura frota-fotos-sem-previa">{`Foto ${i + 1}`}</span>}
              <button type="button" className="portal-remover" onClick={() => remover(f.chave)}>Remover foto</button>
            </li>
          ))}
        </ul>
      )}
      <EntradaCamera rotulo="Tirar foto" desabilitado={cheio || desabilitado} onEscolher={escolher} />
    </fieldset>
  );
}

/** Texto literal do aviso (plano, "Textos de tela"). */
export function avisoDeFalhaDasFotos(quantas, mensagem) {
  return quantas === 1
    ? `Salvo, mas 1 foto não foi enviada: ${mensagem}`
    : `Salvo, mas ${quantas} fotos não foram enviadas: ${mensagem}`;
}

/**
 * Sobe as fotos do lancamento recem-criado, uma por vez (await). Nada aqui desfaz o lancamento (RN-F5.09).
 * Devolve o texto do aviso, ou null se todas subiram.
 */
export async function enviarFotosDoLancamento(entidade, entidadeId, fotos) {
  let falhas = 0;
  let primeiraMensagem = null;
  for (const f of fotos || []) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await enviarFotoFrota(entidade, entidadeId, f.file);
    } catch (err) {
      falhas += 1;
      if (primeiraMensagem == null) primeiraMensagem = err?.response?.data?.error || MSG_FALHA_FOTO_GENERICA;
    }
  }
  return falhas ? avisoDeFalhaDasFotos(falhas, primeiraMensagem) : null;
}

/** Miniaturas de um lancamento ("Meus registros"); cada uma abre a foto em outra aba e, com `onRemovida`, tem "Remover foto". */
export function MiniaturasFotos({ anexos, onRemovida }) {
  const lista = Array.isArray(anexos) ? anexos : [];
  const [removendo, setRemovendo] = useState(null);
  if (!lista.length) return null;

  const remover = async (id) => {
    if (!window.confirm('Remover esta foto?')) return;
    setRemovendo(id);
    try {
      await removerFotoFrota(id);
      toast.success('Foto removida');
      if (onRemovida) onRemovida();
    } catch (err) {
      toast.error(err?.response?.data?.error || MSG_FALHA_REMOVER);
    } finally {
      setRemovendo(null);
    }
  };

  return (
    <ul className="frota-fotos-lista" data-testid="miniaturas-fotos">
      {lista.map((a, i) => (
        <li key={a.id} className="frota-fotos-item">
          <a href={urlDaFoto(a)} target="_blank" rel="noopener noreferrer" className="frota-fotos-link">
            <img className="frota-fotos-miniatura" src={urlDaFoto(a)} alt={`Foto ${i + 1}`} loading="lazy" />
          </a>
          {onRemovida && (
            <button type="button" className="portal-remover" disabled={removendo === a.id} onClick={() => remover(a.id)}>
              Remover foto
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/** "+ Foto" de um lancamento ja salvo (some com 3). Reenvia a foto que falhou depois do 201 (RN-F5.10). */
export function BotaoMaisFoto({ entidade, entidadeId, quantas, onEnviada }) {
  const [enviando, setEnviando] = useState(false);
  if ((quantas || 0) >= MAX_FOTOS) return null;
  const escolher = async (arquivos) => {
    setEnviando(true);
    try {
      await enviarFotoFrota(entidade, entidadeId, arquivos[0]);
      toast.success('Foto enviada');
    } catch (err) {
      toast.error(err?.response?.data?.error || MSG_FALHA_MAIS_FOTO);
    } finally {
      setEnviando(false);
    }
    if (onEnviada) onEnviada();
  };
  return (
    <div className="frota-fotos-mais">
      <EntradaCamera rotulo="+ Foto" desabilitado={enviando} onEscolher={escolher} classeBotao="portal-botao secundario frota-fotos-botao-mais" />
    </div>
  );
}

/** Coluna "Fotos" do gestor: so a 1a miniatura (lazy) e "+N" com link para a 2a; sem foto, "-" (RN-F5.11, Fase 2 18). */
export function ColunaFotos({ anexos }) {
  const lista = Array.isArray(anexos) ? anexos : [];
  if (!lista.length) return '-';
  const [primeira, segunda] = lista;
  return (
    <span className="frota-fotos-coluna">
      <a href={urlDaFoto(primeira)} target="_blank" rel="noopener noreferrer" className="frota-fotos-link">
        <img className="frota-fotos-miniatura pequena" src={urlDaFoto(primeira)} alt="Foto 1" loading="lazy" />
      </a>
      {segunda && (
        <a href={urlDaFoto(segunda)} target="_blank" rel="noopener noreferrer" className="frota-fotos-mais-n">
          {`+${lista.length - 1}`}
        </a>
      )}
    </span>
  );
}
