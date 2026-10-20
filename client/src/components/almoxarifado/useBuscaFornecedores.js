import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../../services/api';
import useUltimoPedido from '../../hooks/useUltimoPedido';

export const ROTA_FORNECEDORES = '/almoxarifado/recebimentos-aux/fornecedores';

/**
 * Etapa 161 (RN-161.09, C399) — o seletor de fornecedores do Recebimento e das Remessas a terceiros procura NO SERVIDOR.
 *
 * Antes as duas telas pediam a rota uma vez, sem `search`, e o servidor corta nos 50 primeiros por razao social: o fornecedor 51 nao
 * aparecia nunca. Agora o campo "Buscar fornecedor" alimenta o `<select>` de sempre: `GET ?search=<texto>` (o servidor apara, ignora a
 * caixa e trata `%`/`_` como texto; vazio = os primeiros 50), 300 ms depois da ultima tecla, e so a resposta da ULTIMA busca vale. A
 * busca que falha deixa as opcoes como estavam (sem aviso — como a carga de antes, que tambem era tolerada).
 *
 * `ativo`: quando a lista e necessaria (o Recebimento: sempre; as Remessas: so com o formulario "nova" aberto). Ao ficar ativo, a
 * busca atual sai na hora (sem pausa); `manter(f)` diz qual opcao continua na lista mesmo fora do resultado (a ja escolhida).
 */
export default function useBuscaFornecedores({ ativo = true, manter } = {}) {
  const [fornecedores, setFornecedores] = useState([]);
  const [busca, setBusca] = useState('');
  const novoPedido = useUltimoPedido();
  const buscaRef = useRef('');
  buscaRef.current = busca;
  const buscaPedida = useRef(null);
  const manterRef = useRef(manter);
  manterRef.current = manter;

  const buscar = useCallback(async (texto) => {
    buscaPedida.current = texto;
    const ehUltimo = novoPedido();
    try {
      const res = await api.get(ROTA_FORNECEDORES, { params: { search: texto } });
      if (!ehUltimo()) return;
      const novos = Array.isArray(res.data) ? res.data : [];
      setFornecedores((prev) => {
        const fica = manterRef.current ? prev.filter((f) => manterRef.current(f) && !novos.some((n) => n.id === f.id)) : [];
        return [...fica, ...novos];
      });
    } catch {
      // falha aberta: as opcoes ficam como estavam
    }
  }, [novoPedido]);

  useEffect(() => {
    if (ativo) buscar(buscaRef.current);
    else setBusca(''); // fechar o formulario esquece o texto: a proxima abertura comeca pelos primeiros 50
  }, [ativo, buscar]);

  useEffect(() => {
    if (!ativo || busca === buscaPedida.current) return undefined;
    const t = setTimeout(() => buscar(busca), 300);
    return () => clearTimeout(t);
  }, [busca, ativo, buscar]);

  return { fornecedores, busca, setBusca, buscar };
}
