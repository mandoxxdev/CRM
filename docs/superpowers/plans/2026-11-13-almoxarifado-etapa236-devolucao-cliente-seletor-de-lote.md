# Etapa 236 — a janela de devolução ao cliente ganha o seletor de lote (D (235) 1)

> Usando a skill `desenvolver-etapa`. Ponto de partida: a "Próxima tarefa detalhada" de
> `docs/superpowers/plans/2026-11-13-almoxarifado-etapa235-devolucao-cliente-lote-das-series.md` (`:183-206`).
> Estimativa: `docs/estimativas/2026-11/estimativa_2026-11-13_almoxarifado-devolucao-cliente-seletor-de-lote.md` (2h, `76df58b0`).
> Spec: `specs/modulo-almoxarifado/13-materiais-clientes/README.md` (seção "Etapa 235", item "Fora (declarado, D (235))").

**Objetivo:** em **Materiais de Clientes → Devolver**, material de cliente **com** controle por lote passa a ser devolvível pela tela: a
janela lista os lotes com saldo e envia `lote_id`. Com lote **e** série, as séries listadas são só as do lote escolhido.

## Fase 0 — medido (sobre `cb81f004`)

- A janela (`MateriaisClienteAlmoxarifado.js:40,62-63,105,264-268`): `controle_lote === 1` → `#dev-exige-lote` e não envia; não busca séries.
- A rota (`extended.js:956-993`): aceita `lote_id` (`z.number().int().positive()`), declara `exigeLote`, `exigeSerie`, `lotePelasSeries`.
  O teste `[RN-235.05]` prova a recusa *"exige lote"* sem lote; `[RN-235.05]` (L2 escolhido) prova o 201 com lote escolhido + série.
  **Não há** teste de material com controle de lote **sem** série devolvido com `lote_id` (o caso mais comum da janela nova) — T1.
- A lista de lotes (`GET /almoxarifado/materiais/:id/lotes?com_saldo=1`, `lotService.listarLotesDoMaterial:593`): `status`, `vencido`,
  `vencimento_liberado`, `elegivel` (`status === 'ATIVO' && (!vencido || liberado)`), `saldo`, `data_validade`, `codigo`, ordem FEFO
  (elegíveis primeiro). **`elegivel` é a régua da devolução ao cliente** (`DEVOLUCAO_CLIENTE` está em `TIPOS_SAIDA` e não é descarte — o
  vencido sem liberação barra, B1537). Resposta da pergunta da Fase 0 da 235: a lista **diz** a situação; nada muda no servidor.
- Séries: `GET /materiais/:id/series?status=EM_ESTOQUE` traz `lote_id`; Movimentações filtra pelo lote escolhido (`:417,1250`).

## Regras de negócio

- **RN-236.01** — Material com `controle_lote === 1`: a janela busca `GET /almoxarifado/materiais/<id>/lotes?com_saldo=1` ao abrir e mostra o
  campo **Lote** (`<select id="dev-lote">`, obrigatório), primeira opção `Escolha o lote` (valor vazio). Cada lote:
  `<codigo> — saldo <formatarQuantidade(saldo)>` + (com validade) ` — vence DD/MM/AAAA` + (vencido e liberado) ` (vencido, liberado)`.
  Material sem controle de lote: sem o campo e sem a busca (o corpo de sempre).
- **RN-236.02** — Lote **não elegível** (`elegivel !== true`) vem **desabilitado**, com ` — <situação>: não sai`, situação =
  `Bloqueado` / `Reprovado` (pelo `status`) e `Vencido` (vencido sem liberação), juntas por ` · `; fora disso `Impedido`. Havendo algum, a frase
  `#dev-lotes-impedidos`: *"Lotes bloqueados, reprovados ou vencidos vêm apagados: só saem depois que o lote for liberado na tela Lotes e
  Séries."* (B1537 mantida: o vencido sem liberação não é oferecido.)
- **RN-236.03** — Pré-seleção: **só** quando há exatamente **um** lote elegível, ele vem escolhido; com dois ou mais, ou nenhum, fica
  `Escolha o lote` (B1539).
