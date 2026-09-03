# 23 — Perfis, Segurança e Auditoria

> **Status:** 🟡-forte (**Etapa 25, `6209037..9027c36`: a perna *Segurança* FECHA como
> funcionalidade** — a movimentação passou a registrar **dispositivo** (`ip`, `ip_proxy`,
> `user_agent`, com `x-forwarded-for` tratado, alcançando os 28 call sites **e** o estorno do
> cancelamento) e a **retenção de backup virou configurável** (`backup_manter_dias` deixou de ser
> dado morto; piso de 3 e teto de 10; acompanhantes órfãos varridos nos dois formatos de nome; e o
> prune saiu de um lugar onde **matava o boot de instalação nova**). **A feature CONTINUA
> 🟡-forte.** ⚠️ **E DUAS linhas desta spec estavam ERRADAS, na mesma perna:** *"bloquear
> lançamento retroativo"* **nunca foi tarefa** (`created_at` é `CURRENT_TIMESTAMP` e nenhuma rota
> aceita data do cliente — o retroativo é impossível, então bloqueá-lo também é) e *"justificativa
> obrigatória em operações excepcionais"*, que a Etapa 23 classificou como **"funcionalidade não
> construída"**, **já estava construída em cinco camadas** (16 dos 33 tipos de movimento recusados
> pelo motor, 10 `throw` em serviço, 2 schemas Zod, 1 validação de rota, 1 `NOT NULL` de tabela).
> As duas foram reescritas como `[~]`, não apagadas. **O que passou a bloquear 🟢 é a perna
> *Perfis*** — a metade aberta do item 131 (**B56**) e os dois itens dependentes da spec 28 —,
> e **não** mais a *Segurança*, cujo único resto (dupla conferência em material crítico) é
> **decisão de negócio**, letra **B**. Ver o bloco "Etapa 25" no fim) · antes 🟡-forte
> (**Etapa 24, `a81e51a..4680daa`: a perna *Perfis* COMECOU** — perfil `QUALIDADE` criado com `visualizar`+`inspecionar` e a lista negativa provada por controle positivo; a revogação de perfil passou a auditar e a concessão ganhou o `dados_anteriores`; `ADMINISTRADOR` saiu do seletor; e a aba, que tinha **zero** teste, ganhou 7 + a integração com a tela de auditoria. **A feature CONTINUA 🟡-forte.** ⚠️ **E esta spec ESTAVA ERRADA num item que custou caro:** o checklist trazia *"UI de atribuição de perfil por usuário"* desmarcado, e a tela **existe desde 2026-08-05** (`6018f0a`) — o design da Etapa 24 leu este item, somou a uma varredura incompleta do client e desenhou a etapa inteira sobre a premissa "a tela não existe", mandando construir uma segunda. A Fase 2 derrubou a premissa e o escopo foi reescrito no meio da etapa. Ver o bloco "Etapa 24" no fim. **O item 131 (perfil QUALIDADE) NÃO ficou integralmente pago e por isso continua desmarcado:** `bloquear/liberar sob desvio` usa `ajustar_estoque`, que o perfil não recebeu — dois dos três botões de `/almoxarifado/inspecoes` seguem barrados e `POST /materiais/:id/bloquear` dá 403, com a decisão declarada na letra **B56**) · antes 🟡-forte (**Etapa 23, `0fe8d02..4f1aeb9`: os DOIS buracos de rastro que a Etapa 22 nomeou como "o que falta para 🟢" estão PAGOS** — `PUT /configuracoes` virou tudo-ou-nada e `EXCLUSAO`/`DESATIVACAO` de linha já inativa parou de ser gravada, nas **cinco** rotas. **A feature CONTINUA 🟡-forte, e o que falta para 🟢 mudou de item OUTRA VEZ** — a decisão e a correção da afirmação anterior estão no bloco "Etapa 23" no fim. Em uma linha: a **perna de auditoria** desta feature não tem mais defeito conhecido, mas a feature são **três pernas** (Perfis, Segurança e Auditoria) e as duas primeiras têm **dez itens desmarcados** que não são decisão de negócio — são funcionalidade não construída. A Etapa 22 escreveu "o que falta para 🟢 são esses dois", e **isso estava incompleto: ela pesou só a perna de auditoria**) · antes 🟡-forte (**Etapa 22, `8c6ffbe..169458d`: a TELA de auditoria — o item que as etapas 18, 19, 20 e 21 nomearam como "o que falta para 🟢" — está ENTREGUE.** A feature **continua 🟡-forte e NÃO vira 🟢**, e a decisão está escrita no bloco "Etapa 22" abaixo: o que sobra não é mais "falta leitor", são quatro itens de **outra natureza** — dois deles decisão de negócio pendente do usuário (o volume do log G8, a normalização dos verbos antigos), um deles um buraco de rastro medido e não pago (`PUT /configuracoes` grava chave a chave sem transação; falha no meio deixa parte gravada **sem** linha de histórico) e o `EXCLUSAO` de linha já inativa. Um deles — o ato parcial sem rastro — é a trilha **mentindo por omissão**, e trilha que mente não fecha em 🟢) · antes 🟡-forte (inalterado pela Etapa 21, que é do **núcleo do CRM** e não desta feature — ver o bloco "Etapa 21" no fim; a feature continua com a TELA de auditoria como o que falta para 🟢) · antes 🟡-forte (Etapa 20: os **três** buracos de exposição que esta spec nomeava estão pagos; resta a TELA de auditoria e os itens nomeados abaixo) · antes 🟡-forte (Etapa 19: os 23 endpoints de cadastro/configuração auditam) · antes 🟡 — sistema de permissões robusto; auditoria em uso pelos fluxos principais desde as Etapas 3–6 (os dois buracos daquela auditoria foram PAGOS — Etapa 9 e Etapas 18/19) · **Spec original:** seções 28, 29
> **Última atualização:** 2026-08-29 (**Etapa 24, `a81e51a..4680daa`: a perna Perfis começa** — `QUALIDADE` em `permissions.js` (`a81e51a`), a revogação auditando com `EXCLUSAO` e o `dados_anteriores` nos dois caminhos (`9f7c309`), `ADMINISTRADOR` fora do seletor com a razão visível e os 7 primeiros testes da aba (`b13de4a`), a integração que dá e tira perfil e lê pela tela-contrato (`b9a5848`) e o rótulo do perfil no 403 do client (`4680daa`); ver o bloco "Etapa 24" no fim). Antes: 2026-08-28 (**Etapa 23, `0fe8d02..4f1aeb9`: a trilha para de mentir por omissão e por excesso** — o retry de `SQLITE_BUSY` para de responder erro e gravar assim mesmo (`0fe8d02`), `PUT /configuracoes` vira um `UPDATE` único com `CASE` (`b6b7b24`/`d507ccc`), as **cinco** rotas de exclusão distinguem "não existe" de "já inativa" (`9858bec`) e a leitura pela tela-contrato prova que a trilha mostra **um** ato (`4f1aeb9`); ver o bloco "Etapa 23" no fim e o checklist "Trilha honesta"). Antes: 2026-08-28 (**Etapa 22, `8c6ffbe..169458d`: a trilha ganha leitor** — tela `/almoxarifado/auditoria` com os quatro filtros novos, o de/para calculado no servidor, a rota de opções alimentada pelo banco e os **três índices** que a tabela nunca teve; ver o bloco "Etapa 22" no fim e o checklist "Auditoria visível"). Antes: 2026-08-28 (Etapa 21, `d5c8d3a..07a4b1c`: **nada desta feature mudou** — a etapa é do núcleo do CRM e fecha os itens que a Etapa 20 empurrou para cá dizendo "é do core"; registrada no bloco "Etapa 21 — o que era do núcleo" no fim deste arquivo, e o item de backup do checklist de Segurança ganhou a medição que faltava). Antes: 2026-08-28 (Etapa 20, `1b0f0e9..a3f5135`: a rota de foto de material para de mentir sucesso, de deixar órfão e de não auditar; a leitura de configurações para de devolver segredo em claro e o PUT genérico para de aceitá-lo; ler o mapa de permissões por setor passa a exigir o mesmo que escrevê-lo). Antes: 2026-08-28 (Etapa 19, `a574b3a..55e4144`: os 23 endpoints de cadastro e configuração passam a auditar, com diff nas configurações, segredo mascarado e três correções de comportamento que o log exigia). Antes: 2026-08-28 (Etapa 18: a trilha do inventário). Antes: 2026-08-11 — auditoria de cauda: corrigida a afirmação "auditoria não é usada em produção" (era verdade em 2026-08-02, foi superada pelas Etapas 3–6 e ninguém atualizou aqui), corrigida a contagem de ações (14, não 15) e nomeados os dois buracos reais de auditoria que restam

## Etapa 33 — os uploads legados param de ser públicos (`13dfd4f..65811d2`)

**Furo fechado: C42.** Os dois `express.static` de `uploads/almoxarifado`
(`routes/almoxarifado.js`) ficavam em prefixo **diferente** do `/api/almoxarifado` autenticado, e
por isso não passavam por `authenticateToken` nem por `checkModulePermission`. Deslogado, com a
URL na mão, qualquer um baixava certificado de fornecedor, comprovante de sucateamento,
certificado de calibração, foto de material, foto de ocorrência e **a imagem da assinatura de
quem retirou material**. A defesa era o nome do arquivo (`Date.now()` + `random*1e9`):
obscuridade, não controle.

**Entregue:** `services/almoxarifado/urlUpload.js` — HMAC-SHA256 sobre `nome:exp`, truncado em
128 bits, com `exp` em balde de 5 min e validade efetiva de 15 a 20 minutos. Um middleware
verifica antes dos dois `static`, e um **fecho 404** vem depois deles. As três famílias exibidas
passam a receber a URL já assinada do servidor: foto de material (`materialPhoto.js`),
certificado de lote (`lotService.listarLotesDoMaterial`) e assinatura de entrega
(`deliverySignatureService`).

**Decisões que precisam sobreviver a quem ler isto depois:**

1. **`?token=` foi RECUSADO, e não por esquecimento.** `authenticateToken`
   (`server/index.js:2874`) aceita o JWT na query, e usá-lo teria sido uma linha. Esta base já
   havia recusado esse caminho com raciocínio escrito em
   `client/src/components/almoxarifado/RelatoriosAlmoxarifado.js:34-37`: o JWT não expira em
   minutos, abre o CRM inteiro, e iria para o histórico do navegador, o `Referer` e o log do
   nginx. **A assinatura desta etapa não é credencial de sessão** — vale para um arquivo por
   poucos minutos.
2. **Toda falha responde 404, nunca 401 ou 403** (RN-07). Um 401 confirmaria a existência do
   arquivo, que é exatamente a informação que a obscuridade protegia por acidente.
3. **`MATERIAL_PHOTO_API_PREFIX` saiu do `module.exports` de `materialPhoto.js`.** Enquanto ele
   fosse exportável, qualquer serviço montava `prefixo + nome` e devolvia URL sem assinatura com
   a suíte verde — e era isso que `deliverySignatureService` fazia. Um guard de "lançar sem
   assinador" só vale se ninguém puder contornar o assinador.
4. **`materialPhotoUrl` LANÇA quando não há assinador configurado**, em vez de devolver URL crua.
   Devolver crua seria o furo de volta, e de volta em silêncio.
5. **O client parou de montar endereço.** `resolveMaterialPhotoUrl` devolve `''` para o que não
   for URL do servidor: fabricar o endereço trocaria "sem foto" por "foto quebrada" — mesmo
   resultado visual, impossível de rastrear.

**⚠️ Uma afirmação da Fase 0 desta etapa estava ERRADA e foi corrigida durante a execução:** o
design dizia que `materialPhoto.js` era "o ponto único" da URL da foto. Não era —
`routes/requisicoesMaterial.js` devolvia `itens[].foto` **cru**, sem `enrichMaterialRow`, e é o
que a tela de Minhas Requisições renderiza. Sem a correção, a miniatura de todo item sumiria em
silêncio. Achado da revisão do plano.

**O que NÃO cobre:** quem já baixou continua com o arquivo (fechar a porta não recolhe o que
saiu); não há registro de quem baixou esses arquivos (só os **anexos** têm, desde a Etapa 32); e
tela aberta por mais de ~20 minutos mostra imagem em branco até recarregar — corte declarado.

