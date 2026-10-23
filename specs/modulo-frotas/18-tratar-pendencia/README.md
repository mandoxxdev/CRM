# 18 — Tratar a pendência do registro

> **Status:** 🟢 **entregue na Etapa 6** (2026-10-23), na `main`, commits `492a0d87` (plano + servidor) a `8fa7ece2` (Fase 5), mais o
> fechamento — ver a lista abaixo. Muda a regra do alerta de pendência da feature [13](../13-portal-do-motorista/README.md) (RN-F1.10:
> "por 7 dias" deixou de valer) e do painel (feature 09 no [mapa](../README.md)).
>
> **Plano (contratos, Ajustes da Fase 2, Fase 5, retro):**
> [`docs/superpowers/plans/2026-10-23-frotas-etapa6-tratar-pendencia.md`](../../../docs/superpowers/plans/2026-10-23-frotas-etapa6-tratar-pendencia.md)
> · **Apresentação:** [`docs/frotas/novidades-por-etapa.md`](../../../docs/frotas/novidades-por-etapa.md) (Etapa 6, A8, B61–B72, C19–C20, D16–D18, E20–E22)
> · **Manual de quem usa:** [`docs/frotas/manual-do-sistema.md`](../../../docs/frotas/manual-do-sistema.md) (1, 2.9, 3.3, 3.4, 3.5, 4)

Pasta criada no fechamento da Etapa 6 (a feature não existia).

## O que é

O motorista marca **Falha** num item ou uma avaria; o registro fica **PENDÊNCIA** e vira alerta no painel do gestor. Até a Etapa 5 não
havia onde dizer "consertado", e o alerta sumia sozinho em 7 dias, consertado ou não. Agora o gestor toca **Tratar pendência** (na lista
**Checklist Diário** ou no próprio alerta), descreve o que foi feito e, se quiser, liga a manutenção do conserto. O alerta sai do painel
na hora; a lista mostra **PENDÊNCIA · tratada** com quem, quando e o quê; o motorista vê em **Meus registros**; a planilha ganha três
colunas. A pendência que ninguém tratou **fica no painel**. **Desfazer tratamento** devolve o alerta.

## Regras de negócio — checklist

| RN | Regra | Estado | Commit |
|---|---|---|---|
| RN-F6.01 | 5 colunas novas em `frotas_checklists`; instante de Brasília `AAAA-MM-DDTHH:MM`; a situação gravada não muda | [x] | `492a0d87` |
| RN-F6.02 | Tratar: só o gestor; texto obrigatório (≤ 1000, invisíveis contam como vazio), manutenção opcional do mesmo veículo; "já tratada", "tem pendência" e "mesmo veículo" no `WHERE` da gravação; recusas na ordem do contrato | [x] | `492a0d87`, `8fa7ece2` (texto invisível) |
| RN-F6.03 | Desfazer: só o gestor; limpa as 5 colunas; o alerta volta | [x] | `492a0d87` |
| RN-F6.04 | Alerta só da pendência não tratada, de veículo ativo, **sem janela de 7 dias**; item com `placa`; no painel, a mais antiga primeiro | [x] | `492a0d87`, `8fa7ece2` (ordem) |
| RN-F6.05 | Leituras: lista (com a descrição da manutenção, `null` para o motorista), Meus registros, planilha com 3 colunas no fim | [x] | `492a0d87` |
| RN-F6.06 | Lista Checklist: **Tratar pendência** / **Desfazer tratamento** (só o gestor), etiqueta **PENDÊNCIA · tratada** e o texto | [x] | `0d8b6691`, `260cee25` (recarrega depois de 409/404; Desfazer um por vez) |
| RN-F6.07 | Painel: **Tratar pendência** no alerta (só o gestor), recarrega sem cache | [x] | `0d8b6691`, `260cee25` |
| RN-F6.08 | Meus registros: etiqueta e *"Tratada em …: …"* | [x] | `0d8b6691` |
| RN-F6.09 | Tratar e desfazer limpam o cache do painel nos dois lados, com **geração** (a contagem em andamento não grava o painel velho) | [x] | `492a0d87`, `0d8b6691` |
| Integração | Portal (falha + foto) → alerta/painel → tratar → some sem refresh → listas, Meus registros, planilha → desfazer, pela rota e pelo serviço | [x] | `7e1f7f2a` |

Fase 5 (dois revisores frescos, um contra o servidor real numa pasta vazia): nenhum furo de regra ou segurança; 4 achados reais de
comportamento corrigidos (`260cee25`, `8fa7ece2`) — ver a tabela "Fase 5" no plano.

## O que ficou de fora (e por quê)

- **Tratar cada falha separadamente** (D16): o tratamento é do registro inteiro — o caso comum é um conserto por saída.
- **Histórico de tratamentos** (D17, B67): fica só o último; desfazer apaga.
- **Avisar o motorista** (D18): ele vê ao abrir Meus registros; não há notificação.
- **Registros de antes do portal** (B66): sem a situação nova, sem botão — nunca geraram o alerta; o banco não tem nenhum.
- **Tratar em lote** as pendências antigas do primeiro dia (consulta A8): uma por uma; o módulo não foi usado, então o esperado é zero.
