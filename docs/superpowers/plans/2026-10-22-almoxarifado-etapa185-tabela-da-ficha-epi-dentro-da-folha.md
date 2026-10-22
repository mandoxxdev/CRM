# Etapa 185 — A tabela da ficha de EPI (e o termo de ferramenta) cabe na folha: célula quebra em linhas, nada é cortado

> **Status:** 📝 **PLANO (2026-10-22)** — Fase 0 medida com o jsPDF real; Fase 2 (revisão do plano) ainda não rodou. Nenhuma task executada.
> Feature **25** (entrega de EPI) e **feature das ferramentas** (termo de responsabilidade, Etapa 180). Corrige **B1208** / **C444**
> (registrados na Etapa 183, defeito da 178). Decisões desta etapa a partir de **B1215** (a 184 reservou até B1214).
> Antes: Etapa 184 (aprovadores da liberação por valor) — **outra sessão revisa a 184 em paralelo: não tocar nos arquivos dela**
> (`requisitionValueApprovalService.js`, `routes/almoxarifado.js`, as telas de Requisições/Configurações e o plano da 184).

## Objetivo (em linguagem simples)

A ficha de EPI em PDF é a prova da NR-6: quem recebeu, o quê, quando, com que CA, quem entregou. Hoje a **linha de cada entrega** é
desenhada cortando cada texto por **número de letras**, sem olhar o espaço do papel. Resultado:

- o nome de quem entregou passa da margem (*Joao Almoxarife* termina em 198,6 mm; a margem é 196) ou **sai da folha** (*Maria Aparecida
  dos Santo* termina em 214 mm — o fim do nome não aparece no papel);
- o nome do EPI comprido **encosta e invade** a coluna do CA e **perde o fim** (*…Mascara de solda automatica escurecimento DIN 9-13*
  perde 34 letras);
- até o motivo mais comum sai errado: **"Primeira entrega" sai "Primeira entreg"** — falta uma letra em toda primeira entrega, hoje.

Depois desta etapa: **cada célula quebra em quantas linhas precisar** (a linha da entrega fica mais alta), **nenhuma letra é perdida**,
nada invade a coluna vizinha nem passa da margem — e as colunas são redistribuídas para que os textos comuns caibam numa linha só.
O mesmo defeito existe no **termo de responsabilidade da ferramenta** (também é prova assinada): o texto do termo em caixa alta vai a
210,6 mm, e a linha *"Registrado por"* com um nome comprido passa da margem. Ele entra no escopo.

Nada muda no que é gravado, na API, nem na tela: só o **desenho** do PDF.

## Fase 0 (medido em 2026-10-22, sobre `fd08624c`)

**Como foi medido.** Sondas no scratchpad com o **jsPDF real** do client (`client/node_modules/jspdf/dist/jspdf.node.min.js`, Helvetica,
mm, A4) — molde `fix183-sonda-real.js` da 183. As posições das colunas e as larguras do corte foram **lidas do arquivo de produção** por
regex (não copiadas à mão):
- `p185-sonda-tabela.js` — cada coluna da tabela da ficha: limite, quantos glifos cabem, textos reais/plausíveis, o que o corte atual faz;
- `p185-sonda-colunas-novas.js` — o layout atual e o proposto com `splitTextToSize` (quebra por largura), folga de 1 mm;
- `p185-sonda-outros.js` — termo de ferramenta, remessa e posição do cliente.

(Caminho completo: `C:\Users\User\AppData\Local\Temp\claude\C--Users-User-projetos-CRM-main\bf36ab2c-c3a4-467f-bc1f-24a9b62a2a92\scratchpad\p185-*.js`.)

### O código hoje

`client/src/utils/fichaEpiPdf.js`, `gerarFichaEpiPdf`:
- `const cols = [M, M + 20, M + 72, M + 92, M + 114, M + 126, M + 140, M + 162]` → x = **14, 34, 86, 106, 128, 140, 154, 176** (fonte 9);
- `const larguras = [10, 26, 10, 11, 6, 7, 11, 18]` e `celulas.forEach((c, i) => pdf.text(String(c).slice(0, larguras[i] * 1.4), cols[i], y))`
  — corte por **contagem** (14, 36, 14, 15, 8, 9, 15, 25 caracteres), **uma** linha por célula, sem medir;
- a altura da entrega (Etapa 183, B1207): `4 + 3 × (linhas de matrícula + linhas de aparelho) + 2 + (25 com imagem | 8 sem)`, e a entrega só
  começa na página se `y + altura ≤ 287` (`RODAPE`). O `4` é a **uma** linha da tabela;
- o cabeçalho da ficha (título fonte 14, `Nome: … Matrícula: …` e `Setor: … CPF: …` fonte 9, aviso de excluído) é `pdf.text` de uma linha,
  sem quebra.

