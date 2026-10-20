/**
 * Etapa 161 (RN-161.06, C397) — o formatador do instante do banco. Etapa 168 (RN-168.04, B1071): mora em `utils/dataLocal.js` (o nucleo,
 * Custos de Viagem e as Solicitacoes de Compra tambem o usam); este modulo o reexporta para as telas do Almoxarifado nao mudarem.
 */
import { formatarInstanteDoBanco } from '../../utils/dataLocal';

export { formatarInstanteDoBanco };
export default formatarInstanteDoBanco;
