# Almoxarifado — Etapa 19: auditoria dos cadastros e das configurações (design)

Data: 2026-08-28 · Branch: `desenvolvimento-almoxarifado`
Origem: handoff do plano da Etapa 18 (candidata 1) + `specs/modulo-almoxarifado/23-perfis-seguranca-auditoria/README.md`.

## Decisão de escopo (Fase 0 — medida em 2026-08-28)

A medição cobriu os 23 endpoints e achou seis coisas que impedem "sair auditando tudo igual":

1. **`PUT /configuracoes` manda as 18 chaves a cada clique em Salvar**, mudadas ou não (o
   front monta o payload com `CAMPOS.forEach`). Auditar por chave daria **18 linhas por
   save, quase todas "de X para X"** — ruído que enterra o sinal. E `entidade_id` é INTEGER
   enquanto a chave é TEXT.
2. **`PUT /configuracoes/alertas-estoque` grava SEGREDOS** (`alertas_smtp_pass`,
   `alertas_whatsapp_api_key`). Log de auditoria com senha em claro seria pior que a
   ausência de log.
3. **`POST /localizacoes` tem DOIS caminhos:** cria, ou **reativa** uma localização excluída
   com o mesmo código. Auditar os dois como `CRIACAO` mentiria — a reativação tem
   `dados_anteriores` (a linha inativa) e a criação não.
4. **Quatro rotas não checam existência** (`PUT`/`DELETE` de tipo-material, `DELETE` de
   localização e de família): id inexistente responde 200 hoje. Auditar sem isso registraria
   um ato que não aconteceu — o mesmo defeito que a Etapa 18 corrigiu no `DELETE /materiais`.
   `this.changes` está disponível **nessas quatro** e nunca é consultado. *(Correção da
   revisão do plano: a generalização "está disponível nos callbacks" era falsa — o callback
   do cascata do rename de setor e os dos quatro POSTs são **arrow**, sem `this`.)*
5. **`PUT /setores/:id` renomeia N localizações em cascata, fire-and-forget** (callback
   vazio, erro ignorado, `changes` nunca lido). O efeito colateral mais amplo do escopo não
   deixa rastro e a rota **nem sabe quantas linhas mexeu**.
6. **`PUT /configuracoes/estoques-minimos` e `/tipos-material` não são configuração** — são
   edição em lote de `materiais_almoxarifado`. Auditam como `material`, N linhas. E o segundo
   **não tem nenhum chamador no client** (rota órfã).

**Escopo escolhido:** auditar os 23 endpoints com o tratamento honesto de cada classe, mais
as três correções de comportamento que a auditoria exige para não mentir.

- **Cadastros** (tipos de material, localizações, setores, famílias, centros de custo,
  almoxarifados): `CRIACAO`/`EDICAO`/`EXCLUSAO` com de/para. Localização ganha `REATIVACAO`.
- **Configurações**: **uma linha por PUT, com o DIFF apenas** (`dados_anteriores`/`dados_novos`
  contendo só as chaves que mudaram), `entidade: 'configuracao'`, `entidade_id: null`.
  PUT sem nenhuma mudança efetiva **não gera linha**.
- **Segredos**: nunca o valor. O diff registra `alertas_smtp_pass: '(alterado)'`.
- **Lotes de material** (`estoques-minimos`, `tipos-material`): `entidade: 'material'`, uma
  linha por material efetivamente alterado, com de/para dos campos tocados.
- **Permissões de setor**: `entidade: 'setor_permissao'`, de/para completo via
  `getPermissoesSetor` (já exportada) — auditado **na rota**, porque o serviço não recebe
  `user` e mudá-lo custaria duas assinaturas.
- **Correções de comportamento exigidas pela honestidade do log** (as três):
  (a) as 4 rotas sem 404 passam a checar `changes === 0` e responder 404 — e só auditam o que
  mudou; (b) o cascata do setor deixa de ser fire-and-forget e passa a reportar quantas
  localizações renomeou (que vai para o log); (c) `extended.js` passa a importar `audit` como
  objeto, como `routes/almoxarifado.js` fez na Etapa 18 — sem isso o teste de "auditoria
  quebrada não derruba o ato" é vazio naquele arquivo.

**Fica FORA, declarado:**

- **A janela sem permissão do `salvarPermissoesSetor`** (DELETE-all + N INSERTs sem
  transação — durante a janela o setor fica com zero permissões, e isso é controle de
  acesso). É corrida **pré-existente** e o conserto é transação no serviço, não auditoria;
  **declarada na letra C**, não corrigida aqui, para não misturar mudança de semântica de
  acesso com auditoria.
- **As outras corridas medidas** (`PUT /configuracoes` sem transação; TOCTOU do ramo de
  reativação; sonda de código de família) — mesmas razões, declaradas.
- **A tela de auditoria** — segue sendo a B33 da Etapa 18, esperando decisão do usuário.
- **Remover a rota órfã** `PUT /configuracoes/tipos-material` — nomeada na spec como
  candidata a remoção; apagar rota sem confirmar quem a chama (integração? script?) é
  irreversível de graça.
