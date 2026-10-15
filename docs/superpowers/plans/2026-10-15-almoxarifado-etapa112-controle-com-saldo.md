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
  resíduo que arredonda a 0 em 6 casas (|x| < 5e-7; 6e-7 já vira 1e-6 e recusa) → 200 para quem tem `editar_material`.
  *(Esta linha dizia "resíduo < 1e-6" — impreciso; corrigido na Fase 5.)*
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

- [x] **T1 — tronco** — `528a44a0`. Funções + guarda na rota (depois da do dono, antes da família) + condições no `UPDATE` + releitura.
  `server/tests/api/controleComSaldo.api.test.js` (RN-01..RN-07). Controle positivo: dez sabotagens (sem guarda prévia;
  compara com o corpo; sem a condição de saldo; sem a do controle gravado; releitura sem E1; todos podem; ninguém pode; régua
  do lote pelo físico; régua da série sem presentes; sem arredondar).
- [x] **T2 — integração (cruza o PUT com o motor e a regularização)** — `51df3c3c`. `server/tests/api/controleComSaldoIntegracao.api.test.js`:
  (i) lote: Almoxarife 403 → Administrador liga → Saída sem lote 400 → Entrada com L1 + Ajuste → sem lote 0 → Saída por L1;
  (ii) série: liga → regulariza séries → Saída pela série; (iii) material de cliente pelo Administrador; (iv) o caminho do
  Almoxarife: Entrada com lote antes de ligar.
- [x] **T3 — fechamento** — o commit de documentação desta etapa (ver `git log`) (skill `fechar-etapa`): novidades (seção 112 + B728+, C224+, A59), spec 01 e 10 (a frase "o AJUSTE
  puro é o caminho de regularização" — corrigir dizendo o que vale), a A57 (mandava regularizar o lote "com um Ajuste"),
  mapa, guia, manual §2.7, plano + retro.

Sem galhos: uma regra, dois arquivos de produção — paralelismo declarado 0.

## Execução — o que aconteceu

- **Design e plano:** `a8cda2ad` (já com a correção da Fase 2).
- **T1** `528a44a0` — 26 cenários; dez sabotagens do autor, todas derrubando a asserção certa (a da guarda prévia só
  derruba a RN-07: sem ela a condição do `UPDATE` e a releitura ainda recusam — a prévia existe pela ordem das recusas).
- **T2** `51df3c3c` — 4 jornadas; controle positivo (liberar a guarda para todos derruba as três de recusa).
- **Fase 5** `d7b0cae8` — dois revisores frescos em paralelo. Regra e perfil: **0** Critical/Important, **3** Minor
  (todos documentação: a tela de Lotes só mostra o "sem lote" depois de ligar; material inativo também é conferido; o
  Gestor também regulariza — escritos na B728/B729 e no manual). Sabotagem (worktree própria, removida): **25** sabotagens
  novas, **13** derrubaram, **2** inalcançáveis (lote apagado — há FK e nenhuma rota apaga lote; perfil cru — todo usuário
  que recebe a mensagem tem perfil explícito), **10** sem prova → **10** cenários novos, nenhum defeito de produção.
- **Suíte final (medida):** `test:api` **371/371** arquivos; `test:almoxarifado` **44/0**; `test:validation` 4/0,
  `test:safealter` 3/0, `test:sqlite` 10/0; client **115** suítes / **1610** testes; `CI=true build` *Compiled
  successfully* (a tela não mudou nesta etapa).
- **Divergência do plano:** a decisão inteira (ver o topo) — de "recusar para todos e zerar" para "exige `ajustar_estoque`",
  com a régua do saldo identificado. E a premissa "para lote não existe regularização" do design **estava errada** (o par
  Entrada com lote + Ajuste regulariza — sonda `e112aj.js`).

## Retro (4 números)

1. **Rodadas de correção até verde:** **0** no código (nenhum teste da etapa ficou vermelho depois da implementação);
   **1** de redesenho, antes do commit, pela revisão do plano.
2. **Achados da revisão:** Fase 2 — **7 reais** de 8 (o 8º foi conferência sem problema), dos quais 3 Important que
   mudaram a decisão; Fase 5 — **13 reais** (3 Minor de documentação + 10 cenários sem prova), **0** ruído.
3. **Paralelismo:** **0** galhos (uma regra, dois arquivos de produção); **2** revisores em paralelo na Fase 5 (um em
   worktree própria para sabotar), sem retrabalho.
4. **Defeito que escapou:** *(preencher na Etapa 113)*.

## Próxima tarefa detalhada — Etapa 113

*(A série desta etapa foi B728–B732, C224–C227, A59 — a 113 começa em **B733**, **C228**, **A60**; confira com `grep -oE`
antes.)*

**Como foi escolhida (mapa `specs/modulo-almoxarifado/README.md` e os C abertos, medidos em 2026-10-15):** as features 🟡
continuam 00, 01, 05, 06, 21, 22 e 23. Candidatos medidos:

1. **C217 + C227 — inativar material com saldo prende o saldo** (feature 01, com a 13). **Medido** (sonda
   `server/tests/sonda/e112c217.js`, não versionada): `DELETE /api/almoxarifado/materiais/:id` (gate `editar_material`:
   Administrador, Almoxarife, **Engenharia**) **não confere nada** — a Engenharia inativa material de **cliente** com saldo 5
   (200), o Almoxarife inativa material **nosso** com saldo 5 (200); depois a Saída → 400 *"Material inativo não pode ser
   movimentado"*, `quantidade_atual` continua 5. O material some das listas (e o de cliente da posição do cliente —
   C217). É a mesma forma da C222: uma edição de cadastro que deixa saldo preso.
