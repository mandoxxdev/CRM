# Etapa 187 — A ferramenta baixada não é calibrada nem editada, e a restrição da manutenção aparece na lista e no Emprestar

> **Status:** 📝 **plano escrito (2026-10-22), Fase 2 ainda não rodou** — é o primeiro passo. Feature **16** (ferramentas e calibração).
> Fecha **D (177)(2)** e **D (177)(5)** de `docs/almoxarifado-novidades-por-etapa.md:17824-17832`. Origem: plano da 177
> (`docs/superpowers/plans/2026-10-22-almoxarifado-etapa177-retorno-da-manutencao-com-condicao-e-destino.md`, "Fase 5", achado 5, e
> "Releitura própria", 3º item).
> Antes: Etapa 186 (PDFs de remessa e posição) — **não tocar** nos arquivos dela (outra sessão revisa a 186 em paralelo). A Etapa 179
> (confirmado pela outra sessão) não toca `toolService.js` nem `FerramentasAlmoxarifado.js`.
> Fora do escopo: **B1146** (instrumento perdido, avariado, em manutenção ou bloqueado ainda mede na inspeção) — continua como está.

## Objetivo (em linguagem simples)

Duas pontas soltas que a Etapa 177 deixou nas ferramentas:

1. **A ferramenta baixada (descartada) ainda aceitava calibração e edição** por fora da tela. Depois desta etapa o servidor recusa as
   duas, com a frase *"Ferramenta baixada não pode ser calibrada (⟨nome⟩)"* e *"Ferramenta baixada não pode ser editada (⟨nome⟩)"*. Para
   mexer nela, primeiro **Reverter baixa**. A tela tira o botão **Editar** da linha da baixada (o **Calibração** já não aparecia).
