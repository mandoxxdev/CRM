# Frota — Etapa 8: administrador pela tela, destinos cadastrados, condutor do carro de funcionário, origem GMP e abastecimento sem foto — design

> Escrito em 2026-10-28 na Fase 1 da skill `desenvolver-etapa`, a partir de cinco pedidos do André (mensagem do dia, com a sugestão
> do motorista colada). Nenhum dos cinco tem spec: cada um vira uma (19 a 22 em `specs/modulo-frotas/`), e a etapa entrega os cinco.
> Decisões tomadas sem consulta, reversíveis, registradas na letra **B** de `docs/frotas/novidades-por-etapa.md` (B76+).

## Os cinco pedidos, no original

1. "nas permissoes do modulo, permitir setar como admin do modulo (alem de motorista e consulta)".
2. "No abastecimento pode retirar o campo de foto".
3. "Carros destinados a funcionários, com saída para trabalho externo. Saindo de onde, sempre será da GMP. Indo para onde — poderia
   ser Destino".
4. "Precisamos informar o condutor, para os casos de veículos liberados para funcionários".
5. (do motorista) cadastrar destino novo direto no campo "Indo para onde (Destino)", com um botão **+**, sem depender do sistema.

## O que foi medido antes de desenhar (Fase 0)

- **Perfis.** `PERFIS_ATRIBUIVEIS = [CONSULTA, MOTORISTA]` (`permissions.js:54`); o `PUT /perfis-usuario/:id` grava em
  `perfil_frota_usuario`. **`ADMIN_FROTA` não pode morar só nessa tabela:** `syncModuleAdminProfiles` (`systemPermissions.js:232`)
  roda em **todo** save do cadastro de usuário e, quando `admin_modulos` não tem `frota`, faz `DELETE … WHERE perfil = 'ADMIN_FROTA'`.
  Um administrador dado pela tela do Frota seria **desfeito** no próximo save daquele usuário por qualquer motivo (trocar telefone).
  A fonte de verdade do administrador é `usuarios.admin_modulos` (JSON `["frota"]`): `getPerfilFromUser` e `perfilFrota` (tela) leem
  `isModuleAdmin(user, 'frota')` **antes** de `perfil_frota`. Logo, dar administrador pela tela = escrever `frota` em `admin_modulos`
  (e chamar o sync, que grava a linha espelho). `enrichUserFromDb` relê `admin_modulos` a cada pedido (`leituraDeUsuarios.js:67-77`).
- **`classificarPerfilFrota`** devolve `origem: 'forcado'` para superadmin, `role admin` **e** admin do módulo — a tela mostra a etiqueta
  **Administrador** sem seletor para os três. Para o pedido 1, o admin do módulo precisa ser **distinguível** dos outros dois (ele é o
  que a tela passa a dar e tirar).
- **Abastecimento no portal:** `AbastecimentoForm` tem `FotosAntesDeSalvar` ("Foto do cupom") e `subirFotosEAvisar('abastecimento')`
  (`FrotasPortalMotorista.js:473,502,551`); Meus registros mostra `FotosDoLancamento` com **+ Foto** nos abastecimentos (`:636`). O
  servidor aceita `entidade = 'abastecimento'` em `POST /anexos` e a lista do gestor tem a coluna **Fotos** (`frotasEntityConfigs.js:237`).
  Testes que travam o campo: `FrotasFotos.test.js:118` (legenda "Foto do cupom") e os de RN-F5.09/5.10 que percorrem o abastecimento.
- **Saída no portal:** `origem`, `destino`, `finalidade` são três `<input type="text">` opcionais (`:320-331`), mandados só se
  preenchidos; o servidor grava `b.origem || null` (`portalService.js:256-267`). A viagem tem `origem TEXT` (safeAlter `:283`) e
  `destino TEXT`. A planilha tem **uma** coluna Condutor (= `motorista_nome`), Origem e Destino (`exportacaoService.js:77`).
- **Veículo:** tem `motorista_id` ("Condutor responsável") mas **nenhuma marca** de "carro liberado para funcionários". O portal só
  conhece motorista pelo vínculo `usuario ↔ frotas_motoristas` (`motoristaObrigatorio`): quem registra a saída é sempre o motorista do
  vínculo. Um funcionário que pega o carro do setor **não é** motorista cadastrado — hoje não há onde dizer quem dirigiu.
- **Destinos:** não existe tabela; `crudRoutes(base, list, create, update, delete, { createPerm, updatePerm, deletePerm })`
  (`routes/frotas.js:128`) monta GET/POST/PUT/DELETE de uma entidade com uma linha. A página genérica `FrotasEntityPage` + uma
  config em `frotasEntityConfigs.js` dá a tela do gestor (lista, Novo, Editar, Excluir, Consulta só leitura) sem código novo de tela.
  O formulário genérico tem tipos `select`, `textarea`, `checks` (grupo de checkboxes), `number`, `datetime-local`, texto.
- **Banco de produção:** o módulo nunca foi usado (0 veículos). Não há dado a migrar; o risco de cada mudança é zero em dado existente.

## Desenho, pedido a pedido

