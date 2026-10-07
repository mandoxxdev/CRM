/**
 * Preload do run-all (`node -r tests/helpers/guardaProcessExit.js <arquivo>`): um arquivo de teste que
 * termina SEM chamar `process.exit` e com codigo 0 falha.
 *
 * Por que (Etapa 76, Fase 5 — sonda76f-runner): todo *.api.test.js termina com
 * `process.exit(failed ? 1 : 0)` depois do placar. Se uma promise prende no meio (a trava do material que
 * nao solta, um timer `.unref()`), o event loop esvazia e o Node sai com 0 SEM placar — o run-all, que so
 * olhava o exit code, contava o arquivo como verde (teste vazio). Medido: os 290 arquivos chamam
 * `process.exit`; nenhum termina legitimamente por event loop vazio.
 *
 * So vale no processo de topo: a guarda so liga com RUN_ALL_GUARDA_EXIT=1 e apaga a variavel ao carregar,
 * entao um filho do teste (spawn/fork, que herdaria o `-r`) nao e julgado por ela.
 */
if (process.env.RUN_ALL_GUARDA_EXIT === '1') {
  delete process.env.RUN_ALL_GUARDA_EXIT;
  let chamouExit = false;
  const exitOriginal = process.exit;
  process.exit = function exitGuardado(...args) {
    chamouExit = true;
    return exitOriginal.apply(process, args);
  };
  process.on('exit', (code) => {
    if (!chamouExit && code === 0) {
      console.error('[run-all] o arquivo terminou sem chamar process.exit (placar ausente)');
      process.exitCode = 1;
    }
  });
}
