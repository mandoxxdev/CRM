# Etapa 55 — o próximo código de localização vem do servidor, e conta as inativas

> Status: **Fase 0-1** (design + plano). Feature 02 (Localizações e endereçamento).

## Fase 0 — medido (2026-09-30), com sonda executada

- O gerador `generateNextCodigo` é **só do cliente** (`ConfiguracoesAlmoxarifado.js`), e recebe a lista
  de `GET /localizacoes`, que filtra `ativo = 1`. Ele é usado pelo **assistente de nova localização** e
  pelo **Mover** (que troca o código da localização movida).
- **A suspeita do plano da 54 ("o UNIQUE recusa a criação") estava errada quanto ao caminho**: o POST
  não recusa — ele **reativa** a linha inativa com aquele código (decisão da Etapa 19). Sonda: SND-01,
  SND-02, apagar SND-02, criar com o código proposto (SND-02) → 201 com **o id antigo** — a
  localização "nova" herda o histórico de movimentos e as linhas de saldo da antiga, e o usuário acha
  que criou uma.
- **O UNIQUE estoura de verdade no Mover**: mover OUT-01 para o setor Sonda com o código proposto
  (SND-02, de uma inativa) → **500** `SQLITE_CONSTRAINT: UNIQUE constraint failed: localizacoes_almoxarifado.codigo`,
  mostrado cru na tela.
- C74 (3): `PUT /localizacoes/:id` sem `ativo` grava `ativo = 1`.
- O formato do código **não muda** (quebraria etiqueta impressa e integração). O hierárquico completo da
  spec (`ALM-GERAL-A03-...`) fica fora — letra B.

## Fase 2 — revisão do plano (agente fresco): 2 críticos, 3 importantes, 5 menores

- **CRÍTICO 1** — corrida entre buscar o código e gravar: se o código virar de uma **inativa** nesse
  intervalo (ou se a tela cair no gerador local, que só vê ativas), o POST **reativa** a antiga em
  silêncio — o bug que a etapa fecha. → **RN-05**: o assistente manda `somente_novo: true`.
- **CRÍTICO 2** — `excluir_id` tem de sair **também** do teste de colisão (mover para o mesmo lugar não
  renumera à toa).
- **IMPORTANTE** — casos-limite da RN-01 fixados abaixo (setor vazio = `LOC` e soma `''`+`NULL`; pai
  inexistente/inativo; setor inativo não usa o prefixo configurado, como a tela). As colisões mais
  comuns **não** são inativas: o 1º filho de `A-01` recebe `A-02` (raiz do seed); filho de `EPI` recebe
  `EPI-01` (raiz do setor). → a colisão é checada contra a **tabela inteira**.
- **IMPORTANTE** — a T2 é maior: código vira estado com efeito, resposta atrasada descartada,
  confirmar desabilitado enquanto carrega, o POST usa o código **mostrado**.
- Menores: PUT sem `codigo` → "Código obrigatório"; UNIQUE pego na gravação; `LIKE` evitado (filtro
  em JS); nenhum gesto posterior lê o código (o Mover sempre renumera — limitação, letra D).

## Contrato congelado (pós-Fase 2)

### `GET /api/almoxarifado/localizacoes/proximo-codigo?setor=&parent_id=&excluir_id=`
- 200 `{ codigo }`.
- Com `parent_id`: pai inexistente → 400 `Localização pai não encontrada`; pai inativo → 400
  `Localização pai {codigo} está inativa`. Prefixo = prefixo do código do pai (`^(.+?)-(\d+)$` → grupo 1;
  senão o código sem dígitos finais; vazio → `X`). Base = maior número (`-(\d+)$`) entre as filhas
  do pai (**todas**, inclusive inativas, menos `excluir_id`); sem filhas, o número do código do pai.
- Sem `parent_id`: prefixo do setor = `codigo_prefixo` do setor **ativo** com esse nome; senão
  `Corredor X` → `X`; senão 3 primeiros alfanuméricos do nome em maiúsculas; vazio → `LOC`. Base =
  maior número (>0) entre as raízes (sem pai) do mesmo setor (**todas**; setor vazio casa `''` e
  `NULL`), menos `excluir_id`.
- Proposta = `{prefixo}-{base+1 com 2 dígitos}`; enquanto o código existir na tabela (qualquer linha
  ≠ `excluir_id`, ativa ou inativa), soma 1.

### `POST /api/almoxarifado/localizacoes` — campo novo opcional `somente_novo`
- `somente_novo: true` e o código é de uma **inativa** → 409 `O código {codigo} pertence a uma localização desativada — gere outro código`.
- Sem o campo: comportamento de hoje (reativa — Etapa 19). Ativa com o código → 400 `Código já existe` (hoje).

### `PUT /api/almoxarifado/localizacoes/:id`
- Sem `codigo` → 400 `Código obrigatório`.
- Código de outra localização → 400 `Código já existe` (ativa) / `Código já existe (localização desativada)` (inativa).
- Sem `ativo` → preserva o atual (C74 (3)).

## Regras de negócio

- **RN-01** — `GET /api/almoxarifado/localizacoes/proximo-codigo?setor=&parent_id=&excluir_id=` →
  200 `{ codigo }`. Mesmo formato do gerador de hoje (`PREFIXO-NN`, prefixo do código do pai ou do
  setor — `setores_almoxarifado.codigo_prefixo`, ou derivado do nome), mas o "próximo número" conta
  **todas** as localizações irmãs, **inclusive inativas**, e o código proposto nunca é um código que
  já existe (ativa ou inativa) — sobe até achar um livre. `excluir_id` = a localização sendo movida.
- **RN-02** — `PUT` com `codigo` de outra localização (ativa ou inativa) → 400 `Código já existe`
  (não mais 500 cru).
- **RN-03** — `PUT` sem `ativo` **preserva** o valor atual (C74 (3)); com `ativo` presente, grava 0/1.
- **RN-05** — o assistente manda `somente_novo: true`; num 409/400 ele busca o código de novo e mostra o erro.
- **RN-04** — a tela (assistente e Mover) usa a rota; se a rota falhar, cai no gerador local (o de
  hoje) — a tela nunca fica sem proposta.
- Mantido: digitar à mão o código de uma inativa no POST continua **reativando** (Etapa 19) — letra D.

## Tasks

- **T1 (tronco, backend)** — rota RN-01 (helper puro testável), RN-02 e RN-03 no PUT. Testes em
  `server/tests/api/localizacaoProximoCodigo.api.test.js`: pula a inativa (controle: com só ativas,
  daria o código da inativa), pai, setor com prefixo configurado, derivado, `excluir_id`, colisão
  global (outro setor com o mesmo prefixo), PUT 400 com a literal, PUT sem `ativo` numa inativa
  continua inativa, PUT com `ativo:1` reativa.
- **T2 (galho, front)** — assistente e Mover buscam o código na rota; fallback local; testes do
  componente.
- **T3** — verificação, Fase 5, fechamento.
