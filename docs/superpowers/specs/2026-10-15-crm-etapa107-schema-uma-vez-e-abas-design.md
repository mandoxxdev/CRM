# Etapa 107 — o schema do almoxarifado roda uma vez no boot (G16); as barras de abas usam `ui/Tabs` (G8) — design

> Frente **Compras/cadastros e dívidas do core**, worktree `CRM-wt-e107`, branch `etapa-e107` (de `main` `e963449f`).
> Plano: `docs/superpowers/plans/2026-10-15-crm-etapa107-schema-uma-vez-e-abas.md`.

## Fase 0 — o que a medição mostrou (antes de qualquer mudança, `e963449f`)

### G16 — medido com 14 boots em pasta nova (`CRM_DATA_DIR` vazio + `node index.js`, processo morto aos 22–25 s)

Sonda: `boot-e107-medir.js` (scratchpad) sobe o servidor, mata, abre o banco só-leitura e conta, em cada tabela
semeada pelo `initSchema` do almoxarifado, `COUNT(*)` e `COUNT(DISTINCT <chave>)`, e se o índice único
`idx_categorias_almox_nome` existe.

| | boots | resultado |
|---|---|---|
| `UNIQUE … setores_almoxarifado.nome (tentativa 1/3)` | 7 de 14 | banco completo (setores 8/8, categorias 27/27, índice criado) |
| `UNIQUE … categorias_material_almoxarifado.nome` ×3 + `UNIQUE … familias_material_almoxarifado.codigo (tentativa 1/3)` | **6 de 14** | **categorias 54 linhas / 27 nomes** — o seed entrou **duas vezes** — e o índice único **não existe** |
| nenhum erro | 1 de 14 | completo |
| `tentativa 2/3` | 0 de 14 | a 2ª tentativa sempre passa |

(Os números exatos de cada boot estão no plano, seção T1.)