## Objetivo

Perfis da spec cobertos, regras de segurança da seção 29 aplicadas (imutabilidade, estorno, histórico de cadastro, justificativas) e trilha de auditoria visível.

## O que já existe (5 camadas — detalhes em `00-fundacao-tecnica/estado-atual.md`)

1. Flags globais: `is_superadmin`, `role='admin'`, `admin_modulos` (`services/systemPermissions.js`).
2. Permissão por módulo: `checkModulePermission` + tabelas `permissoes`/grupos.
3. **8 perfis** do almoxarifado (`ACAO_PERFIS` em `services/almoxarifado/permissions.js`): ADMINISTRADOR, ALMOXARIFE, COMPRAS, PRODUCAO, ENGENHARIA, GESTOR, CONSULTA e **QUALIDADE** (criado na Etapa 24, `a81e51a`). *(Esta linha dizia "7 perfis × 14 ações"; a spec original dizia "15 ações" — contagem errada, corrigida em 2026-08-11. A contagem de ações saiu daqui de propósito: ela já esteve errada duas vezes e envelhece a cada etapa que cria uma ação — quem precisar do número conta `Object.keys(ACAO_PERFIS)`.)*
4. **A tela de atribuição de perfil por usuário** — aba *Perfis de Acesso* em `ConfiguracoesAlmoxarifado.js:2545`, no menu por `Layout.js:393`, desde `6018f0a` (2026-08-05). **Está listada aqui porque o checklist abaixo a dava como inexistente e enganou uma etapa inteira** — ver o bloco "Etapa 24".
5. Whitelist de materiais por setor (`sectorMaterialService.js`).

- Auditoria: `auditoria_log_almoxarifado` + `registrarAuditoria()`; rota `GET /almoxarifado/auditoria` (`extended.js`).
  **⚠️ Correção (2026-08-11):** esta spec afirmava "0 linhas em produção — o front usa a rota v1 que não audita". A afirmação era verdadeira em 2026-08-02 e foi **superada pelas Etapas 3–6** sem que a spec fosse atualizada. Hoje auditam (todos com tela no front):
  - CRUD v1 de materiais: criação e edição, com `dados_anteriores`/`dados_novos` (`routes/almoxarifado.js`);
  - requisições: aprovar, aprovar-valor, rejeitar, confirmar, encerrar e excluir;
  - motor de estoque: movimentação e estorno — a tela usa `POST /movimentacoes/v2` e o cancelamento, que auditam;
  - serviços de cauda: `reservationService`, `lotService`, `receiptService`, `inspectionService` e `returnService`.

  **⚠️ Correção (2026-08-28, Etapa 18) — DUAS afirmações desta spec estavam erradas:**
  1. Ela dizia que a conclusão de conferência "faz UPDATE cru de `quantidade_atual` + INSERT
     manual de movimentação". **A primeira metade está errada desde a Etapa 10** (2026-08-22):
     o ajuste passa pelo motor como `AJUSTE_INVENTARIO`; `grep "SET quantidade_atual"` nas
     rotas devolve zero. Só a segunda metade — "sem `registrarAuditoria`" — era verdade, **e
     foi paga nesta etapa**.
  2. Ela lista "excluir" entre as requisições que auditam. **Falso:** `requisitionService.js`
     não tinha nenhuma chamada de `registrarAuditoria` (só os estornos apareciam, como
     `movimentacao`). Corrigido na Etapa 18 (`requisicao`/`EXCLUSAO`).

  **Buracos daquela auditoria (2026-08-11), estado em 2026-08-28:**
  1. ~~Conclusão de conferência/inventário sem auditoria~~ — **PAGO na Etapa 18**
     (`3893444`, `395caf3`): `entidade: 'conferencia'` com 5 ações (CRIACAO, CONTAGEM,
     RECONTAGEM, CONCLUSAO, CANCELAMENTO), todas pós-escrita e best-effort; cancelar passou a
     exigir motivo e a gravar autor/data; `aprovador_id`/`aprovador_nome` deixaram de ser
     colunas mortas.
  2. ~~`scrapService` (sobras)~~ — **PAGO na Etapa 9** (`bedce46`).

  ~~**Buracos que restam:** os ~20 endpoints de cadastro e configuração seguem sem trilha~~ —
  **PAGO na Etapa 19** (2026-08-28, `a574b3a..55e4144`): os **23** endpoints auditam, cada
  classe com o tratamento honesto — cadastros com de/para completo (`tipo_material`,
  `localizacao`, `setor`, `familia`, `centro_custo`, `almoxarifado`), configurações com
  **diff** (uma linha por PUT, só o que mudou — a tela manda 18 chaves a cada save),
  **segredo mascarado** e a URL do webhook sem a query string, edição em lote como
  `material`/`ATUALIZACAO` por material alterado, e `setor_permissao` com o de/para completo
  do mapa de acesso. Três correções de comportamento vieram junto, exigidas para o log não
  mentir: 404 nas 4 rotas que respondiam sucesso para id inexistente, o cascata do rename de
  setor contado (era fire-and-forget), e o import de `audit` por objeto no `extended.js`
  (sem ele o teste de "auditoria quebrada não derruba o ato" era vazio naquele arquivo).

  **O que continua aberto:**
  - ~~**A rota `GET /almoxarifado/auditoria` não é consumida por nenhuma tela** — a trilha, agora
    muito mais rica, segue sem leitor prático (letra B33).~~ — **PAGO na Etapa 22**
    (`0a57fe1` a tela; `8dda8de`/`71582ec` os filtros e a rota de opções). Mantido riscado, não
    apagado, para quem lembrar da pendência confirmar que ela fechou e com qual commit.
    **Continua verdade** o resto do parágrafo original: o gate é `configurar`, que aceita
    administrador do sistema — grupo ligeiramente mais amplo do que o que a tela de
    configurações exige (`canConfigureAlmox`); nota, não risco. E **o Gestor continua sem ver a
    trilha** (metade (b) da B33, ainda em aberto e ainda decisão do usuário).
  - **Volume:** o histórico de `setor_permissao` grava a lista inteira duas vezes por save
    (~46 KB medidos com 200 famílias) — letra G8.
    ~~dívida a resolver **antes** da tela~~ — **esta ordem foi invertida de propósito na Etapa
    22, e a inversão é decisão:** a tela foi construída **antes** de resolver o volume, porque
    reduzir o que se grava é mudar o contrato de auditoria (*o que deixa de ser registrado?*),
    decisão de negócio do usuário, e porque a tela **torna o problema visível**, que é progresso.
    A mitigação na tela é o truncamento em **300 caracteres com a contagem do resto**
    (`169458d`, achado A7 da revisão adversarial: sem limite, o token de 46 KB **sem espaços**
    vira um bloco que o `.almox-table-container` — `overflow: hidden` — clipa pelo começo, e o
    valor fica ilegível). **G8 segue aberto.**
  - ~~**Rastro do ato parcial:** `PUT /configuracoes` grava chave a chave sem transação; se
    falhar no meio, parte fica gravada **sem** linha de histórico.~~ — **PAGO na Etapa 23**
    (`b6b7b24`, `d507ccc`): um `UPDATE` só com `CASE`, atômico por statement, **sem** transação
    (a razão está no bloco "Etapa 23" e na letra B51 das novidades). Mantido riscado, não
    apagado, para quem lembrar da pendência confirmar que fechou e com qual commit.
    **Pré-requisito que ninguém tinha visto:** sem `0fe8d02` este item **não fecharia** — o
    retry de `SQLITE_BUSY` chamava o callback de quem pediu em **toda** tentativa, então a rota
    respondia 500, pulava a auditoria, e o retry aplicava a escrita depois. É o defeito nº 1
    letra por letra, por um caminho que o `UPDATE` único não fecha.
  - ~~**`EXCLUSAO` de linha já inativa** é registrada mesmo sem excluir nada (SQLite conta a
    linha atingida); só id inexistente vira 404.~~ — **PAGO na Etapa 23** (`9858bec`), e em
    **CINCO** rotas, não quatro: esta spec e o design da etapa só tinham visto as quatro de
    cadastro. **`DELETE /materiais/:id` tinha o mesmo defeito na entidade central do módulo** —
    gravava `DESATIVACAO` sempre que o `SELECT` achava a linha. Riscado, não apagado.
  - **Verbos do log:** o módulo já era inconsistente (`CRIACAO`/`CRIAR`,
    `EDICAO`/`ATUALIZACAO`/`ATUALIZAR`). A Etapa 19 fixou a regra — **consistência dentro da
    entidade** (`material` seguiu com `ATUALIZACAO`) e `EDICAO` só para as entidades novas —
    e introduziu `REATIVACAO` e `INCLUSAO_EM_LOTE`. Normalizar as antigas mexeria em log
    histórico; fica declarado.
    **Estado depois da Etapa 22:** o dado continua inconsistente **de propósito** e a
    normalização passou a ser **só de exibição** (`8c6ffbe`, `services/almoxarifado/auditLabels.js`):
    `GRUPOS_ACAO` junta os sinônimos, o filtro por rótulo manda **todos** os verbos do grupo que
    existem no banco, e a linha continua mostrando o verbo cru como legenda secundária — a tela
    **não esconde** a inconsistência. **Descartado** o `UPDATE` de migração: é irreversível sobre
    dado histórico, que é o que uma trilha não pode sofrer. O mapa está pronto e medido (**68
    verbos**, todos com rótulo: 45 da varredura com guarda de fronteira, 18 de `movementTypes`,
    5 chaves de `transicoes` e `CONTAGEM`/`RECONTAGEM`) — se o usuário mandar migrar, é passo
    curto. Virou a letra **B47** das novidades. **Continua aberto como decisão de negócio.**
  - **Rota órfã:** `PUT /configuracoes/tipos-material` não tem nenhum chamador no client;
    auditada mesmo assim, **candidata a remoção** (apagar sem confirmar quem chama seria
    irreversível de graça).
  - ~~**Fora do escopo, nomeados:** `POST /materiais/:id/foto` não audita e responde sucesso
    para material inexistente (deixando arquivo órfão); `GET /configuracoes` devolve
    `alertas_smtp_pass` em claro (a rota irmã de alertas já mascara); e
    `GET /setores-requisicao/:id/permissoes` expõe o mapa de acesso com `auth` apenas.~~ —
    **OS TRÊS PAGOS na Etapa 20** (2026-08-28, `1b0f0e9..a3f5135`). Mantidos riscados, não
    apagados, para que quem lembrar dos buracos confirme que fecharam e com qual commit:
    - foto de material — `6cb594e` (+ `05a5c81`): 404 `Material não encontrado`, limpeza do
      órfão em **toda** saída ≠ 200, `unlink` da foto anterior **depois** do UPDATE e em
      try/catch, auditoria `material`/`ATUALIZACAO` com o de/para do arquivo. O `05a5c81`
      fechou ainda a janela entre o SELECT e o UPDATE (`changes === 0` → 404): o SELECT
      resolve o caso comum mas não impede um 200 sobre escrita que não aconteceu;
    - `GET`/`PUT` de configurações — `a0b19c9`: as duas chaves de segredo
      (`alertas_smtp_pass`, `alertas_whatsapp_api_key`) saem como `PASSWORD_MASK` quando há
      valor e `''` quando não há, e o PUT genérico passou a **recusá-las** com 400 antes de
      qualquer UPDATE. **`alertas_whatsapp_webhook_url` ficou de fora da máscara de propósito**
      (a URL é o campo que o admin edita; mascarar faria a tela regravar a máscara como URL) —
      decisão B40, consequência declarada em C24;
    - `GET /setores-requisicao/:id/permissoes` — `8c0feff`: `isSystemAdmin || canConfigureAlmox`,
      cópia literal do PUT irmão, mensagem inclusive.
- `logs_auditoria` global (tentativas de acesso negado) + `POST /api/auditoria/tentativa-acesso`.
- Front: `systemPermissions.js`, `permissionsCache.js`, guards de rota, telas de admin.
- Teste: `permissionsCacheAdmin.test.js` (⚠️ replica lógica em vez de importar — corrigir junto do harness).

## Checklist