2. **A restrição some depois de gravada.** Quando o almoxarife conclui a manutenção com *Em uso com restrição* (ex.: *"Só para serviço
   leve"*), a ferramenta volta a *Disponível* e fica igual a uma perfeita. Depois desta etapa a lista mostra o selo **"Em uso com
   restrição"** e o texto da restrição, e o **Emprestar** avisa — **sem bloquear**. A restrição some quando uma manutenção nova é
   concluída *Em condições de uso*.

Analogia: a furadeira que voltou do conserto "só para furo pequeno" ganha uma etiqueta amarela na prateleira. Quem pega vê a etiqueta; ela
não tranca a prateleira. A etiqueta sai quando a furadeira volta de outro conserto "boa".

## Fase 0 (medido em 2026-10-22, sobre `5e36349d`)

**Baixada (D (177)(2))**

- `server/services/almoxarifado/toolService.js:536-540` — `registrarCalibracao` lê `WHERE id = ? AND ativo = 1` (`:537`), 404 se não acha
  (`:538`), depois só a data (`:540-542`) e `INSERT … VALUES` (`:544-550`). **Não olha `status`.** Confirmado.
- `toolService.js:31-33` — `atualizarFerramenta` lê `WHERE id = ? AND ativo = 1` (`:32`), 404 (`:33`); `UPDATE … WHERE id = ?` (`:45`) sem
  status; corpo vazio sai cedo com `{ id }` (`:42`). **Não olha `status`.** Confirmado.
- **Padrão de recusa por status:** todas são **400** com a frase em `error` — `:89` (emprestar legado), `:161` (bloquear), `:177`
  (desbloquear), `:213` (manutenção), `:336` (reencontrar), `:351` (reverter baixa), `:404` (ocorrência), o empréstimo real
  `termoFerramentaService.js:241`. **409** só para patrimônio duplicado (`server/routes/almoxarifado/extended.js:1644`, `:1653`).
- **Referência de frase (Fase 5 da 177):** `server/services/almoxarifado/inspectionService.js:121-124`, em `resolverMedidas`:
  `400 "Ferramenta baixada não pode ser usada em medição (${ferramenta.nome})"`. As frases novas seguem esse molde (nome entre parênteses).
- Rotas: `PUT /api/almoxarifado/ferramentas/:id` (`extended.js:1649-1656`, `requirePermission('gerenciar_ferramentas')` +
  `validate(FerramentaUpdateSchema)`, catch UNIQUE → 409); `POST /ferramentas/:id/calibracoes` (`:1700-1714`, porta → multer → `safeParse`
  manual → serviço; **qualquer** erro do serviço chama `limparUploadOrfaoEm`, `:1711` — o certificado não fica órfão).
- Tela `client/src/components/almoxarifado/FerramentasAlmoxarifado.js:781-784`: **Editar** em toda linha, inclusive na baixada;
  **Calibração** já sai da baixada (`:832`, RN-177.10).

**Restrição (D (177)(5))**

- `toolService.js:257` — `CONDICOES_RETORNO = ['OK','COM_RESTRICAO','INSERVIVEL']`; `:277-278` exige observações para `COM_RESTRICAO`;
  `concluirManutencao` (`:286-321`) grava `condicao_retorno`, `destino` e `observacoes` (`COALESCE(?, observacoes)`, `:289`) na linha da
  manutenção. Uma manutenção aberta por ferramenta (claim de status de `iniciarManutencao`, `:192-215`).
- `listarFerramentas` (`:462-496`) devolve `SELECT *` + `calibracao_vigente` + `emprestimo_aberto` — **não lê** a manutenção. Confirmado.
- `GET /ferramentas` (`extended.js:1629-1637`): `can(req.user, 'gerenciar_ferramentas')` → tudo; senão `emprestimo_aberto` por **lista
  branca** (`id`, `data_prevista_devolucao`) — Etapa 181, B1186. Os demais campos passam inteiros (`...f`).
- Consumidores de `GET /almoxarifado/ferramentas` no client: `FerramentasAlmoxarifado.js` e `InspecoesAlmoxarifado.js` (seletor de
  instrumento — só lê `id/nome/status/calibração`; campo novo não o afeta).

### Divergências e achados da Fase 0

1. **`toolService.js:73` (`emprestarFerramenta`) não é a porta do empréstimo.** Desde a Etapa 180 nenhuma rota a chama (comentário `:68-71`);
   a rota `POST /ferramentas/:id/emprestar` (`extended.js:2105-2121`) usa `termoFerramentaService.emprestarComTermo`
   (`termoFerramentaService.js:216-241`). Como o aviso **não bloqueia** (B1246), **nenhuma** das duas muda — o aviso é da tela.
2. **RN-175.01 diz "Editar em qualquer status"** (plano da 175, `:26`; teste `FerramentasAlmoxarifado.test.js:568` e `:660`), e o teste da 177
   **afirma** `Editar` na baixada (`FerramentasAlmoxarifado.test.js:825`); o guia diz *"Na linha da baixada: só **Editar** e **Reverter
   baixa**"* (`docs/almoxarifado-guia-etapas-e-testes.md:7362`). Esta etapa **muda** a regra (B1242): a 175 passa a ser "qualquer status
   **salvo Baixada**". O fechamento corrige spec 16, guia e o teste da 177 **dizendo** que mudou (regra 5 do CLAUDE.md), não em silêncio.
3. **Achado (não muda aqui) — o histórico da ferramenta é aberto a todo o módulo.** `GET /ferramentas/:id/manutencoes` (`extended.js:1752`),
   `/calibracoes` (`:1716`) e `/ocorrencias` (`:1809`) só têm `auth`; `listarManutencoes` (`toolService.js:323-326`) é `SELECT *` (as
   `observacoes` — inclusive a restrição — e o `usuario_id`). Pesa na B1245: esconder a observação da restrição na lista **não protege
   nada**, ela já sai ali. Fica em **D (187)**.
4. As linhas do pedido batem (`:536-540`, `:31-33`, `:257`, `:462`, `:73`); a do `:257` é a lista de condições — a exigência das observações
   é `:277-278`.

## Regras

Preparação comum: ADMIN (`role: 'admin', is_superadmin: 1`), ALMOXARIFE (`perfil_almoxarifado: 'ALMOXARIFE'`), PRODUCAO (sem perfil →
fallback), GESTOR. Ferramenta `FER-187` *Torquímetro 187*, `exige_calibracao = 1`.

| ID | Regra | Cenário |
|---|---|---|
| RN-187.01 | **Calibrar a baixada é recusado**: `POST /ferramentas/:id/calibracoes` em BAIXADA → **400** `Ferramenta baixada não pode ser calibrada (⟨nome⟩)`. Nada gravado: nenhuma linha em `calibracoes_ferramenta_almoxarifado`, nenhuma `CALIBRACAO` na auditoria, o certificado anexado é apagado do disco. A recusa da baixada vem **antes** da data inválida. | `FER-187` baixada, calibração válida com certificado → 400 literal, 0 linhas, `readdirSync` igual ao de antes. Baixada + validade ≤ calibração → a frase da **baixada**, não a da data. |
| RN-187.02 | **Editar a baixada é recusado**: `PUT /ferramentas/:id` em BAIXADA → **400** `Ferramenta baixada não pode ser editada (⟨nome⟩)`. Nada muda (colunas iguais, nenhuma `EDICAO` na auditoria) — inclusive com **corpo vazio** (hoje 200) e com patrimônio de **outra** ferramenta (a frase da baixada, não o 409). | `{ nome: 'Novo' }` → 400 literal, `nome` continua *Torquímetro 187*. `{}` → 400. `{ codigo_patrimonio: <de outra> }` → 400 (não 409). |
| RN-187.03 | **Os outros status não mudam**: DISPONIVEL, EMPRESTADA, EM_MANUTENCAO, AVARIADA, PERDIDA, BLOQUEADA calibram (201) e editam (200) como antes; depois de **Reverter baixa**, a mesma ferramenta calibra e edita. Inexistente continua 404 `Ferramenta não encontrada`; PRODUCAO continua 403. | Laço nos 6 status: calibrar 201 e editar 200. Reverter → 201/200. |
| RN-187.04 | **A guarda está na gravação**, não só na leitura: se a ferramenta vira BAIXADA entre a leitura e a gravação, a recusa sai do mesmo jeito e nada é gravado. | Gancho no `db.get` da leitura inicial grava `status = 'BAIXADA'` e devolve a linha velha → PUT 400 literal / calibração 400 literal, nada gravado. |
| RN-187.05 | **`GET /ferramentas` traz `restricao`** por ferramenta: decide a **última manutenção concluída que declarou condição** (`data_fim IS NOT NULL AND condicao_retorno IS NOT NULL`, ordem `data_fim DESC, id DESC`). `COM_RESTRICAO` → `{ manutencao_id, observacoes, data_fim }`; `OK` ou `INSERVIVEL` → `null`; manutenção concluída **sem** condição (integração, B1140) **não decide** (é pulada); nenhuma → `null`. Vale em qualquer status (o servidor não esconde). | (a) concluir `COM_RESTRICAO`/`USO` *"Só para serviço leve"* → `restricao.observacoes = 'Só para serviço leve'`; (b) nova manutenção concluída `OK` → `null`; (c) nova `COM_RESTRICAO` *"Sem impacto"* → a nova substitui; (d) depois de (a), uma concluída **sem** condição → a restrição de (a) continua; (e) duas conclusões no mesmo segundo → vale a de `id` maior; (f) manutenção aberta (sem `data_fim`) não conta. |
| RN-187.06 | **Quem não gerencia ferramentas vê a restrição** (selo e texto) por **lista branca** — exatamente `{ manutencao_id, observacoes, data_fim }` — e o `emprestimo_aberto` continua mascarado (Etapa 181 não regride). | PRODUCAO e GESTOR: `deepStrictEqual(f.restricao, { manutencao_id, observacoes: 'Só para serviço leve', data_fim })`; `emprestimo_aberto` = `{ id, data_prevista_devolucao }`, sem `CARLOS`. ALMOXARIFE/ADMIN: o mesmo `restricao`. |
| RN-187.07 | **A restrição não bloqueia o empréstimo**: emprestar a ferramenta com restrição → **201** como qualquer DISPONIVEL; o servidor do empréstimo não muda. | `emprestarComTermo` → 201, status EMPRESTADA; a lista continua com `restricao` (a ferramenta segue restrita emprestada). |
| RN-187.08 | **Tela**: (a) a lista mostra o selo **"Em uso com restrição"** e a linha **"Restrição: ⟨observações⟩"** na coluna Status quando `restricao` existe e o status **não** é BAIXADA — para todos, com ou sem permissão de escrita; (b) o modal **Emprestar** mostra *"Esta ferramenta voltou da manutenção em uso com restrição: ⟨observações⟩. Confira antes de emprestar."* e **envia normalmente**; (c) sem `restricao`, nem selo nem aviso; (d) a baixada **não** tem **Editar** (as outras continuam tendo — RN-175.01 emendada). | Jest com mock na fronteira e com a fixture real da T4. |

## Contrato (congelado)

**`PUT /api/almoxarifado/ferramentas/:id`** — sem mudança de payload nem de porta. Ordem das respostas:
1. `403` (porta `gerenciar_ferramentas`, como hoje)
2. `400 "Dados inválidos — …"` (Zod, como hoje)
3. `404 { error: "Ferramenta não encontrada" }` (como hoje)
4. **`400 { error: "Ferramenta baixada não pode ser editada (⟨nome⟩)" }`** — novo; vale com corpo vazio; vem antes do 409
5. `409 { error: "Código de patrimônio já cadastrado" }` (como hoje)
6. `200 { id }` (como hoje)

**`POST /api/almoxarifado/ferramentas/:id/calibracoes`** — sem mudança de payload nem de porta. Ordem:
1. `403` (porta, antes do multer — como hoje)
2. `400 "Dados inválidos — …"` (`safeParse`, como hoje)
3. `404 { error: "Ferramenta não encontrada" }`
4. **`400 { error: "Ferramenta baixada não pode ser calibrada (⟨nome⟩)" }`** — novo; antes da data
5. `400 { error: "Data de validade deve ser posterior à data de calibração" }` (como hoje)
6. `201 { id }`
Em todo 4xx depois do multer o certificado é apagado (`limparUploadOrfaoEm`, já existente).

`⟨nome⟩` = `ferramentas_almoxarifado.nome` relido no momento da recusa (molde `inspectionService.js:123`).

**`GET /api/almoxarifado/ferramentas`** — cada item ganha **`restricao`**:

```
restricao: null | { manutencao_id: number, observacoes: string, data_fim: "AAAA-MM-DD HH:MM:SS" }
```

Igual para quem gerencia e para quem não gerencia (para este último, montado por lista branca na rota). Nada mais muda no item.

**Serviço** (`toolService.js`):

```js
// Etapa 187 (RN-187.05, B1244): decide a ultima manutencao concluida que DECLAROU condicao; sem condicao (B1140) nao decide.
async function restricaoVigente(db, ferramentaId) {
  const ult = await dbGet(db, `SELECT id, condicao_retorno, observacoes, data_fim FROM manutencoes_ferramenta_almoxarifado
    WHERE ferramenta_id = ? AND data_fim IS NOT NULL AND condicao_retorno IS NOT NULL
    ORDER BY data_fim DESC, id DESC LIMIT 1`, [ferramentaId]);
  return ult && ult.condicao_retorno === 'COM_RESTRICAO'
    ? { manutencao_id: ult.id, observacoes: ult.observacoes, data_fim: ult.data_fim }
    : null;
}
// em listarFerramentas, no laco: f.restricao = await restricaoVigente(db, f.id);
```

`atualizarFerramenta`: depois do 404, `if (atual.status === STATUS.BAIXADA) throw baixadaNao('editada', atual.nome)` (pega o corpo vazio);
o `UPDATE` ganha `AND ativo = 1 AND status <> ?` (`STATUS.BAIXADA`); `changes === 0` → reler: sumiu → 404, BAIXADA → 400 com o nome relido.

`registrarCalibracao`: depois do 404, `if (ferr.status === STATUS.BAIXADA) throw baixadaNao('calibrada', ferr.nome)` (antes da data); o
`INSERT … VALUES` vira `INSERT … SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM ferramentas_almoxarifado WHERE id = ? AND ativo = 1 AND
status <> ?)`; `changes === 0` → reler: sumiu → 404, BAIXADA → 400 com o nome relido.

```js
const baixadaNao = (verbo, nome) => Object.assign(new Error(`Ferramenta baixada não pode ser ${verbo} (${nome})`), { status: 400 });
```

**Rota `GET /ferramentas`** (lista branca de quem não gerencia):

```js
res.json(ferramentas.map((f) => ({
  ...f,
  emprestimo_aberto: f.emprestimo_aberto
    ? { id: f.emprestimo_aberto.id, data_prevista_devolucao: f.emprestimo_aberto.data_prevista_devolucao } : null,
  restricao: f.restricao
    ? { manutencao_id: f.restricao.manutencao_id, observacoes: f.restricao.observacoes, data_fim: f.restricao.data_fim } : null,
})));
```

**Tela** (literais):
- selo: `<span className="almox-badge almox-badge-baixo almox-selo-restricao">Em uso com restrição</span>` (classe existente
  `almox-badge-baixo`, `Almoxarifado.css:252`; a classe `almox-selo-restricao` só serve de âncora de teste) e, abaixo, `Restrição: ⟨observações⟩`
  (fonte 0,75 rem, como a linha *com ⟨colaborador⟩*);
- aviso do Emprestar, no corpo do modal, logo abaixo do código/nome, `role="note"`:
  `Esta ferramenta voltou da manutenção em uso com restrição: ⟨observações⟩. Confira antes de emprestar.`;
- **Editar** só quando `f.status !== 'BAIXADA'`.

## Tasks

| # | Task | Tipo | Feita |
|---|---|---|---|
| T1 | Servidor: a baixada não calibra nem edita (RN-187.01..04) | **tronco** | — |
| T2 | Servidor: `restricao` no GET + lista branca (RN-187.05..07) | **tronco** (congela o JSON da lista; mesmo arquivo da T1 — depois dela) | — |
| T3 | Tela: selo, aviso no Emprestar, Editar fora da baixada (RN-187.08) | galho (contra o contrato acima; só o client) | — |
| T4 | Integração pela rota e pelo serviço + fixture real para o client | depois de T1, T2, T3 | — |
| F5 | Revisão adversarial (Fase 5) e fix-round | depois da T4 | — |
| — | Fechamento (`fechar-etapa`) | por último | — |

T1 e T2 mexem em `toolService.js` — sequenciais (um executor, T1 → T2). T3 só toca `FerramentasAlmoxarifado.js` e o teste dele: pode ir em
paralelo numa worktree (sem SQLite compartilhado). T4 escreve no mesmo teste do client que a T3 — só depois. Nenhuma task toca motor de
estoque, trava, migration nem `ACAO_PERFIS`.

### T1 (tronco) — a baixada não calibra nem edita

Arquivos: `server/services/almoxarifado/toolService.js` (`atualizarFerramenta`, `registrarCalibracao`, helper `baixadaNao`); teste novo
`server/tests/api/toolBaixadaNaoCalibraNemEdita.api.test.js` (runner próprio, harness `testApp.js`; multipart molde
`toolCalibracao.api.test.js:77-91`; baixada pela **rota** — `POST /manutencoes` + `PUT /manutencoes/:id/concluir { condicao: 'INSERVIVEL',
destino: 'BAIXA', observacoes: 'Motor queimado' }`, molde `toolManutencaoRetorno.api.test.js:32-38`).

1. **Vermelho primeiro**:
   - `[RN-187.01] calibrar baixada com certificado` → 400, `error` === `Ferramenta baixada não pode ser calibrada (Torquímetro 187)`;
     `COUNT(*)` de calibrações 0; `auditoria_log_almoxarifado` sem `CALIBRACAO` dela; `readdirSync(uploadsAlmoxDir).length` igual ao de antes;
   - `[RN-187.01] ordem: baixada + validade inválida` → a frase da baixada;
   - `[RN-187.02] editar baixada` `{ nome: 'Novo' }` → 400 literal, `nome` relido = *Torquímetro 187*, sem `EDICAO`;
   - `[RN-187.02] corpo vazio` → 400 literal (hoje 200);
   - `[RN-187.02] patrimônio de outra ferramenta` → 400 literal (hoje 409);
   - `[RN-187.03]` laço nos 6 status (fixture direta por `UPDATE status`, porque o claim de verdade de cada um já tem teste próprio) →
     calibrar 201 e editar 200 com o `nome` novo relido; **e** baixada → reverter (`justificativa: 'baixa errada'`) → 201/200; inexistente → 404;
     PRODUCAO → 403 nas duas (metade positiva: o mesmo PUT do ALMOXARIFE dá 200);
   - `[RN-187.04] corrida` (pelo **serviço**, `toolService.atualizarFerramenta`/`registrarCalibracao` direto): embrulhar `db.get` da instância
     para, na primeira vez que o SQL casar `/FROM ferramentas_almoxarifado WHERE id = \? AND ativo = 1/`, rodar
     `UPDATE ferramentas_almoxarifado SET status = 'BAIXADA' WHERE id = ?` (pelo `db.run` original) **antes** de devolver a linha velha (status
     DISPONIVEL); esperar rejeição com `status 400` e a frase; `nome`/calibrações inalterados. **Premissa antes:** o gancho disparou (contador
     = 1) e a linha devolvida tinha `DISPONIVEL` — senão o teste não prova a janela.
2. Ver vermelho **pelos motivos certos**: 01/02/04 com 201/200 (gravou); o corpo vazio com 200; o duplicado com 409. O 03 passa de primeira
   (guarda de regressão — provada pelos controles 3 e 4).
3. Implementar o contrato. Não mexer em `concluirManutencao`, `reverterBaixa`, rotas nem schema.
4. **Controles positivos** (restauro por cópia `scratchpad/e187-t1/` + `cmp`, um por vez, âncora `perl` contada = 1, base LF — memória
   *harness LF*):
   - **(1)** tirar a checagem cedo de `registrarCalibracao` → cai **só** o `[RN-187.01] ordem` (dá a frase da data); o 01 principal fica verde
     (o `WHERE EXISTS` segura) — prova que as duas camadas são distintas;
   - **(2)** `INSERT … SELECT` sem o `WHERE EXISTS` (volta ao `VALUES`) → cai **só** o `[RN-187.04]` de calibração;
   - **(3)** `UPDATE` sem `AND status <> ?` → cai **só** o `[RN-187.04]` de edição;
   - **(4)** tirar a checagem cedo de `atualizarFerramenta` → cai **só** o `[RN-187.02] corpo vazio` (200 `{ id }`);
   - **(5)** guarda larga demais: `status <> 'BAIXADA'` trocado por `status = 'DISPONIVEL'` no `UPDATE` e no `EXISTS` → cai o laço `[RN-187.03]`
     nomeando EMPRESTADA, EM_MANUTENCAO, AVARIADA, PERDIDA e BLOQUEADA (a asserção "os outros não mudam" sabe falhar);
   - **(6)** conceder o proibido pela permissão: tirar `requirePermission('gerenciar_ferramentas')` do `PUT /ferramentas/:id` → cai o 403 do
     PRODUCAO no `[RN-187.03]` (a asserção negativa de permissão passaria verde de qualquer jeito — só este controle prova que sabe falhar);
   - **(7)** frase sem o nome (`Ferramenta baixada não pode ser editada`) → caem os 02 pelo `strictEqual` do `error`.
5. Vizinhos sem mudar asserção: `toolFerramentaEdicao`, `toolCalibracao`, `toolManutencaoRetorno`, `toolIntegracao`, `medidasInspecao`.

### T2 (tronco) — a restrição no GET

Arquivos: `toolService.js` (`restricaoVigente` + `listarFerramentas`), `server/routes/almoxarifado/extended.js:1629-1637`; teste novo
`server/tests/api/toolRestricaoDaManutencao.api.test.js`.

1. **Vermelho primeiro**, pela rota (manutenções concluídas pela rota, não por `INSERT`, salvo onde dito):
   - `[RN-187.05a]` `COM_RESTRICAO`/`USO` *"Só para serviço leve"* → ALMOXARIFE: `deepStrictEqual(f.restricao, { manutencao_id: mid, observacoes:
     'Só para serviço leve', data_fim: <o da linha relida> })`; status DISPONIVEL;
   - `[RN-187.05b]` + nova manutenção `OK` → `restricao === null` (metade positiva: **antes** dela a restrição estava lá);
   - `[RN-187.05c]` + nova `COM_RESTRICAO` *"Sem impacto"* → `observacoes === 'Sem impacto'`, `manutencao_id` da nova;
   - `[RN-187.05d]` depois de (a), uma concluída com **corpo vazio** (B1140, `condicao_retorno` NULL) → continua *"Só para serviço leve"*;
   - `[RN-187.05e]` empate: duas manutenções concluídas gravadas por `INSERT` direto com o **mesmo** `data_fim` (`'2026-10-22 10:00:00'`),
     a de `id` menor `OK` e a de `id` maior `COM_RESTRICAO` → restrição; e o caso trocado (menor `COM_RESTRICAO`, maior `OK`) → `null`;
   - `[RN-187.05f]` manutenção **aberta** (sem `data_fim`) com `condicao_retorno = 'OK'` gravada à mão sobre uma restrição concluída → a
     restrição continua; ferramenta sem manutenção → `null`; BAIXADA com restrição anterior → o servidor devolve a restrição (a tela esconde);
   - `[RN-187.06]` PRODUCAO e GESTOR: o mesmo `deepStrictEqual` do `restricao` **e** `emprestimo_aberto` mascarado como na 181 (uma emprestada
     com `CARLOS LIMA` semeada, molde `ferramentasListaSemColaborador.api.test.js:39-41`); `Object.keys(f.restricao)` exatamente as três;
   - `[RN-187.07]` emprestar a restrita (`emprestarComTermo`, helper `server/tests/helpers/termoFerramenta.js`) → **201**, status EMPRESTADA,
     e a lista ainda traz a `restricao`.
2. Vermelho: todos com `restricao` `undefined` (o 07 cai só na última asserção). O `emprestimo_aberto` do 06 passa de primeira (guarda da 181).
3. Implementar o contrato.
4. **Controles positivos**:
   - **(1)** `restricaoVigente` sem `AND condicao_retorno IS NOT NULL` → cai **só** o `[RN-187.05d]` (a concluída sem condição apaga);
   - **(2)** `ORDER BY data_fim DESC, id ASC` → cai **só** o `[RN-187.05e]` (os dois casos do empate);
   - **(3)** sem `AND data_fim IS NOT NULL` → cai o `[RN-187.05f]` da manutenção aberta;
   - **(4)** a lista branca da rota com um campo a mais (`usuario_id: 1`) no `restricao` de quem não gerencia → cai **só** o `[RN-187.06]`
     (chaves exatas);
   - **(5)** a lista branca **sem** `restricao` (volta ao `.map` antigo, que espalha `...f`): **verde** — esperado, o objeto já tem só três
     chaves; o (4) é o que prova a lista branca. Registrar o resultado, não pular;
   - **(6)** conceder o proibido: a rota passa a mandar o objeto inteiro (`return res.json(ferramentas)`) para todos → cai o `[RN-187.06]` pelo
     `CARLOS` no corpo (a 181 não regride — a asserção que a guarda sabe falhar);
   - **(7)** `emprestarComTermo` recusando a restrita (sabotagem: `if (ferr.status === STATUS.DISPONIVEL && restrita) throw`) → cai `[RN-187.07]`.
5. Vizinhos: `ferramentasListaSemColaborador` 4/4 sem mudar asserção; `toolManutencaoRetorno`; `termoFerramenta*`.

### T3 (galho) — a tela

Arquivos: `client/src/components/almoxarifado/FerramentasAlmoxarifado.js` e `FerramentasAlmoxarifado.test.js`. Mock na fronteira HTTP com o
JSON do contrato (ferramenta `DISPONIVEL` com `restricao: { manutencao_id: 31, observacoes: 'Só para serviço leve', data_fim:
'2026-10-22 10:00:00' }`).

1. Testes (vermelho primeiro):
   - `[RN-187.08a]` a linha da restrita tem `Em uso com restrição` e `Restrição: Só para serviço leve`; a da sem restrição, não (metade
     positiva); com `mockPode = () => false` o selo **continua** (é leitura);
   - `[RN-187.08a] baixada` com `restricao` → **sem** selo (metade positiva: a DISPONIVEL com a mesma `restricao` tem);
   - `[RN-187.08b]` abrir **Emprestar** na restrita → o aviso literal inteiro no modal; preencher como `:293-316` e confirmar → **um** POST
     (não bloqueia); na sem restrição, o aviso não existe;
   - `[RN-187.08d]` a baixada **sem** `Editar`; DISPONIVEL/EMPRESTADA/BLOQUEADA/EM_MANUTENCAO/AVARIADA/PERDIDA **com**. **Emenda de teste
     existente:** `:825` passa de `toBeTruthy()` para `toBeFalsy()` com comentário `Etapa 187 (B1242): a baixada nao edita` — é a mudança de
     regra, não um teste quebrado; o `RN-175.01` (`:568`) ganha no nome *"salvo Baixada"*.
2. Implementar o contrato da tela.
3. **Controles positivos**: (A) selo sem a condição `f.status !== 'BAIXADA'` → cai só o `[RN-187.08a] baixada`; (B) o aviso lendo
   `modal.ferramenta.restricao?.texto` (campo errado) → cai o `[RN-187.08b]`; (C) `confirmarEmprestar` com `if (modal.ferramenta.restricao)
   return;` (bloqueia) → cai o "um POST"; (D) Editar de volta em toda linha → cai o `[RN-187.08d]` e o `:825` emendado; (E) selo dentro do
   `{podeEscrever && …}` → cai o "sem permissão continua".
4. `CI=true npx react-scripts test src/components/almoxarifado/FerramentasAlmoxarifado --watchAll=false`.

### T4 — integração pela rota e pelo serviço

Arquivo: `server/tests/api/toolBaixadaERestricaoIntegracao.api.test.js`; fixture
`client/src/components/almoxarifado/__fixtures__/ferramentasRestricao.rota.json` (molde I3 da 183 / T3 da 184: o teste **sempre** compara a
fixture versionada com a resposta real; `CRM_GRAVAR_FIXTURE=1` só regrava).

- **Pela rota (o gesto até o fim):** ALMOXARIFE inicia manutenção → conclui `COM_RESTRICAO`/`USO` *"Só para serviço leve"* → `GET
  /ferramentas` (ALMOXARIFE e PRODUCAO) com `restricao` → emprestar com termo **201** → devolver 200 → `GET` ainda com `restricao` → nova
  manutenção → conclui `OK` → `GET` com `restricao: null` → nova manutenção → conclui `INSERVIVEL`/`BAIXA` → editar 400 literal e calibrar 400
  literal (certificado apagado) → **reverter baixa** → editar 200 e calibrar 201 → `GET /calibracoes/painel` mostra a calibrada de novo.
  Cada passo afirma status e corpo; nada de "não dá 4xx".
- **Pelo serviço:** `listarFerramentas(db)` × o corpo da rota do ALMOXARIFE (`JSON.stringify` igual para a restrita); `atualizarFerramenta`
  e `registrarCalibracao` na baixada rejeitam com `status: 400` e a frase literal (a regra não depende da rota).
- **Fixture para o client:** dois itens reais — a restrita vista pelo **PRODUCAO** e a baixada com restrição anterior vista pelo
  **ALMOXARIFE** — conferidos por chaves, tipos e JSON idêntico. Dois Jest novos em `FerramentasAlmoxarifado.test.js` importam a fixture: o selo
  e o aviso com o texto real; a baixada sem selo e sem Editar.
- **Controles positivos:** (a) controle **(4)** da T2 **sem** regravar → cai o teste do servidor (fixture ≠ resposta real: chave `usuario_id`
  a mais no item do PRODUCAO); (b) controles **(1) e (2)** da T1 juntos (sem checagem cedo e sem `WHERE EXISTS`) → cai o passo "calibrar
  400" da rota (201); (c) `restricaoVigente` devolvendo sempre `null` **e** regravando a fixture → cai o Jest do selo com a fixture (sem
  regravar, cai o servidor); (d) controle (D) da T3 → cai o Jest "a baixada sem Editar" com a fixture.

