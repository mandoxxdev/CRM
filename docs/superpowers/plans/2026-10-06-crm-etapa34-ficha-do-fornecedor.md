# Etapa 34 (linha `main`) — a ficha do fornecedor

> Design: `docs/superpowers/specs/2026-10-06-crm-lote-compras-outubro-design.md`, seções 1.3 e 4.
> Tasks de origem: nº 7 (dois telefones), 8 (endereço autopreenchido), 9 (CSS). Branch: `main`.
> Baseline antes de começar: `test:api` 170/170; jest do client 44/685 verdes.

## Regras (`grep RN-34`)

- **RN-34.01** `/compras/fornecedores/novo` e `/editar/:id` abrem o `FornecedorForm`; o modal do grupo continua.
- **RN-34.02** `telefone` = Telefone da empresa; **`telefone_vendedor`** = coluna nova; `contato` rotulado "Nome do vendedor"; `celular` intocada.
- **RN-34.03** CNPJ → `GET /api/cnpj/:cnpj` preenche razão, fantasia, e-mail, telefone da empresa, endereço, cidade, estado, CEP; na edição **só vazios**; falha → toast "Não foi possível consultar o CNPJ".
- **RN-34.04** CEP (8 dígitos) → `GET /api/cep/:cep` (ViaCEP) preenche endereço (`logradouro, bairro`), cidade, estado, só vazios; 404 → toast "CEP não encontrado".
- **RN-34.05** POST/PUT gravam as 13 colunas; PUT: **ausente não mexe, `''`/`null` limpa**.
- **RN-34.06** `GET /api/compras/fornecedores/:id` nasce; 404 "Fornecedor não encontrado".
- **RN-34.07** 400 "Razão social é obrigatória" / "Status inválido" / "Grupo inválido".
- **RN-34.08** lista mostra os dois telefones.
- **RN-34.09** CSS escopado `.fornecedor-form`, seções Identificação / Contato / Endereço, tokens `--gmp-*`.

## Contratos — ver tabela da seção 4 do design (congelada). Resumo das chaves do fornecedor:
`razao_social*, nome_fantasia, cnpj, inscricao_estadual, contato, email, telefone, telefone_vendedor,
endereco, cidade, estado, cep, grupo_id` (+ `status` no PUT). `GET /:id` devolve também `celular,
foto, created_at, updated_at`, **nunca** `planilha_dados/planilha_nome/planilha_atualizado_em`.

## Ordem: T1 e T2 são **tronco** (servidor, sequenciais, um executor). T3 e T4 são **galhos** contra o contrato (podem rodar em paralelo com T2 se o executor do client mockar o `api` — mock legítimo na fronteira HTTP).

### T1 — tronco: rotas de fornecedor viram módulo + coluna nova + harness (RN-34.02, 05, 06, 07)
1. **Harness primeiro**: `server/tests/helpers/testApp.js:46-60` — o stub de `fornecedores` passa a
   espelhar a produção: acrescentar `contato`, `grupo_id INTEGER`, `planilha_dados`, `planilha_nome`,
   `planilha_atualizado_em`, `foto` e **`telefone_vendedor`**. Ver como `pedidos.js` é montado no
   harness (`grep -n "routes/compras" server/tests/helpers/testApp.js`) e montar o módulo novo do
   mesmo jeito.
2. **Teste primeiro**: `server/tests/api/comprasFornecedor.api.test.js` (novo, runner próprio como
   `pedidoCompra.api.test.js`). Cenários numerados:
   (1) POST com as 13 colunas → 201 e `SELECT` devolve todas gravadas (inclusive `cidade`, que hoje
   o POST **não grava** — controle positivo natural);
   (2) POST do modal (`razao_social, nome_fantasia, cnpj, grupo_id`) → 201, endereço `NULL`;
   (3) PUT do modal com os 7 textos + `grupo_id` em fornecedor que tinha `cidade` e
   `telefone_vendedor` → os dois **permanecem** (RN-34.05);
   (4) PUT com `telefone_vendedor: ''` → `NULL`; com `null` → `NULL`;
   (5) GET `/:id` → 200 com as chaves do contrato e **sem** `planilha_*`; `/9999` → 404 literal;
   (6) POST sem razão → 400 literal; PUT `status: 'x'` → 400 "Status inválido"; `grupo_id: 'abc'` → 400 "Grupo inválido";
   (7) PUT `status: 'inativo'` grava; POST ignora `status`;
   (8) as rotas exigem `authenticateToken` + módulo `compras` (`setUser(null)` → 401; usuário sem o módulo → 403);
   (9) caracterização: `DELETE /api/compras/grupos/:id` ainda responde 400 'Tipo inválido' (o genérico sombreia — **não consertar**, só detectar reordenação).
   Rodar → falha (não há GET `/:id`; POST não grava cidade).
