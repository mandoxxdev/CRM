# Etapa 140 (propostas): a autorização do desconto acima de 5 % (C301, C302, C303) — plano

> Origem: "Próxima tarefa detalhada — Etapa 140" do plano da 139. Design com a Fase 0 medida:
> `docs/superpowers/specs/2026-10-17-almoxarifado-etapa140-a-autorizacao-do-desconto-design.md`.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-17): última B **B905**, último C
> **C303**, última A **A86**. Esta etapa: **B906+**, **C304+**, **A87+**. Worktree `CRM-wt-e140`, branch `etapa-e140` (da main `2a154ac4`).
>
> **Trava de máquina:** `scratchpad/e140-lock.sh` (o mesmo diretório `maquina-testes.lock` da 139). Um arquivo de teste de servidor por
> vez, inclusive os revisores. Revisão obrigatória da proposta: `scratchpad/e140/review-proposta.sh` (22 + editor). A etapa **não** toca o
> template; toca o `index.js` (rotas de proposta e de aprovação) e `client/src/components/proposta/PropostaForm.js` — a revisão roda
> antes de cada commit de código.
>
> **Fase 2 (um revisor fresco, só leitura; `scratchpad/e140/rev2/relatorio.md`): 0 Critical, 7 Important, 12 Minor — aceitos antes de
> qualquer código de produção, com o que mudou:** **I1** `POST /api/propostas/:id/assinar` põe *aprovada* de qualquer status sem olhar a
> margem (só o `components/Propostas.js`, morto, chama) → **RN-140.13**. **I2** `/pdf` e `/premium` não barram rascunho nem *desconto
> aprovado* no servidor (o bloqueio é só da tela; o editor usa `/premium?embed=1` em rascunho) → **não** corrigido aqui: **C304** + D (140),
> candidato da 141 (mexe no editor e na revisão obrigatória). **I3** o `propostaMargemInvalida` cria pedidos com o super do seed como único
> aprovador → passaria a 400 L-SO-VOCE → a T2 o adapta (um segundo aprovador), sem afrouxar a regra. **I4** a ordem das duas gravações da
> aprovação → **RN-140.05** congelada: pedido primeiro (guarda de pendente), depois a proposta (guarda de status); a proposta não mudou →
> o pedido volta a pendente e **409 L-PROPOSTA-SAIU**. **I5** "quem pediu" se contornava com um colega abrindo o pedido da proposta do
> aprovador → **RN-140.02** conta também o **responsável** da proposta. **I6** o casamento é só pelo percentual (itens/valor trocados numa
> *desconto aprovado* mantêm a aprovação) → declarado em B e D (140). **I7** legado em *desconto aprovado* que não casa passa a 403 ao
> salvar e ao enviar → a **A87** o lista e o guia diz o que fazer. Minors aceitos: as recusas da aprovação valem só para `tipo =
> 'desconto'`; proposta inexistente ao aprovar → **404** (não L-PROPOSTA-SAIU); `Number()` dos dois lados na comparação de quem pediu; o
> casamento lê o valor da aprovação pela régua (`lerMargemDesconto`; ilegível não casa); a ordem "motivo vazio antes do 403" escrita e
> testada; o clone **não** copia a margem (o ponto de atenção estava errado); as notificações de pendentes **não** chegam a ninguém
> (`/api/notificacoes` só devolve lembretes) → fora do escopo, D (140); a atividade prefere quem não é oculto; L-DA-SO-APROVACAO ganha
> "recarregue" (o formulário velho de uma proposta que já saiu de *desconto aprovado*); a aprovação apagada pelo admin vira cenário.
> Declarados em D (140): o admin pode dar a si a coluna; aprovar um pedido antigo desfaz a margem que o vendedor baixou depois; o pedido
> pode ser criado para proposta fora do rascunho (só se rejeita); todo salvar de rascunho com margem > 5 cria mais um pedido.

## Regras de negócio

