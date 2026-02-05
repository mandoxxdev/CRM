import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Edit, Trash2, Plus, Phone, Mail, MapPin, Building } from 'lucide-react';
import { storage } from '../utils/storage';
import { formatDateBR, formatPhone, formatCEP } from '../utils/format';
import { generateId } from '../utils/helpers';
import type { Cliente, Contato, Oportunidade, Atividade } from '../types';

export default function ClienteDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [oportunidades, setOportunidades] = useState<Oportunidade[]>([]);
  const [atividades, setAtividades] = useState<Atividade[]>([]);

  useEffect(() => {
    if (id) {
      const clienteData = storage.clientes.getById(id);
      if (clienteData) {
        setCliente(clienteData);
        setContatos(storage.contatos.getByClienteId(id));
        setOportunidades(storage.oportunidades.getByClienteId(id));
        setAtividades(storage.atividades.getByClienteId(id));
      }
    }
  }, [id]);

  const handleDelete = () => {
    if (confirm('Tem certeza que deseja excluir este cliente?')) {
      if (id) {
        storage.clientes.delete(id);
        navigate('/clientes');
      }
    }
  };

  if (!cliente) {
    return (
      <div className="card text-center py-12">
        <p className="text-gray-500">Cliente não encontrado.</p>
        <Link to="/clientes" className="btn-primary mt-4 inline-block">
          Voltar para Clientes
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <Link
          to="/clientes"
          className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft size={20} className="mr-2" />
          Voltar
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{cliente.nome}</h1>
            {cliente.empresa && (
              <p className="mt-1 text-lg text-gray-600">{cliente.empresa}</p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleDelete}
              className="btn-danger flex items-center gap-2"
            >
              <Trash2 size={18} />
              <span className="hidden sm:inline">Excluir</span>
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Informações de Contato */}
          <div className="card">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Informações de Contato</h2>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Mail className="text-gray-400" size={20} />
                <span>{cliente.email}</span>
              </div>
              <div className="flex items-center gap-3">
                <Phone className="text-gray-400" size={20} />
                <span>{formatPhone(cliente.telefone)}</span>
              </div>
              {cliente.endereco && (
                <div className="flex items-start gap-3">
                  <MapPin className="text-gray-400 mt-1" size={20} />
                  <div>
                    <p>{cliente.endereco}</p>
                    {cliente.cidade && cliente.estado && (
                      <p className="text-sm text-gray-600">
                        {cliente.cidade}, {cliente.estado}
                      </p>
                    )}
                    {cliente.cep && (
                      <p className="text-sm text-gray-600">CEP: {formatCEP(cliente.cep)}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
            {cliente.observacoes && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <h3 className="text-sm font-medium text-gray-700 mb-2">Observações</h3>
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{cliente.observacoes}</p>
              </div>
            )}
          </div>

          {/* Contatos */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Contatos</h2>
              <Link
                to={`/contatos?clienteId=${cliente.id}`}
                className="btn-primary flex items-center gap-2 text-sm"
              >
                <Plus size={16} />
                Adicionar
              </Link>
            </div>
            {contatos.length > 0 ? (
              <div className="space-y-3">
                {contatos.map((contato) => (
                  <div key={contato.id} className="p-3 bg-gray-50 rounded-lg">
                    <p className="font-medium text-gray-900">{contato.nome}</p>
                    {contato.cargo && (
                      <p className="text-sm text-gray-600">{contato.cargo}</p>
                    )}
                    <div className="mt-2 text-sm text-gray-600">
                      <p>{contato.email}</p>
                      <p>{formatPhone(contato.telefone)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">Nenhum contato cadastrado.</p>
            )}
          </div>

          {/* Oportunidades */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Oportunidades</h2>
              <Link
                to={`/oportunidades?clienteId=${cliente.id}`}
                className="btn-primary flex items-center gap-2 text-sm"
              >
                <Plus size={16} />
                Nova
              </Link>
            </div>
            {oportunidades.length > 0 ? (
              <div className="space-y-3">
                {oportunidades.map((oportunidade) => (
                  <Link
                    key={oportunidade.id}
                    to={`/oportunidades/${oportunidade.id}`}
                    className="block p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <p className="font-medium text-gray-900">{oportunidade.titulo}</p>
                    <p className="text-sm text-gray-600 mt-1">
                      {new Intl.NumberFormat('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                      }).format(oportunidade.valor)}
                    </p>
                    <span className="inline-block mt-2 px-2 py-1 text-xs font-medium bg-primary-100 text-primary-700 rounded">
                      {oportunidade.etapa}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">Nenhuma oportunidade cadastrada.</p>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {/* Atividades Recentes */}
          <div className="card">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Atividades Recentes</h2>
            {atividades.length > 0 ? (
              <div className="space-y-3">
                {atividades.slice(0, 5).map((atividade) => (
                  <div key={atividade.id} className="p-3 bg-gray-50 rounded-lg">
                    <p className="font-medium text-sm text-gray-900">{atividade.titulo}</p>
                    <p className="text-xs text-gray-600 mt-1">
                      {formatDateBR(atividade.data)}
                    </p>
                    {atividade.concluida && (
                      <span className="inline-block mt-2 text-xs text-green-600">✓ Concluída</span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">Nenhuma atividade registrada.</p>
            )}
            <Link
              to={`/atividades?clienteId=${cliente.id}`}
              className="block mt-4 text-sm text-primary-600 hover:text-primary-700"
            >
              Ver todas →
            </Link>
          </div>

          {/* Informações do Sistema */}
          <div className="card">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Informações</h2>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-gray-600">Criado em:</span>
                <p className="text-gray-900">{formatDateBR(cliente.dataCriacao)}</p>
              </div>
              <div>
                <span className="text-gray-600">Última atualização:</span>
                <p className="text-gray-900">{formatDateBR(cliente.dataAtualizacao)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


