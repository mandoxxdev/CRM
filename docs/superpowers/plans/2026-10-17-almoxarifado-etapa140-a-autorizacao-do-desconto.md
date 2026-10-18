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
- **RN-140.02 — o dono não decide (C302).** Aprovador que é o `solicitado_por` do pedido **ou o responsável da proposta** (Fase 5, r1 I-1: **ou quem a criou** — e trocar o responsável com pedido pendente é recusado, 409 *"Não é possível trocar o responsável de uma proposta com pedido de aprovação de desconto pendente. Aguarde a decisão ou peça que o pedido seja rejeitado."*; os literais L-PROPRIO e L-SO-VOCE mudaram: ver `server/aprovacaoDesconto.js`) → **403
  L-PROPRIO**, para aprovar e para rejeitar, inclusive super. Ordem: status/motivo inválidos (400, os de hoje — quem não pode decidir e
  rejeita sem motivo recebe o 400 do motivo) → 404 → **L-SEM-PERMISSAO** → **L-PROPRIO** → L-JA-DECIDIDA → (aprovar, tipo desconto)
  L-VALOR-PEDIDO → (aprovar, tipo desconto) proposta inexistente 404 *"Proposta não encontrada"* → L-PROPOSTA-SAIU.
- **RN-140.03 — `aprovado_por` é quem está logado.** O `aprovado_por` do corpo é ignorado (hoje grava o do corpo).
- **RN-140.04 — só pedido pendente se decide.** Pedido `aprovado` ou `rejeitado` → **409 L-JA-DECIDIDA**, nada muda. A gravação é
  `UPDATE ... WHERE id = ? AND status = 'pendente'`; 0 linhas → 409 (duas decisões ao mesmo tempo: uma 200, a outra 409).
