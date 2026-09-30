# Etapa 55 — o próximo código de localização vem do servidor, e conta as inativas

> Status: **FECHADA (2026-09-30)** — implementação `77e51a5`, fix-round da Fase 5 3ac650e.
> Feature 02 (Localizações e endereçamento) — continua 🟡 (falta confirmação por leitura e áreas especiais).

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

- [x] **T1 (tronco, backend)** — `77e51a5`. Rota RN-01 (`services/almoxarifado/localizacaoCodigo.js`, helper
  puro), RN-05 no POST, RN-02 e RN-03 no PUT. `server/tests/api/localizacaoProximoCodigo.api.test.js` 10/10.
  **Divergência (Fase 3):** 3 das 11 sabotagens ficaram **verdes de início** — contar só as raízes ativas, só as
  filhas ativas, e casar só `setor = ''` —, porque o laço de colisão global compensava a base errada quando o
  próximo número era exatamente o ocupado. Os cenários ganharam **buraco na numeração** (inativa `SON-05` → `SON-06`;
  `FP-09` → `FP-10`; `LOC-07` com setor NULL → `LOC-08`) e as três ficaram vermelhas. O que o teste ancora é a
  **posição** da régua, não a existência do laço.
- [x] **T2 (galho, front)** — `77e51a5`, em paralelo com a T1 contra o contrato congelado (sem retrabalho).
  Assistente e Mover: código em estado buscado por efeito (guarda `cancelado`), confirmar desabilitado carregando,
  o gravado = o mostrado, `somente_novo` no POST, 409/400 refaz a busca, fallback no gerador local.
  `client/src/components/almoxarifado/LocalizacaoProximoCodigo.test.js` 7/7, 8 sabotagens vermelhas.
- [x] **T3** — verificação (api 232/232, almoxarifado 42/42, validation 4/4, safealter 3/3, sqlite 5/5, cliente
  896/896, build limpo — medidos antes do commit `77e51a5`), Fase 5 e fechamento (abaixo).

## Fase 5 — revisão adversarial do código (um revisor fresco, leitura): 0 crítico

| # | Achado | Cenário | Resolução |
|---|---|---|---|
| I-1 | Laço no fallback | Rota caída → o gerador local (só ativas) propõe o código de uma inativa → 409 → nova busca falha → o fallback propõe **o mesmo** código; sem saída a não ser fechar o assistente | Os códigos recusados na sessão entram no gerador local como irmãs fictícias (`comRecusados`, `useRef`); teste **(d2)**, sabotagem vermelha — 3ac650e |
| I-2 | `excluir_id` no ramo **filha** sem teste | Filhas `P-02` e `P-05`; mover `P-05` para o mesmo pai com `excluir_id` deve dar `P-03`; sem o filtro dá `P-06` — a suíte ficava verde | Teste novo, sabotagem vermelha |
| M | Parâmetro repetido | `?setor=a&setor=b` chega como array → bind inválido | Vale o primeiro. **O 1º teste passava por coincidência** (`String(['Rep','Outro'])` também dá o prefixo `REP`); trocado por `Q` × `QZE`, e aí a sabotagem ficou vermelha |

**Declarados, não corrigidos (D (55) nas novidades):** a mensagem do 409 fica na tela ao lado do código já
regenerado; o cabeçalho do caminho no assistente e a linha "Novo caminho" do Mover ficam em branco enquanto o código
carrega; um 400 que não é de código também refaz a busca; `PUT` sem `ativo` preserva `NULL`/`2` de legado (antes
normalizava para 1) — só via API; `PUT` sem código num id inexistente responde 400 em vez de 404; `parent_id=abc` cai
no ramo raiz.

Testes finais: `localizacaoProximoCodigo.api.test.js` **12/12** (11 + 2 sabotagens), `LocalizacaoProximoCodigo.test.js`
**8/8** (8 + 1 sabotagens).

## Retro (4 números)

