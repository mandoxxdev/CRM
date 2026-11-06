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

- [x] **Plano** — `3f5b8690`.
- [x] **T1 (item 7)** — `eb3a48c3`. Vermelho medido (2 cenários: `- Expected - 4` na tabela, *"Quantidade (saldo: 11.2 PC)*"* no
  rótulo). Os seis pontos da tela passam por `formatarQuantidade`; verde 15/15. Controle positivo: *consumido* e rótulo crus → os dois
  `[RN-199.01]` caem pela linha `●`; restaurado por Edit inverso, md5 `afb25214…` de volta.
- [x] **T2 (item 8)** — `0da1e81b`. Vermelho medido (5 cenários novos). `quebrarTexto` leva a sequência de espaços de antes de cada palavra
  (recuo grudado na primeira), consome a sequência onde quebra, apara o fim; tab → 4 espaços, espaço unicode que não é NBSP → espaço. Os
  testes da 185 passaram sem mudança. Controle positivo: voltar a juntar com um espaço (`${linha} ${palavra}`) → os 5 novos caem; md5
  `4e09e9f7…` de volta.
- [x] **T3 (revisão "passaria com a feature quebrada?")** — duas lacunas achadas, as duas cobertas nos commits acima:
  - **Item 7:** um formato "vazio vira travessão" (os `formatNum` locais) na coluna Devolvido passava **verde** (15/15) — a fixture tinha
    todos os números. Acrescentado `[RN-199.01] numero vazio aparece como 0` (vermelho com a sabotagem, verde sem).
  - **Item 8:** desenhar o texto pela `linhasPorLargura` (o `splitTextToSize` das linhas de identificação, com o tab trocado) passava
    **verde** em todos os testes, inclusive num parágrafo longo com sequências de 3 espaços. Sonda (`sonda199.js`, scratchpad): o
    `splitTextToSize` parte em `' '` e preserva espaços; só erra quando a quebra cai **dentro** de uma sequência longa — *a* + 200 espaços
    + *b* sai *a* / 17 espaços + *b*. O teste pelo PDF `[RN-199.05] pelo PDF…` ganhou esse caso e cai com a sabotagem.
- [x] **T4** — tela inteira **212 suítes / 2922 testes** verdes; `CI=true npx react-scripts build` → *Compiled successfully* (sobre
  `0da1e81b`). Servidor não tocado, não rodado. Fechamento: commit "Etapa 199: fechamento".

### Divergências do plano

- Nenhuma de regra. O plano não dizia o que fazer com espaço unicode que não é NBSP (espaço largo, fino): virou espaço comum, porque a fonte
  do PDF não os tem (antes também viravam um espaço) — na **B1337**.

### Retro (4 números)

- Rodadas de correção até verde: **0** (cada item verde na primeira implementação).
- Achados da revisão: **2 reais** (as duas lacunas de teste da T3), **0 ruído**; nenhum defeito de código.
- Paralelismo: **0** galhos em paralelo (dois itens pequenos, sequenciais; sem retrabalho).
- Defeito que escapou: preencher na próxima etapa.

## Próxima tarefa detalhada

**A fila da estimativa de 05/11 acabou** (`docs/estimativas/2026-11/estimativa_2026-11-05_almoxarifado-proximas.txt`, itens 1 a 8 feitos:
191, 194, 195, 196, 197, 198 e 199). A próxima sai do **item 9 da fila de pausa** (`docs/superpowers/plans/2026-10-23-almoxarifado-pausa-e-retomada.md`,
seção 4): a feature 05 (a "lista de separação como entidade" segue `[ ]`) e o que falta para 🟢 nas features 01, 06, 16, 21, 22, 23 e 25
(mapa `specs/modulo-almoxarifado/README.md`) — **a maioria depende de resposta da empresa** (seção 5 do mesmo plano); não começar sem ela.

Os avisos **C** abertos de maior valor, que não dependem da empresa (tamanho em uma frase, sem estimativa — estimar antes de começar):

- **C468** — a entrega com "Sai de" escolhido à mão não desconta o que outra requisição separou dali: pequeno, uma régua na entrega com
  escolha à mão (a mesma conta da 198 na separação), literal própria e cuidado com o dado antigo.
- **C469** — o "Sai de" da separação mostra o saldo do endereço sem descontar o separado das outras: médio, campo novo na lista de saldos por
  endereço, que a Movimentação também usa (**B1335**).
- **C464** — saldo só em lote bloqueado, reprovado ou vencido: a entrega passa e o resto vai a "sem lote" negativo: grande, o disponível
  descontar o lote que não pode sair na aprovação, na separação e na entrega juntas (motor, tronco).
- **C466** — o automático pode tirar a peça que voltou para a quarentena: grande, bloqueio por lote no motor (hoje só no total do material).
- **C458** — a movimentação antiga pela integração tira material sem lote, inclusive de lote vencido: médio, a rota antiga repassar o lote ao
  motor (ou ser aposentada).
- **C465** — a entrega de EPI e a de material sem controle de lote saem sem lote, e a Devolução lista só as 30 saídas recentes: médio, mais
  produto que conserto (a B204 continua nesses fluxos).
- **C467** — a requisição excluída guarda a origem nos itens: pequeno, sem efeito hoje (coberto por teste nas duas portas); limpar na
  exclusão é higiene.

Pontos de atenção para qualquer um deles: os C468/C469/C464/C466 mexem em saldo — releia a seção das travas do `CLAUDE.md` inteira antes.
