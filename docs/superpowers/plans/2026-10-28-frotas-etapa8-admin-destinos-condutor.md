# Frota — Etapa 8: administrador pela tela, destinos cadastrados, condutor, origem GMP, abastecimento sem foto

> **Status:** em execução (2026-10-28). Plano escrito na Fase 1 da skill `desenvolver-etapa`; revisado por agente fresco na Fase 2
> (tabela "Ajustes da Fase 2" abaixo, que **vale sobre o texto**).
> **Origem:** cinco pedidos do André em 2026-10-28 (com a sugestão do motorista). Nenhum tinha spec: as features **19, 20, 21 e 22**
> nascem nesta etapa em `specs/modulo-frotas/`.
> **Design:** [`docs/superpowers/specs/2026-10-28-frotas-etapa8-admin-destinos-condutor-design.md`](../specs/2026-10-28-frotas-etapa8-admin-destinos-condutor-design.md)
> (o que foi medido e o que foi descartado, pedido a pedido).
> **Decisões sem consulta (reversíveis):** `docs/frotas/novidades-por-etapa.md`, letra B (B76+).

## Objetivo

1. **Perfis de acesso** dá e tira **Administrador de Frota** (feature 19).
2. O **Abastecimento** do portal deixa de pedir foto (feature 20).
3. A **Saída** do portal sai sempre **da GMP**; o veículo pode ser **liberado para funcionários**, e aí a saída pede **quem vai dirigir**
   (feature 21).
4. O **destino** da saída é escolhido de uma lista que o próprio motorista alimenta pelo botão **+ Novo destino**; o gestor tem a tela
   **Destinos** (feature 22).

## Regras de negócio (RN-F8.xx)

### A — Administrador de Frota pela tela (feature 19)

| RN | Enunciado | Cenário |
|---|---|---|
| RN-F8.01 | `classificarPerfilFrota` distingue **`forcado`** (superadmin ou `role` admin, qualquer caixa) de **`admin_modulo`** (só `admin_modulos` com `frota`). Nos dois o efetivo é `ADMIN_FROTA` | usuário 6 (`["frota"]`) → `origem 'admin_modulo'`; 8 (super) e 11 (`Admin`) → `forcado` |
| RN-F8.02 | `PUT { perfil: 'ADMIN_FROTA' }` num usuário **não forçado** escreve `frota` em `usuarios.admin_modulos` (JSON, sem duplicar, preservando os outros módulos) **e** grava a linha espelho `perfil_frota_usuario = 'ADMIN_FROTA'`. Resposta `{ usuario_id, perfil_explicito: 'ADMIN_FROTA', perfil_efetivo: 'ADMIN_FROTA', origem: 'admin_modulo' }` | Ana (`admin_modulos` NULL) → `["frota"]`; Gil (`["almoxarifado"]`) → `["almoxarifado","frota"]` |
| RN-F8.03 | `PUT` CONSULTA, MOTORISTA ou `null` num usuário **`admin_modulo`** tira `frota` de `admin_modulos` (preservando os outros), apaga a linha espelho `ADMIN_FROTA` e grava o pedido (CONSULTA/MOTORISTA → linha; `null` → sem linha). Resposta com `origem 'explicito'` ou `'padrao'` | Fabio (`["frota"]`) → CONSULTA: `admin_modulos = []`, linha CONSULTA, efetivo CONSULTA |
| RN-F8.04 | Usuário **`forcado`** → 409 `PERFIL_FORCADO`, mensagem nova: `Este usuário é superadmin ou administrador do sistema e tem acesso total à frota. Isso não se altera por esta tela.` Nada gravado | super (8) e `Admin` (11), com qualquer perfil |
| RN-F8.05 | `MSG_PERFIL_INVALIDO` = `Perfil inválido. Use CONSULTA, MOTORISTA, ADMIN_FROTA ou vazio para voltar ao padrão.`; `GET` devolve `perfis: ['CONSULTA','MOTORISTA','ADMIN_FROTA']` | `{ perfil: 'GESTOR' }` → 400 |
| RN-F8.06 | RN-F2.13 continua: o próprio perfil → 409 `PROPRIO_PERFIL`, **inclusive** para o administrador tentando se rebaixar ou se "reconfirmar" | Fabio logado faz `PUT /6 { perfil: 'CONSULTA' }` → 409 |
| RN-F8.07 | **Ida e volta pelo login real:** `PUT ADMIN_FROTA` na Ana → o pedido seguinte dela abre `GET /perfis-usuario` (200) e `GET /dashboard` (200); `PUT CONSULTA` → `/perfis-usuario` 403 (`acao 'configurar'`), `/dashboard` 200; `PUT null` → `/dashboard` 403 | molde `frotasPerfisIdaEVolta` |
| RN-F8.08 | O `syncModuleAdminProfiles` do núcleo, rodado depois (como o save do cadastro de usuário faz), **não desfaz**: com `admin_modulos` contendo `frota` mantém `ADMIN_FROTA`; sem, mantém a linha CONSULTA/MOTORISTA gravada pela tela | sync com `'["frota"]'` → linha segue; sync com `'[]'` depois de RN-F8.03 → linha CONSULTA segue |
| RN-F8.09 | Tela: o seletor tem **Motorista (padrão)**, **Consulta** e **Administrador de Frota**; `origem 'admin_modulo'` aparece com o seletor em Administrador; **`forcado`** continua com a etiqueta **Administrador** e o texto `Superadmin ou administrador do sistema: não se altera por esta tela.` | lista com Fabio (seletor), Super (etiqueta) |
| RN-F8.10 | Escolher Administrador pede `window.confirm` `Dar Administrador de Frota a <nome>? A pessoa passa a fazer tudo no módulo, inclusive dar perfis.`; Cancelar não chama o servidor e o seletor volta. Confirmou → `PUT` → toast `Perfil definido: Administrador de Frota`. Tirar (escolher outro) não pede confirmação | cancelar → 0 `PUT` |
| RN-F8.11 | Texto de ajuda da tela: `Administrador de Frota pode ser dado e tirado aqui; superadmin e administrador do sistema, não.` A descrição do Administrador continua `Faz tudo no módulo, inclusive dar perfis.` | — |

