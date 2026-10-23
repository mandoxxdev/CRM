/**
 * Frota Etapa 1 (T6) — o portal do motorista: o formulario de papel dentro do sistema.
 *
 * Celular primeiro: uma coluna, botoes grandes, sem tabela larga, palavras de quem dirige (nao de quem administra).
 * Contratos (congelados no plano docs/superpowers/plans/2026-10-23-frotas-etapa1-portal-do-motorista.md):
 *   GET  /frotas/portal/inicio          -> motorista, viagem_aberta, veiculos, itens (os 12), vistas, tipos_avaria,
 *                                          niveis_combustivel, perfil, pode_registrar, pode_gerir
 *   POST /frotas/portal/registros       -> saida | retorno | inspecao (um formulario so, como o papel)
 *   POST /frotas/portal/abastecimentos
 *   GET  /frotas/portal/meus-registros
 * Quem decide e o servidor: a tela so esconde o que ele recusaria e mostra a mensagem dele quando recusa.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { hojeLocalISO } from '../../utils/dataLocal';
import { useAuth } from '../../context/AuthContext';
import { getEffectiveUser } from '../../services/permissionsCache';
import { perfilFrota } from '../../utils/systemPermissions';
import './Frotas.css';
import './FrotasPortalMotorista.css';

export const MSG_SEM_VINCULO = 'Seu usuário não está ligado a um motorista. Peça ao gestor da frota para fazer o vínculo.';

const ROTULO_COMBUSTIVEL = { vazio: 'Vazio', '1/4': '¼', '1/2': '½', '3/4': '¾', cheio: 'Cheio' };
const NIVEIS_PADRAO = ['vazio', '1/4', '1/2', '3/4', 'cheio'];

export const NOME_VISTA = {
  lateral_esquerda: 'Lado esquerdo',
  lateral_direita: 'Lado direito',
  superior: 'Em cima (teto)',
  frente: 'Frente',
  traseira: 'Traseira',
};
const VISTAS_PADRAO = Object.keys(NOME_VISTA);

export const NOME_TIPO_AVARIA = { R: 'Risco', A: 'Amassado', T: 'Trinca', Q: 'Quebrado', O: 'Outro' };
const TIPOS_AVARIA_PADRAO = Object.keys(NOME_TIPO_AVARIA);

const RESPOSTAS = [
  { valor: 'OK', rotulo: 'OK' },
  { valor: 'NA', rotulo: 'N/A' },
  { valor: 'FALHA', rotulo: 'Falha' },
];

const TITULO_TIPO = { saida: 'Saída', retorno: 'Retorno', inspecao: 'Inspeção' };

export const SITUACAO = {
  OK: { rotulo: 'OK', classe: 'ok' },
  PENDENCIA: { rotulo: 'PENDÊNCIA', classe: 'pendencia' },
  INCOMPLETO: { rotulo: 'INCOMPLETO', classe: 'incompleto' },
};

const dois = (n) => String(n).padStart(2, '0');
const horaAgora = () => { const d = new Date(); return `${dois(d.getHours())}:${dois(d.getMinutes())}`; };

/** 'AAAA-MM-DD' ou 'AAAA-MM-DDTHH:MM' (ou com espaco) -> 'DD/MM/AAAA' e, se houver, ' às HH:MM'. */
export function dataLegivel(valor) {
  if (!valor) return '-';
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(String(valor));
  if (!m) return String(valor);
  const dia = `${m[3]}/${m[2]}/${m[1]}`;
  return m[4] ? `${dia} às ${m[4]}:${m[5]}` : dia;
}

const numeroOuNulo = (v) => (v === '' || v == null ? null : Number(v));

