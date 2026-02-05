// Script para verificar propostas no banco de dados
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'crm_gmp.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Erro ao conectar ao banco:', err);
    process.exit(1);
  }
  console.log('✅ Conectado ao banco de dados');
});

// Verificar todas as propostas
db.all('SELECT * FROM propostas', [], (err, rows) => {
  if (err) {
    console.error('❌ Erro ao buscar propostas:', err);
    process.exit(1);
  }
  
  console.log(`\n📊 Total de propostas no banco: ${rows.length}\n`);
  
  if (rows.length > 0) {
    console.log('📄 Propostas encontradas:');
    rows.forEach((proposta, index) => {
      console.log(`\n${index + 1}. ID: ${proposta.id}`);
      console.log(`   Número: ${proposta.numero_proposta}`);
      console.log(`   Título: ${proposta.titulo}`);
      console.log(`   Cliente ID: ${proposta.cliente_id}`);
      console.log(`   Valor Total: R$ ${proposta.valor_total}`);
      console.log(`   Status: ${proposta.status}`);
      console.log(`   Criado por: ${proposta.created_by}`);
      console.log(`   Responsável: ${proposta.responsavel_id}`);
      console.log(`   Data criação: ${proposta.created_at}`);
    });
  } else {
    console.log('⚠️ Nenhuma proposta encontrada no banco de dados');
  }
  
  // Verificar estrutura da tabela
  db.all("PRAGMA table_info(propostas)", [], (err, columns) => {
    if (err) {
      console.error('❌ Erro ao verificar estrutura:', err);
    } else {
      console.log('\n📋 Estrutura da tabela propostas:');
      columns.forEach(col => {
        console.log(`   - ${col.name} (${col.type})`);
      });
    }
    
    db.close();
    process.exit(0);
  });
});




