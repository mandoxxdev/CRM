import { useState, useEffect } from 'react';
import api from '../services/api';

/**
 * O catálogo de categorias de material do cliente (Etapa 26, RN-01).
 *
 * ANTES desta etapa a mesma lista de 11 itens em MAIÚSCULAS estava hardcoded e DUPLICADA em três
 * componentes (`MaterialAlmoxarifadoForm`, `ConferenciaEstoque`, `MateriaisAlmoxarifado`), e
 * nenhum deles falava com `categorias_material_almoxarifado` — a tabela desenhada para a GMP,
 * semeada com 27 categorias de metalúrgica, ficava intacta e sem uso. Filtrar por `EPI` na tela
 * de materiais devolvia zero linhas, e "zero linhas" parece estoque vazio, não filtro inútil.
 *
 * Este hook é o ÚNICO ponto de busca. Ele devolve os NOMES, não as linhas, porque é nome que a
 * coluna `materiais.categoria` guarda (texto livre, sem chave estrangeira — ver RN-05).
 *
 * **Por que NÃO tem cache de módulo**, ao contrário de `useAlmoxPermissoes`: a Task 3 desta
 * mesma etapa transforma o catálogo em cadastro editável dentro de Configurações. Com um cache
 * vivo no módulo, a categoria recém-criada não apareceria no formulário de material até um
 * reload completo da página — o usuário cadastraria a categoria e não a acharia no select,
 * exatamente o tipo de "a tela mente sobre o que está no banco" que esta etapa existe para
 * corrigir. São três telas que nunca ficam montadas ao mesmo tempo; uma requisição por
 * montagem é barata perto disso.
 *
 * Falha de carga NÃO é silenciosa para quem chama: `erro` é devolvido para a tela decidir. O
 * formulário de material avisa (sem categoria o cadastro não conclui); os filtros das listagens
 * não precisam avisar — sem o catálogo eles só deixam de oferecer o filtro, e a lista completa
 * continua na tela.
 */
export function useCategoriasMaterial() {
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    // Flag `vivo` (padrão do módulo): a tela pode desmontar antes da resposta, e um setState
    // depois do unmount é warning — com CI=true, erro de build.
    let vivo = true;
    api.get('/almoxarifado/categorias')
      .then((res) => {
        if (!vivo) return;
        // Tolera string solta além de {nome}: o GET devolve linhas, mas um endpoint que um dia
        // devolva só os nomes não pode transformar o select em lista de "undefined".
        const nomes = (Array.isArray(res.data) ? res.data : [])
          .map((c) => (typeof c === 'string' ? c : c && c.nome))
          .filter(Boolean);
        setCategorias(nomes);
        setErro(false);
      })
      .catch(() => {
        if (!vivo) return;
        setCategorias([]);
        setErro(true);
      })
      .finally(() => { if (vivo) setLoading(false); });
    return () => { vivo = false; };
  }, []);

  return { categorias, loading, erro };
}

export default useCategoriasMaterial;
