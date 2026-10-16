# Almoxarifado — Etapa 126: as Configurações que o servidor recusa, e o Editar da família que leu (plano)

> Origem: "Próxima tarefa detalhada — Etapa 126" do plano da 125 (**C261** + **D (125)**). Design com a Fase 0 medida:
> `docs/superpowers/specs/2026-10-16-almoxarifado-etapa126-configuracoes-que-o-servidor-recusa-design.md`.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-16): última B **B810**, último C
> **C262**, última A **A75**. Esta etapa: **B811+**, **C263+**, **A76+**. Worktree `CRM-wt-e126`, branch `etapa-e126` (a partir da main
> `187e694b`).
>
> **Ordem da skill:** este plano foi revisado (Fase 2) **antes** de qualquer código de produção (só os arquivos de teste foram escritos
> antes, sem rodar).
>
> **Fase 2 (um revisor fresco, sonda `e126r-fase2.js`, não versionada, rodada uma vez, sozinha): 0 Critical, 2 Important, 6 Minor, todos
> aceitos.** A matriz de quem pode o quê confere rota por rota; nenhum gesto esquecido nem escondido demais. **I1** — falso 409 com
> legado (medido): nome `'  Legado  '` e `tipo_uso` NULL; B salva sem mudar nada (grava `'Legado'`/`'ambos'`) e A, que leu antes, recebe 409
> "Nome" e "Tipo de uso" → a RN-26 normaliza **lido, gravado e o que gravaria com a mesma função** (nome aparado, `tipo_uso` fora da
> lista → `'ambos'`, descrição `''`/NULL → `''`). **I2** — depois do 409, salvar de novo manda os mesmos lidos e recebe 409 de novo (o
> certo: atualizar os lidos no recarregar desfaria a mudança do outro calado); o *Editar* de novo recarrega o formulário da lista e o
> digitado se perde → a RN-29 e a D7 dizem isso, e um teste prende o segundo salvar. **M1** — a condição do `WHERE` só para chave lida
> **e** informada. **M2** — a RN-27 diz "valor do `current`" e onde entra a checagem da releitura. **M3** — o teste de Setores olha só a
> tabela de setores (o bloco Almoxarifados tem os mesmos `title`). **M4** — o link *Localizações* do Mapa abria a aba Tipos (sem `?tab`)
> → passa a `?tab=localizacoes` (RN-07). **M5** — o formulário de material dizia "cadastre em Configurações" ao administrador do sistema
> (`canConfigureAlmox`) → RN-11. **M6** — o 400 da forma vem antes do 404 (RN-25).
>
> **Fora (depende do P.O.):** B808 (alargar o servidor), B755, B761/C239, C224, o resto da C225, C228, C219, C230, o reparo da
> C246/C247, a tabela de conversões e o grupo acima de família.

## Regras de negócio

**C261 — as abas de Configurações que o servidor recusa ao administrador do sistema.** Testes:
`client/src/components/almoxarifado/ConfiguracoesSomenteLeitura.test.js`. "Não grava" = `podeGravarConfigAlmox(getEffectiveUser(user))`
falso (o administrador do sistema `role: 'admin'` sem perfil e sem administrador do módulo); "grava" = perfil Administrador, administrador
do módulo ou Super Administrador. Cada cenário negativo tem a metade positiva (o conteúdo da aba está lá).

- **RN-01 — Tipos de material:** quem não grava vê os cartões (nome, selos) **sem** *Novo Tipo de Material* e **sem** os ícones de
  editar e excluir (ganham `title="Editar"` e `title="Excluir"`), com a frase *F-TIPOS*.
- **RN-02 — Estoques mínimos:** a tabela com os valores, os quatro campos por linha **desabilitados**, **sem** *Salvar Alterações*, o
  filtro de materiais funcionando, com a frase *F-ESTOQUES*.
- **RN-03 — Setores e Áreas:** o bloco *Almoxarifados* **como hoje** (o servidor deixa — *Novo Almoxarifado*, *Editar*, *Inativar*
  continuam); a tabela de setores **sem** *Novo Setor ou Área*, *Editar* e *Inativar*, com a frase *F-SETORES* logo abaixo do título
  *Setores e Áreas*.
- **RN-04 — Localizações:** a lista **sem** *Nova Localização*, *Editar*, *Mover* e *Excluir*; ficam *Etiqueta*, *Imprimir etiquetas* e
  o link do *Mapa*; com a frase *F-LOCALIZACOES*.
