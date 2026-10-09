# Etapa 98 — devolver da caixa à prateleira: o almoxarife tira da caixa de uma requisição o que não vai sair (B497, C189; com o C190)

> Status: **Fases 0, 1 e 2 feitas — 2026-10-09. Próximo passo: Fase 3 (T0, depois T1)**. A Fase 2 (seção "Fase 2 —
> revisão do plano", antes de "Próximo passo") achou 2 bloqueantes, 5 importantes e 6 menores; os pontos afetados estão
> marcados **"(corrigido na Fase 2)"** e a seção vale sobre o texto acima. Nenhuma task executada.
> HEAD de partida: `6e61cb27` (main, árvore limpa, sem push).
> Origem: "Próxima tarefa detalhada — Etapa 98" no fim de
> `docs/superpowers/plans/2026-10-09-almoxarifado-etapa97-portas-avulsas-respeitam-a-caixa.md`; B497 (i), C189, C190.
> **A Fase 0 mediu que o contrato provável da 97 erra em três pontos** — o status de volta, a `PERDA` "sem o
> administrador" com reserva, e o C190 (o gesto **não** o resolve, e o C190 é maior do que a 97 escreveu) — ver "O que
> contradiz a próxima tarefa escrita na 97".
>
> **Numeração:** etapa única para todos os módulos (esta é a **98**). Letras de `docs/almoxarifado-novidades-por-etapa.md`
> conferidas em 2026-10-09 (`grep -o` no documento; `grep` em `docs/` e `specs/` só acha B502/C193/A49 no plano da 97,
> como "próximas livres"): última **B501**, último C **192**, última **A48**. Esta etapa reserva **B502–B511**,
> **C193–C198** e **A49**.

**Escopo desta etapa (o que a Fase 0 reproduziu — e só isso):**
1. **O gesto** `PUT /api/almoxarifado/requisicoes/:id/devolver-separado` — diminui o separado ainda não entregue de um
   ou mais itens (a "caixa"), com motivo obrigatório e trilha própria. **Não move estoque**: a separação nunca moveu
   (s1 F) — o material nunca saiu da prateleira nos livros; é o livro **da requisição** que muda (B502).
2. **O status:** *Pronta para Retirada* volta a *Em Separação* em qualquer devolução (seta nova); os demais ficam; a
   *Em Separação* esvaziada é a *Em Separação* vazia que já existe (B504).
3. **A segunda conferência** é limpa pela devolução, como pela rodada nova (D3 da Etapa 28) (B505).
4. **A reserva do item não muda** (B506); **a origem/lote planejados** zeram quando a caixa do item zera.
5. **O sufixo da 97** ensina a terceira saída — "devolva-o à prateleira na requisição" (B508).
6. **O C190, medido maior:** a entrega, a fila e o detalhe passam a dizer o que o motor deixa sair quando o disponível do
   material está negativo (bloqueio sobre o reservado já separado), e a recusa nomeia o bloqueio e a saída (B509) — **A49**
   acha as requisições presas por isso.
7. **A tela:** botão *"Devolver à prateleira"* por item no detalhe da requisição (modo almoxarifado), modal com quantidade
   e motivo, bloco *"Devolvido à prateleira"* no histórico; o *title* do "Ajustar Separação" deixa de prometer o que não
   faz.

**Fora (declarado, ver "O que fica de fora"):** voltar ao status pré-separação (B504 (i)); quem pediu cancelar a *Em
Separação* vazia (C195, pré-existente); liberar a reserva no mesmo gesto (B506); série inteira na devolução e a fração de
série aceita pela separação (B510, C197); a separação que aceita quantidade negativa em silêncio (C197); ação de perfil
própria (B503 (i)).

---

## Fase 0 — medido (2026-10-09)

Sondas no scratchpad da sessão (`C:\Users\User\AppData\Local\Temp\claude\C--Users-User-projetos-CRM\7ead12bf-e959-4c36-bd6b-6614fb9c9bcd\scratchpad`),
harness `e98-h.js` (estende o `e95-h.js`: `testApp` com `requirePermission` **real**, usuário por header `x-u`); saída
`e98-sonda-*.out` ao lado de cada sonda. **S** sem perfil (fallback `PRODUCAO`) cria por `POST /api/requisicoes-material`;
**ADMIN** superadmin aprova e movimenta; **ALMOX**/**ALMOX2** (`ALMOXARIFE`) separam, conferem, entregam, liberam reserva.
Tudo no HEAD `6e61cb27` (código da 97).

**Montagem padrão (`montarCaixa`):** material PC; S pede 4; **sem reserva** = ADMIN aprova sem saldo (*Aguardando
Estoque*) e entra 4 depois; **com reserva** = entra 4 antes e a aprovação reserva (*Totalmente Reservada*); ALMOX separa 4.

**Detector:** cada linha escreve à mão o esperado e compara (`h.conferir`). **Controle do detector** (s1): a mesma
montagem com um esperado **errado de propósito** (caixa 0 com separado 4 sem reserva) — o detector disse ERRADO.
Controles de domínio por sonda, abaixo.

### s1 — o estado da caixa em cada status (`e98-sonda-s1-caixa-por-status.js`) — 8/8 CERTO (o que existe hoje)

| cenário | status | separado / entregue | caixa sem reserva | reserva ativa | conferido | fila |
|---|---|---|---|---|---|---|
| A sem reserva | *Em Separação* (aprovou em *Aguardando Estoque*) | 4 / 0 | **4** | 0 | — | ENTREGAR |
| B com reserva | *Em Separação* (aprovou *Totalmente Reservada*) | 4 / 0 | **0** (a reserva cobre) | 4 | — | ENTREGAR |
| C crítico conferido (ALMOX2) | *Em Separação* | 4 / 0 | 4 | 0 | 9503 | ENTREGAR |
| D separou 4, entregou 2 | *Parcialmente Atendida* | 4 / 2 | 2 | 0 | — | ENTREGAR |
| E liberada | *Pronta para Retirada* | 4 / 0 | 4 | 0 | — | ENTREGAR |
| F separou com origem LA | *Em Separação*; `origem_separacao_id` = LA | 4 / 0 | 4 | 0 | — | — |
| G "Iniciar Separação" sem quantidade | *Em Separação* **vazia** | 0 / 0 | 0 | 0 | — | SEPARAR |

**F, medido:** o saldo por endereço (`estoque_saldo_almoxarifado`) é **idêntico** antes e depois de separar, e o físico
continua 4 — **a separação não move estoque**. Logo a devolução também não move: devolver à prateleira é desfazer um
registro, não um movimento. **G:** a *Em Separação* vazia **já existe** como estado da máquina (Etapa 92: o "Iniciar
Separação" sem quantidade reivindica o status; Etapa 94, B462: a alçada de valor ainda vale nela).

### s2 — material quebrado/perdido na caixa: o que o ALMOXARIFE consegue hoje (`e98-sonda-s2-quebrado-hoje.js`) — 6/8 ERRADO

Critério ("certo"): o almoxarife tira da caixa **só o que quebrou**, dá a baixa (`PERDA`) e a requisição **continua viva**
para o resto. Em cada cenário ele tenta, nesta ordem: `PERDA`, separar com quantidade negativa, encerrar, cancelar,
excluir.

| cenário | `PERDA` | separar −q | encerrar (ALMOX) | cancelar (ALMOX) | excluir (ALMOX) | |
|---|---|---|---|---|---|---|
| Q1 *Em Separação* sem reserva, 2 de 4 quebradas | 400 M1 + S (97) | **200** em silêncio, separado continua 4 | 400 *"Transição inválida: EM_SEPARACAO → ENCERRADA"* | 403 *"Sem permissão"* | 403 *"Apenas administradores do Almoxarifado ou Super Administrador podem excluir requisições"* | ERRADO |
| Q2 *Em Separação* **com reserva** | 400 *"Saldo insuficiente. Disponível: 0 PC"* — **sem sufixo** (a caixa está coberta) | — | — | — | — | ERRADO (a recusa não ensina) |
| Q2 liberar 2 da reserva (ALMOX, 200) e `PERDA` 2 de novo | 400 M1 + S — liberar a reserva **transforma** caixa coberta em caixa sem reserva | | | | | ERRADO |
| Q3 *Pronta para Retirada*, tudo perdido | 400 M1 + S | 400 (*Pronta* fora de `PODE_SEPARAR`) | 400 *"…PRONTA_PARA_RETIRADA → ENCERRADA"* | 403 | 403 | ERRADO |
| Q4 *Parcialmente Atendida*, as 2 da caixa quebradas | 400 M1 + S | **200 e a requisição passa a *Em Separação*** (a reivindicação do "Iniciar Separação") | 400 (já *Em Separação*) | 403 | 403 | ERRADO |
| Q5 crítico conferido, 1 quebrada | 400 M1 + S | 200, nada muda | 400 | 403 | 403 | ERRADO |
| controle: físico 6, caixa 4, `PERDA` 2 (fora da caixa) | **201** | | | | | CERTO |
| controle: ADMIN exclui, `PERDA` 4 | 200 / **201** | | | | | CERTO |

**Leitura:** o almoxarife **não tem gesto nenhum**; em *Parcialmente Atendida* o "entregar e encerrar" da 97 (L3) existe
mas **mata** o pendente (a requisição queria 4). Com reserva é pior: a recusa nem nomeia a caixa. Achado colateral (Q1,
Q4): **a separação aceita quantidade negativa em silêncio** (200, ignorada — `if (!(qty > 0)) continue`,
`requisitionService.js:868`) e, por ser o "Iniciar Separação", **reabre** *Parcialmente Atendida* para *Em Separação*
— pré-existente (C197).

### s3 — o PROTÓTIPO do gesto (`e98-sonda-s3-prototipo-devolver.js`) — 16/17 CERTO, 1 ERRADO (a variante sem limpar a conferência)

A sonda escreve o gesto à mão, sem mexer no código: `quantidade_separada = ROUND(separado − q, 6)` com claim
(`separado − entregue >= q`), origem/lote planejados nulos quando a caixa zera, e duas variantes (limpar a conferência;
*Pronta* → *Em Separação*). Mede o que vem **depois**:

| linha | resultado | |
|---|---|---|
| P1 *Em Separação* sem reserva, devolve 2 de 4 → `PERDA` 2 → entrega 2 | 201 / 200 → *Parcialmente Atendida*, fila AGUARDANDO_SALDO (pendente 2) | CERTO — **o caso legítimo resolvido pelo almoxarife** |
| P2 devolve **tudo**, nada entregue | *Em Separação* vazia, caixa 0, fila SEPARAR; liberar 400 *"Nenhum item separado"*; entregar 400 *"Máximo: 0"*; separar 4 de novo 200 | CERTO (3 linhas) |
| P2 quem pediu cancela a vazia? | 400 pelas duas rotas | CERTO — e **P2b**: a vazia de **hoje** ("Iniciar Separação" sem quantidade) também não cancela — **pré-existente** (C195) |
| P3 **com reserva**, devolve 4 | reserva continua 4; caixa sem reserva 0; `PERDA` 4 → 400 *"Saldo insuficiente. Disponível: 0 PC"* **sem sufixo**; ALMOX libera a reserva (200, status continua *Em Separação*) → `PERDA` 4 **201** | CERTO (3 linhas) — **com reserva o gesto sozinho não solta a baixa** (C194) |
| P4 *Pronta*, devolve tudo **sem** a seta de volta | separar 400, entregar 400, encerrar 400, **fora da fila** | CERTO = **presa** (a seta é necessária) |
| P4b com a seta *Pronta* → *Em Separação* | separar de novo 200 | CERTO |
| P4c *Pronta*, devolve 2 de 4, com a seta | *Em Separação*; entrega 2 → 200 *Parcialmente Atendida* | CERTO |
| **P5 crítico conferido, devolve 1 SEM limpar a conferência** | entrega 3 → **200** — sai atestada por uma caixa que ninguém conferiu depois | **ERRADO** (a variante está errada; a D3 da 28 manda limpar) |
| P5b o mesmo **limpando** | entrega 400 (literal C3 da 28); ALMOX (separou) confere 403; ALMOX2 confere 200; entrega 3 → 200 | CERTO |
| P6 *Parcialmente Atendida*, devolve as 2 da caixa | `PERDA` 2 → 201; continua *Parcialmente Atendida*, fila AGUARDANDO_SALDO | CERTO |
| P7 origem LA: devolve 2 (fica LA), devolve o resto (nulo); saldo por endereço igual | `[LA, null, true]` | CERTO |
| P8 legado da **A48** (caixa 4, físico 0 pelo escritor de legado) | a A48 acha antes (1) e não acha depois (0) | CERTO — o gesto destrava o legado **sem o administrador** |
| P9 claim: caixa 1, devolver 2 | 0 linhas escritas, separado intacto | CERTO |

### s4 — o C190, a série e o lote (`e98-sonda-s4-c190-serie-lote.js`, `-s4b-detalhes.js`, `-s4c-c190-motor.js`, `-s4d-c190-fila.js`, `-s4e-c190-saidas.js`)

| linha | resultado | |
|---|---|---|
| C190-1 reserva 4 cobre a caixa 4; ADMIN bloqueia 4 (200 — a B496 não conta o reservado) | entrega 4 → 400 *"…Máximo: 0 (pendente: 4, disponível: 0)"* — não nomeia o bloqueio | ERRADO (o C190 da 97) |
| C190-2 bloqueia **1** | entrega 4 → 400 *"Máximo: 3 (…disponível: 3)"*; **entrega 3 → 400** | ERRADO |
| s4b (a) / s4c — por quê | o motor recusa **qualquer** quantidade: *"Saldo físico insuficiente para consumir a reserva. Disponível: -1 PC"* — o claim do consumo (`stockService.js:1830`) exige `disponível + q >= q`, isto é, disponível do material ≥ 0; a entrega de **1** também cai | ERRADO — **a prévia anuncia 3 e o motor recusa tudo** |
| s4d — a fila e o detalhe | fila **ENTREGAR**, `entregavel` 3; detalhe `quantidade_entregavel` 3 | ERRADO 2/2 |
| s4e (a) ALMOX libera 1 da reserva | entrega 3 → **200** | CERTO — a saída que existe |
| s4e (b) devolver 1 à prateleira (protótipo) e entregar 3 | 400 (a reserva continua 4 sobre 3 livres) | CERTO = **devolver não resolve o C190** |
| s4c controle: desbloquear 1 | entrega 4 → 200 | CERTO |
| C190-4 controle: caixa **sem** reserva, bloquear 1 | 400 (a guarda da B496) — ~~o C190 só existe com a caixa **coberta**~~ **estava incompleta (corrigido na Fase 2):** o C190 também existe **sem** reserva no item quando a reserva de **outra** requisição ocupa o físico (físico 6; R2 sem saldo separou 2; R1 reserva 4; bloquear 3 → **200**; R2 entrega 1 → 400 *"Máximo: -1"*; detalhe `quantidade_entregavel` −1; a saída é liberar a reserva de R1 ou desbloquear — sonda `e98rv-a.js` B) | CERTO (a guarda) / ERRADO (a conclusão) |
| S1 série: separar 2 de material com série | as séries continuam `EM_ESTOQUE` — a separação não planeja série (a série é escolhida na entrega, Etapa 61) | CERTO — devolver não tem série a soltar |
| s4b (b) separar **1,5** de material com série | **200**, separado 1,5; entregar 1,5 → 400 *"material com controle de serie exige quantidade inteira"* | ERRADO — pré-existente (C197) |
| L1 separar com LA e lote L | grava `origem_separacao_id` LA e `lote_separacao_id` L | CERTO |

### s5 — a consulta A49 (`e98-sonda-s5-a49.js`, SQL em `e98-a49.sql`) — 2/2 CERTO

X (bloqueio 1 sobre reserva 4 separada), Y (reserva sem bloqueio), Z (caixa sem reserva): a consulta devolve **só X**;
depois de liberar da reserva o bloqueado, **vazia** (acha e não acha).

### Placar

- **O defeito (o caso legítimo sem gesto):** s2 **6/8 ERRADO** (5 cenários + a recusa que não ensina com reserva),
  controles 2/2 CERTO.
- **O desenho, por protótipo:** s3 **16/17 CERTO**; o 1 ERRADO é a variante descartada (não limpar a conferência — B505).
- **O C190:** **5 ERRADO** (C190-1, C190-2, s4b (a)/s4c, s4d ×2), controles 3/3 CERTO; **a saída que funciona é liberar
  da reserva o bloqueado ou desbloquear — devolver não resolve**.
- **Série/lote:** 2/2 CERTO no que importa (nada a soltar; planejados gravados), 1 ERRADO pré-existente (fração de série).
- **A49:** 2/2 CERTO.
- **Controle do detector:** o esperado errado de propósito deu ERRADO (s1).

### Onde mexer (lido no HEAD `6e61cb27`)

- **Escritas de `quantidade_separada`** (`grep -n "quantidade_separada" services routes`): só duas — a separação
  (`requisitionService.js:1015`, só soma; `:868` pula `qty <= 0`) e a entrega (`:1524`, `MAX(separado, entregue + q)`).
  A devolução é a **terceira** e a única que diminui.
- **Máquina** (`requisitionStateMachine.js:76-78`): `PRONTA_PARA_RETIRADA: ['PARCIALMENTE_ATENDIDA', 'ENTREGUE']` — sem
  volta. `STATUS_COM_CAIXA` (`:109`) é a lista "onde a caixa existe".
- **Travas:** separar e entregar = `travaPorRequisicao.serializarNaRequisicao` → `comTravaDaRequisicao` (material)
  (`requisitionService.js:792`, `:1190`). A devolução usa a **mesma** composição (ordem requisição → material).
- **Conferência:** `conferenciaObrigatoria`/`assertConferidaSeObrigatorio` (`:426`, `:437`); a limpeza da rodada é
  compare-and-clear (`:1077-1117`). O claim da conferência (`:462`) olha só `separacoes_requisicao_almoxarifado`.
- **Trilha:** `separacoes_requisicao_almoxarifado` e `substituicoes_origem_requisicao` (`schema.js:2431`, `:2445`); o
  detalhe (`routes/almoxarifado.js:3233`) devolve `separacoes` e `substituicoes`.
- **C190:** o claim do consumo de reserva `stockService.js:1826-1838`; a prévia da entrega `requisitionService.js:1359-1383`
  (`maxEntregar` com `saldoDisponivelParaItem.disponivel` = disponível + reserva do item); a fila `:575`, `:615`;
  `normalizarItem` `:82-114` (o `estoque` do detalhe).
- **O sufixo:** `caixaSql.sufixoCaixa` (`caixaSql.js:77-89`); dois testes da 97 casam a literal
  (`portasAvulsasCaixa.api.test.js`, `portasAvulsasCaixaIntegracao.api.test.js` — 1 ocorrência cada).
- **Cliente:** `client/src/components/almoxarifado/RequisicoesList.js` — tabela de itens do detalhe (`:1453-1500`), os
  botões de *Em Separação* (`:1735-1760`, "Ajustar Separação" com *title* *"Corrige as quantidades já registradas na
  separação"* — **falso**: a separação só soma), `bloquearSeNaoPode('separar_emitir', e)`. Três testes clicam o rótulo
  "Ajustar Separação" (`RequisicoesSeparacaoTeto`, `RequisicoesTrocaSeparacao` ×2) — o rótulo **não** muda.

---

## Decisões reversíveis (letra B do documento de novidades; última usada: B501)

- **B502 — o gesto: uma rota própria que diminui o separado, sem mover estoque.** `PUT
  /api/almoxarifado/requisicoes/:id/devolver-separado`. O material nunca saiu da prateleira nos livros (s1 F); o gesto
  desfaz o registro da caixa. Depois dele a caixa sem reserva cai e as portas avulsas da 97 liberam (P1, P8).
  **Descartados:** (i) **devolver como movimentação** (uma `ENTRADA`/estorno) — creditaria o que nunca foi debitado
  (dupla contagem); (ii) **"separar negativo" pela rota da separação** — a separação acumula e carrega regras que não
  valem para tirar (divergência da 60, troca da 65, dono da rodada que a barreira da 28 lê, a reivindicação do status);
  e hoje o negativo já entra em silêncio (s2, C197) — reaproveitá-lo daria sentido a um erro; (iii) **abrir a exclusão ou
  o cancelamento ao almoxarife** — mata a requisição que ainda quer o material (s2 Q4).
- **B503 — autorização: `separar_emitir` (ADMINISTRADOR, ALMOXARIFE), o mesmo gate do separar e do entregar.** É o
  inverso do separar, no mesmo balcão. Duas camadas: o acesso ao módulo abre o detalhe; o perfil autoriza; S (fallback
  `PRODUCAO`), ENGENHARIA, GESTOR, COMPRAS, QUALIDADE e CONSULTA tomam 403. **Descartado:** (i) **ação própria
  `devolver_separado`** (molde `conferir_separacao`, Etapa 28 C4: "poder restringir sem reescrever") — hoje seriam os
  mesmos perfis; reversível numa linha (`ACAO_PERFIS` + o gate da rota); (ii) **só o administrador** — é o que já existe
  (excluir) e o que a B497 queria tirar da frente.
- **B504 — o status: *Pronta para Retirada* volta a *Em Separação* em qualquer devolução; os demais ficam.** Seta nova
  `PRONTA_PARA_RETIRADA → EM_SEPARACAO` (a liberação atestou uma caixa que mudou, como a conferência na D3 da 28). Sem ela
  a *Pronta* esvaziada fica presa: separar, entregar e encerrar recusam e ela some da fila (P4); com ela, separa de novo
  (P4b) e entrega o resto (P4c). *Em Separação* esvaziada sem nada entregue = a *Em Separação* vazia que já existe (s1
  G): separa de novo, a alçada de valor volta a valer (94, B462 — `alcadaDeValorAindaVale`), a fila mostra SEPARAR ou
  AGUARDANDO_SALDO. *Parcialmente Atendida* fica (encerra ou separa de novo — P6). **Descartados:** (i) **voltar ao status
  anterior à separação** (o contrato provável da 97: *Aprovado*/*Reservada*/*Aguardando*) — quatro a seis setas novas de
  *Em Separação*, e o recálculo de reserva (74, 76), alçada (94) e chegada (B475) sobre cada uma; o único ganho medido
  seria quem pediu poder cancelar, e a *Em Separação* vazia de **hoje** já não cancela (P2b) — lacuna pré-existente,
  registrada (C195), não criada pela 98; (ii) **a *Pronta* só voltar quando a caixa zera** — com crítico na caixa e a
  conferência limpa (B505) ela ficaria *Pronta* sem poder conferir (o claim só confere em *Em Separação*) nem entregar:
  a etapa CONFERENCIA_SEM_SAIDA da fila, sem gesto.
- **B505 — a devolução limpa a segunda conferência (compare-and-clear, molde F4 da 28), em qualquer status; quem devolveu
  não entra na barreira "quem separou não confere".** A conferência atesta o conteúdo de uma caixa; a caixa mudou (P5:
  sem limpar, o crítico sai atestado por uma caixa que ninguém viu — **ERRADO**). **Descartados:** (i) **não limpar** (P5);
  (ii) **barrar quem devolveu de conferir** — mudaria o claim da 28 (`NOT EXISTS` em duas tabelas) e a literal do 403 R;
  a devolução **tira** material, não escolhe o que entra na caixa — o risco que a barreira da 28 cobre (atestar a própria
  escolha) não está presente. Reversível: uma condição a mais no `NOT EXISTS` (C198).
- **B506 — a reserva do item não muda.** O material continua prometido à requisição — o caso "separei o errado" quer a
  promessa (P3: depois de devolver, a fila oferece SEPARAR de novo). Para dar baixa do quebrado **com** reserva, o
  almoxarife libera a reserva pelo gesto que já existe (`POST /reservas/:id/liberar`, `liberar_reserva_requisicao`,
  Etapa 77) e depois a `PERDA` passa (P3). A resposta e a tela **dizem** isso (C194). **Descartados:** (i) **liberar a
  reserva junto** — o "separei o errado" perderia a prioridade; (ii) **opção `liberar_reserva` no body** — dois gestos
  num, com as regras da 77 (quem pede também libera) duplicadas.
- **B507 — a trilha numa tabela própria, append-only: `devolucoes_caixa_requisicao`** (molde
  `substituicoes_origem_requisicao`, Etapa 63), mais a auditoria `DEVOLUCAO_CAIXA` best-effort. O detalhe lista as
  devoluções (`devolucoes_caixa`, aditivo). **Descartado:** **rodada negativa em `separacoes_requisicao_almoxarifado`** —
  os leitores somam as rodadas (a tela, a divergência da 60), a barreira da 28 passaria a barrar quem devolveu (B505
  (ii) por efeito colateral) e o "quem separou" da fila mentiria.
- **B508 — o sufixo S da 97 ganha a terceira saída.** Texto novo (literal congelada abaixo, **S98**): *"(material perdido
  da caixa: devolva-o à prateleira na requisição e dê a baixa, entregue o que existe e encerre a requisição, ou peça ao
  administrador do almoxarifado para excluí-la)"*. Muda à vista nos dois testes da 97 que casam a literal (comentário
  *"mudado na Etapa 98"*). **Descartado:** deixar o S como está — a recusa continuaria mandando o almoxarife ao
  administrador quando ele mesmo resolve.
- **B509 — o C190: a entrega, a fila e o detalhe dizem o que o motor deixa sair; a recusa nomeia a retenção e a saída.**
  Regra do motor (s4c): com o disponível do material **sem a reserva do item** negativo e sem `permite_saldo_negativo`,
  **nada** dele sai pela entrega (nem o excedente, nem o consumo da reserva). Então: `entregavelPeloMotor` = 0 nesse
  caso, senão o de hoje — usado pela prévia da entrega (antes de qualquer baixa, literal **E190**), pela fila
  (`entregavel`; a etapa vira AGUARDANDO_SALDO) e pelo detalhe (`quantidade_entregavel`). A recusa nomeia as retenções
  > 0 do material e a saída medida (s4e a: liberar da reserva o que está retido, ou desbloquear) — **(corrigido na Fase
  2)** a saída depende da reserva do item: com reserva, a desta requisição; sem, a reserva de **outra** requisição do
  material (E190, duas formas). **Descartados:** (i)
  **só a literal na recusa do motor** — a fila continuaria dizendo ENTREGAR e o detalhe "3" (s4d); (ii) **a guarda do
  bloqueio avulso contar a caixa coberta** — a qualidade perde reter o reservado (a I-5 da 97 decidiu o contrário, com o
  GESTOR sem `liberar_reserva_requisicao`); (iii) **o motor consumir a reserva com o disponível negativo** — abriria a
  saída de material bloqueado; (iv) **"devolva à prateleira" na literal** — não resolve (s4e b).
- **B510 — série: nenhuma regra de inteiro na devolução.** A separação não planeja série (s4 S1); a série é escolhida na
  entrega, que já exige inteiro. A devolução de fração em material com série deixa uma caixa fracionária que a entrega
  recusa — e que **outra devolução** resolve. A fração aceita pela **separação** (s4b b) é pré-existente e fica declarada
  (C197). **Descartado:** exigir que a caixa resultante seja inteira — regra nova sobre um estado que a separação já
  produz; melhor fechar na porta que o produz (etapa própria).
- **B511 — a devolução recusa o que a separação ignora:** quantidade ≤ 0, não numérica ou item repetido no payload é 400
  com literal (a separação pula em silêncio — C197). É um gesto de **tirar** com motivo; quantidade errada não pode virar
  "200, nada aconteceu". **Descartado:** copiar o "pula em silêncio" da separação.

---

## Regras de negócio

Os testes levam o prefixo `[98 RN-xx]`; o manual cita pelo conteúdo. **"Caixa do item"** = `Q.qtd(max(0, separado −
entregue))` (entregue = `quantidade_entregue ?? quantidade_atendida`, a régua de `getEntregue`). **"Montagem"** = a da
Fase 0 (`montarCaixa`): S pede 4, aprova, entra 4, ALMOX separa 4.

- **RN-01 (devolver diminui a caixa e não move estoque)** — na montagem sem reserva, ALMOX devolve 2 com motivo → **200**;
  o item fica separado 2, entregue 0; físico, reservado, bloqueado, `estoque_saldo_almoxarifado` por endereço, séries e a
  contagem de `movimentacoes_almoxarifado` **idênticos**; caixa sem reserva do material 2. A quantidade é `Q.qtd` (0,3333333
  → 0,333333). Devolver a caixa inteira de dois itens numa chamada → os dois zeram.
- **RN-02 (as recusas, tudo ou nada)** — cada recusa é 400 com a literal congelada e **nada** muda (nenhum item, nenhuma
  linha de trilha, conferência intacta): motivo vazio/só espaços (D2); `itens` ausente/vazio (D3); quantidade ≤ 0, não
  numérica (D4); item de outra requisição (D5); item repetido (D6); quantidade acima da caixa — inclusive o já entregue
  (separou 4, entregou 3, devolver 2 → D7 com *"Na caixa: 1 (separado: 4, entregue: 3)"*); status fora de
  `STATUS_COM_CAIXA` (*Entregue*, *Encerrada*, *Cancelado*, *Pendente* → D1); requisição excluída (`ativo = 0`) ou
  inexistente → 404 D0. Dois itens, o segundo acima da caixa → 400 D7 e o **primeiro também intacto**. **Ordem das
  recusas por entrada (corrigido na Fase 2):** D2, D3, depois por entrada D5 → D6 → D4 (D4 vale **depois** de `Q.qtd`;
  D5 também para `item_id` não numérico), e só com todas válidas D7.
- **RN-02b (o 409 no meio do laço — Fase 2, importante 3)** — legado com **dois** itens com caixa num status pré-separação
  cancelável pelos outros módulos (escritor de legado, como a 97); gancho depois do **primeiro** claim cancela a requisição
  pela rota dos outros módulos (`PUT /api/requisicoes-material/:id/cancelar`, fora da trava por requisição) → a devolução
  responde **409 D409**; o item 1 fica devolvido **com** a linha de `devolucoes_caixa_requisicao` e a auditoria; o item 2
  intacto (separado e trilha).
- **RN-03 (o status)** — *Em Separação* com resto na caixa: fica. *Em Separação* esvaziada sem entrega: fica (*vazia*;
  fila SEPARAR; separar 4 de novo → 200). *Pronta para Retirada*: devolver 1 → **200** e o status vira *Em Separação*
  (devolver tudo também); entregar o resto → 200. *Parcialmente Atendida*: fica; encerrar → 200. Legado pré-separação
  com caixa (`separacaoAReabrir`) e *Aguardando Aprovação de Valor* com caixa: devolver → 200, status igual. Depois de
  esvaziar a *Em Separação* com o limite de valor abaixo do custo, separar de novo → **403** V403b (a alçada vale de novo
  — B462 da 94).
- **RN-04 (a conferência)** — crítico separado por ALMOX, conferido por ALMOX2; ALMOX2 devolve 1 → 200 e
  `conferido_por_id` NULL; entregar 3 → 400 literal C3 da 28; ALMOX (separou) confere → 403; ALMOX2 (devolveu) confere →
  **200**; entregar 3 → 200. Em *Parcialmente Atendida* com crítico na caixa: devolver limpa a conferência e a fila
  **inclui** REABRIR_SEPARACAO (`etapas.includes('REABRIR_SEPARACAO')` — a fila traz também SEPARAR, medido; corrigido
  na Fase 2). **A saída (Fase 2, bloqueante 1):** `PUT /separar` com `itens_separados: []` → *Em Separação* (sem rodada)
  → ALMOX2 confere → 200 → entrega 1 → 200 (sonda `e98rv-a.js` A); na tela, o botão novo da T4 *"Separar de novo para
  conferir"*. A auditoria leva a conferência apagada em `dados_anteriores` (molde da rodada).
- **RN-05 (a reserva não muda)** — montagem **com** reserva (4): devolver 4 → 200; reserva ativa continua 4; caixa sem
  reserva 0; a resposta traz `reserva_do_item: 4` por item; `PERDA` 4 → 400 *"Saldo insuficiente. Disponível: 0 PC"*;
  ALMOX libera a reserva → `PERDA` 4 → **201**; fila oferecia SEPARAR antes da liberação.
- **RN-06 (origem e lote planejados)** — separou 4 de LA (com lote L): devolver 2 → origem LA e lote L continuam; devolver
  os outros 2 → os dois **nulos**; a entrega seguinte (depois de separar de novo de LB) sai de LB sem registrar troca.
- **RN-07 (a trilha)** — cada item devolvido grava uma linha em `devolucoes_caixa_requisicao` (quantidade, separado antes
  e depois, entregue, a origem/lote planejados **antes**, motivo trimado ≤ 500, status antes e depois, se limpou a
  conferência, usuário); uma linha de `auditoria` `DEVOLUCAO_CAIXA` por chamada; o detalhe `GET /requisicoes/:id` devolve
  `devolucoes_caixa` em ordem. Falha da auditoria **não** desfaz (best-effort, Etapa 19); a tabela **é** a trilha (escrita
  antes da resposta, sem `catch` que engula).
- **RN-08 (autorização)** — pela rota: ALMOX e ADMIN (perfil ADMINISTRADOR e superadmin) → 200; S (sem perfil →
  `PRODUCAO`), GESTOR, QUALIDADE, COMPRAS, ENGENHARIA, CONSULTA → 403 *"Sem permissão para esta operação"* com
  `acao: 'separar_emitir'`; o 403 sai **antes** de ler a requisição (nada muda). `GET /almoxarifado/minhas-permissoes`
  não muda (nenhuma ação nova).
- **RN-09 (o caso legítimo, sem o administrador)** — s2 Q1/Q3/Q4/Q5 refeitos com o gesto, **só com ALMOX**: devolver o
  quebrado → `PERDA` → 201, e a requisição continua viva (não encerrada, não excluída) com o pendente; *Pronta* tudo
  perdido → devolver 4 → *Em Separação* vazia → `PERDA` 4 → 201. Legado da A48 (caixa 4, físico 0): devolver 4 → a A48
  esvazia.
- **RN-10 (as travas)** — a devolução roda sob `serializarNaRequisicao` → `comTravaDaRequisicao` (ordem requisição →
  material): (a) ~~com a entrega da mesma requisição parada por gancho~~ **(corrigido na Fase 2: a entrega também segura a
  trava por material, então o controle não sabia falhar)** com o **liberar para retirada** da mesma requisição (só a trava
  por requisição, `routes/almoxarifado.js:~3852`) parado por gancho **depois de contar os separados** (`:~3876`), a
  devolução de 4 **espera**; o liberar grava *Pronta*; a devolução lê *Pronta*, devolve → 200 `status: 'EM_SEPARACAO'` —
  **nunca** *Pronta para Retirada* com caixa 0 (a corrida real: o liberar contou, a devolução esvaziou, o liberar gravou
  *Pronta* vazia — a guarda dele é a marca de rodada, e a devolução não grava rodada); (b) com a trava do material presa, a `PERDA` avulsa espera a
  devolução e passa depois (a caixa caiu); (c) a separação de **outra** requisição do mesmo material espera a devolução e,
  depois, separa o que a devolução soltou (teto da 95). Cada caso 0/10 rodadas com estado errado.
- **RN-11 (o sufixo)** — a montagem e uma `SAIDA` avulsa de 4 → 400 M1 + **S98** (literal inteira); sem caixa, a recusa
  byte a byte a de hoje (RN-04 da 97).
- **RN-12 (o C190)** — reserva 4 cobre a caixa 4; ADMIN bloqueia 1: a fila não mostra ENTREGAR (AGUARDANDO_SALDO,
  `entregavel` 0); o detalhe `quantidade_entregavel` 0; entregar 1 → 400 **E190** (literal inteira, *antes* de qualquer
  baixa — nenhuma movimentação, nada consumido da reserva); ALMOX libera 1 da reserva → entregar 3 → 200. Bloqueio 4 →
  E190 com *"4 PC bloqueados"*. Sem bloqueio → a entrega de hoje (byte a byte). Com `permite_saldo_negativo` → o de hoje
  (o motor passa). A A49 acha a requisição antes da liberação e não acha depois. **Sem reserva no item (Fase 2,
  bloqueante 2):** físico 6; R2 aprovada sem saldo separa 2 (sem reserva); R1 pede 4 e a aprovação reserva 4; ADMIN
  bloqueia 3 → 200; R2: fila AGUARDANDO_SALDO, detalhe `quantidade_entregavel` **0** (hoje −1), entregar 1 → 400 **E190
  na forma sem reserva**; ALMOX libera a reserva de R1 → R2 entrega 2 → 200; a A49 acha R2 antes e não acha depois.

---

## Contrato (congelado)

### `PUT /api/almoxarifado/requisicoes/:id/devolver-separado` (T1)

- **Gate:** `requirePermission('separar_emitir')` (o mesmo `requireSepararEmitir` da rota de separar). Rota registrada
  junto das de separação em `routes/almoxarifado.js`.
- **Body:** `{ motivo: string, itens: [{ item_id: number, quantidade: number }] }`.
- **Serviço:** `requisitionService.devolverSeparado(db, requisicaoId, { motivo, itens }, user)` =
  `serializarNaRequisicao(id, () => comTravaDaRequisicao(db, id, () => devolverSemTrava(...)))`. Exportado; a rota só
  chama o serviço (`.then(res.json)`, `.catch(e.status || 500, { error })`).
- **Ordem, dentro das travas:** (1) `user.id` (D-1); (2) lê a requisição ativa (D0) e o status em `STATUS_COM_CAIXA` (D1);
  (3) motivo (D2), itens (D3), por entrada D5 → D6 → D4 (D4 depois de `Q.qtd`; D5 também para `item_id` não numérico),
  e por fim as quantidades contra a caixa de cada item (D7) — **todas** antes da primeira escrita (ordem corrigida na Fase 2);
  (4) por item, o claim `UPDATE itens_requisicao_almoxarifado SET quantidade_separada = Q.qtdSql('quantidade_separada - ?')
  WHERE id = ? AND requisicao_id = ? AND Q.qtd(separado − entregue) >= ? − folga AND EXISTS (requisição ativa em
  STATUS_COM_CAIXA)`; sem linha → **(corrigido na Fase 2)** sai do laço, roda (5)–(9) **para os itens já escritos** ((6)
  é compare-and-set: só age se ainda *Pronta*) e **só então** lança o 409 D409 (molde da B444: a trilha antes do 409) —
  antes o texto prometia a trilha dos anteriores mas a ordem (8) depois do laço a perdia (RN-02b); (5) origem/lote
  nulos no item cuja caixa zerou; (6) `PRONTA_PARA_RETIRADA → EM_SEPARACAO` por compare-and-set (`WHERE id=? AND
  status='PRONTA_PARA_RETIRADA'`); (7) compare-and-clear da conferência (3 tentativas, molde `:1077`; sem conferência,
  nada); (8) as linhas de `devolucoes_caixa_requisicao`; (9) auditoria best-effort.
- **200:**
  ```json
  { "success": true, "status": "EM_SEPARACAO", "conferencia_limpa": true,
    "devolucoes": [{ "item_id": 1, "material_id": 7, "quantidade": 2, "separado_antes": 4, "separado_depois": 2,
                     "caixa_depois": 2, "reserva_do_item": 0 }] }
  ```
- **Recusas (literais congeladas; ⟨q⟩, ⟨c⟩, ⟨s⟩, ⟨e⟩ em `Q.qtd`):**
  - **403** (gate): `Sem permissão para esta operação` (corpo de `requirePermission`, com `acao` e `perfil`).
  - **D-1** 400: `Devolução à prateleira exige usuário identificado`
  - **D0** 404: `Requisição não encontrada`
  - **D1** 400: `Só é possível devolver à prateleira o que está separado numa requisição em andamento (status atual: ⟨STATUS⟩)`
  - **D2** 400: `Informe o motivo da devolução à prateleira`
  - **D3** 400: `Informe ao menos um item para devolver à prateleira`
  - **D4** 400: `⟨material_nome⟩: informe uma quantidade maior que zero para devolver à prateleira`
  - **D5** 400: `Item ⟨item_id⟩ não pertence a esta requisição`
  - **D6** 400: `Item ⟨item_id⟩ repetido na devolução`
  - **D7** 400: `⟨material_nome⟩: não é possível devolver ⟨q⟩ ⟨un⟩ à prateleira. Na caixa: ⟨c⟩ (separado: ⟨s⟩, entregue: ⟨e⟩)`
  - **D409** 409: `A caixa desta requisição mudou enquanto a devolução era registrada; recarregue e confira antes de devolver de novo.`

### A tabela — `devolucoes_caixa_requisicao` (T0)

```sql
CREATE TABLE IF NOT EXISTS devolucoes_caixa_requisicao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requisicao_id INTEGER NOT NULL, item_id INTEGER NOT NULL, material_id INTEGER NOT NULL,
  quantidade REAL NOT NULL, separado_antes REAL NOT NULL, separado_depois REAL NOT NULL, entregue REAL NOT NULL DEFAULT 0,
  localizacao_planejada_id INTEGER, lote_planejado_id INTEGER,
  motivo TEXT NOT NULL, status_antes TEXT, status_depois TEXT, conferencia_limpa INTEGER NOT NULL DEFAULT 0,
  usuario_id INTEGER NOT NULL, usuario_nome TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_devolucoes_caixa_req ON devolucoes_caixa_requisicao(requisicao_id);
```

Em `schema.js`, logo depois de `substituicoes_origem_requisicao`. Append-only: nenhum `UPDATE`/`DELETE` no código.
`requisitionService.listarDevolucoesCaixa(db, requisicaoId)` (com `material_codigo`, os códigos de localização/lote
planejados) e o detalhe devolve `devolucoes_caixa` (aditivo — nenhum campo existente muda). **A linha, congelada (Fase 2,
importante 7)** — em ordem de `id`: `{ id, item_id, material_id, material_codigo, quantidade, separado_antes,
separado_depois, entregue, localizacao_planejada_codigo, lote_planejado_codigo, motivo, status_antes, status_depois,
conferencia_limpa, usuario_id, usuario_nome, created_at }` (`conferencia_limpa` booleano; quantidades em `Q.qtd`).

### A máquina (T0)

`PRONTA_PARA_RETIRADA: ['PARCIALMENTE_ATENDIDA', 'ENTREGUE', 'EM_SEPARACAO']` — comentário "Etapa 98 (B504)". Nenhuma
outra seta. `STATUS_COM_CAIXA`, `PODE_SEPARAR`, `PODE_ENTREGAR` não mudam.

### O sufixo — `caixaSql.sufixoCaixa` (T2)

- **S98:** `` — ⟨c⟩ ⟨un⟩ estão separados para ⟨…⟩ e só saem pela entrega (material perdido da caixa: devolva-o à
  prateleira na requisição e dê a baixa, entregue o que existe e encerre a requisição, ou peça ao administrador do
  almoxarifado para excluí-la)`` — o resto da função igual (corte em três, *"e mais N"*, `''` sem caixa).

### O C190 (T3)

- **Helper puro** em `requisitionService`: `entregavelPeloMotor(disponivelDoMaterial, reservaDoItem, permiteNegativo)` →
  `permiteNegativo ? disp + r : (disp < −folga ? 0 : disp + r)`; `disponivelDoMaterial` = o disponível do motor **sem** a
  reserva do item (`saldoDisponivelParaItem.disponivel − reservado_para_item`; na fila `saldo_disponivel −
  reservado_para_item`; no detalhe `estoque − reservaItem`). O resultado entra onde hoje entra o `estoque` de
  `maxEntregar` (prévia e laço da entrega, `normalizarItem`) e o `saldo_disponivel` do `entregavel` da fila.
  **(Fase 2, menores)** No detalhe, `entregavelPeloMotor` substitui **só o argumento** `estoque` de
  `maxEntregar(item, estoque, teto)` (`requisitionService.js:~101`) — `teto` (separável) e `saldo_atual` ficam
  intactos. E a T3 **não** monta a subtração do disponível à mão (`quantidade_atual − reservada − …`): usa o disponível
  que as consultas já trazem pelo `disponivelSql` (o `saldoEmTerceiros.api.test.js` varre o código-fonte e cai). As consultas
  passam a trazer `ma.permite_saldo_negativo` e as retenções (`quantidade_bloqueada`, `quantidade_em_inspecao`,
  `quantidade_em_terceiros`).
- **E190** (prévia da entrega, quando o disponível do material é negativo e o pedido > 0): a literal de hoje (`⟨material⟩:
  não é possível entregar ⟨q⟩ ⟨un⟩. Máximo: 0 (pendente: ⟨p⟩, disponível: 0)`) + o sufixo `` — o disponível de
  ⟨material⟩ está negativo (⟨partes⟩): nada dele sai pela entrega até liberar da reserva desta requisição o que está
  retido, ou desbloquear`` (**com reserva do item > 0**) — ⟨partes⟩ = as retenções > 0 na ordem *"⟨b⟩ ⟨un⟩ bloqueados"*, *"⟨i⟩ ⟨un⟩ em inspeção"*,
  *"⟨t⟩ ⟨un⟩ em terceiros"*, separadas por vírgula; sem retenção > 0 (reserva maior que o físico, legado) ⟨partes⟩ =
  *"reservado além do físico"* e o fim *"…até liberar da reserva desta requisição o que passa do físico"*. Sem o disponível
  negativo: byte a byte a literal de hoje.
- **E190, forma sem reserva no item (corrigido na Fase 2, bloqueante 2)** — com `reserva do item` = 0 o fim manda a um
  gesto que existe: `` — o disponível de ⟨material⟩ está negativo (⟨partes⟩): nada dele sai pela entrega até liberar
  reserva deste material (de outra requisição) ou desbloquear``; sem retenção > 0, ⟨partes⟩ = *"reservado além do
  físico"* e o fim ``…até liberar reserva deste material (de outra requisição)``. Sem esta forma, o almoxarife de R2
  (sonda `e98rv-a.js` B) era mandado liberar "a reserva desta requisição", que não existe.
- O motor **não muda** (o claim `:1830` continua a regra; a 98 só faz a prévia, a fila e o detalhe dizerem a mesma coisa).

### O que não muda

O motor (`stockService`), `disponivelSql`, `livreDeCaixaSql`, `tetoSeparacao`, a separação, a aprovação, a reserva na
chegada, a liberação de reserva, a exclusão, o cancelamento, o encerramento, o claim da conferência (28), `ACAO_PERFIS`.

---

## Técnica dos testes

Arquivos novos `server/tests/api/devolverSeparado.api.test.js` (T1), `server/tests/api/entregaDisponivelNegativo.api.test.js`
(T3) e `devolverSeparadoIntegracao.api.test.js` (T5), runner próprio (molde 95–97), `testApp` com `requirePermission` real
e usuário por requisição (middleware `setUser`, molde `e95-h.js` — `x-u`). Montagem **pela rota** (S cria, ADMIN aprova,
`ENTRADA`, ALMOX separa, ALMOX2 confere) — nunca escrevendo `quantidade_separada` à mão, salvo o legado da A48
(`UPDATE materiais_almoxarifado SET quantidade_atual = 0`, escritor de legado, como a 97). O gancho da RN-10 (a) é o molde
da s4b da 97: `db.run` embrulhado até a escrita do item pela entrega, restaurado no `finally`. Cada recusa confere **status,
literal inteira e estado intacto** (item, conferência, trilha, material, livro).

---

## Tasks

**Ordem topológica: T0 → T1 → (T2, T3 serial na mesma árvore; T4 em paralelo) → T5 → T6.** T0 e T1 são **tronco** (T0:
migração e máquina; T1: o gesto, que T2–T5 consomem). T2 e T3 são **galhos de backend** que só consomem — rodam **serial na
mesma árvore** depois da T1 (as duas sabotam `requisitionService`/`caixaSql`, lidos pela suíte inteira — memória
"sabotagem concorrente contamina a suíte"; e são pequenas demais para pagar uma worktree). T4 é **galho de cliente** contra
o contrato congelado (mock só na fronteira HTTP) — pode rodar em paralelo com T2/T3 numa worktree (junction de
`node_modules`, memória). T5 é a integração (cruza T1, T2, T3 pela rota **e** pelo serviço). T6 fecha.

- [ ] **T0 (tronco) — a tabela e a seta (B504, B507).** Contrato "A tabela" e "A máquina". Testes `[98 RN-00]`: a tabela
  existe com as colunas (`PRAGMA table_info`) e o índice; `validarTransicao('PRONTA_PARA_RETIRADA','EM_SEPARACAO').ok`;
  as setas de *Pronta* para *Parcialmente Atendida*/*Entregue* continuam; `liberar-retirada` de *Em Separação* continua
  200 e de *Pronta* continua 400 (*"Transição inválida: PRONTA_PARA_RETIRADA → PRONTA_PARA_RETIRADA"*). **Prova de primeiro
  boot** (memória): `CRM_DATA_DIR` numa pasta vazia + `node index.js` sobe e cria a tabela. **Vermelho antes:** a tabela e
  a seta. **Controles:** (s1) sem o `CREATE` → cai "a tabela existe"; (s2) sem a seta → cai `validarTransicao`. **Medir
  sem edição:** `test:api` inteiro (os testes que leem `TRANSICOES` — `alcadaValorDepoisDaSeparacao` `:340`, `:484`;
  cliente `RequisicoesReabrirSeparacao` (e), `ReservasAlmoxarifado` `:363` — iteram as chaves, não as setas de *Pronta*).
- [ ] **T1 (tronco) — o gesto: serviço e rota (B502, B503, B505, B506, B511).** Contrato da rota, D-1…D409. **(Fase 2)**
  Acrescenta `{ rotulo: 'Devolução à prateleira', verbos: ['DEVOLUCAO_CAIXA'] }` em `services/almoxarifado/auditLabels.js`
  (~:156, junto dos verbos da Etapa 28) — sem ele cai `auditLabels.api.test.js` (`:216-237`, "TODO verbo gravavel tem
  rotulo"). **RN-02b** pela rota.
  **RN-01, RN-02, RN-03, RN-04, RN-05, RN-06, RN-07** pela rota **e** RN-01/RN-02 pelo serviço; **RN-08**; **RN-10** (a), (b),
  (c) pelo serviço. **Vermelho antes:** todos (a rota e o serviço não existem — 404 do Express / `TypeError`). **Controles:**
  (s1) o claim sem `separado − entregue >= q` → cai RN-02 "acima da caixa, inclusive o já entregue" (o separado fica
  menor que o entregue); (s2) sem a seta/compare-and-set da *Pronta* → cai RN-03 *Pronta*; (s3) sem o compare-and-clear →
  cai RN-04 "entregar 3 → 400"; (s4) validar item a item **dentro** do laço de escrita → cai RN-02 "o primeiro também
  intacto"; (s5) sem `serializarNaRequisicao` → cai RN-10 (a) (**corrigido na Fase 2:** gancho no **liberar para
  retirada**, que só segura a trava por requisição — com a entrega o controle não sabia falhar, porque ela segura também a
  trava por material); (s5b, Fase 2) o 409 lançado no claim **antes** de (5)–(9) → cai RN-02b "item 1 com trilha"; (s6) sem
  `comTravaDaRequisicao` → cai RN-10 (c); (s7) origem nula sempre → cai RN-06 "parcial mantém LA"; (s8) gate
  removido → cai RN-08 "S → 403" (trocar por `movimentar` **não** serve de controle: `movimentar` tem os mesmos dois perfis,
  `permissions.js:25` — o teste passaria com o gate trocado; medido na Fase 1). **Guardas (passam antes, provam que nada vizinho muda):** a
  separação, a entrega e a conferência da 28 (`test:api` inteiro antes e depois).
- [ ] **T2 (galho, serial) — o sufixo S98 (B508).** Contrato "O sufixo". **RN-11.** **Vermelho antes:** RN-11 (a literal
  nova). **Edição declarada:** `portasAvulsasCaixa.api.test.js` e `portasAvulsasCaixaIntegracao.api.test.js` — a
  constante da literal S passa a S98 (comentário *"mudado na Etapa 98 (B508)"*); nenhuma outra asserção muda.
  **Controles:** (s1) a função de antes → cai RN-11 e os dois testes editados; (s2) S98 sempre (sem o `''` sem caixa) → cai
  "byte a byte sem caixa" (RN-04 da 97).
- [ ] **T3 (galho, serial) — o C190 (B509) e a A49.** Contrato "O C190", E190. **RN-12**, com a A49 rodada pelo teste com o
  texto do plano (como a A48 na 97). **Vermelho antes:** a fila (ENTREGAR), o detalhe (3), a literal E190 (hoje a recusa
  é a do motor). **Guardas:** sem bloqueio a entrega byte a byte; `permite_saldo_negativo` com bloqueio passa como hoje.
  **Controles:** (s1) `entregavelPeloMotor` devolvendo `disp + r` sempre → cai a fila/detalhe e a E190 (volta a recusa
  do motor); (s2) só a prévia trocada (fila e detalhe como hoje) → cai "fila não mostra ENTREGAR"; (s3) ignorando
  `permiteNegativo` → cai a guarda da flag; (s4) a E190 sem ⟨partes⟩ → cai a literal inteira. **Medir sem edição:**
  `filaSeparacao*`, `separacaoTetoFisico*`, `quantidadeArredondada*`, `entregaSerie*` — se algum montar disponível
  negativo e esperar a recusa do motor, registrar e ajustar só a literal (nunca a regra).
- [ ] **T4 (galho, cliente — paralelo com T2/T3) — a tela.** No detalhe da requisição em modo almoxarifado, na linha do item
  com caixa > 0 e status em `STATUS_COM_CAIXA` (lista importada de `requisicaoLabels.js`, conferida contra o servidor por
  teste — molde RN-07 da 92; **corrigido na Fase 2:** o teste de paridade é do **servidor**,
  `server/tests/api/devolverListaTelaRota.api.test.js` no molde de `cancelarListaTelaRota.api.test.js` — lê o arquivo do
  cliente, extrai `export const STATUS_COM_CAIXA` de `requisicaoLabels.js`, compara **como conjunto** com o do
  `requisitionStateMachine` e confere 9 status): botão **"Devolver à prateleira"** (`bloquearSeNaoPode('separar_emitir', e)` antes de abrir).
  Modal **"Devolver à prateleira — ⟨material⟩"**: *"Na caixa: ⟨c⟩ ⟨un⟩"*; campo **Quantidade** (padrão = a caixa, máx. a
  caixa, `step="any"`); campo **Motivo (obrigatório)**; texto fixo *"O material volta para a prateleira de onde foi
  separado — não há movimentação de estoque. Se quebrou ou se perdeu, dê a baixa (Perda) depois."*; com
  `quantidade_reservada_item > 0` acrescenta *"Este item continua reservado para a requisição: para dar baixa, libere a
  reserva antes."*; com *Pronta para Retirada*, *"A requisição volta para Em Separação."*; com conferência gravada, *"A
  segunda conferência será refeita."* Botão **Devolver** desabilitado sem motivo ou com quantidade fora de (0, caixa].
  Sucesso: toast *"Devolvido à prateleira"* e recarrega o detalhe; erro: o `error` do servidor no toast. Bloco
  **"Devolvido à prateleira"** no histórico do detalhe (lê `devolucoes_caixa`: data, usuário, material, quantidade, motivo).
  O *title* do "Ajustar Separação" passa a *"Separa mais quantidade — para tirar da caixa, use Devolver à prateleira no
  item"* (o **rótulo** não muda: três testes o clicam). **(Fase 2, bloqueante 1)** Em *Parcialmente Atendida* com
  `conferencia_obrigatoria && !conferencia`, botão **"Separar de novo para conferir"** (`bloquearSeNaoPode('separar_emitir',
  e)`) que chama `PUT /almoxarifado/requisicoes/:id/separar` com `{ itens_separados: [] }` e recarrega o detalhe (vira
  *Em Separação*, onde o "Conferir separação" já existe) — hoje a tela de *Parcialmente Atendida* só tem "Completar
  Entrega" (cai no C3) e "Encerrar"; teste jest próprio (aparece só nessa condição; o PUT leva `itens_separados: []`). Testes jest (`RequisicoesDevolverPrateleira.test.js`) com mock na
  fronteira HTTP: o botão aparece/não aparece por status e caixa; o PUT leva o body do contrato; os três avisos
  condicionais; o 400 do servidor vira toast; o histórico renderiza. **Controles:** (s1) sem o filtro de caixa > 0 → cai
  "não aparece sem caixa"; (s2) sem o motivo obrigatório → cai "Devolver desabilitado"; (s3) a lista de status local
  diferente da do servidor → cai o teste de paridade. `CI=true` build.
- [ ] **T5 (tronco, integração) — o documento até o último gesto, pela rota e pelo serviço.** **C1 pela rota:** S pede 4;
  aprova; entra 4; ALMOX separa 4; ALMOX libera para retirada; `PERDA` 2 → 400 **S98**; ALMOX devolve 2 (motivo
  "quebrou") → *Em Separação*; `PERDA` 2 → 201; ALMOX entrega 2 → *Parcialmente Atendida*; nova `ENTRADA` 2; ALMOX separa
  2; ALMOX entrega 2 → *Entregue*; a trilha tem 1 devolução, o livro 1 `PERDA` e 2 `SAIDA`; a A48 vazia em
  cada passo. **C2 crítico pela rota:** separa (ALMOX), confere (ALMOX2), ALMOX2 devolve 1 → conferência limpa → entrega
  400 C3 → ALMOX2 confere → entrega 3 → 200. **C2b (Fase 2, bloqueante 1) crítico em *Parcialmente Atendida* pela
  rota:** separa 4, ALMOX2 confere, entrega 2, devolve 1 → fila inclui REABRIR_SEPARACAO, entrega 1 → 400 C3; `PUT
  /separar` com `[]` → *Em Separação*; ALMOX2 confere → 200; entrega 1 → 200. **C3 com reserva pela rota:** devolve 4 → `PERDA` 400 → ALMOX libera a reserva
  → `PERDA` 201 → a requisição *Em Separação* vazia na fila (AGUARDANDO_SALDO). **C4 o C190 pela rota:** reserva 4 cobre a
  caixa; bloqueia 1; fila AGUARDANDO_SALDO; entrega 400 E190; libera 1 da reserva; entrega 3 → 200; a A49 acha antes e
  não acha depois. **C5 pelo serviço** (`requisitionService.devolverSeparado` e `entregarRequisicao` direto, sem `app`):
  a RN-10 (a) com gancho **no liberar para retirada** 0/10 (corrigido na Fase 2) e ~~a devolução dentro de uma seção que
  já segura o material **não** espera a si mesma~~ **(corrigido na Fase 2: impossível — `comLockDosMateriais` não é
  reentrante, nenhum chamador entra nela de dentro de uma seção)** um espião prova que a devolução pega
  `travaPorMaterial.comLockDoMaterial` **uma vez por material** e **não** chama `registrarMovimentacao` (não move estoque). **Controles:** (s1) desfazer a seta (T0) → cai C1 no passo *Pronta*; (s2) desfazer o
  compare-and-clear (T1) → cai C2; (s3) desfazer T3 → cai C4 (fila); (s4) desfazer T2 → cai C1 no primeiro `PERDA`
  (literal). Cada asserção de recusa com a literal **inteira**.
- [ ] **T6 — fechamento (skill `fechar-etapa`).** Novidades (B502–B511, C193–C198, A49; B497 e C189 anotados como
  resolvidos; C190 **corrigido à vista** — "prende em *Máximo: 0* sem nomear" estava incompleto: com bloqueio parcial a
  prévia anunciava 3 e o motor recusava tudo; C188 e a leitura da A46/A48 ganham "ou devolva à prateleira"; **(Fase 2)**
  o **C174** marcado resolvido e o *"não há gesto de devolver da caixa"* da spec 05 (`:559-561`) corrigido **dizendo que
  a spec estava desatualizada**; a barreira "quem separou não confere" anotada junto da C198 e no guia), specs **05**
  (o gesto; a seta; a conferência), **04** (o status *Pronta* → *Em Separação*; o detalhe com `devolucoes_caixa`),
  **07** (a reserva não muda na devolução; o C190 e a liberação como saída), **09** (o C190 visto da qualidade), **23**
  (a ação `separar_emitir` cobre a devolução), o mapa; guia do usuário (Antes → Agora: *"quebrou na caixa? só o
  administrador soltava, excluindo a requisição"* → *"o almoxarife devolve à prateleira e dá a baixa"*; roteiro clicável:
  separar → devolver 2 com motivo → Perda 2 → entregar o resto); manual do sistema (separação, entrega, perda, reserva);
  próxima tarefa detalhada. Os cinco comandos de teste, citados com o resultado real.

---

## Teste de integração — por que a T5 é a prova de que as partes compõem

Cada porta certa sozinha não prova o documento: a devolução muda a caixa que **quatro** leitores usam depois — a `PERDA`
(97), a entrega (95), a conferência (28) e a fila (64) — e o status que a liberação gravou. A T5 segue cada documento até
o último gesto (separar → liberar → tentar a baixa → **devolver** → baixar → entregar o resto → separar de novo →
entregar → *Entregue*) e cruza T0 (seta), T1 (gesto), T2 (literal que manda devolver) e T3 (entrega que diz a verdade).
A RN-10 depende de **fiação** (as duas travas compostas): só o cenário pela rota **e** pelo serviço prova que a devolução
espera o liberar para retirada (trava por requisição) e pega a trava de cada material uma vez (corrigido na Fase 2).

---

## Avisos (letra C) — a registrar no fechamento

- **C193** — devolver à prateleira **não move estoque**: o material volta, nos livros, para onde estava (a separação nunca o
  tirou). Se fisicamente ele foi guardado em outro endereço, faça a transferência (C3 da 97: a entrega guiada já
  existe).
- **C194** — com **reserva** no item, devolver não solta a baixa: a `PERDA` recusa *"Disponível: 0"* sem sufixo até a
  reserva ser liberada (P3). A tela avisa no modal (T4); a recusa da `PERDA` em si não muda.
- **C195** — a *Em Separação* vazia (por devolução ou pelo "Iniciar Separação" sem quantidade) **não** cancela por quem
  pediu — pré-existente (P2b); candidata a etapa (a seta `EM_SEPARACAO → CANCELADO` só sem nada separado nem entregue).
- **C196** — o C190 **estava incompleto** na 97: com bloqueio **parcial** sobre o reservado já separado a prévia, a fila e
  o detalhe anunciavam o resto (3) e o motor recusava **qualquer** quantidade (*"Saldo físico insuficiente para consumir a
  reserva. Disponível: -1 PC"*). A T3 fecha.
- **C197** — pré-existentes na separação, fora desta etapa: aceita quantidade **negativa** em silêncio (200, e, como
  "Iniciar Separação", reabre *Parcialmente Atendida* para *Em Separação* — s2 Q4) e aceita **fração** de material com
  série (s4b b), que a entrega depois recusa — a devolução da 98 é a saída desta.
- **C198** — quem devolve **pode** conferir a caixa (B505 (ii)); a barreira "quem separou não confere" continua por
  rodada de separação. **(Fase 2)** Consequência a registrar também no guia: numa equipe de **dois** almoxarifes em que
  **os dois** separaram rodadas da mesma requisição com crítico, **ninguém** confere (a barreira barra os dois) — o
  terceiro (outro almoxarife ou o administrador) confere. Pré-existente (28), não criada pela 98.

---

## O que fica de fora (declarado — e por quê)

- **Voltar ao status pré-separação** — B504 (i): setas e recálculos novos para um ganho que é lacuna pré-existente (C195).
- **Cancelar a *Em Separação* vazia** — C195, etapa própria.
- **Liberar a reserva no mesmo gesto** — B506; o gesto existe (77).
- **Série inteira na devolução; fração e negativo na separação** — B510, C197.
- **Ação de perfil própria** — B503 (i); reversível numa linha.
- **Mover estoque na devolução / escolher o endereço de volta** — C193; a transferência existe.
- **A recusa da `PERDA` com reserva nomear a reserva** — C194; a tela avisa antes, e mexer na M1 reabre a literal da 97.

---

## Letra A — consulta para produção (a confirmar no fechamento como **A49**)

**A49 — requisições com material na caixa que a entrega não consegue tirar (o C190).** Itens com caixa > 0 em *Em
Separação*, *Pronta para Retirada* ou *Parcialmente Atendida* cujo material (sem `permite_saldo_negativo`) tem o
disponível do motor negativo — hoje a fila mostra *Entregar* e a entrega recusa qualquer quantidade. Medida na s5 (acha
X, não acha Y nem Z; vazia depois da liberação). **(corrigido na Fase 2)** Também acha a caixa **sem** reserva no item
quando a reserva de outra requisição ocupa o físico (sonda `e98rv-a.js` B: R2 achada, disponível −1).

```sql
SELECT rq.numero, rq.status, ma.codigo,
       ROUND(COALESCE(ix.quantidade_separada,0) - COALESCE(ix.quantidade_entregue, ix.quantidade_atendida, 0), 6) AS na_caixa,
       ROUND(ma.quantidade_atual - COALESCE(ma.quantidade_reservada,0) - COALESCE(ma.quantidade_bloqueada,0)
             - COALESCE(ma.quantidade_em_inspecao,0) - COALESCE(ma.quantidade_em_terceiros,0), 6) AS disponivel_material,
       ROUND(COALESCE(ma.quantidade_bloqueada,0), 6) AS bloqueado
FROM itens_requisicao_almoxarifado ix
JOIN requisicoes_almoxarifado rq ON rq.id = ix.requisicao_id
JOIN materiais_almoxarifado ma ON ma.id = ix.material_id
WHERE COALESCE(rq.ativo, 1) = 1
  AND rq.status IN ('EM_SEPARACAO','PRONTA_PARA_RETIRADA','PARCIALMENTE_ATENDIDA')
  AND COALESCE(ix.quantidade_separada,0) - COALESCE(ix.quantidade_entregue, ix.quantidade_atendida, 0) > 0.000001
  AND COALESCE(ma.permite_saldo_negativo, 0) = 0
  AND ma.quantidade_atual - COALESCE(ma.quantidade_reservada,0) - COALESCE(ma.quantidade_bloqueada,0)
      - COALESCE(ma.quantidade_em_inspecao,0) - COALESCE(ma.quantidade_em_terceiros,0) < -0.000001
ORDER BY rq.numero, ma.codigo;
```

Saída por linha: liberar reserva **deste material** — da própria requisição se o item tiver reserva, senão de **outra**
requisição do material (corrigido na Fase 2) — (ALMOXARIFE/ADMINISTRADOR), ou desbloquear. A lista
de status é `PODE_ENTREGAR` (`requisitionStateMachine.js:99`) — mudou lá, muda aqui. Opcional: nada roda sozinho.

---

## O que contradiz a próxima tarefa escrita na 97

1. **"Status: … volta ao status anterior à separação (o mesmo recálculo da aprovação: reservada/aprovado)"** — decidido
   **não** (B504): a *Em Separação* esvaziada já é um estado que existe e funciona (s1 G, P2: separa de novo, a alçada
   vale, a fila mostra). O que a 97 **não** viu: a *Pronta para Retirada* esvaziada fica **presa** sem uma seta de volta
   (P4: separar, entregar e encerrar recusam e ela some da fila) — a seta necessária é `PRONTA → EM_SEPARACAO`, e só ela.
2. **"Depois disso … a `PERDA` do material quebrado passa sem o administrador"** — só **sem** reserva. Com a reserva do
   item cobrindo a caixa, a `PERDA` continua recusando (*"Disponível: 0 PC"*, sem sufixo) até a reserva ser liberada (P3,
   C194). O almoxarife resolve sozinho (ele tem `liberar_reserva_requisicao`), mas são dois gestos.
3. **"C190: depois do gesto, o material bloqueado na caixa sai da caixa; a recusa da entrega com bloqueio pode ganhar um
   sufixo"** — **devolver não resolve o C190** (s4e b: a reserva continua maior que o livre). E o C190 é **maior** do que
   a 97 escreveu (*"prende a entrega em Máximo: 0 sem nomear"*): com bloqueio **parcial** a prévia anuncia *"Máximo: 3"*,
   a fila mostra *Entregar* e o detalhe 3, e o motor recusa **qualquer** quantidade (s4c, s4d). A saída real é liberar da
   reserva o que está bloqueado, ou desbloquear (s4e a). Virou a T3 (B509), não um sufixo.
4. **"Série e lote: … devolver precisa soltar a série planejada?"** — não existe série planejada: a separação não toca
   série (s4 S1); a série é escolhida na entrega. Achado vizinho: a separação aceita fração de material com série (C197).
5. **"Literal de recusa: … requisição fora de *Em Separação* / *Pronta* / *Parcialmente Atendida*"** — a régua é
   `STATUS_COM_CAIXA`: inclui o legado pré-separação com caixa (B460 da 94) e *Aguardando Aprovação de Valor* com caixa
   (A45) — os dois têm caixa e as portas da 97 os protegem; sem a devolução neles, o legado continuaria só com o
   administrador.
6. **"`quantidade ≤ separado − entregue` … a origem planejada zera quando o *pendente* zera"** — é quando a **caixa** do
   item zera (separado − entregue); o "pendente" do item é solicitado − entregue (P7 mediu a regra certa).
7. **"body `{ itens: [{ item_id, quantidade, motivo }] }`"** — o motivo é **um por gesto** (`{ motivo, itens: [...] }`): a
   tela devolve um item por vez, e a trilha copia o motivo em cada linha. Reversível.
8. **Detalhe da Fase 0 da 97 (s1 da 97, "ADMIN aprova (*Aprovado*, reservas `[]`)")** — sem saldo a aprovação dá
   *Aguardando Estoque* (s1 A desta etapa); não muda nada da 97 (as portas recusam igual), só o rótulo do texto.

---

## Fase 2 — revisão do plano (2026-10-09): 2 bloqueantes, 5 importantes, 6 menores → plano revisto (vale sobre o texto acima)

Revisor fresco (plano + specs 04/05/07/09/23 + plano da 97), com sondas executadas no scratchpad: `e98rv-a.js` (harness
`e98-h.js`; protótipo do gesto como a s3, sem mexer no código). Cada achado foi conferido contra o código pelo fio
principal no HEAD `d1679eaa`: `client/src/components/almoxarifado/RequisicoesList.js` `:~930-942`
(`handleCompletarEntrega`), `:~1734-1760` (botões de *Em Separação*; "Conferir separação" só lá), `:~1824-1846`
(*Parcialmente Atendida*: só "Completar Entrega"/"Encerrar"); `requisitionService.js` `:793` e `:1191` (separar e
entregar: as duas travas), `:994-998` (a reivindicação da separação vazia → *Em Separação*), `:~101` (`maxEntregar`
no detalhe); `routes/almoxarifado.js` `:~3852` (liberar: **só** a trava por requisição) e `:~3876` (conta os
separados); `routes/requisicoesMaterial.js:359` (cancelar pelos outros módulos: sem trava, sem olhar a caixa);
`travaPorMaterial.js:166`; `auditLabels.js:~156`; `auditLabels.api.test.js:216-237`;
`cancelarListaTelaRota.api.test.js` (molde da paridade); `requisicaoLabels.js` (sem `STATUS_COM_CAIXA` hoje);
`requisitionStateMachine.js:109` (`STATUS_COM_CAIXA`, 9 status). Os pontos afetados acima estão marcados **"(corrigido
na Fase 2)"** ou **"(Fase 2, …)"**. Nenhuma letra nova; **E190** ganha a forma sem reserva.

Resultado da sonda (rodada de novo pelo fio principal): `e98rv-a: 2/4 ERRADO, 2 CERTO` — os dois ERRADO são do
**detector** (esperado escrito à mão a mais: a fila traz `["SEPARAR","REABRIR_SEPARACAO"]` e não só o segundo; o
bloqueio responde 200 e não 201); a medida sustenta os dois bloqueantes.

**Bloqueantes**

1. **B-1 — a conferência limpa em *Parcialmente Atendida* fica sem saída na tela (reproduzido, A).** Crítico separado
   por ALMOX, conferido por ALMOX2, entregue 2 → *Parcialmente Atendida*; devolver 1 limpa a conferência (B505); a fila
   inclui `REABRIR_SEPARACAO`; entrega 1 → 400 C3. A tela de *Parcialmente Atendida* só oferece "Completar Entrega" (que
   cai no C3) e "Encerrar"; "Conferir separação" só aparece em *Em Separação*. Pela API a saída existe: `PUT /separar`
   com `[]` → *Em Separação* → ALMOX2 confere 200 → entrega 1 200. **Escolhido (a):** a T4 ganha, em *Parcialmente
   Atendida* com `conferencia_obrigatoria && !conferencia`, o botão *"Separar de novo para conferir"* (`PUT /separar` com
   `itens_separados: []`); teste jest e o passo C2b na T5. **Descartado (b):** mudar o status na devolução (a
   *Parcialmente Atendida* devolvida viraria *Em Separação*) — mexe na B504 e faz o "Encerrar" sumir para quem só quer
   encerrar.
2. **B-2 — a E190 e a A49 mandam liberar a reserva "desta" requisição, mas o C190 existe sem reserva no item
   (reproduzido, B).** Físico 6; R2 aprovada sem saldo separa 2 (caixa sem reserva); R1 pede 4 e a aprovação reserva 4;
   ADMIN bloqueia 3 → 200 (a guarda da B496 não conta o reservado); R2: fila AGUARDANDO_SALDO, detalhe
   `quantidade_entregavel` **−1**, entrega 1 → 400 *"Máximo: -1 (pendente: 2, disponível: -1)"*; a A49 acha R2. A saída
   é liberar a reserva de **R1** (200) → R2 entrega 2 → 200 — R2 não tem reserva a liberar. **Escolhido:** o fim da E190
   ramifica pela reserva do item (com reserva > 0: o texto de antes; sem: *"…até liberar reserva deste material (de outra
   requisição) ou desbloquear"*, literal fixada no contrato); a A49 generalizada; cenário novo na RN-12; a linha C190-4
   da s4 corrigida **dizendo que estava incompleta**. O `entregavelPeloMotor` da T3 já leva o −1 do detalhe a 0.

**Importantes**

3. **I-1 — o 409 no meio do laço perdia a trilha e a limpeza.** O contrato prometia "os itens anteriores ficam devolvidos
   **com** a trilha", mas a ordem punha (5)–(9) depois do laço: o claim que falha no item 2 lançava com o item 1 já
   escrito, sem linha de `devolucoes_caixa_requisicao`, sem auditoria e sem limpar a conferência. **Escolhido:** no claim
   que falha, sair do laço, rodar (5)–(9) para os itens já escritos e só então lançar o D409 (molde da B444). O (6)
   entra junto porque é compare-and-set (só age se ainda *Pronta*) — o pedido do fio principal listava (5)(7)(8)(9); com
   o (6) a *Pronta* cuja caixa mudou não fica atestada (B504). **RN-02b** nova; controle (s5b).
4. **I-2 — o controle (s5) da T1 não sabia falhar.** A entrega segura também a trava por material
   (`comTravaDaRequisicao`), então tirar `serializarNaRequisicao` da devolução ainda a serializava com a entrega. **A
   corrida real:** o **liberar para retirada** segura só a trava por requisição; ele conta os separados (`:~3876`), a
   devolução esvazia, o liberar grava *Pronta* vazia (a guarda dele é a marca de **rodada**, e a devolução não grava
   rodada). **Escolhido:** RN-10 (a), (s5) e a C5 da T5 usam o liberar parado por gancho.
5. **I-3 — o segundo cenário da C5 era impossível.** "A devolução dentro de uma seção que já segura o material não espera
   a si mesma": `comLockDosMateriais` não é reentrante e nenhum chamador a chama de dentro de uma seção. **Escolhido:** um
   espião prova `comLockDoMaterial` uma vez por material e nenhum `registrarMovimentacao`.
6. **I-4 — o verbo novo sem rótulo derruba a suíte.** `auditLabels.api.test.js` (`:216-237`) exige rótulo para todo verbo
   gravável. **Escolhido:** a T1 acrescenta `{ rotulo: 'Devolução à prateleira', verbos: ['DEVOLUCAO_CAIXA'] }` em
   `auditLabels.js` (~:156).
7. **I-5 — a linha da trilha e a paridade não estavam congeladas.** **Escolhido:** a linha de `devolucoes_caixa` fica
   `{ id, item_id, material_id, material_codigo, quantidade, separado_antes, separado_depois, entregue,
   localizacao_planejada_codigo, lote_planejado_codigo, motivo, status_antes, status_depois, conferencia_limpa, usuario_id,
   usuario_nome, created_at }`; a paridade `STATUS_COM_CAIXA` é teste do **servidor** no molde de
   `cancelarListaTelaRota.api.test.js` (lê o arquivo do cliente; nome `STATUS_COM_CAIXA` em `requisicaoLabels.js`;
   compara como conjunto; 9 status). Descartado: teste jest com a lista do servidor copiada (o CRA não importa de fora de
   `src/` — seria a mesma lista escrita duas vezes).

**Menores**

1. Ordem das recusas: D2, D3, e por entrada D5 → D6 → D4 → (todas válidas) D7; D4 vale **depois** de `Q.qtd` (0,0000001
   arredonda a 0 → D4); D5 também para `item_id` não numérico.
2. RN-04 usa `includes('REABRIR_SEPARACAO')` — a fila traz também `SEPARAR` (medido).
3. Na T3, `entregavelPeloMotor` substitui **só** o argumento `estoque` de `maxEntregar` (`requisitionService.js:~101`);
   `teto` e `saldo_atual` intactos (o separável do detalhe não muda).
4. A T3 não monta a subtração do disponível à mão: o `saldoEmTerceiros.api.test.js` varre o código-fonte.
5. A T6 marca resolvidos o **C174** e o *"não há gesto de devolver da caixa"* da spec 05 (`:559-561`), dizendo que a spec
   estava desatualizada.
6. A barreira "quem separou não confere" com equipe de dois que separaram → ninguém confere: registrada junto da C198 e
   no guia (pré-existente, 28).

**Os pontos que o "Próximo passo" pediu:** (a) a seta `PRONTA → EM_SEPARACAO` — nenhum leitor achado que trate *Em
Separação* como "nunca liberada" além do que a T0 mede (`test:api` inteiro); (b) o compare-and-clear fora de *Em
Separação* — **criava** a CONFERENCIA_SEM_SAIDA na tela (B-1); (c) o `EXISTS` do status — vira o 409 da RN-02b (I-1);
(d) a E190 e o `maxEntregar` — menor 3 e B-2; (e) o espelho do cliente — I-5.

---

## Próximo passo

**Fase 2 feita (seção acima). Próximo: Fase 3 — T0, depois T1, conforme o plano revisto.** O texto abaixo é o pedido
que foi feito à Fase 2 (histórico).

Um agente **fresco** (sem este contexto) com este plano, as specs 04, 05, 07, 09 e 23, o plano da 97 (régua, sufixo, trava
no motor) e as quatro perguntas da skill: (1) os contratos cobrem os casos de erro com literal? (2) as RN batem com as
specs? (3) T2/T3/T4 são independentes de verdade (T2 e T3 mexem no mesmo `requisitionService`? T3 lê a fila que a T1 não
toca?) (4) **cada RN traçada até o último gesto** — separar → liberar → devolver → baixar → entregar → encerrar; separar →
conferir → devolver → conferir → entregar; aprovar com reserva → separar → devolver → liberar reserva → baixar → separar de
novo; separar → bloquear → (fila) → entregar → liberar reserva → entregar. Pontos que a Fase 2 deve atacar em especial:
(a) **a seta `PRONTA → EM_SEPARACAO`** — algum leitor trata *Em Separação* como "nunca liberada" (o lembrete
`ultimo_lembrete_enviado`, a reserva na chegada, o painel, a alçada)? (b) **o compare-and-clear fora de *Em Separação***
— a conferência limpa em *Parcialmente Atendida* tem saída (a fila REABRIR_SEPARACAO e o "Iniciar Separação") ou cria
uma CONFERENCIA_SEM_SAIDA nova? (c) **o claim com `EXISTS` do status** — a corrida devolução × aprovação por valor
(que muda status **fora** da trava por requisição, 93 Fase 5) — o `EXISTS` recusa quando deveria? (d) **a E190 e o
`maxEntregar` da 95** — a segunda rodada (`alemDaCaixa`) com o disponível negativo; o `quantidade_separavel` do detalhe
não muda (só o entregável)? (e) **o cliente** — `requisicaoLabels.js` **não** exporta lista com caixa (lido: só `STATUS_CANCELAVEIS_*` e
`STATUS_PRE_SEPARACAO`); a T4 cria o espelho de `STATUS_COM_CAIXA` com teste de paridade — o espelho está certo? Corrigir o plano, **depois** executar T0.
