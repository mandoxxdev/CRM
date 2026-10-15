# Etapa 106 — o estorno do ajuste de material de cliente exige a permissão do ajuste (C211) — design

> Origem: "Próxima tarefa detalhada — Etapa 106" no fim de
> `docs/superpowers/plans/2026-10-15-almoxarifado-etapa104-ajuste-endereco-avisa-caixa.md`; C211 (achado da Fase 5 da 104).
> Plano: `docs/superpowers/plans/2026-10-15-almoxarifado-etapa106-estorno-ajuste-cliente.md`.
> Features: 13 (materiais de clientes) e 23 (perfis, segurança e auditoria).

## O problema, em linguagem de galpão

Material de cliente é material de outra empresa guardado aqui: o número dele é o que o cliente confere e cobra. Por
isso, desde a Etapa 8 (decisão 7), **ajustar** o saldo de material de cliente é coisa só do Administrador — nem o Gestor,
que ajusta o nosso, ajusta o do cliente. Mas o **estorno** (a seta curva no livro de Movimentações) só pede a permissão de
"ajustar estoque", que o Gestor tem, e não olha de quem é o material. Então o Gestor desfazia o ajuste que o
Administrador fez — e o número do cliente voltava ao de antes, sem a permissão que a regra exige para mexer nele.

## Fase 0 — medido (2026-10-15)

Sonda `server/tests/sonda/e106fase0.js` (não versionada), pela rota real (`requirePermission` real, perfis explícitos).
Material de cliente com ENTRADA 10 numa prateleira; o Administrador (superadmin) lança cada movimento; outro perfil estorna.

| # | Movimento do Administrador | Quem estorna | Resposta | Total depois |
|---|---|---|---|---|
| P1 | AJUSTE sem localização 10→4 | Gestor | **200** | 10 (o saldo do cliente voltou) |
| P2 | AJUSTE com localização 10→4 | Gestor | **200** | 10 |
| P2b | AJUSTE com localização 10→15 (sobe) | Gestor | **200** | 10 |
| P1/P2/P2b | os mesmos | Almoxarife | 403 *"Sem permissão para esta operação"* (gate `ajustar_estoque`) | intacto |
| P1/P2/P2b | os mesmos | Administrador (perfil) e superadmin | 200 | 10 |
| P3 | AJUSTE de material **nosso** | Gestor | 200 (certo: o Gestor ajusta o nosso) | 10 |
| P9 | **AJUSTE_POSITIVO** +2 / **AJUSTE_NEGATIVO** −2 (aceitos pela v2) | Gestor | **200** / **200** | 10 / 10 |
| P4 | ENTRADA de cliente (com documento) | Gestor | 200 | 0 |
| P5 | SAIDA com OS do dono | Gestor | 200 | 10 (volta ao estoque) |
| P6 | DEVOLUCAO_CLIENTE | Gestor | 200 | 10 (volta ao estoque) |
| P7 | TRANSFERENCIA | Gestor | 200 | 10 (o total não muda) |
| P9 | PERDA (com OS do dono) / SUCATA comum (pelo serviço) | Gestor | 200 / 200 | 10 / 10 |
| P10 | estorno do AJUSTE pelo Administrador | — | 200; auditoria nova só `movimentacao`/`CANCELAMENTO` — nenhuma `material_cliente` | 10 |

Outras medições:

- **Uma porta só.** `UPDATE movimentacoes_almoxarifado SET cancelado = 1` existe só em `stockService.cancelarMovimentacao`;
  a única rota é `POST /api/almoxarifado/movimentacoes/:id/cancelar` (gate `ajustar_estoque`). Chamadores internos:
  `scrapService.compensarRetalho` (ENTRADA_RETALHO com `compensacao: true` e a baixa da origem) e
  `thirdPartyService.compensarTransformacao` (RETORNO_TRANSFORMACAO com `compensacao: true` e o CONSUMO_TERCEIRO). **Nenhum
  estorna tipo da família do ajuste** — a guarda nova não os alcança.
