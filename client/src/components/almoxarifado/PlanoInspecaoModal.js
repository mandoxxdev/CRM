import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { FiSave, FiTrash2, FiRotateCcw, FiChevronDown, FiChevronUp, FiPlus } from 'react-icons/fi';
import { SkeletonTable } from '../SkeletonLoader';
import { formatarFaixa } from './faixaTolerancia';
import './Almoxarifado.css';

/**
 * Cadastro do plano de inspeção de UM material (Etapa 30, Task 1 — C5, D1..D6).
 *
 * O CRUD existe e é testado desde a Etapa 27, mas até aqui o plano só nascia por `curl`: sem esta
 * tela, o bloco "Medidas do plano" que a Etapa 29 entregou no modal de decisão era inalcançável
 * para quem opera. O modal edita LINHA A LINHA (D2), porque o backend tem uma rota por
 * característica e não uma rota de plano — simular a transação no client gravaria parte e falharia
 * no meio.
 *
 * Regras que este componente NÃO pode violar:
 *
 * 1. **A faixa vem de `formatarFaixa`, importada.** A Etapa 29 fundiu duas cópias da fórmula que
 *    JÁ DIVERGIAM; recopiar aqui recriaria o defeito. Mostrar a faixa é aritmética de exibição
 *    (D3) — decidir conforme/não conforme continua sendo do servidor, e nada aqui compara
 *    tolerância.
 * 2. **Nenhum campo numérico sai como `''` ou `null` (RN-09).** O POST tem
 *    `paraNumeroFinito(...) ?? 0`; o PUT NÃO tem, e responde **400 "Desvio inválido"** para `''`.
 *    Limpar um desvio para zerá-lo é o caso mais banal do formulário — por isso desvio em branco
 *    vira o NÚMERO 0, e `valor_nominal` em branco é barrado aqui (o 400 do servidor,
 *    "Valor nominal é obrigatório", é enganoso na frente de um campo preenchido com `10,5`).
 * 3. **Vírgula decimal é convertida antes de enviar (RN-10)**, porque o `paraNumeroFinito` do
 *    servidor não troca vírgula — mas o `formatarFaixa` troca, então a faixa ao lado já mostraria
 *    `[10.4 ; 10.6]` enquanto o POST recusaria o mesmo `10,5`.
 * 4. **A checagem de conflito de nome ao reativar é `===` CRU (RN-06)** — sem `toLowerCase`, sem
 *    `normalize`, sem `localeCompare`, sem re-trim. O índice do SQLite é BINARY: `"RUGOSIDADE x"`
 *    ao lado de `"Rugosidade x"` é ACEITO pela rota (medido). Qualquer comparação "amigável"
 *    faria a tela barrar o que o servidor aceita — e uma régua duplicada que não reproduz a do
 *    servidor é a mesma classe de defeito que a B60 recusou.
 * 5. **`0` é `valor_nominal` legítimo** (batimento, planeza, folga): a checagem é `=== null`, não
 *    falsy, dos dois lados.
 *
 * Props: o OBJETO `material` (`{ id, codigo, nome, unidade }`) e `onClose`. Diverge de propósito
 * dos outros modais por material desta base, que recebem `materialId` escalar: o cabeçalho aqui
 * mostra código, nome e unidade, e a linha da lista já os tem.
 */

const LINHA_VAZIA = {
  caracteristica: '', unidade: '', valor_nominal: '', desvio_inferior: '', desvio_superior: '',
};

/** Mesma régua do `paraNumeroFinito` do servidor, MAIS a troca de vírgula (RN-10). */
const paraNumeroFinito = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const t = String(v ?? '').trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/** Registro do servidor → valores do formulário. `unidade` null vira '', nunca a string "null". */
const paraFormulario = (p) => ({
  caracteristica: p.caracteristica ?? '',
  unidade: p.unidade ?? '',
  valor_nominal: p.valor_nominal === null || p.valor_nominal === undefined ? '' : String(p.valor_nominal),
  desvio_inferior: p.desvio_inferior === null || p.desvio_inferior === undefined ? '' : String(p.desvio_inferior),
  desvio_superior: p.desvio_superior === null || p.desvio_superior === undefined ? '' : String(p.desvio_superior),
});