### Perfis (spec 28)
- [ ] Mapear perfis da spec → perfis existentes: Solicitante→PRODUCAO? · Aprovador→GESTOR · Supervisor→? · ~~Qualidade→**falta perfil QUALIDADE**~~ **Qualidade→QUALIDADE, criado na Etapa 24 (`a81e51a`)** · Auditoria/Diretoria→CONSULTA com relatórios.
      **Continua desmarcado**, e o motivo é o resto da linha: *Solicitante*, *Supervisor* e
      *Auditoria/Diretoria* seguem sem mapeamento decidido, e isso depende da spec 28, não desta.
      Só a perna de Qualidade foi paga.
- [ ] **Criar perfil QUALIDADE (ações `inspecionar`, aprovar/reprovar/bloquear/liberar sob desvio — feature 09) — PAGO PELA METADE na Etapa 24 (`a81e51a`), e por isso NÃO está marcado.**
      O perfil existe, com `visualizar` e `inspecionar`, e as quatro rotas gateadas por
      `inspecionar` (decidir o item recebido, liberar vencimento de lote, mudar status de lote e
      de série) foram medidas com um usuário QUALIDADE real no harness: nenhuma delas faz
      checagem além do `requirePermission`. Aprovar/reprovar está pago.
      **O que NÃO está: `bloquear/liberar sob desvio`.** Bloqueio/desbloqueio avulso usa
      `ajustar_estoque` (`[ADMINISTRADOR, GESTOR]`), não `inspecionar` — a spec 09 já tinha
      medido isso e esta spec nunca incorporou. Consequência medida: em
      `/almoxarifado/inspecoes`, **dois dos três botões do topo ficam barrados** para QUALIDADE
      (`InspecoesAlmoxarifado.js:197` e `:202`), e `POST /materiais/:id/bloquear` responde **403**.
      **Manter `ajustar_estoque` fora foi decisão declarada** (mexer em saldo não é ofício de
      qualidade, e abri-lo abriria junto o ajuste de inventário) — letra **B56** das novidades.
      Marcar `[x]` aqui faria a próxima sessão acreditar que o desvio está coberto. **O caminho
      limpo, se um dia for pedido, é uma ação PRÓPRIA de bloqueio por qualidade** — mesmo critério
      que o módulo já usou em `remessar_terceiro`, `ajustar_material_cliente` e
      `gerenciar_ferramentas`: quando a operação muda a natureza do risco, ela ganha ação.
- [ ] Revisar fallback perigoso: usuário sem perfil → PRODUCAO (`getPerfilFromUser` em `permissions.js`) — decidir se CONSULTA é default mais seguro.
      **Etapa 24: continua desmarcado de propósito, mas deixou de ser bloqueado por falta de
      ferramenta.** O motivo de nunca ter sido mexido era que apertar o padrão trancaria, no dia
      do deploy, todo mundo que opera sem perfil explícito. Com a tela de atribuição (que já
      existia — ver a correção de premissa no bloco "Etapa 24") e com o perfil QUALIDADE cobrindo
      um dos casos que forçavam o padrão largo, a sequência segura existe: atribuir perfil a quem
      opera → conferir quem ficou sem → trocar o padrão. **É decisão de negócio, letra B54.**
- [ ] Revisar default de módulo: usuário sem grupo ganha `comercial` (`index.js`) — fora do escopo do almoxarifado, mas registrar
- [x] UI de atribuição de perfil por usuário (hoje via sync de admin_modulos) — **⚠️ ESTE ITEM JÁ ESTAVA PAGO DESDE 2026-08-05 (`6018f0a`) E FICOU TRÊS SEMANAS DESMARCADO AQUI.**
      A aba `TabPerfisAcesso` (`ConfiguracoesAlmoxarifado.js:2545`) existe, está registrada em
      `TABS`, está no menu (`Layout.js:393`) e está descrita no manual do repositório
      (`docs/almoxarifado-manual-do-sistema.md`). **A Etapa 24 inteira foi desenhada sobre a
      premissa de que ela não existia** — premissa que veio da leitura deste checklist somada a
      uma varredura incompleta do client (procurei `perfil_almoxarifado`; o consumidor chama
      `perfis-usuario`). A Fase 2 derrubou a premissa com quatro provas e o escopo virou
      "consertar o que existe". **Sem isso, o sistema teria ganhado uma segunda tela para a mesma
      função.** Marcado agora com o hash de quem realmente o entregou (`6018f0a`), e não com um da
      Etapa 24 — o que a Etapa 24 fez foi consertar quatro defeitos dele: `PERFIS_INFO` sem o
      perfil novo (`a81e51a`), a revogação sem rastro e a concessão sem o "de" (`9f7c309`),
      `ADMINISTRADOR` oferecido no seletor (`b13de4a`) e a ausência total de teste
      (`b13de4a`, 7 cenários; `b9a5848`, a integração com a tela de auditoria).

### Segurança (spec 29)
- [x] Movimentação confirmada não pode ser excluída — **confirmado na auditoria de 2026-08-11**: não existe rota DELETE de movimentação; estorno (cancelamento) é o único caminho — feature 03
- [x] Estorno exige motivo — existe no motor e **agora tem teste**: `server/tests/api/estorno.api.test.js` (a spec pedia esse teste como pendente; coberto na Etapa 6)
- [x] Registrar usuário, data/hora e **dispositivo** (user-agent/IP na movimentação) — **Etapa 25
      (`9027c36`)**. `usuario_id`/`usuario_nome` e `created_at` já existiam; o que faltava era o
      **dispositivo**, e agora a trilha de auditoria de movimentação grava `ip`, `ip_proxy` e
      `user_agent`. `x-forwarded-for` é tratado (o primeiro IP da cadeia é o cliente) porque
      `trust proxy` **não** está configurado — sem isso, atrás do nginx toda linha diria
      `127.0.0.1`. O `user_agent` é truncado em 255 caracteres, e **campo nulo não vai para a
      trilha** (senão toda movimentação sem proxy geraria a linha `ip_proxy: — → —`).
      Cobre os **28** call sites de `registrarMovimentacao` (23 nascem dentro de serviços, sem
      acesso ao `req`) por `req.user.origem`, mais o **ESTORNO do cancelamento**
      (`stockService.js:1814`), que faz `INSERT` próprio e não passa pelo motor — deixá-lo de fora
      daria uma trilha que sabe a origem de toda movimentação **menos a do ato de reverter**.
- [x] Alterações de cadastro com histórico — **Etapa 19 (`a574b3a..55e4144`) + Etapa 23 (`9858bec`)**.
      **⚠️ Correção (2026-08-28, Etapa 23): a redação anterior deste item ESTAVA ERRADA há três
      etapas.** Ela dizia *"materiais auditam desde a Etapa 2 …; **localizações, setores, famílias
      e configs seguem sem auditoria**"* — e a segunda metade **é falsa desde a Etapa 19**, que
      deu trilha aos **23** endpoints de cadastro e configuração, com de/para completo nos
      cadastros e diff nas configurações. Ninguém atualizou este item ali, e ele ficou três etapas
      afirmando que a auditoria de cadastro não existia enquanto o resto do mesmo arquivo dizia o
      contrário. Fica dito em vez de corrigido em silêncio, porque foi exatamente assim que a
      afirmação anterior ("CRUDs v1 não auditam") enganou quem leu em 2026-08-11.
      **O que fechou o item nesta etapa:** com a Etapa 19 o histórico existia mas **registrava ato
      que não aconteceu** (exclusão de linha já inativa) e **podia não registrar ato que
      aconteceu** (o `Salvar` parcial de configurações) — as duas metades da RN-03/RN-01, pagas
      em `9858bec` e `b6b7b24`. Só agora "alterações de cadastro com histórico" é uma afirmação
      verdadeira ponta a ponta.
- [~] ~~Bloquear lançamento retroativo sem autorização (data do movimento ≠ data atual exige
      permissão)~~ — **ESTE ITEM ESTAVA ERRADO. Não é tarefa, e nunca foi.** Ele descreve um risco
      que **não existe neste sistema**, e ficou aqui desde a spec original fazendo parecer que
      havia funcionalidade faltando.
      **Não fica `[x]`** (marcar seria fingir entrega) **nem `[ ]`** (deixar desmarcado faria a
      próxima sessão procurar trabalho inexistente). Fica `[~]`: item **retirado do escopo por ser
      impossível de ocorrer**.
      **Medido na Etapa 25 (2026-08-29), com os comandos colados:**
      ```
      # a coluna de data da movimentação é gerada pelo banco, não pelo cliente
      $ grep -n "CREATE TABLE IF NOT EXISTS movimentacoes_almoxarifado" -A 14 \
          server/services/almoxarifado/schema.js
      →  created_at DATETIME DEFAULT CURRENT_TIMESTAMP     (schema.js:323)
      →  não existe coluna `data_movimentacao` — `grep -rn "data_movimentacao" server/{routes,services}` = 0 linhas

      # os 3 INSERTs de produção (os demais são de teste) e nenhum cita created_at
      $ grep -rn "INSERT INTO movimentacoes_almoxarifado" server/{routes,services}
      →  services/almoxarifado/materialService.js:255 · stockService.js:1277 · stockService.js:1760
      $ grep -rn "INSERT INTO movimentacoes_almoxarifado" -A 4 server/{routes,services} | grep created_at
      →  (vazio)

      # nenhuma rota aceita data do cliente
      $ grep -rnE "req\.body\.(data|created_at|data_movimentacao|data_lancamento)" server/{routes,services}
      →  (vazio)
      →  MovimentacaoSchema (schemas.js:84-121) não tem campo de data; a rota v1
         (routes/almoxarifado.js:901) desestrutura material_id, tipo, quantidade, motivo,
         referencia, observacoes — e nada mais.
      ```
      **Conclusão:** a data do movimento é **sempre** `CURRENT_TIMESTAMP` do SQLite. Não há
      superfície por onde um cliente informe data, então **bloquear o lançamento retroativo é
      impossível porque o lançamento retroativo é impossível**. Uma permissão para isso guardaria
      uma porta que não existe.
      **O que ficaria de verdade se alguém quisesse a garantia por escrito:** um teste de
      caracterização afirmando que `MovimentacaoSchema` **rejeita** um campo de data no body — o
      `z.object` já descarta chave não declarada em silêncio, então o teste congelaria a ausência
      em vez de deixá-la depender de ninguém acrescentar o campo por engano. Não foi feito na
      Etapa 25; é um item de **feature 03**, não desta.