- **Rodadas de correção até verde:** 1 fix-round.
- **Achados:** Fase 2 — 10 (2 CRITICAL, 3 IMPORTANT, 5 MINOR), todos incorporados ao contrato antes do código;
  Fase 5 — 2 IMPORTANT + 1 MINOR corrigidos, 6 declarados; **0 ruído**.
- **Paralelismo:** 1 galho (a tela) rodou em paralelo com o tronco (backend) contra o contrato congelado — sem
  retrabalho.
- **Defeito que escapou da Etapa 54:** nenhum conhecido. (Mas a Etapa 54 deixou uma **suspeita errada** no plano dela
  — "o UNIQUE recusa a criação" — que a Fase 0 desta corrigiu: a criação reativava; quem estourava era o Mover.) E o
  fechamento da 54 **apagou o título** `## Onde estamos e o que vem a seguir` das novidades — restaurado neste
  fechamento, com nota.

## Próxima tarefa detalhada — Etapa 56: a confirmação de endereço por leitura (feature 02)

**Por que esta.** Na feature 02, o que falta para 🟢 é **confirmação por leitura** e **áreas especiais com
semântica** (capacidade/peso é informativo por decisão; o código hierárquico ficou fora — B220). A confirmação por
leitura é a que o operador sente: guardar ou tirar material **do endereço errado** hoje não é detectado.

**Medido no fechamento da 55 (ponto de partida da Fase 0):**
- **Não existe `codigo_lido`** em lugar nenhum (`grep -rln codigo_lido server client/src` → vazio).
- **Não existe etiqueta de endereço**: `EtiquetasPdfModal` imprime material, lote, série e recebimento
  (descritores `{ codigo, nome, linhaControle, qrUrl }` — `client/src/utils/etiquetasPdf.js`).
- O **scanner** (`ScannerAlmoxarifado.js` + `utils/scannerDestino.js`) só **navega**: aceita URL http(s) cujo path
  começa em `/almoxarifado/` e vai para lá; texto solto é mostrado e não faz nada.

**Fase 0 da 56 — medir antes de prometer:**
1. Onde a leitura faria sentido: **Entrada** (confirmar o destino), **Saída/entrega de requisição** (confirmar a
   origem), **Transferência** (as duas pontas). Ler o formulário de Movimentações e o de entrega da requisição.
2. O que a etiqueta de endereço conteria: o **código** (`A-01`) em texto ou uma URL `/almoxarifado/...` que o scanner
   já sabe tratar. Decidir (letra B, reversível) — o código da 55 é estável (o Mover é a exceção, **C75**).
3. Desenho mínimo candidato: `codigo_lido` **opcional** no `POST /movimentacoes/v2` (e no que a entrega usa); quando
   vier, o motor compara com o `codigo` da localização do papel (destino na entrada, origem na saída) **antes** de
   qualquer efeito e recusa com literal (ex.: *"Endereço lido (⟨lido⟩) não confere com o destino ⟨código⟩"*). Sem
   `codigo_lido`, nada muda. Obrigatoriedade por configuração fica para depois (letra B).
4. Etiqueta de endereço no `EtiquetasPdfModal` (novo descritor) — medir se cabe na mesma modal.

**Contratos que já existem e a 56 não reabre:** `validarEnderecoExplicito` / `motivoRecusaEndereco` (a regra de
endereço — a checagem de leitura entra **junto**, no mesmo bloco de validação do motor, antes de qualquer efeito);
`GET /localizacoes/proximo-codigo` (55); a guarda de desativação (54).

**Pontos de atenção.** Entrada **sem destino** resolve para a padrão — a leitura tem de comparar com o endereço
**resolvido**, não com o campo vazio. Comparação de código: decidir se ignora maiúsculas/espaços (leitor de código de
barras costuma mandar sufixo `\n`). Controle positivo: um teste que lê o código **certo** e passa, no mesmo cenário
do que lê o errado e é recusado.
