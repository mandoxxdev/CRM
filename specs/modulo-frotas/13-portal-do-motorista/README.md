# 13 — Portal do motorista (logar e preencher)

> **Status:** 🟢 **entregue na Etapa 1** (2026-10-23), na `main`, commits `4ed19f8b` a `4ba85d16`.
> O que falta para o uso completo não é deste portal, é do módulo: perfil Consulta/Motorista pela tela (Etapa 2), seção 3 do
> formulário, foto. Ver "O que ficou de fora".
>
> **Plano (contratos de API, Ajustes da Fase 2, Fase 5):**
> [`docs/superpowers/plans/2026-10-23-frotas-etapa1-portal-do-motorista.md`](../../../docs/superpowers/plans/2026-10-23-frotas-etapa1-portal-do-motorista.md)
> · **Apresentação:** [`docs/frotas/novidades-por-etapa.md`](../../../docs/frotas/novidades-por-etapa.md)
> · **Manual de quem usa:** [`docs/frotas/manual-do-sistema.md`](../../../docs/frotas/manual-do-sistema.md)
> · **Fonte dos campos:** [`00-processo-atual`](../00-processo-atual/README.md) (formulário de papel × planilha).

## O que é

O motorista entra no sistema (celular primeiro) e registra, num formulário só, o que hoje vai no papel: **saída**, **retorno** ou
**inspeção** — km, horário, combustível, os 12 itens OK/N/A/Falha e as avarias. Saída abre a viagem, retorno fecha. Abastecimento
tem tela própria. O motorista só vê e só altera o que é dele. O gestor exporta tudo no formato da planilha.

Telas: **`/frota/motorista`** ("Meu painel" para o motorista; "Portal do motorista" no menu do gestor). API: `/api/frotas/portal/*`.

## Regras de negócio — checklist

| RN | Regra | Estado | Commit |
|---|---|---|---|
| RN-F1.01 | Os 12 itens do papel, chaves fixas; resposta OK / NA / FALHA (`Item de checklist inválido: <chave>`) | [x] | `4ed19f8b`, `45bf32de` |
| RN-F1.02 | Situação: PENDÊNCIA (Falha ou avaria) › INCOMPLETO (faltou item) › OK; uma régua só (`situacaoDoRegistro`) | [x] | `4ed19f8b` |
| RN-F1.03 | Checklist da rota antiga sem itens não é aprovado (régua dos 7 `*_ok`, F2-7); com avaria = PENDÊNCIA (B22) | [x] | `80362b54`, `4ba85d16` |
| RN-F1.04 | Saída grava o registro e abre a viagem em andamento; consome a aprovada do mesmo carro e motorista (B8) | [x] | `45bf32de` |
| RN-F1.05 | Uma viagem em andamento por veículo e por motorista (portal e `POST`/`PUT /viagens`), fila em memória (B13) | [x] | `80362b54`, `45bf32de` |
| RN-F1.06 | Retorno fecha a viagem do motorista, km rodado, mesmo `viagem_id` | [x] | `45bf32de` |
| RN-F1.07 | km do retorno menor que o da saída → 400 (portal e `PUT /viagens`, A5) | [x] | `80362b54`, `45bf32de` |
| RN-F1.08 | Registros e abastecimento sobem o km do veículo se maior | [x] | `45bf32de` |
| RN-F1.09 | Inspeção grava só o registro | [x] | `45bf32de` |
| RN-F1.10 | PENDÊNCIA vira alerta `checklist`/`alto` no painel por 7 dias, `dias_restantes: null` (Fase5-11). **Mudou na Etapa 6 (RN-F6.04, feature [18](../18-tratar-pendencia/README.md)):** "por 7 dias" deixou de valer — o alerta fica até o gestor tratar a pendência, e veículo excluído não gera alerta. O teste foi reescrito em `492a0d87` | [x] | `45bf32de`, `c8794fd7`, `e4183f70` |
| RN-F1.11 | km/L pelo anterior **em km**; `km_desde_anterior`; recálculo do vizinho ao criar/editar/excluir (A1, A2) | [x] | `80362b54` |
| RN-F1.12 | Usuário ↔ motorista, um ativo por usuário; índice único parcial (Fase5-9); desvincular com null (F2-4) | [x] | `6dd0b130`, `9007353e` |
| RN-F1.13 | Sem vínculo → 409 `MOTORISTA_NAO_VINCULADO` | [x] | `6dd0b130`, `45bf32de` |
| RN-F1.14 | MOTORISTA só lista o que é dele (e `GET /motoristas/:id` alheio → 404, F2-2) | [x] | `6dd0b130` |
| RN-F1.15 | MOTORISTA só altera o que é dele → 403 `Você só pode alterar os seus próprios registros` | [x] | `6dd0b130` |
| RN-F1.16 | Painel/alertas = `ver_painel`; multas/documentos = `gerenciar_veiculos` | [x] | `4ed19f8b`, `6dd0b130` |
| RN-F1.17 | Aprovar só viagem solicitada (A4) | [x] | `80362b54` |
| RN-F1.18 | `GET /exportar.xlsx`, 6 abas no formato da planilha | [x] | `d2aaa72b` (front `82449c5f`) |
| RN-F1.19 | (Fase 2, F2-3) MOTORISTA: `motorista_id` forçado ao do vínculo no `POST`/`PUT` antigos | [x] | `6dd0b130` |
| RN-F1.20 | (Fase 5) Só quem aprova viagem leva a `aprovada`/`cancelada` pelo `POST`/`PUT` (B17) | [x] | `9007353e` |

