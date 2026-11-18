# Etapa 242 — o aviso de material de cliente reservado para uma OS (C541)

> Item 8 da estimativa `docs/estimativas/2026-11/estimativa_2026-11-18_cadastro-e-almoxarifado-semana.md` (45 min, fatia de tela).
> Ponto de partida: a "Próxima tarefa detalhada" do plano da 241 (`2026-11-18-almoxarifado-etapa241-livre-no-seletor-de-lote.md`).

## Fase 0 — o que foi medido

- `clienteEstoqueService.posicaoPorCliente` (`GET /api/almoxarifado/materiais-cliente/posicao?cliente_id=`) traz por item `saldo` (físico) e
  `saldo_disponivel` (`disponivelSql`, **sem** a caixa separada). Não diz **para qual OS** está reservado nem o livre na régua do motor.
- O motor, na saída avulsa (a devolução ao cliente é uma), confere primeiro o livre do material — `livreDeCaixaSql` (disponível menos a caixa
  separada sem reserva); com saldo negativo efetivo (material ou global) não confere a reserva: sem caixa não limita, com caixa limita a
  físico − caixa. A lista de lotes já calcula esse número (`livre_do_material`, Etapa 241, três achados da Fase 5 dela).
- As reservas ficam em `reservas_material_almoxarifado` (`status = 'ATIVA'`, resto = `quantidade − quantidade_utilizada`, `os_id` e/ou
  `os_referencia`). A reserva do material de cliente que entra com OS nasce MANUAL com `os_id` e `os_referencia` (`reservaDaOs.js`).
- Janela **Devolver ao cliente** (`MateriaisClienteAlmoxarifado.js`): rótulo *"Quantidade (saldo: 5 UN)"*; material sem lote não avisa nada e o
  Confirmar responde *"Saldo insuficiente. Disponível: 0 UN"*.

**Decisão (letra B):** dizer **para qual OS** — campo novo na posição (`reservas`), não só `saldo_disponivel < saldo`. Descartado: o aviso
genérico sem OS (o almoxarife teria de abrir Reservas para saber de quem é). O livre vem do mesmo cálculo da lista de lotes (função
compartilhada), não do `saldo_disponivel` (que não desconta a caixa e ignora o negativo efetivo).

## Regras (RN)

- **RN-242.01** — *(Fase 5: + `projeto`, abaixo)* cada item da posição ganha `livre: number|null` (a régua do motor: o mesmo número que `livre_do_material` da lista de lotes —
  `max(0, livreDeCaixaSql)`; negativo efetivo sem caixa → `null`; negativo com caixa → `max(0, físico − caixa)`) e
  `reservas: [{ os: string|null, quantidade: number }]` — as reservas ATIVAS do material somadas por OS (`numero_os` da OS cadastrada, senão
  `os_referencia`; sem nenhum dos dois, `os: null`), resto = `quantidade − quantidade_utilizada`, só as com resto > 0, ordenadas pela OS.
- **RN-242.02** — o rótulo da quantidade acrescenta *" — livre {livre} {un}"* quando o livre é menor que o saldo:
  *"Quantidade (saldo: 5 UN — livre 2 UN)"*. Livre igual ao saldo ou `null`: o rótulo de antes.
- **RN-242.03** — com reservas e livre não nulo, a janela diz (`#dev-reservado`): *"Reservado: 3 UN para a OS 1234 e 1 UN sem OS. Livre para
  devolver: 2 UN."* (partes separadas por vírgula, a última por " e ").
- **RN-242.04** — quantidade acima do livre (livre não nulo), aviso (`#dev-livre-nao-cobre`) e Confirmar apagado: *"Estão livres só {livre}
  {un} deste material: devolva até {livre} ou libere a reserva em Reservas."* (sem reservas — o que prende é bloqueio, inspeção, terceiros ou
  separação: *"Estão livres só {livre} {un} deste material: devolva até {livre}."*). Com o aviso do lote da 241 (`#dev-lote-livre-nao-cobre`)
  na tela, este não aparece (um aviso só).