Literais novos:
- **L-SEM-PERMISSAO** = *"Você não tem permissão para aprovar descontos. Peça a um usuário com \"Pode aprovar descontos\"."*
- **L-PROPRIO** = *"Quem pediu a aprovação do desconto não pode decidi-la. Peça a outro aprovador."*
- **L-JA-DECIDIDA** = *"Esta solicitação de aprovação já foi decidida. Recarregue a lista."*
- **L-VALOR-PEDIDO** = *"O desconto desta solicitação não é um número de 0 a 100. Rejeite-a e peça uma nova."*
- **L-PROPOSTA-SAIU** = *"A proposta desta solicitação não está mais em rascunho nem com desconto aprovado. Rejeite a solicitação ou volte a proposta para rascunho."*
- **L-PROPOSTA-404** = *"Proposta não encontrada"* (a de sempre)
- **L-PROPOSTA-ID** = *"proposta_id é obrigatório"* (substitui *"proposta_id e solicitado_por são obrigatórios"*)
- **L-SO-VOCE** = *"Só você pode aprovar descontos, e quem pede não decide o próprio pedido. Configure outro usuário com \"Pode aprovar descontos\" na gestão de usuários."*
- **L-SEM-APROVADOR** = *"Nenhum usuário configurado para aprovar descontos. Configure um usuário na gestão de usuários."* (a de sempre)
- **L-DA-SO-APROVACAO** = *"O status \"Desconto aprovado\" só é dado pela aprovação do desconto, em Comercial → Aprovações. Se a proposta estava com desconto aprovado, ela mudou depois de aberta: recarregue-a."*
- **L-DA-MARGEM** = *"O desconto acima de 5% desta proposta não é o que foi aprovado. Para mudar o desconto, salve a proposta como rascunho e peça nova aprovação."*
- **L-ENVIAR** = *"Não é possível enviar uma proposta com desconto acima de 5% sem a aprovação desse desconto. Peça a aprovação em Comercial → Aprovações."*
- **L-ASSINAR** = *"Não é possível assinar uma proposta com desconto acima de 5% sem a aprovação desse desconto. Peça a aprovação em Comercial → Aprovações."*
- De antes: **L-DESC-PUT** (*"Não é possível alterar o status de uma proposta com desconto acima de 5% sem aprovação prévia..."*),
  **L-CONFLITO** (*"A proposta foi alterada por outra gravação no mesmo instante. Recarregue a proposta e salve de novo."*, `code:
  PROPOSTA_ALTERADA`), **L-MARGEM**.

"Aprovador" = usuário ativo com `pode_aprovar_descontos = 1` **ou** `is_superadmin = 1` (lido do banco na hora). "Casar" = existe aprovação
`aprovado`, `tipo = 'desconto'`, da proposta, cujo `valor_desconto` a régua lê, com `|round2(valor) − round2(margem)| < 0.01` (a régua de
hoje do `PUT`, extraída). "Dono" do pedido = o `solicitado_por` **e** o `responsavel_id` da proposta (Fase 2, I5).

- **RN-140.01 — decidir exige ser aprovador (C302).** `PUT /api/aprovacoes/:id {status: 'aprovado'|'rejeitado'}` por usuário sem a coluna e
  não super → **403 L-SEM-PERMISSAO**, nada muda (aprovação e proposta). Admin de papel sem a coluna e sem super → 403. Super sem a coluna →
  pode. Cenário: vendedor sem a coluna aprova o próprio pedido de 30 % → 403 (hoje 200 e a proposta vira *desconto aprovado*).
- **RN-140.02 — o dono não decide (C302).** Aprovador que é o `solicitado_por` do pedido **ou o responsável da proposta** → **403
  L-PROPRIO**, para aprovar e para rejeitar, inclusive super. Ordem: status/motivo inválidos (400, os de hoje — quem não pode decidir e
  rejeita sem motivo recebe o 400 do motivo) → 404 → **L-SEM-PERMISSAO** → **L-PROPRIO** → L-JA-DECIDIDA → (aprovar, tipo desconto)
  L-VALOR-PEDIDO → (aprovar, tipo desconto) proposta inexistente 404 *"Proposta não encontrada"* → L-PROPOSTA-SAIU.
- **RN-140.03 — `aprovado_por` é quem está logado.** O `aprovado_por` do corpo é ignorado (hoje grava o do corpo).
- **RN-140.04 — só pedido pendente se decide.** Pedido `aprovado` ou `rejeitado` → **409 L-JA-DECIDIDA**, nada muda. A gravação é
  `UPDATE ... WHERE id = ? AND status = 'pendente'`; 0 linhas → 409 (duas decisões ao mesmo tempo: uma 200, a outra 409).