### A — Administrador de Frota pela tela (feature 19)

**Regra central:** o perfil **Administrador de Frota** passa a ser uma **terceira opção** do seletor de **Frota → Perfis de acesso**,
ao lado de Motorista (padrão) e Consulta. Por baixo, escolher Administrador escreve `frota` em `usuarios.admin_modulos` e chama
`syncModuleAdminProfiles`; escolher Consulta ou Motorista para quem **é administrador só por `admin_modulos`** tira o `frota` de lá,
chama o sync (que apaga a linha espelho) e grava o perfil pedido. **Superadmin e `role admin` continuam forçados** (409
`PERFIL_FORCADO`): não há como tirar isso pelo Frota, e a mensagem passa a dizer só esses dois.

- `classificarPerfilFrota` ganha a origem **`admin_modulo`** (admin do módulo que **não** é superadmin nem `role admin`); `forcado` fica
  para os outros dois. O efetivo dos dois é `ADMIN_FROTA`.
- `PERFIS_ATRIBUIVEIS = [CONSULTA, MOTORISTA, ADMIN_FROTA]`; `GET` devolve os três em `perfis`.
- `MSG_PERFIL_INVALIDO` passa a citar os três.
- RN-F2.13 (`PROPRIO_PERFIL`) **continua e ganha importância**: um administrador que se rebaixasse perderia `configurar` no ato. Como
  ninguém se rebaixa, sempre sobra pelo menos quem está logado — não precisa de "último administrador".
- **Quem pode dar administrador:** quem tem `configurar` (ADMIN_FROTA). Isso permite a um administrador do módulo fazer outro, sem ser
  administrador do sistema. É **exatamente** o pedido; o alcance é só o item `frota` de `admin_modulos` (nada mais do usuário muda), e
  é reversível pela mesma tela ou pelo cadastro de usuário. Registrado (B76).
- Tela: o seletor ganha "Administrador de Frota"; escolher pede confirmação (`window.confirm`) *"Dar Administrador de Frota a <nome>?
  A pessoa passa a fazer tudo no módulo, inclusive dar perfis."* — reversível, mas é a única opção que amplia poder; Cancelar não chama o
  servidor. A etiqueta **Administrador** sem seletor fica só para `forcado`. Toast *"Perfil definido: Administrador de Frota"*.
  Texto de ajuda: *"Administrador de Frota pode ser dado e tirado aqui; superadmin e administrador do sistema, não."*
- O usuário afetado vê o menu novo como na Etapa 2 (próximo pedido; portal e painel renovam quando divergem — C11 continua).
- **Spec que estava errada:** o `README` da feature 15 e o plano da Etapa 2 dizem "ADMIN_FROTA não: vem do cadastro de usuário" — deixa
  de ser verdade; a correção é dita lá.

**Descartado:** gravar `ADMIN_FROTA` só em `perfil_frota_usuario` (o sync apaga no próximo save do usuário — medido acima); exigir
administrador do sistema para dar administrador do Frota (contraria o pedido; a tela do Frota é do administrador do Frota).

### B — Abastecimento sem foto (feature 20)

- Portal: o formulário de **Abastecimento** perde o grupo **Foto do cupom** (e o envio das fotos depois do 201). Em **Meus registros**,
  o abastecimento perde o **+ Foto**; se um abastecimento antigo tiver foto (não há nenhum em produção), as miniaturas e o **Remover
  foto** continuam — **só não entra foto nova**.
- Saída, Retorno e Inspeção **não mudam** (RN-F5.09 continua para o registro).
- Servidor **não muda** (`POST /anexos` continua aceitando `abastecimento`; a coluna **Fotos** do gestor em Abastecimentos continua, para
  o legado e para o gestor que mandar foto pela API). Reversível: devolver o campo é restaurar um bloco JSX. Registrado (B77).
- Testes: `FrotasFotos.test.js` RN-F5.09 ("abastecimento: legenda Foto do cupom") e RN-F5.10 (+ Foto no abastecimento) **mudam de
  sentido** — passam a provar a ausência (por concessão: sabotagem que devolve o campo derruba o teste). Spec 17 ganha a nota.

**Descartado:** tirar a coluna Fotos da lista do gestor e recusar `abastecimento` em `POST /anexos` (apagaria o caminho de legado sem
ganho; o pedido foi sobre o **campo** do formulário).

### C — Saída: origem GMP, carro liberado para funcionários e condutor (feature 21)

- **Origem.** O portal deixa de perguntar "Saindo de onde": mostra a linha fixa **"Saindo de: GMP"** e **não manda `origem`**; o servidor
  grava `origem = 'GMP'` (`ORIGEM_PADRAO`, em `schema.js`) quando a saída do portal vem sem origem. Corpo com `origem` (cliente antigo,
  chamada de serviço) continua aceito. A tela do gestor (Viagens) mantém **Origem** editável, com `GMP` já preenchido na viagem nova.
- **Carro liberado para funcionários.** `frotas_veiculos.uso_funcionarios INTEGER DEFAULT 0`. No cadastro do veículo, um checkbox
  **"Liberado para funcionários (quem dirige varia; a saída pede o condutor)"**. A lista de veículos mostra na coluna Condutor
  *"Funcionários"* quando a marca está ligada e não há condutor responsável.
