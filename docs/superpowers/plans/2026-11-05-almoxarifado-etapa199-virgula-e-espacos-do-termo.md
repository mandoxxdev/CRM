# Etapa 199 — Materiais de clientes com vírgula na tela, e o termo de ferramenta com os espaços do texto

> Etapa pequena, só de tela e de PDF gerado no navegador. Nenhum contrato de API muda, nenhum servidor, nada gravado.
> Estimativa: itens 7 (**45 min**) e 8 (**1h15**) de `docs/estimativas/2026-11/estimativa_2026-11-05_almoxarifado-proximas.txt` — os dois
> últimos da fila. Fecha o **C448** (item 7) e o **C447** (item 8). Escala reduzida: plano curto, sem design separado.

## Objetivo (em linguagem simples)

1. **Materiais de clientes.** A tela mostra *12.5*; o documento impresso da posição do cliente mostra *12,5*. Quem confere um contra o
   outro vê dois números. A tela passa a mostrar *12,5* — o mesmo formato do papel.
2. **Termo de ferramenta.** O texto do termo é escrito pela empresa (com recuo, espaços para alinhar, tabulação). O PDF juntava tudo num
   espaço só. Passa a sair como foi escrito, sem passar da folha.

## Fase 0 (medido em 2026-11-05, sobre `9e1555a3`)

### Item 7

- Tela: `client/src/components/almoxarifado/MateriaisClienteAlmoxarifado.js`. Número cru em `:175-177` (recebido, consumido,
  devolvido), `:181` (saldo, no selo), `:186` (quantidade de cada aplicação, coluna *Aplicado em*) e `:224` (rótulo *Quantidade (saldo:
  X un)* da janela de devolução). A contagem de itens do seletor de cliente (`:131`) é inteiro de contagem — fica.
- Papel: `posicaoClientePdf.js:18` usa `formatarQuantidade` de `client/src/utils/pdfTexto.js:61` (pt-BR, até 4 casas; vazio/ilegível →
  `0`; `-0` → `0`). `pdfTexto.js` não importa nada (nem jsPDF) — a tela pode importar sem puxar o jsPDF.
- **Não** reaproveitar os `formatNum` locais de outras telas: mostram *—* para vazio, e o papel mostra *0*.
- O teste da tela mocka `posicaoClientePdf`, não `pdfTexto` — a função real roda.
- O campo de quantidade da devolução é `type="number"` e manda `Number(devQtd)`: não muda.

### Item 8 — por que os espaços colapsam (causa)

`client/src/utils/termoFerramentaPdf.js`, `quebrarTexto` (`:23-54`): cada parágrafo é partido com `paragrafo.split(/\s+/).filter(Boolean)`
e as palavras são reunidas com **um** espaço (`` `${linha} ${palavra}` ``). Isso apaga o recuo do começo do parágrafo, os espaços repetidos
no meio e a tabulação (vira espaço único). As quebras de linha (`\n`) e as linhas em branco já eram preservadas (o `split('\n')`).

- O texto da versão chega **literal** ao descritor (`montarTermoFerramenta`, `texto: String(t.texto ?? '')`, RN-185.09). O servidor grava
  só com `textoLimpo` (tira `\u0000` e apara as pontas) e o hash (`texto_sha256`) é sobre esse texto. **Nada disso muda**: o conserto é só
  no desenho (`quebrarTexto`), e o *Verificar integridade* continua recalculando no servidor sobre o texto gravado.
- A largura é medida por `pdf.getTextWidth` na fonte 10, `LARGURA_UTIL = 182` (Etapa 185) — a régua continua.

## Regras

- **RN-199.01** — A tela *Materiais de clientes* mostra recebido, consumido, devolvido, saldo, a quantidade de cada aplicação e o saldo do
  rótulo da janela de devolução no formato do papel (`formatarQuantidade`, B1336): *12,5*, *1.250,75*, até 4 casas; vazio → *0*.
- **RN-199.02** — A cor do selo de saldo e o botão *Devolver* continuam decididos pelo número (`Number(i.saldo) > 0`), não pelo texto.
- **RN-199.03** — No termo, o recuo do começo de um parágrafo e os espaços repetidos entre palavras saem como foram escritos.
- **RN-199.04** — Tabulação sai como 4 espaços (a fonte do PDF não tem tabulação; B1337).
- **RN-199.05** — Onde a linha quebra, o espaço (ou a sequência de espaços) daquele ponto é consumido pela quebra — como hoje (B1217).
  Espaço no fim de uma linha não é desenhado. Nenhuma letra se perde.
- **RN-199.06** — Nenhuma linha passa da largura útil (182 mm, fonte 10), inclusive com recuo longo ou muitos espaços; o laço termina
  com qualquer largura/régua (as garantias da 185 continuam).
- **RN-199.07** — O texto que entra no hash e a verificação de integridade não mudam (nada no servidor nem no descritor).

## Cenários

Item 7 (`MateriaisClienteAlmoxarifado.test.js`):
1. Posição com `recebido 12.5`, `consumido 0.30000000000000004`, `devolvido 1250.75`, `saldo 11.2`, aplicação `quantidade 2.5` → células
   *12,5*, *0,3*, *1.250,75*, *11,2*; aplicação *— 2,5*. (RN-199.01)
2. Abre a devolução desse item → rótulo *Quantidade (saldo: 11,2 PC)*. (RN-199.01)
3. Os cenários antigos (inteiros) continuam: *100*, *50*, *10*, *40*; o selo zerado e o botão desabilitado continuam. (RN-199.02)

Item 8 (`termoFerramentaPdf.test.js`):
4. `quebrarTexto('    Recuo  dois   tres', ∞)` → `['    Recuo  dois   tres']`. (RN-199.03)
5. `'a\tb'` → `['a    b']`; `'\tRecuo'` → `['    Recuo']`. (RN-199.04)
6. Quebra no meio de uma sequência de espaços: a linha seguinte não começa com espaço e a anterior não termina com espaço; junção sem
   espaços = texto sem espaços. (RN-199.05)
7. Recuo maior que a largura e 200 espaços entre duas palavras: nenhuma linha passa de 182 mm, termina com régua de teto. (RN-199.06)
8. PDF: texto da versão com recuo e espaços repetidos → o `text` desenhado na fonte 10 tem os espaços; nada passa da margem; os hashes do
   descritor continuam os do servidor. (RN-199.03, RN-199.07)
9. Os testes da 185 (`[RN-185.07]`, `[Fase 5 da 185]`) continuam verdes sem mudança.

## Tasks

| Task | O que | Tipo |
|---|---|---|
| T1 | Item 7: testes vermelhos (cenários 1-3) → `formatarQuantidade` nos seis pontos da tela → verdes; controle positivo | galho (só tela) |
| T2 | Item 8: testes vermelhos (cenários 4-9) → `quebrarTexto` preservando espaços → verdes; controle positivo | galho (só util do PDF) |
| T3 | Revisão "este teste passaria com a feature quebrada?": uma sabotagem a mais por item; se passar verde, asserção nova | — |
| T4 | Tela inteira do client + build; fechamento (`fechar-etapa`) | — |

Os dois itens são independentes (arquivos e regras distintos), mas pequenos demais para valer agentes: execução sequencial, um commit cada.
Não há rota nova: o "cenário de integração" de cada item é pela superfície real (a tela montada com a função real de formato; o gerador do
PDF com o jsPDF real medindo).

## Execução

- [ ] T1
- [ ] T2
- [ ] T3
- [ ] T4
