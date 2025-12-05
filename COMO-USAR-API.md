# 🔌 Como Usar a API no Frontend

## 📋 Exemplo: Atualizar página de Vendas

### Antes (IndexedDB):
```typescript
import { vendaService } from '../utils/dbService';

const vendas = await vendaService.getAll();
```

### Depois (API):
```typescript
import { apiVendas } from '../utils/apiService';

// Minhas vendas
const vendas = await apiVendas.getAll({ meus: true });

// Todas as vendas (apenas Diretoria)
const todasVendas = await apiVendas.getAll({ todos: true });

// Vendas de um usuário específico (apenas Diretoria)
const vendasUsuario = await apiVendas.getAll({ usuarioId: '123' });
```

---

## 🔐 Autenticação

### Atualizar Login:
```typescript
// src/pages/Login.tsx
import { apiAuth } from '../utils/apiService';

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  
  try {
    const { token, usuario } = await apiAuth.login(email, senha);
    
    // Salvar token e usuário
    localStorage.setItem('token', token);
    localStorage.setItem('usuario_autenticado', JSON.stringify(usuario));
    
    navigate('/');
  } catch (error) {
    setErro('Email ou senha incorretos');
  }
};
```

---

## 📊 Filtros de Vendas

### Exemplo na página de Vendas:
```typescript
const [filtro, setFiltro] = useState<'meus' | 'todos' | 'usuario'>('meus');
const [usuarioSelecionado, setUsuarioSelecionado] = useState<string>('');

const loadVendas = async () => {
  try {
    let vendas;
    
    if (filtro === 'todos' && isAdmin) {
      vendas = await apiVendas.getAll({ todos: true });
    } else if (filtro === 'usuario' && usuarioSelecionado) {
      vendas = await apiVendas.getAll({ usuarioId: usuarioSelecionado });
    } else {
      vendas = await apiVendas.getAll({ meus: true });
    }
    
    setVendas(vendas);
  } catch (error) {
    console.error('Erro ao carregar vendas:', error);
  }
};
```

---

## ⚙️ Configurar URL da API

Crie arquivo `.env` na raiz do projeto:
```
VITE_API_URL=http://localhost:3000/api
```

Para produção:
```
VITE_API_URL=https://sua-api.vercel.app/api
```

---

## 🔄 Migração Gradual

Você pode manter ambos os sistemas funcionando:

1. **Fase 1**: Backend configurado e testado
2. **Fase 2**: Migrar módulo por módulo (ex: Vendas primeiro)
3. **Fase 3**: Desativar IndexedDB quando tudo estiver migrado

---

**Pronto para começar! 🚀**

