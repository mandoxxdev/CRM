# Almoxarifado — Etapa 112: ligar lote ou série com saldo não identificado passa a ser do Administrador (plano)

> Origem: "Próxima tarefa detalhada — Etapa 112" do plano da 110 (**C222**). Design (com a Fase 0 medida e o que mudou
> depois): `docs/superpowers/specs/2026-10-15-almoxarifado-etapa112-controle-com-saldo-design.md`.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-15): última B **B727**,
> último C **C223**, última A **A58**. Esta etapa: **B728+**, **C224+**, **A59+**. Worktree `CRM-wt-e112`, branch
> `etapa-e112` (a partir da main `9dd1af85`); nenhuma outra etapa em paralelo.
>
> **Divergência registrada (Fase 2):** a primeira versão deste plano recusava ligar o controle **para todos** quando o
> material tinha físico ≠ 0 ou retenção, e mandava "zerar o saldo com uma Saída". A revisão fresca do plano achou (com
> sonda) que isso (1) deixava religar a série com físico 0 e séries presentes, e a Entrada seguinte recusava; (2) prescrevia
> consumo fictício no material nosso e era impossível no de cliente; (3) recusava com o saldo todo em lote; e a medição
> seguinte (sonda `e112aj.js`) mostrou que a **regularização do lote existe** (Entrada com lote + Ajuste do total) e que a
> de séries exige o controle **já ligado**. As RN e o contrato abaixo são a versão corrigida; o descartado está na **B728**.

## Regras de negócio

- **RN-01 — ligar lote ou série com saldo não identificado exige `ajustar_estoque`.** `PUT /api/almoxarifado/materiais/:id`
  em que `controle_lote` ou `controle_serie` passa de 0 para 1 (o corpo depois do `bool01`, comparado com o **gravado** lido
  como 0/1), por quem **não** tem `ajustar_estoque`, num material em que:
  - (lote) a sobra **sem lote atribuído** = arredondar a 6 casas (físico − soma do saldo dos lotes existentes) ≠ 0
    (|x| > 1e-9) — a conta de `lotService.resumoLotesDoMaterial`;
  - (série) físico (6 casas) ≠ séries presentes (`EM_ESTOQUE` + `BLOQUEADA`)
  → **403** literal **E1**, nada gravado (nenhum campo), sem auditoria. *Cenários:* Almoxarife e Engenharia, lote com 5 sem
  lote; série com físico 3 e nenhuma série; os dois (partes separadas por `; `); 3 em lote + 2 sem → "há 2"; sobra −2;
  ruído 0,1 + 0,2 → "0.3"; físico 0 com 2 séries presentes (religar a série); usuário sem perfil → 403 do `editar_material`.
- **RN-02 — quem tem `ajustar_estoque` liga e regulariza.** Administrador por perfil e superadmin → 200 e grava, com o saldo
  como estiver. Regularizar: séries em Lotes e Séries → regularizar (Etapa 61); lote por Entrada com o lote + Ajuste do total.
- **RN-03 — saldo identificado: ligar é livre.** Saldo todo em lote; séries presentes = físico; nada (o livro não conta);
  resíduo < 1e-6 → 200 para quem tem `editar_material`.
- **RN-04 — o que já estava ligado continua editável.** Corpo com o controle já ligado (o formulário sempre manda as chaves)
  ou chave omitida, com saldo preso → 200.
- **RN-05 — desligar e `requer_inspecao` são livres.** 1 → 0 com saldo → 200; `requer_inspecao` com saldo → 200 (nenhum fluxo
  de saída lê a coluna). Desligar um e ligar o outro → recusa só pelo que liga.
