# 17 — Foto da avaria e do cupom

> **Status:** 🟢 **entregue na Etapa 5** (2026-10-23), na `main`, commits `786d1ec5` (plano) a `ab234a44` (verificação final), mais o
> fechamento — ver a lista abaixo. Fecha a limitação **D1** ("sem foto nem anexo") do [mapa](../README.md).
>
> **Plano (contratos, Ajustes da Fase 2, Fase 5, retro):**
> [`docs/superpowers/plans/2026-10-23-frotas-etapa5-fotos.md`](../../../docs/superpowers/plans/2026-10-23-frotas-etapa5-fotos.md)
> · **Apresentação:** [`docs/frotas/novidades-por-etapa.md`](../../../docs/frotas/novidades-por-etapa.md) (Etapa 5, B55–B60, C17–C18, D14–D15, E16–E18)
> · **Manual de quem usa:** [`docs/frotas/manual-do-sistema.md`](../../../docs/frotas/manual-do-sistema.md) (2.3, 2.8, 2.9, 3.4)

Pasta criada no fechamento da Etapa 5 (a feature não existia).

## O que é

O motorista marcava uma avaria ("lado esquerdo: amassado") sem poder mostrar, e o abastecimento entrava sem o cupom — o escritório
pedia a foto por fora. Agora, no portal, **Tirar foto** abre a câmera do celular na Saída, no Retorno, na Inspeção e no Abastecimento
(até 3 por lançamento); as fotos sobem depois que o lançamento é salvo; o motorista as vê (e reenvia ou remove) em **Meus registros**; o
gestor e o Consulta veem a miniatura nas listas **Checklist** e **Abastecimentos**. O arquivo só abre por um endereço assinado que vence
em 2 a 2,5 horas.

## Regras de negócio — checklist

| RN | Regra | Estado | Commit |
|---|---|---|---|
| RN-F5.01 | Até 3 fotos por registro/abastecimento; o teto (e o dono) conferidos no mesmo comando que grava | [x] | `ff003174` |
| RN-F5.02 | Só JPEG/PNG/WEBP, abaixo de 10 MB, pelo MIME **e** pelos primeiros bytes; extensão do MIME, nome aleatório | [x] | `ff003174` |
| RN-F5.03 | Envia quem registra (gestor, motorista); o motorista só no lançamento dele; Consulta 403 | [x] | `ff003174` |
| RN-F5.04 | Recusa não deixa arquivo no disco (403 antes do recebimento; o resto apaga) | [x] | `ff003174` |
| RN-F5.05 | Listas Checklist/Abastecimentos e Meus registros trazem `anexos` com URL assinada, no escopo de cada um | [x] | `ff003174`, `ed17bcd6` |
| RN-F5.06 | O arquivo só sai com assinatura válida do domínio próprio; toda falha 404; `nosniff` + CSP `sandbox` | [x] | `ff003174` |
| RN-F5.07 | Apagar a foto: mesma régua de quem envia; linha e arquivo | [x] | `ff003174`, `4cc57d79` (botão no Meus registros) |
| RN-F5.08 | Excluir o lançamento apaga as fotos — o lançamento primeiro, depois as fotos (sem órfão em corrida) | [x] | `ff003174`, `ed17bcd6` |
| RN-F5.09 | Portal: **Tirar foto** (câmera), até 3, prévia e Remover foto; reduz no navegador; sobe depois do 201; falha não desfaz | [x] | `4cc57d79` |
| RN-F5.10 | Meus registros: miniaturas, **+ Foto** e **Remover foto** | [x] | `4cc57d79` |
| RN-F5.11 | Gestor: coluna **Fotos** (1ª miniatura + "+N") em Checklist e Abastecimentos | [x] | `4cc57d79` |
| RN-F5.12 | Relatórios, painel e planilha não mudam | [x] | `ed17bcd6` (teste) |
| Integração | Portal → foto → Meus registros → gestor/Consulta → exclusão, pela rota e pelo serviço | [x] | `ed17bcd6` |
| Fase5-F | Enquanto as fotos sobem, **Remover foto** e **Voltar** ficam desligados (a foto removida no meio subia mesmo assim; Voltar recarregava a lista sem a foto) | [x] | `34de8111` |
| Verificação final | Caminho das fotos literal no `app.use` (réguas de fonte das Etapas 148–154) e a pasta nova no inventário de `/api/uploads` (RN-81.04) | [x] | `e755ce7e`, `ab234a44` |

Fase 5 (revisão adversarial, dois revisores frescos): ver a tabela "Fase 5" no plano — 2 achados reais na tela (corrigidos acima), 1
achado de informação no servidor mantido e declarado (E17), nenhum furo de segurança reproduzido contra o servidor real.

## O que ficou de fora (e por quê)

- **Remover foto na lista do gestor** (D14): o gestor não tem botão; apaga o lançamento inteiro ou pede ao motorista (o servidor já
  aceita o `DELETE` do gestor). Ficou fora para não mexer na tela genérica de cadastro nesta etapa.
- **Foto por avaria** (D15): as fotos são do registro, não de cada avaria marcada.
- **Foto na tela antiga "Novo Checklist" e no formulário de abastecimento do gestor**: só o portal envia (o gestor que quiser anexar usa
  o portal, se tiver vínculo).
- **Planilha com as fotos**: a exportação não leva imagem nem link (o link venceria em 2 horas).
