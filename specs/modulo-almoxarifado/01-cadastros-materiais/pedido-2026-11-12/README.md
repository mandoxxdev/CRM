# Pedido de 12/11/2026 — revisão do cadastro de material (Compras + Almoxarifado)

> **⚠️ Regra permanente (12/11/2026, pedido do setor de Compras): cadastro é do Compras; o Almoxarifado só movimenta.**
> O Almoxarifado só consulta os pedidos de compra, registra a entrada (dando baixa no pedido), libera para retirada e registra a
> saída. Material, família/subfamília, categoria, tipo de material, fornecedor e fornecedores do material são cadastrados **no
> Compras**; no Almoxarifado aparecem só para consulta. Feature nova de cadastro nasce no Compras. Texto completo e o que ainda
> contraria a regra: `CLAUDE.md`, seção "Regra de negócio: cadastro é do Compras; o Almoxarifado só movimenta".
> Por isso a lista de fornecedores do material, o código do fornecedor e a lista de Tipos de Material deste pedido ficam no **Compras**.

> Mensagens da compradora (WhatsApp, 09 a 12/11/2026), repassadas pelo André. As imagens são as telas que ela comentou.
> Estimativa: `docs/estimativas/2026-11/estimativa_2026-11-12_cadastro-de-material-fornecedores.md`.

| Imagem | Tela comentada | Pedido |
|---|---|---|
| `img1.jpeg` | Dados técnicos (Fabricante, Código no Fabricante…) | O código do fabricante não serve como campo único: um mesmo material vem de vários fornecedores, cada um com seu código (inox: ~5 fornecedores). |
| `img2.jpeg` | Proposta dela | **Relacionamento Material x Fornecedor**: um cadastro interno, N fornecedores, cada um com código; na cotação/pedido, escolher o fornecedor traz o código dele. |
| `img3.jpeg` | Fabricante / Código no Fabricante | Correção: "código do fabricante" para eles é do **fornecedor**, e do fabricante em alguns casos. |
| (img4 — não salva) | ? | "Teremos um campo para informar o número de série do equipamento e nosso número de controle (etiqueta)? Campos obrigatórios." — **falta a imagem: não se sabe de qual tela fala.** |
| `img5.jpeg` | Unidades e custos (Fornecedor Principal, Código no Fornecedor) | "Não haverá necessidade, caso seja feita a solicitação acima" — somem, absorvidos pelo relacionamento. |
| `img6.jpeg` | Validade do CA, Aplicação, Especificações, Observações | Pergunta o que é Validade do CA; Especificações/Observações "manter só no campo Identificação" (ambíguo); Aplicação "não precisamos" — perguntou ao Matheus. |

## Recursos pedidos para o relacionamento (img2, texto)

1. Vários fornecedores por material, sem duplicar o cadastro. — **feito, Etapa 212** (`f59c0551`, `db55113a`, `e74bcb05`)
2. Código individual por fornecedor. — **feito, Etapa 212** (idem)
3. Descrição comercial do fornecedor (quando difere da nossa). — **feito, Etapa 212** (idem)
4. Histórico de preços cotados e comprados por fornecedor. — **feito, Etapa 214** (`8ec674b0`, `bd9209c4`)
5. Seleção automática: na cotação/pedido, escolher o fornecedor apresenta o código dele. — **feito, Etapa 213** (`86ab0eb4`, `7a8e6f5b`)
6. **Regra:** o código interno da GMP continua o identificador principal; o do fornecedor nunca o substitui. — respeitada nas duas
   etapas: o código GMP não muda pela seção de fornecedores e vem primeiro na tela e no impresso.

## Medido no código (12/11/2026)

- **Categoria** já tem cadastro: Almoxarifado → Configurações → aba **Categorias**; o campo do material é lista.
- **Tipo de Material**: existe a aba **Tipos de Material** nas Configurações (tabela `tipos_material_almoxarifado`), mas o campo
  "Tipo de Material" do cadastro (`tipo_material`) é **texto livre** — não puxa da aba. É o pedido "seguir o mesmo padrão".
- **Fornecedor Principal / Código no Fornecedor** (`fornecedor_principal`, `codigo_fornecedor`): texto livre, um por material. Não
  existe tabela material x fornecedor.
- **Caracteres**: nome, descrição e demais textos não filtram caractere (acento, `*`, `Ø`, `"` passam). Só o prefixo de código da
  família é limpo para letras e números.

## Em aberto (com quem pediu)

- img4: qual tela (material, ferramenta ou entrada)? Número de série já existe no controle por série; "número de controle (etiqueta)" não.
- Especificações Técnicas / Observações Gerais: juntar em quê?
- Aplicação: aguarda o Matheus.
