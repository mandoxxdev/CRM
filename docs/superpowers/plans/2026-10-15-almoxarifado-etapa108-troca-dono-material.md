# Etapa 108 — trocar o dono de um material com histórico exige a permissão de ajustar material de cliente (C213)

> Status: **EM EXECUÇÃO — 2026-10-15.** Worktree `CRM-wt-e108`, branch `etapa-e108` (de `main` `0bee2b04`). Sem merge e sem
> push (integração pelo André).
> Origem: "Próxima tarefa detalhada — Etapa 108" no fim de
> `docs/superpowers/plans/2026-10-15-almoxarifado-etapa106-estorno-ajuste-cliente.md`; C213.
> Design: `docs/superpowers/specs/2026-10-15-almoxarifado-etapa108-troca-dono-material-design.md`.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-15): última B **B712**,
> último C **213**, última A **A55**, último G **G87**. Esta etapa: **B713+**, **C214+**, A56 se houver consulta.

## Fase 0 — medido (2026-10-15)

Sonda `server/tests/sonda/e108fase0.js` (não versionada); tabela no design. Resumo: Administrador, Almoxarife e
Engenharia trocam o dono nos três sentidos, com e sem saldo, e com qualquer retenção (18/18 → 200); a única auditoria é
`material`/`ATUALIZACAO`; a posição por cliente segue o dono de hoje (o histórico muda de cliente junto). Portas que gravam
o dono: só o POST (criação) e o PUT. Achados anteriores: C215 (Engenharia cria com saldo inicial), C216 (dono inexistente
aceito). B708 medida (o Gestor estorna a ENTRADA de cliente: 200).

## Regras de negócio

- **RN-01 — trocar o dono de material com histórico exige `ajustar_material_cliente`.** `PUT /materiais/:id` em que o dono
  **muda** (comparado com o gravado) e o material tem histórico (RN-04): sem a permissão → **403** literal **E1**, antes de
  qualquer escrita (dono, os outros campos do corpo, auditoria — nada muda). Os três sentidos: cliente → nosso, nosso →
  cliente, cliente A → cliente B. *Cenários:* Almoxarife e Engenharia → 403 nos três.
- **RN-02 — quem tem a permissão troca.** Administrador por perfil, superadmin e `role: 'admin'` → 200, o dono troca.
- **RN-03 — sem histórico, livre.** Material com total 0, retenções 0 e livro vazio: o Almoxarife troca o dono (200), sem
  `TROCA_DONO` (a `ATUALIZACAO` de sempre).
- **RN-04 — o que é histórico.** `quantidade_atual > 0`, ou `quantidade_reservada`/`quantidade_bloqueada`/
  `quantidade_em_inspecao`/`quantidade_em_terceiros` > 0, ou **qualquer** linha em `movimentacoes_almoxarifado` do material
  (inclusive cancelada). *Cenário:* total 0 com a entrada estornada → 403.
- **RN-05 — mesmo dono não aciona.** Chave omitida, mesmo número, mesmo número em string, `''`/`null` para material nosso:
  o Almoxarife edita o resto do cadastro de material de cliente com saldo (200), sem auditoria `material_cliente`.
- **RN-06 — a ordem.** 404 (material inexistente) antes; o 403 E1 antes das validações de família/subfamília/localização
  e antes do `UPDATE`. *Cenário:* corpo com família inválida e troca de dono pelo Almoxarife → 403 E1 (não 400).
- **RN-07 — a troca autorizada com histórico deixa auditoria nomeando os dois lados.** Depois do `UPDATE`, ao lado da
  `ATUALIZACAO`: `entidade 'material_cliente'`, `acao 'TROCA_DONO'`, `entidade_id` = material, `dados_anteriores
  {proprietario_cliente_id, proprietario_cliente_nome}` (o de antes; `null`/`null` para nosso), `dados_novos
  {proprietario_cliente_id, proprietario_cliente_nome, quantidade_atual}`, `justificativa` `null`. Falha ao gravar não
  derruba a troca (`try/catch`, aviso no log). Rótulo *"Troca de dono"* em `auditLabels.js`.
- **RN-08 — a tela mostra a recusa.** O salvar recusado com 403 mostra a literal E1 no `toast.error` e não navega.

## Contrato congelado

`server/services/almoxarifado/ownerRules.js` exporta, além do que já exporta:

```js
// true se o material tem saldo, retencao ou qualquer linha no livro (RN-04)
async function materialTemHistorico(db, material) { ... }
// null se o dono nao muda; { deId, paraId, deNome, paraNome, comHistorico } se muda e pode;
// lanca 403 E1 se muda, tem historico e o usuario nao tem ajustar_material_cliente. Nao grava nada.
async function assertTrocaDeDonoPermitida(db, materialGravado, novoDono, user) { ... }
// a linha da RN-07; a rota a chama DEPOIS do UPDATE, so quando troca.comHistorico
async function auditarTrocaDeDono(db, { material, troca, quantidadeAtual, user }) { ... }
```

Normalização dos dois lados: `Number(v) > 0 ? Number(v) : null`.

**E1** (literal; sem acento, no molde das recusas de `ownerRules`; `${perfil}` = `getPerfilFromUser(user)`; cada lado é
`cliente ${nome}` — `razao_social` ou `cliente #<id>` — ou `estoque proprio (material nosso)`):