- `AJUSTE_INVENTARIO` não é estornável por ninguém (RN-10 da Etapa 10, 400 dentro do `try`, depois do claim, que o `catch`
  desfaz).
- `ownerRules.assertAjustePermitido` **audita** (`material_cliente`/`AJUSTE`, com `params.quantidade`) **antes** do efeito
  — chamá-la no estorno gravaria uma auditoria de "ajuste" com a quantidade errada (o estorno não tem quantidade digitada)
  e antes de saber se o estorno conclui.
- A tela do livro (`MovimentacoesAlmoxarifado.confirmarEstorno`) já mostra `err.response.data.error` no `toast.error` —
  decisão antiga "mostrar a mensagem do servidor em vez de esconder o botão por perfil". O 403 novo aparece sem mudar a tela.
- **O aviso da caixa da Etapa 104 (A1)** manda *"estorne o ajuste que baixou o estoque (perfil Administrador ou Gestor do
  almoxarifado)"*. Com a correção, para material de cliente o Gestor **não** estorna: a frase ficaria errada justo no
  último gesto que ela ensina. Achado do traçado da RN até o fim (Fase 0), entra na etapa.

## Decisão de desenho

1. **A guarda vive no motor**, em `cancelarMovimentacao`, logo depois de ler o material e **antes de qualquer efeito**
   (antes da guarda da inspeção, da série, da liberação de reserva e do claim). Mesmo motivo da Etapa 8: a regra é do
   material, não da rota; e uma futura porta de estorno herda a guarda.
2. **Função nova em `ownerRules`**, `assertEstornoDeAjustePermitido(db, material, tipo, user)`: só material com
   `proprietario_cliente_id`, só os tipos que o estorno **reverte** da família do ajuste (`AJUSTE`, `AJUSTE_POSITIVO`,
   `AJUSTE_NEGATIVO`; `AJUSTE_INVENTARIO` fica de fora porque ninguém o estorna — a recusa dele continua a de sempre para
   todos). Sem permissão → 403 com literal própria no molde da do ajuste. Devolve o nome do dono para a auditoria.
3. **Auditoria nomeando o cliente, depois que o estorno conclui** (`material_cliente`/`ESTORNO_AJUSTE`), ao lado da
   `CANCELAMENTO` de sempre. Diferente do ajuste, que audita a **tentativa** antes do efeito: no estorno o livro já tem a
   linha `ESTORNO` e a `CANCELAMENTO`; o que faltava era o dono nomeado, e uma linha de estorno que não aconteceu (recusa
   pela caixa, saldo consumido) seria só ruído.
4. **Compensação interna isenta** (`opcoesEstorno.compensacao === true`) — inalcançável hoje (nenhuma compensação estorna
   ajuste), declarado: compensar o próprio evento que falhou nunca pode parar em permissão.
5. **O aviso A1** troca o parêntese para *"(perfil Administrador do almoxarifado)"* quando o material é de cliente; o resto
   da frase, byte a byte.
6. **Sem tela nova.** O 403 aparece pelo `toast.error` que já existe; um teste de tela prende isso.

**Descartados:**
- Mudar o gate da rota de `ajustar_estoque` para `ajustar_material_cliente` — o Gestor perderia o estorno de **todo**
  material, inclusive o nosso.
- Chamar `assertAjustePermitido` no estorno — auditaria como `AJUSTE`, com quantidade que não existe, antes do efeito.
- Estender a guarda ao estorno de ENTRADA/SAIDA/DEVOLUCAO_CLIENTE/PERDA/SUCATA de cliente — **medido** (P4–P9): são
  desfazer de lançamento documentado que **não** exigiu a permissão especial; a decisão 7 é sobre **ajustar**. O estorno de
  entrada de cliente pelo Gestor zera o que entrou (P4) — registrado como decisão (B708) com a alternativa de uma linha.
- Esconder o botão de estorno por perfil na tela — contraria a decisão antiga (mensagem do servidor); `minhas-permissoes`
  não diz de quem é o material de cada linha.