### B — Abastecimento sem foto (feature 20)

| RN | Enunciado | Cenário |
|---|---|---|
| RN-F8.12 | O formulário **Abastecimento** do portal **não tem** o grupo `Foto do cupom` (nem `Tirar foto`) e, salvo, **não chama** `POST /anexos` | salvar → 1 `POST /portal/abastecimentos`, 0 `POST /anexos` |
| RN-F8.13 | Em **Meus registros**, o abastecimento **não tem** `+ Foto`. Com fotos antigas, as miniaturas e `Remover foto` continuam; sem fotos, nada aparece | abastecimento com 2 anexos → 2 miniaturas, 0 `+ Foto`; sem anexos → sem bloco de fotos |
| RN-F8.14 | Saída, Retorno e Inspeção **mantêm** `Tirar foto` (RN-F5.09) e o `+ Foto` em Meus registros (RN-F5.10); o servidor e a coluna **Fotos** do gestor não mudam | `FrotasFotos.test.js` segue verde fora dos dois cenários do abastecimento, reescritos |

### C — Saída: origem GMP, carro liberado para funcionários, condutor (feature 21)

| RN | Enunciado | Cenário |
|---|---|---|
| RN-F8.15 | `frotas_veiculos.uso_funcionarios INTEGER DEFAULT 0` (safeAlter); `POST/PUT /veiculos` aceitam `uso_funcionarios` (0/1, `true`/`false`, `'1'`/`'0'`); `GET` devolve 0/1; `/portal/inicio` traz `uso_funcionarios` em cada veículo | criar com `true` → `uso_funcionarios: 1` |
| RN-F8.16 | `frotas_viagens.condutor_nome TEXT` e `destino_id INTEGER` (safeAlter). `ORIGEM_PADRAO = 'GMP'` exportada por `schema.js` e em `/meta` (`origemPadrao`) | `frotasEsquema` lista as colunas |
| RN-F8.17 | Saída do portal **sem** `origem` grava `origem = 'GMP'`; **com** `origem` grava o que veio (compatibilidade). Retorno e inspeção não têm origem | saída `{ tipo:'saida', … }` → viagem `origem 'GMP'` |
| RN-F8.18 | Saída do portal em veículo com `uso_funcionarios = 1` **sem** `condutor_nome` (ausente, vazio ou só espaços) → 400 `Informe quem vai dirigir (condutor)`; **com** → grava aparado. Em veículo sem a marca, `condutor_nome` é opcional (grava se vier). Mais de 120 caracteres → 400 `Condutor: no máximo 120 caracteres` | carro liberado, `condutor_nome: '  '` → 400 |
| RN-F8.19 | A conferência do condutor é feita com o veículo **relido dentro da fila** (`naFilaDeViagens`), **depois** da conferência de manutenção e de viagem única e **antes** de gravar — a marca pode ter sido ligada pelo gestor um segundo antes | gestor liga a marca entre o `inicio` e o `POST` → 400 |
| RN-F8.20 | `POST/PUT /viagens` (gestor) aceitam `condutor_nome` opcional (mesmo limite de 120); `GET /viagens` devolve `condutor_nome`; a viagem aprovada consumida pela saída (B8) recebe `condutor_nome` e `origem` da saída (`COALESCE`) | — |
| RN-F8.21 | `/portal/inicio.viagem_aberta` traz `condutor_nome`; `/portal/meus-registros` não muda | — |
| RN-F8.22 | Planilha, aba **Viagens e KM**: a coluna **Condutor** = `condutor_nome` se houver, senão o motorista. Nenhuma coluna nova | viagem com condutor "Carlos" e motorista Ana → `Carlos` |
| RN-F8.23 | Tela do portal: "Saindo de onde" **sai**; aparece a linha fixa **`Saindo de: GMP`** (`data-testid="origem-fixa"`); o corpo **não leva** `origem`. Veículo escolhido com `uso_funcionarios` → campo **`Quem vai dirigir (condutor)`** (`name="condutor_nome"`); sem a marca, o campo não aparece e o corpo não leva `condutor_nome` | trocar de um carro liberado para um comum esconde o campo e limpa o valor |
| RN-F8.24 | Cartão do portal: `Você está com o veículo <placa> desde <data>, destino <destino>, condutor <condutor>.` (condutor só se houver) | — |
| RN-F8.25 | Tela do gestor — Veículos: checkbox **`Liberado para funcionários (quem dirige varia; a saída pede o condutor)`** (tipo `checks`, chave `uso_funcionarios`); coluna Condutor mostra `Funcionários` quando a marca está ligada e não há condutor responsável. Viagens: coluna **Condutor** (`condutor_nome` ou `-`), campo **`Condutor (funcionário)`**, e **Origem** já preenchida com `GMP` na viagem nova | — |

### D — Destinos cadastrados (feature 22)