- **RN-236.04** — Lista vazia: `#dev-lote-vazio` *"Nenhum lote com saldo para este material."*. Falha da busca: toast
  *"Não foi possível carregar os lotes do material"* e lista vazia. Resposta atrasada de outro material não pinta a janela (guarda `cancelado`).
- **RN-236.05** — **Confirmar devolução** sem lote escolhido (material com controle de lote): toast *"Escolha o lote da devolução"*, sem POST
  (depois das paradas de quantidade e documento, antes das de série). Com lote: o corpo leva `lote_id: Number(<escolhido>)`.
- **RN-236.06** — Lote **e** série: a janela busca as séries (como a 235) e mostra em `#dev-series` **só** as do lote escolhido; sem lote
  escolhido, no lugar da lista, `#dev-series-escolha-lote` *"Escolha o lote para ver as séries dele."*. **Trocar de lote desmarca todas as
  séries.** A frase do lote (`#dev-series-lote-da-devolucao`), o contador e a parada "marcadas ≠ quantidade" continuam.
- **RN-236.07** — A frase `#dev-exige-lote` sai (e o teste dela é trocado pelos desta etapa).
- **RN-236.08** (servidor, **sem mudança** — prova do contrato consumido) — material de cliente com controle de lote e **sem** série:
  `lote_id` de lote ATIVO → 201, o livro grava o lote e a linha do lote baixa; BLOQUEADO → 400 *"Lote <c> esta bloqueado e nao pode ser
  utilizado"*; vencido sem liberação → 400 começando com *"Lote <c> vencido em <data> nao pode sair para consumo."*; vencido **liberado** →
  201; quantidade acima da linha do lote → 400 *"Saldo insuficiente no lote <c>. Disponível: <n> UN"*. **Integração:** para cada lote da
  lista `?com_saldo=1`, a rota aceita (201) exatamente os de `elegivel === true` — a tela e o servidor usam a mesma régua.

## Contrato consumido (congelado; nada muda)

- `GET /api/almoxarifado/materiais/:id/lotes?com_saldo=1` → `200 [{ id, codigo, saldo, data_validade, status, vencido, vencimento_liberado,
  elegivel, ... }]`.
- `POST /api/almoxarifado/materiais-cliente/devolucoes` `{ material_id, quantidade, documento_devolucao, lote_id?, serie_ids? }` → 201; recusas
  acima (RN-236.08) e as da 235 (*"serie X nao pertence ao lote informado"* para série de outro lote).

## Tasks

| # | Task | Tipo | Estado |
|---|---|---|---|
| T1 | `server/tests/api/devolucaoClienteSeletorDeLote.api.test.js` — RN-236.08 + a integração lista × rota | galho (só consome) | feita, 7/7, `c31d2472`; controle positivo: `elegivel` sem o vencimento → a integração cai (L3) |
| T2 | Tela: seletor, filtro das séries, `lote_id`, tirar `#dev-exige-lote`; `MateriaisClienteDevolucaoLote.test.js` (RN-236.01 a .07, 11) e o teste da `#dev-exige-lote` tirado de `MateriaisClienteDevolucaoSeries.test.js` | galho (contrato congelado) | feita, 22/22 nos dois arquivos; 9 mutantes da tela, 9 mortos |

T1 e T2 não dependem uma da outra (nenhuma muda regra compartilhada). A integração que cruza as partes é o cenário "lista × rota" da T1.

## Decisões (letra B)

- **B1539** — pré-seleção só com um único lote elegível (descartado: FEFO como Movimentações — a devolução ao dono deve sair do lote que o
  documento dele diz, e escolher sozinho entre dois esconde a escolha; descartado também nunca pré-selecionar — com um lote só é clique à toa).
- **B1540** — o vencido sem liberação aparece **apagado** (segue a B1537, em aberto). Se a B1537 virar "isentar", basta o `disabled` usar só o
  `status` (como a Perda em Movimentações) — reversível.
