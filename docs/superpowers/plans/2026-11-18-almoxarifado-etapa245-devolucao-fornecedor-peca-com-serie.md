# Etapa 245 — Devolução ao fornecedor de peça com número de série (plano)

> Item 4 da estimativa de 18/11 (`docs/estimativas/2026-11/estimativa_2026-11-18_cadastro-e-almoxarifado-semana.md`), **revisado** de
> 1h15 para 45 min na Fase 0 (commit `296e5bab`). Ponto de partida: a "Próxima tarefa detalhada" do plano da 244. Módulo Almoxarifado.
> A tarefa previa mexer no motor (a devolução gravar o lote das peças com série); a sonda mediu que **não há baixa** de peça com série
> pela não conformidade — mesmo caso da 244 — e achou um defeito no caminho que a recusa ensina.

## Fase 0 — o que a sonda executada mediu (sobre `09e0f69f`, `createTestApp`, fluxo real pela rota)

Material **crítico** com série (A1..A4), com e sem controle de lote; recebimento avulso (`POST /recebimentos` + `/aprovar`), inspeção
pela rota (`/recebimentos/itens/:id/inspecionar`), NC aberta automática, decidida `DEVOLVER`, executada pela rota.

| # | Gesto | Resultado medido |
|---|---|---|
| P1 | Inspeção 3 aprovadas / 1 reprovada | físico 4, bloqueado 1; as quatro séries `EM_ESTOQUE` (a reprovação **não** marca série); o livro grava `QUARENTENA`/`DECISAO_INSPECAO` **sem lote** |
| P2 | `/executar` da NC decidida `DEVOLVER` (com e sem controle de lote) | 400 *"Material com controle de série não pode ser devolvido por aqui — dê baixa pela tela de Movimentações"*; nada muda (físico, bloqueado, séries, livro) |
| P3 | O caminho que a recusa ensina, **com tudo reprovado** (0/4): Saída v2 da série A4 | 400 *"Saldo insuficiente. Disponível: 0 UN"* — o caminho ensinado **não anda** |
| P4 | O mesmo **com parte reprovada** (3/1): Saída v2 da A4 → cancelar a NC | 201 e 200; fica físico 3, **bloqueado 1** — uma peça **boa** presa no bloqueio, sem documento que a solte |
| P5 | Desbloquear (Inspeções, `POST /materiais/:id/desbloquear`) **citando o lote L1** | 400 *"Quantidade bloqueada insuficiente no lote L1: 0 UN"* (o bloqueio da inspeção é "sem lote"; a janela só oferece a linha com bloqueado) |
| P6 | Desbloquear 1 **sem lote** → Saída v2 da A4 (com `lote_id` L1) → cancelar | 200, 201, 200; físico 3, bloqueado 3 (0/4) ou 0 (3/1); A4 `ENTREGUE`; resumo de lotes fecha (`sem_lote_atribuido` 0) |
| P7 | `POST /movimentacoes/v2` com `tipo: DEVOLUCAO_FORNECEDOR` | 400 (a rota genérica recusa o tipo e ensina a tela de NC) |

**Conclusão:** o item 4 ("a devolução grava o lote das peças com série") **não tem lote a corrigir**: a execução recusa material com série
antes de mover qualquer coisa desde a Etapa 45 (nível 6 da precedência, RN-13). O defeito real é a **recusa**: ela só aparece ao
confirmar, e o caminho que ela ensina está **incompleto** — sem o desbloqueio, é recusado (P3) ou deixa peça boa presa (P4). O caminho que
funciona tem três passos (P6).

**Decisões (letra B):**
1. **Manter a recusa** e ensinar o caminho inteiro — na recusa do servidor (literal nova) e na janela, antes (botão desligado).
   Descartado: aceitar série na execução da NC (seletor de série na janela, `serie_ids` + lote pelas séries na `DEVOLUCAO_FORNECEDOR`, o
   desbloqueio junto) — muda a decisão da Etapa 45 (RN-13), motor + tela, ~2h ou mais.
2. **Literal do servidor trocada** (contrato de mensagem): mantém o começo *"Material com controle de série não pode ser devolvido por
   aqui — "* e troca o resto pelo caminho completo. Descartado: só a tela (a recusa continuaria ensinando o caminho que falha para quem a
   lê pelo toast — lista aberta antes de ligarem a série).