- **RN-140.05 — aprovar exige o valor legível e a proposta em rascunho/desconto aprovado** (só `tipo = 'desconto'`; os outros tipos só
  mudam o pedido, como hoje). `valor_desconto` que a régua não lê (A86) → **400 L-VALOR-PEDIDO**; proposta inexistente → **404**; proposta em
  *enviada*, *visualizada*, *aprovada*, *rejeitada* → **409 L-PROPOSTA-SAIU**, nada muda (hoje rebaixava a proposta para *desconto aprovado* e
  trocava a margem). Rejeitar não confere nenhum deles. *(Fase 5, r2 I1: a ordem abaixo **estava errada** — o pedido aprovado antes da proposta deixava um /enviar casar com ele e a proposta sair enviada com um desconto que o desfazer tirava; virou **a proposta primeiro, com o pedido pendente no mesmo UPDATE, e depois o pedido**; se outro o decidiu no meio, a proposta volta ao que era e 409 L-JA-DECIDIDA — ver "Fase 5".)* **Ordem das gravações (Fase 2, I4 — a que estava errada):** (1) `UPDATE aprovacoes SET status='aprovado',
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

- [x] `d335c63e` **T1 · tronco — teste de servidor primeiro** `server/tests/api/aprovacaoDescontoAutorizacao.api.test.js` (molde
  `propostaMargemInvalida.api.test.js`: `index.js` real, pasta vazia; usuários criados por `POST /api/usuarios` pelo super do seed e
  logados: **vend** (sem coluna), **aprov1** e **aprov2** (coluna), **adm** (papel admin, sem coluna, sem super), o **super** do seed (sem
  coluna)). Um cenário por RN-140.01 a 11, cada um com literal e "nada mudou" (linha da aprovação e da proposta antes/depois). Rodar
  **vermelho** antes da T2.
- [x] `d335c63e` **T2 · tronco — as rotas.** `server/aprovacaoDesconto.js` + `index.js`: `PUT/POST/GET /api/aprovacoes`, `PUT
  /api/propostas/:id` (RN-140.08/09 — a condição dos 5 % passa a valer para `desconto_aprovado`, com a mensagem por status), `/enviar`,
  `/assinar`.
  Testes antigos que mudam: o `propostaMargemInvalida` (Fase 2, I3 — o super do seed é o único aprovador e pede: passaria a 400
  L-SO-VOCE; ganha um segundo aprovador, a regra não afrouxa); o `putParcialMantem` não toca `desconto_aprovado`. Controle positivo: cada guarda tirada derruba o seu cenário (sabotagem + restauro
  com md5).
- [x] `d335c63e` **T3 · tronco — integração cruzando as rotas (o fluxo inteiro, pela rota).** No mesmo arquivo: vend cria proposta 30 % rascunho →
  `POST /aprovacoes` com `status: 'aprovado'` e `solicitado_por: aprov1` no corpo → nasce pendente em nome de vend → vend `PUT
  /aprovacoes/:id` aprovar → 403 → vend `PUT /propostas/:id {status: 'desconto_aprovado'}` → 403 → vend `/enviar` → 403 → aprov1 lista
  (`pode_decidir: true`; para vend `false`) e aprova → 200, proposta *desconto aprovado* 30 % → vend salva o formulário sem mexer
  (`montarPayloadProposta` com a proposta lida) → 200 → vend `PUT {margem_desconto: 40}` → 403 L-DA-MARGEM → vend `/enviar` → 200 enviada →
  aprov1 decide de novo → 409. O "salva sem mexer" reproduz o `handleSubmit`: na *desconto aprovado* o `statusJaLiberado` mantém o
  status e não cria pedido. **Não há camada de serviço** nesta feature (as regras moram nas rotas do `index.js`); a outra entrada é a
  **tela**, coberta pela T4.
- [x] `5feb8fa4` **T4 · tronco — a tela.** `opcoesStatusProposta` (constants) + uso no `PropostaForm.js` (guardar `statusGravado` ao carregar e
  depois de enviar); `Aprovacoes.js` com `podeDecidirNaTela(aprovacao)` (exportada, `pode_decidir !== false`) nos botões da lista e do
  modal. Jest: `constants/propostaComercial.test.js` e `components/Aprovacoes.test.js` (a função pura e o render com `api` mockado — mock
  só na fronteira HTTP). Controle positivo: a opção sempre habilitada e o `!== false` trocado por `true` derrubam os testes.
- [x] `ea842ee6` **T5 · Fase 5** — 3 revisores frescos em paralelo (regra, autorização, sabotagem), sob a trava.
- [x] (o commit de documentação) **T6 · fechamento** (`fechar-etapa`): novidades (cabeçalho, A87, B906+, C301–C303 resolvidos — a C301 e a C302 com o texto errado
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

## Execução (2026-10-17)

- **Fase 0** (o design tem a medição): a C301 é alcançável **pela tela** (o seletor de status) — o texto dela estava errado; o
  `aprovado_por` vinha do corpo — o "O que fazer" da C302 estava errado. Banco local (cópia de 09/10): 3 usuários com a coluna, 3 super sem
  ela, 0 pedidos.
- **Fase 2** (cabeçalho): 7 Important + 12 Minor, todos aceitos antes do código de produção.
- **T1 · T2 · T3 — `d335c63e`.** O teste nasceu **vermelho** (4 passam / 19 caem — os 4 são ordem e legado, que já valiam). Depois das rotas:
  verde. **Divergência:** a corrida do envio × troca de margem não abria sozinha (o SQLite serializa; a sabotagem da guarda do envio
  sobreviveu) → o helper `tests/helpers/atrasoSqlInjetado.js` (atrasa o callback de um SQL escolhido) e uma segunda subida do `index.js` no
  mesmo arquivo; com ele a guarda e o desfazer passaram a cair. Controles: **23** sabotagens no `index.js` e no módulo — 22 caíram, 1
  equivalente (a leitura do status antes do `UPDATE` com guarda). O `propostaMargemInvalida` ganhou um segundo aprovador (I3 da Fase 2).
- **T4 — `5feb8fa4`.** 7 testes jest; 5 sabotagens, todas caíram.
- **Suíte antes de `d335c63e`/`5feb8fa4`** (a árvore com os dois): `test:api` **459/459**; `test:almoxarifado` **44/0**; `test:validation` 4/0,
  `test:safealter` 3/0, `test:sqlite` 16/0; client **136** suítes / **1800** testes; `CI=true build` *Compiled successfully*; revisão
  obrigatória da proposta **22/22** + editor **39/39**.

## Fase 5 — três revisores frescos em paralelo, sob a trava

- **Regra (r1): 1 Important + 3 Minor, desta etapa, 3 reproduzidos.** **I-1** o aprovador trocava o **responsável** da própria proposta pelo
  `PUT`, aprovava e trocava de volta (o mesmo que o r2 I3) → o dono passa a incluir **quem criou** (não muda) e trocar o responsável com
  pedido pendente é recusado (409 L-RESPONSAVEL-PENDENTE, **B907**). **M-1** o aviso do pedido ia para o responsável, que não pode decidir, e
  "só donos aprovam" criava pedido que ninguém decide → a escolha exclui os donos e dá 400 L-SO-VOCE (o texto mudou: *"Ninguém além de quem
  pede, do responsável e de quem criou a proposta pode aprovar este desconto. ..."*). **M-2** pedido com status vazio/nulo ficava preso
  (lido como pendente, gravado como não) → a gravação usa `COALESCE(NULLIF(status,''),'pendente')` (**A88** lista). **M-3** o formulário não
  relê o status gravado depois de uma recusa → D (140), cosmético.
- **Autorização (r2): 3 Important desta etapa + 3 Minor (1 desta, 2 anteriores), todos os Important reproduzidos pela rota.** **I1** a
  ordem "pedido primeiro" da RN-140.05 (a da Fase 2, I4) **abria um furo**: com o pedido já aprovado e a proposta ainda não, um `/enviar`
  casava com ele, a gravação da proposta falhava, o pedido voltava a pendente, era rejeitado — e a proposta seguia enviada e ganha com 30 %
  sem aprovação → **a ordem inverteu**: a proposta primeiro (com `EXISTS` do pedido pendente no mesmo `UPDATE`), depois o pedido; se outro o
  decidiu no meio, a proposta volta ao que era e 409 (**B911**; o "desfazer" do pedido saiu — o r2 M3 some junto). *A RN-140.05 do plano
  dizia "pedido primeiro, depois a proposta, e o desfazer do pedido"; **estava errada** — o pior caso dela libera, o da ordem nova é uma
  desconto aprovado sem aprovação, que não salva acima de 5 nem envia.* **I2** o `/assinar` gravava o status sem guarda (o `PUT` no meio
  levava a 50 % ganha) → status primeiro, `WHERE margem_desconto IS ?`, 409; a assinatura depois. **I3** = r1 I-1. **M1** (anterior) a
  aprovação decidida por quem pediu (ou por ninguém) casava para sempre → `casaComAprovacao` a descarta (**B912**, **A88**). **M2**
  (anterior) os valores em R$ do pedido vêm do corpo → **C306**. **Verificado e correto:** o decisor lido do banco, o admin de papel, o
  `aprovado_por` do corpo, a guarda de pendente, as rotas de status, as colunas de permissão só por `/api/usuarios`, a tela.
- **Sabotagem (r3, na worktree própria `CRM-wt-e140-r3`, removida com a branch): 55 sabotagens, 33 caíram, 16 sobreviveram por falta de
  cenário (reais) e 6 equivalentes** (A2, A8, A9, B5, B9, B14 — provadas no relatório dele). Os 16 viraram cenários, cada um com o controle
  rodado **por mim** com a mesma mutação no código já corrigido: **A7** (outro tipo de aprovação libera — só caía porque o regex do atraso
  deixava de casar), **G1** (a assinatura com a margem crua), **D3**/**D5** (as recebidas), **C3**/**C4**/**C5** (o aviso para inativo,
  sem o super, para o oculto), **F3** (`=` no lugar de `IS` na guarda do envio), **E4** (a mensagem pelo status gravado), **B2**/**B3** (a
  ordem — o B3 só caiu quando o cenário foi separado do B2: a asserção dele não rodava), **B11** (o histórico DA → DA), **H5** (o Rejeitar
  com `aprovado_por`), **H9–H12** (o formulário sem a ligação do status gravado → teste novo que **monta o PropostaForm**). Os achados do
  r1/r2 ganharam 8 cenários e 7 controles próprios (todos caíram).
- **Suíte antes de `ea842ee6`** (o commit da Fase 5): `test:api` **458/459** na primeira rodada — o `putParcialMantem` RN-05b gravava a aprovação sem decisor, que a **B912** deixou de aceitar; corrigido o teste, **459/459**; `test:almoxarifado` **44/0**; `test:validation` 4/0, `test:safealter` 3/0, `test:sqlite` 16/0; client **137** suítes / **1804** testes (as 3 do formulário de proposta e a 5ª de Aprovações entram aqui); `CI=true build` *Compiled successfully*; revisão obrigatória **22/22** + editor **39/39**.

## Retro (4 números)

1. **Rodadas de correção até verde:** **1** (a Fase 5; mais uma rodada só do `test:api`, pelo teste antigo do RN-05b). Testes antigos mudados: **2** (o `propostaMargemInvalida` ganhou um segundo
   aprovador — o super do seed pedia e era o único aprovador; o `putParcialMantem` RN-05b gravava a aprovação sem decisor, que a **B912**
   deixou de aceitar — a suíte da Fase 5 deu 458/459 por ele, e ele ganhou um decisor que não é quem pediu).
2. **Achados da revisão:** Fase 2 — **7 Important + 12 Minor, todos reais**. Fase 5 — r1 **4** desta etapa (1 Important); r2 **3 Important**
   desta etapa (um deles a ordem que a própria Fase 2 tinha pedido) + **1** Minor desta + **2** anteriores; r3 **16** sobreviventes reais +
   **6** equivalentes; **0** ruído.
3. **Paralelismo:** **0** galhos em paralelo de fato (o `index.js` e o "um teste de servidor por vez"); **0** retrabalho; **1** revisor na
   Fase 2, **3** em paralelo na Fase 5 sob a trava.
4. **Defeito que escapou:** **1** — o modal *Nova solicitação* de Aprovações (`components/Aprovacoes.js`) continuou escondendo a proposta
   cuja aprovação de mesmo valor tinha sido decidida por quem pediu: a **B912** tirou a validade dessas aprovações no servidor, mas a tela as
   contava como válidas, e a proposta sumia do modal para sempre. Achado na Fase 2 da Etapa 141 (I1) e corrigido lá (**RN-141.09**,
   `be150a88`; teste que monta o modal em `317bf471`). A Fase 5 da 140 olhou o servidor e a tela do formulário, não esse modal.

## Próxima tarefa detalhada — Etapa 141

*(A série desta etapa foi B906–B913, C304–C306, A87–A88 — a 141 começa em **B914**, **C307**, **A89**; confira com `grep -oE` antes.)*

**Escolhida: o documento da proposta barrado no servidor — C304** (das propostas). O preview e o PDF de uma proposta em rascunho ou com
*desconto aprovado* só são bloqueados pelos botões da tela (`PropostaForm.js`, `PropostaDetalhe.js`, `PropostasList.js` —
`STATUS_SEM_DOCUMENTO` em `constants/propostaComercial.js`); `GET /api/propostas/:id/premium` (`index.js` ~9361) e `GET /api/propostas/:id/pdf`
(~9708) entregam o documento de qualquer status. Cenário reproduzível: o editor do preview (`PropostaPreviewEditavel.js`, que usa
`/premium?embed=1` e `/pdf`) aberto numa aba; noutra, nova revisão → desconto 50 % → salvar; na aba do editor, PDF → sai com 50 % sem
aprovação. **Fase 0:** quem chama `/premium` e `/pdf` (o editor em rascunho? a tela de envio? o e-mail?), em que status o editor do preview é
usado de verdade (se o vendedor edita as cláusulas **antes** de enviar, barrar o `embed=1` em rascunho quebra o fluxo), e o que a revisão
obrigatória da proposta (22 + editor) e o `propostaPdfExigeLogin.api.test.js` exercitam. **Desenho reversível sugerido:** o `/pdf` e o
`/premium` **sem** `embed` recusam (403, mensagem literal nova) proposta com margem acima de 5 (ou ilegível) sem aprovação que case
(`aprovacaoDesconto.margemLiberada`) — a regra do desconto, não a do status (rascunho com ≤ 5 % pode ter PDF de prévia? medir); o `embed=1`
do editor fica como está ou ganha marca d'água "prévia" (decidir na Fase 0, registrar em B). **Pontos de atenção:** a revisão obrigatória
da proposta é critério (mantê-la 22/22 + editor); o `/pdf` grava o retrato (`html_rendered`, `pdf_gerado_at`) — recusar antes de gravar;
os testes de navegador da proposta usam o template direto, não a rota. **Alternativa:** a **C306** (os valores em reais do pedido conferidos
com a proposta — pequena), ou o índice e a paginação da lista de propostas (`specs/lentidao-api-propostas/2026-07-21-lentidao-api-propostas.md`,
Frente B), ou a **C297**.

**Dependem do P.O. — NÃO implemente:** **B853**/**C279**, **B808**, **B755**, **B761**/**C239**, **C224**, o resto da **C225**, **C228**,
**C219**, **C230**, o reparo da **C246** (e a **C247**), a tabela de conversões e o grupo acima de família, a **régua do tempo de
recebimento (E2)**, a **C268**, a **C269**, **C275**, **C276**, **C277**, **C109**, **C117**/**C118**, **C139**, **C278**; na 05, os itens
de produto e a **C198**; na 06, a **B11** e a Engenharia; na 21, a valorização por cliente e previsto × realizado; na 22, **B13**,
**B101**/G30, **G38**; no Compras, D-35, D-37, D-78, D-90, G9/G30, G4, G15, B63, B60, B62; nas propostas, a verificação do dono da proposta
(Fase 12 de `specs/proposta-editavel/tasks.md`; agora também a **C305**), o filtro por permissão do histórico (`auditoria.md`) e a **B910**
(a aprovação pelo percentual ou pelo valor). Pendem de Postgres: **C98**, **C110**.

**O que já está pronto e não precisa reabrir:** `server/aprovacaoDesconto.js` — `margemLiberada` (a regra dos 5 % com a aprovação que casa,
para qualquer porta nova), `ehAprovador`, `donosDoPedido`, `MSG`; o helper `tests/helpers/atrasoSqlInjetado.js` (abre a janela entre leitura
e gravação de qualquer rota, para provar uma guarda); `tests/helpers/servirAssetsProposta.js` para teste de navegador da proposta; o molde
`aprovacaoDescontoAutorizacao.api.test.js` (usuários por `POST /api/usuarios`, duas subidas); a revisão obrigatória **22/22**.

