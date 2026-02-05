const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// Configurações
const IMAGE_PATH = 'C:\\Users\\mathe\\OneDrive - MOINHO YPIRANGA INDUSTRIA DE MAQUINAS LTDA\\GMP - MODELO DE DOCUMENTOS\\CRM GMP - FINAL\\client\\public\\CBC2.png';

// Verificar se a imagem existe
if (!fs.existsSync(IMAGE_PATH)) {
  console.error('❌ Erro: Imagem não encontrada em:', IMAGE_PATH);
  process.exit(1);
}

function uploadHeaderImage() {
  try {
    console.log('📤 Iniciando upload da imagem de cabeçalho...');
    console.log('📁 Arquivo:', IMAGE_PATH);

    // Caminhos (relativos ao diretório server)
    const dbPath = path.join(__dirname, 'database.sqlite');
    const uploadsHeaderDir = path.join(__dirname, 'uploads', 'headers');
    
    // Criar diretório de uploads se não existir
    if (!fs.existsSync(uploadsHeaderDir)) {
      fs.mkdirSync(uploadsHeaderDir, { recursive: true });
      console.log('📁 Diretório de uploads criado:', uploadsHeaderDir);
    }

    // Gerar nome único para o arquivo
    const timestamp = Date.now();
    const filename = `header_${timestamp}_CBC2.png`;
    const destPath = path.join(uploadsHeaderDir, filename);

    // Copiar arquivo
    console.log('📋 Copiando imagem...');
    fs.copyFileSync(IMAGE_PATH, destPath);
    console.log('✅ Imagem copiada para:', destPath);

    // Abrir banco de dados
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('❌ Erro ao abrir banco de dados:', err.message);
        process.exit(1);
      }
    });

    // Deletar imagem antiga se existir
    db.get('SELECT header_image_url FROM proposta_template_config ORDER BY id DESC LIMIT 1', [], (err, config) => {
      if (err) {
        console.error('❌ Erro ao consultar banco:', err.message);
        db.close();
        process.exit(1);
      }

      if (config && config.header_image_url) {
        const oldImagePath = path.join(uploadsHeaderDir, config.header_image_url);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
          console.log('🗑️ Imagem antiga removida:', config.header_image_url);
        }
      }

      // Atualizar banco de dados
      db.run(
        'UPDATE proposta_template_config SET header_image_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = (SELECT id FROM proposta_template_config ORDER BY id DESC LIMIT 1)',
        [filename],
        function(err) {
          if (err) {
            console.error('❌ Erro ao atualizar banco de dados:', err.message);
            // Deletar arquivo se houver erro
            if (fs.existsSync(destPath)) {
              fs.unlinkSync(destPath);
            }
            db.close();
            process.exit(1);
          }

          console.log('✅ Banco de dados atualizado!');
          console.log('📋 Nome do arquivo:', filename);
          console.log('\n🎉 A imagem de cabeçalho foi configurada e aparecerá em todas as páginas das propostas!');
          
          db.close();
        }
      );
    });
    
  } catch (error) {
    console.error('❌ Erro ao fazer upload:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  }
}

uploadHeaderImage();
