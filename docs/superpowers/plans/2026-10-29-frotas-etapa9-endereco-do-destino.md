# Frota Etapa 9 — endereço estruturado do destino (CEP ou manual) e destino da lista na Viagem do gestor

> **Status:** em execução (2026-10-29). **Pedido do André (29/10):** "o 5 foi feito mesmo? não aparece essa lista pra mim. A origem
> e destino estão como campos de texto livre. A gente não deveria fazer um cadastro de endereço mais rigoroso com o componente de
> cep ou o cadastro manual do endereço se ele não souber o cep?"
> **Spec:** [`specs/modulo-frotas/23-endereco-do-destino/README.md`](../../../specs/modulo-frotas/23-endereco-do-destino/README.md)
> · **Etapa anterior:** [`2026-10-28-frotas-etapa8-admin-destinos-condutor.md`](2026-10-28-frotas-etapa8-admin-destinos-condutor.md)

## Diagnóstico (por que "não aparece")

A lista com "+ Novo destino" da Etapa 8 existe **só no Portal do motorista → Saída**. O André olhou **Frota → Viagens → Nova
Viagem** (tela do gestor), onde a B79 da Etapa 8 deixou Origem e Destino como texto livre. A B79 foi decisão minha, sem aval —
e errada para o uso real: é a tela que o gestor abre. Esta etapa **desfaz a B79** (B89).

O endereço do destino era um texto opcional ("Endereço (opcional)"). Passa a ser **estruturado e obrigatório**.

## Regras de negócio