O descritor `montarFichaEpi` **já** carrega os textos inteiros (`epi`, `ca`, `tamanho`, `motivo`, `entreguePor`…): o corte está **só** no desenho.
A tela da ficha (`EpiAlmoxarifado.js`) não usa o corte — lá o nome sai inteiro (é o que o C444 manda conferir).

### Medida por coluna (fonte 9, layout atual; "útil" = até a próxima coluna, ou até 196 na última)

| # | Coluna | x | útil (mm) | corte atual | cabem | texto real/plausível → fim (mm) | defeito hoje |
|---|---|---|---|---|---|---|---|
| 0 | Data | 14 | 20 | 14 car. | 10 `a`, 6 `W` | `22/10/2026` → 29,7 | nenhum (formato fixo) |
| 1 | EPI (`código — nome`) | 34 | 52 | 36 car. | 29 `a`, 17 `W` | `EPI-RESP-PFF2 — Respirador PFF2 sem valvula` (43) → desenhado até **94,2** (invade o CA, x 86), perde 7; `EPI-MASC-SOLDA-07 — Mascara de solda automatica escurecimento DIN 9-13` (70) → **95,4**, perde **34**; `EPI-BOT-0042 — Botina … numero 42` (70) → 90,5, perde 34 | **invade + perde texto** |
| 2 | CA | 86 | 20 | 14 car. | 10 `a`, 6 `W` | `12345` → 94,7; `45.678/2024` → 103,5; 20 `W` → **127,8** (invade Validade, x 106), perde 6 | invade no caso extremo (`ca_numero` é texto livre do cadastro do material, sem limite) |
| 3 | Validade CA | 106 | 22 | 15 car. | 12 `a` | `31/03/2027` → 121,7 | nenhum (formato fixo) |
| 4 | Qtd | 128 | 12 | 8 car. | 6 `a` | `99999` → 136,7 | nenhum plausível |
| 5 | Tam. | 140 | 14 | 9 car. | 7 `a`, 4 `W` | `XGG`/`42`/`Unico` cabem; `Tamanho especial XGG` (20, o máximo do servidor — `epiService.validarOpcionais`) → **155,6** (invade Motivo, x 154), perde 11 | invade + perde (caso raro) |
| 6 | Motivo | 154 | 22 | 15 car. | 12 `a` | **`Primeira entrega` (16) → sai `Primeira entreg`** (perde 1; inteiro iria a 177,3, invadindo *Entregue por*); `Troca`/`Perda`/`Dano` cabem | **perde texto em todo motivo "Primeira entrega" — caso comum** |
| 7 | Entregue por | 176 | 20 (margem 196) | 25 car. | 10 `a`, 6 `W` | `Ana Lima` → 189,3; **`Joao Almoxarife` (15) → 198,6** (passa da margem); `Administrador do Sistema` (24) → **212,1**; `Maria Aparecida dos Santo` (25) → **214,0** (fora da folha); `Maria Aparecida dos Santos Oliveira` (35) → 214,0 desenhado, perde 10 | **passa da margem / sai da folha** — o B1208 |

Pior caso do corte atual (n × `W`, n = o corte): Data 55,8; EPI 141,4; CA 127,8; Validade 150,8; Qtd 151,9; Tam. 166,9; Motivo 198,8;
Entregue por **250,6** mm. Os nomes de quem entregou (`users.nome`) e de material **não têm tamanho máximo** no cadastro.

Cabeçalhos da tabela (fonte 9) cabem todos (o maior, `Entregue por`, termina em 194,2).

**Fora da tabela, na ficha:** linha do hash (fonte 7) → 163,2 (ok, número e hash de tamanho fixo); título fonte 14 com nome de 53 → 166,8, de
59 → 186,1 — **um nome de ~66+ letras passa da margem**; `Nome: … Matrícula: …` com nome de 83 → 181,6 (passa com ~95+); `Setor/CPF` e aviso de
excluído ok com textos plausíveis. O nome do colaborador também não tem limite (`colaboradores.nome TEXT`).

### O layout proposto (medido)

Redistribuir as larguras sem mudar a área (14 → 196 = 182 mm): x = **14, 32, 82, 102, 121, 131, 143, 168**; útil com **folga de 1 mm** antes da
próxima coluna: **17 / 49 / 19 / 18 / 9 / 11 / 24 / 28** mm. Com `splitTextToSize` (quebra por palavra, palavra maior que a coluna quebrada por
caractere), medido:

| Coluna | útil | resultado |
|---|---|---|
| Data | 17 | `22/10/2026` 1 linha (29,7 ≤ 31) |
| EPI | 49 | 28 car. 1 linha; 43 car. 2 linhas; 70 car. 3 linhas (fim ≤ 80,6 ≤ 81) |
| CA | 19 | `12345`, `45.678/2024` 1 linha (99,5 ≤ 101); 20 `W` 4 linhas |
| Validade CA | 18 | `31/03/2027` 1 linha (117,7 ≤ 120); cabeçalho `Validade CA` 119,5 ≤ 120 |
| Qtd | 9 | até `99999` 1 linha (129,7 ≤ 130); **`100000` vira 2 linhas** (B1221) |
| Tam. | 11 | `G`, `Unico` 1 linha; `Tamanho especial XGG` 4 linhas |
| Motivo | 24 | **`Primeira entrega` 1 linha inteira** (166,3 ≤ 167) |
| Entregue por | 28 | **`Joao Almoxarife` 1 linha** (190,6); `Administrador do Sistema` 2; `Maria Aparecida dos Santos Oliveira` 2 (195,4); 60 `W` 7 |