| RN | Enunciado | Cenário |
|---|---|---|
| RN-F8.26 | Tabela `frotas_destinos (id, nome NOT NULL, endereco, ativo DEFAULT 1, criado_por_id, criado_por_nome, created_at, updated_at)`; índice `ux_frotas_destinos_nome_ativo UNIQUE (nome COLLATE NOCASE) WHERE ativo = 1` | `frotasEsquema` lista a tabela e o índice |
| RN-F8.27 | `POST /api/frotas/destinos` (`registrar_operacoes`: motorista e gestor; Consulta 403) — `nome` aparado, espaços internos colapsados; vazio → 400 `Informe o nome do destino`; > 120 → 400 `Nome do destino: no máximo 120 caracteres`; `endereco` opcional (≤ 255, senão 400 `Endereço: no máximo 255 caracteres`). 201 com a linha (`criado_por_nome` = quem pediu) | motorista cria "Cliente Alfa" → 201 |
| RN-F8.28 | Nome já ativo (sem distinguir caixa) → **409** `{ error: 'Destino já cadastrado', code: 'DESTINO_DUPLICADO', destino: <linha existente> }`. Nome igual a um **desativado** → cria normalmente (o índice é parcial) | "cliente alfa" depois de "Cliente Alfa" → 409 com `destino.id` do primeiro |
| RN-F8.29 | `GET /api/frotas/destinos` (todo perfil do módulo): ativos, por nome; `?search=` em nome/endereço; `?inativos=1` inclui desativados (campo `ativo`) | Consulta lista; motorista lista |
| RN-F8.30 | `PUT /destinos/:id` (`gerenciar_veiculos`): `nome`, `endereco`, `ativo`; mesmas validações; renomear para nome ativo existente → 409 igual; inexistente → 404 `Destino não encontrado`. `DELETE /destinos/:id` (`gerenciar_veiculos`): `ativo = 0`, `{ success: true }`; inexistente → 404 | motorista `PUT` → 403 |
| RN-F8.31 | Saída do portal com `destino_id`: destino ativo → grava `destino = nome` **e** `destino_id`; inexistente/desativado/não numérico → 400 `Destino não encontrado`. Com `destino` texto e sem `destino_id` → grava o texto (compat). Com os dois → o `destino_id` manda. Renomear/desativar o destino depois **não** muda a viagem | — |
| RN-F8.32 | `/portal/inicio.destinos` = os ativos (`id, nome, endereco`), por nome | — |
| RN-F8.33 | Tela do portal: **`Indo para onde (destino)`** vira `<select name="destino_id">` (`Escolha o destino…` + ativos) com o botão **`+ Novo destino`** ao lado. O botão abre o bloco (`data-testid="novo-destino"`) com **Nome** (`name="novo_destino_nome"`), **Endereço (opcional)** (`name="novo_destino_endereco"`), **Adicionar** e **Cancelar**. Adicionar com nome vazio não chama o servidor e mostra `Informe o nome do destino` | — |
| RN-F8.34 | Adicionar → `POST /frotas/destinos` → 201: o destino entra na lista, fica **selecionado**, o bloco fecha, toast `Destino adicionado`. 409 `DESTINO_DUPLICADO`: seleciona `destino.id` da resposta, fecha o bloco, toast `Esse destino já existia — selecionado.` Outro erro: a mensagem do servidor (ou `Não foi possível adicionar o destino. Confira a internet e tente de novo.`) no bloco, que fica aberto | — |
| RN-F8.35 | O corpo da saída leva `destino_id` (número) quando há destino escolhido; **nunca** leva `destino` texto | — |
| RN-F8.36 | Tela do gestor **Frota → Destinos** (`/frota/destinos`, página genérica `destinos`): colunas Nome, Endereço, Cadastrado por, Status (`Ativo`/`Desativado`); Novo/Editar com Nome*, Endereço, Status; Excluir desativa (confirmação padrão da página); Consulta só leitura. Menu do gestor (e do Consulta) entre **Viagens** e **Checklist Diário**; o motorista não tem o item (ele cadastra pelo portal) | — |
| RN-F8.37 | Tela do gestor — Viagens: **Destino** continua texto livre (B79) | — |

### Integração

| RN | Enunciado |
|---|---|
| RN-F8.38 | **Pela rota:** gestor marca o veículo como liberado → motorista (login real) abre `/portal/inicio` (vê `uso_funcionarios`, `destinos`) → `POST /destinos` "Obra Beta" (201) → saída com `destino_id`, `condutor_nome 'Carlos'`, sem origem → viagem `origem 'GMP'`, `destino 'Obra Beta'`, `destino_id`, `condutor_nome 'Carlos'` → `GET /viagens` do gestor traz tudo → `abaViagens` com Condutor `Carlos` → retorno do motorista fecha a viagem (concluída, km rodado). Depois o gestor renomeia o destino → a viagem mantém `'Obra Beta'` |
| RN-F8.39 | **Pelo serviço:** `portalService.registrar` com os mesmos corpos, direto no banco (sem rota) — as mesmas gravações |
| RN-F8.40 | **Perfis pela fiação real:** RN-F8.07 e RN-F8.08 (login real + `syncModuleAdminProfiles` do núcleo com a tabela `perfil_almoxarifado_usuario` criada no harness do teste) |

## Contratos congelados

### `GET /api/frotas/perfis-usuario` (muda)

```json
{ "perfis": ["CONSULTA", "MOTORISTA", "ADMIN_FROTA"],
  "usuarios": [{ "id": 6, "nome": "Fabio", "email": "…", "perfil_explicito": "ADMIN_FROTA", "perfil_efetivo": "ADMIN_FROTA",
                 "origem": "admin_modulo", "motorista": null, "viagem_aberta": false }] }
```

`origem` ∈ `forcado | admin_modulo | explicito | padrao`. Para `admin_modulo`, `perfil_explicito` é sempre `'ADMIN_FROTA'` (a linha
espelho; se ela faltar — gravada por fora — o `GET` ainda diz `'ADMIN_FROTA'`, porque a fonte é `admin_modulos`).

### `PUT /api/frotas/perfis-usuario/:usuarioId` (muda)

