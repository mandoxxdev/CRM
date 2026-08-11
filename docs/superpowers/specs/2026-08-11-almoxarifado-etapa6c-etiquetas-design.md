# Almoxarifado — Etapa 6c: Etiquetas com QR Code (design)

> **Data:** 2026-08-11 · **Status:** aprovado (decisões pela recomendação do assistente, com
> autorização prévia do usuário nesta sessão) · **Briefing de origem:** seção final de
> `docs/superpowers/plans/2026-08-11-almoxarifado-etapa6b-series.md`
> **Feature:** `specs/modulo-almoxarifado/10-lotes-series-etiquetas` (parte 6c — a última)

## O problema

Lote e série existem como entidades reais desde as Etapas 6/6b, mas só na tela: um item físico no
galpão não carrega nenhuma identificação que aponte de volta para o sistema. A 6c fecha o ciclo:
etiqueta em PDF (imprimir, recortar, colar) com o essencial legível a olho nu e um QR Code que
abre a tela do item já filtrada.

## Decisões (perguntas do briefing + resposta recomendada adotada)

1. **Térmica ou A4?** O cliente ainda não foi consultado sobre a impressora do galpão (o briefing
   marca esta como a primeira pergunta). **Adotado: A4 com grade de etiquetas** como formato
   padrão — funciona em qualquer impressora comum com folha adesiva; o gerador é **parametrizado
   por formato** (constante `FORMATOS_ETIQUETA`), e uma **térmica 100×50 mm** (1 etiqueta por
   página) já nasce como segunda opção do seletor, porque com o gerador parametrizado ela custa
   uma constante. Quando o cliente disser qual impressora usa, ajustar é acrescentar/ajustar uma
   entrada na tabela, não redesenhar. **Pergunta registrada para o cliente:** qual impressora e
   qual etiqueta física o galpão usa?
2. **O que imprime vs o que o QR carrega.** Etiqueta mostra o mínimo legível: **código GMP em
   fonte grande**, nome do material truncado, e a linha do controle — lote (`Lote X · Val
   dd/mm/aaaa` quando houver) ou série (`SN: Y`). Todo o resto vive atrás do QR. Overload de
   informação é o erro que o briefing manda evitar.
3. **QR codifica URL do sistema** (opção (a) do briefing): quem lê cai na tela "Lotes e Séries"
   do material, na aba certa, com a linha do lote/série destacada. Exige login — comportamento
   correto para dado de estoque; sem sessão, o app já leva ao login. Payload autocontido (opção b)
   foi descartado: desatualiza depois de impresso.
4. **PDF e QR gerados no client.** `jspdf` já é dependência e tem padrão estabelecido
   (`utils/gerarPDFProposta.js`: função async, `new jsPDF(...)`, primitivas de texto,
   `doc.save(nome)`). Única dependência nova da etapa: **`qrcode`** no client (gera data-URL PNG
   no navegador — o primeiro uso de `doc.addImage` do projeto). `window.location.origin` resolve
   a base da URL sem configuração nova. Server intocado — pdfkit/puppeteer ficam para quando uma
   etiqueta precisar de dado que só o servidor tem.
5. **Qual etiqueta oferecer: inferência pelas flags** (recomendação do próprio briefing) —
   `controle_serie` → etiqueta por série; senão `controle_lote` → por lote; senão → etiqueta
   simples de material. Sem tabela nova de regras por tipo.
6. **Sem registro de impressão** (YAGNI): reimpressão é livre; auditoria de impressão não foi
   pedida e criaria escritor sem leitor. Declarado.
7. **Fora do escopo** (declarar na spec 10): etiqueta de retalho (feature 15, sem UI ainda);
   leitura por coletor/app (o QR abre o navegador do celular, que é o hardware que já existe);
   etiqueta de localização/prateleira (nasceu no briefing como "possivelmente" — cortada: o mapa
   de localizações já cumpre o papel e a etiqueta avulsa de material cobre o caso comum).

## Abordagens consideradas