- **RN-05 — Liberação por valor:** a chave, o limite e as caixas dos aprovadores **desabilitados** (com os valores gravados), a busca de
  usuário funcionando, **sem** *Salvar Configurações*, com a frase *F-LIBERACAO*.
- **RN-06 — Alertas de estoque, Regras de aprovação e Configurações gerais:** no lugar da aba, a frase *R-ALERTAS*, *R-REGRAS*,
  *R-GERAL*; o `GET` da aba (`/almoxarifado/configuracoes/alertas-estoque`, `/almoxarifado/regras-aprovacao`,
  `/almoxarifado/configuracoes`) **não é chamado** e **nenhum** toast de erro aparece.
- **RN-07 — Mapa de Áreas:** quem não grava vê o mapa **sem** *Editar Posições* (e, sem localização, sem *Cadastrar localizações*); o
  link *Localizações* fica. Quem grava, como hoje. **Fase 2, M4:** os dois links (*Localizações* e *Cadastrar localizações*) apontavam para
  `/almoxarifado/configuracoes` sem `?tab` e abriam a aba Tipos — passam a `/almoxarifado/configuracoes?tab=localizacoes`.
- **RN-08 — quem grava:** cada uma das oito abas e o mapa **como hoje** — os botões lá, nenhuma frase, o `GET` das três chamado.
- **RN-09 — as abas que o servidor deixa não mudam para quem não grava:** *Categorias* (*Nova Categoria*), *Motivos*, *Materiais por
  setor*, *Perfis de Acesso*, o bloco *Almoxarifados*; e a aba Famílias como na 125.
- **RN-11 (Fase 2, M5) — o formulário de material:** sem família (ou sem localização) cadastrada, *"— cadastre em Configurações → Famílias"*
  (ou *"Configurações"*) só para quem grava (`podeGravarConfigAlmox`); o administrador do sistema vê *"— solicite a um administrador"*
  (o ramo que já existe). O link de localização passa a `?tab=localizacoes`. Teste: `MaterialFormDicaConfiguracoes.test.js`.
- **RN-10 — o usuário efetivo decide** (o mesmo do portão da tela): logado Administrador, efetivo administrador do sistema → somente
  leitura.

**D (125) — o *Editar* da aba Famílias com os campos lidos.** Testes: `server/tests/api/familiaCamposLidos.api.test.js` e
`client/src/components/almoxarifado/Familias.test.js` (ou `FamiliasEditarLidos.test.js`). "Outro" = escrita pela rota de outro
Administrador (ou direta no banco) depois de a lista carregar.

- **RN-20 — um campo mudado por outro** (descrição `"desc"` → `"desc do outro"`): o *Editar* com `campos_lidos` do que leu e `nome:
  "Renomeada"` → **409** *E1* singular com `"Descrição"`, **nada gravado** (nem o nome), **sem** Auditoria.
- **RN-21 — vários:** nome e tipo de uso mudados → *E1* plural `"Nome" e "Tipo de uso"`; os três → `"Nome", "Tipo de uso" e
  "Descrição"` (ordem da tela).
- **RN-22 — lido ≠ gravado, mas o salvar grava o gravado** (digitou o mesmo que o outro) → **200**.
- **RN-23 — sem `campos_lidos`** → o de hoje (200, o corpo gravado). Chave parcial: só as presentes comparam; chave fora da lista
  (`ativo`, `parent_id`, `codigo`, `qualquer`) é ignorada. O *Reativar* (`{ativo: 1}`) e o *Nova* (`POST`) não mudam.
- **RN-24 — forma:** `campos_lidos` `null`, array, texto ou número → **400** *"Campos lidos inválidos"*; um valor que é objeto ou array
  → o mesmo 400. Não entra no `UPDATE`.
- **RN-25 — ordem:** Almoxarife → **403** antes de tudo; `nome` vazio → **400** *"Nome é obrigatório"* antes do 409; família que não existe
  → **404**; o 409 vem **antes** das conferências de nível (`parent_id` com subfamília ativa etc.). **Fase 2, M6:** a forma inválida de
  `campos_lidos` é recusada **antes** da leitura do banco — id inexistente com forma inválida → **400**, não 404.
