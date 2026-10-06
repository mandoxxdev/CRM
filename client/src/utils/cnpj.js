/**
 * CNPJ, CEP e a consulta de CNPJ — funções puras da ficha do fornecedor (Etapa 34).
 *
 * A validação dos dígitos verificadores é a mesma de ClienteForm.js:168 (copiada, não
 * refatorada: o comercial não está no lote — o cliente pode adotar este módulo depois).
 * `camposDaConsultaCNPJ` traduz o que o proxy `GET /api/cnpj/:cnpj` devolve (`resp.data.data`,
 * que já traz `cidade`/`estado` normalizados além de `municipio`/`uf`) para as chaves da
 * ficha, montando `endereco` do mesmo jeito que o ClienteForm:
 * "logradouro, numero - complemento, bairro".
 */
import { mascararTelefoneCompleto } from './telefone';

export function somenteDigitos(valor) {
  return String(valor ?? '').replace(/\D/g, '');
}

/** Máscara progressiva 00.000.000/0000-00, tolerante a valor incompleto. */
export function formatarCNPJ(valor) {
  const d = somenteDigitos(valor).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

/**
 * Máscara de um CNPJ JÁ GRAVADO (carga da edição): só mascara quando há exatamente 14 dígitos;
 * qualquer outra coisa volta como veio. O cadastro aceitou texto livre por anos ("ISENTO",
 * 11 dígitos, "DE123…") — a progressiva acima cortaria e o Salvar gravaria um CNPJ inventado
 * sem o usuário tocar no campo (F1 da revisão da Etapa 34). Mesma regra de `formatarCEP` e de
 * `mascararTelefoneCompleto`.
 */
export function formatarCNPJCompleto(valor) {
  const bruto = String(valor ?? '').trim();
  const d = somenteDigitos(bruto);
  // Só mascara se, tirando a pontuação da máscara, sobram exatamente os 14 dígitos — nada de letra.
  if (d.length === 14 && !/\D/.test(bruto.replace(/[./-]/g, ''))) return formatarCNPJ(d);
  return bruto;
}

/** 00000-000 quando há 8 dígitos; qualquer outra coisa volta como veio. */
export function formatarCEP(valor) {
  const bruto = String(valor ?? '');
  const d = somenteDigitos(bruto);
  if (d.length === 8) return `${d.slice(0, 5)}-${d.slice(5)}`;
  return bruto;
}

/** Dígitos verificadores do CNPJ (módulo 11). */
export function validarCNPJ(valor) {
  const cnpj = somenteDigitos(valor);
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1+$/.test(cnpj)) return false;

  const calcular = (tamanho) => {
    const numeros = cnpj.substring(0, tamanho);
    let soma = 0;
    let pos = tamanho - 7;
    for (let i = tamanho; i >= 1; i--) {
      soma += Number(numeros.charAt(tamanho - i)) * pos--;
      if (pos < 2) pos = 9;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  if (calcular(12) !== Number(cnpj.charAt(12))) return false;
  if (calcular(13) !== Number(cnpj.charAt(13))) return false;
  return true;
}

const texto = (v) => (v == null ? '' : String(v).trim());

/** `resp.data.data` do proxy de CNPJ → chaves da ficha do fornecedor. */
export function camposDaConsultaCNPJ(data) {
  const d = data || {};
  const logradouro = texto(d.logradouro || d.street);
  let endereco = '';
  if (logradouro) {
    const numero = texto(d.numero || d.number);
    const complemento = texto(d.complemento || d.complement);
    const bairro = texto(d.bairro || d.district || d.neighborhood);
    endereco = logradouro;
    if (numero) endereco += `, ${numero}`;
    if (complemento) endereco += ` - ${complemento}`;
    if (bairro) endereco += `, ${bairro}`;
  }
  return {
    razao_social: texto(d.razao_social || d.nome || d.company_name || d.name),
    nome_fantasia: texto(d.nome_fantasia || d.fantasia || d.trade_name || d.alias),
    email: texto(d.email),
    telefone: mascararTelefoneCompleto(texto(d.telefone || d.phone)),
    endereco,
    cidade: texto(d.cidade || d.municipio || d.city),
    estado: texto(d.estado || d.uf || d.state),
    cep: formatarCEP(texto(d.cep || d.zip_code)),
  };
}

/**
 * Preenche no `form` só as chaves que estão vazias, com os `novos` que não estão vazios.
 * É o "só vazios" da edição (RN-34.03/04): o que o usuário já digitou não é sobrescrito.
 */
export function mesclarSoVazios(form, novos) {
  const resultado = { ...form };
  Object.keys(novos || {}).forEach((k) => {
    const atual = texto(resultado[k]);
    const novo = texto(novos[k]);
    if (!atual && novo) resultado[k] = novos[k];
  });
  return resultado;
}
