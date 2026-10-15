# Etapa 102 — encerrar com material na caixa é recusado em qualquer status (C204)

> Status: **EM EXECUÇÃO — 2026-10-15.** Worktree `CRM-wt-e102`, branch `etapa-e102` (de `main` `ab400bbd`). Marcar cada
> task ao terminar (hash, divergência).
> Origem: "Próxima tarefa detalhada — Etapa 102" no fim de
> `docs/superpowers/plans/2026-10-15-almoxarifado-etapa101-em-separacao-vazia-tem-saida.md`; C204.
> Design: `docs/superpowers/specs/2026-10-15-almoxarifado-etapa102-encerrar-com-caixa-recusa-design.md`.
>
> **Numeração:** conferida em 2026-10-15 (`grep -on` em `docs/almoxarifado-novidades-por-etapa.md`): última **B530**,
> último C **206**, última **A52**. A Etapa 103 (Compras) roda em paralelo e usa a série B6xx; para não colidir, esta etapa
> salta para a **próxima centena livre que não é 6xx**: reserva **B700–B709**, **C207–C209** e **A53–A54**. (Nenhum
> B6xx/B7xx existia em `docs/` e `specs/` na conferência.)

## Fase 0 — medido (2026-10-15)

Sonda `server/tests/sonda/e102fase0.js` (não versionada; `testApp` com `requirePermission` real). Detalhe no design.

| caso | estado | `PUT /encerrar` |
|---|---|---|
| Q1 | pede 4, separa 4, entrega 1 → *Parcialmente Atendida*, caixa 3, reserva ATIVA | **200** — *Encerrada*, separado 4 / entregue 1, reserva LIBERADA, `quantidade_reservada` 0 |
| Q3 | separa 2, entrega 1, entrega 3 | (a entrega acima da caixa sobe o separado: *Entregue* 4/4, sem caixa) |
| Q5 | *Parcialmente Atendida* caixa 0 | 200 |
| Q6 | *Entregue* legado separado 5 / entregue 4 | 200 |
| Q7 | Q1 + devolver 3 | devolver 200 → encerrar **200**, reserva LIBERADA |

**Contradições/achados com a próxima tarefa escrita na 101:**
1. A 101 perguntava se *Entregue* pode ter caixa: **pelos gestos, não** (Q3 — a entrega acima da caixa sobe o separado);
   só por legado (Q6). E *Entregue* está fora de `STATUS_COM_CAIXA` e a devolução não o aceita: recusar prenderia o
   legado. A regra vale para os dois status que **retêm** caixa e têm seta para `ENCERRADA` (RN-02).
2. **Não previsto:** a recusa de saldo por caixa (`caixaSql.sufixoCaixa`, Etapa 97/98, usada pela saída avulsa, perda,
   ajuste, bloqueio, reserva manual, remessa, sucata e estornos) ensina *"entregue o que existe e encerre a requisição"*
   como saída para material perdido da caixa. Com a regra nova, entregar o que existe deixa a parte perdida na caixa e o
   encerramento é recusado (E1): a recusa ensinaria um caminho que recusa. RN-06.
3. O plano da 101 citava *"`requisicaoCicloFinal`"* como dependente: o `[encerrar] PARCIALMENTE_ATENDIDA` dele monta a
   requisição por SQL — medir na suíte se tem caixa.

## Regras de negócio

- **RN-01 — encerrar com material na caixa é recusado.** `PUT /api/almoxarifado/requisicoes/:id/encerrar`, status com
  seta para `ENCERRADA` **e** em `STATUS_COM_CAIXA` (*Em Separação*, *Parcialmente Atendida*): algum item com
  `Q.qtd(separado − entregue) > 1e-9` (a régua da B524; entregue = `quantidade_entregue ?? quantidade_atendida`) → 400
  **E1**. Nada muda: status, reserva ATIVA, nenhuma trilha `ENCERRAMENTO`, `encerrado_por` nulo.
  *Cenário:* pede 4, separa 4, entrega 1 → *Parcialmente Atendida* → Encerrar → E1.
- **RN-02 — Entregue encerra sempre.** *Entregue* não retém caixa (fora de `STATUS_COM_CAIXA`) e não aceita devolução:
  o legado com separado > entregue encerra (200). *Cenário:* Q6.
- **RN-03 — a nova tentativa confere a caixa.** No compare-and-set do encerramento, o status relido em
  `STATUS_COM_CAIXA` relê os itens e aplica RN-01 (e o E2 da 101 na *Em Separação*).
- **RN-04 — a *Em Separação* da 101 não muda.** Caixa → E1; vazia sem entrega → E2; vazia com entrega → 200.
- **RN-05 — a saída é a devolução à prateleira (ou a entrega).** Depois de **Devolver à prateleira** o que está na
  caixa (10.2b, perfil `separar_emitir`), o encerramento passa: 200, *Encerrada*, reserva LIBERADA, trilha
  `ENCERRAMENTO`. Entregar o resto também esvazia a caixa (vira *Entregue*, que encerra).
