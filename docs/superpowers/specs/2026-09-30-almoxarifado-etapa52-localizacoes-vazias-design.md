# Etapa 52 — A tela de localizações vazias (desenho)

> **Feature:** 02 (Localizações). **Plano:** `docs/superpowers/plans/2026-09-30-almoxarifado-etapa52-localizacoes-vazias.md`
> **Fase 0:** a próxima tarefa da 51, relida no código.

## 1. O que está medido

- `GET /api/almoxarifado/localizacoes/vazias` (`extended.js:2115`) existe e **não tem consumidor**:
  - exige só `auth`, **sem** `requirePermission`;
  - considera "vazia" a localização ativa **sem linha de saldo positiva**;
  - monta `endereco_completo` em JS (almoxarifado / setor / pai / código).
- O **mapa** (`MAPA_LOCALIZACOES_SQL`, `stockService.js`) decide ocupação com **duas** fontes: as linhas de saldo com endereço e quantidade > 0, e o **fallback do legado** (o material ativo com `localizacao_padrao_id`, físico > 0 e **nenhuma** linha endereçada positiva ocupa a padrão).
- **As duas rotas se contradizem no legado:** o S8 da Fase 0 da 51 mediu o mapa com `LEG = 40` e a rota de vazias listando LEG como vazia.
- A 51 tornou o saldo por endereço confiável para material **sem lote**. O de **lote** continua podendo mostrar endereço ocupado depois da entrega (**C72**).

## 2. As regras

**RN-01 — Uma regra só de ocupação.** O SQL de ocupação do mapa (as linhas com endereço **mais** o
fallback do legado) vira a constante `OCUPACAO_SQL` em `stockService`, usada pelo mapa **e** pela lista
de vazias. **Vazia** = localização **ativa** que não aparece em `OCUPACAO_SQL`. Nenhuma localização pode
estar "ocupada" no mapa e "vazia" na lista, nem o contrário.

**RN-02 — Helper único e rota alinhada.**
- `stockService.listarLocalizacoesVazias(db)` devolve as linhas com `endereco_completo`, montado pelo mesmo código que a rota tinha.
- A rota `/localizacoes/vazias` passa a usá-lo e ganha `requirePermission('visualizar')`, a régua das outras leituras do módulo. **Letra B:** a rota era só `auth`, e o registro de relatórios usa o gate por chave.

**RN-03 — Chave `localizacoes-vazias` no registro.**
- Categoria **Estoque**, `acao: null`, exportável.
- Colunas: código, endereço completo, almoxarifado, tipo e bloqueada.
- `nota`:
  - que o endereço **bloqueado** vazio aparece;
  - que a localização inativa fica fora;
  - que **em material com lote** um endereço pode aparecer **ocupado** depois de a entrega de requisição tirar o material (C72).
- A contagem do registro vai de 22 para 23.

## 3. O que NÃO é

- **Hierarquia:** uma localização "pai" (setor/rua) sem saldo **direto** aparece como vazia mesmo com os filhos ocupados, como a rota fazia. Declarado na nota e na letra D.
- Não mexe no motor.

## 4. Sort

| Task | O que é | Classificação |
|---|---|---|
| **T1** | `OCUPACAO_SQL` + helper + rota + chave | **tronco** |
| **T2** | integração: mapa × lista em todos os casos (legado, drenado, bloqueado, inativo, lote) | **tronco** |

## 5. O que a Fase 2 mudou: 2 IMPORTANT, 2 MINOR (sondas `rev52-sonda*.js`)

**A varredura do registro reprovaria a chave.** Ela procura cada coluna declarada no SQL real, e o
`endereco_completo` era montado em JS. **Correção:** o endereço é montado no **próprio SELECT**, e as colunas
declaradas usam os nomes do SQL (`almoxarifado_codigo`, `tipo`, `bloqueada`).

**🔶 Apagar ou inativar localização usava uma TERCEIRA régua, e isso entra nesta etapa.**
- O `DELETE /localizacoes/:id` só olha as linhas com `quantidade != 0`.
- Uma localização ocupada **só pelo legado** (o mapa mostrando 40) era apagada com 200, e aí as **40 unidades ficavam invisíveis em todas as telas**: o fallback some junto com a localização, e o material não entra em "sem endereço" porque a padrão dele não é nula.
- O `PUT` com `ativo = 0` não checava nada.

A lista de vazias vira o **convite** natural para apagar. **RN-04 nova:** o DELETE e o PUT que desativa passam
a recusar a localização ocupada pela **mesma** `OCUPACAO_SQL` (e continuam recusando a linha diferente de zero, que pega a negativa):
`400 — Localização ocupada: há material nela (N item(ns)). Transfira o saldo antes de apagar ou desativar.`

**A letra B da RN-02 estava errada.** `requirePermission('visualizar')` **não** é "a régua das outras leituras":
o `/mapa/localizacoes` e 46 GETs são só `auth`, e `visualizar` inclui todos os perfis. **Escolha:** a rota
de vazias **continua só `auth`**, como o mapa, que mostra o mesmo dado. A RN-02 perde esse item.

**Hierarquia:** o mapa ignora `parent_id`. O pai é um cartão solto, "Vazio", enquanto o filho está ocupado. **Escolha
(reversível):** o pai **fica** na lista, com a coluna **`sub_ocupadas`** (filhos ativos ocupados), e não é excluído.
Excluí-lo quebraria o invariante "`qtd_itens == 0` se e somente se está na lista", e o usuário vê que é um contêiner.

**Declarados:**
- **material inativo:** ocupa pela linha endereçada, mas não pelo fallback (a extração literal herda isso);
- a combinação `A:10` positiva mais `NULL:30` sem padrão deixa os 30 fora do mapa e de "sem endereço". É anterior à etapa e vai para a letra D.
