import api from '../../services/api';

/**
 * A foto do fornecedor — uma coluna só (`fornecedores.foto`), duas telas: o grupo homologado
 * (`FornecedoresDoGrupo`, desde antes da Etapa 34) e a ficha do fornecedor (`FornecedorFicha`, Etapa 263, RN-263.05).
 * As duas funções moravam em `FornecedoresDoGrupo.js`; vieram para cá para a ficha usar AS MESMAS (mesma rota,
 * mesma URL) — a foto posta num lugar aparece no outro.
 */

/** Etapa 263 (RN-263.02): os tipos que o servidor aceita (o filtro do multer do fornecedor) e as MESMAS literais que ele responde
 * (`MSG_FORMATO_NAO_SUPORTADO` e `mensagemArquivoGrande(10 MB)` de server/services/imagemUpload.js). */
export const TIPOS_FOTO_FORNECEDOR = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
export const MSG_FOTO_TIPO = 'Formato de imagem não suportado';
/** O limite do multer do fornecedor (10 MB, `uploadFornecedor` em index.js). */
export const LIMITE_FOTO_BYTES = 10 * 1024 * 1024;
export const MSG_FOTO_GRANDE = 'Arquivo grande demais (máximo 10 MB)';

/** A recusa da tela antes de enviar (RN-263.02), ou null quando o arquivo pode ir. */
export function recusaDaFotoFornecedor(file) {
  if (!file) return null;
  if (!TIPOS_FOTO_FORNECEDOR.includes(String(file.type || '').toLowerCase())) return MSG_FOTO_TIPO;
  if (file.size > LIMITE_FOTO_BYTES) return MSG_FOTO_GRANDE;
  return null;
}

export function getFotoUrlFornecedor(foto) {
  if (!foto) return null;
  if (typeof foto === 'string' && foto.startsWith('data:')) return foto;
  const base = (api.defaults && api.defaults.baseURL) || '/api';
  return base.replace(/\/api\/?$/, '') + '/api/uploads/fornecedores/' + foto;
}

export async function uploadFotoFornecedor(id, file) {
  const baseURL = ((api.defaults && api.defaults.baseURL) || '/api').replace(/\/$/, '');
  const url = `${baseURL}/compras/fornecedores/${id}/foto`;
  const formData = new FormData();
  formData.append('foto', file);
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { method: 'POST', headers, body: formData });
  if (res.ok) return res.json();
  if (res.status === 400) {
    const reader = new FileReader();
    const base64 = await new Promise((resolve, reject) => {
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Falha ao ler arquivo'));
      reader.readAsDataURL(file);
    });
    const { data } = await api.post(`/compras/fornecedores/${id}/foto-base64`, { foto_base64: base64 });
    return data;
  }
  const errData = await res.json().catch(() => ({}));
  throw new Error(errData.error || res.statusText);
}