3. Implementar `server/routes/compras/fornecedores.js` (registrador `module.exports = function (app, db,
   authenticateToken, checkModulePermission)`), com `GET /:id`, `POST`, `PUT`. Validação à mão como
   em `pedidos.js` (em `main` não há Zod em compras). `ALTER TABLE fornecedores ADD COLUMN
   telefone_vendedor TEXT` no `index.js` ao lado dos ALTERs de `celular` (`:19592-19599`, mesmo
   padrão de erro `duplicate` ignorado). Remover o `POST`/`PUT` inline do `index.js:20550-20592` e
   registrar o módulo **antes** do `app.delete('/api/compras/:tipo/:id')` (`:20395`) — a ordem é
   comportamento (cenário 9).
4. `GET /api/compras/fornecedores` (lista, `index.js:20333`) continua `SELECT *` — não tocar;
   `telefone_vendedor` chega sozinho.
5. Rodar o arquivo novo + `pedidoCompra*.api.test.js` + `comprasMinimos` (o pedido lê fornecedor) → verde.

### T2 — tronco: proxy de CEP (RN-34.04)
1. **Teste primeiro** `server/tests/api/cep.api.test.js`: montar `server/routes/cep.js` no app de
   teste com um `fetch` injetado (o módulo recebe `{ fetchImpl }` opcional para o teste; produção
   usa o `fetch` global). Cenários: 8 dígitos com hífen → 200 `{cep, logradouro, bairro, cidade,
   estado}`; ViaCEP responde `{erro: true}` → 404 "CEP não encontrado"; `fetch` rejeita/timeout →
   502 "Serviço de CEP indisponível"; 7 dígitos → 400 "CEP deve ter 8 dígitos"; sem token → 401.
2. Implementar `server/routes/cep.js` (`GET /api/cep/:cep`, `authenticateToken`, timeout 8s com
   `Promise.race` como o de CNPJ) e registrá-lo no `index.js` ao lado do `/api/cnpj/:cnpj` (`:3487`).

### T3 — galho: `FornecedorForm` (RN-34.01, 02, 03, 04, 07, 09)
1. **Teste primeiro** `client/src/components/compras/FornecedorForm.test.js` (mock de
   `../../services/api` e `react-hot-toast`; montar com `MemoryRouter` + `Routes` para
   `/compras/fornecedores/novo` e `/editar/:id`). Cenários:
   (a) `/novo` renderiza as três seções e os campos (testids `fornecedor-razao, -fantasia, -cnpj, -ie,
   -contato, -email, -telefone, -telefone-vendedor, -endereco, -cidade, -estado, -cep, -grupo`; `-status` só na edição);
   (b) submit sem razão → `role="alert"` com "Razão social é obrigatória" e **nenhum** POST;
   (c) POST exato com as 13 chaves (`grupo_id: ''` → "Sem grupo") + toast "Fornecedor salvo" + navigate `/compras/fornecedores`;
   (d) edição: GET `/compras/fornecedores/:id` → campos preenchidos → PUT com as 13 + `status`;
   (e) CNPJ: digitar 14 dígitos válidos e sair do campo em `/novo` → GET `/cnpj/<digitos>` → razão, fantasia, endereço, cidade, estado, CEP, telefone preenchidos; na edição com cidade já digitada, a cidade **não** muda;
   (f) CNPJ: `api.get` rejeita → toast de erro, campos intactos;
   (g) CEP: sair do campo com `01310-100` → GET `/cep/01310100` → endereço "Avenida Paulista, Bela Vista", cidade, estado; CEP 404 → toast "CEP não encontrado";
   (h) máscara: digitar `11987654321` no telefone do vendedor mostra `(11) 98765-4321`;
   (i) erro 400 do servidor no submit vai para `role="alert"`.
   Rodar → falha (o componente não existe).
