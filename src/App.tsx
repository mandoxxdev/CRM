import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Clientes from './pages/Clientes';
import ClienteDetail from './pages/ClienteDetail';
import Contatos from './pages/Contatos';
import Oportunidades from './pages/Oportunidades';
import OportunidadeDetail from './pages/OportunidadeDetail';
import Atividades from './pages/Atividades';
import Produtos from './pages/Produtos';
import ProdutoDetail from './pages/ProdutoDetail';
import Vendas from './pages/Vendas';
import VendaDetail from './pages/VendaDetail';
import NovaVenda from './pages/NovaVenda';
import Calendario from './pages/Calendario';
import TesteBanco from './pages/TesteBanco';
import Usuarios from './pages/Usuarios';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <Layout>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/clientes" element={<Clientes />} />
                  <Route path="/clientes/:id" element={<ClienteDetail />} />
                  <Route path="/contatos" element={<Contatos />} />
                  <Route path="/oportunidades" element={<Oportunidades />} />
                  <Route path="/oportunidades/:id" element={<OportunidadeDetail />} />
                  <Route path="/atividades" element={<Atividades />} />
                  <Route path="/produtos" element={<Produtos />} />
                  <Route path="/produtos/:id" element={<ProdutoDetail />} />
                  <Route path="/vendas" element={<Vendas />} />
                  <Route path="/vendas/nova" element={<NovaVenda />} />
                  <Route path="/vendas/:id" element={<VendaDetail />} />
                  <Route path="/calendario" element={<Calendario />} />
                  <Route path="/usuarios" element={<Usuarios />} />
                  <Route path="/teste-banco" element={<TesteBanco />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Layout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;