- **Normalizar as ações antigas** (`CRIAR` vs `CRIACAO`, `ATUALIZAR` vs `EDICAO`): o módulo
  já é inconsistente (medido: `EDICAO` 1 ocorrência no módulo inteiro, `ATUALIZACAO` 1,
  `ATUALIZAR` 1 — não há majoritário a congelar). Esta etapa usa `CRIACAO`/`EDICAO`/`EXCLUSAO`
  para as **entidades novas** e respeita o verbo já existente **dentro** de cada entidade
  antiga (`material` continua com `ATUALIZACAO`/`DESATIVACAO`) — consistência dentro da
  entidade ganha da consistência entre entidades. A dívida fica registrada; reescrever as
  antigas mexeria em log histórico.

## Regras de negócio (RN)

- **RN-01 — Todo cadastro auditado com de/para.** Criar, editar e excluir (soft) de tipo de
  material, localização, setor, família, centro de custo e almoxarifado geram linha com
  `dados_anteriores` (null na criação) e `dados_novos`.
- **RN-02 — Auditoria nunca derruba o ato** (padrão das etapas 17/18: pós-escrita,
  try/catch → `console.error`). Vale nos dois arquivos de rota.
- **RN-03 — Só audita o que mudou.** Rota que não alterou linha nenhuma (id inexistente)
  responde 404 e **não** audita.
- **RN-04 — Configuração audita o DIFF, uma linha por PUT.** 18 chaves enviadas com 1
  alterada → 1 linha com 1 chave no de/para. Zero alterações → zero linhas.
- **RN-05 — Segredo nunca vai para o log.** `alertas_smtp_pass` e
  `alertas_whatsapp_api_key` aparecem no diff como `'(alterado)'`, nunca o valor.
- **RN-06 — Edição em lote de material audita por material alterado**, não por request.
- **RN-07 — Permissão de setor audita o de/para completo** (lista anterior × nova), porque é
  controle de acesso.
- **RN-08 — O cascata do setor é contado e registrado.** Renomear um setor diz no log
  quantas localizações foram renomeadas junto.

## Arquitetura

Nada de serviço novo. Auditoria pós-escrita nos handlers, no molde já estabelecido:

- **Estilo callback** (os 12 de cadastro em `routes/almoxarifado.js`): molde de
  `routes/almoxarifado.js:2968-2977` — `.then(() => audit.registrarAuditoria(...))
  .catch(err => console.error(...)).finally(() => res.json(...))`.
- **Estilo async** (configurações e os de `extended.js`): try/catch como na Etapa 18.
- **Import por objeto** (`const audit = require('.../audit')`) nos dois arquivos — em
  `extended.js` isso é mudança nova (hoje é desestruturado).

**Diff de configuração** — função pura nova em `services/almoxarifado/configDiff.js`:
`calcularDiff(anteriores, novos)` → `{ anteriores, novos }` só com as chaves que mudaram,
com segredo **sempre** mascarado (a lista é interna, não um 3º argumento opcional — correção
da revisão: `alertas_smtp_pass` é chave semeada e pode ser gravada pela rota genérica também,
então mascaramento opt-in deixaria um buraco). Itera `Object.keys(novos)`, nunca a união.
Testável sem HTTP e reusada pelas rotas 13/14/15.

**Entidades novas:** `tipo_material`, `localizacao`, `setor`, `familia`, `configuracao`,
`centro_custo`, `almoxarifado`, `setor_permissao` (snake_case singular, convenção do módulo).

## Testes

- Por classe, não por endpoint (senão são 23 arquivos): `auditoriaCadastros.api.test.js`
  (os 6 cadastros: criação/edição/exclusão + RN-03 nas 4 rotas sem 404 + `REATIVACAO`),
  `auditoriaConfiguracoes.api.test.js` (RN-04 diff, RN-05 segredo, PUT sem mudança não
  audita, RN-06 lotes de material), `auditoriaPermissoesSetor.api.test.js` (RN-07 + bulk).
- `configDiff.test.js`? Não — é backend; o teste da função pura entra dentro do arquivo de
  API correspondente (a base não tem runner de teste unitário de serviço fora de
  `test:almoxarifado`).
- RN-02 versionada por stub do `audit.registrarAuditoria` **nos dois arquivos** (é o que
  prova o import por objeto).
- Controle positivo obrigatório em cada teste que passar de primeira.

## O que muda em cada camada

| Camada | Mudança |
|---|---|
| `services/almoxarifado/configDiff.js` | novo (função pura do diff + máscara de segredo) |
| `routes/almoxarifado.js` | import por objeto já existe; 12 cadastros + 5 configurações auditando; 404 nas 4 rotas; cascata do setor contado |
| `routes/almoxarifado/extended.js` | import `audit` por objeto; centros de custo, almoxarifados e permissões de setor auditando |
| `specs/23` | o parágrafo de "Buracos que restam" reescrito no padrão `~~riscado~~ — PAGO na Etapa 19` (a linha 44 é prosa, não item de checklist — correção da revisão); dívida das ações antigas, a rota órfã e o `EXCLUSAO` de linha já inativa nomeados |
