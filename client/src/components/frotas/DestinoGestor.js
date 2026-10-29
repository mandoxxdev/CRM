/**
 * Frota Etapa 9 — os campos "componente" dos formularios do gestor (FrotasEntityPage, `type: 'componente'`):
 *
 *   EnderecoDoDestinoGestor  tela Destinos: o endereco estruturado (RN-F9.17) e, em destino antigo sem endereco estruturado, a nota
 *                            "Endereço antigo: <endereco>" (A2, B92) para o gestor completar.
 *   OrigemDaViagemGestor     Viagem: a linha fixa "Saindo de: GMP — <endereco da GMP>" (RN-F9.24); viagem antiga com outra origem
 *                            mostra "Origem gravada: <texto>".
 *   DestinoDaViagemGestor    Viagem: o select dos destinos ativos com "+ Novo destino" (RN-F9.18), a nota do destino texto antigo e a
 *                            opcao "(desativado)" do destino gravado que saiu da lista (RN-F9.19, A10).
 *
 * Todos recebem { form, setForm, editing, aux, meta } do FrotasEntityPage. Plano: docs/superpowers/plans/2026-10-29-frotas-etapa9-endereco-do-destino.md
 */
import React, { useState } from 'react';
import EnderecoDestinoCampos, { NovoDestinoBloco, rotuloDestino } from './EnderecoDestinoCampos';

export const ORIGEM_PADRAO = 'GMP';
export const MSG_DUPLICADO_GESTOR = 'Esse destino já estava cadastrado — selecionamos ele.';
export const MSG_DESTINO_NAO_ENCONTRADO = 'Destino não encontrado';

const mesmoId = (a, b) => a != null && a !== '' && b != null && b !== '' && String(a) === String(b);

export function EnderecoDoDestinoGestor({ form, setForm, editing }) {
  // A2: destino gravado antes da Etapa 9 (sem rua estruturada) com o texto antigo — so leitura, acima dos campos.
  const antigo = editing && !String(editing.logradouro ?? '').trim() && String(editing.endereco ?? '').trim()
    ? String(editing.endereco).trim() : '';
  return (
    <EnderecoDestinoCampos
      variante="gestor"
      valor={form}
      aoMudar={(patch) => setForm((f) => ({ ...f, ...patch }))}
      enderecoAntigo={antigo}
    />
  );
}

/**
 * RN-F9.24: a origem nao e mais digitada. A viagem nova (e a antiga com origem vazia) sai de GMP; a antiga com outra origem a mantem.
 * O valor que vai no corpo e o `form.origem` (GMP por padrao; o gravado na edicao) — ver o comentario do getDefaultForm das viagens.
 */
export function OrigemDaViagemGestor({ editing, meta }) {
  const gravada = String(editing?.origem ?? '').trim();
  const outra = gravada && gravada !== ORIGEM_PADRAO;
  const endereco = String(meta?.origemEndereco ?? '').trim();
  return (
    <div className="frotas-form-group full">
      <label>Origem</label>
      {outra ? (
        <div className="frotas-linha-fixa" data-testid="origem-gravada">Origem gravada: {gravada}</div>
      ) : (
        <div className="frotas-linha-fixa" data-testid="origem-gestor">
          Saindo de: <strong>{ORIGEM_PADRAO}</strong>{endereco ? ` — ${endereco}` : ''}
        </div>
      )}
    </div>
  );
}

