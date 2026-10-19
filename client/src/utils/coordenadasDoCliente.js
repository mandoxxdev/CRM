/**
 * Etapa 157 (RN-157.03, C375): a coordenada de um cliente nos custos de viagem e na Preview da Rota vem do servidor.
 *
 * `GET /custos-viagens/coordenadas-cliente/:id` responde para qualquer cliente: com endereco, pelo servico de mapas (com prazo); sem, pela
 * cidade do cadastro com a UF certa, o centro do estado ou o do Brasil — o servidor nunca deixa de dar uma coordenada. Antes o client so
 * perguntava quando havia endereco e, sem endereco, usava uma copia propria da lista de cidades com a comparacao exata ('Campinas'), que
 * quase nunca achava a cidade do cadastro (gravada em maiusculas) — todo cliente sem endereco de SP ia para Sao Bernardo do Campo.
 * O client nao tem mais lista de cidades: quando o servidor recusa ou nao responde, o cliente fica SEM localizacao (null).
 */
import api from '../services/api';

export function coordenadaValida(c) {
  return Array.isArray(c) && c.length === 2 && c.every((x) => typeof x === 'number' && Number.isFinite(x));
}

export async function obterCoordenadasDoCliente(cliente) {
  if (!cliente) return null;
  if (coordenadaValida(cliente.coordenadas)) return cliente.coordenadas;
  if (cliente.id == null || cliente.id === '') return null;
  try {
    const response = await api.get(`/custos-viagens/coordenadas-cliente/${encodeURIComponent(cliente.id)}`);
    const c = response && response.data ? response.data.coordenadas : null;
    return coordenadaValida(c) ? c : null;
  } catch (err) {
    return null;
  }
}

export default obterCoordenadasDoCliente;