- **RN-242.05** — integração posição × rota: devolver o `livre` da posição → 201; `livre + 1` → 400 *"Saldo insuficiente. Disponível: {livre}
  UN"*.

## Contratos (congelados)

- `GET /api/almoxarifado/materiais-cliente/posicao?cliente_id=` — cada item ganha `livre` e `reservas`. Nada mais muda. *(Fase 5: cada
  reserva ganha `projeto: string|null` — o nome do projeto, só quando a reserva não tem OS.)*

## Tasks

- [x] **T1 (tronco, servidor)** — `d4edb6bc` (+ Fase 5 `3f42ece3`) — `livreDoMaterialParaSaida` extraído da lista de lotes e usado na posição; `reservas`. Teste
  `posicaoClienteReservadoParaOs.api.test.js` (RN-242.01, .05) escrito antes — 7 vermelhos (`undefined`); controle positivo: 5
  sabotagens (sem o filtro ATIVA, sem descontar a utilizada, OS só pelo texto, livre = `saldo_disponivel`, reservas de outro material) + 2 da
  Fase 5 (sem projeto, projeto mesmo com OS), cada uma vermelha no cenário certo; restauro por cópia com md5. 8 cenários.
- [x] **T2 (galho, tela)** — `423613d7` (+ Fase 5 `3f42ece3`) — rótulo, `#dev-reservado`, `#dev-livre-nao-cobre` (RN-242.02 a .04). Teste
  `MateriaisClienteDevolucaoReservado.test.js` escrito antes — 7 vermelhos de 10 (os 3 verdes eram os cenários "a janela de antes", com a
  metade positiva); controle positivo: 9 sabotagens (rótulo sem livre, Confirmar que não apaga, aviso que compara ao saldo, aviso repetido com
  o do lote, sem a frase, só a primeira OS, frase com negativo, sufixo da reserva sempre, livre null vira 0) + 1 da Fase 5 (projeto vira
  "sem OS"), cada uma vermelha no cenário certo. 12 cenários. **Divergência:** o cenário "com lote ainda não escolhido" precisou de dois
  lotes na fixture (com um só a janela pré-escolhe — RN-236.03); acrescentado o cenário de negativo com caixa (frase da reserva fora).
- [x] **T3** — suítes completas, Fase 5 (revisor adversarial fresco), fechamento (este commit).

**Fase 2 pulada (motivo):** nenhuma mudança no motor nem em trava — leitura aditiva na posição (o livre é o cálculo da lista de lotes já
revisado na Fase 5 da 241, só movido para uma função compartilhada) e a tela. **Fase 5 mantida.**

## Fase 5 (um revisor adversarial fresco) — achados e o que foi feito

- **Achado 2 (baixo, reproduzido por sonda)** — reserva de **projeto** sem OS somada ao "sem OS": com 3 de um projeto e 2 sem destino, a janela
  dizia *"5 UN sem OS"*. **Corrigido** (`3f42ece3`): `reservas` ganha `projeto` (só sem OS) e a janela diz *"para o projeto Ponte"*.
  **Divergência do plano:** a RN-242.01 não previa o projeto.
- **Achado 1 (baixo, reproduzido)** — reserva de uma OS **excluída** (sem texto de OS) aparece como "sem OS": o `LEFT JOIN` perde o número.
  **Não corrigido, declarado** (**D (242)** 5): só se exclui OS sem pedido de compra, e o número some com ela.
- **Não reproduzidas (o livre bateu com o motor):** série com reserva, lote com reserva, negativo com caixa, bloqueado + inspeção + reservado;
  a rota de devolução não passa `reserva_id` nem troca a régua do motor; a folga (1e-9) é a mesma dos dois lados.
- **Incidente (registrado para não repetir):** a primeira `test:api` rodava em segundo plano enquanto a correção da Fase 5 e a sabotagem dela
  mexiam no `clienteEstoqueService.js`; a rodada foi **abortada** (processos mortos) e a suíte rodada de novo do zero sobre o código final.