export function DestinoDaViagemGestor({ form, setForm, editing, aux }) {
  const [novoAberto, setNovoAberto] = useState(false);
  const destinos = aux?.destinos || [];
  const gravadoId = editing?.destino_id;
  const gravadoTexto = String(editing?.destino ?? '').trim();

  // A10: o destino gravado na viagem que saiu da lista (desativado) aparece como opcao, com o NOME GRAVADO NA VIAGEM e o id dela —
  // a viagem antiga continua editavel (o servidor aceita o mesmo id, RN-F9.12).
  const opcoes = destinos.map((d) => ({ value: String(d.id), label: rotuloDestino(d) }));
  if (gravadoId != null && gravadoId !== '' && !destinos.some((d) => mesmoId(d.id, gravadoId))) {
    opcoes.push({ value: String(gravadoId), label: `${gravadoTexto || `Destino ${gravadoId}`} (desativado)` });
  }
  // RN-F9.19: destino texto antigo, sem destino_id — o select fica vazio e a nota diz o que esta gravado.
  const notaTextoAntigo = editing && (gravadoId == null || gravadoId === '') && gravadoTexto
    ? `Destino gravado: ${gravadoTexto}. Escolha da lista só se quiser trocar.` : '';
  // B97: o destino da viagem foi renomeado depois — a lista mostra o nome de hoje, a viagem guarda o da epoca (o servidor nao renomeia
  // ao salvar o mesmo id, RN-F9.12/A5). A nota diz os dois para ninguem achar que a viagem mudou.
  const atualDoGravado = gravadoId != null && gravadoId !== '' ? destinos.find((d) => mesmoId(d.id, gravadoId)) : null;
  const notaRenomeado = editing && atualDoGravado && gravadoTexto && String(atualDoGravado.nome).trim() !== gravadoTexto
    && mesmoId(form.destino_id, gravadoId)
    ? `Esta viagem guarda o nome da época: ${gravadoTexto}. O destino hoje se chama ${String(atualDoGravado.nome).trim()}; salvar não muda o nome gravado.`
    : '';
  // A11: no gestor nao da para TIRAR o destino (vazio/null mantem o gravado) — por isso, na edicao de viagem com destino, a opcao vazia
  // diz que mantem, em vez de oferecer um "sem destino" que o servidor ignoraria.
  const temGravado = !!editing && ((gravadoId != null && gravadoId !== '') || !!gravadoTexto);
  const rotuloVazio = temGravado ? 'Manter o destino gravado' : 'Escolha o destino…';

  const incluido = (d) => {
    if (aux?.setDestinos) {
      aux.setDestinos((lista) => (lista.some((x) => mesmoId(x.id, d.id)) ? lista : [...lista, d]));
    }
    setForm((f) => ({ ...f, destino_id: String(d.id) }));
    setNovoAberto(false);
  };

  return (
    <>
      <div className="frotas-form-group full">
        <label>Destino</label>
        <div className="frotas-destino-linha">
          <select
            name="destino_id"
            value={form.destino_id == null ? '' : String(form.destino_id)}
            onChange={(e) => setForm((f) => ({ ...f, destino_id: e.target.value }))}
          >
            <option value="">{rotuloVazio}</option>
            {opcoes.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {!novoAberto && (
            <button type="button" className="frotas-btn frotas-btn-secondary" onClick={() => setNovoAberto(true)}>
              + Novo destino
            </button>
          )}
        </div>
        {notaTextoAntigo && <div className="frotas-aviso-campo" role="note" data-testid="destino-gravado">{notaTextoAntigo}</div>}
        {notaRenomeado && <div className="frotas-aviso-campo" role="note" data-testid="destino-renomeado">{notaRenomeado}</div>}
      </div>
      {novoAberto && (
        <NovoDestinoBloco
          variante="gestor"
          msgDuplicado={MSG_DUPLICADO_GESTOR}
          onIncluido={incluido}
          onCancelar={() => setNovoAberto(false)}
        />
      )}
    </>
  );
}

/**
 * A9: o 400 "Destino nao encontrado" ao salvar a viagem (o destino escolhido foi desativado com o modal aberto) recarrega os destinos e
 * limpa a selecao, como o portal — sem isto cada Salvar repetia o 400. A mensagem do servidor ja sai no toast do FrotasEntityPage.
 */
export function aoFalharSalvarViagem(err, ctx) {
  if (err?.response?.status === 400 && err.response?.data?.error === MSG_DESTINO_NAO_ENCONTRADO) {
    if (ctx?.recarregarDestinos) ctx.recarregarDestinos();
    if (ctx?.setForm) ctx.setForm((f) => ({ ...f, destino_id: '' }));
  }
}