2. Implementar `client/src/components/compras/FornecedorForm.js` + `FornecedorForm.css`:
   - cabeçalho com título "Novo fornecedor"/"Editar fornecedor" e botão Voltar;
   - `<form className="fornecedor-form">` com `.form-section > h2` (Identificação: razão*, fantasia,
     CNPJ com lupa `.btn-buscar-cnpj`, IE, grupo `<select>` de `GET /compras/grupos`, status na edição;
     Contato: nome do vendedor, telefone da empresa, telefone do vendedor, e-mail; Endereço: CEP com
     busca, endereço (full-width), cidade, estado `<select>` com as 27 UFs);
   - `client/src/utils/cnpj.js` **novo**: `somenteDigitos`, `formatarCNPJ`, `validarCNPJ` (dígitos
     verificadores — copiar a lógica de `ClienteForm.js:168`, com teste `cnpj.test.js`),
     `camposDaConsultaCNPJ(data)` → `{razao_social, nome_fantasia, email, telefone, endereco, cidade,
     estado, cep}` montando `endereco` como o ClienteForm (`logradouro, numero - complemento, bairro`);
   - preenchimento "só vazios" na edição: função pura `mesclarSoVazios(form, novos)` no mesmo util, testada;
   - CSS escopado em `.fornecedor-form` com tokens (`--gmp-surface`, `--gmp-border`, `--gmp-text`,
     `--radius-md`, `--shadow-sm`), grid `repeat(auto-fit, minmax(260px, 1fr))`, `@media (max-width:
     640px)` uma coluna, foco com anel `rgba(79,172,254,.15)`, botão primário no gradiente azul da GMP
     (ver `ClienteForm.css:109-121`). **Não** definir `.form-group`/`.form-grid` globais — só sob
     `.fornecedor-form`.
3. Rotas: `client/src/App.js` — `fornecedores/novo` e `fornecedores/editar/:id` **antes** do
   `path="*"` do módulo (mesma armadilha do pedido, comentada em `App.js:342-343`); `lazyModules.js`
   — `export const FornecedorForm = page(() => import('../components/compras/FornecedorForm'))`.
4. Jest do arquivo → verde; `CI=true build` limpo.

### T4 — galho: lista mostra os dois telefones (RN-34.08)
`client/src/components/Compras.js:204` — célula Telefone vira `cell-primary` (empresa) +
`cell-secondary` (vendedor, se houver); exportação para Excel ganha a coluna "Telefone vendedor".
Teste: se existir `Compras.test.js` em `main` (não existe — criar `Compras.fornecedores.test.js`
mínimo: lista com um fornecedor com os dois telefones mostra os dois).

### T5 — integração e fechamento
Suíte inteira (cinco comandos do servidor + jest + build). Marcar este plano; seção da Etapa 34 no
`docs/compras-novidades-por-etapa.md`; `specs/modulo-compras/README.md`. Um commit por assunto (T1,
T2, T3+T4 podem ser três commits), sem trailer.

## Pontos de atenção
- **Semântica do PUT muda** (substituição total → ausente não mexe). O único consumidor do PUT em
  `main` é o modal de `FornecedoresDoGrupo.js` (`:131`, `:167`, `:191`), que manda os 7 textos
  sempre — o cenário (3) prova que ele continua igual. Registrar na letra B.
- O proxy de CNPJ (`index.js:3487`) devolve `{success, source, data}` — o client lê `resp.data.data`.
- `ClienteForm.js` **não é tocado** (o comercial não está no lote).
- `estado` da consulta de CNPJ vem como `uf`; da ViaCEP também `uf`. Normalizar no util.
- `mascararTelefoneCompleto` ao carregar na edição (o ClienteForm faz; o form antigo da branch não fazia).

## Retro (preencher no fechamento)
- Rodadas de correção até verde: _preencher_
- Achados da revisão: _preencher_ (reais vs. ruído)
- Paralelismo: _preencher_
- Defeito escapado: preencher na etapa seguinte.

## Como foi executado

_Preencher no fechamento, com o que foi medido de verdade (hashes, contagens de teste, controle positivo)._