Junção sem espaços = texto sem espaços em **todos** os casos medidos (nada perdido). Os cabeçalhos cabem em 1 linha.
**Nenhuma coluna em x = 28** (`M + 14`): é o recuo das linhas seguintes do aparelho, e o leitor `linhasDoAparelho` do teste
(`fichaEpiPdf.test.js:172,272`) reconhece a continuação por `x === 28`.

O layout de hoje com a mesma quebra também funcionaria, mas `Primeira entrega` e `Joao Almoxarife` virariam **2 linhas** — a linha mais comum da
ficha (primeira entrega, almoxarife de nome médio) ficaria mais alta em toda entrega (B1216).

### Outros PDFs do almoxarifado (`client/src/utils/*Pdf.js`)

| Arquivo | Padrão | Medido | Decisão |
|---|---|---|---|
| `termoFerramentaPdf.js` (termo de responsabilidade — **prova assinada**, Etapa 180) | `quebrarTexto(texto, 95)` por **contagem**; linhas de identificação de uma linha, sem quebra | texto do termo em **CAIXA ALTA** → **210,6** mm (sai da folha); 200 `W` → 329,0; texto comum → 168,6 (ok); `Devolução prevista … Registrado por: <nome de 44> … Assinado em …` → **199,9**; `Matrícula confirmada …` com matrícula de 40 → 195,0 (41+ passa); `Ferramenta: … Série: …` com nome de 52 → 174,7; hashes (fonte 7) 162,8 / 135,3 | **ENTRA** (B1219) |
| `remessaPdf.js` (remessa a terceiros) | `slice(0, 40)` por coluna, fonte 9 | código de 26 car. → 64,3 (invade Material, x 44); material cortado em 40 car. (cabe na coluna, perde o resto) | **FORA** (B1220) |
| `posicaoClientePdf.js` (posição de material de cliente) | `slice(0, 34)` / `slice(0, 60)` | código de 16 car. → 40,5 (invade, x 40); material cortado em 34 | **FORA** (B1220) |
| `etiquetasPdf.js` | `maxWidth` / `splitTextToSize(...).slice(0, 2)` — **já mede** | não medido (a etiqueta é física, 2 linhas de nome por decisão) | **FORA** (B1220) |

### Testes que tocam o desenho (cuidado com o mock)

- `client/src/utils/fichaEpiPdf.test.js` — gravador do `jspdf` que **já** manda `getTextWidth`/`splitTextToSize`/`setFontSize` para um jsPDF
  real (183, M1); réguas `textosFora` (**só fonte 7** hoje), `conferirRodape`, `linhasDoAparelho`; montagem "entrega em 234" (divisória da 6ª
  em 229 — vale enquanto `ENTREGA` couber em 1 linha por célula: com o layout **atual** + quebra, `Joao Almoxarife` vira 2 linhas e a montagem
  quebra; com o proposto, não).
- `client/src/components/almoxarifado/EpiAlmoxarifado.test.js:43` — mesmo gravador com medidas reais (gera a ficha pela tela).
- `client/src/utils/termoFerramentaPdf.test.js:15` e `client/src/components/almoxarifado/FerramentasAlmoxarifado.test.js:44` — gravador **sem**
  medidas (devolve `undefined` para tudo). Com `splitTextToSize`/`getTextWidth` no termo, o teste da tela quebra (`undefined.forEach`) e o do
  util também — os dois gravadores têm de passar a medir com o jsPDF real (molde: `EpiAlmoxarifado.test.js:43-58`).
- `client/src/components/datasDoChatDeComprasEDoAlmoxarifadoNoDiaLocal.test.js:62` — `FakePdf` para remessa/posição (fora do escopo; não muda).

### Divergências da Fase 0

1. O B1208 dizia *"um nome de ~16+ caracteres passa da margem"* e a C444 *"uns 15"* — medido: **15** (`Joao Almoxarife`, 198,6). Coerente.
2. O B1208 nomeou só *Entregue por* e o EPI. A medida acha também **Motivo** — e ali o defeito é **perda de texto num valor fixo e comum**
   (`Primeira entrega` → `Primeira entreg`), não só num caso extremo. E **Tam.** (até 20 car. no servidor) e **CA** (texto livre) invadem a
   coluna vizinha nos casos raros. O fechamento corrige o B1208/C444 para nomear as quatro colunas.
