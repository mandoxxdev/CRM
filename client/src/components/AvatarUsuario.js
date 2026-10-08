import React, { useState } from 'react';
import { resolveAvatarUrl } from '../utils/resolveUploadAssinadoUrl';

/**
 * Etapa 82 (RN-82.05) — foto de perfil pela URL ASSINADA `foto_src` (a pasta de avatares exige
 * `?exp=&sig=`; montar pelo nome `foto_url` daria 404).
 *
 * `onError` esconde a imagem e mostra o `fallback` (as iniciais, na Minha Conta; nada, no menu):
 * cobre o `foto_src` vencido que volta do localStorage quando o `/auth/me` falha e o arquivo
 * apagado — nunca um ícone de imagem quebrada. Guarda o src QUE falhou, e não um booleano: um
 * `foto_src` novo (upload, `/auth/me`) volta a tentar sozinho.
 */
export default function AvatarUsuario({ fotoSrc, className, alt, fallback = null }) {
  const src = resolveAvatarUrl(fotoSrc);
  const [srcFalhou, setSrcFalhou] = useState(null);
  if (!src || src === srcFalhou) return fallback;
  return <img className={className} src={src} alt={alt} onError={() => setSrcFalhou(src)} />;
}
