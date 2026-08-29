# Almoxarifado — Etapa 26: uma lista de categorias só, e ela é do cliente (design)

Data: 2026-08-29 · Branch: `desenvolvimento-almoxarifado`
Origem: a pendência "categorias hardcoded no front" da feature 01, aberta desde a Etapa 2 e
encostada (sem resolver) pela Etapa 8c — e a **B6**, que pergunta qual lista vale.

## Decisão de escopo (Fase 0 — medida em 2026-08-29)

**A B6 pergunta "qual das duas listas de categorias vale?". A medição mostrou que a pergunta
está incompleta: as duas listas não têm UMA categoria em comum, e a que foi desenhada para a
GMP está morta no banco.**

- **A lista das telas** — 11 itens em MAIÚSCULAS, **hardcoded e duplicados em 3 arquivos**
  (`MaterialAlmoxarifadoForm.js:14`, `ConferenciaEstoque.js:11`, e o default `:70`/`:255`):
  `CONSUMÍVEL`, `FERRAMENTA`, `EPI`, `ELÉTRICO`, `HIDRÁULICO`… É genérica, serve para qualquer
  empresa.
- **A lista do servidor** — 27 itens em `CATEGORIAS_SEED` (`services/almoxarifado/schema.js:7`),
  semeados na tabela `categorias_material_almoxarifado`: `Aço carbono`, `Aço inox`, `Chapas`,
  `Tubos`, `Perfis estruturais`, `Componentes usinados`, `Rolamentos`, `Elementos de fixação`,
  `Solda e consumíveis`… É a taxonomia de **uma metalúrgica**, que é o que a GMP é.

**Medido no banco:**

```
materiais por categoria:  CONSUMÍVEL → 2      (nenhuma outra)
linhas em categorias_material_almoxarifado:  27   (nenhuma em uso)
```

Ou seja: **a GMP classifica material com a lista genérica enquanto a tabela desenhada para ela
está intacta e sem uso.** E a tabela tem `GET /api/almoxarifado/categorias` (`extended.js:148`)
que **já é consumido** por `ConfiguracoesAlmoxarifado.js:2884` — o carregamento existe; o que
não existe é tela para **editar**, e nenhum formulário de material lê dali.

> **A distinção "o carregamento existe, a tela de editar não" está escrita de propósito.** Foi
> exatamente ela que faltou na Etapa 24, onde eu afirmei que uma tela não existia porque procurei
> pelo nome errado e desenhei a etapa inteira sobre a premissa falsa. Aqui: `GET` existe, é
> consumido por uma tela, e **não há POST/PUT/DELETE** — conferido rota a rota.

## As decisões, e o que foi descartado

**1. Vence a lista do cliente (a tabela), e ela deixa de ser semente morta.** A taxonomia de
metalúrgica é a que serve para quem vai usar o sistema; a genérica serve para ninguém em
particular. **Descartado** manter as duas (é o estado de hoje, e é o problema) e **descartado**
fundir as listas: `EPI`/`EPIs`, `FERRAMENTA`/`Ferramentas`, `ELÉTRICO`/`Elétrica` são pares
conceituais com grafias diferentes, e fundir criaria uma terceira lista que ninguém pediu.

**2. NÃO migrar categoria de material automaticamente.** Trocar a categoria de um cadastro é
mexer em dado do cliente sem ele pedir, e o banco de desenvolvimento não é o de produção — aqui
são 2 materiais, lá podem ser centenas com distribuição desconhecida. **A consulta vai para a
letra A**, para o André rodar em produção **antes** do deploy e decidir com número na mão.
**Descartado** um `UPDATE` de mapeamento no deploy: irreversível sobre dado do cliente, e
baseado numa medição que eu não tenho.

**3. O material com categoria fora do catálogo continua válido, e a tela mostra isso.** Como
não há migração, um material gravado com `CONSUMÍVEL` abriria num `<select>` que não tem essa
opção — e salvar trocaria a categoria dele **em silêncio**, que é o pior desfecho possível. O
select passa a incluir o valor atual do material quando ele não estiver no catálogo, marcado
como fora de catálogo. **Descartado** deixar o select "escolher a primeira opção" (troca
silenciosa) e **descartado** bloquear o save (impediria editar o preço de um material só porque
a categoria dele é antiga).

