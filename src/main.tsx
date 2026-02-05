import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { initDatabase } from './db/database'
import { AuthProvider } from './contexts/AuthContext'
import { usuarioService } from './utils/services/usuarioService'

// Inicializar banco de dados e usuários padrão
initDatabase().then(async () => {
  // Criar usuários padrão se não existirem
  await usuarioService.inicializarUsuariosPadrao();
  
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <AuthProvider>
        <App />
      </AuthProvider>
    </React.StrictMode>,
  )
})