- [~] Justificativa obrigatória em operações excepcionais (emergencial, desvio, ajuste) —
      **A REDAÇÃO ANTERIOR DESTE ITEM ESTAVA ERRADA, e a Etapa 23 piorou ao classificá-lo como
      "funcionalidade não construída".** Ele está construído em **cinco camadas** desde as Etapas
      2 a 9b. O item fica `[~]` — **majoritariamente pago, com lacunas nomeadas abaixo** — e não
      `[x]`, porque as lacunas são reais.
      **⚠️ E o número "77" que o design da Etapa 25 usou é para DESCARTAR, não para confirmar:**
      `grep -c "justificativa:" server/{routes,services}` dá 77 porque conta `justificativa:` como
      **chave de objeto** — ou seja, o campo sendo **repassado** pelo pipeline, não exigido. Quem
      ler "77 pontos de justificativa" e concluir cobertura total está sendo enganado pela mesma
      medição.
      **O que EXISTE (medido na Etapa 25, 2026-08-29):**
      1. **O motor** — `movementRules.js` (`REGRAS_VINCULO`) + `stockService.js:681`. **16 dos 33
         tipos de movimento** têm `justificativa: true` e são recusados com
         `` `${tipo} exige justificativa` `` quando ela falta: `AJUSTE`, `AJUSTE_POSITIVO`,
         `AJUSTE_NEGATIVO`, `AJUSTE_INVENTARIO`, `SUCATA`, `PERDA`, `BLOQUEIO`, `DESBLOQUEIO`,
         `REPROVACAO_INSPECAO`, `DECISAO_INSPECAO`, `REMESSA_TERCEIRO`, `RETORNO_TERCEIRO`,
         `PERDA_TERCEIRO`, `CONSUMO_TERCEIRO`, `RETORNO_TRANSFORMACAO`, `ENTRADA_RETALHO`.
         Como o gate está **dentro** de `registrarMovimentacao`, ele alcança os 28 call sites de
         uma vez. Mais a regra do **emergencial** (`movementRules.js:94`): `emergencial: true` sem
         justificativa é recusado em **qualquer** tipo — *"Movimentação emergencial exige
         justificativa"* — que é literalmente o "emergencial" do enunciado deste item.
      2. **Serviços, com `throw` próprio — 10 pontos:** cancelamento de movimentação
         (`stockService.js:1426`), sucateamento (`scrapDisposalService.js:155`), bloqueio e
         desbloqueio por inspeção (`inspectionService.js:186` e `:199`), mudar status do lote /
         liberar bloqueio por certificado / liberar vencimento (`lotService.js:91`, `:129`,
         `:164`), mudar status da série (`seriesService.js:297`), cancelar solicitação de compra
         (`purchaseService.js:80`) e encerrar remessa a terceiro com saldo pendente
         (`thirdPartyService.js:586`).
      3. **Schema Zod, recusando com 400 antes de o serviço rodar — 2 schemas, 4 rotas:**
         `SucateamentoCreateSchema` (`schemas.js:586`, `min(1)`) e `JustificativaSchema`
         (`schemas.js:698`, `min(5)`), este último nas três rotas de ferramenta
         (`bloquear`/`desbloquear`/`reencontrar`, `extended.js:1078`, `:1083`, `:1103`).
      4. **Rota, validada à mão — 1 ponto:** conferência com `aplicar_ajustes` exige
         `justificativa_ajuste` com no mínimo 5 caracteres (`routes/almoxarifado.js:1389`).
      5. **Persistência:** `justificativa NOT NULL` na tabela de sucateamentos
         (`schema.js:1423`) — a exigência não depende só do código de aplicação.
      **O que FALTA de verdade (esta é a lista que substitui "não construída"):**
      - **`QUARENTENA` e `LIBERACAO_INSPECAO` não têm regra nenhuma** em `REGRAS_VINCULO` —
        `avaliarRegrasVinculo` devolve `{ ok: true }` para tipo desconhecido. São os **gêmeos**
        de `BLOQUEIO`/`DESBLOQUEIO`, que exigem: reter e liberar material por decisão humana pede
        motivo escrito nos dois pares, e hoje pede só em um. **É a assimetria mais gritante.**
      - **`RETRABALHO` não tem regra.** Material que vai para retrabalho sai do disponível sem
        explicação registrada.
      - **`DEVOLUCAO_CLIENTE` não exige justificativa** — o material sai do prédio de volta ao
        dono, e isso é operação excepcional por definição.
      - **`excluirRequisicao` aceita justificativa vazia** (`requisitionService.js:407`): cai no
        default `'Excluída pelo administrador'`, que não explica nada. A exclusão **estorna as
        entregas**, então é o caso em que o motivo escrito mais importa.
      - **Não há tamanho mínimo padronizado.** As 16 regras do motor aceitam `"x"`; o
        `JustificativaSchema` exige 5 caracteres; o sucateamento exige 1. Três réguas para a
        mesma ideia.
      - **`TRANSFERENCIA` fora, DE PROPÓSITO** (decisão declarada em `movementRules.js:35`):
        mover material de prateleira é rotina, não exceção. **Não é lacuna** — está aqui para
        ninguém "consertar" isso de volta.
- [x] **Dupla conferência em materiais críticos — PAGA na forma "saída da requisição" pela Etapa 28 (`174d388` + `5a3d593`, feature 05):** com material crítico separado e ainda não entregue, `liberar-retirada` e `entregar` exigem a **segunda conferência por outra pessoa** (barreira por identidade em qualquer rodada, repetida no `WHERE` do claim, no molde do sucateamento). **A régua "só crítico" é decisão minha (B62)**, e a B57 continua aberta para as **outras** operações (ajuste, transferência, sucata de crítico) — esta perna não bloqueia mais 🟢. Texto original: **o único item da perna *Segurança*
      que continua intocado, e é decisão de negócio, não linha de código.** Medido na Etapa 25:
      `material_critico` **já é coluna viva** (`schema.js:747`) e **já decide duas coisas** — o
      "risco de parada" da reposição (`purchaseService.js:259`, `:309`) e a **retenção para
      inspeção no recebimento** quando `inspecao_material_critico = '1'`
      (`receiptService.js:479`). O que ela **não** faz hoje é gatilhar conferência em
      movimentação. E a **dupla aprovação de sucateamento** já existe como precedente construído,
      com **três barreiras**, das quais a que interessa aqui é a de **identidade**
      (`scrapDisposalService.js:347-353`): o mesmo usuário não assina as duas pernas, com a
      mensagem *"dupla aprovacao com a mesma pessoa nas duas pernas e uma assinatura com dois
      carimbos. A segunda assinatura tem de ser de outra pessoa."* — ou seja, a mecânica está
      pronta e testada; falta só apontá-la para material crítico. O que falta é a resposta do
      cliente: **quais** operações sobre material crítico exigem dois pares de olhos (toda saída?
      só ajuste e sucata? acima de um valor?). Registrado na letra **B** das novidades da Etapa 25.
- [x] Backup/retenção de documentos (rotina `dbRecovery.js` existe — validar cobertura de uploads)
      — **Etapa 25 (`6209037` + `d81191e`)**. A metade de *cobertura* já estava medida na Etapa 21;
      o que faltava era a **retenção configurável**, e ela agora vale.
      **O que a Etapa 25 pagou:**
      - `backup_manter_dias` **deixou de ser dado morto** (`d81191e`): a chave da aba "Backup" é
        lida no boot e vira a régua do prune. Valor inválido (`'abc'`, `'0'`, `'-5'`, ausente,
        `null`) cai no padrão de **30 dias** com **um** aviso no log — nunca apaga tudo.
      - A régua ganhou **piso de 3 cópias** e **teto de 10** (`6209037`), nesta ordem: a mais
        recente **nunca** sai (é o fallback que a RN-08 da Etapa 21 exige do zip), e da 11ª em
        diante sai sempre, por mais nova que seja. Sem o teto, trocar `keep = 10` fixo por
        "N dias" faria o diretório crescer sem limite — ~2,9 GB em 30 dias no ritmo de boots
        medido.
      - O prune passou a **varrer acompanhantes órfãos** (`-wal`/`-shm` sem o `.sqlite`
        correspondente) nos **dois** formatos de nome: o novo (`database-X.sqlite-wal`) e o
        **antigo** (`database-X-wal`), que é onde estão 130 dos 132 órfãos reais. O teste
        congelado `dbRecoveryBackup.api.test.js` continuou 5/5 sob a sabotagem que só reconhecia o
        nome novo — prova de que ele sozinho **não pegava** este passivo.
      - **O prune mudou de lugar** (`d81191e`), e isso era **bloqueante**: em `index.js:1013` ele
        rodava **antes** de `initializeDatabase` criar a tabela `configuracoes`, então no primeiro
        boot de uma instalação nova o `SELECT` falhava com `no such table: configuracoes` — e o
        `/health` passava a reportar `db_startup_failed` **pelo resto da vida do processo**.
        Reproduzido no boot real, nos dois sentidos. Agora roda **dentro** de
        `initializeDatabase`, depois de `inicializarConfiguracoesPadrao`.
      - Limpeza de arquivo velho é conveniência e **nunca** derruba o boot: o prune ficou em
        `try/catch` e uma falha vira `console.warn`, não `dbStartupFailed`.
      **⚠️ E a redação anterior deste item ficou desatualizada no ponto errado.** Ela dizia que
      *"as 3 chaves da aba Backup não têm leitor nenhum no servidor"*. Isso **era verdade** e
      agora **é verdade só para duas**: `backup_manter_dias` tem leitor; `backup_automatico` e
      `backup_frequencia` **continuam sem**. Quem ler "a retenção agora funciona" e concluir que o
      painel inteiro funciona está errado — está na letra **C** das novidades da Etapa 25.
      **O que o item NÃO cobre e é corte deliberado:** retenção de **uploads** (fotos, anexos) não
      é podada por nada — só o banco é. O zip **inclui** `uploads/`, então eles estão salvos; o que
      não existe é política de expurgo para eles.
      — **medido na Etapa 21** (`d5c8d3a`), sobre a cobertura do zip: o zip de
      `GET /api/backup` **inclui** `uploads/` (regra congelada em
      `tests/api/backupExposicao.api.test.js` com o caso positivo `uploads/almoxarifado/x.png`), e
      **passou a incluir também a cópia de backup mais recente com `-wal`/`-shm`**, que é o
      fallback que `dbRecovery.js:86` manda usar. O que continua aberto e é o motivo de o item
      seguir desmarcado: **a retenção não é configurável** — a rotina roda na inicialização com
      `keep` fixo em 10, e as 3 chaves da aba "Backup" da tela de Configurações do core
      (`backup_automatico`, `backup_frequencia`, `backup_manter_dias`) **não têm leitor nenhum no
      servidor**. É feature morta, nomeada no design da Etapa 21 e na letra D das novidades, e
      consertá-la é decidir a política de retenção — decisão de negócio, não linha de código.

### Auditoria visível (Etapa 22 — `8c6ffbe..169458d`)

- [x] **Tela de auditoria no front** — `0a57fe1`.
      `client/src/components/almoxarifado/AuditoriaAlmoxarifado.js`, rota lazy em
      `routes/lazyModules.js`, `<Route path="auditoria">` em `App.js` e item de menu em
      `Layout.js` com **`adminOnly`** (verificado: `canConfigureModule` espelha o
      `getPerfilFromUser` do backend, então admin de módulo com `role='usuario'` vê o item **e**
      passa no gate). A tela **não traduz nada e não calcula de/para**: `acao_rotulo`,
      `entidade_rotulo` e `alteracoes` vêm prontos do servidor.
      *(**A afirmação antiga deste item ESTAVA CERTA e foi superada, não corrigida:** ela dizia
      "segue verdade em 2026-08-11: não há tela… `Logs.js` consome a rota de auditoria global,
      não a do módulo". A segunda metade **continua verdade** — `Logs.js` lê `/auditoria/logs`,
      que é outro sistema, do core, com outra tabela. São duas trilhas distintas e nada foi
      unificado.)*
- [x] **Filtros por entidade/usuário/período** — `8dda8de` (+ `71582ec`).
      Quatro filtros novos combináveis por `AND` com os dois que já existiam (`usuario_id`,
      `acao`, `data_inicio`, `data_fim`), mais `GET /api/almoxarifado/auditoria/opcoes` (mesmo
      gate `configurar`) alimentando os selects com `SELECT DISTINCT` do que está **realmente
      gravado** — lista fixa envelheceria no primeiro `entidade` novo, e as etapas 18–20 criaram
      seis. Duas travas que existem por modo de falha **reproduzido**: `acao` é **um** parâmetro
      string com vírgulas, com **um placeholder por valor** no `IN` (`IN (?)` com
      `'CRIACAO,CRIAR'` devolve **zero linhas sem erro**), e a validação de data roda **antes**
      do `COUNT`.
- [x] **Data inválida é 400, não filtro ignorado** — `8dda8de`.
      `services/almoxarifado/auditFiltros.js`, `validarData` por ida-e-volta
      (`new Date(v+'T00:00:00Z').toISOString().slice(0,10) === v`). `Date.parse` **não serve**:
      `2026-02-30` é válido em JS e o SQLite rola para `2026-03-03` — não dá lista vazia, dá
      **janela alargada em silêncio**. Mensagem literal:
      `Data inválida: use uma data real no formato AAAA-MM-DD`.
- [x] **Período invertido é 400** — `169458d` (achado A3 da revisão adversarial). As duas datas
      podem ser individualmente válidas e o intervalo impossível: `data_inicio=2026-08-20` com
      `data_fim=2026-08-01` devolvia **200 com lista vazia**, que é o mesmo modo de falha da
      linha acima entrando pela outra porta. Mensagem literal:
      `Período inválido: a data inicial é posterior à data final`. A guarda usa `>` e não `>=`,
      com cenário irmão garantindo que o filtro de **um** dia (`inicio === fim`) continua valendo.