### Fechamento (skill `fechar-etapa`)

Spec 16: a seção da 187 e o status; **dizer que mudou** a RN-175.01 (Editar em qualquer status **salvo Baixada**) e corrigir o
`toolManutencaoRetorno`/guia onde a 177 diz *"só Editar e Reverter baixa"* (`docs/almoxarifado-guia-etapas-e-testes.md:7362`); D (177)(2)
e (5) marcados como pagos na seção D das novidades, com o hash. Mapa (linha 16), guia (roteiro abaixo), manual do sistema (21.5/21.6 — a
baixada não edita nem calibra; o selo e o aviso), novidades (seção da 187, letra B abaixo, D (187)) e este plano com a próxima tarefa.

Roteiro do guia (rascunho): **Ferramentas** → manutenção → concluir *Em uso com restrição* com *"Só para serviço leve"* → a linha mostra o
selo amarelo e o texto → **Emprestar** mostra o aviso e empresta → devolver → nova manutenção, concluir *Em condições de uso* → o selo some →
nova manutenção, *Inservível* + *Baixa* → a linha da baixada não tem **Editar** → **Reverter baixa** → **Editar** volta. Entrar como chão de
fábrica: o selo aparece, sem botões.

## Letra B proposta (para `docs/almoxarifado-novidades-por-etapa.md`)