- **Condutor.** `frotas_viagens.condutor_nome TEXT`. No portal, escolhido um veículo **liberado para funcionários**, a Saída mostra o
  campo **"Quem vai dirigir (condutor)"**, obrigatório: vazio → 400 **`Informe quem vai dirigir (condutor)`**. Em veículo sem a marca o
  campo não aparece e o servidor aceita `condutor_nome` opcional (alguém pode dirigir mesmo assim). O cartão "Você está com o veículo…"
  ganha *", condutor <nome>"*. Na tela do gestor, Viagens ganha a coluna **Condutor** e o campo **"Condutor (funcionário)"**, opcional —
  o escritório lança atrasado e nem sempre sabe (B78). A planilha mantém **uma** coluna Condutor: `condutor_nome` se houver, senão o
  motorista — é o formato do Excel de hoje.
- O **motorista do vínculo** continua sendo quem registra (a viagem é dele: retorno, Meus registros, escopo). O condutor é **quem
  dirigiu**, texto livre (até 120 caracteres, aparado). Não é vínculo com usuário — funcionário não precisa de login.

**Descartado:** seletor de funcionário (lista de `usuarios`) — funcionário sem login não apareceria, e o pedido é "informar", não
"vincular"; exigir condutor também no formulário do gestor (B78); marcar o uso por **tipo** de veículo (um mesmo tipo tem carro do
motorista e carro do setor).

### D — Destinos cadastrados pelo portal (feature 22)

- Tabela **`frotas_destinos`** (`id, nome NOT NULL, endereco, ativo DEFAULT 1, criado_por_id, criado_por_nome, created_at,
  updated_at`) com índice único **`nome COLLATE NOCASE WHERE ativo = 1`** (dois "Cliente X" não cabem; acento conta como letra
  diferente — declarado).
- Rotas por `crudRoutes('destinos', …)`: **GET** `/api/frotas/destinos` (todo perfil do módulo; `?search=`, `?inativos=1` traz os
  desativados), **POST** `registrar_operacoes` (motorista e gestor — o pedido é o motorista cadastrar na hora), **PUT** e **DELETE**
  (lógico, `ativo = 0`) `gerenciar_veiculos`.
- `frotas_viagens.destino_id INTEGER` (referência, nulo permitido). O texto **`destino` continua gravado** (nome do destino na hora): a
  planilha, a busca e as viagens antigas não mudam; desativar ou renomear um destino não reescreve viagem.
- **Portal:** "Indo para onde (destino)" vira um **seletor** dos destinos ativos (`inicio.destinos`) com o botão **+ Novo destino** ao
  lado; o botão abre, ali mesmo, **Nome** (obrigatório) e **Endereço** (opcional) com **Adicionar** / **Cancelar**. Adicionar →
  `POST /destinos` → o destino entra na lista e fica **selecionado**. Nome que já existe → 409 `DESTINO_DUPLICADO` com o destino
  existente no corpo → a tela **seleciona o existente** e avisa *"Esse destino já existia — selecionado."*. A saída manda `destino_id`;
  o servidor resolve o nome (destino inexistente ou desativado → 400 **`Destino não encontrado`**) e grava `destino` + `destino_id`.
  Corpo com `destino` texto e sem `destino_id` continua aceito (compatibilidade; escritório).
- **Gestor:** tela **Frota → Destinos** (página genérica: Nome, Endereço, Cadastrado por, Status; Novo/Editar/Excluir; Consulta só
  leitura; "Excluir" desativa). No formulário de Viagens o **Destino** continua texto livre (o escritório digita o que a nota diz) — B79.

**Descartado:** destino só por texto com sugestões (não dá ao gestor uma lista para corrigir); exigir aprovação do gestor para
destino novo (contraria "sem depender de alterações prévias"); apagar de verdade (viagem antiga aponta para ele).

## Fiação que a integração tem de provar

- **A:** `PUT ADMIN_FROTA` → **o próximo pedido** do usuário (pelo `enrich` real de `leituraDeUsuarios`, não só pelo stub do harness)
  abre `GET /perfis-usuario` (200) — e, rebaixado para Consulta, toma 403. É o molde de `frotasPerfisIdaEVolta.api.test.js` (login real).
  Também: o `PUT /usuarios/:id` do núcleo depois de dar administrador pela tela **não** desfaz (o sync lê `admin_modulos` com `frota`).
- **C + D:** uma saída do portal num veículo liberado, com destino criado pelo `+` → viagem com `origem 'GMP'`, `destino` = nome,
  `destino_id`, `condutor_nome` → `GET /viagens` do gestor mostra → planilha (`abaViagens`) com Condutor = condutor → o retorno fecha a
  viagem do motorista do vínculo normalmente.

## O que esta etapa não faz

Seção 3 do formulário; os 4 veículos; alerta de consumo da máquina (D12); a pergunta do km menor no gestor (B36); tela antiga "Novo
Checklist" (C5); trilha de quem deu/tirou administrador (B26 continua); destino com coordenadas/mapa.