| Corpo | Estado do usuário | Resposta |
|---|---|---|
| `{ perfil: 'ADMIN_FROTA' }` | não forçado | 200 `{ usuario_id, perfil_explicito: 'ADMIN_FROTA', perfil_efetivo: 'ADMIN_FROTA', origem: 'admin_modulo' }` |
| `{ perfil: 'CONSULTA' \| 'MOTORISTA' }` | não forçado (inclusive `admin_modulo`) | 200 `{ …, perfil_explicito: <p>, perfil_efetivo: <p>, origem: 'explicito' }` |
| `{ perfil: null \| '' }` | idem | 200 `{ …, perfil_explicito: null, perfil_efetivo: 'MOTORISTA', origem: 'padrao' }` |
| qualquer | `forcado` | 409 `{ error: MSG_PERFIL_FORCADO (nova), code: 'PERFIL_FORCADO' }` |
| qualquer | o próprio | 409 `{ error: 'Você não pode mudar o seu próprio perfil por esta tela.', code: 'PROPRIO_PERFIL' }` |
| fora da lista | — | 400 `{ error: 'Perfil inválido. Use CONSULTA, MOTORISTA, ADMIN_FROTA ou vazio para voltar ao padrão.' }` |
| id torto/inexistente/inativo | — | 404 `{ error: 'Usuário não encontrado' }` |

Ordem das conferências (mantida): 404 → 400 → 409 forçado → 409 próprio → grava. Gravação de `admin_modulos`: `UPDATE usuarios SET
admin_modulos = ? WHERE id = ?` com `JSON.stringify` da lista sem repetição (ordem preservada, `frota` no fim ao incluir). A linha
espelho usa **o mesmo SQL** do `syncModuleAdminProfiles` para o Frota (`INSERT … ON CONFLICT … 'ADMIN_FROTA'` / `DELETE … WHERE perfil =
'ADMIN_FROTA'`) — **não** chama o sync do núcleo, que também mexe em `perfil_almoxarifado_usuario` (tabela que o harness do Frota não
tem). O teste RN-F8.08 cria essa tabela no banco do teste e chama o sync do núcleo para provar que ele não desfaz.

### `GET /api/frotas/portal/inicio` (aditivo)

- `veiculos[]` ganha `uso_funcionarios` (0/1).
- `viagem_aberta` ganha `condutor_nome` (ou `null`).
- novo `destinos: [{ id, nome, endereco }]` (ativos, por nome).

### `POST /api/frotas/portal/registros` (saída — aditivo)

Corpo novo aceito: `destino_id` (inteiro), `condutor_nome` (texto). `origem` continua aceito; ausente → `'GMP'`. Erros novos, nesta ordem
(depois dos 400 de hoje e **dentro da fila**, após manutenção e viagem única): 400 `Destino não encontrado` → 400 `Condutor: no máximo
120 caracteres` → 400 `Informe quem vai dirigir (condutor)`. A resposta `{ registro, viagem }` traz `viagem.origem`, `viagem.destino`,
`viagem.destino_id`, `viagem.condutor_nome`.

### `/api/frotas/destinos` (novo, por `crudRoutes`)

| Método | Perfil | Corpo | Resposta |
|---|---|---|---|
| `GET /destinos?search=&inativos=1` | módulo | — | 200 `[{ id, nome, endereco, ativo, criado_por_id, criado_por_nome, created_at, updated_at }]` |
| `POST /destinos` | `registrar_operacoes` | `{ nome, endereco? }` | 201 linha · 400 `Informe o nome do destino` · 400 `Nome do destino: no máximo 120 caracteres` · 400 `Endereço: no máximo 255 caracteres` · 409 `{ error: 'Destino já cadastrado', code: 'DESTINO_DUPLICADO', destino }` |
| `PUT /destinos/:id` | `gerenciar_veiculos` | `{ nome?, endereco?, ativo? }` | 200 linha · os mesmos 400/409 · 404 `Destino não encontrado` |
| `DELETE /destinos/:id` | `gerenciar_veiculos` | — | 200 `{ success: true }` · 404 `Destino não encontrado` |

Normalização do nome: `String(nome).trim().replace(/\s+/g, ' ')`. A duplicidade é conferida **pelo índice** (o `INSERT` falha com
`SQLITE_CONSTRAINT`) e traduzida para o 409 com a linha existente lida por `nome = ? COLLATE NOCASE AND ativo = 1` — nenhuma janela
entre conferir e gravar. Reativar pelo `PUT { ativo: 1 }` um desativado cujo nome já tem outro ativo → o mesmo 409.

### `/meta` (aditivo)

`origemPadrao: 'GMP'`.

### `GET/POST/PUT /api/frotas/veiculos` (aditivo)

`uso_funcionarios` (0/1) em todas as respostas; no corpo aceita `0/1/true/false/'0'/'1'`.

### `GET/POST/PUT /api/frotas/viagens` (aditivo)

`condutor_nome` (texto ≤ 120, opcional, aparado; `null`/ausente no `PUT` mantém — como o km) e `destino_id` (devolvido; o gestor **não**
manda, continua `destino` texto). `origem` não ganha padrão no gestor (a tela preenche `GMP`).

### Planilha

Aba **Viagens e KM**: `Condutor = condutor_nome || motorista_nome` (a função `vazio` continua). Cabeçalho idêntico ao de hoje.

### Tela (congelado para os galhos de front)

- `FrotasPerfisAcesso`: `OPCOES = ['' Motorista (padrão), 'CONSULTA' Consulta, 'ADMIN_FROTA' Administrador de Frota]`;
  `valorDoSeletor` devolve `'ADMIN_FROTA'` quando `origem === 'admin_modulo'`; `celulaPerfil` mostra a etiqueta só em `forcado`;
  `opcaoExtra` deixa de tratar `ADMIN_FROTA` como "gravado à parte" (agora é opção normal). `window.confirm` só ao escolher
  `ADMIN_FROTA`.