Front: portal `78fbc9f4`; telas do gestor, menu por perfil e botão de exportar `82449c5f`; merge `497f5e8f`; usuário inativo e alerta
de checklist `e4183f70`. Integração pela rota e pelo serviço: `2e591c39`.

## Achados do levantamento que o portal expunha — checklist

| Achado | Estado | Commit |
|---|---|---|
| A1 — editar abastecimento apagava o km/L | [x] corrigido | `80362b54` |
| A2 — abastecimento fora de ordem sem km/L e sem refazer o vizinho | [x] corrigido | `80362b54` |
| A3 — checklist sem itens aprovado | [x] corrigido | `80362b54` (régua em `4ed19f8b`) |
| A4 — aprovar em qualquer status | [x] corrigido | `80362b54` |
| A5 — km de retorno menor gravava km rodado negativo | [x] corrigido | `80362b54` |
| A6 — motorista lia e editava tudo | [x] corrigido (escopo de leitura e escrita) | `6dd0b130`, `9007353e` — **mas** o fallback "sem perfil = MOTORISTA" continua, e não há tela para dar CONSULTA (Etapa 2) |
| A9 — testes do Frota fora da suíte | [x] corrigido | `4ed19f8b` (`tests/api/frotasServico.api.test.js`) |
| A8 — km menor que o atual passa calado | [ ] **aberto** | o mapa do levantamento dizia que A8 entraria na primeira etapa; **estava errado** — o plano revisado não o incluiu (B23). Fica para depois |

## Fase 5 (revisão adversarial) — checklist

| Achado | Estado | Commit |
|---|---|---|
| Fase5-1 — `valor_litro` não refeito ao mudar litros/valor | [x] | `c8794fd7` |
| Fase5-2 — documento renovado como VENCIDO na planilha | [x] | `c8794fd7` |
| Fase5-3 — retorno com data/hora antes da saída | [x] | `c8794fd7` |
| Fase5-4 — saída que consome a aprovada perdia observações | [x] | `c8794fd7` |
| Fase5-5 — data no futuro | [x] | `c8794fd7` |
| Fase5-6 — avaria malformada na rota antiga | [x] | `c8794fd7` |
| Fase5-7 — teste de paralelo fraco (todas as requisições como o último usuário) | [x] | `7cebaf12` |
| Fase5-8 — motorista aprovava/cancelava a própria viagem | [x] | `9007353e` |
| Fase5-9 — 6 POST simultâneos → 4 vínculos | [x] | `9007353e` |
| Fase5-10 — motorista ligado a usuário desativado não salvava | [x] | `9007353e`, `e4183f70` |
| Fase5-11 — alerta de checklist como "Vencido há N dia(s)" | [x] | `c8794fd7`, `e4183f70` |
| B22 — avaria não contava na rota antiga | [x] | `4ba85d16` |

## Testes (rodados no fechamento, 2026-10-23)

Servidor: `frotasConsumoViagem` 12, `frotasEscopoMotorista` 12, `frotasEsquema` 6, `frotasExportacao` 9, `frotasFase5Auth` 8,
`frotasFase5Regras` 8, `frotasPortal` 19, `frotasPortalIntegracao` 2, `frotasServico` 6 → **82 passaram, 0 falharam**; e
`vencimentosFrotasFinanceiroNoDiaLocal` **17/17**. Tela (`client/src/components/frotas`): **5 arquivos, 37/37**. A suíte inteira e o
`build` não foram rodados no fechamento (só documentação mudou).

## O que ficou de fora, e por quê

- **Seção 3 do formulário** ("Transmissão e itens específicos") — a imagem recebida está cortada no título; não há o que implementar
  sem a folha inteira.
- **Foto da avaria / do cupom** — as rotas do Frota não recebem arquivo (não há upload no módulo); o plano cortou a foto para o portal
  ficar utilizável antes. Corte de escopo declarado no plano.
- **Desenho clicável das avarias** — lista (vista + tipo + descrição) é utilizável já; o desenho pode vir sobre os mesmos dados (B5).
- **Apelido V01/C01** — a placa já identifica (B7).
- **A7, A10** — não são expostos pelo portal no primeiro dia (A10 é, se houver máquina por horímetro: ver D4 nas novidades).
- **Perfil CONSULTA/MOTORISTA pela tela** — fora da spec do portal; é a Etapa 2 (B24).
- **O motorista corrigir o próprio lançamento no portal** — "Meus registros" é só leitura; a correção fica com o gestor.
