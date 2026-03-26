import { useEffect, useMemo, useState } from 'react';
import { Car, Plus, Search, ClipboardCheck, Wrench, Image as ImageIcon, Trash2, Settings2, BarChart3 } from 'lucide-react';
import {
  veiculoService,
  vistoriaVeiculoService,
  itemManutencaoVeiculoService,
  registroManutencaoVeiculoService,
} from '../utils/dbService';
import { formatCurrency, formatDateBR } from '../utils/format';
import type {
  Veiculo,
  VistoriaVeiculo,
  ItemManutencaoVeiculo,
  RegistroManutencaoVeiculo,
} from '../types';
import BarChart from '../components/charts/BarChart';
import PieChart from '../components/charts/PieChart';

type VeiculoForm = {
  placa: string;
  modelo: string;
  marca: string;
  ano: string;
  cor: string;
  kmAtual: string;
  status: Veiculo['status'];
  observacoes: string;
};

type VistoriaForm = {
  veiculoId: string;
  retiradoPorNome: string;
  retiradoPorDocumento: string;
  retiradoPorSetor: string;
  finalidadeUso: string;
  kmSaida: string;
  kmRetorno: string;
  dataSaida: string;
  dataRetorno: string;
  fotoAntesUrl: string;
  fotoDepoisUrl: string;
  manutencoesPrevias: string;
  avariasAntes: string;
  avariasDepois: string;
  observacoes: string;
  status: VistoriaVeiculo['status'];
};

type ItemForm = {
  nome: string;
  categoria: string;
  podeTrocar: boolean;
  podeArrumar: boolean;
  observacoes: string;
};

type RegistroForm = {
  veiculoId: string;
  itemManutencaoId: string;
  tipo: RegistroManutencaoVeiculo['tipo'];
  prevista: boolean;
  descricao: string;
  numeroNotaFiscal: string;
  anexoNotaFiscalUrl: string;
  valorPago: string;
  inicioEm: string;
  fimEm: string;
};

const veiculoInicial: VeiculoForm = {
  placa: '',
  modelo: '',
  marca: '',
  ano: '',
  cor: '',
  kmAtual: '0',
  status: 'disponivel',
  observacoes: '',
};

const vistoriaInicial: VistoriaForm = {
  veiculoId: '',
  retiradoPorNome: '',
  retiradoPorDocumento: '',
  retiradoPorSetor: '',
  finalidadeUso: '',
  kmSaida: '',
  kmRetorno: '',
  dataSaida: new Date().toISOString().split('T')[0],
  dataRetorno: '',
  fotoAntesUrl: '',
  fotoDepoisUrl: '',
  manutencoesPrevias: '',
  avariasAntes: '',
  avariasDepois: '',
  observacoes: '',
  status: 'aberta',
};

const itemInicial: ItemForm = {
  nome: '',
  categoria: '',
  podeTrocar: true,
  podeArrumar: true,
  observacoes: '',
};

const registroInicial: RegistroForm = {
  veiculoId: '',
  itemManutencaoId: '',
  tipo: 'troca',
  prevista: true,
  descricao: '',
  numeroNotaFiscal: '',
  anexoNotaFiscalUrl: '',
  valorPago: '',
  inicioEm: '',
  fimEm: '',
};

const toBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

