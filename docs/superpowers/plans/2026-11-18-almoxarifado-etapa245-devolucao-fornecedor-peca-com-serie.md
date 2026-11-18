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

- [x] **T1 (tronco, servidor)** — `4f52e829`. Teste primeiro: 6 vermelhos de 8 (a literal e o campo; os 2 do caminho — RN-245.03 — passam de
  primeira: é comportamento que já existia). Controle positivo: sem `aberto_automaticamente` → o caso manual; sem `DEVOLVER` → ABERTA e
  SUBSTITUICAO; sem a série → o caso sem série; o desbloqueio sem efeito (rota) → os dois RN-245.03. Restauro por cópia, md5 de volta.
  **Não caía:** tirar a condição da origem `INSPECAO` — achado 2 da Fase 5, coberto em `c3ea407d`.
- [x] **T2 (galho, tela)** — `f1235e25`. Teste primeiro: (53) vermelho, (54) metade positiva. Controle positivo: sem `disabled`, sem o aviso, a
  frase da baixa de volta — cada um derruba o (53) pela sua asserção (as três estão em sequência e cada sabotagem passa pelas anteriores).
- [x] **T3 (integração)** — RN-245.03, no arquivo da T1 (`4f52e829`).
- [x] **T4** — Fase 5 (`c3ea407d`), suítes e fechamento.

**Divergência:** a etapa previa mexer no motor (a devolução gravar o lote); a Fase 0 mediu que a baixa não existe para peça com série. A
estimativa foi revisada (`296e5bab`). Mudança de servidor: a literal e um campo de leitura. A primeira suíte inteira (sobre `f1235e25`) deu
**637/638**: o retrato de chaves do `/decidir` (`filaLiberacaoAprovacaoCorrida`, [91 RN-09]) não tinha a chave nova — derrubou de propósito;
atualizado em `c3ea407d`.

## Fase 5 (um revisor adversarial fresco, com sonda executada) — achados e o que foi feito

- **Achado 1 (real, médio-baixo, reproduzido):** o aviso falava para quem não faz os passos 1 e 2 — Compras: desbloquear 403, Saída 403;
  Qualidade: desbloquear 403, Saída 403. **Corrigido** (`c3ea407d`): a literal e o aviso dizem quem faz cada passo (Gestor, Almoxarife,
  Qualidade). Teste: os dois textos literais (servidor e tela) — vermelhos com o texto antigo.
- **Achado 2 (lacuna de teste, real):** a condição de origem do campo não estava presa — a NC automática de RECEBIMENTO (divergência de
  quantidade) de material com série ficaria com o botão apagado e o `/executar` 200. **Teste novo** pelo fluxo real (conferir com 2 de 3);
  controle positivo: sem a origem → vermelho.
- **Achado 3 (real, baixo — sem efeito na tela):** o campo ignorava status e execução (a cancelada pelo passo 3 e a executada antes de ligarem
  a série ficavam 1). **Corrigido** (`c3ea407d`): só DECIDIDA sem execução. Teste próprio; controle positivo: sem o status, sem
  `execucao_em` → vermelho cada um.
- **Tentados e não quebraram:** material inativo com série (o nível 6 vem antes), série ligada depois da reprovação, `nc.material_id` ×
  `insp.material_id` (a NC copia o da inspeção), material com lote (o bloqueio da reprovada é "sem lote" e a janela só oferece essa linha),
  duas inspeções do mesmo material.


## Verificação (medida, serial, sobre o código final `c3ea407d`)

- `npm run test:api`: **637/638 arquivos**. O que caiu foi `permissoesNoServidor.api.test.js`, [RN-06] *"antes: o alvo sem financeiro toma 403 no
  portão do módulo"* (`alvoS`) — portão do módulo financeiro, sem relação com esta etapa; na primeira rodada inteira da etapa (sobre `f1235e25`)
  ele passou, e sozinho passou 3 vezes em 3 (9/9). **Intermitente, não investigado** — registrado na F (245). Na primeira rodada, o único
  vermelho foi o retrato de chaves do `/decidir` (acima), corrigido.
- `test:almoxarifado` 44/0; `test:validation` 4/0; `test:safealter` 3/0; `test:sqlite` 16/0.
- Jest da tela: **236 suítes, 3180 testes** (3178 da 244 + os 2 novos); `CI=true react-scripts build`: *Compiled successfully*.

## Retro (4 números)

- Rodadas de correção até verde: 2 (o retrato de chaves; Fase 5: quem faz cada passo, a origem presa, o status).
- Achados: Fase 2 pulada (sem motor, sem trava); Fase 5 — 3 reais reproduzidos (1 médio-baixo e 1 baixo corrigidos, 1 lacuna de teste
  coberta), 0 ruído.
- Paralelismo: T1 e T2 sequenciais (pequenas); a Fase 5 rodou junto com a primeira suíte inteira, o Jest junto com a segunda.
- Defeito que escapou: (preencher na etapa seguinte). Da 244: nenhum conhecido.

## Próxima tarefa detalhada

Item 9 da estimativa de 18/11 (`docs/estimativas/2026-11/estimativa_2026-11-18_cadastro-e-almoxarifado-semana.md`, 45 min): **a frase do
lote das séries na saída avulsa** (**C539**, **B1531**). Módulo Almoxarifado, tela **Movimentações → Saída/Perda**.

- **O que é:** a frase que diz de qual lote saem as séries marcadas deve aparecer **só quando o lote tem a peça no saldo**; hoje ela lê só a
  série e pode citar um lote de onde a peça não vai sair.
- **Medir antes de prometer (Fase 0):** o servidor deriva o lote das séries só quando a linha de saldo do lote cobre (`stockService.js`
  ~`:1379`, `lotePelasSeries` — Etapa 234); ver na tela (`MovimentacoesAlmoxarifado.js`) de onde a frase lê e se a lista de lotes já traz o
  saldo/livre por lote (Etapa 241: `listarLotesDoMaterial` com o livre). Conferir a C539 e a B1531 no `docs/almoxarifado-novidades-por-etapa.md`
  antes — elas dizem o caso exato.
- **Contrato que consome:** `GET /almoxarifado/series?material_id=…` (status e `lote_id` da série) e o seletor de lotes da Saída (saldo e livre
  por lote). Se faltar campo, é leitura no servidor + fixture de contrato regravada.
- **Pontos de atenção:** é fatia de tela + leitura — sem motor, sem trava (Fase 2 pode ser pulada com motivo; Fase 5 com um revisor). Frase
  que afirma ausência precisa da metade positiva no mesmo teste.
- **O que já está pronto e não reabre:** a saída avulsa grava o lote pelas séries (234), a devolução (243), o retalho (244) e a devolução ao
  fornecedor (esta).
