# 16 — km e horímetro confiáveis no portal (A8, A10)

> **Status:** 🟢 **entregue na Etapa 3** (2026-10-23), na `main`, commits `64d85bf2` (plano) a `a7427207` (Fase 5) — ver a lista
> abaixo. Fecha os achados **A8** (km menor que o atual passava calado) e **A10** (máquina por horímetro gravava as horas no km) do
> [mapa](../README.md), e de carona o **E5** (`role` "Admin" maiúsculo).
>
> **Plano (contratos, Ajustes da Fase 2, Fase 5, retro):**
> [`docs/superpowers/plans/2026-10-23-frotas-etapa3-km-e-horimetro.md`](../../../docs/superpowers/plans/2026-10-23-frotas-etapa3-km-e-horimetro.md)
> · **Apresentação:** [`docs/frotas/novidades-por-etapa.md`](../../../docs/frotas/novidades-por-etapa.md) (Etapa 3, B35–B40, C13–C15, D9–D11)
> · **Manual de quem usa:** [`docs/frotas/manual-do-sistema.md`](../../../docs/frotas/manual-do-sistema.md) (2.3, 2.5, 2.8, 2.10, 3.1, 3.3–3.5)

## O que é

Com o portal no ar, o motorista digita o km no celular. Um erro (900 em vez de 1.900) entrava sem aviso e estragava o km/L dele e do
vizinho; e numa empilhadeira o portal pedia "KM atual" e jogava as horas no km da máquina. Agora o portal **para e pergunta** quando o
número é menor que o último do veículo (o motorista confirma ou corrige), mostra embaixo do campo **o último número registrado**, e a
máquina por horímetro é registrada **em horas**, no horímetro, fora do km/L.

## Regras de negócio — checklist

| RN | Regra | Estado | Commit |
|---|---|---|---|
| RN-F3.01 | Portal: leitura menor que a atual → 409 `KM_MENOR_QUE_ATUAL`, nada gravado | [x] | `fc1328e0` |
| RN-F3.02 | `confirmar_km_menor: true` (só o booleano) grava; o km do veículo não desce | [x] | `fc1328e0` |
| RN-F3.03 | A confirmação não passa por cima das recusas duras (retorno menor que a saída etc.) | [x] | `fc1328e0` |
| RN-F3.04 | Máquina por horímetro: lê `horimetro`, grava em horas (registro, viagem, abastecimento), sobe o horímetro, km intacto, fora do km/L | [x] | `fc1328e0` |
| RN-F3.05 | Horímetro menor que o atual → 409 `HORIMETRO_MENOR_QUE_ATUAL` (+ confirmar) | [x] | `fc1328e0` |
| RN-F3.06 | Retorno em horas menor que a saída → 400 (dura) | [x] | `fc1328e0` |
| RN-F3.07 | A régua vem do veículo (saída, inspeção, abastecimento) ou da **viagem** (retorno — Fase 2, T-2) | [x] | `fc1328e0` |
| RN-F3.08 | km e horímetro do veículo sobem por um `UPDATE` com `MAX` (corrida) | [x] | `fc1328e0` |
| RN-F3.09 | `/portal/inicio`: `horimetro_atual`; `viagem_aberta.horimetro_saida` e `tipo_medicao` | [x] | `fc1328e0` |
| RN-F3.10 | Tela do motorista: rótulo por medição, "Último registrado neste veículo", aviso de menor, **Confirmar mesmo assim** | [x] | `fdfebf96` |
| RN-F3.11 | Horas como horas: Meus registros, listas do gestor, planilha (colunas novas no fim) | [x] | `fdfebf96`, `c0af44e8` |
| RN-F3.12 | (E5) `role` "admin" em qualquer caixa é ADMIN_FROTA | [x] | `b88778b5` |
| RN-F3.13 | Rotas do gestor sem a régua (lançamento atrasado) | [x] | `fc1328e0` |
| RN-F3.14 | (Fase 2) Alerta e painel de revisão da máquina comparam com o horímetro (folga 50 h) | [x] | `fc1328e0` (planilha `c0af44e8`) |
| RN-F3.15 | (Fase 2, T-1) Gestor: `horimetro_saida/retorno` nas viagens e `horimetro_abastecimento` nos abastecimentos, com campos na tela | [x] | `fc1328e0`, `c0af44e8` |
| Integração | Portal → gestor → planilha, em km e em horas, pela rota e pelo serviço | [x] | `5f7cfa3d` |
| Fase5-F1/F2 | A tela relê o veículo depois de uma recusa (medição trocada pelo gestor; km lançado por outro motorista); Voltar recarrega | [x] | `c89397fa` |
| Fase5-R1/R2 | Gestor: horímetro torto ou negativo → 400 `Horímetro inválido` (antes gravava NULL e o PUT apagava a leitura) | [x] | `a7427207` |
| Fase5-R3 | Portal: " ", "0x10", "1e3" não são leitura (antes 0, 16, 1000) | [x] | `a7427207` |
| Fase5-R4 | Mensagem com até 6 casas (1.800,004 não aparece como 1.800) | [x] | `a7427207` |
| Fase5 testes | 6 sabotagens que passavam verdes (S4, S6, S7, S9, S20, S22) e 3 lacunas da tela ganharam cenário; cada uma conferida derrubando a asserção certa | [x] | `c89397fa`, `a7427207` |

