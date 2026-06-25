# 🎨 GUIA DO DESIGN SYSTEM PREMIUM - GMP INDUSTRIAIS

## 📚 ÍNDICE
1. [Visão Geral](#visão-geral)
2. [Estrutura de Arquivos](#estrutura-de-arquivos)
3. [Como Usar](#como-usar)
4. [Componentes Disponíveis](#componentes-disponíveis)
5. [Exemplos Práticos](#exemplos-práticos)

---

## 🎯 VISÃO GERAL

O Design System Premium foi criado para garantir consistência visual e facilitar o desenvolvimento. Todos os componentes seguem as mesmas diretrizes de design.

### **Princípios:**
- ✅ **Consistência**: Mesmos padrões em todo o sistema
- ✅ **Escalabilidade**: Fácil adicionar novos componentes
- ✅ **Manutenibilidade**: Mudanças centralizadas
- ✅ **Performance**: CSS otimizado e animações suaves

---

## 📁 ESTRUTURA DE ARQUIVOS

```
client/src/styles/
├── design-tokens.css    # Variáveis CSS (cores, espaçamentos, sombras)
├── typography.css       # Sistema tipográfico
├── components.css       # Botões, Cards, Inputs
├── animations.css       # Animações e microinterações
├── layout.css          # Grid system e espaçamentos
└── utilities.css       # Classes utilitárias (tooltips, badges, etc)
```

**Ordem de Importação (em `index.js`):**
```javascript
import './styles/design-tokens.css';  // 1. Base
import './styles/typography.css';     // 2. Tipografia
import './styles/components.css';     // 3. Componentes
import './styles/animations.css';     // 4. Animações
import './styles/layout.css';         // 5. Layout
import './styles/utilities.css';      // 6. Utilitários
```

---

## 🚀 COMO USAR

### **1. Botões Premium**

```jsx
// Botão Primário
<button className="btn-premium btn-primary">
  Salvar
</button>

// Botão Secundário
<button className="btn-premium btn-secondary">
  Cancelar
</button>

// Botão de Sucesso
<button className="btn-premium btn-success">
  Confirmar
</button>

// Botão de Erro
<button className="btn-premium btn-error">
  Excluir
</button>

// Tamanhos
<button className="btn-premium btn-primary btn-sm">Pequeno</button>
<button className="btn-premium btn-primary">Normal</button>
<button className="btn-premium btn-primary btn-lg">Grande</button>

// Com Ícone
<button className="btn-premium btn-primary">
  <FiSave className="icon-md" />
  Salvar
</button>
```

### **2. Cards Premium**

```jsx
// Card Básico
<div className="card-premium">
  <div className="card-header">
    <h3>Título do Card</h3>
  </div>
  <div className="card-body">
    <p>Conteúdo do card aqui...</p>
  </div>
  <div className="card-footer">
    <button className="btn-premium btn-primary">Ação</button>
  </div>
</div>

// Card com Glassmorphism
<div className="card-premium card-glass">
  Conteúdo com efeito glass
</div>
```

### **3. Inputs Premium**

```jsx
// Input Básico
<input 
  type="text" 
  className="input-premium" 
  placeholder="Digite aqui..."
/>

// Input com Ícone
<div className="input-with-icon">
  <FiSearch className="input-icon" />
  <input 
    type="text" 
    className="input-premium" 
    placeholder="Buscar..."
  />
</div>

// Input com Estado de Erro
<input 
  type="text" 
  className="input-premium error" 
  placeholder="Campo com erro"
/>

// Input com Estado de Sucesso
<input 
  type="text" 
  className="input-premium success" 
  placeholder="Campo válido"
/>

// Select Premium
<select className="select-premium">
  <option>Opção 1</option>
  <option>Opção 2</option>
</select>

// Textarea Premium
<textarea className="textarea-premium" rows="4">
</textarea>
```

### **4. Badges Premium**

```jsx
<span className="badge-premium badge-success">Ativo</span>
<span className="badge-premium badge-warning">Pendente</span>
<span className="badge-premium badge-error">Inativo</span>
<span className="badge-premium badge-info">Novo</span>
<span className="badge-premium badge-primary">Premium</span>

// Badge Outline
<span className="badge-premium badge-outline badge-success">Ativo</span>
```

### **5. Tooltips Premium**

```jsx
<button 
  className="tooltip-premium" 
  data-tooltip="Esta é uma dica útil"
>
  Passe o mouse
</button>

// Direções
<button 
  className="tooltip-premium tooltip-top" 
  data-tooltip="Tooltip acima"
>
  Top
</button>

<button 
  className="tooltip-premium tooltip-bottom" 
  data-tooltip="Tooltip abaixo"
>
  Bottom
</button>
```

### **6. Animações**

```jsx
// Fade In
<div className="animate-fade-in">Aparece suavemente</div>

// Slide In
<div className="animate-slide-in-up">Desliza de baixo</div>
<div className="animate-slide-in-right">Desliza da direita</div>

// Scale In
<div className="animate-scale-in">Cresce suavemente</div>

// Hover Effects
<div className="hover-lift">Eleva ao passar o mouse</div>
<div className="hover-glow">Brilha ao passar o mouse</div>
<div className="hover-scale">Aumenta ao passar o mouse</div>
```

### **7. Loading States**

```jsx
// Spinner
<div className="spinner-premium"></div>
<div className="spinner-premium spinner-sm"></div>
<div className="spinner-premium spinner-lg"></div>

// Skeleton Loading
<div className="skeleton" style={{ height: '20px', width: '100%' }}></div>
<div className="skeleton" style={{ height: '100px', width: '100%', marginTop: '10px' }}></div>

// Progress Bar
<div className="progress-bar">
  <div className="progress-bar-fill" style={{ width: '60%' }}></div>
</div>
```

### **8. Grid System**

```jsx
// Grid 2 Colunas
<div className="grid grid-cols-2 gap-4">
  <div>Item 1</div>
  <div>Item 2</div>
</div>

// Grid 3 Colunas
<div className="grid grid-cols-3 gap-6">
  <div>Item 1</div>
  <div>Item 2</div>
  <div>Item 3</div>
</div>

// Grid Responsivo (4 colunas no desktop, 1 no mobile)
<div className="grid grid-cols-4 gap-6">
  <div>Item 1</div>
  <div>Item 2</div>
  <div>Item 3</div>
  <div>Item 4</div>
</div>
```

### **9. Alerts**

```jsx
<div className="alert alert-success">
  <FiCheckCircle className="icon-md" />
  <div>
    <strong>Sucesso!</strong> Operação realizada com sucesso.
  </div>
</div>

<div className="alert alert-error">
  <FiAlertCircle className="icon-md" />
  <div>
    <strong>Erro!</strong> Algo deu errado.
  </div>
</div>

<div className="alert alert-warning">
  <FiAlertTriangle className="icon-md" />
  <div>
    <strong>Atenção!</strong> Verifique os dados.
  </div>
</div>

<div className="alert alert-info">
  <FiInfo className="icon-md" />
  <div>
    <strong>Info:</strong> Informação importante.
  </div>
</div>
```

### **10. Empty States**

```jsx
<div className="empty-state">
  <div className="empty-state-icon">
    <FiInbox />
  </div>
  <div className="empty-state-title">Nenhum item encontrado</div>
  <div className="empty-state-description">
    Adicione um novo item para começar.
  </div>
</div>
```

---

## 🎨 VARIÁVEIS CSS DISPONÍVEIS

### **Cores**
```css
var(--gmp-primary-500)      /* Azul principal */
var(--gmp-success)            /* Verde */
var(--gmp-error)              /* Vermelho */
var(--gmp-warning)             /* Laranja */
var(--gmp-info)               /* Azul claro */
var(--gmp-gray-50) até var(--gmp-gray-900)  /* Escala de cinza */
```

### **Espaçamentos**
```css
var(--space-1)   /* 4px */
var(--space-2)    /* 8px */
var(--space-4)    /* 16px */
var(--space-6)    /* 24px */
var(--space-8)    /* 32px */
```

### **Bordas**
```css
var(--radius-sm)   /* 8px */
var(--radius-md)   /* 12px */
var(--radius-lg)   /* 16px */
var(--radius-xl)   /* 20px */
var(--radius-full) /* 9999px */
```

### **Sombras**
```css
var(--elevation-1) até var(--elevation-6)
var(--shadow-primary)
var(--shadow-success)
var(--shadow-error)
```

### **Transições**
```css
var(--transition-fast)   /* 150ms */
var(--transition-base)   /* 200ms */
var(--transition-slow)   /* 300ms */
var(--transition-bounce) /* 500ms */
```

---

## 📝 EXEMPLOS PRÁTICOS

### **Formulário Completo**

```jsx
<div className="card-premium">
  <div className="card-header">
    <h3>Novo Cliente</h3>
  </div>
  <div className="card-body">
    <div className="grid grid-cols-2 gap-4">
      <div>
        <label>Nome</label>
        <input type="text" className="input-premium" />
      </div>
      <div>
        <label>Email</label>
        <input type="email" className="input-premium" />
      </div>
    </div>
    <div style={{ marginTop: '16px' }}>
      <label>Observações</label>
      <textarea className="textarea-premium" rows="4"></textarea>
    </div>
  </div>
  <div className="card-footer">
    <button className="btn-premium btn-secondary">Cancelar</button>
    <button className="btn-premium btn-primary">Salvar</button>
  </div>
</div>
```

### **Tabela com Badges**

```jsx
<table>
  <thead>
    <tr>
      <th>Nome</th>
      <th>Status</th>
      <th>Ações</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Cliente 1</td>
      <td>
        <span className="badge-premium badge-success">Ativo</span>
      </td>
      <td>
        <button className="btn-premium btn-primary btn-sm">Editar</button>
      </td>
    </tr>
  </tbody>
</table>
```

### **Card com Loading**

```jsx
{loading ? (
  <div className="card-premium">
    <div className="card-body">
      <div className="skeleton" style={{ height: '20px', marginBottom: '10px' }}></div>
      <div className="skeleton" style={{ height: '20px', marginBottom: '10px' }}></div>
      <div className="skeleton" style={{ height: '100px' }}></div>
    </div>
  </div>
) : (
  <div className="card-premium animate-fade-in">
    <div className="card-body">
      <h3>Conteúdo Carregado</h3>
      <p>Dados aqui...</p>
    </div>
  </div>
)}
```

---

## 🎯 BOAS PRÁTICAS

1. **Sempre use as classes do Design System** em vez de criar estilos inline
2. **Combine classes** para criar variações (ex: `btn-premium btn-primary btn-sm`)
3. **Use variáveis CSS** para cores e espaçamentos em estilos customizados
4. **Mantenha consistência** usando os mesmos componentes em todo o sistema
5. **Teste responsividade** usando as classes do grid system

---

## 🔧 CUSTOMIZAÇÃO

Para customizar cores ou espaçamentos, edite `client/src/styles/design-tokens.css`:

```css
:root {
  --gmp-primary-500: #0066cc;  /* Altere aqui */
  --space-6: 24px;              /* Altere aqui */
}
```

Todas as mudanças serão aplicadas automaticamente em todo o sistema!

---

**Design System criado com ❤️ para GMP INDUSTRIAIS**