- **B1240** — A recusa da baixada é **400**, como todas as recusas por status das ferramentas (`toolService.js:161`, `:177`, `:213`, `:336`,
  `:351`, `:404`; `termoFerramentaService.js:241`) e a da inspeção (`inspectionService.js:121-124`). **Descartado:** 409 (no módulo das
  ferramentas o 409 é só patrimônio duplicado; um código diferente para a mesma família de recusa obrigaria a tela a tratar dois). Reversível.
- **B1241** — As frases trazem o **nome** entre parênteses, no molde da inspeção: *"Ferramenta baixada não pode ser calibrada (⟨nome⟩)"* e
  *"… editada (⟨nome⟩)"*. **Descartado:** o molde *"(status atual: BAIXADA)"* dos claims (a frase já diz "baixada"; o nome diz qual, útil
  pela integração).
- **B1242** — Editar a baixada é recusado **em qualquer campo** (inclusive corpo vazio), e a tela tira o **Editar** dela; para corrigir um
  dado, **Reverter baixa** primeiro. Muda a RN-175.01 (*"em qualquer status"*) e o que a 177 mostrava. **Descartado:** deixar editar só
  *observações* ou *localização* (uma lista de campos liberados vira regra nova a manter; o pedido era fechar a D (177)(2)); deixar o
  botão e mostrar o 400 (botão que sempre dá erro). Reversível: uma condição na tela e uma no serviço.