3. O termo de ferramenta tem o **mesmo** defeito (o pedido perguntava; a medida confirma) — entra.

## Regras

| ID | Regra | Cenário |
|---|---|---|
| RN-185.01 | Na linha de cada entrega da ficha, **todo texto de cada célula termina antes da coluna seguinte** (`x + largura ≤ x_próxima − 1`) e o da última (*Entregue por*) até a margem (`≤ 196`), medido com a fonte 9 real. | `entregue_por_nome: 'Maria Aparecida dos Santos Oliveira'` → 2 linhas em x 168, a maior termina ≤ 196 (medido 195,4); `material_nome` de 60+ car. → nenhuma linha do EPI passa de 81. |
| RN-185.02 | **Nenhuma letra é perdida**: para cada célula, a junção das linhas desenhadas, sem espaços, é igual ao texto do descritor sem espaços (a quebra só come o espaço entre palavras). Não há reticências nem corte. | `motivo: 'PRIMEIRA_ENTREGA'` → o PDF tem `Primeira entrega` inteiro (hoje `Primeira entreg`); EPI de 70 car. → 3 linhas cuja junção é o texto (hoje perde 34). |
| RN-185.03 | **Colunas**: x = `[14, 32, 82, 102, 121, 131, 143, 168]` (cabeçalho e células). Os textos comuns cabem em **uma** linha: `22/10/2026` (Data e Validade), `45.678/2024` (CA), `99999` (Qtd), `Primeira entrega` (Motivo), `Joao Almoxarife` (Entregue por); todos os cabeçalhos em uma linha. Nenhuma coluna em x = 28. | Entrega de `ENTREGA` do teste (motivo TROCA, `Joao Almoxarife`) → cada célula é **um** `text`; com `PRIMEIRA_ENTREGA` também. |
| RN-185.04 | **A linha cresce**: célula com k linhas desenha a linha j em `y + 4·j` (passo 4 mm, fonte 9), cada linha num `text` próprio (não `text(array)`); n = maior k da entrega; o hash vem em `y + 4·n`. Altura da entrega = `4·n + 3·(linhas de matrícula + linhas de aparelho) + 2 + (25 com imagem | 8 sem)`; a entrega só começa na página se `y + altura ≤ 287` (regra da 183, com o `4` virando `4·n`). Nada (texto, linha, fundo da imagem) passa de 287. | Montagem da 183 (2 com imagem + 4 sem → a 7ª em y = 234) com a 7ª tendo *Entregue por* de 60 `W` (7 linhas) e imagem: altura 61 → vai para a página seguinte (com `4·1` caberia: 234 + 37 = 271, e a divisória iria a 295). |
| RN-185.05 | **Cabeçalho da ficha** quebra por largura (182 mm): o título (fonte 14, passo 6), `Nome: … Matrícula: …`, `Setor: … CPF: …` e o aviso de excluído (fonte 9, passo 5). | Colaborador com nome de 90 car. → título em 2+ linhas, todas ≤ 196, e a tabela começa depois delas (sem sobrepor). |
| RN-185.06 | **Régua geral da ficha:** nenhum texto, em **qualquer** fonte (14, 9 e 7), termina depois de 196 mm. (A régua `textosFora` da 183 olhava só a fonte 7.) | Ficha do pior caso (nome, EPI, CA, tamanho, quem entregou, matrícula e aparelho longos) → lista de textos fora vazia. |
| RN-185.07 | **Termo de ferramenta — o texto** quebra por **largura medida** (fonte 10, 182 mm), respeitando parágrafos e linhas em branco; palavra maior que a linha é cortada por medida (caractere a caractere); nada perdido (por parágrafo, junção sem espaços = parágrafo sem espaços). | Texto em CAIXA ALTA de 130 car. → nenhuma linha passa de 196 (hoje 210,6); 200 `W` → ≥ 3 linhas, junção = os 200 `W` (hoje 329,0). |
| RN-185.08 | **Termo de ferramenta — as linhas de identificação** (`Ferramenta … Série`, `Colaborador … Matrícula … Setor`, `Devolução prevista … Registrado por … Assinado em`, `Matrícula confirmada pelo colaborador: …`, `Assinatura de …`, avisos) quebram por largura (fonte 9, 182 mm, `splitTextToSize`), cada linha com `pular(5)` (a quebra de página do termo continua a mesma: `y > 280`). | `criado_por_nome` de 44 car. → a linha de devolução em 2 linhas, ≤ 196 (hoje 199,9); matrícula confirmada de 60 car. → 2 linhas. |
| RN-185.09 | **Nada muda fora do desenho:** API, banco, HMAC, a tela da ficha e a do termo. O descritor da ficha não muda. O descritor do termo troca `linhasTexto` (corte por contagem, ninguém lê fora do teste) por `texto` (o texto da versão, literal) — mudança interna do client. | `git diff --stat` da etapa só em `client/src/utils/{fichaEpiPdf,termoFerramentaPdf}.js`, nos testes e nos documentos. |
| RN-185.10 | **Fora:** remessa, posição do cliente e etiquetas (B1220). | — |