- `FrotasPortalMotorista.RegistroForm` (saída): estados `destinoId`, `condutor`, `novoDestino` (`null | { nome, endereco, erro,
  salvando }`); `inicio.destinos` como lista local (`destinos` state iniciado de `inicio.destinos` e acrescido no 201). Função
  `adicionarDestino()` faz o `POST` e trata 201/409/erro (RN-F8.34). Textos literais: `Saindo de: GMP`, `Indo para onde (destino)`,
  `Escolha o destino…`, `+ Novo destino`, `Nome`, `Endereço (opcional)`, `Adicionar`, `Cancelar`, `Informe o nome do destino`,
  `Destino adicionado`, `Esse destino já existia — selecionado.`, `Não foi possível adicionar o destino. Confira a internet e tente de
  novo.`, `Quem vai dirigir (condutor)`.
- `AbastecimentoForm`: sem `FotosAntesDeSalvar`, sem `fotos`, sem `subirFotosEAvisar`. `MeusRegistros`: abastecimento renderiza
  `<MiniaturasFotos anexos onRemovida>` **só** se `anexos.length > 0`, nunca `BotaoMaisFoto`.
- `frotasEntityConfigs`: `veiculos.formFields` + `{ key: '_uso', label: 'Uso', type: 'checks', items: [{ key: 'uso_funcionarios',
  label: 'Liberado para funcionários (quem dirige varia; a saída pede o condutor)' }] }` e `getDefaultForm` com `uso_funcionarios: 0`;
  coluna Condutor com `format: (r) => r.motorista_nome || (r.uso_funcionarios ? 'Funcionários' : '-')`. `viagens`: coluna
  `{ key: 'condutor_nome', label: 'Condutor' }` depois de Motorista, campo `{ key: 'condutor_nome', label: 'Condutor (funcionário)' }`
  depois de Motorista, `getDefaultForm().origem = 'GMP'`. Nova config `destinos` (`endpoint: 'destinos'`, `title: 'Destinos'`,
  `subtitle: 'Lugares de entrega e retirada que o motorista escolhe na saída'`, `newLabel: 'Novo Destino'`, colunas Nome/Endereço/
  `criado_por_nome` "Cadastrado por"/`ativo` "Status" (`Ativo`/`Desativado`, badge), formFields Nome* / Endereço / Status (`select` 1
  Ativo, 0 Desativado), `getDefaultForm: { nome: '', endereco: '', ativo: 1 }`). `FrotasEntityPage` exporta `FrotasDestinos`;
  `lazyModules` e `App.js` (`<Route path="destinos" …>`); `frotaMenu` com `{ path: '/frota/destinos', icon: FiMapPin, label:
  'Destinos' }` entre Viagens e Checklist Diário em `MENU_FROTA_GESTOR` (herdado por `MENU_FROTA_ADMIN`); o motorista não.

## Tasks (sort topológico)

