# Etapa 241 — o seletor de lote mostra o livre (C542)

> Item 7 da estimativa `docs/estimativas/2026-11/estimativa_2026-11-18_cadastro-e-almoxarifado-semana.md` (1h, fatia de tela + leitura).
> Ponto de partida: a "Próxima tarefa detalhada" do plano da 240 (`2026-11-18-almoxarifado-etapa240-origem-devolucao-cliente.md`).

## Fase 0 — o que foi medido

- `lotService.listarLotesDoMaterial` (`GET /api/almoxarifado/materiais/:id/lotes?com_saldo=1`) devolve `saldo` = soma das linhas do lote
  (o físico atribuído ao lote). Não sabe de reserva: a reserva **não tem lote** (C526, grande, fora).
- O motor (`registrarMovimentacao`, saída sem reserva citada) confere **primeiro** o livre do **material** — `livreDeCaixaSql`
  (disponível = físico − reservado − bloqueado − em inspeção − com terceiros, menos a caixa separada sem reserva; sem caixa, o disponível) —
  e só depois a linha do lote (`claimSaldoDoLote`). Com 3 no lote e 3 reservados para a OS: *"Saldo insuficiente. Disponível: 0 UN"*. Com
  `permite_saldo_negativo` o motor não confere o livre (sem caixa). A **transferência** não confere o livre (só a linha da prateleira).
- Logo, o máximo que sai de um lote numa saída avulsa é `min(saldo do lote, livre do material)` — é um número que o servidor **sabe**
  calcular; um "livre do lote" (qual parte da reserva é de qual lote) não.
- Seletores que leem a lista: devolução ao cliente (`MateriaisClienteAlmoxarifado.js`, `rotuloDoLote`), Movimentações
  (`MovimentacoesAlmoxarifado.js`, Saída/Perda/Transferência), Devoluções (`DevolucoesAlmoxarifado.js`), Sobras (`SobrasAlmoxarifado.js`).

## Regras (RN)

- **RN-241.01** — cada lote da lista `GET /materiais/:id/lotes` ganha `livre` = `max(0, min(saldo, livre do material))` e
  `livre_do_material` = `max(0, livre do material)`, com o livre do material na régua do motor (`livreDeCaixaSql`). Material com saldo
  negativo permitido: os dois `null` (o motor não limita). Aditivo: os quatro seletores continuam lendo `saldo`. *(Fase 5: o negativo é o
  efetivo — material ou global; com negativo **e** caixa, livre = físico − caixa em todo lote; o teto do lote é o das linhas positivas.)*
- **RN-241.02** — devolução ao cliente: o rótulo do lote acrescenta *" — livre {livre}"* quando o livre é menor que o saldo
  (`L1 — saldo 3 — livre 0`). Livre igual ao saldo ou `null`: o rótulo de antes.
- **RN-241.03** — com algum lote da lista com livre menor que o saldo, a janela explica (`#dev-lote-livre`): *"Livre é o que não está
  reservado nem retido no material (a reserva é do material, não do lote): de nenhum lote sai mais que o livre."*
- **RN-241.04** — com o lote escolhido, livre menor que o saldo e a quantidade acima do livre, aviso (`#dev-lote-livre-nao-cobre`):
  *"Do lote {codigo} estão livres só {livre}: devolva até {livre} ou libere a reserva do material."* e o Confirmar apagado (o servidor
  recusaria com *"Saldo insuficiente. Disponível: {n} UN"*).
- **RN-241.05** — Movimentações, Saída e Perda: o rótulo do lote acrescenta *" — livre {livre}"* quando o livre é menor que o saldo.
  Transferência não (o motor não confere o livre nela).
- **RN-241.06** — integração lista × rota: devolver ao cliente o `livre` do lote → 201; `livre + 1` → 400 *"Saldo insuficiente.
  Disponível: {livre} UN"*.

## Contratos (congelados)