- **A suíte inteira pegou o que o plano não previu:** `pdfsRemessaPosicaoFixture` confere que a fixture versionada do client
  (`client/src/utils/__fixtures__/posicaoCliente.rota.json`) tem as chaves da resposta real da posição — 634/635 na primeira rodada sobre
  `3f42ece3`. Regravada com `CRM_GRAVAR_FIXTURE=1` (`8e84fea8`; só a da posição — a da remessa mudava só número e data) e a suíte rodada de
  novo do zero. **Quem mexer na posição do cliente:** regrave essa fixture.

## Verificação (medida, serial, sobre o código final `8e84fea8`)

Servidor: `test:api` **635/635 arquivos OK (634 + posicaoClienteReservadoParaOs)**; `test:almoxarifado` **44/0**; `test:validation` **4/0**; `test:safealter` **3/0**;
`test:sqlite` **16/0**. Tela: `react-scripts test --maxWorkers=2` **236/236 suítes, 3174/3174 testes**; `react-scripts build` (CI=true)
**Compiled successfully**.

## Retro (4 números)

- Rodadas de correção até verde: **2** (Fase 5, achado 2; a fixture versionada da posição, pega pela suíte inteira).
- Achados: Fase 2 pulada (motivo acima); Fase 5 — 2 reproduzidos (1 corrigido, 1 declarado), 0 ruído.
- Paralelismo: nenhum galho em paralelo (a tela depende do campo novo); o revisor rodou enquanto as suítes rodavam.
- Defeito que escapou da 241: nenhum conhecido.

## Próxima tarefa detalhada

Item 2 da estimativa de 18/11 (`docs/estimativas/2026-11/estimativa_2026-11-18_cadastro-e-almoxarifado-semana.md`, 1h15): **a devolução para
Quarentena ou Sucata de peça com número de série registra o lote** — resto da **D (233)** 3; o detalhe completo está na "Próxima tarefa
detalhada" do plano da 236 (`2026-11-13-almoxarifado-etapa236-devolucao-cliente-seletor-de-lote.md`, `:130-152`). Módulo Almoxarifado,
**motor** (Fases 2 e 5 obrigatórias se mudar código).

- **O problema (a medir por sonda, Fase 0):** a régua `lotePelasSeries` (Etapas 233 a 235: séries de um lote só gravam esse lote; lotes
  diferentes são recusados; série de lote impedido não sai com o lote em branco) só vale para quem a declara — a v2 manual e a devolução ao
  cliente. A devolução ao estoque com destino **Quarentena** ou **Sucata** (`returnService.js:326-375`: ENTRADA_DEVOLUCAO, BLOQUEIO, SUCATA)
  não declara. Com material com série **sem** controle de lote e séries em dois lotes: o livro grava `lote_id` NULL? a linha "sem lote" fica
  negativa (`/materiais/:id/lotes/resumo`)? a série de lote BLOQUEADO passa? A sucata existe para tirar o reprovado — a régua do impedido
  pode não valer ali (`tiposDescarte`). **Sem buraco medido, fecha com o teste** (a estimativa já prevê).
- **Contrato que consome:** `registrarMovimentacao(db, user, mov, { lotePelasSeries: true })` (o ramo de `stockService.js:1379` deriva o
  lote só quando a linha do lote cobre a saída — B1531); nenhuma rota nova. `returnService.js:162` declara a série nesses destinos como
  limitação — reler antes.
- **Pontos de atenção:** as travas do CLAUDE.md (Quarentena e Sucata rodam as pernas sob `naTravaDoMaterial` desde a Etapa 97; a devolução
  para Estoque relê dentro da seção desde a 121 — molde `devolucaoDoQueVoltou.api.test.js` RN-09d); o estorno de cada perna deve voltar ao
  lote (molde `[RN-235.02]`); a régua "viva" da devolução (`devolucaoViva.js`); teste de corrida com gancho disparado do contexto do teste.
- **O que já está pronto e não reabre:** o livre do lote (241) e do material com as reservas por OS (esta etapa) — leitura, não muda motor.