- **RN-140.05 — aprovar exige o valor legível e a proposta em rascunho/desconto aprovado** (só `tipo = 'desconto'`; os outros tipos só
  mudam o pedido, como hoje). `valor_desconto` que a régua não lê (A86) → **400 L-VALOR-PEDIDO**; proposta inexistente → **404**; proposta em
  *enviada*, *visualizada*, *aprovada*, *rejeitada* → **409 L-PROPOSTA-SAIU**, nada muda (hoje rebaixava a proposta para *desconto aprovado* e
  trocava a margem). Rejeitar não confere nenhum deles. **Ordem das gravações (Fase 2, I4):** (1) `UPDATE aprovacoes SET status='aprovado',
  aprovado_por=?, aprovado_em=... WHERE id=? AND status='pendente'` (0 → 409 L-JA-DECIDIDA); (2) `UPDATE propostas SET margem_desconto=?,
  status='desconto_aprovado' WHERE id=? AND status IN ('rascunho','desconto_aprovado')`; (3) se (2) mudou 0 linhas: `UPDATE aprovacoes SET
  status='pendente', aprovado_por=NULL, aprovado_em=NULL WHERE id=? AND status='aprovado' AND aprovado_por=?` e **409 L-PROPOSTA-SAIU**;
  (4) o histórico de status (como hoje) e a resposta 200 — tudo **antes** da resposta.
- **RN-140.06 — o pedido nasce pendente, em nome de quem pede (C303).** `POST /api/aprovacoes` grava `status = 'pendente'` e
  `solicitado_por = req.user.id`, ignorando os do corpo (sem erro). Sem `proposta_id` → **400 L-PROPOSTA-ID**; proposta inexistente →
  **404 L-PROPOSTA-404**, nada criado (hoje 500 de chave estrangeira); a régua do valor (L-MARGEM, da 139) continua. Ordem: proposta_id →
  L-MARGEM → 404 → aprovador.
- **RN-140.07 — o pedido vai para outro aprovador.** A atividade do pedido vai para um aprovador **diferente** de quem pede (primeiro os com
  a coluna, depois super; menor id). Nenhum aprovador → **400 L-SEM-APROVADOR** (o de hoje); só quem pede é aprovador → **400 L-SO-VOCE**;
  nos dois, nada criado. Os campos de valor ausentes não derrubam a descrição da atividade (`Number(x) || 0`).
- **RN-140.08 — `desconto_aprovado` só pela aprovação (C301).** `PUT /api/propostas/:id` com `status: 'desconto_aprovado'` numa proposta
  que **não** está em *desconto aprovado* → **403 L-DA-SO-APROVACAO**, nada muda — com qualquer margem, inclusive 0. Na proposta que já está
  nele, mandar o mesmo status passa (o formulário manda sempre). Ordem: 404 → título → L-MARGEM → motivo → **L-DA-SO-APROVACAO** → desconto.
- **RN-140.09 — numa *desconto_aprovado*, margem acima de 5 casa com uma aprovação (C301).** `PUT` (com `status` ou `margem_desconto` no
  corpo) cujo status efetivo é `desconto_aprovado` e cuja margem efetiva passa de 5 sem aprovação que case → **403 L-DA-MARGEM**, nada muda.
  Cenário: aprovada 10 % → `PUT {margem_desconto: 50}` → 403 (hoje 200, e o `/enviar` mandava 50 %); `PUT {margem_desconto: 10}` → 200;
  `PUT {margem_desconto: 3}` → 200 (≤ 5 não pede aprovação). Margem gravada ilegível conta como acima de 5 (RN-139.04d). A guarda
  `CAMPOS_CRUZADOS`/409 da 138 continua cobrindo a corrida.
- **RN-140.10 — `/enviar` passa pela regra dos 5 % (C301).** `POST /api/propostas/:id/enviar` (rascunho ou *desconto aprovado*) com margem
  gravada acima de 5 (ou ilegível) sem aprovação que case → **403 L-ENVIAR**, nada muda (hoje enviava). Com aprovação que casa, ou margem
  ≤ 5 → enviada como hoje. A gravação é `UPDATE ... WHERE id = ? AND status = ? AND margem_desconto IS ?`; 0 linhas → **409 L-CONFLITO**
  (`code: PROPOSTA_ALTERADA`). Ordem: 404 → status (400 de hoje) → L-ENVIAR.