- **B1243** — A guarda mora **na gravação** (`UPDATE … AND status <> 'BAIXADA'`, `INSERT … WHERE EXISTS`) além da checagem cedo (que dá a
  ordem das frases e pega o corpo vazio). **Descartado:** só a leitura antes (uma baixa concluída no meio passaria — RN-187.04).
- **B1244** — **Quando a restrição deixa de valer:** quando uma manutenção **mais nova** é concluída com condição declarada que não seja
  *Em uso com restrição* (*Em condições de uso*; ou *Inservível*, que vai à baixa). Uma *Em uso com restrição* nova **substitui** o texto. A
  concluída **sem** condição (integração, B1140) **não apaga** — a etiqueta de segurança não some por omissão. **Descartado:** (a) qualquer
  manutenção concluída limpar (uma chamada antiga sem condição apagaria um aviso de segurança em silêncio); (b) um botão *"retirar
  restrição"* (rota e gesto novos; o caminho natural é a próxima manutenção); (c) a restrição valer para sempre. Consequência declarada:
  *Inservível* + baixa + **Reverter baixa** volta sem selo (a última condição declarada é *Inservível*, não restrição).
- **B1245** — **Quem não gerencia ferramentas vê o selo e o texto** da restrição (lista branca de três chaves: `manutencao_id`,
  `observacoes`, `data_fim`). **Por quê:** é instrução de uso da ferramenta, não dado de pessoa; quem a pega no chão de fábrica é quem mais
  precisa; e o mesmo texto **já** sai a todo o módulo por `GET /ferramentas/:id/manutencoes` (só `auth`, desde a 9b — achado 3 da Fase 0).
  **Descartado:** só o selo sem o texto para quem não gerencia (não protege nada, perde a informação útil); nada para quem não gerencia.
  A lista branca existe para que um campo novo (ex.: quem concluiu) não vaze por omissão, como a B1186. Reversível: uma chave a menos.