export default function Veiculos() {
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [vistorias, setVistorias] = useState<VistoriaVeiculo[]>([]);
  const [itensManutencao, setItensManutencao] = useState<ItemManutencaoVeiculo[]>([]);
  const [registrosManutencao, setRegistrosManutencao] = useState<RegistroManutencaoVeiculo[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showVeiculoModal, setShowVeiculoModal] = useState(false);
  const [showVistoriaModal, setShowVistoriaModal] = useState(false);
  const [showItemModal, setShowItemModal] = useState(false);
  const [showRegistroModal, setShowRegistroModal] = useState(false);
  const [veiculoForm, setVeiculoForm] = useState<VeiculoForm>(veiculoInicial);
  const [vistoriaForm, setVistoriaForm] = useState<VistoriaForm>(vistoriaInicial);
  const [itemForm, setItemForm] = useState<ItemForm>(itemInicial);
  const [registroForm, setRegistroForm] = useState<RegistroForm>(registroInicial);
  const [editingVeiculo, setEditingVeiculo] = useState<Veiculo | null>(null);

  const loadData = async () => {
    const [allVeiculos, allVistorias, allItens, allRegistros] = await Promise.all([
      veiculoService.getAll(),
      vistoriaVeiculoService.getAll(),
      itemManutencaoVeiculoService.getAll(),
      registroManutencaoVeiculoService.getAll(),
    ]);
    setVeiculos(allVeiculos);
    setVistorias(allVistorias);
    setItensManutencao(allItens);
    setRegistrosManutencao(allRegistros);
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredVeiculos = useMemo(() => {
    const termo = searchTerm.toLowerCase();
    return veiculos.filter((v) =>
      [v.placa, v.modelo, v.marca].some((campo) => campo.toLowerCase().includes(termo))
    );
  }, [veiculos, searchTerm]);

  const vistoriasAbertas = vistorias.filter((v) => v.status === 'aberta').length;
  const emManutencao = veiculos.filter((v) => v.status === 'em_manutencao').length;
  const totalHorasManutencao = registrosManutencao.reduce((acc, curr) => acc + curr.duracaoHoras, 0);
  const totalPagoManutencao = registrosManutencao.reduce((acc, curr) => acc + (curr.valorPago || 0), 0);
  const mediaHorasManutencao =
    registrosManutencao.length > 0 ? totalHorasManutencao / registrosManutencao.length : 0;

  const graficoPrevistas = [
    { name: 'Previstas', value: registrosManutencao.filter((r) => r.prevista).length },
    { name: 'Não previstas', value: registrosManutencao.filter((r) => !r.prevista).length },
  ];

  const graficoTempoPorItem = useMemo(() => {
    const acc: Record<string, number> = {};
    registrosManutencao.forEach((registro) => {
      const item = itensManutencao.find((i) => i.id === registro.itemManutencaoId);
      const nome = item?.nome || 'Item removido';
      acc[nome] = (acc[nome] || 0) + registro.duracaoHoras;
    });
    return Object.entries(acc).map(([name, horas]) => ({
      name,
      horas: Number(horas.toFixed(2)),
    }));
  }, [registrosManutencao, itensManutencao]);

  const graficoCustoPrevistas = [
    {
      name: 'Previstas',
      custo: Number(
        registrosManutencao
          .filter((r) => r.prevista)
          .reduce((acc, curr) => acc + (curr.valorPago || 0), 0)
          .toFixed(2)
      ),
    },
    {
      name: 'Não previstas',
      custo: Number(
        registrosManutencao
          .filter((r) => !r.prevista)
          .reduce((acc, curr) => acc + (curr.valorPago || 0), 0)
          .toFixed(2)
      ),
    },
  ];

  const abrirModalVeiculo = (veiculo?: Veiculo) => {
    if (veiculo) {
      setEditingVeiculo(veiculo);
      setVeiculoForm({
        placa: veiculo.placa,
        modelo: veiculo.modelo,
        marca: veiculo.marca,
        ano: veiculo.ano ? String(veiculo.ano) : '',
        cor: veiculo.cor || '',
        kmAtual: String(veiculo.kmAtual),
        status: veiculo.status,
        observacoes: veiculo.observacoes || '',
      });
    } else {
      setEditingVeiculo(null);
      setVeiculoForm(veiculoInicial);
    }
    setShowVeiculoModal(true);
  };

  const abrirModalVistoria = (veiculoId?: string) => {
    setVistoriaForm({ ...vistoriaInicial, veiculoId: veiculoId || '' });
    setShowVistoriaModal(true);
  };

  const abrirModalItem = () => {
    setItemForm(itemInicial);
    setShowItemModal(true);
  };

  const abrirModalRegistro = (veiculoId?: string) => {
    setRegistroForm({ ...registroInicial, veiculoId: veiculoId || '' });
    setShowRegistroModal(true);
  };

  const salvarVeiculo = async (e: React.FormEvent) => {
    e.preventDefault();

    const payload = {
      placa: veiculoForm.placa.toUpperCase(),
      modelo: veiculoForm.modelo,
      marca: veiculoForm.marca,
      ano: veiculoForm.ano ? Number(veiculoForm.ano) : undefined,
      cor: veiculoForm.cor || undefined,
      kmAtual: Number(veiculoForm.kmAtual || 0),
      status: veiculoForm.status,
      observacoes: veiculoForm.observacoes || undefined,
    };

    if (!editingVeiculo) {
      const existente = await veiculoService.getByPlaca(payload.placa);
      if (existente) {
        alert('Já existe um veículo com esta placa.');
        return;
      }
      await veiculoService.create(payload);
    } else {
      await veiculoService.update(editingVeiculo.id, payload);
    }

    await loadData();
    setShowVeiculoModal(false);
  };

  const salvarVistoria = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vistoriaForm.veiculoId) {
      alert('Selecione um veículo.');
      return;
    }

    await vistoriaVeiculoService.create({
      veiculoId: vistoriaForm.veiculoId,
      retiradoPorNome: vistoriaForm.retiradoPorNome,
      retiradoPorDocumento: vistoriaForm.retiradoPorDocumento,
      retiradoPorSetor: vistoriaForm.retiradoPorSetor || undefined,
      finalidadeUso: vistoriaForm.finalidadeUso || undefined,
      kmSaida: Number(vistoriaForm.kmSaida || 0),
      kmRetorno: vistoriaForm.kmRetorno ? Number(vistoriaForm.kmRetorno) : undefined,
      dataSaida: vistoriaForm.dataSaida,
      dataRetorno: vistoriaForm.dataRetorno || undefined,
      fotoAntesUrl: vistoriaForm.fotoAntesUrl || undefined,
      fotoDepoisUrl: vistoriaForm.fotoDepoisUrl || undefined,
      manutencoesPrevias: vistoriaForm.manutencoesPrevias || undefined,
      avariasAntes: vistoriaForm.avariasAntes || undefined,
      avariasDepois: vistoriaForm.avariasDepois || undefined,
      observacoes: vistoriaForm.observacoes || undefined,
      status: vistoriaForm.status,
    });

    await loadData();
    setShowVistoriaModal(false);
  };

  const salvarItem = async (e: React.FormEvent) => {
    e.preventDefault();
    await itemManutencaoVeiculoService.create({
      nome: itemForm.nome,
      categoria: itemForm.categoria || undefined,
      ativo: true,
      podeTrocar: itemForm.podeTrocar,
      podeArrumar: itemForm.podeArrumar,
      observacoes: itemForm.observacoes || undefined,
    });
    await loadData();
    setShowItemModal(false);
  };

  const salvarRegistro = async (e: React.FormEvent) => {
    e.preventDefault();
    const itemSelecionado = itensManutencao.find((i) => i.id === registroForm.itemManutencaoId);
    if (!itemSelecionado) {
      alert('Selecione um item de manutenção.');
      return;
    }
    if (registroForm.tipo === 'troca' && !itemSelecionado.podeTrocar) {
      alert('Este item não está habilitado para troca.');
      return;
    }
    if (registroForm.tipo === 'reparo' && !itemSelecionado.podeArrumar) {
      alert('Este item não está habilitado para reparo.');
      return;
    }

    await registroManutencaoVeiculoService.create({
      veiculoId: registroForm.veiculoId,
      itemManutencaoId: registroForm.itemManutencaoId,
      tipo: registroForm.tipo,
      prevista: registroForm.prevista,
      descricao: registroForm.descricao || undefined,
      numeroNotaFiscal: registroForm.numeroNotaFiscal || undefined,
      anexoNotaFiscalUrl: registroForm.anexoNotaFiscalUrl || undefined,
      valorPago: registroForm.valorPago ? Number(registroForm.valorPago) : undefined,
      inicioEm: registroForm.inicioEm,
      fimEm: registroForm.fimEm,
    });
    await loadData();
    setShowRegistroModal(false);
  };

  const excluirVeiculo = async (id: string) => {
    if (!confirm('Excluir veículo e todas as vistorias dele?')) return;
    await veiculoService.delete(id);
    await loadData();
  };

  const handleUploadFoto = async (
    e: React.ChangeEvent<HTMLInputElement>,
    campo: 'fotoAntesUrl' | 'fotoDepoisUrl'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const base64 = await toBase64(file);
    setVistoriaForm((prev) => ({ ...prev, [campo]: base64 }));
  };

  const handleUploadNotaFiscal = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const base64 = await toBase64(file);
    setRegistroForm((prev) => ({ ...prev, anexoNotaFiscalUrl: base64 }));
  };

  return (
    <div>
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Manutenção e Vistoria de Veículos</h1>
          <p className="mt-2 text-gray-600">Cadastro de veículos, ficha de retirada e histórico de vistorias</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => abrirModalVeiculo()} className="btn-primary flex items-center gap-2">
            <Plus size={18} />
            Novo Veículo
          </button>
          <button onClick={() => abrirModalVistoria()} className="btn-secondary flex items-center gap-2">
            <ClipboardCheck size={18} />
            Nova Vistoria
          </button>
          <button onClick={abrirModalItem} className="btn-secondary flex items-center gap-2">
            <Settings2 size={18} />
            Variáveis
          </button>
          <button onClick={() => abrirModalRegistro()} className="btn-secondary flex items-center gap-2">
            <Wrench size={18} />
            Registrar Manutenção
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <div className="card bg-blue-50 border-blue-200">
          <p className="text-sm text-blue-700">Veículos Cadastrados</p>
          <p className="text-2xl font-bold text-blue-900">{veiculos.length}</p>
        </div>
        <div className="card bg-yellow-50 border-yellow-200">
          <p className="text-sm text-yellow-700">Vistorias em Aberto</p>
          <p className="text-2xl font-bold text-yellow-900">{vistoriasAbertas}</p>
        </div>
        <div className="card bg-red-50 border-red-200">
          <p className="text-sm text-red-700">Em Manutenção</p>
          <p className="text-2xl font-bold text-red-900">{emManutencao}</p>
        </div>
        <div className="card bg-green-50 border-green-200">
          <p className="text-sm text-green-700">Tempo Médio de Manutenção</p>
          <p className="text-2xl font-bold text-green-900">{mediaHorasManutencao.toFixed(1)}h</p>
        </div>
        <div className="card bg-emerald-50 border-emerald-200">
          <p className="text-sm text-emerald-700">Total Pago em Manutenções</p>
          <p className="text-2xl font-bold text-emerald-900">{formatCurrency(totalPagoManutencao)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 size={18} className="text-primary-600" />
            <h2 className="text-lg font-semibold text-gray-900">Tempo por Item de Manutenção</h2>
          </div>
          <div className="h-64">
            <BarChart data={graficoTempoPorItem} dataKey="horas" name="Horas" color="#0ea5e9" />
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <Wrench size={18} className="text-primary-600" />
            <h2 className="text-lg font-semibold text-gray-900">Previstas vs Não Previstas</h2>
          </div>
          <div className="h-64">
            <PieChart data={graficoPrevistas} />
          </div>
        </div>
      </div>

      <div className="card mb-6">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 size={18} className="text-primary-600" />
          <h2 className="text-lg font-semibold text-gray-900">Custo por Tipo de Manutenção</h2>
        </div>
        <div className="h-64">
          <BarChart data={graficoCustoPrevistas} dataKey="custo" name="Valor Pago (R$)" color="#10b981" />
        </div>
      </div>

      <div className="card mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Variáveis de Manutenção Cadastradas</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {itensManutencao.map((item) => (
            <div key={item.id} className="bg-gray-50 rounded p-3 text-sm">
              <p className="font-medium text-gray-900">{item.nome}</p>
              <p className="text-gray-600">{item.categoria || 'Sem categoria'}</p>
              <p className="text-xs mt-2 text-gray-600">
                Troca: {item.podeTrocar ? 'Sim' : 'Não'} | Reparo: {item.podeArrumar ? 'Sim' : 'Não'}
              </p>
            </div>
          ))}
          {itensManutencao.length === 0 && (
            <p className="text-sm text-gray-500">Nenhuma variável cadastrada. Ex.: Filtro de Ar.</p>
          )}
        </div>
      </div>

      <div className="card mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Histórico Financeiro de Manutenções</h2>
        <div className="space-y-2">
          {registrosManutencao.slice(0, 10).map((registro) => {
            const item = itensManutencao.find((i) => i.id === registro.itemManutencaoId);
            const veiculo = veiculos.find((v) => v.id === registro.veiculoId);
            return (
              <div key={registro.id} className="bg-gray-50 rounded p-3 text-sm flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                <div>
                  <p className="font-medium text-gray-900">
                    {veiculo ? `${veiculo.placa} - ${veiculo.modelo}` : 'Veículo'} | {item?.nome || 'Item'} ({registro.tipo})
                  </p>
                  <p className="text-gray-600">
                    {registro.numeroNotaFiscal ? `NF: ${registro.numeroNotaFiscal}` : 'Sem NF informada'} |{' '}
                    {registro.prevista ? 'Prevista' : 'Não prevista'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-emerald-700">{formatCurrency(registro.valorPago || 0)}</p>
                  {registro.anexoNotaFiscalUrl && (
                    <a
                      href={registro.anexoNotaFiscalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary-600 hover:underline"
                    >
                      Ver anexo da nota fiscal
                    </a>
                  )}
                </div>
              </div>
            );
          })}
          {registrosManutencao.length === 0 && (
            <p className="text-sm text-gray-500">Nenhum registro de manutenção com custo ainda.</p>
          )}
        </div>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-5 w-5" />
        <input
          type="text"
          placeholder="Buscar por placa, modelo ou marca..."
          className="input pl-10"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="space-y-4">
        {filteredVeiculos.map((veiculo) => {
          const historico = vistorias.filter((v) => v.veiculoId === veiculo.id).slice(0, 3);
          return (
            <div key={veiculo.id} className="card">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Car className="text-primary-600" size={18} />
                    <h3 className="font-semibold text-gray-900">
                      {veiculo.placa} - {veiculo.modelo}
                    </h3>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    {veiculo.marca} {veiculo.ano ? `| Ano ${veiculo.ano}` : ''} {veiculo.cor ? `| ${veiculo.cor}` : ''}
                  </p>
                  <p className="text-sm text-gray-600">KM atual: {veiculo.kmAtual}</p>
                  {veiculo.observacoes && <p className="text-sm text-gray-600 mt-2">{veiculo.observacoes}</p>}
                </div>

                <div className="flex gap-2">
                  <button className="btn-secondary" onClick={() => abrirModalVeiculo(veiculo)}>
                    Editar
                  </button>
                  <button className="btn-secondary" onClick={() => abrirModalVistoria(veiculo.id)}>
                    Nova vistoria
                  </button>
                  <button className="btn-secondary" onClick={() => abrirModalRegistro(veiculo.id)}>
                    Registrar manutenção
                  </button>
                  <button className="btn-secondary text-red-700" onClick={() => excluirVeiculo(veiculo.id)}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div className="mt-4 border-t border-gray-100 pt-4">
                <p className="text-sm font-medium text-gray-800 mb-2">Últimas manutenções e vistorias</p>
                {historico.length === 0 && <p className="text-sm text-gray-500">Sem histórico.</p>}
                <div className="space-y-2">
                  {historico.map((vistoria) => (
                    <div key={vistoria.id} className="bg-gray-50 rounded p-3 text-sm">
                      <p className="font-medium text-gray-800">
                        Retirada por {vistoria.retiradoPorNome} ({formatDateBR(vistoria.dataSaida)})
                      </p>
                      <p className="text-gray-600">KM saída: {vistoria.kmSaida} | KM retorno: {vistoria.kmRetorno ?? '-'}</p>
                      {vistoria.manutencoesPrevias && (
                        <p className="text-gray-600">
                          <Wrench size={14} className="inline mr-1" />
                          {vistoria.manutencoesPrevias}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {showVeiculoModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={() => setShowVeiculoModal(false)} />
            <div className="relative bg-white rounded-lg shadow-xl w-full max-w-2xl p-6">
              <h2 className="text-2xl font-bold mb-4">{editingVeiculo ? 'Editar Veículo' : 'Novo Veículo'}</h2>
              <form onSubmit={salvarVeiculo} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input className="input" placeholder="Placa *" required value={veiculoForm.placa} onChange={(e) => setVeiculoForm({ ...veiculoForm, placa: e.target.value.toUpperCase() })} />
                <input className="input" placeholder="Modelo *" required value={veiculoForm.modelo} onChange={(e) => setVeiculoForm({ ...veiculoForm, modelo: e.target.value })} />
                <input className="input" placeholder="Marca *" required value={veiculoForm.marca} onChange={(e) => setVeiculoForm({ ...veiculoForm, marca: e.target.value })} />
                <input type="number" className="input" placeholder="Ano" value={veiculoForm.ano} onChange={(e) => setVeiculoForm({ ...veiculoForm, ano: e.target.value })} />
                <input className="input" placeholder="Cor" value={veiculoForm.cor} onChange={(e) => setVeiculoForm({ ...veiculoForm, cor: e.target.value })} />
                <input type="number" className="input" placeholder="KM atual *" required value={veiculoForm.kmAtual} onChange={(e) => setVeiculoForm({ ...veiculoForm, kmAtual: e.target.value })} />
                <select className="input md:col-span-2" value={veiculoForm.status} onChange={(e) => setVeiculoForm({ ...veiculoForm, status: e.target.value as Veiculo['status'] })}>
                  <option value="disponivel">Disponível</option>
                  <option value="em_uso">Em uso</option>
                  <option value="em_manutencao">Em manutenção</option>
                  <option value="inativo">Inativo</option>
                </select>
                <textarea className="input md:col-span-2" rows={3} placeholder="Observações" value={veiculoForm.observacoes} onChange={(e) => setVeiculoForm({ ...veiculoForm, observacoes: e.target.value })} />
                <div className="md:col-span-2 flex justify-end gap-2">
                  <button type="button" onClick={() => setShowVeiculoModal(false)} className="btn-secondary">Cancelar</button>
                  <button type="submit" className="btn-primary">Salvar</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {showVistoriaModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={() => setShowVistoriaModal(false)} />
            <div className="relative bg-white rounded-lg shadow-xl w-full max-w-3xl p-6">
              <h2 className="text-2xl font-bold mb-4">Ficha de Retirada e Vistoria</h2>
              <form onSubmit={salvarVistoria} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <select className="input md:col-span-2" required value={vistoriaForm.veiculoId} onChange={(e) => setVistoriaForm({ ...vistoriaForm, veiculoId: e.target.value })}>
                  <option value="">Selecione o veículo *</option>
                  {veiculos.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.placa} - {v.modelo}
                    </option>
                  ))}
                </select>
                <input className="input" placeholder="Nome de quem vai pegar *" required value={vistoriaForm.retiradoPorNome} onChange={(e) => setVistoriaForm({ ...vistoriaForm, retiradoPorNome: e.target.value })} />
                <input className="input" placeholder="Documento (CPF/RG) *" required value={vistoriaForm.retiradoPorDocumento} onChange={(e) => setVistoriaForm({ ...vistoriaForm, retiradoPorDocumento: e.target.value })} />
                <input className="input" placeholder="Setor" value={vistoriaForm.retiradoPorSetor} onChange={(e) => setVistoriaForm({ ...vistoriaForm, retiradoPorSetor: e.target.value })} />
                <input className="input" placeholder="Finalidade de uso" value={vistoriaForm.finalidadeUso} onChange={(e) => setVistoriaForm({ ...vistoriaForm, finalidadeUso: e.target.value })} />
                <input type="number" className="input" placeholder="KM saída *" required value={vistoriaForm.kmSaida} onChange={(e) => setVistoriaForm({ ...vistoriaForm, kmSaida: e.target.value })} />
                <input type="number" className="input" placeholder="KM retorno" value={vistoriaForm.kmRetorno} onChange={(e) => setVistoriaForm({ ...vistoriaForm, kmRetorno: e.target.value })} />
                <input type="date" className="input" required value={vistoriaForm.dataSaida} onChange={(e) => setVistoriaForm({ ...vistoriaForm, dataSaida: e.target.value })} />
                <input type="date" className="input" value={vistoriaForm.dataRetorno} onChange={(e) => setVistoriaForm({ ...vistoriaForm, dataRetorno: e.target.value })} />
                <textarea className="input md:col-span-2" rows={2} placeholder="Manutenções prévias" value={vistoriaForm.manutencoesPrevias} onChange={(e) => setVistoriaForm({ ...vistoriaForm, manutencoesPrevias: e.target.value })} />
                <textarea className="input md:col-span-2" rows={2} placeholder="Avarias antes" value={vistoriaForm.avariasAntes} onChange={(e) => setVistoriaForm({ ...vistoriaForm, avariasAntes: e.target.value })} />
                <textarea className="input md:col-span-2" rows={2} placeholder="Avarias depois" value={vistoriaForm.avariasDepois} onChange={(e) => setVistoriaForm({ ...vistoriaForm, avariasDepois: e.target.value })} />
                <div className="md:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Foto antes</label>
                  <input type="file" accept="image/*" className="input" onChange={(e) => handleUploadFoto(e, 'fotoAntesUrl')} />
                  {vistoriaForm.fotoAntesUrl && (
                    <img src={vistoriaForm.fotoAntesUrl} alt="Foto antes" className="mt-2 h-24 rounded border" />
                  )}
                </div>
                <div className="md:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Foto depois</label>
                  <input type="file" accept="image/*" className="input" onChange={(e) => handleUploadFoto(e, 'fotoDepoisUrl')} />
                  {vistoriaForm.fotoDepoisUrl && (
                    <img src={vistoriaForm.fotoDepoisUrl} alt="Foto depois" className="mt-2 h-24 rounded border" />
                  )}
                </div>
                <select className="input md:col-span-2" value={vistoriaForm.status} onChange={(e) => setVistoriaForm({ ...vistoriaForm, status: e.target.value as VistoriaVeiculo['status'] })}>
                  <option value="aberta">Vistoria aberta</option>
                  <option value="finalizada">Vistoria finalizada</option>
                </select>
                <textarea className="input md:col-span-2" rows={2} placeholder="Observações gerais" value={vistoriaForm.observacoes} onChange={(e) => setVistoriaForm({ ...vistoriaForm, observacoes: e.target.value })} />
                <div className="md:col-span-2 flex items-center gap-2 text-xs text-gray-500">
                  <ImageIcon size={14} /> As fotos são salvas localmente no navegador.
                </div>
                <div className="md:col-span-2 flex justify-end gap-2">
                  <button type="button" onClick={() => setShowVistoriaModal(false)} className="btn-secondary">Cancelar</button>
                  <button type="submit" className="btn-primary">Salvar vistoria</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {showItemModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={() => setShowItemModal(false)} />
            <div className="relative bg-white rounded-lg shadow-xl w-full max-w-xl p-6">
              <h2 className="text-2xl font-bold mb-4">Cadastro de Variável de Manutenção</h2>
              <form onSubmit={salvarItem} className="space-y-4">
                <input className="input" placeholder="Nome (ex.: Filtro de Ar) *" required value={itemForm.nome} onChange={(e) => setItemForm({ ...itemForm, nome: e.target.value })} />
                <input className="input" placeholder="Categoria" value={itemForm.categoria} onChange={(e) => setItemForm({ ...itemForm, categoria: e.target.value })} />
                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={itemForm.podeTrocar} onChange={(e) => setItemForm({ ...itemForm, podeTrocar: e.target.checked })} />
                    Pode trocar
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={itemForm.podeArrumar} onChange={(e) => setItemForm({ ...itemForm, podeArrumar: e.target.checked })} />
                    Pode arrumar
                  </label>
                </div>
                <textarea className="input" rows={3} placeholder="Observações" value={itemForm.observacoes} onChange={(e) => setItemForm({ ...itemForm, observacoes: e.target.value })} />
                <div className="flex justify-end gap-2">
                  <button type="button" className="btn-secondary" onClick={() => setShowItemModal(false)}>Cancelar</button>
                  <button type="submit" className="btn-primary">Salvar variável</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {showRegistroModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={() => setShowRegistroModal(false)} />
            <div className="relative bg-white rounded-lg shadow-xl w-full max-w-2xl p-6">
              <h2 className="text-2xl font-bold mb-4">Registro de Manutenção</h2>
              <form onSubmit={salvarRegistro} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <select className="input md:col-span-2" required value={registroForm.veiculoId} onChange={(e) => setRegistroForm({ ...registroForm, veiculoId: e.target.value })}>
                  <option value="">Selecione o veículo *</option>
                  {veiculos.map((v) => (
                    <option key={v.id} value={v.id}>{v.placa} - {v.modelo}</option>
                  ))}
                </select>
                <select className="input md:col-span-2" required value={registroForm.itemManutencaoId} onChange={(e) => setRegistroForm({ ...registroForm, itemManutencaoId: e.target.value })}>
                  <option value="">Selecione o item *</option>
                  {itensManutencao.filter((i) => i.ativo).map((i) => (
                    <option key={i.id} value={i.id}>{i.nome}</option>
                  ))}
                </select>
                <select className="input" value={registroForm.tipo} onChange={(e) => setRegistroForm({ ...registroForm, tipo: e.target.value as RegistroManutencaoVeiculo['tipo'] })}>
                  <option value="troca">Troca</option>
                  <option value="reparo">Reparo</option>
                </select>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={registroForm.prevista} onChange={(e) => setRegistroForm({ ...registroForm, prevista: e.target.checked })} />
                  Era manutenção prevista
                </label>
                <input
                  className="input"
                  placeholder="Número da Nota Fiscal"
                  value={registroForm.numeroNotaFiscal}
                  onChange={(e) => setRegistroForm({ ...registroForm, numeroNotaFiscal: e.target.value })}
                />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="input"
                  placeholder="Valor pago (R$)"
                  value={registroForm.valorPago}
                  onChange={(e) => setRegistroForm({ ...registroForm, valorPago: e.target.value })}
                />
                <input type="datetime-local" className="input" required value={registroForm.inicioEm} onChange={(e) => setRegistroForm({ ...registroForm, inicioEm: e.target.value })} />
                <input type="datetime-local" className="input" required value={registroForm.fimEm} onChange={(e) => setRegistroForm({ ...registroForm, fimEm: e.target.value })} />
                <textarea className="input md:col-span-2" rows={3} placeholder="Descrição do serviço" value={registroForm.descricao} onChange={(e) => setRegistroForm({ ...registroForm, descricao: e.target.value })} />
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Anexar Nota Fiscal</label>
                  <input type="file" className="input" accept=".pdf,image/*" onChange={handleUploadNotaFiscal} />
                  {registroForm.anexoNotaFiscalUrl && (
                    <p className="text-xs text-green-700 mt-1">Nota fiscal anexada.</p>
                  )}
                </div>
                <div className="md:col-span-2 flex justify-end gap-2">
                  <button type="button" className="btn-secondary" onClick={() => setShowRegistroModal(false)}>Cancelar</button>
                  <button type="submit" className="btn-primary">Salvar registro</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
