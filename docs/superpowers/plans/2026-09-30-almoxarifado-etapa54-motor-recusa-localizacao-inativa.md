# Etapa 54 — o motor recusa o endereço informado inativo ou inexistente

> Status: **Fase 3 (T1) implementada, verificação completa em andamento** — Fase 0-2 feitas.
> Origem: C73 (aberto na Etapa 53) — o motor aceitava ENTRADA/TRANSFERENCIA com destino
> **inativo** (o saldo some do mapa, que filtra `ativo = 1`) e com destino **inexistente** (linha de
> saldo órfã, que nenhuma tela mostra).

## Fase 0 — o que foi medido no código (2026-09-30)

- `validarLocalizacaoParaMovimento` (stockService) faz `if (!loc) return;` — inexistente passa.
- `motivoRecusaEndereco` só olha `bloqueada` e `tipos_material_permitidos`; **não** olha `ativo`.
- Chamadores do motor que passam destino: `receiptService` (pré-validação da nota + entrada),
  `returnService` (devolução, destino escolhido pelo usuário, com compensação da linha),
  `scrapService` (retalho, destino escolhido pelo usuário — perna 2, depois da baixa).
- `cancelarMovimentacao` (estorno) **não** valida endereço, por decisão da Etapa 2. Mantido.
- ~~A padrão pode apontar para localização **apagada**~~ — **estava errado** (achado 10 da
  Fase 2): o DELETE de localização é *soft* (`ativo = 0`), não há DELETE físico no código. Id
  inexistente na padrão só vem de integração ou legado. O que existe de verdade é a padrão
  **inativa**: desativar uma localização vazia que é padrão de material zerado era aceito.
- O mapa filtra `ativo = 1`; a régua de inativa aqui é `Number(ativo) !== 1` (a mesma do mapa, do
  `GET /localizacoes`, da guarda do PUT e da sugestão — NULL conta como inativa em todas).

## Fase 2 — revisão do plano (agente fresco): o desenho mudou

A 1ª versão deste plano recusava também a **padrão** inativa na entrada sem destino. O revisor
achou 2 críticos: recebimento (`/processar` não tem campo de destino — a nota inteira travaria),
retorno de terceiros e exclusão de requisição (esta, pior: item 1 já devolvido, item 2 recusado,
retry devolve o 1 de novo) **caem na padrão sem o usuário poder escolher**. E desativar uma
localização vazia que é padrão de material zerado era aceito — armava a armadilha em silêncio.

**Decisão (reversível, letra B):** o motor recusa só o endereço **informado**; a padrão inativa é
impedida **na origem** — não se desativa localização que é padrão de material ativo (RN-04) e o
cadastro não aceita padrão inativa/inexistente (RN-05). A entrada sem destino que cai numa padrão
inativa **de legado** continua aceita (a letra A mede quantas existem). Descartados: recusar a
padrão no motor (trava fluxos sem campo de destino); mandar para "sem localização" quando a padrão
é inativa (mexe na resolução de endereço de todos os fluxos e no fallback do mapa — escopo maior);
limpar a padrão dos materiais ao desativar (muda cadastro sem o dono saber).

Outros achados incorporados: AJUSTE que **sobe** saldo em inativa reabria o C73 (RN-03 virou
"só reduz ou zera"); `AJUSTE_POSITIVO` é da família de entrada (RN-01 o cobre, testado); o retalho
recusava o destino só na perna 2, depois da baixa (pré-validação antes da perna 1); a pré-validação
do recebimento não distinguia explícito de padrão (chamada explícita adicionada).

## Regras de negócio

- **RN-01** — Destino **informado** inativo é recusado em toda a família de ENTRADA
  (`TIPOS_ENTRADA`, inclusive `AJUSTE_POSITIVO`) e no destino da TRANSFERENCIA:
  400 `Localização {codigo} está inativa`.
- **RN-02** — Localização **informada** inexistente é recusada em qualquer papel e tipo:
  400 `Localização de destino não encontrada` / `Localização de origem não encontrada`.
- **RN-03** — AJUSTE / AJUSTE_INVENTARIO numa localização **inativa** só reduz ou zera:
  400 `Localização {codigo} está inativa — o ajuste só pode reduzir ou zerar o saldo dela`.
- **RN-04** — **Origem inativa é aceita** (SAIDA, TRANSFERENCIA): é o jeito de esvaziar endereço
  desativado. E a rota: `PUT` que desativa e `DELETE` de localização **ativa** que é padrão de
  material **ativo** → 400 `Localização é a padrão de {N} material(is) ativo(s) ({até 5 códigos}[, …]). Troque a localização padrão deles antes de apagar ou desativar.`
- **RN-05** — Cadastro de material (POST sempre; PUT **só quando a padrão muda**):
  400 `Localização padrão não encontrada` / `Localização padrão {codigo} está inativa`.
- **RN-06** — Estorno continua sem validação de endereço (decisão da Etapa 2).
- **RN-07** — Entrada **sem destino** com padrão inativa de legado: aceita (decisão acima). A tela
  de Movimentações já avisa (`aviso-padrao-inativa`, Etapa 53).

## Tasks

- [x] **T1 (tronco)** — `validarEnderecoExplicito` + `materiaisComPadrao` no stockService, chamadas
  no bloco de validação do motor, RN-03 no ramo do AJUSTE; guarda RN-04 no PUT/DELETE de
  localização; `validarLocalizacaoPadrao` no materialService (POST) e no PUT de material;
  pré-validação explícita no recebimento e no retalho. Testes:
  `server/tests/api/localizacaoInativaMotor.api.test.js` 13/13, 19 sabotagens vermelhas no cenário
  certo (hash no commit da etapa).
- [x] **T2** — fixture do `sugestaoLocalizacao` (INAT recebia saldo já inativa): semeada ativa e
  desativada depois — 15/15.
- [ ] **T3** — verificação completa, Fase 5 (revisão adversarial), fechamento.

## Pontos de atenção / não coberto

- **Almoxarifado inativo** não é recusado pelo motor (só a sugestão o evita) — letra D.
- Reativar um material cuja padrão está inativa não é barrado — letra D.
- O `PUT /localizacoes/:id` sem `ativo` no body grava `ativo = 1` (full-replace): editar uma
  localização inativa pela API sem mandar `ativo` a **reativa**. Pré-existente, medido nesta
  etapa, fora do escopo — letra C.
