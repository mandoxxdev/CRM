# Solução para Erro de Dependências

## Problema
```
Failed to resolve import "dexie" from "src/db/database.ts"
Failed to resolve import "framer-motion" from "src/pages/Produtos.tsx"
```

## Solução

### Opção 1: Reinstalar Dependências (Recomendado)

1. **Feche o servidor Vite** (Ctrl+C no terminal)

2. **Delete o node_modules e package-lock.json:**
   ```powershell
   Remove-Item -Recurse -Force node_modules
   Remove-Item -Force package-lock.json
   ```

3. **Reinstale todas as dependências:**
   ```powershell
   npm install
   ```

4. **Aguarde a instalação terminar** (pode levar alguns minutos)

5. **Execute novamente:**
   ```powershell
   npm run dev
   ```

### Opção 2: Usar o Script Batch

Execute o arquivo `instalar-dependencias.bat` com duplo clique ou:

```cmd
instalar-dependencias.bat
```

### Opção 3: Instalar Dependências Manualmente

Se ainda não funcionar, instale cada uma manualmente:

```powershell
npm install dexie@^3.2.4
npm install recharts@^2.10.3
npm install framer-motion@^10.16.16
```

### Opção 4: Verificar Instalação

Verifique se as dependências foram instaladas:

```powershell
npm list dexie
npm list recharts
npm list framer-motion
```

Se aparecer "empty" ou erro, as dependências não foram instaladas.

### Opção 5: Problema com Caminho (Espaços no Nome)

Se o caminho do projeto contém espaços (como "OneDrive - MOINHO YPIRANGA..."), isso pode causar problemas.

**Solução temporária:**
1. Mova o projeto para uma pasta sem espaços, ou
2. Use aspas ao executar comandos:
   ```powershell
   cd "C:\Users\mathe\OneDrive - MOINHO YPIRANGA INDUSTRIA DE MAQUINAS LTDA\GMP - MODELO DE DOCUMENTOS\CRM - GMP"
   npm install
   ```

## Verificação Final

Após instalar, verifique se os arquivos existem:

```powershell
Test-Path "node_modules\dexie\package.json"
Test-Path "node_modules\recharts\package.json"
Test-Path "node_modules\framer-motion\package.json"
```

Todos devem retornar `True`.

## Se Nada Funcionar

1. Verifique se o Node.js está funcionando:
   ```powershell
   node --version
   npm --version
   ```

2. Tente usar yarn ao invés de npm:
   ```powershell
   npm install -g yarn
   yarn install
   yarn dev
   ```

3. Verifique se há problemas de permissão:
   - Execute o PowerShell como Administrador
   - Verifique se o antivírus não está bloqueando

## Dependências Necessárias

O projeto precisa das seguintes dependências:

- ✅ dexie (banco de dados)
- ✅ recharts (gráficos)
- ✅ framer-motion (animações)
- ✅ react, react-dom (já instalados)
- ✅ react-router-dom (já instalado)
- ✅ lucide-react (já instalado)
- ✅ date-fns (já instalado)

Todas estão listadas no `package.json`, mas precisam ser instaladas fisicamente no `node_modules`.