| RN | Regra | Cenário |
|---|---|---|
| RN-F9.01 | `frotas_destinos` ganha `cep, logradouro, numero, complemento, bairro, cidade, uf` (TEXT, safeAlter). `endereco` continua, **montado pelo servidor** | boot numa base da Etapa 8 → colunas novas, linhas antigas intactas |
| RN-F9.02 | `POST /destinos` exige rua, número, bairro, cidade e UF; CEP e complemento opcionais | sem bairro → 400 `Informe o bairro do destino` |
| RN-F9.03 | CEP, se vier, tem 8 dígitos (pontuação ignorada) e é gravado `00000-000` | `"09844100"` → `09844-100`; `"0984"` → 400 `CEP deve ter 8 dígitos` |
| RN-F9.04 | UF é uma das 27 siglas; aceita minúscula e grava maiúscula | `"sp"` → `SP`; `"XX"` → 400 `Estado (UF) inválido` |
| RN-F9.05 | Texto: não-string = ausente; aparado; espaços internos colapsados; limites de tamanho | rua com 151 chars → 400 |
| RN-F9.06 | `endereco` = `Logradouro, Número[ - Complemento], Bairro, Cidade/UF[, CEP 00000-000]`; o `endereco` do corpo é **ignorado** | ver contrato |
| RN-F9.07 | `PUT /destinos/:id`: se o corpo traz **qualquer** das 7 chaves de endereço, o endereço final (corpo sobre o gravado) passa pela régua inteira e `endereco` é remontado; sem nenhuma, o endereço não muda | destino antigo (só nome): PUT `{ativo:1}` → 200; PUT do formulário com campos vazios → 400 `Informe a rua…` |
| RN-F9.08 | A busca de `GET /destinos?search=` também acha por cidade, bairro e CEP (além de nome e endereço) | `search=Batistini` acha |
| RN-F9.09 | `/portal/inicio.destinos` traz `id, nome, endereco, cidade, uf` | — |
| RN-F9.10 | `POST/PUT /frotas/viagens` aceitam `destino_id` (gestor), resolvido **dentro** da `naFilaDeViagens`: inteiro positivo de destino **ativo** → grava `destino = nome` e `destino_id`; senão 400 `Destino não encontrado`. Com `destino_id` e `destino` texto, o id manda | — |
| RN-F9.11 | `POST /viagens` sem `destino_id` (ausente/null/'') → texto `destino` como antes (compat de API) | — |
| RN-F9.12 | `PUT /viagens/:id`: `destino_id` ausente/null/'' → mantém `destino` e `destino_id` gravados. `destino_id` **igual ao gravado** → aceito mesmo que o destino tenha sido desativado depois, sem renomear (a viagem antiga continua editável) | viagem de destino desativado: editar só o km → 200 |
| RN-F9.13 | Componente de endereço (front, compartilhado): CEP + botão Buscar (e sair do campo com 8 dígitos) chama `GET /api/cep/:cep` e **substitui** rua, bairro, cidade e UF pelo que vier não-vazio; número e complemento não mexe. Todos os campos sempre editáveis (preenchimento manual). Dica "Não sabe o CEP? Preencha os campos à mão." | CEP 404 → aviso `CEP não encontrado — preencha o endereço à mão` |
| RN-F9.14 | Falha da consulta (502/rede) → aviso `Não foi possível consultar o CEP — preencha o endereço à mão`; menos de 8 dígitos não consulta | — |
| RN-F9.15 | Portal "+ Novo destino": Nome + componente de endereço (sai o "Endereço (opcional)"); o resto da Etapa 8 (201 seleciona, 409 seleciona o existente, erro no bloco) igual | — |
| RN-F9.16 | Portal: a opção do select mostra `Nome — Cidade/UF` quando há cidade; senão só o nome | — |
| RN-F9.17 | Tela **Destinos** do gestor: formulário com Nome + componente de endereço + Status; colunas Nome, Endereço, Cadastrado por, Status (o Endereço é o montado) | — |
| RN-F9.18 | **Nova/Editar Viagem** do gestor: sai o campo texto Destino; entra **Destino** (select dos ativos, `Nome — Cidade/UF`) com **+ Novo destino** (mesmo bloco do portal, POST /destinos; 201 seleciona, 409 seleciona o existente e avisa `Esse destino já estava cadastrado — selecionamos ele.`). Opcional no gestor (como antes) | — |
| RN-F9.19 | Editar viagem antiga: destino texto sem `destino_id` → o select vazio e a nota `Destino gravado: <texto>. Escolha da lista só se quiser trocar.`; destino com `destino_id` desativado → aparece como opção `<nome> (desativado)` selecionada | salvar sem tocar mantém |
| RN-F9.20 | A origem continua sendo gravada como o texto `GMP` (`ORIGEM_PADRAO`) — a planilha e a busca não mudam | — |
| RN-F9.21 | **Endereço da origem** (pedido do André, 29/10, durante a etapa): o servidor lê o endereço da GMP de `configuracoes` (`empresa_endereco`, `empresa_cidade`, `empresa_estado`, `empresa_cep` — o mesmo cadastro que o pedido de compra usa em `opcoesPedido.enderecoDaEmpresa`) e monta `Av. Angelo Demarchi 130, Batistini, São Bernardo do Campo/SP, CEP 09844-100` (partes vazias saem; tabela ausente → `''`, nunca 500) | Configurações sem CEP → termina em `/SP` |
| RN-F9.22 | `GET /frotas/meta` ganha `origemEndereco` (string); `GET /frotas/portal/inicio` ganha `origem: { nome: 'GMP', endereco }` | — |
| RN-F9.23 | Portal: abaixo de "Saindo de: GMP" aparece o endereço (linha `data-testid="origem-endereco"`), se não vazio | — |
| RN-F9.24 | Viagem do gestor: o campo texto **Origem** sai; entra a linha fixa `Saindo de: GMP — <endereço>` (só leitura). Viagem antiga cuja origem gravada não é GMP mostra `Origem gravada: <texto>` e a mantém ao salvar (o formulário não manda `origem`; o servidor mantém o gravado no PUT e grava GMP no POST sem origem). Viagem antiga com origem NULL continua ganhando GMP ao salvar (ajuste 18 da Etapa 8) | — |

## Contratos congelados

### Destino (linha devolvida por GET/POST/PUT `/frotas/destinos`)
`{ id, nome, endereco, cep, logradouro, numero, complemento, bairro, cidade, uf, ativo, criado_por_id, criado_por_nome, created_at, updated_at }`