## Contrato (do desenho — não há API nova nem alterada)

**`fichaEpiPdf.js`**
- `const COLUNAS = [M, M + 18, M + 68, M + 88, M + 107, M + 117, M + 129, M + 154]` (= 14, 32, 82, 102, 121, 131, 143, 168);
  largura útil da coluna i: `(i < 7 ? COLUNAS[i + 1] - 1 : 196) - COLUNAS[i]`.
- Por entrega, **antes** de medir a altura (fonte 9): `linhasCelula[i] = pdf.splitTextToSize(String(celula), util[i])`;
  `n = Math.max(...linhasCelula.map((l) => l.length))`. Some o `larguras` e o `slice`.
- Desenho: `linhasCelula[i].forEach((s, j) => pdf.text(s, COLUNAS[i], y + 4 * j))`; depois `y += 4 * n` e segue como hoje (hash, confirmação,
  aparelho, imagem, divisória).
- Altura: `4 * n + 3 * (linhasConfirmacao.length + linhasAparelho.length) + 2 + (imagem ? 25 : 8)`; `if (y + altura > RODAPE) { addPage; y = 18;
  cabecalho(); }` — **sem mudar** o resto da régua da 183.
- Cabeçalho: `pdf.splitTextToSize(texto, LARGURA_UTIL)` em cada linha, uma chamada `text` por linha (título passo 6; demais passo 5).
- `montarFichaEpi` **não muda** (os textos já são inteiros).

**`termoFerramentaPdf.js`**
- `quebrarTexto(texto, largura = 95, medir = (s) => s.length)` — mesma assinatura posicional (os testes de hoje continuam), agora a régua é
  `medir`: cabe se `medir(linha + ' ' + palavra) <= largura`; palavra maior que a linha cortada caractere a caractere enquanto `medir(pedaço +
  ch) <= largura`. Com o `medir` padrão (contagem) o comportamento é o de hoje.
- Descritor: `linhasTexto` sai; entra `texto: String(t.texto ?? '')`. Desenho (fonte 10): `quebrarTexto(doc.texto, 182, (s) => pdf.getTextWidth(s))`.
- Linhas de identificação: `pdf.splitTextToSize(…, 182)`, cada linha `text` + `pular(5)` (a última mantém o passo de hoje: 7 depois da linha de
  devolução, 3 depois da confirmação, 7 depois de `Assinatura de`).

## Tasks

| # | Task | Tipo |
|---|---|---|
| T1 | Ficha: colunas, quebra das células, altura, cabeçalho, régua geral (RN-185.01–06) | galho (só `fichaEpiPdf.js` + teste) |
| T2 | Termo: texto e linhas de identificação por largura (RN-185.07–09) | galho (só `termoFerramentaPdf.js` + testes do termo e da tela de ferramentas) |
| T3 | Integração pelas telas (ficha **e** termo) + sonda real com o arquivo de produção | depois de T1 e T2 |
| T4 | Fase 5 (revisão adversarial) + fix-round + fechamento | depois de T3 |

T1 e T2 mexem em arquivos **disjuntos** do client e não tocam motor, trava, migration, `ACAO_PERFIS` nem servidor — são galhos de verdade
(nenhum erro de interpretação de um exige retrabalho no outro). Só Jest (sem SQLite): podem rodar na mesma árvore, mas **sabotagem
concorrente contamina a suíte do outro** (memória do projeto): se forem em paralelo, sabotagem e restauro **só** no arquivo da própria task, e a
suíte completa do client só depois que os dois restauraram (`cmp`). Na dúvida, sequencial: T1 → T2.

### T1 (galho) — a linha da entrega da ficha quebra por largura

Arquivos: `client/src/utils/fichaEpiPdf.js`, `client/src/utils/fichaEpiPdf.test.js`.