**A (adotada) — util client puro + modal compartilhado + botões nas telas.** Camadas:
`utils/etiquetasPdf.js` (montadores de descritor + renderizador jspdf, funções puras testáveis),
`components/almoxarifado/EtiquetasPdfModal.js` (formato + cópias + gerar), botões em 3 telas.
Prós: zero servidor, dados já presentes nas telas, testável sem tocar PDF binário. Contras: sem
auditoria de impressão (decisão 6) e QR depende do origin do navegador (aceitável: o sistema é
acessado pela mesma origem).

**B (rejeitada) — puppeteer server (HTML→PDF).** Tipografia melhor e layout em CSS, mas exige
rota nova, base-URL configurada no servidor para o QR, e o peso do puppeteer para um documento
que é texto + 1 imagem. Nada na etiqueta exige HTML.

**C (rejeitada) — pdfkit server.** Mesmo problema de base-URL + lib de QR Node nova + rota nova,
sem nenhum ganho sobre o jspdf client para um layout desta simplicidade.

## Componentes

### 1. `client/src/utils/etiquetasPdf.js` (novo — funções puras + renderizador)

```js
export const FORMATOS_ETIQUETA = {
  A4_GRADE: {  // padrão: folha adesiva A4, 2 colunas × 5 linhas (~99×57mm por etiqueta)
    label: 'Folha A4 (10 etiquetas por página)',
    page: { format: 'a4', orientation: 'portrait' },
    grade: { colunas: 2, linhas: 5, largura: 99, altura: 57, margemX: 6, margemY: 10.5 },
  },
  TERMICA_100x50: {  // rolo térmico 100×50mm, 1 etiqueta por página
    label: 'Térmica 100×50 mm (1 por página)',
    page: { format: [100, 50], orientation: 'landscape' },
    grade: { colunas: 1, linhas: 1, largura: 100, altura: 50, margemX: 0, margemY: 0 },
  },
};

// Descritor de etiqueta — a moeda entre montadores, modal e renderizador:
// { codigo, nome, linhaControle, qrUrl }

export function montarEtiquetaMaterial(material, origin)            // → descritor (sem lote/série)
export function montarEtiquetaLote(material, lote, origin)          // → descritor (Lote X · Val …)
export function montarEtiquetaSerie(material, serie, origin)        // → descritor (SN: …)
export function montarEtiquetasDoRecebimento(itens, materiais, origin) // → descritores[] por item:
//   controle_serie → 1 por número em item.series (split /\r?\n/); controle_lote → 1 do lote
//   (item.lote + item.data_validade_lote); senão → 1 de material. Item sem entrada (qtd 0) fica fora.

export async function gerarEtiquetasPDF({ formato, etiquetas, copias = 1 })
//   expande cópias, gera QR por descritor (lib qrcode → toDataURL), pagina pela grade do formato,
//   desenha (codigo bold grande, nome truncado via splitTextToSize, linhaControle, QR à direita,
//   borda pontilhada de recorte no A4) e doc.save('etiquetas-<data>.pdf')
```

URLs geradas (dialeto `material_id`, o mesmo das telas existentes):
- material → `{origin}/almoxarifado/materiais?material_id={id}` *(a tela de materiais ganha
  leitura one-shot desse param para pré-filtrar a busca — molde `MateriaisAlmoxarifado.js:40-48`)*
- lote → `{origin}/almoxarifado/lotes?material_id={id}&aba=LOTES&lote={codigo}`
- série → `{origin}/almoxarifado/lotes?material_id={id}&aba=SERIES&serie={numero}`

### 2. Deep-link + destaque em "Lotes e Séries" (`LotesAlmoxarifado.js`)

Lazy-init dos estados a partir da URL (molde `ConfiguracoesAlmoxarifado.js:197` /
`MateriaisAlmoxarifado.js:40-48` — leitura one-shot, sem escrita de volta):

```js
const [searchParams] = useSearchParams();
const [materialId, setMaterialId] = useState(() => searchParams.get('material_id') || '');
const [aba, setAba] = useState(() => (searchParams.get('aba') === 'SERIES' ? 'SERIES' : 'LOTES'));
```

