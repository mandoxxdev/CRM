# Etapa 135 (spec 05 + núcleo): o entregável de irmãos (D (127)) e três pequenas do cadastro de usuários (C282, C283, C284) — plano

> Origem: "Próxima tarefa detalhada — Etapa 135" do plano da 134. Design com a Fase 0 medida:
> `docs/superpowers/specs/2026-10-16-almoxarifado-etapa135-o-entregavel-de-irmaos-design.md`.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-16): última B **B868**, último C
> **C285**, última A **A83**. Esta etapa: **B869+**, **C286+**, **A84+**. Worktree `CRM-wt-e135`, branch `etapa-e135` (a partir da main
> `518757a5`).
>
> **Ordem da skill:** este plano é revisado (Fase 2) por um agente fresco **antes** de qualquer código de produção.
>
> **Fase 2 (um revisor fresco, sondas `scratchpad/e135/rev2-sonda.js` e `rev2-sonda-p4.js` no `testApp` real): 0 Critical, 3 Important, 5 Minor —
> todos aceitos, antes de qualquer código de produção.** A álgebra e a independência da ordem do laço conferidas (P2 com frações, P3 com saldo
> negativo permitido). **I1** — com a invariante quebrada (o físico cai abaixo da caixa sem reserva, o efeito da contagem por endereço da C186)
> a **primeira** rodada dos irmãos também diverge: 2 + 2 dava 400 depois de baixar o primeiro (P1). → cenário novo da RN-01 (a recusa sai antes);
> a janela **não** divide esse segundo pote — declarado em D e na C nova. **I2** — o "+0,01" da RN-03 caía no item que já passava do próprio
> máximo (S2 +2, S4) e passaria sem a RN-01 → o centésimo vai no último item cuja conta ficou **abaixo** do entregável dele (0 → 0,01).
> **I3** — material **crítico** na segunda rodada: o detalhe prometia 2 e a porta recusa (*"material crítico só sai depois de separado e
> conferido"*), anterior à etapa (P4) → na T1 o entregável do crítico fica na caixa (RN-02b, C286 resolvida). **M1** são **quatro** portas de
> pré-preenchimento (`aplicarDetalhe`, `abrirModalEntrega` — *Completar Entrega* e a abertura depois de separar —, `handleConfirmarEntrega`
> direto e não direto). **M2** a simulação é por `material_id` — cenário com outro material na mesma entrega. **M3** o RN-01d da 134: POST →
> descer → `ativo = NULL` no arquivo → subir. **M4** declarar em D que a simulação não modela endereço/lote (a recusa do motor por endereço
> ainda pode vir depois da primeira baixa). **M5** o "ausente" do `ativo` já gravava 1 (só nulo e `""`); o s6 da 134 apertado para o 400;
> o `PUT` com e-mail `""` declarado em D.
>
> **Trava de máquina:** `scratchpad/e135-lock.sh` (o mesmo diretório `maquina-testes.lock` das etapas anteriores). Um arquivo de teste de
> servidor por vez, inclusive os revisores; nunca `test:api` junto com o jest nem dois `test:api`.

## Regras de negócio

Termos: **irmãos** = itens do mesmo material na mesma requisição. Por item: `c` = caixa (`separado − entregue`, arredondada), `r` = reserva
ativa de origem REQUISICAO do item, `D` = disponível do motor sem a reserva do item, `csrOutros` = caixa sem reserva dos outros itens do
material (qualquer requisição ativa com caixa). **Segunda rodada** = a condição de hoje de `maxEntregar`: `entregue > 0` e `c < pendente`
(é a única em que a entrega passa da caixa). **E1** (literal de hoje, inalterada) = `⟨material⟩: não é possível entregar ⟨q⟩ ⟨un⟩. Máximo:
⟨m⟩ (pendente: ⟨p⟩, disponível: ⟨d⟩)` + o sufixo E190 quando cabe.

- **RN-01 — a prévia da entrega conta o que os irmãos anteriores da mesma entrega levam.** Em `entregarSemTrava`, a prévia (o laço só-leitura
  antes da alçada de valor) percorre os itens **na ordem do laço de baixa** e, para cada item com quantidade > 0, lê o saldo fresco de hoje
  (`saldoDisponivelParaItem`) e o **ajusta pelo efeito dos irmãos anteriores já validados nesta prévia**: o disponível do material
  (`disponivel_material` e `disponivel`) menos a soma de `max(0, q_i − r_i)`; `caixa_outros_itens` menos a soma de quanto a caixa sem reserva
  de cada irmão anterior cai (`max(0, c_i − r_i) − max(0, c_i′ − r_i′)`, com `c_i′ = q_i > c_i ? 0 : c_i − q_i` e `r_i′ = max(0, r_i − q_i)`).
  Com o saldo ajustado, as contas de hoje (`entregavelPeloMotor`, `tetoDaLeitura`, `maxEntregar`) e a recusa E1 com os números ajustados.
  O laço de baixa **não muda** (continua relendo depois de cada baixa — é a guarda que vale).
  Cenários (S2 da Fase 0): sem reserva, 4 entram, separados 2 e 2, entregues 2 e 2, entram +2. `PUT /entregar` 2 + 2 → **400** E1
  *"⟨mat⟩: não é possível entregar 2 PC. Máximo: 0 (pendente: 2, disponível: 0)"* **e nada mudou** (físico 2, entregue 2 e 2, separado 2 e
  2, nenhuma movimentação nova, status `PARCIALMENTE_ATENDIDA`); 2 + 0 → 200; 1 + 1 → 200 (físico 0, entregue 3 e 3). O mesmo pelo serviço
  (`entregarRequisicao` direto). **P1 (Fase 2 I1):** sem reserva, 4 entram, separados 2 e 2, nada entregue, o físico cai a 2 → 2 + 2 → 400
  E1 *"Máximo: 0 (pendente: 4, disponível: 0)"* e nada mudou (a janela ainda pré-preenche 2 e 2 aqui — D (135)). **M2:** a soma é por
  `material_id` — a mesma entrega com um item de outro material no meio passa.
- **RN-02 — o detalhe manda o teto e a parte própria do entregável.** `normalizarItem`, quando a consulta traz a caixa sem reserva (o
  detalhe), acrescenta (aditivo) `saldo_entregavel` e `saldo_entregavel_proprio`: na **segunda rodada** de material **não crítico**, `saldo_entregavel = Q.qtd(c + teto)`
  (o `teto` de separação de hoje, `tetoSeparacao(D, r, c, csrOutros)`) e `saldo_entregavel_proprio = Q.qtd(max(c, r))`; fora dela (primeira
  rodada), e com `quantidade_entregavel` 0 (inativo, disponível negativo, nada pendente), os dois iguais a `quantidade_entregavel`.
  `quantidade_entregavel` não muda. Cenários: S2 (+2 livres) → item 1 e item 2 com `quantidade_entregavel` 2, `saldo_entregavel` 2,
  `saldo_entregavel_proprio` 0; S1 → `saldo_entregavel = saldo_entregavel_proprio = quantidade_entregavel` em cada item.
- **RN-02b — o crítico entrega só a caixa, também no detalhe (C286, Fase 2 I3).** Material crítico: `quantidade_entregavel = min(o de hoje,
  c)` e os dois campos iguais a ele — a porta já recusa acima da caixa (*"⟨mat⟩: material crítico só sai depois de separado e conferido — q excede
  o separado ainda não entregue (c). Separe o restante e peça a segunda conferência."*). Cenário: S2 crítico (+2 livres) → 0 e 0 no detalhe.
- **RN-03 — a conta que divide é a da 127.** `dividirSeparavel` com `{ pendente: quantidade_entregavel, teto: saldo_entregavel, propria:
  saldo_entregavel_proprio }`, na ordem do pedido, dá o que a porta aceita: o número exato passa (200) e um centésimo a mais no último item cuja conta ficou **abaixo** do
  `quantidade_entregavel` dele (no caso sem divisão, no último com conta > 0) recusa (400 E1, nada baixado). Estados: S1, S1′, S2 (+2 livres → 2 e 0), S2 com +3 livres (→ 2 e 1), S4 (um irmão
  com reserva 1 fora da caixa na segunda rodada + o outro sem reserva, 1 livre → a própria do primeiro não é dividida).
- **RN-04 — o cenário da spec não diverge, e fica preso.** S1 (físico 8, reservados 4 + 4, separados 4 e 3; entrega de 2 do primeiro): a
  fila (`etapas` com `ENTREGAR`, `entregavel` 2 e 3), o detalhe (`quantidade_entregavel` 2 e 3) e a porta (2 + 3 → 200, *Parcialmente
  Atendida*; antes, 2 + 4 → 400 E1 *"Máximo: 3 (pendente: 4, disponível: 4)"* sem baixar) dizem o mesmo.
- **RN-05 — a fila não passa da caixa (não divide porque não precisa).** S2 (+2 livres): a fila mostra `entregavel` 0 e 0, `a_entregar` 0
  e 0, `etapas` = `['SEPARAR', 'AGUARDANDO_SALDO']` (sem `ENTREGAR`) — o que ela oferece é separar. Preso como está.
- **RN-06 — a janela de entrega divide pela mesma conta** (cliente, `RequisicoesList.js`). `saldoEntregavel(i) = saldo_entregavel ??
  maxQtdEntrega(i)`; `entregavelProprio(i) = min(saldoEntregavel(i), saldo_entregavel_proprio ?? saldoEntregavel(i))` — servidor sem os
  campos: tudo próprio, nada dividido (a conta de hoje). `maxEntregaNaTela(i, outros) = min(maxQtdEntrega(i), proprio + max(0,
  saldoEntregavel − proprio − outros))`, `outros` = a soma de `max(0, q_j − proprio_j)` dos **outros** irmãos (o digitado no modal, ou, no
  pré-preenchimento, o já atribuído na ordem do pedido). Vale no pré-preenchimento das quatro portas (o detalhe carregado — `aplicarDetalhe`;
  `abrirModalEntrega` — *"Completar Entrega"* e a abertura depois de separar; *"Entregar escolhendo de onde sai…"*; *"Confirmar Entrega e
  Baixar Estoque"*, que manda direto) e no `max` do campo. Cenários (S2, +2
  livres): o modal abre 2 e vazio (0 não entra no payload); o "Confirmar" de um clique manda só `[{ item_id: 1, quantidade_atendida: 2 }]`;
  digitar 1 no primeiro faz o `max` do segundo virar 1; S1 (servidor com os campos) e um servidor **sem** os campos: abre como hoje.
- **RN-07 — integração pela rota e pelo serviço.** Separar (rota) → entregar parcial (rota) → entrada → detalhe → a conta da janela
  (`dividirSeparavel` com os campos) → `PUT /entregar` com esse número (200) → físico, entregue e status conferidos; e o mesmo número
  +0,01 pelo **serviço** (`requisitionService.entregarRequisicao`) → 400 E1 e nada baixado.
- **RN-08 — `POST /api/usuarios` sem `ativo` grava 1 (C284).** `ativo` ausente, `null` ou `""` → a linha nasce `ativo = 1` (e a resposta diz
  1); `0` → 0; `1` → 1. Cenário (o `index.js` real): criar com `ativo: null` → `GET /api/usuarios/:id` `ativo` 1 e o login entra; com
  `ativo: 0` → o login recusa (o de hoje).
- **RN-09 — e-mail que não é texto é recusado (C283).** `POST /api/usuarios` (depois do *"Nome, email e senha são obrigatórios"*) e `PUT
  /api/usuarios/:id` (depois do 404, antes do L4): `email` presente (`!== undefined`) e `typeof email !== 'string'` → **400** `E-mail
  inválido: envie o e-mail como texto`, nada gravado. Valores: `123`, `[]`, `['a@t.com']`, `{}`, `true`, e no `PUT` também `null`. O `PUT`
  **sem** o campo segue o 500 de hoje (preso na 134, `superPadraoNoBoot` RN-03). Metade positiva: o mesmo gesto com texto passa (200).
- **RN-10 — o boot não apaga mais usuário pelo nome (C282).** A limpeza `LOWER(nome) LIKE '%administrator%'` do `index.js` sai; a tela de
  Usuários deixa de esconder quem se chama *administrator*. Cenário (o `index.js` real, reinício no mesmo data dir): criar *"System
  Administrator"* (gravado *SYSTEM ADMINISTRATOR*) → reiniciar → o usuário continua (`GET /api/usuarios/:id` 200, login entra). Estático: o
  `index.js` não tem `DELETE FROM usuarios` fora das rotas de exclusão. Cliente: a lista mostra o usuário *ADMINISTRATOR*.

## Contrato congelado

- `PUT /api/almoxarifado/requisicoes/:id/entregar`: payload, sucesso e literais **iguais**; muda **quando** a E1 sai (antes da primeira
  baixa, também para o irmão que o anterior esvaziou).
- `GET /api/almoxarifado/requisicoes/:id`: cada item ganha `saldo_entregavel` e `saldo_entregavel_proprio` (números, 6 casas); nada mais muda.
- `GET /api/almoxarifado/fila-separacao`: não muda.
- `POST /api/usuarios`: `ativo` vazio → 1 (a resposta também); novo 400 `E-mail inválido: envie o e-mail como texto`. `PUT /api/usuarios/:id`:
  o mesmo 400. Boot: não apaga usuário.

## Tasks (sort topológico)

- [ ] **T1 — tronco (servidor do almoxarifado)** — `requisitionService.js`: a prévia ajustada pelos irmãos (RN-01; uma função pura para o
  efeito, exportada para o teste) e os campos do detalhe (RN-02). Teste `tests/api/entregavelDeIrmaos.api.test.js` (RN-01..RN-05, RN-07; rota
  **e** serviço), escrito e rodado **vermelho** antes do código.
- [ ] **T2 — galho (cliente, contra o contrato)** — `RequisicoesList.js` (RN-06). Teste `RequisicoesEntregavelDividido.test.js`, vermelho
  antes.
- [ ] **T3 — núcleo** — `index.js` (RN-08, RN-09, RN-10), `client/src/components/Usuarios.js` (o filtro). Teste
  `tests/api/usuarioPelaApi.api.test.js` (o `index.js` real, reinício no mesmo data dir) e um teste de cliente para a lista, vermelhos antes.
  O RN-01d de `superPadraoNoBoot.api.test.js` criava o super fantasma pelo `POST` com `ativo: null` — com a RN-08 ele nasceria ativo: o
  cenário passa a gravar o `ativo` nulo **no arquivo** (mudança declarada no teste).
- [ ] **T4 — fechamento** — novidades (B869+, C286+ se houver, D (135), F (135), C282/C283/C284 resolvidas, a seção da etapa, cabeçalho),
  spec 05 (o item do entregável de irmãos, a D (127)), spec do núcleo se houver, mapa, guia, manual, este plano (retro, "Próxima tarefa
  detalhada — Etapa 136"), o "defeito que escapou" da retro da 134.

**Ordem:** T1 → T2 → T3, em série, eu mesmo. **Galhos em paralelo: 0** — T2 é galho por critério (contrato congelado), mas o "um teste por
vez" e o tamanho não pagam uma worktree.

**Trava:** a prévia roda **dentro** das travas de hoje (por requisição → por material, `comTravaDaRequisicao`); nenhuma trava nova, nenhuma
porta nova põe saldo no disponível — o CLAUDE.md **não** muda.

**Boot:** mexe no `index.js` → pasta vazia e reinício na mesma pasta (RN-10). **Migração:** nenhuma.

**Controles positivos previstos** (âncora contada = 1, md5 antes/sabotado/restaurado, restauro por cópia): a prévia sem o ajuste do
disponível (RN-01 cai pelo "nada mudou"); sem o ajuste da caixa sem reserva (o cenário S5: o primeiro irmão entrega a caixa sem reserva e o
segundo, na segunda rodada, lê o teto — tem de cair); `saldo_entregavel_proprio` com `r` no lugar de `max(c, r)` (RN-03 cai); o cliente sem
a divisão no pré-preenchimento e sem ela no `max` (RN-06 cai); `ativo` cru de volta (RN-08 cai); a guarda do e-mail fora (RN-09 cai); a
limpeza de volta (RN-10 cai).
