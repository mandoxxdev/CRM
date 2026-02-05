const fs = require('fs');
const path = require('path');

// Configurações
const API_URL = process.env.API_URL || 'http://localhost:5000';
const IMAGE_PATH = process.argv[2] || path.join(__dirname, 'rodape.jpg');

// Verificar se a imagem existe
if (!fs.existsSync(IMAGE_PATH)) {
  console.error('❌ Erro: Imagem não encontrada em:', IMAGE_PATH);
  console.log('\n📝 Uso: node upload_footer.js <caminho_da_imagem>');
  console.log('   Exemplo: node upload_footer.js ./rodape.jpg');
  console.log('   Ou coloque a imagem como "rodape.jpg" na pasta server/');
  process.exit(1);
}

async function uploadFooterImage() {
  try {
    console.log('📤 Iniciando upload da imagem de rodapé...');
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
    
    // Criar FormData usando o construtor nativo do Node.js
    const FormData = globalThis.FormData || (await import('form-data')).default;
    const formData = new FormData();
    
    // Criar um Blob a partir do buffer
    const blob = new Blob([imageBuffer]);
    formData.append('footerImage', blob, filename);

    console.log('📤 Enviando imagem para o servidor...');

    // Fazer upload
    const response = await fetch(`${API_URL}/api/proposta-template/footer-image`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
        // Não definir Content-Type - o fetch fará isso automaticamente com boundary
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
    console.log('\n🎉 A imagem de rodapé foi configurada e aparecerá em todas as propostas!');
    
  } catch (error) {
    console.error('❌ Erro ao fazer upload:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  }
}

uploadFooterImage();