- `GET /api/almoxarifado/materiais/:id/lotes` — cada linha ganha `livre: number|null` e `livre_do_material: number|null`. Nada mais muda.

## Tasks

- [x] **T1 (tronco, servidor)** — `6e3a496a` (+ Fase 5 `0989e7e3`) — `listarLotesDoMaterial` com `livre` e `livre_do_material`. Teste
  `loteLivreNoSeletor.api.test.js` (RN-241.01, .06; 7 → 12 cenários com a Fase 5). TDD: os 6 primeiros vermelhos antes (`undefined`);
  controle positivo: 4 sabotagens na T1 e 7 depois da Fase 5 (sem o min do saldo, só o flag do material, sem o piso 0, sem a caixa,
  negativo com caixa vira null, teto pela soma com a negativa, negativo com o teto do lote), cada uma vermelha no cenário certo; restauro
  por cópia com md5.
- [x] **T2 (galho, tela)** — `0cc2141d` — rótulo, frase e aviso na devolução ao cliente (RN-241.02 a .04); rótulo de Movimentações
  (RN-241.05). Testes `MateriaisClienteDevolucaoLoteLivre.test.js` (5) e o bloco da 241 em `LoteSeletor.test.js` (3). **Divergência:** a tela
  foi escrita antes dos testes (passaram de primeira); o controle positivo — 7 sabotagens (livre nunca abaixo, rótulo sem livre, Confirmar
  que não apaga, sem a frase, aviso que compara ao saldo, livre na Transferência, Movimentações sem livre) — derrubou cada uma no cenário certo.
- [x] **T3** — suítes completas, Fase 5, fechamento (este commit).

**Fase 2 pulada (motivo):** nenhuma mudança no motor nem em trava — um campo de leitura aditivo, calculado com a mesma expressão SQL que o
motor usa (`livreDeCaixaSql`), e a tela. **Fase 5 mantida** (um revisor adversarial fresco).

Pontos de atenção: a leitura é um retrato (a reserva pode mudar entre abrir a janela e confirmar — a recusa continua do servidor); Devoluções
e Sobras ficam com o rótulo de antes (decisão na letra B).

## Próxima tarefa detalhada

Item 8 da estimativa de 18/11 (`docs/estimativas/2026-11/estimativa_2026-11-18_cadastro-e-almoxarifado-semana.md`, 45 min): **o aviso de
material de cliente reservado para uma OS** (a **C541**), módulo Almoxarifado, fatia de tela.

- **O problema (C541):** o material de cliente que entra com OS fica reservado para ela (Etapa 176; a reserva nasce MANUAL com `os_id`,
  `os_referencia` e `recebimento_id` — predicado em `reservaDaOs.js`). Na janela **Devolver ao cliente** de material **sem** controle por
  lote nada avisa: o rótulo é *"Quantidade (saldo: 5 UN)"* (o físico) e o Confirmar responde *"Saldo insuficiente. Disponível: 0 UN"*. Com
  lote, desde esta etapa o seletor já mostra o livre (RN-241.02 a .04).
- **Contrato que ela consome:** `GET /api/almoxarifado/materiais-cliente/posicao?cliente_id=` — cada item já traz `saldo` (físico) e
  `saldo_disponivel` (`disponivelSql`, **sem** a caixa — diferente do `livre_do_material` desta etapa, que desconta a caixa). Medir antes de
  prometer: se o aviso só precisa de "há reservado", `saldo_disponivel < saldo` basta (sem campo novo); se precisa dizer **para qual OS**
  (*"3 UN reservadas para a OS 1234"*), é um campo novo na posição (a soma por `os_referencia` das reservas ATIVAS do material) — decidir e
  declarar na letra B. Para o material com lote, `livre_do_material` da lista de lotes já é a régua do motor.
- **Molde:** o aviso `#dev-loc-bloqueada` (Etapa 237) e o `#dev-lote-livre-nao-cobre` desta etapa (aviso + Confirmar apagado quando a
  quantidade passa do livre). Texto sugerido: *"⟨n⟩ UN deste material estão reservadas (para a OS ⟨número⟩): devolva até ⟨livre⟩ ou libere a
  reserva em Reservas."*
