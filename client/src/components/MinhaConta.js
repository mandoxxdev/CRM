import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { FiArrowLeft, FiUser, FiLock, FiCamera, FiTrash2, FiSave } from 'react-icons/fi';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import './MinhaConta.css';

const avatarUrl = (filename) =>
  filename ? `${api.defaults.baseURL}/uploads/avatares/${filename}` : null;

export default function MinhaConta() {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const fileRef = useRef(null);

  const [aba, setAba] = useState('perfil');
  const [loading, setLoading] = useState(true);
  const [semAcesso, setSemAcesso] = useState(false);
  const [conta, setConta] = useState(null);
  const [perfil, setPerfil] = useState({ nome: '', telefone: '', ramal: '', data_nascimento: '', bio: '' });
  const [senha, setSenha] = useState({ senha_atual: '', nova_senha: '', confirmar: '' });
  const [salvandoPerfil, setSalvandoPerfil] = useState(false);
  const [salvandoSenha, setSalvandoSenha] = useState(false);
  const [enviandoFoto, setEnviandoFoto] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/conta');
      setConta(data);
      setPerfil({
        nome: data.nome || '',
        telefone: data.telefone || '',
        ramal: data.ramal || '',
        data_nascimento: data.data_nascimento || '',
        bio: data.bio || '',
      });
    } catch (e) {
      if (e.response?.status === 403) {
        setSemAcesso(true);
      } else {
        toast.error(e.response?.data?.error || 'Erro ao carregar dados da conta');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const salvarPerfil = async (e) => {
    e.preventDefault();
    if (!perfil.nome.trim()) { toast.error('O nome não pode ficar vazio'); return; }
    setSalvandoPerfil(true);
    try {
      await api.put('/conta', perfil);
      toast.success('Informações salvas!');
      await refreshUser();
      carregar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar informações');
    } finally {
      setSalvandoPerfil(false);
    }
  };

  const salvarSenha = async (e) => {
    e.preventDefault();
    if (senha.nova_senha.length < 6) { toast.error('A nova senha deve ter pelo menos 6 caracteres'); return; }
    if (senha.nova_senha !== senha.confirmar) { toast.error('A confirmação não confere com a nova senha'); return; }
    setSalvandoSenha(true);
    try {
      await api.put('/conta/senha', { senha_atual: senha.senha_atual, nova_senha: senha.nova_senha });
      toast.success('Senha alterada com sucesso!');
      setSenha({ senha_atual: '', nova_senha: '', confirmar: '' });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao alterar a senha');
    } finally {
      setSalvandoSenha(false);
    }
  };

  const enviarFoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('A imagem deve ter no máximo 5MB'); return; }
    const fd = new FormData();
    fd.append('foto', file);
    setEnviandoFoto(true);
    try {
      const { data } = await api.post('/conta/foto', fd);
      setConta((c) => ({ ...c, foto_url: data.foto_url }));
      toast.success('Foto atualizada!');
      await refreshUser();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao enviar a foto');
    } finally {
      setEnviandoFoto(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removerFoto = async () => {
    if (!conta?.foto_url) return;
    setEnviandoFoto(true);
    try {
      await api.delete('/conta/foto');
      setConta((c) => ({ ...c, foto_url: null }));
      toast.success('Foto removida');
      await refreshUser();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao remover a foto');
    } finally {
      setEnviandoFoto(false);
    }
  };

  const iniciais = (conta?.nome || '?')
    .split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();

  if (loading) {
    return <div className="conta-loading"><div className="conta-spinner" /><p>Carregando...</p></div>;
  }

  if (semAcesso) {
    return (
      <div className="conta-page">
        <div className="conta-sem-acesso">
          <FiLock />
          <h2>Acesso indisponível</h2>
          <p>O acesso às configurações de conta foi desativado pelo administrador.</p>
          <button className="conta-btn-secundario" onClick={() => navigate(-1)}>Voltar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="conta-page">
      <div className="conta-header">
        <button className="conta-voltar" onClick={() => navigate(-1)}><FiArrowLeft /> Voltar</button>
        <div>
          <h1>Minha Conta</h1>
          <p>Gerencie seus dados pessoais, foto e senha</p>
        </div>
      </div>

      <div className="conta-perfil-resumo">
        <div className="conta-avatar-wrap">
          {conta?.foto_url
            ? <img className="conta-avatar" src={avatarUrl(conta.foto_url)} alt="Foto de perfil" />
            : <div className="conta-avatar conta-avatar-placeholder">{iniciais}</div>}
          <button
            className="conta-avatar-btn"
            onClick={() => fileRef.current?.click()}
            disabled={enviandoFoto}
            title="Trocar foto"
          >
            <FiCamera />
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={enviarFoto} />
        </div>
        <div className="conta-perfil-info">
          <strong>{conta?.nome}</strong>
          <span>{conta?.email}</span>
          {conta?.cargo && <span className="conta-cargo">{conta.cargo}</span>}
          {conta?.foto_url && (
            <button className="conta-remover-foto" onClick={removerFoto} disabled={enviandoFoto}>
              <FiTrash2 /> Remover foto
            </button>
          )}
        </div>
      </div>

      <div className="conta-tabs">
        <button className={aba === 'perfil' ? 'ativa' : ''} onClick={() => setAba('perfil')}>
          <FiUser /> Informações pessoais
        </button>
        <button className={aba === 'senha' ? 'ativa' : ''} onClick={() => setAba('senha')}>
          <FiLock /> Alterar senha
        </button>
      </div>

      {aba === 'perfil' && (
        <form className="conta-card" onSubmit={salvarPerfil}>
          <div className="conta-grid">
            <div className="conta-campo">
              <label>Nome completo *</label>
              <input value={perfil.nome} onChange={(e) => setPerfil(p => ({ ...p, nome: e.target.value }))} required />
            </div>
            <div className="conta-campo">
              <label>E-mail</label>
              <input value={conta?.email || ''} disabled title="O e-mail é gerenciado pelo administrador" />
            </div>
            <div className="conta-campo">
              <label>Telefone</label>
              <input value={perfil.telefone} onChange={(e) => setPerfil(p => ({ ...p, telefone: e.target.value }))} placeholder="(11) 99999-9999" />
            </div>
            <div className="conta-campo">
              <label>Ramal</label>
              <input value={perfil.ramal} onChange={(e) => setPerfil(p => ({ ...p, ramal: e.target.value }))} placeholder="Ex: 204" />
            </div>
            <div className="conta-campo">
              <label>Data de nascimento</label>
              <input type="date" value={perfil.data_nascimento || ''} onChange={(e) => setPerfil(p => ({ ...p, data_nascimento: e.target.value }))} />
            </div>
            <div className="conta-campo">
              <label>Cargo</label>
              <input value={conta?.cargo || ''} disabled title="O cargo é gerenciado pelo administrador" />
            </div>
            <div className="conta-campo">
              <label>Setor</label>
              <input value={conta?.setor || ''} disabled />
            </div>
            <div className="conta-campo">
              <label>Departamento</label>
              <input value={conta?.departamento || ''} disabled />
            </div>
            <div className="conta-campo conta-campo-full">
              <label>Sobre mim</label>
              <textarea rows={3} value={perfil.bio} onChange={(e) => setPerfil(p => ({ ...p, bio: e.target.value }))} placeholder="Uma breve descrição (opcional)" />
            </div>
          </div>
          <div className="conta-acoes">
            <button type="submit" className="conta-btn-primario" disabled={salvandoPerfil}>
              <FiSave /> {salvandoPerfil ? 'Salvando...' : 'Salvar alterações'}
            </button>
          </div>
        </form>
      )}

      {aba === 'senha' && (
        <form className="conta-card" onSubmit={salvarSenha}>
          <div className="conta-grid">
            <div className="conta-campo conta-campo-full">
              <label>Senha atual *</label>
              <input type="password" value={senha.senha_atual} onChange={(e) => setSenha(s => ({ ...s, senha_atual: e.target.value }))} required autoComplete="current-password" />
            </div>
            <div className="conta-campo">
              <label>Nova senha *</label>
              <input type="password" value={senha.nova_senha} onChange={(e) => setSenha(s => ({ ...s, nova_senha: e.target.value }))} required minLength={6} autoComplete="new-password" placeholder="Mínimo 6 caracteres" />
            </div>
            <div className="conta-campo">
              <label>Confirmar nova senha *</label>
              <input type="password" value={senha.confirmar} onChange={(e) => setSenha(s => ({ ...s, confirmar: e.target.value }))} required minLength={6} autoComplete="new-password" />
            </div>
          </div>
          <div className="conta-acoes">
            <button type="submit" className="conta-btn-primario" disabled={salvandoSenha}>
              <FiLock /> {salvandoSenha ? 'Alterando...' : 'Alterar senha'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