Destaque: `lote`/`serie` do query param guardados num estado one-shot; a linha cujo
`codigo`/`numero` bate recebe background de destaque (mesmo tom do `selectedId` em
RequisicoesList). Nenhum efeito muda — ambos já reagem a `materialId`/`aba`.

### 3. `client/src/components/almoxarifado/EtiquetasPdfModal.js` (novo — compartilhado)

Props: `{ etiquetas, onClose }`. Renderiza: select de formato (FORMATOS_ETIQUETA), input de
cópias (só para etiqueta única; lista de recebimento imprime 1 de cada), contagem
("N etiqueta(s) · M página(s)"), botão Gerar → `gerarEtiquetasPDF` → toast de sucesso/erro →
onClose. Molde de modal: os existentes da tela de Lotes. **O último formato escolhido persiste
em `localStorage` (`almox_etiqueta_formato`)** — o usuário confirmou em 2026-08-11 que a térmica
é o caminho provável do galpão, então quem usa térmica escolhe uma vez e o modal lembra.

### 4. Botões nas telas

- **`MateriaisAlmoxarifado.js`**: ação por linha (ícone `FiTag`, após "Ver no mapa", gate
  `visualizar`): abre o modal com `montarEtiquetaMaterial` — ou, se o material tem
  `controle_lote`/`controle_serie`, navega para "Lotes e Séries" filtrado (etiqueta certa mora
  lá; etiqueta de material sem o lote/série seria meia-etiqueta).
- **`LotesAlmoxarifado.js`**: ação por linha de lote (`montarEtiquetaLote`) e por linha de série
  (`montarEtiquetaSerie`); na aba Séries, botão "Etiquetas das séries em estoque" (todas as
  `EM_ESTOQUE` listadas → uma etiqueta cada).
- **`RecebimentosAlmoxarifado.js`**: nota `PROCESSADO`/`APROVADO` — hoje o painel de ações some
  (early-return em `renderAcoes`); ganha o ramo pós-processamento com botão largo "Imprimir
  etiquetas dos itens" → `montarEtiquetasDoRecebimento(detalhe.itens, materiais, origin)`.
  Usa o texto `item.series`/`item.lote` que o payload do detalhe já carrega — **sem rota nova**;
  a rota "séries por recebimento" fica registrada como pendência de robustez na spec 10 (o texto
  digitado é a fonte hoje; se divergir do que o motor criou, a etiqueta segue o texto).

## Erros

- Modal sem etiqueta nenhuma (ex.: recebimento só com itens qtd 0): botão desabilitado com
  explicação curta.
- Falha na geração do QR/PDF: toast de erro (padrão das telas do almoxarifado; não usar `alert`
  do util de proposta).

## Testes

- **`etiquetasPdf.test.js`** (novo, molde utils): montadores puros — material/lote/série geram
  descritor e URL certos (dialeto `material_id`, aba, destaque); recebimento com item por série
  (3 números → 3 descritores), por lote (1), sem controle (1), qtd 0 (0); truncamento de nome.
  `gerarEtiquetasPDF` com `jspdf` e `qrcode` mockados: paginação da grade (11 etiquetas em A4 →
  2 páginas), cópias, nome do arquivo.
- **`LotesAlmoxarifado.test.js`**: describe novo — deep-link (`?material_id=X&aba=SERIES&serie=Y`
  inicializa material/aba e destaca a linha) e ação de etiqueta abrindo o modal.
- **Controle positivo** em cada arquivo novo (regra da casa).
- Suíte client inteira + `CI=true build` como gate.

## Documentação no fim da etapa

Spec 10 (checklist 6c com hashes; feature 10 vira ✅ completa exceto pendências declaradas),
README mestre (linha 10 + critério de aceite; próxima etapa da ordem = Etapa 7, transferências e
devoluções), guia (seção 6c com roteiro clicável), plano da 6c com a próxima tarefa detalhada.
