// Etapa 189 (T3, B1268) — as frases da dica de coleta, puras (sem React), usadas pela fila de separação, pela janela de separação e pela
// lista de coleta impressa. Moravam em components/almoxarifado/FilaSeparacao.js (Etapa 188), que as re-exporta com os mesmos nomes:
// importar um componente de tela num gerador de PDF repetiria o acoplamento M5 da 185 (a sabotagem de uma tela derrubava a suíte de
// outro papel).

/** Quantidade como a fila mostra: pt-BR, até 3 casas. Não numérico -> `'0'`. */
export const fmtQtd = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
};

// 'YYYY-MM-DD' (ou ISO) -> 'DD/MM/AAAA' sem passar por Date: new Date('2026-10-05') é UTC e no fuso de Brasília vira o dia anterior.
export const fmtData = (s) => {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(s);
};

export const FIM_JA_VEM_ESCOLHIDO = " — já vem escolhido no 'Sai de' ao separar";
export const FIM_ESCOLHA_ESTE = " — escolha este endereço no 'Sai de' ao separar";

// Etapa 188 (RN-188.08 com as emendas C1, I1, M2, M5): a dica de onde pegar. Só exibe o que o servidor calculou — a tela não escolhe
// endereço nem reordena (B821: os itens ficam na ordem do pedido; a ordem de percurso é `ordem_coleta`).
// Etapa 189 (RN-189.09, B1265): com `cobre: true` a janela de separação já abre com este endereço escolhido — a frase diz isso. Exceção
// (M2 da Fase 2 da 189): item com separado pendente SEM planejada (rodada anterior no automático) não é pré-selecionado, então continua
// "escolha este endereço". Com `cobre: false` também (a janela não escolhe o que não cobre).
export const textoPegarEm = (it) => {
  const p = it.pegar_em;
  if (!p) return null;
  const un = it.unidade ? ` ${it.unidade}` : '';
  const caminho = p.caminho && String(p.caminho).includes(' / ') ? ` (${p.caminho})` : '';
  const lote = p.lote_codigo ? ` — lote ${p.lote_codigo}` : '';
  const vence = p.lote_codigo && p.lote_validade ? ` (vence ${fmtData(p.lote_validade)})` : '';
  const separadoSemPlanejada = Number(it.a_entregar) > 1e-9 && !it.origem_separacao_codigo;
  return `Pegar em ${p.localizacao_codigo}${caminho}${lote}${vence} · ${fmtQtd(p.quantidade_sugerida)}${un}`
    + (p.cobre === true && !separadoSemPlanejada ? FIM_JA_VEM_ESCOLHIDO : FIM_ESCOLHA_ESTE);
};

// Etapa 188, Fase 5 (I-b): com LOTE, trocar a origem e entregar no automático deixa uma linha sem lote negativa (o automático não
// escolhe lote — defeito anterior, B204/C71). A frase manda escolher o lote no "Sai de" da entrega em vez de prometer a saída automática.
const NA_ENTREGA_ESCOLHA_O_LOTE = " Na entrega, escolha o lote no 'Sai de': a saída automática não escolhe lote.";
const codigoDaPlanejada = (it) => {
  const cod = it.origem_separacao_codigo || (it.pegar_em && it.pegar_em.localizacao_codigo) || '—';
  return it.lote_separacao_codigo ? `${cod} — lote ${it.lote_separacao_codigo}` : cod;
};

export const textoAvisoPegarEm = (it) => {
  switch (it.pegar_em_aviso) {
    case 'NENHUM_ENDERECO_COBRE':
      return `Nenhum endereço tem tudo: pegue ${fmtQtd(it.pegar_em ? it.pegar_em.quantidade_sugerida : 0)} aqui. `
        + 'Separar o resto de outro endereço depois troca a origem da separação.'
        + (it.pegar_em && it.pegar_em.lote_codigo ? NA_ENTREGA_ESCOLHA_O_LOTE : '');
    case 'PLANEJADA_NAO_COBRE':
      return `Já separado de ${codigoDaPlanejada(it)}: o resto não cabe lá. `
        + (it.lote_separacao_codigo ? `Separar de outro endereço troca a origem da separação.${NA_ENTREGA_ESCOLHA_O_LOTE}`
          : 'Separar de outro endereço troca a origem da separação (a entrega passa a sair automática).');
    case 'PLANEJADA_INDISPONIVEL':
      // Fase 5 (M-d): a planejada existe mas não serve mais de dica — "o resto não cabe lá" seria mentira.
      return `Já separado de ${codigoDaPlanejada(it)}, que não pode mais ser sugerido (endereço bloqueado ou inativo, em área `
        + 'especial ou lote bloqueado/vencido). Confira antes de separar o resto: separar de outro endereço troca a origem da separação'
        + (it.lote_separacao_codigo ? `.${NA_ENTREGA_ESCOLHA_O_LOTE}` : ' (a entrega passa a sair automática).');
    case 'SEM_ENDERECO_SUGERIVEL':
      return 'Sem endereço para sugerir (o saldo está sem endereço, em endereço bloqueado ou inativo, em área especial '
        + 'ou em lote bloqueado/vencido).';
    default:
      return null;
  }
};

// Fase 5 (I-a): a retenção (inspeção, bloqueio, terceiros) é do material, não do endereço — o sistema não sabe onde estão as retidas.
export const textoAlertaPegarEm = (it) => (it.pegar_em && it.pegar_em_alerta === 'RETENCAO_NO_MATERIAL'
  ? 'Parte do saldo deste material está retida (em inspeção, bloqueada ou em terceiros) e o sistema não sabe em qual endereço — '
    + 'confira antes de pegar.'
  : null);