| # | Task | Tipo | Depende | Arquivos |
|---|---|---|---|---|
| T1 | **Esquema** (RN-F8.15, 16, 26): `safeAlter` de `uso_funcionarios`, `condutor_nome`, `destino_id`; `CREATE TABLE frotas_destinos` + índice parcial; `ORIGEM_PADRAO` exportada e no `/meta`. Teste: `frotasEsquema.api.test.js` ganha os cenários (colunas, tabela, índice — inserir dois nomes iguais ativos falha; desativado libera). Controle positivo: comentar um `safeAlter` → o teste da coluna cai | **tronco** | — | `schema.js`, `frotasService.getMeta`, `frotasEsquema.api.test.js` |
| G1 | **Servidor — perfis** (RN-F8.01–08): `permissions.classificarPerfilFrota` (`admin_modulo`), `PERFIS_ATRIBUIVEIS`, `perfisService.definirPerfil` (escrever/tirar `frota` em `admin_modulos`, espelho, mensagens novas). Testes: `frotasPerfis.api.test.js` **corrigido** (usuário 6 → `admin_modulo`; mensagens novas; o "ADMIN_FROTA sobrando" RN-F2.07 continua — linha sem `admin_modulos` é `explicito`), novo `frotasPerfisAdmin.api.test.js` (RN-F8.01–06, 08 com a tabela do almox criada no teste e o sync do núcleo), `frotasPerfisIdaEVolta` ganha RN-F8.07. Sabotagem: trocar `'frota'` por `'frotas'` na gravação → RN-F8.07 cai | galho | T1 (só para o worktree partir do mesmo hash) | `permissions.js`, `perfisService.js`, os 3 testes |
| G2 | **Servidor — saída, veículo, viagens, destinos, planilha** (RN-F8.17–22, 27–32, 39): `frotasService` (veículo `uso_funcionarios` no create/update; viagens `condutor_nome`; `listDestinos/createDestino/updateDestino/deleteDestino`; `VEICULO_JOIN` já traz `v.*`), `routes/frotas.js` (`crudRoutes('destinos', …)` com `createPerm 'registrar_operacoes'`, `updatePerm/deletePerm 'gerenciar_veiculos'`), `portalService` (`inicio.destinos`, `uso_funcionarios`, `viagem_aberta.condutor_nome`; saída: origem padrão, `destino_id`, condutor dentro da fila), `exportacaoService.abaViagens`. Testes: novo `frotasDestinos.api.test.js` (RN-F8.27–30 por perfil, 409 com `destino`, índice parcial), novo `frotasSaidaCondutor.api.test.js` (RN-F8.17–22, 31, 32; **a corrida da RN-F8.19**: ligar a marca por SQL entre `inicio` e `POST`; a viagem aprovada consumida), `frotasExportacao` ganha a RN-F8.22. Sabotagem: tirar o `COALESCE('GMP')` → RN-F8.17 cai; mover a conferência do condutor para fora da fila → RN-F8.19 cai | galho | T1 | `frotasService.js`, `portalService.js`, `routes/frotas.js`, `exportacaoService.js`, 3 testes |
| G3 | **Tela — Perfis de acesso** (RN-F8.09–11): `FrotasPerfisAcesso.js` + `FrotasPerfisAcesso.test.js` (confirm cancelado → 0 PUT; `admin_modulo` com seletor; `forcado` com etiqueta; toast). Sabotagem por concessão: remover o `confirm` → o cenário "Cancelar não chama" cai | galho | contrato | `FrotasPerfisAcesso.js`, `.test.js` |
| G4 | **Tela — portal** (RN-F8.12–14, 23, 24, 33–35): `FrotasPortalMotorista.js` (+ CSS mínimo em `FrotasPortalMotorista.css`), `FrotasFotos.test.js` (os 2 cenários do abastecimento viram negativos), novo `FrotasPortalSaidaDestinoCondutor.test.js` (seletor de destino, `+ Novo destino` 201/409/erro, condutor só em carro liberado, corpo sem `origem` e com `destino_id`, cartão com condutor). Sabotagem: devolver o `FotosAntesDeSalvar` ao abastecimento → RN-F8.12 cai; mandar `destino` texto → RN-F8.35 cai | galho | contrato | `FrotasPortalMotorista.js/.css`, 2 testes |
| G5 | **Tela — gestor** (RN-F8.25, 36, 37): `frotasEntityConfigs.js` (veículos, viagens, `destinos`), `FrotasEntityPage.js` (`FrotasDestinos`), `lazyModules.js`, `App.js`, `frotaMenu.js` + `FrotasMenuPorPerfil.test.js` (Destinos no gestor e Consulta, não no motorista) e novo `FrotasDestinosGestor.test.js` (lista, Consulta só leitura, formulário, coluna Condutor "Funcionários", campo Condutor em Viagens, Origem `GMP` por padrão) | galho | contrato | `frotasEntityConfigs.js`, `FrotasEntityPage.js`, `lazyModules.js`, `App.js`, `frotaMenu.js`, 2 testes |
| T2 | **Integração** (RN-F8.38–40): novo `frotasEtapa8Integracao.api.test.js` com `comLoginReal` — o fluxo inteiro pela rota e pelo serviço, e o sync do núcleo. Suíte completa: `test:api`, `test:almoxarifado`, `test:validation`, `test:safealter`, `test:sqlite`, tela inteira, `CI=true build` | integração | G1–G5 | 1 teste |

**Independência medida (Fase 3):** G1 toca `permissions.js`/`perfisService.js`; G2 toca `frotasService.js`/`portalService.js`/
`routes/frotas.js`/`exportacaoService.js` — nenhum arquivo em comum, e G2 não lê perfil além do `requirePermission` já existente. G3, G4
e G5 não compartilham arquivo (G4 só `FrotasPortalMotorista.*` e `FrotasFotos.test.js`; G5 não encosta no portal). Os cinco rodam em
**worktrees** com junction de `node_modules` (memória `worktree-junction-node-modules`), cada um com os próprios testes, nunca a suíte
inteira (memória `sabotagem-concorrente-contamina-suite`). Scratchpad: `msg-<galho>.txt`.

## Pontos de atenção para quem executa

1. **`admin_modulos` é TEXT JSON** (`'[]'` por padrão no núcleo; `NULL` em linha antiga/harness). Ler com `parseAdminModulos`, gravar
   com `JSON.stringify`. Não tocar em outros módulos da lista.
2. **O harness do Frota não tem `perfil_almoxarifado_usuario`:** por isso o espelho é gravado pelo próprio `perfisService` (mesmo SQL do
   sync). Quem quiser provar RN-F8.08 cria a tabela no teste (`CREATE TABLE perfil_almoxarifado_usuario (usuario_id INTEGER PRIMARY
   KEY, perfil TEXT, updated_at TEXT)`) e chama `syncModuleAdminProfiles(db, id, admin_modulos)`.
3. **O stub do harness põe o perfil no header** — RN-F8.07 só prova pelo `comLoginReal`.
4. **Fila de viagens:** a conferência do condutor e do destino vai **dentro** de `naFilaDeViagens`, depois de manutenção/viagem única,
   **antes** do `INSERT/UPDATE`. Resolver o destino (`SELECT … WHERE id = ? AND ativo = 1`) também dentro — desativado no meio → 400.
5. **`uso_funcionarios` no `PUT /veiculos`:** `data.uso_funcionarios ?? current.uso_funcionarios` (o formulário manda sempre 0/1).
   Normalizar `true/'1'/1` → 1, resto → 0.
6. **A página genérica envia o formulário inteiro** (`getDefaultForm` + o que o usuário mexeu): `uso_funcionarios: 0` vai no corpo
   mesmo sem o checkbox tocado — por isso o `??` no servidor basta.
7. **Índice parcial `WHERE ativo = 1` com `COLLATE NOCASE`:** SQLite aceita `CREATE UNIQUE INDEX … ON t (nome COLLATE NOCASE) WHERE
   ativo = 1`. Traduzir `SQLITE_CONSTRAINT` do `INSERT`/`UPDATE` para o 409 lendo a linha existente.
