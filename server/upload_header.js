const fs = require('fs');
const path = require('path');

// Configurações
const API_URL = process.env.API_URL || 'http://localhost:5000';
const IMAGE_PATH = process.argv[2] || path.join(__dirname, '..', 'client', 'public', 'CBC2.png');

// Verificar se a imagem existe
if (!fs.existsSync(IMAGE_PATH)) {
  console.error('❌ Erro: Imagem não encontrada em:', IMAGE_PATH);
  console.log('\n📝 Uso: node upload_header.js <caminho_da_imagem>');
  console.log('   Exemplo: node upload_header.js ./CBC2.png');
  console.log('   Ou coloque a imagem como "CBC2.png" na pasta client/public/');
  process.exit(1);
}

async function uploadHeaderImage() {
  try {
    console.log('📤 Iniciando upload da imagem de cabeçalho...');
    console.log('📁 Arquivo:', IMAGE_PATH);

    // Primeiro, fazer login para obter o token
    let token;
    try {
      const loginResponse = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: 'admin@gmp.com.br',
          password: 'admin123'
        })
      });

      if (!loginResponse.ok) {
        const errorData = await loginResponse.json();
        throw new Error(errorData.error || 'Erro ao fazer login');
      }

      const loginData = await loginResponse.json();
      token = loginData.token;
      console.log('✅ Autenticação realizada com sucesso');
    } catch (loginError) {
      console.error('❌ Erro ao fazer login:', loginError.message);
      console.log('\n💡 Dica: Certifique-se de que o servidor está rodando e as credenciais estão corretas');
      process.exit(1);
    }

    // Ler a imagem como buffer
    const imageBuffer = fs.readFileSync(IMAGE_PATH);
    const filename = path.basename(IMAGE_PATH);
    
    // Criar FormData usando form-data (npm package)
    const FormData = require('form-data');
    const formData = new FormData();
    
    formData.append('headerImage', imageBuffer, {
      filename: filename,
      contentType: 'image/png'
    });

    console.log('📤 Enviando imagem para o servidor...');

    // Fazer upload
    const response = await fetch(`${API_URL}/api/proposta-template/header-image`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        ...formData.getHeaders()
      },
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Erro ao fazer upload');
    }

    const data = await response.json();
    console.log('✅ Upload realizado com sucesso!');
    console.log('📋 Resposta:', data);
    console.log('\n🎉 A imagem de cabeçalho foi configurada e aparecerá em todas as páginas das propostas!');
    
  } catch (error) {
    console.error('❌ Erro ao fazer upload:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  }
}

uploadHeaderImage();