- **RN-06 — a recusa de saldo por caixa não ensina o caminho recusado.** O sufixo passa a ser
  ` — ${q} ${un} estão separados para ${lista} e só saem pela entrega (material perdido da caixa: devolva-o à prateleira
  na requisição e dê a baixa, ou peça ao administrador do almoxarifado para excluí-la)` (sai *"entregue o que existe e
  encerre a requisição, "*).
- **RN-07 — a tela oferece o gesto que a rota aceita.** No modo almoxarifado, **Encerrar Requisição** aparece quando
  `podeEncerrar(status, itens)` (cliente, `requisicaoLabels.js`): status com seta para `ENCERRADA` (*Entregue*,
  *Parcialmente Atendida*, *Em Separação*) e sem recusa (RN-01/RN-04). Na *Parcialmente Atendida* com caixa, no lugar do
  botão, a nota `data-testid="encerrar-bloqueado-caixa"` com a literal E1. Paridade com o servidor por tabela
  (`validarTransicao(s,'ENCERRADA').ok && recusaEncerrar(s, itens) === null`), e a literal E1 do cliente igual à do
  servidor.
- **RN-08 — nada de trava nova.** O encerramento já está na trava por requisição com separar, entregar e devolver; os
  itens são lidos dentro dela. Sem trava por material (só solta reserva).

## Contrato congelado

Servidor (`requisitionStateMachine.js`), exporta:

```js
// entregue(i) = Number(i.quantidade_entregue ?? i.quantidade_atendida ?? 0) || 0 (local, como em destinoDaSeparacaoVazia)
// null = pode (ou o status não retém caixa: a máquina decide); senão a literal da recusa.
// Chamar DEPOIS de validarTransicao(status, 'ENCERRADA'), com os itens lidos DENTRO da trava por requisição.
function recusaEncerrar(status, itens) {
  if (!STATUS_COM_CAIXA.includes(status)) return null;
  if ((itens || []).some((i) => Q.qtd((Number(i.quantidade_separada) || 0) - entregue(i)) > 1e-9)) return MSG_SAIDA_SEPARACAO.E1;
  if (status === 'EM_SEPARACAO' && destinoDaSeparacaoVazia(itens) === 'CANCELADO') return MSG_SAIDA_SEPARACAO.E2;
  return null;
}
```

`recusaSaidaDaSeparacao(status, itens, 'CANCELADO')` (os dois cancelamentos) não muda. O encerramento passa a usar
`recusaEncerrar` (primeira leitura e nova tentativa).

Literais (400, `{ error }`), sem mudança de texto:
- **E1** `Esta requisição tem material separado na caixa; entregue-o ou devolva-o à prateleira antes de encerrar.`
- **E2** `Nada foi entregue nesta requisição; em vez de encerrar, ela deve ser cancelada por quem pediu ou pelo administrador do sistema.`

Ordem das recusas do `PUT /encerrar`: 400 do Zod (`motivo` não texto, antes de tudo) → 403 *"Sem permissão para encerrar requisições"* (fora da trava) → 404 *"Requisição
não encontrada"* → 400 *"Transição inválida: ⟨status⟩ → ENCERRADA"* → **E1** → E2 → (nova tentativa: o mesmo) → 409
*"A requisição mudou enquanto era encerrada; recarregue e confira antes de encerrar."*

`caixaSql.sufixoCaixa` — a literal de RN-06 (muda o texto de toda recusa de saldo com caixa).

Cliente (`requisicaoLabels.js`), exporta `MSG_ENCERRAR_COM_CAIXA` (= E1) e `podeEncerrar(status, itens)`.

## Fase 2 — revisão do plano (agente fresco, 2026-10-15) — 2 travas, 3 correções, notas

O revisor mediu com T1 já aplicada (rodou cada arquivo que chama `/encerrar` e uma sonda própria).

1. **(trava) Testes existentes que caem com a regra nova — o plano não os listava.** `requisicaoCicloFinal`
   `[encerrar] PARCIALMENTE_ATENDIDA…` (tinha caixa: separado 5 / entregue 2 — responde a contradição 3 da Fase 0);
   `requisicaoGestosConcorrentes` `[93 RN-07] (b) (7a)`, `[93 RN-08] (e)` ×2, `(e')`; `requisicaoGestosConcorrentesIntegracao`
   `[93 T6 E2]`; `separacaoTetoFisico` `[95 Fase 5] (T5/T6)`; `indicadoresSpec27Integracao` `[1 completar]` (e `[1 C89]` em
   cadeia); `relatoriosIndicadoresSpec27` `[RN-01/D2]` e `[RN-03 -]`; `devolverSeparado` `[98 RN-02]`;
   `portasAvulsasCaixaIntegracao` `[97 T3 C3]` (exatamente o caminho que a RN-06 tira); cliente
   `RequisicoesDevolverPrateleira.test.js` `[98 T4] não aparece com a conferência gravada…`. **Todos reescritos na T1/T3**
   (a regra: montar a *Parcialmente Atendida* com a caixa vazia, ou devolver antes de encerrar; o `(e)` com EM_SEPARACAO
   ganhou a caixa no escritor para a nova tentativa continuar exercitada; o `(T5/T6)` da 95 prova a B473 no legado
   encerrado por SQL).
2. **(trava) T1 e T2 não são independentes** — reescrevem os mesmos arquivos de teste. **Executadas juntas, por mim, em
   sequência**; a paridade do cliente (T3) só rodou depois das sabotagens do servidor (sabotagem concorrente contamina).
3. **(correção) J2 da T4** — corrigido acima.
4. **(correção) O manual ensina o caminho recusado** em mais lugares que os três do plano (7.6 tabela de perfis, 10.2
   *Quem segura a caixa*, 10.2 falha no meio, as três citações do sufixo) — tratados no fechamento.
5. **(correção) O guia e duas specs** (`03-motor-estoque`, `05-separacao-picking`) citam o sufixo antigo como contrato —
   marcados como superados no fechamento (não apagados).

Notas: a literal do contrato confere com o código; só um escritor grava `ENCERRADA`; *Entregue* sem caixa pelos gestos
confirmado por leitura (a entrega sobe o separado a `MAX(separado, entregue)`); o perfil **Gestor** tem aprovar mas não
separar — a nota E1 manda devolver, o que ele não pode: o manual diz que a devolução é do almoxarife (B702); o botão
**Encerrar** não confere o perfil de aprovação no modo almoxarifado (lacuna anterior, inalterada).

## Tasks (sort topológico)

- [ ] **T1 (tronco) — a recusa no servidor.** RN-01..RN-04, RN-08. `requisitionStateMachine.js` (`recusaEncerrar`),
  `routes/almoxarifado.js` (encerrar, as duas leituras). Teste novo `server/tests/api/encerrarComCaixa.api.test.js`:
  Q1 → E1 (nada muda: status, reserva, trilha, `encerrado_por`); dois itens com a caixa no item que não é o primeiro;
  resto de arredondamento (separado 2,0000001 / entregue 2 → 200; entregue 1,9999999 → 200); *Entregue* legado → 200;
  *Parcialmente Atendida* caixa 0 → 200; a nova tentativa relendo *Parcialmente Atendida* com caixa → E1; a corrida
  entregar × encerrar (a entrega do resto termina primeiro → 200). Reescrever os testes que encerravam com caixa (medir
  na suíte). Controle positivo: sabotar o status (só `EM_SEPARACAO`), a régua (sem `Q.qtd`), a nova tentativa.
- [ ] **T2 (tronco, junto da T1 por tocar as mesmas recusas) — o sufixo.** RN-06. `caixaSql.js` e as quatro cópias da
  literal nos testes (`devolverSeparado`, `devolverSeparadoIntegracao`, `portasAvulsasCaixa`,
  `portasAvulsasCaixaIntegracao`).
- [ ] **T3 (galho, depois da T1) — a tela.** RN-07. `requisicaoLabels.js` (`podeEncerrar`, `MSG_ENCERRAR_COM_CAIXA`),
  `RequisicoesList.js` (o botão e a nota). Teste novo `client/src/components/almoxarifado/RequisicoesEncerrarComCaixa.test.js`:
  *Parcialmente Atendida* com caixa → sem botão, com a nota E1; sem caixa → botão; *Entregue* → botão; fora do modo →
  nem botão nem nota; paridade de `podeEncerrar` com o servidor (tabela de status × itens) e da literal.
- [ ] **T4 (integração, depois de T1–T3) — o documento até o fim, pela rota E pelo serviço.**
  `server/tests/api/encerrarComCaixaIntegracao.api.test.js`: (J1) pelo serviço (`separarRequisicao`,
  `entregarRequisicao`) a *Parcialmente Atendida* com caixa; encerrar pela rota → E1; devolver pela rota → encerrar 200;
  reserva LIBERADA, `quantidade_reservada` 0, some da fila (`listarFilaSeparacao` e `GET /fila-separacao`). (J2) material
  perdido da caixa (montada **sem reserva** — com reserva a perda segue recusada depois da devolução, 10.2): a perda é
  recusada com o sufixo novo (sem "encerre"); seguir o caminho que a recusa ensina (devolver 2, lançar a perda, entregar 1)
  → *Parcialmente Atendida* com a caixa vazia → encerrar 200. *(Corrigido na Fase 2, achado 3: o plano dizia "entregar 2 →
  Entregue" — com 2 perdidos, a requisição de 4 nunca chega a Entregue sem nova entrada.)* (J3) entregar o que existe e encerrar com a perdida na caixa
  → E1 (o caminho que saiu do sufixo de fato recusa).
- [ ] **T5 — Fase 5 e fechamento** (revisores frescos; `fechar-etapa` inteira; consultas A53/A54).

## O que fica de fora (declarado)

- Devolução automática no encerramento (opção B — B700).
- *Entregue* legado com separado > entregue encerra (RN-02).
- Encerradas antigas com caixa: consulta A53, nada a fazer no sistema.

## Próxima tarefa detalhada — Etapa 104

*(preencher no fechamento, medida no mapa `specs/modulo-almoxarifado/README.md`.)*
