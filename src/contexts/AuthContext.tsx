import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { usuarioService } from '../utils/services/usuarioService';
import type { Usuario } from '../types';

// Tipo de usuário sem senhaHash para uso no contexto
export type UsuarioPublico = Omit<Usuario, 'senhaHash'>;

interface AuthContextType {
  usuario: UsuarioPublico | null;
  autenticado: boolean;
  carregando: boolean;
  login: (email: string, senha: string) => Promise<boolean>;
  logout: () => void;
  atualizarUsuario: (usuario: UsuarioPublico) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioPublico | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    // Verificar se há usuário salvo no localStorage
    const usuarioSalvo = localStorage.getItem('usuario_autenticado');
    if (usuarioSalvo) {
      try {
        const usuarioData = JSON.parse(usuarioSalvo);
        setUsuario(usuarioData);
      } catch (error) {
        console.error('Erro ao carregar usuário:', error);
        localStorage.removeItem('usuario_autenticado');
      }
    }
    setCarregando(false);
  }, []);

  const login = async (email: string, senha: string): Promise<boolean> => {
    try {
      // Verificar senha usando o serviço
      const usuario = await usuarioService.verificarSenha(email, senha);
      
      if (!usuario) {
        return false;
      }

      // Remover senhaHash antes de salvar no localStorage (segurança)
      const { senhaHash, ...usuarioSemSenha } = usuario;
      
      // Login bem-sucedido
      setUsuario(usuarioSemSenha);
      localStorage.setItem('usuario_autenticado', JSON.stringify(usuarioSemSenha));
      return true;
    } catch (error) {
      console.error('Erro ao fazer login:', error);
      return false;
    }
  };

  const logout = () => {
    setUsuario(null);
    localStorage.removeItem('usuario_autenticado');
  };

  const atualizarUsuario = (usuarioAtualizado: UsuarioPublico) => {
    setUsuario(usuarioAtualizado);
    localStorage.setItem('usuario_autenticado', JSON.stringify(usuarioAtualizado));
  };

  return (
    <AuthContext.Provider
      value={{
        usuario,
        autenticado: !!usuario,
        carregando,
        login,
        logout,
        atualizarUsuario,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return context;
}

