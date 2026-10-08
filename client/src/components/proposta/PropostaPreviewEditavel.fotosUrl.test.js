/**
 * Preview editável — fotos da proposta pela URL ASSINADA (Etapa 82, RN-82.04).
 *
 * `/api/uploads/proposta-fotos` exige assinatura. Os três pontos que injetam foto no iframe sem
 * recarregar (enviar, colar e desfazer exclusão) empurram em `__FOTOS_PROPOSTA` — e a repaginação
 * recria os `<img>` a partir dessa lista. Se UM deles montar o endereço pelo nome, aquela foto
 * aparece quebrada na próxima repaginação.
 *
 * Renderizar o componente exigiria o iframe `srcDoc` com o script do template rodando (o jsdom não
 * executa); por isso o teste lê o FONTE e prova o mecanismo em cada `push`, com um controle que
 * mostra que o detector acusa o código antigo.
 */
const fs = require('fs');
const path = require('path');

const FONTE = fs.readFileSync(path.join(__dirname, 'PropostaPreviewEditavel.js'), 'utf8');

/** Corpo de cada `__FOTOS_PROPOSTA.push({ ... })`. */
function pushes(src) {
  const out = [];
  const alvo = '__FOTOS_PROPOSTA.push({';
  let i = src.indexOf(alvo);
  while (i >= 0) {
    const ini = i + alvo.length - 1;
    let prof = 0; let j = ini;
    for (; j < src.length; j++) {
      if (src[j] === '{') prof++;
      else if (src[j] === '}') { prof--; if (prof === 0) break; }
    }
    out.push(src.slice(ini, j + 1));
    i = src.indexOf(alvo, j);
  }
  return out;
}
const pushSemAssinatura = (corpo) => !/\bsrc: resolveFotoPropostaUrl\((data|f)\.url\),/.test(corpo);

test('os 3 pontos que injetam foto (enviar, colar, desfazer exclusao) usam o url assinado da API', () => {
  const corpos = pushes(FONTE);
  expect(corpos).toHaveLength(3);
  expect(corpos.filter(pushSemAssinatura)).toEqual([]);
});

test('nenhum endereco de foto montado pelo nome; o resolvedor e importado', () => {
  expect(FONTE).not.toMatch(/\/uploads\/proposta-fotos\//);
  expect(FONTE).toMatch(/import \{ resolveFotoPropostaUrl \} from '..\/..\/utils\/resolveUploadAssinadoUrl';/);
});

test('controle: o detector acusa o push antigo (montado pelo nome)', () => {
  const antigo = "win.__FOTOS_PROPOSTA.push({\n  id: f.id,\n  src: `${base}/uploads/proposta-fotos/${encodeURIComponent(f.arquivo)}`,\n});";
  const corpos = pushes(antigo);
  expect(corpos).toHaveLength(1);
  expect(pushSemAssinatura(corpos[0])).toBe(true);
});