- [x] **O período é inclusivo nos dois extremos no fuso do NEGÓCIO** — `8dda8de`.
      `janelaUtc` converte os dois limites de dia local para instante UTC **antes** do SQL,
      porque `created_at DATETIME DEFAULT CURRENT_TIMESTAMP` grava em UTC (medido: `date` =
      19:45 -03, `CURRENT_TIMESTAMP` = `'2026-08-28 22:45:51'`). Sem isso, **três horas de todo
      fim de expediente sumiriam** do filtro do próprio dia. O fuso é **constante do módulo**
      (`FUSO_PADRAO = 'America/Sao_Paulo'`), **nunca `process.env.TZ`** — a leitura óbvia
      (`new Date(ano, mes-1, dia)`) passaria em qualquer máquina de dev brasileira e viraria
      **no-op num contêiner com `TZ=UTC`**. Há cenário que troca o `TZ` do processo para `UTC` e
      `Asia/Tokyo` e exige a mesma janela.
- [x] **O de/para é calculado no servidor, por uma régua de LEITURA própria** — `8c6ffbe`
      (`auditLabels.alteracoesDaLinha`), congelado ponta a ponta em `15c7eda`.
      União das chaves dos dois lados, `null` explícito para ausente, **sem remascarar nada**,
      `[]` quando os dois lados são vazios. **`configDiff.calcularDiff` NÃO serve** e isso foi
      reproduzido: ela itera só `Object.keys(novos)` (`configDiff.js:9-13`) e tem
      `if (String(bruto) === String(novo)) continue`, então **apaga a troca de segredo
      mascarada** (os dois lados valem `'(alterado)'`) e **fabrica alterações** a partir de campo
      de contexto. Há um cenário-**testemunha** em `auditoriaFluxoCompleto.api.test.js` que roda
      `calcularDiff` sobre a mesma linha e afirma que ela apagaria a chave — para que um futuro
      "vamos unificar as duas réguas" caia dizendo **por quê**.
- [x] **Os três índices que a tabela nunca teve** — `8c6ffbe` (asserção endurecida em `169458d`).
      `idx_auditoria_almox_created (created_at)`,
      `idx_auditoria_almox_entidade (entidade, entidade_id)` e
      `idx_auditoria_almox_usuario (usuario_id)`, padrão `CREATE INDEX IF NOT EXISTS` do
      `schema.js`. O teste original assertava só o **nome**: mantendo o nome e trocando a coluna
      (`created_at` → `id`) ele passava verde **com a feature quebrada**. Agora confere as
      colunas por `PRAGMA index_info` (achado A5 da revisão adversarial).
- [ ] **Exportação da trilha (XLSX)** — **fora de escopo declarado, não esquecimento.** O módulo
      já tem export genérico no `reportRegistry` (Etapa 13), com colunas curadas e proteção por
      relatório; enxertar uma segunda régua dentro da tela de auditoria duplicaria a existente.
      Se a demanda aparecer, a trilha vira uma chave do `reportRegistry`. Letra **D** das
      novidades.
- [ ] **A trilha continua ADMIN-only** — a metade (b) da letra **B33** segue **em aberto**, e é
      decisão do usuário, não pendência técnica: alargar o gate é uma linha em `ACAO_PERFIS`
      (`services/almoxarifado/permissions.js`). Não foi feito de propósito — decidir exposição no
      lugar dele é o que a própria B33 dizia não fazer.

### Trilha honesta (Etapa 23 — `0fe8d02..4f1aeb9`)

- [x] **O retry de `SQLITE_BUSY` é transparente: o callback de quem pediu é chamado UMA vez, na
      tentativa final** (RN-05) — `0fe8d02`. `services/sqliteConcurrency.js`.
      **Esta task não estava no plano original e a Fase 2 provou que sem ela a RN-01 seria
      promessa falsa**: `db.run` chamava `cb.call(this, err)` em **toda** tentativa, inclusive nas
      que iam ser refeitas; como `services/almoxarifado/db.js` promisifica passando callback, um
      `SQLITE_BUSY` fazia `await dbRun(...)` **rejeitar**, a rota respondia 500 e pulava a
      auditoria, e o retry **aplicava a escrita depois**.
      **Achado além do previsto:** só o `db.run` tinha o defeito do retry, mas `get`/`all`/`exec`
      chamavam o callback **duas vezes quando o próprio callback lançava** (a exceção do
      `.then(ok)` caía no `.catch(erro)`, que chamava de novo, com o erro errado) e produziam
      **rejeição órfã**. Medido contra o commit anterior: `cb do get chamado: 2`,
      `unhandledRejection: ["boom-get"]`. Unificado num helper `entregarUmaVez`.
      **Declarado, não consertado:** o wrapper chama `cb(null, row)` em `get`/`all` sem o `this`
      do sqlite3 (o Statement); ninguém no CRM lê isso ali, e está fora da RN-05.
      Teste: `tests/sqliteConcurrency.test.js` (**não** é `*.api.test.js` — é o único lugar onde
      o wrapper roda de verdade; `tests/helpers/testApp.js:18` **não** chama `wrapDatabase`).
      `test:sqlite` foi de 3 para **5** cenários.
- [x] **`PUT /configuracoes` é tudo ou nada** (RN-01) — `b6b7b24` (+ `d507ccc`). O laço de
      `UPDATE` por chave virou **um** `UPDATE` com `CASE chave WHEN ? THEN ? … END … WHERE chave
      IN (…)`. **Sem transação, e isso é decisão medida, não esquecimento** — ver o bloco
      "Etapa 23" abaixo.
      **A armadilha que nem o design nem o plano nomearam, achada na implementação:** o `CASE`
      **não tem `ELSE`**, e `CASE` sem `ELSE` devolve **`NULL`** para toda linha que não casou
      nenhum `WHEN`. É o `WHERE chave IN (…)` que segura isso — **sem ele, um Salvar de três
      chaves gravaria `NULL` em todas as outras configurações da tabela, com HTTP 200.** O
      cenário feliz passa igual, então a armadilha é silenciosa. Há cenário próprio segurando-a, e
      o controle positivo `OR 1=1` o derruba nomeando a chave que virou `null`.
- [x] **O 500 do `PUT /configuracoes` descreve um banco INTOCADO** (RN-02) — `b6b7b24`.
      `tests/api/configuracoesAtomicidade.api.test.js`, 4 cenários (o plano previa 2).
      **A RN-02 desta etapa é MAIS ESTREITA do que a versão anterior do design prometia, e a
      correção está registrada:** aquela versão dizia "escrita que aconteceu **tem** rastro", e
      **isso o código não entrega nem depois desta etapa** — `registrarAuditoria` roda em
      `try/catch` que engole o erro (best-effort, decidido na Etapa 19). Numa etapa cujo tema é o
      log não mentir, a RN não pode prometer garantia que não existe.
- [x] **Excluir o que já está inativo não é um ato: 200 `ja_inativo`, sem auditar** (RN-03) —
      `9858bec`. **CINCO** rotas: `tipo_material`, `localizacao`, `setor`, `familia` e
      `material`. As quatro de cadastro ganharam `AND ativo = 1` no `WHERE` e distinguem 404
      (linha inexistente, mensagens literais inalteradas) de 200 `{ success: true, ja_inativo:
      true }` (linha já inativa). **`DELETE /materiais/:id` é diferente e mais estreito:** ela
      responde `success: true` também para id inexistente (contrato da Etapa 19) e isso **fica
      inalterado** — muda só a condição da auditoria, para `if (antes && antes.ativo === 1)`.
      O `setor` **não** ganhou o ramo de 404: ele já responde 404 antes do `UPDATE`, e
      implementá-lo ali seria código morto (confirmado).
- [x] **`changes` só decide "não existe" se o `WHERE` carregar o estado** (RN-04) — `9858bec`.
      É a régua que o defeito ensinou: em SQLite `changes` conta a linha que o `WHERE` **casou**,
      não a que **mudou de valor**. Vale para rotas futuras.
- [x] **A trilha lida PELA TELA-CONTRATO mostra um ato, não dois** — `4f1aeb9`.
      `tests/api/exclusaoNaTrilha.api.test.js`. `exclusaoIdempotente.api.test.js` prova a RN-03
      pelo **banco**; este prova pelo **leitor** — `GET /api/almoxarifado/auditoria`, a mesma C1
      que a tela da Etapa 22 consome, com gate, filtros, paginação e os três campos derivados no
      caminho. É o que faz a etapa valer a pena agora, e não antes da 22.
      Congela também que **`DESATIVACAO` e `EXCLUSAO` caem no mesmo rótulo de tela ("Exclusão")**
      — que é exatamente por que uma desativação sem efeito era indistinguível de uma real.
- [x] **Os dois testes de caracterização que afirmavam o comportamento antigo foram atualizados,
      sem apagar o histórico** — `9858bec`. `auditoriaCadastros.api.test.js` (`2` → `1`) e
      `auditoriaAtosEGate.api.test.js:221` (`1` → `0`).
      **O segundo não estava previsto em lugar nenhum** — nem no design, nem no plano, que
      nomeavam só o primeiro. E ele trouxe uma **consequência honesta que ninguém tinha notado:**
      aquele cenário era o **único** lugar onde a guarda do "`1` chumbado" em
      `dados_anteriores.ativo` podia falhar; com a RN-03, o único caminho auditado é o do material
      que **estava** ativo, então o valor é `1` **por construção** e a guarda perdeu o ramo que
      guardava. Registrado no arquivo em vez de fingir que ainda prova algo.
- [ ] **Os demais laços de escrita sem transação do módulo NÃO foram varridos** — corte de escopo
      declarado, não conclusão de que não existem. O `UPDATE` único só serve onde as linhas são da
      **mesma tabela** e o valor é função da chave; onde não for, o conserto é outro. Letra **D**
      das novidades.
- [ ] **`EXCLUSAO` vs `DESATIVACAO` nas escritas novas continua sem padronizar** — segue da
      Etapa 22 (~45 pontos do código). Na **exibição** já estão unificados (**B48**); o que
      continua é o dado bruto. Letra **D**.

### Exposição e rastro (Etapa 20 — `1b0f0e9..a3f5135`)

- [x] **Foto de material inexistente responde 404, sem deixar arquivo no disco** — `6cb594e`.
      `SELECT` antes do UPDATE; `Material não encontrado`; `limparUploadOrfao` extraída do
      closure de `extended.js` para `services/almoxarifado/uploadCleanup.js` (8 call sites / 4
      rotas trocados por script com assert de contagem) e chamada também aqui.
- [x] **Nenhuma saída ≠ 200 da rota de foto deixa órfão** — `6cb594e` (+ `05a5c81`). Cobre erro
      no SELECT, erro no UPDATE, 404 por material inexistente e 404 por `changes === 0`. O ramo
      403 não precisa de limpeza: `requirePermission` roda **antes** do multer, então nada foi
      gravado — provado por `permissoesRotas.api.test.js:535-549`. *(A RN-02 do design da etapa
      afirmava que o 403 apagava arquivo; **estava errada**, e o certo é que não há arquivo para
      apagar.)*
- [x] **A foto anterior só é apagada DEPOIS do UPDATE, em try/catch** — `6cb594e`. Antes era um
      `db.get` fire-and-forget correndo em paralelo com o UPDATE, com `unlinkSync` sem catch: no
      vermelho do TDD isso **derrubou o processo** (`EISDIR` subindo de dentro de um callback do
      sqlite3), não só a resposta.
- [x] **Trocar foto audita** (`material`/`ATUALIZACAO`, de/para do arquivo) — `6cb594e`.
      Pós-escrita e best-effort, em try/catch com `console.error`: o UPDATE já foi commitado.
- [x] **A janela entre o SELECT e o UPDATE está fechada** — `05a5c81` (fix-round). `dbRun`
      devolve `{ changes }`; `changes === 0` → 404 + limpeza. Alcance real é baixo (o DELETE de
      material é soft), mas responder 200 a uma escrita que não aconteceu é o mesmo defeito que
      a etapa foi consertar.
- [x] **`GET /configuracoes` mascara as duas chaves de segredo** — `a0b19c9`. `PASSWORD_MASK`
      quando há valor, `''` quando não há — idêntico ao que a rota de alertas já devolvia.
      Pré-requisito bloqueante resolvido junto: `configDiff` estava **desestruturado** no
      `require`, e usá-lo como namespace sem trocar o import daria `ReferenceError` na primeira
      request das TRÊS rotas de configuração (comprovado por sabotagem).