- **RN-140.11 — a lista diz quem pode decidir.** `GET /api/aprovacoes`: cada linha ganha `pode_decidir` (booleano) = pedido pendente **e**
  quem lista é aprovador **e** não é o dono (RN-140.02). O filtro `tipo=recebida` passa a usar o aprovador (coluna **ou** super) e exclui
  os pedidos de que é dono. (`GET /api/notificacoes` monta os pendentes mas **não os devolve** — só lembretes; fora do escopo, D (140).)
- **RN-140.13 — `/assinar` passa pela regra dos 5 % (Fase 2, I1).** `POST /api/propostas/:id/assinar` (que põe *aprovada* de qualquer
  status): proposta inexistente → **404** *"Proposta não encontrada"*; margem gravada acima de 5 (ou ilegível) sem aprovação que case →
  **403 L-ASSINAR**, nenhuma assinatura gravada. O resto como hoje (nenhuma tela roteada chama a rota).
- **RN-140.12 — a tela.** (a) `Aprovacoes.js` mostra Aprovar/Rejeitar (lista e modal) só onde `pode_decidir !== false` (o campo ausente
  mostra — falha aberto; quem decide é o servidor). (b) O seletor *Status da proposta* do formulário oferece *Desconto aprovado* **só** quando
  a proposta gravada está nele (`opcoesStatusProposta(statusGravado)` em `constants/propostaComercial.js`).

## Contratos (congelados)

| Rota | Mudança | Respostas novas |
|---|---|---|
| `PUT /api/aprovacoes/:id` | RN-140.01 a 05 | 403 L-SEM-PERMISSAO; 403 L-PROPRIO; 409 L-JA-DECIDIDA; 400 L-VALOR-PEDIDO; 404 (proposta do pedido); 409 L-PROPOSTA-SAIU. 200 igual a hoje (`{message, id, status}`) |
| `POST /api/aprovacoes` | RN-140.06, 07 | 400 L-PROPOSTA-ID; 404 L-PROPOSTA-404; 400 L-SO-VOCE. 200 igual (`{id, message, aprovador_id}`) |
| `GET /api/aprovacoes` | RN-140.11 | + `pode_decidir` em cada linha |
| `PUT /api/propostas/:id` | RN-140.08, 09 | 403 L-DA-SO-APROVACAO; 403 L-DA-MARGEM |
| `POST /api/propostas/:id/enviar` | RN-140.10 | 403 L-ENVIAR; 409 L-CONFLITO |
| `POST /api/propostas/:id/assinar` | RN-140.13 | 404; 403 L-ASSINAR |

Todas as respostas de erro `{ error: <literal> }` (o 409 do envio também com `code`). Nenhuma migração. Sem mudança em `ACAO_PERFIS`.
Módulo novo `server/aprovacaoDesconto.js`: `casaComAprovacao(aprovacoes, margem)`, `ehAprovador(linhaUsuario)`, as mensagens.

## Tasks (sort topológico)

Tudo **tronco** (a mesma árvore, o `index.js` e o "um teste de servidor por vez"); nenhum galho em paralelo.

- [ ] **T1 · tronco — teste de servidor primeiro** `server/tests/api/aprovacaoDescontoAutorizacao.api.test.js` (molde
  `propostaMargemInvalida.api.test.js`: `index.js` real, pasta vazia; usuários criados por `POST /api/usuarios` pelo super do seed e
  logados: **vend** (sem coluna), **aprov1** e **aprov2** (coluna), **adm** (papel admin, sem coluna, sem super), o **super** do seed (sem
  coluna)). Um cenário por RN-140.01 a 11, cada um com literal e "nada mudou" (linha da aprovação e da proposta antes/depois). Rodar
  **vermelho** antes da T2.