1. **Vermelho primeiro.** No teste, as colunas são **literais** (`const COLUNAS_FICHA = [14, 32, 82, 102, 121, 131, 143, 168]` — é o contrato; se o
   código mudar o layout sem mudar o plano, o teste tem de cair). Réguas novas (medidas com o `jest.requireActual('jspdf')`, como a `textosFora`):
   - `textosForaDaFolha()` — **toda** chamada `text`, na fonte corrente gravada (`setFontSize`), com `x + largura > 196` (generaliza a
     `textosFora` da 183, que passa a ser ela; os testes da 183 continuam usando-a);
   - `celulasInvasoras()` — toda `text` de fonte 9 cujo `x` está em `COLUNAS_FICHA` **e** cujo `y` é de uma linha da tabela (depois do primeiro
     cabeçalho), com `x + largura > (i < 7 ? COLUNAS_FICHA[i + 1] - 1 : 196)`;
   - `celulasDaEntrega(k)` — as linhas desenhadas de cada coluna na k-ésima entrega (agrupadas por x, entre a divisória anterior e o hash).
   Testes:
   - `[RN-185.01]` entrega com `entregue_por_nome: 'Maria Aparecida dos Santos Oliveira'`, `material_nome` de 70 car.
     (`'Mascara de solda automatica escurecimento DIN 9-13 com regulagem'`), `ca_numero: 'W'.repeat(20)`, `tamanho: 'Tamanho especial XGG'` →
     `celulasInvasoras()` vazio **e** metade positiva: *Entregue por* tem 2 linhas, EPI ≥ 2;
   - `[RN-185.02]` mesma entrega + uma com `motivo: 'PRIMEIRA_ENTREGA'` → para cada coluna, `linhas.join('').replace(/\s/g, '') ===
     textoDoDescritor.replace(/\s/g, '')`; o texto `Primeira entrega` aparece **inteiro** numa chamada `text`;
   - `[RN-185.03]` `ENTREGA` (TROCA, `Joao Almoxarife`) e a variante `PRIMEIRA_ENTREGA` → cada célula é **um** `text`; os x do cabeçalho
     e das células são `COLUNAS_FICHA`; nenhum `text` de fonte 9 em x = 28;
   - `[RN-185.04]` montagem da 183 (2 com imagem + 4 sem, `user_agent: 'curto'`; divisória da 6ª em **229** — conferida) e a 7ª com
     `entregue_por_nome: 'W'.repeat(60)` e imagem → `conferirRodape()` vazio (régua **antes** da contagem de páginas, como na 183) e
     `addPage` 1; e numa entrega solta com *Entregue por* de 3 linhas: o hash (`Entrega … registro`) em `y_linha + 12`;
   - `[RN-185.05]` colaborador de nome com 90 car. → `textosForaDaFolha()` vazio; o título em ≥ 2 `text` de fonte 14; o 1º `text` do cabeçalho
     da tabela tem y maior que o do último texto do cabeçalho da ficha;
   - `[RN-185.06]` o pior caso da 183 (8 entregas de 300 `W`, matrícula de 88) **mais** os campos longos da RN-185.01 em todas, com e sem imagem
     → `textosForaDaFolha()` e `celulasInvasoras()` vazios, `conferirRodape()` vazio.
2. Rodar e ver vermelho **pelo motivo certo**: `Entregue por` em 214,0 / 227,x na régua; `Primeira entreg`; x antigos (34, 86…). Os que
   passarem de primeira (ex.: a régua do rodapé com n = 1) são guardas de regressão — provar pelos controles.
3. Implementar conforme o contrato (COLUNAS, `splitTextToSize` por célula, `4·n`, cabeçalho quebrado). Comentário no código citando
   B1208/B1215/B1216 e o porquê (prova da NR-6, nada perdido).
4. **Controles positivos** (sabotagem por `perl` com âncora contada = 1, md5 antes/sabotado/restaurado, restauro por cópia `e185-t1-*`, `cmp`):
   - (c1) voltar ao corte de hoje (`pdf.text(String(c).slice(0, …), COLUNAS[i], y)`, uma linha) → caem RN-185.01 (na régua, *Entregue por* fora)
     e RN-185.02 (`Primeira entreg`);
   - (c2) quebrar mas desenhar **só a 1ª linha** (`linhasCelula[i].slice(0, 1)`) → cai **RN-185.02** (junção ≠ texto), e **não** a régua de margem
     — prova que a RN-185.02 não é a RN-185.01 com outro nome;
   - (c3) altura com `4` fixo (n ignorado) e desenho com `4·n` → cai **RN-185.04** na régua do rodapé (divisória ≈ 295 > 287);
   - (c4) `util` sem a folga (`COLUNAS[i + 1] - COLUNAS[i]`) → cai RN-185.01 em `celulasInvasoras` (se nenhum caso encostar no último milímetro,
     **aumentar o caso até cair** — teste que não sabe falhar não vale; registrar o caso usado);
   - (c5) colunas antigas (`[M, M + 20, …, M + 162]`) com a quebra nova → cai RN-185.03 (`Joao Almoxarife` e `Primeira entrega` em 2 `text`) e a
     montagem do 229;
   - (c6) título sem quebra (`pdf.text(doc.titulo, M, y)`) → cai RN-185.05 em `textosForaDaFolha` com fonte 14.
5. `CI=true npx react-scripts test src/utils/fichaEpiPdf src/components/almoxarifado/EpiAlmoxarifado --watchAll=false` — o
   `EpiAlmoxarifado.test.js` (que gera a ficha pela tela) **sem** mudança de asserção; se cair, é achado, não ajuste.

### T2 (galho) — o termo de ferramenta quebra por largura

Arquivos: `client/src/utils/termoFerramentaPdf.js`, `client/src/utils/termoFerramentaPdf.test.js`,
`client/src/components/almoxarifado/FerramentasAlmoxarifado.test.js` (só o gravador do `jspdf`).