- [x] **`PUT /configuracoes` recusa as duas chaves de segredo** — `a0b19c9`. 400
      `Configuração "<chave>" só pode ser alterada em Configurações → Alertas de Estoque`, no
      laço de **validação** (que roda inteiro antes do de UPDATE) — sem transação, recusar no
      meio deixaria metade do formulário aplicada. Chave secreta com valor `''` também é
      recusada.
- [x] **`GET /setores-requisicao/:id/permissoes` exige `isSystemAdmin || canConfigureAlmox`** —
      `8c0feff`. Cópia literal do PUT irmão, com teste que assere `deepStrictEqual` entre os
      corpos dos dois 403 para que não se separem depois.
- [ ] **`alertas_whatsapp_webhook_url` NÃO é mascarado no GET** — **de propósito, não pendência**
      (decisão B40 das novidades, congelada em `configuracoesSegredo.api.test.js:188-196`): a URL
      é o campo que o admin edita, e devolvê-la mascarada faria a tela regravar a máscara como
      URL no primeiro Salvar. A proteção continua onde o registro é permanente — o log de
      auditoria (`configDiff.mascararUrl`, Etapa 19). Consequência aceita e declarada (C24):
      **quem administra o módulo lê o token embutido na query string**. Conserto de verdade =
      tirar o token da URL, etapa própria.
- [ ] **`GET /setores-requisicao` continua devolvendo `qtd_permissoes` por setor sem gate**
      (`sectorMaterialService.listSetores:328-334`) — buraco irmão do gate acima, achado pela
      revisão adversarial da Etapa 20 e **declarado em vez de consertado**: a consumidora é a
      tela de requisição (não-admin), então fechar é mudança de contrato, não uma linha. Letra
      B41, **em aberto e esperando decisão do usuário**.
- [ ] **`GET /configuracoes/liberacao-valor` continua expondo nome e e-mail dos aprovadores** a
      qualquer usuário do módulo (`requisitionValueApprovalService.getAprovadoresDetalhes`) — a
      lista de requisições depende dessa leitura para saber se o usuário é aprovador; reduzir o
      payload para não-admin é mudança de contrato. Letra D das novidades.
- [ ] **Erro de multer continua virando 500 opaco nas 5 rotas de upload** — a rota de foto saiu
      do conjunto quanto a órfão/404/auditoria, mas **continua** neste item; o conserto é um
      error-handler uniforme nas cinco. Segue nomeado na spec 24 (G7 / C25).

### Etapa 21 — o que era do núcleo (fora desta feature, registrado aqui para fechar o laço)

**Esta feature não mudou na Etapa 21** (`d5c8d3a..07a4b1c`, 2026-08-28) e o status dela continua o
mesmo. O bloco existe porque foi **desta spec** que os itens saíram: o design da Etapa 20 os
declarou fora dizendo *"são do core, não do módulo"*
(`docs/superpowers/specs/2026-08-28-almoxarifado-etapa20-exposicao-e-rastro-design.md:46-51`), e
sem um registro aqui a próxima sessão leria a lista de "o que continua aberto" e concluiria que
ninguém tocou neles.

**Correção do que a Etapa 20 escreveu:** aquele design mandou os dois itens **"para a letra B"**
(decisões esperando o usuário) das novidades, e eles acabaram na **letra D** (limitações
declaradas) — o que estava certo enquanto eram corte de escopo, mas a discrepância entre o design
e o documento existiu e não foi anotada em lugar nenhum. Fica dita aqui em vez de corrigida em
silêncio.

| Item declarado fora na Etapa 20 | Estado depois da Etapa 21 |
|---|---|
| `GET /api/backup` empacotava o diretório de dados inteiro | **PAGO** — `d5c8d3a`. O zip exclui `.runtime-secrets.json` (era **escalada de privilégio**: `server/index.js:318` assina o JWT com esse `jwtSecret`, então quem baixasse forjava token de superadmin) e as ~188 MB de `backups/`, mas **soma de volta a cópia mais recente com `-wal`/`-shm`** (RN-08 — `dbRecovery.js:86` restaura dali, e `.sqlite` sem o `-wal` perde as transações do WAL). Régua pura em `services/backupPackage.js`, congelada em `tests/api/backupExposicao.api.test.js` |
| O token do backup era comparado com `!==`, sem registro de quem baixou | **PAGO** — `d5c8d3a`. `crypto.timingSafeEqual` em `services/backupAuth.js`; log de `req.ip` **e** `x-forwarded-for` (não há `trust proxy`: atrás do nginx o `req.ip` seria `127.0.0.1`) com aceito/negado e motivo. **Query string continua aceita** com `QUERY_DEPRECIADA` no log e **token curto avisa em vez de recusar** — decisões B43/B44, tomadas para não quebrar cron externo invisível daqui |
| Credencial SMTP hardcoded em `server/index.js` | **PAGO como o código consegue** — `aad2331` (precedência `env → hardcoded`, régua em `services/emailConfig.js`) e `b2dee3b` (a cópia replicada em `docs/superpowers/plans/2026-08-02-almoxarifado-etapa0-fundacao.md:847` saiu). **O banco ficou FORA da precedência de propósito** (B42): medido duas vezes no banco em 28/08 — `email_smtp_host = 'smtplw.com.br'` (outro produto, diferente do `smtp.locaweb.com.br` que funciona) e `email_from` com **dois** endereços |
| A rotação da senha na Locaweb | **CONTINUA ABERTO, e nenhum commit fecha isso.** É operação, não código. A senha está no histórico do git desde **2026-03-17**: trocar ou apagar o arquivo **não a remove de clone nenhum**. Virou o item **A3** das novidades (com a ordem: rotacionar na Locaweb → definir `SMTP_PASS` no ambiente da VPS → só então o valor do código fica irrelevante) e o furo **C27** |

**O que a Etapa 21 acrescentou fora daquela lista** (também do core, não desta feature): os **dois**
GETs de configuração do core (`/api/configuracoes` e `/api/configuracoes/:chave`) pararam de
devolver `email_smtp_pass` em claro e o `PUT /:chave` passa a recusar com **400** valor vazio ou
que **contenha** a máscara (`025a700`, régua em `services/configSecrets.js`, que **reusa** o
`PASSWORD_MASK` de `alertService` em vez de criar uma segunda constante); e a tela
`client/src/components/Configuracoes.js` foi corrigida junto, porque ela salvava **a cada tecla**
com a máscara amarrada ao input — digitar uma letra mandava `********N`, que passa em guarda de
igualdade e sobrescreve a senha real. É o mesmo par de defeitos que a Etapa 20 fechou no módulo,
na versão do core.

**Fica declarado, do lado do core** (letras C26/C27 e D das novidades): o backup segue protegido
por **token estático** sem identificação de quem baixou além do log; o histórico do git **não** foi
reescrito; **não** foi criada rota de restore (a medição confirmou que não existe, e inventá-la
seria abrir um buraco maior); e a aba "Backup" da tela de Configurações edita 3 chaves que
**nenhum leitor do servidor consome**.

### Etapa 22 — a trilha ganha leitor, e por que a feature NÃO virou 🟢

**A decisão de cor, escrita.** Quatro documentos desta base (o mapa de status, esta spec e o guia
do usuário) afirmavam, em cinco lugares, que *"para virar 🟢 falta a tela de auditoria"*. A tela
foi entregue (`8c6ffbe..169458d`) e **a feature continua 🟡-forte** — então a afirmação anterior
precisa ser corrigida em voz alta, não só superada:

> **A frase "para virar 🟢 falta a tela de auditoria" ESTAVA ERRADA por ser incompleta.** Ela
> tratava os outros itens abertos como "decisão de negócio declarada" e portanto não-bloqueantes.
> **Um deles não é decisão de negócio: é a trilha mentindo por omissão.**

O que sobra, e a classificação honesta de cada item:

| O que sobra | Natureza | Bloqueia 🟢? |
|---|---|---|
| **Ato parcial do `PUT /configuracoes` sem rastro** — grava chave a chave **sem transação**; falhando no meio, parte fica gravada e **nenhuma** linha de histórico é escrita | **Defeito de trilha**, medido, não pago | **SIM.** Uma trilha que pode não registrar uma mudança que aconteceu é o defeito que este módulo de auditoria existe para não ter |
| **`EXCLUSAO` de linha já inativa** é registrada mesmo sem excluir nada (o SQLite conta a linha atingida) | Defeito de trilha, menor: registra ato que não teve efeito | **SIM**, junto com o de cima — é a mesma família (a trilha afirmando o que não corresponde ao que houve), e agora que há tela isso vira visível para quem audita |
| **Volume do log de permissões (~46 KB/save)** — letra **G8** | Decisão de negócio do usuário (*o que deixa de ser registrado?*) | Não |
| **Normalização dos verbos antigos** — letra **B47** | Decisão de negócio do usuário (migração irreversível sobre dado histórico) | Não |
| **Gate ADMIN-only** — metade (b) da **B33** | Decisão de exposição do usuário | Não |
| **Exportação XLSX / retenção do log** | Corte de escopo declarado (letra **D**) | Não |

**Portanto: 🟡-forte, e o que falta para 🟢 mudou de item.** Não é mais "falta leitor" — é
**fechar os dois buracos de rastro acima** (transação ou registro do parcial no `PUT
/configuracoes`; e não registrar `EXCLUSAO` que não excluiu). Os dois são código, cabem numa
etapa curta, e nenhum depende de resposta do usuário. Os outros quatro itens seguem declarados e
**não** contam para a cor, porque são escolha dele, não dívida minha.

**O que a Etapa 22 entregou, em uma tabela:**

| Camada | Entrega | Commit |
|---|---|---|
| `services/almoxarifado/auditLabels.js` (novo) | rótulos de entidade e ação, grupos de sinônimo com congelamento **em profundidade**, e `alteracoesDaLinha` — a régua de **leitura** | `8c6ffbe` |
| `services/almoxarifado/schema.js` | os 3 índices da tabela de auditoria (a única das 13 sem nenhum) | `8c6ffbe` |
| `services/almoxarifado/auditFiltros.js` (novo) | `validarData` (ida-e-volta) e `janelaUtc` (offset via `Intl`, fuso constante) | `8dda8de` |
| `routes/almoxarifado/extended.js` | 4 filtros novos, validação de data e de período, janela em UTC, 3 campos derivados por item, e `GET /auditoria/opcoes` | `8dda8de`, `71582ec`, `169458d` |
| `client/.../AuditoriaAlmoxarifado.js` (novo) + rota + menu | a tela, com paginação, de/para expansível, truncamento em 300 caracteres e legenda de contexto | `0a57fe1`, `169458d` |
| `client/jest.globalSetup.js` (novo) | fixa o `TZ` **antes** de o Jest forkar os workers — sem ele a suíte do cliente era **vermelha em qualquer máquina em UTC** | `169458d` |

**Correção de uma afirmação que circulou nesta etapa e estava errada** (registrada aqui porque
ela chegou a entrar no design): o design dizia que a régua de leitura resolveria a "sujeira" da
linha de foto de material, fazendo-a sair com **uma** alteração. **Ela sai com três** — `foto`,
`codigo` e `nome`, os dois últimos com `de: null`. E **tem** de sair: é a mesma ausência de
filtro de igualdade que mantém visível a troca de senha mascarada. Contexto na lista é
**consequência aceita**, não defeito resolvido; enxugá-lo seria trabalho da **escrita** (gravar
menos), nunca da leitura. O contrato real está congelado em `auditoriaFluxoCompleto.api.test.js`,
que afirma o **conjunto inteiro** das três entradas.

### Etapa 23 — os dois buracos de rastro fechados, e por que a feature AINDA NÃO é 🟢

**A decisão de cor, escrita — e a correção de uma afirmação desta própria spec.** O bloco "Etapa
22" logo acima termina dizendo, com todas as letras:

> *"o que falta para 🟢 mudou de item. Não é mais 'falta leitor' — é **fechar os dois buracos de
> rastro** acima."*

**Os dois estão fechados** (`b6b7b24`/`d507ccc` e `9858bec`, provados pela tela-contrato em
`4f1aeb9`). E a feature **continua 🟡-forte**. Então:

> **A frase da Etapa 22 ESTAVA INCOMPLETA, do mesmo jeito que a frase da Etapa 18–21 que ela
> mesma corrigiu.** Ela pesou **só a perna de auditoria** desta feature e concluiu dali a cor da
> feature inteira. Mas esta feature são **três** pernas — *Perfis*, *Segurança* e *Auditoria* —,
> e os checklists das duas primeiras, que estão neste arquivo desde o começo e nunca foram
> tocados, têm **dez itens desmarcados que não são decisão de negócio**: são funcionalidade não
> construída. **Errar duas vezes seguidas o mesmo tipo de conta — olhar a perna que a etapa mexeu
> e chamar aquilo de "o que falta para 🟢" — é o padrão que fica registrado aqui.**

**O que sobra, agora com as três pernas na mesma tabela:**

| Perna | O que sobra | Natureza | Bloqueia 🟢? |
|---|---|---|---|
| **Auditoria** | ~~ato parcial do `PUT /configuracoes`~~ · ~~`EXCLUSAO` de linha já inativa~~ | **PAGOS na Etapa 23** | — |
| **Auditoria** | Volume do log de permissões (~46 KB/save, **G8**) · normalização dos verbos antigos (**B47**) · gate ADMIN-only (**B33** metade b) · exportação XLSX e retenção (letra **D**) | Decisão de negócio do usuário / corte declarado | **Não** |
| **Auditoria** | Laços de escrita sem transação não varridos · `EXCLUSAO` vs `DESATIVACAO` nas escritas novas | Corte de escopo declarado (Etapa 23, letra **D**) | **Não** |
| **Perfis** | ~~**Perfil QUALIDADE não existe**~~ **CRIADO na Etapa 24 (`a81e51a`)** — mas só a metade `inspecionar`; `bloquear/liberar sob desvio` usa `ajustar_estoque` e ficou fora (**B56**) · ~~**UI de atribuição de perfil por usuário**~~ **JÁ EXISTIA desde `6018f0a` (2026-08-05) — esta linha estava ERRADA**, ver o bloco "Etapa 24" · mapeamento dos perfis da spec 28 · o fallback `getPerfilFromUser` → PRODUCAO (agora **decisão de negócio viável**, letra **B54**, em vez de bloqueado por falta de tela) · revisar o default de módulo | 5 itens → **2 pagos, 1 virou decisão de negócio (B54), 2 continuam funcionalidade não construída** | **SIM** (pelos 2 restantes + a metade do 131) |
| **Segurança** | ~~**Registrar dispositivo (user-agent/IP) na movimentação**~~ **PAGO na Etapa 25 (`9027c36`)** · ~~**bloquear lançamento retroativo**~~ **NUNCA FOI TAREFA — esta linha estava ERRADA**, ver o item `[~]` no checklist · ~~justificativa obrigatória em operações excepcionais~~ **JÁ ESTAVA CONSTRUÍDA em 5 camadas — esta linha estava ERRADA**; o que falta virou lista nomeada · ~~**dupla conferência em materiais críticos**~~ **PAGA na Etapa 28 (`174d388`), na forma "saída da requisição"; o restante da B57 é decisão de negócio** · ~~política de retenção de backup configurável~~ **PAGA na Etapa 25 (`6209037`+`d81191e`)** | 5 itens → **3 pagos, 2 eram classificação errada** (a dupla conferência foi paga na Etapa 28) | **Não** (nenhum item restante é funcionalidade não construída) |

**Portanto: 🟡-forte, e o que falta para 🟢 mudou de item pela terceira vez.** Desta vez a
resposta não é uma pendência de auditoria: é que **a perna de auditoria terminou** e as pernas de
**Perfis** e **Segurança** mal começaram. Escrito assim, de propósito, para que a próxima sessão
não leia "faltam dois buracos de rastro", veja os dois pagos e conclua 🟢.

> **Atualização da Etapa 24 (`a81e51a..4680daa`): a perna *Perfis* deixou de estar em zero, e a
> feature continua 🟡-forte.** Dos cinco itens dela: o perfil QUALIDADE foi criado (pago pela
> metade — falta `bloquear/liberar sob desvio`, **B56**); a UI de atribuição **já existia e a
> linha desta spec estava errada**; o fallback `PRODUCAO` deixou de ser funcionalidade não
> construída e virou **decisão de negócio** (**B54**), porque a ferramenta que faltava existe;
> e sobram o mapeamento da spec 28 e o default de módulo, os dois **dependentes de outra spec**.
> **O que passou a bloquear 🟢 é a perna *Segurança*, intacta** — cinco itens, nenhum começado:
> dispositivo/IP na movimentação, lançamento retroativo, justificativa em operações excepcionais,
> dupla conferência em materiais críticos e retenção de backup configurável. **É essa a resposta
> para "o que falta para 🟢" hoje**, e é a quarta vez que essa resposta muda de item nesta spec.
>
> ⚠️ **Atualização da Etapa 25: das cinco afirmações do parágrafo acima, DUAS eram falsas quando
> foram escritas.** "Justificativa em operações excepcionais" **não** era funcionalidade não
> construída — está construída em cinco camadas desde as Etapas 2 a 9b, e o item do checklist tem
> agora a lista do que de fato falta. "Lançamento retroativo" **nunca foi tarefa** — `created_at`
> é `CURRENT_TIMESTAMP` e nenhuma rota aceita data do cliente. Chamar as duas de "não construída"
> inflou a perna *Segurança* de três itens reais para cinco, e é a mesma falha que este arquivo já
> registra duas vezes: **classificar sem medir**. Ver o bloco "Etapa 25" no fim.

**A decisão de arquitetura da etapa, com o descartado (é a mais importante e a mais
contraintuitiva):**

> **NÃO usar `BEGIN`/`COMMIT`/`ROLLBACK` com `await` no meio.** `server/index.js:1026` abre **uma
> única** conexão SQLite carregada pelo processo do servidor, e transação em SQLite é por
> **conexão**, não por requisição. Entre um `BEGIN` e um `COMMIT` numa rota, **as escritas de
> todas as outras requisições em voo entram na mesma transação** — e um `ROLLBACK` por falha ao
> salvar configuração **desfaria a movimentação de estoque de outra pessoa**. A atomicidade vem
> de **um `UPDATE` só**: o SQLite é atômico por statement.
>
> **Duas ressalvas que a Fase 2 mediu e que corrigem o que este raciocínio afirmava demais:**
> 1. **`db.serialize()` não salva** — ele ordena a fila, não dá exclusividade; a escrita alheia
>    entrou na transação e sumiu no `ROLLBACK` do mesmo jeito. (Confirmação, não correção: vale
>    registrar porque `serialize` é a primeira ideia de quem tenta consertar isso.)
> 2. **A proibição vale para essa FORMA, não para transação em geral.** Uma transação inteira num
>    único `db.exec` **é segura**, e o próprio CRM já usa isso duas vezes em produção
>    (`index.js:4479`, o `DELETE /api/usuarios/:id`; e `:5700`, a renumeração de propostas) — a
>    escrita concorrente sobreviveu no teste. Dizer "transação seria um bug pior" sem essa
>    ressalva **estava mais largo do que a medição**. A recomendação continua sendo o `UPDATE`
>    único (mais simples, não prende a conexão), mas a razão certa é essa.
>
> **Descartado** também registrar a auditoria dentro do `catch` (rastro do ato parcial): documenta
> o estrago em vez de evitá-lo, e deixa o banco meio gravado do mesmo jeito.

**O perigo irmão que existe HOJE e ficou FORA:** nos dois `db.exec` do núcleo acima, o `ROLLBACK`
do `catch` é uma **chamada separada** — entre o `exec` que falhou e o `ROLLBACK`, escrita alheia
entra na transação que está sendo desfeita. **É o mesmo perigo, é anterior a esta etapa, e são
rotas do núcleo do CRM** (usuários e propostas), não do módulo. Declarado na letra **C30** das
novidades; consertar é etapa própria, no núcleo.

**A doutrina que estava escrita no código e PERDEU.** O comentário de `DELETE /materiais/:id`
(`:615-622`) defendia, com todas as letras, que `dados_anteriores.ativo` precisava ser o valor real
porque esse *"é justamente o caso em que o log importa (quem tentou desativar de novo, e quando)"*.
**A RN-03 venceu, e o comentário foi reescrito em vez de apagado** — ele ainda explica o `SELECT`,
que continua necessário. O motivo de a doutrina antiga ter perdido é **a Etapa 22**: antes dela o
argumento era defensável, porque ninguém lia a trilha; depois dela, uma linha `DESATIVACAO` de um
material que já estava inativo é **indistinguível**, na tela, de uma desativação real — mesmo
verbo, mesmo autor, mesmo horário, e o rótulo de tela dos dois é o mesmo ("Exclusão"). Registrar
tentativa sem efeito com o verbo do ato com efeito é o log mentindo por excesso. **Se um dia houver
valor em registrar tentativas, isso pede um verbo PRÓPRIO, não este.** Letra **B53**.

**O que a Etapa 23 entregou, em uma tabela:**

| Camada | Entrega | Commit |
|---|---|---|
| `services/sqliteConcurrency.js` | o retry passa a chamar o callback de quem pediu **uma vez**, na tentativa final; `run`/`get`/`all`/`exec` unificados em `entregarUmaVez` (os três últimos chamavam o cb **duas** vezes quando ele lançava, com rejeição órfã) | `0fe8d02` |
| `routes/almoxarifado.js` — `PUT /configuracoes` | laço de `UPDATE` → **um** `UPDATE` com `CASE … END … WHERE chave IN (…)` | `b6b7b24` |
| `routes/almoxarifado.js` — 5 rotas de exclusão | `AND ativo = 1` nas quatro de cadastro (+ `setor` passa a **ler** `changes`); `if (antes && antes.ativo === 1)` no material | `9858bec` |
| `tests/sqliteConcurrency.test.js` | 3 → **5** cenários | `0fe8d02` |
| `tests/api/configuracoesAtomicidade.api.test.js` (novo) | 4 cenários (o plano previa 2) | `b6b7b24`, `d507ccc` |
| `tests/api/exclusaoIdempotente.api.test.js` (novo) | 20 cenários, as cinco rotas | `9858bec` |
| `tests/api/exclusaoNaTrilha.api.test.js` (novo) | 5 cenários — a leitura **pela tela-contrato** | `4f1aeb9` |
| `tests/api/auditoriaCadastros.api.test.js`, `auditoriaAtosEGate.api.test.js` | os dois testes de caracterização atualizados, com o histórico escrito no cabeçalho | `9858bec` |

## Etapa 24 — a perna *Perfis* começa (`a81e51a..4680daa`)

**A primeira etapa desta feature que não é da perna de auditoria.** As etapas 18 a 23 fecharam
*Auditoria*; esta abre *Perfis*, que o fechamento da Etapa 23 nomeou como parte do que falta
para 🟢.

### ⚠️ Uma afirmação DESTA spec estava errada e derrubou a premissa de uma etapa inteira

O checklist de *Perfis* trazia, desmarcado:

> `- [ ] UI de atribuição de perfil por usuário (hoje via sync de admin_modulos)`

**Estava errado desde 2026-08-05.** A tela existe: é a aba `TabPerfisAcesso` em
`client/src/components/almoxarifado/ConfiguracoesAlmoxarifado.js:2545`, registrada em `TABS`
(`:191`), renderizada em `:265`, no menu por `Layout.js:393`, descrita no manual do repositório e
**usada de verdade** — sete linhas de `perfil_almoxarifado_usuario` no histórico do banco de
desenvolvimento, a mais recente em 2026-08-25. O commit é `6018f0a`, *"tela para atribuir perfil
de acesso por usuario"*.

**A consequência:** o design da Etapa 24 leu este item, somou a uma varredura incompleta do client
(procurei por `perfil_almoxarifado` e por `perfis-almoxarifado`; o consumidor chama
`perfis-usuario`, dentro do arquivo de **outra aba**) e escreveu, como premissa da etapa inteira,
que *"nenhum componente do client consome as rotas de perfil"* e que *"todo usuário novo entra
como chão de fábrica sem que ninguém consiga promovê-lo pela interface — só por `curl` ou
escrevendo no banco"*. O plano mandava **criar** `AlmoxarifadoPerfis.js`, com rota e item de menu
próprios. **A Fase 2 derrubou a premissa com quatro provas independentes** (o componente, o menu,
o manual, o uso real) e o plano foi reescrito no meio da etapa.