- **O que já está pronto e não reabre:** o livre por lote (esta etapa); o "Sai de" (240, o físico da prateleira — **D (240)** 3).
- **Pontos de atenção:** a régua tem de ser a do motor (`livreDeCaixaSql`, negativo efetivo — os três achados da Fase 5 desta etapa valem
  igual); não apagar o Confirmar com saldo negativo permitido (achado 1).

## Fase 5 (um revisor adversarial fresco) — achados e o que foi feito

- **Achado 1 (alto, reproduzido por sonda)** — com o saldo negativo ligado na configuração **global** (o material com 0), a lista dizia
  livre 0, a janela apagava o Confirmar e o motor aceitava a devolução (201): a RN-241.01 lia só o flag do material. **Corrigido**
  (`0989e7e3`): o efetivo (material ou `permite_saldo_negativo_global`), como o motor e a posição do cliente (Etapa 239).
- **Achado 2 (médio, reproduzido)** — material com negativo e **caixa** separada sem reserva: a lista dizia `null` (sem limite) e o motor
  recusava pela caixa (`livreParaSaida` = físico − caixa). **Corrigido:** com negativo e caixa, livre = físico − caixa, sem o teto do lote
  (com negativo o motor não confere a linha do lote — provado por PERDA de 2 de um lote com 1 → 201). **Divergência do plano:** a RN-241.01
  dizia "negativo → null (o motor não limita)" — estava incompleta.
- **Achado 3 (baixo, legado, reproduzido)** — lote com uma linha negativa antiga: `saldo` soma a negativa, o claim do lote lê só as positivas;
  o livre (teto pelo `saldo`) apagava o Confirmar de uma devolução aceita. **Corrigido:** o teto é a soma das linhas positivas (coluna
  interna, fora do contrato).
- **Achado 4 (testes)** — sem cenário de global, de caixa e de linha negativa: 5 cenários novos no servidor. A fixture da tela com
  `livre_do_material = livre`: **não reproduzido como falha** — fora do legado do achado 3, o livre menor que o saldo é sempre o
  `livre_do_material`, e no legado o livre é maior que o saldo (o rótulo não muda); a tela lê só `livre`, e a sabotagem que lê o do material
  não muda comportamento alcançável.
- **Não reproduzidas:** retenções (bloqueado, inspeção, terceiros) e arredondamento — os dois lados usam a mesma expressão; saída que cita
  reserva não é alcançável por essas telas; PERDA passa pela mesma guarda da SAÍDA.
- **Incidente (registrado para não repetir):** durante a correção, um comentário com crase dentro do SQL (template literal) quebrou o `lotService.js` por ~1 min enquanto a
  `test:api` rodava em segundo plano; a rodada foi **abortada** (processos mortos) e a suíte foi rodada de novo do zero sobre o código final.

## Verificação (medida, serial, sobre o código final `0989e7e3`)

Servidor: `test:api` **634/634 arquivos OK** (633 + `loteLivreNoSeletor`); `test:almoxarifado` **44/0**; `test:validation` **4/0**;
`test:safealter` **3/0**; `test:sqlite` **16/0**. Tela: `react-scripts test --maxWorkers=2` **235/235 suítes, 3162/3162 testes**;
`react-scripts build` (CI=true) **Compiled successfully**.

## Retro (4 números)

- Rodadas de correção até verde: **1** (Fase 5, achados 1 a 3 numa rodada).
- Achados: Fase 2 pulada (motivo acima); Fase 5 — 3 reproduzidos e corrigidos, 1 de teste (cenários acrescentados), 1 parte não
  reproduzida como falha (fixture da tela), 0 ruído.
- Paralelismo: nenhum galho em paralelo (a tela depende do campo novo); o revisor rodou enquanto a tela era escrita.
- Defeito que escapou da 240: nenhum conhecido.