### `POST /api/frotas/destinos` (`registrar_operacoes`)
Corpo: `{ nome, cep?, logradouro, numero, complemento?, bairro, cidade, uf }`. Ordem das conferências e mensagens literais:
1. nome — `Informe o nome do destino` / `Nome do destino: no máximo 120 caracteres` (como na Etapa 8)
2. cep (se não vazio após tirar não-dígitos) — `CEP deve ter 8 dígitos`
3. logradouro — `Informe a rua (logradouro) do destino` / `Rua: no máximo 150 caracteres`
4. numero — `Informe o número (ou S/N)` / `Número: no máximo 20 caracteres`
5. complemento — `Complemento: no máximo 60 caracteres`
6. bairro — `Informe o bairro do destino` / `Bairro: no máximo 80 caracteres`
7. cidade — `Informe a cidade do destino` / `Cidade: no máximo 80 caracteres`
8. uf — `Informe o estado (UF) do destino` / `Estado (UF) inválido`
201 com a linha. 409 `DESTINO_DUPLICADO` como na Etapa 8 (o nome decide; o endereço não entra na duplicidade).
CEP só de não-dígitos (ex. `"-"`) conta como ausente.

`endereco` montado: `Rua das Flores, 100 - Sala 2, Centro, São Bernardo do Campo/SP, CEP 09844-100`
(sem complemento: `Rua das Flores, 100, Centro, …`; sem CEP: termina em `/SP`).

### `PUT /api/frotas/destinos/:id` (`gerenciar_veiculos`)
Como Etapa 8 + RN-F9.07. Mensagens as mesmas do POST.

### `POST|PUT /api/frotas/viagens[/:id]`
Novo campo `destino_id` (RN-F9.10–12); 400 `Destino não encontrado`. Nada mais muda.

### `GET /api/frotas/meta` e `GET /api/frotas/portal/inicio`
`meta.origemEndereco: string` (pode ser `''`); `inicio.origem: { nome: 'GMP', endereco: string }`. Nada mais muda.

### `GET /api/cep/:cep` (já existe, Etapa 34 de compras — não muda)
200 `{cep, logradouro, bairro, cidade, estado}`; 400 `CEP deve ter 8 dígitos`; 404 `CEP não encontrado`; 502 `Serviço de CEP indisponível`.
No front: `api.get('/cep/<8 dígitos>')`.

## Ajustes da Fase 2 (revisor fresco, 2026-10-29) — valem POR CIMA das RN e contratos acima

3 TRAVAS + 10 menores; todos aceitos.

- **A1 (TRAVA, RN-F9.07)** — no PUT, "chave presente" = `!== undefined`. Nos obrigatórios (rua, número, bairro, cidade, UF), `null`/`''`
  = vazio → a mensagem `Informe…`. Em `cep` e `complemento`, `null`/`''` **apagam**. Valor presente substitui o gravado; chave ausente
  mantém.
- **A2 (TRAVA, RN-F9.07/B92)** — **destino antigo** (gravado sem `logradouro`) com as 7 chaves presentes mas **todas vazias** (é o que a
  tela manda ao só reativar/renomear) → o endereço **não muda** e o PUT passa. Destino que já tem endereço estruturado com tudo vazio →
  400 `Informe a rua (logradouro) do destino`. Na tela, o formulário de destino antigo mostra a nota `Endereço antigo: <endereco>` (só
  leitura) acima dos campos, para o gestor completar.
- **A3 (TRAVA, RN-F9.10/12)** — `destino_id` aceita número ou string só de dígitos (como o `resolverDestino` do portal); a comparação
  "igual ao gravado" é feita depois de `Number()`. O C1 também põe `destino_id` na lista de `Number()` do `handleSave`.
- **A4 (1.3)** — o 409 `extra.destino` passa a ser `{id, nome, endereco, cidade, uf, ativo}` (atualizar o Fase5-B8).
- **A5 (1.4)** — RN-F9.12: mesmo id, destino ativo renomeado → a viagem **mantém** o nome gravado (não renomeia).
- **A6 (2.2, B93)** — a busca do CEP **substitui** rua, bairro, cidade e UF pelo que veio, **inclusive vazio** (CEP genérico de cidade
  limpa rua e bairro).
- **A7 (2.3, RN-F9.08)** — termo de busca só de dígitos também acha o CEP gravado com hífen (`REPLACE(cep,'-','')`).
- **A8 (4.2)** — no POST, a duplicidade do nome é conferida **antes** do endereço: nome já ativo → 409 com o existente, mesmo sem
  endereço (o índice continua como rede para a corrida).
