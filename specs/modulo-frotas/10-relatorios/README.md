# 10 — Relatórios (custo por veículo, consumo, planilha)

> **Status:** 🟢 **fechada na Etapa 4** (2026-10-23), na `main`, commits `99658314` (plano) a `bcb498a0` (Fase 5), mais o fechamento — ver a lista abaixo. Fecha o
> achado **A7** (multas fora do período no custo por veículo) do [mapa](../README.md) e as limitações **D3** (planilha sem multas),
> **D9** (consumo da máquina, na parte do relatório) e **D11** (custo por veículo só com o km).
>
> **Plano (contratos, Ajustes da Fase 2, Fase 5, retro):**
> [`docs/superpowers/plans/2026-10-23-frotas-etapa4-relatorios.md`](../../../docs/superpowers/plans/2026-10-23-frotas-etapa4-relatorios.md)
> · **Apresentação:** [`docs/frotas/novidades-por-etapa.md`](../../../docs/frotas/novidades-por-etapa.md) (Etapa 4, A6–A7, B45–B54, D12–D13, E14–E15)
> · **Manual de quem usa:** [`docs/frotas/manual-do-sistema.md`](../../../docs/frotas/manual-do-sistema.md) (3.3–3.7)

Esta pasta não existia: até a Etapa 3 a feature 10 vivia só numa linha do mapa. Criada no fechamento da Etapa 4.

## O que é

**Frota → Relatórios** é o que o escritório olha no fim do mês: quanto cada veículo custou (manutenção, combustível, multas) e quanto
cada um consome, com **Exportar planilha** no mesmo período. Até a Etapa 3 o custo de outubro somava as multas de todos os anos, a
empilhadeira (que abastece em horas) sumia do consumo, o período com uma data só valia na planilha e não na tela, e a planilha não
tinha multas.

## Regras de negócio — checklist

| RN | Regra | Estado | Commit |
|---|---|---|---|
| RN-F4.01 | Multas no período pela data da infração; sem ela, pelo dia de Brasília do lançamento | [x] | `e841b13a` |
| RN-F4.02 | Multa contestada não soma no custo (a mesma régua do painel, só nisso) | [x] | `e841b13a` |
| RN-F4.03 | Período com uma data só, nos dois relatórios e na planilha | [x] | `e841b13a` |
| RN-F4.04 | Custo por veículo com `tipo_medicao` e `horimetro_atual`; coluna KM / Horímetro na tela | [x] | `e841b13a`, `0365e198` |
| RN-F4.05 | Litros por hora pelo anterior em horas, calculado na leitura (editar/excluir refaz o vizinho) | [x] | `e841b13a` |
| RN-F4.06 | Linha com km e horímetro tem km/L e L/h | [x] | `e841b13a` |
| RN-F4.07 | Consumo: uma linha por veículo com abastecimento no período, médias km/L e L/h, totais de todas as linhas, por placa | [x] | `e841b13a` |
| RN-F4.08 | O L/h não depende do filtro (período, busca, escopo do motorista) | [x] | `e841b13a` |
| RN-F4.09 | Lista de Abastecimentos com `horas_desde_anterior`/`consumo_litros_hora`; coluna Km/L mostra o L/h | [x] | `e841b13a`, `0365e198` |
| RN-F4.10 | Planilha: aba Multas no fim, pelo período da RN-F4.01 | [x] | `e841b13a` |
| RN-F4.11 | Planilha: Horas desde Abastec. Anterior e Consumo L/h no fim da aba Abastecimentos | [x] | `e841b13a` |
| RN-F4.12 | Tela: período com o que estiver preenchido nas duas tabelas, período aplicado, Total, Km/L e L/h, erro vira aviso | [x] | `0365e198` |
| RN-F4.13 | Perfis: nada muda (gestor e Consulta; motorista 403) | [x] | `e841b13a` (teste) |
| RN-F4.14 | (Fase 2) Os dois relatórios contam só veículos ativos; tela e planilha reconciliam no mesmo período | [x] | `e841b13a`, `8cbed9d4` |
| Integração | Portal + gestor → relatórios, lista e planilha batem, pela rota e pelo serviço | [x] | `8cbed9d4` |
| Fase5-R1 | Status de multa só pendente/pago/contestado (400 `Status de pagamento inválido`): "Contestado" maiúsculo somava no custo e a planilha o tirava | [x] | `bcb498a0` |
| Fase5-R2 | Litros zero/negativos/não numéricos no POST e no PUT do gestor → 400 `Informe os litros` (os totais do consumo somavam −10) | [x] | `bcb498a0` |
| Fase5 testes | L/h nulo com litros 0 sem asserção (servidor); 5 sabotagens da tela que passavam (carga velha, Total litros/gasto, célula de custo, aviso único, Abastecimentos) | [x] | `bcb498a0`, `ff3573a9` |

## Spec que estava errada

- O mapa dizia, na feature 10, *"Falta para 🟢: multas filtrarem pelo período (A7), a máquina no relatório e a aba de multas"* — **deixou
  de ser verdade** nesta etapa. O manual dizia *"multas somam tudo"* no relatório — reescrito.
- O plano da Etapa 4, na Fase 0, dizia que **nenhum teste lia o conteúdo** da planilha; **estava errado**: `frotasExportacao` travava as
  6 abas e o cabeçalho de Abastecimentos (Fase 2, T-2). Ajustado com o motivo (aba e colunas no fim).
- O plano da Etapa 3 sugeria que a linha com km e horímetro seguisse **a régua da medição do veículo**; **não foi feito, por decisão**
  (B48): a linha mostra os dois consumos, como o km/L sempre olhou só o km.
- O relatório de consumo dizia "Total litros / Total gasto / Abastecimentos" mas contava **só as linhas com km/L** (o primeiro
  abastecimento sumia). Agora conta todas (B47).

## O que ficou de fora, e por quê

- **Alerta de consumo baixo da máquina** (D12): o cadastro não tem "consumo esperado em L/h".
- **Consumo em "Meus registros"** do motorista (D13): a tela dele não mostra consumo.
- **Recusar período fora do formato** (E15): a tela só manda datas do calendário.
- **Multas com status torto já gravadas** e **litros ≤ 0 já gravados**: o sistema recusa daqui em diante; os antigos ficam (consultas
  **A6** e **A7** antes do deploy).