## Regras de negócio (RN)

- **RN-01 — Uma fonte só.** As telas param de ter lista hardcoded e passam a ler
  `GET /api/almoxarifado/categorias`. Nenhum arquivo do client volta a declarar a lista.
- **RN-02 — Categoria é cadastro editável**, com o mesmo contrato das famílias (que já têm CRUD
  completo, `routes/almoxarifado.js:2243-2413` — é o molde a copiar, não a inventar):
  criar, renomear, desativar. Desativar **não** apaga: some do select e continua valendo nos
  materiais que já a usam.
- **RN-03 — Escrever categoria exige perfil.** O `GET` de hoje tem só `auth` (a lista não é
  segredo). As rotas de escrita usam o gate dos cadastros irmãos — **confirme qual é o de
  famílias e use o mesmo**, sem inventar régua nova.
- **RN-04 — Categoria fora do catálogo não some e não troca sozinha.** Ao abrir um material cuja
  categoria não está na lista ativa, o select inclui o valor atual, identificado como fora de
  catálogo. Salvar sem tocar no campo **mantém** o valor.
- **RN-05 — Renomear categoria não reescreve os materiais.** A coluna `materiais.categoria` é
  texto; renomear a linha do catálogo **não** propaga. Isso fica **declarado na tela** (ao
  renomear, avisa que os materiais já classificados mantêm o nome antigo) — e vai para a letra B
  como a pergunta que o André decide: propagar ou virar chave estrangeira é outra etapa.
- **RN-06 — Categoria duplicada é recusada**, com a mesma régua de nome dos cadastros irmãos
  (conferir se famílias usa `UNIQUE`, `TRIM`, caixa — e seguir).

## Arquitetura

- **`routes/almoxarifado/extended.js`** (ou o arquivo das famílias, o que for coerente) — POST,
  PUT e DELETE de categorias, copiando o molde de famílias, **com auditoria** (a Etapa 19
  instrumentou os 12 cadastros; este nasce instrumentado, não fica como o 13º sem rastro).
- **`client/src/components/almoxarifado/`** — um hook ou serviço único que busca as categorias,
  consumido pelo formulário de material e pela conferência; a aba de Configurações ganha o CRUD
  (molde: a aba de famílias).

## Testes

- `categoriasCrud.api.test.js`: RN-02 (criar/renomear/desativar), RN-03 (gate — **matriz de
  perfis**, com a asserção negativa), RN-06 (duplicada recusada), e **desativar não apaga**
  (o material que a usa continua com ela).
- `MaterialAlmoxarifadoForm` / `ConferenciaEstoque` (client): RN-01 (a lista vem do endpoint —
  sabote o mock e o teste tem de acompanhar) e **RN-04, o cenário de peso**: material com
  categoria fora do catálogo abre com o valor preservado e **salva sem trocá-lo**.
- Integração: criar categoria pela rota, ver aparecer no `GET`, classificar material com ela.
- Controle positivo com alvo em cada um, **lendo qual asserção caiu**.

## O que muda em cada camada

| Camada | Mudança |
|---|---|
| `routes/.../extended.js` | POST/PUT/DELETE de categorias, com auditoria |
| `client/.../MaterialAlmoxarifadoForm.js`, `ConferenciaEstoque.js` | param de hardcodar; leem do endpoint |
| `client/.../ConfiguracoesAlmoxarifado.js` | aba de categorias com CRUD |
| `specs/01` | a pendência "categorias hardcoded" sai; a B6 é respondida |

## Fica FORA, declarado

- **Migrar os materiais existentes** (decisão 2) — letra A, com a consulta pronta.
- **Categoria virar chave estrangeira** (hoje é texto livre na coluna `materiais.categoria`) —
  é a mudança que tornaria a RN-05 desnecessária, e é migração de schema com risco próprio.
- **A lista genérica sumir do histórico** — materiais antigos seguem com o valor que têm até
  alguém editá-los.
