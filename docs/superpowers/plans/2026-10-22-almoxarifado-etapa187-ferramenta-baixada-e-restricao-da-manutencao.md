# Etapa 187 — A ferramenta baixada não é calibrada nem editada, e a restrição da manutenção aparece na lista e no Emprestar

> **Status:** ✅ **FECHADA (2026-10-22): T1 `3d45817f`, T2 `130caaca`, T3 `c643054e`, T4 `b020c10c`; Fase 5 e fix-round `e182d42d` (M1,
> a lista branca provada) e `a255dadf` (o aviso sem pontuação dupla); fechamento (skill `fechar-etapa`) no commit seguinte.** Próxima:
> **Etapa 188** (ver "Próxima tarefa detalhada", no fim). Fase 2 feita (revisor fresco, 0 Crítico, 5 Importantes, 7 Menores — ver "Emendas da
> Fase 2"; as emendas **valem por cima** do texto das RN, do contrato e das tasks). Feature **16** (ferramentas e calibração).
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
| T1 | Servidor: a baixada não calibra nem edita (RN-187.01..04) | **tronco** | ✅ `3d45817f` |
| T2 | Servidor: `restricao` no GET + lista branca (RN-187.05..07) | **tronco** (congela o JSON da lista; mesmo arquivo da T1 — depois dela) | ✅ `130caaca` |
| T3 | Tela: selo, aviso no Emprestar, Editar fora da baixada (RN-187.08) | galho (contra o contrato acima; só o client) | ✅ `c643054e` |
| T4 | Integração pela rota e pelo serviço + fixture real para o client | depois de T1, T2, T3 | ✅ `b020c10c` |
| F5 | Revisão adversarial (Fase 5) e fix-round | depois da T4 | ✅ `e182d42d`, `a255dadf` |
| — | Fechamento (`fechar-etapa`) | por último | ✅ (commit do fechamento) |

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

## Emendas da Fase 2

Revisor fresco (sem o contexto de quem escreveu), sobre `e39461ec`. Leu o plano, a spec 16, os planos da 175, 177 e 180, `toolService.js`,
`termoFerramentaService.emprestarComTermo`, `inspectionService.resolverMedidas`, as rotas de ferramentas em `extended.js` e
`FerramentasAlmoxarifado.js` + teste. Duas afirmações foram **medidas** num SQLite em memória (`node -e`, sqlite3 do `server/`), não lidas:
o `NULL` no `ORDER BY … DESC` e o `lastID` de um `INSERT … SELECT … WHERE EXISTS` que não insere. **As emendas abaixo valem por cima** do
texto das RN, do contrato e das tasks; o executor não precisa reconciliar — onde divergirem, vale a emenda.

### Respostas às quatro perguntas

1. **Contratos, mensagens e ordem.** As frases e a ordem batem com o código: `PUT` = porta (`extended.js:1649`) → `validate` → serviço (404
   em `toolService.js:33`; a checagem nova entra **antes** do `if (sets.length === 0)` de `:42`, então pega o corpo vazio) → o 409 só nasce do
   `UPDATE` (`:46` + catch da rota `:1653`), **depois** da guarda. Na corrida o 400 também vence o 409: o SQLite só confere o `UNIQUE` em linha
   que o `WHERE` casou — com `AND status <> 'BAIXADA'` não casando, não há conflito (`changes = 0`). Calibração = porta → multer → `safeParse`
   (`:1701-1706`) → serviço (404 `:538`, baixada, data `:540`); o `limparUploadOrfaoEm` de `:1711` já cobre todo erro do serviço. O **400** é
   coerente: todas as recusas por status das ferramentas e a da inspeção (`inspectionService.js:121-124`) são 400; o 409 do módulo é só
   patrimônio. **Furo:** o ramo `changes === 0` do contrato só nomeia dois desfechos (I1).
2. **RN × spec × decisões.** RN-187.05/B1244 batem com B1140 (a concluída sem condição é pulada — a etiqueta não some por omissão) e com
   B1143 (nada muda em quem dá baixa); B1146 fica fora, como dito. A mudança da RN-175.01 **está** declarada (achado 2 da Fase 0 e B1242),
   mas **a decisão que ela revê não está nomeada**: é a **B1131** (I3). A consequência declarada da B1244 cobre só *Inservível* — falta o
   caminho em que a baixa **mantém** a restrição (I4).
3. **Galhos.** T1 → T2 sequenciais (mesmo arquivo) está certo. T3 é galho de verdade: só consome o JSON congelado (`restricao` com três
   chaves ou `null`), mock na fronteira HTTP, sem SQLite. A fixture é da T4 (depois das três) — certo. **Ressalva de execução** (I5): os
   controles positivos da T1/T2/T4 sabotam `toolService.js`/`extended.js` na árvore compartilhada enquanto outra sessão fecha a 186 nela.
4. **Traçado até o último gesto.** Escrito abaixo, gesto a gesto. Único escritor de `condicao_retorno`/`data_fim` é
   `concluirManutencao` (`toolService.js:288-291`; `grep` em `server/` fora de `tests/`: nenhum outro `UPDATE`/`INSERT` na tabela além do
   `INSERT` da abertura `:220` e do `destino = NULL` da anomalia `:301`) — a regra "última concluída que declarou condição" enxerga tudo o
   que se grava. EMPRESTADA e EM_MANUTENCAO continuam editando e calibrando (RN-187.03) — correto e coerente com a tela, que mostra
   **Calibração** nelas (`FerramentasAlmoxarifado.js:832`). A corrida baixa × calibração: a única baixa é o claim `EM_MANUTENCAO → BAIXADA`
   de `concluirManutencao` (`:294`); o `INSERT … WHERE EXISTS (… status <> 'BAIXADA')` é atômico no SQLite e resolve — **desde que** o
   `changes = 0` não caia no ramo indefinido (I1). Exposição: aceitável. O mesmo texto já sai por `GET /ferramentas/:id/manutencoes`
   (`extended.js:1752`, só `auth`, `SELECT *` com `usuario_id`); a lista branca de três chaves expõe **menos** que isso, e o texto é
   instrução de uso da peça. O que pesa (o histórico aberto) já está em D (187)(3).

**Traçado (cada gesto depois do que a RN muda — "isto ainda aceita o que o anterior aceitou?"):**

| # | Gesto | Estado depois | Aceita? |
|---|---|---|---|
| 1 | Concluir *Em uso com restrição* + *Volta ao uso* (`:288`) | DISPONIVEL; última com condição = COM_RESTRICAO | — |
| 2 | `GET /ferramentas` ALMOXARIFE (objeto cru do serviço) / PRODUCAO, GESTOR (lista branca) | `restricao` de 3 chaves nos dois | sim |
| 3 | **Emprestar** (só para quem gerencia; o modal lê `modal.ferramenta` = a linha da lista) → aviso → `emprestarComTermo` | 201, EMPRESTADA; o servidor não lê a restrição (`termoFerramentaService.js:216-241`) | sim (não bloqueia) |
| 4 | Lista com a emprestada | selo continua (não é BAIXADA) | sim |
| 5 | Devolver (`devolverFerramenta`) | DISPONIVEL, selo continua | sim |
| 6 | Iniciar manutenção → concluir *Em condições de uso* | última com condição = OK → `null` | sim |
| 7 | Iniciar → concluir *Inservível* + *Baixa* | BAIXADA, `null`; editar 400, calibrar 400 | recusa **nova e pretendida** (B1242) — a tela tira os dois botões, então nenhum gesto de tela que a anterior autorizou passa a dar erro |
| 8 | **Reverter baixa** | DISPONIVEL, `null`; editar 200, calibrar 201 | sim |
| 7' | Concluir *Em uso com restrição* + *Baixa* (a tela **permite** — `validarRetorno` só recusa *Inservível* + *Uso*, `:274-276`; a tela manda a combinação ao servidor, `FerramentasAlmoxarifado.js:578-583`) **ou** *Baixa* sem condição pela integração (B1140) | BAIXADA **com** `restricao` (a de agora ou a anterior) | ver I4 |
| 8' | Reverter baixa depois do 7' | DISPONIVEL **com selo** | não declarado — I4 |
| — | Perda → Reencontrar; Avaria → manutenção | o selo atravessa a perda (nenhuma condição nova); a avaria limpa só se a manutenção concluir OK | coerente com B1244 |

### Importantes

- **I1 — o ramo `changes === 0` tem um terceiro desfecho sem dono, e cair nele grava trilha falsa com 201.** Contrato, `:133` e `:137`:
  "reler: sumiu → 404, BAIXADA → 400". Se a releitura achar a ferramenta **fora** de BAIXADA (baixada no instante da gravação e revertida
  antes da releitura; ou o controle (5) da T1, que estreita o `WHERE` para `= 'DISPONIVEL'`), o código cai para a auditoria e o `return`.
  **Medido:** `INSERT … SELECT … WHERE EXISTS` que não insere devolve `changes 0` e o **`lastID` do último insert da conexão** (9, de outra
  tabela) — `registrarCalibracao` responderia **201 `{ id: 9 }`** e gravaria `CALIBRACAO` na auditoria sem calibração; `atualizarFerramenta`
  gravaria `EDICAO` sem edição. **Emenda (contrato):** `changes === 0` → reler `SELECT nome, ativo FROM ferramentas_almoxarifado WHERE id = ?`;
  ausente ou `ativo = 0` → 404 `Ferramenta não encontrada`; **qualquer outro caso → 400 com a frase da baixada e o nome relido** (o único
  motivo de a guarda da gravação recusar é o status BAIXADA naquele instante). Nunca seguir para auditoria/`return` com `changes = 0`.
  **Teste novo na T1:** `[RN-187.04b]` gancho que, na leitura inicial, grava `BAIXADA` e, no **`db.run` da gravação** (depois que ela
  terminar com `changes = 0`), grava `DISPONIVEL` de volta → 400 literal, 0 calibrações, nenhuma `CALIBRACAO`/`EDICAO` na trilha (premissa:
  o gancho disparou nas duas pontas). **Controle (8):** trocar o "qualquer outro → 400" por `if (relida.status === 'BAIXADA') throw …` (deixando
  cair no `return`) → cai **só** o `[RN-187.04b]` (201). O controle (5) passa a cair com **400** nos cinco status — registrar.
- **I2 — o controle (3) da T2 não sabe falhar.** No SQLite o `NULL` é o menor valor: no `ORDER BY data_fim DESC` a manutenção aberta vai
  para o **fim**. **Medido:** sem `data_fim IS NOT NULL`, com uma concluída COM_RESTRICAO e uma aberta OK, volta a concluída — o
  `[RN-187.05f]` como escrito fica verde com a cláusula tirada. **Emenda (T2, passo 1):** `[RN-187.05f]` ganha o caso discriminante: a
  **única** linha com condição é uma manutenção **aberta** com `condicao_retorno = 'COM_RESTRICAO'` gravada à mão (nenhuma concluída com
  condição) → `restricao === null`. **Medido:** sem a cláusula, essa linha volta (`{ id: 5, d: null, c: 'COM_RESTRICAO' }`). O controle (3)
  passa a derrubar **este** caso; o caso antigo (aberta OK sobre concluída restrita) fica como guarda, sabendo que não discrimina.
- **I3 — a regra revista é a B1131, e o plano não a nomeia.** `docs/almoxarifado-novidades-por-etapa.md:12301` — *"B1131 … Editar aparece
  em qualquer status … Reversível: `735f7c5d`"* — continua valendo para quem lê a letra B, e a spec 16 repete (`:212` *"Botão Editar em toda
  linha, em qualquer status"*, `:221` *"B1131 (editar em qualquer status)"*). Apagar em silêncio é a falha da regra 5 do CLAUDE.md.
  **Emenda (B1242 e fechamento):** a B1242 abre com *"Revê a **B1131** (Etapa 175)"*; no fechamento, a B1131 ganha, no lugar, *"**Revista na
  Etapa 187 (B1242):** salvo a Baixada"* (sem apagar o texto); a spec 16 `:212` e `:221` dizem *"salvo Baixada (Etapa 187, B1242)"*; o plano
  da 175 ganha nota na linha da RN-175.01; o comentário `FerramentasAlmoxarifado.js:321` (*"em qualquer status"*) muda na T3.
- **I4 — a baixa pode guardar a restrição, e a volta da baixa traz o selo — não declarado, e a fixture da T4 pode provar nada.** Dois caminhos
  de rota deixam BAIXADA **com** `restricao`: (a) concluir `COM_RESTRICAO` + `BAIXA` (aceito pelo servidor e oferecido pela tela); (b) `BAIXA`
  sem condição pela integração (B1140) depois de uma restrição. Depois de **Reverter baixa**, a ferramenta volta *Disponível* **com** o
  selo. É coerente com a B1244 (a última condição declarada é restrição), mas a B1244 só declara o caso *Inservível* (volta sem selo).
  **Emendas:** (1) B1244 declara os dois: *"Inservível + baixa + reverter → sem selo; Em uso com restrição + baixa (ou baixa sem condição pela
  integração) + reverter → com o selo da restrição"*; o guia e o manual (21.5/21.6) dizem isso numa linha. (2) T2 `[RN-187.05f]` "BAIXADA com
  restrição anterior" e a fixture da T4 "a baixada com restrição anterior" são produzidas **pela rota**, com `{ condicao: 'COM_RESTRICAO',
  destino: 'BAIXA', observacoes: 'Só para serviço leve' }` — não por `UPDATE status`, nem por *Inservível* (que dá `restricao: null` e faria o
  Jest "a baixada sem selo" passar **vazio**). O teste do servidor da T4 afirma `restricao !== null` nesse item **antes** de gravar/comparar a
  fixture. (3) T4 ganha `[RN-187.05g]` pela rota: depois de (2), **Reverter baixa** → `GET` traz a mesma `restricao` (metade positiva do caso
  *Inservível*, que volta `null`). (4) Controle **(e)** da T4: o controle (A) da T3 (selo sem `f.status !== 'BAIXADA'`) → cai o Jest "a baixada
  sem selo" **com a fixture** (prova que a fixture tem restrição).
- **I5 — sabotagem na árvore compartilhada com a 186.** No momento desta revisão a árvore tem `client/src/utils/pdfTexto.js` modificado
  (outra sessão fechando a 186). Os controles da T1, T2 e T4 editam `toolService.js`/`extended.js`/`FerramentasAlmoxarifado.js`; uma suíte
  completa da 186 rodando no meio cai por causa da sabotagem alheia, e o restauro por cópia pode apagar edição alheia (memória *sabotagem
  concorrente contamina a suite*). **Emenda (execução):** T1, T2 e T4 rodam numa **worktree** própria (junction de `node_modules`, memória
  *worktree com junction*), como a T3; ou, se na árvore principal, só depois de a 186 commitar o fechamento (`git status` limpo nos arquivos
  dela). Antes de cada `git add`, só caminhos explícitos e conferir o staged.

### Menores

- **M1 — painel da T4.** `painelCalibracoes` (`toolService.js:579-606`) só lista vencidas ou `dias_restantes <= dias`. *"`GET
  /calibracoes/painel` mostra a calibrada de novo"* é ambíguo: com validade a 1 ano ela **não** aparece. **Emenda:** calibrar com
  `data_validade` = hoje (Brasília, `diaLocal`) + 10 e afirmar o item em `a_vencer` com `dias_restantes === 10`; antes do reverter, o mesmo
  painel **sem** o item (metade positiva da RN-177.09).
- **M2 — a anomalia de `concluirManutencao` decide.** Em `:296-306` a linha fecha com `data_fim` e `condicao_retorno`, `destino = NULL`, e a
  rota responde 400. Pela regra, essa condição **conta** (foi declarada sobre a peça). Não é alcançável por rota (só `concluir` tira de
  EM_MANUTENCAO), então não vira teste; **declarar** numa frase da B1244.
- **M3 — `data_fim` é UTC** (`CURRENT_TIMESTAMP`, `:289`). O contrato diz `"AAAA-MM-DD HH:MM:SS"` sem fuso; a tela não o mostra hoje. **Emenda
  (contrato):** *"UTC, como gravado"* — quem um dia exibir converte (Etapa 163 já pagou esse tipo de defeito no dia).
- **M4 — terceira consulta por ferramenta e sem índice.** `restricaoVigente` soma uma consulta por linha (já são duas) e a tabela de
  manutenções não tem índice em `ferramenta_id` (`schema.js:2493-2502`). Aceitável no tamanho do cliente; registrar em D (187), não mexer.
- **M5 — comentários desatualizados no client.** `FerramentasAlmoxarifado.js:55` (*"calibracao nao tem restricao de status"* — falso desde
  a 177 e mais ainda agora) e `:321` (I3). A T3 corrige os dois.
- **M6 — numeração.** A 186 usou B1230–B1239 (plano da 186); conferir no fechamento que nenhum fix-round dela tomou B1240+ antes de gravar
  B1240–B1248 nas novidades.
- **M7 — gancho da RN-187.04.** O contador deve contar **disparos** (a primeira leitura), não casamentos do regex: se a releitura do `changes
  = 0` usar o mesmo SQL, um contador de casamentos daria 2 e a premissa "= 1" falharia por motivo errado. Com a releitura da I1 (`SELECT
  nome, ativo …`, sem `AND ativo = 1`) o regex nem casa — usar esse SQL.

### Sem achado (conferido)

- RN-187.03: EMPRESTADA/EM_MANUTENCAO editam e calibram — certo; nenhuma regra da spec 16 pede o contrário, e a tela os oferece.
- RN-187.06/lista branca: ALMOXARIFE/ADMIN recebem o objeto do serviço, que já tem só as três chaves; o controle (4) é o que prova a lista
  branca, e o (5) verde está corretamente previsto. GESTOR não tem `gerenciar_ferramentas` (`permissions.js:70`) — entra no ramo mascarado.
- Os vizinhos que a T1 lista não editam nem calibram baixada pela rota (`medidasInspecao` grava calibração por `INSERT` direto; `toolIntegracao`
  e `inspecaoFluxoMedidas` calibram DISPONIVEL); `toolManutencaoRetorno` não chama `PUT /ferramentas/:id` nem `POST /calibracoes`.
- O teste do client `:825` (`botao('Editar', baixada)).toBeTruthy()`) e o nome do `:568` — emenda prevista na T3, correta.

## Execução

### T1 — feita (`3d45817f`)

- Teste novo `server/tests/api/toolBaixadaNaoCalibraNemEdita.api.test.js` — **17** cenários. Vermelho antes: **9/8** — os 01 com `201
  {"id":1}` e a frase da data; os 02 com `200 {"id":1}` (nome e corpo vazio) e `409` (patrimônio); os 04 com "a edição/calibração gravou";
  o 04b com "respondeu sucesso". Os 9 do RN-187.03 verdes de primeira (guarda de regressão, provada pelos controles 5 e 6). Verde: **17/0**.
- Implementado o contrato com a **I1**: helper `recusaDaGravacao` — com `changes === 0` relê `SELECT nome, ativo … WHERE id = ?` (M7: não
  casa o regex do gancho); ausente/inativa → 404; qualquer outro → 400 da baixada. Nunca segue para a auditoria.
- `[RN-187.04b]` (emenda I1): gancho que grava BAIXADA na leitura inicial e DISPONIVEL de volta depois da gravação (no callback do
  `db.run`, preservando `this`); premissas `disparos = 1` e `restauros = 1` nas duas metades (calibração e edição).
- **Controles positivos** (perl, âncora contada = 1, md5 antes/sabotado/restaurado, restauro por cópia em `scratchpad/e187-bkp/` + `cmp`):
  - (1) sem a checagem cedo da calibração → cai **só** `[RN-187.01] ordem` (deu a frase da data); o 01 principal verde. ✔
  - (2) `WHERE EXISTS` trocado por `WHERE ? IS NOT NULL AND ? IS NOT NULL` → caem `[RN-187.04] corrida calibracao` **e** `[RN-187.04b]`
    (metade da calibração) — o 04b não existia quando o plano previu "só o 04"; esperado.
  - (3) `AND status <> ?` → `AND ? IS NOT NULL` no `UPDATE` → caem `[RN-187.04] corrida edicao` **e** `[RN-187.04b]` (metade da edição). ✔
  - (4) sem a checagem cedo da edição → cai **só** `[RN-187.02] corpo vazio` (`200 {"id":1}`); o `{nome}` e o patrimônio continuam 400
    pela guarda da gravação (sem 409: o `WHERE` não casa, não há conflito). ✔
  - (5) `status = 'DISPONIVEL'` no `UPDATE` e no `EXISTS` → cai o laço `[RN-187.03]` em **EMPRESTADA, EM_MANUTENCAO, AVARIADA, PERDIDA e
    BLOQUEADA**, todos com **400** `Ferramenta baixada não pode ser calibrada` (como a I1 previu). A calibração cai primeiro, então a metade
    da edição não chega a ser exercida neste controle (o 3 cobre a edição).
  - (6) PUT sem `requirePermission('gerenciar_ferramentas')` → cai **só** `[RN-187.03] PRODUCAO` em `editar PRODUCAO: 200`. ✔
  - (7) frase sem o nome → caem os 8 cenários que comparam a frase (01, 02, 04, 04b) pelo `strictEqual` do `error`. ✔
  - (8) `recusaDaGravacao` só lança se o status relido for BAIXADA (senão `return`) → cai **só** `[RN-187.04b]` ("respondeu sucesso"). ✔
- Vizinhos sem mudar asserção: `toolFerramentaEdicao` 8/0, `toolCalibracao` 10/0, `toolManutencaoRetorno` 17/0, `toolIntegracao` 1/0,
  `medidasInspecao` 23/0.

### T2 — feita (`130caaca`)

- Teste novo `server/tests/api/toolRestricaoDaManutencao.api.test.js` — **13** cenários (05a–05f com os três casos do 05f, o 06 em
  PRODUCAO, GESTOR, ALMOXARIFE e ADMIN, o 07). Vermelho antes: **0/13**, todos com `restricao` `undefined` (o 05c com "Cannot read
  properties of undefined"). Verde: **13/0**.
- Emendas aplicadas: **I2** — `[RN-187.05f]` ganhou o caso discriminante (a **única** com condição é uma aberta `COM_RESTRICAO` à mão → `null`);
  o caso antigo (aberta OK sobre concluída restrita) ficou como guarda. **I4** — a baixada com restrição é feita **pela rota**
  (`COM_RESTRICAO` + `BAIXA`), não por `UPDATE status`.
- Contrato implementado como escrito; a rota passou a montar `emprestimo_aberto` **e** `restricao` por lista branca num `.map` só (o
  `emprestimo_aberto: null` explícito quando não há — antes o item ia com o `null` do serviço; mesmo JSON).
- **Controles positivos** (perl, âncora = 1, md5 antes/sabotado/restaurado, `cmp`):
  - (1) sem `AND condicao_retorno IS NOT NULL` → cai **só** `[RN-187.05d]` (`null` no lugar da restrição). ✔
  - (2) `id ASC` → caem `[RN-187.05e]` **e também** `[RN-187.05b]` e `[RN-187.05c]` — **divergência do previsto ("só o 05e")**: as manutenções
    concluídas pela rota no mesmo teste caem no **mesmo segundo** de `CURRENT_TIMESTAMP`, então o desempate por `id` decide nelas também.
    Isso reforça o controle (o desempate é exercido por rota, não só à mão).
  - (3) sem `AND data_fim IS NOT NULL` → cai **só** o `[RN-187.05f]` da aberta `COM_RESTRICAO` (`data_fim: null` voltou) — o caso da I2; o caso
    antigo continuou verde, como a revisão mediu.
  - (4) `usuario_id: 1` a mais na lista branca → caem **só** `[RN-187.06] PRODUCAO` e `GESTOR` (chave a mais no `deepStrictEqual`). ✔
  - (5) lista branca **sem** `restricao` (volta a espalhar `...f`) → **verde 13/0**, como previsto (o objeto do serviço já tem três chaves).
  - (6) `return res.json(ferramentas)` para todos → caem `[RN-187.06] PRODUCAO` e `GESTOR`, pelo `deepStrictEqual` do `emprestimo_aberto`
    (`colaborador_nome: 'CARLOS LIMA'` a mais) — a asserção da 181 sabe falhar (cai antes do `includes('CARLOS')`).
  - (7) `emprestarComTermo` recusando a DISPONIVEL com `restricao` → cai **só** `[RN-187.07]` (`400 {"error":"restrita"}`). ✔
- Vizinhos sem mudar asserção: `ferramentasListaSemColaborador` 4/0, `toolManutencaoRetorno` 17/0, `termoFerramentaEmprestimo` 13/0,
  `termoFerramentaPontaAPonta` 12/0, `termoFerramentaVerificacao` 16/0, `termoFerramentaVersao` 10/0.

### T3 — feita (`c643054e`)

- Executada **na main, sequencial** (não em worktree): a 186 já tinha fechado (`a96546c4`) e nenhuma outra sessão sabotava os arquivos.
- 5 testes novos no `describe('… Etapa 187 …')` de `FerramentasAlmoxarifado.test.js`: `[RN-187.08a]` (selo + texto; sem permissão
  continua), `[RN-187.08a] baixada` (sem selo; metade positiva), `[RN-187.08b]` (aviso literal + um POST), `[RN-187.08c]` (sem restrição, sem
  aviso — a metade positiva do 08b virou teste próprio), `[RN-187.08d]` (baixada sem Editar; os seis outros com). Emendas de teste existente:
  `RN-177.10` (`:825` → `toBeFalsy()` com o comentário `Etapa 187 (B1242)`) e o nome do `RN-175.01` (*"… salvo Baixada"*).
- Vermelho antes: **5 falharam / 54** — os quatro do 08a/08b/08d e o `RN-177.10` emendado; o 08c passou de primeira (é a metade negativa).
  Verde: **59/59**.
- Comentários corrigidos (M5/I3): o cabeçalho (*"calibracao nao tem restricao de status"*) e o de `abrirEditar` (*"em qualquer status"*).
- Aviso do Emprestar: `<p role="note" className="almox-badge almox-badge-baixo">` (a classe só dá a cor; não é selo de teste).
- **Controles positivos** (perl, âncora = 1, md5 `42fd66976a33` antes e restaurado em todos, `cmp`):
  - (A) selo sem `f.status !== 'BAIXADA'` → cai **só** `[RN-187.08a] baixada`. ✔
  - (B) aviso lendo `restricao?.texto` → cai **só** `[RN-187.08b]`. ✔
  - (C) `confirmarEmprestar` com `if (modal.ferramenta.restricao) return;` → cai **só** `[RN-187.08b]`, na asserção `postsEmprestar()
    toHaveLength(1)` (*Received length: 0*). ✔
  - (D) Editar de volta em toda linha → caem `[RN-187.08d]` e o `RN-177.10` emendado. ✔
  - (E) selo sob `podeEscrever` → cai **só** `[RN-187.08a]`, na linha da metade **sem permissão** (`:1115`, o `selo(restrita)` nulo). ✔

### T4 — feita (`b020c10c`)

- Teste novo `server/tests/api/toolBaixadaERestricaoIntegracao.api.test.js` — **4** cenários: `[pela rota]` (o gesto até o fim, cada passo
  com status e corpo), `[RN-187.05g]` (emenda I4), `[pelo servico]`, `[fixture]`. Os três primeiros passaram **de primeira** (a
  implementação já estava nas T1/T2 — é integração); o `[fixture]` caiu com "fixture ausente" até `CRM_GRAVAR_FIXTURE=1`. Provados pelos
  controles abaixo. Verde **4/0** em duas execuções seguidas sem regravar (a fixture é determinística).
- **M1:** a calibração inicial é curta (hoje + 5) — o empréstimo exige vigente e o painel lê a **maior** validade; depois do reverter, a de
  hoje + 10 aparece em `a_vencer` com `dias_restantes === 10` (e o nome editado). Antes do reverter, o painel **sem** o item.
- **Fixture** `client/src/components/almoxarifado/__fixtures__/ferramentasRestricao.rota.json`: `restritaVistaPeloProducao` e
  `baixadaComRestricaoVistaPeloAlmoxarife`, as duas feitas **pela rota**. **Divergência do plano:** os instantes de `CURRENT_TIMESTAMP`
  (`data_inicio`/`data_fim` da manutenção, `created_at`/`updated_at` da ferramenta) são fixados por `UPDATE` **depois** dos gestos — sem
  isso a fixture mudaria a cada execução. O teste afirma `restricao !== null` nas duas **antes** de gravar/comparar (I4).
- Dois Jest novos em `FerramentasAlmoxarifado.test.js` leem a fixture: a restrita (selo e texto sem permissão; aviso no Emprestar com
  permissão) e a baixada (sem selo, sem Editar, com Reverter baixa). Client: **61/61** no arquivo.
- **Controles positivos** (perl, âncora = 1, md5 antes/sabotado/restaurado, `cmp`):
  - (a) controle (4) da T2 (`usuario_id` a mais na lista branca), **sem** regravar → cai o `[fixture]` (`restritaVistaPeloProducao: fixture !=
    resposta real`) — e também o `[pela rota]` (chaves do PRODUCAO). ✔
  - (b) controles (1) e (2) da T1 juntos → cai o `[pela rota]` em `calibrar baixada: 201 {"id":2}` — e o `[pelo servico]` (*Missing
    expected rejection*). ✔
  - (c) **divergência de execução:** `restricaoVigente` devolvendo sempre `null` **com** `CRM_GRAVAR_FIXTURE=1` → os 4 do servidor caem e o
    `[fixture]` cai na **premissa** (*"a restrita tem restricao"*) **antes** de gravar — a fixture não é regravada (md5 `cf5ce19338ef`
    igual). A guarda da I4 impede o regravar que o plano previa. Para provar o lado do Jest, a fixture foi editada à mão com a
    `restricao: null` na restrita (o que aquele regravar gravaria) → cai **só** o Jest `[T4, fixture real] a restrita…`; e o servidor sem
    regravar cai no `[fixture]` (*fixture != resposta real*). Fixture restaurada (`cf5ce19338ef`).
  - (d) controle (D) da T3 → caem o Jest `[T4, fixture real] a baixada…`, o `[RN-187.08d]` e o `RN-177.10`. ✔
  - (e) controle (A) da T3 → caem o Jest `[T4, fixture real] a baixada…` (prova que a fixture **tem** restrição) e o `[RN-187.08a] baixada`. ✔

### Suítes completas depois de T1–T4 (sobre `b020c10c`, uma vez cada, sequenciais)

- `npm run test:api` — **531/531** arquivos OK (exit 0).
- `npm run test:almoxarifado` — **44/0**. `test:validation` **4/0**. `test:safealter` **3/0**. `test:sqlite` **16/0**.
- client `CI=true npx react-scripts test --watchAll=false` — **182/182** suítes, **2460/2460** testes.
- client `CI=true npx react-scripts build` — *Compiled successfully*.

## F5 — Fase 5 (revisão adversarial) e fix-round (2026-10-22)

Revisão adversarial feita por outra sessão sobre `122d4ca1`; os achados chegaram a esta execução assim (a contagem por gravidade não foi
repassada, então não é escrita aqui): **M1** (corrigir teste), **um menor de tela** (corrigir, visto só por leitura) e **dois itens para
registrar** em **D (187)**. Nenhum achado pediu mudança de servidor.

### M1 — a lista branca da `restricao` na rota não era provada → CORRIGIDO (`e182d42d`)

- **O achado:** trocar a lista branca (`extended.js`, o `.map` do `GET /ferramentas`) por `restricao: f.restricao` deixava
  `toolRestricaoDaManutencao` **13/0** e a integração **4/0** — o serviço devolve só as três chaves, então o `deepStrictEqual` do RN-187.06
  não tinha o que pegar. É o controle **(5) da T2**, que o plano previu verde e registrou como "esperado" sem escrever o cenário que o
  discrimina.
- **O conserto (só teste):** `[RN-187.06 M1]` em `toolRestricaoDaManutencao.api.test.js`, nos quatro perfis. O teste embrulha
  `toolService.listarFerramentas` (a rota lê a propriedade do módulo a cada chamada — mesmo molde do stub de serviço da M3 da 182) para pôr
  `usuario_id: 77` e `concluido_por: 'Fulano Extra'` na restrição, com premissa `chamadas === 1` (a rota passou pelo embrulho) e o original
  restaurado no `finally`.
- **Comportamento congelado** (coerente com a 181, `emprestimo_aberto`): quem **não** tem `gerenciar_ferramentas` (PRODUCAO, GESTOR) recebe
  **exatamente** `{ manutencao_id, observacoes, data_fim }` e o corpo não contém `Fulano Extra`; quem gerencia (ALMOXARIFE, ADMIN) recebe o
  objeto do serviço **como veio**, com as chaves a mais. **Descartado:** lista branca também para quem gerencia (a 181 não faz isso, e quem
  gerencia já vê o histórico inteiro da ferramenta).
- **Controles** (perl, âncora contada = 1, md5 `c0f0daa9…` antes e restaurado, cópia `scratchpad/fix187-extended.js`, `git diff --stat` só o
  teste):
  - **S4** — lista branca trocada por `? f.restricao : null` (md5 `279f83b2…`) → caem **só** `[RN-187.06 M1] PRODUCAO` e `[RN-187.06 M1]
    GESTOR`, pela asserção *"PRODUCAO: quem nao gerencia recebe so as tres chaves"* / *"GESTOR: …"* (o `deepStrictEqual` mostra
    `concluido_por` e `usuario_id` a mais). 15/2.
  - **S4b** — lista branca aplicada a **todos** (`if (false) return res.json(ferramentas)`, md5 `79ed3574…`) → caem `[RN-187.06 M1] ALMOXARIFE`
    e `ADMIN` (*"quem gerencia recebe o objeto do servico"*) e os `[RN-187.06] ALMOXARIFE`/`ADMIN` antigos (o `colaborador_nome` sumiu). 13/4.
- Arquivo: **17/0** (eram 13).

### Menor — o aviso do Emprestar com pontuação dupla → CORRIGIDO (`a255dadf`)

- **O achado (por leitura):** o aviso acrescentava sempre um ponto depois da observação; *"Só para serviço leve."* virava *"… leve.. Confira
  antes de emprestar."*. **Reproduzido antes do conserto** com Jest: três casos novos (`test.each` — ponto, exclamação, interrogação),
  **3 falharam / 64** (*"leve.. Confira"*, *"Nm!. Confira"*, *"confere?. Confira"*).
- **O conserto:** o ponto só entra quando a observação **não** termina em `.`, `!`, `?` ou `…`; o texto do usuário fica como foi escrito.
  **Descartado:** apagar o ponto do usuário e pôr o nosso (trocaria *"!"* e *"?"* por *"."*). Arquivo **64/64**.
- **Controles** (perl por script `scratchpad/fix187-sab.pl`, âncora contada = 1 dentro do script, md5 `db316216…` antes e restaurado em todos,
  cópia `scratchpad/fix187-Ferramentas.js`):
  - **(i)** sempre o ponto → caem os **3** casos novos.
  - **(ii)** nunca o ponto → caem o `[RN-187.08b]` (o `AVISO` literal sem ponto) e o `[T4, fixture real] a restrita…` — a metade "sem ponto
    ganha o ponto".
  - **(iii)** apagar o ponto do usuário e pôr o nosso → caem **exclamação** e **interrogação**; o caso do **ponto** fica verde (esperado: o
    resultado é o mesmo texto). É o par exclamação/interrogação que prova "o texto do usuário intacto".
  - *A primeira tentativa do (iii), por `perl -pi` em linha de comando, foi **no-op** (md5 igual ao de antes, 64/64) — o escape do `$` da
    regex não casou. Detectado pelo md5, refeito por script com a âncora contada dentro dele.*

### Registrados, sem correção (vão para **D (187)**)

- **O ramo 404 de `recusaDaGravacao` não tem teste.** Com `changes = 0`, a releitura que acha a ferramenta ausente ou `ativo = 0` responde
  404; nenhuma rota faz `ativo = 0` em ferramenta (não há exclusão), então o ramo só é alcançável por escrita direta no banco. Não se cria
  rota para provar um ramo defensivo.
- **Restrição + baixa + reverter mostra o motivo da baixa no selo.** A manutenção tem **um** campo de observações: concluir *Em uso com
  restrição* + *Baixa* grava ali o **motivo da baixa** (obrigatório), e é esse texto que volta como restrição depois do **Reverter baixa**
  (declarado na emenda I4: a restrição atravessa a baixa). Separar "restrição" de "motivo" exigiria coluna nova.

## Verificação final (2026-10-22, uma suíte por vez, depois do fix-round e dos documentos)

Sobre `a255dadf` (código e testes do fix-round) + os documentos do fechamento; exit 0 em todas (logs `fix187-log-*.txt` no scratchpad):

- `test:api` **531/531** arquivos OK (mais lento: `propostaClausulasGrava.api.test.js`, 69,1 s).
- `test:almoxarifado` **44 passou, 0 falhou**.
- `test:validation` **4/0**; `test:safealter` **3/0**; `test:sqlite` **16/0**.
- client **182 suítes / 2463 testes**, todos passando (eram 2460 em `b020c10c`: +3 do fix-round, o `test.each` da pontuação).
- `CI=true react-scripts build`: *Compiled successfully*.
- `git status`: só os arquivos do fechamento antes do commit.

## Retrospectiva

1. **1 controle "verde esperado" era falta de asserção** (M1): o controle (5) da T2 previu que tirar a lista branca passaria verde e
   registrou isso como resultado, em vez de escrever o cenário em que ela faz diferença. Verde previsto num controle é achado, não registro:
   ou o defeito é inalcançável (e se diz por quê), ou falta um cenário que o alcance — aqui faltava (o servidor só precisava devolver um campo
   a mais).
2. **1 defeito de tela com dado de usuário real** (a pontuação dupla): todos os testes usavam *"Só para serviço leve"*, sem ponto final;
   texto de usuário termina em ponto na maioria das vezes. O texto livre do usuário entra no teste nas formas que ele escreve, não só na limpa.
3. **30 controles positivos** na etapa (T1 8, T2 7, T3 5, T4 5, fix-round 5), **1** deles no-op na primeira tentativa (o (iii) do fix-round),
   pego pelo md5 igual — a regra "md5 antes/sabotado" pagou de novo.
4. **0 regressões**: os testes antigos que mudaram foram os da regra revista (o `RN-177.10` `:825` passou a afirmar *sem* Editar na baixada e
   o nome do `RN-175.01` ganhou *"salvo Baixada"* — B1242); nenhum vizinho mudou asserção.

## Próxima tarefa detalhada — Etapa 188: a fila de separação sugere de onde pegar cada item e em que ordem andar (feature 05)

**O plano já existe e passou pela Fase 2 (outra sessão, `e9192204`: 1 Crítico, 3 Importantes, 5 Menores — as emendas valem antes da T1):**
`docs/superpowers/plans/2026-10-22-almoxarifado-etapa188-sugestao-de-coleta-na-fila-de-separacao.md`. **O plano da 188 prevalece** sobre
este resumo. Item da spec 05 (`specs/modulo-almoxarifado/05-separacao-picking/README.md:63`, *"Sugestão de rota"*). Decisões **B1250** a
**B1259** (a 187 usou B1240–B1248; **B1249** fica livre).

**Contrato que ela muda:** `GET /api/almoxarifado/fila-separacao` (gate `separar_emitir`, como hoje) **só acrescenta**: em cada item,
`pegar_em: null | { localizacao_id, localizacao_codigo, caminho, lote_id, lote_codigo, lote_validade, quantidade_no_endereco,
quantidade_sugerida, cobre }` e `pegar_em_aviso: null | "NENHUM_ENDERECO_COBRE" | "SEM_ENDERECO_SUGERIVEL"` (código; a frase é da tela); em
cada requisição, `ordem_coleta: [{ item_id, material_codigo, localizacao_id, localizacao_codigo, caminho, lote_codigo, quantidade_sugerida }]`
(sempre array). Nenhum endpoint novo, nenhuma mensagem de erro nova. Função pura nova `sugestaoDeColeta.sugerirColeta(...)`.

**Pontos de atenção:**
- A sugestão é **só leitura**: não grava, não reserva, **não pega trava** (B1250) — a separação continua decidindo e recusando como hoje. A
  trava por material do CLAUDE.md vale para quem **reserva** ou **distribui**; uma leitura de dica não entra nela.
- O livre do endereço desconta o separado e não entregue de **qualquer** requisição (B1255) — a mesma régua que a separação usa para limitar
  a caixa; divergir dela faz a dica sugerir o que a separação recusa.
- Os itens continuam na **ordem do pedido** (B821, B1256); a ordem de coleta é campo novo.
- O PDF *"Imprimir lista de coleta"* e a pré-seleção do *"Sai de"* ficam para a **189** (B1257).

**O que já está pronto e ela não reabre:** a 187 inteira — a baixada não edita nem calibra (servidor e tela), a `restricao` no
`GET /ferramentas` com a lista branca provada, o selo e o aviso. A 188 não toca `toolService.js`, `FerramentasAlmoxarifado.js` nem a rota de
ferramentas.