- [ ] **T2 · tronco — as rotas.** `server/aprovacaoDesconto.js` + `index.js`: `PUT/POST/GET /api/aprovacoes`, `PUT
  /api/propostas/:id` (RN-140.08/09 — a condição dos 5 % passa a valer para `desconto_aprovado`, com a mensagem por status), `/enviar`,
  `/assinar`.
  Testes antigos que mudam: o `propostaMargemInvalida` (Fase 2, I3 — o super do seed é o único aprovador e pede: passaria a 400
  L-SO-VOCE; ganha um segundo aprovador, a regra não afrouxa); o `putParcialMantem` não toca `desconto_aprovado`. Controle positivo: cada guarda tirada derruba o seu cenário (sabotagem + restauro
  com md5).
- [ ] **T3 · tronco — integração cruzando as rotas (o fluxo inteiro, pela rota).** No mesmo arquivo: vend cria proposta 30 % rascunho →
  `POST /aprovacoes` com `status: 'aprovado'` e `solicitado_por: aprov1` no corpo → nasce pendente em nome de vend → vend `PUT
  /aprovacoes/:id` aprovar → 403 → vend `PUT /propostas/:id {status: 'desconto_aprovado'}` → 403 → vend `/enviar` → 403 → aprov1 lista
  (`pode_decidir: true`; para vend `false`) e aprova → 200, proposta *desconto aprovado* 30 % → vend salva o formulário sem mexer
  (`montarPayloadProposta` com a proposta lida) → 200 → vend `PUT {margem_desconto: 40}` → 403 L-DA-MARGEM → vend `/enviar` → 200 enviada →
  aprov1 decide de novo → 409. O "salva sem mexer" reproduz o `handleSubmit`: na *desconto aprovado* o `statusJaLiberado` mantém o
  status e não cria pedido. **Não há camada de serviço** nesta feature (as regras moram nas rotas do `index.js`); a outra entrada é a
  **tela**, coberta pela T4.
- [ ] **T4 · tronco — a tela.** `opcoesStatusProposta` (constants) + uso no `PropostaForm.js` (guardar `statusGravado` ao carregar e
  depois de enviar); `Aprovacoes.js` com `podeDecidirNaTela(aprovacao)` (exportada, `pode_decidir !== false`) nos botões da lista e do
  modal. Jest: `constants/propostaComercial.test.js` e `components/Aprovacoes.test.js` (a função pura e o render com `api` mockado — mock
  só na fronteira HTTP). Controle positivo: a opção sempre habilitada e o `!== false` trocado por `true` derrubam os testes.
- [ ] **T5 · Fase 5** — 3 revisores frescos em paralelo (regra, autorização, sabotagem), sob a trava.
- [ ] **T6 · fechamento** (`fechar-etapa`): novidades (cabeçalho, A87, B906+, C301–C303 resolvidos — a C301 e a C302 com o texto errado
  corrigido —, C304+, D (140), F (140), seção, "Onde estamos"); `specs/proposta-editavel/backend.md`; mapa; guia; manual
  (`docs/GUIA_TREINAMENTO_COMPLETO.md`); este plano com a próxima (141); o "defeito que escapou" da retro da 139.

## Pontos de atenção

- O `PUT /api/propostas/:id` hoje exclui `desconto_aprovado` da regra dos 5 %; a RN-140.09 a inclui. O formulário manda **sempre** status
  e margem: numa *desconto aprovado* sem mexer no desconto ele manda a margem que a aprovação copiou → casa. O `aplicarDescontoProposta`
  já rebaixa para rascunho quando o desconto passa de 5 — o formulário nunca manda *desconto aprovado* com margem trocada acima de 5 pelo
  modal; escolher de novo *Desconto aprovado* no seletor depois disso dá 403 L-DA-MARGEM (correto).
- A ordem das recusas do `PUT` da 138/139 (404 → título → margem → motivo → desconto) ganha a RN-140.08 antes do desconto.
- `nova-revisao` volta a proposta para rascunho; a aprovação antiga continua casando com a mesma margem (o `/enviar` a aceita) — é o mesmo
  percentual da mesma proposta (mesmo com itens/valor trocados — I6, D (140)). O `clone` **não copia a margem** (a cópia nasce
  com 0 %; anterior) nem as aprovações.
- `components/PropostaForm.js` e `components/Propostas.js` são código morto (não roteados) — não mexer; D (140).
- A86: pedido pendente com valor fora da régua agora dá 400 ao aprovar (RN-140.05) — a A86 já mandava rejeitar.
