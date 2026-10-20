import { useCallback, useRef } from 'react';

/**
 * Etapa 161 (RN-161.01/02/03, C396) — so o ULTIMO pedido de uma lista mexe na tela.
 *
 * Uma lista que recarrega a cada troca de filtro pode ter dois pedidos em voo: a resposta do filtro velho, chegando depois da do
 * novo, trocaria a lista pela errada (e o erro dela mostraria um aviso de algo que ninguem mais pediu; o fim do "carregando" dela
 * tiraria o carregando do pedido que ainda nao voltou). O molde e o da Etapa 160 (OrdensServico, MateriaisAlmoxarifado), agora num
 * lugar so:
 *
 *   const novoPedido = useUltimoPedido();
 *   const carregar = async () => {
 *     const ehUltimo = novoPedido();
 *     try { const r = await api.get(...); if (!ehUltimo()) return; setLista(r.data); }
 *     catch (e) { if (!ehUltimo()) return; toast.error(...); }
 *     finally { if (ehUltimo()) setLoading(false); }
 *   };
 *
 * O contador fica DENTRO da funcao que carrega (quem recarrega depois de excluir/salvar tambem conta). O descarte e `return`, nunca
 * erro: quem chama com `await` continua recebendo uma promessa que resolve. `novoPedido` e estavel (pode entrar em dependencias) e,
 * chamado sem usar o retorno, so invalida o que esta em voo (a troca de relatorio).
 */
export default function useUltimoPedido() {
  const contador = useRef(0);
  return useCallback(() => {
    const meu = ++contador.current;
    return () => meu === contador.current;
  }, []);
}
