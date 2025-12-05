import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Database, CheckCircle, XCircle, Loader2, RefreshCw } from 'lucide-react';
import { db } from '../db/database';
import { clienteService, produtoService, oportunidadeService, atividadeService } from '../utils/dbService';

interface StatusTabela {
  nome: string;
  status: 'ok' | 'erro' | 'testando';
  registros: number;
  erro?: string;
}

export default function TesteBanco() {
  const [testando, setTestando] = useState(false);
  const [tabelas, setTabelas] = useState<StatusTabela[]>([]);
  const [statusGeral, setStatusGeral] = useState<'ok' | 'erro' | 'testando'>('testando');

  useEffect(() => {
    testarBanco();
  }, []);

  const testarBanco = async () => {
    setTestando(true);
    setStatusGeral('testando');
    
    const resultados: StatusTabela[] = [];

    // Testar cada tabela
    const testes = [
      {
        nome: 'Clientes',
        teste: async () => {
          const count = await db.clientes.count();
          await clienteService.getAll();
          return count;
        },
      },
      {
        nome: 'Contatos',
        teste: async () => {
          const count = await db.contatos.count();
          await db.contatos.toArray();
          return count;
        },
      },
      {
        nome: 'Oportunidades',
        teste: async () => {
          const count = await db.oportunidades.count();
          await oportunidadeService.getAll();
          return count;
        },
      },
      {
        nome: 'Produtos',
        teste: async () => {
          const count = await db.produtos.count();
          await produtoService.getAll();
          return count;
        },
      },
      {
        nome: 'Atividades',
        teste: async () => {
          const count = await db.atividades.count();
          await atividadeService.getAll();
          return count;
        },
      },
      {
        nome: 'Projetos',
        teste: async () => {
          const count = await db.projetos.count();
          await db.projetos.toArray();
          return count;
        },
      },
      {
        nome: 'Documentos Técnicos',
        teste: async () => {
          const count = await db.documentosTecnicos.count();
          await db.documentosTecnicos.toArray();
          return count;
        },
      },
      {
        nome: 'Equipamentos',
        teste: async () => {
          const count = await db.equipamentos.count();
          await db.equipamentos.toArray();
          return count;
        },
      },
      {
        nome: 'Ordens de Fabricação',
        teste: async () => {
          const count = await db.ordensFabricacao.count();
          await db.ordensFabricacao.toArray();
          return count;
        },
      },
      {
        nome: 'Reuniões',
        teste: async () => {
          const count = await db.reunioes.count();
          await db.reunioes.toArray();
          return count;
        },
      },
      {
        nome: 'Usuários',
        teste: async () => {
          const count = await db.usuarios.count();
          await db.usuarios.toArray();
          return count;
        },
      },
    ];

    for (const teste of testes) {
      try {
        const registros = await teste.teste();
        resultados.push({
          nome: teste.nome,
          status: 'ok',
          registros,
        });
      } catch (error: any) {
        resultados.push({
          nome: teste.nome,
          status: 'erro',
          registros: 0,
          erro: error.message || 'Erro desconhecido',
        });
      }
    }

    setTabelas(resultados);
    
    // Verificar status geral
    const temErros = resultados.some(r => r.status === 'erro');
    setStatusGeral(temErros ? 'erro' : 'ok');
    setTestando(false);
  };

  const testarOperacoes = async () => {
    try {
      // Teste de escrita
      const testeCliente = {
        nome: 'Cliente Teste',
        email: 'teste@teste.com',
        telefone: '11999999999',
        pais: 'Brasil',
      };
      
      const id = await clienteService.create(testeCliente);
      console.log('✅ Cliente criado com ID:', id);
      
      // Teste de leitura
      const cliente = await clienteService.getById(id);
      console.log('✅ Cliente lido:', cliente);
      
      // Teste de atualização
      await clienteService.update(id, { nome: 'Cliente Teste Atualizado' });
      console.log('✅ Cliente atualizado');
      
      // Teste de exclusão
      await clienteService.delete(id);
      console.log('✅ Cliente deletado');
      
      alert('✅ Todas as operações (criar, ler, atualizar, deletar) funcionaram corretamente!');
    } catch (error: any) {
      console.error('❌ Erro nas operações:', error);
      alert('❌ Erro ao testar operações: ' + error.message);
    }
  };

  const limparBanco = async () => {
    if (!confirm('ATENÇÃO: Isso vai apagar TODOS os dados do banco! Tem certeza?')) {
      return;
    }
    
    try {
      await db.delete();
      await db.open();
      alert('Banco de dados limpo com sucesso! Recarregue a página.');
      window.location.reload();
    } catch (error: any) {
      alert('Erro ao limpar banco: ' + error.message);
    }
  };

  const totalRegistros = tabelas.reduce((sum, t) => sum + t.registros, 0);
  const tabelasOk = tabelas.filter(t => t.status === 'ok').length;
  const tabelasErro = tabelas.filter(t => t.status === 'erro').length;

  return (
    <div>
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Teste do Banco de Dados</h1>
          <p className="mt-2 text-gray-600">Verifique o status e funcionamento do IndexedDB</p>
        </div>
        <button
          onClick={testarBanco}
          disabled={testando}
          className="btn-primary flex items-center justify-center gap-2"
        >
          {testando ? (
            <>
              <Loader2 size={20} className="animate-spin" />
              Testando...
            </>
          ) : (
            <>
              <RefreshCw size={20} />
              Testar Novamente
            </>
          )}
        </button>
      </div>

      {/* Status Geral */}
      <div className="mb-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={`card ${
            statusGeral === 'ok' 
              ? 'bg-gradient-to-br from-green-50 to-green-100 border-green-200' 
              : statusGeral === 'erro'
              ? 'bg-gradient-to-br from-red-50 to-red-100 border-red-200'
              : 'bg-gray-50'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {statusGeral === 'ok' ? (
                <CheckCircle className="text-green-600" size={48} />
              ) : statusGeral === 'erro' ? (
                <XCircle className="text-red-600" size={48} />
              ) : (
                <Loader2 className="text-gray-600 animate-spin" size={48} />
              )}
              <div>
                <h2 className="text-2xl font-bold text-gray-900">
                  {statusGeral === 'ok' 
                    ? 'Banco de Dados Funcionando!' 
                    : statusGeral === 'erro'
                    ? 'Erros Detectados'
                    : 'Testando...'}
                </h2>
                <p className="text-gray-600 mt-1">
                  {tabelasOk} tabelas OK • {tabelasErro} com erro • {totalRegistros} registros totais
                </p>
              </div>
            </div>
            <Database className="text-gray-400" size={64} />
          </div>
        </motion.div>
      </div>

      {/* Tabelas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {tabelas.map((tabela, index) => (
          <motion.div
            key={tabela.nome}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className={`card ${
              tabela.status === 'ok' 
                ? 'border-green-200 bg-green-50' 
                : tabela.status === 'erro'
                ? 'border-red-200 bg-red-50'
                : 'border-gray-200'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-gray-900">{tabela.nome}</h3>
              {tabela.status === 'ok' ? (
                <CheckCircle className="text-green-600" size={20} />
              ) : tabela.status === 'erro' ? (
                <XCircle className="text-red-600" size={20} />
              ) : (
                <Loader2 className="text-gray-400 animate-spin" size={20} />
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">
                {tabela.registros} {tabela.registros === 1 ? 'registro' : 'registros'}
              </span>
              {tabela.erro && (
                <span className="text-xs text-red-600">{tabela.erro}</span>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Ações */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Testar Operações CRUD</h3>
          <p className="text-sm text-gray-600 mb-4">
            Testa criar, ler, atualizar e deletar um registro de teste
          </p>
          <button
            onClick={testarOperacoes}
            className="btn-primary w-full"
          >
            Executar Teste CRUD
          </button>
        </div>

        <div className="card border-red-200 bg-red-50">
          <h3 className="text-lg font-semibold text-red-900 mb-4">Limpar Banco de Dados</h3>
          <p className="text-sm text-red-700 mb-4">
            ⚠️ ATENÇÃO: Isso apagará TODOS os dados permanentemente!
          </p>
          <button
            onClick={limparBanco}
            className="btn-danger w-full"
          >
            Limpar Todos os Dados
          </button>
        </div>
      </div>

      {/* Informações Técnicas */}
      <div className="mt-6 card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Informações do Banco</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-600">Nome do Banco:</span>
            <p className="font-mono text-gray-900">CRMGMPDatabase</p>
          </div>
          <div>
            <span className="text-gray-600">Versão:</span>
            <p className="font-mono text-gray-900">2</p>
          </div>
          <div>
            <span className="text-gray-600">Tipo:</span>
            <p className="font-mono text-gray-900">IndexedDB (Dexie.js)</p>
          </div>
          <div>
            <span className="text-gray-600">Persistência:</span>
            <p className="font-mono text-gray-900">Local (navegador)</p>
          </div>
        </div>
      </div>
    </div>
  );
}

