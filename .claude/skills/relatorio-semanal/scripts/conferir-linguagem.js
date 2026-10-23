#!/usr/bin/env node
// Procura no relatorio palavras que sao "coisa nossa" e nao fazem sentido para quem usa o
// sistema. Sai com codigo 1 se achar alguma — o relatorio nao vai assim.
// Uso: node .claude/skills/relatorio-semanal/scripts/conferir-linguagem.js <relatorio.html>
const fs = require('fs');

const arquivo = process.argv[2];
if (!arquivo) { console.error('uso: conferir-linguagem.js <relatorio.html>'); process.exit(2); }
const texto = fs.readFileSync(arquivo, 'utf8')
  .replace(/<style[\s\S]*?<\/style>/gi, '')
  .replace(/<script[\s\S]*?<\/script>/gi, '')
  .replace(/<[^>]+>/g, ' ');

const PROIBIDOS = [
  [/\bspecs?\b/i, 'spec — e coisa interna; diga "planejamento" ou nao diga'],
  [/\betapas?\s*\d+/i, 'numero de etapa — o usuario nao conhece a numeracao'],
  [/\bfase\s*\d\b/i, 'fase do nosso processo'],
  [/\b[BCDGT]\d{2,4}\b/, 'codigo de achado/tarefa (B476, C131, T4...)'],
  [/\bRN-\d+/i, 'codigo de regra de negocio'],
  [/\bcommits?\b/i, 'commit'],
  [/\b[0-9a-f]{7,40}\b/, 'hash do git'],
  [/\b(fix-round|sabotagem|harness|sonda|revisor|adversarial|subagente|agente|IA\b|Claude|LLM|prompt)/i, 'bastidor do nosso processo de trabalho'],
  [/\b(endpoint|API|backend|servidor|banco de dados|front-?end|SQL|SQLite|query|deadlock|race|mutex|trava por material|AsyncLocalStorage|refactor|deploy|merge|branch)\b/i, 'termo tecnico — troque por linguagem do dia a dia'],
  [/\b(server|client|services?)\/\S+/i, 'caminho de arquivo'],
  [/\.(js|jsx|md|json)\b/i, 'nome de arquivo'],
];

let achados = 0;
const linhas = texto.split('\n');
linhas.forEach((linha, i) => {
  for (const [re, motivo] of PROIBIDOS) {
    const m = linha.match(re);
    if (m) { achados++; console.log(`linha ${i + 1}: "${m[0]}" — ${motivo}\n    ${linha.trim().slice(0, 160)}`); }
  }
});
if (achados) { console.log(`\n${achados} trecho(s) para reescrever.`); process.exit(1); }
console.log('Linguagem ok: nenhum termo interno encontrado.');
