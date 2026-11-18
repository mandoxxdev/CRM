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

- **RN-242.01** — cada item da posição ganha `livre: number|null` (a régua do motor: o mesmo número que `livre_do_material` da lista de lotes —
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

- `GET /api/almoxarifado/materiais-cliente/posicao?cliente_id=` — cada item ganha `livre` e `reservas`. Nada mais muda.

## Tasks

- [ ] **T1 (tronco, servidor)** — `livreDoMaterialParaSaida` extraído da lista de lotes e usado na posição; `reservas`. Teste
  `posicaoClienteReservadoParaOs.api.test.js` (RN-242.01, .05) escrito antes; controle positivo por sabotagem.
- [ ] **T2 (galho, tela)** — rótulo, `#dev-reservado`, `#dev-livre-nao-cobre` (RN-242.02 a .04). Teste
  `MateriaisClienteDevolucaoReservado.test.js` escrito antes; controle positivo.
- [ ] **T3** — suítes completas, Fase 5 (revisor adversarial fresco), fechamento.

**Fase 2 pulada (motivo):** nenhuma mudança no motor nem em trava — leitura aditiva na posição (o livre é o cálculo da lista de lotes já
revisado na Fase 5 da 241, só movido para uma função compartilhada) e a tela. **Fase 5 mantida.**