1. **Gravadores primeiro** (sem mudar asserção): os dois `jest.mock('jspdf', …)` passam a mandar `getTextWidth`/`splitTextToSize`/`setFontSize`
   para um jsPDF real (cópia do molde `EpiAlmoxarifado.test.js:43-58`, com o `console.error` calado só no carregamento). Rodar os dois arquivos
   **verdes antes** de qualquer mudança de produção (o gravador novo não pode mudar resultado).
2. **Vermelho primeiro:**
   - `[RN-185.07]` `quebrarTexto(texto, 182, medirFonte10)` com o texto em CAIXA ALTA da sonda e com 200 `W` → toda linha `medir ≤ 182`;
     junção por parágrafo sem espaços = parágrafo sem espaços; `'a\n\nb'` mantém a linha em branco; os testes de hoje de `quebrarTexto`
     (contagem) continuam passando;
   - `[RN-185.07]` `gerarTermoFerramentaPdf` com o texto em CAIXA ALTA → régua `textosForaDaFolha` (a mesma da T1, copiada — os arquivos de
     teste não importam um do outro) vazia; metade positiva: ≥ 2 linhas de texto em fonte 10;
   - `[RN-185.08]` `criado_por_nome` de 44 car., `colaborador.nome` de 60, `ferramenta.nome` de 80 e `matricula` de 60 → régua vazia; a
     junção das linhas de cada identificação = a frase (sem espaços);
   - `[RN-185.09]` `montarTermoFerramenta(DADOS).texto === TEXTO` e sem a chave `linhasTexto` (os testes `:45` e `:57` passam a conferir `texto`
     — **mudança de contrato do descritor, intencional**; registrar na Execução);
   - os testes de hoje do termo (`'Declaro que recebi a ferramenta.'` como um `text`, o aviso de provisório, o hash, a matrícula confirmada)
     **sem mudança** de asserção, e o da tela (`FerramentasAlmoxarifado.test.js:909-913`) também.
3. Implementar conforme o contrato.
4. **Controles positivos:**
   - (c1) desenho com `quebrarTexto(doc.texto, 95)` (contagem) → cai RN-185.07 na régua (CAIXA ALTA ≈ 210,6);
   - (c2) palavra longa cortada por contagem (`palavra.slice(0, largura)`) mesmo com `medir` → cai o dos 200 `W`;
   - (c3) linha de devolução sem `splitTextToSize` → cai RN-185.08 (≈ 199,9 com o nome de 44);
   - (c4) `quebrarTexto` que descarta a última linha do parágrafo → cai a junção da RN-185.07 (e não a régua).
5. `CI=true npx react-scripts test src/utils/termoFerramentaPdf src/components/almoxarifado/FerramentasAlmoxarifado --watchAll=false`.

### T3 — integração pelas telas e sonda real

Não há rota nova: a integração que cruza os galhos é **tela → resposta HTTP real → gerador → réguas**, nos dois documentos.

- **Ficha pela tela:** em `EpiAlmoxarifado.test.js` (gravador já mede), um teste que abre a ficha com a resposta da fronteira HTTP montada a
  partir da **fixture real** `client/src/utils/__fixtures__/fichaEpi.rota.json` (gravada pela rota na 183) com `entregue_por_nome`,
  `material_nome` e `motivo: 'PRIMEIRA_ENTREGA'` sobrescritos por valores longos, clica **Gerar PDF** e confere `celulasInvasoras()` e
  `textosForaDaFolha()` vazios e `Primeira entrega` inteiro. (Réguas copiadas no arquivo; não importar de outro teste.)
- **Termo pela tela:** em `FerramentasAlmoxarifado.test.js`, o fluxo de `:909` (abrir o termo → **PDF do termo**) com texto da versão em CAIXA
  ALTA e `criado_por_nome` de 44 car. → régua vazia.
- **Controle positivo cruzado:** a sabotagem (c1) da T1 derruba o teste da tela da ficha; a (c1) da T2 derruba o da tela do termo.
- **Sonda real depois** (`p185-sonda-pos.js` no scratchpad, molde `fix183-sonda-real.js`): lê `COLUNAS` e a `quebrarTexto` **do arquivo de
  produção** (regex) e, com o jsPDF real do Node, mede os casos da Fase 0 no layout novo — registrar na Execução o maior x final por coluna e
  do termo, e a junção = texto em todos.
- Suítes no fim (sequenciais, uma vez cada): Jest inteiro e `CI=true build` (client); `test:api`, `test:almoxarifado`, `test:validation`,
  `test:safealter`, `test:sqlite` (servidor — a etapa não toca o servidor; rodam para provar que nada mudou). Citar os números reais.

### T4 — Fase 5 e fechamento (skill `fechar-etapa`)

