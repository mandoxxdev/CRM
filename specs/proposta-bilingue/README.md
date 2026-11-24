# Proposta bilíngue (PT-BR + inglês ou espanhol), moeda e incoterm

**Status:** 🟡 entregue em 24/11/2026, sem teste de clique de usuário e sem a suíte completa (`npm run test:api`) nesta máquina — ver
"Verificação" no plano. Estimativa `docs/estimativas/2026-11/estimativa_2026-11-24_proposta-bilingue.txt` (10h); plano
`docs/superpowers/plans/2026-11-24-propostas-etapa1-proposta-bilingue.md`. **O que falta para 🟢:** um vendedor gerar uma proposta real em
inglês no Chrome (o `Translator` só foi exercitado com um tradutor falso: no navegador embutido ele exige gesto do usuário) e a suíte
completa rodar verde.

**Esta spec foi revista pela Fase 2 (24/11/2026):** a versão anterior punha a tradução dentro do documento editável e a correção "na coluna
traduzida" — isso corrompia o salvamento (C1–C3 do plano). O editor ficou só em PT; o bilíngue é uma renderização somente leitura e a
correção é no painel **Traduções**. As RN abaixo já estão na forma final.

**Revista de novo em 24/11/2026 (noite):** "somente leitura" deixou de valer para o texto das cláusulas — o usuário: *"eu devo poder mudar
todos os textos e depois ele traduz de forma simultânea"*. Os parágrafos e itens das cláusulas, na coluna em português, se editam na
própria tela de duas colunas (RN-BI.11). O que corrompia o salvamento (o editor do português lendo o documento bilíngue) continua
proibido: a edição bilíngue grava por outra rota, trocando o trecho exato na cláusula.

Pedido do Matheus (Comercial), 24/11/2026: *"temos que pensar nas propostas para fora do Brasil, deve ter várias línguas, em preferência
ING/ESP; se for em outra língua deve ser bicolunado. Ter a versão principal em PTBR e a outra na outra língua."*

## Decisões do pedido (respostas dele, 24/11/2026)

1. **Tradução:** *"quero que ao vendedor digitar em ptbr já suba em ESP ou ING… sem api, quero algo sem gastar nada"* e, diante das
   opções de infraestrutura, *"faça algo simples"*.
2. **Layout:** **tudo em duas colunas** — inclusive tabelas e capa — PT-BR à esquerda, a outra língua à direita.
3. **Moeda e incoterm** entram nesta etapa (o banco já tinha `propostas.idioma`, `moeda` e `incoterm`; nenhuma tela os usava e o
   documento os ignorava).

## Decisões técnicas (reversíveis) e o que foi descartado

- **Tradutor no SERVIDOR** (desde 24/11/2026, noite — `services/tradutorWeb.js`, `POST /api/traducoes/automatica`): o endereço público e
  gratuito do Google Tradutor (`translate_a/t?client=gtx`, sem chave), em lote. Funciona em **qualquer navegador**. O pedido: *"erro na
  tradução, deve funcionar em qualquer navegador"* — o usuário recebeu "precisa do Chrome atualizado".
  **Esta linha dizia "Tradutor do próprio Chrome … consequência aceita: a tradução automática só acontece no Chrome" e deixou de valer.**
  O tradutor do Chrome (`Translator` API) ficou só como **reserva** no painel Traduções, se o servidor falhar.
  Consequência aceita (reversível: `TRADUTOR_WEB_URL` aponta para outro serviço com o mesmo formato): o texto das cláusulas sai do
  servidor para o Google; os dados do cliente não (a chave da memória é o texto antes da troca dos marcadores `{{…}}`). Endereço não
  oficial: pode limitar ou mudar sem aviso — aí a tela avisa e o texto fica pendente.
  Continuam descartados: modelo local OPUS-MT/NLLB no servidor (~1 GB de memória, ~5 s por frase, **não roda no Alpine** da produção,
  e invertia CONTRATANTE→"CONTRACTOR"); LibreTranslate e API paga (fora do "sem gastar").