8. **Destino texto nas viagens antigas:** `destino_id` nulo é normal; a lista e a planilha usam `destino` (texto) sempre.
9. **Front: `window.confirm` nos testes** — `jest.spyOn(window, 'confirm')`, como `FrotasRemoverFotoGestor.test.js`.
10. **Menu:** `MENU_FROTA_ADMIN` deriva de `MENU_FROTA_GESTOR` por índice de `/frota/relatorios` — inserir Destinos **antes** disso não
    quebra, mas confira `FrotasMenuPorPerfil.test.js`.

## Baseline (medida em 2026-10-28, `main` em `854a8408`, antes de qualquer código)

Servidor, os 19 arquivos `frotas*.api.test.js`: **197 passou, 0 falhou** (Anexos 19, AnexosIntegracao 2, ConsumoViagem 12,
EscopoMotorista 12, Esquema 6, Exportacao 9, Fase5Auth 8, Fase5Regras 8, KmHorimetro 32, KmHorimetroIntegracao 2, Pendencia 22,
PendenciaIntegracao 2, Perfis 17, PerfisIdaEVolta 3, Portal 19, PortalIntegracao 2, Relatorios 14, RelatoriosIntegracao 2, Servico 6).
Tela, `src/components/frotas`: **14 suítes, 184/184**.

## Estado das tasks

| Task | Estado | Commit |
|---|---|---|
| Plano + Fase 2 | em andamento | — |
| T1 | — | — |
| G1 | — | — |
| G2 | — | — |
| G3 | — | — |
| G4 | — | — |
| G5 | — | — |
| T2 | — | — |

## Ajustes da Fase 2 (revisor fresco, 2026-10-28 — **7 travas + menores; valem sobre o texto acima**)

