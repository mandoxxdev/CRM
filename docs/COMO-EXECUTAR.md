# 📝 Como Executar o Script enviar-github.bat

## 🖱️ Método 1: Duplo Clique (Mais Fácil)

1. Abra o **Explorador de Arquivos** (Windows Explorer)
2. Navegue até a pasta do projeto: `CRM - GMP`
3. Procure o arquivo `enviar-github.bat`
4. **Dê duplo clique** no arquivo
5. Uma janela do terminal abrirá e executará automaticamente

---

## ⌨️ Método 2: Pelo Terminal/PowerShell

### Opção A: PowerShell (Recomendado)

1. Abra o **PowerShell** ou **Terminal**
2. Navegue até a pasta do projeto:
   ```powershell
   cd "C:\Users\mathe\OneDrive - MOINHO YPIRANGA INDUSTRIA DE MAQUINAS LTDA\GMP - MODELO DE DOCUMENTOS\CRM - GMP"
   ```
3. Execute o script:
   ```powershell
   .\enviar-github.bat
   ```
   ou
   ```powershell
   enviar-github.bat
   ```

### Opção B: Prompt de Comando (CMD)

1. Abra o **Prompt de Comando** (CMD)
2. Navegue até a pasta:
   ```cmd
   cd "C:\Users\mathe\OneDrive - MOINHO YPIRANGA INDUSTRIA DE MAQUINAS LTDA\GMP - MODELO DE DOCUMENTOS\CRM - GMP"
   ```
3. Execute:
   ```cmd
   enviar-github.bat
   ```

---

## 🎯 Método 3: Pelo VS Code / Cursor

1. Abra o terminal integrado (Ctrl + ` ou Terminal > New Terminal)
2. Execute:
   ```bash
   .\enviar-github.bat
   ```

---

## ⚠️ Se Der Erro

### Erro: "Git não está instalado"
- Baixe e instale: https://git-scm.com/download/win
- Reinicie o terminal após instalar

### Erro: "Permission denied" ou "Acesso negado"
- Execute o PowerShell como Administrador
- Ou use o CMD normal

### Erro: "Repository not found"
- Crie o repositório no GitHub primeiro:
  1. Acesse: https://github.com/mandoxxdev
  2. Clique em "New repository"
  3. Nome: `CRM`
  4. Deixe vazio
  5. Clique em "Create repository"

### Erro: "Authentication failed"
- Configure o Git:
  ```bash
  git config --global user.name "Seu Nome"
  git config --global user.email "seu@email.com"
  ```
- Use Personal Access Token se pedir senha

---

## ✅ O Que o Script Faz

1. ✅ Verifica se Git está instalado
2. ✅ Inicializa repositório Git (se necessário)
3. ✅ Adiciona todos os arquivos
4. ✅ Faz commit
5. ✅ Conecta ao GitHub
6. ✅ Envia o código

---

**Dica:** O método mais fácil é dar **duplo clique** no arquivo `enviar-github.bat`! 🚀