- **B1246** — O **Emprestar avisa e não bloqueia**: o servidor do empréstimo não muda. **Descartado:** bloquear (a usuária pediu "em uso
  com restrição" — a ferramenta **está** em uso); exigir uma caixa *"li a restrição"* (gesto a mais sem trilha; se for pedido, entra no
  termo); gravar a restrição no termo ou na auditoria do empréstimo (D (187)).
- **B1247** — O selo **não aparece na baixada** (ela não circula; o selo amarelo ao lado do vermelho confunde), mas aparece em qualquer
  outro status, inclusive *Em manutenção* (é a última condição conhecida). O servidor manda a `restricao` em todos — quem decide é a tela.
- **B1248** — a próxima etapa (preenchida no fechamento).

**D (187) proposta:** (1) a inspeção não avisa que o instrumento está em uso com restrição; (2) o empréstimo não grava que houve aviso
(nem no termo, nem na auditoria); (3) `GET /ferramentas/:id/manutencoes`, `/calibracoes` e `/ocorrencias` continuam abertos a todo o
módulo (`extended.js:1716`, `:1752`, `:1809`) — `SELECT *` com `usuario_id`; (4) B1146 segue (instrumento perdido/avariado/bloqueado mede).

## Execução

*(vazia — preenchida pelo executor, task a task, com hash, vermelho/verde e controles.)*

## Próxima tarefa detalhada

*(preenchida no fechamento. Candidatos já medidos no plano da 177: a aba de histórico da ferramenta — `GET /ferramentas/:id/manutencoes`,
`/ocorrencias`, `/emprestimos?ferramenta_id=` (`toolService.js:506` filtra por `ferramenta_id`, mas a rota exige `gerenciar_ferramentas`) —
e as 🟡 do mapa que não dependem da empresa.)*