3. **A regra "a execução vai recusar por série" é do servidor**: a lista e o `GET /:id` ganham `execucao_recusada_por_serie` (0/1),
   e a tela só lê. Descartado: a tela recalcular a regra (o cabeçalho de `NaoConformidadesAlmoxarifado.js` proíbe segunda cópia da régua).
4. O **sucateamento** pela NC de material com série tem a recusa irmã (*"… não pode ser sucateado por aqui — dê baixa pela tela de
   Movimentações"*) — **não** medida nesta etapa; fica na D (245).

## Regras (RN)

- **RN-245.01** (servidor, fluxo real pela rota) — NC automática de inspeção, decidida `DEVOLVER`, material com série (com e sem
  controle de lote) → `/executar` 400 com a literal da RN-245.02; nada gravado (físico, bloqueado, séries, livro e `execucao_estado`
  iguais).
- **RN-245.02** (servidor, literal nova) — *"Material com controle de série não pode ser devolvido por aqui — desbloqueie a quantidade
  reprovada em Inspeções, dê baixa das peças em Movimentações → Saída escolhendo os números de série, e a Qualidade cancela este
  documento informando a baixa"*.
- **RN-245.03** (integração, pela rota) — o caminho da RN-245.02 fecha: (a) 0/4 reprovadas: Saída direta → 400 *"Saldo insuficiente.
  Disponível: 0 UN"*; desbloquear 1 → Saída v2 da A4 com lote → cancelar → físico 3, bloqueado 3, A4 `ENTREGUE`, a SAIDA com o lote L1,
  resumo fecha; (b) 3/1: desbloquear 1 → Saída → cancelar → bloqueado 0.
- **RN-245.04** (leitura) — `GET /nao-conformidades` e `GET /nao-conformidades/:id` trazem `execucao_recusada_por_serie`: 1 **só** quando
  a decisão é `DEVOLVER`, o material tem série e a NC é a automática da inspeção; amarrado ao `/executar` no mesmo teste: 1 → a recusa
  da série; NC **manual** com série → 0 e `/executar` 200 (registra sem mover); material **sem** série → 0.
- **RN-245.05** (tela) — janela **Registrar execução** com `execucao_recusada_por_serie` 1: o aviso literal
  *"Este material tem controle por número de série: a devolução não é registrada aqui. Para devolver: (1) em Inspeções → Desbloquear
  Material, desbloqueie a quantidade reprovada; (2) em Movimentações → Saída, dê baixa das peças escolhendo os números de série; (3) a
  Qualidade cancela este documento, informando a baixa no motivo."*, o botão **Registrar execução desligado**, e sem a frase "É este
  registro que dá a baixa no estoque". Metade positiva: `DEVOLVER` sem série → sem o aviso, botão ligado, a frase de baixa presente.

## Contrato (congelado)

- `POST /api/almoxarifado/nao-conformidades/:id/executar` — sem campo novo; a literal de recusa da série muda (RN-245.02).
- `GET /api/almoxarifado/nao-conformidades` e `/:id` — campo novo `execucao_recusada_por_serie` (0/1), calculado no SQL da projeção.
- Nenhuma fixture JSON de contrato espelha esta resposta (o teste da tela usa objetos inline) — nada a regravar.

## Fase 2 — pulada, com motivo

Sem motor, sem trava, sem saldo: um campo de leitura na projeção, uma literal e a janela. O risco que a Fase 2 pega (contrato errado
com galhos em paralelo) não existe: T1 e T2 são sequenciais e pequenas. Fase 5 com um revisor fresco, com sonda.

## Tasks (sort topológico)

- [ ] **T1 (tronco, servidor)** — teste primeiro (`devolucaoFornecedorPecaComSerie.api.test.js`: RN-245.01 a .04), depois a literal e o
  campo. Controle positivo: literal antiga; o campo sem a condição da origem automática; sem a série.
- [ ] **T2 (galho, tela)** — teste primeiro (`NaoConformidadesAlmoxarifado.test.js`: RN-245.05), depois o aviso e o `disabled`.
  Controle positivo: sem `disabled`; sem o aviso.
- [ ] **T3 (integração)** — RN-245.03, no arquivo da T1.
- [ ] **T4** — Fase 5, suítes, fechamento.
