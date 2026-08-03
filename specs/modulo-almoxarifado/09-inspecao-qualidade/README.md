# 09 — Inspeção e Qualidade

> **Status:** 🟡 embrião — só inspeção simples por item de recebimento · **Spec original:** seção 9
> **Última atualização:** 2026-08-02

## Objetivo

Inspeção de recebimento com plano, quarentena e bloqueio efetivos no saldo, não conformidade, desvio autorizado e devolução ao fornecedor.

## O que já existe

- `inspecoes_recebimento_almoxarifado` (`schema.js:449`): conforme, divergência de quantidade/dimensional, certificado ausente, dano físico, material incorreto, ação, responsável.
- Rota `POST /recebimentos/itens/:itemId/inspecionar` (`extended.js`, permissão `inspecionar` — perfis ADMIN/ALMOXARIFE).
- Colunas de saldo: `quantidade_bloqueada`, `quantidade_em_inspecao` (material e saldo por localização).
- Tabela órfã `controle_qualidade` no `index.js:19493` (sem rota — avaliar reutilizar ou ignorar).

## Checklist

### Backend
- [ ] Planos de inspeção (por material/família: o que medir, critérios)
- [ ] Registro de medidas + instrumento de medição utilizado (liga com feature 16)
- [ ] Resultado: aprovar / aprovar parcialmente / reprovar lote — com efeito no saldo (aprovado → disponível; reprovado → bloqueado/quarentena)
- [ ] Quarentena como estado real: entrada inspecionável nasce `em_inspecao`, aprovação move para disponível via movimentação
- [ ] Bloqueio de material fora de recebimento (achado em estoque) com motivo
- [ ] Não conformidade formal (número, descrição, ação, responsável) vinculada à inspeção
- [ ] Liberação sob desvio autorizado (quem autorizou, justificativa, histórico imutável)
- [ ] Solicitar análise da Engenharia / devolução ao fornecedor / substituição (encaminhamentos com status)
- [ ] Anexos: certificado, relatório dimensional, fotos (`anexos_documento_almoxarifado`)
- [ ] Perfil QUALIDADE nas ações de inspeção (hoje só ADMIN/ALMOXARIFE — spec 28 prevê Qualidade)

### Frontend
- [ ] Fila de inspeções pendentes
- [ ] Form de inspeção com plano/medidas/fotos
- [ ] Gestão de bloqueios e quarentena (o mapa já mostra áreas — falta operação)

## Regras essenciais + testes de API exigidos

| Regra | Teste |
|-------|-------|
| Material em inspeção/quarentena não aparece como disponível | `saldo em inspecao fora do disponivel` |
| Saída de material bloqueado falha | `saida de material bloqueado falha` |
| Lote reprovado não sai para consumo | `saida de lote reprovado falha` |
| Desvio autorizado exige responsável + justificativa e fica registrado | `liberacao sob desvio sem justificativa falha` |
| Aprovação de inspeção move quantidade para disponível exatamente uma vez | `aprovar inspecao duas vezes nao duplica saldo` |

## Dependências

- 08 (recebimento cria a inspeção) · 03 (efeitos no saldo via movimentação) · 10 (reprovação por lote).
