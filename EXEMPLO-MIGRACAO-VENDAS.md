# 📝 Exemplo: Migrar Página de Vendas para API

## Antes (IndexedDB)

```typescript
// src/pages/Vendas.tsx
import { vendaService } from '../utils/dbService';

const loadVendas = async () => {
  const vendas = await vendaService.getAll();
  setVendas(vendas);
};
```

## Depois (API)

```typescript
// src/pages/Vendas.tsx
import { apiVendas } from '../utils/apiService';
import { useAuth } from '../contexts/AuthContext';

export default function Vendas() {
  const { usuario } = useAuth();
  const [vendas, setVendas] = useState([]);
  const [filtro, setFiltro] = useState<'meus' | 'todos' | 'usuario'>('meus');
  const [usuarioSelecionado, setUsuarioSelecionado] = useState('');
  const [usuarios, setUsuarios] = useState([]);

  const isAdmin = usuario?.perfil === 'Diretoria' && usuario?.email === 'matheus@gmp.ind.br';

  const loadVendas = async () => {
    try {
      let vendasData;
      
      if (filtro === 'todos' && isAdmin) {
        // Todas as vendas (apenas admin)
        vendasData = await apiVendas.getAll({ todos: true });
      } else if (filtro === 'usuario' && usuarioSelecionado) {
        // Vendas de um usuário específico (apenas admin)
        vendasData = await apiVendas.getAll({ usuarioId: usuarioSelecionado });
      } else {
        // Apenas minhas vendas
        vendasData = await apiVendas.getAll({ meus: true });
      }
      
      setVendas(vendasData);
    } catch (error) {
      console.error('Erro ao carregar vendas:', error);
      alert('Erro ao carregar vendas');
    }
  };

  // Filtros na UI
  return (
    <div>
      {isAdmin && (
        <div className="mb-4 flex gap-2">
          <button
            onClick={() => setFiltro('meus')}
            className={filtro === 'meus' ? 'btn-primary' : 'btn-secondary'}
          >
            Minhas Vendas
          </button>
          <button
            onClick={() => setFiltro('todos')}
            className={filtro === 'todos' ? 'btn-primary' : 'btn-secondary'}
          >
            Todas as Vendas
          </button>
          <select
            value={usuarioSelecionado}
            onChange={(e) => {
              setUsuarioSelecionado(e.target.value);
              setFiltro('usuario');
            }}
            className="input"
          >
            <option value="">Selecione um usuário</option>
            {usuarios.map(u => (
              <option key={u.id} value={u.id}>{u.nome}</option>
            ))}
          </select>
        </div>
      )}
      
      {/* Lista de vendas */}
    </div>
  );
}
```

---

## 🔄 Atualizar AuthContext

```typescript
// src/contexts/AuthContext.tsx
import { apiAuth } from '../utils/apiService';

const login = async (email: string, senha: string): Promise<boolean> => {
  try {
    const { token, usuario } = await apiAuth.login(email, senha);
    
    // Salvar token e usuário
    localStorage.setItem('token', token);
    localStorage.setItem('usuario_autenticado', JSON.stringify(usuario));
    
    setUsuario(usuario);
    return true;
  } catch (error) {
    console.error('Erro ao fazer login:', error);
    return false;
  }
};
```

---

**Pronto! Agora você pode consultar vendas de todos os usuários! 🎉**