- **RN-26 — normalização (Fase 2, I1: a MESMA função para o lido, o gravado e o que gravaria):** `nome` → `String(v ?? '')` aparado;
  `descricao` → `''` para `null`/`undefined`/`''`, senão `String(v)`; `tipo_uso` → o valor se for `administrativo|industrial|ambos`, senão
  `'ambos'` (inclusive NULL). O que gravaria: o corpo; omitido → o gravado. Prova: o legado `'  Legado  '`/NULL salvo sem mudar por B
  (vira `'Legado'`/`'ambos'`) e A, que leu antes, edita → **200**. `descricao` NULL lida como `null` e mandada `''`
  → igual (nenhum falso 409). `tipo_uso` NULL gravado, lido `null`, mandado `'ambos'` → 200.
- **RN-27 — a janela:** o campo lido mudado **entre** a leitura e o `UPDATE` (com ele em `campos_lidos` **e** informado no corpo — Fase 2,
  M1: o omitido é preservado e não se desfaz) → o `WHERE` leva `col IS ⟨valor do current⟩` (o gravado, **não** o lido do cliente — Fase 2,
  M2); a checagem da releitura entra logo depois das de `parent_id`/`ativo` e antes do `conferir`, comparando cru (`?? null`) → **409** *L409* (*"A família mudou enquanto era salva — nada foi gravado. Recarregue a família e salve de novo."*),
  o valor do outro fica. Sem a chave em `campos_lidos` → o de hoje.
- **RN-28 — não é autorização:** um `campos_lidos` falso só pode recusar (lido = gravado nada muda: RN-22 + RN-23).
- **RN-29 — a tela:** o *Editar* manda `campos_lidos` com `nome`, `tipo_uso`, `descricao` **crus** da família da lista (`null` fica
  `null`, chave ausente vai `null`), mesmo depois de o usuário editar o formulário; o *Nova família*, o *Nova subfamília* e o *Reativar*
  **não** levam a chave; o 409 vai para o toast com a literal, o formulário **fica** (o digitado está lá para ser lido ou copiado) e a lista **recarrega**. **Fase 2,
  I2:** os lidos **não** se atualizam no recarregar — salvar de novo sem clicar *Editar* manda os mesmos lidos e recebe o 409 de novo (o
  certo: atualizar desfaria a mudança do outro calado); clicar *Editar* recarrega o formulário da lista (o digitado se perde). Teste: o
  segundo salvar leva os mesmos `campos_lidos`.

**Integração (T4).** `server/tests/api/familiaCamposLidosIntegracao.api.test.js`: (i) **pela rota** — família criada pela rota; o
Administrador A e o B leem (`GET /familias?ativo=all`) e montam o corpo da tela (`{nome, descricao, tipo_uso, campos_lidos}`); B muda a
descrição (200); A renomeia → 409 *E1* `"Descrição"`, nada gravado; A relê e edita → 200 com a descrição de B e o nome de A; depois B
inativa (DELETE) e o *Reativar* de A (`{ativo: 1}`) → 200 com o nome de A. (ii) **pelo serviço** — `camposDesfeitosFamilia` e
`mensagemCamposFamiliaMudadosPorOutro` direto.

## Contrato congelado

**Frases (cliente, `client/src/components/almoxarifado/ConfiguracoesAlmoxarifado.js`):**

- `fraseSomenteLeitura(oQue)` = `` `Somente leitura — ${oQue} é do Administrador do almoxarifado ou do Super Administrador; peça a um deles.` ``
- `fraseRestrita(oQue)` = `` `Restrito — ${oQue} é do Administrador do almoxarifado ou do Super Administrador; peça a um deles.` ``
- *F-FAMILIAS* = `fraseSomenteLeitura('cadastrar, editar, inativar e reativar famílias')` — **a mesma literal** da 125 (o teste da 125
  continua passando sem mudar).
- *F-TIPOS* = `fraseSomenteLeitura('cadastrar, editar e excluir tipos de material')`
- *F-ESTOQUES* = `fraseSomenteLeitura('mudar estoque mínimo, estoque máximo, ponto de pedido e prazo de reposição')`
- *F-SETORES* = `fraseSomenteLeitura('cadastrar, editar e inativar setores e áreas')`
- *F-LOCALIZACOES* = `fraseSomenteLeitura('cadastrar, editar, mover e excluir localizações')`
- *F-LIBERACAO* = `fraseSomenteLeitura('mudar a liberação por valor e os aprovadores')`
- *R-ALERTAS* = `fraseRestrita('ver e mudar os alertas de estoque')`
- *R-REGRAS* = `fraseRestrita('ver e mudar as regras de aprovação')`
- *R-GERAL* = `fraseRestrita('ver e mudar as configurações gerais do almoxarifado')`
- Um componente `AvisoSomenteLeitura({ frase })` com o estilo da 125 (classe `almox-config-somente-leitura`; a aba Famílias mantém também
  a `almox-familias-somente-leitura`).
