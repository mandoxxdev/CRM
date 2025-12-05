import { ReactNode, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  UserCircle, 
  TrendingUp, 
  Calendar,
  CalendarDays,
  Package,
  ShoppingCart,
  Menu,
  X,
  LogOut,
  User,
  Shield
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface LayoutProps {
  children: ReactNode;
}


export default function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { usuario, logout } = useAuth();
  
  // Verificar se é administrador
  const isAdmin = usuario?.perfil === 'Diretoria' && usuario?.email === 'matheus@gmp.ind.br';
  
  const menuItems = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/clientes', label: 'Clientes', icon: Users },
    { path: '/contatos', label: 'Contatos', icon: UserCircle },
    { path: '/produtos', label: 'Produtos', icon: Package },
    { path: '/vendas', label: 'Vendas', icon: ShoppingCart },
    { path: '/oportunidades', label: 'Oportunidades', icon: TrendingUp },
    { path: '/calendario', label: 'Calendário', icon: CalendarDays },
    { path: '/atividades', label: 'Atividades', icon: Calendar },
    ...(isAdmin ? [{ path: '/usuarios', label: 'Usuários', icon: Shield }] : []),
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-primary-600">CRM GMP</h1>
            </div>
            <div className="flex items-center gap-4">
              {usuario && (
                <div className="hidden md:flex items-center gap-3 px-3 py-1.5 bg-gray-50 rounded-lg">
                  <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                    <User className="text-primary-600" size={18} />
                  </div>
                  <div className="text-sm">
                    <p className="font-medium text-gray-900">{usuario.nome}</p>
                    <p className="text-xs text-gray-500">{usuario.perfil}</p>
                  </div>
                </div>
              )}
              <button
                onClick={logout}
                className="hidden md:flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                title="Sair"
              >
                <LogOut size={18} />
                <span>Sair</span>
              </button>
              <button
                className="md:hidden p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar Desktop */}
        <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 md:pt-16">
          <div className="flex-1 flex flex-col bg-white border-r border-gray-200">
            <nav className="flex-1 px-2 py-4 space-y-1">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                      isActive
                        ? 'bg-primary-50 text-primary-700'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className="mr-3 h-5 w-5" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div className="fixed inset-0 bg-gray-600 bg-opacity-75" onClick={() => setMobileMenuOpen(false)} />
            <div className="fixed inset-y-0 left-0 w-64 bg-white">
              <div className="flex flex-col h-full pt-16">
                <nav className="flex-1 px-2 py-4 space-y-1">
                  {menuItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = location.pathname === item.path;
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                          isActive
                            ? 'bg-primary-50 text-primary-700'
                            : 'text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <Icon className="mr-3 h-5 w-5" />
                        {item.label}
                      </Link>
                    );
                  })}
                  {usuario && (
                    <div className="px-4 py-3 border-t border-gray-200 mt-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                          <User className="text-primary-600" size={18} />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">{usuario.nome}</p>
                          <p className="text-xs text-gray-500">{usuario.perfil}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          logout();
                          setMobileMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <LogOut size={18} />
                        Sair
                      </button>
                    </div>
                  )}
                </nav>
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <main className="flex-1 md:ml-64">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}


