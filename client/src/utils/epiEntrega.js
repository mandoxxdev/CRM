/**
 * Etapa 178 (T2) — regras PURAS da tela "Entrega de EPI" (testaveis sem DOM).
 *
 * O servidor e quem decide (RN-178.04/05/11 e as emendas da Fase 2): aqui so se antecipa a recusa dele, com o MESMO texto, para a
 * pessoa nao colher a assinatura do colaborador e so depois descobrir que o CA venceu. Se as duas regras divergirem, vale a do
 * servidor — a tela mostra o `error` que ele devolve.
 */
import { formatarDataDoBanco, hojeLocalISO } from './dataLocal';

/** Motivos do contrato (RN-178.11): valor gravado -> rotulo da tela. */
export const MOTIVOS_EPI = [
  { value: 'PRIMEIRA_ENTREGA', label: 'Primeira entrega' },
  { value: 'TROCA', label: 'Troca' },
  { value: 'PERDA', label: 'Perda' },
  { value: 'DANO', label: 'Dano' },
];
export const rotuloMotivo = (v) => (MOTIVOS_EPI.find((m) => m.value === v) || {}).label || (v || '—');

/** O material e EPI? O servidor calcula `is_epi` pelas tres marcas (RN-178.01); chega bool ou 0/1. */
export const ehEpi = (m) => !!m && (m.is_epi === true || Number(m.is_epi) === 1);

/**
 * O aviso que o servidor daria para este EPI, ou `null` se ele passa. `hoje` = o dia de Brasilia (`AAAA-MM-DD`; o navegador do
 * almoxarifado esta no fuso do site, como em `dataLocal.js`). Ordem = a do servidor: sem CA antes de vencido.
 */
export function avisoDoCa(material, hoje = hojeLocalISO()) {
  if (!material) return null;
  const codigo = material.codigo || `#${material.id}`;
  const numero = String(material.ca_numero ?? '').trim();
  if (!numero) return `EPI ${codigo} sem número de CA cadastrado`;
  const validade = typeof material.ca_validade === 'string' ? material.ca_validade.trim().slice(0, 10) : '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(validade) && validade < hoje) {
    return `O CA ${numero} do EPI ${codigo} venceu em ${formatarDataDoBanco(validade, validade, { soData: true })}`;
  }
  if (Number(material.controle_serie) === 1 || Number(material.controle_lote) === 1
    || material.controle_serie === true || material.controle_lote === true) {
    return `EPI ${codigo} com controle de série/lote não é suportado nesta etapa`;
  }
  return null;
}

/** Quantidade inteira > 0 (emenda "Menores" da Fase 2). Devolve a mensagem de erro, ou `null`. */
export function erroDaQuantidade(valor) {
  const s = String(valor ?? '').trim().replace(',', '.');
  if (!s) return 'Informe a quantidade';
  const n = Number(s);
  if (!Number.isFinite(n)) return 'Quantidade de EPI deve ser inteira';
  if (!Number.isInteger(n)) return 'Quantidade de EPI deve ser inteira';
  if (n <= 0) return 'A quantidade deve ser maior que zero';
  return null;
}

/**
 * O corpo multipart do `POST /almoxarifado/epi/entregas` (contrato congelado): `colaborador_id`, `material_id`, `quantidade`,
 * `tamanho?`, `motivo?`, `observacao?` e o arquivo `assinatura` (PNG). Opcional vazio NAO vai (o servidor trata ausente como nulo).
 */
export function montarFormDataEntrega(form, assinatura) {
  const fd = new FormData();
  fd.append('colaborador_id', String(Number(form.colaborador_id)));
  fd.append('material_id', String(Number(form.material_id)));
  fd.append('quantidade', String(Number(String(form.quantidade).trim().replace(',', '.'))));
  const tamanho = String(form.tamanho ?? '').trim();
  if (tamanho) fd.append('tamanho', tamanho);
  if (form.motivo) fd.append('motivo', form.motivo);
  const observacao = String(form.observacao ?? '').trim();
  if (observacao) fd.append('observacao', observacao);
  fd.append('assinatura', assinatura, 'assinatura.png');
  return fd;
}

/** O codigo de verificacao que a tela mostra: os 12 primeiros hex do `registro_sha256`, em grupos de 4. */
export function codigoVerificacao(sha) {
  const s = String(sha || '').toUpperCase();
  if (!s) return '—';
  return s.slice(0, 12).match(/.{1,4}/g).join('-');
}

/** O selo da verificacao (`GET /verificar`). */
const MOTIVOS_ADULTERACAO = {
  'arquivo alterado': 'arquivo alterado',
  'registro alterado': 'registro alterado',
  'arquivo ausente': 'arquivo ausente',
};
export function seloVerificacao(resposta) {
  if (!resposta) return null;
  if (resposta.integro === true) return { ok: true, texto: 'Íntegro' };
  const motivo = MOTIVOS_ADULTERACAO[resposta.motivo] || resposta.motivo || 'motivo não informado';
  return { ok: false, texto: `Adulterado: ${motivo}` };
}