function ErroDoServidor({ mensagem }) {
  const ref = useRef(null);
  useEffect(() => {
    if (mensagem && ref.current && typeof ref.current.scrollIntoView === 'function') {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [mensagem]);
  if (!mensagem) return null;
  return <div ref={ref} className="portal-erro" role="alert">{mensagem}</div>;
}

function rotuloVeiculo(v) {
  const nome = [v.marca, v.modelo].filter(Boolean).join(' ');
  return nome ? `${v.placa} — ${nome}` : v.placa;
}

/* ---------------------------------------------------------------- saida / retorno / inspecao */

export function RegistroForm({ tipo, inicio, onCancelar, onSalvo }) {
  const itens = inicio.itens || [];
  const vistas = inicio.vistas || VISTAS_PADRAO;
  const tiposAvaria = inicio.tipos_avaria || TIPOS_AVARIA_PADRAO;
  const niveis = inicio.niveis_combustivel || NIVEIS_PADRAO;
  const viagem = inicio.viagem_aberta;
  const escolheVeiculo = tipo !== 'retorno';

  // Na saida, o veiculo que ja saiu (sem retorno) nem aparece; o que esta em manutencao aparece, mas nao da para escolher.
  const veiculos = (inicio.veiculos || []).filter((v) => tipo !== 'saida' || !v.em_uso);

  const [veiculoId, setVeiculoId] = useState('');
  const [km, setKm] = useState('');
  const [data, setData] = useState(hojeLocalISO());
  const [horario, setHorario] = useState(horaAgora());
  const [combustivel, setCombustivel] = useState(null);
  const [origem, setOrigem] = useState('');
  const [destino, setDestino] = useState('');
  const [finalidade, setFinalidade] = useState('');
  const [respostas, setRespostas] = useState({});
  const [avarias, setAvarias] = useState([]);
  const [novaAvaria, setNovaAvaria] = useState(null);
  const [observacoes, setObservacoes] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const respondidos = itens.filter((it) => respostas[it.chave]).length;
  const faltam = itens.length - respondidos;
  const podeSalvar = itens.length > 0 && faltam === 0 && !salvando;

  const incluirAvaria = () => {
    if (!novaAvaria?.vista || !novaAvaria?.tipo) return;
    const av = { vista: novaAvaria.vista, tipo: novaAvaria.tipo };
    if (novaAvaria.descricao && novaAvaria.descricao.trim()) av.descricao = novaAvaria.descricao.trim();
    setAvarias((lista) => [...lista, av]);
    setNovaAvaria(null);
  };

  const salvar = async (e) => {
    e.preventDefault();
    if (!podeSalvar) return;
    setErro('');
    setSalvando(true);
    const corpo = {
      tipo,
      km: numeroOuNulo(km),
      data,
      horario,
      nivel_combustivel: combustivel,
      itens: { ...respostas },
      avarias,
    };
    if (escolheVeiculo) corpo.veiculo_id = numeroOuNulo(veiculoId);
    if (observacoes.trim()) corpo.observacoes = observacoes.trim();
    if (tipo === 'saida') {
      if (origem.trim()) corpo.origem = origem.trim();
      if (destino.trim()) corpo.destino = destino.trim();
      if (finalidade.trim()) corpo.finalidade = finalidade.trim();
    }
    try {
      await api.post('/frotas/portal/registros', corpo);
      toast.success(`${TITULO_TIPO[tipo]} ${tipo === 'retorno' ? 'registrado' : 'registrada'}`);
      onSalvo();
    } catch (err) {
      setErro(err.response?.data?.error || 'Não foi possível salvar. Confira a internet e tente de novo.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <form className="portal-form" onSubmit={salvar} aria-label={`Formulário de ${TITULO_TIPO[tipo]}`}>
      <h2 className="portal-form-titulo">{TITULO_TIPO[tipo]}</h2>
      <ErroDoServidor mensagem={erro} />

      {escolheVeiculo ? (
        <label className="portal-campo">
          <span>Veículo</span>
          <select value={veiculoId} onChange={(e) => setVeiculoId(e.target.value)} name="veiculo_id">
            <option value="">Escolha o veículo…</option>
            {veiculos.map((v) => {
              const indisponivel = tipo === 'saida' && v.status === 'manutencao';
              return (
                <option key={v.id} value={v.id} disabled={indisponivel}>
                  {rotuloVeiculo(v)}{indisponivel ? ' (em manutenção — indisponível)' : ''}
                </option>
              );
            })}
          </select>
        </label>
      ) : (
        <div className="portal-cartao" data-testid="veiculo-da-viagem">
          Veículo: <strong>{viagem?.placa || '-'}</strong>
          {viagem?.km_saida != null && <> · saiu com {Number(viagem.km_saida).toLocaleString('pt-BR')} km</>}
        </div>
      )}

      <label className="portal-campo">
        <span>KM atual (o que está no painel)</span>
        <input type="number" inputMode="numeric" min="0" name="km" value={km} onChange={(e) => setKm(e.target.value)} />
      </label>

      <div className="portal-linha">
        <label className="portal-campo">
          <span>Data</span>
          <input type="date" name="data" value={data} onChange={(e) => setData(e.target.value)} />
        </label>
        <label className="portal-campo">
          <span>Horário</span>
          <input type="time" name="horario" value={horario} onChange={(e) => setHorario(e.target.value)} />
        </label>
      </div>

      <fieldset className="portal-grupo">
        <legend>Combustível</legend>
        <div className="portal-opcoes portal-opcoes-5">
          {niveis.map((n) => (
            <button
              key={n}
              type="button"
              className={`portal-opcao ${combustivel === n ? 'marcada' : ''}`}
              aria-pressed={combustivel === n}
              onClick={() => setCombustivel(combustivel === n ? null : n)}
            >
              {ROTULO_COMBUSTIVEL[n] || n}
            </button>
          ))}
        </div>
      </fieldset>

      {tipo === 'saida' && (
        <>
          <label className="portal-campo">
            <span>Saindo de onde</span>
            <input type="text" name="origem" value={origem} onChange={(e) => setOrigem(e.target.value)} />
          </label>
          <label className="portal-campo">
            <span>Indo para onde</span>
            <input type="text" name="destino" value={destino} onChange={(e) => setDestino(e.target.value)} />
          </label>
          <label className="portal-campo">
            <span>Para quê (finalidade)</span>
            <input type="text" name="finalidade" value={finalidade} onChange={(e) => setFinalidade(e.target.value)} />
          </label>
        </>
      )}

      <fieldset className="portal-grupo">
        <legend>Condições do veículo</legend>
        <p className="portal-dica">Marque todos os itens. Falha = algo errado, N/A = não se aplica a este veículo.</p>
        {itens.map((it) => (
          <div key={it.chave} className="portal-item" data-chave={it.chave}>
            <div className="portal-item-rotulo">{it.rotulo}</div>
            <div className="portal-opcoes">
              {RESPOSTAS.map((r) => (
                <button
                  key={r.valor}
                  type="button"
                  className={`portal-opcao resp-${r.valor.toLowerCase()} ${respostas[it.chave] === r.valor ? 'marcada' : ''}`}
                  aria-pressed={respostas[it.chave] === r.valor}
                  aria-label={`${it.rotulo}: ${r.rotulo}`}
                  onClick={() => setRespostas((atual) => ({ ...atual, [it.chave]: r.valor }))}
                >
                  {r.rotulo}
                </button>
              ))}
            </div>
          </div>
        ))}
      </fieldset>

      <fieldset className="portal-grupo">
        <legend>Avarias (riscos, amassados…)</legend>
        {avarias.length === 0 && !novaAvaria && <p className="portal-dica">Nenhuma avaria marcada.</p>}
        <ul className="portal-lista-avarias">
          {avarias.map((a, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <li key={i}>
              <span>
                <strong>{NOME_VISTA[a.vista] || a.vista}</strong>: {NOME_TIPO_AVARIA[a.tipo] || a.tipo}
                {a.descricao ? ` — ${a.descricao}` : ''}
              </span>
              <button type="button" className="portal-remover" onClick={() => setAvarias((l) => l.filter((_, j) => j !== i))}>
                Remover
              </button>
            </li>
          ))}
        </ul>
        {novaAvaria ? (
          <div className="portal-nova-avaria">
            <label className="portal-campo">
              <span>Onde no veículo</span>
              <select
                name="vista"
                value={novaAvaria.vista}
                onChange={(e) => setNovaAvaria((a) => ({ ...a, vista: e.target.value }))}
              >
                <option value="">Escolha…</option>
                {vistas.map((v) => <option key={v} value={v}>{NOME_VISTA[v] || v}</option>)}
              </select>
            </label>
            <div className="portal-campo">
              <span>O que é</span>
              <div className="portal-opcoes portal-opcoes-5">
                {tiposAvaria.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`portal-opcao ${novaAvaria.tipo === t ? 'marcada' : ''}`}
                    aria-pressed={novaAvaria.tipo === t}
                    onClick={() => setNovaAvaria((a) => ({ ...a, tipo: t }))}
                  >
                    {NOME_TIPO_AVARIA[t] || t}
                  </button>
                ))}
              </div>
            </div>
            <label className="portal-campo">
              <span>Descrição (opcional)</span>
              <input
                type="text"
                name="descricao_avaria"
                value={novaAvaria.descricao}
                onChange={(e) => setNovaAvaria((a) => ({ ...a, descricao: e.target.value }))}
              />
            </label>
            <div className="portal-linha">
              <button type="button" className="portal-botao secundario" onClick={() => setNovaAvaria(null)}>Cancelar</button>
              <button
                type="button"
                className="portal-botao"
                disabled={!novaAvaria.vista || !novaAvaria.tipo}
                onClick={incluirAvaria}
              >
                Incluir avaria
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="portal-botao secundario"
            onClick={() => setNovaAvaria({ vista: '', tipo: '', descricao: '' })}
          >
            + Adicionar avaria
          </button>
        )}
      </fieldset>

      <label className="portal-campo">
        <span>Observações</span>
        <textarea name="observacoes" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={3} />
      </label>

      <div className="portal-rodape">
        {faltam > 0 && <p className="portal-dica" data-testid="faltam">Faltam {faltam} de {itens.length} itens.</p>}
        <div className="portal-linha">
          <button type="button" className="portal-botao secundario" onClick={onCancelar}>Voltar</button>
          <button type="submit" className="portal-botao" disabled={!podeSalvar}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </form>
  );
}

/* ---------------------------------------------------------------- abastecimento */

export function AbastecimentoForm({ inicio, onCancelar, onSalvo }) {
  const [form, setForm] = useState({
    veiculo_id: inicio.viagem_aberta?.veiculo_id ? String(inicio.viagem_aberta.veiculo_id) : '',
    km: '', litros: '', valor_total: '', data: hojeLocalISO(), posto: '', observacoes: '',
  });
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const muda = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const salvar = async (e) => {
    e.preventDefault();
    setErro('');
    setSalvando(true);
    const corpo = {
      veiculo_id: numeroOuNulo(form.veiculo_id),
      km: numeroOuNulo(form.km),
      litros: numeroOuNulo(form.litros),
      data: form.data,
    };
    if (form.valor_total !== '') corpo.valor_total = Number(form.valor_total);
    if (form.posto.trim()) corpo.posto = form.posto.trim();
    if (form.observacoes.trim()) corpo.observacoes = form.observacoes.trim();
    try {
      await api.post('/frotas/portal/abastecimentos', corpo);
      toast.success('Abastecimento registrado');
      onSalvo();
    } catch (err) {
      setErro(err.response?.data?.error || 'Não foi possível salvar. Confira a internet e tente de novo.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <form className="portal-form" onSubmit={salvar} aria-label="Formulário de Abastecimento">
      <h2 className="portal-form-titulo">Abastecimento</h2>
      <ErroDoServidor mensagem={erro} />
      <label className="portal-campo">
        <span>Veículo</span>
        <select name="veiculo_id" value={form.veiculo_id} onChange={muda('veiculo_id')}>
          <option value="">Escolha o veículo…</option>
          {(inicio.veiculos || []).map((v) => <option key={v.id} value={v.id}>{rotuloVeiculo(v)}</option>)}
        </select>
      </label>
      <label className="portal-campo">
        <span>KM atual (o que está no painel)</span>
        <input type="number" inputMode="numeric" min="0" name="km" value={form.km} onChange={muda('km')} />
      </label>
      <div className="portal-linha">
        <label className="portal-campo">
          <span>Litros</span>
          <input type="number" inputMode="decimal" min="0" step="0.01" name="litros" value={form.litros} onChange={muda('litros')} />
        </label>
        <label className="portal-campo">
          <span>Valor total (R$)</span>
          <input type="number" inputMode="decimal" min="0" step="0.01" name="valor_total" value={form.valor_total} onChange={muda('valor_total')} />
        </label>
      </div>
      <label className="portal-campo">
        <span>Data</span>
        <input type="date" name="data" value={form.data} onChange={muda('data')} />
      </label>
      <label className="portal-campo">
        <span>Posto</span>
        <input type="text" name="posto" value={form.posto} onChange={muda('posto')} />
      </label>
      <label className="portal-campo">
        <span>Observações</span>
        <textarea name="observacoes" value={form.observacoes} onChange={muda('observacoes')} rows={3} />
      </label>
      <div className="portal-rodape">
        <div className="portal-linha">
          <button type="button" className="portal-botao secundario" onClick={onCancelar}>Voltar</button>
          <button type="submit" className="portal-botao" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </form>
  );
}

/* ---------------------------------------------------------------- meus registros */

function MeusRegistros({ dados }) {
  const registros = dados?.registros || [];
  const abastecimentos = dados?.abastecimentos || [];
  return (
    <section className="portal-secao" aria-label="Meus registros">
      <h2>Meus registros</h2>
      {registros.length === 0 ? (
        <p className="portal-dica">Nenhum registro ainda.</p>
      ) : (
        <ul className="portal-lista">
          {registros.map((r) => {
            const sit = SITUACAO[r.status_geral];
            return (
              <li key={`r${r.id}`} className="portal-lista-item">
                <div>
                  <strong>{TITULO_TIPO[r.tipo_registro] || 'Registro'}</strong> · {r.placa || '-'}
                  <div className="portal-lista-sub">
                    {dataLegivel(r.data_checklist || r.data)}{r.horario ? ` às ${r.horario}` : ''}
                    {r.km != null ? ` · ${Number(r.km).toLocaleString('pt-BR')} km` : ''}
                  </div>
                </div>
                {sit && <span className={`portal-situacao situacao-${sit.classe}`}>{sit.rotulo}</span>}
              </li>
            );
          })}
        </ul>
      )}
      <h3>Abastecimentos</h3>
      {abastecimentos.length === 0 ? (
        <p className="portal-dica">Nenhum abastecimento ainda.</p>
      ) : (
        <ul className="portal-lista">
          {abastecimentos.map((a) => (
            <li key={`a${a.id}`} className="portal-lista-item">
              <div>
                <strong>{a.placa || '-'}</strong> · {a.litros != null ? `${Number(a.litros).toLocaleString('pt-BR')} L` : '-'}
                <div className="portal-lista-sub">
                  {dataLegivel(a.data_abastecimento || a.data)}
                  {a.km_abastecimento != null ? ` · ${Number(a.km_abastecimento).toLocaleString('pt-BR')} km` : ''}
                  {a.valor_total != null
                    ? ` · ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(a.valor_total)}`
                    : ''}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- pagina */

const FrotasPortalMotorista = () => {
  const { user, refreshUser } = useAuth();
  const userRef = useRef(user);
  userRef.current = user;
  const renovouRef = useRef(false);
  const [inicio, setInicio] = useState(null);
  const [meus, setMeus] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState('');
  const [tela, setTela] = useState('inicio');

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErroCarga('');
    try {
      const [ini, reg] = await Promise.all([
        api.get('/frotas/portal/inicio'),
        api.get('/frotas/portal/meus-registros', { params: { limite: 30 } }).catch(() => ({ data: null })),
      ]);
      setInicio(ini.data || {});
      // Frota Etapa 2 (Fase5-2): o gestor mudou o perfil desta pessoa em Perfis de acesso; o servidor ja aplica, mas o menu do navegador
      // dela so mudaria no F5 (nada renova o usuario dentro do Frota). O inicio traz o perfil do servidor: divergiu, renova uma vez.
      const perfilServidor = ini.data?.perfil;
      if (perfilServidor && refreshUser && !renovouRef.current && perfilServidor !== perfilFrota(getEffectiveUser(userRef.current))) {
        renovouRef.current = true;
        refreshUser();
      }
      setMeus(reg.data);
    } catch (err) {
      setErroCarga(err.response?.data?.error || 'Não foi possível abrir o painel. Confira a internet e tente de novo.');
    } finally {
      setCarregando(false);
    }
  }, [refreshUser]);

  useEffect(() => { carregar(); }, [carregar]);

  const voltarERecarregar = () => {
    setTela('inicio');
    carregar();
  };

  if (carregando && !inicio) {
    return <div className="portal-motorista"><p className="portal-dica">Carregando…</p></div>;
  }
  if (erroCarga) {
    return (
      <div className="portal-motorista">
        <div className="portal-erro" role="alert">{erroCarga}</div>
        <button type="button" className="portal-botao" onClick={carregar}>Tentar de novo</button>
      </div>
    );
  }

  if (!inicio?.motorista) {
    return (
      <div className="portal-motorista">
        <h1 className="portal-titulo">Meu painel</h1>
        <div className="portal-aviso" role="status">{MSG_SEM_VINCULO}</div>
      </div>
    );
  }

  if (tela === 'saida' || tela === 'retorno' || tela === 'inspecao') {
    return (
      <div className="portal-motorista">
        <RegistroForm tipo={tela} inicio={inicio} onCancelar={() => setTela('inicio')} onSalvo={voltarERecarregar} />
      </div>
    );
  }
  if (tela === 'abastecimento') {
    return (
      <div className="portal-motorista">
        <AbastecimentoForm inicio={inicio} onCancelar={() => setTela('inicio')} onSalvo={voltarERecarregar} />
      </div>
    );
  }

  const viagem = inicio.viagem_aberta;
  const podeRegistrar = inicio.pode_registrar !== false;

  return (
    <div className="portal-motorista">
      <h1 className="portal-titulo">Olá, {inicio.motorista.nome}</h1>

      {viagem && (
        <div className="portal-cartao portal-cartao-viagem" data-testid="viagem-aberta">
          Você está com o veículo <strong>{viagem.placa}</strong> desde {dataLegivel(viagem.data_saida)}
          {viagem.destino ? <>, destino <strong>{viagem.destino}</strong></> : ''}.
        </div>
      )}

      {podeRegistrar && (
        <div className="portal-botoes">
          {!viagem && (
            <button type="button" className="portal-botao grande" onClick={() => setTela('saida')}>Saída</button>
          )}
          {viagem && (
            <button type="button" className="portal-botao grande" onClick={() => setTela('retorno')}>Retorno</button>
          )}
          <button type="button" className="portal-botao grande secundario" onClick={() => setTela('inspecao')}>Inspeção</button>
          <button type="button" className="portal-botao grande secundario" onClick={() => setTela('abastecimento')}>
            Abastecimento
          </button>
        </div>
      )}

      <MeusRegistros dados={meus} />
    </div>
  );
};

export default FrotasPortalMotorista;
