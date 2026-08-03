# 07 — Reservas de Estoque

> **Status:** 🟡 — backend pronto, sem UI, sem automação · **Spec original:** seção 7
> **Última atualização:** 2026-08-02

## Objetivo

Reserva automática pós-aprovação, reserva manual, por projeto/OS/lote, com expiração, transferência entre projetos e efeito real no disponível.

## O que já existe

- Tabela `reservas_material_almoxarifado` (`schema.js:398`): material, quantidade, quantidade_utilizada, projeto_id, os_id, cliente_id, equipamento, submontagem, status.
- Rotas: `GET/POST /reservas`, `POST /reservas/:id/liberar` (`extended.js:122-141`), permissões `reservar` e `reservar_outra_os`.
- `quantidade_reservada` no material e no saldo por localização; mapa 2D exibe reservas.
- Integração com movimentação v2 (`reserva_id` na movimentação; consumo baixa reserva).
- Testes de serviço: reserva e transferência em `almoxarifado.test.js`.

## Checklist

### Backend
- [ ] Reserva automática ao aprovar requisição (liga 04→07; status `PARCIALMENTE/TOTALMENTE_RESERVADA`)
- [ ] Reserva por lote específico / número de série (depende da feature 10)
- [ ] Data de necessidade + prioridade na reserva
- [ ] Expiração automática de reservas não utilizadas (job + config de dias) + alerta de reserva vencida (feature 20)
- [ ] Transferência de reserva entre projetos (com permissão `reservar_outra_os`)
- [ ] Bloqueio de consumo por outro projeto: saída vinculada a projeto X não consome reserva do projeto Y
- [ ] Consulta "quem reservou" (histórico por material)
- [ ] Reserva parcial com registro do atendido

### Frontend
- [ ] Tela de reservas (listar/criar/liberar/transferir) — hoje **não existe nenhuma**
- [ ] Indicador de reservas no detalhe do material

## Regras essenciais + testes de API exigidos

| Regra | Teste |
|-------|-------|
| Reservar acima do disponível falha | `reserva acima do disponivel falha` |
| Reserva reduz o disponível imediatamente | `apos reserva, disponivel diminui e fisico permanece` |
| Saída de outro projeto não consome reserva alheia | `saida projeto B nao consome reserva do projeto A` |
| Liberação devolve ao disponível | `liberar reserva restaura disponivel` |
| Reserva expirada libera saldo automaticamente | `job de expiracao libera reservas vencidas` |
| Aprovação de requisição reserva automaticamente | `aprovar requisicao cria reservas dos itens com saldo` |

## Dependências

- 03 (fórmula de disponível) · 04 (gancho pós-aprovação) · 10 (reserva por lote/série).