// O GET ordena `ORDER BY caracteristica` (BINARY). Inserir a resposta do POST no fim da lista
// deixaria a linha fora da ordem que um reload mostraria, então reordenamos localmente — com
// comparação de código, não `localeCompare`, que reordenaria acentos de outro jeito.
const ordenar = (lista) => [...lista].sort((a, b) => {
  const x = String(a.caracteristica ?? '');
  const y = String(b.caracteristica ?? '');
  return x < y ? -1 : x > y ? 1 : 0;
});

/**
 * Converte os campos do formulário nos valores que a rota grava, ou devolve `{ erro }`.
 * Nenhuma validação de faixa aqui: `inf > sup` é recusa do servidor (400 literal), e duplicar a
 * régua faria a tela discordar dele quando um dos dois mudasse.
 */
const lerLinha = (f) => {
  const caracteristica = String(f.caracteristica ?? '').trim();
  if (!caracteristica) return { erro: 'Informe a característica.' };

  const nominalBruto = String(f.valor_nominal ?? '').trim();
  if (nominalBruto === '') return { erro: 'Informe o valor nominal.' };
  const valorNominal = paraNumeroFinito(nominalBruto);
  if (valorNominal === null) {
    return { erro: `Valor nominal inválido: "${nominalBruto}". Use ponto ou vírgula decimal (ex.: 10,5).` };
  }

  const desvios = {};
  for (const [chave, rotulo] of [['desvio_inferior', 'Desvio inferior'], ['desvio_superior', 'Desvio superior']]) {
    const bruto = String(f[chave] ?? '').trim();
    // Em branco é o NÚMERO 0 (RN-09) — nunca '' nem null, que o PUT recusa com "Desvio inválido".
    if (bruto === '') { desvios[chave] = 0; continue; }
    const n = paraNumeroFinito(bruto);
    if (n === null) {
      return { erro: `${rotulo} inválido: "${bruto}". Use ponto ou vírgula decimal (ex.: -0,05).` };
    }
    desvios[chave] = n;
  }

  return {
    caracteristica,
    unidade: String(f.unidade ?? '').trim(),
    valor_nominal: valorNominal,
    desvio_inferior: desvios.desvio_inferior,
    desvio_superior: desvios.desvio_superior,
  };
};

const mensagemDoErro = (err, padrao) => err?.response?.data?.error || padrao;

/** Os cinco campos de uma característica, mais a faixa resultante ao lado (D3). */
const CamposCaracteristica = ({ valores, onChange, disabled }) => {
  const campo = (nome, placeholder, extra = {}) => (
    <input
      className="almox-input"
      data-campo={nome}
      placeholder={placeholder}
      value={valores[nome]}
      disabled={disabled}
      onChange={(e) => onChange(nome, e.target.value)}
      {...extra}
    />
  );
  // Sem nominal não há faixa: `formatarFaixa('', '', '')` daria `[0 ; 0]` numa linha em branco,
  // porque `Number('')` é 0 — uma faixa inventada é pior que um travessão.
  const temNominal = paraNumeroFinito(valores.valor_nominal) !== null;
  return (
    <>
      {campo('caracteristica', 'Característica')}
      {campo('unidade', 'Unidade')}
      {/* `type="text"` + `inputMode="decimal"`: `type="number"` engole a vírgula em alguns
          navegadores (achado 7 da Etapa 29) e a RN-10 depende de a vírgula CHEGAR aqui. */}
      {campo('valor_nominal', 'Nominal', { type: 'text', inputMode: 'decimal' })}
      {campo('desvio_inferior', 'Desvio inf.', { type: 'text', inputMode: 'decimal' })}
      {campo('desvio_superior', 'Desvio sup.', { type: 'text', inputMode: 'decimal' })}
      <span className="almox-plano-faixa" data-testid="faixa"
        style={{ whiteSpace: 'nowrap', fontSize: '0.82rem', color: 'var(--gmp-text-light)', alignSelf: 'center' }}>
        {temNominal
          ? formatarFaixa(valores.valor_nominal, valores.desvio_inferior, valores.desvio_superior)
          : '—'}
      </span>
    </>
  );
};