- **RN-06 — a conferência também vai no `UPDATE`, para quem não pode regularizar.** (a) Quando liga: o `UPDATE` ganha a régua
  de RN-01 como condição (sobra sem lote ≈ 0; físico ≈ presentes). (b) Para todo controle que o corpo deixa em 1: `AND
  COALESCE(controle_x, 0) = ⟨o gravado⟩` — um "manter ligado" lido antes de outra aba desligar não religa por fora da regra.
  Não gravou → relê: dono → o 409 da 108; **controle → E1 com os números relidos**; família/subfamília → a 400 de hoje;
  senão → o 409 **E4** da 110. O Administrador não leva a condição. *Cenários injetados:* Entrada sem lote de 4 na janela →
  E1 "há 4"; série com 2 → E1; manter ligado com desligar na janela → 409 E4; Administrador com saldo na janela → 200.
- **RN-07 — ordem das recusas.** 404 → troca de dono (403 da 108) → **E1** → família / subfamília / localização padrão (400),
  e a mesma ordem na releitura. *Cenários:* troca de dono + liga → 403 da 108; liga + família inativa → E1; na releitura,
  saldo e família inativada na janela → E1.

## Contrato congelado

`PUT /api/almoxarifado/materiais/:id` — corpo e resposta 200 inalterados. Recusa nova:

**E1 — 403** `{ "error": E1 }`:

```
Ligar o controle ⟨nomes⟩ no material ⟨código⟩ exige a permissão "ajustar_estoque" (seu perfil: ⟨perfil⟩): ⟨partes⟩. Depois de ligar, a saída desse saldo é recusada até ele ser regularizado, e regularizar é do Administrador do almoxarifado. Peça a ele para ligar o controle e regularizar o saldo.
```

- ⟨nomes⟩: `por lote` · `por número de série` · `por lote e por número de série`.
- ⟨partes⟩, na ordem, separadas por `; `: `há ⟨sobra⟩ sem lote atribuído` (lote) e `o físico é ⟨físico⟩ e há ⟨n⟩ série(s)
  em estoque` (série) — só as que prendem. Números arredondados a 6 casas, `String(Number)` (ponto decimal: `0.3`, `-2`).
- ⟨perfil⟩: `getPerfilFromUser` (ALMOXARIFE, ENGENHARIA…).

Funções novas em `services/almoxarifado/materialService.js`: `controlesLigados(gravado, merged)`,
`saldoNaoIdentificado(db, materialId, ligados)` → `[]` ou as partes, `mensagemControleSemPermissao(codigo, ligados, partes,
perfil)`, `condicaoSaldoIdentificadoSql(ligados)`.

## Tasks (sort topológico)

- [ ] **T1 — tronco.** Funções + guarda na rota (depois da do dono, antes da família) + condições no `UPDATE` + releitura.
  `server/tests/api/controleComSaldo.api.test.js` (RN-01..RN-07). Controle positivo: dez sabotagens (sem guarda prévia;
  compara com o corpo; sem a condição de saldo; sem a do controle gravado; releitura sem E1; todos podem; ninguém pode; régua
  do lote pelo físico; régua da série sem presentes; sem arredondar).
- [ ] **T2 — integração (cruza o PUT com o motor e a regularização).** `server/tests/api/controleComSaldoIntegracao.api.test.js`:
  (i) lote: Almoxarife 403 → Administrador liga → Saída sem lote 400 → Entrada com L1 + Ajuste → sem lote 0 → Saída por L1;
  (ii) série: liga → regulariza séries → Saída pela série; (iii) material de cliente pelo Administrador; (iv) o caminho do
  Almoxarife: Entrada com lote antes de ligar.
- [ ] **T3 — fechamento** (skill `fechar-etapa`): novidades (seção 112 + B728+, C224+, A59), spec 01 e 10 (a frase "o AJUSTE
  puro é o caminho de regularização" — corrigir dizendo o que vale), a A57 (mandava regularizar o lote "com um Ajuste"),
  mapa, guia, manual §2.7, plano + retro.

Sem galhos: uma regra, dois arquivos de produção — paralelismo declarado 0.