- Nenhuma rota nova, nenhuma rota muda para a C261.

**`PUT /api/almoxarifado/familias/:id`** — chave nova **`campos_lidos`** (opcional): objeto; chaves lidas `nome` "Nome", `tipo_uso` "Tipo de
uso", `descricao` "Descrição" (ordem da tela); cada valor `string | number | boolean | null`; outras chaves ignoradas.

- Forma inválida (presente e não objeto simples, ou um valor objeto/array) → **400** `{ error: 'Campos lidos inválidos' }` — depois do 400 do
  nome e do formato do `parent_id`, antes da leitura do banco.
- Novo **409**, depois do 404, do 400 de `ativo` e do 400 *"Família não pode ser pai de si mesma"*, antes das conferências:
  - *E1* singular: *"O campo "⟨rótulo⟩" da ⟨família|subfamília⟩ ⟨código gravado⟩ foi mudado por outra pessoa depois que você abriu a
    edição — salvar desfaria essa mudança, e nada foi gravado. Recarregue a lista e edite de novo."*
  - *E1* plural: *"Os campos "⟨r1⟩", "⟨r2⟩" e "⟨r3⟩" da ⟨família|subfamília⟩ ⟨código gravado⟩ foram mudados por outra pessoa depois que
    você abriu a edição — salvar desfaria essas mudanças, e nada foi gravado. Recarregue a lista e edite de novo."*
  - "subfamília" quando `current.parent_id` (verdadeiro), senão "família".
- `WHERE` do `UPDATE`: para cada chave lida presente **e** informada no corpo, `AND <col> IS ?` com o valor do `current`. Não gravou e, na releitura, uma coluna
  lida difere do `current` → **409** *L409* (a literal que já existe).
- Sem `campos_lidos`: o de hoje. **Schema:** nenhuma coluna, nenhuma migração, nenhuma A.
- Serviço: `server/services/almoxarifado/familiaCamposLidos.js` — `CAMPOS_LIDOS_FAMILIA`, `camposLidosFamiliaInvalidos(v)`,
  `camposDesfeitosFamilia(lidos, gravado, gravaria)`, `mensagemCamposFamiliaMudadosPorOutro(ehSub, codigo, rotulos)`.

## Tasks (sort topológico)

- [ ] **T1 — tronco (D (125), servidor)** — `familiaCamposLidos.js` + `routes/almoxarifado.js` (`PUT /familias/:id`). RN-20..RN-28.
- [ ] **T2 — galho (tela, Famílias)** — `TabFamilias` (`handleEditar` guarda os lidos; `handleSalvar` os manda; 409 → toast, fica,
  recarrega) + teste. RN-29. Contra o contrato (mock HTTP).
- [ ] **T3 — galho (tela, C261)** — `ConfiguracoesAlmoxarifado.js` (as frases, o aviso, as cinco abas somente leitura, as três restritas
  no pai) + `MapaLocalizacoesAlmoxarifado.js` + `MaterialAlmoxarifadoForm.js` (RN-11) + `ConfiguracoesSomenteLeitura.test.js` +
  `MaterialFormDicaConfiguracoes.test.js`. RN-01..RN-11. Disjunta da T2 por regra (quem pode
  × o que leu); o arquivo é o mesmo — **T2 e T3 em sequência**, não em paralelo.
- [ ] **T4 — integração** — `familiaCamposLidosIntegracao.api.test.js` (acima).
- [ ] **T5 — fechamento** — novidades (B811+, C263+ se houver, D (126)), specs 01 e 23, mapa, guia, manual, plano (com a retro e a
  "Próxima tarefa detalhada — Etapa 127"), o "defeito que escapou" da retro da 125. CLAUDE.md só se a trava mudar (não deve).

A suíte inteira roda **uma por vez**; revisores rodam só os próprios arquivos e nunca junto com a suíte (nem dois arquivos de servidor ao
mesmo tempo, nem jest junto).