const GRADE_LINHA = {
  display: 'grid',
  gridTemplateColumns: '1.6fr 0.7fr 0.9fr 0.9fr 0.9fr 1.3fr auto',
  gap: 8,
  alignItems: 'center',
  marginBottom: 8,
};

const PlanoInspecaoModal = ({ material, onClose }) => {
  const [itens, setItens] = useState([]);
  const [edits, setEdits] = useState({});       // { [id]: valores do formulário daquela linha }
  const [nova, setNova] = useState(LINHA_VAZIA);
  const [loading, setLoading] = useState(true);
  // RN-08: falha ao carregar NÃO pode virar "plano vazio". "Nenhuma característica cadastrada" é
  // indistinguível de "não carregou", o toast some em segundos, e o usuário cadastra a segunda
  // cópia de tudo. Mesma régua que o Histórico teve de aprender na Etapa 29.
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState({});
  const [mostrarInativas, setMostrarInativas] = useState(false);

  const materialId = material?.id;

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      // `todos: 1` é o que traz as INATIVAS junto — sem ele não há como reativar o que se desativou.
      const res = await api.get('/almoxarifado/planos-inspecao',
        { params: { material_id: materialId, todos: 1 } });
      const lista = ordenar(res.data || []);
      setItens(lista);
      setEdits(Object.fromEntries(lista.map((p) => [p.id, paraFormulario(p)])));
    } catch (err) {
      const msg = mensagemDoErro(err, 'Erro ao carregar o plano de inspeção');
      toast.error(msg);
      setItens([]);
      setErro(msg);
    } finally {
      setLoading(false);
    }
  }, [materialId]);

  useEffect(() => { if (materialId) carregar(); }, [materialId, carregar]);

  if (!material) return null;

  const marcarSalvando = (chave, valor) => setSalvando((s) => ({ ...s, [chave]: valor }));
  const mudarEdit = (id, nome, valor) =>
    setEdits((e) => ({ ...e, [id]: { ...e[id], [nome]: valor } }));

  const adicionar = async () => {
    const lido = lerLinha(nova);
    if (lido.erro) { toast.error(lido.erro); return; }
    marcarSalvando('nova', true);
    try {
      const res = await api.post('/almoxarifado/planos-inspecao', {
        material_id: materialId,
        caracteristica: lido.caracteristica,
        unidade: lido.unidade,
        valor_nominal: lido.valor_nominal,
        desvio_inferior: lido.desvio_inferior,
        desvio_superior: lido.desvio_superior,
      });
      const criado = { ativo: 1, material_id: materialId, ...(res?.data || {}) };
      setItens((lista) => ordenar([...lista, criado]));
      setEdits((e) => ({ ...e, [criado.id]: paraFormulario(criado) }));
      setNova(LINHA_VAZIA);
      toast.success('Característica adicionada ao plano.');
    } catch (err) {
      // A recusa do servidor vai LITERAL, e a linha continua preenchida: perder o que foi digitado
      // é o jeito mais rápido de o usuário desistir do formulário.
      toast.error(mensagemDoErro(err, 'Erro ao adicionar a característica'));
    } finally {
      marcarSalvando('nova', false);
    }
  };

  const salvar = async (p) => {
    const lido = lerLinha(edits[p.id] || paraFormulario(p));
    if (lido.erro) { toast.error(lido.erro); return; }

    // RN-04: só o que MUDOU vai no corpo. A rota preserva os seis campos quando omitidos, e mandar
    // o resto reescreveria o que ninguém tocou (inclusive `ativo`).
    const payload = {};
    if (lido.caracteristica !== p.caracteristica) payload.caracteristica = lido.caracteristica;
    if (lido.unidade !== (p.unidade ?? '')) payload.unidade = lido.unidade;
    if (lido.valor_nominal !== Number(p.valor_nominal)) payload.valor_nominal = lido.valor_nominal;
    if (lido.desvio_inferior !== Number(p.desvio_inferior)) payload.desvio_inferior = lido.desvio_inferior;
    if (lido.desvio_superior !== Number(p.desvio_superior)) payload.desvio_superior = lido.desvio_superior;

    if (Object.keys(payload).length === 0) { toast.info('Nada mudou nesta característica.'); return; }

    marcarSalvando(p.id, true);
    try {
      await api.put(`/almoxarifado/planos-inspecao/${p.id}`, payload);
      // Aplicamos os valores RESOLVIDOS (o que a rota grava), não a resposta: POST e PUT montam o
      // objeto à mão e não devolvem `created_at`, e um merge cego perderia o que já estava aqui.
      const atualizado = {
        ...p,
        caracteristica: lido.caracteristica,
        unidade: lido.unidade === '' ? null : lido.unidade,
        valor_nominal: lido.valor_nominal,
        desvio_inferior: lido.desvio_inferior,
        desvio_superior: lido.desvio_superior,
      };
      setItens((lista) => ordenar(lista.map((i) => (i.id === p.id ? atualizado : i))));
      setEdits((e) => ({ ...e, [p.id]: paraFormulario(atualizado) }));
      toast.success('Característica atualizada.');
    } catch (err) {
      toast.error(mensagemDoErro(err, 'Erro ao salvar a característica'));
    } finally {
      marcarSalvando(p.id, false);
    }
  };

  const desativar = async (p) => {
    marcarSalvando(p.id, true);
    try {
      const res = await api.delete(`/almoxarifado/planos-inspecao/${p.id}`);
      // Soft delete: a linha migra de bloco aqui mesmo, sem recarregar a lista inteira. E
      // `{ ja_inativo: true }` vem com 200 — é idempotência (Etapa 23), NÃO erro.
      setItens((lista) => lista.map((i) => (i.id === p.id ? { ...i, ativo: 0 } : i)));
      if (res?.data?.ja_inativo) toast.info('Esta característica já estava inativa.');
      else toast.success('Característica desativada.');
    } catch (err) {
      toast.error(mensagemDoErro(err, 'Erro ao desativar a característica'));
    } finally {
      marcarSalvando(p.id, false);
    }
  };

  const reativar = async (p) => {
    // RN-06: o índice único é PARCIAL (`WHERE ativo = 1`), então desativar LIBERA o nome. Se
    // alguém recriou a característica no meio tempo, reativar a antiga colide e a rota responde
    // "Já existe esta característica no plano deste material" — mensagem que, na frente de um
    // botão "Reativar", não explica nada. A checagem abaixo existe só para a MENSAGEM: quem decide
    // continua sendo o servidor, e o 400 dele é tratado do mesmo jeito logo abaixo.
    //
    // `===` CRU de propósito: o índice do SQLite é BINARY e a rota aceita "FOLGA" ao lado de
    // "Folga". `toLowerCase`/`normalize`/`localeCompare` fariam a tela barrar o que o servidor
    // aceitaria — uma régua duplicada que não reproduz a do servidor.
    const conflito = itens.find((i) => i.ativo === 1 && i.caracteristica === p.caracteristica);
    if (conflito) {
      toast.error(`Já existe uma característica ativa chamada "${conflito.caracteristica}". `
        + 'Renomeie ou desative a outra antes de reativar esta.');
      return;
    }
    marcarSalvando(p.id, true);
    try {
      // `1` NUMÉRICO: a rota faz `req.body.ativo ? 1 : 0`, então a string `'0'` também reativaria —
      // e string é exatamente o que um formulário produz sem querer.
      await api.put(`/almoxarifado/planos-inspecao/${p.id}`, { ativo: 1 });
      setItens((lista) => ordenar(lista.map((i) => (i.id === p.id ? { ...i, ativo: 1 } : i))));
      toast.success('Característica reativada.');
    } catch (err) {
      toast.error(mensagemDoErro(err, 'Erro ao reativar a característica'));
    } finally {
      marcarSalvando(p.id, false);
    }
  };

  const ativas = itens.filter((i) => i.ativo === 1);
  const inativas = itens.filter((i) => i.ativo !== 1);

  return (
    <div className="almox-modal-overlay" onClick={onClose}>
      <div className="almox-modal almox-modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="almox-modal-header">
          <h2>Plano de inspeção — {material.nome}</h2>
          <button className="almox-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="almox-modal-body">
          <div style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)', marginBottom: 16 }}>
            {material.codigo}{material.unidade ? ` · ${material.unidade}` : ''} — a faixa ao lado de
            cada característica é <strong>nominal + desvio</strong>, com sinal: um plano unilateral
            (+0.005/+0.021) tem a faixa inteira acima do nominal.
          </div>

          {loading ? (
            <SkeletonTable rows={4} columns={6} />
          ) : erro ? (
            <div className="almox-empty">
              <p>Não foi possível carregar o plano de inspeção.</p>
              <p style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>{erro}</p>
              <button className="btn-almox-secondary" onClick={carregar}>Tentar de novo</button>
            </div>
          ) : (
            <>
              <div className="almox-section-title">Características ativas</div>
              <div data-testid="plano-ativas">
                {ativas.length === 0 ? (
                  <p style={{ fontSize: '0.85rem', color: 'var(--gmp-text-light)' }}>
                    Nenhuma característica cadastrada ainda.
                  </p>
                ) : ativas.map((p) => (
                  <div key={p.id} className="almox-plano-linha" data-testid={`plano-linha-${p.id}`} style={GRADE_LINHA}>
                    <CamposCaracteristica
                      valores={edits[p.id] || paraFormulario(p)}
                      onChange={(nome, valor) => mudarEdit(p.id, nome, valor)}
                      disabled={!!salvando[p.id]}
                    />
                    <span style={{ display: 'flex', gap: 4 }}>
                      <button className="almox-btn-icon success" title="Salvar"
                        disabled={!!salvando[p.id]} onClick={() => salvar(p)}>
                        <FiSave size={14} />
                      </button>
                      <button className="almox-btn-icon danger" title="Desativar"
                        disabled={!!salvando[p.id]} onClick={() => desativar(p)}>
                        <FiTrash2 size={14} />
                      </button>
                    </span>
                  </div>
                ))}
              </div>

              <div className="almox-section-title">Nova característica</div>
              <div className="almox-plano-linha" data-testid="plano-nova" style={GRADE_LINHA}>
                <CamposCaracteristica
                  valores={nova}
                  onChange={(nome, valor) => setNova((n) => ({ ...n, [nome]: valor }))}
                  disabled={!!salvando.nova}
                />
                <button className="btn-almox-primary" title="Adicionar"
                  disabled={!!salvando.nova} onClick={adicionar}>
                  <FiPlus size={13} /> Adicionar
                </button>
              </div>

              {inativas.length > 0 && (
                <>
                  <button className="btn-almox-secondary" data-testid="plano-inativas-toggle"
                    style={{ marginTop: 20 }}
                    onClick={() => setMostrarInativas((v) => !v)}>
                    {mostrarInativas ? <FiChevronUp size={13} /> : <FiChevronDown size={13} />}
                    {' '}Inativas ({inativas.length})
                  </button>
                  {mostrarInativas && (
                    <div data-testid="plano-inativas" style={{ marginTop: 12 }}>
                      <p style={{ fontSize: '0.78rem', color: 'var(--gmp-text-light)', margin: '0 0 8px' }}>
                        Desativar libera o nome: se a característica foi recriada depois, reativar a
                        antiga é recusado — renomeie ou desative a outra.
                      </p>
                      {inativas.map((p) => (
                        <div key={p.id} className="almox-plano-linha" data-testid={`plano-inativa-${p.id}`}
                          style={{ ...GRADE_LINHA, opacity: 0.75 }}>
                          <span style={{ gridColumn: 'span 2' }}>
                            {p.caracteristica}
                            {p.unidade ? <span style={{ color: 'var(--gmp-text-light)' }}> ({p.unidade})</span> : null}
                          </span>
                          <span style={{ gridColumn: 'span 3', fontSize: '0.82rem', color: 'var(--gmp-text-light)' }}>
                            nominal {p.valor_nominal}
                          </span>
                          <span className="almox-plano-faixa" data-testid="faixa"
                            style={{ whiteSpace: 'nowrap', fontSize: '0.82rem', color: 'var(--gmp-text-light)' }}>
                            {formatarFaixa(p.valor_nominal, p.desvio_inferior, p.desvio_superior)}
                          </span>
                          <button className="almox-btn-icon primary" title="Reativar"
                            disabled={!!salvando[p.id]} onClick={() => reativar(p)}>
                            <FiRotateCcw size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
        <div className="almox-modal-footer">
          <button type="button" className="btn-almox-secondary" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
};

export default PlanoInspecaoModal;
