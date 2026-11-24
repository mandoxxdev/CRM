# Proposta bilíngue (PT-BR + inglês ou espanhol), moeda e incoterm

**Status:** 🟡 entregue em 24/11/2026, sem teste de clique de usuário e sem a suíte completa (`npm run test:api`) nesta máquina — ver
"Verificação" no plano. Estimativa `docs/estimativas/2026-11/estimativa_2026-11-24_proposta-bilingue.txt` (10h); plano
`docs/superpowers/plans/2026-11-24-propostas-etapa1-proposta-bilingue.md`. **O que falta para 🟢:** um vendedor gerar uma proposta real em
inglês no Chrome (o `Translator` só foi exercitado com um tradutor falso: no navegador embutido ele exige gesto do usuário) e a suíte
completa rodar verde.

**Esta spec foi revista pela Fase 2 (24/11/2026):** a versão anterior punha a tradução dentro do documento editável e a correção "na coluna
traduzida" — isso corrompia o salvamento (C1–C3 do plano). O editor ficou só em PT; o bilíngue é uma renderização somente leitura e a
correção é no painel **Traduções**. As RN abaixo já estão na forma final.

Pedido do Matheus (Comercial), 24/11/2026: *"temos que pensar nas propostas para fora do Brasil, deve ter várias línguas, em preferência
ING/ESP; se for em outra língua deve ser bicolunado. Ter a versão principal em PTBR e a outra na outra língua."*

## Decisões do pedido (respostas dele, 24/11/2026)

1. **Tradução:** *"quero que ao vendedor digitar em ptbr já suba em ESP ou ING… sem api, quero algo sem gastar nada"* e, diante das
   opções de infraestrutura, *"faça algo simples"*.
2. **Layout:** **tudo em duas colunas** — inclusive tabelas e capa — PT-BR à esquerda, a outra língua à direita.
3. **Moeda e incoterm** entram nesta etapa (o banco já tinha `propostas.idioma`, `moeda` e `incoterm`; nenhuma tela os usava e o
   documento os ignorava).

## Decisões técnicas (reversíveis) e o que foi descartado

- **Tradutor do próprio Chrome** (`Translator` API, no PC do vendedor): grátis, sem chave, sem servidor, sem download feito pelo CRM.
  Descartados no spike de 24/11/2026: modelo local OPUS-MT/NLLB no servidor (~1 GB de memória, ~5 s por frase, **não roda no Alpine**
  da produção, e invertia CONTRATANTE→"CONTRACTOR"); serviço de tradução separado (LibreTranslate) e API paga (fora do "sem gastar").
  Consequência aceita: **a tradução automática só acontece no Chrome**; em outro navegador a coluna traduzida é preenchida à mão.
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
- **RN-BI.03** — Um parágrafo e a sua tradução nunca ficam em páginas diferentes; uma linha de tabela também não.
- **RN-BI.04** — Texto fixo do documento sai do dicionário; o que vem de dado (cláusulas, itens, variáveis, título) sai da memória de
  tradução. Sem tradução na memória, a coluna da outra língua mostra o PT-BR marcado como *pendente de tradução* — o documento nunca sai
  com a metade em branco calada.
- **RN-BI.05** — No painel **Traduções** do preview, **Traduzir pendentes** (o clique é o gesto que o Chrome exige) traduz o que estiver
  pendente com o tradutor do Chrome e grava na memória (`origem = 'auto'`). *(Esta linha dizia "ao abrir o preview no Chrome" — sem gesto o
  Chrome não baixa a língua na primeira vez; corrigido pela Fase 2, I11.)*
- **RN-BI.06** — O vendedor corrige a tradução no painel **Traduções**; a correção grava `origem = 'manual'` e **não** é sobrescrita por
  tradução automática. *(Dizia "na coluna traduzida do preview" — corrigido pela Fase 2, C1–C3.)*
- **RN-BI.07** — Os termos do glossário saem sempre com a tradução fixa, na tradução automática.
- **RN-BI.08** — A moeda da proposta (`BRL` padrão, `USD`, `EUR`) formata todos os valores da tabela de preços, em qualquer idioma; no
  bilíngue cada metade no formato da sua língua (`US$ 1.000,00` | `$1,000.00`). Marcadores `{{…}}` de valor nas cláusulas continuam em real
  (o motor de marcadores é outro; não coberto).
- **RN-BI.09** — O incoterm (código + local, ex.: *FOB – Porto de Santos*) sai junto da tabela de preços quando preenchido.
- **RN-BI.10** — A tabela FINAME/BNDES não sai em proposta `en`/`es`.

## Checklist (hashes no plano e no commit da etapa)

- [x] 1. Idioma, moeda e incoterm no cadastro da proposta — `PropostaForm.js` + `idiomaProposta.js` (`6f80f20c`); validação no POST/PUT (`40cb21ff`)
- [x] 2. Textos fixos do documento em inglês e espanhol — dicionário em `server/propostaBilingue.js` (`40cb21ff`)
- [x] 3. Duas colunas — capa, textos e cláusulas — `propostaPremiumV2.js`, tudo atrás de `bi` (`b8bd5add`)
- [x] 4. Duas colunas — tabelas (preços com 10 colunas, fiscais) (`b8bd5add`)
- [x] 5. Tradução automática no Chrome, memória e correção — `traducoes` + `POST /api/traducoes` (`40cb21ff`) + painel **Traduções** (`6f80f20c`)
- [x] 6. Moeda e incoterm na tabela de preços; FINAME fora (`b8bd5add`)
- [ ] 7. Teste de clique de um vendedor com uma proposta real no Chrome — **não feito** (ver Status)
