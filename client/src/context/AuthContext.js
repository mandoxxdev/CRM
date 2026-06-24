import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import axios from 'axios';
import { invalidatePermissionsCache } from '../services/permissionsCache';
import { mergeUserPermissions } from '../utils/systemPermissions';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider');
  }
  return context;
};

async function refreshUserFromServer(token, currentUser) {
  const response = await axios.get('/api/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const freshUser = mergeUserPermissions(currentUser, response.data?.user || {});
  localStorage.setItem('user', JSON.stringify(freshUser));
  return freshUser;
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const applyFreshUser = useCallback((freshUser) => {
    if (!freshUser) return;
    setUser(freshUser);
    localStorage.setItem('user', JSON.stringify(freshUser));
    invalidatePermissionsCache(freshUser.id);
  }, []);

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');

        if (token && userData) {
          try {
            const parsedUser = JSON.parse(userData);
            setUser(parsedUser);
            axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            try {
              const freshUser = await refreshUserFromServer(token, parsedUser);
              setUser(freshUser);
            } catch (refreshError) {
              console.warn('Não foi possível atualizar permissões do usuário:', refreshError);
            }
          } catch (error) {
            console.error('Erro ao parsear userData:', error);
            localStorage.removeItem('token');
            localStorage.removeItem('user');
          }
        }
      } catch (error) {
        console.error('Erro ao inicializar autenticação:', error);
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();
  }, []);

  const login = async (email, senha) => {
    try {
      const response = await axios.post('/api/auth/login', { email, senha });
      const { token, user: loggedUser } = response.data;

      localStorage.setItem('token', token);
      sessionStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(loggedUser));
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      setUser(loggedUser);
      invalidatePermissionsCache(loggedUser?.id);

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error || 'Erro ao fazer login'
      };
    }
  };

  const logout = () => {
    if (user?.id) {
      invalidatePermissionsCache(user.id);
    }
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    sessionStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, applyFreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

