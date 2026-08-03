# 20 — Alertas Operacionais

> **Status:** 🟡 — 2 de ~21 alertas da spec · **Spec original:** seção 26
> **Última atualização:** 2026-08-02

## Objetivo

Todos os alertas preventivos da spec, com motor único (verificação periódica + gatilhos por evento), canais e destinatários configuráveis.

## O que já existe

- Estoque abaixo do mínimo (máquina de estados + debounce, e-mail/WhatsApp) — `alertService.js`.
- Requisição aguardando aprovação há N dias (lembretes, job 1 h) — `requisitionReminderService.js`.
- Padrão de job periódico agendado em `routes/almoxarifado.js:2000-2006`.

## Checklist de alertas (spec 26)

- [x] Estoque abaixo do mínimo
- [x] Requisição aguardando aprovação
- [ ] Estoque zerado
- [ ] Estoque negativo → **bloquear operação** (não é alerta, é regra do motor — feature 03; aqui só o aviso)
- [ ] Requisição atrasada (passou da data de necessidade)
- [ ] Material separado aguardando retirada há N dias
- [ ] Material reservado há muitos dias (feature 07)
- [ ] Pedido recebido parcialmente
- [ ] Divergência de recebimento (feature 08)
- [ ] Material em quarentena parado (feature 09)
- [ ] Material reprovado (feature 09)
- [ ] Material sem certificado (feature 10)
- [ ] Material sem endereço (feature 02)
- [ ] Transferência não recebida (feature 11)
- [ ] Ferramenta não devolvida (feature 16)
- [ ] Material em terceiro com prazo vencido (feature 14)
- [ ] Lote próximo do vencimento (feature 10)
- [ ] Calibração próxima do vencimento (feature 16)
- [ ] Divergência de inventário (feature 17)
- [ ] Item sem movimentação há N dias (feature 18)
- [ ] Estoque excessivo (feature 18)
- [ ] Projeto com consumo acima do previsto (feature 22)

## Infra a construir

- [ ] Motor de alertas único: registro de regras (tipo, condição, periodicidade, canal, destinatários), reaproveitando o padrão máquina-de-estados + debounce do `alertService`
- [ ] Central de alertas no front (sino/painel) além do e-mail
- [ ] Cada alerta novo entra quando a feature correspondente for desenvolvida — **incluir o alerta no checklist da feature dona**

## Regras essenciais + testes de API exigidos

| Regra | Teste |
|-------|-------|
| Alerta dispara na transição de estado, não a cada verificação | `alerta nao repete enquanto condicao persistir` |
| Resolver a condição rearma o alerta | `voltar acima do minimo permite novo alerta futuro` |
| Destinatários respeitam a configuração | `alerta enviado apenas aos destinatarios configurados` |

## Dependências

- 19 (canal de envio) · cada alerta depende da sua feature dona.