2. **C220 — reativar material numa família inativa** — **medido**: `PUT { ativo: 1 }` (e o mesmo com `familia_id` e
   `subfamilia_id` iguais, como o formulário mandaria) → 200 com a família **e** a subfamília inativas. **Mas nenhuma tela
   reativa material** (o formulário não manda `ativo`; a lista não tem "Reativar") — só a API. Vai junto da 1 porque é a
   outra transição do mesmo campo.
3. **C219** (Entrada manual sem documento de cliente) — decisão de P.O. antes de código (muda a Etapa 8). **C216** (dono
   inexistente pela API), **C209** (aviso da contagem), **C221** (outras escritas de família).

**Escolhida: C217 + C227, com a C220.** Integridade com consequência medida, por tela, para perfil que não regulariza.
*(A B732 desta etapa dizia "a 113 é a C220" — a medição do fim da etapa achou a C227, de maior valor; a B732 fica
corrigida no documento de novidades.)*

**Tema: a situação do material (ativo/inativo) não prende saldo nem deixa família inativa com material ativo.**

**Fase 0 (medir antes de prometer):**
1. Reproduzir a sonda com os três perfis, com retenções (reservado, bloqueado, em inspeção, em terceiros), com requisição
   aberta / pedido de compra aberto (é "histórico" para a regra? a 108 decidiu que compromisso pendente não é — B714), e
   com saldo 0 e livro (inativar material sem saldo tem de continuar livre — é o uso normal).
2. Medir o que **lê** `ativo = 1`: a Saída (recusa), a entrega de requisição, a posição do cliente, a contagem, os
   relatórios — para escrever no manual o que some.
3. Consulta **A60**: materiais inativos com saldo ou retenção.

**Contrato candidato (decisão — letra B, caminho reversível):**
- **(a)** `DELETE /materiais/:id` (e o `PUT { ativo: 0 }`, se aceitar — conferir `MATERIAL_UPDATE_COLUMNS`) com saldo
  ≠ 0 ou retenção > 0 → 400 nomeando o saldo e o caminho (*"dê saída / devolva ao cliente antes"*), para todos; condição no
  `UPDATE` (`AND ABS(quantidade_atual) <= 1e-9 AND …`).
- **(b)** Só quem tem `ajustar_estoque` (Administrador) inativa com saldo — o padrão da 112.
- **C220:** `PUT` que muda `ativo` de 0 para 1 confere família e subfamília ativas (as réguas de `validateFamiliaAtiva`
  / `validateSubfamilia`, a literal de hoje) e leva `condicaoFamiliaSql` no `UPDATE` — o "Inativar" da família já tem a
  condição inversa (110).

**Pontos de atenção:** o `DELETE` hoje faz `SELECT` antes e `UPDATE` sem condição (comentário longo da Etapa 23 sobre a
auditoria `DESATIVACAO`: só audita quando desativa de fato — manter); a tela de Materiais mostra a recusa no toast do
"Inativar" (conferir o componente); o manual §2 (cadastro) e §16 (materiais de clientes).

**O que já está pronto e não precisa reabrir:** a guarda de ligar lote/série com saldo (esta etapa); a corrida da família e
o Saldo Inicial (110); a guarda do dono (108).