- **Memória de tradução no servidor** (`traducoes`, por idioma e texto de origem): cada texto é traduzido uma vez; texto em PT mudou →
  é outro texto, traduz de novo; a correção do vendedor (`origem = 'manual'`) vence a automática e vale para as próximas propostas.
- **Textos fixos do documento** (capa, títulos, cabeçalhos, assinatura) num **dicionário no código**, não no tradutor: o PDF é gerado no
  servidor, sem Chrome, e esses textos não podem depender de alguém ter aberto o preview.
- **Glossário** aplicado antes/depois do tradutor para os termos de contrato que o tradutor erra (CONTRATANTE, CONTRATADA, ESCOPO DE
  FORNECIMENTO, nota fiscal…).
- **Paginação:** o paginador do template mede e divide **bloco a bloco** no navegador. Para nunca separar um parágrafo da sua tradução,
  o texto bilíngue sai em **linhas pareadas** (um parágrafo por linha, duas metades); a tabela sai com as colunas das duas línguas na
  **mesma linha** (continua dividida por linha, como hoje).
- **FINAME/BNDES** não sai na proposta em outro idioma (financiamento brasileiro). **Tabelas fiscais** (NCM, IPI, ICMS) continuam,
  com cabeçalho traduzido — exportação tem outra tributação, mas isso é outra etapa.

## Regras de negócio

- **RN-BI.01** — A proposta tem idioma `pt-BR` (padrão, documento como hoje), `en` (PT-BR + inglês) ou `es` (PT-BR + espanhol).
  Proposta existente sem idioma = `pt-BR`. Em `pt-BR` **em real** o documento sai **idêntico** ao de antes desta etapa, byte a byte.
- **RN-BI.02** — Em `en`/`es`, todo o documento sai em duas colunas: PT-BR à esquerda, a outra língua à direita.
- **RN-BI.03** — Um parágrafo e a sua tradução nunca ficam em páginas diferentes; uma linha de tabela também não. **E terminam juntos**
  (24/11/2026: "tem que sempre forçar a ficar parecido ambos, para dar simetria"): a metade mais alta tem a escala reduzida (piso 88%) e a
  entrelinha compensada até a altura da outra, no momento em que o paginador posiciona o bloco.
- **RN-BI.04** — Texto fixo do documento sai do dicionário; o que vem de dado (cláusulas, itens, variáveis, título) sai da memória de
  tradução. Sem tradução na memória, a coluna da outra língua mostra o PT-BR marcado como *pendente de tradução* — o documento nunca sai
  com a metade em branco calada. O pendente é marcado só com cor e fundo (o texto "(tradução pendente)" e o itálico alargavam a coluna e
  abriam buracos na outra — 24/11/2026, noite).