| # | Achado (arquivo:linha) | Ajuste acatado |
|---|---|---|
| T-1 | **TRAVA.** `handleError` (`routes/frotas.js:34-38`) repassa só `error` e `code`: o `destino` do 409 `DESTINO_DUPLICADO` **cairia no chão** e a tela da RN-F8.34 nunca selecionaria o existente | `handleError` passa a espalhar `err.extra` (objeto) no corpo: `{ error, code, ...err.extra }`. `createDestino` lança `erro(409, …, 'DESTINO_DUPLICADO')` com `e.extra = { destino }`. O teste `frotasDestinos` asserta `r.body.destino.id` (G2) |
| T-2 | **TRAVA.** Ordem dos 400 novos × o 409 `KM_MENOR_QUE_ATUAL` (`portalService.js:248`, RN-F3.03): se destino/condutor viessem **depois** do 409, o motorista confirmaria o km menor, levaria 400 e teria de confirmar de novo | Ordem fixada **dentro da fila**: manutenção (`:245`) → viagem única (`:246`) → **destino (`destino_id` → nome) → tamanho do condutor → condutor obrigatório** → `acertarMedicao`/`conferirMenorQueAtual` (`:247-248`) → grava. Cenário obrigatório em `frotasSaidaCondutor`: km menor **e** sem condutor → **400**, não 409 |
| T-3 | **TRAVA.** `listDestinos` traz só ativos e a config não tinha filtro: o destino "excluído" (desativado) **sumia para sempre** da tela do gestor | Config `destinos` com `filters: [{ key: 'inativos', label: 'Mostrar', options: [{ value: '', label: 'Ativos' }, { value: '1', label: 'Todos' }] }]` (a página manda `filters` como query — `FrotasEntityPage.js:49-51`, conferido). Reativar = Editar → Status Ativo (G5) |
| T-4 | **TRAVA.** O plano congelava `destinos` como `useState(inicio.destinos)`: quando o gestor desativa o destino com o formulário aberto, o 400 `Destino não encontrado` dispara `onAtualizar()` mas a lista local **não acompanha a prop** — o select continuava com o desativado selecionado e cada tentativa repetia o 400 | `useEffect` sincroniza a lista local com `inicio.destinos` (unindo os criados localmente que ainda não voltaram no `inicio`); se o `destinoId` escolhido sumiu da lista, zera e mostra no formulário `O destino escolhido foi desativado. Escolha outro.` Cenário em G4 (RN-F8.34b) |
| T-5 | **TRAVA.** `frotasPortal.api.test.js:85` trava `Object.keys(v1)` exatas de `inicio.veiculos`: `uso_funcionarios` novo derruba — e G2 não listava o arquivo | G2 edita `frotasPortal.api.test.js` (a lista de chaves ganha `uso_funcionarios`) |
| T-6 | **TRAVA.** `FrotasPortalMotorista.test.js:160-205, 219` digita `origem`/`destino` em `<input>` e trava o corpo `origem: 'Fabrica', destino: 'Cliente X'` — G4 não listava | G4 reescreve esses cenários (sem `origem`; `destino_id` pelo select; `name="destino"` deixa de existir) |
| T-7 | **TRAVA.** `crudRoutes` **não** dá 404 em PUT/DELETE (`routes/frotas.js:150-161`); `deleteVeiculo` (molde) não confere existência | `updateDestino`/`deleteDestino` fazem `SELECT` e lançam `erro(404, 'Destino não encontrado')`. **Não há** `GET /destinos/:id` (sem `getOne`) — declarado |
| 8 | `PUT /viagens`: `data.x ?? current.x` + a página converte `''` em `null` (`FrotasEntityPage.js:113`) → o gestor **não consegue limpar** o condutor (nem origem/destino hoje) | Comportamento **fixado e declarado** (B80): condutor não se apaga pela tela do gestor; corrige-se digitando outro. Teste prova que `null` mantém |
| 9 | `POST /destinos` com `nome` não-string (`123`, `{}`) viraria `"123"`/`"[object Object]"`; `ativo` do select chega como `'1'`/`'0'` | Só string conta — o resto → 400 `Informe o nome do destino` (idem `endereco`: não-string = ausente). `ativo` normalizado como `uso_funcionarios` (`true/'1'/1` → 1, resto 0) |
| 10 | Viagem **aprovada** consumida: `origem = COALESCE(?, origem)` — aplicar `'GMP'` **antes** sobrescreveria a origem que o gestor digitou | UPDATE da aprovada: `origem = COALESCE(?, origem, 'GMP')`, `condutor_nome = COALESCE(?, condutor_nome)`, `destino = COALESCE(?, destino)`, `destino_id = COALESCE(?, destino_id)` com `|| null` nos parâmetros; o INSERT usa `b.origem || 'GMP'`. Cenário no teste |
| 11 | `origem: ''` → `null` → `GMP` (RN-F8.17 "grava o que veio") | Declarado: vazio = ausente = `GMP` |
| 12 | Texto de ajuda divergia entre design e plano | Vale o plano (`…administrador do sistema, não.`); design corrigido |
| 13 | Tabela do PUT: o **forçado** que tenta a si mesmo leva `PERFIL_FORCADO` (ordem `perfisService.js:74` antes de `:80`) | Linha do próprio = "não forçado"; a ordem 404 → 400 → forçado → próprio continua |
| 14 | RN-F8.08 era tautologia. O risco real: `PUT /usuarios/:id` (`index.js:4104-4115`) com a lista **inteira** que o `UsuarioForm` carregou no mount — administrador do sistema com o cadastro aberto **antes** do PUT da tela do Frota salva o telefone → `admin_modulos` volta a `[]`, o sync apaga, o Administrador dado pela tela **some** | Comportamento **fixado e declarado** (B81, molde C9): a tela de usuário manda a lista que carregou. RN-F8.08 reescrita: "o sync rodado **com a lista atual** não desfaz; rodado com a lista **velha** (sem `frota`) desfaz — e isso é o que o cadastro de usuário faz se estava aberto antes". T2 cobre os dois |
| 15 | `frotasPerfisIdaEVolta.api.test.js:88` trava `['explicito','forcado','padrao']` — quebra com `admin_modulo` | G1 corrige a asserção (lista ganha `admin_modulo`) |
| 16 | Fabio ADMIN→CONSULTA no **painel do gestor**: `/dashboard` responde 200 (Consulta vê o painel) → nada renova o usuário; o menu dele mantém "Perfis de acesso" e `podeAlterar` mostra Novo/Editar até o F5 (o servidor recusa tudo) | Declarado (C22). A alternativa (`/dashboard` devolver `perfil` fora do cache e o painel comparar como o portal) fica para depois |
| 17 | Mensagem do índice é `UNIQUE constraint failed: frotas_destinos.nome` (sem o nome do índice — medido no sqlite3 5.1.6 / SQLite 3.44.2) | A tradução casa `frotas_destinos.nome` |
| 18 | `getDefaultForm().origem = 'GMP'`: `openEdit` parte dos defaults e só sobrescreve quando `row[k]` não é nulo → viagem antiga com `origem NULL` abre com `GMP` e, salva, grava `GMP` | Aceito e declarado (0 viagens em produção; o preenchimento na edição é visível antes de salvar) |
| 19 | Coluna `badge: true` ignora `format` (`FrotasEntityPage.js:145-148`): `ativo = 1` viraria "1" | Coluna Status com `render: (r) => <span className={\`frotas-badge frotas-badge-${r.ativo ? 'ativo' : 'inativo'}\`}>{r.ativo ? 'Ativo' : 'Desativado'}</span>` |
| 20 | `perfil_explicito` do GET para `admin_modulo` passa a ser **calculado** (`'ADMIN_FROTA'`), não lido da tabela | Dito em G1; `frotasPerfis` RN-F2.02 muda junto |
| 21 | O abastecimento aparece em **5** cenários de `FrotasFotos.test.js` (`:118, :208, :254, :311, :365`), não em 2 | G4 reescreve os cinco |
| 22 | `listViagens` busca em `destino, finalidade, placa` — o gestor não acharia por condutor | `vi.condutor_nome` entra na busca (G2) |
| 23 | Harness `frotasTestApp.js` — risco de G1 e T2 "melhorarem" | **Harness intocado** nos dois briefs (`comLoginReal` já cria a tabela do almox) |
| 24 | `Frotas.css` é compartilhado por G3, G4, G5 | Nenhum CSS novo fora de `FrotasPortalMotorista.css`; G3 e G5 reaproveitam classes |
| 25 | Letra B do documento de novidades: cinco galhos numerando decisões colidiriam | Só o tronco escreve o documento; galho deixa a decisão no `msg-<galho>.txt` do scratchpad |
| 26 | `FrotasFotos.test.js:440-471` (G4) importa `frotasEntityConfigs` (G5) | Nota em G5: não mexer na ordem das colunas de `abastecimentos`/`checklists` |
| 27 | `+ Novo destino` com nome de um **desativado** cria outro ativo; reativar o velho → 409 | Declarado (B82) |
| 28 | Motorista por URL `/frota/destinos`: `podeAlterar` (`!== CONSULTA`) mostra Novo/Editar/Excluir; Editar/Excluir levam 403 no toast | Declarado (C23); o motorista não tem o item no menu |

**RN reescritas por estes ajustes:** RN-F8.08 (ajuste 14), RN-F8.17 (11), RN-F8.19 (T-2: a ordem), RN-F8.20 (10), RN-F8.28 (T-1), RN-F8.30
(T-7), RN-F8.34 (T-1 e **RN-F8.34b**: destino desativado no meio → aviso e seleção zerada), RN-F8.36 (T-3, 19).

## Fechamento

(preenchido no fim: divergências, verificação final medida, retro de 4 números, próxima tarefa detalhada)