## Spec que estava errada

- O mapa dizia, no A10, que `updateHorimetroVeiculoSeMaior` "não tem chamador" — era verdade; **deixou de ser** (`fc1328e0`).
- O plano da Etapa 2 propunha que o retorno seguisse a medição do **veículo**. **Estava errado** (Fase 2, T-2): o gestor pode trocar a
  medição com a viagem aberta; o retorno segue a régua com que a **viagem** abriu.
- O plano da Etapa 2 propunha a régua "nas telas do gestor (aviso com o mesmo confirmar)". **Não foi feito, por decisão** (B36/RN-F3.13):
  o gestor lança atrasado e corrige o que o motorista errou; o PUT de uma linha antiga sempre teria km menor que o atual.
- A letra **D4** ("o portal pede KM atual para qualquer veículo e grava como km") e a **C6** ("km menor passa calado") **deixaram de
  ser verdade**; a E5 também (resolvida).

## O que ficou de fora, e por quê

- **Régua nas rotas do gestor** (B36, B37): o motorista que chamar `POST /api/frotas/abastecimentos` direto (não está no menu dele)
  não passa pela pergunta — fixado em teste e declarado (D10).
- **Consumo da máquina (litros por hora)**: a linha em horas fica sem km/L e sem consumo (D9).
- **Relatório de custo por veículo** continua mostrando só o km (D11).
- **O servidor não recusa km digitado em máquina** pelas telas do gestor (B39, C13).
- **Corrigir os dados antigos** de máquina que já tinham horas no km — consulta **A4** para produção (local: zero máquinas).
- **Almoxarifado** tem a mesma comparação exata do `role` (`=== 'admin'`) — fora do módulo Frota (E8).
- **km torto nas telas do gestor** (`"130,5"` vira vazio sem erro, desde a Etapa 1) — medido na Fase 5 e não mexido (E11).

## Testes

Rodados no fechamento (2026-10-23, depois de `a7427207`): `npm run test:api` **551/551 arquivos OK**; `test:almoxarifado` **44/44**; `test:validation` **4/4**; `test:safealter` **3/3**; `test:sqlite` **16/16**; tela **196 suítes, 2637/2637 testes**; `build` com `CI=true` **"Compiled successfully."**. Frota no servidor: 13 arquivos, **136 passaram, 0 falharam**; Frota na tela: 10 arquivos, **96/96**. Sonda aleatória do km/L da Fase 5: 4 sementes, ~7.200 operações, 0 divergências.