- **B1541** — localização de origem continua fora (o motor escolhe a linha do lote); trocar de lote desmarca todas as séries (descartado:
  manter as do lote novo — elas nunca estão nos dois).

## Fase 2 — revisão do plano (agente fresco, antes de executar)

- **Bloqueante (tratado):** trocar de material poderia levar o lote do anterior (`abrirDevolucao` só zera quantidade e documento). O efeito dos
  lotes zera `devLoteId` a cada `devTarget` e a pré-seleção sobrescreve; cenário `[RN-236.05] trocar de material zera o lote escolhido`.
- **Importante (tratado):** com lote **e** série o `pedeSerie` da 235 excluía o controle de lote — sem mudar, `serie_ids` não ia e o servidor
  recusaria *"informe N serie(s)"*. `pedeSerie` passa a ser só `controle_serie === 1` (mutante S9 morto).
- **Importante (tratado no teste):** *"Saldo insuficiente no lote"* só aparece quando o material tem livre que cubra a quantidade (senão vem o
  *"Saldo insuficiente. Disponível"* do material, antes). A montagem da T1 tem L1 3 + L2 2 e pede 3 do L2 — a mensagem do lote.
- **Importante (declarado, C542):** o `saldo` do rótulo é o físico do lote; reserva (ex.: OS, C541) não desconta — a recusa vem do servidor.
- **Importante (declarado, D (236) 2):** material com controle de lote cujas séries estão **sem lote** não é devolvível pela tela (o filtro
  esconde, e o servidor recusaria sem lote e com lote).
- **Menor:** as mensagens literais conferem; a data do vencido é a ISO (`AAAA-MM-DD`) — o teste usa `dia(-1)` ISO.
- Independência T1 × T2 confirmada; o arquivo da 235 que tinha a `#dev-exige-lote` ficou nomeado na T2.

## Fase 5 — revisão adversarial (dois revisores frescos, em paralelo: um mutava só a tela, o outro sondava só o servidor)

- **Tela — 0 defeitos de produção; 5 lacunas de teste reais (mutantes que sobreviviam), fechadas:** M1 (tirar o zerar do lote ao trocar de
  material: com a lista do outro ainda carregando, o POST levava o `lote_id` do material anterior — cenário com a lista que não volta); M6 (a
  parada do lote antes da quantidade e do documento); M2 (`#dev-lote-vazio` sempre); M3 e M4 ("nenhuma série" e a frase das impedidas sobre
  todas as séries, não as do lote); M5 (o "Impedido" sem motivo conhecido). 2 mutantes sem efeito (ruído: o zerar no começo do efeito os
  torna iguais). Agora 14 mutantes, 14 mortos; o arquivo tem 15 cenários.
- **Servidor (sondas executadas, scripts no scratchpad) — 0 novos; 2 reproduzidos, anteriores à etapa (acontecem por Movimentações
  também), declarados:** (a) depois de um **ajuste** o lote mostra mais do que o físico (o ajuste grava no "sem lote", −2; a lista diz
  `L1 saldo=3`; a devolução de 3 → *"Saldo insuficiente. Disponível: 1 UN"*) — entra na **C542**; (b) com a localização padrão do material
  **bloqueada**, a devolução sem origem é recusada (*"Localização R5L-3 está bloqueada"*) mesmo com o lote em outro endereço — **C543**, e é a
  razão de a localização de origem ser a **D (236)** 1. Seguraram: as séries que a janela oferece para o lote saem todas; o vencido liberado e
  depois com a validade trocada (lista e rota concordam); a posição e o estorno voltam ao lote.

## Limitações (D (236))

1. **Localização de origem** fora da janela (**B1541**); com a localização padrão bloqueada a devolução é recusada (**C543**).
2. **Material com controle de lote e séries sem lote** não é devolvível pela tela.
3. **O vencido barra** (**B1537** em aberto, **B1540**).
4. **O saldo do seletor é o do lote**, não o livre (reserva, ajuste — **C542**); a recusa vem ao confirmar.
5. **Os fluxos internos** não descobrem o lote das séries (resto da **D (233)** 3).
