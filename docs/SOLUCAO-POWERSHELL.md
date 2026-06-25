# Solução para Problema de Política de Execução do PowerShell

## Problema
```
npm : O arquivo C:\Program Files\nodejs\npm.ps1 não pode ser carregado porque 
a execução de scripts foi desabilitada neste sistema.
```

## Soluções

### Solução 1: Alterar Política de Execução (Recomendado)

Abra o PowerShell **como Administrador** e execute:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

Quando perguntado, digite `S` para Sim.

Depois, teste:
```powershell
npm --version
```

### Solução 2: Usar o Prompt de Comando (CMD)

Se o PowerShell continuar dando problema, use o **Prompt de Comando** (CMD) ao invés do PowerShell:

1. Pressione `Win + R`
2. Digite `cmd` e pressione Enter
3. Navegue até a pasta do projeto:
   ```cmd
   cd "C:\Users\mathe\OneDrive - MOINHO YPIRANGA INDUSTRIA DE MAQUINAS LTDA\GMP - MODELO DE DOCUMENTOS\CRM - GMP"
   ```
4. Execute:
   ```cmd
   npm install
   ```

### Solução 3: Usar Scripts Batch (.bat)

Use os arquivos `.bat` que foram criados:

1. **instalar.bat** - Para instalar as dependências
2. **executar.bat** - Para executar o projeto

Basta dar duplo clique neles ou executar no CMD.

### Solução 4: Usar npm.cmd diretamente

No PowerShell, use o caminho completo do npm.cmd:

```powershell
& "C:\Program Files\nodejs\npm.cmd" install
& "C:\Program Files\nodejs\npm.cmd" run dev
```

### Solução 5: Configurar PowerShell Permanentemente

1. Abra PowerShell como **Administrador**
2. Execute:
   ```powershell
   Set-ExecutionPolicy RemoteSigned -Scope LocalMachine
   ```
3. Digite `S` para confirmar
4. Feche e abra um novo PowerShell

## Verificação

Após aplicar qualquer solução, verifique:

```powershell
npm --version
node --version
```

Se ambos retornarem números de versão, está funcionando! ✅

## Próximos Passos

Depois que o npm estiver funcionando:

1. Instale as dependências:
   ```bash
   npm install
   ```

2. Execute o projeto:
   ```bash
   npm run dev
   ```

3. Acesse no navegador: http://localhost:5173

