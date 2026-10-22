import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { FiArrowLeft } from 'react-icons/fi';
import FornecedorFicha from './FornecedorFicha';
import './FornecedorForm.css';

/**
 * Ficha do fornecedor (Etapa 34) — `/compras/fornecedores/novo` e `/editar/:id`.
 *
 * Até esta etapa os dois caminhos existiam como link na lista e caíam no `path="*"` da área de
 * Compras, que re-renderizava a LISTA: "Novo Fornecedor" não fazia nada, e o único cadastro
 * possível era o modal do grupo homologado (7 campos). Esta tela é o cadastro completo.
 *
 * Etapa 173 (RN-173.09): o corpo da ficha (campos, CNPJ, CEP, POST/PUT) mora em `FornecedorFicha`,
 * que a janela do F2 também usa. Aqui ficam só o que é da PÁGINA: o cabeçalho, o toast e a volta
 * para a lista. As regras da ficha estão no cabeçalho de `FornecedorFicha.js`.
 */
const FornecedorForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const editando = Boolean(id);

  const voltar = () => navigate('/compras/fornecedores');
  const aoSalvar = () => {
    toast.success('Fornecedor salvo');
    voltar();
  };

  return (
    <div className="fornecedor-form-page">
      <div className="fornecedor-form-topo">
        <div>
          <button type="button" className="fornecedor-form-voltar" onClick={voltar}>
            <FiArrowLeft /> Fornecedores
          </button>
          <h1>{editando ? 'Editar fornecedor' : 'Novo fornecedor'}</h1>
        </div>
      </div>

      <FornecedorFicha fornecedorId={id} onSalvo={aoSalvar} onCancelar={voltar} />
    </div>
  );
};

export default FornecedorForm;