- **RN-BI.05** — A tradução é **automática e em qualquer navegador**: o que estiver pendente é traduzido pelo **servidor** e gravado
  (`origem = 'auto'`) ao abrir o preview, ao **Salvar alterações**, ao **Ver em duas colunas** e ao **Baixar PDF**, sem clique.
  **Traduzir pendentes** no painel continua existindo (com o Chrome como reserva). Servidor sem resposta → aviso na tela, texto pendente.
  *(Esta linha dizia "pelo tradutor do Chrome … o tradutor é criado dentro do clique" — o usuário, 24/11/2026, noite: "deve funcionar em
  qualquer navegador". Antes dizia só "no painel, Traduzir pendentes" — "a tradução não está automática!!!!!".)*
- **RN-BI.06** — O vendedor corrige a tradução no painel **Traduções**; a correção grava `origem = 'manual'` e **não** é sobrescrita por
  tradução automática. *(Dizia "na coluna traduzida do preview" — corrigido pela Fase 2, C1–C3.)*
- **RN-BI.07** — Os termos do glossário saem sempre com a tradução fixa, na tradução automática.
- **RN-BI.08** — A moeda da proposta (`BRL` padrão, `USD`, `EUR`) formata todos os valores da tabela de preços, em qualquer idioma; no
  bilíngue cada metade no formato da sua língua (`US$ 1.000,00` | `$1,000.00`). Marcadores `{{…}}` de valor nas cláusulas continuam em real
  (o motor de marcadores é outro; não coberto).
- **RN-BI.09** — O incoterm (código + local, ex.: *FOB – Porto de Santos*) sai junto da tabela de preços quando preenchido.
- **RN-BI.10** — A tabela FINAME/BNDES não sai em proposta `en`/`es`.
- **RN-BI.11** — Na tela de duas colunas, cada parágrafo/item de cláusula (coluna PT) é editável; ao salvar, o trecho exato (`data-pt-html`)
  é trocado na cláusula gravada, o pendente é traduzido e a tela recarrega. Texto com marcador `{{…}}`, títulos e textos fixos: só no modo
  português. Trecho que não está mais na cláusula (mudou em outra aba): não grava e avisa.
- **RN-BI.12** — O negrito do PT atravessa para a tradução: a frase vai ao tradutor com o negrito marcado (`data-tr-marcado`) e a tradução
  guarda o negrito como `**…**`, que vira `<strong>` ao montar; parágrafo todo em negrito sai todo em negrito. Tradução sem `**` de frase
  com negrito é refeita (`data-tr-refazer`), aparecendo traduzida enquanto isso e sem contar no aviso de pendentes; a manual não é
  sobrescrita. *(Esta linha dizia "cada trecho em negrito é uma chave própria e a tradução dele é procurada dentro da frase" — errado na
  prática: traduzido sozinho, o trecho sai com outra palavra ("PROJETO CONCEITUAL" → "DISEÑO CONCEPTUAL"; na frase, "PROYECTO
  CONCEPTUAL") e o negrito não aparecia — o usuário: "cadê o negrito na versão em esp". A versão foi testada só com tradução falsa.)*
- **RN-BI.14** — Proposta `en`/`es` traz, antes dos campos de assinatura, a **nota legal** nas duas línguas: prevalece a versão em
  português em caso de divergência. Em `pt-BR`, nada.
- **RN-BI.13** — Nomes de programa e de arquivo (`TERMOS_FIXOS`: Excel, Word, PowerPoint, PDF, DWG, DXF, AutoCAD, Revit, SolidWorks)
  nunca se traduzem; a tradução automática gravada sem o termo é apagada ao subir o servidor e refeita ("Excel" saía "Sobresalir").

## Checklist (hashes no plano e no commit da etapa)

- [x] 1. Idioma, moeda e incoterm no cadastro da proposta — `PropostaForm.js` + `idiomaProposta.js` (`6f80f20c`); validação no POST/PUT (`40cb21ff`)
- [x] 2. Textos fixos do documento em inglês e espanhol — dicionário em `server/propostaBilingue.js` (`40cb21ff`)
- [x] 3. Duas colunas — capa, textos e cláusulas — `propostaPremiumV2.js`, tudo atrás de `bi` (`b8bd5add`)
- [x] 4. Duas colunas — tabelas (preços com 10 colunas, fiscais) (`b8bd5add`)
- [x] 5. Tradução automática no Chrome, memória e correção — `traducoes` + `POST /api/traducoes` (`40cb21ff`) + painel **Traduções** (`6f80f20c`)
- [x] 6. Moeda e incoterm na tabela de preços; FINAME fora (`b8bd5add`)
- [x] 8. Tradução pelo servidor, em qualquer navegador (`a9fab2fb`); espaçamento igual ao da proposta em português (`749b0fc6`)
- [x] 9. Colunas que terminam juntas e apresentação com a foto e letra maior (`0bc9f116`); assinaturas inteiras no Projeto Conceitual
  (`b737fe0d`); coluna traduzida sem a "caixa" (`89186c1e`); termos fixos (`cc7d407e`); negrito (`c8ef5543`); edição na tela de duas
  colunas (`ada37734`); cores (`6cdbd928`); negrito com o tradutor de verdade (`d4183892`); nota legal (`38b8c821`)
- [ ] 7. Teste de clique de um vendedor com uma proposta real no Chrome — **não feito** (ver Status)
