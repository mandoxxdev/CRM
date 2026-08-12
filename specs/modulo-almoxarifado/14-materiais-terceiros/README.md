# 14 — Materiais Enviados a Terceiros

> **Status:** ❌ — nada implementado · **Spec original:** seção 18
> **Última atualização:** 2026-08-12
>
> ## Esta feature virou a **Etapa 8b**
>
> A Etapa 8 do plano mestre cobria as features **13 e 14**. Foi **dividida** em 2026-08-12, na
> sessão de design da Etapa 8 (decisão 1) — mesmo precedente da Etapa 6, que virou 6/6b/6c:
>
> - **Etapa 8 = clientes (feature 13) — ✅ ENTREGUE** em 2026-08-12 (`f26b635..5b5eb55`).
> - **Etapa 8b = terceiros (esta feature) — próxima da ordem**, com design e plano próprios.
>
> **Por quê:** são subsistemas independentes e cada um fecha com testes passando por conta própria.
> Clientes é **unificação** (o material já existe, ganha um dono); terceiros é **construção do
> zero** — máquina de estados de remessa, documento, retorno parcial e transformação chapa→peças.
> Juntos dariam uma etapa grande demais para revisar.
>
> **O briefing de origem da 8b** (o que já está decidido, o contrato pronto que ela consome e os
> pontos de atenção que o design precisa decidir) está no fim de
> [`docs/superpowers/plans/2026-08-12-almoxarifado-etapa8-materiais-clientes.md`](../../../docs/superpowers/plans/2026-08-12-almoxarifado-etapa8-materiais-clientes.md).
> **A 8b ainda não tem design aprovado nem tasks quebradas** — a primeira ação de quem pegá-la é
> abrir `superpowers:brainstorming` com aquele briefing, **não** sair escrevendo código.

## Objetivo

Remessas para beneficiamento externo (corte, dobra, usinagem, tratamento, pintura, galvanização...) com saldo "em terceiros", prazos, retornos parciais e transformação de material (código original → componente resultante).

## O que já existe

Nada específico. Pontos de apoio: tipo de localização para "materiais em terceiros" previsto no
enum; fornecedores cadastrados no módulo Compras; motor de estoque com transferências (Etapa 7).

**Acrescentado pela Etapa 8 (2026-08-12), e a 8b consome sem reabrir:**

- **Guarda do dono** (`services/almoxarifado/ownerRules.js`) — **ponto de atenção real**: se a
  chapa que vai para o terceiro for **de um cliente**, a remessa é uma saída e a guarda vai exigir
  OS/projeto do dono. O design da 8b decide se remessa a terceiro entra em `TIPOS_ISENTOS_DONO` (o
  material continua sendo do cliente, só mudou de endereço) ou se exige o vínculo. A resposta
  provável é **isento com registro**, no espírito da `TRANSFERENCIA` — mas é decisão de design.
- **Modelo de propriedade pronto:** material de cliente enviado a terceiro (a chapa do cliente que
  vai galvanizar) já tem como ser representado — é `proprietario_cliente_id`, e **não se cria
  conceito novo para isso**.
- **Precedente de ação de perfil própria** (`ajustar_material_cliente`), com o critério usado lá:
  "a operação mexe em algo que não é nosso".
- **PDF gerado no navegador** (`utils/posicaoClientePdf.js`, `utils/etiquetasPdf.js`) — o
  "documento de remessa (PDF)" do checklist tem dois moldes prontos, `jspdf` já é dependência, e
  **zero mudança de servidor** é o padrão validado em duas etapas seguidas.
- **A auditoria de leituras da Etapa 8 vale para a 8b:** se a 8b criar coluna nova em
  `materiais_almoxarifado` (ex.: uma quarta coluna de retenção "em terceiros"), a mesma pergunta se
  repete para **todas** as leituras da tabela — e a lista já está levantada e classificada na
  Task 1 do plano da Etapa 8. **Reusar a lista, não refazer o grep do zero.**

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
