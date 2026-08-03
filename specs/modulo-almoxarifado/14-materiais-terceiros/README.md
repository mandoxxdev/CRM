# 14 — Materiais Enviados a Terceiros

> **Status:** ❌ — nada implementado · **Spec original:** seção 18
> **Última atualização:** 2026-08-02

## Objetivo

Remessas para beneficiamento externo (corte, dobra, usinagem, tratamento, pintura, galvanização...) com saldo "em terceiros", prazos, retornos parciais e transformação de material (código original → componente resultante).

## O que já existe

Nada específico. Pontos de apoio: tipo de localização para "materiais em terceiros" previsto no enum; fornecedores cadastrados no módulo Compras; motor de estoque com transferências.

## Checklist

### Backend
- [ ] Tabela `remessas_terceiro_almoxarifado`: fornecedor, pedido/OS relacionado, prazo previsto, status (ABERTA → ENVIADA → RETORNO_PARCIAL → ENCERRADA / CANCELADA)
- [ ] Itens da remessa: material, quantidade, peso, lote, desenhos anexos
- [ ] Envio = saída para localização virtual "Em terceiros" (via movimentação v2 — saldo visível mas não disponível)
- [ ] Documento de remessa (PDF)
- [ ] Retorno parcial/total: entrada vinculada à remessa
- [ ] Perda ou consumo no terceiro: baixa com motivo
- [ ] **Transformação**: registrar novos códigos resultantes (chapa → peças cortadas) mantendo vínculo material original → componente (rastreabilidade)
- [ ] Acompanhamento de prazo + alerta de atraso (feature 20)
- [ ] E-mail no envio e retorno (feature 19; destinatários spec 14.2)

### Frontend
- [ ] Tela de remessas (criar, acompanhar, receber retorno, encerrar)
- [ ] Posição "o que está em cada terceiro"

## Regras essenciais + testes de API exigidos

| Regra | Teste |
|-------|-------|
| Material em terceiros sai do disponível mas segue rastreável | `envio a terceiro remove do disponivel e aparece em saldo em terceiros` |
| Retorno acima do enviado falha | `retorno maior que remessa falha` |
| Encerrar remessa com saldo pendente exige registro de perda/consumo | `encerrar remessa com pendencia sem justificativa falha` |
| Transformação mantém vínculo de rastreabilidade | `componente resultante referencia material original` |

## Dependências

- 03 (movimentação) · 02 (localização virtual) · 10 (lotes na transformação) · 19/20 (e-mails/alertas).
