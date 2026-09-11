# Etapa 32 — Pedido de Compra (design)

> Data: 2026-09-11 · Módulo: **Compras** (core), com fronteira em Almoxarifado/Recebimento
> Origem do requisito: PDF do ERP atual — `Matheus - TECNOPAR 28433`, pedido 28433 / ID 29228,
> 24 itens, Form `TF_PEDCOMPRA`. É o documento que a GMP emite hoje e que o fornecedor recebe.

## 1. O problema

A tela **Compras → Novo Pedido** existe e o botão está lá, mas o pedido é um esqueleto: dá para
listar e nada mais. O comprador não consegue emitir o documento que a empresa usa de verdade.

## 2. O que já existe (medido, não suposto)

| Peça | Onde | Estado |
|---|---|---|
| `pedidos_compra` | `server/index.js:19531` | 10 colunas: número, fornecedor, valor_total, data_pedido, previsao_entrega, status, observacoes |
| `itens_pedido_compra` | `services/almoxarifado/schema.js:1292` | pedido_id, material_id, codigo, descricao, quantidade, valor_unitario, unidade |
| `GET /api/compras/pedidos` | `server/index.js:20303` | lista com JOIN em fornecedores; busca por número/razão social e filtro de status |
| Consumo a jusante | `services/almoxarifado/receiptService.js:82` | recebimento já lê `itens_pedido_compra` |
| Testes de fronteira | `tests/api/compraContextoMaterial`, `integracaoComprasJornada`, `solicitacaoCicloVida` | já criam pedido + itens |

**Correção de registro:** a primeira varredura desta etapa concluiu "não existe tabela de itens"
porque procurou só no `index.js`. A `specs/.../08-recebimento/README.md:22` **já nomeava**
`itens_pedido_compra`. A spec estava certa. É o alerta da Fase 0 acontecendo na prática: ler o
que a spec mediu **antes** de medir.

## 3. Mapeamento do PDF → modelo

### 3.1 Cabeçalho e identificação
| Campo no PDF | Origem |
|---|---|
| Razão social / endereço / CNPJ / IE / telefone do emitente | Dados da GMP — bloco fixo do documento |
| Emissão (data+hora), Folha X/Y | Gerado na impressão |
| `Pedido: 28433` | `pedidos_compra.numero` — **digitado**, ver RN-01 |
| `Data: 16/12/2025` | `data_pedido` |
| `Sit.: Finalizado` | `status` |
| `ID: 29228` | `pedidos_compra.id` |

### 3.2 Dados do Fornecedor (snapshot — ver RN-06)
Nome (`3797 - TECNOPAR FIXADORES LTDA`), CNPJ, Inscrição Estadual, Endereço, Município/UF, CEP,
Telefone, Celular, e-mail.

`fornecedores` hoje **não tem** `inscricao_estadual` nem `celular` → colunas novas (`safeAlter`).

### 3.3 Dados para Faturamento
Mesmos campos, da GMP. Bloco fixo do emitente.

### 3.4 Dados Complementares
Desconto praticado, Transportadora + telefone, **Frete** (modalidade — no PDF
`2-Contratação do Frete por conta de Terceiros`), Condição de pagamento (`28 D.D.L.`),
Tabela de preço, Via transporte (`Rodoviário`), Contato, Observação (`OS 1714 TQVS-4_INOX 304`).

### 3.5 Itens
`It. | Material | Descrição + Observação | NCM | Peso Un(Kg) | Data Entrega | Qtde. | Un | Valor Unitário | % IPI | Valor Total`

Faltam em `itens_pedido_compra`: `item_numero`, `ncm`, `peso_unitario`, `data_entrega`,
`ipi_percentual`, `observacao`. `valor_total` da linha é **derivado** (RN-03) — não é coluna.

### 3.6 Totais
Total do Produto (368,27) · Total do IPI (23,94) · Total ICMS ST (0,00) · Total Desconto (0,00) ·
Frete (0,00) · **Total Geral (392,21)**.

Conferência no documento real: 368,27 + 23,94 = 392,21 ✅ — o IPI entra no total geral.

### 3.7 Rodapé
Local de Entrega, Local de Cobrança, observação legal sobre crédito de ICMS, assinaturas
(Depto. Compras / Diretoria), usuário e data-hora de impressão.

## 4. Decisões

**D1 — Número digitado, não gerado.** A Etapa 31 registrou no cabeçalho do mapa de specs que
`pedidos_compra.numero` é **escolha do comprador** e que embrulhá-lo no `inserirComNumeroUnico`
faria o retry reescrever decisão de gente. Fica digitado, com validação de unicidade e mensagem
literal (RN-01). *Alternativa descartada:* gerar `PC-<carimbo>` como os quatro números do
almoxarifado — rejeitada porque o número do pedido é acordado com o fornecedor por telefone.

**D2 — Snapshot fiscal do fornecedor no pedido.** O pedido é documento; se o fornecedor mudar de
endereço em 2027, a reimpressão do pedido de 2025 não pode mudar. Os campos fiscais são copiados
na criação. *Reversível:* colunas nulas; quando o snapshot é nulo a impressão cai no JOIN vivo
(RN-06). *Alternativa descartada:* só JOIN — mais simples, mas reescreve documento emitido.

**D3 — Valor da linha e totais são derivados, nunca digitados.** Guardar `valor_total` por linha
convida a divergir do `quantidade × valor_unitario`. Calculado na leitura e na impressão (RN-03,
RN-04). *Consequência aceita:* ordenação/filtro por valor de linha exige `SUM` em SQL.

**D4 — Nada migrado.** Pedidos existentes (se houver) ficam com os campos novos nulos e a
impressão tolera ausência. Mesma postura da Etapa 31.

## 5. Fronteiras que NÃO mudam

- `receiptService.js:82` lê `itens_pedido_compra` — as colunas novas são aditivas, nenhuma
  existente muda de tipo ou nome. **Mas o comportamento da fronteira muda de significado** e isso
  está declarado na RN-11: o recebimento ignora o IPI do pedido, então pedido de 392,21 gera
  recebimento de 368,27. Nesta etapa a divergência é **afirmada por teste**, não corrigida.
- **Autorização: compras tem UMA camada, não duas.** `requirePermission` aparece **0 vezes** em
  `server/index.js` — todas as rotas de compras usam só `authenticateToken` +
  `checkModulePermission('compras')`. A segunda camada (perfil autoriza a ação) é a regra do
  **almoxarifado**; trazê-la para compras arrastaria cadastro de perfil e não é escopo desta
  etapa. As rotas novas seguem o padrão do módulo em que vivem.
- Almoxarifado é área física, não filial — nada aqui toca saldo.