- **A9 (4.3)** — Viagem do gestor: no 400 `Destino não encontrado` ao salvar, a tela recarrega os destinos e limpa a seleção (como o
  portal). Mecanismo: `config.aoFalharSalvar(err, ctx)` opcional no `FrotasEntityPage`.
- **A10 (4.4)** — viagem antiga cujo destino foi desativado: a opção `<row.destino> (desativado)` é montada com o **nome gravado na
  viagem** e o `destino_id` dela.
- **A11 (4.5)** — no gestor, não dá para **tirar** o destino de uma viagem (null mantém) — escrito no manual, como o condutor (B80).
- **A12 (3.1)** — testes da Etapa 8 que mudam de propósito: `frotasDestinos` (criar/editar com `endereco` texto, lista de chaves :121),
  `frotasEtapa8Integracao:95` (comparação exata de `inicio.destinos`), `frotasEtapa8Fase5` B8, e todo POST `/destinos` só com nome.
- **A13 (3.2)** — front: `FrotasDestinosGestor.test.js` e `FrotasPortalSaidaDestinoCondutor.test.js` (campo `novo_destino_endereco`
  sai); `destinoEnxuto` guarda `cidade` e `uf`.
- Origem (2.1): resolvida pelas RN-F9.21–24 (pedido do André durante a etapa) e B94.

## Tasks (sort topológico)

| Task | Tipo | O quê | Estado |
|---|---|---|---|
| S1 | tronco (servidor) | schema RN-F9.01; serviço/rotas RN-F9.02–12 e RN-F9.21/22 (origem); testes novos `frotasDestinoEndereco.api.test.js` e `frotasViagemDestinoGestor.api.test.js`; atualizar os testes da Etapa 8 que criam destino só com nome | — |
| C1 | galho (front, contra o contrato) | componente `EnderecoDestinoCampos` (RN-F9.13/14); portal (F9.15/16); Destinos (F9.17); Viagens (F9.18/19); origem com endereço no portal e no gestor (F9.23/24); `FrotasEntityPage` ganha campo `type: 'componente'` e carrega destinos (`needsDestinos`) | — |
| I1 | integração (depois de S1+C1) | `frotasEtapa9Integracao.api.test.js`: pela rota — cria destino com endereço → viagem do gestor com `destino_id` → desativa → edita a viagem (km) → 200 e destino mantido; pelo serviço — `createDestino` + `createViagem` com `destino_id` | — |

S1 e C1 rodam em paralelo (worktrees): C1 testa contra mock **só na fronteira HTTP**, com os payloads deste contrato.

## Decisões (letra B, a registrar no fechamento)

- **B89** — desfaz a B79: a Viagem do gestor escolhe o destino da lista (com "+"). Descartado: manter texto livre.
- **B90** — endereço **obrigatório** (rua, número, bairro, cidade, UF) em destino novo, inclusive pelo "+" do motorista. Descartado:
  endereço opcional (era assim; o André pediu rigor). CEP opcional porque o motorista pode não saber.
- **B91** — o servidor **não** consulta a ViaCEP ao gravar nem confere CEP × cidade: a busca é ajuda de preenchimento; o que vale é
  o que a pessoa confirmou. Descartado: validar no servidor (dependência externa no gravar; ViaCEP fora do ar travaria a saída).
- **B92** — destinos antigos (só nome/endereço texto) ficam como estão; o gestor completa o endereço ao editar (o formulário exige).
- **B93** — o CEP **substitui** rua/bairro/cidade/UF (no fornecedor só preenche os vazios): trocar o CEP de um destino tem de
  trocar a rua junto. Número e complemento nunca são tocados.
- **B94** — o endereço da origem vem de **Configurações → Empresa** (fonte única, já usada pelo pedido de compra), lido na hora; a
  viagem **não** guarda cópia do endereço da GMP. Descartado: cadastrar a GMP como destino/origem em `frotas_destinos` (dois lugares
  para o mesmo endereço) e gravar o endereço na viagem (se a GMP mudar, as viagens antigas mostram o endereço novo — aceito).

## Fora desta etapa

Mapa/coordenadas; distância/rota; endereço na planilha (a coluna Destino continua o nome); acento na duplicidade (B-Etapa 8).
