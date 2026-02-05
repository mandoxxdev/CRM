const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// Configurações
const IMAGE_PATH = process.argv[2] || path.join(__dirname, 'rodape.jpg');
const uploadsFooterDir = path.join(__dirname, 'uploads', 'footers');

// Verificar se a imagem existe
if (!fs.existsSync(IMAGE_PATH)) {
  console.error('❌ Erro: Imagem não encontrada em:', IMAGE_PATH);
  console.log('\n📝 Uso: node upload_footer_direct.js <caminho_da_imagem>');
  console.log('   Exemplo: node upload_footer_direct.js ./rodape.jpg');
  console.log('   Ou coloque a imagem como "rodape.jpg" na pasta server/');
  process.exit(1);
}

// Garantir que o diretório existe
if (!fs.existsSync(uploadsFooterDir)) {
  fs.mkdirSync(uploadsFooterDir, { recursive: true });
}

async function uploadFooterDirect() {
  return new Promise((resolve, reject) => {
    try {
      console.log('📤 Iniciando upload direto da imagem de rodapé...');
      console.log('📁 Arquivo origem:', IMAGE_PATH);

      // Ler informações do arquivo
      const ext = path.extname(IMAGE_PATH).toLowerCase();
      const timestamp = Date.now();
      const name = path.basename(IMAGE_PATH, ext).replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `footer_${timestamp}_${name}${ext}`;
      const destPath = path.join(uploadsFooterDir, filename);

      // Copiar arquivo
      console.log('📋 Copiando arquivo...');
      fs.copyFileSync(IMAGE_PATH, destPath);
      console.log('✅ Arquivo copiado para:', destPath);

      // Conectar ao banco de dados
      const dbPath = path.join(__dirname, 'database.sqlite');
      const db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          console.error('❌ Erro ao conectar ao banco de dados:', err.message);
          reject(err);
          return;
        }
        console.log('✅ Conectado ao banco de dados');

        // Verificar se existe configuração
        db.get('SELECT id, footer_image_url FROM proposta_template_config ORDER BY id DESC LIMIT 1', [], (err, config) => {
          if (err) {
            console.error('❌ Erro ao buscar configuração:', err.message);
            db.close();
            reject(err);
            return;
          }

          // Se existe configuração, atualizar
          if (config) {
            // Deletar imagem antiga se existir
            if (config.footer_image_url) {
              const oldImagePath = path.join(uploadsFooterDir, config.footer_image_url);
              if (fs.existsSync(oldImagePath)) {
                try {
                  fs.unlinkSync(oldImagePath);
                  console.log('🗑️  Imagem antiga removida:', config.footer_image_url);
                } catch (unlinkErr) {
                  console.warn('⚠️  Não foi possível remover imagem antiga:', unlinkErr.message);
                }
              }
            }

            // Atualizar configuração
            db.run(
              'UPDATE proposta_template_config SET footer_image_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
              [filename, config.id],
              (err) => {
                if (err) {
                  console.error('❌ Erro ao atualizar configuração:', err.message);
                  db.close();
                  reject(err);
                  return;
                }
                console.log('✅ Configuração atualizada no banco de dados');
                console.log('📋 ID da configuração:', config.id);
                console.log('📋 Nome do arquivo:', filename);
                db.close();
                resolve();
              }
            );
          } else {
            // Criar nova configuração
            db.run(
              `INSERT INTO proposta_template_config (
                nome_empresa, logo_url, cor_primaria, cor_secundaria, cor_texto,
                mostrar_logo, footer_image_url, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
              ['GMP INDUSTRIAIS', null, '#0066CC', '#003366', '#333333', 1, filename],
              function(err) {
                if (err) {
                  console.error('❌ Erro ao criar configuração:', err.message);
                  db.close();
                  reject(err);
                  return;
                }
                console.log('✅ Nova configuração criada no banco de dados');
                console.log('📋 ID da configuração:', this.lastID);
                console.log('📋 Nome do arquivo:', filename);
                db.close();
                resolve();
              }
            );
          }
        });
      });
    } catch (error) {
      console.error('❌ Erro:', error.message);
      reject(error);
    }
  });
}

uploadFooterDirect()
  .then(() => {
    console.log('\n🎉 Upload concluído com sucesso!');
    console.log('✨ A imagem de rodapé aparecerá em todas as propostas geradas.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Falha no upload:', error.message);
    process.exit(1);
  });
