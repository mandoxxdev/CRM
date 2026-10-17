# Etapa 140 (propostas): a autorização do desconto acima de 5 % (C301, C302, C303) — design

> Origem: "Próxima tarefa detalhada — Etapa 140" do plano da 139. Plano:
> `docs/superpowers/plans/2026-10-17-almoxarifado-etapa140-a-autorizacao-do-desconto.md`.

## Fase 0 — medido (2026-10-17, worktree `CRM-wt-e140`, main `2a154ac4`)

**Quem chama cada rota pela tela** (só os arquivos roteados — `client/src/routes/lazyModules.js` importa
`components/proposta/PropostaForm`; `components/PropostaForm.js` e `components/Propostas.js` também chamam `/aprovacoes`, mas **não estão
em rota nenhuma** — código morto, D (140)):

| Rota | Quem chama | O que manda |
|---|---|---|
| `POST /api/aprovacoes` | `proposta/PropostaForm.js` (salvar rascunho com margem > 5) e `Aprovacoes.js` ("Nova Solicitação") | `status: 'pendente'`, `solicitado_por: user.id` (o logado) |
| `PUT /api/aprovacoes/:id` | `Aprovacoes.js` (Aprovar / Rejeitar — **os botões aparecem para qualquer um** em pedido pendente, inclusive para quem pediu) | `status`, `motivo_rejeicao`, `aprovado_por: user.id` (do `localStorage`) |
| `PUT /api/propostas/:id` | `proposta/PropostaForm.js` (salvar) | sempre `status` e `margem_desconto` (via `montarPayloadProposta`) |
| `POST /api/propostas/:id/enviar` | `PropostaForm.js`, `PropostaDetalhe.js`, `PropostasList.js` | nada |

**Achado da Fase 0 — o C301 é alcançável pela TELA, não só pela API.** O seletor *Status da proposta* do formulário oferece **"Desconto
aprovado"** (`constants/propostaComercial.js`, `STATUS_PROPOSTA`). Numa rascunho com 10 % sem aprovação, escolher *Desconto aprovado* e
salvar: o `handleSubmit` trata `desconto_aprovado` como "já liberado" (`statusJaLiberado`) e manda o status; o `PUT` pula a regra para
`desconto_aprovado`; o botão **Enviar proposta** aparece e o `/enviar` não olha a margem → enviada com 10 % sem aprovação. Três gestos de
tela. O texto da C301 ("nada pela tela") **estava errado**.

**Achado da Fase 0 — a C302 diz "a aprovação grava quem a decidiu"; não é bem assim.** O `PUT /api/aprovacoes/:id` grava
`aprovado_por` **do corpo** (`aprovado_por || req.user.id`): pela API, qualquer um decide em nome de outro. A tela manda o id do logado.

**O desconto trocado pela tela já volta a pedir aprovação:** `aplicarDescontoProposta` (o único lugar do formulário que muda a margem) põe
o status em rascunho quando o desconto passa de 5 — mesmo numa *desconto_aprovado* — e o salvamento cria um pedido novo. Então a regra nova
do `PUT` ("margem acima de 5 numa *desconto_aprovado* tem de casar com uma aprovação") **não recusa nenhum gesto da tela**: o formulário que
não mexe no desconto manda a mesma margem que a aprovação copiou.

**Quem pode aprovar** (banco local, cópia de 09/10/2026 — não é produção; produção é a consulta **A87**): 3 usuários com *Pode aprovar
descontos* (um deles também super), 3 super administradores **sem** a coluna; 0 pedidos de aprovação; 0 propostas fora do rascunho com
margem > 5 sem aprovação que case. **Hoje qualquer usuário autenticado aprova** (a rota não confere nada); o filtro "recebidas" e a
notificação de pendentes usam só a coluna. Admin (papel) e super **não** têm tratamento especial em lugar nenhum das aprovações.

**`ACAO_PERFIS` não cobre propostas** (é do almoxarifado: `services/almoxarifado/permissions.js`). A autorização aqui é a coluna
`usuarios.pode_aprovar_descontos` + `is_superadmin` — o `req.user` traz `is_superadmin` (do `enrichUserFromDb`) mas **não** a coluna:
a rota a lê do banco na hora.

**Outros achados lidos no código (anteriores):** (a) aprovar um pedido de uma proposta já *enviada* ou *aprovada* a **rebaixa** para
*desconto aprovado* e troca a margem; (b) um pedido já decidido pode ser decidido de novo (aprovar o rejeitado); (c) a atualização da
proposta na aprovação roda **depois** da resposta (fogo e esquece); (d) a atividade do aprovador vai para o primeiro com a coluna — que pode
ser o próprio solicitante; (e) a descrição da atividade chama `valor_total.toFixed` sem conferir (pedido sem valores → exceção no callback,
engolida pelo guarda global); (f) proposta inexistente no `POST /api/aprovacoes` → 500 cru de chave estrangeira (D (139)).

## Desenho (reversível)

1. **Decidir** (aprovar **ou** rejeitar) exige `pode_aprovar_descontos = 1` **ou** super administrador, e **não** ser quem pediu — para
   todos, inclusive o super (B906). `aprovado_por` = quem está logado, sempre. Só pedido **pendente** se decide (409). Aprovar exige o
   valor pedido legível pela régua (400) e a proposta em rascunho ou *desconto aprovado* (409); a proposta é atualizada **antes** da
   resposta, com guarda de status.
2. **Criar** o pedido grava sempre *pendente* e `solicitado_por` = quem está logado (o corpo é ignorado, sem erro — a tela manda os dois).
   Proposta inexistente → 404. A atividade vai para um aprovador que **não** é quem pediu; se só quem pede pode aprovar → 400 com a frase.
3. **`desconto_aprovado` só pela aprovação:** o `PUT` da proposta recusa **entrar** nele (estar nele e mandá-lo de novo passa). O seletor
   do formulário só oferece *Desconto aprovado* quando a proposta já está nele.
4. **Numa *desconto_aprovado*, margem acima de 5 tem de casar com uma aprovação** (a mesma régua de casamento do envio pelo `PUT`).
5. **`/enviar` passa pela regra dos 5 %**: margem gravada acima de 5 (ou ilegível — RN-139.04d) só sai com aprovação que case; a gravação
   confere que status e margem não mudaram desde a leitura (409, a frase da Etapa 138).
6. A tela de Aprovações só mostra Aprovar/Rejeitar onde o servidor diz que a pessoa pode decidir (`pode_decidir`, falha aberto).

**O que a Fase 2 e a Fase 5 mudaram neste desenho** (detalhe no plano): o dono do pedido inclui o **responsável** (Fase 2) e **quem criou a
proposta** (Fase 5 — trocar o responsável pelo `PUT` contornava; e a troca com pedido pendente é recusada); a ordem das gravações da
aprovação do item 1 **virou proposta primeiro** (Fase 5 — o pedido aprovado antes da proposta deixava um `/enviar` casar com ele); a
assinatura também passa pela regra dos 5 % e grava com guarda; a aprovação decidida por quem pediu, ou sem decisor, não casa; o pedido com
status vazio conta como pendente.

Descartado: tabela de alçadas por valor (é regra do P.O.); bloquear só o vendedor e liberar o super a aprovar o próprio (B906); recusar no
`POST /api/aprovacoes` o corpo com `status`/`solicitado_por` (quebraria a tela, que os manda); mudar `POST /api/propostas` e a geração
automática (já recusam margem > 5 fora do rascunho; *desconto aprovado* ≤ 5 nascendo por eles é inofensivo — D (140)).