```
Trocar o dono do material ${codigo} (de ${de} para ${para}) exige a permissao "ajustar_material_cliente" (seu perfil: ${perfil}). O material ja tem saldo ou movimentacao, e a troca leva o saldo e o historico de um dono para o outro - mexe no numero que o cliente vai cobrar.
```

Rota `PUT /api/almoxarifado/materiais/:id` (gate `editar_material` inalterado): depois de montar `merged` e antes da
validação da família, `ownerRules.assertTrocaDeDonoPermitida(db, current, merged.proprietario_cliente_id, req.user)`;
erro → `res.status(e.status || 500).json({ error: e.message })`. Depois da auditoria `ATUALIZACAO`, se
`troca?.comHistorico`, `ownerRules.auditarTrocaDeDono` em `try/catch`. Resposta de sucesso inalterada.

Cliente: nenhuma mudança de código.

## Fase 2 — revisão do plano (agente fresco, 2026-10-15) — 0 trava, 2 correções, notas

O revisor leu o código e rodou a sonda `server/tests/sonda/e108rv-schema.js` (o `MaterialUpdateSchema`, a normalização e o
`can()`). A T1 estava sendo escrita em paralelo; ele revisou o plano.

1. **(correção) A E1 com cliente apagado.** `nomeDoCliente` já devolve *"cliente #⟨id⟩"* quando o cliente não existe; a E1
   sairia *"de cliente cliente #99999 para …"*. **Corrigido:** o lado é *"cliente #⟨id⟩"* sem repetir a palavra; teste novo
   (controle: o prefixo de volta derruba só ele). A auditoria `TROCA_DONO` grava o nome que `nomeDoCliente` devolve.
2. **(correção) O cenário da RN-06 precisa de família bem formada e inexistente** (`familia_id: 987654`): `abc` ou `0`
   caem no 400 do `validate` antes do handler (e antes do 404). O teste já usava um id bem formado — mantido; anotado aqui.
3. **(nota) O que o schema faz com o dono:** `` → chave ausente (preserva o dono); `null` → nosso; `5` → 5; `0`, `-1`,
   `abc`, `1.5` → 400. A guarda só recebe inteiro positivo, `null` ou `undefined` pela rota. Por isso a rota passa
   `req.body.proprietario_cliente_id` (já coerido) e não o `merged`: `undefined` = chave omitida, sem consultar nada
   (**divergência do contrato**, que dizia `merged`; o efeito é o mesmo).
4. **(nota) RN-02 sem o admin do módulo** — `can()` já o cobre; caso novo no teste (admin do módulo com perfil Almoxarife
   gravado troca).
5. **(nota) Portas:** só as duas da Fase 0 em todo o servidor (nenhum outro módulo nem script escreve em
   `materiais_almoxarifado`; o `DELETE /api/clientes/:id` só inativa o cliente).
6. **(nota) Compromisso pendente não conta como histórico** — material nosso sem saldo nem livro, com pedido de compra
   aberto: o Almoxarife passa o dono ao cliente e a compra que a GMP pagou entra na posição do cliente. Registrado na B714
   como descartado.
7. **(nota) Depois de uma troca autorizada**, remessa aberta continua nomeando o dono antigo e uma requisição reservada do
   projeto do dono antigo deixa de entregar (guarda do dono). Consequência da troca autorizada; a E1 avisa e a
   `TROCA_DONO` registra (C214).
8. **(nota) Uma entrada cancelada já trava a correção do dono para quem não é Administrador** (B714); e o retalho/
   transformação com destino de outro dono e histórico deixa de poder ser "corrigido" pelo Almoxarife no cadastro (sobra a
   outra saída da mensagem: escolher outro material). Guia.
9. **(nota)** T2 é galho de verdade e passa de primeira (o `toast.error` já existe) — o controle positivo é a prova.

## Tasks (sort topológico)

- [ ] **T1 (tronco) — a guarda e a auditoria.** RN-01..RN-07. `ownerRules.js`, `routes/almoxarifado.js` (PUT),
  `auditLabels.js`. Teste novo `server/tests/api/trocaDonoMaterial.api.test.js`. Controle positivo: conceder
  `ajustar_material_cliente` ao ALMOXARIFE (cai nomeando a ação); tirar o livro do histórico; tirar uma retenção; comparar
  sem normalizar (RN-05 cai); guarda depois do UPDATE; sem a auditoria / sem o `try`.
- [ ] **T2 (galho, contra o contrato) — a tela.** RN-08. Caso novo em `MaterialAlmoxarifadoForm.test.js`: `api.put` rejeita
  com 403 `{ error: E1 }` → `toast.error(E1)`, sem navegar. Controle: trocar a mensagem pelo fallback.
- [ ] **T3 (integração, depois de T1–T2) — o documento até o fim, pela rota E pelo serviço.**
  `server/tests/api/trocaDonoMaterialIntegracao.api.test.js`: (K1) pela rota — o furo da C213 fechado: material do cliente
  A com entrada 10; o Almoxarife ajusta → 403 (Etapa 8); tira o dono → 403 E1; edita o nome reenviando o dono → 200; o
  ajuste continua 403; o Administrador passa A → B → 200 com `TROCA_DONO`; a posição de B mostra o material com `recebido`
  10 e a de A não. (K2) pelo serviço — `ownerRules.assertTrocaDeDonoPermitida` com o Almoxarife → 403 E1, com o
  Administrador → objeto. (K3) material recém-criado sem saldo: o Almoxarife corrige o dono (200).
- [ ] **T4 — Fase 5 e fechamento.**