**Se a premissa tivesse sobrevivido, o módulo teria ganhado duas telas para a mesma função**, cada
uma sem saber da outra, e a Etapa 25 estaria decidindo qual apagar.

**A lição, escrita para a próxima sessão:** *medir ausência exige procurar pelo nome do CONTRATO —
a rota, o endpoint —, nunca pelo nome que se imagina que o consumidor usaria.* E: **item
desmarcado nesta spec não é prova de que a funcionalidade não existe** — é prova de que ninguém
marcou. A verificação tem de ir ao código.

### O que a etapa entregou

| Camada | Entrega | Commit |
|---|---|---|
| `services/almoxarifado/permissions.js` | perfil `QUALIDADE` em `PERFIS`, entrando em `visualizar` e `inspecionar` — e **em mais nada**, com a lista negativa provada no gate real | `a81e51a` |
| `client/.../ConfiguracoesAlmoxarifado.js` (`PERFIS_INFO`) | rótulo "Qualidade" e a descrição do que ele permite — sem isso o perfil saía como `QUALIDADE` cru e `—` na coluna explicativa | `a81e51a` |
| `routes/almoxarifado/extended.js` — `PUT /perfis-usuario/:id` | o caminho "voltar ao padrão" **audita** (`EXCLUSAO`); os dois caminhos gravam `dados_anteriores` | `9f7c309` |
| `client/.../ConfiguracoesAlmoxarifado.js` (`TabPerfisAcesso`) | `ADMINISTRADOR` fora do seletor + o parágrafo com a razão visível ao usuário | `b13de4a` |
| `client/.../PerfisAcesso.test.js` (novo) | **7 cenários** — a aba tinha **zero** | `b13de4a` |
| `tests/api/perfisUsuario.api.test.js` | 11 → **14 cenários**; os 11 congelados seguem verdes (contrato C2 intacto) | `9f7c309` |
| `tests/api/perfilAuditoriaIntegracao.api.test.js` (novo) | **5 cenários** — escreve pelas rotas reais e lê pela **tela-contrato** `GET /auditoria?entidade=perfil_almoxarifado_usuario` | `b9a5848` |
| `client/src/utils/permissaoErro.js` | o mapa de rótulos de perfil não tinha `QUALIDADE`: o 403 dizia *"seu perfil é QUALIDADE"*, chave crua em caixa alta | `4680daa` |

### As decisões, com o descartado

**`ver_alertas` FICOU DE FORA — e isto corrige uma decisão anterior deste mesmo design.** A versão
inicial dava a permissão ao perfil, com a justificativa de que "sem ela ele veria a tela de
alertas vazia, que parece que não há nada pendente". **A justificativa era falsa:** a tela não
chama o GET sem a permissão e mostra o painel de sem-acesso (corrigido na Etapa 11). E o custo
medido é o oposto do suposto: `montarCentral` percorre o registro **inteiro**, sem régua por
perfil, e entrega **11 alertas**, incluindo `ESTOQUE_SEM_CONSUMO` e `ESTOQUE_EXCESSIVO`, que
carregam `valor_parado`. A Etapa 16 excluiu PRODUCAO/ENGENHARIA/CONSULTA da central pelo mesmo
motivo. **Declarado:** os quatro alertas de qualidade — material reprovado, divergência de
recebimento, lote sem certificado e `QUARENTENA_PARADA` (a fila de itens aguardando inspeção) —
seguem invisíveis para o perfil até a central saber filtrar. Letra **B55**.

**`EXCLUSAO` como verbo da revogação, e não um verbo novo.** `EXCLUSAO` já está em `GRUPOS_ACAO`
(`auditLabels.js`), então a revogação fica **filtrável na tela** como "Exclusão" — provado por
cenário próprio na integração. **Descartado** inventar `REVOGACAO`: o vocabulário da trilha ficaria
com um verbo sem rótulo, que é o defeito que a Etapa 22 passou uma task inteira consertando.

**Os dois lados da auditoria gravam a MESMA forma** (`{usuario, perfil, perfil_efetivo, origem}`).
`auditLabels.alteracoesDaLinha` é **união de chaves sem filtro de igualdade**: chave presente só
de um lado sairia na tela como `null -> valor`, **fingindo alteração que não houve** — foi
exatamente o que aconteceu com `codigo`/`nome` da foto de material, congelado como contrato em
`auditoriaFluxoCompleto`. A integração afirma o **conjunto inteiro** de `alteracoes`, não só o
campo `perfil`, justamente para que essa decisão tenha prova.

**A remoção audita mesmo quando não havia perfil explícito.** Registra-se o **ato** ("mandaram
voltar ao padrão"), não o diff. **Descartado** omitir por "não mudou nada": omitir por ausência de
diff é a família de defeito que a Etapa 23 fechou.

**`ADMINISTRADOR` fora do seletor, em vez de "deixar e avisar".** Dois problemas se somam:
`hasAlmoxAdminPerfil` faz `canConfigureModule('almoxarifado')` valer para quem tem
`perfil_almoxarifado === 'ADMINISTRADOR'` — quem recebesse pela tela passaria a configurar o
módulo e **a promover outros** —, e `classificarPerfil` o marca como `explicito`, não `forcado`,
então **nem o 409 nem a RN-03 o protegem**; e `syncModuleAdminProfiles` roda em todo save de
usuário e apaga a linha, então a concessão **evapora sozinha** depois. Parecer que funcionou, dar
poder demais e sumir sozinho, juntos, são pior que a opção não existir. **O filtro é da tela, não
uma migração:** quem já tiver esse perfil gravado continua com ele, e continua sujeito ao
apagamento silencioso — daí a consulta **A4** e o furo **C31** das novidades.

### O que o achado metodológico da Task 1 acrescentou à skill de fechamento

**Asserção negativa sobre permissão não fica vermelha na rodada TDD.** O cenário "QUALIDADE não
pode `movimentar`" passa **verde antes de o perfil existir**, porque `can()` devolve `false` para
o que não conhece. Ou seja: a lista negativa — que é a parte que importa, porque perfil que herda
demais é pior que perfil nenhum — **só tem prova pelo controle positivo**, sabotando o código para
**conceder** a permissão proibida e conferindo que o cenário cai **nomeando a ação**. Feito duas
vezes (`movimentar` e `ver_alertas`), e a regra ficou escrita em
`.claude/skills/fechar-etapa/SKILL.md`.

### O que continua faltando nesta perna

- O **mapeamento da spec 28** (Solicitante, Supervisor, Auditoria/Diretoria) — depende daquela spec.
- O **default de módulo** (`comercial`) — do núcleo, não do almoxarifado.
- O fallback `PRODUCAO` — **deixou de ser funcionalidade não construída e virou decisão de
  negócio** (**B54**), porque a ferramenta que faltava (dar perfil explícito antes de apertar)
  existe e o caso que forçava o padrão largo (a Qualidade) foi coberto.
- `bloquear/liberar sob desvio` do item 131 — **B56**, e o caminho limpo é ação própria.


## Etapa 25 — a perna *Segurança* fecha, e duas linhas desta spec eram falsas (`6209037..9027c36`)

**A feature CONTINUA 🟡-forte e NÃO vira 🟢** — mas pela primeira vez o motivo mudou de natureza,
e é importante dizer qual.

### As duas afirmações desta spec que estavam ERRADAS

Este arquivo já registra três vezes o mesmo tipo de falha (a 07 com `reserva_id`, a 8b com
"envio = saída", a 24 com a UI de atribuição de perfil). **Aconteceu de novo, duas vezes, na mesma
perna** — e desta vez o erro não foi "afirmar que existe o que não existe", foi o inverso:
**afirmar que falta o que ou já está pronto ou é impossível.**

| Item | O que a spec dizia | O certo | Como se mediu |
|---|---|---|---|
| **Bloquear lançamento retroativo** | item de segurança pendente | **Não é tarefa e nunca foi.** `created_at` é `CURRENT_TIMESTAMP` (`schema.js:323`); não há coluna `data_movimentacao`; os 3 `INSERT` de produção não citam `created_at`; nenhuma rota lê data do body. **Bloquear o retroativo é impossível porque o retroativo é impossível.** | `grep` colado no item `[~]` do checklist |
| **Justificativa em operações excepcionais** | "funcionalidade **não construída**" (Etapa 23) | **Construída em 5 camadas**: 16 dos 33 tipos de movimento recusados pelo motor, 10 `throw` em serviço, 2 schemas Zod cobrindo 4 rotas, 1 validação de rota, 1 `NOT NULL` de tabela | inventário no item do checklist |

**E o "77" do design da Etapa 25 é número a descartar, não a confirmar.** Ele veio de
`grep -c "justificativa:"`, que conta a **chave de objeto** — o campo sendo *repassado*, não
*exigido*. Um número grande que mede a coisa errada é pior que nenhum número: ele encerra a
investigação com a conclusão contrária à verdade. Quem repetir essa medição vai achar 77 de novo;
a contagem que vale é a de **pontos que recusam**, e ela está no checklist.

### O que a etapa entregou de código

| Task | Commit | O que pagou |
|---|---|---|
| 1 | `6209037` | `decidirRemocao` pura (piso 3, teto 10) e o prune varrendo acompanhantes órfãos nos **dois** formatos de nome. 21 cenários |
| 2 | `d81191e` | `backup_manter_dias` passa a valer, e **o prune muda de lugar** — era bloqueante no boot de instalação nova. 33 cenários |
| 3 | `9027c36` | A movimentação registra `ip`/`ip_proxy`/`user_agent`, com `x-forwarded-for` tratado. 16 cenários |

### Por que a feature ainda não é 🟢

**Não é mais por funcionalidade faltando na perna *Segurança*.** Depois desta etapa, o que sobra
nessa perna é **um** item — dupla conferência em material crítico — e ele é **decisão de negócio**
(a mecânica de dupla assinatura por identidade já existe e está testada no sucateamento; falta o
cliente dizer *quais* operações a exigem). Letra **B** das novidades.

**O que bloqueia 🟢 hoje é a perna *Perfis*** — e este bloco diz isso explicitamente para não
repetir o erro das Etapas 22 e 24, que **pesaram uma perna só** e chamaram o resultado de "o que
falta para 🟢". Pesando as três:

| Perna | Estado | Bloqueia 🟢? |
|---|---|---|
| **Auditoria** | Sem defeito conhecido desde a Etapa 23. O que sobra é decisão de negócio (G8, B47, B33-b) ou corte declarado (XLSX) | **Não** |
| **Segurança** | 4 dos 5 itens resolvidos ou reclassificados nesta etapa. Sobra a dupla conferência — decisão de negócio (**B**) | **Não** |
| **Perfis** | **2 itens de funcionalidade não construída** — mapeamento da spec 28 e default de módulo, ambos **dependentes de outra spec** — mais a metade do item 131 (`bloquear/liberar sob desvio` usa `ajustar_estoque`; dois botões de `/almoxarifado/inspecoes` seguem barrados, **B56**) | **SIM** |

**Portanto: 🟡-forte, e "o que falta para 🟢" mudou de item pela quinta vez.** Hoje é: **a metade
aberta do item 131 (B56)**, e os dois itens de *Perfis* que dependem de outra spec. Escrito assim
para que a próxima sessão não leia "a Segurança fechou" e conclua 🟢.

### Cuidado de operação que esta etapa criou

A tela de Backup (Configurações do core) passa a ter **um controle vivo e dois decorativos**:
`backup_manter_dias` funciona; `backup_automatico` e `backup_frequencia` **continuam sem leitor no
servidor**. Está na letra **C** das novidades, porque quem ler só "a retenção agora funciona"
conclui que o painel inteiro funciona.


## Regras essenciais + testes de API exigidos

| Regra | Teste |
|-------|-------|
| Matriz perfil × ação respeitada em todas as rotas | `perfil sem acao recebe 403` (tabela de casos por rota) |
| CONSULTA não altera nada | `perfil CONSULTA em rotas de escrita recebe 403` |
| Movimentação não tem DELETE | `nao existe rota DELETE de movimentacao` |
| Todo write relevante gera auditoria com dados anteriores/novos | `update de material grava auditoria diff` |
| Tentativa de acesso negado é registrada | `403 de modulo grava em logs_auditoria` |

## Dependências

- 00 (unificação v1/v2 para a auditoria valer) · 09 (perfil QUALIDADE).