Revisão adversarial fresca com sonda executada (memória: *no motor/desenho, sonda executada acha o que leitura e suíte verde não acham*).
Pergunta obrigatória à revisão: **algum texto da ficha ou do termo, em alguma fonte, ainda é desenhado sem medida?** (`grep -n "pdf.text("` nos dois
arquivos e conferir cada um.)

Fechamento: spec 25 (B1208 resolvido, com hash) e a spec das ferramentas (termo); mapa; guia do usuário (roteiro: entregar EPI com quem entregou de
nome comprido e motivo *Primeira entrega* → Ficha → Gerar PDF → conferir o nome inteiro, dentro da folha, e a linha mais alta; termo com texto em
caixa alta); novidades (seção da Etapa 185, letras B abaixo; **C444 → ✅ RESOLVIDO NA ETAPA 185**, corrigindo-a para nomear as quatro colunas — a
divergência 2 da Fase 0); este plano com a próxima tarefa detalhada.

## Letra B proposta (para `docs/almoxarifado-novidades-por-etapa.md`)

- **B1215 — Célula comprida QUEBRA em linhas (a linha da entrega cresce); nada é truncado.** **Escolhido:** quebrar a célula em quantas linhas
  precisar e medir a altura da entrega com isso (a régua de página da 183, `y + altura ≤ 287`, passa a contar as linhas da célula mais alta).
  **Descartado:** (a) truncar com reticências (`Maria Aparecida dos…`) — a ficha é prova da NR-6 e o nome de quem entregou, o EPI e o CA são
  justamente o que a auditoria lê: um papel que esconde parte do nome não prova quem entregou; (b) diminuir a fonte até caber — sem limite de
  tamanho nos cadastros, chegaria a ilegível; (c) folha em paisagem — muda o documento inteiro e só adia o problema. **Reversível.**
- **B1216 — As colunas da tabela foram redistribuídas (medidas).** x = 14, 32, 82, 102, 121, 131, 143, 168: Data, CA, Validade, Qtd e Tam.
  cederam espaço que não usavam para Motivo (24 mm) e Entregue por (28 mm). Assim `Primeira entrega` (hoje cortado em `Primeira entreg`) e
  `Joao Almoxarife` cabem numa linha. **Descartado:** manter as colunas e só quebrar — a linha mais comum da ficha (primeira entrega) ficaria
  com 2 linhas em toda entrega. **Reversível.**
- **B1217 — A célula quebra por PALAVRA; só palavra maior que a coluna quebra por letra.** Nome de pessoa e de EPI se leem melhor inteiros
  por palavra. É diferente do aparelho (B1207, corte por letra), porque lá a junção literal das linhas tem de ser o texto do lacre; aqui a
  garantia é *nenhuma letra perdida* (a quebra só come o espaço entre palavras). **Descartado:** cortar por letra também nas células
  (`Joao Almox|arife`). **Reversível.**
- **B1218 — O cabeçalho da ficha (título, nome, setor, aviso) também quebra por largura.** Medido: nome do colaborador com ~66+ letras já
  passava da margem no título. **Descartado:** deixar para outra etapa (mesmo arquivo, mesma régua, mesmo documento de prova). **Reversível.**
- **B1219 — O termo de responsabilidade de ferramenta entra nesta etapa.** Medido: o texto do termo em caixa alta ia a 210,6 mm (a folha tem
  210) e a linha *Registrado por* com nome de 44 letras a 199,9. É prova assinada como a ficha. A régua do texto do termo passa a ser a largura
  medida (o corte de 95 letras continua sendo o padrão da função, sem uso no desenho). **Descartado:** só registrar. **Reversível.**
- **B1220 — Remessa a terceiros, posição do cliente e etiquetas ficam FORA.** Medido: na remessa e na posição, o código do material invade a
  coluna Material (64,3 mm com a coluna acabando em 44; 40,5 com 40) e o nome do material é cortado em 40/34 letras. **Motivo:** não são o
  documento de prova da NR-6 nem de assinatura eletrônica; têm layout e quebra de página próprios; a etapa fica curta. As etiquetas já medem
  (`maxWidth`/`splitTextToSize`) e cortam o nome em 2 linhas por decisão (espaço físico). **Candidato:** etapa curta reaproveitando o padrão
  desta (aviso de operação novo **C445** no fechamento, se a remessa assinada pelo terceiro for considerada prova). **Reversível.**
- **B1221 — Quantidade com 6+ dígitos quebra em 2 linhas na coluna Qtd (9 mm).** Aceito: entrega de EPI com 100 000 unidades não é plausível;
  até 99 999 cabe. **Descartado:** alargar Qtd tirando do EPI (a coluna que mais quebra). **Reversível.**
- **B1222** — a próxima etapa (preenchida no fechamento).

## Emendas da Fase 2

*(a preencher pela revisão fresca do plano — Fase 2 da skill `desenvolver-etapa-almoxarifado`. Prevalecem sobre as regras e as tasks acima.)*

## Execução

*(vazia — a preencher pelas tasks, com hash, vermelho antes, controles e suítes.)*
