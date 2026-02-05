/**
 * Serviço de hash e verificação de senhas
 * Usa uma implementação simples de hash para frontend
 * Em produção, use bcrypt no backend
 */

// Função simples de hash (para desenvolvimento)
// Em produção, use bcrypt ou similar no backend
export const passwordService = {
  /**
   * Gera hash da senha
   */
  hash: async (senha: string): Promise<string> => {
    // Implementação simples usando Web Crypto API
    const encoder = new TextEncoder();
    const data = encoder.encode(senha);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  },

  /**
   * Verifica se a senha corresponde ao hash
   */
  verify: async (senha: string, hash: string): Promise<boolean> => {
    const senhaHash = await passwordService.hash(senha);
    return senhaHash === hash;
  },
};

