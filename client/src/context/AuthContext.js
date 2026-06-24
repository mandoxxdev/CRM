import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import axios from 'axios';
import api from '../services/api';
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
  const response = await api.get('/auth/me', {
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
    const normalized = mergeUserPermissions(freshUser, {});
    setUser(normalized);
    localStorage.setItem('user', JSON.stringify(normalized));
    invalidatePermissionsCache(normalized.id);
  }, []);

  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return null;
    try {
      const freshUser = await refreshUserFromServer(token, user || JSON.parse(localStorage.getItem('user') || '{}'));
      setUser(freshUser);
      return freshUser;
    } catch (error) {
      console.warn('Não foi possível atualizar permissões do usuário:', error);
      return null;
    }
  }, [user]);

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');

        if (token && userData) {
          try {
            const parsedUser = JSON.parse(userData);
            axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            try {
              const freshUser = await refreshUserFromServer(token, parsedUser);
              setUser(freshUser);
            } catch (refreshError) {
              console.warn('Não foi possível atualizar permissões do usuário:', refreshError);
              setUser(mergeUserPermissions(parsedUser, {}));
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
      const response = await api.post('/auth/login', { email, senha });
      const { token, user: loggedUser } = response.data;

      localStorage.setItem('token', token);
      sessionStorage.setItem('token', token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

      let finalUser = mergeUserPermissions(loggedUser, {});
      try {
        finalUser = await refreshUserFromServer(token, finalUser);
      } catch (refreshError) {
        console.warn('Login OK, mas não foi possível atualizar perfil completo:', refreshError);
      }

      localStorage.setItem('user', JSON.stringify(finalUser));
      setUser(finalUser);
      invalidatePermissionsCache(finalUser?.id);

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
    <AuthContext.Provider value={{ user, login, logout, loading, applyFreshUser, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};
