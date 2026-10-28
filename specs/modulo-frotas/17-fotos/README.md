# 17 — Foto da avaria e do cupom

> **Status:** 🟢 **entregue na Etapa 5** (2026-10-23), na `main`, commits `786d1ec5` (plano) a `ab234a44` (verificação final), mais o
> fechamento — ver a lista abaixo. Fecha a limitação **D1** ("sem foto nem anexo") do [mapa](../README.md).
> **Etapa 7 (pequena, 2026-10-28, `7bfcec6e`):** o gestor remove uma foto pela lista (fecha o **D14**, que esta spec listava em "ficou
> de fora") — plano [`2026-10-28-frotas-etapa7-remover-foto-pela-lista.md`](../../../docs/superpowers/plans/2026-10-28-frotas-etapa7-remover-foto-pela-lista.md),
> apresentação em [`novidades-por-etapa.md`](../../../docs/frotas/novidades-por-etapa.md) (Etapa 7, B73–B75, C21, D14, E23–E24).
>
> **Plano (contratos, Ajustes da Fase 2, Fase 5, retro):**
> [`docs/superpowers/plans/2026-10-23-frotas-etapa5-fotos.md`](../../../docs/superpowers/plans/2026-10-23-frotas-etapa5-fotos.md)
> · **Apresentação:** [`docs/frotas/novidades-por-etapa.md`](../../../docs/frotas/novidades-por-etapa.md) (Etapa 5, B55–B60, C17–C18, D14–D15, E16–E18)
> · **Manual de quem usa:** [`docs/frotas/manual-do-sistema.md`](../../../docs/frotas/manual-do-sistema.md) (2.3, 2.8, 2.9, 3.4)

Pasta criada no fechamento da Etapa 5 (a feature não existia).

## O que é

O motorista marcava uma avaria ("lado esquerdo: amassado") sem poder mostrar, e o abastecimento entrava sem o cupom — o escritório
pedia a foto por fora. Agora, no portal, **Tirar foto** abre a câmera do celular na Saída, no Retorno e na Inspeção (até 3 por
lançamento) — *dizia "e no Abastecimento"; a Etapa 8 (feature 20) tirou o campo do abastecimento a pedido da empresa; o servidor e a
coluna Fotos do gestor em Abastecimentos ficaram para o legado (B77)*; as fotos sobem depois que o lançamento é salvo; o motorista as vê (e reenvia ou remove) em **Meus registros**; o
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
| RN-F5.09 | Portal: **Tirar foto** (câmera), até 3, prévia e Remover foto; reduz no navegador; sobe depois do 201; falha não desfaz. **Desde a Etapa 8 vale só para Saída/Retorno/Inspeção** — o Abastecimento perdeu o campo (feature [20](../20-abastecimento-sem-foto/README.md), RN-F8.12) | [x] | `4cc57d79`; Etapa 8 `ef71a1b6` |
| RN-F5.10 | Meus registros: miniaturas, **+ Foto** e **Remover foto**. **Desde a Etapa 8 o abastecimento não tem + Foto** (miniaturas antigas e Remover foto ficam — RN-F8.13) | [x] | `4cc57d79`; Etapa 8 `ef71a1b6` |
| RN-F5.11 | Gestor: coluna **Fotos** (1ª miniatura + "+N") em Checklist e Abastecimentos | [x] | `4cc57d79` |
| RN-F5.12 | Relatórios, painel e planilha não mudam | [x] | `ed17bcd6` (teste) |
| Integração | Portal → foto → Meus registros → gestor/Consulta → exclusão, pela rota e pelo serviço | [x] | `ed17bcd6` |
| Fase5-F | Enquanto as fotos sobem, **Remover foto** e **Voltar** ficam desligados (a foto removida no meio subia mesmo assim; Voltar recarregava a lista sem a foto) | [x] | `34de8111` |
| Verificação final | Caminho das fotos literal no `app.use` (réguas de fonte das Etapas 148–154) e a pasta nova no inventário de `/api/uploads` (RN-81.04) | [x] | `e755ce7e`, `ab234a44` |

Fase 5 (revisão adversarial, dois revisores frescos): ver a tabela "Fase 5" no plano — 2 achados reais na tela (corrigidos acima), 1
achado de informação no servidor mantido e declarado (E17), nenhum furo de segurança reproduzido contra o servidor real.

## Etapa 7 — o gestor remove uma foto pela lista (D14) — checklist

Só tela; o servidor não muda (`DELETE /api/frotas/anexos/:id` já aceitava o gestor, RN-F5.07). Contrato e os "Ajustes da Fase 2" no plano.

| RN | Regra | Estado | Commit |
|---|---|---|---|
| RN-F7.01 | Coluna **Fotos** (Checklist e Abastecimentos): linha com foto mostra ao **gestor** o botão **Remover foto**; sem foto, `-` | [x] | `7bfcec6e` |
| RN-F7.02 | Consulta e Motorista não veem o botão (a coluna fica como antes; o perfil vem da página genérica, `ehGestor` no contexto do `render`) | [x] | `7bfcec6e` |
| RN-F7.03 | Janela **Fotos de <placa>** (`role="dialog"`) com **todas** as fotos, **Remover foto** em cada e **Fechar**; a lista segue com uma miniatura só (B58) | [x] | `7bfcec6e` |
| RN-F7.04 | `Remover esta foto?` → Cancelar não chama o servidor; Fechar sem mexer não recarrega | [x] | `7bfcec6e` |
| RN-F7.05 | Confirmou → `DELETE` → `Foto removida` → a janela tira a foto da **cópia local** (3 → 2) sem recarregar; **Fechar** recarrega a lista | [x] | `7bfcec6e` |
| RN-F7.06 | Removida a última, a janela fecha sozinha, a lista recarrega e a célula volta a `-` | [x] | `7bfcec6e` |
| RN-F7.07 | Falha: toast com a mensagem do servidor (ou `MSG_FALHA_REMOVER`); **404** tira a foto da janela mesmo assim; **403** fecha e recarrega; outro erro só avisa | [x] | `7bfcec6e` |
| RN-F7.08 | Nada muda no portal, servidor, relatórios, painel e planilha (`test:api` 557/557 sem tocar em `server/`) | [x] | `7bfcec6e` |
| Controle positivo | 8 sabotagens (perfil sempre gestor, gate sem perfil, cópia sem "mudou", Fechar sempre recarrega, 404 não tira, sem fechar na última, `onRemovida` sem id, título sem placa) — cada uma derrubou a asserção que a nomeia | [x] | — |

## O que ficou de fora (e por quê)

- **Remover foto na lista do gestor** (D14): *dizia "o gestor não tem botão; apaga o lançamento inteiro ou pede ao motorista … ficou fora
  para não mexer na tela genérica de cadastro"* — **deixou de ser verdade na Etapa 7** (acima). O que continua fora: saber **quem**
  removeu (sem trilha) e remover pela janela de edição do lançamento (só pela coluna **Fotos**).
- **Foto por avaria** (D15): as fotos são do registro, não de cada avaria marcada.
- **Foto na tela antiga "Novo Checklist" e no formulário de abastecimento do gestor**: só o portal envia (o gestor que quiser anexar usa
  o portal, se tiver vínculo).
- **Planilha com as fotos**: a exportação não leva imagem nem link (o link venceria em 2 horas).
