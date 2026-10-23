# 15 — Perfil do Frota pela tela (Consulta / Motorista)

> **Status:** 🟢 **entregue na Etapa 2** (2026-10-23), na `main`, commits `3aa4e088` (plano) a `805aaa3c` — ver a lista abaixo.
> Fecha a feature 11 (Perfis e permissões) do [mapa](../README.md): o administrador da frota dá **Consulta** ou **Motorista** a cada
> usuário por **Frota → Perfis de acesso**, e o perfil vale no próximo pedido daquele usuário.
>
> **Plano (contratos, Ajustes da Fase 2, Fase 5, retro):**
> [`docs/superpowers/plans/2026-10-23-frotas-etapa2-perfis-pela-tela.md`](../../../docs/superpowers/plans/2026-10-23-frotas-etapa2-perfis-pela-tela.md)
> · **Apresentação:** [`docs/frotas/novidades-por-etapa.md`](../../../docs/frotas/novidades-por-etapa.md) (Etapa 2, B25–B30, C9–C11)
> · **Manual de quem usa:** [`docs/frotas/manual-do-sistema.md`](../../../docs/frotas/manual-do-sistema.md) (seção 1 e 3.8)

## O que é

Até aqui o único perfil do Frota que a tela sabia dar era **Administrador de Frota** (checkbox "administra o módulo" no cadastro de
usuário). Todo o resto com acesso ao módulo caía no padrão **Motorista**: quem só acompanha a frota perdia o painel e o relatório (C2), e
a saída era SQL ou dar administrador. Agora: tela `/frota/perfis` (API `GET/PUT /api/frotas/perfis-usuario`, perfil `configurar`).

## Regras de negócio — checklist

| RN | Regra | Estado | Commit |
|---|---|---|---|
| RN-F2.01 | `GET` lista ativos e não ocultos, por nome, com explícito/efetivo/origem/motorista ligado; só `configurar` | [x] | `30ec5df3` |
| RN-F2.02 | Régua única `classificarPerfilFrota` (chama `getPerfilFromUser`): forçado / explícito / padrão; tela × servidor conferidos usuário a usuário pelo login real | [x] | `30ec5df3`, `6fd592c5` |
| RN-F2.03 | `PUT` CONSULTA/MOTORISTA grava; `null`/`''` volta ao padrão; o resto → 400 `Perfil inválido. Use CONSULTA, MOTORISTA ou vazio para voltar ao padrão.` | [x] | `30ec5df3` |
| RN-F2.04 | Forçado (superadmin, role `admin`, admin do módulo) → 409 `PERFIL_FORCADO` | [x] | `30ec5df3` |
| RN-F2.05 | Inexistente, desativado, id torto → 404 `Usuário não encontrado` | [x] | `30ec5df3` |
| RN-F2.06 | Ida e volta: gravar CONSULTA muda o próximo pedido (`/dashboard` 403→200, portal recusa gravar); `null` devolve o 403 — pela rota e pelo serviço | [x] | `6fd592c5` |
| RN-F2.07 | Linha `ADMIN_FROTA` sobrando ou valor fora da lista aparece crua; o `PUT` troca | [x] | `30ec5df3` (tela `02a7aee3`) |
| RN-F2.08 | `/usuarios-vinculaveis` traz `perfil_frota` (aditivo) | [x] | `30ec5df3` |
| RN-F2.09 | Aviso no cadastro do motorista quando o usuário escolhido está como Consulta | [x] | `02a7aee3` |
| RN-F2.10 | "Perfis de acesso" só no menu do ADMIN_FROTA | [x] | `02a7aee3` |
| RN-F2.11 | Lista negativa (CONSULTA não grava no portal, não aprova, não abre perfis; MOTORISTA não abre perfis), provada por concessão | [x] | `30ec5df3` |
| RN-F2.12 | (C7) MOTORISTA em `GET /documentos` → lista vazia | [x] | `30ec5df3` |
| RN-F2.13 | (Fase 2) `PUT` no próprio usuário → 409 `PROPRIO_PERFIL` | [x] | `30ec5df3` |
| RN-F2.14 | (Fase 2, T-1) CONSULTA nas telas de cadastro: só leitura (sem Novo/Editar/Aprovar/Excluir) | [x] | `02a7aee3` |
| Fase5-1 | Perfil com valor fora da lista lia as listas de todos (CPF/CNH, documentos): escopo agora é **fechado** — só ADMIN_FROTA e CONSULTA leem tudo | [x] | `50219d5d` |
| Fase5-2 | Depois do `PUT`, o menu do afetado não mudava dentro do Frota: o portal (perfil do `/portal/inicio`) e o painel (perfil do 403) renovam o usuário uma vez quando divergem | [x] | `805aaa3c` |
| Fase5-3 | Texto da B29 ("ao escolher de novo, vira padrão") corrigido: escolher a opção já marcada não grava nada | [x] | fechamento |

## Spec que estava errada

- O plano da Etapa 1 (Fase 0 desta) dizia que o front **espelha** a régua do servidor (`perfilFrota` = `getPerfilFromUser`). **Estava
  errado num detalhe**: o servidor compara `role === 'admin'` exato; o front minusculiza. Um usuário com `role 'Admin'` é Motorista no
  servidor e administrador no menu. A tela de Perfis segue o servidor; a divergência do menu está declarada (letra **E5**).
- O "Ajustes da Fase 2" (item 6) dizia que o valor fora da lista "não dá ação nenhuma". **Para as ações era verdade; para as leituras
  estava errado** — ele lia tudo (Fase5-1). Corrigido em `50219d5d`.
- A Fase 0 do plano dizia que o usuário afetado veria o perfil novo "quando o cache de 5 min vence". **Estava errado**: nada renova o
  usuário dentro do Frota; o menu só mudava no F5. Corrigido no código (Fase5-2, `805aaa3c`): o portal e o painel percebem e renovam.

## O que ficou de fora, e por quê

- **Trilha de auditoria** (B26) — o Frota não tem trilha própria; fica o `updated_at` da linha.
- **Guardar o Consulta ao conceder e revogar o administrador** (C9) — exigiria coluna nova; o comportamento está fixado em teste e
  declarado.
- **Coluna "tem acesso ao módulo Frota"** na tela (B27) — o acesso ao módulo continua no cadastro de usuário; a lista mostra todos os
  ativos.
- **O usuário afetado ver o menu novo em qualquer tela** (C11) — vale no próximo pedido ao servidor; a tela dele se acerta ao
  recarregar a página ou ao abrir o painel / Meu painel (Fase5-2, `805aaa3c`). Outras telas já abertas não renovam sozinhas.

## Testes (rodados no fechamento, 2026-10-23, depois de `805aaa3c`)

Servidor: `frotasPerfis` **17/17**, `frotasPerfisIdaEVolta` **3/3** (login real); os 11 arquivos `frotas*` somam **102 passaram, 0
falharam**. Tela (`client/src/components/frotas`): 7 arquivos, **64/64**. Suíte inteira: `test:api` **549/549 arquivos**,
`test:almoxarifado` 44/44, `test:validation` 4/4, `test:safealter` 3/3, `test:sqlite` 16/16, tela **193 suítes, 2605/2605**, `build`
com `CI=true` sem aviso. Listas negativas (RN-F2.11, menu, botões) provadas por sabotagem **por concessão**.