**O G16 estava errado em dois pontos** (o texto da 105 dizia "o banco nasce com os 8 setores do seed" e "a segunda
tentativa passa" como se fosse inofensivo):
1. Não é só o seed de setores. Todo seed do `initSchema` é "conta, e se for zero, insere" (categorias, famílias,
   unidades, tipos, localizações, setores). As duas execuções simultâneas veem zero e semeiam. Onde a tabela tem
   `UNIQUE` (famílias pelo código, setores pelo nome, unidades pela sigla) a perdedora cai e a 2ª tentativa acerta;
   onde **não** tem — **categorias** — as duas entram: **27 categorias em dobro**. (Tipos de material também não
   tem `UNIQUE` no nome — achado da revisão do plano; nos 14 boots os tipos ficaram 8/8, mas numa defasagem
   diferente dobrariam sem log nenhum.)
2. Com as categorias em dobro, o `CREATE UNIQUE INDEX idx_categorias_almox_nome` (Etapa 26, RN-06) falha, o
   `try/catch` dele só avisa, e **todo boot seguinte** repete o aviso *"Nao foi possivel criar
   idx_categorias_almox_nome … ha categorias com nome repetido"*. O cadastro de categoria fica sem a unicidade de
   nome que a Etapa 26 prometeu — a recusa *"Já existe uma categoria com este nome"* (`extended.js`, `CATEGORIA_DUPLICADA`)
   é detectada **pelo índice**, então sem ele a tela aceita nome repetido —, e o seletor de categoria mostra cada nome duas vezes. Medido em 6 de 14 boots
   novos.

**Por que roda duas vezes** (lido no código e confirmado pela sonda): `routes/almoxarifado.js:263` dispara
`initSchema(db)` sem `await` ao registrar o módulo; `routes/almoxarifado/extended.js:128`
(`runInitSchemaWithRetry`, chamado quando a extended registra, depois de um `SELECT 1`) dispara **outra**. As duas
compartilham a conexão e intercalam comando a comando. O comentário de `schema.js:520` já sabia da corrida e
tinha remendado **uma** porta (`INSERT OR IGNORE` na marca da migração `criar_almoxarifado_geral`).

Banco **existente**: as duas execuções acham as tabelas cheias e não semeiam — nada muda (conferido: o 2º boot de
um banco novo não tem erro de schema). Mas um banco que **nasceu** com as categorias em dobro continua assim — a
correção impede o caso novo, não desfaz o antigo (consulta **A9**).

### G8 — as barras de abas, medidas uma a uma

O G8 listava seis barras com CSS próprio: Admin, Compras/Financeiro, Minha Conta, OS comercial, Operacional e a
interna do almoxarifado. Medido no código (`className` de barra de abas nos `.js` + seletores de aba nos `.css`):

| Barra | Existe? | O que tem |
|---|---|---|
| **Admin** (`Admin.js`, `.admin-tabs/.admin-tab`) | sim | 3 abas com ícone, estado local (`useState('usuarios')`), sem URL; o painel espera `contentReady` |
| **Minha Conta** (`MinhaConta.js`, `.conta-tabs`) | sim | 2 abas com ícone, estado local |
| **OS comercial** (`OrdensServicoComercial.js`, `.os-comercial-tabs/.os-tab`) | sim | 2 abas com ícone **e contador** (`.tab-badge`, só quando > 0); a troca de aba recarrega a lista; o contraste da aba ativa no celular é corrigido em `app-glass.css` |
| **Almoxarifado → Configurações** (`ConfiguracoesAlmoxarifado.js`, estilo inline) | sim | 13 abas com ícone, aba na URL (`?tab=`, `replace`), rola de lado; roda sozinha (`/almoxarifado/configuracoes`) e embutida em `/configuracoes?modulo=almoxarifado` |
| Compras / Financeiro (`.module-tabs/.module-tab`) | **não** | `Compras.js` e `Financeiro.js` declaram um array `tabs` que **nada renderiza** (a navegação é pelo menu, uma rota por seção); o CSS `.module-tab*` não tem nenhum elemento que o use |
| Operacional (`.operacional-tabs`) | **não** | só o seletor no CSS; nenhum `.js` usa a classe |

**O G8 estava errado em três das seis** — Compras/Financeiro e Operacional não têm barra de abas, só CSS/array
morto. A 107 apaga esse código morto (um commit separado, B57) e migra as quatro que existem.

Fora da lista (não são barras de abas, e ficam como estão — B57 (e "O que a etapa NÃO cobre")): os pares de **botões** "primário/secundário"
que alternam visão em Ferramentas, Inspeções, Lotes, Reposição e Sobras do almoxarifado, em Relatórios da Produção
e em Veículos/Manutenção. São botões de alternância com as classes de botão do módulo, sem CSS de aba; trocá-los
por abas mudaria o desenho dessas telas (não só unificaria) e cinco delas são do almoxarifado, que a 106 edita em
paralelo.

## Desenho

### G16 — uma execução por conexão ao mesmo tempo
`initSchema(db)` passa a ser **single-flight por conexão**: enquanto uma execução para aquele `db` está em
andamento, uma segunda chamada **recebe a mesma promise** em vez de começar outra. Quando a execução termina (bem
ou mal), a vaga se abre: a chamada seguinte roda de novo (idempotente, como hoje). Assim:
- no boot, a chamada da extended pega carona na de `routes/almoxarifado.js` — uma execução só, nenhum seed duplo;
- se essa execução falhar, as duas chamadas veem o erro e o retry da extended (400 ms depois) roda uma **nova**
  execução — o retry continua valendo (a falha **não** fica guardada);
- o harness de teste (`await initSchema(db)` e depois o registrador e a extended, que chamam de novo **em fundo**):
  as duas chamadas de fundo passam a ser uma execução só. **Correção da revisão do plano** — este item dizia "a
  segunda chamada chega depois de a primeira terminar e roda inteira, como hoje"; **estava errado**: o
  `createTestApp` devolve o app com a execução de fundo ainda em voo, e um teste que chame `await initSchema(db)`
  logo no começo pega carona nela em vez de rodar outra. Hoje inofensivo (os três testes que fazem isso só conferem
  idempotência).

**Descartados:** (a) tirar uma das duas chamadas — a de `routes/almoxarifado.js` é a que corre primeiro (rotas do
arquivo dependem das tabelas logo no registro) e a da extended é a que tem retry; tirar qualquer uma muda
ordem ou perde o retry, e o próximo módulo que chamar `initSchema` reabre a corrida; (b) `INSERT OR IGNORE` em
cada seed — só cobre as tabelas com `UNIQUE`; categorias não tem, e as duas execuções continuariam semeando em
dobro; (c) `UNIQUE` em categorias antes do seed — é o índice da Etapa 26, que precisa da tabela sem duplicata, e
não muda o fato de o `initSchema` inteiro rodar duas vezes.

### G8 — `ui/Tabs` em quatro telas
- `Tabs` ganha `aba.badge` (opcional): quando é número > 0 ou texto não vazio, aparece depois do rótulo num
  `<span class="ui-tab-badge">`. Sem `badge` nada muda (Configurações continua idêntica). É o contador da OS comercial.
- Cada tela troca o próprio `<div className="…-tabs">` pelo `<Tabs>`, com o **mesmo** array de abas, o **mesmo**
  estado e o **mesmo** handler de troca; o painel de conteúdo ganha `role="tabpanel"`/`aria-labelledby` quando ele
  é um elemento só (Admin: `.admin-content`). O CSS próprio da barra é apagado.
- O contraste da aba ativa no celular (`app-glass.css`, hoje só para `.os-tab.active`) passa a valer para
  `.ui-tab-ativa` — a OS comercial não perde a correção e Configurações ganha a mesma.
- Almoxarifado → Configurações: `tamanho="sm"` quando embutida (é o segundo nível de `/configuracoes`), `md` sozinha;
  sem `painelId` (o painel embutido é o de Configurações; o `Tabs` não emite `aria-controls` sem ele).
