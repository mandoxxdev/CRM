require('dotenv').config();
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const multer = require('multer');
const puppeteer = require('puppeteer');
const { gerarPDFProposta } = require('./gerarPDFProposta');
const { getPropostaEquipamentosOnlyHTML } = require('./condicoesNano4You');
const propostaEngine = require('./propostaCompositionEngine');

// Opções de launch do Puppeteer: usar Chrome/Chromium do sistema quando o bundle não existir (ex.: Linux em servidor)
function getPuppeteerLaunchOptions() {
  const opts = { headless: true, timeout: 30000 };
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH || process.env.CHROMIUM_PATH;
  if (envPath && fs.existsSync(envPath)) {
    opts.executablePath = envPath;
    console.log('Puppeteer: usando executável definido em env:', envPath);
    return opts;
  }
  // Em Linux (servidor/Docker) o Chrome baixado pelo Puppeteer costuma falhar (ENOENT); tentar Chromium do sistema
  if (process.platform === 'linux') {
    const candidates = ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome-stable', '/usr/bin/google-chrome'];
    for (const exe of candidates) {
      if (fs.existsSync(exe)) {
        opts.executablePath = exe;
        console.log('Puppeteer: usando Chromium/Chrome do sistema:', exe);
        return opts;
      }
    }
  }
  return opts;
}

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'gmp-industriais-secret-key-2024';

// Rate Limiting simples (em memória)
const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutos
const RATE_LIMIT_MAX = 500; // máximo 500 requisições por IP (aumentado para evitar bloqueios)

function rateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  
  if (!rateLimitStore.has(ip)) {
    rateLimitStore.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return next();
  }

  const limit = rateLimitStore.get(ip);
  
  // Resetar se passou a janela de tempo
  if (now > limit.resetTime) {
    rateLimitStore.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return next();
  }

  // Verificar se excedeu o limite
  if (limit.count >= RATE_LIMIT_MAX) {
    return res.status(429).json({ 
      error: 'Muitas requisições. Tente novamente mais tarde.',
      retryAfter: Math.ceil((limit.resetTime - now) / 1000)
    });
  }

  // Incrementar contador
  limit.count++;
  next();
}

// Limpar rate limit store periodicamente (a cada hora)
setInterval(() => {
  const now = Date.now();
  for (const [ip, limit] of rateLimitStore.entries()) {
    if (now > limit.resetTime) {
      rateLimitStore.delete(ip);
    }
  }
}, 60 * 60 * 1000); // A cada hora

// Middleware
app.use(cors());
app.use(express.json({ limit: '15mb' }));

// Rate limiting para todas as rotas da API
app.use('/api', rateLimit);

// Middleware para verificar se o banco de dados está pronto
function checkDatabaseReady(req, res, next) {
  const fullPath = req.path || req.url;
  
  // Permitir health check sem verificação de banco
  if (fullPath === '/health' || fullPath === '/api/health') {
    return next();
  }
  
  // Para todas as outras rotas, verificar se o banco está pronto
  if (!db) {
    return res.status(503).json({ 
      error: 'Banco de dados não foi inicializado',
      retryAfter: 5
    });
  }
  
  if (!dbReady) {
    console.warn('[DB READY WARNING] Requisição recebida enquanto dbReady=false. Permitindo continuar para evitar bloqueio permanente.');
    // Em vez de bloquear o uso da API, vamos permitir que a requisição siga.
    // O SQLite consegue lidar com operações enquanto migrations/seed rodam,
    // e isso evita que um eventual problema na flag dbReady deixe o sistema travado.
    return next();
  }
  
  next();
}

// Aplicar middleware de verificação de banco em todas as rotas da API (exceto health)
app.use('/api', (req, res, next) => {
  const fullPath = req.path || req.url;
  if (fullPath === '/health' || fullPath === '/api/health') {
    return next();
  }
  checkDatabaseReady(req, res, next);
});

// Rota de health check (antes de todas as outras rotas)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Servidor CRM GMP está rodando!',
    timestamp: new Date().toISOString(),
    port: PORT
  });
});

// Pasta persistente: use volume em /app/server/data no Coolify para não sobrescrever o código
const PERSISTENT_DATA_DIR = path.join(__dirname, 'data');

// Lista padrão de variáveis técnicas (usada no seed quando a tabela está vazia e não há variaveis-base.json)
const VARIAVEIS_BASE_DEFAULT = [
  'ITEM', 'CÓDIGO / VERSÃO', 'GRUPO', 'FAMÍLIA', 'MODELO', 'VOLUME ÚTIL [L]', 'ÁREA DE INSTALAÇÃO',
  'FREQUÊNCIA [Hz]', 'GRAU DE PROTEÇÃO MOTORES', 'MOTOR ESQUERDO [kW]', 'MARCA DO MOTOR ESQUERDO',
  'ROTAÇÃO MOTOR ESQUERDO [RPM]', 'CARCAÇA DO MOTOR ESQUERDO', 'MOTOR / MOTOREDUTOR CENTRAL [kW]',
  'MARCA DO MOTOREDUTOR / REDUTOR CENTRAL', 'MARCA DO MOTOR CENTRAL', 'ROTAÇÃO DE SAÍDA DO REDUTOR [RPM]',
  'ROTAÇÃO DO MOTOR [RPM]', 'MODELO DO MOTOREDUTOR / REDUTOR', 'CARCAÇA DO MOTOR CENTRAL',
  'MOTOR DIREITO [kW]', 'MARCA DO MOTOR DIREITO', 'ROTAÇÃO MOTOR DIREITO [RPM]', 'CARCAÇA DO MOTOR DIREITO',
  'POTÊNCIA TOTAL [kW]', 'MATERIAL TANQUE', 'MATERIAL EIXOS E HÉLICES', 'MATERIAL SUPORTES E REFORÇOS',
  'TAMPO SUPERIOR', 'TAMPO INFERIOR', 'DIÂMETRO BOCAL DE SAÍDA [pol.]', 'QUANTIDADE DE SAÍDAS',
  'CONEXÃO DO BOCAL DE SAÍDA', 'POSIÇÃO DO BOCAL DE SAÍDA 1', 'POSIÇÃO DO BOCAL DE SAÍDA 2',
  'CAMISA', 'SERPENTINA', 'MATERIAL DA CAMISA', 'MATERIAL DA SERPENTINA', 'RASPADOR',
  'SISTEMA DE AGITAÇÃO PRIMÁRIO', 'SISTEMA DE AGITAÇÃO SECUNDÁRIO', 'PÁ INTERMEDIÁRIA',
  'DIÂMETRO DISCO INFERIOR', 'DIÂMETRO DISCO SUPERIOR', 'ACABAMENTO INTERNO DO TANQUE',
  'ACABAMENTO EXTERNO DO TANQUE', 'ACABAMENTO PEÇAS DE AÇO CARBONO', 'TENSÃO DE TRABALHO [V]',
  'PAINEL ELÉTRICO', 'NÍVEL DE AUTOMAÇÃO', 'ACIONAMENTO',
  'MARCA DO ACIONAMENTO P/ MOTOR ESQUERDO', 'MARCA DO ACIONAMENTO P/ MOTOR CENTRAL', 'MARCA DO ACIONAMENTO P/ MOTOR DIREITO',
  'MODELO DO ACIONAMENTO P/ MOTOR ESQUERDO', 'MODELO DO ACIONAMENTO P/ MOTOR CENTRAL', 'MODELO DO ACIONAMENTO P/ MOTOR DIREITO',
  'MATERIAL DO CCM', 'MATERIAL DA BOTOEIRA', 'GRAU DE PROTEÇÃO DO CCM', 'GRAU DE PROTEÇÃO DA BOTOEIRA',
  'SUPORTE DE BOTOEIRA', 'MODELO VÁLVULA DE SAÍDA', 'ACIONAMENTO DA VÁLVULA DE SAÍDA',
  'SISTEMA DE PESAGEM', 'MARCA DO SISTEMA DE PESAGEM', 'DESPOEIRADOR', 'MARCA DO DESPOEIRADOR',
  'MODELO DO DESPOEIRADOR', 'BOMBA DE VÁCUO', 'MARCA DA BOMBA DE VÁCUO', 'MODELO DA BOMBA DE VÁCUO',
  'SISTEMA DE AQUECIMENTO ELÉTRICO', 'ALTURA DE OPERAÇÃO [mm]', 'QUANTIDADE DE SAPATAS', 'PÉS DE SUSTENTAÇÃO',
  'BOCAIS ADICIONAIS', 'EXTRAS', 'PESO ESTIMADO DO EQUIPAMENTO [kg]', 'PESO ESTIMADO DO CCM [kg]',
  'PESO ESTIMADO DA BOTOEIRA [kg]', 'PESO ESTIMADO DO SUPORTE DA BOTOEIRA [kg]', 'PESO TOTAL ESTIMADO [kg]',
  'DIMENSÕES GERAIS ESTIMADAS (Larg. × Comp. × Alt) [m]'
];
if (!fs.existsSync(PERSISTENT_DATA_DIR)) {
  fs.mkdirSync(PERSISTENT_DATA_DIR, { recursive: true });
}

// Configurar diretório de uploads
const uploadsDir = path.join(PERSISTENT_DATA_DIR, 'uploads', 'cotacoes');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configurar diretório de uploads de comprovantes de viagens
const uploadsComprovantesDir = path.join(PERSISTENT_DATA_DIR, 'uploads', 'comprovantes-viagens');
if (!fs.existsSync(uploadsComprovantesDir)) {
  fs.mkdirSync(uploadsComprovantesDir, { recursive: true });
}

// Configurar diretório de uploads de imagens de produtos
const uploadsProdutosDir = path.join(PERSISTENT_DATA_DIR, 'uploads', 'produtos');
if (!fs.existsSync(uploadsProdutosDir)) {
  fs.mkdirSync(uploadsProdutosDir, { recursive: true });
}

// Diretório para uploads de fotos de famílias de produtos
const uploadsFamiliasDir = path.join(PERSISTENT_DATA_DIR, 'uploads', 'familias-produtos');
if (!fs.existsSync(uploadsFamiliasDir)) {
  fs.mkdirSync(uploadsFamiliasDir, { recursive: true });
}

// Diretório para uploads de fotos de grupos de produtos
const uploadsGruposDir = path.join(PERSISTENT_DATA_DIR, 'uploads', 'grupos-produtos');
if (!fs.existsSync(uploadsGruposDir)) {
  fs.mkdirSync(uploadsGruposDir, { recursive: true });
}

// Diretório para uploads de fotos de grupos de compras (fornecedores homologados)
const uploadsGruposComprasDir = path.join(PERSISTENT_DATA_DIR, 'uploads', 'grupos-compras');
if (!fs.existsSync(uploadsGruposComprasDir)) {
  fs.mkdirSync(uploadsGruposComprasDir, { recursive: true });
}

// Diretório para uploads de fotos de fornecedores (cadastro por grupo)
const uploadsFornecedoresDir = path.join(PERSISTENT_DATA_DIR, 'uploads', 'fornecedores');
if (!fs.existsSync(uploadsFornecedoresDir)) {
  fs.mkdirSync(uploadsFornecedoresDir, { recursive: true });
}

// Configurar diretório de uploads de logos
const uploadsLogosDir = path.join(PERSISTENT_DATA_DIR, 'uploads', 'logos');
if (!fs.existsSync(uploadsLogosDir)) {
  fs.mkdirSync(uploadsLogosDir, { recursive: true });
}

// Diretório para uploads de chat (arquivos e imagens)
const uploadsChatDir = path.join(PERSISTENT_DATA_DIR, 'uploads', 'chat');
if (!fs.existsSync(uploadsChatDir)) {
  fs.mkdirSync(uploadsChatDir, { recursive: true });
}

// Configurar multer para uploads de chat
const storageChat = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsChatDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `chat-${uniqueSuffix}${ext}`);
  }
});

const uploadChat = multer({
  storage: storageChat,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB máximo
  },
  fileFilter: (req, file, cb) => {
    // Permitir todos os tipos de arquivo
    cb(null, true);
  }
});

// Configurar diretório de uploads de imagens de cabeçalho
const uploadsHeaderDir = path.join(PERSISTENT_DATA_DIR, 'uploads', 'headers');
if (!fs.existsSync(uploadsHeaderDir)) {
  fs.mkdirSync(uploadsHeaderDir, { recursive: true });
}

// Configurar diretório de uploads de imagens de rodapé
const uploadsFooterDir = path.join(PERSISTENT_DATA_DIR, 'uploads', 'footers');
if (!fs.existsSync(uploadsFooterDir)) {
  fs.mkdirSync(uploadsFooterDir, { recursive: true });
}

// Diretório para contrato anexo (Word/PDF) – acompanha a proposta
const uploadsContratoDir = path.join(PERSISTENT_DATA_DIR, 'uploads', 'contrato');
if (!fs.existsSync(uploadsContratoDir)) {
  fs.mkdirSync(uploadsContratoDir, { recursive: true });
}

// Configurar diretório de uploads de PDFs de OS
const uploadsOSDir = path.join(PERSISTENT_DATA_DIR, 'uploads', 'ordens-servico');
if (!fs.existsSync(uploadsOSDir)) {
  fs.mkdirSync(uploadsOSDir, { recursive: true });
}

// Configurar multer para upload de arquivos (limite 40MB)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const propostaId = req.params.id;
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    const filename = `cotacao_${propostaId}_${timestamp}_${name.replace(/[^a-zA-Z0-9]/g, '_')}${ext}`;
    cb(null, filename);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 40 * 1024 * 1024 // 40MB
  },
  fileFilter: (req, file, cb) => {
    // Aceitar qualquer tipo de arquivo
    cb(null, true);
  }
});

// Storage específico para comprovantes de viagens
const storageComprovantes = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsComprovantesDir);
  },
  filename: (req, file, cb) => {
    const custoViagemId = req.params.id;
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    const filename = `comprovante_${custoViagemId}_${timestamp}_${name.replace(/[^a-zA-Z0-9]/g, '_')}${ext}`;
    cb(null, filename);
  }
});

const uploadComprovante = multer({
  storage: storageComprovantes,
  limits: {
    fileSize: 40 * 1024 * 1024 // 40MB
  },
  fileFilter: (req, file, cb) => {
    // Aceitar qualquer tipo de arquivo
    cb(null, true);
  }
});

// Storage específico para imagens de produtos
const storageProdutos = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsProdutosDir);
  },
  filename: (req, file, cb) => {
    const produtoId = req.params.id || 'temp';
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    const filename = `produto_${produtoId}_${timestamp}_${name.replace(/[^a-zA-Z0-9]/g, '_')}${ext}`;
    cb(null, filename);
  }
});

const uploadProduto = multer({
  storage: storageProdutos,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  },
  fileFilter: (req, file, cb) => {
    // Aceitar apenas imagens
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) {
      cb(null, true);
    } else {
      cb(new Error('Apenas imagens são permitidas (jpeg, jpg, png, gif, webp)'));
    }
  }
});

// Storage para fotos de famílias de produtos
const storageFamilias = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsFamiliasDir);
  },
  filename: (req, file, cb) => {
    const familiaId = req.params.id || 'temp';
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    const filename = `familia_${familiaId}_${timestamp}_${name.replace(/[^a-zA-Z0-9]/g, '_')}${ext}`;
    cb(null, filename);
  }
});

const uploadFamilia = multer({
  storage: storageFamilias,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Apenas imagens são permitidas (JPEG, JPG, PNG, GIF, WEBP)'));
    }
  }
});

// Storage para fotos de grupos de produtos
const storageGrupos = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsGruposDir);
  },
  filename: (req, file, cb) => {
    const grupoId = req.params.id || 'temp';
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `grupo_${grupoId}_${timestamp}_${name.replace(/[^a-zA-Z0-9]/g, '_')}${ext}`);
  }
});
const uploadGrupo = multer({
  storage: storageGrupos,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) return cb(null, true);
    cb(new Error('Apenas imagens são permitidas (JPEG, JPG, PNG, GIF, WEBP)'));
  }
});

const storageGruposCompras = multer.diskStorage({
  destination: (req, file, cb) => { cb(null, uploadsGruposComprasDir); },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, 'grupo_compras_' + unique + ext);
  }
});
const uploadGrupoCompras = multer({
  storage: storageGruposCompras,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    if (allowed.test(file.mimetype)) return cb(null, true);
    cb(new Error('Apenas imagens (JPEG, PNG, GIF, WEBP)'));
  }
});

const storageFornecedor = multer.diskStorage({
  destination: (req, file, cb) => { cb(null, uploadsFornecedoresDir); },
  filename: (req, file, cb) => {
    const id = req.params.id || 'temp';
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, 'fornecedor_' + id + '_' + unique + ext);
  }
});
const uploadFornecedor = multer({
  storage: storageFornecedor,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    if (allowed.test(file.mimetype)) return cb(null, true);
    cb(new Error('Apenas imagens (JPEG, PNG, GIF, WEBP)'));
  }
});

// Storage específico para logos
const storageLogos = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsLogosDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    const filename = `logo_${timestamp}_${name.replace(/[^a-zA-Z0-9]/g, '_')}${ext}`;
    cb(null, filename);
  }
});

const uploadLogo = multer({
  storage: storageLogos,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  },
  fileFilter: (req, file, cb) => {
    // Aceitar apenas imagens
    const allowedTypes = /jpeg|jpg|png|gif|webp|svg/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Apenas imagens são permitidas (JPEG, JPG, PNG, GIF, WEBP, SVG)'));
    }
  }
});

// Storage específico para logos de clientes
const storageClienteLogo = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsLogosDir);
  },
  filename: (req, file, cb) => {
    const clienteId = req.params.id || 'temp';
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    const filename = `cliente_${clienteId}_${timestamp}_${name.replace(/[^a-zA-Z0-9]/g, '_')}${ext}`;
    cb(null, filename);
  }
});

const uploadClienteLogo = multer({
  storage: storageClienteLogo,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  },
  fileFilter: (req, file, cb) => {
    // Aceitar apenas imagens
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Apenas imagens são permitidas (JPEG, JPG, PNG, GIF, WEBP)'));
    }
  }
});

// Storage específico para imagens de cabeçalho
const storageHeader = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsHeaderDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    const filename = `header_${timestamp}_${name.replace(/[^a-zA-Z0-9]/g, '_')}${ext}`;
    cb(null, filename);
  }
});

const uploadHeader = multer({
  storage: storageHeader,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  },
  fileFilter: (req, file, cb) => {
    // Aceitar apenas imagens
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Apenas imagens são permitidas (JPEG, JPG, PNG, GIF, WEBP)'));
    }
  }
});

// Storage específico para imagens de rodapé
const storageFooter = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsFooterDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    const filename = `footer_${timestamp}_${name.replace(/[^a-zA-Z0-9]/g, '_')}${ext}`;
    cb(null, filename);
  }
});

const uploadFooter = multer({
  storage: storageFooter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  },
  fileFilter: (req, file, cb) => {
    // Aceitar apenas imagens
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Apenas imagens são permitidas (JPEG, JPG, PNG, GIF, WEBP)'));
    }
  }
});

// Storage para contrato anexo (Word / PDF)
const storageContrato = multer.diskStorage({
  destination: (req, file, cb) => { cb(null, uploadsContratoDir); },
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '').toLowerCase();
    const safe = (path.basename(file.originalname, ext) || 'contrato').replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `contrato_${Date.now()}_${safe}${ext || '.pdf'}`);
  }
});
const uploadContrato = multer({
  storage: storageContrato,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '').toLowerCase();
    const ok = ['.pdf', '.doc', '.docx'].includes(ext);
    if (ok) return cb(null, true);
    cb(new Error('Apenas PDF ou Word (.pdf, .doc, .docx) são permitidos para o contrato.'));
  }
});

// Database (em pasta persistente para Coolify: volume em /app/server/data)
const dbPath = path.join(PERSISTENT_DATA_DIR, 'database.sqlite');

// Garantir que o diretório existe
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

console.log(`📁 Caminho do banco de dados: ${dbPath}`);

let db = null;
let dbReady = false; // Flag para indicar se o banco está totalmente pronto

try {
  db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) {
      console.error('❌ Erro ao conectar ao banco de dados:', err);
      console.error('   Verifique:');
      console.error('   1. Se a pasta server/ tem permissões de escrita');
      console.error('   2. Se o arquivo database.sqlite pode ser criado');
      console.error('   3. Se não há outro processo usando o banco');
      console.error(`   Caminho tentado: ${dbPath}`);
      console.error('⚠️ Servidor continuará rodando, mas algumas funcionalidades podem não funcionar');
      dbReady = false;
    } else {
      console.log('✅ Conectado ao banco de dados SQLite');
      console.log(`   Localização: ${dbPath}`);
      
      // Fallback: se após 10s o banco ainda não estiver "pronto", marcar como pronto para evitar 503 infinito
      const dbReadyFallback = setTimeout(() => {
        if (!dbReady) {
          dbReady = true;
          console.warn('⚠️ Banco marcado como pronto por timeout (inicialização pode ainda estar em andamento).');
        }
      }, 10000);
      const clearFallback = () => {
        if (dbReadyFallback) clearTimeout(dbReadyFallback);
      };

      // Configurar SQLite para melhor performance com requisições simultâneas
      db.configure('busyTimeout', 10000); // 10 segundos de timeout
      
      // Habilitar WAL mode para melhor concorrência (fora do serialize para não bloquear)
      db.run('PRAGMA journal_mode = WAL;', (err) => {
        if (err) {
          console.warn('⚠️ Aviso: Não foi possível habilitar WAL mode:', err.message);
        } else {
          console.log('✅ WAL mode habilitado para melhor concorrência');
        }
      });
      
      // Configurar outras otimizações
      db.run('PRAGMA synchronous = NORMAL;');
      db.run('PRAGMA cache_size = 10000;');
      db.run('PRAGMA foreign_keys = ON;');
      
      // Inicializar banco após configurações
      initializeDatabase(clearFallback);
    }
  });
} catch (error) {
  console.error('❌ Erro crítico ao inicializar banco de dados:', error);
  console.error('⚠️ Servidor continuará rodando, mas o banco não estará disponível');
  dbReady = false;
}

// Initialize Database (opcional: onReadyCallback para limpar fallback quando dbReady for setado)
function initializeDatabase(onReadyCallback) {
  console.log('🔄 Iniciando criação de tabelas...');
  
  // Usuários
  db.run(`CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    senha TEXT NOT NULL,
    cargo TEXT,
    role TEXT DEFAULT 'usuario',
    ativo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) {
      console.error('❌ Erro ao criar tabela usuarios:', err);
    } else {
      console.log('✅ Tabela usuarios criada/verificada');
    }
  });

  // Clientes
  db.run(`CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    razao_social TEXT NOT NULL,
    nome_fantasia TEXT,
    cnpj TEXT,
    segmento TEXT,
    telefone TEXT,
    email TEXT,
    endereco TEXT,
    cidade TEXT,
    estado TEXT,
    cep TEXT,
    contato_principal TEXT,
    observacoes TEXT,
    status TEXT DEFAULT 'ativo',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Configuração de Template de Proposta
  db.run(`CREATE TABLE IF NOT EXISTS proposta_template_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome_template TEXT,
    is_padrao INTEGER DEFAULT 0,
    familia TEXT,
    nome_empresa TEXT,
    logo_url TEXT,
    cor_primaria TEXT,
    cor_secundaria TEXT,
    cor_texto TEXT,
    mostrar_logo INTEGER DEFAULT 1,
    cabecalho_customizado TEXT,
    rodape_customizado TEXT,
    texto_introducao TEXT,
    mostrar_especificacoes INTEGER DEFAULT 1,
    mostrar_imagens_produtos INTEGER DEFAULT 1,
    formato_numero_proposta TEXT,
    componentes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  
  // Criar tabela antiga se não existir (compatibilidade)
  db.run(`CREATE TABLE IF NOT EXISTS proposta_template_config_old (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    familia TEXT DEFAULT 'Geral',
    nome_empresa TEXT DEFAULT 'GMP INDUSTRIAIS',
    logo_url TEXT,
    cor_primaria TEXT DEFAULT '#0066CC',
    cor_secundaria TEXT DEFAULT '#003366',
    cor_texto TEXT DEFAULT '#333333',
    mostrar_logo INTEGER DEFAULT 1,
    cabecalho_customizado TEXT,
    rodape_customizado TEXT,
    texto_introducao TEXT,
    mostrar_especificacoes INTEGER DEFAULT 1,
    mostrar_imagens_produtos INTEGER DEFAULT 1,
    formato_numero_proposta TEXT DEFAULT 'PROPOSTA TÉCNICA COMERCIAL N° {numero}',
    componentes TEXT,
    header_image_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Templates de proposta versionados (nome, versão, html, css, schema, tipo, familia)
  db.run(`CREATE TABLE IF NOT EXISTS proposta_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    versao TEXT NOT NULL DEFAULT '1.0',
    html TEXT,
    css TEXT,
    schema_campos TEXT,
    tipo_proposta TEXT NOT NULL DEFAULT 'tecnica',
    familia TEXT,
    is_padrao INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Blocos técnicos e comerciais para composição (motor de blocos)
  db.run(`CREATE TABLE IF NOT EXISTS proposta_blocos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    familia TEXT,
    tipo TEXT NOT NULL DEFAULT 'tecnico',
    nome TEXT NOT NULL,
    conteudo_html TEXT,
    ordem INTEGER DEFAULT 0,
    regras_condicionais TEXT,
    ativo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Biblioteca de textos (dados brutos vs texto exibição/renderizado)
  db.run(`CREATE TABLE IF NOT EXISTS proposta_texto_biblioteca (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chave TEXT NOT NULL,
    texto_bruto TEXT,
    texto_exibicao TEXT,
    familia TEXT,
    ativo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Snapshot imutável da proposta gerada (checksum para integridade)
  db.run(`CREATE TABLE IF NOT EXISTS proposta_snapshot (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proposta_id INTEGER NOT NULL,
    html_rendered TEXT NOT NULL,
    css_snapshot TEXT,
    checksum TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (proposta_id) REFERENCES propostas(id) ON DELETE CASCADE
  )`);

  // Projetos
  db.run(`CREATE TABLE IF NOT EXISTS projetos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER,
    nome TEXT NOT NULL,
    descricao TEXT,
    status TEXT DEFAULT 'ativo',
    responsavel_id INTEGER,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id),
    FOREIGN KEY (responsavel_id) REFERENCES usuarios(id),
    FOREIGN KEY (created_by) REFERENCES usuarios(id)
  )`);

  // Propostas
  db.run(`CREATE TABLE IF NOT EXISTS propostas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER,
    projeto_id INTEGER,
    numero_proposta TEXT UNIQUE NOT NULL,
    titulo TEXT NOT NULL,
    descricao TEXT,
    valor_total REAL DEFAULT 0,
    validade DATE,
    condicoes_pagamento TEXT,
    prazo_entrega TEXT,
    garantia TEXT,
    observacoes TEXT,
    status TEXT DEFAULT 'rascunho',
    responsavel_id INTEGER,
    created_by INTEGER,
    motivo_nao_venda TEXT,
    origem_busca TEXT,
    familia_produto TEXT,
    lembrete_data DATE,
    lembrete_mensagem TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id),
    FOREIGN KEY (projeto_id) REFERENCES projetos(id),
    FOREIGN KEY (responsavel_id) REFERENCES usuarios(id),
    FOREIGN KEY (created_by) REFERENCES usuarios(id)
  )`, (err) => {
    if (err) {
      console.error('❌ Erro ao criar tabela propostas:', err);
    } else {
      console.log('✅ Tabela propostas criada/verificada');
    }
  });

  // Proposta Itens
  db.run(`CREATE TABLE IF NOT EXISTS proposta_itens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proposta_id INTEGER NOT NULL,
    descricao TEXT NOT NULL,
    quantidade REAL DEFAULT 1,
    unidade TEXT DEFAULT 'UN',
    valor_unitario REAL DEFAULT 0,
    valor_total REAL DEFAULT 0,
    codigo_produto TEXT,
    familia_produto TEXT,
    regiao_busca TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (proposta_id) REFERENCES propostas(id) ON DELETE CASCADE
  )`);

  // Histórico de Revisões de Propostas
  db.run(`CREATE TABLE IF NOT EXISTS proposta_revisoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proposta_id INTEGER NOT NULL,
    revisao INTEGER NOT NULL,
    dados_anteriores TEXT,
    dados_novos TEXT,
    mudancas TEXT,
    revisado_por INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (proposta_id) REFERENCES propostas(id) ON DELETE CASCADE,
    FOREIGN KEY (revisado_por) REFERENCES usuarios(id)
  )`);

  // Follow-ups de Propostas
  db.run(`CREATE TABLE IF NOT EXISTS proposta_followups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proposta_id INTEGER NOT NULL,
    comentario TEXT NOT NULL,
    criado_por INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (proposta_id) REFERENCES propostas(id) ON DELETE CASCADE,
    FOREIGN KEY (criado_por) REFERENCES usuarios(id)
  )`);

  // Oportunidades
  db.run(`CREATE TABLE IF NOT EXISTS oportunidades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER,
    projeto_id INTEGER,
    titulo TEXT NOT NULL,
    descricao TEXT,
    valor_estimado REAL DEFAULT 0,
    probabilidade INTEGER DEFAULT 50,
    etapa TEXT DEFAULT 'prospeccao',
    status TEXT DEFAULT 'ativa',
    responsavel_id INTEGER,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id),
    FOREIGN KEY (projeto_id) REFERENCES projetos(id),
    FOREIGN KEY (responsavel_id) REFERENCES usuarios(id),
    FOREIGN KEY (created_by) REFERENCES usuarios(id)
  )`);

  // Atividades
  db.run(`CREATE TABLE IF NOT EXISTS atividades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER,
    projeto_id INTEGER,
    titulo TEXT NOT NULL,
    descricao TEXT,
    tipo TEXT DEFAULT 'reuniao',
    data_agendada DATETIME,
    prioridade TEXT DEFAULT 'media',
    status TEXT DEFAULT 'pendente',
    responsavel_id INTEGER,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id),
    FOREIGN KEY (projeto_id) REFERENCES projetos(id),
    FOREIGN KEY (responsavel_id) REFERENCES usuarios(id),
    FOREIGN KEY (created_by) REFERENCES usuarios(id)
  )`);

  // Configurações do Sistema
  db.run(`CREATE TABLE IF NOT EXISTS configuracoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chave TEXT UNIQUE NOT NULL,
    valor TEXT,
    tipo TEXT DEFAULT 'text',
    categoria TEXT DEFAULT 'geral',
    descricao TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Assinaturas Digitais
  db.run(`CREATE TABLE IF NOT EXISTS assinaturas_digitais (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proposta_id INTEGER NOT NULL,
    usuario_id INTEGER NOT NULL,
    tipo_assinatura TEXT DEFAULT 'eletronica',
    dados_assinatura TEXT,
    ip_address TEXT,
    user_agent TEXT,
    status TEXT DEFAULT 'pendente',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (proposta_id) REFERENCES propostas(id) ON DELETE CASCADE,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  )`);

  // Permissões Granulares
  db.run(`CREATE TABLE IF NOT EXISTS permissoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER,
    grupo_id INTEGER,
    modulo TEXT NOT NULL,
    acao TEXT NOT NULL,
    permissao INTEGER DEFAULT 0,
    restricao_cliente_id INTEGER,
    restricao_regiao TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (grupo_id) REFERENCES grupos_permissoes(id) ON DELETE CASCADE,
    FOREIGN KEY (restricao_cliente_id) REFERENCES clientes(id)
  )`);

  // Grupos de Permissões
  db.run(`CREATE TABLE IF NOT EXISTS grupos_permissoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL UNIQUE,
    descricao TEXT,
    ativo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Usuários em Grupos
  db.run(`CREATE TABLE IF NOT EXISTS usuarios_grupos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL,
    grupo_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (grupo_id) REFERENCES grupos_permissoes(id) ON DELETE CASCADE,
    UNIQUE(usuario_id, grupo_id)
  )`);

  // Logs de Autorização de Viagens
  db.run(`CREATE TABLE IF NOT EXISTS logs_autorizacao_viagens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    custo_viagem_id INTEGER NOT NULL,
    cliente_id INTEGER NOT NULL,
    regras_nao_atendidas TEXT,
    autorizado_por INTEGER NOT NULL,
    motivo_autorizacao TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (custo_viagem_id) REFERENCES custos_viagens(id),
    FOREIGN KEY (cliente_id) REFERENCES clientes(id),
    FOREIGN KEY (autorizado_por) REFERENCES usuarios(id)
  )`);

  // Histórico de Alterações de Custos de Viagens
  db.run(`CREATE TABLE IF NOT EXISTS custos_viagens_historico (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    custo_viagem_id INTEGER NOT NULL,
    alterado_por INTEGER NOT NULL,
    dados_anteriores TEXT,
    dados_novos TEXT,
    mudancas TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (custo_viagem_id) REFERENCES custos_viagens(id),
    FOREIGN KEY (alterado_por) REFERENCES usuarios(id)
  )`);

  // Anexos de Comprovantes de Viagens
  db.run(`CREATE TABLE IF NOT EXISTS custos_viagens_anexos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    custo_viagem_id INTEGER NOT NULL,
    nome_arquivo TEXT NOT NULL,
    nome_original TEXT NOT NULL,
    tipo_arquivo TEXT,
    tamanho INTEGER,
    tipo_comprovante TEXT,
    descricao TEXT,
    uploaded_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (custo_viagem_id) REFERENCES custos_viagens(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES usuarios(id)
  )`);

  // Tabela para múltiplos clientes por viagem
  db.run(`CREATE TABLE IF NOT EXISTS viagem_clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    custo_viagem_id INTEGER NOT NULL,
    cliente_id INTEGER NOT NULL,
    ordem INTEGER DEFAULT 1,
    distancia_km REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (custo_viagem_id) REFERENCES custos_viagens(id) ON DELETE CASCADE,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id)
  )`);

  // Custos de Viagens
  db.run(`CREATE TABLE IF NOT EXISTS custos_viagens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo_visita TEXT UNIQUE,
    cliente_id INTEGER,
    proposta_id INTEGER,
    proposta_aprovacao_id INTEGER,
    atividade_id INTEGER,
    data_viagem DATE NOT NULL,
    origem TEXT,
    origem_cidade TEXT,
    origem_estado TEXT,
    destino TEXT NOT NULL,
    destino_cidade TEXT,
    destino_estado TEXT,
    tipo_viagem TEXT DEFAULT 'ida_e_volta',
    distancia_km REAL DEFAULT 0,
    tempo_estimado_horas REAL DEFAULT 0,
    custo_transporte REAL DEFAULT 0,
    custo_hospedagem REAL DEFAULT 0,
    custo_alimentacao REAL DEFAULT 0,
    custo_outros REAL DEFAULT 0,
    total_custo REAL DEFAULT 0,
    custo_sugerido REAL DEFAULT 0,
    status_aprovacao TEXT DEFAULT 'pendente',
    motivo_aprovacao TEXT,
    aprovado_por INTEGER,
    data_aprovacao DATETIME,
    descricao TEXT,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id),
    FOREIGN KEY (proposta_id) REFERENCES propostas(id),
    FOREIGN KEY (proposta_aprovacao_id) REFERENCES propostas(id),
    FOREIGN KEY (atividade_id) REFERENCES atividades(id),
    FOREIGN KEY (created_by) REFERENCES usuarios(id),
    FOREIGN KEY (aprovado_por) REFERENCES usuarios(id)
  )`);

  // Produtos
  db.run(`CREATE TABLE IF NOT EXISTS produtos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT UNIQUE NOT NULL,
    nome TEXT NOT NULL,
    descricao TEXT,
    familia TEXT,
    preco_base REAL DEFAULT 0,
    icms REAL DEFAULT 0,
    ipi REAL DEFAULT 0,
    ncm TEXT,
    especificacoes_tecnicas TEXT,
    imagem TEXT,
    ativo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  
  // Adicionar coluna imagem se não existir (migration)
  db.run(`ALTER TABLE produtos ADD COLUMN imagem TEXT`, (err) => {
    // Ignorar erro se a coluna já existir
    if (err && !err.message.includes('duplicate column')) {
      console.error('Erro ao adicionar coluna imagem:', err);
    }
  });
  
  // Adicionar coluna familia se não existir (migration)
  db.run(`ALTER TABLE produtos ADD COLUMN familia TEXT`, (err) => {
    // Ignorar erro se a coluna já existir
    if (err && !err.message.includes('duplicate column')) {
      console.error('Erro ao adicionar coluna familia:', err);
    }
  });
  
  // Adicionar coluna modelo e depois classificacao_area (migrations em sequência)
  db.run(`ALTER TABLE produtos ADD COLUMN modelo TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('Erro ao adicionar coluna modelo:', err);
    }
    db.run(`ALTER TABLE produtos ADD COLUMN classificacao_area TEXT`, (err2) => {
      if (err2 && !err2.message.includes('duplicate column')) {
        console.error('Erro ao adicionar coluna classificacao_area:', err2);
      } else {
        console.log('✅ Coluna classificacao_area verificada');
      }
    });
  });

  // Grupos de produtos (ex.: Masseira, Dispersores) – tela anterior às famílias
  db.run(`CREATE TABLE IF NOT EXISTS grupos_produto (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    numero INTEGER DEFAULT 10,
    ordem INTEGER DEFAULT 0,
    ativo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) console.error('Erro ao criar tabela grupos_produto:', err);
    else {
      console.log('✅ Tabela grupos_produto verificada');
      db.run('ALTER TABLE grupos_produto ADD COLUMN foto TEXT', (e) => {
        if (e && e.message.indexOf('duplicate') === -1) console.error('Erro ao adicionar coluna foto em grupos_produto:', e.message);
      });
      db.run('ALTER TABLE grupos_produto ADD COLUMN numero INTEGER DEFAULT 10', (e) => {
        if (e && e.message.indexOf('duplicate') === -1) console.error('Erro ao adicionar coluna numero em grupos_produto:', e.message);
      });
      db.all('SELECT id FROM grupos_produto WHERE numero IS NULL ORDER BY id', [], function(upErr, nullRows) {
        if (!upErr && nullRows && nullRows.length > 0) {
          nullRows.forEach(function(r, i) {
            db.run('UPDATE grupos_produto SET numero = ? WHERE id = ?', [10 * (i + 1), r.id]);
          });
          console.log('✅ Grupos com numero NULL atualizados para 10, 20, 30...');
        }
      });
      db.get('SELECT COUNT(*) AS n FROM grupos_produto', [], function(er, row) {
        if (!er && row && row.n === 0) {
          var defaults = [
            { nome: 'Masseira', numero: 10 },
            { nome: 'Dispersores', numero: 20 },
            { nome: 'Tanques e Reatores', numero: 30 },
            { nome: 'Hélices e Acessórios', numero: 40 },
            { nome: 'Outros', numero: 50 }
          ];
          defaults.forEach(function(item, i) {
            db.run('INSERT INTO grupos_produto (nome, numero, ordem, ativo) VALUES (?, ?, ?, 1)', [item.nome, item.numero, i]);
          });
          console.log('✅ Grupos padrão criados: ' + defaults.map(function(d) { return d.nome + ' (nº ' + d.numero + ')'; }).join(', '));
        }
        // Atribuir famílias sem grupo ao primeiro grupo
        db.run(
          'UPDATE familias_produto SET grupo_id = (SELECT id FROM grupos_produto WHERE ativo = 1 ORDER BY ordem ASC LIMIT 1) WHERE grupo_id IS NULL',
          function(upErr) {
            if (!upErr && this.changes > 0) console.log('✅ Famílias existentes vinculadas ao primeiro grupo');
          }
        );
      });
    }
  });

  // Famílias de produtos (cadastro com nome e foto)
  db.run(`CREATE TABLE IF NOT EXISTS familias_produto (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL UNIQUE,
    foto TEXT,
    ordem INTEGER DEFAULT 0,
    ativo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) console.error('Erro ao criar tabela familias_produto:', err);
    else console.log('✅ Tabela familias_produto verificada');
  });

  db.run('ALTER TABLE familias_produto ADD COLUMN codigo INTEGER', (err) => {
    if (err && err.message.indexOf('duplicate') === -1) console.error('Erro ao adicionar coluna codigo:', err.message);
  });

  db.run('ALTER TABLE familias_produto ADD COLUMN esquematico TEXT', (err) => {
    if (err && err.message.indexOf('duplicate') === -1) console.error('Erro ao adicionar coluna esquematico:', err.message);
  });

  db.run('ALTER TABLE familias_produto ADD COLUMN marcadores_vista TEXT', (err) => {
    if (err && err.message.indexOf('duplicate') === -1) console.error('Erro ao adicionar coluna marcadores_vista:', err.message);
  });

  db.run('ALTER TABLE familias_produto ADD COLUMN grupo_id INTEGER REFERENCES grupos_produto(id)', (err) => {
    if (err && err.message.indexOf('duplicate') === -1) console.error('Erro ao adicionar coluna grupo_id:', err.message);
  });

  db.run('UPDATE familias_produto SET codigo = id * 10 WHERE codigo IS NULL', (err) => {
    if (err) console.error('Erro ao preencher codigo:', err.message);
  });

  // Variáveis técnicas (motor, disco, etc.) para marcadores na vista frontal e cadastro de produtos
  db.run(`CREATE TABLE IF NOT EXISTS variaveis_tecnicas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    chave TEXT NOT NULL UNIQUE,
    categoria TEXT,
    tipo TEXT DEFAULT 'texto',
    opcoes TEXT,
    ordem INTEGER DEFAULT 0,
    sufixo TEXT,
    fonte_opcoes TEXT,
    grupo_compras_id INTEGER,
    ativo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) console.error('Erro ao criar tabela variaveis_tecnicas:', err);
    else console.log('✅ Tabela variaveis_tecnicas verificada');
    // Migrações de colunas (bancos antigos); depois garantir variáveis base
    db.run('ALTER TABLE variaveis_tecnicas ADD COLUMN sufixo TEXT', (alterErr) => {
      if (alterErr && !String(alterErr.message || '').includes('duplicate column')) console.error('Migração sufixo:', alterErr.message);
      db.run('ALTER TABLE variaveis_tecnicas ADD COLUMN fonte_opcoes TEXT', (e1) => {
        if (e1 && !String(e1.message || '').includes('duplicate column')) console.error('Migração fonte_opcoes:', e1.message);
        db.run('ALTER TABLE variaveis_tecnicas ADD COLUMN grupo_compras_id INTEGER', (e2) => {
          if (e2 && !String(e2.message || '').includes('duplicate column')) console.error('Migração grupo_compras_id:', e2.message);
          // Sempre garantir variáveis base na subida (após colunas existirem)
          (function garantirVariaveisBase() {
            let list = [];
            const basePath = path.join(PERSISTENT_DATA_DIR, 'variaveis-base.json');
            if (fs.existsSync(basePath)) {
              try {
                const parsed = JSON.parse(fs.readFileSync(basePath, 'utf8'));
                if (Array.isArray(parsed) && parsed.length > 0) list = parsed;
              } catch (_) {}
            }
            if (list.length === 0) list = VARIAVEIS_BASE_DEFAULT.map((nome, ordem) => ({ nome, ordem }));
            const total = list.length;
            if (total === 0) return;
            const slug = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') || ('var_' + Date.now());
            const stmt = db.prepare('INSERT OR IGNORE INTO variaveis_tecnicas (nome, chave, categoria, tipo, opcoes, ordem, sufixo, fonte_opcoes, grupo_compras_id, ativo) VALUES (?, ?, NULL, \'texto\', NULL, ?, NULL, NULL, NULL, 1)');
            let done = 0;
            function onDone() {
              done++;
              if (done === total) stmt.finalize(() => console.log('✅ Variáveis base garantidas (' + total + ')'));
            }
            list.forEach((item, i) => {
              const nome = (item && item.nome) ? item.nome : (typeof item === 'string' ? item : '');
              if (!nome) { onDone(); return; }
              const chave = slug(nome);
              const ordem = (item && item.ordem != null) ? item.ordem : i;
              stmt.run(nome, chave, ordem, onDone);
            });
          })();
        });
      });
    });
  });

  // Opções de configuração por família e por variável (ex.: família Masseira Bimix + motor_central_cv → 30 CV, 50 CV, 75 CV)
  db.run(`CREATE TABLE IF NOT EXISTS familia_variavel_opcoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    familia_id INTEGER NOT NULL,
    variavel_chave TEXT NOT NULL,
    valor TEXT NOT NULL,
    ordem INTEGER DEFAULT 0,
    ativo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(familia_id, variavel_chave, valor),
    FOREIGN KEY (familia_id) REFERENCES familias_produto(id)
  )`, (err) => {
    if (err) console.error('Erro ao criar tabela familia_variavel_opcoes:', err);
    else console.log('✅ Tabela familia_variavel_opcoes verificada');
  });

  // Variáveis por família: quais variáveis técnicas esta família usa (independente dos marcadores/bolinhas)
  db.run(`CREATE TABLE IF NOT EXISTS familia_variaveis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    familia_id INTEGER NOT NULL,
    variavel_chave TEXT NOT NULL,
    ordem INTEGER DEFAULT 0,
    ativo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(familia_id, variavel_chave),
    FOREIGN KEY (familia_id) REFERENCES familias_produto(id)
  )`, (err) => {
    if (err) console.error('Erro ao criar tabela familia_variaveis:', err);
    else console.log('✅ Tabela familia_variaveis verificada');
  });

  // Criar usuário admin padrão
  db.get('SELECT * FROM usuarios WHERE email = ?', ['admin@gmp.com.br'], (err, row) => {
    if (!row) {
      const hashedPassword = bcrypt.hashSync('admin123', 10);
      db.run(
        'INSERT INTO usuarios (nome, email, senha, cargo, role) VALUES (?, ?, ?, ?, ?)',
        ['Administrador', 'admin@gmp.com.br', hashedPassword, 'Administrador', 'admin'],
        (err) => {
          if (err) {
            console.error('Erro ao criar usuário admin:', err);
          } else {
            console.log('✅ Usuário admin criado: admin@gmp.com.br / admin123');
          }
        }
      );
    }
  });

  // Remover usuário "administrator" se existir (nome exato ou similar)
  db.all('SELECT id, nome, email FROM usuarios WHERE LOWER(nome) = ? OR LOWER(nome) LIKE ?', 
    ['administrator', '%administrator%'], 
    (err, rows) => {
      if (!err && rows && rows.length > 0) {
        rows.forEach(user => {
          // Não remover se for o admin padrão
          if (user.email !== 'admin@gmp.com.br') {
            db.run('DELETE FROM usuarios WHERE id = ?', [user.id], (deleteErr) => {
              if (deleteErr) {
                console.error(`Erro ao remover usuário ${user.nome}:`, deleteErr);
              } else {
                console.log(`✅ Usuário "${user.nome}" removido`);
              }
            });
          }
        });
      }
    }
  );

  // Executar migrações após um pequeno delay (500ms para subir mais rápido)
  setTimeout(() => {
    executeMigrations(() => {
      // Inicializar configurações padrão após migrações
      inicializarConfiguracoesPadrao(() => {
        // Verificar se o banco está realmente acessível
        db.get('SELECT 1', [], (err) => {
          if (err) {
            console.error('❌ Erro ao verificar banco de dados após inicialização:', err);
            dbReady = false;
          } else {
            dbReady = true;
            if (typeof onReadyCallback === 'function') onReadyCallback();
            console.log('✅ Banco de dados totalmente inicializado e pronto para uso');
            console.log('   - WAL mode: Habilitado para melhor concorrência');
            console.log('   - Busy timeout: 10 segundos');
            console.log('   - Cache size: 10000 páginas');
          }
        });
      });
    });
  }, 500);
}

// Inicializar configurações padrão
function inicializarConfiguracoesPadrao(callback) {
  const configsPadrao = [
    // Empresa
    { chave: 'empresa_nome', valor: 'GMP INDUSTRIAIS', tipo: 'text', categoria: 'empresa', descricao: 'Nome da empresa' },
    { chave: 'empresa_cnpj', valor: '', tipo: 'text', categoria: 'empresa', descricao: 'CNPJ da empresa' },
    { chave: 'empresa_endereco', valor: 'Av. Angelo Demarchi 130, Batistini', tipo: 'text', categoria: 'empresa', descricao: 'Endereço da empresa' },
    { chave: 'empresa_cidade', valor: 'São Bernardo do Campo', tipo: 'text', categoria: 'empresa', descricao: 'Cidade' },
    { chave: 'empresa_estado', valor: 'SP', tipo: 'text', categoria: 'empresa', descricao: 'Estado' },
    { chave: 'empresa_cep', valor: '', tipo: 'text', categoria: 'empresa', descricao: 'CEP' },
    { chave: 'empresa_telefone', valor: '', tipo: 'text', categoria: 'empresa', descricao: 'Telefone' },
    { chave: 'empresa_email', valor: '', tipo: 'text', categoria: 'empresa', descricao: 'Email' },
    { chave: 'empresa_site', valor: 'https://gmp.ind.br', tipo: 'text', categoria: 'empresa', descricao: 'Site' },
    
    // Sistema
    { chave: 'moeda', valor: 'BRL', tipo: 'text', categoria: 'sistema', descricao: 'Moeda padrão' },
    { chave: 'fuso_horario', valor: 'America/Sao_Paulo', tipo: 'text', categoria: 'sistema', descricao: 'Fuso horário' },
    { chave: 'idioma', valor: 'pt-BR', tipo: 'text', categoria: 'sistema', descricao: 'Idioma padrão' },
    { chave: 'tema', valor: 'claro', tipo: 'text', categoria: 'sistema', descricao: 'Tema (claro/escuro)' },
    
    // Email
    { chave: 'email_smtp_host', valor: '', tipo: 'text', categoria: 'email', descricao: 'Servidor SMTP' },
    { chave: 'email_smtp_port', valor: '587', tipo: 'number', categoria: 'email', descricao: 'Porta SMTP' },
    { chave: 'email_smtp_user', valor: '', tipo: 'text', categoria: 'email', descricao: 'Usuário SMTP' },
    { chave: 'email_smtp_pass', valor: '', tipo: 'text', categoria: 'email', descricao: 'Senha SMTP' },
    { chave: 'email_from', valor: '', tipo: 'text', categoria: 'email', descricao: 'Email remetente' },
    
    // Backup
    { chave: 'backup_automatico', valor: 'false', tipo: 'boolean', categoria: 'backup', descricao: 'Backup automático' },
    { chave: 'backup_frequencia', valor: 'diario', tipo: 'text', categoria: 'backup', descricao: 'Frequência do backup' },
    { chave: 'backup_manter_dias', valor: '30', tipo: 'number', categoria: 'backup', descricao: 'Dias para manter backups' },
  ];

  let completed = 0;
  const total = configsPadrao.length;
  
  if (total === 0) {
    if (callback) callback();
    return;
  }
  
  configsPadrao.forEach(config => {
    db.run(
      `INSERT OR IGNORE INTO configuracoes (chave, valor, tipo, categoria, descricao)
       VALUES (?, ?, ?, ?, ?)`,
      [config.chave, config.valor, config.tipo, config.categoria, config.descricao],
      (err) => {
        if (err) {
          console.error(`Erro ao inicializar configuração ${config.chave}:`, err);
        }
        completed++;
        if (completed === total && callback) {
          callback();
        }
      }
    );
  });
}

// Migrations
function executeMigrations(callback) {
  console.log('🔄 Executando migrações...');
  
  // Usar timeout para garantir que todas as operações assíncronas sejam concluídas
  // As migrações são principalmente ALTER TABLE que são rápidas
  setTimeout(() => {
    if (callback) {
      console.log('✅ Migrações concluídas');
      callback();
    }
  }, 2000); // 2 segundos deve ser suficiente para todas as migrações
  
  // Adicionar coluna ativo na tabela grupos_permissoes se não existir
  db.run(`ALTER TABLE grupos_permissoes ADD COLUMN ativo INTEGER DEFAULT 1`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('Erro ao adicionar coluna ativo em grupos_permissoes:', err);
    }
  });

  // Variáveis técnicas: colunas para vincular opções ao módulo Compras (fornecedores homologados)
  db.run('ALTER TABLE variaveis_tecnicas ADD COLUMN fonte_opcoes TEXT', (err) => {
    if (err && !String(err.message || '').includes('duplicate column')) console.error('Migração variaveis_tecnicas.fonte_opcoes:', err.message);
  });
  db.run('ALTER TABLE variaveis_tecnicas ADD COLUMN grupo_compras_id INTEGER', (err) => {
    if (err && !String(err.message || '').includes('duplicate column')) console.error('Migração variaveis_tecnicas.grupo_compras_id:', err.message);
  });

  // Garantir coluna classificacao_area na tabela produtos (para classificação Base Água / Base Solvente)
  db.run(`ALTER TABLE produtos ADD COLUMN classificacao_area TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column') && !err.message.includes('already exists')) {
      console.error('Erro ao adicionar coluna classificacao_area em produtos:', err);
    } else if (!err) {
      console.log('✅ Coluna classificacao_area adicionada à tabela produtos');
    }
  });
  
  // Adicionar colunas faltantes na tabela custos_viagens
  const colunasCustosViagens = [
    { nome: 'codigo_visita', tipo: 'TEXT' },
    { nome: 'proposta_aprovacao_id', tipo: 'INTEGER' },
    { nome: 'data_volta', tipo: 'DATE' },
    { nome: 'numero_pessoas', tipo: 'INTEGER DEFAULT 1' },
    { nome: 'origem', tipo: 'TEXT' },
    { nome: 'origem_cidade', tipo: 'TEXT' },
    { nome: 'origem_estado', tipo: 'TEXT' },
    { nome: 'destino_cidade', tipo: 'TEXT' },
    { nome: 'destino_estado', tipo: 'TEXT' },
    { nome: 'tipo_viagem', tipo: 'TEXT DEFAULT \'ida_e_volta\'' },
    { nome: 'distancia_km', tipo: 'REAL DEFAULT 0' },
    { nome: 'tempo_estimado_horas', tipo: 'REAL DEFAULT 0' },
    { nome: 'custo_transporte', tipo: 'REAL DEFAULT 0' },
    { nome: 'custo_hospedagem', tipo: 'REAL DEFAULT 0' },
    { nome: 'custo_alimentacao', tipo: 'REAL DEFAULT 0' },
    { nome: 'custo_outros', tipo: 'REAL DEFAULT 0' },
    { nome: 'total_custo', tipo: 'REAL DEFAULT 0' },
    { nome: 'custo_sugerido', tipo: 'REAL DEFAULT 0' },
    { nome: 'status_aprovacao', tipo: 'TEXT DEFAULT \'pendente\'' },
    { nome: 'motivo_aprovacao', tipo: 'TEXT' },
    { nome: 'aprovado_por', tipo: 'INTEGER' },
    { nome: 'data_aprovacao', tipo: 'DATETIME' },
    { nome: 'descricao', tipo: 'TEXT' },
    { nome: 'created_by', tipo: 'INTEGER' },
    { nome: 'updated_at', tipo: 'DATETIME DEFAULT CURRENT_TIMESTAMP' }
  ];
  
  colunasCustosViagens.forEach(coluna => {
    db.run(`ALTER TABLE custos_viagens ADD COLUMN ${coluna.nome} ${coluna.tipo}`, (err) => {
      if (err && !err.message.includes('duplicate column name') && !err.message.includes('already exists')) {
        console.error(`Erro ao adicionar coluna ${coluna.nome}:`, err.message);
      } else if (!err) {
        console.log(`✅ Coluna ${coluna.nome} adicionada à tabela custos_viagens`);
      }
    });
  });
  
  // Verificar e adicionar coluna role na tabela usuarios
  db.all("PRAGMA table_info(usuarios)", (err, rows) => {
    if (err) {
      console.log('⚠️ Erro ao verificar estrutura da tabela usuarios:', err.message);
      return;
    }
    if (rows && rows.length > 0) {
      const colunasExistentes = rows.map(col => col.name);
      const hasRole = colunasExistentes.some(col => col === 'role');
      if (!hasRole) {
        db.run(`ALTER TABLE usuarios ADD COLUMN role TEXT DEFAULT 'usuario'`, (err) => {
          if (err && !err.message.includes('duplicate') && !err.message.includes('already exists')) {
            console.log('⚠️ Aviso ao adicionar coluna role:', err.message);
          } else if (!err) {
            console.log('✅ Coluna role adicionada à tabela usuarios');
          }
        });
      }
    }
  });

  // Adicionar coluna logo_url na tabela clientes se não existir
  db.run(`ALTER TABLE clientes ADD COLUMN logo_url TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column name') && !err.message.includes('already exists')) {
      console.error('Erro ao adicionar coluna logo_url em clientes:', err.message);
    } else if (!err) {
      console.log('✅ Coluna logo_url adicionada à tabela clientes');
    }
  });
  
  // Adicionar colunas faltantes na tabela proposta_template_config
  const colunasTemplate = [
    { nome: 'familia', tipo: 'TEXT DEFAULT \'Geral\'' },
    { nome: 'componentes', tipo: 'TEXT' },
    { nome: 'nome_template', tipo: 'TEXT' },
    { nome: 'is_padrao', tipo: 'INTEGER DEFAULT 0' },
    { nome: 'header_image_url', tipo: 'TEXT' },
    { nome: 'footer_image_url', tipo: 'TEXT' },
    { nome: 'contrato_anexo_url', tipo: 'TEXT' },
    { nome: 'variaveis_proposta_tecnica', tipo: 'TEXT' },
    { nome: 'variaveis_proposta_por_familia', tipo: 'TEXT' },
    { nome: 'margin_impressao_top_primeira', tipo: 'REAL' },
    { nome: 'margin_impressao_top_outras', tipo: 'REAL' },
    { nome: 'margin_impressao_bottom', tipo: 'REAL' },
    { nome: 'margin_impressao_lateral', tipo: 'REAL' },
    { nome: 'margin_navegador_top', tipo: 'REAL' },
    { nome: 'margin_navegador_bottom', tipo: 'REAL' }
  ];
  
  colunasTemplate.forEach(coluna => {
    db.run(`ALTER TABLE proposta_template_config ADD COLUMN ${coluna.nome} ${coluna.tipo}`, (err) => {
      if (err && !err.message.includes('duplicate column name') && !err.message.includes('already exists')) {
        console.error(`Erro ao adicionar coluna ${coluna.nome} em proposta_template_config:`, err.message);
      } else if (!err) {
        console.log(`✅ Coluna ${coluna.nome} adicionada à tabela proposta_template_config`);
      }
    });
  });

  // Migração: familia em proposta_templates (template por família de produto)
  db.run(`ALTER TABLE proposta_templates ADD COLUMN familia TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column name') && !err.message.includes('already exists')) {
      console.error('Erro ao adicionar coluna familia em proposta_templates:', err.message);
    } else if (!err) {
      console.log('✅ Coluna familia adicionada à tabela proposta_templates');
    }
  });

  // Migração: snapshot_checksum em propostas (snapshot imutável)
  db.all("PRAGMA table_info(propostas)", (err, rows) => {
    if (err || !rows || rows.length === 0) return;
    const colunas = rows.map(c => c.name);
    if (!colunas.includes('snapshot_checksum')) {
      db.run(`ALTER TABLE propostas ADD COLUMN snapshot_checksum TEXT`, (err2) => {
        if (!err2) console.log('✅ Coluna snapshot_checksum adicionada à tabela propostas');
      });
    }
  });

  // Verificar e adicionar coluna ativo na tabela usuarios
  db.all("PRAGMA table_info(usuarios)", (err, rows) => {
    if (err) {
      console.log('⚠️ Erro ao verificar estrutura da tabela usuarios:', err.message);
      return;
    }
    if (rows && rows.length > 0) {
      const colunasExistentes = rows.map(col => col.name);
      const hasAtivo = colunasExistentes.some(col => col === 'ativo');
      if (!hasAtivo) {
        db.run(`ALTER TABLE usuarios ADD COLUMN ativo INTEGER DEFAULT 1`, (err) => {
          if (err && !err.message.includes('duplicate') && !err.message.includes('already exists')) {
            console.log('⚠️ Aviso ao adicionar coluna ativo:', err.message);
          } else if (!err) {
            console.log('✅ Coluna ativo adicionada à tabela usuarios');
          }
        });
      }
      
      // Adicionar coluna pode_aprovar_descontos
      const hasPodeAprovarDescontos = colunasExistentes.some(col => col === 'pode_aprovar_descontos');
      if (!hasPodeAprovarDescontos) {
        db.run(`ALTER TABLE usuarios ADD COLUMN pode_aprovar_descontos INTEGER DEFAULT 0`, (err) => {
          if (err && !err.message.includes('duplicate') && !err.message.includes('already exists')) {
            console.log('⚠️ Aviso ao adicionar coluna pode_aprovar_descontos:', err.message);
          } else if (!err) {
            console.log('✅ Coluna pode_aprovar_descontos adicionada à tabela usuarios');
          }
        });
      }
    }
  });

  // Verificar e adicionar colunas em propostas
  db.all("PRAGMA table_info(propostas)", (err, rows) => {
    if (err) {
      console.log('⚠️ Erro ao verificar estrutura da tabela propostas:', err.message);
      return;
    }
    if (rows && rows.length > 0) {
      const colunasExistentes = rows.map(col => col.name);
      const novasColunas = [
        { nome: 'responsavel_id', tipo: 'INTEGER' },
        { nome: 'created_by', tipo: 'INTEGER' },
        { nome: 'motivo_nao_venda', tipo: 'TEXT' },
        { nome: 'origem_busca', tipo: 'TEXT' },
        { nome: 'familia_produto', tipo: 'TEXT' },
        { nome: 'lembrete_data', tipo: 'DATE' },
        { nome: 'lembrete_mensagem', tipo: 'TEXT' },
        { nome: 'prazo_entrega', tipo: 'TEXT' },
        { nome: 'garantia', tipo: 'TEXT' },
        { nome: 'revisao', tipo: 'INTEGER DEFAULT 0' },
        { nome: 'anexo_cotacao', tipo: 'TEXT' },
        { nome: 'margem_desconto', tipo: 'REAL DEFAULT 0' },
        { nome: 'cliente_contato', tipo: 'TEXT' },
        { nome: 'cliente_telefone', tipo: 'TEXT' },
        { nome: 'cliente_email', tipo: 'TEXT' },
        { nome: 'template_id', tipo: 'INTEGER' },
        { nome: 'template_versao', tipo: 'TEXT' },
        { nome: 'html_rendered', tipo: 'TEXT' },
        { nome: 'css_snapshot', tipo: 'TEXT' },
        { nome: 'pdf_gerado_at', tipo: 'DATETIME' },
        { nome: 'oportunidade_id', tipo: 'INTEGER' },
        { nome: 'tipo_proposta', tipo: 'TEXT' },
        { nome: 'enviada_em', tipo: 'DATETIME' },
        { nome: 'expira_em', tipo: 'DATETIME' },
        { nome: 'idioma', tipo: 'TEXT' },
        { nome: 'moeda', tipo: 'TEXT' },
        { nome: 'incoterm', tipo: 'TEXT' },
        { nome: 'unidade_negocio', tipo: 'TEXT' }
      ];
      
      // Histórico de status (auditoria enterprise - Salesforce-like)
      db.run(`CREATE TABLE IF NOT EXISTS proposta_status_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        proposta_id INTEGER NOT NULL,
        status_anterior TEXT,
        status_novo TEXT NOT NULL,
        usuario_id INTEGER,
        observacao TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (proposta_id) REFERENCES propostas(id) ON DELETE CASCADE,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
      )`, (err) => {
        if (err && !err.message.includes('already exists')) {
          console.log('⚠️ Aviso ao criar proposta_status_history:', err.message);
        } else if (!err) {
          console.log('✅ Tabela proposta_status_history criada/verificada');
        }
      });
      
      // Criar tabela de revisões se não existir
      db.run(`CREATE TABLE IF NOT EXISTS proposta_revisoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        proposta_id INTEGER NOT NULL,
        revisao INTEGER NOT NULL,
        dados_anteriores TEXT,
        dados_novos TEXT,
        mudancas TEXT,
        revisado_por INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (proposta_id) REFERENCES propostas(id) ON DELETE CASCADE,
        FOREIGN KEY (revisado_por) REFERENCES usuarios(id)
      )`, (err) => {
        if (err && !err.message.includes('already exists')) {
          console.log('⚠️ Aviso ao criar tabela proposta_revisoes:', err.message);
        }
      });

      // Criar tabela de follow-ups se não existir
      db.run(`CREATE TABLE IF NOT EXISTS proposta_followups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        proposta_id INTEGER NOT NULL,
        comentario TEXT NOT NULL,
        criado_por INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (proposta_id) REFERENCES propostas(id) ON DELETE CASCADE,
        FOREIGN KEY (criado_por) REFERENCES usuarios(id)
      )`, (err) => {
        if (err && !err.message.includes('already exists')) {
          console.log('⚠️ Aviso ao criar tabela proposta_followups:', err.message);
        } else if (!err) {
          console.log('✅ Tabela proposta_followups criada/verificada');
        }
      });
      
      novasColunas.forEach(col => {
        if (!colunasExistentes.some(c => c === col.nome)) {
          db.run(`ALTER TABLE propostas ADD COLUMN ${col.nome} ${col.tipo}`, (err) => {
            if (err && !err.message.includes('duplicate') && !err.message.includes('already exists')) {
              console.log(`⚠️ Aviso ao adicionar coluna ${col.nome}:`, err.message);
            } else if (!err) {
              console.log(`✅ Coluna ${col.nome} adicionada à tabela propostas`);
            }
          });
        }
      });
    }
  });

  // Verificar e adicionar colunas em proposta_itens
  db.all("PRAGMA table_info(proposta_itens)", (err, rows) => {
    if (err) {
      console.log('⚠️ Erro ao verificar estrutura da tabela proposta_itens:', err.message);
      return;
    }
    if (rows && rows.length > 0) {
      const colunasExistentes = rows.map(col => col.name);
      const novasColunas = [
        { nome: 'codigo_produto', tipo: 'TEXT' },
        { nome: 'familia_produto', tipo: 'TEXT' },
        { nome: 'regiao_busca', tipo: 'TEXT' },
        { nome: 'tag', tipo: 'TEXT' },
        { nome: 'modelo', tipo: 'TEXT' },
        { nome: 'categoria', tipo: 'TEXT' },
        { nome: 'descricao_resumida', tipo: 'TEXT' },
        { nome: 'descritivo_tecnico', tipo: 'TEXT' },
        { nome: 'dados_processo', tipo: 'TEXT' },
        { nome: 'materiais_construtivos', tipo: 'TEXT' },
        { nome: 'utilidades_requeridas', tipo: 'TEXT' },
        { nome: 'opcionais', tipo: 'TEXT' },
        { nome: 'exclusoes', tipo: 'TEXT' },
        { nome: 'prazo_individual', tipo: 'TEXT' },
        { nome: 'numero_item', tipo: 'INTEGER' }
      ];
      
      novasColunas.forEach(col => {
        if (!colunasExistentes.some(c => c === col.nome)) {
          db.run(`ALTER TABLE proposta_itens ADD COLUMN ${col.nome} ${col.tipo}`, (err) => {
            if (err && !err.message.includes('duplicate') && !err.message.includes('already exists')) {
              console.log(`⚠️ Aviso ao adicionar coluna ${col.nome}:`, err.message);
            } else if (!err) {
              console.log(`✅ Coluna ${col.nome} adicionada à tabela proposta_itens`);
            }
          });
        }
      });
    }
  });

  // Tabela de especificações estruturadas por item (descritivo técnico dinâmico)
  db.run(`CREATE TABLE IF NOT EXISTS proposta_item_specs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proposta_item_id INTEGER NOT NULL,
    flow_rate_value REAL,
    flow_rate_unit TEXT,
    power_value REAL,
    power_unit TEXT,
    voltage_value REAL,
    voltage_unit TEXT,
    pressure_value REAL,
    pressure_unit TEXT,
    temperature_value REAL,
    temperature_unit TEXT,
    volume_value REAL,
    volume_unit TEXT,
    viscosity_value REAL,
    viscosity_unit TEXT,
    density_value REAL,
    density_unit TEXT,
    protection_degree TEXT,
    area_classificada TEXT,
    outros TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (proposta_item_id) REFERENCES proposta_itens(id) ON DELETE CASCADE
  )`, (err) => {
    if (err && !err.message.includes('already exists')) {
      console.log('⚠️ Aviso ao criar proposta_item_specs:', err && err.message);
    } else if (!err) {
      console.log('✅ Tabela proposta_item_specs criada/verificada');
    }
  });

  // Verificar e adicionar coluna numero_pessoas na tabela custos_viagens
  db.all("PRAGMA table_info(custos_viagens)", (err, rows) => {
    if (err) {
      console.log('⚠️ Erro ao verificar estrutura da tabela custos_viagens:', err.message);
      return;
    }
    if (rows && rows.length > 0) {
      const colunasExistentes = rows.map(col => col.name);
      const hasNumeroPessoas = colunasExistentes.some(col => col === 'numero_pessoas');
      if (!hasNumeroPessoas) {
        db.run(`ALTER TABLE custos_viagens ADD COLUMN numero_pessoas INTEGER DEFAULT 1`, (err) => {
          if (err && !err.message.includes('duplicate') && !err.message.includes('already exists')) {
            console.log('⚠️ Aviso ao adicionar coluna numero_pessoas:', err.message);
          } else if (!err) {
            console.log('✅ Coluna numero_pessoas adicionada à tabela custos_viagens');
          }
        });
      }
    }
  });

  // Criar tabela de aprovações
  db.run(`CREATE TABLE IF NOT EXISTS aprovacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proposta_id INTEGER NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'desconto',
    valor_desconto REAL,
    valor_total REAL,
    valor_com_desconto REAL,
    valor_desconto_rs REAL,
    solicitado_por INTEGER NOT NULL,
    aprovado_por INTEGER,
    status TEXT DEFAULT 'pendente',
    observacoes TEXT,
    motivo_rejeicao TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    aprovado_em DATETIME,
    FOREIGN KEY (proposta_id) REFERENCES propostas(id) ON DELETE CASCADE,
    FOREIGN KEY (solicitado_por) REFERENCES usuarios(id),
    FOREIGN KEY (aprovado_por) REFERENCES usuarios(id)
  )`, (err) => {
    if (err && !err.message.includes('already exists')) {
      console.log('⚠️ Aviso ao criar tabela aprovacoes:', err.message);
    } else if (!err) {
      console.log('✅ Tabela aprovacoes criada/verificada');
    }
  });

  // Verificar e adicionar coluna created_by na tabela atividades
  db.all("PRAGMA table_info(atividades)", (err, rows) => {
    if (err) {
      console.log('⚠️ Erro ao verificar estrutura da tabela atividades:', err.message);
      return;
    }
    if (rows && rows.length > 0) {
      const colunasExistentes = rows.map(col => col.name);
      const hasCreatedBy = colunasExistentes.some(col => col === 'created_by');
      if (!hasCreatedBy) {
        db.run(`ALTER TABLE atividades ADD COLUMN created_by INTEGER`, (err) => {
          if (err && !err.message.includes('duplicate') && !err.message.includes('already exists')) {
            console.log('⚠️ Aviso ao adicionar coluna created_by:', err.message);
          } else if (!err) {
            console.log('✅ Coluna created_by adicionada à tabela atividades');
          }
        });
      }
    }
  });
}

// Helper function para executar queries com retry automático em caso de lock
function dbRunWithRetry(sql, params = [], callback, maxRetries = 3) {
  let retries = 0;
  
  const execute = () => {
    db.run(sql, params, function(err) {
      if (err) {
        // Se for erro de lock e ainda temos tentativas, tentar novamente
        if ((err.message.includes('database is locked') || 
             err.message.includes('SQLITE_BUSY') ||
             err.code === 'SQLITE_BUSY') && 
            retries < maxRetries) {
          retries++;
          const delay = Math.min(100 * Math.pow(2, retries), 1000); // Backoff exponencial
          console.warn(`⚠️ Banco ocupado, tentando novamente em ${delay}ms (tentativa ${retries}/${maxRetries})`);
          setTimeout(execute, delay);
          return;
        }
        // Se não for erro de lock ou esgotamos as tentativas, chamar callback com erro
        if (callback) callback(err);
      } else {
        // Sucesso
        if (callback) callback(null, this);
      }
    });
  };
  
  execute();
}

function dbGetWithRetry(sql, params = [], callback, maxRetries = 3) {
  let retries = 0;
  
  const execute = () => {
    db.get(sql, params, (err, row) => {
      if (err) {
        if ((err.message.includes('database is locked') || 
             err.message.includes('SQLITE_BUSY') ||
             err.code === 'SQLITE_BUSY') && 
            retries < maxRetries) {
          retries++;
          const delay = Math.min(100 * Math.pow(2, retries), 1000);
          console.warn(`⚠️ Banco ocupado, tentando novamente em ${delay}ms (tentativa ${retries}/${maxRetries})`);
          setTimeout(execute, delay);
          return;
        }
        if (callback) callback(err, null);
      } else {
        if (callback) callback(null, row);
      }
    });
  };
  
  execute();
}

function dbAllWithRetry(sql, params = [], callback, maxRetries = 3) {
  let retries = 0;
  
  const execute = () => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        if ((err.message.includes('database is locked') || 
             err.message.includes('SQLITE_BUSY') ||
             err.code === 'SQLITE_BUSY') && 
            retries < maxRetries) {
          retries++;
          const delay = Math.min(100 * Math.pow(2, retries), 1000);
          console.warn(`⚠️ Banco ocupado, tentando novamente em ${delay}ms (tentativa ${retries}/${maxRetries})`);
          setTimeout(execute, delay);
          return;
        }
        if (callback) callback(err, null);
      } else {
        if (callback) callback(null, rows);
      }
    });
  };
  
  execute();
}

// Authentication Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1];
  if (!token && req.headers['x-auth-token']) {
    token = req.headers['x-auth-token'];
  }
  if (!token && req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Token não fornecido', code: 'NO_TOKEN' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(401).json({ error: 'Token inválido ou expirado' });
    }
    req.user = user;
    next();
  });
}

// Middleware para verificar permissões de módulo (considera grupo E permissões diretas do usuário)
function checkModulePermission(requiredModule) {
  return (req, res, next) => {
    if (req.user.role === 'admin') {
      return next();
    }

    const userId = req.user.id;

    // 1) Verificar permissão direta do usuário (usuario_id preenchido, grupo_id NULL)
    db.get(
      `SELECT 1 FROM permissoes
       WHERE usuario_id = ? AND (grupo_id IS NULL OR grupo_id = 0)
       AND modulo = ? AND permissao = 1 LIMIT 1`,
      [userId, requiredModule],
      (err, directRow) => {
        if (err) {
          console.error('Erro ao verificar permissão direta:', err);
          return res.status(500).json({ error: 'Erro ao verificar permissões' });
        }
        if (directRow) {
          return next();
        }

        // 2) Buscar grupos do usuário e verificar permissão via grupo
        db.all(
          `SELECT gp.id FROM grupos_permissoes gp
           INNER JOIN usuarios_grupos ug ON gp.id = ug.grupo_id
           WHERE ug.usuario_id = ? AND gp.ativo = 1`,
          [userId],
          (err, grupos) => {
            if (err) {
              console.error('Erro ao verificar permissões:', err);
              return res.status(500).json({ error: 'Erro ao verificar permissões' });
            }

            // Se não tem grupos, apenas comercial por padrão
            if (!grupos || grupos.length === 0) {
              if (requiredModule === 'comercial') {
                return next();
              }
              registrarTentativaAcessoNegado(req, requiredModule);
              return res.status(403).json({ error: 'Acesso negado ao módulo', modulo: requiredModule });
            }

            const grupoIds = grupos.map(g => g.id);
            const placeholders = grupoIds.map(() => '?').join(',');

            db.get(
              `SELECT COUNT(*) as count FROM permissoes
               WHERE grupo_id IN (${placeholders})
               AND modulo = ? AND permissao = 1`,
              [...grupoIds, requiredModule],
              (err, row) => {
                if (err) {
                  console.error('Erro ao verificar permissões:', err);
                  return res.status(500).json({ error: 'Erro ao verificar permissões' });
                }
                if (row && row.count > 0) {
                  return next();
                }
                registrarTentativaAcessoNegado(req, requiredModule);
                return res.status(403).json({ error: 'Acesso negado ao módulo', modulo: requiredModule });
              }
            );
          }
        );
      }
    );
  };
}

// Função auxiliar para registrar tentativa de acesso negado
function registrarTentativaAcessoNegado(req, modulo) {
  const usuario_id = req.user.id;
  const ip_address = req.ip || req.connection.remoteAddress;
  const user_agent = req.get('user-agent') || '';

  const nomesModulos = {
    'comercial': 'Comercial',
    'compras': 'Compras',
    'financeiro': 'Financeiro',
    'operacional': 'Operacional',
    'administrativo': 'Administrativo',
    'admin': 'Administração',
    'engenharia': 'Cálculos de Engenharia'
  };

  const nome_modulo = nomesModulos[modulo] || modulo;

  // Buscar nome do usuário
  db.get('SELECT nome, email FROM usuarios WHERE id = ?', [usuario_id], (err, user) => {
    if (err) {
      console.error('Erro ao buscar usuário para log:', err);
      return;
    }

    const usuario_nome = user?.nome || req.user.email || 'N/A';
    const usuario_email = user?.email || req.user.email || 'N/A';

    // Registrar no log de auditoria
    db.run(
      `INSERT INTO logs_auditoria 
       (usuario_id, usuario_nome, usuario_email, tipo, modulo, nome_modulo, ip_address, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [usuario_id, usuario_nome, usuario_email, 'acesso_negado', modulo, nome_modulo, ip_address, user_agent],
      (err) => {
        if (err) {
          console.error('Erro ao registrar log de auditoria:', err);
        }
      }
    );
  });
}

// Normaliza campos de texto para MAIÚSCULAS antes de salvar (evita mistura de maiúsculas/minúsculas)
function normalizarMaiusculas(obj, keys) {
  if (!obj || typeof obj !== 'object') return;
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
    var v = obj[k];
    if (v === undefined || v === null) continue;
    if (typeof v === 'string') {
      obj[k] = v.toUpperCase();
    } else if (typeof v !== 'object') {
      obj[k] = String(v).toUpperCase();
    }
  }
}

// Garante valor em MAIÚSCULAS para gravar no banco (usa no array do INSERT/UPDATE)
function toUpper(val) {
  if (val === undefined || val === null) return val;
  if (typeof val === 'string') return val.toUpperCase();
  return String(val).toUpperCase();
}

// Normaliza nome de família para comparação (trim, maiúsculas, remove acentos) — evita produto não aparecer na família por diferença de encoding
function normalizarFamiliaComparacao(str) {
  if (str == null || typeof str !== 'string') return '';
  var s = str.trim().toUpperCase();
  try {
    s = s.normalize('NFD').replace(/\u0300-\u036f/g, '');
  } catch (e) {}
  return s.replace(/\s+/g, ' ');
}

// ========== ROTAS DE AUTENTICAÇÃO ==========
app.post('/api/auth/login', (req, res) => {
  const { email, senha } = req.body;

  if (!email || !senha) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios' });
  }

  db.get('SELECT * FROM usuarios WHERE email = ? AND ativo = 1', [email], (err, user) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (!user || !bcrypt.compareSync(senha, user.senha)) {
      return res.status(401).json({ error: 'Email ou senha inválidos' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        nome: user.nome,
        email: user.email,
        cargo: user.cargo,
        role: user.role
      }
    });
  });
});

// ========== ROTA RAIZ DA API ==========
// Rota raiz da API (sem autenticação)
app.get('/api', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'API CRM GMP INDUSTRIAIS',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth/login',
      usuarios: '/api/usuarios',
      clientes: '/api/clientes',
      projetos: '/api/projetos',
      propostas: '/api/propostas',
      produtos: '/api/produtos',
      relatorios: '/api/relatorios',
      // Adicione outros endpoints conforme necessário
    },
    timestamp: new Date().toISOString()
  });
});

// ========== ROTA DE BUSCA DE CNPJ ==========
// Endpoint para buscar dados de CNPJ (com autenticação)
app.get('/api/cnpj/:cnpj', authenticateToken, async (req, res) => {
  const { cnpj } = req.params;
  const cnpjLimpo = cnpj.replace(/\D/g, '');
  
  if (cnpjLimpo.length !== 14) {
    return res.status(400).json({ error: 'CNPJ deve ter 14 dígitos' });
  }

  // Função auxiliar para fazer fetch com timeout
  const fetchWithTimeout = (url, options = {}, timeout = 8000) => {
    return Promise.race([
      fetch(url, options),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), timeout)
      )
    ]);
  };

  try {
    // Tentar primeiro com BrasilAPI
    try {
      const response = await fetchWithTimeout(
        `https://brasilapi.com.br/api/cnpj/v1/${cnpjLimpo}`,
        {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'CRM-GMP/1.0'
          },
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        
        if (data && (data.razao_social || data.nome || data.company_name)) {
          return res.json({
            success: true,
            source: 'brasilapi',
            data: {
              razao_social: data.razao_social || data.nome || data.company_name,
              nome_fantasia: data.nome_fantasia || data.fantasia || data.trade_name || data.alias,
              logradouro: data.logradouro || data.street,
              numero: data.numero || data.number,
              complemento: data.complemento || data.complement,
              bairro: data.bairro || data.district || data.neighborhood,
              municipio: data.municipio || data.cidade || data.city,
              cidade: data.municipio || data.cidade || data.city,
              uf: data.uf || data.estado || data.state,
              estado: data.uf || data.estado || data.state,
              cep: data.cep || data.zip_code,
              telefone: data.telefone || data.phone,
              email: data.email
            }
          });
        }
      }
    } catch (brasilApiError) {
      console.log('BrasilAPI não retornou dados:', brasilApiError.message);
    }

    // Tentar ReceitaWS como alternativa
    try {
      const receitaResponse = await fetchWithTimeout(
        `https://www.receitaws.com.br/v1/${cnpjLimpo}`,
        {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'CRM-GMP/1.0'
          },
        }
      );
      
      if (receitaResponse.ok) {
        const receitaData = await receitaResponse.json();
        
        if (receitaData.status === 'ERROR' || receitaData.message) {
          throw new Error(receitaData.message || 'CNPJ não encontrado');
        }
        
        if (receitaData.nome || receitaData.fantasia) {
          return res.json({
            success: true,
            source: 'receitaws',
            data: {
              razao_social: receitaData.nome || receitaData.fantasia,
              nome_fantasia: receitaData.fantasia || receitaData.nome,
              logradouro: receitaData.logradouro,
              numero: receitaData.numero,
              complemento: receitaData.complemento,
              bairro: receitaData.bairro,
              municipio: receitaData.municipio,
              cidade: receitaData.municipio,
              uf: receitaData.uf,
              estado: receitaData.uf,
              cep: receitaData.cep,
              telefone: receitaData.telefone,
              email: receitaData.email
            }
          });
        }
      }
    } catch (receitaError) {
      console.log('ReceitaWS não retornou dados:', receitaError.message);
    }

    // Se nenhuma API funcionou
    res.status(404).json({
      success: false,
      error: 'CNPJ não encontrado nas bases de dados consultadas',
      message: 'Verifique se o CNPJ está correto ou preencha os dados manualmente'
    });

  } catch (error) {
    console.error('Erro ao buscar CNPJ:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao consultar APIs de CNPJ',
      message: error.message || 'Erro desconhecido'
    });
  }
});

// ========== ROTA DE HEALTH CHECK ==========
// Endpoint de health check (sem autenticação)
app.get('/api/health', (req, res) => {
  // Verificar se o banco de dados está acessível
  if (!db) {
    return res.status(500).json({ 
      status: 'error', 
      message: 'Banco de dados não foi inicializado',
      timestamp: new Date().toISOString()
    });
  }
  
  db.get('SELECT 1', [], (err) => {
    if (err) {
      return res.status(500).json({ 
        status: 'error', 
        message: 'Banco de dados não está acessível',
        error: err.message,
        timestamp: new Date().toISOString()
      });
    }
    res.json({ 
      status: 'ok', 
      message: 'Servidor e banco de dados funcionando corretamente',
      timestamp: new Date().toISOString(),
      server_ip: req.ip,
      hostname: req.hostname
    });
  });
});

// ========== BACKUP DE DADOS (banco + uploads) ==========
// Uso: GET /api/backup?token=SEU_BACKUP_TOKEN (defina BACKUP_TOKEN no .env do servidor)
app.get('/api/backup', (req, res) => {
  const token = process.env.BACKUP_TOKEN;
  const provided = req.query.token || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token || provided !== token) {
    return res.status(401).json({ error: 'Token de backup inválido ou não configurado' });
  }
  const backupDir = PERSISTENT_DATA_DIR;
  if (!fs.existsSync(backupDir)) {
    return res.status(404).json({ error: 'Pasta de dados não encontrada' });
  }
  const filename = `crm-backup-${new Date().toISOString().slice(0, 10)}.zip`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.on('error', (err) => {
    if (!res.headersSent) res.status(500).json({ error: err.message });
  });
  archive.pipe(res);
  archive.directory(backupDir, false);
  archive.finalize();
});

// ========== ROTAS DE FAMÍLIAS (registradas cedo para evitar 404 com proxy) ==========
app.get('/api/deploy-version', (req, res) => {
  res.json({ version: 'familias-2026-02', hasFamilias: true });
});
app.get('/deploy-version', (req, res) => {
  res.json({ version: 'familias-2026-02', hasFamilias: true });
});
// ========== GRUPOS DE PRODUTOS (Masseira, Dispersores, etc.) ==========
app.get('/api/grupos', authenticateToken, (req, res) => {
  db.all('SELECT * FROM grupos_produto WHERE ativo = 1 ORDER BY COALESCE(numero, 999) ASC, ordem ASC, nome ASC', [], function(err, rows) {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});
app.get('/grupos', authenticateToken, (req, res) => {
  db.all('SELECT * FROM grupos_produto WHERE ativo = 1 ORDER BY COALESCE(numero, 999) ASC, ordem ASC, nome ASC', [], function(err, rows) {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});
app.get('/api/grupos/:id', authenticateToken, (req, res) => {
  var id = req.params.id;
  db.get('SELECT * FROM grupos_produto WHERE id = ? AND ativo = 1', [id], function(err, row) {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Grupo não encontrado' });
    res.json(row);
  });
});
app.post('/api/grupos', authenticateToken, (req, res) => {
  var body = req.body || {};
  var nome = (body.nome || '').trim();
  if (!nome) return res.status(400).json({ error: 'Nome do grupo é obrigatório' });
  var numero = parseInt(body.numero, 10);
  if (isNaN(numero) || numero < 10) numero = 10;
  var ordem = parseInt(body.ordem, 10) || 0;
  db.run('INSERT INTO grupos_produto (nome, numero, ordem, ativo) VALUES (?, ?, ?, 1)', [nome, numero, ordem], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ id: this.lastID, nome: nome, numero: numero, ordem: ordem });
  });
});
app.put('/api/grupos/:id', authenticateToken, (req, res) => {
  var id = req.params.id;
  var body = req.body || {};
  var nome = (body.nome || '').trim();
  if (!nome) return res.status(400).json({ error: 'Nome do grupo é obrigatório' });
  var numero = parseInt(body.numero, 10);
  if (isNaN(numero) || numero < 10) numero = 10;
  var ordem = parseInt(body.ordem, 10) || 0;
  db.run('UPDATE grupos_produto SET nome = ?, numero = ?, ordem = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [nome, numero, ordem, id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Grupo não encontrado' });
    res.json({ id: id, nome: nome, numero: numero, ordem: ordem });
  });
});
app.delete('/api/grupos/:id', authenticateToken, (req, res) => {
  var id = req.params.id;
  db.run('UPDATE grupos_produto SET ativo = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Grupo não encontrado' });
    res.json({ message: 'Grupo desativado' });
  });
});

app.post('/api/grupos/:id/foto', authenticateToken, uploadGrupo.single('foto'), (req, res) => {
  var id = req.params.id;
  if (!req.file || !req.file.filename) return res.status(400).json({ error: 'Nenhuma imagem enviada' });
  var filename = req.file.filename;
  db.get('SELECT * FROM grupos_produto WHERE id = ?', [id], function(err, grupo) {
    if (err) return res.status(500).json({ error: err.message });
    if (!grupo) return res.status(404).json({ error: 'Grupo não encontrado' });
    var oldFoto = grupo.foto;
    db.run('UPDATE grupos_produto SET foto = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [filename, id], function(updateErr) {
      if (updateErr) return res.status(500).json({ error: updateErr.message });
      if (oldFoto) {
        var oldPath = path.join(uploadsGruposDir, oldFoto);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      res.json({ foto: filename, url: '/api/uploads/grupos-produtos/' + filename });
    });
  });
});

app.post('/api/grupos/:id/foto-base64', authenticateToken, (req, res) => {
  try {
    var id = req.params.id;
    var b64 = req.body && req.body.foto_base64;
    if (!b64 || typeof b64 !== 'string') return res.status(400).json({ error: 'foto_base64 é obrigatório' });
    var match = b64.match(/^data:image\/(\w+);base64,(.+)$/);
    var ext = '.jpg';
    var buf = b64;
    if (match) {
      ext = match[1] === 'jpeg' ? '.jpg' : '.' + match[1];
      buf = Buffer.from(match[2], 'base64');
    } else {
      buf = Buffer.from(b64, 'base64');
    }
    if (!fs.existsSync(uploadsGruposDir)) fs.mkdirSync(uploadsGruposDir, { recursive: true });
    var filename = 'grupo_' + id + '_' + Date.now() + ext;
    var filePath = path.join(uploadsGruposDir, filename);
    fs.writeFile(filePath, buf, function(err) {
      if (err) return res.status(500).json({ error: 'Erro ao salvar arquivo: ' + err.message });
      db.get('SELECT * FROM grupos_produto WHERE id = ?', [id], function(dbErr, grupo) {
        if (dbErr) return res.status(500).json({ error: dbErr.message });
        if (!grupo) return res.status(404).json({ error: 'Grupo não encontrado' });
        var oldFoto = grupo.foto;
        db.run('UPDATE grupos_produto SET foto = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [filename, id], function(upErr) {
          if (upErr) return res.status(500).json({ error: upErr.message });
          if (oldFoto) {
            var oldPath = path.join(uploadsGruposDir, oldFoto);
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
          }
          res.json({ foto: filename, url: '/api/uploads/grupos-produtos/' + filename });
        });
      });
    });
  } catch (e) {
    console.error('Erro foto-base64 grupo:', e);
    return res.status(500).json({ error: e.message || 'Erro ao processar foto' });
  }
});

app.get('/api/familias', authenticateToken, (req, res) => {
  var grupoId = req.query.grupo_id;
  var sql = 'SELECT * FROM familias_produto WHERE ativo = 1';
  var params = [];
  if (grupoId) {
    sql += ' AND grupo_id = ?';
    params.push(grupoId);
  }
  sql += ' ORDER BY ordem ASC, nome ASC';
  db.all(sql, params.length ? params : [], function(err, rows) {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});
app.post('/api/familias', authenticateToken, (req, res) => {
  var body = req.body || {};
  var nome = (body.nome || '').trim();
  if (!nome) return res.status(400).json({ error: 'Nome da família é obrigatório' });
  var ordem = parseInt(body.ordem, 10) || 0;
  var grupoId = body.grupo_id != null ? parseInt(body.grupo_id, 10) : null;
  if (grupoId === 0 || isNaN(grupoId)) grupoId = null;
  db.get('SELECT COALESCE(MAX(codigo), 0) + 10 AS proximo FROM familias_produto', [], function(err, row) {
    if (err) return res.status(500).json({ error: err.message });
    var codigo = row && row.proximo != null ? row.proximo : 10;
    db.run('INSERT INTO familias_produto (nome, ordem, codigo, ativo, grupo_id) VALUES (?, ?, ?, 1, ?)', [nome, ordem, codigo, grupoId], function(insertErr) {
      if (insertErr) {
        if (insertErr.message && insertErr.message.indexOf('UNIQUE') !== -1) return res.status(400).json({ error: 'Já existe uma família com este nome' });
        return res.status(500).json({ error: insertErr.message });
      }
      res.json({ id: this.lastID, nome: nome, ordem: ordem, codigo: codigo });
    });
  });
});
app.get('/familias', authenticateToken, (req, res) => {
  var grupoId = req.query.grupo_id;
  var sql = 'SELECT * FROM familias_produto WHERE ativo = 1';
  var params = [];
  if (grupoId) {
    sql += ' AND grupo_id = ?';
    params.push(grupoId);
  }
  sql += ' ORDER BY ordem ASC, nome ASC';
  db.all(sql, params.length ? params : [], function(err, rows) {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});
app.post('/familias', authenticateToken, (req, res) => {
  var body = req.body || {};
  var nome = (body.nome || '').trim();
  if (!nome) return res.status(400).json({ error: 'Nome da família é obrigatório' });
  var ordem = parseInt(body.ordem, 10) || 0;
  var grupoId = body.grupo_id != null ? parseInt(body.grupo_id, 10) : null;
  if (grupoId === 0 || isNaN(grupoId)) grupoId = null;
  db.get('SELECT COALESCE(MAX(codigo), 0) + 10 AS proximo FROM familias_produto', [], function(err, row) {
    if (err) return res.status(500).json({ error: err.message });
    var codigo = row && row.proximo != null ? row.proximo : 10;
    db.run('INSERT INTO familias_produto (nome, ordem, codigo, ativo, grupo_id) VALUES (?, ?, ?, 1, ?)', [nome, ordem, codigo, grupoId], function(insertErr) {
      if (insertErr) {
        if (insertErr.message && insertErr.message.indexOf('UNIQUE') !== -1) return res.status(400).json({ error: 'Já existe uma família com este nome' });
        return res.status(500).json({ error: insertErr.message });
      }
      res.json({ id: this.lastID, nome: nome, ordem: ordem, codigo: codigo, grupo_id: grupoId });
    });
  });
});

// ========== ROTAS DE USUÁRIOS ==========
// Lista apenas usuários com acesso ao módulo Comercial (para filtros do comercial: responsáveis)
app.get('/api/usuarios/comercial', authenticateToken, (req, res) => {
  const sql = `
    SELECT DISTINCT u.id, u.nome, u.email, u.cargo, u.role, u.ativo, u.created_at
    FROM usuarios u
    WHERE u.ativo = 1
    AND (
      u.role = 'admin'
      OR NOT EXISTS (SELECT 1 FROM usuarios_grupos ug WHERE ug.usuario_id = u.id)
      OR EXISTS (
        SELECT 1 FROM usuarios_grupos ug
        INNER JOIN permissoes p ON p.grupo_id = ug.grupo_id AND p.modulo = 'comercial' AND p.permissao = 1
        WHERE ug.usuario_id = u.id
      )
    )
    ORDER BY u.nome`;
  db.all(sql, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    return res.json(rows || []);
  });
});

// Lista usuários com acesso a um módulo (para filtros de responsável por módulo)
// Módulos: comercial, compras, financeiro, operacional, administrativo, admin
app.get('/api/usuarios/por-modulo/:modulo', authenticateToken, (req, res) => {
  const { modulo } = req.params;
  const sql = `
    SELECT DISTINCT u.id, u.nome, u.email, u.cargo, u.role, u.ativo, u.created_at
    FROM usuarios u
    WHERE u.ativo = 1
    AND (
      u.role = 'admin'
      OR EXISTS (
        SELECT 1 FROM permissoes p
        WHERE p.usuario_id = u.id AND (p.grupo_id IS NULL OR p.grupo_id = 0)
        AND p.modulo = ? AND p.permissao = 1
      )
      OR (
        NOT EXISTS (SELECT 1 FROM usuarios_grupos ug WHERE ug.usuario_id = u.id)
        AND ? = 'comercial'
      )
      OR EXISTS (
        SELECT 1 FROM usuarios_grupos ug
        INNER JOIN permissoes p ON p.grupo_id = ug.grupo_id AND p.modulo = ? AND p.permissao = 1
        WHERE ug.usuario_id = u.id
      )
    )
    ORDER BY u.nome`;
  db.all(sql, [modulo, modulo, modulo], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    return res.json(rows || []);
  });
});

app.get('/api/usuarios', authenticateToken, (req, res) => {
  db.all('SELECT id, nome, email, cargo, role, ativo, created_at FROM usuarios ORDER BY nome', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    // Para cada usuário, buscar seus grupos
    if (!rows || rows.length === 0) {
      return res.json([]);
    }
    
    const usuariosComGrupos = [];
    let processados = 0;
    
    rows.forEach((usuario, index) => {
      db.all(
        `SELECT gp.id, gp.nome, gp.ativo
         FROM grupos_permissoes gp
         INNER JOIN usuarios_grupos ug ON gp.id = ug.grupo_id
         WHERE ug.usuario_id = ? AND gp.ativo = 1
         ORDER BY gp.nome`,
        [usuario.id],
        (err, grupos) => {
          if (err) {
            console.error(`Erro ao buscar grupos do usuário ${usuario.id}:`, err);
            usuariosComGrupos.push({ ...usuario, grupos: [] });
          } else {
            usuariosComGrupos.push({ ...usuario, grupos: grupos || [] });
          }
          
          processados++;
          if (processados === rows.length) {
            res.json(usuariosComGrupos);
          }
        }
      );
    });
  });
});

app.get('/api/usuarios/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  db.get('SELECT id, nome, email, cargo, role, ativo, pode_aprovar_descontos, created_at FROM usuarios WHERE id = ?', [id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    res.json(row);
  });
});

// Obter grupos e permissões de um usuário
app.get('/api/usuarios/:id/grupos', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  // Buscar grupos do usuário
  db.all(
    `SELECT 
      gp.id,
      gp.nome,
      gp.descricao,
      gp.ativo
    FROM grupos_permissoes gp
    INNER JOIN usuarios_grupos ug ON gp.id = ug.grupo_id
    WHERE ug.usuario_id = ? AND gp.ativo = 1
    ORDER BY gp.nome`,
    [id],
    (err, grupos) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      // Buscar permissões dos grupos
      let permissoesGrupos = [];
      if (grupos.length > 0) {
        const grupoIds = grupos.map(g => g.id);
        const placeholders = grupoIds.map(() => '?').join(',');
        
        db.all(
          `SELECT 
            p.id,
            p.grupo_id,
            p.modulo,
            p.acao,
            p.permissao,
            gp.nome as grupo_nome
          FROM permissoes p
          INNER JOIN grupos_permissoes gp ON p.grupo_id = gp.id
          WHERE p.grupo_id IN (${placeholders})
          ORDER BY p.modulo, p.acao`,
          grupoIds,
          (err, permissoesGruposResult) => {
            if (err) {
              return res.status(500).json({ error: err.message });
            }
            permissoesGrupos = permissoesGruposResult || [];
            
            // Buscar permissões diretas do usuário (onde usuario_id não é NULL e grupo_id é NULL)
            db.all(
              `SELECT 
                p.id,
                p.usuario_id,
                p.grupo_id,
                p.modulo,
                p.acao,
                p.permissao,
                NULL as grupo_nome
              FROM permissoes p
              WHERE p.usuario_id = ? AND p.grupo_id IS NULL
              ORDER BY p.modulo, p.acao`,
              [id],
              (err, permissoesDiretas) => {
                if (err) {
                  return res.status(500).json({ error: err.message });
                }
                
                // Combinar permissões de grupos e permissões diretas
                const todasPermissoes = [...permissoesGrupos, ...(permissoesDiretas || [])];
                res.json({ grupos, permissoes: todasPermissoes });
              }
            );
          }
        );
      } else {
        // Se não tem grupos, buscar apenas permissões diretas
        db.all(
          `SELECT 
            p.id,
            p.usuario_id,
            p.grupo_id,
            p.modulo,
            p.acao,
            p.permissao,
            NULL as grupo_nome
          FROM permissoes p
          WHERE p.usuario_id = ? AND p.grupo_id IS NULL
          ORDER BY p.modulo, p.acao`,
          [id],
          (err, permissoesDiretas) => {
            if (err) {
              return res.status(500).json({ error: err.message });
            }
            res.json({ grupos: [], permissoes: permissoesDiretas || [] });
          }
        );
      }
    }
  );
});

app.post('/api/usuarios', authenticateToken, (req, res) => {
  normalizarMaiusculas(req.body, ['nome', 'cargo']);
  const { nome, email, senha, cargo, role, ativo, pode_aprovar_descontos } = req.body;

  if (!nome || !email || !senha) {
    return res.status(400).json({ error: 'Nome, email e senha são obrigatórios' });
  }

  if (senha.length < 6) {
    return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres' });
  }

  const hashedPassword = bcrypt.hashSync(senha, 10);

  db.run(
    'INSERT INTO usuarios (nome, email, senha, cargo, role, ativo, pode_aprovar_descontos) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [nome, email, hashedPassword, cargo || '', role || 'usuario', ativo !== undefined ? ativo : 1, pode_aprovar_descontos !== undefined ? pode_aprovar_descontos : 0],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint')) {
          return res.status(400).json({ error: 'Email já cadastrado' });
        }
        return res.status(500).json({ error: err.message });
      }
      res.json({ id: this.lastID, nome, email, cargo, role: role || 'usuario', ativo: ativo !== undefined ? ativo : 1, pode_aprovar_descontos: pode_aprovar_descontos !== undefined ? pode_aprovar_descontos : 0 });
    }
  );
});

app.put('/api/usuarios/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  normalizarMaiusculas(req.body, ['nome', 'cargo']);
  const { nome, email, cargo, role, ativo, senha, pode_aprovar_descontos } = req.body;

  if (senha && senha.length < 6) {
    return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres' });
  }

  // Verificar se o email já existe em outro usuário
  db.get('SELECT id FROM usuarios WHERE email = ? AND id != ?', [email, id], (err, existingUser) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (existingUser) {
      return res.status(400).json({ error: 'Email já cadastrado para outro usuário' });
    }

    if (senha) {
      const hashedPassword = bcrypt.hashSync(senha, 10);
      db.run(
        'UPDATE usuarios SET nome = ?, email = ?, cargo = ?, role = ?, ativo = ?, pode_aprovar_descontos = ?, senha = ? WHERE id = ?',
        [nome, email, cargo, role, ativo, pode_aprovar_descontos !== undefined ? pode_aprovar_descontos : 0, hashedPassword, id],
        (err) => {
          if (err) {
            return res.status(500).json({ error: err.message });
          }
          res.json({ message: 'Usuário atualizado com sucesso' });
        }
      );
    } else {
      db.run(
        'UPDATE usuarios SET nome = ?, email = ?, cargo = ?, role = ?, ativo = ?, pode_aprovar_descontos = ? WHERE id = ?',
        [nome, email, cargo, role, ativo, pode_aprovar_descontos !== undefined ? pode_aprovar_descontos : 0, id],
        (err) => {
          if (err) {
            return res.status(500).json({ error: err.message });
          }
          res.json({ message: 'Usuário atualizado com sucesso' });
        }
      );
    }
  });
});

app.delete('/api/usuarios/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  // Verificar se é o usuário admin padrão ou administrator
  db.get('SELECT email, nome FROM usuarios WHERE id = ?', [id], (err, user) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    
    // Não permitir deletar o usuário admin padrão ou administrator
    if (user.email === 'admin@gmp.com.br' || user.nome.toLowerCase() === 'administrator' || user.nome.toLowerCase() === 'administrador') {
      return res.status(403).json({ error: 'Não é possível desativar o usuário administrador padrão' });
    }
    
    db.run('UPDATE usuarios SET ativo = 0 WHERE id = ?', [id], (err) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ message: 'Usuário desativado com sucesso' });
    });
  });
});

// ========== ROTAS DE CLIENTES ==========
app.get('/api/clientes', authenticateToken, (req, res) => {
  const { status, search } = req.query;
  let query = 'SELECT * FROM clientes WHERE 1=1';
  const params = [];

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  if (search) {
    query += ' AND (razao_social LIKE ? OR nome_fantasia LIKE ? OR cnpj LIKE ?)';
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }

  query += ' ORDER BY razao_social';

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows || []);
  });
});

// Rota para buscar logos dos clientes (otimizada para muitos registros)
app.get('/api/clientes/logos', authenticateToken, (req, res) => {
  const { page = 1, limit = 100, search } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const limitNum = parseInt(limit);
  
  let query = 'SELECT id, razao_social, nome_fantasia, logo_url FROM clientes WHERE logo_url IS NOT NULL AND logo_url != ""';
  const params = [];
  
  if (search) {
    query += ' AND (razao_social LIKE ? OR nome_fantasia LIKE ?)';
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm);
  }
  
  // Primeiro, contar total
  let countQuery = query.replace('SELECT id, razao_social, nome_fantasia, logo_url', 'SELECT COUNT(*) as total');
  
  db.get(countQuery, params, (err, countResult) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    const total = countResult?.total || 0;
    
    // Buscar logos com paginação
    query += ' ORDER BY razao_social LIMIT ? OFFSET ?';
    params.push(limitNum, offset);
    
    db.all(query, params, (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      res.json({
        logos: rows || [],
        pagination: {
          page: parseInt(page),
          limit: limitNum,
          total: total,
          totalPages: Math.ceil(total / limitNum)
        }
      });
    });
  });
});

app.get('/api/clientes/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  db.get('SELECT * FROM clientes WHERE id = ?', [id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }
    res.json(row);
  });
});

app.post('/api/clientes', authenticateToken, (req, res) => {
  var body = req.body || {};
  var razao_social = body.razao_social;
  if (!razao_social) {
    return res.status(400).json({ error: 'Razão social é obrigatória' });
  }
  db.run(
    `INSERT INTO clientes (razao_social, nome_fantasia, cnpj, segmento, telefone, email,
      endereco, cidade, estado, cep, contato_principal, observacoes, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      toUpper(razao_social),
      toUpper(body.nome_fantasia),
      body.cnpj,
      toUpper(body.segmento),
      body.telefone,
      body.email,
      toUpper(body.endereco),
      toUpper(body.cidade),
      toUpper(body.estado),
      body.cep,
      toUpper(body.contato_principal),
      toUpper(body.observacoes),
      body.status || 'ativo'
    ],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ id: this.lastID, ...req.body });
    }
  );
});

// ========== ROTAS DE FAMÍLIAS (resto: todas, :id, put, delete, foto) ==========
app.get('/api/familias/todas', authenticateToken, (req, res) => {
  db.all('SELECT * FROM familias_produto ORDER BY ordem ASC, nome ASC', [], function(err, rows) {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});
app.get('/api/familias/:id', authenticateToken, (req, res) => {
  var id = req.params.id;
  db.get('SELECT * FROM familias_produto WHERE id = ?', [id], function(err, row) {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Família não encontrada' });
    if (row.marcadores_vista && typeof row.marcadores_vista === 'string') {
      try { row.marcadores_vista = JSON.parse(row.marcadores_vista); } catch (_) {}
    }
    res.json(row);
  });
});
app.put('/api/familias/:id', authenticateToken, (req, res) => {
  var id = req.params.id;
  var body = req.body || {};
  var nome = (body.nome || '').trim();
  if (!nome) return res.status(400).json({ error: 'Nome da família é obrigatório' });
  var ordem = parseInt(body.ordem, 10) || 0;
  var grupoId = body.grupo_id != null ? parseInt(body.grupo_id, 10) : undefined;
  if (grupoId !== undefined && (grupoId === 0 || isNaN(grupoId))) grupoId = null;
  var marcadoresVista = body.marcadores_vista;
  var marcadoresStr = null;
  if (marcadoresVista !== undefined) {
    if (typeof marcadoresVista === 'string') marcadoresStr = marcadoresVista;
    else if (Array.isArray(marcadoresVista) || (marcadoresVista && typeof marcadoresVista === 'object'))
      marcadoresStr = JSON.stringify(marcadoresVista);
  }
  var sql = 'UPDATE familias_produto SET nome = ?, ordem = ?, updated_at = CURRENT_TIMESTAMP';
  var params = [nome, ordem];
  if (grupoId !== undefined) {
    sql += ', grupo_id = ?';
    params.push(grupoId);
  }
  if (marcadoresStr !== undefined) {
    sql += ', marcadores_vista = ?';
    params.push(marcadoresStr);
  }
  sql += ' WHERE id = ?';
  params.push(id);
  db.run(sql, params, function(err) {
    if (err) {
      if (err.message && err.message.indexOf('UNIQUE') !== -1) return res.status(400).json({ error: 'Já existe uma família com este nome' });
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) return res.status(404).json({ error: 'Família não encontrada' });
    db.get('SELECT * FROM familias_produto WHERE id = ?', [id], function(e, row) {
      if (e) return res.status(500).json({ error: e.message });
      if (row && row.marcadores_vista && typeof row.marcadores_vista === 'string') {
        try { row.marcadores_vista = JSON.parse(row.marcadores_vista); } catch (_) {}
      }
      res.json(row);
    });
  });
});
app.delete('/api/familias/:id', authenticateToken, (req, res) => {
  var id = req.params.id;
  db.run('UPDATE familias_produto SET ativo = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Família não encontrada' });
    res.json({ message: 'Família desativada' });
  });
});
app.post('/api/familias/:id/foto', authenticateToken, uploadFamilia.single('foto'), (req, res) => {
  var id = req.params.id;
  if (!req.file || !req.file.filename) return res.status(400).json({ error: 'Nenhuma imagem enviada' });
  var filename = req.file.filename;
  db.get('SELECT * FROM familias_produto WHERE id = ?', [id], function(err, familia) {
    if (err) return res.status(500).json({ error: err.message });
    if (!familia) return res.status(404).json({ error: 'Família não encontrada' });
    var oldFoto = familia.foto;
    db.run('UPDATE familias_produto SET foto = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [filename, id], function(updateErr) {
      if (updateErr) return res.status(500).json({ error: updateErr.message });
      if (oldFoto) {
        var oldPath = path.join(uploadsFamiliasDir, oldFoto);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      res.json({ foto: filename, url: '/api/uploads/familias-produtos/' + filename });
    });
  });
});

// Fallback: upload foto da família em base64 (JSON) quando multipart falha
app.post('/api/familias/:id/foto-base64', authenticateToken, (req, res) => {
  try {
    var id = req.params.id;
    var b64 = req.body && req.body.foto_base64;
    if (!b64 || typeof b64 !== 'string') return res.status(400).json({ error: 'Nenhuma imagem enviada' });
    var match = b64.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!match) return res.status(400).json({ error: 'Formato de imagem inválido. Use data:image/...;base64,...' });
    var ext = (match[1] === 'jpeg' || match[1] === 'jpg') ? '.jpg' : '.' + match[1];
    if (!/^(jpeg|jpg|png|gif|webp)$/i.test(match[1])) return res.status(400).json({ error: 'Apenas imagens JPEG, PNG, GIF, WEBP' });
    var base64Data = match[2].replace(/\s/g, '');
    var buf;
    try { buf = Buffer.from(base64Data, 'base64'); } catch (e) { return res.status(400).json({ error: 'Base64 inválido' }); }
    if (buf.length > 10 * 1024 * 1024) return res.status(400).json({ error: 'Imagem muito grande (máx. 10MB)' });
    if (!fs.existsSync(uploadsFamiliasDir)) fs.mkdirSync(uploadsFamiliasDir, { recursive: true });
    var filename = 'foto_' + id + '_' + Date.now() + ext;
    var filePath = path.join(uploadsFamiliasDir, filename);
    fs.writeFile(filePath, buf, function(err) {
      if (err) return res.status(500).json({ error: 'Erro ao salvar arquivo: ' + err.message });
      db.get('SELECT * FROM familias_produto WHERE id = ?', [id], function(err, familia) {
        if (err) return res.status(500).json({ error: err.message });
        if (!familia) return res.status(404).json({ error: 'Família não encontrada' });
        var oldFoto = familia.foto;
        db.run('UPDATE familias_produto SET foto = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [filename, id], function(updateErr) {
          if (updateErr) return res.status(500).json({ error: updateErr.message });
          if (oldFoto) {
            var oldPath = path.join(uploadsFamiliasDir, oldFoto);
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
          }
          res.json({ foto: filename, url: '/api/uploads/familias-produtos/' + filename });
        });
      });
    });
  } catch (e) {
    console.error('Erro foto-base64:', e);
    return res.status(500).json({ error: e.message || 'Erro ao processar foto' });
  }
});

const storageFamiliaEsquematico = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsFamiliasDir),
  filename: (req, file, cb) => {
    const familiaId = req.params.id || 'temp';
    const ext = path.extname(file.originalname) || '.png';
    cb(null, `esquematico_${familiaId}_${Date.now()}${ext}`);
  }
});
const uploadFamiliaEsquematico = multer({
  storage: storageFamiliaEsquematico,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const ok = allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype);
    cb(ok ? null : new Error('Apenas imagens (JPEG, PNG, GIF, WEBP)'));
  }
});

// GET esquemático: servir imagem da família (evita 404 quando algo solicita essa URL)
app.get('/api/familias/:id/esquematico', authenticateToken, (req, res) => {
  var id = req.params.id;
  db.get('SELECT esquematico FROM familias_produto WHERE id = ?', [id], function(err, row) {
    if (err) return res.status(500).json({ error: err.message });
    if (!row || !row.esquematico) return res.status(404).send();
    var filePath = path.join(uploadsFamiliasDir, row.esquematico);
    if (!fs.existsSync(filePath)) return res.status(404).send();
    res.sendFile(filePath, { maxAge: '1d' });
  });
});

app.post('/api/familias/:id/esquematico', authenticateToken, uploadFamiliaEsquematico.single('esquematico'), (req, res) => {
  var id = req.params.id;
  if (!req.file || !req.file.filename) return res.status(400).json({ error: 'Nenhuma imagem enviada' });
  var filename = req.file.filename;
  db.get('SELECT * FROM familias_produto WHERE id = ?', [id], function(err, familia) {
    if (err) return res.status(500).json({ error: err.message });
    if (!familia) return res.status(404).json({ error: 'Família não encontrada' });
    var oldEsq = familia.esquematico;
    db.run('UPDATE familias_produto SET esquematico = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [filename, id], function(updateErr) {
      if (updateErr) return res.status(500).json({ error: updateErr.message });
      if (oldEsq) {
        var oldPath = path.join(uploadsFamiliasDir, oldEsq);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      res.json({ esquematico: filename, url: '/api/uploads/familias-produtos/' + filename });
    });
  });
});

// Fallback: upload esquemático em base64 (JSON) quando multipart falha (ex.: proxy)
app.post('/api/familias/:id/esquematico-base64', authenticateToken, (req, res) => {
  try {
    var id = req.params.id;
    var b64 = req.body && req.body.esquematico_base64;
    if (!b64 || typeof b64 !== 'string') return res.status(400).json({ error: 'Nenhuma imagem enviada' });
    var match = b64.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!match) return res.status(400).json({ error: 'Formato de imagem inválido. Use data:image/...;base64,...' });
    var ext = (match[1] === 'jpeg' || match[1] === 'jpg') ? '.jpg' : '.' + match[1];
    if (!/^(jpeg|jpg|png|gif|webp)$/i.test(match[1])) return res.status(400).json({ error: 'Apenas imagens JPEG, PNG, GIF, WEBP' });
    var base64Data = match[2].replace(/\s/g, '');
    var buf;
    try {
      buf = Buffer.from(base64Data, 'base64');
    } catch (e) {
      return res.status(400).json({ error: 'Base64 inválido' });
    }
    if (buf.length > 10 * 1024 * 1024) return res.status(400).json({ error: 'Imagem muito grande (máx. 10MB)' });
    if (!fs.existsSync(uploadsFamiliasDir)) fs.mkdirSync(uploadsFamiliasDir, { recursive: true });
    var filename = 'esquematico_' + id + '_' + Date.now() + ext;
    var filePath = path.join(uploadsFamiliasDir, filename);
    fs.writeFile(filePath, buf, function(err) {
      if (err) return res.status(500).json({ error: 'Erro ao salvar arquivo: ' + err.message });
      db.get('SELECT * FROM familias_produto WHERE id = ?', [id], function(err, familia) {
        if (err) return res.status(500).json({ error: err.message });
        if (!familia) return res.status(404).json({ error: 'Família não encontrada' });
        var oldEsq = familia.esquematico;
        db.run('UPDATE familias_produto SET esquematico = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [filename, id], function(updateErr) {
          if (updateErr) return res.status(500).json({ error: updateErr.message });
          if (oldEsq) {
            var oldPath = path.join(uploadsFamiliasDir, oldEsq);
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
          }
          res.json({ esquematico: filename, url: '/api/uploads/familias-produtos/' + filename });
        });
      });
    });
  } catch (e) {
    console.error('Erro esquematico-base64:', e);
    return res.status(500).json({ error: e.message || 'Erro ao processar esquemático' });
  }
});

// ========== VARIÁVEIS POR FAMÍLIA (quais variáveis esta família usa – independente de marcadores/bolinhas) ==========
// GET: listar variáveis atribuídas a uma família (com dados da variável técnica)
app.get('/api/familias/:familiaId/variaveis', authenticateToken, (req, res) => {
  var familiaId = req.params.familiaId;
  db.all(
    `SELECT fv.variavel_chave AS chave, fv.ordem, vt.nome, vt.categoria, vt.tipo, vt.opcoes, vt.sufixo, vt.fonte_opcoes, vt.grupo_compras_id
     FROM familia_variaveis fv
     LEFT JOIN variaveis_tecnicas vt ON vt.chave = fv.variavel_chave AND vt.ativo = 1
     WHERE fv.familia_id = ? AND fv.ativo = 1
     ORDER BY fv.ordem, fv.variavel_chave`,
    [familiaId],
    function(err, rows) {
      if (err) return res.status(500).json({ error: err.message });
      var list = (rows || []).map(function(r) {
        var opcoes = r.opcoes;
        if (opcoes && typeof opcoes === 'string') { try { opcoes = JSON.parse(opcoes); } catch (_) {} }
        return {
          chave: r.chave,
          ordem: r.ordem != null ? r.ordem : 0,
          nome: r.nome || r.chave,
          categoria: r.categoria,
          tipo: r.tipo || 'texto',
          opcoes: opcoes,
          sufixo: (r.sufixo || '').trim() || null,
          fonte_opcoes: (r.fonte_opcoes || '').trim() || null,
          grupo_compras_id: r.grupo_compras_id != null ? r.grupo_compras_id : null
        };
      });
      res.json(list);
    }
  );
});

// PUT: definir lista de variáveis da família (substitui a lista atual). Body: { variaveis: [ { chave, ordem? }, ... ] }
app.put('/api/familias/:familiaId/variaveis', authenticateToken, (req, res) => {
  var familiaId = req.params.familiaId;
  var body = req.body || {};
  var variaveis = Array.isArray(body.variaveis) ? body.variaveis : [];
  db.get('SELECT id FROM familias_produto WHERE id = ?', [familiaId], function(err, fam) {
    if (err) return res.status(500).json({ error: err.message });
    if (!fam) return res.status(404).json({ error: 'Família não encontrada' });
    db.run('UPDATE familia_variaveis SET ativo = 0 WHERE familia_id = ?', [familiaId], function(upErr) {
      if (upErr) return res.status(500).json({ error: upErr.message });
      var insertMany = function(idx) {
        if (idx >= variaveis.length) {
          return db.all(
            'SELECT variavel_chave AS chave, ordem FROM familia_variaveis WHERE familia_id = ? AND ativo = 1 ORDER BY ordem, variavel_chave',
            [familiaId],
            function(selErr, rows) {
              if (selErr) return res.status(500).json({ error: selErr.message });
              res.json({ message: 'Variáveis da família atualizadas', variaveis: rows || [] });
            }
          );
        }
        var v = variaveis[idx];
        var chave = (v.chave || v.variavel_chave || '').trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
        if (!chave) return insertMany(idx + 1);
        var ordem = parseInt(v.ordem, 10);
        if (isNaN(ordem)) ordem = idx;
        db.run(
          'INSERT OR REPLACE INTO familia_variaveis (familia_id, variavel_chave, ordem, ativo) VALUES (?, ?, ?, 1)',
          [familiaId, chave, ordem],
          function(insErr) {
            if (insErr) return res.status(500).json({ error: insErr.message });
            insertMany(idx + 1);
          }
        );
      };
      insertMany(0);
    });
  });
});

// ========== OPÇÕES DE CONFIGURAÇÃO POR FAMÍLIA (valores disponíveis por marcador técnico, por família) ==========
// GET: listar todas as opções de uma família, agrupadas por variável (para os marcadores dessa família)
app.get('/api/familias/:familiaId/opcoes-variaveis', authenticateToken, (req, res) => {
  var familiaId = req.params.familiaId;
  db.all(
    'SELECT id, familia_id, variavel_chave, valor, ordem FROM familia_variavel_opcoes WHERE familia_id = ? AND ativo = 1 ORDER BY variavel_chave, ordem, valor',
    [familiaId],
    function(err, rows) {
      if (err) return res.status(500).json({ error: err.message });
      var byVar = {};
      (rows || []).forEach(function(r) {
        var chave = (r.variavel_chave != null ? String(r.variavel_chave) : '').trim();
        if (!chave) return;
        if (!byVar[chave]) byVar[chave] = [];
        byVar[chave].push({ id: r.id, valor: r.valor != null ? r.valor : '', ordem: r.ordem });
      });
      res.json(byVar);
    }
  );
});

// GET: opções por variável vindas dos PRODUTOS cadastrados (valores distintos em especificacoes_tecnicas da família)
app.get('/api/familias/:familiaId/opcoes-variaveis-from-produtos', authenticateToken, (req, res) => {
  var familiaId = req.params.familiaId;
  db.get('SELECT id, nome, marcadores_vista FROM familias_produto WHERE id = ?', [familiaId], function(err, familia) {
    if (err) return res.status(500).json({ error: err.message });
    if (!familia) return res.status(404).json({ error: 'Família não encontrada' });
    var familiaNome = (familia.nome || '').trim();
    if (!familiaNome) return res.json({});
    var raw = familia.marcadores_vista;
    var marcs = [];
    try {
      if (typeof raw === 'string') raw = JSON.parse(raw);
      if (Array.isArray(raw)) marcs = raw;
      else if (raw && raw.marcadores && Array.isArray(raw.marcadores)) marcs = raw.marcadores;
    } catch (e) {}
    var chaves = [];
    marcs.forEach(function(m) {
      var chave = (m.variavel || m.key || '').trim();
      if (chave && chaves.indexOf(chave) === -1) chaves.push(chave);
    });
    db.all(
      'SELECT id, familia, especificacoes_tecnicas FROM produtos WHERE ativo = 1 AND TRIM(UPPER(COALESCE(familia,\'\'))) = TRIM(UPPER(?))',
      [familiaNome],
      function(err2, rows) {
        if (err2) return res.status(500).json({ error: err2.message });
        var byVar = {};
        chaves.forEach(function(chave) { byVar[chave] = {}; });
        (rows || []).forEach(function(r) {
          var spec = {};
          try {
            if (r.especificacoes_tecnicas) spec = typeof r.especificacoes_tecnicas === 'string' ? JSON.parse(r.especificacoes_tecnicas) : r.especificacoes_tecnicas;
          } catch (e) {}
          chaves.forEach(function(chave) {
            var val = spec[chave];
            if (val != null && String(val).trim() !== '') {
              var v = String(val).trim();
              if (!byVar[chave][v]) byVar[chave][v] = true;
            }
          });
        });
        var out = {};
        chaves.forEach(function(chave) {
          var vals = Object.keys(byVar[chave] || {}).sort();
          out[chave] = vals.map(function(v, i) { return { id: 'prod-' + chave + '-' + i, valor: v }; });
        });
        res.json(out);
      }
    );
  });
});

// GET: opções de uma variável para uma família (para preencher dropdown ao clicar no marcador)
app.get('/api/familias/:familiaId/variaveis/:variavelChave/opcoes', authenticateToken, (req, res) => {
  var familiaId = req.params.familiaId;
  var variavelChave = req.params.variavelChave;
  db.all(
    'SELECT id, valor, ordem FROM familia_variavel_opcoes WHERE familia_id = ? AND variavel_chave = ? AND ativo = 1 ORDER BY ordem, valor',
    [familiaId, variavelChave],
    function(err, rows) {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    }
  );
});

// POST: adicionar opção (valor) para família + variável
app.post('/api/familias/:familiaId/variaveis/:variavelChave/opcoes', authenticateToken, (req, res) => {
  var familiaId = req.params.familiaId;
  var variavelChave = req.params.variavelChave;
  var valor = (req.body && req.body.valor) ? String(req.body.valor).trim() : '';
  if (!valor) return res.status(400).json({ error: 'Valor da opção é obrigatório' });
  var ordem = parseInt(req.body && req.body.ordem, 10) || 0;
  db.run(
    'INSERT INTO familia_variavel_opcoes (familia_id, variavel_chave, valor, ordem, ativo) VALUES (?, ?, ?, ?, 1)',
    [familiaId, variavelChave, valor, ordem],
    function(err) {
      if (err) {
        if (err.message && err.message.indexOf('UNIQUE') !== -1) return res.status(400).json({ error: 'Esta opção já existe para esta família e variável' });
        return res.status(500).json({ error: err.message });
      }
      db.get('SELECT * FROM familia_variavel_opcoes WHERE id = ?', [this.lastID], function(e, row) {
        if (e) return res.status(500).json({ error: e.message });
        res.status(201).json(row);
      });
    }
  );
});

// PUT: atualizar opção
app.put('/api/familias/:familiaId/variaveis/:variavelChave/opcoes/:id', authenticateToken, (req, res) => {
  var id = req.params.id;
  var valor = (req.body && req.body.valor) != null ? String(req.body.valor).trim() : null;
  var ordem = req.body && req.body.ordem !== undefined ? parseInt(req.body.ordem, 10) : null;
  var updates = [];
  var params = [];
  if (valor !== null) { updates.push('valor = ?'); params.push(valor); }
  if (ordem !== null) { updates.push('ordem = ?'); params.push(ordem); }
  if (updates.length === 0) return res.status(400).json({ error: 'Nenhum campo para atualizar' });
  params.push(id);
  db.run('UPDATE familia_variavel_opcoes SET ' + updates.join(', ') + ' WHERE id = ?', params, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Opção não encontrada' });
    db.get('SELECT * FROM familia_variavel_opcoes WHERE id = ?', [id], function(e, row) {
      if (e) return res.status(500).json({ error: e.message });
      res.json(row);
    });
  });
});

// DELETE: remover opção
app.delete('/api/familias/:familiaId/variaveis/:variavelChave/opcoes/:id', authenticateToken, (req, res) => {
  var id = req.params.id;
  db.run('UPDATE familia_variavel_opcoes SET ativo = 0 WHERE id = ?', [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Opção não encontrada' });
    res.json({ message: 'Opção removida' });
  });
});

// ========== VERIFICAR EQUIPAMENTO EXISTENTE (por família + especificações) ==========
// POST body: { familia: string (nome), especificacoes: { variavel_chave: valor, ... } }
// Retorna: { existente: boolean, produtos: [...] } — produtos com mesma família e specs compatíveis
app.post('/api/produtos/verificar-existente', authenticateToken, (req, res) => {
  var body = req.body || {};
  var familiaNome = (body.familia || '').trim();
  var especificacoes = body.especificacoes && typeof body.especificacoes === 'object' ? body.especificacoes : {};
  if (!familiaNome) return res.status(400).json({ error: 'familia é obrigatório' });
  db.all(
    'SELECT id, codigo, nome, familia, especificacoes_tecnicas, preco_base FROM produtos WHERE ativo = 1 AND (TRIM(UPPER(COALESCE(familia,\'\'))) = TRIM(UPPER(?)))',
    [familiaNome],
    function(err, rows) {
      if (err) return res.status(500).json({ error: err.message });
      var matches = [];
      (rows || []).forEach(function(r) {
        var spec = {};
        try {
          if (r.especificacoes_tecnicas) spec = typeof r.especificacoes_tecnicas === 'string' ? JSON.parse(r.especificacoes_tecnicas) : r.especificacoes_tecnicas;
        } catch (_) {}
        var allMatch = true;
        for (var k in especificacoes) {
          if (especificacoes.hasOwnProperty(k)) {
            var want = String(especificacoes[k] || '').trim();
            var have = spec[k] != null ? String(spec[k]).trim() : '';
            if (want !== have) { allMatch = false; break; }
          }
        }
        if (allMatch) matches.push({ id: r.id, codigo: r.codigo, nome: r.nome, familia: r.familia, preco_base: r.preco_base });
      });
      res.json({ existente: matches.length > 0, produtos: matches });
    }
  );
});

// ========== VARIÁVEIS TÉCNICAS (cadastro para marcadores vista frontal / 90+ variáveis) ==========
app.get('/api/variaveis-tecnicas', authenticateToken, (req, res) => {
  var search = (req.query.search || '').trim();
  var categoria = (req.query.categoria || '').trim();
  var ativo = req.query.ativo;
  var sql = 'SELECT * FROM variaveis_tecnicas WHERE 1=1';
  var params = [];
  if (ativo !== undefined) {
    sql += ' AND ativo = ?';
    params.push(ativo === 'true' || ativo === '1' ? 1 : 0);
  } else {
    sql += ' AND ativo = 1';
  }
  if (categoria) {
    sql += ' AND categoria = ?';
    params.push(categoria);
  }
  if (search) {
    sql += ' AND (nome LIKE ? OR chave LIKE ?)';
    var term = '%' + search + '%';
    params.push(term, term);
  }
  sql += ' ORDER BY categoria ASC, ordem ASC, nome ASC';
  db.all(sql, params, function(err, rows) {
    if (err) return res.status(500).json({ error: err.message });
    var list = (rows || []).map(function(r) {
      if (r.opcoes && typeof r.opcoes === 'string') {
        try { r.opcoes = JSON.parse(r.opcoes); } catch (_) { r.opcoes = []; }
      }
      return r;
    });
    res.json(list);
  });
});

app.get('/api/variaveis-tecnicas/categorias', authenticateToken, (req, res) => {
  db.all('SELECT DISTINCT categoria AS nome FROM variaveis_tecnicas WHERE ativo = 1 AND categoria IS NOT NULL AND TRIM(categoria) != \'\' ORDER BY categoria', [], function(err, rows) {
    if (err) return res.status(500).json({ error: err.message });
    res.json((rows || []).map(function(r) { return r.nome; }));
  });
});

// Opções de uma variável: lista manual ou fornecedores do grupo homologado (para dropdown no cadastro de produtos)
// Para lista_condicional, use ?escolha=ValorDaPrimeiraEscolha para obter as opções da segunda lista (manual ou grupo de fornecedores)
app.get('/api/variaveis-tecnicas/opcoes/:chave', authenticateToken, (req, res) => {
  var chave = (req.params.chave || '').trim();
  var escolha = (req.query.escolha != null && req.query.escolha !== '') ? String(req.query.escolha).trim() : null;
  if (!chave) return res.status(400).json({ error: 'Chave da variável é obrigatória' });
  db.get('SELECT tipo, fonte_opcoes, grupo_compras_id, opcoes FROM variaveis_tecnicas WHERE chave = ? AND ativo = 1', [chave], function(err, row) {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Variável não encontrada' });
    if (row.tipo === 'lista_condicional' && escolha != null) {
      var opcoesRaw = row.opcoes;
      if (typeof opcoesRaw === 'string') { try { opcoesRaw = JSON.parse(opcoesRaw); } catch (_) { opcoesRaw = {}; } }
      var porEscolha = (opcoesRaw && opcoesRaw.porEscolha && typeof opcoesRaw.porEscolha === 'object') ? opcoesRaw.porEscolha : {};
      var valorEscolha = porEscolha[escolha];
      if (valorEscolha != null && typeof valorEscolha === 'object' && !Array.isArray(valorEscolha) && valorEscolha.tipo === 'fornecedores_grupo' && valorEscolha.grupo_compras_id) {
        var gid = parseInt(valorEscolha.grupo_compras_id, 10);
        if (gid) {
          db.all('SELECT id, COALESCE(NULLIF(TRIM(nome_fantasia), \'\'), razao_social) AS valor FROM fornecedores WHERE grupo_id = ? AND status = ? ORDER BY razao_social', [gid, 'ativo'], function(e, rows) {
            if (e) return res.status(500).json({ error: e.message });
            return res.json({ opcoes: (rows || []).map(function(r) { return { id: r.id, valor: r.valor || String(r.id) }; }) });
          });
          return;
        }
      }
      if (Array.isArray(valorEscolha)) {
        return res.json({ opcoes: valorEscolha.map(function(val, i) { return { id: 'opt-' + i, valor: typeof val === 'string' ? val : (val && val.valor != null ? String(val.valor) : '') }; }) });
      }
      return res.json({ opcoes: [] });
    }
    if (row.fonte_opcoes === 'fornecedores_grupo' && row.grupo_compras_id) {
      db.all('SELECT id, COALESCE(NULLIF(TRIM(nome_fantasia), \'\'), razao_social) AS valor FROM fornecedores WHERE grupo_id = ? AND status = ? ORDER BY razao_social', [row.grupo_compras_id, 'ativo'], function(e, rows) {
        if (e) return res.status(500).json({ error: e.message });
        res.json({ opcoes: (rows || []).map(function(r) { return { id: r.id, valor: r.valor || String(r.id) }; }) });
      });
    } else {
      var opcoes = row.opcoes;
      if (typeof opcoes === 'string') { try { opcoes = JSON.parse(opcoes); } catch (_) { opcoes = []; } }
      if (!Array.isArray(opcoes)) opcoes = [];
      res.json({ opcoes: opcoes.map(function(val, i) { return { id: 'opt-' + i, valor: typeof val === 'string' ? val : (val && val.valor != null ? String(val.valor) : '') }; }) });
    }
  });
});

app.get('/api/variaveis-tecnicas/:id', authenticateToken, (req, res) => {
  var id = req.params.id;
  db.get('SELECT * FROM variaveis_tecnicas WHERE id = ?', [id], function(err, row) {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Variável não encontrada' });
    if (row.opcoes && typeof row.opcoes === 'string') {
      try { row.opcoes = JSON.parse(row.opcoes); } catch (_) { row.opcoes = []; }
    }
    res.json(row);
  });
});

app.post('/api/variaveis-tecnicas', authenticateToken, (req, res) => {
  var body = req.body || {};
  var nome = (body.nome || '').trim();
  var chave = (body.chave || '').trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
  if (!chave) chave = nome.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') || ('var_' + Date.now());
  var categoria = (body.categoria || '').trim() || null;
  var tipo = (body.tipo || 'texto');
  if (!['texto', 'numero', 'lista', 'lista_condicional', 'soma'].includes(tipo)) tipo = 'texto';
  var opcoes = body.opcoes;
  var opcoesStr = null;
  if ((tipo === 'lista_condicional' || tipo === 'soma') && typeof opcoes === 'object' && opcoes !== null && !Array.isArray(opcoes)) {
    opcoesStr = JSON.stringify(opcoes);
  } else if (Array.isArray(opcoes)) {
    opcoesStr = JSON.stringify(opcoes);
  } else if (typeof opcoes === 'string') {
    opcoesStr = opcoes;
  }
  var ordem = parseInt(body.ordem, 10) || 0;
  var sufixo = (body.sufixo || '').trim() || null;
  var fonte_opcoes = (body.fonte_opcoes || '').trim() || null;
  if (fonte_opcoes && fonte_opcoes !== 'manual' && fonte_opcoes !== 'fornecedores_grupo') fonte_opcoes = null;
  var grupo_compras_id = body.grupo_compras_id != null ? (parseInt(body.grupo_compras_id, 10) || null) : null;
  db.run('INSERT INTO variaveis_tecnicas (nome, chave, categoria, tipo, opcoes, ordem, sufixo, fonte_opcoes, grupo_compras_id, ativo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)',
    [nome, chave, categoria, tipo, opcoesStr, ordem, sufixo, fonte_opcoes, grupo_compras_id],
    function(err) {
      if (err) {
        if (err.message && err.message.indexOf('UNIQUE') !== -1) return res.status(400).json({ error: 'Já existe uma variável com esta chave' });
        return res.status(500).json({ error: err.message });
      }
      var id = this.lastID;
      db.get('SELECT * FROM variaveis_tecnicas WHERE id = ?', [id], function(e, row) {
        if (e) return res.status(500).json({ error: e.message });
        if (row && row.opcoes && typeof row.opcoes === 'string') {
          try { row.opcoes = JSON.parse(row.opcoes); } catch (_) {}
        }
        res.status(201).json(row);
      });
    });
});

app.put('/api/variaveis-tecnicas/:id', authenticateToken, (req, res) => {
  var id = req.params.id;
  var body = req.body || {};
  var nome = (body.nome || '').trim();
  var chave = (body.chave || '').trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
  if (!chave) return res.status(400).json({ error: 'Chave é obrigatória' });
  var categoria = (body.categoria || '').trim() || null;
  var tipo = (body.tipo || 'texto');
  if (!['texto', 'numero', 'lista', 'lista_condicional', 'soma'].includes(tipo)) tipo = 'texto';
  var opcoes = body.opcoes;
  var opcoesStr = null;
  if ((tipo === 'lista_condicional' || tipo === 'soma') && typeof opcoes === 'object' && opcoes !== null && !Array.isArray(opcoes)) {
    opcoesStr = JSON.stringify(opcoes);
  } else if (Array.isArray(opcoes)) {
    opcoesStr = JSON.stringify(opcoes);
  } else if (typeof opcoes === 'string') {
    opcoesStr = opcoes;
  }
  var ordem = parseInt(body.ordem, 10) || 0;
  var sufixo = (body.sufixo || '').trim() || null;
  var fonte_opcoes = (body.fonte_opcoes || '').trim() || null;
  if (fonte_opcoes && fonte_opcoes !== 'manual' && fonte_opcoes !== 'fornecedores_grupo') fonte_opcoes = null;
  var grupo_compras_id = body.grupo_compras_id != null ? (parseInt(body.grupo_compras_id, 10) || null) : null;
  db.run('UPDATE variaveis_tecnicas SET nome = ?, chave = ?, categoria = ?, tipo = ?, opcoes = ?, ordem = ?, sufixo = ?, fonte_opcoes = ?, grupo_compras_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [nome, chave, categoria, tipo, opcoesStr, ordem, sufixo, fonte_opcoes, grupo_compras_id, id],
    function(err) {
      if (err) {
        if (err.message && err.message.indexOf('UNIQUE') !== -1) return res.status(400).json({ error: 'Já existe outra variável com esta chave' });
        return res.status(500).json({ error: err.message });
      }
      if (this.changes === 0) return res.status(404).json({ error: 'Variável não encontrada' });
      db.get('SELECT * FROM variaveis_tecnicas WHERE id = ?', [id], function(e, row) {
        if (e) return res.status(500).json({ error: e.message });
        if (row && row.opcoes && typeof row.opcoes === 'string') {
          try { row.opcoes = JSON.parse(row.opcoes); } catch (_) {}
        }
        res.json(row);
      });
    });
});

app.delete('/api/variaveis-tecnicas/:id', authenticateToken, (req, res) => {
  var id = req.params.id;
  db.run('UPDATE variaveis_tecnicas SET ativo = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Variável não encontrada' });
    res.json({ message: 'Variável desativada' });
  });
});

app.put('/api/clientes/:id', authenticateToken, (req, res) => {
  var id = req.params.id;
  var body = req.body || {};
  db.run(
    `UPDATE clientes SET razao_social = ?, nome_fantasia = ?, cnpj = ?, segmento = ?,
      telefone = ?, email = ?, endereco = ?, cidade = ?, estado = ?, cep = ?,
      contato_principal = ?, observacoes = ?, status = ?, logo_url = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      toUpper(body.razao_social),
      toUpper(body.nome_fantasia),
      body.cnpj,
      toUpper(body.segmento),
      body.telefone,
      body.email,
      toUpper(body.endereco),
      toUpper(body.cidade),
      toUpper(body.estado),
      body.cep,
      toUpper(body.contato_principal),
      toUpper(body.observacoes),
      body.status,
      body.logo_url || null,
      id
    ],
    (err) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ message: 'Cliente atualizado com sucesso' });
    }
  );
});

// Rota para upload de logo de cliente
app.post('/api/clientes/:id/logo', authenticateToken, uploadClienteLogo.single('logo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  }

  const clienteId = req.params.id;
  const logoUrl = `/api/uploads/logos/${req.file.filename}`;

  // Deletar logo antigo se existir
  db.get('SELECT logo_url FROM clientes WHERE id = ?', [clienteId], (err, cliente) => {
    if (cliente && cliente.logo_url) {
      const oldLogoPath = path.join(uploadsLogosDir, cliente.logo_url);
      if (fs.existsSync(oldLogoPath)) {
        fs.unlinkSync(oldLogoPath);
      }
    }

    // Atualizar logo_url do cliente
    db.run(
      'UPDATE clientes SET logo_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [req.file.filename, clienteId],
      function(err) {
        if (err) {
          console.error('Erro ao atualizar logo do cliente:', err);
          // Deletar arquivo se houver erro
          fs.unlink(req.file.path, () => {});
          return res.status(500).json({ error: 'Erro ao salvar logo do cliente: ' + err.message });
        }

        res.json({
          message: 'Logo do cliente salvo com sucesso',
          logo_url: req.file.filename,
          url: logoUrl
        });
      }
    );
  });
});

app.delete('/api/clientes/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  db.run('UPDATE clientes SET status = ? WHERE id = ?', ['inativo', id], (err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ message: 'Cliente desativado com sucesso' });
  });
});

// ========== ROTAS DE PROJETOS ==========
app.get('/api/projetos', authenticateToken, (req, res) => {
  const { cliente_id, status, responsavel_id } = req.query;
  let query = `SELECT p.*, c.razao_social as cliente_nome, u.nome as responsavel_nome
               FROM projetos p
               LEFT JOIN clientes c ON p.cliente_id = c.id
               LEFT JOIN usuarios u ON p.responsavel_id = u.id
               WHERE 1=1`;
  const params = [];

  if (cliente_id) {
    query += ' AND p.cliente_id = ?';
    params.push(cliente_id);
  }

  if (status) {
    query += ' AND p.status = ?';
    params.push(status);
  }

  if (responsavel_id) {
    query += ' AND p.responsavel_id = ?';
    params.push(responsavel_id);
  }

  query += ' ORDER BY p.created_at DESC';

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows || []);
  });
});

app.get('/api/projetos/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  db.get('SELECT * FROM projetos WHERE id = ?', [id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: 'Projeto não encontrado' });
    }
    res.json(row);
  });
});

app.post('/api/projetos', authenticateToken, (req, res) => {
  normalizarMaiusculas(req.body, ['nome', 'descricao']);
  const { cliente_id, nome, descricao, status, responsavel_id } = req.body;

  if (!nome) {
    return res.status(400).json({ error: 'Nome do projeto é obrigatório' });
  }

  db.run(
    'INSERT INTO projetos (cliente_id, nome, descricao, status, responsavel_id, created_by) VALUES (?, ?, ?, ?, ?, ?)',
    [cliente_id, nome, descricao, status || 'ativo', responsavel_id, req.user.id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ id: this.lastID, ...req.body });
    }
  );
});

app.put('/api/projetos/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  normalizarMaiusculas(req.body, ['nome', 'descricao']);
  const { cliente_id, nome, descricao, status, responsavel_id } = req.body;

  db.run(
    'UPDATE projetos SET cliente_id = ?, nome = ?, descricao = ?, status = ?, responsavel_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [cliente_id, nome, descricao, status, responsavel_id, id],
    (err) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ message: 'Projeto atualizado com sucesso' });
    }
  );
});

app.delete('/api/projetos/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  db.run('UPDATE projetos SET status = ? WHERE id = ?', ['inativo', id], (err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ message: 'Projeto desativado com sucesso' });
  });
});

// ========== ROTAS DE PROPOSTAS ==========
app.get('/api/propostas', authenticateToken, (req, res) => {
  const { cliente_id, status, created_by, responsavel_id, oportunidade_id, tipo_proposta, search } = req.query;
  let query = `SELECT pr.*, c.razao_social as cliente_nome, c.nome_fantasia as cliente_nome_fantasia,
               u1.nome as created_by_nome, u2.nome as responsavel_nome
               FROM propostas pr
               LEFT JOIN clientes c ON pr.cliente_id = c.id
               LEFT JOIN usuarios u1 ON pr.created_by = u1.id
               LEFT JOIN usuarios u2 ON pr.responsavel_id = u2.id
               WHERE 1=1`;
  const params = [];

  if (cliente_id) {
    query += ' AND pr.cliente_id = ?';
    params.push(cliente_id);
  }

  if (status) {
    query += ' AND pr.status = ?';
    params.push(status);
  }

  if (oportunidade_id) {
    query += ' AND pr.oportunidade_id = ?';
    params.push(oportunidade_id);
  }

  if (tipo_proposta) {
    query += ' AND pr.tipo_proposta = ?';
    params.push(tipo_proposta);
  }

  if (created_by) {
    query += ' AND pr.created_by = ?';
    params.push(created_by);
  }

  if (responsavel_id && responsavel_id !== '') {
    query += ' AND (pr.responsavel_id = ? OR pr.created_by = ?)';
    params.push(responsavel_id, responsavel_id);
  }

  const searchTrim = typeof search === 'string' ? search.trim() : '';
  if (searchTrim) {
    const searchTerm = `%${searchTrim}%`;
    query += ` AND (
      LOWER(COALESCE(pr.numero_proposta, "")) LIKE LOWER(?) OR
      LOWER(COALESCE(pr.titulo, "")) LIKE LOWER(?) OR
      LOWER(COALESCE(c.razao_social, "")) LIKE LOWER(?) OR
      LOWER(COALESCE(c.nome_fantasia, "")) LIKE LOWER(?)
    )`;
    params.push(searchTerm, searchTerm, searchTerm, searchTerm);
  }

  query += ' ORDER BY pr.created_at DESC';

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows || []);
  });
});

app.get('/api/propostas/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  db.get(
    `SELECT pr.*, c.razao_social as cliente_nome, c.nome_fantasia as cliente_nome_fantasia
     FROM propostas pr
     LEFT JOIN clientes c ON pr.cliente_id = c.id
     WHERE pr.id = ?`,
    [id],
    (err, proposta) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!proposta) {
      return res.status(404).json({ error: 'Proposta não encontrada' });
    }

    // Buscar itens da proposta com produtos e especificações técnicas
    db.all(`
      SELECT pi.*, 
             pr.nome as produto_nome,
             pr.especificacoes_tecnicas,
             pr.descricao as produto_descricao
      FROM proposta_itens pi
      LEFT JOIN produtos pr ON pi.codigo_produto = pr.codigo
      WHERE pi.proposta_id = ?
      ORDER BY pi.id
    `, [id], (err, itens) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ ...proposta, itens: itens || [] });
    });
  });
});

// Endpoint para gerar número da proposta (sem salvar)
app.get('/api/propostas/gerar-numero/:cliente_id', authenticateToken, (req, res) => {
  const { cliente_id } = req.params;
  const responsavel_id = req.query.responsavel_id || req.user.id;
  const revisao = parseInt(req.query.revisao) || 0;
  
  gerarNumeroProposta(cliente_id, responsavel_id, revisao, (err, numeroProposta) => {
    if (err) {
      return res.status(500).json({ error: 'Erro ao gerar número da proposta: ' + err.message });
    }
    if (!numeroProposta) {
      return res.status(400).json({ error: 'Cliente não encontrado' });
    }
    res.json({ numero_proposta: numeroProposta });
  });
});

// Endpoint para buscar histórico de revisões de uma proposta
app.get('/api/propostas/:id/revisoes', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  db.all(
    `SELECT pr.*, u.nome as revisado_por_nome
     FROM proposta_revisoes pr
     LEFT JOIN usuarios u ON pr.revisado_por = u.id
     WHERE pr.proposta_id = ?
     ORDER BY pr.revisao DESC, pr.created_at DESC`,
    [id],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      // Parsear JSON dos campos
      const revisoes = rows.map(row => ({
        ...row,
        mudancas: row.mudancas ? JSON.parse(row.mudancas) : [],
        dados_anteriores: row.dados_anteriores ? JSON.parse(row.dados_anteriores) : {},
        dados_novos: row.dados_novos ? JSON.parse(row.dados_novos) : {}
      }));
      
      res.json(revisoes);
    }
  );
});

// ========== ROTAS DE FOLLOW-UPS DE PROPOSTAS ==========
// Função auxiliar para converter data do SQLite para timezone do Brasil
function converterDataParaBrasil(dataString) {
  if (!dataString) return dataString;
  
  // SQLite retorna no formato YYYY-MM-DD HH:MM:SS (sem timezone)
  // Assumimos que está em UTC e convertemos para America/Sao_Paulo
  try {
    // Adicionar 'Z' para indicar UTC se não tiver timezone
    let dateStr = dataString;
    if (!dateStr.includes('Z') && !dateStr.includes('+') && !dateStr.includes('-', 10)) {
      dateStr = dateStr.replace(' ', 'T') + 'Z';
    } else if (dateStr.includes(' ') && !dateStr.includes('T')) {
      dateStr = dateStr.replace(' ', 'T');
    }
    
    const date = new Date(dateStr);
    
    // Converter para o timezone do Brasil
    return date.toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  } catch (error) {
    console.error('Erro ao converter data:', error);
    return dataString;
  }
}

// Listar follow-ups de uma proposta
app.get('/api/propostas/:id/followups', authenticateToken, (req, res) => {
  if (!db) {
    console.error('❌ Banco de dados não está disponível');
    return res.status(500).json({ error: 'Banco de dados não está disponível' });
  }

  const { id } = req.params;
  
  console.log(`📋 Buscando follow-ups para proposta ${id}`);
  
  // Garantir que a tabela existe
  db.run(
    `CREATE TABLE IF NOT EXISTS proposta_followups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proposta_id INTEGER NOT NULL,
      comentario TEXT NOT NULL,
      criado_por INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (proposta_id) REFERENCES propostas(id) ON DELETE CASCADE,
      FOREIGN KEY (criado_por) REFERENCES usuarios(id)
    )`,
    (err) => {
      if (err && !err.message.includes('already exists')) {
        console.error('❌ Erro ao criar tabela proposta_followups:', err);
      }
      
      db.all(
        `SELECT pf.*, u.nome as criado_por_nome, u.cargo as criado_por_cargo
         FROM proposta_followups pf
         LEFT JOIN usuarios u ON pf.criado_por = u.id
         WHERE pf.proposta_id = ?
         ORDER BY pf.created_at DESC`,
        [id],
        (err, rows) => {
          if (err) {
            console.error('❌ Erro ao buscar follow-ups:', err);
            return res.status(500).json({ error: err.message });
          }
          console.log(`✅ Encontrados ${rows?.length || 0} follow-ups`);
          
          // Converter datas para o timezone do Brasil
          const rowsComDataCorrigida = (rows || []).map(row => ({
            ...row,
            created_at: converterDataParaBrasil(row.created_at)
          }));
          
          res.json(rowsComDataCorrigida);
        }
      );
    }
  );
});

// Adicionar follow-up a uma proposta
app.post('/api/propostas/:id/followups', authenticateToken, (req, res) => {
  if (!db) {
    console.error('❌ Banco de dados não está disponível');
    return res.status(500).json({ error: 'Banco de dados não está disponível' });
  }

  const { id } = req.params;
  const { comentario } = req.body;
  
  console.log(`📝 Tentando adicionar follow-up para proposta ${id}`, { comentario, userId: req.user?.id });
  
  if (!comentario || comentario.trim() === '') {
    return res.status(400).json({ error: 'Comentário é obrigatório' });
  }

  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'Usuário não autenticado' });
  }
  
  // Verificar se a proposta existe
  db.get('SELECT id FROM propostas WHERE id = ?', [id], (err, proposta) => {
    if (err) {
      console.error('❌ Erro ao verificar proposta:', err);
      return res.status(500).json({ error: err.message });
    }
    if (!proposta) {
      console.error(`❌ Proposta ${id} não encontrada`);
      return res.status(404).json({ error: 'Proposta não encontrada' });
    }
    
    console.log(`✅ Proposta ${id} encontrada, inserindo follow-up...`);
    
    // Garantir que a tabela existe antes de inserir
    db.run(
      `CREATE TABLE IF NOT EXISTS proposta_followups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        proposta_id INTEGER NOT NULL,
        comentario TEXT NOT NULL,
        criado_por INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (proposta_id) REFERENCES propostas(id) ON DELETE CASCADE,
        FOREIGN KEY (criado_por) REFERENCES usuarios(id)
      )`,
      (err) => {
        if (err && !err.message.includes('already exists')) {
          console.error('❌ Erro ao criar tabela proposta_followups:', err);
        }
        
        // Inserir follow-up
        db.run(
          'INSERT INTO proposta_followups (proposta_id, comentario, criado_por) VALUES (?, ?, ?)',
          [id, comentario.trim(), req.user.id],
          function(err) {
            if (err) {
              console.error('❌ Erro ao inserir follow-up:', err);
              console.error('❌ Detalhes do erro:', err.message);
              return res.status(500).json({ error: err.message });
            }
            
            console.log(`✅ Follow-up inserido com ID: ${this.lastID}`);
            
            // Buscar o follow-up criado com informações do usuário
            db.get(
              `SELECT pf.*, u.nome as criado_por_nome, u.cargo as criado_por_cargo
               FROM proposta_followups pf
               LEFT JOIN usuarios u ON pf.criado_por = u.id
               WHERE pf.id = ?`,
              [this.lastID],
              (err, followup) => {
                if (err) {
                  console.error('❌ Erro ao buscar follow-up criado:', err);
                  return res.status(500).json({ error: err.message });
                }
                if (!followup) {
                  console.error('❌ Follow-up não encontrado após criação');
                  return res.status(500).json({ error: 'Follow-up criado mas não foi possível recuperá-lo' });
                }
                
                // Converter data para o timezone do Brasil
                followup.created_at = converterDataParaBrasil(followup.created_at);
                
                console.log('✅ Follow-up retornado:', followup);
                res.json(followup);
              }
            );
          }
        );
      }
    );
  });
});

// ========== ROTAS DE RELATÓRIOS EXECUTIVOS ==========
app.get('/api/relatorios/executivo', authenticateToken, (req, res) => {
  if (!db) {
    return res.status(500).json({ error: 'Banco de dados não está disponível' });
  }

  const dados = {
    kpis: {},
    graficos: {},
    insights: {},
    recomendacoes: []
  };

  let completed = 0;
  const total = 16;

  const checkComplete = () => {
    completed++;
    if (completed === total) {
      // Gerar recomendações baseadas nos dados
      gerarRecomendacoes(dados, (recomendacoes) => {
        dados.recomendacoes = recomendacoes;
        res.json(dados);
      });
    }
  };

  // KPIs Principais
  db.get('SELECT COUNT(*) as total FROM clientes WHERE status = ?', ['ativo'], (err, row) => {
    if (!err) dados.kpis.totalClientes = row?.total || 0;
    checkComplete();
  });

  db.get('SELECT COUNT(*) as total FROM propostas WHERE status = ?', ['aprovada'], (err, row) => {
    if (!err) dados.kpis.propostasAprovadas = row?.total || 0;
    checkComplete();
  });

  db.get('SELECT SUM(valor_total) as total FROM propostas WHERE status = ?', ['aprovada'], (err, row) => {
    if (!err) dados.kpis.faturamentoTotal = row?.total || 0;
    checkComplete();
  });

  db.get('SELECT COUNT(*) as total FROM oportunidades WHERE status = ?', ['ativa'], (err, row) => {
    if (!err) dados.kpis.oportunidadesAtivas = row?.total || 0;
    checkComplete();
  });

  db.get('SELECT SUM(valor_estimado) as total FROM oportunidades WHERE status = ?', ['ativa'], (err, row) => {
    if (!err) dados.kpis.pipeline = row?.total || 0;
    checkComplete();
  });

  // Taxa de conversão
  db.get(`
    SELECT 
      COUNT(CASE WHEN status = 'aprovada' THEN 1 END) * 100.0 / COUNT(*) as taxa
    FROM propostas
    WHERE status IN ('aprovada', 'rejeitada', 'enviada')
  `, [], (err, row) => {
    if (!err) dados.kpis.taxaConversao = row?.taxa || 0;
    checkComplete();
  });

  // Gráfico: Evolução de propostas (últimos 6 meses)
  db.all(`
    SELECT 
      strftime('%Y-%m', created_at) as mes,
      COUNT(*) as total,
      SUM(CASE WHEN status = 'aprovada' THEN valor_total ELSE 0 END) as valor_aprovado
    FROM propostas
    WHERE created_at >= date('now', '-6 months')
    GROUP BY mes
    ORDER BY mes
  `, [], (err, rows) => {
    if (!err) dados.graficos.evolucaoPropostas = rows || [];
    checkComplete();
  });

  // Gráfico: Propostas por status
  db.all(`
    SELECT status, COUNT(*) as total, SUM(valor_total) as valor_total
    FROM propostas
    GROUP BY status
  `, [], (err, rows) => {
    if (!err) dados.graficos.propostasPorStatus = rows || [];
    checkComplete();
  });

  // Top 10 Clientes por valor
  db.all(`
    SELECT 
      c.razao_social,
      c.estado,
      COUNT(p.id) as total_propostas,
      SUM(CASE WHEN p.status = 'aprovada' THEN p.valor_total ELSE 0 END) as valor_total
    FROM clientes c
    LEFT JOIN propostas p ON c.id = p.cliente_id
    WHERE c.status = 'ativo'
    GROUP BY c.id
    ORDER BY valor_total DESC
    LIMIT 10
  `, [], (err, rows) => {
    if (!err) dados.graficos.topClientes = rows || [];
    checkComplete();
  });

  // Análise por região/estado
  db.all(`
    SELECT 
      c.estado,
      COUNT(DISTINCT c.id) as total_clientes,
      COUNT(p.id) as total_propostas,
      SUM(CASE WHEN p.status = 'aprovada' THEN p.valor_total ELSE 0 END) as valor_total
    FROM clientes c
    LEFT JOIN propostas p ON c.id = p.cliente_id
    WHERE c.estado IS NOT NULL AND c.status = 'ativo'
    GROUP BY c.estado
    ORDER BY valor_total DESC
  `, [], (err, rows) => {
    if (!err) dados.graficos.analiseRegiao = rows || [];
    checkComplete();
  });

  // Clientes que precisam de visita (sem proposta há mais de 90 dias)
  db.all(`
    SELECT 
      c.id,
      c.razao_social,
      c.estado,
      c.cidade,
      MAX(p.created_at) as ultima_proposta,
      COUNT(p.id) as total_propostas_historico
    FROM clientes c
    LEFT JOIN propostas p ON c.id = p.cliente_id
    WHERE c.status = 'ativo'
    GROUP BY c.id
    HAVING ultima_proposta IS NULL OR date(ultima_proposta) < date('now', '-90 days')
    ORDER BY total_propostas_historico DESC, ultima_proposta DESC
    LIMIT 20
  `, [], (err, rows) => {
    if (!err) dados.insights.clientesParaVisitar = rows || [];
    checkComplete();
  });

  // Regiões com mais oportunidades
  db.all(`
    SELECT 
      c.estado,
      COUNT(DISTINCT o.id) as total_oportunidades,
      SUM(o.valor_estimado) as valor_total,
      AVG(o.probabilidade) as probabilidade_media
    FROM oportunidades o
    JOIN clientes c ON o.cliente_id = c.id
    WHERE o.status = 'ativa' AND c.estado IS NOT NULL
    GROUP BY c.estado
    ORDER BY valor_total DESC
  `, [], (err, rows) => {
    if (!err) dados.insights.regioesOportunidades = rows || [];
    checkComplete();
  });

  // Análise de origem de busca
  db.all(`
    SELECT 
      origem_busca,
      COUNT(*) as total,
      SUM(CASE WHEN status = 'aprovada' THEN valor_total ELSE 0 END) as valor_aprovado,
      COUNT(CASE WHEN status = 'aprovada' THEN 1 END) * 100.0 / COUNT(*) as taxa_conversao
    FROM propostas
    WHERE origem_busca IS NOT NULL
    GROUP BY origem_busca
    ORDER BY valor_aprovado DESC
  `, [], (err, rows) => {
    if (!err) dados.insights.origemBusca = rows || [];
    checkComplete();
  });

  // Análise de família de produtos
  db.all(`
    SELECT 
      familia_produto,
      COUNT(*) as total_propostas,
      SUM(CASE WHEN status = 'aprovada' THEN valor_total ELSE 0 END) as valor_aprovado,
      COUNT(CASE WHEN status = 'aprovada' THEN 1 END) * 100.0 / COUNT(*) as taxa_conversao
    FROM propostas
    WHERE familia_produto IS NOT NULL
    GROUP BY familia_produto
    ORDER BY valor_aprovado DESC
  `, [], (err, rows) => {
    if (!err) dados.insights.familiaProdutos = rows || [];
    checkComplete();
  });

  // Motivos de não venda
  db.all(`
    SELECT 
      motivo_nao_venda,
      COUNT(*) as total
    FROM propostas
    WHERE motivo_nao_venda IS NOT NULL AND motivo_nao_venda != ''
    GROUP BY motivo_nao_venda
    ORDER BY total DESC
  `, [], (err, rows) => {
    if (!err) dados.insights.motivosNaoVenda = rows || [];
    checkComplete();
  });

  // Dados para mapa de localização de clientes
  db.all(`
    SELECT 
      c.cidade,
      c.estado,
      COUNT(DISTINCT c.id) as total_clientes,
      COUNT(p.id) as total_propostas,
      SUM(CASE WHEN p.status = 'aprovada' THEN p.valor_total ELSE 0 END) as valor_total
    FROM clientes c
    LEFT JOIN propostas p ON c.id = p.cliente_id
    WHERE c.status = 'ativo' AND c.cidade IS NOT NULL AND c.estado IS NOT NULL
    GROUP BY c.cidade, c.estado
    ORDER BY total_clientes DESC
  `, [], (err, rows) => {
    if (!err) {
      // Adicionar coordenadas aproximadas baseadas em cidade/estado
      dados.graficos.localizacoesClientes = (rows || []).map(loc => ({
        ...loc,
        coordenadas: obterCoordenadasCidade(loc.cidade, loc.estado)
      }));
    }
    checkComplete();
  });
});

// Função para geocodificar endereço completo usando Nominatim (OpenStreetMap)
async function geocodificarEndereco(endereco, cidade, estado) {
  if (!endereco || !cidade || !estado) {
    return null;
  }
  
  try {
    // Construir query de busca
    const query = `${endereco}, ${cidade}, ${estado}, Brasil`.replace(/\s+/g, '+');
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&countrycodes=br`;
    
    const https = require('https');
    return new Promise((resolve, reject) => {
      https.get(url, {
        headers: {
          'User-Agent': 'GMP-CRM/1.0'
        }
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const results = JSON.parse(data);
            if (results && results.length > 0) {
              const lat = parseFloat(results[0].lat);
              const lon = parseFloat(results[0].lon);
              if (!isNaN(lat) && !isNaN(lon)) {
                resolve([lat, lon]);
              } else {
                resolve(null);
              }
            } else {
              resolve(null);
            }
          } catch (err) {
            console.error('Erro ao parsear resposta do Nominatim:', err);
            resolve(null);
          }
        });
      }).on('error', (err) => {
        console.error('Erro ao geocodificar endereço:', err);
        resolve(null);
      });
    });
  } catch (err) {
    console.error('Erro na geocodificação:', err);
    return null;
  }
}

// Função para obter coordenadas (tenta endereço completo primeiro, depois cidade)
async function obterCoordenadasExatas(endereco, cidade, estado) {
  // Se tiver endereço completo, tentar geocodificar
  if (endereco && cidade && estado) {
    const coords = await geocodificarEndereco(endereco, cidade, estado);
    if (coords) {
      return coords;
    }
  }
  
  // Fallback para coordenadas da cidade
  return obterCoordenadasCidade(cidade, estado);
}

// Função para obter coordenadas aproximadas de cidades brasileiras
function obterCoordenadasCidade(cidade, estado) {
  // Mapeamento básico de coordenadas por estado (centro do estado)
  const coordenadasEstados = {
    'AC': [-8.77, -70.55], 'AL': [-9.57, -36.78], 'AP': [1.41, -51.77], 'AM': [-3.47, -65.10],
    'BA': [-12.96, -38.51], 'CE': [-3.71, -38.54], 'DF': [-15.79, -47.86], 'ES': [-19.19, -40.34],
    'GO': [-16.64, -49.31], 'MA': [-2.55, -44.30], 'MT': [-12.64, -55.42], 'MS': [-20.51, -54.54],
    'MG': [-18.10, -44.38], 'PA': [-5.53, -52.33], 'PB': [-7.24, -36.78], 'PR': [-24.89, -51.55],
    'PE': [-8.28, -35.07], 'PI': [-8.28, -43.68], 'RJ': [-22.90, -43.17], 'RN': [-5.22, -36.52],
    'RS': [-30.01, -51.22], 'RO': [-11.22, -62.80], 'RR': [1.99, -61.33], 'SC': [-27.33, -49.44],
    'SP': [-23.55, -46.63], 'SE': [-10.57, -37.38], 'TO': [-10.25, -48.25]
  };

  // Coordenadas de principais cidades brasileiras
  const coordenadasCidades = {
    'São Paulo': [-23.5505, -46.6333],
    'Rio de Janeiro': [-22.9068, -43.1729],
    'Brasília': [-15.7942, -47.8822],
    'Salvador': [-12.9714, -38.5014],
    'Fortaleza': [-3.7172, -38.5433],
    'Belo Horizonte': [-19.9167, -43.9345],
    'Manaus': [-3.1190, -60.0217],
    'Curitiba': [-25.4284, -49.2733],
    'Recife': [-8.0476, -34.8770],
    'Porto Alegre': [-30.0346, -51.2177],
    'Belém': [-1.4558, -48.5044],
    'Goiânia': [-16.6864, -49.2643],
    'Guarulhos': [-23.4538, -46.5331],
    'Campinas': [-22.9056, -47.0608],
    'São Luís': [-2.5387, -44.2825],
    'São Gonçalo': [-22.8269, -43.0539],
    'Maceió': [-9.5713, -36.7820],
    'Duque de Caxias': [-22.7856, -43.3047],
    'Natal': [-5.7945, -35.2110],
    'Teresina': [-5.0892, -42.8019],
    'Campo Grande': [-20.4428, -54.6458],
    'Nova Iguaçu': [-22.7556, -43.4603],
    'São Bernardo do Campo': [-23.7150, -46.5550], // Av. Angelo Demarchi 130, Batistini
    'João Pessoa': [-7.1195, -34.8450],
    'Santo André': [-23.6669, -46.5322],
    'Osasco': [-23.5329, -46.7915],
    'Jaboatão dos Guararapes': [-8.1127, -35.0147],
    'São José dos Campos': [-23.1791, -45.8872],
    'Ribeirão Preto': [-21.1775, -47.8103],
    'Uberlândia': [-18.9128, -48.2755],
    'Sorocaba': [-23.5015, -47.4526],
    'Contagem': [-19.9317, -44.0539],
    'Aracaju': [-10.9091, -37.0677],
    'Feira de Santana': [-12.2664, -38.9661],
    'Cuiabá': [-15.6014, -56.0979],
    'Joinville': [-26.3044, -48.8467],
    'Juiz de Fora': [-21.7595, -43.3398],
    'Londrina': [-23.3045, -51.1696],
    'Aparecida de Goiânia': [-16.8194, -49.2439],
    'Niterói': [-22.8834, -43.1034],
    'Ananindeua': [-1.3656, -48.3728],
    'Porto Velho': [-8.7619, -63.9039],
    'Serra': [-20.1289, -40.3078],
    'Caxias do Sul': [-29.1680, -51.1798],
    'Campos dos Goytacazes': [-21.7523, -41.3304],
    'Macapá': [0.0349, -51.0694],
    'Vila Velha': [-20.3297, -40.2925],
    'Florianópolis': [-27.5954, -48.5480],
    'Mauá': [-23.6677, -46.4613],
    'São João de Meriti': [-22.8039, -43.3722],
    'São José do Rio Preto': [-20.8113, -49.3757],
    'Mogi das Cruzes': [-23.5229, -46.1880],
    'Betim': [-19.9678, -44.1977],
    'Diadema': [-23.6864, -46.6228],
    'Campina Grande': [-7.2307, -35.8817],
    'Jundiaí': [-23.1864, -46.8842],
    'Maringá': [-23.4205, -51.9333],
    'Montes Claros': [-16.7281, -43.8630],
    'Carapicuíba': [-23.5235, -46.8407],
    'Olinda': [-8.0089, -34.8553],
    'Cariacica': [-20.2639, -40.4164],
    'Rio Branco': [-9.9747, -67.8100],
    'Anápolis': [-16.3286, -48.9534],
    'Bauru': [-22.3147, -49.0606],
    'Vitória': [-20.3155, -40.3128],
    'Caucaia': [-3.7327, -38.6610],
    'Canela': [-29.3658, -50.8139],
    'Blumenau': [-26.9194, -49.0661],
    'Franca': [-20.5352, -47.4039],
    'Ponta Grossa': [-25.0916, -50.1668],
    'Petrolina': [-9.3887, -40.5007],
    'Uberaba': [-19.7477, -47.9392],
    'Paulista': [-7.9340, -34.8684],
    'Cascavel': [-24.9578, -53.4595],
    'Praia Grande': [-24.0089, -46.4122],
    'São José de Ribamar': [-2.5619, -44.0542],
    'Foz do Iguaçu': [-25.5163, -54.5854],
    'Várzea Grande': [-15.6458, -56.1325],
    'Petrópolis': [-22.5050, -43.1786],
    'Limeira': [-22.5647, -47.4017],
    'Volta Redonda': [-22.5231, -44.1042],
    'Governador Valadares': [-18.8548, -41.9559],
    'Taubaté': [-23.0264, -45.5553],
    'Imperatriz': [-5.5185, -47.4775],
    'Gravataí': [-29.9444, -50.9919],
    'Embu das Artes': [-23.6437, -46.8579],
    'Viamão': [-30.0811, -51.0234],
    'São Vicente': [-23.9631, -46.3919],
    'Taboão da Serra': [-23.6019, -46.7526],
    'Novo Hamburgo': [-29.6914, -51.1306],
    'Santa Maria': [-29.6842, -53.8069],
    'Barueri': [-23.5107, -46.8761],
    'Guarujá': [-23.9931, -46.2564],
    'Ribeirão das Neves': [-19.7669, -44.0869],
    'Sumaré': [-22.8214, -47.2668],
    'Caruaru': [-8.2842, -35.9699],
    'Araçatuba': [-21.2087, -50.4325],
    'Colombo': [-25.2925, -49.2262],
    'Itaquaquecetuba': [-23.4864, -46.3483],
    'Americana': [-22.7379, -47.3311],
    'Araraquara': [-21.7944, -48.1756],
    'Itaboraí': [-22.7475, -42.8592],
    'Santa Bárbara d\'Oeste': [-22.7536, -47.4136],
    'Nova Friburgo': [-22.2819, -42.5303],
    'Jacareí': [-23.3051, -45.9658],
    'Arapiraca': [-9.7520, -36.6612],
    'Barra Mansa': [-22.5444, -44.1714],
    'Praia Grande': [-24.0089, -46.4122],
    'São Caetano do Sul': [-23.6231, -46.5512],
    'Cabo Frio': [-22.8894, -42.0286],
    'Itabuna': [-14.7874, -39.2781],
    'Rio Claro': [-22.4103, -47.5604],
    'Araguaína': [-7.1920, -48.2044],
    'Passo Fundo': [-28.2628, -52.4067],
    'Luziânia': [-16.2525, -47.9503],
    'Paranaguá': [-25.5167, -48.5167],
    'Dourados': [-22.2208, -54.8058],
    'Rio Verde': [-17.7979, -50.9278],
    'Chapecó': [-27.1004, -52.6153],
    'Criciúma': [-28.6775, -49.3697],
    'Itajaí': [-26.9103, -48.6626],
    'Sete Lagoas': [-19.4658, -44.2467],
    'Divinópolis': [-20.1436, -44.8908],
    'Macaé': [-22.3708, -41.7869],
    'São José dos Pinhais': [-25.5347, -49.2056],
    'Pindamonhangaba': [-22.9246, -45.4613],
    'Jequié': [-13.8578, -40.0853],
    'Palmas': [-10.1844, -48.3336],
    'Teixeira de Freitas': [-17.5350, -39.7419],
    'Barretos': [-20.5572, -48.5678],
    'Patos de Minas': [-18.5778, -46.5181],
    'Alagoinhas': [-12.1356, -38.4192],
    'Bragança Paulista': [-22.9527, -46.5442],
    'Parnaíba': [-2.9048, -41.7767],
    'Poços de Caldas': [-21.7878, -46.5614],
    'Caxias': [-4.8590, -43.3600],
    'Valparaíso de Goiás': [-16.0650, -47.9750],
    'Marília': [-22.2139, -49.9456],
    'Catanduva': [-21.1378, -48.9728],
    'Barra do Piraí': [-22.4706, -43.8256],
    'Bento Gonçalves': [-29.1714, -51.5192],
    'Araucária': [-25.5858, -49.4047],
    'Garanhuns': [-8.8828, -36.5028],
    'Vitória de Santo Antão': [-8.1178, -35.2914],
    'Itapevi': [-23.5489, -46.9342],
    'Toledo': [-24.7139, -53.7431],
    'Guaíba': [-30.1136, -51.3250],
    'Santos': [-23.9608, -46.3331],
    'Suzano': [-23.5428, -46.3108],
    'São Carlos': [-22.0175, -47.8910],
    'Mogi Guaçu': [-22.3714, -46.9425],
    'Pouso Alegre': [-22.2306, -45.9356],
    'Angra dos Reis': [-23.0069, -44.3178],
    'Eunápolis': [-16.3706, -39.5806],
    'Salto': [-23.2003, -47.2869],
    'Ourinhos': [-22.9789, -49.8706],
    'Parnamirim': [-5.9167, -35.2667],
    'Poá': [-23.5281, -46.3447],
    'Cataguases': [-21.3892, -42.6897],
    'Atibaia': [-23.1169, -46.5503],
    'Erechim': [-27.6344, -52.2694],
    'Santa Rita': [-7.1139, -34.9778],
    'Barbacena': [-21.2214, -43.7736],
    'Araras': [-22.3572, -47.3842],
    'Piraquara': [-25.4425, -49.0625],
    'Abaetetuba': [-1.7217, -48.8789],
    'Tatuí': [-23.3547, -47.8561],
    'Birigui': [-21.2889, -50.3400],
    'Resende': [-22.4689, -44.4469],
    'Votorantim': [-23.5467, -47.4378],
    'Caraguatatuba': [-23.6203, -45.4131],
    'Trindade': [-16.6517, -49.4928],
    'Votuporanga': [-20.4231, -49.9781],
    'Tubarão': [-28.4806, -49.0069],
    'Aracruz': [-19.8200, -40.2739],
    'Gravataí': [-29.9444, -50.9919],
    'Cachoeiro de Itapemirim': [-20.8489, -41.1128],
    'Rio das Ostras': [-22.5269, -41.9450],
    'Simões Filho': [-12.7867, -38.4039],
    'Maringá': [-23.4205, -51.9333],
    'Guaratinguetá': [-22.8164, -45.1925],
    'Arapongas': [-23.4194, -51.4244],
    'Cubatão': [-23.8953, -46.4253],
    'Santa Cruz do Sul': [-29.7178, -52.4258],
    'Itu': [-23.2642, -47.2992],
    'Jaraguá do Sul': [-26.4850, -49.0669],
    'Conselheiro Lafaiete': [-20.6603, -43.7861],
    'Linhares': [-19.3914, -40.0722],
    'Guarapari': [-20.6597, -40.5025],
    'Cachoeirinha': [-29.9506, -51.0939],
    'Paragominas': [-2.9989, -47.3531],
    'Umuarama': [-23.7656, -53.3250],
    'Sapucaia do Sul': [-29.8406, -51.1458],
    'Crato': [-7.2306, -39.4097],
    'Paranavaí': [-23.0819, -52.4617],
    'Maracanaú': [-3.8769, -38.6256],
    'Bagé': [-31.3319, -54.1069],
    'Cametá': [-2.2439, -49.4958],
    'Mossoró': [-5.1878, -37.3439],
    'Magé': [-22.6531, -43.0406],
    'Corumbá': [-19.0081, -57.6514],
    'Ariquemes': [-9.9139, -63.0406],
    'Ji-Paraná': [-10.8853, -61.9517],
    'Sinop': [-11.8639, -55.5031],
    'Cáceres': [-16.0714, -57.6819],
    'Rondonópolis': [-16.4706, -54.6358],
    'Várzea Grande': [-15.6458, -56.1325],
    'Cuiabá': [-15.6014, -56.0979],
    'Campo Grande': [-20.4428, -54.6458],
    'Dourados': [-22.2208, -54.8058],
    'Três Lagoas': [-20.7847, -51.7006],
    'Ponta Porã': [-22.5361, -55.7258],
    'Naviraí': [-23.0619, -54.1917],
    'Paranaíba': [-19.6744, -51.1908],
    'Aquidauana': [-20.4706, -55.7869],
    'Corumbá': [-19.0081, -57.6514],
    'Ladário': [-19.0081, -57.6014],
    'Mirassol d\'Oeste': [-15.6758, -58.0958],
    'Tangará da Serra': [-14.6219, -57.4258],
    'Barra do Garças': [-15.8900, -52.2569],
    'Primavera do Leste': [-15.5606, -54.3000],
    'Sorriso': [-12.5431, -55.7097],
    'Lucas do Rio Verde': [-13.0581, -55.9158],
    'Nova Mutum': [-13.8369, -56.0831],
    'Sapezal': [-12.9906, -58.7631],
    'Campo Novo do Parecis': [-13.6758, -57.8881],
    'Diamantino': [-14.4081, -56.4458],
    'Alta Floresta': [-9.8758, -56.0861],
    'Colíder': [-10.8131, -55.4558],
    'Peixoto de Azevedo': [-10.2250, -54.9792],
    'Guarantã do Norte': [-9.9625, -54.9092],
    'Matupá': [-10.0500, -54.9331],
    'Nova Canaã do Norte': [-10.5500, -55.9500],
    'Terra Nova do Norte': [-10.5169, -55.2319],
    'Itaúba': [-11.0619, -55.2017],
    'Nova Bandeirantes': [-9.8500, -57.8167],
    'Nova Monte Verde': [-9.9833, -57.6167],
    'Paranaíta': [-9.6667, -56.4833],
    'Apiacás': [-9.5500, -57.4500],
    'Carlinda': [-9.7667, -55.8333],
    'Nova Guarita': [-10.2167, -55.4167],
    'Nova Santa Helena': [-10.8667, -55.1833],
    'Santa Carmem': [-11.9500, -55.2167],
    'União do Sul': [-11.5167, -54.3667],
    'Vera': [-12.3000, -55.3167],
    'Nova Ubiratã': [-12.9833, -55.2500],
    'Brasnorte': [-12.1500, -57.9833],
    'Campo Verde': [-15.5500, -55.1667],
    'Cláudia': [-11.5167, -54.8833],
    'Feliz Natal': [-12.3833, -54.9167],
    'Itanhangá': [-12.2167, -56.6333],
    'Marcelândia': [-11.0167, -54.5000],
    'Nova Maringá': [-13.0167, -57.0833],
    'Nova Marilândia': [-14.2167, -56.9833],
    'Nova Nazaré': [-13.9833, -51.8000],
    'Planalto da Serra': [-10.4333, -55.2667],
    'Santa Rita do Trivelato': [-13.8167, -55.2667],
    'São José do Rio Claro': [-13.4333, -56.7167],
    'Tabaporã': [-11.3000, -56.8167],
    'Tapurah': [-12.5333, -56.5167],
    'Vila Rica': [-10.0167, -51.1167],
    'Araguaiana': [-15.7333, -51.8333],
    'Araguainha': [-16.8500, -53.0333],
    'Cocalinho': [-14.4000, -51.0000],
    'Nova Xavantina': [-14.6667, -52.3500],
    'Novo São Joaquim': [-14.9000, -53.0167],
    'Querência': [-12.6167, -52.1833],
    'Ribeirão Cascalheira': [-12.9333, -51.8167],
    'Santa Terezinha': [-10.4667, -50.5167],
    'São Félix do Araguaia': [-11.6167, -50.6667],
    'Serra Nova Dourada': [-12.0833, -51.4000],
    'Vila Bela da Santíssima Trindade': [-15.0000, -59.9500],
    'Comodoro': [-13.6667, -59.7833],
    'Conquista D\'Oeste': [-14.5333, -59.5667],
    'Curvelândia': [-15.6000, -57.9167],
    'Figueirópolis D\'Oeste': [-15.4333, -58.7333],
    'Glória D\'Oeste': [-15.0167, -58.3167],
    'Indiavaí': [-15.4333, -58.5833],
    'Jauru': [-15.3333, -58.8667],
    'Lambari D\'Oeste': [-15.3167, -58.0167],
    'Pontes e Lacerda': [-15.2167, -59.3333],
    'Reserva do Cabaçal': [-15.1333, -58.4167],
    'Rio Branco': [-15.2500, -58.1167],
    'Salto do Céu': [-15.1333, -58.1333],
    'São José dos Quatro Marcos': [-15.6167, -58.1833],
    'Vale de São Domingos': [-15.2833, -59.0667],
    'Vila Bela da Santíssima Trindade': [-15.0000, -59.9500],
    'Acorizal': [-15.2000, -56.3667],
    'Água Boa': [-14.0500, -52.1667],
    'Alta Floresta': [-9.8758, -56.0861],
    'Alto Araguaia': [-17.3167, -53.2167],
    'Alto Boa Vista': [-11.6667, -51.3833],
    'Alto Garças': [-16.9500, -53.5167],
    'Alto Paraguai': [-14.5167, -56.4833],
    'Alto Taquari': [-17.8333, -53.2833],
    'Apiacás': [-9.5500, -57.4500],
    'Araguaiana': [-15.7333, -51.8333],
    'Araguainha': [-16.8500, -53.0333],
    'Araputanga': [-15.4667, -58.3500],
    'Arenápolis': [-14.4333, -56.8333],
    'Aripuanã': [-9.1667, -60.6333],
    'Barão de Melgaço': [-16.2000, -55.9667],
    'Barra do Bugres': [-15.0833, -57.1833],
    'Barra do Garças': [-15.8900, -52.2569],
    'Bom Jesus do Araguaia': [-12.1833, -51.5000],
    'Brasnorte': [-12.1500, -57.9833],
    'Cáceres': [-16.0714, -57.6819],
    'Campinápolis': [-14.5000, -52.7667],
    'Campo Novo do Parecis': [-13.6758, -57.8881],
    'Campo Verde': [-15.5500, -55.1667],
    'Campos de Júlio': [-13.5167, -59.1000],
    'Canabrava do Norte': [-11.0333, -51.8333],
    'Canarana': [-13.5500, -52.2667],
    'Carlinda': [-9.7667, -55.8333],
    'Castanheira': [-11.1167, -58.6000],
    'Chapada dos Guimarães': [-15.4333, -55.7500],
    'Cláudia': [-11.5167, -54.8833],
    'Cocalinho': [-14.4000, -51.0000],
    'Colíder': [-10.8131, -55.4558],
    'Colniza': [-9.4000, -60.9167],
    'Comodoro': [-13.6667, -59.7833],
    'Confresa': [-10.6500, -51.5667],
    'Conquista D\'Oeste': [-14.5333, -59.5667],
    'Cotriguaçu': [-9.8667, -58.4167],
    'Cuiabá': [-15.6014, -56.0979],
    'Curvelândia': [-15.6000, -57.9167],
    'Denise': [-14.7333, -57.0500],
    'Diamantino': [-14.4081, -56.4458],
    'Dom Aquino': [-15.8167, -54.9167],
    'Feliz Natal': [-12.3833, -54.9167],
    'Figueirópolis D\'Oeste': [-15.4333, -58.7333],
    'Gaúcha do Norte': [-13.1833, -53.2500],
    'General Carneiro': [-15.7167, -52.7500],
    'Glória D\'Oeste': [-15.0167, -58.3167],
    'Guarantã do Norte': [-9.9625, -54.9092],
    'Guiratinga': [-16.3500, -53.7500],
    'Indiavaí': [-15.4333, -58.5833],
    'Ipiranga do Norte': [-12.2333, -56.1500],
    'Itanhangá': [-12.2167, -56.6333],
    'Itaúba': [-11.0619, -55.2017],
    'Itiquira': [-17.2167, -54.1333],
    'Jaciara': [-15.9667, -54.9667],
    'Jangada': [-15.2333, -56.4833],
    'Jauru': [-15.3333, -58.8667],
    'Juara': [-11.2500, -57.5167],
    'Juína': [-11.3833, -58.7333],
    'Juruena': [-10.3167, -58.4833],
    'Juscimeira': [-16.0500, -54.8833],
    'Lambari D\'Oeste': [-15.3167, -58.0167],
    'Lucas do Rio Verde': [-13.0581, -55.9158],
    'Luciara': [-11.2167, -50.6667],
    'Marcelândia': [-11.0167, -54.5000],
    'Matupá': [-10.0500, -54.9331],
    'Mirassol d\'Oeste': [-15.6758, -58.0958],
    'Nobres': [-14.7167, -56.3333],
    'Nortelândia': [-14.4500, -56.8000],
    'Nossa Senhora do Livramento': [-15.7833, -56.3667],
    'Nova Bandeirantes': [-9.8500, -57.8167],
    'Nova Brasilândia': [-14.9667, -54.9167],
    'Nova Canaã do Norte': [-10.5500, -55.9500],
    'Nova Guarita': [-10.2167, -55.4167],
    'Nova Lacerda': [-14.4667, -59.6000],
    'Nova Marilândia': [-14.2167, -56.9833],
    'Nova Maringá': [-13.0167, -57.0833],
    'Nova Monte Verde': [-9.9833, -57.6167],
    'Nova Mutum': [-13.8369, -56.0831],
    'Nova Nazaré': [-13.9833, -51.8000],
    'Nova Olímpia': [-14.7833, -57.2833],
    'Nova Santa Helena': [-10.8667, -55.1833],
    'Nova Ubiratã': [-12.9833, -55.2500],
    'Nova Xavantina': [-14.6667, -52.3500],
    'Novo Horizonte do Norte': [-11.4167, -57.3500],
    'Novo Mundo': [-9.9667, -55.5167],
    'Novo Santo Antônio': [-12.2833, -50.9667],
    'Novo São Joaquim': [-14.9000, -53.0167],
    'Paranaíba': [-19.6744, -51.1908],
    'Paranaíta': [-9.6667, -56.4833],
    'Paranatinga': [-14.4333, -54.0500],
    'Pedra Preta': [-16.6167, -54.4667],
    'Peixoto de Azevedo': [-10.2250, -54.9792],
    'Planalto da Serra': [-10.4333, -55.2667],
    'Poconé': [-16.2500, -56.6167],
    'Pontal do Araguaia': [-15.9500, -52.0167],
    'Ponte Branca': [-16.7667, -52.8333],
    'Pontes e Lacerda': [-15.2167, -59.3333],
    'Porto Alegre do Norte': [-10.8667, -51.6333],
    'Porto dos Gaúchos': [-11.5333, -57.4167],
    'Porto Esperidião': [-15.8500, -58.4667],
    'Porto Estrela': [-15.3167, -57.2167],
    'Poxoréu': [-15.8333, -54.3833],
    'Primavera do Leste': [-15.5606, -54.3000],
    'Querência': [-12.6167, -52.1833],
    'Reserva do Cabaçal': [-15.1333, -58.4167],
    'Ribeirão Cascalheira': [-12.9333, -51.8167],
    'Ribeirãozinho': [-16.4500, -52.6833],
    'Rio Branco': [-15.2500, -58.1167],
    'Rondolândia': [-10.8333, -61.4667],
    'Rondonópolis': [-16.4706, -54.6358],
    'Rosário Oeste': [-14.8333, -56.4333],
    'Salto do Céu': [-15.1333, -58.1333],
    'Santa Carmem': [-11.9500, -55.2167],
    'Santa Cruz do Xingu': [-10.1500, -52.3833],
    'Santa Rita do Trivelato': [-13.8167, -55.2667],
    'Santa Terezinha': [-10.4667, -50.5167],
    'Santo Afonso': [-14.4833, -57.2500],
    'Santo Antônio do Leste': [-14.9667, -53.6167],
    'Santo Antônio do Leverger': [-15.8667, -56.0833],
    'São Félix do Araguaia': [-11.6167, -50.6667],
    'São José do Povo': [-16.4667, -54.2500],
    'São José do Rio Claro': [-13.4333, -56.7167],
    'São José do Xingu': [-10.8000, -52.7333],
    'São José dos Quatro Marcos': [-15.6167, -58.1833],
    'São Pedro da Cipa': [-16.0000, -54.9167],
    'Sapezal': [-12.9906, -58.7631],
    'Serra Nova Dourada': [-12.0833, -51.4000],
    'Sinop': [-11.8639, -55.5031],
    'Sorriso': [-12.5431, -55.7097],
    'Tabaporã': [-11.3000, -56.8167],
    'Tangará da Serra': [-14.6219, -57.4258],
    'Tapurah': [-12.5333, -56.5167],
    'Terra Nova do Norte': [-10.5169, -55.2319],
    'Tesouro': [-16.0667, -53.5500],
    'Torixoréu': [-16.2000, -52.5500],
    'União do Sul': [-11.5167, -54.3667],
    'Vale de São Domingos': [-15.2833, -59.0667],
    'Várzea Grande': [-15.6458, -56.1325],
    'Vera': [-12.3000, -55.3167],
    'Vila Bela da Santíssima Trindade': [-15.0000, -59.9500],
    'Vila Rica': [-10.0167, -51.1167],
    'Água Boa': [-14.0500, -52.1667],
    'Alta Floresta': [-9.8758, -56.0861],
    'Alto Araguaia': [-17.3167, -53.2167],
    'Alto Boa Vista': [-11.6667, -51.3833],
    'Alto Garças': [-16.9500, -53.5167],
    'Alto Paraguai': [-14.5167, -56.4833],
    'Alto Taquari': [-17.8333, -53.2833],
    'Apiacás': [-9.5500, -57.4500],
    'Araguaiana': [-15.7333, -51.8333],
    'Araguainha': [-16.8500, -53.0333],
    'Araputanga': [-15.4667, -58.3500],
    'Arenápolis': [-14.4333, -56.8333],
    'Aripuanã': [-9.1667, -60.6333],
    'Barão de Melgaço': [-16.2000, -55.9667],
    'Barra do Bugres': [-15.0833, -57.1833],
    'Barra do Garças': [-15.8900, -52.2569],
    'Bom Jesus do Araguaia': [-12.1833, -51.5000],
    'Brasnorte': [-12.1500, -57.9833],
    'Cáceres': [-16.0714, -57.6819],
    'Campinápolis': [-14.5000, -52.7667],
    'Campo Novo do Parecis': [-13.6758, -57.8881],
    'Campo Verde': [-15.5500, -55.1667],
    'Campos de Júlio': [-13.5167, -59.1000],
    'Canabrava do Norte': [-11.0333, -51.8333],
    'Canarana': [-13.5500, -52.2667],
    'Carlinda': [-9.7667, -55.8333],
    'Castanheira': [-11.1167, -58.6000],
    'Chapada dos Guimarães': [-15.4333, -55.7500],
    'Cláudia': [-11.5167, -54.8833],
    'Cocalinho': [-14.4000, -51.0000],
    'Colíder': [-10.8131, -55.4558],
    'Colniza': [-9.4000, -60.9167],
    'Comodoro': [-13.6667, -59.7833],
    'Confresa': [-10.6500, -51.5667],
    'Conquista D\'Oeste': [-14.5333, -59.5667],
    'Cotriguaçu': [-9.8667, -58.4167],
    'Cuiabá': [-15.6014, -56.0979],
    'Curvelândia': [-15.6000, -57.9167],
    'Denise': [-14.7333, -57.0500],
    'Diamantino': [-14.4081, -56.4458],
    'Dom Aquino': [-15.8167, -54.9167],
    'Feliz Natal': [-12.3833, -54.9167],
    'Figueirópolis D\'Oeste': [-15.4333, -58.7333],
    'Gaúcha do Norte': [-13.1833, -53.2500],
    'General Carneiro': [-15.7167, -52.7500],
    'Glória D\'Oeste': [-15.0167, -58.3167],
    'Guarantã do Norte': [-9.9625, -54.9092],
    'Guiratinga': [-16.3500, -53.7500],
    'Indiavaí': [-15.4333, -58.5833],
    'Ipiranga do Norte': [-12.2333, -56.1500],
    'Itanhangá': [-12.2167, -56.6333],
    'Itaúba': [-11.0619, -55.2017],
    'Itiquira': [-17.2167, -54.1333],
    'Jaciara': [-15.9667, -54.9667],
    'Jangada': [-15.2333, -56.4833],
    'Jauru': [-15.3333, -58.8667],
    'Juara': [-11.2500, -57.5167],
    'Juína': [-11.3833, -58.7333],
    'Juruena': [-10.3167, -58.4833],
    'Juscimeira': [-16.0500, -54.8833],
    'Lambari D\'Oeste': [-15.3167, -58.0167],
    'Lucas do Rio Verde': [-13.0581, -55.9158],
    'Luciara': [-11.2167, -50.6667],
    'Marcelândia': [-11.0167, -54.5000],
    'Matupá': [-10.0500, -54.9331],
    'Mirassol d\'Oeste': [-15.6758, -58.0958],
    'Nobres': [-14.7167, -56.3333],
    'Nortelândia': [-14.4500, -56.8000],
    'Nossa Senhora do Livramento': [-15.7833, -56.3667],
    'Nova Bandeirantes': [-9.8500, -57.8167],
    'Nova Brasilândia': [-14.9667, -54.9167],
    'Nova Canaã do Norte': [-10.5500, -55.9500],
    'Nova Guarita': [-10.2167, -55.4167],
    'Nova Lacerda': [-14.4667, -59.6000],
    'Nova Marilândia': [-14.2167, -56.9833],
    'Nova Maringá': [-13.0167, -57.0833],
    'Nova Monte Verde': [-9.9833, -57.6167],
    'Nova Mutum': [-13.8369, -56.0831],
    'Nova Nazaré': [-13.9833, -51.8000],
    'Nova Olímpia': [-14.7833, -57.2833],
    'Nova Santa Helena': [-10.8667, -55.1833],
    'Nova Ubiratã': [-12.9833, -55.2500],
    'Nova Xavantina': [-14.6667, -52.3500],
    'Novo Horizonte do Norte': [-11.4167, -57.3500],
    'Novo Mundo': [-9.9667, -55.5167],
    'Novo Santo Antônio': [-12.2833, -50.9667],
    'Novo São Joaquim': [-14.9000, -53.0167],
    'Paranaíba': [-19.6744, -51.1908],
    'Paranaíta': [-9.6667, -56.4833],
    'Paranatinga': [-14.4333, -54.0500],
    'Pedra Preta': [-16.6167, -54.4667],
    'Peixoto de Azevedo': [-10.2250, -54.9792],
    'Planalto da Serra': [-10.4333, -55.2667],
    'Poconé': [-16.2500, -56.6167],
    'Pontal do Araguaia': [-15.9500, -52.0167],
    'Ponte Branca': [-16.7667, -52.8333],
    'Pontes e Lacerda': [-15.2167, -59.3333],
    'Porto Alegre do Norte': [-10.8667, -51.6333],
    'Porto dos Gaúchos': [-11.5333, -57.4167],
    'Porto Esperidião': [-15.8500, -58.4667],
    'Porto Estrela': [-15.3167, -57.2167],
    'Poxoréu': [-15.8333, -54.3833],
    'Primavera do Leste': [-15.5606, -54.3000],
    'Querência': [-12.6167, -52.1833],
    'Reserva do Cabaçal': [-15.1333, -58.4167],
    'Ribeirão Cascalheira': [-12.9333, -51.8167],
    'Ribeirãozinho': [-16.4500, -52.6833],
    'Rio Branco': [-15.2500, -58.1167],
    'Rondolândia': [-10.8333, -61.4667],
    'Rondonópolis': [-16.4706, -54.6358],
    'Rosário Oeste': [-14.8333, -56.4333],
    'Salto do Céu': [-15.1333, -58.1333],
    'Santa Carmem': [-11.9500, -55.2167],
    'Santa Cruz do Xingu': [-10.1500, -52.3833],
    'Santa Rita do Trivelato': [-13.8167, -55.2667],
    'Santa Terezinha': [-10.4667, -50.5167],
    'Santo Afonso': [-14.4833, -57.2500],
    'Santo Antônio do Leste': [-14.9667, -53.6167],
    'Santo Antônio do Leverger': [-15.8667, -56.0833],
    'São Félix do Araguaia': [-11.6167, -50.6667],
    'São José do Povo': [-16.4667, -54.2500],
    'São José do Rio Claro': [-13.4333, -56.7167],
    'São José do Xingu': [-10.8000, -52.7333],
    'São José dos Quatro Marcos': [-15.6167, -58.1833],
    'São Pedro da Cipa': [-16.0000, -54.9167],
    'Sapezal': [-12.9906, -58.7631],
    'Serra Nova Dourada': [-12.0833, -51.4000],
    'Sinop': [-11.8639, -55.5031],
    'Sorriso': [-12.5431, -55.7097],
    'Tabaporã': [-11.3000, -56.8167],
    'Tangará da Serra': [-14.6219, -57.4258],
    'Tapurah': [-12.5333, -56.5167],
    'Terra Nova do Norte': [-10.5169, -55.2319],
    'Tesouro': [-16.0667, -53.5500],
    'Torixoréu': [-16.2000, -52.5500],
    'União do Sul': [-11.5167, -54.3667],
    'Vale de São Domingos': [-15.2833, -59.0667],
    'Várzea Grande': [-15.6458, -56.1325],
    'Vera': [-12.3000, -55.3167],
    'Vila Bela da Santíssima Trindade': [-15.0000, -59.9500],
    'Vila Rica': [-10.0167, -51.1167]
  };

  // Normalizar nome da cidade para busca
  const cidadeNormalizada = cidade?.trim().toLowerCase() || '';
  const estadoNormalizado = estado?.trim().toUpperCase() || '';

  // Tentar encontrar coordenadas exatas da cidade
  if (coordenadasCidades[cidade]) {
    return coordenadasCidades[cidade];
  }

  // Se não encontrar, usar coordenadas do estado (centro do estado)
  if (coordenadasEstados[estadoNormalizado]) {
    return coordenadasEstados[estadoNormalizado];
  }

  // Fallback: centro do Brasil
  return [-14.2350, -51.9253];
}

// Função para calcular distância entre duas coordenadas (Haversine)
function calcularDistancia(lat1, lon1, lat2, lon2) {
  const R = 6371; // Raio da Terra em km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // Distância em km
}

// Função para calcular valor recomendado de visita técnica
function calcularValorVisita(cidade, estado) {
  // Coordenadas da empresa (Av. Angelo Demarchi 130, Batistini, São Bernardo do Campo)
  const sbcLat = -23.7150;
  const sbcLon = -46.5550;
  
  // Obter coordenadas do cliente
  const coords = obterCoordenadasCidade(cidade, estado);
  if (!coords || coords.length !== 2) {
    return null;
  }
  
  const [clienteLat, clienteLon] = coords;
  
  // Calcular distância
  const distancia = calcularDistancia(sbcLat, sbcLon, clienteLat, clienteLon);
  
  // Verificar se está no raio comum de atendimento (≤ 300km)
  const noRaioComum = distancia <= 300;
  
  // Cálculo de custos
  // Para visitas no raio comum (≤ 300km): custos reduzidos
  // Para visitas além do raio comum: custos normais
  const custoPorKm = noRaioComum ? 0.50 : 0.60; // Reduzido para raio comum
  const custoCombustivel = distancia * custoPorKm * 2; // Ida e volta
  
  // Refeições (reduzido para raio comum)
  const custoRefeicoes = noRaioComum ? 50 : 70; // R$ 50 para raio comum, R$ 70 para distantes
  
  // Pedágios (reduzido para raio comum)
  const custoPedagios = distancia * (noRaioComum ? 0.10 : 0.15) * 2; // Ida e volta
  
  // Estadia (apenas se distância > 300km)
  const custoEstadia = distancia > 300 ? 150 : 0; // R$ 150 por noite
  
  // Custo base (reduzido para raio comum)
  const custoBase = noRaioComum ? 30 : 50; // R$ 30 para raio comum, R$ 50 para distantes
  
  // Calcular total
  const valorTotal = custoBase + custoCombustivel + custoRefeicoes + custoPedagios + custoEstadia;
  
  return {
    valor: Math.round(valorTotal),
    distancia: Math.round(distancia),
    detalhes: {
      combustivel: Math.round(custoCombustivel),
      refeicoes: custoRefeicoes,
      pedagios: Math.round(custoPedagios),
      estadia: custoEstadia,
      base: custoBase
    },
    requerEstadia: distancia > 300,
    noRaioComum: noRaioComum // Flag para indicar se está no raio comum
  };
}

// ========== ROTA DE MAPA DE MÁQUINAS VENDIDAS ==========
app.get('/api/mapa/maquinas-vendidas', authenticateToken, (req, res) => {
  if (!db) {
    return res.status(500).json({ error: 'Banco de dados não está disponível' });
  }

  // Buscar propostas aprovadas com localização dos clientes
  db.all(`
    SELECT 
      c.id as cliente_id,
      c.razao_social,
      c.nome_fantasia,
      c.cidade,
      c.estado,
      COUNT(p.id) as total_maquinas,
      SUM(p.valor_total) as valor_total,
      GROUP_CONCAT(p.titulo, ' | ') as titulos_propostas,
      GROUP_CONCAT(p.numero_proposta, ' | ') as numeros_propostas
    FROM propostas p
    INNER JOIN clientes c ON p.cliente_id = c.id
    WHERE p.status = 'aprovada'
      AND c.status = 'ativo'
      AND c.cidade IS NOT NULL 
      AND c.estado IS NOT NULL
    GROUP BY c.id, c.cidade, c.estado
    ORDER BY valor_total DESC
  `, [], (err, rows) => {
    if (err) {
      console.error('Erro ao buscar máquinas vendidas:', err);
      return res.status(500).json({ error: err.message });
    }

    // Adicionar coordenadas e formatar dados
    // Agrupar por cidade para aplicar offset quando houver múltiplos clientes
    const localizacoesPorCidade = {};
    
    (rows || []).forEach(loc => {
      const chaveCidade = `${loc.cidade}-${loc.estado}`;
      if (!localizacoesPorCidade[chaveCidade]) {
        localizacoesPorCidade[chaveCidade] = [];
      }
      localizacoesPorCidade[chaveCidade].push(loc);
    });

    // Aplicar coordenadas com offset para evitar sobreposição
    const localizacoes = [];
    Object.keys(localizacoesPorCidade).forEach(chaveCidade => {
      const clientesNaCidade = localizacoesPorCidade[chaveCidade];
      const coordenadasBase = obterCoordenadasCidade(clientesNaCidade[0].cidade, clientesNaCidade[0].estado);
      
      // Se houver apenas 1 cliente, não precisa de offset
      if (clientesNaCidade.length === 1) {
        const loc = clientesNaCidade[0];
        localizacoes.push({
          ...loc,
          coordenadas: coordenadasBase,
          titulos_propostas: loc.titulos_propostas ? loc.titulos_propostas.split(' | ') : [],
          numeros_propostas: loc.numeros_propostas ? loc.numeros_propostas.split(' | ') : []
        });
      } else {
        // Múltiplos clientes na mesma cidade - distribuir em círculo com offset muito maior
        const totalClientes = clientesNaCidade.length;
        clientesNaCidade.forEach((loc, index) => {
          // Calcular offset em círculo - offset muito maior para garantir separação visível
          // Cada grau de longitude/latitude ≈ 111km
          const angulo = (index * 360 / totalClientes) * Math.PI / 180;
          // Raio base maior e aumenta com o número de clientes
          const raioBase = 0.15; // ~16.5km de raio base (muito maior)
          const raioAdicional = Math.floor(totalClientes / 4) * 0.1; // Aumenta a cada 4 clientes
          const raio = raioBase + raioAdicional;
          const offsetLat = raio * Math.cos(angulo);
          const offsetLng = raio * Math.sin(angulo);
          
          localizacoes.push({
            ...loc,
            coordenadas: [
              coordenadasBase[0] + offsetLat,
              coordenadasBase[1] + offsetLng
            ],
            titulos_propostas: loc.titulos_propostas ? loc.titulos_propostas.split(' | ') : [],
            numeros_propostas: loc.numeros_propostas ? loc.numeros_propostas.split(' | ') : []
          });
        });
      }
    });

    res.json({
      localizacoes: localizacoes.filter(loc => loc.coordenadas && loc.coordenadas.length === 2),
      total: localizacoes.length,
      total_maquinas: localizacoes.reduce((sum, loc) => sum + (loc.total_maquinas || 0), 0),
      valor_total: localizacoes.reduce((sum, loc) => sum + (loc.valor_total || 0), 0)
    });
  });
});

// ========== ROTA DE VISITAS TÉCNICAS ==========
app.get('/api/relatorios/visitas-tecnicas', authenticateToken, (req, res) => {
  if (!db) {
    return res.status(500).json({ error: 'Banco de dados não está disponível' });
  }

  // Buscar clientes com análise de elegibilidade para visita técnica
  db.all(`
    SELECT 
      c.id,
      c.razao_social,
      c.nome_fantasia,
      c.cidade,
      c.estado,
      c.telefone,
      c.email,
      COUNT(DISTINCT p.id) as total_propostas,
      COUNT(DISTINCT CASE WHEN p.status = 'aprovada' THEN p.id END) as propostas_aprovadas,
      COUNT(DISTINCT CASE WHEN p.status IN ('aprovada', 'rejeitada', 'enviada') THEN p.id END) as propostas_processadas,
      CASE 
        WHEN COUNT(DISTINCT CASE WHEN p.status IN ('aprovada', 'rejeitada', 'enviada') THEN p.id END) > 0 
        THEN (COUNT(DISTINCT CASE WHEN p.status = 'aprovada' THEN p.id END) * 100.0 / COUNT(DISTINCT CASE WHEN p.status IN ('aprovada', 'rejeitada', 'enviada') THEN p.id END))
        ELSE 0 
      END as taxa_conversao,
      SUM(CASE WHEN p.status = 'aprovada' THEN p.valor_total ELSE 0 END) as valor_total_aprovado,
      MAX(p.created_at) as ultima_proposta_data,
      COUNT(DISTINCT CASE WHEN p.created_at >= date('now', '-90 days') THEN p.id END) as propostas_ultimos_90_dias
    FROM clientes c
    LEFT JOIN propostas p ON c.id = p.cliente_id
    WHERE c.status = 'ativo'
    GROUP BY c.id
    HAVING total_propostas > 0
    ORDER BY valor_total_aprovado DESC, taxa_conversao DESC
  `, [], (err, rows) => {
    if (err) {
      console.error('Erro ao buscar dados para visitas técnicas:', err);
      return res.status(500).json({ error: err.message });
    }

    const visitas = (rows || []).map(cliente => {
      const taxaConversao = cliente.taxa_conversao || 0;
      const temPropostas = cliente.total_propostas > 0;
      const propostasProcessadas = cliente.propostas_processadas || 0;
      const valorAprovado = cliente.valor_total_aprovado || 0;
      const temPropostasRecentes = cliente.propostas_ultimos_90_dias > 0;

      // Regras de elegibilidade
      const regras = {
        temPropostas: {
          passou: temPropostas,
          mensagem: temPropostas ? 'Cliente possui propostas' : 'Cliente não possui propostas cadastradas',
          obrigatorio: true
        },
        taxaConversaoMinima: {
          passou: taxaConversao >= 10,
          mensagem: taxaConversao >= 10 
            ? `Taxa de conversão de ${taxaConversao.toFixed(1)}% está acima do mínimo recomendado (10%)`
            : `Taxa de conversão de ${taxaConversao.toFixed(1)}% está abaixo do mínimo recomendado (10%)`,
          obrigatorio: false
        },
        temPropostasProcessadas: {
          passou: propostasProcessadas > 0,
          mensagem: propostasProcessadas > 0 
            ? `Possui ${propostasProcessadas} proposta(s) processada(s)`
            : 'Não possui propostas processadas (aprovadas, rejeitadas ou enviadas)',
          obrigatorio: true
        },
        valorMinimo: {
          passou: valorAprovado >= 50000,
          mensagem: valorAprovado >= 50000
            ? `Valor aprovado de R$ ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valorAprovado)} atende o mínimo`
            : `Valor aprovado de R$ ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valorAprovado)} está abaixo do mínimo recomendado (R$ 50.000)`,
          obrigatorio: false
        },
        atividadeRecente: {
          passou: temPropostasRecentes,
          mensagem: temPropostasRecentes
            ? 'Cliente teve propostas nos últimos 90 dias'
            : 'Cliente não teve propostas nos últimos 90 dias',
          obrigatorio: false
        }
      };

      // Calcular se está elegível
      const regrasObrigatorias = Object.values(regras).filter(r => r.obrigatorio);
      const todasObrigatoriasPassaram = regrasObrigatorias.every(r => r.passou);
      const regrasOpcionais = Object.values(regras).filter(r => !r.obrigatorio);
      const regrasOpcionaisPassaram = regrasOpcionais.filter(r => r.passou).length;
      const pontuacao = regrasOpcionais.length > 0 ? (regrasOpcionaisPassaram / regrasOpcionais.length) * 100 : 100;

      const elegivel = todasObrigatoriasPassaram;
      const prioridade = elegivel 
        ? (pontuacao >= 80 ? 'Alta' : pontuacao >= 50 ? 'Média' : 'Baixa')
        : 'Não elegível';

      // Calcular valor recomendado da visita
      const valorVisita = calcularValorVisita(cliente.cidade, cliente.estado);

      return {
        ...cliente,
        taxa_conversao: taxaConversao,
        regras,
        elegivel,
        prioridade,
        pontuacao: Math.round(pontuacao),
        motivoBloqueio: todasObrigatoriasPassaram 
          ? null 
          : regrasObrigatorias.filter(r => !r.passou).map(r => r.mensagem).join('; '),
        valor_visita: valorVisita
      };
    });

    // Separar elegíveis e não elegíveis
    const elegiveis = visitas.filter(v => v.elegivel);
    const naoElegiveis = visitas.filter(v => !v.elegivel);

    res.json({
      elegiveis: elegiveis.sort((a, b) => {
        // Ordenar por prioridade e depois por valor
        const prioridadeOrder = { 'Alta': 3, 'Média': 2, 'Baixa': 1 };
        if (prioridadeOrder[a.prioridade] !== prioridadeOrder[b.prioridade]) {
          return prioridadeOrder[b.prioridade] - prioridadeOrder[a.prioridade];
        }
        return (b.valor_total_aprovado || 0) - (a.valor_total_aprovado || 0);
      }),
      naoElegiveis: naoElegiveis,
      total: visitas.length,
      totalElegiveis: elegiveis.length,
      totalNaoElegiveis: naoElegiveis.length
    });
  });
});

// Função para gerar recomendações estratégicas
function gerarRecomendacoes(dados, callback) {
  const recomendacoes = [];

  // Recomendação 1: Clientes para visitar
  if (dados.insights.clientesParaVisitar && dados.insights.clientesParaVisitar.length > 0) {
    const topClientes = dados.insights.clientesParaVisitar.slice(0, 5);
    recomendacoes.push({
      tipo: 'visita',
      titulo: 'Clientes que Precisam de Visita',
      descricao: `Identificamos ${dados.insights.clientesParaVisitar.length} clientes que não recebem propostas há mais de 90 dias.`,
      acao: `Priorizar visitas aos principais clientes: ${topClientes.map(c => c.razao_social).join(', ')}`,
      impacto: 'Alto',
      prioridade: 'Alta'
    });
  }

  // Recomendação 2: Regiões com mais oportunidades
  if (dados.insights.regioesOportunidades && dados.insights.regioesOportunidades.length > 0) {
    const topRegiao = dados.insights.regioesOportunidades[0];
    recomendacoes.push({
      tipo: 'regiao',
      titulo: 'Foco em Região Promissora',
      descricao: `${topRegiao.estado} concentra R$ ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(topRegiao.valor_total)} em oportunidades.`,
      acao: `Aumentar investimento em marketing e vendas no estado de ${topRegiao.estado}`,
      impacto: 'Alto',
      prioridade: 'Alta'
    });
  }

  // Recomendação 3: Origem de busca mais eficaz
  if (dados.insights.origemBusca && dados.insights.origemBusca.length > 0) {
    const melhorOrigem = dados.insights.origemBusca[0];
    if (melhorOrigem.taxa_conversao > 30) {
      recomendacoes.push({
        tipo: 'marketing',
        titulo: 'Investir em Origem de Busca Eficaz',
        descricao: `${melhorOrigem.origem_busca} apresenta ${melhorOrigem.taxa_conversao.toFixed(1)}% de taxa de conversão.`,
        acao: `Aumentar investimento em marketing para ${melhorOrigem.origem_busca}`,
        impacto: 'Médio',
        prioridade: 'Média'
      });
    }
  }

  // Recomendação 4: Família de produtos
  if (dados.insights.familiaProdutos && dados.insights.familiaProdutos.length > 0) {
    const topFamilia = dados.insights.familiaProdutos[0];
    recomendacoes.push({
      tipo: 'produto',
      titulo: 'Família de Produtos com Melhor Performance',
      descricao: `${topFamilia.familia_produto} gera R$ ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(topFamilia.valor_aprovado)} em vendas aprovadas.`,
      acao: `Focar estratégias de vendas e marketing em ${topFamilia.familia_produto}`,
      impacto: 'Alto',
      prioridade: 'Alta'
    });
  }

  // Recomendação 5: Taxa de conversão
  if (dados.kpis.taxaConversao < 30) {
    recomendacoes.push({
      tipo: 'estrategia',
      titulo: 'Melhorar Taxa de Conversão',
      descricao: `A taxa de conversão atual é ${dados.kpis.taxaConversao.toFixed(1)}%, abaixo do ideal.`,
      acao: 'Revisar processo de vendas, treinamento da equipe e qualidade das propostas',
      impacto: 'Alto',
      prioridade: 'Alta'
    });
  }

  callback(recomendacoes);
}

// Função para extrair iniciais do nome
function extrairIniciais(nome) {
  if (!nome) return 'XX';
  
  const palavras = nome.trim().split(/\s+/);
  if (palavras.length === 0) return 'XX';
  
  if (palavras.length === 1) {
    // Se só tem uma palavra, pegar as duas primeiras letras
    return palavras[0].substring(0, 2).toUpperCase().padEnd(2, 'X');
  }
  
  // Pegar primeira letra de cada palavra (máximo 2)
  const iniciais = palavras
    .slice(0, 2)
    .map(palavra => palavra.charAt(0).toUpperCase())
    .join('');
  
  return iniciais.padEnd(2, 'X');
}

// Função para comparar dados e gerar log de mudanças
function compararDados(dadosAnteriores, dadosNovos) {
  const mudancas = [];
  const campos = [
    { nome: 'titulo', label: 'Título' },
    { nome: 'descricao', label: 'Descrição' },
    { nome: 'valor_total', label: 'Valor Total' },
    { nome: 'validade', label: 'Validade' },
    { nome: 'condicoes_pagamento', label: 'Condições de Pagamento' },
    { nome: 'prazo_entrega', label: 'Prazo de Entrega' },
    { nome: 'garantia', label: 'Garantia' },
    { nome: 'observacoes', label: 'Observações' },
    { nome: 'status', label: 'Status' },
    { nome: 'familia_produto', label: 'Família de Produto' },
    { nome: 'lembrete_data', label: 'Data do Lembrete' },
    { nome: 'lembrete_mensagem', label: 'Mensagem do Lembrete' }
  ];

  campos.forEach(campo => {
    const valorAnterior = dadosAnteriores[campo.nome] || '';
    const valorNovo = dadosNovos[campo.nome] || '';
    
    if (String(valorAnterior) !== String(valorNovo)) {
      mudancas.push({
        campo: campo.label,
        anterior: valorAnterior || '(vazio)',
        novo: valorNovo || '(vazio)'
      });
    }
  });

  // Comparar cliente
  if (dadosAnteriores.cliente_id !== dadosNovos.cliente_id) {
    mudancas.push({
      campo: 'Cliente',
      anterior: dadosAnteriores.cliente_id || '(nenhum)',
      novo: dadosNovos.cliente_id || '(nenhum)'
    });
  }

  // Comparar projeto
  if (dadosAnteriores.projeto_id !== dadosNovos.projeto_id) {
    mudancas.push({
      campo: 'Projeto',
      anterior: dadosAnteriores.projeto_id || '(nenhum)',
      novo: dadosNovos.projeto_id || '(nenhum)'
    });
  }

  // Comparar responsável
  if (dadosAnteriores.responsavel_id !== dadosNovos.responsavel_id) {
    mudancas.push({
      campo: 'Responsável',
      anterior: dadosAnteriores.responsavel_id || '(nenhum)',
      novo: dadosNovos.responsavel_id || '(nenhum)'
    });
  }

  return mudancas;
}

// Função para gerar número da proposta automaticamente
// Formato: 001-01-MH-2026-REV00
// Onde: numero_propostas_enviadas_em_geral - numero_propostas_enviadas_para_esse_cliente - iniciais_vendedor - ano - revisão
function gerarNumeroProposta(cliente_id, responsavel_id, revisao, callback) {
  if (!cliente_id) {
    return callback(null, null);
  }

  // Primeiro, contar o total de TODAS as propostas (incluindo rascunhos)
  // IMPORTANTE: Contar TODAS, não apenas as enviadas, para ter o número sequencial correto do software
  db.get(`SELECT COUNT(*) as total FROM propostas`, [], (err, totalResult) => {
    if (err) {
      return callback(err, null);
    }
    
    const quantidadeGeral = ((totalResult?.total || 0) + 1).toString().padStart(3, '0');
    
    // Buscar dados do cliente
    db.get('SELECT razao_social, nome_fantasia FROM clientes WHERE id = ?', [cliente_id], (err, cliente) => {
      if (err || !cliente) {
        return callback(err, null);
      }
      
      // Buscar dados do vendedor (responsável)
      const vendedorId = responsavel_id || null;
      
      if (!vendedorId) {
        // Se não tiver vendedor, usar iniciais padrão
        const iniciaisVendedor = 'XX';
        continuarGeracao(quantidadeGeral, iniciaisVendedor, revisao);
      } else {
        db.get('SELECT nome FROM usuarios WHERE id = ?', [vendedorId], (err, vendedor) => {
          if (err) {
            return callback(err, null);
          }
          
          const iniciaisVendedor = extrairIniciais(vendedor?.nome || '');
          continuarGeracao(quantidadeGeral, iniciaisVendedor, revisao);
        });
      }
      
      function continuarGeracao(qtdGeral, iniciais, rev) {
        // Contar quantas propostas TODAS já existem para esse cliente (incluindo rascunhos)
        // IMPORTANTE: Contar TODAS, não apenas as enviadas, para ter o número sequencial correto do cliente
        db.get(`SELECT COUNT(*) as total FROM propostas WHERE cliente_id = ?`, [cliente_id], (err, countResult) => {
          if (err) {
            return callback(err, null);
          }
          
          const quantidadeCliente = ((countResult?.total || 0) + 1).toString().padStart(2, '0');
          
          // Ano atual
          const ano = new Date().getFullYear().toString();
          
          // Formato da revisão: REV00, REV01, etc.
          const revisaoFormatada = `REV${rev.toString().padStart(2, '0')}`;
          
          // Gerar número: quantidade geral - quantidade cliente - iniciais vendedor - ano - revisão
          const numeroProposta = `${qtdGeral}-${quantidadeCliente}-${iniciais}-${ano}-${revisaoFormatada}`;
          
          console.log('📝 Número gerado:', numeroProposta, '- Geral:', qtdGeral, 'Cliente:', quantidadeCliente, 'Iniciais:', iniciais, 'Ano:', ano, 'Rev:', revisaoFormatada);
          callback(null, numeroProposta);
        });
      }
    });
  });
}

// Função para gerar número da proposta com verificação de duplicatas (para edição)
// Formato: 001-01-MH-2026-REV00
// Onde: numero_propostas_TODAS_em_geral - numero_propostas_TODAS_para_esse_cliente - iniciais_vendedor - ano - revisão
// IMPORTANTE: Contar TODAS as propostas (incluindo rascunhos), não apenas as enviadas
function gerarNumeroPropostaComVerificacao(cliente_id, responsavel_id, revisao, proposta_id_atual, callback) {
  if (!cliente_id) {
    return callback(null, null);
  }

  // Primeiro, contar o total de TODAS as propostas (incluindo rascunhos)
  // IMPORTANTE: Contar TODAS, não apenas as enviadas, para ter o número sequencial correto do software
  db.get(`SELECT COUNT(*) as total FROM propostas`, [], (err, totalResult) => {
    if (err) {
      return callback(err, null);
    }
    
    const quantidadeGeral = ((totalResult?.total || 0) + 1).toString().padStart(3, '0');
    
    // Buscar dados do cliente
    db.get('SELECT razao_social, nome_fantasia FROM clientes WHERE id = ?', [cliente_id], (err, cliente) => {
      if (err || !cliente) {
        return callback(err, null);
      }
      
      // Buscar dados do vendedor (responsável)
      const vendedorId = responsavel_id || null;
      
      if (!vendedorId) {
        const iniciaisVendedor = 'XX';
        continuarGeracaoComVerificacao(quantidadeGeral, iniciaisVendedor, revisao, proposta_id_atual);
      } else {
        db.get('SELECT nome FROM usuarios WHERE id = ?', [vendedorId], (err, vendedor) => {
          if (err) {
            return callback(err, null);
          }
          
          const iniciaisVendedor = extrairIniciais(vendedor?.nome || '');
          continuarGeracaoComVerificacao(quantidadeGeral, iniciaisVendedor, revisao, proposta_id_atual);
        });
      }
      
      function continuarGeracaoComVerificacao(qtdGeral, iniciais, rev, propostaIdAtual) {
        // Contar quantas propostas TODAS já existem para esse cliente (incluindo rascunhos)
        // IMPORTANTE: Contar TODAS, não apenas as enviadas, para ter o número sequencial correto do cliente
        db.get(`SELECT COUNT(*) as total FROM propostas WHERE cliente_id = ?`, [cliente_id], (err, countResult) => {
          if (err) {
            return callback(err, null);
          }
          
          const quantidadeCliente = ((countResult?.total || 0) + 1).toString().padStart(2, '0');
          const ano = new Date().getFullYear().toString();
          const revisaoFormatada = `REV${rev.toString().padStart(2, '0')}`;
          
          // Gerar número: quantidade geral - quantidade cliente - iniciais vendedor - ano - revisão
          const numeroProposta = `${qtdGeral}-${quantidadeCliente}-${iniciais}-${ano}-${revisaoFormatada}`;
          
          // Verificar se o número já existe
          db.get(`SELECT id FROM propostas WHERE numero_proposta = ?`, [numeroProposta], (err, existing) => {
            if (err) {
              return callback(err, null);
            }
            
            // Se não existe, ou se existe mas é a própria proposta sendo editada, usar o número
            if (!existing || (existing && existing.id === propostaIdAtual)) {
              return callback(null, numeroProposta);
            }
            
            // Se existe e não é a proposta atual, incrementar quantidade geral
            const quantidadeGeralAjustada = ((totalResult?.total || 0) + 2).toString().padStart(3, '0');
            const numeroPropostaAjustado = `${quantidadeGeralAjustada}-${quantidadeCliente}-${iniciais}-${ano}-${revisaoFormatada}`;
            
            // Verificar novamente
            db.get(`SELECT id FROM propostas WHERE numero_proposta = ?`, [numeroPropostaAjustado], (err, existing2) => {
              if (err) {
                return callback(err, null);
              }
              
              if (!existing2 || (existing2 && existing2.id === propostaIdAtual)) {
                return callback(null, numeroPropostaAjustado);
              }
              
              // Se ainda existe, adicionar sufixo único
              const timestamp = Date.now().toString().slice(-6);
              const numeroPropostaFinal = `${quantidadeGeralAjustada}-${quantidadeCliente}-${iniciais}-${ano}-${revisaoFormatada}-${timestamp}`;
              callback(null, numeroPropostaFinal);
            });
          });
        });
      }
    });
  });
}

app.post('/api/propostas', authenticateToken, (req, res) => {
  try {
    normalizarMaiusculas(req.body, ['titulo', 'descricao', 'condicoes_pagamento', 'prazo_entrega', 'garantia', 'observacoes', 'origem_busca', 'motivo_nao_venda', 'familia_produto', 'lembrete_mensagem', 'cliente_contato']);
    if (req.body.itens && Array.isArray(req.body.itens)) {
      for (var i = 0; i < req.body.itens.length; i++) {
        normalizarMaiusculas(req.body.itens[i], ['descricao', 'unidade', 'codigo_produto', 'familia_produto']);
      }
    }
    const {
      cliente_id, projeto_id, numero_proposta, titulo, descricao, valor_total,
      validade, condicoes_pagamento, prazo_entrega, garantia, observacoes, status: statusOriginal,
      responsavel_id, origem_busca, motivo_nao_venda, familia_produto,
      lembrete_data, lembrete_mensagem, margem_desconto, itens,
      cliente_contato, cliente_telefone, cliente_email,
      oportunidade_id, tipo_proposta, expira_em,
      idioma, moeda, incoterm, unidade_negocio
    } = req.body;
    
    // Usar variável mutável para status
    let status = statusOriginal;

    console.log('📥 POST /api/propostas - Dados recebidos:', {
      cliente_id,
      titulo,
      status,
      margem_desconto,
      temItens: itens && Array.isArray(itens) ? itens.length : 0
    });

  if (!titulo) {
    return res.status(400).json({ error: 'Título é obrigatório' });
  }

  // Validar e normalizar projeto_id (deve ser NULL se vazio, 0 ou inválido)
  let projetoIdFinal = null;
  if (projeto_id) {
    const projetoIdNum = parseInt(projeto_id);
    if (!isNaN(projetoIdNum) && projetoIdNum > 0) {
      projetoIdFinal = projetoIdNum;
    }
  }
  
  // Validar cliente_id
  if (!cliente_id) {
    return res.status(400).json({ error: 'Cliente é obrigatório' });
  }
  const clienteIdNum = parseInt(cliente_id);
  if (isNaN(clienteIdNum) || clienteIdNum <= 0) {
    return res.status(400).json({ error: 'Cliente inválido' });
  }
  
  // Validar responsavel_id e created_by
  const finalResponsavelId = responsavel_id || req.user.id;
  const responsavelIdNum = parseInt(finalResponsavelId);
  const createdByIdNum = parseInt(req.user.id);
  if (isNaN(responsavelIdNum) || responsavelIdNum <= 0) {
    return res.status(400).json({ error: 'Responsável inválido' });
  }
  if (isNaN(createdByIdNum) || createdByIdNum <= 0) {
    return res.status(400).json({ error: 'Usuário inválido' });
  }

  // VALIDAÇÃO: Se desconto > 5% e status não for rascunho, verificar se há aprovação aprovada
  // Permitir salvar como rascunho mesmo sem aprovação
  if (margem_desconto > 5 && status && status !== 'rascunho') {
    // Para novas propostas com status diferente de rascunho, não permitir salvar sem aprovação
    return res.status(403).json({ 
      error: 'Não é possível salvar uma proposta com desconto acima de 5% sem aprovação prévia. A proposta deve ser salva como rascunho até que a autorização seja aprovada.' 
    });
  }
  
  // Se desconto > 5% e não tem status definido ou é rascunho, forçar status rascunho
  if (margem_desconto > 5 && (!status || status === 'rascunho')) {
    status = 'rascunho';
  }

  // Gerar número da proposta automaticamente se não fornecido
  const processarProposta = (numeroGerado) => {
    const numeroFinal = numero_proposta || numeroGerado;
    
    if (!numeroFinal) {
      return res.status(400).json({ error: 'Não foi possível gerar o número da proposta. Cliente é obrigatório.' });
    }

    // Verificar se o número da proposta já existe antes de inserir
    db.get(`SELECT id FROM propostas WHERE numero_proposta = ?`, [numeroFinal], (err, existing) => {
      if (err) {
        console.error('❌ Erro ao verificar número da proposta:', err);
        return res.status(500).json({ error: 'Erro ao verificar número da proposta: ' + err.message });
      }
      if (existing) {
        console.warn('⚠️ Número da proposta já existe:', numeroFinal, 'ID existente:', existing.id);
        // Se o número foi fornecido manualmente e já existe, retornar erro
        if (numero_proposta) {
          return res.status(400).json({ 
            error: `O número da proposta "${numeroFinal}" já está em uso. Por favor, remova o número da proposta e deixe o sistema gerar automaticamente, ou use outro número.`,
            numero_existente: numeroFinal
          });
        }
        // Se foi gerado automaticamente e já existe, tentar gerar um novo
        console.log('🔄 Tentando gerar novo número da proposta...');
        gerarNumeroPropostaComVerificacao(clienteIdNum, responsavelIdNum, 0, null, (err2, novoNumero) => {
          if (err2 || !novoNumero) {
            console.error('❌ Erro ao gerar novo número da proposta:', err2);
            return res.status(500).json({ 
              error: 'Não foi possível gerar um número único para a proposta. Tente novamente.' 
            });
          }
          console.log('✅ Novo número gerado:', novoNumero);
          // Recursivamente tentar salvar com o novo número
          return processarProposta(novoNumero);
        });
        return;
      }

      db.run(
        `INSERT INTO propostas (cliente_id, projeto_id, numero_proposta, titulo, descricao, valor_total,
          validade, condicoes_pagamento, prazo_entrega, garantia, observacoes, status,
          responsavel_id, created_by, motivo_nao_venda, origem_busca, familia_produto,
          lembrete_data, lembrete_mensagem, margem_desconto, revisao,
          cliente_contato, cliente_telefone, cliente_email, oportunidade_id, tipo_proposta, expira_em,
          idioma, moeda, incoterm, unidade_negocio)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [clienteIdNum, projetoIdFinal, numeroFinal, titulo, descricao, valor_total || 0,
          validade || null, condicoes_pagamento || '', prazo_entrega || '', garantia || '', observacoes || '', status || 'rascunho',
          responsavelIdNum, createdByIdNum, motivo_nao_venda || null, origem_busca || null,
          familia_produto || null, lembrete_data || null, lembrete_mensagem || null, margem_desconto || 0, 0,
          cliente_contato || null, cliente_telefone || null, cliente_email || null,
          oportunidade_id != null ? oportunidade_id : null, tipo_proposta || null, expira_em || null,
          idioma || null, moeda || null, incoterm || null, unidade_negocio || null],
        function(err) {
          if (err) {
            console.error('❌ Erro ao inserir proposta:', err);
            console.error('❌ SQL Error Code:', err.code);
            console.error('❌ SQL Error Message:', err.message);
            console.error('❌ Dados sendo inseridos:', {
              clienteIdNum,
              projetoIdFinal,
              numeroFinal,
              titulo,
              status: status || 'rascunho',
              margem_desconto: margem_desconto || 0
            });
            // Verificar se é erro de UNIQUE constraint
            if (err.message && err.message.includes('UNIQUE constraint') && err.message.includes('numero_proposta')) {
              console.error('❌ Erro: Número da proposta duplicado:', numeroFinal);
              return res.status(400).json({ 
                error: `O número da proposta "${numeroFinal}" já está em uso. Por favor, remova o número da proposta e deixe o sistema gerar automaticamente, ou use outro número.` 
              });
            }
            return res.status(500).json({ error: 'Erro ao salvar proposta: ' + err.message });
          }

        const propostaId = this.lastID;
        console.log('✅ Proposta criada com ID:', propostaId);

        // Inserir itens
        if (itens && Array.isArray(itens) && itens.length > 0) {
          try {
            const stmt = db.prepare(
              `INSERT INTO proposta_itens (proposta_id, descricao, quantidade, unidade,
                valor_unitario, valor_total, codigo_produto, familia_produto, regiao_busca,
                tag, modelo, categoria, descricao_resumida, descritivo_tecnico, dados_processo,
                materiais_construtivos, utilidades_requeridas, opcionais, exclusoes, prazo_individual, numero_item)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            );

            itens.forEach((item, index) => {
              try {
                stmt.run([
                  propostaId,
                  item.descricao || item.nome || '',
                  item.quantidade || 1,
                  item.unidade || 'UN',
                  item.valor_unitario || 0,
                  item.valor_total || 0,
                  item.codigo_produto || null,
                  item.familia_produto || null,
                  item.regiao_busca || null,
                  item.tag || null,
                  item.modelo || null,
                  item.categoria || null,
                  item.descricao_resumida || null,
                  item.descritivo_tecnico || null,
                  item.dados_processo || null,
                  item.materiais_construtivos || null,
                  item.utilidades_requeridas || null,
                  item.opcionais || null,
                  item.exclusoes || null,
                  item.prazo_individual || null,
                  item.numero_item != null ? item.numero_item : (index + 1)
                ]);
              } catch (itemErr) {
                console.error(`❌ Erro ao inserir item ${index}:`, itemErr);
                console.error(`❌ Item que causou erro:`, item);
              }
            });

            stmt.finalize((finalizeErr) => {
              if (finalizeErr) {
                console.error('❌ Erro ao finalizar statement:', finalizeErr);
              }
              console.log('✅ Proposta salva com sucesso. ID:', propostaId, 'Número:', numeroFinal);
              res.json({ id: propostaId, numero_proposta: numeroFinal, ...req.body });
            });
          } catch (stmtErr) {
            console.error('❌ Erro ao preparar statement para itens:', stmtErr);
            // Continuar mesmo se houver erro ao inserir itens
            console.log('✅ Proposta salva com sucesso (sem itens). ID:', propostaId, 'Número:', numeroFinal);
            res.json({ id: propostaId, numero_proposta: numeroFinal, ...req.body });
          }
        } else {
          console.log('✅ Proposta salva com sucesso. ID:', propostaId, 'Número:', numeroFinal);
          res.json({ id: propostaId, numero_proposta: numeroFinal, ...req.body });
        }
      }
    );
    }); // Fecha callback do db.get
  }; // Fecha processarProposta

  // Se número não foi fornecido, gerar automaticamente
  if (!numero_proposta && clienteIdNum) {
    try {
      gerarNumeroProposta(clienteIdNum, responsavelIdNum, 0, (err, numeroGerado) => {
        if (err) {
          console.error('❌ Erro ao gerar número da proposta:', err);
          return res.status(500).json({ error: 'Erro ao gerar número da proposta: ' + err.message });
        }
        if (!numeroGerado) {
          console.error('❌ Número da proposta não foi gerado');
          return res.status(500).json({ error: 'Não foi possível gerar o número da proposta' });
        }
        processarProposta(numeroGerado);
      });
    } catch (error) {
      console.error('❌ Erro ao chamar gerarNumeroProposta:', error);
      return res.status(500).json({ error: 'Erro ao processar proposta: ' + error.message });
    }
  } else if (numero_proposta) {
    // Se número foi fornecido, usar diretamente
    try {
      processarProposta(numero_proposta);
    } catch (error) {
      console.error('❌ Erro ao processar proposta:', error);
      return res.status(500).json({ error: 'Erro ao processar proposta: ' + error.message });
    }
  } else {
    // Se não tem número nem cliente, erro
    console.error('❌ Cliente não fornecido para gerar número da proposta');
    return res.status(400).json({ error: 'Cliente é obrigatório para gerar o número da proposta automaticamente' });
  }
  } catch (error) {
    console.error('❌ Erro geral ao processar POST /api/propostas:', error);
    console.error('❌ Stack trace:', error.stack);
    return res.status(500).json({ error: 'Erro interno do servidor: ' + error.message });
  }
});

app.put('/api/propostas/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  normalizarMaiusculas(req.body, ['titulo', 'descricao', 'condicoes_pagamento', 'prazo_entrega', 'garantia', 'observacoes', 'origem_busca', 'motivo_nao_venda', 'familia_produto', 'lembrete_mensagem', 'cliente_contato']);
  if (req.body.itens && Array.isArray(req.body.itens)) {
    for (var i = 0; i < req.body.itens.length; i++) {
      normalizarMaiusculas(req.body.itens[i], ['descricao', 'unidade', 'codigo_produto', 'familia_produto']);
    }
  }
  const {
    cliente_id, projeto_id, numero_proposta, titulo, descricao, valor_total,
    validade, condicoes_pagamento, prazo_entrega, garantia, observacoes, status,
    responsavel_id, origem_busca, motivo_nao_venda, familia_produto,
    lembrete_data, lembrete_mensagem, margem_desconto, itens,
    cliente_contato, cliente_telefone, cliente_email,
    oportunidade_id, tipo_proposta, expira_em,
    idioma, moeda, incoterm, unidade_negocio
  } = req.body;

  // Buscar proposta atual completa para comparação
  db.get(`SELECT * FROM propostas WHERE id = ?`, [id], (err, propostaAtual) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    if (!propostaAtual) {
      return res.status(404).json({ error: 'Proposta não encontrada' });
    }
    
    // Regra enterprise: só editar proposta em rascunho (Salesforce-like)
    if (propostaAtual.status && propostaAtual.status !== 'rascunho') {
      return res.status(400).json({
        error: 'Só é possível editar proposta em rascunho. Use "Nova revisão" para criar uma nova versão editável.'
      });
    }
    
    // VALIDAÇÃO: Se desconto > 5% e status não for rascunho, verificar se há aprovação aprovada
    if (margem_desconto > 5 && status && status !== 'rascunho') {
      // Verificar se existe uma aprovação aprovada para esta proposta com este desconto
      // Usar comparação com tolerância para valores decimais (evita problemas de precisão)
      const margemDescontoArredondada = Math.round(margem_desconto * 100) / 100;
      
      db.all(
        `SELECT id, valor_desconto FROM aprovacoes 
         WHERE proposta_id = ? 
         AND status = 'aprovado' 
         AND tipo = 'desconto'`,
        [id],
        (err, aprovacoes) => {
          if (err) {
            console.error('Erro ao verificar aprovação:', err);
            return res.status(500).json({ error: 'Erro ao verificar aprovação de desconto' });
          }
          
          console.log('🔍 Verificando aprovações:', {
            propostaId: id,
            margemDesconto: margem_desconto,
            margemDescontoArredondada,
            aprovacoesEncontradas: aprovacoes
          });
          
          // Verificar se alguma aprovação tem valor de desconto compatível (com tolerância)
          const temAprovacao = aprovacoes && aprovacoes.some(ap => {
            const valorDescontoArredondado = Math.round((ap.valor_desconto || 0) * 100) / 100;
            return Math.abs(valorDescontoArredondado - margemDescontoArredondada) < 0.01; // Tolerância de 0.01%
          });
          
          if (!temAprovacao) {
            console.error('❌ Nenhuma aprovação encontrada para o desconto:', margem_desconto);
            return res.status(403).json({ 
              error: 'Não é possível alterar o status de uma proposta com desconto acima de 5% sem aprovação prévia. A proposta deve permanecer como rascunho até que a autorização seja aprovada.' 
            });
          }
          
          console.log('✅ Aprovação encontrada, permitindo alteração de status');
          // Se tem aprovação, continuar com o processo normal
          continuarAtualizacao();
        }
      );
    } else {
      // Se desconto <= 5% ou é rascunho, continuar normalmente
      continuarAtualizacao();
    }
    
    function continuarAtualizacao() {
      const revisaoAtual = propostaAtual.revisao || 0;
      const finalResponsavelId = responsavel_id || propostaAtual.responsavel_id || req.user.id;
      
      // Função auxiliar para comparar itens
      function compararItens(itensAtuais, itensNovos) {
        // Se número de itens mudou, retornar true
        if (itensAtuais.length !== itensNovos.length) {
          return true;
        }
        
        // Normalizar itens para comparação (remover IDs e campos não relevantes)
        const normalizarItem = (item) => ({
          descricao: (item.descricao || '').trim(),
          quantidade: parseFloat(item.quantidade) || 0,
          unidade: (item.unidade || 'UN').trim(),
          valor_unitario: Math.round((parseFloat(item.valor_unitario) || 0) * 100) / 100,
          valor_total: Math.round((parseFloat(item.valor_total) || 0) * 100) / 100,
          codigo_produto: (item.codigo_produto || '').trim(),
          familia_produto: (item.familia_produto || '').trim()
        });
        
        const itensAtuaisNorm = itensAtuais.map(normalizarItem).sort((a, b) => 
          (a.descricao + a.codigo_produto).localeCompare(b.descricao + b.codigo_produto)
        );
        const itensNovosNorm = itensNovos.map(normalizarItem).sort((a, b) => 
          (a.descricao + a.codigo_produto).localeCompare(b.descricao + b.codigo_produto)
        );
        
        // Comparar cada item
        for (let i = 0; i < itensAtuaisNorm.length; i++) {
          const itemAtual = itensAtuaisNorm[i];
          const itemNovo = itensNovosNorm[i];
          
          if (itemAtual.descricao !== itemNovo.descricao ||
              itemAtual.quantidade !== itemNovo.quantidade ||
              itemAtual.unidade !== itemNovo.unidade ||
              itemAtual.valor_unitario !== itemNovo.valor_unitario ||
              itemAtual.valor_total !== itemNovo.valor_total ||
              itemAtual.codigo_produto !== itemNovo.codigo_produto ||
              itemAtual.familia_produto !== itemNovo.familia_produto) {
            return true;
          }
        }
        
        return false;
      }
      
      // Buscar itens atuais da proposta para comparação
      db.all('SELECT * FROM proposta_itens WHERE proposta_id = ? ORDER BY id', [id], (err, itensAtuais) => {
        if (err) {
          return res.status(500).json({ error: 'Erro ao buscar itens da proposta: ' + err.message });
        }
        
        // Comparar valor total (com tolerância para decimais)
        const valorTotalAtual = Math.round((parseFloat(propostaAtual.valor_total) || 0) * 100) / 100;
        const valorTotalNovo = Math.round((parseFloat(valor_total) || 0) * 100) / 100;
        const valorTotalMudou = Math.abs(valorTotalAtual - valorTotalNovo) > 0.01;
        
        // Comparar itens
        const itensNovos = (itens && Array.isArray(itens)) ? itens : [];
        const itensMudaram = compararItens(itensAtuais || [], itensNovos);
        
        // Só incrementar revisão se itens ou valor total mudaram
        const deveIncrementarRevisao = itensMudaram || valorTotalMudou;
        const novaRevisao = deveIncrementarRevisao ? revisaoAtual + 1 : revisaoAtual;
        
        console.log('🔍 Verificação de revisão:', {
          propostaId: id,
          revisaoAtual,
          novaRevisao,
          valorTotalMudou,
          itensMudaram,
          deveIncrementarRevisao
        });
        
        // Preparar dados novos para comparação
        const dadosNovos = {
          cliente_id,
          projeto_id,
          titulo,
          descricao,
          valor_total: valor_total || 0,
          validade,
          condicoes_pagamento,
          prazo_entrega,
          garantia,
          observacoes,
          status,
          responsavel_id: finalResponsavelId,
          familia_produto,
          lembrete_data,
          lembrete_mensagem
        };

        // Comparar e gerar log de mudanças
        const mudancas = compararDados(propostaAtual, dadosNovos);
        const mudancasTexto = JSON.stringify(mudancas);
        const dadosAnterioresTexto = JSON.stringify(propostaAtual);
        const dadosNovosTexto = JSON.stringify(dadosNovos);
        
        // Definir funções auxiliares antes de usá-las
        function atualizarProposta() {
        // Validar e normalizar valores antes de atualizar
        const clienteIdFinal = cliente_id ? (parseInt(cliente_id) > 0 ? parseInt(cliente_id) : null) : null;
        let projetoIdFinal = null;
        if (projeto_id) {
          const projetoIdNum = parseInt(projeto_id);
          if (!isNaN(projetoIdNum) && projetoIdNum > 0) {
            projetoIdFinal = projetoIdNum;
          }
        }
        const responsavelIdFinal = finalResponsavelId ? (parseInt(finalResponsavelId) > 0 ? parseInt(finalResponsavelId) : null) : null;
        
        // Verificar se o número final não está duplicado (exceto para a própria proposta)
        db.get(`SELECT id FROM propostas WHERE numero_proposta = ? AND id != ?`, [numeroFinal, id], (err, existing) => {
          if (err) {
            return res.status(500).json({ error: 'Erro ao verificar número da proposta: ' + err.message });
          }
          if (existing) {
            return res.status(400).json({ 
              error: `O número da proposta "${numeroFinal}" já está em uso por outra proposta. Por favor, use outro número ou deixe o sistema gerar automaticamente.` 
            });
          }

          db.run(
            `UPDATE propostas SET cliente_id = ?, projeto_id = ?, numero_proposta = ?, titulo = ?,
              descricao = ?, valor_total = ?, validade = ?, condicoes_pagamento = ?, prazo_entrega = ?,
              garantia = ?, observacoes = ?, status = ?, responsavel_id = ?,
              motivo_nao_venda = ?, origem_busca = ?, familia_produto = ?,
              lembrete_data = ?, lembrete_mensagem = ?, margem_desconto = ?, revisao = ?,
              cliente_contato = ?, cliente_telefone = ?, cliente_email = ?,
              oportunidade_id = ?, tipo_proposta = ?, expira_em = ?,
              idioma = ?, moeda = ?, incoterm = ?, unidade_negocio = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [clienteIdFinal, projetoIdFinal, numeroFinal, titulo, descricao, valor_total || 0,
              validade || null, condicoes_pagamento || '', prazo_entrega || '', garantia || '', observacoes || '', status,
              responsavelIdFinal, motivo_nao_venda || null, origem_busca || null, familia_produto || null,
              lembrete_data || null, lembrete_mensagem || null, margem_desconto || 0, novaRevisao,
              cliente_contato || null, cliente_telefone || null, cliente_email || null,
              oportunidade_id != null ? oportunidade_id : null, tipo_proposta || null, expira_em || null,
              idioma || null, moeda || null, incoterm || null, unidade_negocio || null, id],
            (err) => {
              if (err) {
                // Tratar erro de UNIQUE constraint especificamente
                if (err.message && err.message.includes('UNIQUE constraint')) {
                  return res.status(400).json({ 
                    error: `O número da proposta "${numeroFinal}" já está em uso. Por favor, use outro número ou deixe o sistema gerar automaticamente.` 
                  });
                }
                return res.status(500).json({ error: 'Erro ao atualizar proposta: ' + err.message });
              }

            // Deletar itens antigos e inserir novos
            db.run('DELETE FROM proposta_itens WHERE proposta_id = ?', [id], (err) => {
              if (err) {
                return res.status(500).json({ error: err.message });
              }

              if (itens && Array.isArray(itens) && itens.length > 0) {
                const stmt = db.prepare(
                  `INSERT INTO proposta_itens (proposta_id, descricao, quantidade, unidade,
                    valor_unitario, valor_total, codigo_produto, familia_produto, regiao_busca,
                    tag, modelo, categoria, descricao_resumida, descritivo_tecnico, dados_processo,
                    materiais_construtivos, utilidades_requeridas, opcionais, exclusoes, prazo_individual, numero_item)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
                );

                itens.forEach((item, idx) => {
                  stmt.run([
                    id, item.descricao || item.nome || '', item.quantidade || 1, item.unidade || 'UN',
                    item.valor_unitario || 0, item.valor_total || 0,
                    item.codigo_produto || null, item.familia_produto || null, item.regiao_busca || null,
                    item.tag || null, item.modelo || null, item.categoria || null,
                    item.descricao_resumida || null, item.descritivo_tecnico || null, item.dados_processo || null,
                    item.materiais_construtivos || null, item.utilidades_requeridas || null,
                    item.opcionais || null, item.exclusoes || null, item.prazo_individual || null,
                    item.numero_item != null ? item.numero_item : idx + 1
                  ]);
                });

                stmt.finalize();
              }

              res.json({ 
                message: 'Proposta atualizada com sucesso',
                numero_proposta: numeroFinal,
                revisao: novaRevisao
              });
            });
          }
        );
        }); // Fim da verificação de número duplicado
        }
        
        function salvarHistoricoEAtualizar() {
          // Salvar histórico de revisão apenas se a revisão foi incrementada
          if (deveIncrementarRevisao) {
            db.run(
              `INSERT INTO proposta_revisoes (proposta_id, revisao, dados_anteriores, dados_novos, mudancas, revisado_por)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [id, revisaoAtual, dadosAnterioresTexto, dadosNovosTexto, mudancasTexto, req.user.id],
              (err) => {
                if (err) {
                  console.error('Erro ao salvar histórico de revisão:', err);
                  // Continuar mesmo se falhar ao salvar histórico
                }
                
                // Agora atualizar a proposta
                atualizarProposta();
              }
            );
          } else {
            // Se não incrementou revisão, apenas atualizar a proposta sem salvar histórico
            atualizarProposta();
          }
        }
        
        // Regenerar o número da proposta apenas se a revisão mudou
        let numeroFinal = numero_proposta;
        if (cliente_id && deveIncrementarRevisao) {
          // Gerar novo número com revisão incrementada
          gerarNumeroPropostaComVerificacao(cliente_id, finalResponsavelId, novaRevisao, id, (err, numeroGerado) => {
            if (err) {
              return res.status(500).json({ error: 'Erro ao gerar número da proposta: ' + err.message });
            }
            numeroFinal = numeroGerado;
            salvarHistoricoEAtualizar();
          });
        } else {
          // Se não incrementou revisão, manter número atual da proposta
          // Se o número enviado for diferente do atual, verificar se não existe em outra proposta
          const numeroEnviado = numero_proposta || propostaAtual.numero_proposta;
          const numeroAtual = propostaAtual.numero_proposta;
          
          if (numeroEnviado !== numeroAtual && numeroEnviado) {
            // Verificar se o número já existe em outra proposta
            db.get(`SELECT id FROM propostas WHERE numero_proposta = ? AND id != ?`, [numeroEnviado, id], (err, existing) => {
              if (err) {
                return res.status(500).json({ error: 'Erro ao verificar número da proposta: ' + err.message });
              }
              if (existing) {
                return res.status(400).json({ error: 'O número da proposta já está em uso por outra proposta.' });
              }
              // Se não existe, usar o número enviado
              numeroFinal = numeroEnviado;
              salvarHistoricoEAtualizar();
            });
          } else {
            // Manter número atual
            numeroFinal = numeroAtual;
            salvarHistoricoEAtualizar();
          }
        }
      }); // Fim do db.all
    } // Fim da função continuarAtualizacao
  }); // Fim do db.get
});

app.delete('/api/propostas/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  console.log(`🗑️ Iniciando exclusão da proposta ${id}`);
  
  // Deletar custos de viagem relacionados primeiro (não tem CASCADE)
  db.run('DELETE FROM custos_viagens WHERE proposta_id = ? OR proposta_aprovacao_id = ?', [id, id], (err) => {
    if (err) {
      console.error('❌ Erro ao deletar custos de viagem:', err);
      // Continuar mesmo se houver erro (pode não ter custos)
    } else {
      console.log('✅ Custos de viagem deletados');
    }
    
    // Deletar atividades relacionadas (não tem CASCADE)
    db.run('DELETE FROM atividades WHERE proposta_id = ?', [id], (err) => {
      if (err) {
        console.error('❌ Erro ao deletar atividades:', err);
        // Continuar mesmo se houver erro (pode não ter atividades)
      } else {
        console.log('✅ Atividades relacionadas deletadas');
      }
      
      // Deletar aprovações relacionadas (tem CASCADE, mas vamos garantir)
      db.run('DELETE FROM aprovacoes WHERE proposta_id = ?', [id], (err) => {
        if (err) {
          console.error('❌ Erro ao deletar aprovações:', err);
        } else {
          console.log('✅ Aprovações relacionadas deletadas');
        }
        
        // Deletar follow-ups (tem CASCADE, mas vamos garantir)
        db.run('DELETE FROM proposta_followups WHERE proposta_id = ?', [id], (err) => {
          if (err) {
            console.error('❌ Erro ao deletar follow-ups:', err);
          } else {
            console.log('✅ Follow-ups deletados');
          }
          
          // Deletar histórico de status (auditoria)
          db.run('DELETE FROM proposta_status_history WHERE proposta_id = ?', [id], (err) => {
            if (err) console.error('❌ Erro ao deletar status_history:', err);
          });
          // Deletar revisões (tem CASCADE, mas vamos garantir)
          db.run('DELETE FROM proposta_revisoes WHERE proposta_id = ?', [id], (err) => {
            if (err) {
              console.error('❌ Erro ao deletar revisões:', err);
            } else {
              console.log('✅ Revisões deletadas');
            }
            
            // Deletar itens (tem CASCADE, mas vamos garantir)
            db.run('DELETE FROM proposta_itens WHERE proposta_id = ?', [id], (err) => {
              if (err) {
                console.error('❌ Erro ao deletar itens:', err);
                return res.status(500).json({ error: err.message });
              }
              console.log('✅ Itens deletados');

              // Deletar proposta
              db.run('DELETE FROM propostas WHERE id = ?', [id], (err) => {
                if (err) {
                  console.error('❌ Erro ao deletar proposta:', err);
                  return res.status(500).json({ error: err.message });
                }
                console.log('✅ Proposta deletada com sucesso');
                res.json({ message: 'Proposta excluída com sucesso' });
              });
            });
          });
        });
      });
    });
  });
});

// ========== CICLO DE VIDA ENTERPRISE (Salesforce-like) ==========
// Registrar mudança de status (auditoria)
function registrarStatusProposta(propostaId, statusAnterior, statusNovo, usuarioId, observacao, cb) {
  db.run(
    `INSERT INTO proposta_status_history (proposta_id, status_anterior, status_novo, usuario_id, observacao) VALUES (?, ?, ?, ?, ?)`,
    [propostaId, statusAnterior || null, statusNovo, usuarioId || null, observacao || null],
    (err) => { if (cb) cb(err); }
  );
}

// GET histórico de status da proposta
app.get('/api/propostas/:id/status-history', authenticateToken, (req, res) => {
  const { id } = req.params;
  db.all(
    `SELECT h.*, u.nome as usuario_nome FROM proposta_status_history h
     LEFT JOIN usuarios u ON h.usuario_id = u.id
     WHERE h.proposta_id = ? ORDER BY h.created_at DESC`,
    [id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    }
  );
});

// POST enviar proposta (rascunho → enviada)
app.post('/api/propostas/:id/enviar', authenticateToken, (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;
  db.get('SELECT id, status FROM propostas WHERE id = ?', [id], (err, proposta) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!proposta) return res.status(404).json({ error: 'Proposta não encontrada' });
    if (proposta.status !== 'rascunho') {
      return res.status(400).json({ error: 'Só é possível enviar proposta em rascunho' });
    }
    db.run(
      `UPDATE propostas SET status = 'enviada', enviada_em = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [id],
      (errUpdate) => {
        if (errUpdate) return res.status(500).json({ error: errUpdate.message });
        registrarStatusProposta(id, 'rascunho', 'enviada', userId, 'Proposta enviada ao cliente', () => {});
        res.json({ message: 'Proposta marcada como enviada', status: 'enviada', enviada_em: new Date().toISOString() });
      }
    );
  });
});

// POST marcar como visualizada (enviada → visualizada)
app.post('/api/propostas/:id/marcar-visualizada', authenticateToken, (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;
  db.get('SELECT id, status FROM propostas WHERE id = ?', [id], (err, proposta) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!proposta) return res.status(404).json({ error: 'Proposta não encontrada' });
    if (proposta.status !== 'enviada') {
      return res.status(400).json({ error: 'Só é possível marcar visualizada em proposta enviada' });
    }
    db.run(
      `UPDATE propostas SET status = 'visualizada', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [id],
      (errUpdate) => {
        if (errUpdate) return res.status(500).json({ error: errUpdate.message });
        registrarStatusProposta(id, 'enviada', 'visualizada', userId, null, () => {});
        res.json({ message: 'Proposta marcada como visualizada', status: 'visualizada' });
      }
    );
  });
});

// POST aceitar proposta (enviada/visualizada → aceita)
app.post('/api/propostas/:id/aceitar', authenticateToken, (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;
  const { observacao } = req.body || {};
  db.get('SELECT id, status FROM propostas WHERE id = ?', [id], (err, proposta) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!proposta) return res.status(404).json({ error: 'Proposta não encontrada' });
    if (!['enviada', 'visualizada'].includes(proposta.status)) {
      return res.status(400).json({ error: 'Só é possível aceitar proposta enviada ou visualizada' });
    }
    const statusAnterior = proposta.status;
    db.run(
      `UPDATE propostas SET status = 'aceita', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [id],
      (errUpdate) => {
        if (errUpdate) return res.status(500).json({ error: errUpdate.message });
        registrarStatusProposta(id, statusAnterior, 'aceita', userId, observacao || 'Proposta aceita', () => {});
        res.json({ message: 'Proposta aceita', status: 'aceita' });
      }
    );
  });
});

// POST rejeitar proposta (enviada/visualizada → rejeitada)
app.post('/api/propostas/:id/rejeitar', authenticateToken, (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;
  const { motivo_rejeicao, observacao } = req.body || {};
  db.get('SELECT id, status FROM propostas WHERE id = ?', [id], (err, proposta) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!proposta) return res.status(404).json({ error: 'Proposta não encontrada' });
    if (!['enviada', 'visualizada'].includes(proposta.status)) {
      return res.status(400).json({ error: 'Só é possível rejeitar proposta enviada ou visualizada' });
    }
    const statusAnterior = proposta.status;
    db.run(
      `UPDATE propostas SET status = 'rejeitada', motivo_nao_venda = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [motivo_rejeicao || observacao || null, id],
      (errUpdate) => {
        if (errUpdate) return res.status(500).json({ error: errUpdate.message });
        registrarStatusProposta(id, statusAnterior, 'rejeitada', userId, motivo_rejeicao || observacao, () => {});
        res.json({ message: 'Proposta rejeitada', status: 'rejeitada' });
      }
    );
  });
});

// POST nova revisão (cria novo rascunho a partir da proposta atual; incrementa revisao)
app.post('/api/propostas/:id/nova-revisao', authenticateToken, (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;
  db.get('SELECT * FROM propostas WHERE id = ?', [id], (err, proposta) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!proposta) return res.status(404).json({ error: 'Proposta não encontrada' });
    const revisaoNova = (parseInt(proposta.revisao, 10) || 0) + 1;
    const statusAnterior = proposta.status;
    // Mesma proposta: volta para rascunho, limpa snapshot para regenerar, incrementa revisao
    db.run(
      `UPDATE propostas SET status = 'rascunho', revisao = ?, html_rendered = NULL, css_snapshot = NULL, pdf_gerado_at = NULL, enviada_em = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [revisaoNova, id],
      (errUpdate) => {
        if (errUpdate) return res.status(500).json({ error: errUpdate.message });
        registrarStatusProposta(id, statusAnterior, 'rascunho', userId, `Nova revisão #${revisaoNova}`, () => {});
        res.json({ message: 'Nova revisão criada', revisao: revisaoNova, status: 'rascunho' });
      }
    );
  });
});

// POST clonar proposta (nova proposta com mesmo cliente/itens, status rascunho, novo número)
app.post('/api/propostas/:id/clone', authenticateToken, (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;
  db.get('SELECT * FROM propostas WHERE id = ?', [id], (err, proposta) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!proposta) return res.status(404).json({ error: 'Proposta não encontrada' });
    db.get('SELECT COUNT(*) as total FROM propostas WHERE cliente_id = ?', [proposta.cliente_id], (errCount, rowCount) => {
      if (errCount) return res.status(500).json({ error: errCount.message });
      const numeroNovo = `COPIA-${proposta.numero_proposta}-${Date.now().toString(36).toUpperCase()}`;
      const campos = 'cliente_id, projeto_id, numero_proposta, titulo, descricao, valor_total, validade, condicoes_pagamento, prazo_entrega, garantia, observacoes, responsavel_id, created_by, cliente_contato, cliente_telefone, cliente_email, oportunidade_id, tipo_proposta, idioma, moeda, incoterm, unidade_negocio';
      const placeholders = campos.split(',').map(() => '?').join(',');
      const valores = [
        proposta.cliente_id, proposta.projeto_id, numeroNovo,
        (proposta.titulo || '').replace(/^/, '[Cópia] '), proposta.descricao, proposta.valor_total, proposta.validade,
        proposta.condicoes_pagamento, proposta.prazo_entrega, proposta.garantia, proposta.observacoes,
        userId, userId, proposta.cliente_contato, proposta.cliente_telefone, proposta.cliente_email,
        proposta.oportunidade_id || null, proposta.tipo_proposta || null,
        proposta.idioma || null, proposta.moeda || null, proposta.incoterm || null, proposta.unidade_negocio || null
      ];
      db.run(
        `INSERT INTO propostas (${campos}, status, revisao) VALUES (${placeholders}, 'rascunho', 0)`,
        valores,
        function (errInsert) {
          if (errInsert) return res.status(500).json({ error: errInsert.message });
          const novaId = this.lastID;
          db.all('SELECT * FROM proposta_itens WHERE proposta_id = ?', [id], (errItens, itens) => {
            if (!errItens && itens && itens.length > 0) {
              const stmt = db.prepare(
                `INSERT INTO proposta_itens (proposta_id, descricao, quantidade, unidade, valor_unitario, valor_total, codigo_produto, familia_produto, regiao_busca, tag, modelo, categoria, descricao_resumida, descritivo_tecnico, dados_processo, materiais_construtivos, utilidades_requeridas, opcionais, exclusoes, prazo_individual, numero_item) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
              );
              itens.forEach((item, idx) => {
                stmt.run([
                  novaId, item.descricao, item.quantidade, item.unidade, item.valor_unitario, item.valor_total,
                  item.codigo_produto, item.familia_produto, item.regiao_busca,
                  item.tag || null, item.modelo || null, item.categoria || null,
                  item.descricao_resumida || null, item.descritivo_tecnico || null, item.dados_processo || null,
                  item.materiais_construtivos || null, item.utilidades_requeridas || null,
                  item.opcionais || null, item.exclusoes || null, item.prazo_individual || null,
                  item.numero_item != null ? item.numero_item : idx + 1
                ]);
              });
              stmt.finalize();
            }
            res.status(201).json({ message: 'Proposta clonada', id: novaId, numero_proposta: numeroNovo });
          });
        }
      );
    });
  });
});

// ========== ROTA PARA REMOVER LEMBRETE ==========
app.put('/api/propostas/:id/remover-lembrete', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  db.run(
    `UPDATE propostas SET lembrete_data = NULL, lembrete_mensagem = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [id],
    (err) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ message: 'Lembrete removido com sucesso' });
    }
  );
});

// ========== ROTA DE GERAÇÃO AUTOMÁTICA DE PROPOSTA ==========
app.post('/api/propostas/gerar-automatica', authenticateToken, (req, res) => {
  const { cliente_id, projeto_id, produtos, ...outrosDados } = req.body;

  if (!cliente_id || !produtos || !Array.isArray(produtos) || produtos.length === 0) {
    return res.status(400).json({ error: 'Cliente e produtos são obrigatórios' });
  }

  // Verificar se todos os produtos são da família "Hélices e Acessórios"
  // A verificação será feita ao buscar os produtos do banco

  // Gerar número da proposta usando a função padrão
  // Será gerado dentro do processarProposta abaixo

  // Buscar produtos e calcular total
  let valorTotal = 0;
  const itens = [];

  const buscarProdutos = () => {
    return new Promise((resolve, reject) => {
      const produtosIds = produtos.map(p => p.id);
      const placeholders = produtosIds.map(() => '?').join(',');
      
      db.all(`SELECT * FROM produtos WHERE id IN (${placeholders})`, produtosIds, (err, produtosData) => {
        if (err) {
          return reject(err);
        }

        produtos.forEach(produtoReq => {
          const produto = produtosData.find(p => p.id === produtoReq.id);
          if (produto) {
            const quantidade = produtoReq.quantidade || 1;
            const valorUnitario = produto.preco_base || 0;
            const valorItem = quantidade * valorUnitario;
            valorTotal += valorItem;

            itens.push({
              descricao: produto.nome,
              quantidade,
              unidade: 'UN',
              valor_unitario: valorUnitario,
              valor_total: valorItem,
              codigo_produto: produto.codigo,
              familia_produto: produto.familia || null,
              regiao_busca: outrosDados.regiao_busca || null
            });
          }
        });

        resolve();
      });
    });
  };

  buscarProdutos().then(() => {
    const finalResponsavelId = outrosDados.responsavel_id || req.user.id;
    
    // Validar e normalizar projeto_id (deve ser NULL se vazio, 0 ou inválido)
    let projetoIdFinal = null;
    if (projeto_id) {
      const projetoIdNum = parseInt(projeto_id);
      if (!isNaN(projetoIdNum) && projetoIdNum > 0) {
        projetoIdFinal = projetoIdNum;
      }
    }
    
    // Validar cliente_id
    const clienteIdNum = parseInt(cliente_id);
    if (isNaN(clienteIdNum) || clienteIdNum <= 0) {
      return res.status(400).json({ error: 'Cliente inválido' });
    }
    
    // Validar responsavel_id e created_by
    const responsavelIdNum = parseInt(finalResponsavelId);
    const createdByIdNum = parseInt(req.user.id);
    if (isNaN(responsavelIdNum) || responsavelIdNum <= 0) {
      return res.status(400).json({ error: 'Responsável inválido' });
    }
    if (isNaN(createdByIdNum) || createdByIdNum <= 0) {
      return res.status(400).json({ error: 'Usuário inválido' });
    }

    // Gerar número da proposta usando a função padrão
    gerarNumeroProposta(clienteIdNum, responsavelIdNum, 0, (err, numeroProposta) => {
      if (err || !numeroProposta) {
        return res.status(500).json({ error: 'Erro ao gerar número da proposta: ' + (err?.message || 'Número não gerado') });
      }

      // Validade: usar data enviada ou calcular a partir de validade_dias
      let validadeFinal = outrosDados.validade || null;
      if (!validadeFinal && outrosDados.validade_dias) {
        const d = new Date();
        d.setDate(d.getDate() + (parseInt(outrosDados.validade_dias, 10) || 15));
        validadeFinal = d.toISOString().split('T')[0];
      }

      const oportunidadeIdFinal = outrosDados.oportunidade_id != null && outrosDados.oportunidade_id !== '' ? parseInt(outrosDados.oportunidade_id, 10) : null;
      const expiraEmFinal = outrosDados.expira_em || validadeFinal || null;

      db.run(
        `INSERT INTO propostas (cliente_id, projeto_id, numero_proposta, titulo, descricao, valor_total,
          validade, condicoes_pagamento, prazo_entrega, garantia, observacoes, status,
          responsavel_id, created_by, motivo_nao_venda, origem_busca, familia_produto, lembrete_data, lembrete_mensagem, margem_desconto, revisao,
          cliente_contato, cliente_telefone, cliente_email, oportunidade_id, tipo_proposta, expira_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          clienteIdNum, projetoIdFinal, numeroProposta,
          outrosDados.titulo || `Proposta ${numeroProposta}`,
          outrosDados.descricao || '', valorTotal,
          validadeFinal, outrosDados.condicoes_pagamento || '',
          outrosDados.prazo_entrega || '', outrosDados.garantia || '',
          outrosDados.observacoes || '', outrosDados.status || 'rascunho',
          responsavelIdNum, createdByIdNum,
          outrosDados.motivo_nao_venda || null,
          outrosDados.origem_busca || null,
          outrosDados.familia_produto || null,
          outrosDados.lembrete_data || null,
          outrosDados.lembrete_mensagem || null,
          outrosDados.margem_desconto || 0,
          0,
          outrosDados.cliente_contato || null,
          outrosDados.cliente_telefone || null,
          outrosDados.cliente_email || null,
          oportunidadeIdFinal,
          outrosDados.tipo_proposta || null,
          expiraEmFinal
        ],
        function(err) {
          if (err) {
            return res.status(500).json({ error: err.message });
          }

          const propostaId = this.lastID;

          // Inserir itens
          const stmt = db.prepare(
            `INSERT INTO proposta_itens (proposta_id, descricao, quantidade, unidade,
              valor_unitario, valor_total, codigo_produto, familia_produto, regiao_busca,
              tag, modelo, categoria, descricao_resumida, descritivo_tecnico, dados_processo,
              materiais_construtivos, utilidades_requeridas, opcionais, exclusoes, prazo_individual, numero_item)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          );

          itens.forEach((item, idx) => {
            stmt.run([
              propostaId, item.descricao || item.nome || '', item.quantidade || 1, item.unidade || 'UN',
              item.valor_unitario || 0, item.valor_total || 0,
              item.codigo_produto || null, item.familia_produto || null, item.regiao_busca || null,
              item.tag || null, item.modelo || null, item.categoria || null,
              item.descricao_resumida || null, item.descritivo_tecnico || null, item.dados_processo || null,
              item.materiais_construtivos || null, item.utilidades_requeridas || null,
              item.opcionais || null, item.exclusoes || null, item.prazo_individual || null,
              item.numero_item != null ? item.numero_item : idx + 1
            ]);
          });

          stmt.finalize();

          res.json({ id: propostaId, numero_proposta: numeroProposta, valor_total: valorTotal, itens });
        }
      );
    });
  }).catch(err => {
    res.status(500).json({ error: err.message });
  });
});

// ========== ROTA PARA GERAR PROPOSTA PREMIUM ==========
// IMPORTANTE: rota liberada sem autenticação para permitir abertura direta via link/PDF.
// Proteções para evitar 502: timeout de resposta, guarda de resposta única, não exige dbReady.
const PREMIUM_ROUTE_TIMEOUT_MS = 30000; // 30s — evita que o proxy (Coolify/Traefik) devolva 502 por timeout

app.get('/api/propostas/:id/premium', (req, res) => {
  let responseSent = false;
  let timeoutId = null;

  const sendOnce = (code, body) => {
    if (responseSent) return;
    responseSent = true;
    if (timeoutId) clearTimeout(timeoutId);
    if (typeof body === 'object' && body !== null && !(body instanceof Buffer)) res.status(code).json(body);
    else res.status(code).send(body);
  };

  timeoutId = setTimeout(() => {
    if (responseSent) return;
    console.warn('[premium] Timeout ao gerar preview da proposta', req.params.id);
    sendOnce(503, { error: 'Timeout ao gerar preview. Tente novamente.', retryAfter: 5 });
  }, PREMIUM_ROUTE_TIMEOUT_MS);

  try {
    const { id } = req.params;

    if (!id || isNaN(parseInt(id))) {
      return sendOnce(400, { error: 'ID da proposta inválido' });
    }

    if (!db) {
      return sendOnce(503, { error: 'Banco de dados não disponível.', retryAfter: 5 });
    }
    // Não exigir dbReady: permite atender mesmo durante inicialização e evita 503 permanente

    // Buscar proposta completa com todos os dados
    db.get(`
    SELECT p.*, 
           c.razao_social, c.nome_fantasia, c.cnpj, c.logo_url as cliente_logo_url,
           c.endereco as cliente_endereco, c.cidade as cliente_cidade, 
           c.estado as cliente_estado, c.cep as cliente_cep,
           COALESCE(p.cliente_telefone, c.telefone) as cliente_telefone,
           COALESCE(p.cliente_email, c.email) as cliente_email,
           p.cliente_contato,
           u.nome as responsavel_nome, u.email as responsavel_email
    FROM propostas p
    LEFT JOIN clientes c ON p.cliente_id = c.id
    LEFT JOIN usuarios u ON p.responsavel_id = u.id
    WHERE p.id = ?
  `, [id], (err, proposta) => {
    if (err) {
      console.error('Erro ao buscar proposta:', err);
      console.error('Stack trace:', err.stack);
      if (err.message && (err.message.includes('database is locked') || err.message.includes('SQLITE_BUSY'))) {
        return sendOnce(503, { error: 'Banco de dados temporariamente ocupado. Tente novamente em alguns segundos.', retryAfter: 2 });
      }
      return sendOnce(500, { error: 'Erro ao buscar proposta: ' + err.message });
    }
    if (!proposta) {
      return sendOnce(404, { error: 'Proposta não encontrada' });
    }
    
    const requestBaseURL = (process.env.API_URL && process.env.API_URL.trim())
      ? process.env.API_URL.replace(/\/$/, '')
      : (req.protocol || 'http') + '://' + (req.get('host') || req.headers.host || 'localhost:5000');
    
    // Buscar itens da proposta com dados completos dos produtos (produto_imagem explícito para exibir foto do produto)
    db.all(`
      SELECT pi.*, pr.id as produto_id, pr.codigo as produto_codigo, pr.nome as produto_nome, pr.imagem as produto_imagem,
             pr.descricao as produto_descricao, pr.especificacoes_tecnicas, pr.familia as produto_familia,
             pr.preco_base, pr.icms, pr.ipi
      FROM proposta_itens pi
      LEFT JOIN produtos pr ON pi.codigo_produto = pr.codigo
      WHERE pi.proposta_id = ?
      ORDER BY pi.id
    `, [id], (err, itens) => {
      if (err) {
        console.error('Erro ao buscar itens da proposta:', err);
        console.error('Stack trace:', err.stack);
        if (err.message && (err.message.includes('database is locked') || err.message.includes('SQLITE_BUSY'))) {
          return sendOnce(503, { error: 'Banco de dados temporariamente ocupado. Tente novamente em alguns segundos.', retryAfter: 2 });
        }
        return sendOnce(500, { error: 'Erro ao buscar itens da proposta: ' + err.message });
      }
      
      try {
        // Calcular totais
        const itensArray = Array.isArray(itens) ? itens : [];
        
        // Calcular subtotal somando todos os itens
        const subtotal = itensArray.reduce((sum, item) => {
          const qtd = parseFloat(item.quantidade) || 1;
          const preco = parseFloat(item.valor_unitario) || 
                       parseFloat(item.preco_base) || 0;
          return sum + (qtd * preco);
        }, 0);
        
        // Calcular ICMS e IPI
        const icms = itensArray.reduce((sum, item) => {
          const produto = item || {};
          const quantidade = parseFloat(item?.quantidade) || 1;
          const valorUnitario = parseFloat(item?.valor_unitario) || parseFloat(produto?.preco_base) || 0;
          const icmsPercent = parseFloat(produto?.icms) || 0;
          return sum + (valorUnitario * quantidade * icmsPercent / 100);
        }, 0);
        const ipi = itensArray.reduce((sum, item) => {
          const produto = item || {};
          const quantidade = parseFloat(item?.quantidade) || 1;
          const valorUnitario = parseFloat(item?.valor_unitario) || parseFloat(produto?.preco_base) || 0;
          const ipiPercent = parseFloat(produto?.ipi) || 0;
          return sum + (valorUnitario * quantidade * ipiPercent / 100);
        }, 0);
        
        // Total = subtotal (sem impostos) ou usar valor_total da proposta se não houver itens
        const total = itensArray.length > 0 ? subtotal : (parseFloat(proposta.valor_total) || 0);
        
        // Formatar data
        let dataEmissao = '';
        try {
          if (proposta.created_at) {
            dataEmissao = new Date(proposta.created_at).toLocaleDateString('pt-BR');
          }
        } catch (e) {
          console.error('Erro ao formatar data de emissão:', e);
        }
        
        let dataValidade = '';
        try {
          if (proposta.validade) {
            dataValidade = new Date(proposta.validade).toLocaleDateString('pt-BR');
          }
        } catch (e) {
          console.error('Erro ao formatar data de validade:', e);
        }
        
        // Validar dados antes de gerar HTML
        if (!proposta.numero_proposta) {
          console.warn('Proposta sem número:', proposta.id);
          proposta.numero_proposta = 'N/A';
        }
        
        const omitPrintBar = req.query.embed === '1' || req.query.embed === 'true';
        
        // Template por família de produto: preferir config com familia = proposta.familia_produto ou primeiro item
        const familiaTemplate = proposta.familia_produto || (itensArray && itensArray[0] && itensArray[0].familia_produto) || null;
        const templateQuery = familiaTemplate
          ? 'SELECT * FROM proposta_template_config WHERE (familia = ? OR familia IS NULL OR familia = \'\') ORDER BY CASE WHEN familia = ? THEN 0 ELSE 1 END, id DESC LIMIT 1'
          : 'SELECT * FROM proposta_template_config ORDER BY id DESC LIMIT 1';
        const templateParams = familiaTemplate ? [familiaTemplate, familiaTemplate] : [];
        db.get(templateQuery, templateParams, (err, templateConfig) => {
          if (err) {
            console.error('Erro ao buscar configuração do template:', err);
            templateConfig = null;
          }
          if (templateConfig) {
            templateConfig.margin_impressao_top_primeira = templateConfig.margin_impressao_top_primeira != null ? Number(templateConfig.margin_impressao_top_primeira) : 20;
            templateConfig.margin_impressao_top_outras = templateConfig.margin_impressao_top_outras != null ? Number(templateConfig.margin_impressao_top_outras) : 50;
            templateConfig.margin_impressao_bottom = templateConfig.margin_impressao_bottom != null ? Number(templateConfig.margin_impressao_bottom) : 45;
            templateConfig.margin_impressao_lateral = templateConfig.margin_impressao_lateral != null ? Number(templateConfig.margin_impressao_lateral) : 20;
            templateConfig.margin_navegador_top = templateConfig.margin_navegador_top != null ? Number(templateConfig.margin_navegador_top) : 19;
            templateConfig.margin_navegador_bottom = templateConfig.margin_navegador_bottom != null ? Number(templateConfig.margin_navegador_bottom) : 19;
          }
          function runGerar() {
            if (responseSent) return;
            let html;
            try {
              if (proposta.html_rendered && String(proposta.html_rendered).trim().length > 0) {
                html = proposta.html_rendered;
                html = (html || '').replace(/src="(https?:)?\/\/[^/]+(\/api\/uploads\/[^"]+)"/g, (_, __, p) => `src="${requestBaseURL}${p}"`);
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
                sendOnce(200, html);
                return;
              }
              let compList = [];
              if (templateConfig && templateConfig.componentes) {
                if (typeof templateConfig.componentes === 'string') { try { compList = JSON.parse(templateConfig.componentes); } catch (_) {} }
                else if (Array.isArray(templateConfig.componentes)) compList = templateConfig.componentes;
              }
              if (Array.isArray(compList) && compList.length > 0) {
                html = gerarHTMLPropostaFromComponentes(proposta, itensArray, { subtotal, icms, ipi, total, dataEmissao, dataValidade }, templateConfig, requestBaseURL, false, omitPrintBar);
              }
              if (!html) {
                html = gerarHTMLPropostaPremium(proposta, itensArray, { subtotal, icms, ipi, total, dataEmissao, dataValidade }, templateConfig, requestBaseURL, false, omitPrintBar);
              }
            } catch (genError) {
              console.error('Erro ao gerar HTML da proposta:', genError);
              console.error('Stack trace:', genError.stack);
              console.error('Dados da proposta:', JSON.stringify({
                id: proposta.id,
                numero_proposta: proposta.numero_proposta,
                titulo: proposta.titulo,
                itensCount: itensArray.length
              }, null, 2));
              return sendOnce(500, { error: 'Erro ao gerar HTML da proposta: ' + (genError && genError.message ? genError.message : String(genError)) });
            }
            if (!html || typeof html !== 'string' || html.trim().length === 0) {
              console.error('HTML gerado está vazio ou undefined');
              return sendOnce(500, { error: 'Erro: HTML não foi gerado corretamente' });
            }
            try {
              res.setHeader('Content-Type', 'text/html; charset=utf-8');
              res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
              sendOnce(200, html);
            } catch (sendError) {
              console.error('Erro ao enviar resposta:', sendError);
              sendOnce(500, { error: 'Erro ao enviar preview: ' + (sendError && sendError.message ? sendError.message : String(sendError)) });
            }
          }
          function runGerarSafe() {
            try {
              runGerar();
            } catch (err) {
              console.error('Erro ao abrir proposta (runGerar):', err);
              console.error(err && err.stack);
              sendOnce(500, { error: 'Erro ao abrir proposta. Tente novamente.' });
            }
          }
          let chaves = [];
          if (templateConfig && templateConfig.variaveis_proposta_tecnica != null) {
            if (typeof templateConfig.variaveis_proposta_tecnica === 'string') {
              try { chaves = JSON.parse(templateConfig.variaveis_proposta_tecnica); } catch (_) {}
            } else if (Array.isArray(templateConfig.variaveis_proposta_tecnica)) {
              chaves = templateConfig.variaveis_proposta_tecnica;
            }
          }
          if (!Array.isArray(chaves)) chaves = [];
          let porFamilia = {};
          if (templateConfig && templateConfig.variaveis_proposta_por_familia != null) {
            if (typeof templateConfig.variaveis_proposta_por_familia === 'string') {
              try { porFamilia = JSON.parse(templateConfig.variaveis_proposta_por_familia); } catch (_) {}
            } else if (typeof templateConfig.variaveis_proposta_por_familia === 'object') {
              porFamilia = templateConfig.variaveis_proposta_por_familia;
            }
          }
          // Só atribuir se templateConfig existir; evita TypeError quando não há template configurado
          if (templateConfig) {
            templateConfig.variaveis_proposta_por_familia = porFamilia;
          }
          const chavesUnicas = [...new Set([].concat(chaves, Object.values(porFamilia).filter(Array.isArray).reduce((a, b) => a.concat(b), [])))];
          if (templateConfig) {
            templateConfig.variaveis_proposta_tecnica = chaves;
            templateConfig.variaveis_proposta_labels = {};
          }
          if (chavesUnicas.length === 0) {
            runGerarSafe();
            return;
          }
          const placeholders = chavesUnicas.map(() => '?').join(',');
          db.all('SELECT chave, nome, sufixo FROM variaveis_tecnicas WHERE chave IN (' + placeholders + ') AND ativo = 1', chavesUnicas, (err2, rows) => {
            if (err2) console.error('Erro ao buscar variaveis_tecnicas (ignorado, preview segue):', err2.message);
            if (templateConfig && rows && Array.isArray(rows) && rows.length) {
              templateConfig.variaveis_proposta_labels = {};
              rows.forEach(function (r) {
                if (r && r.chave != null) templateConfig.variaveis_proposta_labels[r.chave] = { nome: r.nome || r.chave, sufixo: (r.sufixo || '').trim() };
              });
            }
            runGerarSafe();
          });
        });
      } catch (error) {
        console.error('Erro geral ao processar proposta:', error);
        sendOnce(500, { error: 'Erro ao gerar preview da proposta: ' + (error && error.message ? error.message : String(error)) });
      }
    });
  });
  } catch (topError) {
    console.error('Erro no handler /api/propostas/:id/premium:', topError);
    sendOnce(500, { error: 'Erro interno ao abrir proposta. Tente novamente.' });
  }
});

// ========== ROTA PARA GERAR PDF (Puppeteer = igual ao preview) ==========
// Usa o mesmo HTML do "Ver proposta" e gera o PDF no servidor com Puppeteer, assim o PDF fica idêntico ao preview.
// IMPORTANTE: rota liberada sem autenticação para permitir abertura direta via link/PDF.
app.get('/api/propostas/:id/pdf', async (req, res) => {
  const { id } = req.params;
  
  if (!id || isNaN(parseInt(id))) {
    return res.status(400).json({ error: 'ID da proposta inválido' });
  }
  
  if (!db || !dbReady) {
    return res.status(503).json({ 
      error: 'Banco de dados ainda está sendo inicializado. Aguarde alguns segundos e tente novamente.',
      retryAfter: 2
    });
  }
  
  let browser = null;
  try {
    const proposta = await new Promise((resolve, reject) => {
      db.get(`
        SELECT p.*, 
               c.razao_social, c.nome_fantasia, c.cnpj, c.logo_url as cliente_logo_url,
               c.endereco as cliente_endereco, c.cidade as cliente_cidade, 
               c.estado as cliente_estado, c.cep as cliente_cep,
               COALESCE(p.cliente_telefone, c.telefone) as cliente_telefone,
               COALESCE(p.cliente_email, c.email) as cliente_email,
               p.cliente_contato,
               u.nome as responsavel_nome, u.email as responsavel_email
        FROM propostas p
        LEFT JOIN clientes c ON p.cliente_id = c.id
        LEFT JOIN usuarios u ON p.responsavel_id = u.id
        WHERE p.id = ?
      `, [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!proposta) {
      return res.status(404).json({ error: 'Proposta não encontrada' });
    }
    
    proposta.numero_proposta = proposta.numero_proposta || 'N/A';
    
    const itens = await new Promise((resolve, reject) => {
      db.all(`
        SELECT pi.*, pr.id as produto_id, pr.codigo as produto_codigo, pr.nome as produto_nome, pr.imagem as produto_imagem,
               pr.descricao as produto_descricao, pr.especificacoes_tecnicas, pr.familia as produto_familia,
               pr.preco_base, pr.icms, pr.ipi
        FROM proposta_itens pi
        LEFT JOIN produtos pr ON pi.codigo_produto = pr.codigo
        WHERE pi.proposta_id = ?
        ORDER BY pi.id
      `, [id], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    const itensArray = Array.isArray(itens) ? itens : [];
    const subtotal = itensArray.reduce((sum, item) => {
      const qtd = parseFloat(item.quantidade) || 1;
      const preco = parseFloat(item.valor_unitario) || parseFloat(item.preco_base) || 0;
      return sum + (qtd * preco);
    }, 0);
    const icms = itensArray.reduce((sum, item) => {
      const produto = item || {};
      const quantidade = parseFloat(item?.quantidade) || 1;
      const valorUnitario = parseFloat(item?.valor_unitario) || parseFloat(produto?.preco_base) || 0;
      const icmsPercent = parseFloat(produto?.icms) || 0;
      return sum + (valorUnitario * quantidade * icmsPercent / 100);
    }, 0);
    const ipi = itensArray.reduce((sum, item) => {
      const produto = item || {};
      const quantidade = parseFloat(item?.quantidade) || 1;
      const valorUnitario = parseFloat(item?.valor_unitario) || parseFloat(produto?.preco_base) || 0;
      const ipiPercent = parseFloat(produto?.ipi) || 0;
      return sum + (valorUnitario * quantidade * ipiPercent / 100);
    }, 0);
    const total = itensArray.length > 0 ? subtotal : (parseFloat(proposta.valor_total) || 0);
    
    let dataEmissao = '';
    let dataValidade = '';
    try {
      if (proposta.created_at) dataEmissao = new Date(proposta.created_at).toLocaleDateString('pt-BR');
      if (proposta.data_validade) dataValidade = new Date(proposta.data_validade).toLocaleDateString('pt-BR');
    } catch (e) {}
    const totais = { subtotal, icms, ipi, total, dataEmissao, dataValidade };
    
    const familiaTemplate = proposta.familia_produto || (itens && itens[0] && itens[0].familia_produto) || null;
    const templateQuery = familiaTemplate
      ? 'SELECT * FROM proposta_template_config WHERE (familia = ? OR familia IS NULL OR familia = \'\') ORDER BY CASE WHEN familia = ? THEN 0 ELSE 1 END, id DESC LIMIT 1'
      : 'SELECT * FROM proposta_template_config ORDER BY id DESC LIMIT 1';
    const templateParams = familiaTemplate ? [familiaTemplate, familiaTemplate] : [];
    let templateConfig = await new Promise((resolve, reject) => {
      db.get(templateQuery, templateParams, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    if (templateConfig) {
      templateConfig.margin_impressao_top_primeira = templateConfig.margin_impressao_top_primeira != null ? Number(templateConfig.margin_impressao_top_primeira) : 20;
      templateConfig.margin_impressao_top_outras = templateConfig.margin_impressao_top_outras != null ? Number(templateConfig.margin_impressao_top_outras) : 50;
      templateConfig.margin_impressao_bottom = templateConfig.margin_impressao_bottom != null ? Number(templateConfig.margin_impressao_bottom) : 45;
      templateConfig.margin_impressao_lateral = templateConfig.margin_impressao_lateral != null ? Number(templateConfig.margin_impressao_lateral) : 20;
    }
    let chaves = [];
    if (templateConfig && templateConfig.variaveis_proposta_tecnica != null) {
      if (typeof templateConfig.variaveis_proposta_tecnica === 'string') {
        try { chaves = JSON.parse(templateConfig.variaveis_proposta_tecnica); } catch (_) {}
      } else if (Array.isArray(templateConfig.variaveis_proposta_tecnica)) {
        chaves = templateConfig.variaveis_proposta_tecnica;
      }
    }
    if (!Array.isArray(chaves)) chaves = [];
    let porFamilia = {};
    if (templateConfig && templateConfig.variaveis_proposta_por_familia != null) {
      if (typeof templateConfig.variaveis_proposta_por_familia === 'string') {
        try { porFamilia = JSON.parse(templateConfig.variaveis_proposta_por_familia); } catch (_) {}
      } else if (typeof templateConfig.variaveis_proposta_por_familia === 'object') {
        porFamilia = templateConfig.variaveis_proposta_por_familia;
      }
    }
    templateConfig = templateConfig || {};
    templateConfig.variaveis_proposta_por_familia = porFamilia;
    templateConfig.variaveis_proposta_tecnica = chaves;
    templateConfig.variaveis_proposta_labels = {};
    const chavesUnicas = [...new Set([].concat(chaves, Object.values(porFamilia).filter(Array.isArray).reduce((a, b) => a.concat(b), [])))];
    if (chavesUnicas.length > 0) {
      const rows = await new Promise((resolve, reject) => {
        const placeholders = chavesUnicas.map(() => '?').join(',');
        db.all('SELECT chave, nome, sufixo FROM variaveis_tecnicas WHERE chave IN (' + placeholders + ') AND ativo = 1', chavesUnicas, (err, r) => {
          if (err) reject(err);
          else resolve(r || []);
        });
      });
      if (rows && rows.length) {
        rows.forEach((r) => {
          templateConfig.variaveis_proposta_labels[r.chave] = { nome: r.nome || r.chave, sufixo: (r.sufixo || '').trim() };
        });
      }
    }
    
    const requestBaseURL = process.env.API_URL || ((req.protocol || 'http') + '://' + (req.get('host') || req.headers.host || 'localhost:5000'));
    let html;
    const usouSnapshot = proposta.html_rendered && String(proposta.html_rendered).trim().length > 0;
    if (usouSnapshot) {
      html = proposta.html_rendered;
    } else {
      let compList = [];
      if (templateConfig && templateConfig.componentes) {
        if (typeof templateConfig.componentes === 'string') { try { compList = JSON.parse(templateConfig.componentes); } catch (_) {} }
        else if (Array.isArray(templateConfig.componentes)) compList = templateConfig.componentes;
      }
      html = (Array.isArray(compList) && compList.length > 0)
        ? gerarHTMLPropostaFromComponentes(proposta, itensArray, totais, templateConfig, requestBaseURL, true, true)
        : gerarHTMLPropostaPremium(proposta, itensArray, totais, templateConfig, requestBaseURL, true, true);
    }
    if (!html || typeof html !== 'string' || html.trim().length === 0) {
      throw new Error('HTML da proposta está vazio');
    }
    
    browser = await puppeteer.launch({
      ...getPuppeteerLaunchOptions(),
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ]
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 1600, deviceScaleFactor: 2 });
    
    await page.setContent(html, {
      waitUntil: ['load', 'domcontentloaded', 'networkidle0'],
      timeout: 60000
    });
    
    await new Promise((r) => setTimeout(r, 1500));
    
    // Disparar lógica de quebra de página (evitar seção começar numa página e terminar na outra)
    await page.evaluate(() => { window.dispatchEvent(new Event('beforeprint')); });
    await new Promise((r) => setTimeout(r, 450));
    
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
      margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
      scale: 1.0
    });
    
    await browser.close();
    browser = null;
    
    // Snapshot: gravar HTML/CSS (e checksum se a coluna existir) para reprodução futura
    if (!usouSnapshot && html) {
      const cssMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/);
      const cssSnapshot = (cssMatch && cssMatch[1]) ? cssMatch[1].trim() : null;
      db.run(
        `UPDATE propostas SET html_rendered = ?, css_snapshot = ?, pdf_gerado_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [html, cssSnapshot || null, id],
        (errUpdate) => {
          if (errUpdate) console.error('Aviso: não foi possível gravar snapshot da proposta:', errUpdate.message);
        }
      );
      try {
        const checksum = propostaEngine.snapshotChecksum(html, cssSnapshot || '');
        db.run(
          `UPDATE propostas SET snapshot_checksum = ? WHERE id = ?`,
          [checksum, id],
          (errChecksum) => { if (errChecksum) { /* coluna pode não existir ainda */ } }
        );
        db.run(
          `INSERT INTO proposta_snapshot (proposta_id, html_rendered, css_snapshot, checksum) VALUES (?, ?, ?, ?)`,
          [id, html, cssSnapshot || null, checksum],
          (errSnap) => { if (errSnap && !errSnap.message.includes('no such table')) console.error('Aviso: proposta_snapshot:', errSnap.message); }
        );
      } catch (e) {
        /* snapshot opcional; não falhar PDF */
      }
    }
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="proposta-${(proposta.numero_proposta || id).replace(/[/\\]/g, '-')}.pdf"`);
    res.send(pdfBuffer);
    
  } catch (error) {
    if (browser) {
      try { await browser.close(); } catch (_) {}
    }
    console.error('Erro ao gerar PDF (Puppeteer):', error);
    console.error('Stack:', error.stack);
    if (!res.headersSent) {
      const isProd = process.env.NODE_ENV === 'production';
      const errorMessage = isProd
        ? `Erro ao gerar PDF: ${error.message || 'erro desconhecido'}`
        : `Erro ao gerar PDF: ${error.message}\nStack: ${error.stack}`;
      return res.status(500).json({
        error: errorMessage,
        details: !isProd ? { message: error.message, stack: error.stack, name: error.name } : { message: error.message }
      });
    }
  }
});

// ========== ROTAS DE CONFIGURAÇÃO DE TEMPLATE DE PROPOSTA ==========
// Obter configuração do template
app.get('/api/proposta-template', authenticateToken, (req, res) => {
  const { familia } = req.query;
  let query = 'SELECT * FROM proposta_template_config';
  const params = [];
  
  if (familia) {
    query += ' WHERE familia = ?';
    params.push(familia);
  }
  
  query += ' ORDER BY id DESC LIMIT 1';
  
  db.get(query, params, (err, config) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!config) {
      // Retornar configuração padrão
      return res.json({
        familia: familia || 'Geral',
        nome_empresa: 'GMP INDUSTRIAIS',
        logo_url: null,
        cor_primaria: '#0066CC',
        cor_secundaria: '#003366',
        cor_texto: '#333333',
        mostrar_logo: 1,
        cabecalho_customizado: '',
        rodape_customizado: '',
        texto_introducao: '',
        mostrar_especificacoes: 1,
        mostrar_imagens_produtos: 1,
        formato_numero_proposta: 'PROPOSTA TÉCNICA COMERCIAL N° {numero}',
        componentes: null,
        variaveis_proposta_tecnica: [],
        variaveis_proposta_por_familia: {},
        margin_impressao_top_primeira: 20,
        margin_impressao_top_outras: 50,
        margin_impressao_bottom: 45,
        margin_impressao_lateral: 20,
        margin_navegador_top: 19,
        margin_navegador_bottom: 19
      });
    }
    if (config.variaveis_proposta_tecnica && typeof config.variaveis_proposta_tecnica === 'string') {
      try {
        config.variaveis_proposta_tecnica = JSON.parse(config.variaveis_proposta_tecnica);
      } catch (_) {
        config.variaveis_proposta_tecnica = [];
      }
    }
    if (!Array.isArray(config.variaveis_proposta_tecnica)) {
      config.variaveis_proposta_tecnica = [];
    }
    if (config.variaveis_proposta_por_familia != null && typeof config.variaveis_proposta_por_familia === 'string') {
      try {
        config.variaveis_proposta_por_familia = JSON.parse(config.variaveis_proposta_por_familia);
      } catch (_) {
        config.variaveis_proposta_por_familia = {};
      }
    }
    if (!config.variaveis_proposta_por_familia || typeof config.variaveis_proposta_por_familia !== 'object') {
      config.variaveis_proposta_por_familia = {};
    }
    if (config.margin_impressao_top_primeira == null) config.margin_impressao_top_primeira = 20;
    if (config.margin_impressao_top_outras == null) config.margin_impressao_top_outras = 50;
    if (config.margin_impressao_bottom == null) config.margin_impressao_bottom = 45;
    if (config.margin_impressao_lateral == null) config.margin_impressao_lateral = 20;
    if (config.margin_navegador_top == null) config.margin_navegador_top = 19;
    if (config.margin_navegador_bottom == null) config.margin_navegador_bottom = 19;
    res.json(config);
  });
});

// Salvar/Atualizar configuração do template
app.post('/api/proposta-template', authenticateToken, (req, res) => {
  const {
    familia,
    nome_empresa,
    logo_url,
    cor_primaria,
    cor_secundaria,
    cor_texto,
    mostrar_logo,
    cabecalho_customizado,
    rodape_customizado,
    texto_introducao,
    mostrar_especificacoes,
    mostrar_imagens_produtos,
    formato_numero_proposta,
    componentes,
    variaveis_proposta_tecnica,
    variaveis_proposta_por_familia,
    margin_impressao_top_primeira,
    margin_impressao_top_outras,
    margin_impressao_bottom,
    margin_impressao_lateral,
    margin_navegador_top,
    margin_navegador_bottom,
    header_image_url,
    footer_image_url,
    contrato_anexo_url
  } = req.body;

  // Verificar se já existe configuração para esta família
  const queryFamilia = familia ? 'WHERE familia = ?' : 'WHERE familia IS NULL OR familia = \'Geral\'';
  const paramsFamilia = familia ? [familia] : [];
  const variaveisPorFamiliaStr = (variaveis_proposta_por_familia && typeof variaveis_proposta_por_familia === 'object')
    ? JSON.stringify(variaveis_proposta_por_familia) : '{}';

  db.get(`SELECT * FROM proposta_template_config ${queryFamilia} ORDER BY id DESC LIMIT 1`, paramsFamilia, (err, existing) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (existing) {
      // Atualizar
      const variaveisPropostaStr = Array.isArray(variaveis_proposta_tecnica) ? JSON.stringify(variaveis_proposta_tecnica) : (variaveis_proposta_tecnica || null);
      const marginTopPrimeira = margin_impressao_top_primeira != null ? Number(margin_impressao_top_primeira) : 20;
      const marginTopOutras = margin_impressao_top_outras != null ? Number(margin_impressao_top_outras) : 50;
      const marginBottom = margin_impressao_bottom != null ? Number(margin_impressao_bottom) : 45;
      const marginLateral = margin_impressao_lateral != null ? Number(margin_impressao_lateral) : 20;
      const marginNavegadorTop = margin_navegador_top != null ? Number(margin_navegador_top) : 19;
      const marginNavegadorBottom = margin_navegador_bottom != null ? Number(margin_navegador_bottom) : 19;
      db.run(
        `UPDATE proposta_template_config SET 
          familia = ?, nome_empresa = ?, logo_url = ?, cor_primaria = ?, cor_secundaria = ?,
          cor_texto = ?, mostrar_logo = ?, cabecalho_customizado = ?,
          rodape_customizado = ?, texto_introducao = ?, mostrar_especificacoes = ?,
          mostrar_imagens_produtos = ?, formato_numero_proposta = ?, componentes = ?,
          variaveis_proposta_tecnica = ?, variaveis_proposta_por_familia = ?,
          margin_impressao_top_primeira = ?, margin_impressao_top_outras = ?, margin_impressao_bottom = ?, margin_impressao_lateral = ?,
          margin_navegador_top = ?, margin_navegador_bottom = ?,
          header_image_url = ?, footer_image_url = ?, contrato_anexo_url = ?,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          familia || 'Geral',
          nome_empresa || 'GMP INDUSTRIAIS',
          logo_url || null,
          cor_primaria || '#0066CC',
          cor_secundaria || '#003366',
          cor_texto || '#333333',
          mostrar_logo !== undefined ? mostrar_logo : 1,
          cabecalho_customizado || '',
          rodape_customizado || '',
          texto_introducao || '',
          mostrar_especificacoes !== undefined ? mostrar_especificacoes : 1,
          mostrar_imagens_produtos !== undefined ? mostrar_imagens_produtos : 1,
          formato_numero_proposta || 'PROPOSTA TÉCNICA COMERCIAL N° {numero}',
          componentes || null,
          variaveisPropostaStr,
          variaveisPorFamiliaStr,
          marginTopPrimeira,
          marginTopOutras,
          marginBottom,
          marginLateral,
          marginNavegadorTop,
          marginNavegadorBottom,
          header_image_url !== undefined ? header_image_url : existing.header_image_url,
          footer_image_url !== undefined ? footer_image_url : existing.footer_image_url,
          contrato_anexo_url !== undefined ? contrato_anexo_url : existing.contrato_anexo_url,
          existing.id
        ],
        function(err) {
          if (err) {
            return res.status(500).json({ error: err.message });
          }
          res.json({ message: 'Configuração atualizada com sucesso', id: existing.id });
        }
      );
    } else {
      // Criar nova
      const variaveisPropostaStr = Array.isArray(variaveis_proposta_tecnica) ? JSON.stringify(variaveis_proposta_tecnica) : (variaveis_proposta_tecnica || null);
      const marginTopPrimeira = margin_impressao_top_primeira != null ? Number(margin_impressao_top_primeira) : 20;
      const marginTopOutras = margin_impressao_top_outras != null ? Number(margin_impressao_top_outras) : 50;
      const marginBottom = margin_impressao_bottom != null ? Number(margin_impressao_bottom) : 45;
      const marginLateral = margin_impressao_lateral != null ? Number(margin_impressao_lateral) : 20;
      const marginNavegadorTop = margin_navegador_top != null ? Number(margin_navegador_top) : 19;
      const marginNavegadorBottom = margin_navegador_bottom != null ? Number(margin_navegador_bottom) : 19;
      db.run(
        `INSERT INTO proposta_template_config (
          familia, nome_empresa, logo_url, cor_primaria, cor_secundaria, cor_texto,
          mostrar_logo, cabecalho_customizado, rodape_customizado, texto_introducao,
          mostrar_especificacoes, mostrar_imagens_produtos, formato_numero_proposta, componentes, variaveis_proposta_tecnica, variaveis_proposta_por_familia,
          margin_impressao_top_primeira, margin_impressao_top_outras, margin_impressao_bottom, margin_impressao_lateral,
          margin_navegador_top, margin_navegador_bottom, header_image_url, footer_image_url, contrato_anexo_url
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          familia || 'Geral',
          nome_empresa || 'GMP INDUSTRIAIS',
          logo_url || null,
          cor_primaria || '#0066CC',
          cor_secundaria || '#003366',
          cor_texto || '#333333',
          mostrar_logo !== undefined ? mostrar_logo : 1,
          cabecalho_customizado || '',
          rodape_customizado || '',
          texto_introducao || '',
          mostrar_especificacoes !== undefined ? mostrar_especificacoes : 1,
          mostrar_imagens_produtos !== undefined ? mostrar_imagens_produtos : 1,
          formato_numero_proposta || 'PROPOSTA TÉCNICA COMERCIAL N° {numero}',
          componentes || null,
          variaveisPropostaStr,
          variaveisPorFamiliaStr,
          marginTopPrimeira,
          marginTopOutras,
          marginBottom,
          marginLateral,
          marginNavegadorTop,
          marginNavegadorBottom,
          header_image_url || null,
          footer_image_url || null,
          contrato_anexo_url || null
        ],
        function(err) {
          if (err) {
            return res.status(500).json({ error: err.message });
          }
          res.json({ message: 'Configuração criada com sucesso', id: this.lastID });
        }
      );
    }
  });
});

// Listar templates salvos
app.get('/api/proposta-template/list', authenticateToken, (req, res) => {
  const { familia } = req.query;
  let query = 'SELECT id, nome_template, familia, is_padrao, created_at, updated_at FROM proposta_template_config';
  const params = [];
  
  if (familia) {
    query += ' WHERE familia = ?';
    params.push(familia);
  }
  
  query += ' ORDER BY is_padrao DESC, updated_at DESC';
  
  db.all(query, params, (err, templates) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(templates || []);
  });
});

// Carregar template específico
app.get('/api/proposta-template/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  db.get('SELECT * FROM proposta_template_config WHERE id = ?', [id], (err, config) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!config) {
      return res.status(404).json({ error: 'Template não encontrado' });
    }
    res.json(config);
  });
});

// Salvar como novo template
app.post('/api/proposta-template/save-as', authenticateToken, (req, res) => {
  const {
    nome_template,
    familia,
    nome_empresa,
    logo_url,
    cor_primaria,
    cor_secundaria,
    cor_texto,
    mostrar_logo,
    cabecalho_customizado,
    rodape_customizado,
    texto_introducao,
    mostrar_especificacoes,
    mostrar_imagens_produtos,
    formato_numero_proposta,
    componentes
  } = req.body;

  if (!nome_template) {
    return res.status(400).json({ error: 'Nome do template é obrigatório' });
  }

  db.run(
    `INSERT INTO proposta_template_config (
      nome_template, familia, nome_empresa, logo_url, cor_primaria, cor_secundaria, cor_texto,
      mostrar_logo, cabecalho_customizado, rodape_customizado, texto_introducao,
      mostrar_especificacoes, mostrar_imagens_produtos, formato_numero_proposta, componentes, is_padrao
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [
      nome_template,
      familia || 'Geral',
      nome_empresa || 'GMP INDUSTRIAIS',
      logo_url || null,
      cor_primaria || '#0066CC',
      cor_secundaria || '#003366',
      cor_texto || '#333333',
      mostrar_logo !== undefined ? mostrar_logo : 1,
      cabecalho_customizado || '',
      rodape_customizado || '',
      texto_introducao || '',
      mostrar_especificacoes !== undefined ? mostrar_especificacoes : 1,
      mostrar_imagens_produtos !== undefined ? mostrar_imagens_produtos : 1,
      formato_numero_proposta || 'PROPOSTA TÉCNICA COMERCIAL N° {numero}',
      componentes || null
    ],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ message: 'Template salvo com sucesso', id: this.lastID });
    }
  );
});

// Restaurar template padrão
app.post('/api/proposta-template/restore-default', authenticateToken, (req, res) => {
  const { familia } = req.body;
  
  // Deletar templates personalizados da família
  let query = 'DELETE FROM proposta_template_config WHERE is_padrao = 0';
  const params = [];
  
  if (familia) {
    query += ' AND familia = ?';
    params.push(familia);
  } else {
    query += ' AND (familia IS NULL OR familia = \'Geral\')';
  }
  
  db.run(query, params, (err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ message: 'Template padrão restaurado' });
  });
});

// Upload de logo
app.post('/api/proposta-template/logo', authenticateToken, uploadLogo.single('logo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  }

  // Deletar logo antigo se existir
  db.get('SELECT logo_url FROM proposta_template_config ORDER BY id DESC LIMIT 1', [], (err, config) => {
    if (config && config.logo_url) {
      const oldLogoPath = path.join(uploadsLogosDir, config.logo_url);
      if (fs.existsSync(oldLogoPath)) {
        fs.unlinkSync(oldLogoPath);
      }
    }

    // Atualizar configuração com novo logo
    db.run(
      'UPDATE proposta_template_config SET logo_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = (SELECT id FROM proposta_template_config ORDER BY id DESC LIMIT 1)',
      [req.file.filename],
      (err) => {
        if (err) {
          // Deletar arquivo se houver erro
          if (fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
          }
          return res.status(500).json({ error: err.message });
        }
        res.json({
          message: 'Logo enviado com sucesso',
          filename: req.file.filename,
          url: `/api/uploads/logos/${req.file.filename}`
        });
      }
    );
  });
});

// Upload de imagem de cabeçalho
app.post('/api/proposta-template/header-image', authenticateToken, uploadHeader.single('headerImage'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  }

  // Deletar imagem antiga se existir
  db.get('SELECT header_image_url FROM proposta_template_config ORDER BY id DESC LIMIT 1', [], (err, config) => {
    if (config && config.header_image_url) {
      const oldImagePath = path.join(uploadsHeaderDir, config.header_image_url);
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }
    }

    // Atualizar configuração com nova imagem
    db.run(
      'UPDATE proposta_template_config SET header_image_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = (SELECT id FROM proposta_template_config ORDER BY id DESC LIMIT 1)',
      [req.file.filename],
      (err) => {
        if (err) {
          // Deletar arquivo se houver erro
          if (fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
          }
          return res.status(500).json({ error: err.message });
        }
        res.json({
          message: 'Imagem de cabeçalho enviada com sucesso',
          filename: req.file.filename,
          url: `/api/uploads/headers/${req.file.filename}`
        });
      }
    );
  });
});

// Upload de imagem de rodapé (com autenticação)
app.post('/api/proposta-template/footer-image', authenticateToken, uploadFooter.single('footerImage'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  }

  // Deletar imagem antiga se existir
  db.get('SELECT footer_image_url FROM proposta_template_config ORDER BY id DESC LIMIT 1', [], (err, config) => {
    if (config && config.footer_image_url) {
      const oldImagePath = path.join(uploadsFooterDir, config.footer_image_url);
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }
    }

    // Atualizar configuração com nova imagem
    db.run(
      'UPDATE proposta_template_config SET footer_image_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = (SELECT id FROM proposta_template_config ORDER BY id DESC LIMIT 1)',
      [req.file.filename],
      (err) => {
        if (err) {
          // Deletar arquivo se houver erro
          if (fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
          }
          return res.status(500).json({ error: err.message });
        }
        res.json({
          message: 'Imagem de rodapé enviada com sucesso',
          filename: req.file.filename,
          url: `/api/uploads/footers/${req.file.filename}`
        });
      }
    );
  });
});

// Upload de contrato anexo (Word/PDF) – acompanha a proposta
app.post('/api/proposta-template/contrato-anexo', authenticateToken, uploadContrato.single('contratoAnexo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  }
  db.get('SELECT contrato_anexo_url FROM proposta_template_config ORDER BY id DESC LIMIT 1', [], (err, config) => {
    if (config && config.contrato_anexo_url) {
      const oldPath = path.join(uploadsContratoDir, config.contrato_anexo_url);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
    db.run(
      'UPDATE proposta_template_config SET contrato_anexo_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = (SELECT id FROM proposta_template_config ORDER BY id DESC LIMIT 1)',
      [req.file.filename],
      (err) => {
        if (err) {
          if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
          return res.status(500).json({ error: err.message });
        }
        res.json({
          message: 'Contrato anexo enviado com sucesso',
          filename: req.file.filename,
          url: `/api/uploads/contrato/${req.file.filename}`
        });
      }
    );
  });
});

// ========== Blocos técnicos/comerciais (motor de composição) ==========
app.get('/api/proposta-blocos', authenticateToken, (req, res) => {
  const { familia, tipo, ativo } = req.query;
  let query = 'SELECT * FROM proposta_blocos WHERE 1=1';
  const params = [];
  if (familia) { query += ' AND (familia = ? OR familia IS NULL OR familia = \'\')'; params.push(familia); }
  if (tipo) { query += ' AND tipo = ?'; params.push(tipo); }
  if (ativo !== undefined && ativo !== '') { query += ' AND ativo = ?'; params.push(ativo === 'true' || ativo === '1' ? 1 : 0); }
  query += ' ORDER BY ordem ASC, id ASC';
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});
app.post('/api/proposta-blocos', authenticateToken, (req, res) => {
  const { familia, tipo, nome, conteudo_html, ordem, regras_condicionais, ativo } = req.body;
  const regras = typeof regras_condicionais === 'string' ? regras_condicionais : (regras_condicionais ? JSON.stringify(regras_condicionais) : null);
  db.run(
    'INSERT INTO proposta_blocos (familia, tipo, nome, conteudo_html, ordem, regras_condicionais, ativo) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [familia || null, tipo || 'tecnico', nome || 'Bloco', conteudo_html || '', ordem != null ? ordem : 0, regras, ativo !== undefined ? (ativo ? 1 : 0) : 1],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id: this.lastID, familia, tipo, nome, ordem: ordem != null ? ordem : 0 });
    }
  );
});
app.put('/api/proposta-blocos/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { familia, tipo, nome, conteudo_html, ordem, regras_condicionais, ativo } = req.body;
  const regras = typeof regras_condicionais === 'string' ? regras_condicionais : (regras_condicionais ? JSON.stringify(regras_condicionais) : null);
  db.run(
    'UPDATE proposta_blocos SET familia = ?, tipo = ?, nome = ?, conteudo_html = ?, ordem = ?, regras_condicionais = ?, ativo = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [familia || null, tipo || 'tecnico', nome || 'Bloco', conteudo_html || '', ordem != null ? ordem : 0, regras, ativo !== undefined ? (ativo ? 1 : 0) : 1, id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Bloco atualizado' });
    }
  );
});
app.delete('/api/proposta-blocos/:id', authenticateToken, (req, res) => {
  db.run('DELETE FROM proposta_blocos WHERE id = ?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Bloco excluído' });
  });
});

// ========== Biblioteca de textos (dados brutos vs exibição) ==========
app.get('/api/proposta-texto-biblioteca', authenticateToken, (req, res) => {
  const { familia, chave, ativo } = req.query;
  let query = 'SELECT * FROM proposta_texto_biblioteca WHERE 1=1';
  const params = [];
  if (familia) { query += ' AND (familia = ? OR familia IS NULL OR familia = \'\')'; params.push(familia); }
  if (chave) { query += ' AND chave = ?'; params.push(chave); }
  if (ativo !== undefined && ativo !== '') { query += ' AND ativo = ?'; params.push(ativo === 'true' || ativo === '1' ? 1 : 0); }
  query += ' ORDER BY chave ASC';
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});
app.post('/api/proposta-texto-biblioteca', authenticateToken, (req, res) => {
  const { chave, texto_bruto, texto_exibicao, familia, ativo } = req.body;
  db.run(
    'INSERT INTO proposta_texto_biblioteca (chave, texto_bruto, texto_exibicao, familia, ativo) VALUES (?, ?, ?, ?, ?)',
    [chave || '', texto_bruto || '', texto_exibicao || '', familia || null, ativo !== undefined ? (ativo ? 1 : 0) : 1],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id: this.lastID, chave: chave || '' });
    }
  );
});
app.put('/api/proposta-texto-biblioteca/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { chave, texto_bruto, texto_exibicao, familia, ativo } = req.body;
  db.run(
    'UPDATE proposta_texto_biblioteca SET chave = ?, texto_bruto = ?, texto_exibicao = ?, familia = ?, ativo = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [chave || '', texto_bruto || '', texto_exibicao || '', familia || null, ativo !== undefined ? (ativo ? 1 : 0) : 1, id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Texto atualizado' });
    }
  );
});
app.delete('/api/proposta-texto-biblioteca/:id', authenticateToken, (req, res) => {
  db.run('DELETE FROM proposta_texto_biblioteca WHERE id = ?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Texto excluído' });
  });
});

// Gera HTML da proposta a partir dos componentes salvos no editor de template (modo visual).
// Usado quando o usuário configurou blocos no Editor de Template; preview e PDF usam esse layout.
function gerarHTMLPropostaFromComponentes(proposta, itens, totais, templateConfig, baseURLOverride, forPdfServer, omitPrintBar) {
  const config = templateConfig || {};
  let componentes = [];
  if (config.componentes) {
    if (typeof config.componentes === 'string') {
      try { componentes = JSON.parse(config.componentes); } catch (_) {}
    } else if (Array.isArray(config.componentes)) {
      componentes = config.componentes;
    }
  }
  if (!Array.isArray(componentes) || componentes.length === 0) return null;

  const logoBaseURL = (baseURLOverride && typeof baseURLOverride === 'string') ? baseURLOverride.replace(/\/$/, '') : (process.env.API_URL || 'http://localhost:5000');
  let logoGMP = `${logoBaseURL}/logo-gmp.png`;
  if (config.logo_url) logoGMP = `${logoBaseURL}/api/uploads/logos/${config.logo_url}`;
  const esc = (t) => (t || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const fmt = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n) || 0);
  proposta = proposta || {};
  proposta.numero_proposta = proposta.numero_proposta || 'N/A';
  proposta.titulo = proposta.titulo || 'Proposta Técnica Comercial';
  totais = totais || { subtotal: 0, total: 0, dataEmissao: '', dataValidade: '' };
  itens = Array.isArray(itens) ? itens : [];

  let headerImageURL = `${logoBaseURL}/cabecalho.jpg?t=${Date.now()}`;
  let headerImageFixedURL = null;
  if (config.header_image_url) headerImageFixedURL = `${logoBaseURL}/api/uploads/headers/${config.header_image_url}?t=${Date.now()}`;
  let footerImageURL = null;
  if (config.footer_image_url) footerImageURL = `${logoBaseURL}/api/uploads/footers/${config.footer_image_url}?t=${Date.now()}`;

  const marginTopPrimeira = Math.max(10, Math.min(80, Number(config.margin_impressao_top_primeira) || 20));
  const marginTopOutras = Math.max(20, Math.min(120, Number(config.margin_impressao_top_outras) || 50));
  const marginBottom = Math.max(20, Math.min(80, Number(config.margin_impressao_bottom) || 45));
  const marginLateral = Math.max(10, Math.min(50, Number(config.margin_impressao_lateral) || 20));

  function renderBlock(c) {
    const tipo = (c.tipo || '').toLowerCase();
    const cf = c.config || {};
    switch (tipo) {
      case 'cabecalho':
        return `<div class="proposta-header" style="background: linear-gradient(135deg, #0d2b4a 0%, #1a4d7a 50%, #0f3460 100%); padding: 40px 50px; min-height: 200px; display: flex; align-items: center; justify-content: space-between;">
          <div>
            <div style="font-size: 28px; font-weight: 700; color: #fff;">PROPOSTA TÉCNICA COMERCIAL Nº ${esc(proposta.numero_proposta)}</div>
            <div style="font-size: 14px; color: rgba(255,255,255,0.95); margin-top: 8px;">${esc(proposta.titulo)}</div>
          </div>
          <div>${config.logo_url ? `<img src="${logoBaseURL}/api/uploads/logos/${config.logo_url}" alt="Logo" style="max-height: 120px;">` : `<img src="${logoGMP}" alt="Logo" style="max-height: 120px;">`}</div>
        </div>`;
      case 'dados_cliente':
        return `<div class="section" style="page-break-inside: avoid;"><div class="section-title">EMPRESA CONTRATANTE: ${esc(proposta.nome_fantasia || proposta.razao_social || '')}</div>
          <table class="dados-table" style="width:100%; border-collapse: collapse;"><tbody>
            ${proposta.cnpj ? `<tr><td style="padding:4px 8px 4px 0; color:#555;">CNPJ:</td><td>${esc(proposta.cnpj)}</td></tr>` : ''}
            <tr><td style="padding:4px 8px 4px 0; color:#555;">A/c.:</td><td>${esc(proposta.cliente_contato || '')}</td></tr>
            <tr><td style="padding:4px 8px 4px 0; color:#555;">Departamento:</td><td>${esc(proposta.cliente_departamento || '')}</td></tr>
            <tr><td style="padding:4px 8px 4px 0; color:#555;">Data de emissão:</td><td>${esc(totais.dataEmissao || '')}</td></tr>
          </tbody></table></div>`;
      case 'produtos':
        return `<div class="section" style="page-break-inside: avoid;"><div class="section-title">OFERTA / PRODUTOS</div>
          <table style="width:100%; border-collapse: collapse; border: 1px solid #ddd;"><thead><tr><th style="border:1px solid #ddd; padding:8px;">ITEM</th><th style="border:1px solid #ddd; padding:8px;">QUANT.</th><th style="border:1px solid #ddd; padding:8px;">DESCRIÇÃO</th></tr></thead><tbody>
          ${itens.map((item, i) => `<tr><td style="border:1px solid #ddd; padding:8px;">${i + 1}</td><td style="border:1px solid #ddd; padding:8px;">${esc(item.quantidade || '')} ${esc(item.unidade || 'UN')}</td><td style="border:1px solid #ddd; padding:8px;">${esc(item.descricao || item.nome || '')}</td></tr>`).join('')}
          </tbody></table></div>`;
      case 'valores':
        return `<div class="section" style="page-break-inside: avoid;"><div class="section-title">TABELA DE PREÇOS</div>
          <table style="width:100%; border-collapse: collapse; border: 1px solid #ddd;"><thead><tr><th style="border:1px solid #ddd; padding:8px;">ITEM</th><th style="border:1px solid #ddd; padding:8px;">DESCRIÇÃO</th><th style="border:1px solid #ddd; padding:8px;">QUANT.</th><th style="border:1px solid #ddd; padding:8px;">PREÇO UNIT.</th><th style="border:1px solid #ddd; padding:8px;">TOTAL</th></tr></thead><tbody>
          ${itens.map((item, i) => {
            const q = parseFloat(item.quantidade) || 1;
            const u = parseFloat(item.valor_unitario) || 0;
            const t = parseFloat(item.valor_total) || (q * u);
            return `<tr><td style="border:1px solid #ddd; padding:8px;">${i + 1}</td><td style="border:1px solid #ddd; padding:8px;">${esc(item.descricao || item.nome || '')}</td><td style="border:1px solid #ddd; padding:8px;">${q} ${esc(item.unidade || 'UN')}</td><td style="border:1px solid #ddd; padding:8px;">${fmt(u)}</td><td style="border:1px solid #ddd; padding:8px;">${fmt(t)}</td></tr>`;
          }).join('')}
          </tbody></table><p style="margin-top:12px; text-align:right;"><strong>Total: ${fmt(totais.total)}</strong></p></div>`;
      case 'condicoes':
        return getPropostaEquipamentosOnlyHTML(proposta, itens, totais, config, esc);
      case 'texto':
        return `<div class="section" style="page-break-inside: avoid;">${cf.titulo ? `<div class="section-title">${esc(cf.titulo)}</div>` : ''}<div class="texto-corpo"><p style="font-size: ${cf.tamanho === 'grande' ? '16px' : cf.tamanho === 'pequeno' ? '12px' : '14px' };">${esc(cf.conteudo || '')}</p></div></div>`;
      case 'tabela':
        return `<div class="section" style="page-break-inside: avoid;">${cf.titulo ? `<div class="section-title">${esc(cf.titulo)}</div>` : ''}<table style="width:100%; border-collapse: collapse; border: 1px solid #ddd;"><thead><tr>${(cf.colunas || []).map(col => `<th style="border:1px solid #ddd; padding:8px;">${esc(col)}</th>`).join('')}</tr></thead><tbody>${(cf.linhas || []).map(linha => `<tr>${(linha || []).map(cel => `<td style="border:1px solid #ddd; padding:8px;">${esc(cel)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
      case 'imagem':
        return cf.url ? `<div class="section" style="page-break-inside: avoid;"><div style="text-align:center;"><img src="${esc(cf.url)}" alt="${esc(cf.alt)}" style="max-width: ${cf.largura || '100%'}; height: auto;"></div></div>` : '';
      case 'rodape':
        return `<div class="section" style="page-break-inside: avoid; padding: 20px; background: #0f3460; color: #fff; text-align: center;"><p>${esc(config.nome_empresa || 'GMP')}</p></div>`;
      case 'divisor':
        return `<div style="border-top: 2px solid ${config.cor_primaria || '#0066CC'}; margin: 15px 0;"></div>`;
      case 'espaco':
        return `<div style="height: ${cf.altura || '30px'};"></div>`;
      case 'titulo':
        return `<h2 style="color: ${config.cor_primaria || '#0066CC'}; font-size: 18px; font-weight: bold; margin-bottom: 10px;">${esc(cf.texto || 'Título')}</h2>`;
      case 'subtitulo':
        return `<h3 style="color: ${config.cor_secundaria || '#003366'}; font-size: 14px; font-weight: 600; margin-bottom: 8px;">${esc(cf.texto || 'Subtítulo')}</h3>`;
      case 'lista':
        return `<div class="section" style="page-break-inside: avoid;">${cf.titulo ? `<div class="section-title">${esc(cf.titulo)}</div>` : ''}<ul style="padding-left: 20px;">${(cf.itens || []).map(li => `<li style="margin-bottom: 5px;">${esc(li)}</li>`).join('')}</ul></div>`;
      default:
        return '';
    }
  }

  const partsBeforeBody = [];
  const partsBody = [];
  if (headerImageFixedURL) partsBeforeBody.push(`<div class="inicio-image-block"><img src="${headerImageFixedURL}" alt="Cabeçalho"></div>`);
  componentes.forEach(comp => {
    const html = renderBlock(comp);
    if (!html) return;
    if ((comp.tipo || '').toLowerCase() === 'cabecalho') partsBeforeBody.push(html);
    else partsBody.push(html);
  });
  if (footerImageURL) partsBody.push(`<div class="fim-image-block"><img src="${footerImageURL}" alt="Rodapé"></div>`);
  const bodyParts = partsBeforeBody.concat(['<div class="proposta-body">'], partsBody, ['</div>']);

  const printBar = (forPdfServer || omitPrintBar) ? '' : `<div class="print-tip-bar" style="padding:10px; background:#1a4d7a; color:#fff; text-align:center;"><button onclick="window.print()" style="padding:8px 20px; cursor:pointer;">Gerar PDF</button></div>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(proposta.titulo)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', 'Century Gothic', sans-serif; color: #1a1d21; line-height: 1.65; background: #fafbfc; font-size: 15px; }
    .proposta-container { max-width: 900px; margin: 0 auto; margin-top: 20px; background: #fff; box-shadow: 0 0 40px rgba(0,0,0,0.06); }
    .proposta-body { padding: 48px 56px 64px; background: #fff; }
    .section { margin-bottom: 24px; }
    .section-title { font-weight: 700; font-size: 14px; color: #0d2b4a; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
    .texto-corpo p { margin-bottom: 10px; }
    .inicio-image-block, .fim-image-block { width: 100%; margin: 0 0 24px 0; page-break-inside: avoid; display: block; }
    .inicio-image-block img, .fim-image-block img { width: 100%; height: auto; display: block; vertical-align: top; }
    @media print {
      .print-tip-bar { display: none !important; }
      @page { size: A4; margin: ${marginTopOutras}mm ${marginLateral}mm ${marginBottom}mm ${marginLateral}mm !important; }
      @page:first { margin-top: ${marginTopPrimeira}mm !important; }
      .inicio-image-block, .fim-image-block { page-break-inside: avoid !important; }
      .section, .proposta-body p, table, .texto-corpo, ul, ol, li { page-break-inside: avoid !important; }
    }
  </style>
</head>
<body>
  ${printBar}
  <div class="proposta-container"${omitPrintBar ? ' style="margin-top: 0;"' : ''}>
    ${bodyParts.join('')}
  </div>
</body>
</html>`;
}

// Substitui placeholders (simples e avançados: {{#if}}, {{#each}}, etc.) — usa motor de composição
function substituirPlaceholdersProposta(html, proposta, itens, totais) {
  if (!html || typeof html !== 'string') return html || '';
  try {
    const { prepareCompositionData, resolveAdvancedPlaceholders, buildPlaceholderContext } = propostaEngine;
    const { rawData, displayFields } = prepareCompositionData(proposta || {}, itens, totais, {});
    const phContext = buildPlaceholderContext(proposta || {}, itens, totais, displayFields, rawData);
    return resolveAdvancedPlaceholders(html, phContext);
  } catch (e) {
    console.error('Aviso: substituição de placeholders falhou, retornando HTML original:', e && e.message);
    return html;
  }
}

// Função para gerar HTML premium da proposta - Versão Limpa e Profissional
// forPdfServer = true: usado quando o PDF é gerado no servidor (Puppeteer); omite cabeçalho/rodapé fixos no HTML (Puppeteer usa displayHeaderFooter)
// omitPrintBar = true: omite a barra "Gerar PDF" no topo (para preview embed/iframe), assim o cabeçalho da proposta fica visível no topo
function gerarHTMLPropostaPremium(proposta, itens, totais, templateConfig = null, baseURLOverride = null, forPdfServer = false, omitPrintBar = false) {
  try {
    // Validar parâmetros
    if (!proposta) {
      throw new Error('Proposta não fornecida');
    }
    if (!itens || !Array.isArray(itens)) {
      itens = [];
    }
    if (!totais) {
      totais = { subtotal: 0, icms: 0, ipi: 0, total: 0, dataEmissao: '', dataValidade: '' };
    }
    
    // Configurações (baseURL do request para imagens carregarem corretamente no navegador)
    const config = templateConfig || {};
    const logoBaseURL = (baseURLOverride && typeof baseURLOverride === 'string') ? baseURLOverride.replace(/\/$/, '') : (process.env.API_URL || 'http://localhost:5000');
    const logoMoinhoYpiranga = `${logoBaseURL}/Logo_MY.jpg`;
    
    // Logo GMP para o cabeçalho (sempre GMP, nunca logo do cliente)
    let logoGMP = `${logoBaseURL}/logo-gmp.png`; // Padrão
    if (config.logo_url) {
      // Se tem logo do template, usar logo do template
      logoGMP = `${logoBaseURL}/api/uploads/logos/${config.logo_url}`;
    }
    
    // Imagem de fundo do cabeçalho na CAPA (primeira página) - imagem INDÚSTRIA 4.0
    // Usar cabecalho.jpg como padrão (imagem que mostra robôs industriais e tablet)
    // Adicionar timestamp para evitar cache do navegador
    const timestamp = new Date().getTime();
    const publicCabecalhoJPGPath = path.join(__dirname, '..', 'client', 'public', 'cabecalho.jpg');
    const publicCabecalhoPNGPath = path.join(__dirname, '..', 'client', 'public', 'CABECALHO.PNG');
    const publicCBC2Path = path.join(__dirname, '..', 'client', 'public', 'CBC2.png');
    
    // Prioridade: cabecalho.jpg (INDÚSTRIA 4.0) > CABECALHO.PNG > CBC2.png
    let defaultHeaderImage = 'cabecalho.jpg'; // Padrão: imagem INDÚSTRIA 4.0 para a capa
    if (fs.existsSync(publicCabecalhoJPGPath)) {
      defaultHeaderImage = 'cabecalho.jpg';
      console.log('✅ Usando cabecalho.jpg (INDÚSTRIA 4.0) como imagem de fundo da CAPA');
    } else if (fs.existsSync(publicCabecalhoPNGPath)) {
      defaultHeaderImage = 'CABECALHO.PNG';
      console.log('⚠️ cabecalho.jpg não encontrado, usando CABECALHO.PNG como fallback');
    } else if (fs.existsSync(publicCBC2Path)) {
      defaultHeaderImage = 'CBC2.png';
      console.log('⚠️ cabecalho.jpg não encontrado, usando CBC2.png como fallback');
    } else {
      console.log('⚠️ Nenhuma imagem de cabeçalho encontrada');
    }
    
    // Imagem de fundo do cabeçalho na CAPA (primeira página)
    let headerImageURL = `${logoBaseURL}/${defaultHeaderImage}?t=${timestamp}`;
    // NOTA: config.header_image_url é para o cabeçalho fixo das outras páginas, não para a capa
    
    // Cabeçalho fixo para impressão (a partir da segunda página)
    let headerImageFixedURL = null;
    if (config.header_image_url) {
      // Adicionar timestamp para evitar cache do navegador
      const timestamp = new Date().getTime();
      headerImageFixedURL = `${logoBaseURL}/api/uploads/headers/${config.header_image_url}?t=${timestamp}`;
    }
    
    let footerImageURL = null;
    if (config.footer_image_url) {
      // Adicionar timestamp para evitar cache do navegador
      const timestamp = new Date().getTime();
      footerImageURL = `${logoBaseURL}/api/uploads/footers/${config.footer_image_url}?t=${timestamp}`;
    }
    
    // Garantir valores padrão
    proposta = proposta || {};
    proposta.numero_proposta = proposta.numero_proposta || 'N/A';
    proposta.titulo = proposta.titulo || 'Proposta Técnica Comercial';
    
    const numeroFormatado = `PROPOSTA TÉCNICA COMERCIAL N° ${proposta.numero_proposta}`;
    
    // Função auxiliar para escapar HTML
    const esc = (text) => (text || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    
    // Margens de impressão (mm) - editáveis em Configurações; garantindo sempre números
    const marginTopPrimeira = Math.max(10, Math.min(80, Number(config.margin_impressao_top_primeira) || 20));
    const marginTopOutras = Math.max(20, Math.min(120, Number(config.margin_impressao_top_outras) || 50));
    const marginBottom = Math.max(20, Math.min(80, Number(config.margin_impressao_bottom) || 45));
    const marginLateral = Math.max(10, Math.min(50, Number(config.margin_impressao_lateral) || 20));
    /* Reserva de espaço (mm) para cabeçalho no topo e rodapé no fim — o texto da proposta fica sempre no meio entre eles */
    const reservaCabecalho = 32;
    const reservaRodape = 32;
    // Compensação quando imprime com Margens: Padrão/Personalizado — puxa cabeçalho/rodapé para a borda da folha
    const marginNavegadorTop = Math.max(0, Math.min(50, Number(config.margin_navegador_top) || 19));
    const marginNavegadorBottom = Math.max(0, Math.min(50, Number(config.margin_navegador_bottom) || 19));
    
    // HTML completo - Design limpo e profissional (placeholders {{...}} substituídos ao final)
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <!-- Margens impressão (mm): top_primeira=${marginTopPrimeira} top_outras=${marginTopOutras} bottom=${marginBottom} lateral=${marginLateral} -->
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(proposta.titulo)}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Segoe UI', 'Century Gothic', 'CenturyGothic', 'Frutiger', 'Helvetica Neue', sans-serif;
      color: #1a1d21;
      line-height: 1.65;
      background: #fafbfc;
      font-size: 15px;
      -webkit-font-smoothing: antialiased;
    }
    
    .proposta-container {
      max-width: 900px;
      margin: 0 auto;
      margin-top: 52px;
      background: #ffffff;
      box-shadow: 0 0 40px rgba(0,0,0,0.06);
    }
    
    /* Cabeçalho - Estilo exato da imagem */
    .proposta-header {
      background: linear-gradient(135deg, #0d2b4a 0%, #1a4d7a 50%, #0f3460 100%);
      padding: 40px 50px;
      position: relative;
      overflow: hidden;
      min-height: 280px;
      max-height: 320px;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    
    .proposta-header::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-image: url('${headerImageURL}');
      background-size: cover;
      background-position: center center;
      background-repeat: no-repeat;
      opacity: 0.5 !important; /* Aumentar opacidade para imagem ficar mais visível */
      z-index: 0;
      display: block !important;
      visibility: visible !important;
    }
    
    /* Overlay azul escuro - mais transparente para mostrar mais a imagem e o conteúdo */
    .proposta-header::after {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: linear-gradient(135deg, rgba(13, 43, 74, 0.4) 0%, rgba(26, 77, 122, 0.35) 50%, rgba(15, 52, 96, 0.4) 100%); /* Reduzir ainda mais a opacidade do overlay para conteúdo ficar mais visível */
      z-index: 1; /* Colocar acima da imagem mas abaixo do conteúdo */
    }
    
    /* Badge INDÚSTRIA 4.0 - Laranja no canto superior direito */
    .industry-badge {
      position: absolute;
      top: 20px;
      right: 50px;
      background: linear-gradient(135deg, #ff6b35 0%, #f7931e 100%);
      z-index: 1001 !important; /* Garantir que fique acima do cabeçalho fixo (z-index: 1000) */
      color: #ffffff;
      padding: 6px 18px;
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 1px;
      border-radius: 50px;
      text-transform: uppercase;
      box-shadow: 0 2px 8px rgba(255, 107, 53, 0.4);
      transition: all 0.3s ease;
      cursor: pointer;
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
    }
    
    .industry-badge:hover {
      background: linear-gradient(135deg, #ff8c42 0%, #ff6b35 100%);
      color: #ffffff;
      box-shadow: 0 4px 15px rgba(255, 107, 53, 0.6);
      transform: translateY(-2px);
    }
    
    .header-content {
      position: relative;
      z-index: 10 !important; /* Garantir que fique acima do overlay azul (z-index: 1) */
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      flex-wrap: wrap;
      gap: 30px;
      min-height: 200px;
    }
    
    .header-left {
      flex: 1;
      min-width: 500px;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    
    /* Títulos da proposta */
    .header-title-container {
      margin-bottom: 15px;
    }
    
    .header-title-main {
      font-size: 28px;
      font-weight: 700;
      color: #ffffff !important;
      margin-bottom: 3px;
      letter-spacing: 1.5px;
      line-height: 1.2;
      text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5), 0 0 10px rgba(0, 0, 0, 0.3) !important; /* Sombra para destacar o texto */
      position: relative;
      z-index: 11 !important;
    }
    
    .header-title-sub {
      font-size: 28px;
      font-weight: 700;
      color: #ffffff !important;
      margin-bottom: 10px;
      letter-spacing: 1.5px;
      text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5), 0 0 10px rgba(0, 0, 0, 0.3) !important; /* Sombra para destacar o texto */
      position: relative;
      z-index: 11 !important;
    }
    
    .header-title-number {
      font-size: 36px;
      font-weight: 800;
      color: #ffffff !important;
      letter-spacing: 2px;
      line-height: 1.2;
      margin-bottom: 10px;
      text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5), 0 0 10px rgba(0, 0, 0, 0.3) !important; /* Sombra para destacar o texto */
      position: relative;
      z-index: 11 !important; /* Garantir que fique acima do overlay */
    }
    
    .header-tagline {
      font-size: 14px;
      color: rgba(255, 255, 255, 0.95) !important;
      font-weight: 500;
      letter-spacing: 0.5px;
      margin-top: 5px;
      text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.5) !important; /* Sombra para destacar o texto */
      position: relative;
      z-index: 11 !important;
    }
    
    .header-right {
      position: absolute;
      top: 80px;
      right: 50px;
      background: #ffffff;
      border: 2px solid #1a4d7a;
      padding: 25px;
      border-radius: 5px;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3), 0 0 20px rgba(255, 255, 255, 0.5) !important; /* Sombra mais forte para destacar */
      z-index: 11 !important; /* Garantir que fique acima do overlay azul */
    }
    
    .header-right img {
      max-height: 200px;
      display: block;
      width: auto;
      filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2)); /* Sombra no logo para destacar */
    }
    
    .header-divider {
      display: none;
    }
    
    /* Conteúdo principal */
    .proposta-body {
      padding: 48px 56px 64px;
      background: #ffffff;
      margin-bottom: 0;
    }
    
    /* Imagem de início (bloco no fluxo, depois vem o texto — sempre visível quando configurada) */
    .inicio-image-block {
      width: 100%;
      margin: 0 0 24px 0;
      page-break-inside: avoid;
      display: block;
      min-height: 60px;
    }
    .inicio-image-block img {
      width: 100%;
      height: auto;
      display: block;
      max-width: 100%;
      margin: 0;
      padding: 0;
      vertical-align: top;
    }
    
    /* Imagem de fim (bloco no fluxo, no final do documento — sempre visível quando configurada) */
    .fim-image-block {
      width: 100%;
      margin-top: 24px;
      margin-bottom: 0;
      page-break-inside: avoid;
      display: block;
      min-height: 60px;
    }
    .fim-image-block img {
      width: 100%;
      height: auto;
      display: block;
      max-width: 100%;
      margin: 0;
      padding: 0;
      vertical-align: top;
    }
    
    /* Rodapé visível - premium */
    .proposta-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 16px;
      background: linear-gradient(180deg, #0d2b4a 0%, #0f3460 100%);
      color: #fff;
      padding: 18px 40px;
      margin-top: 0;
      border-top: 3px solid #ff6b35;
      font-size: 12px;
      letter-spacing: 0.02em;
    }
    
    .footer-content {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 20px;
      width: 100%;
      font-size: 12px;
      color: rgba(255,255,255,0.95);
    }
    
    .footer-left {
      flex: 1;
      min-width: 200px;
      font-weight: 600;
      color: #fff;
    }
    
    .footer-right {
      flex: 1;
      text-align: right;
      min-width: 200px;
      opacity: 0.95;
    }
    
    .footer-divider {
      height: 1px;
      background: rgba(255,255,255,0.2);
      margin: 10px 0;
    }
    
    .section {
      margin-top: 30px;
      margin-bottom: 50px;
      page-break-inside: auto; /* PERMITIR divisão natural entre páginas */
      page-break-before: auto; /* Permitir quebra antes se necessário */
    }
    
    .section:first-child {
      margin-top: 40px;
    }
    
    .produto-item {
      margin-bottom: 25px;
      page-break-inside: avoid;
    }
    
    .produto-subsection {
      margin-bottom: 20px;
    }
    
    .produto-subsection h3 {
      font-size: 20px;
      font-weight: 700;
      color: #1a4d7a;
      margin-bottom: 15px;
      border-bottom: 2px solid #ff6b35;
      padding-bottom: 10px;
    }
    
    .produto-item img {
      max-width: 100%;
      height: auto;
      border: 1px solid #e0e0e0;
      border-radius: 5px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    
    .section-title {
      font-size: 17px;
      font-weight: 700;
      color: #0d2b4a;
      margin-bottom: 18px;
      padding-bottom: 10px;
      border-bottom: 2px solid #ff6b35;
      letter-spacing: 0.02em;
      text-transform: none;
    }
    
    .dados-cliente-section {
      background: #ffffff;
      padding: 0;
      margin-bottom: 40px;
      page-break-inside: avoid;
    }
    
    .cliente-logo-container {
      text-align: center;
      margin-bottom: 3.75px;
      margin-top: 0;
      padding-top: 0;
    }
    
    .cliente-logo-container img {
      width: 75px;
      height: 75px;
      object-fit: contain;
      display: inline-block;
    }
    
    /* Garantir que dados do cliente apareçam na primeira página */
    .proposta-body {
      padding-top: 0;
    }
    
    .dados-cliente-section {
      padding-top: 0;
      margin-top: 0;
    }
    
    .dados-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
      border: 1px solid #1a4d7a;
    }
    
    .dados-table td {
      padding: 10px 15px;
      border: 1px solid #d0d0d0;
      vertical-align: top;
    }
    
    .dados-label {
      font-weight: 700;
      color: #1a4d7a;
      width: 180px;
      padding-right: 20px;
      background: #f8f9fa;
    }
    
    .dados-value {
      color: #2c3e50;
      font-weight: 400;
    }
    
    /* Tabela de descrição do item no escopo - Reduzida em 5% (de 89.375% para 84.9%) */
    .produto-item .dados-table {
      font-size: 0.8490625em;
    }
    
    .produto-item .dados-table td {
      padding: 8.490625px 12.7359375px;
      font-size: 0.8490625em;
    }
    
    .produto-item .dados-label {
      width: 152.83125px;
      font-size: 0.8490625em;
    }
    
    .produto-item .dados-value {
      font-size: 0.8490625em;
    }
    
    /* Título do item maior */
    .produto-item h3 {
      font-size: 20px !important;
      font-weight: 700 !important;
      margin-bottom: 15px !important;
      padding-bottom: 10px !important;
    }
    
    .texto-corpo {
      font-size: 13px;
      line-height: 1.8;
      color: #2c3e50;
      text-align: justify;
    }
    
    .valores-table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
      font-size: 12px;
      border: 1px solid #1a4d7a;
    }
    
    .valores-table th {
      background: #1a4d7a;
      color: #ffffff;
      padding: 12px;
      text-align: left;
      font-weight: 600;
      border: 1px solid #0f3460;
    }
    
    .valores-table td {
      padding: 12px;
      border: 1px solid #d0d0d0;
    }
    
    .valores-table tbody tr:nth-child(even) {
      background: #f8f9fa;
    }
    
    .valores-table tr:hover {
      background: #e8f4f8;
    }
    
    .total-row {
      background: #ff6b35 !important;
      color: #ffffff !important;
      font-weight: 700 !important;
      display: table-row !important;
      visibility: visible !important;
    }
    
    .total-row td {
      padding: 15px !important;
      border: 1px solid #e55a2b !important;
      background: #ff6b35 !important;
      color: #ffffff !important;
      font-weight: 700 !important;
    }
    
    /* Barra com botão e dica de impressão */
    .print-tip-bar {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 10000;
      display: flex;
      align-items: center;
      gap: 20px;
      padding: 12px 20px;
      background: linear-gradient(135deg, #0d2b4a 0%, #1a4d7a 100%);
      color: #fff;
      font-size: 13px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.2);
    }
    .print-tip-text {
      margin: 0;
      opacity: 0.95;
    }
    .print-tip-text strong {
      color: #ff9f43;
    }
    .btn-gerar-pdf {
      flex-shrink: 0;
      background: linear-gradient(135deg, #ff6b35 0%, #f7931e 100%);
      color: #ffffff;
      border: none;
      padding: 15px 30px;
      font-size: 16px;
      font-weight: 600;
      border-radius: 8px;
      cursor: pointer;
      box-shadow: 0 4px 15px rgba(255, 107, 53, 0.4);
      z-index: 10000;
      transition: all 0.3s ease;
    }
    
    .btn-gerar-pdf:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(255, 107, 53, 0.6);
    }
    
    /* Cabeçalho fixo - escondido na visualização normal, visível apenas no print */
    .print-header {
      display: none;
    }
    
    /* Print styles */
    @media print {
      .print-tip-bar {
        display: none !important;
      }
      .btn-gerar-pdf {
        display: none !important;
      }
      
      /* Margens da página */
      @page {
        size: A4;
        margin: ${marginTopOutras}mm ${marginLateral}mm ${marginBottom}mm ${marginLateral}mm !important;
      }
      @page:first {
        margin-top: ${marginTopPrimeira}mm !important;
      }
      /* Imagens de início/fim são blocos no fluxo (como no Word “em linha com texto”) — nunca sobrepõem */
      .inicio-image-block,
      .fim-image-block {
        page-break-inside: avoid !important;
        display: block !important;
      }
      
      /* Cabeçalho fixo REMOVIDO - não usar mais */
      .print-header {
        display: none !important;
        visibility: hidden !important;
        height: 0 !important;
        overflow: hidden !important;
      }
      
      /* Espaçador REMOVIDO - não usar mais */
      .header-spacer {
        display: none !important;
        visibility: hidden !important;
        height: 0 !important;
        overflow: hidden !important;
      }
      
      /* Garantir que todas as seções respeitem o cabeçalho fixo */
      .proposta-container {
        margin-top: 0 !important;
        padding-top: 0 !important;
      }
      
      /* Primeira página - cabeçalho completo não precisa do espaçador */
      .proposta-header {
        margin-bottom: 0 !important;
      }
      
      /* A partir da segunda página, garantir que conteúdo comece após o cabeçalho fixo */
      .proposta-body {
        position: relative !important;
        z-index: 1 !important;
      }
      
      /* Garantir que todas as seções tenham espaço adequado */
      .section {
        position: relative !important;
        z-index: 1 !important;
      }
      
      .print-header-content {
        display: flex;
        justify-content: space-between;
        align-items: center;
        height: 100%;
      }
      
      .print-header-left {
        display: flex;
        align-items: center;
        gap: 15px;
      }
      
      .print-header-left img {
        max-height: 15mm;
        width: auto;
      }
      
      .print-header-right {
        display: flex;
        align-items: center;
        gap: 15px;
      }
      
      .print-header-right img {
        max-height: 15mm;
        width: auto;
      }
      
      .print-header-number {
        font-size: 12px;
        font-weight: 700;
        color: #1a4d7a;
        letter-spacing: 0.5px;
      }
      
      /* Rodapé e imagem de fim: no fluxo (mesma lógica da capa), não fixos */
      .proposta-footer {
        display: flex !important;
        visibility: visible !important;
        position: relative !important;
        page-break-inside: avoid !important;
        margin: 0 !important;
        box-shadow: 0 -2px 8px rgba(0,0,0,0.08) !important;
      }
      
      /* Conteúdo: margens normais (cabeçalho/rodapé são blocos no fluxo, como a capa) */
      .proposta-body {
        padding: 0 ${marginLateral}mm ${marginBottom}mm ${marginLateral}mm !important;
        margin: 0 !important;
      }
      
      
      /* Seções */
      .section {
        position: relative !important;
        z-index: 1 !important;
        margin-top: 0 !important;
        padding-top: 0 !important;
      }
      
      /* Primeira seção após o cabeçalho deve ter espaço */
      .proposta-body > .section:first-child {
        margin-top: 0 !important;
        padding-top: 0 !important;
      }
      
      .dados-cliente-section {
        margin-top: 0 !important;
        padding-top: 0 !important;
      }
      
      /* Primeira página - cabeçalho completo */
      .proposta-header {
        margin-bottom: 0 !important;
      }
      
      /* A partir da segunda página, esconder o cabeçalho completo e mostrar o fixo */
      .proposta-body {
        margin-top: 0 !important;
      }
      
      .section {
        margin-bottom: 30px !important;
        page-break-inside: avoid !important;
      }
      
      /* Última seção com espaçamento adequado */
      .section:last-child {
        margin-bottom: 30px !important;
        padding-bottom: 30px !important;
      }
      
      /* Evitar que tabelas e listas fiquem cortadas */
      table, ul, ol {
        page-break-inside: avoid !important;
      }
      
      /* Produtos também não devem ser cortados */
      .produto-item {
        page-break-inside: avoid !important;
        margin-bottom: 40px !important;
      }
      
      .proposta-header {
        min-height: 280px;
        max-height: 320px;
        padding: 35px 40px;
        page-break-after: avoid;
      }
      
      .proposta-header::before {
        opacity: 0.5 !important; /* Aumentar opacidade para imagem ficar mais visível na impressão */
        background-size: cover;
        background-position: center center;
        display: block !important;
        visibility: visible !important;
      }
      
      .proposta-header::after {
        background: linear-gradient(135deg, rgba(13, 43, 74, 0.4) 0%, rgba(26, 77, 122, 0.35) 50%, rgba(15, 52, 96, 0.4) 100%) !important; /* Reduzir ainda mais a opacidade do overlay para conteúdo ficar mais visível */
      }
      
      .header-title-main {
        font-size: 26px;
      }
      
      .header-title-sub {
        font-size: 26px;
      }
      
      .header-title-number {
        font-size: 32px;
      }
      
      .header-tagline {
        font-size: 13px;
      }
      
      .industry-badge {
        top: 18px;
        right: 40px;
        left: auto;
        font-size: 13px;
        padding: 5px 16px;
        background: linear-gradient(135deg, #ff6b35 0%, #f7931e 100%);
        color: #ffffff;
        z-index: 1001 !important; /* Garantir que fique acima do cabeçalho fixo (z-index: 1000) */
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
      }
      
      .header-right {
        position: absolute;
        top: 80px;
        right: 50px;
        padding: 15px;
        z-index: 11 !important; /* Garantir que fique acima do overlay azul */
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3), 0 0 20px rgba(255, 255, 255, 0.5) !important;
      }
      
      .header-right img {
        max-height: 200px;
        width: auto;
        filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2)) !important;
      }
      
      .header-title-number {
        text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5), 0 0 10px rgba(0, 0, 0, 0.3) !important;
        z-index: 11 !important;
        color: #ffffff !important;
      }
      
      .header-title-main,
      .header-title-sub {
        text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5), 0 0 10px rgba(0, 0, 0, 0.3) !important;
        z-index: 11 !important;
        color: #ffffff !important;
      }
      
      .header-tagline {
        text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.5) !important;
        z-index: 11 !important;
        color: rgba(255, 255, 255, 0.95) !important;
      }
      
      .header-content {
        z-index: 10 !important;
      }
      
      /* Garantir que dados do cliente apareçam na primeira página junto com o cabeçalho */
      .dados-cliente-section {
        page-break-after: always;
      }
      
      .proposta-body {
        padding: 25px 20px 45mm 20px !important;
        margin-top: 30mm !important;
      }
      
      /* Espaçamento antes do primeiro conteúdo para começar abaixo do cabeçalho */
      .proposta-body > *:first-child {
        margin-top: 25px !important;
        padding-top: 0 !important;
      }
      
      .section:first-child {
        margin-top: 25px !important;
      }
      
      .section {
        page-break-inside: avoid;
        margin-bottom: 25px !important;
      }
      
      /* Última seção com espaçamento adequado */
      .section:last-child {
        margin-bottom: 30px !important;
        padding-bottom: 30px !important;
      }
      
      /* Evitar que tabelas e listas fiquem cortadas */
      table, ul, ol {
        page-break-inside: avoid !important;
      }
      
      /* Produtos também não devem ser cortados */
      .produto-item {
        page-break-inside: avoid !important;
        margin-bottom: 40px !important;
      }
      
      /* Garantir que a linha de total seja visível no print */
      .valores-table .total-row {
        display: table-row !important;
        visibility: visible !important;
        opacity: 1 !important;
        background: #ff6b35 !important;
        color: #ffffff !important;
      }
      
      .valores-table .total-row td {
        display: table-cell !important;
        visibility: visible !important;
        opacity: 1 !important;
        background: #ff6b35 !important;
        color: #ffffff !important;
        padding: 15px !important;
        border: 1px solid #e55a2b !important;
      }
      
      /* Blocos início/fim: no fluxo (como a capa), não fixos */
      .inicio-image-block,
      .fim-image-block {
        page-break-inside: avoid !important;
      }
      
      body .proposta-body {
        padding: 0 ${marginLateral}mm ${marginBottom}mm ${marginLateral}mm !important;
        margin: 0 !important;
      }
      
      /* Classe para elementos que devem quebrar página (legado) */
      .avoid-footer-overlap {
        page-break-before: always !important;
        break-before: page !important;
      }
      
      /* REGRA: Se um bloco não couber inteiro na página, o bloco TODO pula para a próxima (nada cortado no meio).
         REGRA "começa e termina na mesma página": ex. 4.1, 4.2, etc. — o item inteiro fica na mesma página. */
      .section {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      
      .produto-item {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      
      /* Seção 4 (Escopo): sempre começa em nova página; conteúdo pode fluir nas próximas (cada 4.1, 4.2 não corta no meio) */
      .section-escopo {
        page-break-before: always !important;
        break-before: page !important;
        page-break-inside: auto !important;
        break-inside: auto !important;
      }

      /* Itens 4.1, 4.2 e 4.3 sempre na mesma página */
      .produto-group-1-2-3 {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }

      .escopo-grupo { margin-bottom: 1.5em; }
      .escopo-grupo-titulo { font-weight: 600; font-size: 13px; color: #0d2b4a; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px; }

      /* Tabelas: não cortar no meio; se não couber, tabela inteira na próxima página */
      .section table,
      .section .dados-table,
      table {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      
      .section-title {
        page-break-after: avoid !important;
        page-break-inside: avoid !important;
        page-break-before: avoid !important;
        break-after: avoid !important;
        break-inside: avoid !important;
        break-before: avoid !important;
      }
      
      /* Bloco de texto: se não couber inteiro, pula todo para a próxima página */
      .texto-corpo {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      
      /* Cada parágrafo fica inteiro; se não couber, parágrafo todo na próxima */
      .texto-corpo p,
      .section p {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      
      /* Listas: bloco da lista e cada item não são cortados no meio */
      .texto-corpo ul,
      .texto-corpo ol {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      
      .texto-corpo li {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      
      /* Garantir que dados-cliente-section também não seja dividida */
      .dados-cliente-section {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      
      /* Garantir que o cabeçalho completo da primeira página seja visível */
      .proposta-header {
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
      }
      
      /* Cabeçalho fixo deve estar escondido */
      .print-header {
        display: none !important;
        visibility: hidden !important;
      }
    }
  </style>
</head>
<body>
  ${(forPdfServer || omitPrintBar) ? '' : `
  <div class="print-tip-bar">
    <button class="btn-gerar-pdf" id="btnGerarPDF" onclick="window.print()">Gerar PDF</button>
    <p class="print-tip-text">Baixe o PDF pelo botão abaixo (gerado no servidor, sem usar a impressora do navegador).</p>
  </div>
  `}
  <div class="proposta-container"${omitPrintBar ? ' style="margin-top: 0;"' : ''}>
    <!-- Cabeçalho (igual ao PDF Nano4You) -->
    <div class="proposta-header">
      <div class="industry-badge">INDÚSTRIA 4.0</div>
      <div class="header-content">
        <div class="header-left">
          <div class="header-title-container">
            <div class="header-title-main">PROPOSTA TÉCNICA COMERCIAL Nº ${esc(proposta.numero_proposta)}</div>
            <div class="header-tagline">Especialista em Misturas, Moagens, Dispersões, Dosagens, Automações, Excelência Operacional, Projetos Conceituais, Projetos Executivos, Instalações e Sistemas Turn-Keys.</div>
            <div class="header-title-sub" style="margin-top: 12px;">${esc(proposta.titulo || 'PROPOSTA TÉCNICA COMERCIAL')}</div>
            <div class="header-title-number" style="margin-top: 4px;">Nº ${esc(proposta.numero_proposta)}</div>
          </div>
        </div>
        <div class="header-right">
          ${config.logo_url ? 
            `<img src="${logoBaseURL}/api/uploads/logos/${config.logo_url}" alt="GMP Industriais" onerror="this.style.display='none'; this.src='${logoGMP}';" style="max-height: 380px; width: auto;">` :
            `<img src="${logoGMP}" alt="GMP Industriais" onerror="this.style.display='none';" style="max-height: 380px; width: auto;">`
          }
        </div>
      </div>
    </div>
    
    ${headerImageFixedURL ? `
    <!-- Imagem de início no fluxo (como no Word: “em linha com texto”, sem sobreposição) -->
    <div class="inicio-image-block">
      <img src="${headerImageFixedURL}" alt="Cabeçalho" onerror="this.style.display='none';">
    </div>
    ` : ''}
    
    <!-- Conteúdo -->
    <div class="proposta-body">
      <!-- Dados do Cliente (EMPRESA CONTRATANTE - igual ao PDF) -->
      <div class="section dados-cliente-section">
        ${proposta.cliente_logo_url ? 
          `<div class="cliente-logo-container" style="text-align: center; margin-bottom: 3.75px; margin-top: 0; padding-top: 0;">
            <img src="${logoBaseURL}/api/uploads/logos/${proposta.cliente_logo_url}" 
                 alt="${esc(proposta.nome_fantasia || proposta.razao_social || 'Cliente')}" 
                 style="width: 124px; height: 124px; object-fit: contain; display: inline-block;"
                 onerror="this.style.display='none';">
          </div>` : ''
        }
        <div class="section-title">EMPRESA CONTRATANTE: ${esc(proposta.nome_fantasia || proposta.razao_social || '')}</div>
        <table class="dados-table">
          ${proposta.cnpj ? `<tr><td class="dados-label">CNPJ:</td><td class="dados-value">${esc(proposta.cnpj)}</td></tr>` : ''}
          <tr>
            <td class="dados-label">A/c.:</td>
            <td class="dados-value" contenteditable="true">${esc(proposta.cliente_contato || '')}</td>
          </tr>
          <tr>
            <td class="dados-label">Departamento:</td>
            <td class="dados-value" contenteditable="true">${esc(proposta.cliente_departamento || '')}</td>
          </tr>
          <tr>
            <td class="dados-label">E-mail:</td>
            <td class="dados-value" contenteditable="true">${esc(proposta.cliente_email || '')}</td>
          </tr>
          <tr>
            <td class="dados-label">Data de emissão:</td>
            <td class="dados-value">${esc(totais.dataEmissao || (proposta.created_at ? new Date(proposta.created_at).toLocaleDateString('pt-BR') : ''))}</td>
          </tr>
        </table>
      </div>
      
      <!-- Seção 1: Objetivo -->
      <div class="section">
        <div class="section-title">1. OBJETIVO DA PROPOSTA</div>
        <div class="texto-corpo">
          <p contenteditable="true">Apresentar condições técnicas e comerciais, para fornecimento de peças e acessórios para equipamentos.</p>
        </div>
      </div>
      
      <!-- Seção 2: Elaboração -->
      <div class="section">
        <div class="section-title">2. ELABORAÇÃO DA PROPOSTA</div>
        <div class="texto-corpo">
          <p contenteditable="true">A proposta apresentada a seguir, foi elaborada atendendo às solicitações e especificações informadas pelo <strong>CONTRATANTE</strong>, através de reunião, ligação e/ou e-mail.</p>
          <p contenteditable="true">Deve-se atentar, que os itens oferecidos estão descriminados e especificados nesta proposta técnica comercial. Os parâmetros e dimensionamentos dos equipamentos e garantias relacionadas nesta proposta, estão baseadas nas condições e características do produtos, disponibilizadas pelo <strong>CONTRATANTE</strong>, conforme dados resumidos apresentados no decorrer desta proposta.</p>
          <p contenteditable="true">Qualquer alteração, inclusão ou exclusão no escopo ofertado, deve ser solicitado, para revisão deste documento.</p>
        </div>
      </div>
      
      <!-- Seção 3: Oferta (tabela ITEM QUANT. DESCRIÇÃO - igual ao PDF) -->
      <div class="section">
        <div class="section-title">3. OFERTA</div>
        <table class="valores-table" style="margin-top: 15px;">
          <thead>
            <tr>
              <th>ITEM</th>
              <th>QUANT.</th>
              <th>DESCRIÇÃO</th>
            </tr>
          </thead>
          <tbody>
            ${(itens || []).map((item, index) => {
              const nome = item.descricao || item.produto_nome || item.nome || (item.nome ? item.nome : '') || 'Item sem nome';
              const quantidade = parseFloat(item.quantidade) || 1;
              return `<tr><td>4.${index + 1}</td><td>${quantidade}</td><td contenteditable="true">${esc(nome)}</td></tr>`;
            }).join('')}
            ${(!itens || itens.length === 0) ? '<tr><td>4.1</td><td>1</td><td contenteditable="true"></td></tr>' : ''}
          </tbody>
        </table>
      </div>
      
      <!-- Apresentação (sem número - igual ao PDF) -->
      <div class="section">
        <div class="section-title">APRESENTAÇÃO</div>
        <div class="texto-corpo">
          <p contenteditable="true">A <strong>MOINHO YPIRANGA</strong> é uma empresa especializada no desenvolvimento de projetos e instalações industriais. Somos uma das maiores empresas com foco e participação no desenvolvimento, fabricação e comercialização de equipamentos para produção de produtos químicos do MERCOSUL, destacando nossas competências no fornecimento de plantas em regime Turn-Key.</p>
          <p contenteditable="true">Neste regime Turn-Key, quando contratado, assumimos o gerenciamento integral de todas as etapas de implantação do empreendimento, entregando a planta totalmente construída e pronta para o funcionamento.</p>
          <p contenteditable="true">Na contratação Turn-Key, a trajetória do pedido segue:</p>
          <ul style="list-style: none; padding-left: 0; margin: 20px 0;">
            <li contenteditable="true" style="margin-bottom: 8px; line-height: 1.5;"><strong>✓ Planejamento;</strong></li>
            <li contenteditable="true" style="margin-bottom: 8px; line-height: 1.5;"><strong>✓ Projeto Básico, Conceitual e Executivo;</strong></li>
            <li contenteditable="true" style="margin-bottom: 8px; line-height: 1.5;"><strong>✓ Documentações do empreendimento;</strong></li>
            <li contenteditable="true" style="margin-bottom: 8px; line-height: 1.5;"><strong>✓ Cetesb, Conama, Anvisa, Bombeiro, Prefeitura, outros sob consulta;</strong></li>
            <li contenteditable="true" style="margin-bottom: 8px; line-height: 1.5;"><strong>✓ Cronograma;</strong></li>
            <li contenteditable="true" style="margin-bottom: 8px; line-height: 1.5;"><strong>✓ Gerenciamento e execução da obra;</strong></li>
            <li contenteditable="true" style="margin-bottom: 8px; line-height: 1.5;"><strong>✓ Instalações elétrica, hidráulicas, pneumáticas, civil, e outras;</strong></li>
            <li contenteditable="true" style="margin-bottom: 8px; line-height: 1.5;"><strong>✓ Fabricação e desenvolvimento de máquinas e equipamentos;</strong></li>
            <li contenteditable="true" style="margin-bottom: 8px; line-height: 1.5;"><strong>✓ Produção e desenvolvimento de softwares e automações;</strong></li>
          </ul>
          <p contenteditable="true">Todas as fases desse processo contam com o suporte de recursos tecnológicos adequados, com um moderno sistema de gestão de projetos, além de uma equipe técnica própria e altamente qualificada para atender às necessidades do cliente.</p>
        </div>
      </div>
      
      <!-- SUMÁRIO (igual ao PDF) -->
      <div class="section">
        <div class="section-title">SUMÁRIO</div>
        <div class="texto-corpo" style="line-height: 2;">
          <p>1. OBJETIVO DA PROPOSTA ................................................................................................ 5</p>
          <p>2. ELABORAÇÃO DA PROPOSTA ......................................................................................... 5</p>
          <p>3. OFERTA ............................................................................................................................. 5</p>
          <p>4. ESCOPO DE FORNECIMENTO .......................................................................................... 6</p>
          <p>5. CONDIÇÕES GERAIS DE FORNECIMENTO ...................................................................... 8</p>
          <p>5.1 PRAZO DE ENTREGA ........................................................................................................ 8</p>
          <p>5.2 TRANSPORTE E EMBALAGEM ........................................................................................... 8</p>
          <p>5.3 LIBERAÇÃO DO PEDIDO .................................................................................................. 8</p>
          <p>5.4 GARANTIA ....................................................................................................................... 9</p>
          <p>5.5 SUPERVISÃO E COMISSIONAMENTO DE STARTUP ........................................................ 10</p>
          <p>5.6 OBRIGAÇÕES DA CONTRATANTE ................................................................................. 12</p>
          <p>5.7 OBRIGAÇÕES DA CONTRATADA .................................................................................. 13</p>
          <p>5.8 ALTERAÇÃO DE PEDIDO ................................................................................................ 13</p>
          <p>5.9 DEVOLUÇÃO OU TROCA DE MERCADORIA ................................................................. 14</p>
          <p>5.10 CANCELAMENTO DE PEDIDO .................................................................................... 14</p>
          <p>5.11 ATRASO DE FATURAMENTO........................................................................................ 14</p>
          <p>5.12 TAXA DE ARMAZENAGEM.......................................................................................... 14</p>
          <p>5.13 DANOS OU PREJUÍZOS ............................................................................................... 14</p>
          <p>5.14 RESPONSABILIDADE FINANCEIRA .............................................................................. 15</p>
          <p>5.15 CONSIDERAÇÕES CONSTRUTIVAS ............................................................................ 15</p>
          <p>5.16 VALIDADE DA PROPOSTA .......................................................................................... 15</p>
          <p>5.17 REAJUSTE DE PREÇO ................................................................................................... 16</p>
          <p>5.18 DOCUMENTAÇÃO PARTE DO ESCOPO ..................................................................... 16</p>
          <p>5.19 EXTINÇÃO DO CONTRATO ........................................................................................ 16</p>
          <p>5.20 DISPOSIÇÕES ADICIONAIS ........................................................................................ 17</p>
          <p>5.21 FORO........................................................................................................................... 18</p>
          <p>5.22 EXCLUSO DO FORNECIMENTO .................................................................................. 19</p>
          <p>5.23 PREÇO, CONDIÇÃO DE PAGAMENTO E IMPOSTOS ................................................. 20</p>
          <p>5.24 CONSIDERAÇÃO FINAL ............................................................................................. 23</p>
        </div>
      </div>
      
      <!-- Seção 4: Escopo - agrupado por categoria técnica/comercial; mesma página para itens 1-2-3 -->
      <div class="section section-escopo">
        <div class="section-title">4. ESCOPO DE FORNECIMENTO</div>
        ${(() => {
          const { groupItemsByCategory } = propostaEngine;
          const { grupos } = groupItemsByCategory(itens || [], 'Outros');
          const flat = [];
          let idx = 0;
          grupos.forEach(g => {
            g.itens.forEach((it, i) => {
              flat.push({
                item: it,
                groupLabel: g.label,
                isFirstInGroup: i === 0,
                isLastInGroup: i === g.itens.length - 1,
                index: idx
              });
              idx++;
            });
          });
          return flat.map(({ item, groupLabel, isFirstInGroup, isLastInGroup, index }) => {
            const total = flat.length;
            const openWrap = (index === 0 && total >= 3) ? '<div class="produto-group-1-2-3">' : '';
            const closeWrap = (index === 2 && total >= 3) ? '</div>' : '';
            const prefix = isFirstInGroup ? ('<div class="escopo-grupo" data-categoria="' + esc(groupLabel || '') + '">' + (groupLabel ? '<div class="section-subtitle escopo-grupo-titulo">' + esc(groupLabel) + '</div>' : '')) : '';
            const suffix = isLastInGroup ? '</div>' : '';
            const produto = item || {};
            const nome = (produto.descricao || produto.produto_nome || produto.nome || 'Produto sem nome').toString();
            const quantidade = produto.quantidade || 1;
            const imagem = (produto.produto_imagem != null && produto.produto_imagem !== '') ? produto.produto_imagem : (produto.imagem || '');
          const imagemURL = imagem ? `${logoBaseURL}/api/uploads/produtos/${imagem}` : '';
          
          // Campos técnicos do produto
          // Tentar parsear especificacoes_tecnicas se for JSON
          let especs = {};
          
          // Buscar especificacoes_tecnicas do produto
          // No JOIN, os campos do produto podem vir com prefixo ou sem prefixo
          // Vamos tentar todas as possibilidades
          const especsTecnicas = produto.especificacoes_tecnicas ||
                                 (produto.id ? produto.especificacoes_tecnicas : null) ||
                                 '';
          
          if (especsTecnicas) {
            try {
              // Se for string JSON, fazer parse
              if (typeof especsTecnicas === 'string') {
                const trimmed = especsTecnicas.trim();
                if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                  especs = JSON.parse(especsTecnicas);
                } else {
                  // Se for texto simples, usar como descrição
                  especs = { descricao: especsTecnicas };
                }
              } else if (typeof especsTecnicas === 'object' && especsTecnicas !== null) {
                // Se já for objeto, usar diretamente
                especs = especsTecnicas;
              } else {
                // Se for outro tipo, tentar converter
                especs = { descricao: String(especsTecnicas) };
              }
            } catch (e) {
              // Se não for JSON válido, usar como texto
              especs = { descricao: String(especsTecnicas) };
            }
          }
          
          // Buscar dimensões e material de várias fontes possíveis
          // Priorizar diâmetro do cadastro do produto (está em especificacoes_tecnicas como JSON)
          const dimensoes = especs.diametro || especs.diâmetro || especs.Diametro || especs.Diâmetro ||
                           produto.diametro || produto.diâmetro || produto.Diametro || produto.Diâmetro ||
                           especs.dimensoes || especs.Dimensões || especs.dimensao || especs.Dimensao ||
                           especs.dimensão || especs.Dimensão ||
                           especs['dimensoes'] || especs['Dimensões'] || especs['dimensão'] || especs['Dimensão'] ||
                           produto.dimensoes ||
                           (typeof especs === 'object' ? Object.values(especs).find(v => v && String(v).toLowerCase().includes('dimens')) : '') || '';
          
          const material = especs.material || especs.Material ||
                          especs['Material de fabricação'] || especs['material de fabricação'] || especs['Material de Fabricação'] ||
                          especs.material_fabricacao || especs.materialFabricacao || especs.materialFabricação ||
                          especs['material_fabricacao'] || especs['Material de Fabricacao'] ||
                          produto.material || produto.material_fabricacao ||
                          (typeof especs === 'object' ? Object.entries(especs).find(([k, v]) => 
                            k && String(k).toLowerCase().includes('material') && v
                          )?.[1] : '') || '';
          const tratamento_termico = especs.tratamento_termico || especs['Tratamento térmico'] || especs.tratamento_termico || '';
          const velocidade_trabalho = especs.velocidade_trabalho || especs['Velocidade de trabalho'] || '';
          const furacao = especs.furacao || especs.Furação || '';
          const acabamento = especs.acabamento || especs.Acabamento || '';
          const espessura = especs.espessura || especs.Espessura || '';
          const funcao = especs.funcao || especs.Função || '';
          const descricao_tecnica = especs.descricao || produto.descricao || '';
          let variaveisList = config.variaveis_proposta_tecnica;
          const porFamilia = config.variaveis_proposta_por_familia;
          if (porFamilia && typeof porFamilia === 'object') {
            const familiaItem = (produto.familia_produto || produto.produto_familia || produto.familia || '').trim();
            const familiaNorm = familiaItem ? normalizarFamiliaComparacao(familiaItem) : '';
            let listPorFamilia = null;
            if (familiaNorm) {
              const keyMatch = Object.keys(porFamilia).find(function (k) { return normalizarFamiliaComparacao(String(k)) === familiaNorm; });
              if (keyMatch && Array.isArray(porFamilia[keyMatch]) && porFamilia[keyMatch].length > 0) listPorFamilia = porFamilia[keyMatch];
            }
            if (listPorFamilia) variaveisList = listPorFamilia;
          }
          const variaveisLabels = config.variaveis_proposta_labels || {};
          let tableRowsHtml;
          if (config.mostrar_especificacoes && Array.isArray(variaveisList) && variaveisList.length > 0) {
            const specRows = variaveisList.filter(function (k) { return k && String(k).indexOf('_cond') === -1; }).map(function (k) {
              const val = especs[k];
              const displayVal = (val !== undefined && val !== null && val !== '') ? String(val).trim() : '';
              const label = (variaveisLabels[k] && variaveisLabels[k].nome) ? variaveisLabels[k].nome : k;
              const sufixo = (variaveisLabels[k] && variaveisLabels[k].sufixo) ? variaveisLabels[k].sufixo : '';
              const valueDisplay = displayVal + (sufixo && displayVal !== '' ? ' ' + sufixo : '');
              return '<tr><td class="dados-label" style="width: 152.83125px; font-weight: 600; font-size: 0.8490625em;">' + esc(label) + ':</td><td class="dados-value" contenteditable="true" style="font-size: 0.8490625em;">' + esc(valueDisplay) + '</td></tr>';
            }).join('');
            tableRowsHtml = '<tr><td class="dados-label" style="width: 152.83125px; font-weight: 600; font-size: 0.8490625em;">Descrição:</td><td class="dados-value" contenteditable="true" style="font-size: 0.8490625em;">' + esc(nome) + '</td></tr>' + specRows + '<tr><td class="dados-label">Quantidade:</td><td class="dados-value"><strong>' + quantidade + ' ' + (quantidade === 1 ? 'unidade' : 'unidades') + '</strong></td></tr>';
          } else {
            tableRowsHtml = '<tr><td class="dados-label" style="width: 152.83125px; font-weight: 600; font-size: 0.8490625em;">Acessório:</td><td class="dados-value" contenteditable="true" style="font-size: 0.8490625em;">' + esc(nome) + '</td></tr>' +
              (funcao ? '<tr><td class="dados-label">Função:</td><td class="dados-value" contenteditable="true">' + esc(funcao) + '</td></tr>' : '<tr><td class="dados-label">Função:</td><td class="dados-value" contenteditable="true"></td></tr>') +
              (dimensoes ? '<tr><td class="dados-label">Dimensões:</td><td class="dados-value" contenteditable="true">' + esc(dimensoes) + '</td></tr>' : '<tr><td class="dados-label">Dimensões:</td><td class="dados-value" contenteditable="true"></td></tr>') +
              (material ? '<tr><td class="dados-label">Material de fabricação:</td><td class="dados-value" contenteditable="true">' + esc(material) + '</td></tr>' : '<tr><td class="dados-label">Material de fabricação:</td><td class="dados-value" contenteditable="true"></td></tr>') +
              (tratamento_termico ? '<tr><td class="dados-label">Tratamento térmico:</td><td class="dados-value" contenteditable="true">' + esc(tratamento_termico) + '</td></tr>' : '<tr><td class="dados-label">Tratamento térmico:</td><td class="dados-value" contenteditable="true">Não Aplicado</td></tr>') +
              (velocidade_trabalho ? '<tr><td class="dados-label">Velocidade de trabalho:</td><td class="dados-value" contenteditable="true">' + esc(velocidade_trabalho) + '</td></tr>' : '<tr><td class="dados-label">Velocidade de trabalho:</td><td class="dados-value" contenteditable="true">Não informado</td></tr>') +
              (furacao ? '<tr><td class="dados-label">Furação:</td><td class="dados-value" contenteditable="true">' + esc(furacao) + '</td></tr>' : '<tr><td class="dados-label">Furação:</td><td class="dados-value" contenteditable="true"></td></tr>') +
              (acabamento ? '<tr><td class="dados-label">Acabamento:</td><td class="dados-value" contenteditable="true">' + esc(acabamento) + '</td></tr>' : '<tr><td class="dados-label">Acabamento:</td><td class="dados-value" contenteditable="true"></td></tr>') +
              (espessura ? '<tr><td class="dados-label">Espessura:</td><td class="dados-value" contenteditable="true">' + esc(espessura) + '</td></tr>' : '<tr><td class="dados-label">Espessura:</td><td class="dados-value" contenteditable="true"></td></tr>') +
              '<tr><td class="dados-label">Quantidade:</td><td class="dados-value"><strong>' + quantidade + ' ' + (quantidade === 1 ? 'unidade' : 'unidades') + '</strong></td></tr>';
          }
            const blockHtml = `
              <div class="produto-item" style="margin-bottom: 25px;">
            <div class="produto-subsection" style="margin-bottom: 15px;">
              <h3 style="font-size: 20px; font-weight: 700; color: #1a4d7a; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 2px solid #ff6b35;">4.${index + 1} - ${esc(nome.toUpperCase())}</h3>
              
              <div style="display: flex; gap: 20px; margin-bottom: 15px; align-items: flex-start; flex-wrap: wrap;">
                <div style="flex: 1; min-width: 300px;">
                  <table class="dados-table" style="width: 100%; margin-bottom: 15px; font-size: 0.8490625em;">
                    ${tableRowsHtml}
                  </table>
                </div>
                
                ${imagemURL ? `
                <div style="flex: 0 0 280px; text-align: center;">
                  <img src="${imagemURL}" alt="${esc(nome)}" style="max-width: 100%; max-height: 300px; height: auto; border: 1px solid #e0e0e0; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); object-fit: contain;" onerror="this.onerror=null; this.parentElement.innerHTML='<div style=\\'padding: 40px 20px; font-size: 12px; color: #999;\\'>Foto não disponível</div>';">
                  <p style="text-align: center; font-size: 11px; color: #1a4d7a; margin-top: 8px; font-weight: 500;">Foto do produto</p>
                </div>
                ` : ''}
              </div>
            </div>
          </div>
            `;
            return prefix + openWrap + blockHtml + closeWrap + suffix;
          }).join('');
        })()}
        
        ${(!itens || itens.length === 0) ? `
        <div class="texto-corpo">
          <p contenteditable="true">${esc(proposta.observacoes || 'Conforme especificado na tabela de preços abaixo.')}</p>
        </div>
        ` : ''}
      </div>
      
      ${getPropostaEquipamentosOnlyHTML(proposta, itens, totais, config, esc)}
      
      <!-- Tabela com Dados Cadastrais da CONTRATADA (igual ao PDF - Diadema) -->
      <div class="section">
        <div class="section-title">Tabela com Dados Cadastrais da CONTRATADA</div>
        <div style="margin-top: 20px;">
          <div style="font-weight: 700; margin-bottom: 15px; font-size: 14px;">INFORMAÇÕES GERAIS</div>
          <table class="dados-table">
            <tr><td class="dados-label">Nome Fantasia</td><td class="dados-value">Moinho Ypiranga</td></tr>
            <tr><td class="dados-label">Razão Social</td><td class="dados-value">Moinho Ypiranga indústria de maquinas Eireli</td></tr>
            <tr><td class="dados-label">CNPJ</td><td class="dados-value">13.273.368/0001-75</td></tr>
            <tr><td class="dados-label">Inscrição Estadual</td><td class="dados-value">286.444.118.116</td></tr>
            <tr><td class="dados-label">Inscrição Municipal</td><td class="dados-value">76.310</td></tr>
            <tr><td class="dados-label">Logradouro</td><td class="dados-value">Av. Dr. Ulysses Guimarães, nº 4105</td></tr>
            <tr><td class="dados-label">Bairro</td><td class="dados-value">Vila Nogueira</td></tr>
            <tr><td class="dados-label">Município</td><td class="dados-value">Diadema</td></tr>
            <tr><td class="dados-label">Estado</td><td class="dados-value">São Paulo</td></tr>
            <tr><td class="dados-label">Pais</td><td class="dados-value">Brasil</td></tr>
            <tr><td class="dados-label">Telefone</td><td class="dados-value">+55 (11) 4513-9570</td></tr>
            <tr><td class="dados-label">E-mail comercial</td><td class="dados-value">contato@gmp.ind.br</td></tr>
            <tr><td class="dados-label">E-mail financeiro</td><td class="dados-value">financeiro@gmp.ind.br</td></tr>
            <tr><td class="dados-label">Site</td><td class="dados-value">www.gmp.ind.br</td></tr>
            <tr><td class="dados-label">Regime tributário</td><td class="dados-value">Lucro Presumido</td></tr>
          </table>
        </div>
      </div>
      
      <div class="section">
        <div class="section-title">INFORMAÇÕES BANCÁRIAS</div>
        <table class="dados-table" style="margin-top: 15px;">
          <tr><td class="dados-label">Banco</td><td class="dados-value">Itaú</td></tr>
          <tr><td class="dados-label">Agência</td><td class="dados-value">1690</td></tr>
          <tr><td class="dados-label">Conta corrente</td><td class="dados-value">65623-4</td></tr>
        </table>
      </div>
      
      <!-- Assinaturas -->
      <div class="section" style="margin-top: 5px;">
        <div style="text-align: center; margin-bottom: 10px;">
          <p style="font-size: 14px; margin-bottom: 8px;">Atenciosamente,</p>
          <table style="width: 100%; border-collapse: collapse; margin-top: 5px;">
            <tr>
              <td style="text-align: center; vertical-align: top; padding: 10px;">
                <div style="font-weight: 700; margin-bottom: 5px;">Junior Machado</div>
                <div style="font-size: 12px;">Diretor Comercial</div>
                <div style="font-size: 11px; margin-top: 5px;">T +55 (11) 4513-9570</div>
                <div style="font-size: 11px;">M +55 (11) 9.9351-5046</div>
                <div style="font-size: 11px; color: #1a4d7a;">junior@gmp.ind.br</div>
              </td>
              <td style="text-align: center; vertical-align: top; padding: 10px;">
                <div style="font-weight: 700; margin-bottom: 5px;">Bruno Machado</div>
                <div style="font-size: 12px;">Gerente Comercial</div>
                <div style="font-size: 11px; margin-top: 5px;">T +55 (11) 4513-9570</div>
                <div style="font-size: 11px;">M +55 (11) 9.9351-5543</div>
                <div style="font-size: 11px; color: #1a4d7a;">bruno@gmp.ind.br</div>
              </td>
              <td style="text-align: center; vertical-align: top; padding: 10px;">
                <div style="font-weight: 700; margin-bottom: 5px;">Alex Junior</div>
                <div style="font-size: 12px;">Vendas Técnica</div>
                <div style="font-size: 11px; margin-top: 5px;">T +55 (11) 4513-9570</div>
                <div style="font-size: 11px;">M +55 (11) 9.8908-5127</div>
                <div style="font-size: 11px; color: #1a4d7a;">alexjunior@gmp.ind.br</div>
              </td>
              <td style="text-align: center; vertical-align: top; padding: 10px;">
                <div style="font-weight: 700; margin-bottom: 5px;">Matheus Honrado</div>
                <div style="font-size: 12px;">Vendas Técnica</div>
                <div style="font-size: 11px; margin-top: 5px;">T +55 (11) 4513-9570</div>
                <div style="font-size: 11px;">M +55 (11) 9.3386-9232</div>
                <div style="font-size: 11px; color: #1a4d7a;">matheus@gmp.ind.br</div>
              </td>
            </tr>
          </table>
        </div>
      </div>
      
      ${footerImageURL ? `
      <!-- Imagem de fim no fluxo (como no Word: “em linha com texto”, sem sobreposição) -->
      <div class="fim-image-block">
        <img src="${footerImageURL}" alt="Rodapé" onerror="this.style.display='none';">
      </div>
      ` : ''}
      ${forPdfServer ? '' : `<!-- Rodapé texto - no fluxo, no final -->
      <footer class="proposta-footer">
        <div class="footer-content">
          <div class="footer-left">Moinho Ypiranga · Proposta Técnica Comercial nº ${esc(proposta.numero_proposta)}</div>
          <div class="footer-right">contato@gmp.ind.br · +55 (11) 4513-9570 · www.gmp.ind.br</div>
        </div>
      </footer>
      `}
    </div>
  </div>
  
  <script>
    var __forPdfServer = ${forPdfServer ? 'true' : 'false'};
    // Tornar elementos editáveis
    document.querySelectorAll('[contenteditable="true"]').forEach(el => {
      el.addEventListener('focus', function() {
        this.style.backgroundColor = '#f0f7ff';
        this.style.outline = '2px solid #1a4d7a';
      });
      el.addEventListener('blur', function() {
        this.style.backgroundColor = 'transparent';
        this.style.outline = 'none';
      });
    });
    
    // No servidor (PDF): não rodar script de overlap — só as regras CSS (section-escopo + produto-item) garantem a diagramação
    if (!__forPdfServer) {
    (function() {
      const footerImg = document.getElementById('footer-img');
      const footerPrint = document.getElementById('footer-image-print');
      const headerImg = document.getElementById('header-img');
      const headerPrint = document.getElementById('header-image-print');
      
      function checkAndPreventOverlap() {
        // SOLUÇÃO SIMPLIFICADA: Adicionar padding-top no body baseado na altura do cabeçalho
        // Isso garante que TODO o conteúdo comece após o cabeçalho fixo
        
        // Obter altura REAL da imagem do cabeçalho (se existir)
        let headerHeight = 0;
        if (headerPrint && headerImg) {
          // Obter altura da imagem diretamente
          if (headerImg.complete && headerImg.naturalHeight) {
            headerHeight = headerImg.offsetHeight || headerImg.naturalHeight;
          } else if (headerImg.offsetHeight) {
            headerHeight = headerImg.offsetHeight;
          } else {
            headerHeight = 100; // Fallback
          }
          
          // Limitar altura máxima do cabeçalho
          if (headerHeight > 200) {
            console.warn('⚠️ Altura do cabeçalho muito grande (' + headerHeight + 'px), usando 120px como limite');
            headerHeight = 120;
          }
          
          // Verificar se o cabeçalho está visível (a partir da segunda página)
          const headerDisplay = window.getComputedStyle(headerPrint).display;
          const headerVisibility = window.getComputedStyle(headerPrint).visibility;
          const headerOpacity = window.getComputedStyle(headerPrint).opacity;
          const headerIsVisible = headerDisplay !== 'none' && headerVisibility !== 'hidden' && headerOpacity !== '0';
          
          // Calcular altura da primeira página
          const pageHeight = 1123;
          const pageMargin = 20 * 3.779527559;
          const usablePageHeight = pageHeight - (pageMargin * 2);
          const firstPageEnd = usablePageHeight;
          
          if (headerIsVisible && headerHeight > 0) {
            // SOLUÇÃO AGRESSIVA: Aplicar margin-top em TODOS os elementos após a primeira página
            const marginTop = headerHeight + 60; // Altura do cabeçalho + margem de segurança aumentada
            
            // Encontrar TODOS os elementos que aparecem após a primeira página
            const allElements = document.querySelectorAll('.section, table, .produto-item, .proposta-body > div, .proposta-container > div, p, ul, ol, li, h1, h2, h3, h4, h5, h6');
            
            allElements.forEach(function(element) {
              const elementTop = element.offsetTop;
              const pageNumber = Math.floor(elementTop / usablePageHeight);
              
              // Se está em uma página após a primeira (pageNumber > 0)
              if (pageNumber > 0) {
                const positionInPage = elementTop % usablePageHeight;
                
                // Se está muito próximo do topo (dentro da zona do cabeçalho), aplicar margin-top
                if (positionInPage < marginTop + 20) { // +20 para margem extra
                  const currentMarginTop = parseInt(window.getComputedStyle(element).marginTop) || 0;
                  
                  // Aplicar margin-top se o atual for menor que o necessário
                  if (currentMarginTop < marginTop) {
                    element.style.marginTop = marginTop + 'px';
                    element.style.pageBreakBefore = 'always'; // Forçar quebra de página
                    console.log('✅ Margin-top aplicado em elemento na página', pageNumber + 1, ':', marginTop, 'px, posição na página:', Math.round(positionInPage), 'px');
                  }
                }
              } else if (elementTop > firstPageEnd - 50) {
                // Elementos próximos ao fim da primeira página também recebem margin-top
                const currentMarginTop = parseInt(window.getComputedStyle(element).marginTop) || 0;
                if (currentMarginTop < marginTop) {
                  element.style.marginTop = marginTop + 'px';
                  element.style.pageBreakBefore = 'always'; // Forçar quebra de página
                  console.log('✅ Margin-top aplicado em elemento próximo ao fim da primeira página:', marginTop, 'px');
                }
              }
            });
            
            console.log('✅ Margin-top aplicado em elementos após primeira página:', marginTop, 'px (altura cabeçalho:', headerHeight, 'px + margem 60px)');
          } else {
            // Remover margin-top se cabeçalho não estiver visível
            const allElements = document.querySelectorAll('.section, table, .produto-item, .proposta-body > div, p, ul, ol');
            allElements.forEach(function(element) {
              element.style.marginTop = '';
              element.style.pageBreakBefore = '';
            });
          }
        }
        
        // Obter posição REAL da imagem do rodapé (ou usar padrão quando não há elemento — ex: PDF via blob)
        let footerRect = null;
        let footerHeight = 80;
        if (footerPrint) {
          footerRect = footerPrint.getBoundingClientRect();
          footerHeight = footerRect.height || (footerImg ? (footerImg.offsetHeight || footerImg.naturalHeight || 80) : 80);
        } else if (footerImg) {
          footerHeight = footerImg.offsetHeight || footerImg.naturalHeight || 80;
        }
        
        // Limitar altura máxima do rodapé para evitar cálculos errados
        if (footerHeight > 200) {
          console.warn('⚠️ Altura do rodapé muito grande (' + footerHeight + 'px), usando 120px como limite');
          footerHeight = 120;
        }
        
        // Altura da página A4 em pixels (considerando 96 DPI)
        const pageHeight = 1123; // Altura de uma página A4 em pixels
        const pageMargin = 20 * 3.779527559; // 20mm em pixels (aproximadamente 76px)
        const usablePageHeight = pageHeight - (pageMargin * 2); // Altura útil da página
        
        // Zona de perigo do rodapé: área onde o conteúdo não pode estar (últimos pixels antes do rodapé)
        const safetyMargin = 30; // Margem de segurança
        const footerDangerZoneStart = usablePageHeight - footerHeight - safetyMargin;
        
        console.log('📏 Rodapé - altura:', Math.round(footerHeight), 'px, zona de perigo inicia em:', Math.round(footerDangerZoneStart), 'px');
        if (headerHeight > 0) {
          console.log('📏 Cabeçalho FIXO - altura:', Math.round(headerHeight), 'px (sempre no topo de cada página a partir da segunda)');
        }
        
        // Encontrar TODOS os elementos que podem sobrepor (seções, tabelas, produtos, etc.)
        // Garantir que capturamos elementos em TODAS as páginas
        // IMPORTANTE: Incluir TODAS as tabelas (table, .valores-table, .dados-table) para que também sejam verificadas
        // IMPORTANTE: Tabelas dentro de seções também devem ser verificadas separadamente
        // NOTA: Não incluir .texto-corpo, ul, ol, li separadamente, pois eles já estão dentro de .section
        // NOTA: Não incluir elementos dentro de .texto-corpo, pois eles são tratados pela seção pai
        
        // Primeiro, pegar todas as tabelas (incluindo as que estão dentro de seções)
        // IMPORTANTE: Verificar tabelas PRIMEIRO para garantir que sejam movidas antes das seções
        const allTables = document.querySelectorAll('table, .valores-table, .dados-table');
        
        // Depois, pegar seções, produtos e outros elementos
        // IMPORTANTE: Incluir TODOS os elementos de texto (p, ul, ol, li) para garantir que nenhum texto fique abaixo do cabeçalho
        const otherElements = document.querySelectorAll('.section, .produto-item, .proposta-container > div, .proposta-body > div, p, ul, ol, li');
        
        // Combinar todos os elementos: TABELAS PRIMEIRO (prioridade), depois outros
        // Isso garante que tabelas sejam verificadas e movidas antes das seções que as contêm
        const elementsToCheck = Array.from(allTables).concat(Array.from(otherElements));
        
        console.log('📊 Total de elementos a verificar:', elementsToCheck.length, '(Tabelas:', allTables.length, ', Outros:', otherElements.length, ')');
        
        // Log específico para tabelas de preços
        const valoresTables = document.querySelectorAll('.valores-table');
        if (valoresTables.length > 0) {
          console.log('💰 Tabelas de preços encontradas:', valoresTables.length);
        }
        
        console.log('📊 Verificando', elementsToCheck.length, 'elementos em todas as páginas...');
        
        elementsToCheck.forEach(function(element, index) {
          try {
          // Nunca aplicar quebra na capa nem no container do body (evita capa ir para baixo / layout quebrar no blob)
          if (element.classList.contains('proposta-header') || element.classList.contains('proposta-body')) {
            return;
          }
          
          // Obter posição REAL do elemento no documento
          const elementRect = element.getBoundingClientRect();
          const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
          const elementTop = elementRect.top + scrollTop;
          const elementHeight = elementRect.height || element.offsetHeight;
          const elementBottom = elementTop + elementHeight;
          
          // Calcular em qual "página virtual" o elemento está
          const pageNumber = Math.floor(elementTop / usablePageHeight);
          const positionInPage = elementTop % usablePageHeight;
          
          // VERIFICAÇÃO COM A IMAGEM DO CABEÇALHO (apenas quando há cabeçalho fixo repetido em cada página):
          // Só considerar sobreposição ao cabeçalho se o elemento começa DENTRO da zona real do cabeçalho (headerHeight + margem).
          // NÃO usar zona fixa de 200px: isso empurrava o item 2 para a página 3 mesmo com muito espaço na página 2.
          let willOverlapHeader = false;
          if (headerHeight > 0 && pageNumber > 0) {
            const headerBottomInPage = headerHeight + 80; // Fim do cabeçalho na página atual
            const headerZoneWithMargin = headerBottomInPage + 30; // Pequena margem (30px) abaixo do cabeçalho
            // Só quebrar se o elemento realmente começa dentro ou logo abaixo do cabeçalho (não nos primeiros 200px arbitrários)
            willOverlapHeader = (positionInPage < headerZoneWithMargin);
            if (willOverlapHeader) {
              console.log('🚫 Elemento sobrepondo cabeçalho - MOVENDO para próxima página (posição na página:', Math.round(positionInPage), 'px, zona cabeçalho:', Math.round(headerZoneWithMargin), 'px, página:', pageNumber + 1, ')');
            }
          }
          
          // Verificar sobreposição com RODAPÉ:
          const elementBottomInPage = positionInPage + elementHeight;
          const willOverlapFooter = (
            elementBottomInPage > footerDangerZoneStart || // Elemento termina na zona de perigo
            (positionInPage < footerDangerZoneStart && elementBottomInPage > footerDangerZoneStart) || // Elemento atravessa a zona
            positionInPage >= footerDangerZoneStart // Elemento começa dentro ou após a zona de perigo
          );
          
          const willOverlap = willOverlapFooter || willOverlapHeader;
          
          // Se houver QUALQUER sobreposição, SEMPRE mover para próxima página
          // NÃO há exceções - NUNCA permitir texto abaixo do cabeçalho ou rodapé
          const isTable = element.tagName === 'TABLE' || element.classList.contains('valores-table') || element.classList.contains('dados-table');
          const isValoresTable = element.classList.contains('valores-table');
          
          // Calcular a quantidade de sobreposição para logs
          let overlapAmount = 0;
          if (willOverlapFooter) {
            overlapAmount = Math.max(0, elementBottomInPage - footerDangerZoneStart);
          } else if (willOverlapHeader && headerHeight > 0) {
            const headerBottomInPage = headerHeight + safetyMargin;
            if (positionInPage < headerBottomInPage) {
              overlapAmount = headerBottomInPage - positionInPage;
            } else {
              overlapAmount = 30; // Elemento está muito próximo
            }
          }
          
          // REGRA ABSOLUTA: Se houver sobreposição, SEMPRE quebrar (sem exceções)
          // Não importa se está no topo da página ou não - NUNCA permitir sobreposição
          // REGRA "COMEÇA E TERMINA NA MESMA PÁGINA": Se o elemento está dentro de um bloco lógico (ex: 4.1, 4.2),
          // aplicar a quebra no BLOCO INTEIRO para que o item não comece numa página e termine na seguinte.
          const containerItem = element.closest('.produto-item');
          const containerSection = element.closest('.section');
          const target = (containerItem || (containerSection && !containerSection.querySelector('.produto-item') ? containerSection : null)) || element;
          if (willOverlap) {
            // Elemento vai sobrepor o rodapé ou o cabeçalho - SEMPRE forçar quebra antes (mover inteiro para próxima página)
            target.style.pageBreakBefore = 'always';
            target.style.breakBefore = 'page';
            target.style.pageBreakInside = 'avoid'; // Para tabelas, evitar divisão - mover inteira
            target.classList.add('avoid-footer-overlap');
            if (willOverlapHeader) {
              target.classList.add('avoid-header-overlap');
            }
            
            // Identificar tipo de elemento para log mais claro
            let elementType = 'ELEMENTO';
            if (isValoresTable) {
              elementType = 'TABELA DE PREÇOS';
            } else if (isTable) {
              elementType = 'TABELA';
            } else if (element.classList.contains('section')) {
              elementType = 'SEÇÃO';
            } else if (element.tagName === 'P') {
              elementType = 'PARÁGRAFO';
            } else if (element.tagName === 'DIV') {
              elementType = 'DIV';
            }
            
            const overlapType = willOverlapHeader ? 'cabeçalho' : 'rodapé';
            if (willOverlapHeader && headerHeight > 0) {
              const headerBottomInPage = headerHeight + safetyMargin;
              console.log('🚫 REGRA ABSOLUTA:', elementType, 'sobrepondo', overlapType, '- MOVENDO para próxima página', pageNumber + 1, 'posição na página:', Math.round(positionInPage), 'fim na página:', Math.round(elementBottomInPage), 'fim cabeçalho na página:', Math.round(headerBottomInPage), 'sobreposição:', Math.round(overlapAmount), 'px');
            } else {
              console.log('🚫 REGRA ABSOLUTA:', elementType, 'sobrepondo', overlapType, '- MOVENDO para próxima página', pageNumber + 1, 'posição:', Math.round(positionInPage), 'altura:', Math.round(elementHeight), 'fim:', Math.round(elementBottomInPage), 'zona perigo:', Math.round(footerDangerZoneStart), 'sobreposição:', Math.round(overlapAmount), 'px');
            }
            return; // Pular para próximo elemento (já tratamos este - movido para próxima página)
          }
          
          // Verificação adicional: só forçar quebra se o elemento realmente começa dentro da zona do cabeçalho (não por “proximidade” ampla)
          if (headerHeight > 0 && !willOverlapHeader && pageNumber > 0) {
            const headerBottomInPage = headerHeight + 80;
            if (positionInPage < headerBottomInPage) {
              const targetProx = element.closest('.produto-item') || (element.closest('.section') && !element.closest('.section').querySelector('.produto-item') ? element.closest('.section') : null) || element;
              targetProx.style.pageBreakBefore = 'always';
              targetProx.style.breakBefore = 'page';
              targetProx.style.pageBreakInside = 'avoid';
              targetProx.classList.add('avoid-header-overlap');
              console.log('⚠️ Elemento dentro da zona do cabeçalho - movendo bloco para próxima página (posição:', Math.round(positionInPage), 'px, limite:', Math.round(headerBottomInPage), 'px)');
              return;
            }
          }
          
          // Verificar proximidade com rodapé também
          if (!willOverlapFooter) {
            const distanceToFooter = footerDangerZoneStart - elementBottom;
            // Se a distância é muito pequena (<20px), mover para próxima página
            if (distanceToFooter < 20 && distanceToFooter >= 0) {
              const targetProx = element.closest('.produto-item') || (element.closest('.section') && !element.closest('.section').querySelector('.produto-item') ? element.closest('.section') : null) || element;
              targetProx.style.pageBreakBefore = 'always';
              targetProx.style.breakBefore = 'page';
              targetProx.style.pageBreakInside = 'avoid';
              targetProx.classList.add('avoid-footer-overlap');
              console.log('⚠️ Elemento muito próximo do rodapé - movendo bloco para próxima página (distância:', Math.round(distanceToFooter), 'px)');
              return;
            }
          }
          
          // Se chegou aqui, o elemento não vai sobrepor e está a uma distância segura
          // NÃO limpar pageBreakBefore se este elemento já foi marcado para quebra (ex: por um filho que sobrepunha).
          // Caso contrário o bloco (ex: 4.1) voltaria a ser cortado — título numa página, conteúdo na outra.
          if (element.classList.contains('avoid-footer-overlap') || element.classList.contains('avoid-header-overlap')) {
            return; // Manter a quebra aplicada no bloco inteiro
          }
          element.style.pageBreakBefore = '';
          element.style.breakBefore = '';
          element.style.pageBreakInside = 'auto';
          element.classList.remove('avoid-footer-overlap');
          element.classList.remove('avoid-header-overlap');
          
          // FIM - não precisa de mais lógica complexa
          // A verificação simples acima já trata todos os casos: se não cabe, move para próxima página
          
          // REGRA ESPECIAL PARA ITENS DE PRODUTO: Verificar se está dentro de uma seção
          const isProdutoItem = element.classList.contains('produto-item');
          
          if (isProdutoItem) {
            // Verificar se o item está dentro de uma seção pai
            const parentSection = element.closest('.section');
            const isInsideSection = parentSection !== null;
            
            // Se está dentro de uma seção, a seção já foi processada acima
            // Apenas garantir que o item não seja cortado, mas permitir divisão natural
            if (isInsideSection) {
              // Item está dentro de uma seção - já foi tratado pela lógica da seção
              // Apenas garantir que não seja cortado no meio
              element.style.pageBreakBefore = '';
              element.style.breakBefore = '';
              element.style.pageBreakInside = 'auto'; // Permitir divisão se necessário
              element.classList.remove('avoid-footer-overlap');
              
              // Garantir que o título do item não seja cortado
              const produtoTitle = element.querySelector('h3');
              if (produtoTitle) {
                produtoTitle.style.pageBreakAfter = 'avoid';
                produtoTitle.style.pageBreakInside = 'avoid';
                produtoTitle.style.pageBreakBefore = 'avoid';
              }
              
              return; // Pular - já tratado pela seção pai
            }
            
            // Item de produto FORA de uma seção - tratar isoladamente
            const spaceNeeded = elementHeight;
            const spaceAvailable = footerDangerZoneStart - positionInPage;
            const fitsCompletely = spaceNeeded <= spaceAvailable;
            
            // Verificar se o título do item está sendo cortado (primeiros 200px do item)
            const titleHeight = 200;
            const titleFits = (positionInPage + titleHeight) <= footerDangerZoneStart;
            
            if (!fitsCompletely && positionInPage > 100) {
              // Item não cabe completamente e há conteúdo na página - mover inteiro para próxima
              element.style.pageBreakBefore = 'always';
              element.style.breakBefore = 'page';
              element.style.pageBreakInside = 'avoid';
              element.classList.add('avoid-footer-overlap');
              
              console.log('🔀 Item de produto movido inteiro - não cabe na página', pageNumber + 1, 'altura:', Math.round(elementHeight), 'espaço disponível:', Math.round(spaceAvailable));
            } else if (!titleFits && positionInPage > 100) {
              // Título não cabe completamente - mover item inteiro para próxima página
              element.style.pageBreakBefore = 'always';
              element.style.breakBefore = 'page';
              element.style.pageBreakInside = 'avoid';
              element.classList.add('avoid-footer-overlap');
              
              console.log('🔀 Item de produto movido - título não cabe na página', pageNumber + 1);
            } else if (fitsCompletely && titleFits) {
              // Item e título cabem completamente - permitir que fique na página atual
              element.style.pageBreakBefore = '';
              element.style.breakBefore = '';
              element.style.pageBreakInside = 'avoid';
              element.classList.remove('avoid-footer-overlap');
            } else {
              // Item está no topo da página - deixar como está
              element.style.pageBreakBefore = '';
              element.style.breakBefore = '';
              element.style.pageBreakInside = 'avoid';
              element.classList.remove('avoid-footer-overlap');
            }
            
            // Garantir que o título (h3) e a subsection também não sejam cortados
            const produtoSubsection = element.querySelector('.produto-subsection');
            const produtoTitle = element.querySelector('h3');
            
            if (produtoSubsection) {
              produtoSubsection.style.pageBreakInside = 'avoid';
              produtoSubsection.style.pageBreakBefore = 'avoid';
            }
            if (produtoTitle) {
              produtoTitle.style.pageBreakAfter = 'avoid';
              produtoTitle.style.pageBreakInside = 'avoid';
              produtoTitle.style.pageBreakBefore = 'avoid';
            }
            
            return; // Pular para próximo elemento (já tratamos este)
          }
          
          // REGRA ESPECIAL PARA SEÇÕES: Verificar se tem subitens (produtos) e manter juntos
          // Se a seção já foi marcada para quebra (ex: tabela filha sobrepunha rodapé), não sobrescrever — manter bloco inteiro na mesma página.
          if (isSection) {
            if (element.classList.contains('avoid-footer-overlap') || element.classList.contains('avoid-header-overlap')) {
              return; // Manter pageBreakBefore aplicado (ex: INFORMAÇÕES BANCÁRIAS, 4.1, etc.)
            }
            const sectionTitle = element.querySelector('.section-title');
            
            // Verificar se a seção tem itens de produto dentro (subitens)
            const produtoItems = element.querySelectorAll('.produto-item');
            const hasProdutoItems = produtoItems.length > 0;
            
            // Calcular altura do título
            const titleHeight = sectionTitle ? (sectionTitle.offsetHeight + 15) : 60;
            
            // Verificar espaço disponível na página atual
            const spaceAvailable = footerDangerZoneStart - positionInPage;
            
            // Verificar se o título cabe
            const titleFits = (positionInPage + titleHeight) <= footerDangerZoneStart;
            
            // Se tem subitens (produtos), verificar se título + primeiro item cabem
            let firstItemHeight = 0;
            if (hasProdutoItems && produtoItems[0]) {
              firstItemHeight = produtoItems[0].offsetHeight || 300; // Altura do primeiro item
            }
            
            // Espaço necessário para título + primeiro subitem (se houver)
            const spaceNeededForTitleAndFirstItem = titleHeight + (hasProdutoItems ? firstItemHeight : 0);
            const titleAndFirstItemFit = (positionInPage + spaceNeededForTitleAndFirstItem) <= footerDangerZoneStart;
            
            // REGRA ULTRA PERMISSIVA PARA SEÇÕES:
            // SEMPRE permitir que a seção comece na página atual se o título cabe
            // NUNCA forçar quebra antes de uma seção se o título cabe
            // Apenas mover seção inteira se o título NÃO cabe E há MUITO conteúdo (>700px)
            
            if (hasProdutoItems) {
              // Seção tem subitens - priorizar manter título + primeiro item juntos
              if (titleAndFirstItemFit) {
                // Título + primeiro item cabem juntos - SEMPRE permitir que comece
                element.style.pageBreakBefore = '';
                element.style.breakBefore = '';
                element.style.pageBreakInside = 'auto'; // PERMITIR divisão natural
                element.classList.remove('avoid-footer-overlap');
                
                // Garantir que os itens de produto não sejam movidos isoladamente
                produtoItems.forEach((item, idx) => {
                  if (idx === 0) {
                    // Primeiro item - garantir que fique com o título
                    item.style.pageBreakBefore = '';
                    item.style.breakBefore = '';
                  } else {
                    // Demais itens - permitir divisão natural
                    item.style.pageBreakBefore = '';
                    item.style.breakBefore = '';
                    item.style.pageBreakInside = 'auto';
                  }
                });
              } else if (titleFits) {
                // Título cabe - SEMPRE permitir que comece, mesmo que primeiro item não caiba
                element.style.pageBreakBefore = '';
                element.style.breakBefore = '';
                element.style.pageBreakInside = 'auto';
                element.classList.remove('avoid-footer-overlap');
                
                // Permitir que subitens fluam naturalmente
                produtoItems.forEach((item) => {
                  item.style.pageBreakBefore = '';
                  item.style.breakBefore = '';
                  item.style.pageBreakInside = 'auto';
                });
              } else if (!titleFits && positionInPage > 700) {
                // Título NÃO cabe E há MUITO conteúdo (>700px) - mover seção inteira
                element.style.pageBreakBefore = 'always';
                element.style.breakBefore = 'page';
                element.style.pageBreakInside = 'avoid';
                element.classList.add('avoid-footer-overlap');
                
                console.log('🔀 Seção com subitens movida - título não cabe E muito conteúdo', pageNumber + 1, 'posição:', Math.round(positionInPage));
              } else {
                // Título não cabe mas pouco conteúdo - permitir divisão natural (título pode ir para próxima)
                element.style.pageBreakBefore = '';
                element.style.breakBefore = '';
                element.style.pageBreakInside = 'auto';
                element.classList.remove('avoid-footer-overlap');
              }
            } else {
              // Seção sem subitens (ex: INFORMAÇÕES BANCÁRIAS, Tabela Dados Cadastrais, etc.)
              // REGRA: se a seção não cabe inteira no restante da página, mover bloco inteiro para a próxima
              const sectionFitsInPage = (positionInPage + elementHeight) <= footerDangerZoneStart;
              if (!sectionFitsInPage && positionInPage > 80) {
                element.style.pageBreakBefore = 'always';
                element.style.breakBefore = 'page';
                element.style.pageBreakInside = 'avoid';
                element.classList.add('avoid-footer-overlap');
                return;
              }
              const hasLists = element.querySelectorAll('.texto-corpo ul, .texto-corpo ol').length > 0;
              
              if (titleFits) {
                // Título cabe - permitir que a seção comece na página atual (se couber inteira)
                element.style.pageBreakBefore = '';
                element.style.breakBefore = '';
                element.style.pageBreakInside = 'avoid'; // Manter seção inteira na mesma página
                element.classList.remove('avoid-footer-overlap');
                
                // Se tem listas, garantir que elas possam começar imediatamente
                if (hasLists) {
                  const lists = element.querySelectorAll('.texto-corpo ul, .texto-corpo ol');
                  lists.forEach(list => {
                    list.style.pageBreakBefore = '';
                    list.style.breakBefore = '';
                    list.style.pageBreakInside = 'auto';
                  });
                }
              } else if (!titleFits && positionInPage > 700) {
                // Título NÃO cabe E há MUITO conteúdo na página (>700px) - mover seção inteira
                element.style.pageBreakBefore = 'always';
                element.style.breakBefore = 'page';
                element.style.pageBreakInside = 'avoid';
                element.classList.add('avoid-footer-overlap');
                
                console.log('🔀 Seção movida - título não cabe E muito conteúdo', pageNumber + 1, 'posição:', Math.round(positionInPage), 'espaço disponível:', Math.round(spaceAvailable));
              } else {
                // Título não cabe mas pouco conteúdo - manter seção inteira (evitar título numa página, conteúdo na outra)
                element.style.pageBreakBefore = '';
                element.style.breakBefore = '';
                element.style.pageBreakInside = 'avoid';
                element.classList.remove('avoid-footer-overlap');
              }
            }
            
            // Garantir que o título da seção não seja cortado (só o título, não a seção inteira)
            if (sectionTitle) {
              sectionTitle.style.pageBreakAfter = 'avoid';
              sectionTitle.style.pageBreakInside = 'avoid';
              sectionTitle.style.pageBreakBefore = 'avoid';
            }
            
            // Permitir divisão natural do conteúdo, mas proteger último parágrafo
            const textoCorpo = element.querySelector('.texto-corpo');
            if (textoCorpo) {
              textoCorpo.style.pageBreakBefore = '';
              textoCorpo.style.pageBreakInside = 'auto'; // PERMITIR divisão
              
              // Permitir divisão natural de listas (ul, ol) dentro do texto-corpo
              // Listas podem fluir naturalmente entre páginas
              const lists = textoCorpo.querySelectorAll('ul, ol');
              lists.forEach(list => {
                // NUNCA forçar quebra antes de uma lista - sempre permitir que comece na página atual
                list.style.pageBreakBefore = '';
                list.style.breakBefore = '';
                list.style.pageBreakInside = 'auto'; // PERMITIR divisão natural da lista
                // Permitir que itens da lista fluam naturalmente
                const listItems = list.querySelectorAll('li');
                listItems.forEach(li => {
                  // NUNCA forçar quebra antes de um item da lista - sempre permitir que comece na página atual
                  li.style.pageBreakBefore = '';
                  li.style.breakBefore = '';
                  li.style.pageBreakInside = 'auto'; // PERMITIR divisão natural dos itens
                });
              });
              
              // Proteger o último item da lista e o parágrafo seguinte para não serem cortados pelo rodapé
              // Se há uma lista seguida de um parágrafo, garantir que ambos não sejam cortados
              const allLists = textoCorpo.querySelectorAll('ul, ol');
              if (allLists.length > 0) {
                allLists.forEach(list => {
                  const listItems = list.querySelectorAll('li');
                  if (listItems.length > 0) {
                    const lastListItem = listItems[listItems.length - 1];
                    // Verificar se há um parágrafo logo após a lista
                    const nextSibling = list.nextElementSibling;
                    if (nextSibling && nextSibling.tagName === 'P') {
                      // Proteger o último item da lista e o parágrafo seguinte
                      lastListItem.style.pageBreakAfter = 'avoid';
                      lastListItem.style.breakAfter = 'avoid';
                      nextSibling.style.pageBreakBefore = 'avoid';
                      nextSibling.style.breakBefore = 'avoid';
                    }
                  }
                });
              }
              
              // Proteger o último parágrafo para não ficar sozinho na próxima página
              const paragraphs = textoCorpo.querySelectorAll('p');
              if (paragraphs.length > 0) {
                const lastParagraph = paragraphs[paragraphs.length - 1];
                // Sempre proteger o último parágrafo para não ficar isolado
                lastParagraph.style.pageBreakBefore = 'avoid';
                lastParagraph.style.breakBefore = 'avoid';
                lastParagraph.style.orphans = '3';
                lastParagraph.style.widows = '3';
              }
            }
            
            return; // Pular para próximo elemento (já tratamos esta seção)
          }
          
          // ESTRATÉGIA ULTRA CONSERVADORA para demais elementos:
          // - Verificar se há espaço na página atual antes de quebrar
          // - Se há espaço (mesmo que pequeno), SEMPRE permitir que o elemento comece na página atual
          // - Apenas o residual vai para a próxima página
          
          const canStartInCurrentPage = (footerDangerZoneStart - positionInPage) > 50;
          const isVerySmallElement = elementHeight < 100; // Apenas elementos muito pequenos (< 100px)
          
          // REGRA PRINCIPAL: Se há espaço na página atual, SEMPRE permitir que o elemento comece lá
          if (canStartInCurrentPage) {
            // Há espaço suficiente - SEMPRE permitir que comece na página atual
            // NUNCA quebrar antes, sempre permitir divisão natural
            element.style.pageBreakBefore = '';
            element.style.breakBefore = '';
            element.style.pageBreakInside = 'auto'; // Permitir divisão natural
            element.classList.remove('avoid-footer-overlap');
          } else {
            // Não há espaço suficiente na página atual (menos de 50px)
            // Só neste caso, considerar quebrar antes, mas apenas para elementos muito pequenos
            // E apenas se há bastante conteúdo na página atual
            const hasEnoughContent = positionInPage > 700; // Mais de 700px de conteúdo
            const isAtPageTop = positionInPage < 200; // Não está no topo
            
            if (isVerySmallElement && hasEnoughContent && !isAtPageTop) {
              // Elemento muito pequeno, sem espaço, mas há conteúdo - pode quebrar antes
              element.style.pageBreakBefore = 'always';
              element.style.breakBefore = 'page';
              element.style.pageBreakInside = 'avoid';
              element.classList.add('avoid-footer-overlap');
              
              console.log('🔀 Quebra aplicada (sem espaço + elemento muito pequeno) - Página', pageNumber + 1);
            } else {
              // Mesmo sem espaço, permitir divisão natural (elemento começa e continua na próxima)
              element.style.pageBreakBefore = '';
              element.style.breakBefore = '';
              element.style.pageBreakInside = 'auto';
              element.classList.remove('avoid-footer-overlap');
            }
          }
          } catch (e) { /* evita travar no blob se um elemento der erro */ }
        });
        
        console.log('✅ Verificação concluída para todas as páginas');
      }
      
      // Executar quando a imagem do rodapé carregar (ou logo ao carregar se não houver elemento — ex: PDF via blob)
      if (footerImg && footerPrint) {
        if (footerImg.complete) {
          setTimeout(checkAndPreventOverlap, 200);
        } else {
          footerImg.addEventListener('load', function() {
            setTimeout(checkAndPreventOverlap, 200);
          });
        }
      } else {
        setTimeout(checkAndPreventOverlap, 200);
      }
      
      // Re-executar em intervalos para capturar mudanças de layout
      setTimeout(checkAndPreventOverlap, 500);
      setTimeout(checkAndPreventOverlap, 1000);
      setTimeout(checkAndPreventOverlap, 2000);
      
      // Re-executar antes da impressão (crítico!)
      window.addEventListener('beforeprint', function() {
        setTimeout(checkAndPreventOverlap, 100);
      });
    })();
    }
    
    // LÓGICA PARA CABEÇALHO FIXO (só no navegador; no PDF servidor usa só CSS)
    if (!__forPdfServer) {
    (function() {
      const headerImg = document.getElementById('header-img');
      const headerPrint = document.getElementById('header-image-print');
      
      if (!headerImg || !headerPrint) {
        console.log('⚠️ Cabeçalho não encontrado - headerImg:', !!headerImg, 'headerPrint:', !!headerPrint);
        return;
      }
      
      function setupHeaderForAllPages() {
        // Obter altura do cabeçalho
        let headerHeight = 0;
        if (headerImg.complete && headerImg.naturalHeight) {
          headerHeight = headerImg.naturalHeight;
        } else if (headerImg.offsetHeight) {
          headerHeight = headerImg.offsetHeight;
        } else {
          headerHeight = 100; // Fallback
        }
        
        // Limitar altura máxima do cabeçalho para evitar cálculos errados
        if (headerHeight > 200) {
          console.warn('⚠️ Altura do cabeçalho muito grande (' + headerHeight + 'px), usando 120px como limite');
          headerHeight = 120;
        }
        
        // Mostrar o cabeçalho apenas a partir da segunda página
        // Usar CSS para esconder na primeira página
        const style = document.createElement('style');
        style.id = 'header-padding-style';
        const oldStyle = document.getElementById('header-padding-style');
        if (oldStyle) oldStyle.remove();
        
        // CSS já está definido no estilo principal - apenas garantir que está escondido por padrão
        // Não adicionar CSS adicional aqui, pois já está no estilo principal
        
        // Inicialmente, o cabeçalho está visível por padrão (via CSS)
        // Vamos verificar se precisa esconder na primeira página
        headerPrint.classList.remove('hide-on-first-page');
        headerPrint.classList.remove('show-from-page-2');
        
        // Verificar se há conteúdo após a primeira página e mostrar o cabeçalho
        function checkAndShowHeader() {
          const pageHeight = 1123; // Altura de uma página A4 em pixels
          const pageMargin = 20 * 3.779527559; // 20mm em pixels
          const usablePageHeight = pageHeight - (pageMargin * 2);
          const firstPageEnd = usablePageHeight; // Fim da primeira página útil
          
          // Verificar se há qualquer conteúdo após a primeira página
          // O cabeçalho deve aparecer em TODAS as páginas EXCETO a primeira (capa)
          let hasContentAfterFirstPage = false;
          
          // Verificar se há elementos após a primeira página
          const allElements = document.querySelectorAll('.section, table, .produto-item, .proposta-body > div, .proposta-container > div');
          
          allElements.forEach(function(el) {
            const elementTop = el.offsetTop;
            // Se o elemento está claramente após a primeira página
            if (elementTop > firstPageEnd + 50) { // Margem de 50px para garantir
              hasContentAfterFirstPage = true;
            }
          });
          
          // Verificar também se há seção "1. OBJETIVO DA PROPOSTA" ou qualquer outra seção após a primeira página
          const allSections = document.querySelectorAll('.section');
          allSections.forEach(function(section) {
            // Ignorar a seção "DADOS DO CLIENTE" que faz parte da capa
            const sectionTitle = section.querySelector('.section-title');
            if (sectionTitle && sectionTitle.textContent && sectionTitle.textContent.includes('DADOS DO CLIENTE')) {
              return; // Pular esta seção - faz parte da capa
            }
            
            const sectionTop = section.offsetTop;
            // Se alguma seção está após a primeira página
            if (sectionTop > firstPageEnd) {
              hasContentAfterFirstPage = true;
            }
          });
          
          // O cabeçalho deve aparecer em TODAS as páginas EXCETO a primeira (capa)
          // Sempre mostrar o cabeçalho - ele será escondido na primeira página via JavaScript
          if (hasContentAfterFirstPage) {
            // Há conteúdo após a primeira página - mostrar cabeçalho
            headerPrint.classList.remove('hide-on-first-page');
            headerPrint.classList.add('show-from-page-2');
            // Aplicar estilos inline para garantir que apareça
            headerPrint.style.display = 'block';
            headerPrint.style.visibility = 'visible';
            headerPrint.style.opacity = '1';
            console.log('✅ Cabeçalho CONFIGURADO - aparecerá a partir da segunda página (não na capa)');
          } else {
            // Mesmo sem conteúdo após primeira página, mostrar cabeçalho (caso raro de proposta de 1 página)
            // Mas na prática, sempre haverá conteúdo após a primeira página
            headerPrint.classList.remove('hide-on-first-page');
            headerPrint.classList.add('show-from-page-2');
            headerPrint.style.display = 'block';
            headerPrint.style.visibility = 'visible';
            headerPrint.style.opacity = '1';
            console.log('✅ Cabeçalho CONFIGURADO - aparecerá em todas as páginas exceto a primeira (capa)');
          }
          
          // IMPORTANTE: Esconder cabeçalho na primeira página usando JavaScript
          // Verificar se estamos na primeira página e esconder o cabeçalho
          const firstPageElements = document.querySelectorAll('.section, .proposta-body > div');
          let isFirstPage = true;
          firstPageElements.forEach(function(el) {
            if (el.offsetTop > firstPageEnd) {
              isFirstPage = false;
            }
          });
          
          // Se ainda estamos na primeira página, esconder o cabeçalho
          // Mas na prática, o cabeçalho só aparece a partir da segunda página devido ao position: fixed
          // e à lógica de posicionamento que considera apenas páginas após a primeira
        }
        
        // Executar verificação após um delay para garantir que o layout está calculado
        setTimeout(checkAndShowHeader, 300);
        setTimeout(checkAndShowHeader, 800);
        setTimeout(checkAndShowHeader, 1500);
        setTimeout(checkAndShowHeader, 2500);
        
        // Re-executar antes da impressão (crítico!)
        window.addEventListener('beforeprint', function() {
          setTimeout(checkAndShowHeader, 50);
        });
        
        // Re-executar após impressão também
        window.addEventListener('afterprint', function() {
          setTimeout(checkAndShowHeader, 100);
        });
        
        console.log('📄 Cabeçalho fixo configurado - aparecerá a partir da SEGUNDA página, altura:', headerHeight);
      }
      
      // Executar quando a imagem do cabeçalho carregar
      if (headerImg.complete) {
        setTimeout(setupHeaderForAllPages, 200);
      } else {
        headerImg.addEventListener('load', function() {
          setTimeout(setupHeaderForAllPages, 200);
        });
        headerImg.addEventListener('error', function() {
          console.error('❌ Erro ao carregar imagem do cabeçalho');
        });
      }
      
      // Re-executar em intervalos
      setTimeout(setupHeaderForAllPages, 500);
      setTimeout(setupHeaderForAllPages, 1000);
      setTimeout(setupHeaderForAllPages, 2000);
      
      // Re-executar antes da impressão
      window.addEventListener('beforeprint', function() {
        setTimeout(setupHeaderForAllPages, 100);
      });
    })();
    }
  </script>
</body>
</html>`;
    return substituirPlaceholdersProposta(html, proposta, itens, totais);
  } catch (error) {
    console.error('Erro na função gerarHTMLPropostaPremium:', error);
    throw error;
  }
}

// ========== FUNÇÃO PARA GERAR HTML DA ORDEM DE SERVIÇO ==========
function gerarHTMLOS(os, osItens = []) {
  try {
    if (!os) {
      throw new Error('Ordem de Serviço não fornecida');
    }

    // Função auxiliar para escapar valores
    const esc = (str) => {
      if (str === null || str === undefined) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    };

    // Função auxiliar para formatar datas
    const formatDate = (date) => {
      if (!date) return '';
      try {
        const d = new Date(date);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      } catch (e) {
        return '';
      }
    };

    // Logo GMP e base URL para imagens
    const logoBaseURL = process.env.API_URL || `http://localhost:${PORT}`;
    
    // Tentar carregar logo como base64 para garantir que apareça
    let logoGMP = '';
    const publicLogoMYPath = path.join(__dirname, '..', 'client', 'public', 'Logo_MY.jpg');
    try {
      if (fs.existsSync(publicLogoMYPath)) {
        const logoBuffer = fs.readFileSync(publicLogoMYPath);
        const logoBase64 = logoBuffer.toString('base64');
        const logoExtension = path.extname(publicLogoMYPath).substring(1) || 'jpg';
        logoGMP = `data:image/${logoExtension};base64,${logoBase64}`;
        console.log(`✅ [PDF] Logo carregado como base64 (${logoBase64.length} bytes)`);
      } else {
        // Fallback para URL
        logoGMP = `${logoBaseURL}/Logo_MY.jpg`;
        console.log(`⚠️ [PDF] Logo não encontrado, usando URL: ${logoGMP}`);
      }
    } catch (error) {
      // Fallback para URL se houver erro ao ler o arquivo
      logoGMP = `${logoBaseURL}/Logo_MY.jpg`;
      console.error(`❌ [PDF] Erro ao carregar logo como base64:`, error.message);
      console.log(`⚠️ [PDF] Usando URL como fallback: ${logoGMP}`);
    }
    
    // Garantir que a baseURL está disponível para uso nas imagens dos produtos
    if (!global.baseURLForPDF) {
      global.baseURLForPDF = logoBaseURL;
    }

    // Calcular número de páginas (estimativa)
    const totalPages = Math.max(1, Math.ceil((osItens.length + 5) / 20));

    let html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ordem de Serviço ${os.numero_os || ''}</title>
  <style>
    @page {
      size: A4;
      margin: 0;
    }
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      font-size: 10pt;
      line-height: 1.5;
      color: #1a1a1a;
      background: #fff;
    }
    .header {
      background: linear-gradient(135deg, #0066cc 0%, #004499 100%);
      color: white;
      padding: 16px 20px;
      border-radius: 0;
      margin-bottom: 20px;
      box-shadow: none;
    }
    .header-content {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .logo {
      width: 100px;
      height: auto;
      background: white;
      padding: 8px;
      border-radius: 4px;
    }
    .header-text {
      flex: 1;
      margin-left: 20px;
    }
    .header-title {
      font-size: 24pt;
      font-weight: 700;
      margin-bottom: 5px;
      letter-spacing: 1px;
    }
    .header-subtitle {
      font-size: 14pt;
      opacity: 0.95;
      margin-bottom: 15px;
    }
    .header-info {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
      font-size: 9pt;
      margin-top: 10px;
    }
    .header-info-item {
      display: flex;
      align-items: center;
    }
    .header-info-label {
      font-weight: 600;
      margin-right: 8px;
      opacity: 0.9;
    }
    .header-info-value {
      font-weight: 400;
    }
    .preview-os-info {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 20px;
      margin-bottom: 24px;
    }
    .info-section {
      background: #ffffff;
      padding: 16px 20px;
      border-radius: 0;
      border: 1px solid #d0d0d0;
      box-shadow: none;
      position: relative;
      overflow: hidden;
    }
    .info-section::before {
      display: none;
    }
    .info-section-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid #d0d0d0;
    }
    .info-section-icon {
      width: 24px;
      height: 24px;
      border-radius: 0;
      background: transparent;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #1a1a1a;
      font-size: 16px;
      box-shadow: none;
    }
    .info-section-proposta .info-section-icon {
      background: transparent;
      box-shadow: none;
    }
    .info-section h3 {
      margin: 0;
      font-size: 12pt;
      font-weight: 700;
      color: #0066cc;
      letter-spacing: 0;
      text-transform: uppercase;
    }
    .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
    }
    .info-item {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 12px;
      background: #ffffff;
      border-radius: 0;
      border: 1px solid #e0e0e0;
    }
    .info-item-icon {
      width: 20px;
      height: 20px;
      border-radius: 0;
      background: transparent;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #0066cc;
      font-size: 14px;
      flex-shrink: 0;
      box-shadow: none;
    }
    .info-item-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }
    .info-item-label {
      font-size: 9pt;
      font-weight: 600;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      line-height: 1.2;
    }
    .info-item-value {
      font-size: 11pt;
      font-weight: 400;
      color: #1a1a1a;
      line-height: 1.4;
      word-break: break-word;
    }
    .info-item-value-highlight {
      color: #0066cc;
      font-size: 11pt;
      font-weight: 700;
      letter-spacing: 0;
    }
    .info-item-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 0;
      font-size: 10pt;
      font-weight: 400;
      background: #e3f2fd;
      color: #0066cc;
      text-transform: none;
      border: 1px solid #0066cc;
    }
    .info-item-priority-alta {
      background: #ffebee;
      color: #c62828;
      border-color: #c62828;
    }
    .info-item-priority-media {
      background: #fff3e0;
      color: #e65100;
      border-color: #e65100;
    }
    .info-item-priority-normal {
      background: #e8f5e9;
      color: #2e7d32;
      border-color: #2e7d32;
    }
    .info-item-priority-baixa {
      background: #e3f2fd;
      color: #0066cc;
      border-color: #0066cc;
    }
    .data-entrega-destaque {
      background: #fff3cd;
      border-left: 4px solid #ffc107;
      padding: 12px;
      border-radius: 4px;
      margin: 15px 0;
    }
    .data-entrega-destaque strong {
      color: #856404;
      font-size: 11pt;
    }
    .section {
      margin: 25px 0;
      page-break-inside: avoid;
    }
    .section-title {
      font-size: 12pt;
      font-weight: 700;
      color: white;
      margin-bottom: 16px;
      padding: 10px 20px;
      background: linear-gradient(135deg, #0066cc 0%, #004499 100%);
      border-radius: 0;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      box-shadow: none;
      text-shadow: none;
    }
    .documentacoes-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 5px;
      font-size: 9pt;
      margin: 10px 0;
    }
    .doc-item {
      display: flex;
      align-items: center;
    }
    .checkbox {
      margin-right: 5px;
      font-size: 12pt;
    }
    .equipamento-info {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      font-size: 9pt;
      margin: 10px 0;
    }
    .configuracao-item {
      margin: 5px 0;
      font-size: 9pt;
    }
    .config-label {
      font-weight: bold;
      display: inline-block;
      min-width: 200px;
    }
    .checklist-table {
      width: 100%;
      border-collapse: collapse;
      margin: 10px 0;
      font-size: 9pt;
    }
    .checklist-table th,
    .checklist-table td {
      border: 1px solid #000;
      padding: 5px;
      text-align: center;
    }
    .checklist-table th {
      background-color: #f0f0f0;
      font-weight: bold;
    }
    .checklist-col {
      width: 50%;
    }
    .footer {
      margin-top: 20px;
      border-top: 1px solid #000;
      padding-top: 10px;
      font-size: 9pt;
    }
    .footer-row {
      display: flex;
      justify-content: space-between;
      margin: 5px 0;
    }
    .page-break {
      page-break-before: always;
    }
    .page-number {
      text-align: center;
      font-size: 8pt;
      margin-top: 10px;
    }
    .itens-list-planilha {
      display: flex;
      flex-direction: column;
      gap: 20px;
      margin: 20px 0;
    }
    .item-planilha-container {
      background: #ffffff;
      border: 2px solid #0066cc;
      border-radius: 0;
      box-shadow: 0 2px 4px rgba(0, 102, 204, 0.1);
      overflow: hidden;
      width: 100%;
      page-break-inside: avoid;
    }
    .item-planilha-header {
      background: #ffffff;
      padding: 16px 20px;
      border-bottom: 2px solid #0066cc;
    }
    .item-planilha-info {
      display: flex;
      gap: 20px;
      align-items: flex-start;
    }
    .item-planilha-image {
      width: 120px;
      height: 120px;
      min-width: 120px;
      min-height: 120px;
      border: 2px solid #0066cc;
      border-radius: 4px;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f5f5f5;
      flex-shrink: 0;
    }
    .item-planilha-image img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
    }
    .item-planilha-dados {
      flex: 1;
      width: 100%;
    }
    .item-planilha-dados h4 {
      margin: 0 0 10px 0;
      font-size: 14pt;
      font-weight: 700;
      color: #0066cc;
      padding-bottom: 8px;
      border-bottom: 2px solid #0066cc;
      text-transform: none;
      letter-spacing: 0;
    }
    .item-planilha-meta {
      display: flex;
      gap: 20px;
      font-size: 10pt;
      color: #666;
      margin-top: 8px;
      flex-wrap: wrap;
    }
    .item-planilha-meta span {
      display: flex;
      gap: 6px;
      align-items: center;
      padding: 0;
      background: transparent;
      border-radius: 0;
      border: none;
      font-weight: 400;
    }
    .item-planilha-meta strong {
      color: #0066cc;
      font-weight: 600;
      font-size: 10pt;
      text-transform: none;
      letter-spacing: 0;
    }
    .especificacoes-tecnicas-table {
      margin: 0;
      padding: 0;
      background: white;
      border-radius: 0;
      border: none;
      width: 100%;
    }
    .especificacoes-tecnicas-table h4 {
      margin: 0;
      padding: 12px 20px;
      font-size: 12pt;
      color: white;
      background: linear-gradient(135deg, #0066cc 0%, #004499 100%);
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 2px solid #0066cc;
    }
    .especificacoes-tecnicas-table table {
      width: 100%;
      border-collapse: collapse;
      border: 2px solid #0066cc;
      border-top: none;
      margin: 0;
      display: table;
    }
    .especificacoes-tecnicas-table table thead tr {
      background: linear-gradient(135deg, #0066cc 0%, #004499 100%);
    }
    .especificacoes-tecnicas-table table thead th {
      background: linear-gradient(135deg, #0066cc 0%, #004499 100%);
      color: white;
      padding: 10px 20px;
      text-align: left;
      font-weight: 700;
      font-size: 10pt;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border: 1px solid #0066cc;
      border-bottom: 2px solid #0066cc;
    }
    .especificacoes-tecnicas-table table thead th:first-child {
      border-right: 2px solid #0066cc;
    }
    .especificacoes-tecnicas-table table tbody tr {
      border-bottom: 1px solid #d0d0d0;
    }
    .especificacoes-tecnicas-table table tbody tr:last-child {
      border-bottom: 2px solid #0066cc;
    }
    .especificacoes-tecnicas-table table tbody tr:nth-child(even) {
      background: #f9f9f9;
    }
    .especificacoes-tecnicas-table table tbody tr:nth-child(odd) {
      background: #ffffff;
    }
    .especificacoes-tecnicas-table table td {
      padding: 10px 20px;
      border-right: 1px solid #d0d0d0;
      font-size: 10pt;
      line-height: 1.5;
    }
    .especificacoes-tecnicas-table table td:last-child {
      border-right: none;
    }
    .spec-label {
      font-weight: 600;
      color: #0066cc;
      width: 40%;
      border-right: 2px solid #0066cc !important;
      background: #f0f7ff;
      font-size: 10pt;
      letter-spacing: 0;
      text-transform: none;
    }
    .spec-value {
      color: #1a1a1a;
      width: 60%;
      font-weight: 400;
      font-size: 10pt;
    }
    .item-row {
      page-break-inside: avoid;
    }
    .item-number {
      font-weight: 700;
      color: #0066cc;
      text-align: center;
    }
    .item-code {
      font-family: 'Courier New', monospace;
      font-weight: 600;
      color: #333;
    }
    .item-description {
      font-weight: 500;
    }
    .item-qty {
      text-align: center;
      font-weight: 600;
    }
    .no-specs {
      font-style: italic;
      color: #999;
      font-size: 8pt;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 2px solid #e0e0e0;
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 30px;
    }
    .footer-section {
      font-size: 9pt;
    }
    .footer-section-title {
      font-weight: 700;
      color: #0066cc;
      margin-bottom: 10px;
      text-transform: uppercase;
      font-size: 9pt;
    }
    .signature-line {
      border-top: 1px solid #000;
      margin-top: 50px;
      padding-top: 5px;
      text-align: center;
      font-size: 8pt;
    }
    .page-number {
      text-align: center;
      font-size: 8pt;
      color: #999;
      margin-top: 20px;
    }
    .preview-os-observacoes {
      margin-top: 24px;
      padding-top: 24px;
      border-top: 2px solid #e0e0e0;
    }
    .observacao-section {
      margin-bottom: 16px;
    }
    .observacao-section strong {
      display: block;
      margin-bottom: 8px;
      color: #0066cc;
      font-size: 14px;
    }
    .observacao-section p {
      margin: 0;
      padding: 12px;
      background: #f8f9fa;
      border-radius: 6px;
      border: 1px solid #e0e0e0;
      font-size: 14px;
      line-height: 1.6;
      color: #333;
      white-space: pre-wrap;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-content">
      <img src="${logoGMP}" alt="GMP INDUSTRIAIS" class="logo" />
      <div class="header-text">
        <div class="header-title">ORDEM DE SERVIÇO</div>
        <div class="header-subtitle">N° ${esc(os.numero_os || '')} ${os.revisao ? '| Rev. ' + esc(os.revisao) : ''}</div>
        <div class="header-info">
          <div class="header-info-item">
            <span class="header-info-label">Cliente:</span>
            <span class="header-info-value">${os.cliente_nome ? esc(os.cliente_nome.substring(0, 3).toUpperCase()) + ' (ID: ' + (os.cliente_id || '') + ')' : ''}</span>
          </div>
          <div class="header-info-item">
            <span class="header-info-label">Data de Emissão:</span>
            <span class="header-info-value">${formatDate(os.data_abertura || os.data_entrada_pedido)}</span>
          </div>
          ${os.numero_proposta ? `
          <div class="header-info-item">
            <span class="header-info-label">Proposta:</span>
            <span class="header-info-value">${esc(os.numero_proposta)}</span>
          </div>
          ` : ''}
          ${os.vendedor ? `
          <div class="header-info-item">
            <span class="header-info-label">Vendedor:</span>
            <span class="header-info-value">${esc(os.vendedor)}</span>
          </div>
          ` : ''}
        </div>
      </div>
    </div>
  </div>

  ${os.data_entrega || os.data_prevista ? `
  <div class="data-entrega-destaque">
    <strong>📅 DATA DE ENTREGA PREVISTA:</strong> ${formatDate(os.data_entrega || os.data_prevista)}
  </div>
  ` : ''}

  <div class="preview-os-info">
    <div class="info-section info-section-os">
      <div class="info-section-header">
        <div class="info-section-icon">📄</div>
        <h3>Informações da OS</h3>
      </div>
      <div class="info-grid">
        <div class="info-item">
          <div class="info-item-icon">#</div>
          <div class="info-item-content">
            <span class="info-item-label">Número OS</span>
            <span class="info-item-value info-item-value-highlight">${esc(os.numero_os || '')}</span>
          </div>
        </div>
        <div class="info-item">
          <div class="info-item-icon">🏷️</div>
          <div class="info-item-content">
            <span class="info-item-label">Tipo</span>
            <span class="info-item-value info-item-badge">${esc(os.tipo_os || '')}</span>
          </div>
        </div>
        <div class="info-item">
          <div class="info-item-icon">⚠️</div>
          <div class="info-item-content">
            <span class="info-item-label">Prioridade</span>
            <span class="info-item-value info-item-badge info-item-priority-${(os.prioridade || 'normal').toLowerCase()}">${esc((os.prioridade || 'normal').toUpperCase())}</span>
          </div>
        </div>
        <div class="info-item">
          <div class="info-item-icon">📅</div>
          <div class="info-item-content">
            <span class="info-item-label">Data Abertura</span>
            <span class="info-item-value">${formatDate(os.data_abertura || os.data_entrada_pedido)}</span>
          </div>
        </div>
        ${os.data_prevista ? `
        <div class="info-item">
          <div class="info-item-icon">📅</div>
          <div class="info-item-content">
            <span class="info-item-label">Data Prevista</span>
            <span class="info-item-value">${formatDate(os.data_prevista)}</span>
          </div>
        </div>
        ` : ''}
      </div>
    </div>

    ${os.numero_proposta || os.cliente_nome ? `
    <div class="info-section info-section-proposta">
      <div class="info-section-header">
        <div class="info-section-icon">📈</div>
        <h3>Informações da Proposta</h3>
      </div>
      <div class="info-grid">
        ${os.numero_proposta ? `
        <div class="info-item">
          <div class="info-item-icon">#</div>
          <div class="info-item-content">
            <span class="info-item-label">Número Proposta</span>
            <span class="info-item-value info-item-value-highlight">${esc(os.numero_proposta)}</span>
          </div>
        </div>
        ` : ''}
        ${os.cliente_nome ? `
        <div class="info-item">
          <div class="info-item-icon">👤</div>
          <div class="info-item-content">
            <span class="info-item-label">Cliente</span>
            <span class="info-item-value">${esc(os.cliente_nome.substring(0, 3).toUpperCase())}${os.cliente_id ? ' (' + os.cliente_id + ')' : ''}</span>
          </div>
        </div>
        ` : ''}
      </div>
    </div>
    ` : ''}
  </div>

  <div class="section">
    <div class="section-title">ITENS PARA FABRICAÇÃO</div>
    ${osItens && osItens.length > 0 ? `
      <div class="itens-list-planilha">
        ${osItens.map((item, index) => {
          // Usar especificações técnicas já processadas ou parsear
          let especs = item.especificacoes_tecnicas || {};
          if (!especs || Object.keys(especs).length === 0) {
            try {
              // Tentar parsear de observacoes (onde pode estar salvo como JSON)
              if (item.observacoes) {
                const parsed = JSON.parse(item.observacoes);
                if (parsed.especificacoes_tecnicas) {
                  especs = typeof parsed.especificacoes_tecnicas === 'string' 
                    ? JSON.parse(parsed.especificacoes_tecnicas) 
                    : parsed.especificacoes_tecnicas;
                }
              }
            } catch (e) {
              // Ignorar erros de parsing
            }
          }
          
          // Buscar nome do produto
          const nomeProduto = item.nome_produto || item.descricao || item.nome || 'Produto não especificado';
          const codigoProduto = item.codigo_produto || item.codigo || '';
          const quantidade = item.quantidade || 1;
          const unidade = item.unidade || 'un';
          
          // Buscar imagem do produto (priorizar base64 se disponível)
          // A imagem já deve ter sido convertida para base64 no processamento anterior
          let imagemURL = '';
          
          console.log(`🖼️ [PDF] Processando imagem para item ${index + 1}:`, {
            nome: nomeProduto,
            codigo: codigoProduto,
            produto_imagem: item.produto_imagem || 'N/A',
            produto_imagem_base64: item.produto_imagem_base64 ? 'SIM (' + item.produto_imagem_base64.substring(0, 30) + '...)' : 'NÃO'
          });
          
          // Se o item já tem a imagem em base64 (processada anteriormente), usar ela
          if (item.produto_imagem_base64) {
            imagemURL = item.produto_imagem_base64;
            console.log(`✅ [PDF] Usando imagem base64 para ${nomeProduto}`);
          } else {
            // Se não tem base64, tentar carregar agora (fallback)
            const produtoImagem = item.produto_imagem || item.imagem || '';
            if (produtoImagem) {
              try {
                const imagemPath = path.join(uploadsProdutosDir, produtoImagem);
                if (fs.existsSync(imagemPath)) {
                  const imagemBuffer = fs.readFileSync(imagemPath);
                  const imagemBase64 = imagemBuffer.toString('base64');
                  const imagemExtension = path.extname(produtoImagem).substring(1).toLowerCase() || 'jpg';
                  const mimeType = imagemExtension === 'jpg' || imagemExtension === 'jpeg' ? 'jpeg' : 
                                  imagemExtension === 'png' ? 'png' : 
                                  imagemExtension === 'gif' ? 'gif' : 
                                  imagemExtension === 'webp' ? 'webp' : 'jpeg';
                  imagemURL = `data:image/${mimeType};base64,${imagemBase64}`;
                  console.log(`✅ [PDF] Imagem convertida para base64 (fallback): ${produtoImagem}`);
                } else {
                  console.warn(`⚠️ [PDF] Arquivo não encontrado no fallback: ${imagemPath}`);
                }
              } catch (error) {
                console.error(`❌ [PDF] Erro no fallback de conversão:`, error.message);
              }
            } else {
              console.log(`⚠️ [PDF] Nenhuma imagem para produto: ${nomeProduto} (código: ${codigoProduto})`);
            }
          }
          
          console.log(`🖼️ [PDF] Resultado final - imagemURL: ${imagemURL ? 'DEFINIDA' : 'VAZIA'}`);
          
          // Lista de campos de especificações técnicas (igual ao preview)
          const camposEspecificacoes = [
            { key: 'material_contato', label: 'Material de Contato' },
            { key: 'motor_central_cv', label: 'Motor Central (CV)' },
            { key: 'motoredutor_central_cv', label: 'Motorredutor Central (CV)' },
            { key: 'motores_laterais_cv', label: 'Motores Laterais (CV)' },
            { key: 'ccm_incluso', label: 'CCM Incluso' },
            { key: 'ccm_tensao', label: 'CCM Tensão' },
            { key: 'celula_carga', label: 'Célula de Carga' },
            { key: 'plc_ihm', label: 'PLC/IHM' },
            { key: 'valvula_saida_tanque', label: 'Válvula Saída Tanque' },
            { key: 'classificacao_area', label: 'Classificação Área' },
            { key: 'densidade', label: 'Densidade' },
            { key: 'viscosidade', label: 'Viscosidade' },
            { key: 'espessura', label: 'Espessura' },
            { key: 'acabamento', label: 'Acabamento' },
            { key: 'diametro', label: 'Diâmetro' },
            { key: 'furacao', label: 'Furação' },
            { key: 'funcao', label: 'Função' },
            { key: 'tratamento_termico', label: 'Tratamento Térmico' },
            { key: 'tratamento_termico_especifico', label: 'Tratamento Térmico Específico' },
            { key: 'velocidade_trabalho', label: 'Velocidade Trabalho' },
            { key: 'velocidade_trabalho_especifica', label: 'Velocidade Trabalho Específica' }
          ];
          
          // Criar lista de todos os campos com valor (pré-definidos + dinâmicos)
          const todosCampos = [];
          
          // Primeiro adicionar campos pré-definidos que têm valor
          camposEspecificacoes.forEach(campo => {
            const valor = especs[campo.key];
            if (valor !== null && valor !== undefined && valor !== '') {
              todosCampos.push({ ...campo, valor });
            }
          });
          
          // Depois adicionar campos dinâmicos que não estão na lista pré-definida
          Object.keys(especs).forEach(key => {
            const valor = especs[key];
            if (valor !== null && valor !== undefined && valor !== '' && 
                !camposEspecificacoes.find(c => c.key === key)) {
              // Formatar o label do campo dinâmico (capitalizar e substituir underscores)
              const label = key
                .split('_')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');
              todosCampos.push({ key, label, valor });
            }
          });
          
          // Gerar tabela de especificações técnicas (estilo igual ao preview)
          const especsRows = todosCampos
            .map(campo => {
              return `<tr><td class="spec-label">${esc(campo.label)}</td><td class="spec-value">${esc(String(campo.valor))}</td></tr>`;
            })
            .join('');
          
          const especsTable = especsRows ? `
            <div class="especificacoes-tecnicas-table">
              <h4>Especificações Técnicas</h4>
              <table>
                <thead>
                  <tr>
                    <th>Especificação</th>
                    <th>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  ${especsRows}
                </tbody>
              </table>
            </div>
          ` : '';
          
          // Garantir que a imagem seja exibida se disponível
          const imagemHTML = imagemURL ? `
                  <div class="item-planilha-image">
                    <img src="${imagemURL}" alt="${esc(nomeProduto)}" style="max-width: 100%; max-height: 100%; object-fit: contain; display: block;" onerror="console.error('Erro ao carregar imagem no PDF:', this.src); this.parentElement.innerHTML='<div style=\\'display: flex; align-items: center; justify-content: center; color: #999; font-size: 9pt;\\'>Erro ao carregar imagem</div>';" />
                  </div>
                  ` : `
                  <div class="item-planilha-image" style="display: flex; align-items: center; justify-content: center; color: #999; font-size: 9pt;">
                    Sem imagem
                  </div>
                  `;
          
          // Log final antes de gerar HTML
          if (imagemURL) {
            const previewBase64 = imagemURL.substring(0, 50) + '...';
            console.log(`🖼️ [PDF] HTML gerado com imagem para ${nomeProduto}: ${previewBase64}`);
          } else {
            console.log(`⚠️ [PDF] HTML gerado SEM imagem para ${nomeProduto}`);
          }
          
          return `
            <div class="item-planilha-container">
              <div class="item-planilha-header">
                <div class="item-planilha-info">
                  ${imagemHTML}
                  <div class="item-planilha-dados">
                    <h4>Item ${index + 1}: ${esc(nomeProduto)}</h4>
                    <div class="item-planilha-meta">
                      <span><strong>Quantidade:</strong> ${quantidade} ${esc(unidade)}</span>
                      ${codigoProduto ? `<span><strong>Código:</strong> ${esc(codigoProduto)}</span>` : ''}
                    </div>
                  </div>
                </div>
              </div>
              ${especsTable}
            </div>
          `;
        }).join('')}
      </div>
    ` : '<p style="text-align: center; color: #999; padding: 20px;">Nenhum item cadastrado para esta Ordem de Serviço.</p>'}
  </div>

  ${os.descricao || os.observacoes ? `
  <div class="preview-os-observacoes">
    ${os.descricao ? `
    <div class="observacao-section">
      <strong>Descrição:</strong>
      <p>${esc(os.descricao)}</p>
    </div>
    ` : ''}
    ${os.observacoes ? `
    <div class="observacao-section">
      <strong>Observações:</strong>
      <p>${esc(os.observacoes)}</p>
    </div>
    ` : ''}
  </div>
  ` : ''}

  <div class="footer">
    <div class="footer-section">
      <div class="footer-section-title">Aprovação</div>
      <div class="signature-line">
        ${os.conferente_nome ? esc(os.conferente_nome) : 'Conferente'}
        <br>
        <small style="color: #999;">Data: ${formatDate(os.data_conferencia) || formatDate(new Date())}</small>
      </div>
    </div>
    <div class="footer-section">
      <div class="footer-section-title">Responsável</div>
      <div class="signature-line">
        ${os.responsavel_assinatura || os.responsavel_nome || 'Responsável'}
        <br>
        <small style="color: #999;">Assinatura</small>
      </div>
    </div>
  </div>

  <div class="page-number">Página 1 de ${totalPages}</div>
</body>
</html>`;

    return html;
  } catch (error) {
    console.error('Erro na função gerarHTMLOS:', error);
    throw error;
  }
}

// ========== ROTAS DE APROVAÇÕES ==========
// Criar solicitação de aprovação
app.post('/api/aprovacoes', authenticateToken, (req, res) => {
  const {
    proposta_id, tipo, valor_desconto, valor_total, valor_com_desconto,
    valor_desconto_rs, solicitado_por, status, observacoes
  } = req.body;

  console.log('📥 Dados recebidos para criar aprovação:', {
    proposta_id,
    tipo,
    valor_desconto,
    valor_total,
    valor_com_desconto,
    valor_desconto_rs,
    solicitado_por,
    status,
    observacoes
  });

  if (!proposta_id || !solicitado_por) {
    console.error('❌ Dados obrigatórios faltando:', { proposta_id, solicitado_por });
    return res.status(400).json({ error: 'proposta_id e solicitado_por são obrigatórios' });
  }

  // Buscar usuário que pode aprovar descontos
  db.get(
    'SELECT id, nome FROM usuarios WHERE pode_aprovar_descontos = 1 AND ativo = 1 LIMIT 1',
    [],
    (err, aprovador) => {
      if (err) {
        console.error('Erro ao buscar aprovador:', err);
        return res.status(500).json({ error: err.message });
      }

      if (!aprovador) {
        return res.status(400).json({ error: 'Nenhum usuário configurado para aprovar descontos. Configure um usuário na gestão de usuários.' });
      }

      // Criar aprovação
      db.run(
        `INSERT INTO aprovacoes (
          proposta_id, tipo, valor_desconto, valor_total, valor_com_desconto,
          valor_desconto_rs, solicitado_por, status, observacoes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [proposta_id, tipo || 'desconto', valor_desconto || 0, valor_total || 0, valor_com_desconto || 0,
         valor_desconto_rs || 0, solicitado_por, status || 'pendente', observacoes || ''],
        function(err) {
          if (err) {
            console.error('Erro ao criar aprovação:', err);
            console.error('Dados recebidos:', { proposta_id, tipo, valor_desconto, valor_total, valor_com_desconto, valor_desconto_rs, solicitado_por, status, observacoes });
            return res.status(500).json({ error: err.message });
          }

          const aprovacaoId = this.lastID;

          // Buscar dados da proposta para criar atividade
          db.get(
            `SELECT p.numero_proposta, p.titulo, c.razao_social as cliente_nome
             FROM propostas p
             LEFT JOIN clientes c ON p.cliente_id = c.id
             WHERE p.id = ?`,
            [proposta_id],
            (err, proposta) => {
              if (err) {
                console.error('Erro ao buscar proposta:', err);
                // Não bloquear a criação da aprovação se falhar ao buscar proposta
              } else if (proposta) {
                // Criar atividade para o aprovador
                const tituloAtividade = `Aprovação de Desconto: ${proposta.numero_proposta || proposta.titulo}`;
                const descricaoAtividade = `Solicitação de aprovação de desconto de ${valor_desconto}% na proposta ${proposta.numero_proposta || proposta.titulo}${proposta.cliente_nome ? ` - Cliente: ${proposta.cliente_nome}` : ''}.\n\nValor Total: R$ ${valor_total.toFixed(2)}\nDesconto: R$ ${valor_desconto_rs.toFixed(2)}\nValor com Desconto: R$ ${valor_com_desconto.toFixed(2)}\n\n${observacoes || ''}`;

                db.run(
                  `INSERT INTO atividades (
                    titulo, descricao, tipo, data_agendada, prioridade, status, responsavel_id, created_by
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                  [
                    tituloAtividade,
                    descricaoAtividade,
                    'aprovacao_desconto',
                    new Date().toISOString().split('T')[0],
                    'alta',
                    'pendente',
                    aprovador.id,
                    solicitado_por
                  ],
                  (err) => {
                    if (err) {
                      console.error('Erro ao criar atividade de aprovação:', err);
                      // Não bloquear a criação da aprovação se falhar ao criar atividade
                    } else {
                      console.log(`✅ Atividade de aprovação criada para usuário ${aprovador.nome} (ID: ${aprovador.id})`);
                    }
                  }
                );
              }
            }
          );

          res.json({ id: aprovacaoId, message: 'Solicitação de aprovação criada com sucesso', aprovador_id: aprovador.id });
        }
      );
    }
  );
});

// Listar aprovações
app.get('/api/aprovacoes', authenticateToken, (req, res) => {
  const { status, proposta_id, tipo } = req.query;
  const userId = req.user.id;
  
  let query = `SELECT a.*, 
               p.numero_proposta, p.titulo as proposta_titulo, p.valor_total as proposta_valor_total,
               u1.nome as solicitado_por_nome, u2.nome as aprovado_por_nome,
               c.razao_social as cliente_nome
               FROM aprovacoes a
               LEFT JOIN propostas p ON a.proposta_id = p.id
               LEFT JOIN clientes c ON p.cliente_id = c.id
               LEFT JOIN usuarios u1 ON a.solicitado_por = u1.id
               LEFT JOIN usuarios u2 ON a.aprovado_por = u2.id
               WHERE 1=1`;
  const params = [];

  if (status) {
    query += ' AND a.status = ?';
    params.push(status);
  }

  if (proposta_id) {
    query += ' AND a.proposta_id = ?';
    params.push(proposta_id);
  }

  // Filtro de tipo: enviada ou recebida
  if (tipo === 'enviada') {
    query += ' AND a.solicitado_por = ?';
    params.push(userId);
  } else if (tipo === 'recebida') {
    // Aprovações recebidas são aquelas onde o usuário pode aprovar (pode_aprovar_descontos = 1)
    // e que ainda não foram aprovadas/rejeitadas por ele
    query += ` AND EXISTS (
      SELECT 1 FROM usuarios 
      WHERE id = ? AND pode_aprovar_descontos = 1 AND ativo = 1
    ) AND (a.aprovado_por IS NULL OR a.aprovado_por = ?)`;
    params.push(userId, userId);
  }

  query += ' ORDER BY a.created_at DESC';

  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('Erro ao buscar aprovações:', err);
      return res.status(500).json({ error: err.message });
    }
    
    // Adicionar campo tipo para cada aprovação
    const rowsWithTipo = (rows || []).map(row => ({
      ...row,
      tipo: row.solicitado_por === userId ? 'enviada' : 'recebida'
    }));
    
    res.json(rowsWithTipo);
  });
});

// Obter aprovação por ID
app.get('/api/aprovacoes/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  db.get(
    `SELECT a.*, 
     p.numero_proposta, p.titulo as proposta_titulo, p.valor_total as proposta_valor_total,
     u1.nome as solicitado_por_nome, u2.nome as aprovado_por_nome,
     c.razao_social as cliente_nome
     FROM aprovacoes a
     LEFT JOIN propostas p ON a.proposta_id = p.id
     LEFT JOIN clientes c ON p.cliente_id = c.id
     LEFT JOIN usuarios u1 ON a.solicitado_por = u1.id
     LEFT JOIN usuarios u2 ON a.aprovado_por = u2.id
     WHERE a.id = ?`,
    [id],
    (err, row) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (!row) {
        return res.status(404).json({ error: 'Aprovação não encontrada' });
      }
      res.json(row);
    }
  );
});

// Aprovar ou rejeitar
app.put('/api/aprovacoes/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { status, motivo_rejeicao, aprovado_por } = req.body;

  console.log('📥 PUT /api/aprovacoes/:id - Dados recebidos:', {
    id,
    status,
    motivo_rejeicao: motivo_rejeicao ? motivo_rejeicao.substring(0, 50) + '...' : null,
    aprovado_por,
    userId: req.user.id
  });

  if (!status || !['aprovado', 'rejeitado'].includes(status)) {
    console.error('❌ Status inválido:', status);
    return res.status(400).json({ error: 'Status deve ser "aprovado" ou "rejeitado"' });
  }

  if (status === 'rejeitado' && (!motivo_rejeicao || !motivo_rejeicao.trim())) {
    console.error('❌ Motivo da rejeição não fornecido');
    return res.status(400).json({ error: 'Motivo da rejeição é obrigatório' });
  }

  // Buscar aprovação para atualizar a proposta se aprovada
  db.get('SELECT * FROM aprovacoes WHERE id = ?', [id], (err, aprovacao) => {
    if (err) {
      console.error('❌ Erro ao buscar aprovação:', err);
      return res.status(500).json({ error: err.message });
    }
    if (!aprovacao) {
      console.error('❌ Aprovação não encontrada:', id);
      return res.status(404).json({ error: 'Aprovação não encontrada' });
    }

    console.log('✅ Aprovação encontrada:', aprovacao);

    // Usar o ID do usuário autenticado se aprovado_por não foi fornecido
    const aprovadoPorFinal = aprovado_por || req.user.id;

    // Atualizar aprovação
    const updateQuery = status === 'aprovado'
      ? `UPDATE aprovacoes SET status = ?, aprovado_por = ?, aprovado_em = CURRENT_TIMESTAMP WHERE id = ?`
      : `UPDATE aprovacoes SET status = ?, aprovado_por = ?, motivo_rejeicao = ?, aprovado_em = CURRENT_TIMESTAMP WHERE id = ?`;
    
    const updateParams = status === 'aprovado'
      ? [status, aprovadoPorFinal, id]
      : [status, aprovadoPorFinal, motivo_rejeicao.trim(), id];

    console.log('🔄 Executando update:', { updateQuery, updateParams });

    db.run(updateQuery, updateParams, function(err) {
      if (err) {
        console.error('❌ Erro ao atualizar aprovação:', err);
        return res.status(500).json({ error: err.message });
      }

      console.log('✅ Aprovação atualizada. Linhas afetadas:', this.changes);

      // Se aprovado, atualizar margem_desconto na proposta
      if (status === 'aprovado' && aprovacao.tipo === 'desconto' && aprovacao.proposta_id) {
        db.run(
          'UPDATE propostas SET margem_desconto = ? WHERE id = ?',
          [aprovacao.valor_desconto, aprovacao.proposta_id],
          (err) => {
            if (err) {
              console.error('❌ Erro ao atualizar margem_desconto na proposta:', err);
            } else {
              console.log('✅ Margem de desconto atualizada na proposta:', aprovacao.proposta_id);
            }
          }
        );
      }

      res.json({ 
        message: `Aprovação ${status === 'aprovado' ? 'aprovada' : 'rejeitada'} com sucesso`,
        id: parseInt(id),
        status: status
      });
    });
  });
});

// Deletar aprovação (apenas para admins)
app.delete('/api/aprovacoes/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  console.log('🗑️ DELETE /api/aprovacoes/:id - Tentativa de deletar aprovação:', id);
  console.log('👤 Usuário:', req.user);

  // Verificar se o usuário é admin
  if (req.user.role !== 'admin') {
    console.error('❌ Acesso negado: usuário não é admin');
    return res.status(403).json({ error: 'Apenas administradores podem excluir solicitações de aprovação' });
  }

  // Buscar aprovação para verificar se existe
  db.get('SELECT * FROM aprovacoes WHERE id = ?', [id], (err, aprovacao) => {
    if (err) {
      console.error('❌ Erro ao buscar aprovação:', err);
      return res.status(500).json({ error: err.message });
    }
    
    if (!aprovacao) {
      console.error('❌ Aprovação não encontrada:', id);
      return res.status(404).json({ error: 'Aprovação não encontrada' });
    }

    console.log('✅ Aprovação encontrada:', aprovacao);

    // Deletar aprovação
    db.run('DELETE FROM aprovacoes WHERE id = ?', [id], function(err) {
      if (err) {
        console.error('❌ Erro ao deletar aprovação:', err);
        return res.status(500).json({ error: err.message });
      }

      console.log('✅ Aprovação deletada. Linhas afetadas:', this.changes);
      res.json({ message: 'Solicitação de aprovação excluída com sucesso' });
    });
  });
});

// Servir fotos de famílias
app.use('/api/uploads/familias-produtos', express.static(uploadsFamiliasDir));
app.use('/api/uploads/grupos-produtos', express.static(uploadsGruposDir));
app.use('/api/uploads/grupos-compras', express.static(uploadsGruposComprasDir));
app.use('/api/uploads/fornecedores', express.static(uploadsFornecedoresDir));

// ========== ROTAS DE PRODUTOS ==========
app.get('/api/produtos', authenticateToken, (req, res) => {
  var ativo = req.query.ativo;
  var search = req.query.search;
  var familia = req.query.familia;
  try { if (typeof familia === 'string') familia = decodeURIComponent(familia); } catch (e) {}
  var query = 'SELECT * FROM produtos WHERE 1=1';
  var params = [];

  if (ativo !== undefined) {
    query += ' AND ativo = ?';
    params.push(ativo === 'true' || ativo === '1' ? 1 : 0);
  }

  var familiaTrim = (familia != null && String(familia).trim() !== '') ? String(familia).trim() : '';

  if (search) {
    query += ' AND (nome LIKE ? OR codigo LIKE ? OR descricao LIKE ? OR modelo LIKE ?)';
    var searchTerm = '%' + search + '%';
    params.push(searchTerm, searchTerm, searchTerm, searchTerm);
  }

  query += ' ORDER BY nome';

  function runSelect() {
    db.all(query, params, function(err, rows) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      var list = rows || [];
      if (familiaTrim) {
        var familiaNorm = normalizarFamiliaComparacao(familiaTrim);
        list = list.filter(function(r) {
          return normalizarFamiliaComparacao(r.familia || '') === familiaNorm;
        });
      }
      for (var i = 0; i < list.length; i++) {
        var r = list[i];
        if (!Object.prototype.hasOwnProperty.call(r, 'classificacao_area') || r.classificacao_area == null || r.classificacao_area === '') {
          try {
            var spec = r.especificacoes_tecnicas ? JSON.parse(r.especificacoes_tecnicas) : {};
            r.classificacao_area = spec.classificacao_area || null;
          } catch (e) {
            r.classificacao_area = null;
          }
        }
        if (r.nome && typeof r.nome === 'string' && r.nome !== r.nome.toUpperCase()) {
          r.nome = r.nome.toUpperCase();
        }
      }
      res.json(list);
    });
  }

  db.run('ALTER TABLE produtos ADD COLUMN classificacao_area TEXT', function(alterErr) {
    runSelect();
  });
});

app.get('/api/produtos/proximo-codigo', authenticateToken, (req, res) => {
  // Decodificar parâmetros da URL para lidar com caracteres especiais como "/"
  const nome = req.query.nome ? decodeURIComponent(String(req.query.nome)) : '';
  const familia = req.query.familia ? decodeURIComponent(String(req.query.familia)) : '';
  const diametro = req.query.diametro ? decodeURIComponent(String(req.query.diametro)) : '';
  const material_contato = req.query.material_contato ? decodeURIComponent(String(req.query.material_contato)) : '';
  const acabamento = req.query.acabamento ? decodeURIComponent(String(req.query.acabamento)) : '';
  const espessura = req.query.espessura ? decodeURIComponent(String(req.query.espessura)) : '';
  
  // Contar total de produtos cadastrados
  db.get('SELECT COUNT(*) as total FROM produtos', [], (err, result) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    const quantidadeProdutos = (result?.total || 0) + 1;
    
    // Se for Hélices e Acessórios, usar formato especial
    if (familia === 'Hélices e Acessórios') {
      // Formato: NOME+SOBRENOME-DIAMETROCOMOTEXTOCONMM-ESPESSURA-MATERIAL
      
      // Nome + sobrenome (primeiras letras)
      let iniciaisNome = '';
      if (nome && nome.trim()) {
        const palavras = nome.trim().split(/\s+/).filter(p => p.length > 0);
        if (palavras.length >= 2) {
          // Se tiver pelo menos 2 palavras, pegar primeira letra de cada
          const primeiraLetra = palavras[0].charAt(0).toUpperCase();
          const segundaLetra = palavras[1].charAt(0).toUpperCase();
          iniciaisNome = `${primeiraLetra}${segundaLetra}`;
        } else if (palavras.length === 1) {
          // Se tiver apenas uma palavra, pegar primeira e segunda letra
          const palavra = palavras[0];
          const primeiraLetra = palavra.charAt(0).toUpperCase();
          const segundaLetra = palavra.length > 1 ? palavra.charAt(1).toUpperCase() : 'X';
          iniciaisNome = `${primeiraLetra}${segundaLetra}`;
        } else {
          iniciaisNome = 'XX';
        }
      } else {
        iniciaisNome = 'XX';
      }
      
      // Diâmetro com "mm" também (como texto)
      let diametroCodigo = '';
      if (diametro && diametro.trim()) {
        // Manter o formato com "mm" se já tiver, senão adicionar
        diametroCodigo = diametro.trim().toUpperCase();
        if (!diametroCodigo.endsWith('MM')) {
          // Se não terminar com MM, adicionar
          const apenasNumeros = diametroCodigo.replace(/[^0-9]/g, '');
          diametroCodigo = apenasNumeros ? `${apenasNumeros}MM` : '0MM';
        }
      } else {
        diametroCodigo = '0MM';
      }
      
      // Espessura - tratar corretamente valores como "1/8" ou "3/16"
      let espessuraCodigo = '';
      if (espessura && String(espessura).trim()) {
        // Manter o formato original da espessura (ex: 1/8, 3/16)
        // O decodeURIComponent já foi aplicado acima, então "/" deve estar correto
        espessuraCodigo = String(espessura).trim().toUpperCase();
        // Se estiver vazio após trim, usar '0'
        if (!espessuraCodigo || espessuraCodigo === '') {
          espessuraCodigo = '0';
        }
      } else {
        espessuraCodigo = '0';
      }
      
      // Material de contato (pegar as primeiras letras, remover espaços)
      let materialCodigo = '';
      if (material_contato && material_contato.trim()) {
        const materialLimpo = material_contato.trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        materialCodigo = materialLimpo.substring(0, 10); // Máximo 10 caracteres
        if (!materialCodigo) materialCodigo = 'XXX';
      } else {
        materialCodigo = 'XXX';
      }
      
      const proximoCodigo = `${iniciaisNome}-${diametroCodigo}-${espessuraCodigo}-${materialCodigo}`;
      
      return res.json({ codigo: proximoCodigo });
    }
    
    // Formato padrão para outros produtos
    // Pegar as 3 primeiras letras do nome (em maiúsculas, removendo espaços e caracteres especiais)
    let iniciaisNome = '';
    if (nome && nome.trim()) {
      // Remover espaços e caracteres especiais, pegar 3 primeiras letras
      const nomeLimpo = nome.trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      iniciaisNome = nomeLimpo.substring(0, 3).padEnd(3, 'X'); // Se tiver menos de 3 letras, preencher com X
    } else {
      iniciaisNome = 'XXX';
    }
    
    // Pegar as 5 primeiras letras da família (em maiúsculas)
    let iniciaisFamilia = '';
    if (familia && familia.trim()) {
      const familiaLimpa = familia.trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      iniciaisFamilia = familiaLimpa.substring(0, 5).padEnd(5, 'X'); // Se tiver menos de 5 letras, preencher com X
    } else {
      // Se não tiver família, usar "GENXX" (genérico)
      iniciaisFamilia = 'GENXX';
    }
    
    // Gerar código no formato: PROD-NUMERO-3PRIMEIRASLETRASDONOMEDOPRODUTO-5LETRASINICIALDAFAMILIASELECIONADA
    const proximoCodigo = `PROD-${quantidadeProdutos}-${iniciaisNome}-${iniciaisFamilia}`;
    
    res.json({ codigo: proximoCodigo });
  });
});

// Rota para buscar ICMS e IPI pelo NCM
app.get('/api/ncm/:codigo', authenticateToken, (req, res) => {
  const { codigo } = req.params;
  
  // Validar formato do NCM (8 dígitos)
  if (!codigo || !/^\d{8}$/.test(codigo)) {
    return res.status(400).json({ error: 'NCM inválido. Deve conter 8 dígitos numéricos.' });
  }
  
  // Tentar buscar da API externa (ReceitaWS ou similar)
  // Por enquanto, vamos usar uma lógica baseada em regras comuns
  // Você pode integrar com uma API externa depois
  
  // Extrair os primeiros 4 dígitos para determinar a categoria
  const categoria = codigo.substring(0, 4);
  
  // Valores padrão baseados em categorias comuns
  let icms = 18; // ICMS padrão para maioria dos produtos
  let ipi = 0;   // IPI padrão
  
  // Regras específicas por categoria (exemplos)
  if (categoria >= '8401' && categoria <= '8414') {
    // Máquinas e aparelhos mecânicos
    icms = 18;
    ipi = 5;
  } else if (categoria >= '8415' && categoria <= '8418') {
    // Máquinas e aparelhos para ar condicionado
    icms = 18;
    ipi = 15;
  } else if (categoria >= '8419' && categoria <= '8420') {
    // Outras máquinas e aparelhos
    icms = 18;
    ipi = 10;
  } else if (categoria >= '8421' && categoria <= '8431') {
    // Máquinas e aparelhos para preparação de matérias
    icms = 18;
    ipi = 5;
  } else if (categoria >= '8432' && categoria <= '8438') {
    // Máquinas agrícolas
    icms = 12;
    ipi = 0;
  } else if (categoria >= '8439' && categoria <= '8443') {
    // Máquinas para fabricação de papel
    icms = 18;
    ipi = 5;
  } else if (categoria >= '8444' && categoria <= '8445') {
    // Máquinas para preparação de matérias têxteis
    icms = 18;
    ipi = 5;
  } else if (categoria >= '8446' && categoria <= '8447') {
    // Máquinas para trabalhar borracha ou plástico
    icms = 18;
    ipi = 5;
  } else if (categoria >= '8448' && categoria <= '8449') {
    // Máquinas para trabalhar madeira
    icms = 18;
    ipi = 5;
  } else if (categoria >= '8450' && categoria <= '8452') {
    // Máquinas para trabalhar metais
    icms = 18;
    ipi = 5;
  } else if (categoria >= '8453' && categoria <= '8454') {
    // Máquinas-ferramentas
    icms = 18;
    ipi = 5;
  } else if (categoria >= '8455' && categoria <= '8456') {
    // Máquinas para trabalhar metais
    icms = 18;
    ipi = 5;
  } else if (categoria >= '8457' && categoria <= '8460') {
    // Máquinas-ferramentas
    icms = 18;
    ipi = 5;
  } else if (categoria >= '8461' && categoria <= '8462') {
    // Máquinas-ferramentas
    icms = 18;
    ipi = 5;
  } else if (categoria >= '8463' && categoria <= '8464') {
    // Máquinas-ferramentas
    icms = 18;
    ipi = 5;
  } else if (categoria >= '8465' && categoria <= '8466') {
    // Máquinas-ferramentas
    icms = 18;
    ipi = 5;
  } else if (categoria >= '8467' && categoria <= '8468') {
    // Máquinas-ferramentas
    icms = 18;
    ipi = 5;
  } else if (categoria >= '8469' && categoria <= '8470') {
    // Máquinas de escrever e processamento de dados
    icms = 18;
    ipi = 15;
  } else if (categoria >= '8471' && categoria <= '8472') {
    // Máquinas automáticas para processamento de dados
    icms = 18;
    ipi = 15;
  } else if (categoria >= '8473' && categoria <= '8474') {
    // Partes e acessórios
    icms = 18;
    ipi = 5;
  } else if (categoria >= '8475' && categoria <= '8476') {
    // Máquinas e aparelhos
    icms = 18;
    ipi = 5;
  } else if (categoria >= '8477' && categoria <= '8478') {
    // Máquinas e aparelhos
    icms = 18;
    ipi = 5;
  } else if (categoria >= '8479' && categoria <= '8480') {
    // Máquinas e aparelhos
    icms = 18;
    ipi = 5;
  } else if (categoria >= '8481' && categoria <= '8482') {
    // Válvulas e partes
    icms = 18;
    ipi = 5;
  } else if (categoria >= '8483' && categoria <= '8484') {
    // Transmissões
    icms = 18;
    ipi = 5;
  } else if (categoria >= '8485' && categoria <= '8486') {
    // Máquinas e aparelhos
    icms = 18;
    ipi = 5;
  } else if (categoria >= '8487' && categoria <= '8488') {
    // Máquinas e aparelhos
    icms = 18;
    ipi = 5;
  }
  
  // Retornar os valores encontrados
  res.json({ 
    ncm: codigo,
    icms: icms,
    ipi: ipi
  });
});

app.get('/api/produtos/:id', authenticateToken, (req, res) => {
  var id = req.params.id;
  function fetchRow() {
    db.get('SELECT * FROM produtos WHERE id = ?', [id], function(err, row) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (!row) {
        return res.status(404).json({ error: 'Produto não encontrado' });
      }
      if (!Object.prototype.hasOwnProperty.call(row, 'classificacao_area') || row.classificacao_area == null || row.classificacao_area === '') {
        try {
          var spec = row.especificacoes_tecnicas ? JSON.parse(row.especificacoes_tecnicas) : {};
          row.classificacao_area = spec.classificacao_area || null;
        } catch (e) {
          row.classificacao_area = null;
        }
      }
      if (row.nome && typeof row.nome === 'string' && row.nome !== row.nome.toUpperCase()) {
        row.nome = row.nome.toUpperCase();
      }
      res.json(row);
    });
  }
  db.run('ALTER TABLE produtos ADD COLUMN classificacao_area TEXT', function(alterErr) {
    fetchRow();
  });
});

// Buscar produto por código
app.get('/api/produtos/codigo/:codigo', authenticateToken, (req, res) => {
  const { codigo } = req.params;
  db.get('SELECT * FROM produtos WHERE codigo = ?', [codigo], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }
    res.json(row);
  });
});

app.post('/api/produtos', authenticateToken, (req, res) => {
  var body = req.body || {};
  var codigo = body.codigo;
  var nome = body.nome;
  if (!codigo || !nome) {
    return res.status(400).json({ error: 'Código e nome são obrigatórios' });
  }
  var classificacao_area = (body.classificacao_area != null && String(body.classificacao_area).trim() !== '') ? toUpper(String(body.classificacao_area).trim()) : null;
  var familiaVal = (body.familia != null && String(body.familia).trim() !== '') ? toUpper(String(body.familia).trim()) : '';
  var insertValues = [
    codigo,
    toUpper(nome),
    toUpper(body.descricao) || '',
    familiaVal,
    body.modelo ? toUpper(body.modelo) : null,
    parseFloat(body.preco_base) || 0,
    parseFloat(body.icms) || 0,
    parseFloat(body.ipi) || 0,
    body.ncm || '',
    body.especificacoes_tecnicas || '',
    body.imagem || null,
    body.ativo !== undefined ? body.ativo : 1,
    classificacao_area
  ];
  function doInsert() {
    db.run(
      `INSERT INTO produtos (codigo, nome, descricao, familia, modelo, preco_base, icms, ipi, ncm, especificacoes_tecnicas, imagem, ativo, classificacao_area)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      insertValues,
      function(err) {
        if (err) {
          if (err.message.indexOf('classificacao_area') !== -1) {
            db.run('ALTER TABLE produtos ADD COLUMN classificacao_area TEXT', function(alterErr) {
              if (!alterErr || alterErr.message.indexOf('duplicate') !== -1) {
                doInsert();
              } else {
                return res.status(500).json({ error: alterErr.message });
              }
            });
            return;
          }
          if (err.message.includes('UNIQUE constraint')) {
            return res.status(400).json({ error: 'Código do produto já cadastrado' });
          }
          return res.status(500).json({ error: err.message });
        }
        res.json({ id: this.lastID, codigo: codigo, nome: toUpper(nome), classificacao_area: classificacao_area, message: 'Produto criado' });
      }
    );
  }
  doInsert();
});

app.put('/api/produtos/:id', authenticateToken, (req, res) => {
  var id = req.params.id;
  var body = req.body || {};
  db.get('SELECT * FROM produtos WHERE id = ?', [id], function(err, row) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }
    var codigo = body.codigo !== undefined ? body.codigo : row.codigo;
    var nome = body.nome !== undefined ? body.nome : row.nome;
    var descricao = body.descricao !== undefined ? body.descricao : row.descricao;
    var familia = body.familia !== undefined ? String(body.familia).trim() : (row.familia || '');
    var modelo = body.modelo !== undefined ? body.modelo : row.modelo;
    var especificacoes_tecnicas = body.especificacoes_tecnicas !== undefined ? body.especificacoes_tecnicas : row.especificacoes_tecnicas;
    var imagem = body.imagem !== undefined ? body.imagem : row.imagem;
    var ativo = body.ativo !== undefined ? body.ativo : row.ativo;
    var classificacao_area = (body.classificacao_area != null && String(body.classificacao_area).trim() !== '') ? toUpper(String(body.classificacao_area).trim()) : (row.classificacao_area || null);
    var preco_base = body.preco_base !== undefined ? parseFloat(body.preco_base) : row.preco_base;
    var icms = body.icms !== undefined ? parseFloat(body.icms) : row.icms;
    var ipi = body.ipi !== undefined ? parseFloat(body.ipi) : row.ipi;
    var ncm = body.ncm !== undefined ? body.ncm : row.ncm;

    function doUpdate() {
      db.run(
        `UPDATE produtos SET codigo = ?, nome = ?, descricao = ?, familia = ?, modelo = ?, preco_base = ?,
          icms = ?, ipi = ?, ncm = ?, especificacoes_tecnicas = ?, imagem = ?, ativo = ?, classificacao_area = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          codigo,
          toUpper(nome),
          toUpper(descricao) || '',
          (familia && String(familia).trim() !== '') ? toUpper(String(familia).trim()) : '',
          modelo ? toUpper(modelo) : null,
          preco_base || 0,
          icms || 0,
          ipi || 0,
          ncm || '',
          especificacoes_tecnicas || '',
          imagem || null,
          ativo,
          classificacao_area,
          id
        ],
        function(updateErr) {
          if (updateErr) {
            if (updateErr.message.indexOf('classificacao_area') !== -1) {
              db.run('ALTER TABLE produtos ADD COLUMN classificacao_area TEXT', function(alterErr) {
                if (!alterErr || alterErr.message.indexOf('duplicate') !== -1) {
                  doUpdate();
                } else {
                  return res.status(500).json({ error: alterErr.message });
                }
              });
              return;
            }
            return res.status(500).json({ error: updateErr.message });
          }
          res.json({ message: 'Produto atualizado com sucesso', nome: toUpper(nome), classificacao_area: classificacao_area });
        }
      );
    }
    doUpdate();
  });
});

app.delete('/api/produtos/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  db.run('UPDATE produtos SET ativo = 0 WHERE id = ?', [id], (err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ message: 'Produto desativado com sucesso' });
  });
});

// Zerar especificações de produtos do modelo antigo (formulário longo sem vista frontal)
// POST body opcional: { ids?: number[] } — se ids informado, zera só esses; senão, zera todos que têm só chaves do formulário antigo
var OLD_SPEC_KEYS = new Set([
  'material_contato', 'motor_central_cv', 'motoredutor_central_cv', 'motores_laterais_cv',
  'ccm_incluso', 'ccm_tensao', 'celula_carga', 'plc_ihm', 'valvula_saida_tanque',
  'classificacao_area', 'densidade', 'viscosidade', 'espessura', 'acabamento', 'diametro',
  'funcao', 'tratamento_termico', 'tratamento_termico_especifico', 'velocidade_trabalho', 'velocidade_trabalho_especifica', 'furacao'
]);
function soTemChavesAntigas(spec) {
  if (!spec || typeof spec !== 'object') return true;
  var keys = Object.keys(spec);
  if (keys.length === 0) return false;
  for (var i = 0; i < keys.length; i++) {
    if (!OLD_SPEC_KEYS.has(keys[i])) return false;
  }
  return true;
}
app.post('/api/produtos/zerar-modelo-antigo', authenticateToken, (req, res) => {
  var body = req.body || {};
  var ids = Array.isArray(body.ids) ? body.ids : null;

  if (ids && ids.length > 0) {
    var placeholders = ids.map(function() { return '?'; }).join(',');
    db.run('UPDATE produtos SET especificacoes_tecnicas = ? WHERE id IN (' + placeholders + ')', ['{}'].concat(ids), function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Especificações zeradas para ' + ids.length + ' produto(s) informado(s).', count: ids.length });
    });
    return;
  }

  db.all('SELECT id, especificacoes_tecnicas FROM produtos WHERE ativo = 1', [], function(err, rows) {
    if (err) return res.status(500).json({ error: err.message });
    var toZero = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var spec = {};
      try {
        if (r.especificacoes_tecnicas) spec = JSON.parse(r.especificacoes_tecnicas);
      } catch (e) { continue; }
      if (soTemChavesAntigas(spec)) toZero.push(r.id);
    }
    if (toZero.length === 0) {
      return res.json({ message: 'Nenhum produto do modelo antigo encontrado.', count: 0 });
    }
    var placeholders = toZero.map(function() { return '?'; }).join(',');
    db.run('UPDATE produtos SET especificacoes_tecnicas = ? WHERE id IN (' + placeholders + ')', ['{}'].concat(toZero), function(updateErr) {
      if (updateErr) return res.status(500).json({ error: updateErr.message });
      res.json({ message: 'Especificações zeradas para ' + toZero.length + ' produto(s) do modelo antigo.', count: toZero.length, ids: toZero });
    });
  });
});

// ========== ROTAS DE OPORTUNIDADES ==========
app.get('/api/oportunidades', authenticateToken, (req, res) => {
  const { cliente_id, status, responsavel_id } = req.query;
  let query = `SELECT o.*, c.razao_social as cliente_nome, u.nome as responsavel_nome
               FROM oportunidades o
               LEFT JOIN clientes c ON o.cliente_id = c.id
               LEFT JOIN usuarios u ON o.responsavel_id = u.id
               WHERE 1=1`;
  const params = [];

  if (cliente_id) {
    query += ' AND o.cliente_id = ?';
    params.push(cliente_id);
  }

  if (status) {
    query += ' AND o.status = ?';
    params.push(status);
  }

  if (responsavel_id) {
    query += ' AND o.responsavel_id = ?';
    params.push(responsavel_id);
  }

  query += ' ORDER BY o.created_at DESC';

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows || []);
  });
});

app.post('/api/oportunidades', authenticateToken, (req, res) => {
  normalizarMaiusculas(req.body, ['titulo', 'descricao', 'etapa']);
  const { cliente_id, projeto_id, titulo, descricao, valor_estimado, probabilidade, etapa, status, responsavel_id } = req.body;

  if (!titulo) {
    return res.status(400).json({ error: 'Título é obrigatório' });
  }

  db.run(
    'INSERT INTO oportunidades (cliente_id, projeto_id, titulo, descricao, valor_estimado, probabilidade, etapa, status, responsavel_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [cliente_id, projeto_id, titulo, descricao, valor_estimado || 0, probabilidade || 50, etapa || 'prospeccao', status || 'ativa', responsavel_id, req.user.id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ id: this.lastID, ...req.body });
    }
  );
});

app.put('/api/oportunidades/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  normalizarMaiusculas(req.body, ['titulo', 'descricao', 'etapa']);
  const { cliente_id, projeto_id, titulo, descricao, valor_estimado, probabilidade, etapa, status, responsavel_id } = req.body;

  db.run(
    'UPDATE oportunidades SET cliente_id = ?, projeto_id = ?, titulo = ?, descricao = ?, valor_estimado = ?, probabilidade = ?, etapa = ?, status = ?, responsavel_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [cliente_id, projeto_id, titulo, descricao, valor_estimado, probabilidade, etapa, status, responsavel_id, id],
    (err) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ message: 'Oportunidade atualizada com sucesso' });
    }
  );
});

app.delete('/api/oportunidades/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM oportunidades WHERE id = ?', [id], (err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ message: 'Oportunidade excluída com sucesso' });
  });
});

// ========== ROTAS DE ATIVIDADES ==========
app.get('/api/atividades', authenticateToken, (req, res) => {
  const { cliente_id, status, responsavel_id, todos } = req.query;
  const userId = req.user.id;
  
  // Buscar atividades normais
  let query = `SELECT a.*, c.razao_social as cliente_nome, u.nome as responsavel_nome, 'atividade' as origem
               FROM atividades a
               LEFT JOIN clientes c ON a.cliente_id = c.id
               LEFT JOIN usuarios u ON a.responsavel_id = u.id
               WHERE 1=1`;
  const params = [];

  if (cliente_id) {
    query += ' AND a.cliente_id = ?';
    params.push(cliente_id);
  }

  if (status) {
    query += ' AND a.status = ?';
    params.push(status);
  }

  if (responsavel_id) {
    query += ' AND a.responsavel_id = ?';
    params.push(responsavel_id);
  } else if (!todos) {
    // Se não há filtro de responsável e não foi solicitado "todos", mostrar apenas atividades do usuário logado
    query += ' AND a.responsavel_id = ?';
    params.push(userId);
  }
  // Se "todos" for true, não adiciona filtro de responsável

  query += ' ORDER BY a.data_agendada DESC, a.created_at DESC';

  db.all(query, params, (err, atividadesRows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    // Buscar lembretes de propostas
    let lembreteQuery = `
      SELECT 
        pr.id,
        pr.numero_proposta,
        pr.titulo,
        pr.descricao,
        pr.status,
        pr.lembrete_data as data_agendada,
        pr.lembrete_mensagem as descricao_lembrete,
        c.razao_social as cliente_nome,
        u.nome as responsavel_nome,
        pr.responsavel_id,
        pr.created_by,
        pr.created_at,
        pr.updated_at,
        'lembrete' as tipo,
        'lembrete' as origem,
        CASE
          WHEN DATE(pr.lembrete_data) < DATE('now') THEN 'alta'
          WHEN DATE(pr.lembrete_data) = DATE('now') THEN 'alta'
          ELSE 'media'
        END as prioridade,
        CASE
          WHEN DATE(pr.lembrete_data) < DATE('now') THEN 'pendente'
          WHEN DATE(pr.lembrete_data) = DATE('now') THEN 'pendente'
          ELSE 'pendente'
        END as status_lembrete
      FROM propostas pr
      LEFT JOIN clientes c ON pr.cliente_id = c.id
      LEFT JOIN usuarios u ON pr.responsavel_id = u.id
      WHERE pr.lembrete_data IS NOT NULL
    `;

    // Se "todos" foi solicitado, buscar lembretes de todos os usuários
    // Caso contrário, se há responsavel_id, filtrar por ele, senão filtrar pelo usuário logado
    let lembreteParams = [];
    if (todos) {
      // Buscar todos os lembretes (sem filtro de usuário) - não adiciona nada à query
    } else if (responsavel_id) {
      lembreteQuery += ' AND (pr.responsavel_id = ? OR pr.created_by = ?)';
      lembreteParams = [responsavel_id, responsavel_id];
    } else {
      lembreteQuery += ' AND (pr.responsavel_id = ? OR pr.created_by = ?)';
      lembreteParams = [userId, userId];
    }

    db.all(lembreteQuery, lembreteParams, (err, lembretesRows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      // Transformar lembretes no formato de atividades
      const lembretesFormatados = (lembretesRows || []).map(lembrete => ({
        id: `lembrete_${lembrete.id}`,
        cliente_id: null,
        projeto_id: null,
        titulo: `Lembrete: ${lembrete.numero_proposta} - ${lembrete.titulo}`,
        descricao: lembrete.descricao_lembrete || `Lembrete para proposta ${lembrete.numero_proposta}`,
        tipo: 'lembrete',
        data_agendada: lembrete.data_agendada,
        prioridade: lembrete.prioridade,
        status: lembrete.status_lembrete,
        responsavel_id: lembrete.responsavel_id,
        created_by: lembrete.created_by,
        created_at: lembrete.created_at,
        updated_at: lembrete.updated_at,
        cliente_nome: lembrete.cliente_nome,
        responsavel_nome: lembrete.responsavel_nome,
        origem: 'lembrete',
        proposta_id: lembrete.id,
        numero_proposta: lembrete.numero_proposta
      }));

      // Combinar atividades e lembretes, ordenar por data
      const todasAtividades = [...(atividadesRows || []), ...lembretesFormatados];
      
      // Ordenar por data_agendada (mais próximas primeiro)
      todasAtividades.sort((a, b) => {
        if (!a.data_agendada && !b.data_agendada) return 0;
        if (!a.data_agendada) return 1;
        if (!b.data_agendada) return -1;
        return new Date(a.data_agendada) - new Date(b.data_agendada);
      });

      res.json(todasAtividades);
    });
  });
});

app.post('/api/atividades', authenticateToken, (req, res) => {
  normalizarMaiusculas(req.body, ['titulo', 'descricao', 'tipo', 'prioridade']);
  const { cliente_id, projeto_id, titulo, descricao, tipo, data_agendada, prioridade, status, responsavel_id } = req.body;

  if (!titulo) {
    return res.status(400).json({ error: 'Título é obrigatório' });
  }

  // Converter strings vazias para null nos campos opcionais INTEGER
  const clienteIdValue = (cliente_id && cliente_id !== '') ? parseInt(cliente_id) : null;
  const projetoIdValue = (projeto_id && projeto_id !== '') ? parseInt(projeto_id) : null;
  const responsavelIdValue = (responsavel_id && responsavel_id !== '') ? parseInt(responsavel_id) : null;

  db.run(
    'INSERT INTO atividades (cliente_id, projeto_id, titulo, descricao, tipo, data_agendada, prioridade, status, responsavel_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [clienteIdValue, projetoIdValue, titulo, descricao || null, tipo || 'reuniao', data_agendada || null, prioridade || 'media', status || 'pendente', responsavelIdValue, req.user.id],
    function(err) {
      if (err) {
        console.error('Erro ao criar atividade:', err);
        return res.status(500).json({ error: err.message });
      }
      res.json({ id: this.lastID, ...req.body });
    }
  );
});

app.put('/api/atividades/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  normalizarMaiusculas(req.body, ['titulo', 'descricao', 'tipo', 'prioridade']);
  const { cliente_id, projeto_id, titulo, descricao, tipo, data_agendada, prioridade, status, responsavel_id } = req.body;

  // Converter strings vazias para null nos campos opcionais INTEGER
  const clienteIdValue = (cliente_id && cliente_id !== '') ? parseInt(cliente_id) : null;
  const projetoIdValue = (projeto_id && projeto_id !== '') ? parseInt(projeto_id) : null;
  const responsavelIdValue = (responsavel_id && responsavel_id !== '') ? parseInt(responsavel_id) : null;

  db.run(
    'UPDATE atividades SET cliente_id = ?, projeto_id = ?, titulo = ?, descricao = ?, tipo = ?, data_agendada = ?, prioridade = ?, status = ?, responsavel_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [clienteIdValue, projetoIdValue, titulo, descricao || null, tipo, data_agendada || null, prioridade, status, responsavelIdValue, id],
    (err) => {
      if (err) {
        console.error('Erro ao atualizar atividade:', err);
        return res.status(500).json({ error: err.message });
      }
      res.json({ message: 'Atividade atualizada com sucesso' });
    }
  );
});

app.delete('/api/atividades/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM atividades WHERE id = ?', [id], (err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ message: 'Atividade excluída com sucesso' });
  });
});

// ========== ROTAS DE CUSTOS DE VIAGENS ==========
// Rota para obter coordenadas exatas de um cliente
app.get('/api/custos-viagens/coordenadas-cliente/:cliente_id', authenticateToken, async (req, res) => {
  const { cliente_id } = req.params;
  
  db.get('SELECT endereco, cidade, estado FROM clientes WHERE id = ?', [cliente_id], async (err, cliente) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    if (!cliente) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }
    
    // Tentar obter coordenadas exatas
    const coords = await obterCoordenadasExatas(cliente.endereco, cliente.cidade, cliente.estado);
    
    if (coords) {
      res.json({ coordenadas: coords, lat: coords[0], lon: coords[1] });
    } else {
      res.status(500).json({ error: 'Não foi possível obter coordenadas' });
    }
  });
});

// Buscar clientes próximos a um cliente específico
app.get('/api/custos-viagens/clientes-proximos/:cliente_id', authenticateToken, (req, res) => {
  const { cliente_id } = req.params;
  const { raio_km = 100 } = req.query; // Raio padrão de 100km
  
  // Buscar dados do cliente principal
  db.get('SELECT cidade, estado, endereco FROM clientes WHERE id = ?', [cliente_id], (err, clientePrincipal) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    if (!clientePrincipal || !clientePrincipal.cidade || !clientePrincipal.estado) {
      return res.json([]);
    }
    
    // Usar coordenadas de cidade (INSTANTÂNEO - sem API externa)
    const coordsPrincipal = obterCoordenadasCidade(clientePrincipal.cidade, clientePrincipal.estado);
    
    if (!coordsPrincipal || coordsPrincipal.length !== 2) {
      return res.json([]);
    }
    
    // Buscar todos os clientes ativos (exceto o principal)
    db.all('SELECT id, razao_social, nome_fantasia, cidade, estado, endereco, status FROM clientes WHERE status = ? AND id != ?', ['ativo', cliente_id], (err, todosClientes) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      const raioKm = parseFloat(raio_km);
      const resultados = [];
      
      // Processar todos os clientes usando apenas coordenadas de cidade (INSTANTÂNEO)
      todosClientes.forEach(cliente => {
        if (!cliente.cidade || !cliente.estado) return;
        
        // Obter coordenadas de cidade (instantâneo, sem API)
        const coordsCliente = obterCoordenadasCidade(cliente.cidade, cliente.estado);
        if (!coordsCliente || coordsCliente.length !== 2) return;
        
        // Calcular distância entre cidades
        let distancia = calcularDistancia(
          coordsPrincipal[0], coordsPrincipal[1],
          coordsCliente[0], coordsCliente[1]
        );
        
        // Se ambos estão na mesma cidade, aplicar distância mínima baseada em heurística
        if (distancia < 1 && 
            clientePrincipal.cidade.toLowerCase().trim() === cliente.cidade.toLowerCase().trim() &&
            clientePrincipal.estado === cliente.estado) {
          // Se ambos têm endereços diferentes, estimar distância mínima de 5km
          // Se não têm endereços ou são iguais, usar 2km como mínimo
          if (cliente.endereco && clientePrincipal.endereco && 
              cliente.endereco.toLowerCase().trim() !== clientePrincipal.endereco.toLowerCase().trim()) {
            distancia = 5; // Estimativa conservadora para endereços diferentes na mesma cidade
          } else {
            distancia = 2; // Distância mínima para mesma cidade
          }
        }
        
        // Se está dentro do raio, adicionar aos resultados
        if (distancia <= raioKm) {
          resultados.push({
            ...cliente,
            distancia_km: Math.round(distancia * 10) / 10, // Arredondar para 1 casa decimal
            coordenadas: coordsCliente,
            lat: coordsCliente[0],
            lon: coordsCliente[1]
          });
        }
      });
      
      // Ordenar por distância e limitar a 10 clientes mais próximos
      const clientesProximos = resultados
        .sort((a, b) => a.distancia_km - b.distancia_km)
        .slice(0, 10);
      
      res.json(clientesProximos);
    });
  });
});

// Calcular rota e distância entre origem e destino
app.get('/api/custos-viagens/calcular-rota', authenticateToken, (req, res) => {
  const { origem_cidade, origem_estado, destino_cidade, destino_estado, tipo_viagem, numero_pessoas, data_viagem, data_volta } = req.query;
  
  if (!destino_cidade || !destino_estado) {
    return res.status(400).json({ error: 'Destino é obrigatório' });
  }
  
  // Coordenadas padrão da empresa (Av. Angelo Demarchi 130, Batistini, São Bernardo do Campo - SP)
  // Coordenadas exatas do endereço: -23.7150, -46.5550 (Batistini, SBC)
  const origemCoords = origem_cidade && origem_estado 
    ? obterCoordenadasCidade(origem_cidade, origem_estado)
    : [-23.7150, -46.5550]; // Av. Angelo Demarchi 130, Batistini, SBC (coordenadas exatas)
  
  // A função obterCoordenadasCidade sempre retorna coordenadas (tem fallback para estado ou centro do Brasil)
  let destinoCoords = obterCoordenadasCidade(destino_cidade, destino_estado);
  
  // Validar que retornou coordenadas válidas (sempre deve retornar, mas vamos garantir)
  if (!destinoCoords || !Array.isArray(destinoCoords) || destinoCoords.length !== 2 || 
      isNaN(destinoCoords[0]) || isNaN(destinoCoords[1])) {
    // Se por algum motivo não retornou coordenadas válidas, usar coordenadas do estado
    const estadoCoords = obterCoordenadasCidade('', destino_estado);
    if (estadoCoords && Array.isArray(estadoCoords) && estadoCoords.length === 2) {
      destinoCoords = estadoCoords;
    } else {
      // Último fallback: centro do Brasil
      destinoCoords = [-14.2350, -51.9253];
    }
  }
  
  // Calcular distância
  let distancia = calcularDistancia(origemCoords[0], origemCoords[1], destinoCoords[0], destinoCoords[1]);
  
  // Se a distância for muito pequena (< 5km), considerar distância mínima de 10km
  // Isso garante que sempre haverá custos básicos (combustível, alimentação)
  if (distancia < 5) {
    distancia = 10; // Distância mínima para garantir custos básicos
  }
  
  // Verificar se requer passagem aérea (distância > 600km)
  const requerPassagemAerea = distancia > 600;
  
  // Calcular tempo estimado com base em dados reais
  let tempoEstimado;
  if (requerPassagemAerea) {
    // Tempo de voo realista: 
    // - Tempo de check-in e segurança: 1h30min
    // - Tempo de voo: ~800 km/h de velocidade média (considerando decolagem, pouso, etc)
    // - Tempo de deslocamento aeroporto: 30min
    const tempoVoo = distancia / 800; // horas
    tempoEstimado = 1.5 + tempoVoo + 0.5; // check-in + voo + deslocamento
  } else {
    // Tempo de carro: média realista considerando trânsito e paradas
    // Rodovias: 90-100 km/h média
    // Estradas secundárias: 60-70 km/h média
    // Considerando mix: 75 km/h média realista
    tempoEstimado = distancia / 75;
    // Adicionar 10% para paradas e trânsito
    tempoEstimado = tempoEstimado * 1.1;
  }
  
  // Sugerir valores baseados na distância e tipo de viagem
  const tipo = tipo_viagem || 'ida_e_volta';
  const multiplicador = tipo === 'ida_e_volta' ? 2 : 1;
  
  // Calcular número de pessoas e quantidade de noites
  const numPessoas = parseInt(numero_pessoas) || 1;
  let quantidadeNoites = 0;
  
  // Calcular quantidade de noites baseado em data_viagem e data_volta
  if (data_viagem && data_volta) {
    try {
      const dataIda = new Date(data_viagem);
      const dataVolta = new Date(data_volta);
      if (!isNaN(dataIda.getTime()) && !isNaN(dataVolta.getTime()) && dataVolta > dataIda) {
        const diffTime = Math.abs(dataVolta - dataIda);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        quantidadeNoites = diffDays;
      }
    } catch (e) {
      // Se houver erro ao parsear datas, quantidadeNoites permanece 0
      quantidadeNoites = 0;
    }
  }
  
  let custoTransporte, custoPedagio, custoAlimentacao, custoHospedagem, custoSugerido;
  let detalhes = {};
  
  if (requerPassagemAerea) {
    // Cálculo para passagem aérea - VALORES ASSERTIVOS BASEADOS EM DADOS REAIS
    // Passagem aérea doméstica no Brasil: R$ 0,50 - R$ 1,50 por km dependendo da rota
    // Média conservadora: R$ 1,20 por km (considerando rotas comerciais)
    // Para rotas longas (>1000km): R$ 1,00/km (mais econômico)
    // Para rotas médias (600-1000km): R$ 1,20/km
    const tarifaPorKm = distancia > 1000 ? 1.0 : 1.2;
    custoTransporte = distancia * tarifaPorKm * numPessoas; // Multiplicar pelo número de pessoas
    
    custoPedagio = 0; // Sem pedágio em voo
    
    // Alimentação em aeroporto: R$ 40-80 por refeição (média R$ 60)
    // Para ida e volta: 2 refeições (ida) + 2 refeições (volta) = 4 refeições
    // Para ida apenas: 2 refeições
    const refeicoesAereo = tipo === 'ida_e_volta' ? 4 : 2;
    custoAlimentacao = refeicoesAereo * 60 * numPessoas;
    
    // Hospedagem próximo ao aeroporto: R$ 200-350 por noite (média R$ 280)
    // Considerar quantidade de noites ou 1 noite mínimo para viagens > 600km
    if (quantidadeNoites > 0) {
      const custoPorNoite = numPessoas <= 2 ? 280 : (280 + ((numPessoas - 2) * 200));
      custoHospedagem = custoPorNoite * quantidadeNoites;
    } else {
      // Se não tiver noites definidas, considerar 1 noite para viagens > 600km
      const custoPorNoite = numPessoas <= 2 ? 280 : (280 + ((numPessoas - 2) * 200));
      custoHospedagem = custoPorNoite;
    }
    
    // Taxa de embarque e bagagem: R$ 50-100 (média R$ 75)
    const taxaEmbarque = 75 * numPessoas; // Taxa por pessoa
    
    // Garantir que os valores não sejam NaN ou undefined
    const custoPassagemFinal = isNaN(custoTransporte) ? 0 : parseFloat(custoTransporte.toFixed(2));
    const taxaEmbarqueFinal = isNaN(taxaEmbarque) ? 0 : parseFloat(taxaEmbarque.toFixed(2));
    const custoAlimentacaoAereoFinal = isNaN(custoAlimentacao) ? 0 : parseFloat(custoAlimentacao.toFixed(2));
    const custoHospedagemAereoFinal = isNaN(custoHospedagem) ? 0 : parseFloat(custoHospedagem.toFixed(2));
    
    detalhes = {
      custo_passagem_aerea: custoPassagemFinal,
      custo_taxa_embarque: taxaEmbarqueFinal,
      custo_pedagio: 0,
      custo_alimentacao: custoAlimentacaoAereoFinal,
      custo_hospedagem: custoHospedagemAereoFinal,
      tipo_transporte: 'aereo',
      numero_pessoas: numPessoas,
      quantidade_noites: quantidadeNoites
    };
    
    custoSugerido = custoPassagemFinal + taxaEmbarqueFinal + custoAlimentacaoAereoFinal + custoHospedagemAereoFinal;
  } else {
    // Cálculo para viagem de carro - VALORES ASSERTIVOS BASEADOS EM DADOS REAIS
    
    // COMBUSTÍVEL (Gasolina comum - 2024):
    // Preço médio: R$ 5,80 - R$ 6,20/L (média R$ 6,00/L)
    // Consumo médio veículo corporativo: 10-12 km/L (média 11 km/L)
    // Custo por km de combustível: R$ 6,00 / 11 = R$ 0,545/km
    // Adicionar 20% para desgaste, manutenção, pneus, óleo, etc.
    // NOTA: Combustível não multiplica pelo número de pessoas (mesmo veículo)
    const custoCombustivelPorKm = 0.545 * 1.2; // R$ 0,654/km
    // Garantir custo mínimo de combustível (mesmo para distâncias muito pequenas)
    // Custo mínimo: R$ 5,00 (equivalente a ~7.6km) para cobrir deslocamento básico
    const custoCombustivelCalculado = distancia * multiplicador * custoCombustivelPorKm;
    custoTransporte = Math.max(custoCombustivelCalculado, 5.00); // Mínimo R$ 5,00
    
    // PEDÁGIOS (Dados reais rodovias brasileiras - 2024):
    // Média de praças de pedágio: 1 a cada 50-80km
    // Tarifa média por praça: R$ 8,00 - R$ 15,00 (média R$ 11,50)
    // Para cálculo: 1 praça a cada 60km = (distancia / 60) praças
    // NOTA: Pedágio não multiplica pelo número de pessoas (mesmo veículo)
    // Para distâncias muito pequenas (< 30km), pode não ter pedágio
    const numPracas = distancia >= 30 ? Math.ceil(distancia / 60) : 0;
    const tarifaMediaPedagio = 11.50;
    custoPedagio = numPracas * tarifaMediaPedagio * multiplicador;
    
    // ALIMENTAÇÃO:
    // Refeição em rodoviária/restaurante: R$ 35-55 (média R$ 45)
    // SEMPRE calcular alimentação, mesmo para distâncias pequenas ou zero
    // Para ida e volta: mínimo 2 refeições (ida e volta), máximo 4 refeições
    // Para ida apenas: mínimo 1 refeição, normalmente 2 refeições
    let refeicoesPorPessoa;
    if (tipo === 'ida_e_volta') {
      // Se for ida e volta muito curta (< 50km total), considerar 2 refeições (ida e volta)
      // Se for mais longa, considerar 4 refeições
      refeicoesPorPessoa = (distancia * multiplicador) < 50 ? 2 : 4;
    } else {
      // Para ida ou volta apenas:
      // - Se distância < 10km: 1 refeição (viagem muito curta)
      // - Se distância >= 10km: 2 refeições (ida e volta no mesmo dia)
      refeicoesPorPessoa = distancia < 10 ? 1 : 2;
    }
    // Garantir que sempre tenha pelo menos 1 refeição por pessoa
    if (refeicoesPorPessoa < 1) {
      refeicoesPorPessoa = 1;
    }
    custoAlimentacao = refeicoesPorPessoa * 45 * numPessoas;
    
    // HOSPEDAGEM:
    // Hotel econômico/executivo: R$ 180-280 por noite (média R$ 230)
    // Calcular baseado na quantidade de noites e distância
    // Considerar hospedagem se distância > 250km (viagem de mais de 3h) OU se tiver noites definidas
    if ((distancia > 250 || quantidadeNoites > 0) && quantidadeNoites > 0) {
      const custoPorNoite = numPessoas <= 2 ? 230 : (230 + ((numPessoas - 2) * 180));
      custoHospedagem = custoPorNoite * quantidadeNoites;
    } else if (distancia > 250 && quantidadeNoites === 0 && tipo === 'ida_e_volta') {
      // Se for ida e volta mas não tiver data de volta, considerar 1 noite
      const custoPorNoite = numPessoas <= 2 ? 230 : (230 + ((numPessoas - 2) * 180));
      custoHospedagem = custoPorNoite;
    } else {
      custoHospedagem = 0;
    }
    
    // ESTACIONAMENTO (se necessário):
    // Média: R$ 15-25 por dia (média R$ 20)
    // Não multiplica pelo número de pessoas (mesmo veículo)
    const custoEstacionamento = distancia > 250 ? 20 : 0;
    
    // Garantir que os valores não sejam NaN ou undefined
    const custoCombustivelFinal = isNaN(custoTransporte) ? 0 : parseFloat(custoTransporte.toFixed(2));
    const custoPedagioFinal = isNaN(custoPedagio) ? 0 : parseFloat(custoPedagio.toFixed(2));
    const custoAlimentacaoFinal = isNaN(custoAlimentacao) ? 0 : parseFloat(custoAlimentacao.toFixed(2));
    const custoHospedagemFinal = isNaN(custoHospedagem) ? 0 : parseFloat(custoHospedagem.toFixed(2));
    const custoEstacionamentoFinal = isNaN(custoEstacionamento) ? 0 : parseFloat(custoEstacionamento.toFixed(2));
    
    detalhes = {
      custo_combustivel: custoCombustivelFinal,
      custo_pedagio: custoPedagioFinal,
      custo_alimentacao: custoAlimentacaoFinal,
      custo_hospedagem: custoHospedagemFinal,
      custo_estacionamento: custoEstacionamentoFinal,
      tipo_transporte: 'terrestre',
      consumo_medio_km_l: 11,
      preco_combustivel_l: 6.00,
      numero_pessoas: numPessoas,
      quantidade_noites: quantidadeNoites
    };
    
    custoSugerido = custoCombustivelFinal + custoPedagioFinal + custoAlimentacaoFinal + custoHospedagemFinal + custoEstacionamentoFinal;
  }
  
  // Garantir que custoSugerido não seja NaN
  const custoSugeridoFinal = isNaN(custoSugerido) ? 0 : parseFloat(custoSugerido.toFixed(2));
  const distanciaFinal = isNaN(distancia) ? 0 : Math.round(distancia);
  const tempoEstimadoFinal = isNaN(tempoEstimado) ? 0 : parseFloat(tempoEstimado.toFixed(2));
  
  // Debug log
  console.log('Cálculo de rota:', {
    distancia: distanciaFinal,
    tipo: tipo,
    numPessoas: numPessoas,
    quantidadeNoites: quantidadeNoites,
    custoSugerido: custoSugeridoFinal,
    detalhes: detalhes
  });
  
  res.json({
    distancia_km: distanciaFinal,
    tempo_estimado_horas: tempoEstimadoFinal,
    origem_coords: origemCoords,
    destino_coords: destinoCoords,
    custo_sugerido: custoSugeridoFinal,
    requer_passagem_aerea: requerPassagemAerea,
    detalhes: detalhes
  });
});

// Listar todos os custos de viagens
app.get('/api/custos-viagens', authenticateToken, (req, res) => {
  const { cliente_id, proposta_id, data_inicio, data_fim, codigo_visita, created_by, status_aprovacao, ordenar_por, ordem } = req.query;
  
  let query = `
    SELECT 
      cv.*,
      c.razao_social as cliente_nome,
      p.numero_proposta,
      p.titulo as proposta_titulo,
      a.titulo as atividade_titulo,
      u.nome as criado_por_nome
    FROM custos_viagens cv
    LEFT JOIN clientes c ON cv.cliente_id = c.id
    LEFT JOIN propostas p ON cv.proposta_id = p.id
    LEFT JOIN atividades a ON cv.atividade_id = a.id
    LEFT JOIN usuarios u ON cv.created_by = u.id
    WHERE 1=1
  `;
  
  const params = [];
  
  if (cliente_id) {
    query += ' AND (cv.cliente_id = ? OR EXISTS (SELECT 1 FROM viagem_clientes vc WHERE vc.custo_viagem_id = cv.id AND vc.cliente_id = ?))';
    params.push(cliente_id, cliente_id);
  }
  
  if (proposta_id) {
    query += ' AND cv.proposta_id = ?';
    params.push(proposta_id);
  }
  
  if (data_inicio) {
    query += ' AND cv.data_viagem >= ?';
    params.push(data_inicio);
  }
  
  if (data_fim) {
    query += ' AND cv.data_viagem <= ?';
    params.push(data_fim);
  }
  
  if (codigo_visita) {
    query += ' AND cv.codigo_visita LIKE ?';
    params.push(`%${codigo_visita}%`);
  }
  
  if (created_by) {
    query += ' AND cv.created_by = ?';
    params.push(created_by);
  }
  
  if (status_aprovacao) {
    query += ' AND cv.status_aprovacao = ?';
    params.push(status_aprovacao);
  }
  
  // Ordenação
  const ordenarPorValido = ['data_viagem', 'total_custo', 'distancia_km', 'created_at', 'codigo_visita'];
  const ordenarPor = ordenarPorValido.includes(ordenar_por) ? ordenar_por : 'data_viagem';
  const ordemValida = ordem && ordem.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  
  query += ` ORDER BY cv.${ordenarPor} ${ordemValida}, cv.created_at DESC LIMIT 500`;
  
  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    // Buscar clientes adicionais para cada viagem
    if (rows && rows.length > 0) {
      const viagemIds = rows.map(r => r.id);
      const placeholders = viagemIds.map(() => '?').join(',');
      
      db.all(`
        SELECT 
          vc.custo_viagem_id,
          vc.cliente_id,
          vc.ordem,
          vc.distancia_km,
          c.razao_social,
          c.cidade,
          c.estado,
          c.endereco
        FROM viagem_clientes vc
        LEFT JOIN clientes c ON vc.cliente_id = c.id
        WHERE vc.custo_viagem_id IN (${placeholders})
        ORDER BY vc.custo_viagem_id, vc.ordem
      `, viagemIds, async (err, clientesAdicionais) => {
        if (err) {
          console.error('Erro ao buscar clientes adicionais:', err);
          return res.json(rows || []);
        }
        
        // Agrupar clientes por viagem (usar coordenadas de cidade - instantâneo)
        const clientesPorViagem = {};
        if (clientesAdicionais) {
          clientesAdicionais.forEach((cliente) => {
            if (!clientesPorViagem[cliente.custo_viagem_id]) {
              clientesPorViagem[cliente.custo_viagem_id] = [];
            }
            
            // Usar coordenadas de cidade (instantâneo, sem API)
            const coords = obterCoordenadasCidade(cliente.cidade, cliente.estado);
            
            clientesPorViagem[cliente.custo_viagem_id].push({
              id: cliente.cliente_id,
              razao_social: cliente.razao_social,
              cidade: cliente.cidade,
              estado: cliente.estado,
              endereco: cliente.endereco,
              ordem: cliente.ordem,
              distancia_km: cliente.distancia_km,
              coordenadas: coords
            });
          });
        }
        
        // Adicionar clientes adicionais aos resultados
        rows.forEach(row => {
          row.clientes_viagem = clientesPorViagem[row.id] || [];
        });
        
        res.json(rows || []);
      });
    } else {
      res.json(rows || []);
    }
  });
});

// Obter custo de viagem específico
app.get('/api/custos-viagens/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  db.get(`
    SELECT 
      cv.*,
      c.razao_social as cliente_nome,
      p.numero_proposta,
      p.titulo as proposta_titulo,
      a.titulo as atividade_titulo,
      u.nome as criado_por_nome
    FROM custos_viagens cv
    LEFT JOIN clientes c ON cv.cliente_id = c.id
    LEFT JOIN propostas p ON cv.proposta_id = p.id
    LEFT JOIN atividades a ON cv.atividade_id = a.id
    LEFT JOIN usuarios u ON cv.created_by = u.id
    WHERE cv.id = ?
  `, [id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: 'Custo de viagem não encontrado' });
    }
    res.json(row);
  });
});

// Verificar regras de elegibilidade para viagem
app.get('/api/custos-viagens/verificar-elegibilidade/:cliente_id', authenticateToken, (req, res) => {
  const { cliente_id } = req.params;
  
  db.get(`
    SELECT 
      c.id,
      COUNT(DISTINCT p.id) as total_propostas,
      COUNT(DISTINCT CASE WHEN p.status IN ('aprovada', 'rejeitada', 'enviada') THEN p.id END) as propostas_processadas,
      COUNT(DISTINCT CASE WHEN p.status = 'aprovada' THEN p.id END) as propostas_aprovadas,
      SUM(CASE WHEN p.status = 'aprovada' THEN p.valor_total ELSE 0 END) as valor_total_aprovado,
      MAX(p.created_at) as ultima_proposta_data
    FROM clientes c
    LEFT JOIN propostas p ON c.id = p.cliente_id
    WHERE c.id = ?
    GROUP BY c.id
  `, [cliente_id], (err, cliente) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    if (!cliente) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }
    
    // Calcular taxa de conversão
    const taxaConversao = cliente.propostas_processadas > 0 
      ? (cliente.propostas_aprovadas / cliente.propostas_processadas) * 100 
      : 0;
    
    // Verificar atividade recente (últimos 90 dias)
    const ultimaProposta = cliente.ultima_proposta_data ? new Date(cliente.ultima_proposta_data) : null;
    const hoje = new Date();
    const diasDesdeUltimaProposta = ultimaProposta 
      ? Math.floor((hoje - ultimaProposta) / (1000 * 60 * 60 * 24))
      : null;
    const atividadeRecente = diasDesdeUltimaProposta !== null && diasDesdeUltimaProposta <= 90;
    
    // Verificar regras
    const regras = {
      possuir_propostas: {
        nome: 'Possuir Propostas',
        tipo: 'obrigatoria',
        atendida: cliente.total_propostas >= 1,
        descricao: 'Cliente deve ter pelo menos 1 proposta cadastrada'
      },
      propostas_processadas: {
        nome: 'Propostas Processadas',
        tipo: 'obrigatoria',
        atendida: cliente.propostas_processadas >= 1,
        descricao: 'Deve ter pelo menos 1 proposta processada (aprovada, rejeitada ou enviada)'
      },
      taxa_conversao: {
        nome: 'Taxa de Conversão ≥ 10%',
        tipo: 'recomendada',
        atendida: taxaConversao >= 10,
        descricao: 'Taxa de conversão igual ou superior a 10% aumenta a prioridade',
        valor: taxaConversao.toFixed(2)
      },
      valor_minimo: {
        nome: 'Valor Mínimo R$ 50.000',
        tipo: 'recomendada',
        atendida: cliente.valor_total_aprovado >= 50000,
        descricao: 'Valor total aprovado acima de R$ 50.000 aumenta a prioridade',
        valor: cliente.valor_total_aprovado || 0
      },
      atividade_recente: {
        nome: 'Atividade Recente',
        tipo: 'recomendada',
        atendida: atividadeRecente,
        descricao: 'Propostas nos últimos 90 dias aumentam a prioridade',
        dias: diasDesdeUltimaProposta
      }
    };
    
    const regrasObrigatoriasAtendidas = regras.possuir_propostas.atendida && regras.propostas_processadas.atendida;
    const regrasRecomendadasAtendidas = Object.values(regras)
      .filter(r => r.tipo === 'recomendada')
      .every(r => r.atendida);
    
    res.json({
      cliente_id: parseInt(cliente_id),
      regras,
      todas_obrigatorias_atendidas: regrasObrigatoriasAtendidas,
      todas_recomendadas_atendidas: regrasRecomendadasAtendidas,
      pode_registrar: regrasObrigatoriasAtendidas,
      resumo: {
        total_propostas: cliente.total_propostas || 0,
        propostas_processadas: cliente.propostas_processadas || 0,
        propostas_aprovadas: cliente.propostas_aprovadas || 0,
        taxa_conversao: taxaConversao.toFixed(2),
        valor_total_aprovado: cliente.valor_total_aprovado || 0,
        atividade_recente: atividadeRecente
      }
    });
  });
});

// Criar novo custo de viagem
app.post('/api/custos-viagens', authenticateToken, (req, res) => {
  normalizarMaiusculas(req.body, ['origem', 'origem_cidade', 'origem_estado', 'destino', 'destino_cidade', 'destino_estado', 'tipo_viagem', 'descricao', 'motivo_autorizacao']);
  const {
    cliente_id,
    proposta_id,
    proposta_aprovacao_id,
    atividade_id,
    data_viagem,
    data_volta,
    origem,
    origem_cidade,
    origem_estado,
    destino,
    destino_cidade,
    destino_estado,
    tipo_viagem,
    numero_pessoas,
    distancia_km,
    tempo_estimado_horas,
    custo_transporte,
    custo_hospedagem,
    custo_alimentacao,
    custo_outros,
    custo_sugerido,
    descricao,
    autorizado_sem_regras,
    motivo_autorizacao,
    clientes_viagem // Array de clientes [{id, distancia_km}]
  } = req.body;
  
  // Validações básicas
  if (!data_viagem) {
    return res.status(400).json({ error: 'Data de viagem é obrigatória' });
  }
  
  if (!destino) {
    return res.status(400).json({ error: 'Destino é obrigatório' });
  }
  
  // Calcular total
  const total_custo = (parseFloat(custo_transporte) || 0) +
                      (parseFloat(custo_hospedagem) || 0) +
                      (parseFloat(custo_alimentacao) || 0) +
                      (parseFloat(custo_outros) || 0);
  
  const userId = req.user.id;
  
  // Verificar se precisa de aprovação (apenas se tiver proposta_aprovacao_id)
  let status_aprovacao = 'pendente';
  if (proposta_aprovacao_id) {
    status_aprovacao = 'aprovado';
  }
  
  // Gerar código mnemônico incremental
  db.get('SELECT MAX(CAST(SUBSTR(codigo_visita, 5) AS INTEGER)) as max_num FROM custos_viagens WHERE codigo_visita LIKE "VIS-%"', [], (err, row) => {
    if (err) {
      console.error('Erro ao buscar último código:', err);
      return res.status(500).json({ error: 'Erro ao gerar código de visita' });
    }
    
    const proximoNumero = (row && row.max_num ? row.max_num : 0) + 1;
    const codigoVisita = `VIS-${String(proximoNumero).padStart(4, '0')}`;
    
    db.run(
      `INSERT INTO custos_viagens (
        codigo_visita, cliente_id, proposta_id, proposta_aprovacao_id, atividade_id, data_viagem, data_volta,
        origem, origem_cidade, origem_estado, destino, destino_cidade, destino_estado,
        tipo_viagem, numero_pessoas, distancia_km, tempo_estimado_horas,
        custo_transporte, custo_hospedagem, custo_alimentacao, custo_outros,
        total_custo, custo_sugerido, status_aprovacao, descricao, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        codigoVisita,
        cliente_id || null,
        proposta_id || null,
        proposta_aprovacao_id || null,
        atividade_id || null,
        data_viagem,
        data_volta || null,
        origem || null,
        origem_cidade || null,
        origem_estado || null,
        destino,
        destino_cidade || null,
        destino_estado || null,
        tipo_viagem || 'ida_e_volta',
        numero_pessoas || 1,
        distancia_km || 0,
        tempo_estimado_horas || 0,
        custo_transporte || 0,
        custo_hospedagem || 0,
        custo_alimentacao || 0,
        custo_outros || 0,
        total_custo,
        custo_sugerido || 0,
        status_aprovacao,
        descricao || null,
        userId
      ],
    function(err) {
      if (err) {
        console.error('Erro ao salvar custo de viagem:', err);
        console.error('Dados recebidos:', {
          cliente_id,
          data_viagem,
          data_volta,
          destino,
          numero_pessoas
        });
        return res.status(500).json({ error: err.message || 'Erro ao salvar custo de viagem' });
      }
      
      const custoViagemId = this.lastID;
      
      // Salvar múltiplos clientes se houver
      if (clientes_viagem && Array.isArray(clientes_viagem) && clientes_viagem.length > 0) {
        const stmt = db.prepare('INSERT INTO viagem_clientes (custo_viagem_id, cliente_id, ordem, distancia_km) VALUES (?, ?, ?, ?)');
        clientes_viagem.forEach((cliente, index) => {
          if (cliente.id) {
            stmt.run([
              custoViagemId,
              cliente.id,
              cliente.ordem || (index + 1),
              cliente.distancia_km || null
            ]);
          }
        });
        stmt.finalize();
      }
      
      // Se foi autorizado sem seguir as regras, criar log
      if (autorizado_sem_regras && motivo_autorizacao) {
        db.run(
          `INSERT INTO logs_autorizacao_viagens (
            custo_viagem_id, cliente_id, regras_nao_atendidas, autorizado_por, motivo_autorizacao
          ) VALUES (?, ?, ?, ?, ?)`,
          [
            custoViagemId,
            cliente_id,
            JSON.stringify(req.body.regras_nao_atendidas || []),
            userId,
            motivo_autorizacao
          ],
          (errLog) => {
            if (errLog) {
              console.error('Erro ao criar log de autorização:', errLog);
            }
          }
        );
      }
      
      res.json({ id: custoViagemId, codigo_visita: codigoVisita, message: 'Custo de viagem criado com sucesso', status_aprovacao });
    }
  );
  }); // Fechar callback do db.get
});

// Atualizar custo de viagem
app.put('/api/custos-viagens/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  normalizarMaiusculas(req.body, ['origem', 'origem_cidade', 'origem_estado', 'destino', 'destino_cidade', 'destino_estado', 'tipo_viagem', 'descricao']);
  const {
    cliente_id,
    proposta_id,
    proposta_aprovacao_id,
    atividade_id,
    data_viagem,
    data_volta,
    origem,
    origem_cidade,
    origem_estado,
    destino,
    destino_cidade,
    destino_estado,
    tipo_viagem,
    numero_pessoas,
    distancia_km,
    tempo_estimado_horas,
    custo_transporte,
    custo_hospedagem,
    custo_alimentacao,
    custo_outros,
    custo_sugerido,
    descricao
  } = req.body;
  
  // Buscar dados atuais para comparar
  db.get('SELECT * FROM custos_viagens WHERE id = ?', [id], (err, viagemAtual) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    if (!viagemAtual) {
      return res.status(404).json({ error: 'Viagem não encontrada' });
    }
    
    // Calcular total
    const total_custo = (parseFloat(custo_transporte) || 0) +
                        (parseFloat(custo_hospedagem) || 0) +
                        (parseFloat(custo_alimentacao) || 0) +
                        (parseFloat(custo_outros) || 0);
    
    // Preparar dados novos
    const dadosNovos = {
      cliente_id: cliente_id || null,
      proposta_id: proposta_id || null,
      proposta_aprovacao_id: proposta_aprovacao_id || null,
      atividade_id: atividade_id || null,
      data_viagem,
      data_volta: data_volta || null,
      origem: origem || null,
      origem_cidade: origem_cidade || null,
      origem_estado: origem_estado || null,
      destino,
      destino_cidade: destino_cidade || null,
      destino_estado: destino_estado || null,
      tipo_viagem: tipo_viagem || 'ida_e_volta',
      numero_pessoas: numero_pessoas || 1,
      distancia_km: distancia_km || 0,
      tempo_estimado_horas: tempo_estimado_horas || 0,
      custo_transporte: custo_transporte || 0,
      custo_hospedagem: custo_hospedagem || 0,
      custo_alimentacao: custo_alimentacao || 0,
      custo_outros: custo_outros || 0,
      total_custo,
      custo_sugerido: custo_sugerido || 0,
      descricao: descricao || null
    };
    
    // Detectar mudanças
    const mudancas = [];
    Object.keys(dadosNovos).forEach(key => {
      if (String(viagemAtual[key] || '') !== String(dadosNovos[key] || '')) {
        mudancas.push({
          campo: key,
          valor_anterior: viagemAtual[key],
          valor_novo: dadosNovos[key]
        });
      }
    });
    
    // Atualizar viagem
    db.run(
      `UPDATE custos_viagens SET
        cliente_id = ?, proposta_id = ?, proposta_aprovacao_id = ?, atividade_id = ?, data_viagem = ?, data_volta = ?,
        origem = ?, origem_cidade = ?, origem_estado = ?, destino = ?, destino_cidade = ?, destino_estado = ?,
        tipo_viagem = ?, numero_pessoas = ?, distancia_km = ?, tempo_estimado_horas = ?,
        custo_transporte = ?, custo_hospedagem = ?, custo_alimentacao = ?,
        custo_outros = ?, total_custo = ?, custo_sugerido = ?, descricao = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
      [
        dadosNovos.cliente_id,
        dadosNovos.proposta_id,
        dadosNovos.proposta_aprovacao_id,
        dadosNovos.atividade_id,
        dadosNovos.data_viagem,
        dadosNovos.data_volta,
        dadosNovos.origem,
        dadosNovos.origem_cidade,
        dadosNovos.origem_estado,
        dadosNovos.destino,
        dadosNovos.destino_cidade,
        dadosNovos.destino_estado,
        dadosNovos.tipo_viagem,
        dadosNovos.numero_pessoas,
        dadosNovos.distancia_km,
        dadosNovos.tempo_estimado_horas,
        dadosNovos.custo_transporte,
        dadosNovos.custo_hospedagem,
        dadosNovos.custo_alimentacao,
        dadosNovos.custo_outros,
        dadosNovos.total_custo,
        dadosNovos.custo_sugerido,
        dadosNovos.descricao,
        id
      ],
      (err) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        
        // Salvar histórico se houver mudanças
        if (mudancas.length > 0) {
          db.run(
            `INSERT INTO custos_viagens_historico (
              custo_viagem_id, alterado_por, dados_anteriores, dados_novos, mudancas
            ) VALUES (?, ?, ?, ?, ?)`,
            [
              id,
              userId,
              JSON.stringify(viagemAtual),
              JSON.stringify(dadosNovos),
              JSON.stringify(mudancas)
            ],
            (errHist) => {
              if (errHist) {
                console.error('Erro ao salvar histórico:', errHist);
              }
            }
          );
        }
        
        res.json({ message: 'Custo de viagem atualizado com sucesso' });
      }
    );
  });
});

// Aprovar/Rejeitar custo de viagem
app.post('/api/custos-viagens/:id/aprovar', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { aprovado, motivo } = req.body;
  const userId = req.user.id;
  
  const status_aprovacao = aprovado ? 'aprovado' : 'rejeitado';
  
  db.run(
    `UPDATE custos_viagens SET
      status_aprovacao = ?,
      motivo_aprovacao = ?,
      aprovado_por = ?,
      data_aprovacao = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?`,
    [status_aprovacao, motivo || null, userId, id],
    (err) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ message: `Custo de viagem ${aprovado ? 'aprovado' : 'rejeitado'} com sucesso` });
    }
  );
});

// Buscar logs de autorização de uma viagem
app.get('/api/custos-viagens/:id/logs-autorizacao', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  db.all(
    `SELECT 
      lav.*,
      u.nome as autorizado_por_nome,
      c.razao_social as cliente_nome
     FROM logs_autorizacao_viagens lav
     LEFT JOIN usuarios u ON lav.autorizado_por = u.id
     LEFT JOIN clientes c ON lav.cliente_id = c.id
     WHERE lav.custo_viagem_id = ?
     ORDER BY lav.created_at DESC`,
    [id],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      // Parsear JSON dos campos
      const logs = rows.map(row => ({
        ...row,
        regras_nao_atendidas: row.regras_nao_atendidas ? JSON.parse(row.regras_nao_atendidas) : []
      }));
      
      res.json(logs);
    }
  );
});

// Duplicar custo de viagem
app.post('/api/custos-viagens/:id/duplicar', authenticateToken, (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  
  // Buscar viagem original
  db.get('SELECT * FROM custos_viagens WHERE id = ?', [id], (err, viagemOriginal) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    if (!viagemOriginal) {
      return res.status(404).json({ error: 'Viagem não encontrada' });
    }
    
    // Gerar novo código de visita
    db.get('SELECT MAX(CAST(SUBSTR(codigo_visita, 5) AS INTEGER)) as max_num FROM custos_viagens WHERE codigo_visita LIKE "VIS-%"', [], (err, row) => {
      if (err) {
        return res.status(500).json({ error: 'Erro ao gerar código de visita' });
      }
      
      const proximoNumero = (row && row.max_num ? row.max_num : 0) + 1;
      const codigoVisita = `VIS-${String(proximoNumero).padStart(4, '0')}`;
      
      // Criar nova viagem com dados da original (sem código, sem aprovação)
      db.run(
        `INSERT INTO custos_viagens (
          codigo_visita, cliente_id, proposta_id, proposta_aprovacao_id, atividade_id, data_viagem, data_volta,
          origem, origem_cidade, origem_estado, destino, destino_cidade, destino_estado,
          tipo_viagem, numero_pessoas, distancia_km, tempo_estimado_horas,
          custo_transporte, custo_hospedagem, custo_alimentacao, custo_outros,
          total_custo, custo_sugerido, status_aprovacao, descricao, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          codigoVisita,
          viagemOriginal.cliente_id,
          null, // Não duplicar proposta
          null, // Não duplicar proposta_aprovacao_id
          viagemOriginal.atividade_id,
          viagemOriginal.data_viagem,
          viagemOriginal.data_volta,
          viagemOriginal.origem,
          viagemOriginal.origem_cidade,
          viagemOriginal.origem_estado,
          viagemOriginal.destino,
          viagemOriginal.destino_cidade,
          viagemOriginal.destino_estado,
          viagemOriginal.tipo_viagem,
          viagemOriginal.numero_pessoas,
          viagemOriginal.distancia_km,
          viagemOriginal.tempo_estimado_horas,
          viagemOriginal.custo_transporte,
          viagemOriginal.custo_hospedagem,
          viagemOriginal.custo_alimentacao,
          viagemOriginal.custo_outros,
          viagemOriginal.total_custo,
          viagemOriginal.custo_sugerido,
          'pendente', // Sempre pendente ao duplicar
          viagemOriginal.descricao,
          userId
        ],
        function(err) {
          if (err) {
            return res.status(500).json({ error: err.message });
          }
          
          const novoId = this.lastID;
          
          // Duplicar clientes da viagem se houver
          db.all('SELECT * FROM viagem_clientes WHERE custo_viagem_id = ?', [id], (err, clientesViagem) => {
            if (clientesViagem && clientesViagem.length > 0) {
              const stmt = db.prepare('INSERT INTO viagem_clientes (custo_viagem_id, cliente_id, ordem, distancia_km) VALUES (?, ?, ?, ?)');
              clientesViagem.forEach(cliente => {
                stmt.run([novoId, cliente.cliente_id, cliente.ordem, cliente.distancia_km]);
              });
              stmt.finalize();
            }
            
            res.json({ id: novoId, codigo_visita: codigoVisita, message: 'Viagem duplicada com sucesso' });
          });
        }
      );
    });
  });
});

// ========== ROTAS DE COMPROVANTES DE VIAGENS ==========
// Servir arquivos estáticos de comprovantes
app.use('/api/uploads/comprovantes-viagens', express.static(uploadsComprovantesDir));

// Upload de comprovante
app.post('/api/custos-viagens/:id/comprovante', authenticateToken, uploadComprovante.single('arquivo'), (req, res) => {
  const { id } = req.params;
  const { tipo_comprovante, descricao } = req.body;
  const userId = req.user.id;
  
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  }
  
  // Verificar se a viagem existe
  db.get('SELECT * FROM custos_viagens WHERE id = ?', [id], (err, viagem) => {
    if (err) {
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(500).json({ error: err.message });
    }
    
    if (!viagem) {
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(404).json({ error: 'Viagem não encontrada' });
    }
    
    // Salvar anexo no banco
    db.run(
      `INSERT INTO custos_viagens_anexos (
        custo_viagem_id, nome_arquivo, nome_original, tipo_arquivo, tamanho, tipo_comprovante, descricao, uploaded_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        req.file.filename,
        req.file.originalname,
        req.file.mimetype,
        req.file.size,
        tipo_comprovante || 'outro',
        descricao || null,
        userId
      ],
      function(err) {
        if (err) {
          if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
          }
          return res.status(500).json({ error: err.message });
        }
        
        res.json({
          success: true,
          message: 'Comprovante anexado com sucesso',
          id: this.lastID,
          filename: req.file.filename,
          originalName: req.file.originalname,
          size: req.file.size
        });
      }
    );
  });
});

// Listar comprovantes de uma viagem
app.get('/api/custos-viagens/:id/comprovantes', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  db.all(
    `SELECT 
      cva.*,
      u.nome as uploaded_by_nome
     FROM custos_viagens_anexos cva
     LEFT JOIN usuarios u ON cva.uploaded_by = u.id
     WHERE cva.custo_viagem_id = ?
     ORDER BY cva.created_at DESC`,
    [id],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json(rows || []);
    }
  );
});

// Download de comprovante
app.get('/api/custos-viagens/:id/comprovante/:anexo_id', authenticateToken, (req, res) => {
  const { id, anexo_id } = req.params;
  
  db.get('SELECT * FROM custos_viagens_anexos WHERE id = ? AND custo_viagem_id = ?', [anexo_id, id], (err, anexo) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    if (!anexo) {
      return res.status(404).json({ error: 'Comprovante não encontrado' });
    }
    
    const filePath = path.join(uploadsComprovantesDir, anexo.nome_arquivo);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Arquivo não encontrado no servidor' });
    }
    
    res.setHeader('Content-Disposition', `attachment; filename="${anexo.nome_original}"`);
    res.setHeader('Content-Type', anexo.tipo_arquivo || 'application/octet-stream');
    
    res.sendFile(filePath, (err) => {
      if (err) {
        console.error('Erro ao fazer download:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Erro ao fazer download do arquivo' });
        }
      }
    });
  });
});

// Deletar comprovante
app.delete('/api/custos-viagens/:id/comprovante/:anexo_id', authenticateToken, (req, res) => {
  const { id, anexo_id } = req.params;
  
  db.get('SELECT * FROM custos_viagens_anexos WHERE id = ? AND custo_viagem_id = ?', [anexo_id, id], (err, anexo) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    if (!anexo) {
      return res.status(404).json({ error: 'Comprovante não encontrado' });
    }
    
    const filePath = path.join(uploadsComprovantesDir, anexo.nome_arquivo);
    
    // Deletar do banco
    db.run('DELETE FROM custos_viagens_anexos WHERE id = ?', [anexo_id], (err) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      // Deletar arquivo físico
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      
      res.json({ message: 'Comprovante deletado com sucesso' });
    });
  });
});

// ========== ROTAS DE HISTÓRICO DE VIAGENS ==========
// Buscar histórico de alterações de uma viagem
app.get('/api/custos-viagens/:id/historico', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  db.all(
    `SELECT 
      cvh.*,
      u.nome as alterado_por_nome
     FROM custos_viagens_historico cvh
     LEFT JOIN usuarios u ON cvh.alterado_por = u.id
     WHERE cvh.custo_viagem_id = ?
     ORDER BY cvh.created_at DESC`,
    [id],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      // Parsear JSON dos campos
      const historico = rows.map(row => ({
        ...row,
        dados_anteriores: row.dados_anteriores ? JSON.parse(row.dados_anteriores) : {},
        dados_novos: row.dados_novos ? JSON.parse(row.dados_novos) : {},
        mudancas: row.mudancas ? JSON.parse(row.mudancas) : []
      }));
      
      res.json(historico);
    }
  );
});

// Deletar custo de viagem
app.delete('/api/custos-viagens/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM custos_viagens WHERE id = ?', [id], (err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ message: 'Custo de viagem deletado com sucesso' });
  });
});

// Análise de custos por cliente (OTIMIZADA)
app.get('/api/custos-viagens/analise/cliente', authenticateToken, (req, res) => {
  // Query otimizada - usar subqueries ao invés de múltiplos JOINs complexos
  db.all(`
    SELECT 
      c.id as cliente_id,
      c.razao_social,
      COALESCE(viagens.total_viagens, 0) as total_viagens,
      COALESCE(viagens.total_custo, 0) as total_custo,
      COALESCE(propostas_info.propostas_relacionadas, 0) as propostas_relacionadas,
      COALESCE(propostas_info.propostas_aprovadas, 0) as propostas_aprovadas,
      COALESCE(propostas_info.valor_vendas_aprovadas, 0) as valor_vendas_aprovadas,
      CASE 
        WHEN COALESCE(propostas_info.propostas_aprovadas, 0) > 0 
        THEN COALESCE(viagens.total_custo, 0) / propostas_info.propostas_aprovadas
        ELSE NULL
      END as custo_por_venda,
      CASE 
        WHEN COALESCE(propostas_info.valor_vendas_aprovadas, 0) > 0
        THEN (COALESCE(viagens.total_custo, 0) / propostas_info.valor_vendas_aprovadas) * 100
        ELSE NULL
      END as percentual_custo_venda
    FROM clientes c
    INNER JOIN (
      SELECT 
        cliente_id,
        COUNT(*) as total_viagens,
        SUM(total_custo) as total_custo
      FROM custos_viagens
      WHERE cliente_id IS NOT NULL
      GROUP BY cliente_id
    ) viagens ON c.id = viagens.cliente_id
    LEFT JOIN (
      SELECT 
        cv.cliente_id,
        COUNT(DISTINCT cv.proposta_id) as propostas_relacionadas,
        COUNT(DISTINCT CASE WHEN p.status = 'aprovada' THEN p.id END) as propostas_aprovadas,
        SUM(CASE WHEN p.status = 'aprovada' THEN p.valor_total ELSE 0 END) as valor_vendas_aprovadas
      FROM custos_viagens cv
      LEFT JOIN propostas p ON cv.proposta_id = p.id
      WHERE cv.cliente_id IS NOT NULL
      GROUP BY cv.cliente_id
    ) propostas_info ON c.id = propostas_info.cliente_id
    WHERE viagens.total_custo > 0
    ORDER BY viagens.total_custo DESC
    LIMIT 50
  `, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    // Adicionar recomendação para cada cliente
    const analise = (rows || []).map(row => {
      let recomendacao = 'visitar';
      let motivo = '';
      
      const custoPorVenda = row.custo_por_venda || 0;
      const percentualCusto = row.percentual_custo_venda || 0;
      const totalVendas = row.valor_vendas_aprovadas || 0;
      
      if (row.propostas_aprovadas === 0) {
        recomendacao = 'nao_visitar';
        motivo = 'Nenhuma venda aprovada com este cliente';
      } else if (percentualCusto > 10) {
        recomendacao = 'avaliar';
        motivo = `Custo representa ${percentualCusto.toFixed(2)}% do valor das vendas`;
      } else if (custoPorVenda > 5000) {
        recomendacao = 'avaliar';
        motivo = `Custo por venda muito alto: R$ ${custoPorVenda.toFixed(2)}`;
      } else if (totalVendas > 0 && percentualCusto < 5) {
        recomendacao = 'visitar';
        motivo = 'Custo baixo em relação ao valor das vendas';
      } else {
        recomendacao = 'visitar';
        motivo = 'Custo dentro do esperado';
      }
      
      return {
        ...row,
        recomendacao,
        motivo
      };
    });
    
    res.json(analise);
  });
});

// Resumo geral de custos
app.get('/api/custos-viagens/resumo', authenticateToken, (req, res) => {
  db.get(`
    SELECT 
      COUNT(*) as total_viagens,
      SUM(total_custo) as total_custo_geral,
      AVG(total_custo) as custo_medio_viagem,
      COUNT(DISTINCT cliente_id) as clientes_visitados,
      COUNT(DISTINCT proposta_id) as propostas_relacionadas,
      SUM(CASE WHEN tipo_viagem = 'ida' THEN total_custo ELSE 0 END) as custo_ida,
      SUM(CASE WHEN tipo_viagem = 'volta' THEN total_custo ELSE 0 END) as custo_volta,
      SUM(CASE WHEN tipo_viagem = 'ida_e_volta' THEN total_custo ELSE 0 END) as custo_ida_volta
    FROM custos_viagens
  `, [], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(row || {});
  });
});

// ========== ROTAS DE DASHBOARD ==========
app.get('/api/dashboard', authenticateToken, (req, res) => {
  const stats = {};

  // Total de clientes ativos
  db.get('SELECT COUNT(*) as total FROM clientes WHERE status = ?', ['ativo'], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    stats.totalClientes = row.total || 0;

    // Total de projetos ativos
    db.get('SELECT COUNT(*) as total FROM projetos WHERE status = ?', ['ativo'], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      stats.totalProjetos = row.total || 0;

      // Total de oportunidades
      db.get('SELECT COUNT(*) as total FROM oportunidades', [], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        stats.totalOportunidades = row.total || 0;

        // Valor total de oportunidades
        db.get('SELECT SUM(valor_estimado) as total FROM oportunidades', [], (err, row) => {
          if (err) return res.status(500).json({ error: err.message });
          stats.valorTotalOportunidades = row.total || 0;

          // Projetos por status
          db.all('SELECT status, COUNT(*) as count FROM projetos GROUP BY status', [], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            stats.projetosPorStatus = rows || [];

            // Propostas por status
            db.all('SELECT status, COUNT(*) as total FROM propostas GROUP BY status', [], (err, rows) => {
              if (err) return res.status(500).json({ error: err.message });
              stats.propostasPorStatus = rows || [];

              // Valor total de propostas aprovadas
              db.get('SELECT SUM(valor_total) as total FROM propostas WHERE status = ?', ['aprovada'], (err, row) => {
                if (err) return res.status(500).json({ error: err.message });
                stats.valorTotalPropostasAprovadas = row.total || 0;

                // Calcular taxa de conversão
                const totalPropostas = stats.propostasPorStatus.reduce((sum, item) => sum + (item.total || 0), 0);
                const aprovadas = stats.propostasPorStatus.find(item => item.status === 'aprovada')?.total || 0;
                const rejeitadas = stats.propostasPorStatus.find(item => item.status === 'rejeitada')?.total || 0;
                const enviadas = stats.propostasPorStatus.find(item => item.status === 'enviada')?.total || 0;
                const processadas = aprovadas + rejeitadas + enviadas;
                
                // Taxa de conversão = (aprovadas / processadas) * 100
                // Se não houver processadas, usar total de propostas
                const taxaConversao = processadas > 0 
                  ? (aprovadas / processadas) * 100 
                  : (totalPropostas > 0 ? (aprovadas / totalPropostas) * 100 : 0);
                
                stats.taxaConversao = parseFloat(taxaConversao.toFixed(2));

                res.json(stats);
              });
            });
          });
        });
      });
    });
  });
});

app.get('/api/dashboard/historico', authenticateToken, (req, res) => {
  const historico = [];

  // Buscar dados dos últimos 12 meses
  db.all(`
    SELECT 
      strftime('%Y-%m', created_at) as mes,
      COUNT(DISTINCT CASE WHEN strftime('%Y-%m', created_at) = strftime('%Y-%m', created_at) THEN id END) as clientes,
      COUNT(DISTINCT CASE WHEN strftime('%Y-%m', created_at) = strftime('%Y-%m', created_at) THEN id END) as projetos,
      COUNT(DISTINCT CASE WHEN strftime('%Y-%m', created_at) = strftime('%Y-%m', created_at) AND status = 'aprovada' THEN id END) as propostas_aprovadas
    FROM (
      SELECT created_at, id, 'cliente' as tipo, NULL as status FROM clientes
      UNION ALL
      SELECT created_at, id, 'projeto' as tipo, NULL as status FROM projetos
      UNION ALL
      SELECT created_at, id, 'proposta' as tipo, status FROM propostas
    )
    WHERE created_at >= date('now', '-12 months')
    GROUP BY mes
    ORDER BY mes
  `, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows || []);
  });
});

// ========== ROTAS DE DASHBOARD AVANÇADO ==========
app.get('/api/dashboard/avancado', authenticateToken, (req, res) => {
  const dados = {
    propostasPorEstado: [],
    volumeBuscaPorRegiao: [],
    rankClientesCompras: [],
    rankClientesPropostas: [],
    rankRegiaoCompras: [],
    rankOrigemBusca: [],
    taxaConversaoFamilia: [],
    rankClientesPorSegmento: [],
    motivoNaoVenda: [],
    cotacoesComLembrete: []
  };

  let completed = 0;
  const total = 10;

  const checkComplete = () => {
    completed++;
    if (completed === total) {
      res.json(dados);
    }
  };

  // 1. Propostas por Estado (UF)
  db.all(`
    SELECT c.estado as uf, COUNT(*) as total
    FROM propostas p
    JOIN clientes c ON p.cliente_id = c.id
    WHERE c.estado IS NOT NULL
    GROUP BY c.estado
    ORDER BY total DESC
  `, [], (err, rows) => {
    if (!err) dados.propostasPorEstado = rows || [];
    checkComplete();
  });

  // 2. Volume de busca por região
  db.all(`
    SELECT regiao_busca, COUNT(*) as total
    FROM proposta_itens
    WHERE regiao_busca IS NOT NULL
    GROUP BY regiao_busca
    ORDER BY total DESC
  `, [], (err, rows) => {
    if (!err) dados.volumeBuscaPorRegiao = rows || [];
    checkComplete();
  });

  // 3. Rank de clientes que mais compram
  db.all(`
    SELECT c.razao_social, COUNT(*) as total_compras, SUM(p.valor_total) as valor_total
    FROM propostas p
    JOIN clientes c ON p.cliente_id = c.id
    WHERE p.status = 'aprovada'
    GROUP BY c.id
    ORDER BY total_compras DESC
    LIMIT 10
  `, [], (err, rows) => {
    if (!err) dados.rankClientesCompras = rows || [];
    checkComplete();
  });

  // 4. Rank de clientes que mais solicitam propostas
  db.all(`
    SELECT c.razao_social, COUNT(*) as total_propostas
    FROM propostas p
    JOIN clientes c ON p.cliente_id = c.id
    GROUP BY c.id
    ORDER BY total_propostas DESC
    LIMIT 10
  `, [], (err, rows) => {
    if (!err) dados.rankClientesPropostas = rows || [];
    checkComplete();
  });

  // 5. Rank de região que mais compram
  db.all(`
    SELECT c.estado as regiao, COUNT(*) as total_compras, SUM(p.valor_total) as valor_total
    FROM propostas p
    JOIN clientes c ON p.cliente_id = c.id
    WHERE p.status = 'aprovada' AND c.estado IS NOT NULL
    GROUP BY c.estado
    ORDER BY total_compras DESC
    LIMIT 10
  `, [], (err, rows) => {
    if (!err) dados.rankRegiaoCompras = rows || [];
    checkComplete();
  });

  // 6. Rank de origem de busca (MKT)
  db.all(`
    SELECT origem_busca, COUNT(*) as total
    FROM propostas
    WHERE origem_busca IS NOT NULL
    GROUP BY origem_busca
    ORDER BY total DESC
  `, [], (err, rows) => {
    if (!err) dados.rankOrigemBusca = rows || [];
    checkComplete();
  });

  // 7. Taxa de conversão por família de produto
  db.all(`
    SELECT familia_produto, 
           COUNT(*) as total_propostas,
           SUM(CASE WHEN status = 'aprovada' THEN 1 ELSE 0 END) as aprovadas,
           ROUND(SUM(CASE WHEN status = 'aprovada' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as taxa_conversao
    FROM propostas
    WHERE familia_produto IS NOT NULL
    GROUP BY familia_produto
    ORDER BY taxa_conversao DESC
  `, [], (err, rows) => {
    if (!err) dados.taxaConversaoFamilia = rows || [];
    checkComplete();
  });

  // 8. Rank de clientes por segmento
  db.all(`
    SELECT c.segmento, COUNT(DISTINCT c.id) as total_clientes, COUNT(p.id) as total_propostas
    FROM clientes c
    LEFT JOIN propostas p ON c.id = p.cliente_id
    WHERE c.segmento IS NOT NULL
    GROUP BY c.segmento
    ORDER BY total_clientes DESC
  `, [], (err, rows) => {
    if (!err) dados.rankClientesPorSegmento = rows || [];
    checkComplete();
  });

  // 9. Motivo da não venda
  db.all(`
    SELECT motivo_nao_venda, COUNT(*) as total
    FROM propostas
    WHERE motivo_nao_venda IS NOT NULL
    GROUP BY motivo_nao_venda
    ORDER BY total DESC
  `, [], (err, rows) => {
    if (!err) dados.motivoNaoVenda = rows || [];
    checkComplete();
  });

  // 10. Histórico de cotações com lembretes (filtrado por usuário)
  const userId = req.user.id;
  db.all(`
    SELECT 
      pr.id,
      pr.numero_proposta,
      pr.titulo,
      c.razao_social,
      pr.validade,
      pr.lembrete_data,
      pr.lembrete_mensagem,
      pr.status,
      CASE 
        WHEN pr.lembrete_data IS NOT NULL AND DATE(pr.lembrete_data) <= DATE('now') THEN 1
        ELSE 0
      END as lembrete_vencido
    FROM propostas pr
    JOIN clientes c ON pr.cliente_id = c.id
    WHERE pr.lembrete_data IS NOT NULL
      AND (pr.responsavel_id = ? OR pr.created_by = ?)
    ORDER BY pr.lembrete_data ASC
  `, [userId, userId], (err, rows) => {
    if (!err) dados.cotacoesComLembrete = rows || [];
    checkComplete();
  });
});

// ========== ROTA DE NOTIFICAÇÕES ==========
app.get('/api/notificacoes', authenticateToken, (req, res) => {
  const userId = req.user.id;
  
  // Buscar lembretes de propostas do usuário
  db.all(`
    SELECT 
      pr.id,
      pr.numero_proposta,
      pr.titulo,
      pr.status,
      c.razao_social as cliente_nome,
      pr.lembrete_data,
      pr.lembrete_mensagem,
      'lembrete_proposta' as tipo,
      CASE
        WHEN pr.lembrete_data IS NOT NULL AND DATE(pr.lembrete_data) < DATE('now') THEN 'vencido'
        WHEN pr.lembrete_data IS NOT NULL AND DATE(pr.lembrete_data) = DATE('now') THEN 'hoje'
        ELSE 'futuro'
      END as prioridade
    FROM propostas pr
    LEFT JOIN clientes c ON pr.cliente_id = c.id
    WHERE pr.lembrete_data IS NOT NULL
      AND (pr.responsavel_id = ? OR pr.created_by = ?)
      AND DATE(pr.lembrete_data) <= DATE('now', '+7 days')
    ORDER BY 
      CASE 
        WHEN DATE(pr.lembrete_data) < DATE('now') THEN 1
        WHEN DATE(pr.lembrete_data) = DATE('now') THEN 2
        ELSE 3
      END,
      pr.lembrete_data ASC
  `, [userId, userId], (err, rows) => {
    if (err) {
      console.error('❌ Erro ao buscar notificações:', err);
      return res.status(500).json({ error: err.message });
    }
    
    // Buscar aprovações pendentes para este usuário
    db.all(`
      SELECT 
        a.id,
        a.proposta_id,
        a.valor_desconto,
        a.valor_total,
        a.valor_com_desconto,
        a.valor_desconto_rs,
        a.status,
        a.created_at,
        p.numero_proposta,
        p.titulo as proposta_titulo,
        c.razao_social as cliente_nome,
        u.nome as solicitado_por_nome
      FROM aprovacoes a
      LEFT JOIN propostas p ON a.proposta_id = p.id
      LEFT JOIN clientes c ON p.cliente_id = c.id
      LEFT JOIN usuarios u ON a.solicitado_por = u.id
      WHERE a.status = 'pendente'
        AND EXISTS (
          SELECT 1 FROM usuarios 
          WHERE id = ? AND pode_aprovar_descontos = 1 AND ativo = 1
        )
      ORDER BY a.created_at DESC
    `, [userId], (err, aprovacoesRows) => {
      if (err) {
        console.error('❌ Erro ao buscar aprovações pendentes:', err);
        // Continuar mesmo se houver erro
      }

      const notificacoesLembretes = (rows || []).map(row => ({
        id: row.id,
        tipo: row.tipo,
        titulo: `Lembrete: ${row.numero_proposta}`,
        mensagem: row.lembrete_mensagem || `Lembrete para proposta ${row.numero_proposta}`,
        data: row.lembrete_data,
        prioridade: row.prioridade,
        proposta_id: row.id,
        cliente_nome: row.cliente_nome,
        numero_proposta: row.numero_proposta
      }));

      const notificacoesAprovacoes = (aprovacoesRows || []).map(row => ({
        id: `aprovacao_${row.id}`,
        tipo: 'aprovacao_desconto',
        titulo: `Aprovação de Desconto: ${row.numero_proposta}`,
        mensagem: `Solicitação de aprovação de desconto de ${row.valor_desconto}% na proposta ${row.numero_proposta}${row.cliente_nome ? ` - ${row.cliente_nome}` : ''}`,
        data: row.created_at,
        prioridade: 'alta',
        aprovacao_id: row.id,
        proposta_id: row.proposta_id,
        cliente_nome: row.cliente_nome,
        numero_proposta: row.numero_proposta,
        valor_desconto: row.valor_desconto,
        valor_total: row.valor_total,
        valor_com_desconto: row.valor_com_desconto,
        valor_desconto_rs: row.valor_desconto_rs,
        solicitado_por_nome: row.solicitado_por_nome
      }));

      const todasNotificacoes = [...notificacoesLembretes, ...notificacoesAprovacoes];
      
      console.log(`✅ Retornando ${todasNotificacoes.length} notificações (${notificacoesLembretes.length} lembretes, ${notificacoesAprovacoes.length} aprovações)`);
      res.json(todasNotificacoes);
    });
  });
});

// ========== ROTAS DE CHAT ==========
// Listar conversas do usuário
app.get('/api/chat/conversas', authenticateToken, (req, res) => {
  const userId = req.user.id;
  
  db.all(`
    SELECT DISTINCT
      c.id,
      c.tipo,
      c.nome,
      c.descricao,
      c.projeto_id,
      c.cliente_id,
      c.proposta_id,
      c.avatar_url,
      c.created_at,
      c.updated_at,
      u1.nome as criado_por_nome,
      u1.email as criado_por_email,
      -- Última mensagem
      (SELECT m.mensagem FROM mensagens m 
       WHERE m.conversa_id = c.id AND m.excluida = 0 
       ORDER BY m.created_at DESC LIMIT 1) as ultima_mensagem_texto,
      (SELECT m.created_at FROM mensagens m 
       WHERE m.conversa_id = c.id AND m.excluida = 0 
       ORDER BY m.created_at DESC LIMIT 1) as ultima_mensagem_data,
      (SELECT u2.nome FROM mensagens m 
       JOIN usuarios u2 ON m.usuario_id = u2.id
       WHERE m.conversa_id = c.id AND m.excluida = 0 
       ORDER BY m.created_at DESC LIMIT 1) as ultima_mensagem_usuario,
      -- Contagem de mensagens não lidas
      (SELECT COUNT(*) FROM mensagens m
       WHERE m.conversa_id = c.id 
       AND m.excluida = 0
       AND m.usuario_id != ?
       AND NOT EXISTS (
         SELECT 1 FROM mensagens_lidas ml 
         WHERE ml.mensagem_id = m.id AND ml.usuario_id = ?
       )) as nao_lidas
    FROM conversas c
    JOIN conversas_participantes cp ON c.id = cp.conversa_id
    LEFT JOIN usuarios u1 ON c.criado_por = u1.id
    WHERE cp.usuario_id = ? AND (cp.saiu_em IS NULL OR cp.saiu_em = '')
    ORDER BY c.updated_at DESC
  `, [userId, userId, userId], (err, conversas) => {
    if (err) {
      console.error('Erro ao buscar conversas:', err);
      return res.status(500).json({ error: 'Erro ao buscar conversas' });
    }
    
    // Para conversas privadas, buscar o outro participante
    Promise.all(conversas.map(conv => {
      if (conv.tipo === 'privada') {
        return new Promise((resolve) => {
          db.get(`
            SELECT u.id, u.nome, u.email
            FROM conversas_participantes cp
            JOIN usuarios u ON cp.usuario_id = u.id
            WHERE cp.conversa_id = ? AND cp.usuario_id != ?
          `, [conv.id, userId], (err, outroUsuario) => {
            if (!err && outroUsuario) {
              conv.outro_usuario = outroUsuario;
              conv.nome = outroUsuario.nome; // Nome do outro usuário para conversas privadas
            }
            resolve(conv);
          });
        });
      }
      return Promise.resolve(conv);
    })).then(conversasCompletas => {
      res.json(conversasCompletas);
    });
  });
});

// Criar conversa privada
app.post('/api/chat/conversas/privada', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const { outro_usuario_id } = req.body;
  
  if (!outro_usuario_id || outro_usuario_id === userId) {
    return res.status(400).json({ error: 'Usuário inválido' });
  }
  
  // Verificar se já existe conversa privada entre esses dois usuários
  db.get(`
    SELECT c.id
    FROM conversas c
    JOIN conversas_participantes cp1 ON c.id = cp1.conversa_id
    JOIN conversas_participantes cp2 ON c.id = cp2.conversa_id
    WHERE c.tipo = 'privada'
    AND cp1.usuario_id = ? AND cp2.usuario_id = ?
    AND (cp1.saiu_em IS NULL OR cp1.saiu_em = '')
    AND (cp2.saiu_em IS NULL OR cp2.saiu_em = '')
  `, [userId, outro_usuario_id], (err, existente) => {
    if (err) {
      return res.status(500).json({ error: 'Erro ao verificar conversa existente' });
    }
    
    if (existente) {
      return res.json({ id: existente.id, existente: true });
    }
    
    // Criar nova conversa privada
    db.run(`
      INSERT INTO conversas (tipo, criado_por)
      VALUES ('privada', ?)
    `, [userId], function(err) {
      if (err) {
        return res.status(500).json({ error: 'Erro ao criar conversa' });
      }
      
      const conversaId = this.lastID;
      
      // Adicionar participantes
      db.run(`INSERT INTO conversas_participantes (conversa_id, usuario_id) VALUES (?, ?)`, [conversaId, userId], () => {});
      db.run(`INSERT INTO conversas_participantes (conversa_id, usuario_id) VALUES (?, ?)`, [conversaId, outro_usuario_id], (err) => {
        if (err) {
          return res.status(500).json({ error: 'Erro ao adicionar participante' });
        }
        res.json({ id: conversaId, existente: false });
      });
    });
  });
});

// Criar grupo
app.post('/api/chat/conversas/grupo', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const { nome, descricao, projeto_id, cliente_id, proposta_id, participantes } = req.body;
  
  if (!nome || !participantes || participantes.length === 0) {
    return res.status(400).json({ error: 'Nome e participantes são obrigatórios' });
  }
  
  db.run(`
    INSERT INTO conversas (tipo, nome, descricao, projeto_id, cliente_id, proposta_id, criado_por)
    VALUES ('grupo', ?, ?, ?, ?, ?, ?)
  `, [nome, descricao || null, projeto_id || null, cliente_id || null, proposta_id || null, userId], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Erro ao criar grupo' });
    }
    
    const conversaId = this.lastID;
    
    // Adicionar criador como participante
    const participantesIds = [userId, ...participantes];
    
    let adicionados = 0;
    participantesIds.forEach(participanteId => {
      db.run(`INSERT INTO conversas_participantes (conversa_id, usuario_id) VALUES (?, ?)`, 
        [conversaId, participanteId], (err) => {
          if (!err) adicionados++;
          if (adicionados === participantesIds.length) {
            res.json({ id: conversaId });
          }
        });
    });
  });
});

// Buscar mensagens de uma conversa
app.get('/api/chat/conversas/:id/mensagens', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const conversaId = req.params.id;
  const { limit = 50, offset = 0 } = req.query;
  
  // Verificar se o usuário é participante
  db.get(`SELECT 1 FROM conversas_participantes WHERE conversa_id = ? AND usuario_id = ? AND (saiu_em IS NULL OR saiu_em = '')`, 
    [conversaId, userId], (err, participante) => {
    if (err || !participante) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    
    db.all(`
      SELECT 
        m.id,
        m.conversa_id,
        m.usuario_id,
        m.mensagem,
        m.tipo,
        m.arquivo_url,
        m.arquivo_nome,
        m.arquivo_tamanho,
        m.arquivo_tipo,
        m.editada,
        m.editada_em,
        m.excluida,
        m.resposta_para,
        m.created_at,
        u.nome as usuario_nome,
        u.email as usuario_email,
        -- Verificar se foi lida pelo usuário atual
        EXISTS(SELECT 1 FROM mensagens_lidas WHERE mensagem_id = m.id AND usuario_id = ?) as lida
      FROM mensagens m
      JOIN usuarios u ON m.usuario_id = u.id
      WHERE m.conversa_id = ? AND m.excluida = 0
      ORDER BY m.created_at DESC
      LIMIT ? OFFSET ?
    `, [userId, conversaId, parseInt(limit), parseInt(offset)], (err, mensagens) => {
      if (err) {
        return res.status(500).json({ error: 'Erro ao buscar mensagens' });
      }
      
      // Buscar mensagens respondidas
      const mensagensComResposta = mensagens.map(msg => {
        if (msg.resposta_para) {
          return new Promise((resolve) => {
            db.get(`
              SELECT m.id, m.mensagem, u.nome as usuario_nome
              FROM mensagens m
              JOIN usuarios u ON m.usuario_id = u.id
              WHERE m.id = ?
            `, [msg.resposta_para], (err, resposta) => {
              if (!err && resposta) {
                msg.resposta = resposta;
              }
              resolve(msg);
            });
          });
        }
        return Promise.resolve(msg);
      });
      
      Promise.all(mensagensComResposta).then(msgs => {
        res.json(msgs.reverse()); // Reverter para ordem cronológica
      });
    });
  });
});

// Enviar mensagem
app.post('/api/chat/conversas/:id/mensagens', authenticateToken, uploadChat.single('arquivo'), (req, res) => {
  const userId = req.user.id;
  const conversaId = req.params.id;
  const { mensagem, tipo = 'texto', resposta_para } = req.body;
  
  // Verificar se o usuário é participante
  db.get(`SELECT 1 FROM conversas_participantes WHERE conversa_id = ? AND usuario_id = ? AND (saiu_em IS NULL OR saiu_em = '')`, 
    [conversaId, userId], (err, participante) => {
    if (err || !participante) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    
    let arquivoUrl = null;
    let arquivoNome = null;
    let arquivoTamanho = null;
    let arquivoTipo = null;
    let tipoMensagem = tipo;
    
    if (req.file) {
      arquivoUrl = `/api/uploads/chat/${req.file.filename}`;
      arquivoNome = req.file.originalname;
      arquivoTamanho = req.file.size;
      arquivoTipo = req.file.mimetype;
      
      // Determinar tipo baseado no MIME type
      if (req.file.mimetype.startsWith('image/')) {
        tipoMensagem = 'imagem';
      } else {
        tipoMensagem = 'arquivo';
      }
    }
    
    db.run(`
      INSERT INTO mensagens (conversa_id, usuario_id, mensagem, tipo, arquivo_url, arquivo_nome, arquivo_tamanho, arquivo_tipo, resposta_para)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [conversaId, userId, mensagem || '', tipoMensagem, arquivoUrl, arquivoNome, arquivoTamanho, arquivoTipo, resposta_para || null], function(err) {
      if (err) {
        return res.status(500).json({ error: 'Erro ao enviar mensagem' });
      }
      
      const mensagemId = this.lastID;
      
      // Marcar como lida pelo remetente
      db.run(`INSERT OR IGNORE INTO mensagens_lidas (mensagem_id, usuario_id) VALUES (?, ?)`, [mensagemId, userId]);
      
      // Atualizar updated_at da conversa
      db.run(`UPDATE conversas SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [conversaId]);
      
      // Buscar mensagem completa para retornar
      db.get(`
        SELECT 
          m.*,
          u.nome as usuario_nome,
          u.email as usuario_email
        FROM mensagens m
        JOIN usuarios u ON m.usuario_id = u.id
        WHERE m.id = ?
      `, [mensagemId], (err, mensagemCompleta) => {
        if (!err) {
          // Notificar outros participantes (será implementado com WebSocket ou polling)
          res.json(mensagemCompleta);
        } else {
          res.json({ id: mensagemId });
        }
      });
    });
  });
});

// Marcar mensagens como lidas
app.post('/api/chat/conversas/:id/marcar-lidas', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const conversaId = req.params.id;
  
  db.run(`
    INSERT INTO mensagens_lidas (mensagem_id, usuario_id)
    SELECT m.id, ?
    FROM mensagens m
    WHERE m.conversa_id = ? 
    AND m.usuario_id != ?
    AND m.excluida = 0
    AND NOT EXISTS (
      SELECT 1 FROM mensagens_lidas ml 
      WHERE ml.mensagem_id = m.id AND ml.usuario_id = ?
    )
  `, [userId, conversaId, userId, userId], (err) => {
    if (err) {
      return res.status(500).json({ error: 'Erro ao marcar como lidas' });
    }
    res.json({ success: true });
  });
});

// Adicionar participante ao grupo
app.post('/api/chat/conversas/:id/participantes', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const conversaId = req.params.id;
  const { usuario_id } = req.body;
  
  // Verificar se é grupo e se o usuário é participante
  db.get(`
    SELECT c.tipo, cp.usuario_id
    FROM conversas c
    LEFT JOIN conversas_participantes cp ON c.id = cp.conversa_id AND cp.usuario_id = ?
    WHERE c.id = ?
  `, [userId, conversaId], (err, result) => {
    if (err || !result || result.tipo !== 'grupo' || !result.usuario_id) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    
    db.run(`INSERT OR IGNORE INTO conversas_participantes (conversa_id, usuario_id) VALUES (?, ?)`, 
      [conversaId, usuario_id], (err) => {
      if (err) {
        return res.status(500).json({ error: 'Erro ao adicionar participante' });
      }
      res.json({ success: true });
    });
  });
});

// Remover participante do grupo (ou sair)
app.delete('/api/chat/conversas/:id/participantes/:usuario_id', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const conversaId = req.params.id;
  const usuarioIdRemover = parseInt(req.params.usuario_id);
  
  // Só pode remover se for o próprio usuário ou se for admin/criador do grupo
  if (usuarioIdRemover !== userId) {
    db.get(`SELECT criado_por FROM conversas WHERE id = ?`, [conversaId], (err, conv) => {
      if (err || !conv || conv.criado_por !== userId) {
        return res.status(403).json({ error: 'Acesso negado' });
      }
    });
  }
  
  db.run(`UPDATE conversas_participantes SET saiu_em = CURRENT_TIMESTAMP WHERE conversa_id = ? AND usuario_id = ?`, 
    [conversaId, usuarioIdRemover], (err) => {
    if (err) {
      return res.status(500).json({ error: 'Erro ao remover participante' });
    }
    res.json({ success: true });
  });
});

// Listar participantes de uma conversa
app.get('/api/chat/conversas/:id/participantes', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const conversaId = req.params.id;
  
  // Verificar se é participante
  db.get(`SELECT 1 FROM conversas_participantes WHERE conversa_id = ? AND usuario_id = ? AND (saiu_em IS NULL OR saiu_em = '')`, 
    [conversaId, userId], (err, participante) => {
    if (err || !participante) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    
    db.all(`
      SELECT 
        u.id,
        u.nome,
        u.email,
        u.cargo,
        cp.adicionado_em
      FROM conversas_participantes cp
      JOIN usuarios u ON cp.usuario_id = u.id
      WHERE cp.conversa_id = ? AND (cp.saiu_em IS NULL OR cp.saiu_em = '')
      ORDER BY cp.adicionado_em
    `, [conversaId], (err, participantes) => {
      if (err) {
        return res.status(500).json({ error: 'Erro ao buscar participantes' });
      }
      res.json(participantes);
    });
  });
});

// Buscar usuários para adicionar ao grupo
app.get('/api/chat/usuarios', authenticateToken, (req, res) => {
  const { search = '' } = req.query;
  
  db.all(`
    SELECT id, nome, email, cargo
    FROM usuarios
    WHERE ativo = 1 AND (nome LIKE ? OR email LIKE ?)
    ORDER BY nome
    LIMIT 20
  `, [`%${search}%`, `%${search}%`], (err, usuarios) => {
    if (err) {
      return res.status(500).json({ error: 'Erro ao buscar usuários' });
    }
    res.json(usuarios);
  });
});

// ========== ROTAS DE UPLOAD E DOWNLOAD DE COTAÇÕES ==========
// Servir arquivos estáticos de uploads
app.use('/api/uploads/cotacoes', express.static(uploadsDir));

// ========== ROTAS DE UPLOAD E DOWNLOAD DE IMAGENS DE PRODUTOS ==========
// Servir arquivos estáticos de imagens de produtos
app.use('/api/uploads/produtos', express.static(uploadsProdutosDir));

// ========== ROTAS DE UPLOAD E DOWNLOAD DE LOGOS ==========
// Servir arquivos estáticos de logos
app.use('/api/uploads/logos', express.static(uploadsLogosDir));

// ========== ROTAS DE UPLOAD E DOWNLOAD DE IMAGENS DE CABEÇALHO ==========
// Servir arquivos estáticos de imagens de cabeçalho
app.use('/api/uploads/headers', express.static(uploadsHeaderDir));

// ========== ROTAS DE UPLOAD E DOWNLOAD DE IMAGENS DE RODAPÉ ==========
// Servir arquivos estáticos de imagens de rodapé com headers para evitar cache
app.use('/api/uploads/footers', (req, res, next) => {
  // Adicionar headers para evitar cache
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
}, express.static(uploadsFooterDir));

// Contrato anexo (Word/PDF) – download para anexar à proposta
app.use('/api/uploads/contrato', express.static(uploadsContratoDir));

// ========== ROTAS DE UPLOAD E DOWNLOAD DE CHAT ==========
// Servir arquivos estáticos de chat
app.use('/api/uploads/chat', express.static(uploadsChatDir));

// Servir logo.png do public (logo padrão)
const publicLogoPath = path.join(__dirname, '..', 'client', 'public', 'logo.png');
app.get('/logo.png', (req, res) => {
  if (fs.existsSync(publicLogoPath)) {
    res.sendFile(publicLogoPath);
  } else {
    res.status(404).send('Logo not found');
  }
});

// Servir cabecalho.jpg do public (mantido para compatibilidade)
const publicCabecalhoPath = path.join(__dirname, '..', 'client', 'public', 'cabecalho.jpg');
app.get('/cabecalho.jpg', (req, res) => {
  // Adicionar headers para evitar cache
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  if (fs.existsSync(publicCabecalhoPath)) {
    res.sendFile(publicCabecalhoPath);
  } else {
    res.status(404).send('Imagem de cabeçalho não encontrada');
  }
});

// Servir CBC2.png do public (mantido para compatibilidade)
const publicCBC2Path = path.join(__dirname, '..', 'client', 'public', 'CBC2.png');
app.get('/CBC2.png', (req, res) => {
  if (fs.existsSync(publicCBC2Path)) {
    res.sendFile(publicCBC2Path);
  } else {
    res.status(404).send('Imagem CBC2 não encontrada');
  }
});

// Servir CABECALHO.PNG do public (imagem de fundo do cabeçalho)
const publicCabecalhoPNGPath = path.join(__dirname, '..', 'client', 'public', 'CABECALHO.PNG');
app.get('/CABECALHO.PNG', (req, res) => {
  // Adicionar headers para evitar cache
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  if (fs.existsSync(publicCabecalhoPNGPath)) {
    res.sendFile(publicCabecalhoPNGPath);
  } else {
    res.status(404).send('Imagem CABECALHO.PNG não encontrada');
  }
});

// Servir Logo_MY.jpg do public (logo do Moinho Ypiranga - lado esquerdo)
const publicLogoMYPath = path.join(__dirname, '..', 'client', 'public', 'Logo_MY.jpg');
app.get('/Logo_MY.jpg', (req, res) => {
  if (fs.existsSync(publicLogoMYPath)) {
    res.sendFile(publicLogoMYPath);
  } else {
    // Tentar outras extensões comuns
    const extensions = ['.jpg', '.jpeg', '.png', '.svg'];
    let found = false;
    for (const ext of extensions) {
      const logoPath = path.join(__dirname, '..', 'client', 'public', 'Logo_MY' + ext);
      if (fs.existsSync(logoPath)) {
        res.sendFile(logoPath);
        found = true;
        break;
      }
    }
    if (!found) {
      // Fallback para logo.png
      if (fs.existsSync(publicLogoPath)) {
        res.sendFile(publicLogoPath);
      } else {
        res.status(404).send('Logo_MY not found');
      }
    }
  }
});

// Servir logo-gmp.png do public (logo do GMP - lado direito)
const publicLogoGMPPath = path.join(__dirname, '..', 'client', 'public', 'logo-gmp.png');
app.get('/logo-gmp.png', (req, res) => {
  if (fs.existsSync(publicLogoGMPPath)) {
    res.sendFile(publicLogoGMPPath);
  } else {
    // Se não encontrar logo-gmp.png, usar logo.png como fallback
    if (fs.existsSync(publicLogoPath)) {
      res.sendFile(publicLogoPath);
    } else {
      res.status(404).send('Logo GMP not found');
    }
  }
});

// Upload de imagem de produto
app.post('/api/produtos/:id/imagem', authenticateToken, uploadProduto.single('imagem'), (req, res) => {
  const { id } = req.params;
  
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhuma imagem enviada' });
  }
  
  // Verificar se o produto existe
  db.get('SELECT * FROM produtos WHERE id = ?', [id], (err, produto) => {
    if (err) {
      // Deletar arquivo se houver erro
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(500).json({ error: err.message });
    }
    
    if (!produto) {
      // Deletar arquivo se produto não existir
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(404).json({ error: 'Produto não encontrado' });
    }
    
    // Se já existe uma imagem, deletar o arquivo antigo
    if (produto.imagem) {
      const oldFilePath = path.join(uploadsProdutosDir, produto.imagem);
      if (fs.existsSync(oldFilePath)) {
        fs.unlinkSync(oldFilePath);
      }
    }
    
    // Atualizar produto com a nova imagem
    const filename = req.file.filename;
    db.run(
      'UPDATE produtos SET imagem = ? WHERE id = ?',
      [filename, id],
      (err) => {
        if (err) {
          // Deletar arquivo se houver erro ao salvar no banco
          if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
          }
          return res.status(500).json({ error: err.message });
        }
        
        res.json({ 
          message: 'Imagem enviada com sucesso',
          filename: filename,
          url: `/api/uploads/produtos/${filename}`
        });
      }
    );
  });
});

// Upload de cotação
app.post('/api/propostas/:id/anexar-cotacao', authenticateToken, upload.single('arquivo'), (req, res) => {
  const { id } = req.params;
  
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  }
  
  // Verificar se a proposta existe
  db.get('SELECT * FROM propostas WHERE id = ?', [id], (err, proposta) => {
    if (err) {
      // Deletar arquivo se houver erro
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(500).json({ error: err.message });
    }
    
    if (!proposta) {
      // Deletar arquivo se proposta não existir
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(404).json({ error: 'Proposta não encontrada' });
    }
    
    // Se já existe um anexo, deletar o arquivo antigo
    if (proposta.anexo_cotacao) {
      const oldFilePath = path.join(uploadsDir, proposta.anexo_cotacao);
      if (fs.existsSync(oldFilePath)) {
        fs.unlinkSync(oldFilePath);
      }
    }
    
    // Atualizar proposta com o novo anexo
    const filename = req.file.filename;
    db.run(
      'UPDATE propostas SET anexo_cotacao = ? WHERE id = ?',
      [filename, id],
      (err) => {
        if (err) {
          // Deletar arquivo se houver erro ao salvar no banco
          if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
          }
          return res.status(500).json({ error: err.message });
        }
        
        res.json({
          success: true,
          message: 'Cotação anexada com sucesso',
          filename: filename,
          originalName: req.file.originalname,
          size: req.file.size
        });
      }
    );
  });
});

// Download de cotação
app.get('/api/propostas/:id/cotacao', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  db.get('SELECT anexo_cotacao FROM propostas WHERE id = ?', [id], (err, proposta) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    if (!proposta || !proposta.anexo_cotacao) {
      return res.status(404).json({ error: 'Cotação não encontrada' });
    }
    
    const filePath = path.join(uploadsDir, proposta.anexo_cotacao);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Arquivo não encontrado no servidor' });
    }
    
    // Extrair nome do arquivo original (remover prefixo se houver)
    let downloadName = proposta.anexo_cotacao;
    // Se o nome começa com "cotacao_", tentar extrair o nome original
    if (downloadName.startsWith('cotacao_')) {
      const parts = downloadName.split('_');
      if (parts.length >= 3) {
        // Pegar tudo após o timestamp
        const timestampIndex = parts.findIndex(p => /^\d+$/.test(p));
        if (timestampIndex !== -1 && timestampIndex < parts.length - 1) {
          downloadName = parts.slice(timestampIndex + 1).join('_');
        }
      }
    }
    
    // Definir headers apropriados
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    
    // Enviar arquivo
    res.sendFile(filePath, (err) => {
      if (err) {
        console.error('Erro ao fazer download:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Erro ao fazer download do arquivo' });
        }
      }
    });
  });
});

// Remover cotação
app.delete('/api/propostas/:id/cotacao', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  db.get('SELECT anexo_cotacao FROM propostas WHERE id = ?', [id], (err, proposta) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    if (!proposta || !proposta.anexo_cotacao) {
      return res.status(404).json({ error: 'Cotação não encontrada' });
    }
    
    const filePath = path.join(uploadsDir, proposta.anexo_cotacao);
    
    // Deletar arquivo
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    // Atualizar banco de dados
    db.run('UPDATE propostas SET anexo_cotacao = NULL WHERE id = ?', [id], (err) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      res.json({ success: true, message: 'Cotação removida com sucesso' });
    });
  });
});

// ========== ROTA DE DASHBOARD DE VENDAS ==========
app.get('/api/dashboard/vendas', authenticateToken, (req, res) => {
  const dados = {
    funilVendas: [],
    pipeline: {
      valorTotal: 0,
      valorPorEtapa: {},
      tempoMedioPorEtapa: {},
      previsaoFechamento: []
    },
    analisePipeline: {
      totalPropostas: 0,
      valorTotal: 0,
      taxaConversao: 0,
      tempoMedioFechamento: 0
    }
  };

  let completed = 0;
  const total = 6;

  const checkComplete = () => {
    completed++;
    if (completed === total) {
      // Calcular totais
      dados.analisePipeline.valorTotal = Object.values(dados.pipeline.valorPorEtapa).reduce((sum, val) => sum + (val || 0), 0);
      dados.analisePipeline.totalPropostas = dados.funilVendas.reduce((sum, etapa) => sum + (etapa.quantidade || 0), 0);
      
      const aprovadas = dados.funilVendas.find(e => e.etapa === 'Aprovadas')?.quantidade || 0;
      const enviadas = dados.funilVendas.find(e => e.etapa === 'Enviadas')?.quantidade || 0;
      const rejeitadas = dados.funilVendas.find(e => e.etapa === 'Rejeitadas')?.quantidade || 0;
      
      // Taxa de conversão = (aprovadas / (enviadas + aprovadas + rejeitadas)) * 100
      // Ou seja, aprovadas dividido pelo total de propostas processadas
      const totalProcessadas = enviadas + aprovadas + rejeitadas;
      dados.analisePipeline.taxaConversao = totalProcessadas > 0 
        ? Math.min((aprovadas / totalProcessadas) * 100, 100) // Limitar a 100%
        : 0;
      
      res.json(dados);
    }
  };

  // 1. Funil de Vendas - Contagem por status
  db.all(`
    SELECT 
      CASE 
        WHEN status = 'rascunho' THEN 'Rascunho'
        WHEN status = 'enviada' THEN 'Enviadas'
        WHEN status = 'aprovada' THEN 'Aprovadas'
        WHEN status = 'rejeitada' THEN 'Rejeitadas'
        ELSE 'Outros'
      END as etapa,
      COUNT(*) as quantidade,
      SUM(valor_total) as valor_total
    FROM propostas
    GROUP BY status
    ORDER BY 
      CASE status
        WHEN 'rascunho' THEN 1
        WHEN 'enviada' THEN 2
        WHEN 'aprovada' THEN 3
        WHEN 'rejeitada' THEN 4
        ELSE 5
      END
  `, [], (err, rows) => {
    if (!err) {
      dados.funilVendas = (rows || []).map(row => ({
        etapa: row.etapa,
        quantidade: row.quantidade || 0,
        valor: row.valor_total || 0,
        porcentagem: 0 // Será calculado depois
      }));
    }
    checkComplete();
  });

  // 2. Valor por etapa
  db.all(`
    SELECT 
      status,
      SUM(valor_total) as valor_total
    FROM propostas
    WHERE status IN ('rascunho', 'enviada', 'aprovada', 'rejeitada')
    GROUP BY status
  `, [], (err, rows) => {
    if (!err) {
      (rows || []).forEach(row => {
        const etapa = row.status === 'rascunho' ? 'Rascunho' :
                     row.status === 'enviada' ? 'Enviadas' :
                     row.status === 'aprovada' ? 'Aprovadas' :
                     row.status === 'rejeitada' ? 'Rejeitadas' : 'Outros';
        dados.pipeline.valorPorEtapa[etapa] = row.valor_total || 0;
      });
    }
    checkComplete();
  });

  // 3. Tempo médio por etapa (dias desde criação até mudança de status)
  db.all(`
    SELECT 
      status,
      AVG(julianday('now') - julianday(created_at)) as tempo_medio_dias
    FROM propostas
    WHERE status IN ('enviada', 'aprovada', 'rejeitada')
    GROUP BY status
  `, [], (err, rows) => {
    if (!err) {
      (rows || []).forEach(row => {
        const etapa = row.status === 'enviada' ? 'Enviadas' :
                     row.status === 'aprovada' ? 'Aprovadas' :
                     row.status === 'rejeitada' ? 'Rejeitadas' : 'Outros';
        dados.pipeline.tempoMedioPorEtapa[etapa] = Math.round(row.tempo_medio_dias || 0);
      });
    }
    checkComplete();
  });

  // 4. Previsão de fechamento - Propostas enviadas com validade próxima
  db.all(`
    SELECT 
      p.id,
      p.numero_proposta,
      p.titulo,
      p.valor_total,
      p.validade,
      p.created_at,
      c.razao_social as cliente_nome,
      u.nome as responsavel_nome,
      julianday(p.validade) - julianday('now') as dias_restantes
    FROM propostas p
    LEFT JOIN clientes c ON p.cliente_id = c.id
    LEFT JOIN usuarios u ON p.responsavel_id = u.id
    WHERE p.status = 'enviada' 
      AND p.validade IS NOT NULL
      AND julianday(p.validade) >= julianday('now')
    ORDER BY p.validade ASC
    LIMIT 20
  `, [], (err, rows) => {
    if (!err) {
      dados.pipeline.previsaoFechamento = (rows || []).map(row => ({
        id: row.id,
        numero_proposta: row.numero_proposta,
        titulo: row.titulo,
        valor: row.valor_total || 0,
        validade: row.validade,
        dias_restantes: Math.round(row.dias_restantes || 0),
        cliente_nome: row.cliente_nome,
        responsavel_nome: row.responsavel_nome,
        probabilidade: row.dias_restantes <= 7 ? 80 : row.dias_restantes <= 15 ? 60 : 40
      }));
    }
    checkComplete();
  });

  // 5. Tempo médio de fechamento (criação até aprovação)
  db.get(`
    SELECT 
      AVG(julianday(updated_at) - julianday(created_at)) as tempo_medio_dias
    FROM propostas
    WHERE status = 'aprovada'
      AND updated_at IS NOT NULL
  `, [], (err, row) => {
    if (!err && row) {
      dados.analisePipeline.tempoMedioFechamento = Math.round(row.tempo_medio_dias || 0);
    }
    checkComplete();
  });

  // 6. Valor total do pipeline (todas as propostas não rejeitadas)
  db.get(`
    SELECT 
      SUM(valor_total) as valor_total
    FROM propostas
    WHERE status IN ('rascunho', 'enviada', 'aprovada')
  `, [], (err, row) => {
    if (!err && row) {
      dados.pipeline.valorTotal = row.valor_total || 0;
    }
    checkComplete();
  });
});

// ========== ROTAS DE CONFIGURAÇÕES ==========
// Obter todas as configurações
app.get('/api/configuracoes', authenticateToken, (req, res) => {
  db.all('SELECT * FROM configuracoes ORDER BY categoria, chave', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    const configs = {};
    rows.forEach(row => {
      if (!configs[row.categoria]) {
        configs[row.categoria] = {};
      }
      // Converter valor baseado no tipo
      let valor = row.valor;
      if (row.tipo === 'number') {
        valor = parseFloat(row.valor) || 0;
      } else if (row.tipo === 'boolean') {
        valor = row.valor === 'true' || row.valor === '1';
      } else if (row.tipo === 'json') {
        try {
          valor = JSON.parse(row.valor);
        } catch (e) {
          valor = row.valor;
        }
      }
      configs[row.categoria][row.chave] = valor;
    });
    res.json(configs);
  });
});

// Obter configuração específica
app.get('/api/configuracoes/:chave', authenticateToken, (req, res) => {
  const { chave } = req.params;
  db.get('SELECT * FROM configuracoes WHERE chave = ?', [chave], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: 'Configuração não encontrada' });
    }
    let valor = row.valor;
    if (row.tipo === 'number') {
      valor = parseFloat(row.valor) || 0;
    } else if (row.tipo === 'boolean') {
      valor = row.valor === 'true' || row.valor === '1';
    } else if (row.tipo === 'json') {
      try {
        valor = JSON.parse(row.valor);
      } catch (e) {
        valor = row.valor;
      }
    }
    res.json({ ...row, valor });
  });
});

// Atualizar configuração
app.put('/api/configuracoes/:chave', authenticateToken, (req, res) => {
  const { chave } = req.params;
  const { valor, tipo, categoria, descricao } = req.body;
  
  // Verificar se é admin
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Apenas administradores podem alterar configurações' });
  }

  let valorFinal = valor;
  if (tipo === 'json') {
    valorFinal = JSON.stringify(valor);
  } else {
    valorFinal = String(valor);
  }

  db.run(
    `INSERT INTO configuracoes (chave, valor, tipo, categoria, descricao, updated_at)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(chave) DO UPDATE SET
       valor = excluded.valor,
       tipo = COALESCE(excluded.tipo, tipo),
       categoria = COALESCE(excluded.categoria, categoria),
       descricao = COALESCE(excluded.descricao, descricao),
       updated_at = CURRENT_TIMESTAMP`,
    [chave, valorFinal, tipo || 'text', categoria || 'geral', descricao],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ message: 'Configuração atualizada com sucesso', chave, valor });
    }
  );
});

// ========== ROTAS DE ASSINATURA DIGITAL ==========
// Assinar proposta
app.post('/api/propostas/:id/assinar', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { tipo_assinatura, dados_assinatura } = req.body;
  const ipAddress = req.ip || req.connection.remoteAddress;
  const userAgent = req.get('user-agent');

  db.run(
    `INSERT INTO assinaturas_digitais 
     (proposta_id, usuario_id, tipo_assinatura, dados_assinatura, ip_address, user_agent, status)
     VALUES (?, ?, ?, ?, ?, ?, 'aprovada')`,
    [id, req.user.id, tipo_assinatura || 'eletronica', JSON.stringify(dados_assinatura), ipAddress, userAgent],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      // Atualizar status da proposta para aprovada
      db.run('UPDATE propostas SET status = ? WHERE id = ?', ['aprovada', id], (err) => {
        if (err) {
          console.error('Erro ao atualizar status da proposta:', err);
        }
      });

      res.json({ 
        message: 'Proposta assinada com sucesso',
        assinatura_id: this.lastID 
      });
    }
  );
});

// Obter assinaturas de uma proposta
app.get('/api/propostas/:id/assinaturas', authenticateToken, (req, res) => {
  const { id } = req.params;
  db.all(
    `SELECT 
      ad.*,
      u.nome as usuario_nome,
      u.email as usuario_email
     FROM assinaturas_digitais ad
     LEFT JOIN usuarios u ON ad.usuario_id = u.id
     WHERE ad.proposta_id = ?
     ORDER BY ad.created_at DESC`,
    [id],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      const assinaturas = rows.map(row => ({
        ...row,
        dados_assinatura: row.dados_assinatura ? JSON.parse(row.dados_assinatura) : null
      }));
      res.json(assinaturas);
    }
  );
});

// ========== ROTAS DE PERMISSÕES GRANULARES ==========
// Obter permissões de um usuário
app.get('/api/permissoes/usuario/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  // Apenas admin ou o próprio usuário
  if (req.user.role !== 'admin' && req.user.id !== parseInt(id)) {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  db.all(
    `SELECT * FROM permissoes WHERE usuario_id = ?`,
    [id],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json(rows);
    }
  );
});

// Verificar permissão específica (incluindo grupos)
app.get('/api/permissoes/verificar', authenticateToken, (req, res) => {
  const { modulo, acao, cliente_id, regiao } = req.query;
  const userId = req.user.id;

  // Admin tem todas as permissões
  if (req.user.role === 'admin') {
    return res.json({ permitido: true, motivo: 'admin' });
  }

  // Verificar permissões diretas do usuário
  db.get(
    `SELECT p.* FROM permissoes p
     WHERE p.usuario_id = ?
       AND p.modulo = ?
       AND p.acao = ?
       AND (p.restricao_cliente_id IS NULL OR p.restricao_cliente_id = ?)
       AND (p.restricao_regiao IS NULL OR p.restricao_regiao = ?)
     LIMIT 1`,
    [userId, modulo, acao, cliente_id || null, regiao || null],
    (err, row) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      // Se encontrou permissão direta, retornar
      if (row) {
        return res.json({ 
          permitido: row.permissao === 1,
          motivo: row.permissao === 1 ? 'permissao_explicita' : 'negado_explicito'
        });
      }

      // Se não encontrou, verificar grupos do usuário
      db.get(
        `SELECT p.* FROM permissoes p
         INNER JOIN usuarios_grupos ug ON p.grupo_id = ug.grupo_id
         INNER JOIN grupos_permissoes gp ON ug.grupo_id = gp.id
         WHERE ug.usuario_id = ?
           AND gp.ativo = 1
           AND p.modulo = ?
           AND p.acao = ?
           AND (p.restricao_cliente_id IS NULL OR p.restricao_cliente_id = ?)
           AND (p.restricao_regiao IS NULL OR p.restricao_regiao = ?)
         LIMIT 1`,
        [userId, modulo, acao, cliente_id || null, regiao || null],
        (err, grupoRow) => {
          if (err) {
            return res.status(500).json({ error: err.message });
          }
          
          const permitido = grupoRow && grupoRow.permissao === 1;
          res.json({ 
            permitido,
            motivo: permitido ? 'permissao_grupo' : 'sem_permissao'
          });
        }
      );
    }
  );
});

// Criar/Atualizar permissão
app.post('/api/permissoes', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Apenas administradores podem gerenciar permissões' });
  }

  const { usuario_id, grupo_id, modulo, acao, permissao, restricao_cliente_id, restricao_regiao } = req.body;

  // Verificar se a permissão já existe
  const query = usuario_id 
    ? `SELECT id FROM permissoes 
       WHERE usuario_id = ? AND grupo_id IS NULL AND modulo = ? AND acao = ?`
    : `SELECT id FROM permissoes 
       WHERE usuario_id IS NULL AND grupo_id = ? AND modulo = ? AND acao = ?`;
  
  const params = usuario_id 
    ? [usuario_id, modulo, acao]
    : [grupo_id, modulo, acao];
  
  db.get(query, params, (err, existing) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      if (existing) {
        // Se permissão for false, deletar; caso contrário, atualizar
        if (!permissao) {
          db.run('DELETE FROM permissoes WHERE id = ?', [existing.id], (err) => {
            if (err) {
              return res.status(500).json({ error: err.message });
            }
            res.json({ message: 'Permissão removida com sucesso' });
          });
        } else {
          db.run(
            `UPDATE permissoes 
             SET permissao = ?, restricao_cliente_id = ?, restricao_regiao = ?
             WHERE id = ?`,
            [permissao ? 1 : 0, restricao_cliente_id, restricao_regiao, existing.id],
            (err) => {
              if (err) {
                return res.status(500).json({ error: err.message });
              }
              res.json({ message: 'Permissão atualizada com sucesso', id: existing.id });
            }
          );
        }
      } else {
        // Se permissão for false, não criar (já que não existe)
        if (!permissao) {
          return res.json({ message: 'Permissão não existe, nada a fazer' });
        }
        
        // Criar nova permissão
        db.run(
          `INSERT INTO permissoes 
           (usuario_id, grupo_id, modulo, acao, permissao, restricao_cliente_id, restricao_regiao)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [usuario_id, grupo_id, modulo, acao, permissao ? 1 : 0, restricao_cliente_id, restricao_regiao],
          function(err) {
            if (err) {
              return res.status(500).json({ error: err.message });
            }
            res.json({ message: 'Permissão criada com sucesso', id: this.lastID });
          }
        );
      }
    }
  );
});

// Grupos de Permissões
app.get('/api/permissoes/grupos', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  db.all('SELECT * FROM grupos_permissoes ORDER BY nome', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

app.get('/api/permissoes/grupos/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  const { id } = req.params;
  db.get('SELECT * FROM grupos_permissoes WHERE id = ?', [id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: 'Grupo não encontrado' });
    }
    res.json(row);
  });
});

app.post('/api/permissoes/grupos', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  const { nome, descricao, ativo } = req.body;
  db.run(
    'INSERT INTO grupos_permissoes (nome, descricao, ativo) VALUES (?, ?, ?)',
    [nome, descricao, ativo !== undefined ? (ativo ? 1 : 0) : 1],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ message: 'Grupo criado com sucesso', id: this.lastID });
    }
  );
});

app.put('/api/permissoes/grupos/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  const { id } = req.params;
  const { nome, descricao, ativo } = req.body;
  db.run(
    'UPDATE grupos_permissoes SET nome = ?, descricao = ?, ativo = ? WHERE id = ?',
    [nome, descricao, ativo !== undefined ? (ativo ? 1 : 0) : 1, id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ message: 'Grupo atualizado com sucesso' });
    }
  );
});

app.delete('/api/permissoes/grupos/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  const { id } = req.params;
  db.run('DELETE FROM grupos_permissoes WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ message: 'Grupo excluído com sucesso' });
  });
});

// Usuários em Grupos
app.get('/api/permissoes/grupos/:id/usuarios', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  const { id } = req.params;
  db.all(
    `SELECT u.* FROM usuarios u
     INNER JOIN usuarios_grupos ug ON u.id = ug.usuario_id
     WHERE ug.grupo_id = ?`,
    [id],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json(rows);
    }
  );
});

app.post('/api/permissoes/grupos/:id/usuarios', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  const { id } = req.params;
  const { usuario_id } = req.body;
  db.run(
    'INSERT OR IGNORE INTO usuarios_grupos (usuario_id, grupo_id) VALUES (?, ?)',
    [usuario_id, id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ message: 'Usuário adicionado ao grupo com sucesso' });
    }
  );
});

app.delete('/api/permissoes/grupos/:id/usuarios/:usuario_id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  const { id, usuario_id } = req.params;
  db.run(
    'DELETE FROM usuarios_grupos WHERE grupo_id = ? AND usuario_id = ?',
    [id, usuario_id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ message: 'Usuário removido do grupo com sucesso' });
    }
  );
});

// Permissões de um Grupo
app.get('/api/permissoes/grupos/:id/permissoes', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  const { id } = req.params;
  db.all(
    'SELECT * FROM permissoes WHERE grupo_id = ?',
    [id],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json(rows);
    }
  );
});

// ========== BUSCA GLOBAL ==========
app.get('/api/busca-global', authenticateToken, (req, res) => {
  const query = req.query.q || '';
  if (!query || query.length < 2) {
    return res.json([]);
  }

  const searchTerm = `%${query}%`;
  const results = [];

  // Buscar clientes (case-insensitive)
  db.all(
    `SELECT id, razao_social as title, cidade || ', ' || estado as subtitle, 'cliente' as type 
     FROM clientes 
     WHERE LOWER(razao_social) LIKE LOWER(?) OR LOWER(nome_fantasia) LIKE LOWER(?) OR LOWER(cnpj) LIKE LOWER(?)
     LIMIT 5`,
    [searchTerm, searchTerm, searchTerm],
    (err, rows) => {
      if (!err && rows) {
        results.push(...rows);
      }

      // Buscar projetos (case-insensitive)
      db.all(
        `SELECT id, nome as title, status as subtitle, 'projeto' as type 
         FROM projetos 
         WHERE LOWER(nome) LIKE LOWER(?) OR LOWER(descricao) LIKE LOWER(?)
         LIMIT 5`,
        [searchTerm, searchTerm],
        (err, rows) => {
          if (!err && rows) {
            results.push(...rows);
          }

          // Buscar propostas (case-insensitive) - CORRIGIDO: usar numero_proposta e incluir titulo
          db.all(
            `SELECT p.id, 
                    COALESCE(p.titulo, 'Proposta #' || p.numero_proposta) as title, 
                    COALESCE(c.razao_social, c.nome_fantasia, 'Cliente não encontrado') as subtitle, 
                    'proposta' as type 
             FROM propostas p
             LEFT JOIN clientes c ON p.cliente_id = c.id
             WHERE LOWER(p.numero_proposta) LIKE LOWER(?) 
                OR LOWER(p.titulo) LIKE LOWER(?) 
                OR LOWER(c.razao_social) LIKE LOWER(?) 
                OR LOWER(c.nome_fantasia) LIKE LOWER(?)
             LIMIT 5`,
            [searchTerm, searchTerm, searchTerm, searchTerm],
            (err, rows) => {
              if (!err && rows) {
                results.push(...rows);
              }

              // Buscar oportunidades (case-insensitive)
              db.all(
                `SELECT o.id, o.titulo as title, COALESCE(c.razao_social, c.nome_fantasia, 'Cliente não encontrado') as subtitle, 'oportunidade' as type 
                 FROM oportunidades o
                 LEFT JOIN clientes c ON o.cliente_id = c.id
                 WHERE LOWER(o.titulo) LIKE LOWER(?) OR LOWER(c.razao_social) LIKE LOWER(?) OR LOWER(c.nome_fantasia) LIKE LOWER(?)
                 LIMIT 5`,
                [searchTerm, searchTerm, searchTerm],
                (err, rows) => {
                  if (!err && rows) {
                    results.push(...rows);
                  }

                  // Buscar atividades (case-insensitive)
                  db.all(
                    `SELECT a.id, 
                            a.titulo as title, 
                            COALESCE(c.razao_social, c.nome_fantasia, 'Sem cliente') || ' • ' || COALESCE(a.tipo, 'atividade') as subtitle, 
                            'atividade' as type 
                     FROM atividades a
                     LEFT JOIN clientes c ON a.cliente_id = c.id
                     WHERE LOWER(a.titulo) LIKE LOWER(?) 
                        OR LOWER(a.descricao) LIKE LOWER(?)
                        OR LOWER(a.tipo) LIKE LOWER(?)
                     LIMIT 5`,
                    [searchTerm, searchTerm, searchTerm],
                    (err, rows) => {
                      if (!err && rows) {
                        results.push(...rows);
                      }

                      // Buscar produtos (case-insensitive) - CORRIGIDO: usar familia e incluir codigo e modelo
                      db.all(
                        `SELECT id, 
                                nome as title, 
                                COALESCE(familia, 'Geral') as subtitle, 
                                'produto' as type 
                         FROM produtos 
                         WHERE LOWER(nome) LIKE LOWER(?) 
                            OR LOWER(codigo) LIKE LOWER(?) 
                            OR LOWER(familia) LIKE LOWER(?)
                            OR LOWER(COALESCE(modelo, '')) LIKE LOWER(?)
                            OR LOWER(descricao) LIKE LOWER(?)
                         LIMIT 5`,
                        [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm],
                        (err, rows) => {
                          if (!err && rows) {
                            results.push(...rows);
                          }

                          res.json(results.slice(0, 20)); // Limitar a 20 resultados
                        }
                      );
                    }
                  );
                }
              );
            }
          );
        }
      );
    }
  );
});

// ========== ROTAS DE REPORTS ==========
app.get('/api/reports', authenticateToken, (req, res) => {
  // Por enquanto retornar array vazio, implementar tabela depois
  res.json([]);
});

app.post('/api/reports', authenticateToken, (req, res) => {
  // Por enquanto apenas retornar sucesso, implementar tabela depois
  res.json({ message: 'Relatório salvo com sucesso', id: Date.now() });
});

// ========== ROTAS DE WORKFLOWS ==========
app.get('/api/workflows', authenticateToken, (req, res) => {
  // Por enquanto retornar array vazio, implementar tabela depois
  res.json([]);
});

app.post('/api/workflows', authenticateToken, (req, res) => {
  // Por enquanto apenas retornar sucesso, implementar tabela depois
  res.json({ message: 'Workflow criado com sucesso', id: Date.now() });
});

app.put('/api/workflows/:id', authenticateToken, (req, res) => {
  // Por enquanto apenas retornar sucesso, implementar tabela depois
  res.json({ message: 'Workflow atualizado com sucesso' });
});

app.delete('/api/workflows/:id', authenticateToken, (req, res) => {
  // Por enquanto apenas retornar sucesso, implementar tabela depois
  res.json({ message: 'Workflow excluído com sucesso' });
});

// ========== ROTA DE FEEDBACK ==========
app.post('/api/feedback', authenticateToken, (req, res) => {
  try {
    const { rating, feedback, category, page, userAgent } = req.body;
    const userId = req.user.id;

    db.run(
      `INSERT INTO feedback (user_id, rating, feedback, category, page, user_agent, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      [userId, rating, feedback, category, page, userAgent],
      function(err) {
        if (err) {
          console.error('Erro ao salvar feedback:', err);
          return res.status(500).json({ error: 'Erro ao salvar feedback' });
        }
        res.json({ success: true, id: this.lastID });
      }
    );
  } catch (error) {
    console.error('Erro ao processar feedback:', error);
    res.status(500).json({ error: 'Erro ao processar feedback' });
  }
});

// Criar tabela de feedback se não existir
db.run(`
  CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    rating INTEGER,
    feedback TEXT,
    category TEXT,
    page TEXT,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES usuarios(id)
  )
`);

// ========== TABELAS MÓDULO COMPRAS ==========
db.run(`CREATE TABLE IF NOT EXISTS fornecedores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  razao_social TEXT NOT NULL,
  nome_fantasia TEXT,
  cnpj TEXT,
  contato TEXT,
  email TEXT,
  telefone TEXT,
  endereco TEXT,
  cidade TEXT,
  estado TEXT,
  cep TEXT,
  status TEXT DEFAULT 'ativo',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

db.run(`CREATE TABLE IF NOT EXISTS pedidos_compra (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero TEXT UNIQUE,
  fornecedor_id INTEGER NOT NULL,
  valor_total REAL DEFAULT 0,
  data_pedido DATE,
  previsao_entrega DATE,
  status TEXT DEFAULT 'pendente',
  observacoes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id)
)`);

db.run(`CREATE TABLE IF NOT EXISTS cotacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero TEXT UNIQUE,
  fornecedor_id INTEGER NOT NULL,
  valor_total REAL DEFAULT 0,
  data_cotacao DATE,
  validade DATE,
  status TEXT DEFAULT 'em_analise',
  observacoes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id)
)`);

// Grupos de fornecedores homologados (ex.: Insumos, Peças, Serviços)
db.run(`CREATE TABLE IF NOT EXISTS grupos_compras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  numero INTEGER DEFAULT 10,
  ordem INTEGER DEFAULT 0,
  foto TEXT,
  ativo INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);
db.run('ALTER TABLE fornecedores ADD COLUMN grupo_id INTEGER REFERENCES grupos_compras(id)', (e) => {
  if (e && e.message.indexOf('duplicate') === -1) console.error('Erro ao adicionar grupo_id em fornecedores:', e.message);
});
db.run('ALTER TABLE fornecedores ADD COLUMN planilha_dados TEXT', (e) => {
  if (e && e.message.indexOf('duplicate') === -1) console.error('Erro ao adicionar planilha_dados em fornecedores:', e.message);
});
db.run('ALTER TABLE fornecedores ADD COLUMN planilha_nome TEXT', (e) => {
  if (e && e.message.indexOf('duplicate') === -1) console.error('Erro ao adicionar planilha_nome em fornecedores:', e.message);
});
db.run('ALTER TABLE fornecedores ADD COLUMN planilha_atualizado_em DATETIME', (e) => {
  if (e && e.message.indexOf('duplicate') === -1) console.error('Erro ao adicionar planilha_atualizado_em em fornecedores:', e.message);
});
db.run('ALTER TABLE fornecedores ADD COLUMN foto TEXT', (e) => {
  if (e && e.message.indexOf('duplicate') === -1) console.error('Erro ao adicionar foto em fornecedores:', e.message);
});
// Itens padrão / lista de preços por fornecedor (planilha)
db.run(`CREATE TABLE IF NOT EXISTS itens_fornecedor (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fornecedor_id INTEGER NOT NULL,
  codigo TEXT,
  descricao TEXT NOT NULL,
  unidade TEXT DEFAULT 'UN',
  preco REAL DEFAULT 0,
  observacoes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id)
)`);

// ========== TABELAS MÓDULO FINANCEIRO ==========
db.run(`CREATE TABLE IF NOT EXISTS contas_pagar (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  descricao TEXT NOT NULL,
  fornecedor TEXT,
  valor REAL NOT NULL,
  data_vencimento DATE,
  data_pagamento DATE,
  status TEXT DEFAULT 'pendente',
  categoria TEXT,
  observacoes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

db.run(`CREATE TABLE IF NOT EXISTS contas_receber (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  descricao TEXT NOT NULL,
  cliente TEXT,
  valor REAL NOT NULL,
  data_vencimento DATE,
  data_recebimento DATE,
  status TEXT DEFAULT 'pendente',
  categoria TEXT,
  observacoes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

db.run(`CREATE TABLE IF NOT EXISTS fluxo_caixa (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data DATE NOT NULL,
  descricao TEXT NOT NULL,
  tipo TEXT NOT NULL,
  valor REAL NOT NULL,
  categoria TEXT,
  observacoes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

db.run(`CREATE TABLE IF NOT EXISTS bancos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  banco TEXT,
  agencia TEXT,
  conta TEXT,
  saldo REAL DEFAULT 0,
  tipo TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// Tabela de Logs de Auditoria
db.run(`CREATE TABLE IF NOT EXISTS logs_auditoria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER,
  usuario_nome TEXT,
  usuario_email TEXT,
  tipo TEXT NOT NULL,
  modulo TEXT,
  nome_modulo TEXT,
  acao TEXT,
  detalhes TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
)`);

// ========== TABELAS DE CHAT ==========
// Tabela de Conversas (1-1 ou Grupos)
db.run(`CREATE TABLE IF NOT EXISTS conversas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL DEFAULT 'privada', -- 'privada' ou 'grupo'
  nome TEXT, -- Nome do grupo (null para conversas privadas)
  descricao TEXT, -- Descrição do grupo
  projeto_id INTEGER, -- Se vinculado a um projeto
  cliente_id INTEGER, -- Se vinculado a um cliente
  proposta_id INTEGER, -- Se vinculado a uma proposta
  criado_por INTEGER NOT NULL,
  avatar_url TEXT, -- URL do avatar do grupo
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (criado_por) REFERENCES usuarios(id),
  FOREIGN KEY (projeto_id) REFERENCES projetos(id),
  FOREIGN KEY (cliente_id) REFERENCES clientes(id),
  FOREIGN KEY (proposta_id) REFERENCES propostas(id)
)`);

// Tabela de Participantes de Conversas
db.run(`CREATE TABLE IF NOT EXISTS conversas_participantes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversa_id INTEGER NOT NULL,
  usuario_id INTEGER NOT NULL,
  ultima_visualizacao DATETIME, -- Última vez que o usuário visualizou a conversa
  notificacoes_habilitadas INTEGER DEFAULT 1, -- Se recebe notificações
  saiu_em DATETIME, -- Se saiu do grupo
  adicionado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversa_id) REFERENCES conversas(id) ON DELETE CASCADE,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  UNIQUE(conversa_id, usuario_id)
)`);

// Tabela de Mensagens
db.run(`CREATE TABLE IF NOT EXISTS mensagens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversa_id INTEGER NOT NULL,
  usuario_id INTEGER NOT NULL,
  mensagem TEXT NOT NULL,
  tipo TEXT DEFAULT 'texto', -- 'texto', 'arquivo', 'imagem', 'sistema'
  arquivo_url TEXT, -- URL do arquivo se tipo for 'arquivo' ou 'imagem'
  arquivo_nome TEXT, -- Nome original do arquivo
  arquivo_tamanho INTEGER, -- Tamanho em bytes
  arquivo_tipo TEXT, -- MIME type
  editada INTEGER DEFAULT 0, -- Se foi editada
  editada_em DATETIME, -- Quando foi editada
  excluida INTEGER DEFAULT 0, -- Se foi excluída
  excluida_em DATETIME, -- Quando foi excluída
  resposta_para INTEGER, -- ID da mensagem respondida (reply)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversa_id) REFERENCES conversas(id) ON DELETE CASCADE,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  FOREIGN KEY (resposta_para) REFERENCES mensagens(id)
)`);

// Tabela de Leitura de Mensagens (quem leu cada mensagem)
db.run(`CREATE TABLE IF NOT EXISTS mensagens_lidas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mensagem_id INTEGER NOT NULL,
  usuario_id INTEGER NOT NULL,
  lida_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (mensagem_id) REFERENCES mensagens(id) ON DELETE CASCADE,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  UNIQUE(mensagem_id, usuario_id)
)`);

// Tabela de Notificações Push (para Service Worker)
db.run(`CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  UNIQUE(usuario_id, endpoint)
)`);

// ========== TABELAS MÓDULO OPERACIONAL ==========
// Tabela de Colaboradores
db.run(`CREATE TABLE IF NOT EXISTS colaboradores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  cpf TEXT UNIQUE,
  matricula TEXT UNIQUE,
  cargo TEXT,
  setor TEXT,
  telefone TEXT,
  email TEXT,
  data_admissao DATE,
  salario_base REAL,
  tipo_contrato TEXT,
  status TEXT DEFAULT 'ativo',
  disponivel INTEGER DEFAULT 1,
  observacoes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// Tabela de Ordens de Serviço (OS)
db.run(`CREATE TABLE IF NOT EXISTS ordens_servico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero_os TEXT UNIQUE NOT NULL,
  revisao TEXT DEFAULT '00',
  proposta_id INTEGER,
  projeto_id INTEGER,
  cliente_id INTEGER,
  tipo_os TEXT NOT NULL,
  prioridade TEXT DEFAULT 'normal',
  status TEXT DEFAULT 'pendente',
  data_abertura DATE NOT NULL,
  data_prevista DATE,
  data_inicio DATE,
  data_conclusao DATE,
  descricao TEXT,
  observacoes TEXT,
  responsavel_id INTEGER,
  valor_total REAL DEFAULT 0,
  custo_real REAL DEFAULT 0,
  pdf_url TEXT,
  -- Campos detalhados da OS
  numero_orcamento_aprovado TEXT,
  data_entrada_pedido DATE,
  data_entrega DATE,
  vendedor TEXT,
  data_ordem_producao DATE,
  documentacoes TEXT, -- JSON com checkboxes
  contrato_numero TEXT,
  pedido_numero TEXT,
  frete TEXT,
  montagem TEXT,
  nivel_necessidade TEXT,
  equipamento TEXT,
  quantidade INTEGER DEFAULT 1,
  nome_equipamento TEXT,
  area_instalacao TEXT, -- 'A prova de explosão' ou 'Segura'
  volume_trabalho TEXT,
  produto_processado TEXT,
  densidade TEXT,
  viscosidade TEXT,
  temperatura_trabalho TEXT,
  numero_serie TEXT,
  pressao_trabalho TEXT,
  embalagem TEXT,
  observacao_equipamento TEXT,
  configuracoes_equipamento TEXT, -- JSON com todas as especificações
  checklist_inspecao TEXT, -- JSON com a tabela de inspeção
  teste_final_aprovado INTEGER DEFAULT 0,
  teste_final_reprovado INTEGER DEFAULT 0,
  conferente_nome TEXT,
  data_conferencia DATE,
  responsavel_assinatura TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (proposta_id) REFERENCES propostas(id),
  FOREIGN KEY (projeto_id) REFERENCES projetos(id),
  FOREIGN KEY (cliente_id) REFERENCES clientes(id),
  FOREIGN KEY (responsavel_id) REFERENCES usuarios(id)
)`);

// Adicionar colunas se não existirem (migrations)
// Primeiro garantir que proposta_id existe (coluna essencial)
// Verificar se a tabela existe antes de adicionar colunas
db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='ordens_servico'", [], (err, table) => {
  if (!err && table) {
    // Tabela existe, adicionar coluna proposta_id se não existir
    db.run(`ALTER TABLE ordens_servico ADD COLUMN proposta_id INTEGER`, (err) => {
      if (err && !err.message.includes('duplicate column') && !err.message.includes('already exists')) {
        console.warn('⚠️ Aviso ao adicionar coluna proposta_id:', err.message);
      } else if (!err) {
        console.log('✅ Coluna proposta_id adicionada com sucesso');
      }
    });
  }
});

const osMigrations = [
  'pdf_url TEXT',
  'revisao TEXT DEFAULT "00"',
  'numero_orcamento_aprovado TEXT',
  'data_entrada_pedido DATE',
  'data_entrega DATE',
  'vendedor TEXT',
  'data_ordem_producao DATE',
  'documentacoes TEXT',
  'contrato_numero TEXT',
  'pedido_numero TEXT',
  'frete TEXT',
  'montagem TEXT',
  'nivel_necessidade TEXT',
  'equipamento TEXT',
  'quantidade INTEGER DEFAULT 1',
  'nome_equipamento TEXT',
  'area_instalacao TEXT',
  'volume_trabalho TEXT',
  'produto_processado TEXT',
  'densidade TEXT',
  'viscosidade TEXT',
  'temperatura_trabalho TEXT',
  'numero_serie TEXT',
  'pressao_trabalho TEXT',
  'embalagem TEXT',
  'observacao_equipamento TEXT',
  'configuracoes_equipamento TEXT',
  'checklist_inspecao TEXT',
  'teste_final_aprovado INTEGER DEFAULT 0',
  'teste_final_reprovado INTEGER DEFAULT 0',
  'conferente_nome TEXT',
  'data_conferencia DATE',
  'responsavel_assinatura TEXT'
];

osMigrations.forEach((migration) => {
  db.run(`ALTER TABLE ordens_servico ADD COLUMN ${migration}`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      // Ignorar erros de coluna duplicada
    }
  });
});

// Tabela de Itens da OS
db.run(`CREATE TABLE IF NOT EXISTS os_itens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  os_id INTEGER NOT NULL,
  item_numero INTEGER,
  descricao TEXT NOT NULL,
  quantidade REAL DEFAULT 1,
  unidade TEXT DEFAULT 'un',
  codigo_produto TEXT,
  status_item TEXT DEFAULT 'pendente',
  etapa_fabricacao TEXT,
  observacoes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (os_id) REFERENCES ordens_servico(id) ON DELETE CASCADE
)`);

// Adicionar coluna codigo_produto se não existir
db.run(`ALTER TABLE os_itens ADD COLUMN codigo_produto TEXT`, (err) => {
  if (err && !err.message.includes('duplicate column name')) {
    console.error('Erro ao adicionar coluna codigo_produto:', err);
  }
});

// Tabela de Status de Fabricação
db.run(`CREATE TABLE IF NOT EXISTS status_fabricacao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  os_id INTEGER NOT NULL,
  item_id INTEGER,
  etapa TEXT NOT NULL,
  status TEXT NOT NULL,
  percentual_conclusao INTEGER DEFAULT 0,
  data_inicio DATETIME,
  data_fim DATETIME,
  colaborador_id INTEGER,
  observacoes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (os_id) REFERENCES ordens_servico(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES os_itens(id) ON DELETE CASCADE,
  FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id)
)`);

// Tabela de Atividades de Colaboradores (O que cada um está fazendo)
db.run(`CREATE TABLE IF NOT EXISTS atividades_colaboradores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  colaborador_id INTEGER NOT NULL,
  os_id INTEGER,
  item_id INTEGER,
  tipo_atividade TEXT NOT NULL,
  descricao TEXT,
  status TEXT DEFAULT 'em_andamento',
  data_inicio DATETIME NOT NULL,
  data_fim DATETIME,
  horas_previstas REAL,
  horas_reais REAL,
  observacoes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id),
  FOREIGN KEY (os_id) REFERENCES ordens_servico(id),
  FOREIGN KEY (item_id) REFERENCES os_itens(id)
)`);

// Tabela de Controle de Presença/Disponibilidade
db.run(`CREATE TABLE IF NOT EXISTS controle_presenca (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  colaborador_id INTEGER NOT NULL,
  data DATE NOT NULL,
  hora_entrada TIME,
  hora_saida TIME,
  hora_entrada_almoco TIME,
  hora_saida_almoco TIME,
  horas_trabalhadas REAL,
  horas_extras REAL DEFAULT 0,
  status TEXT DEFAULT 'presente',
  motivo_ausencia TEXT,
  observacoes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id),
  UNIQUE(colaborador_id, data)
)`);

// Tabela de Horas Extras
db.run(`CREATE TABLE IF NOT EXISTS horas_extras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  colaborador_id INTEGER NOT NULL,
  data DATE NOT NULL,
  horas_extras REAL NOT NULL,
  tipo_hora_extra TEXT DEFAULT 'normal',
  motivo TEXT,
  aprovado_por INTEGER,
  status TEXT DEFAULT 'pendente',
  valor_hora_extra REAL,
  valor_total REAL,
  observacoes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id),
  FOREIGN KEY (aprovado_por) REFERENCES usuarios(id)
)`);

// Tabela de Etapas de Fabricação (Configuração)
db.run(`CREATE TABLE IF NOT EXISTS etapas_fabricacao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  descricao TEXT,
  ordem INTEGER DEFAULT 0,
  tempo_medio_horas REAL,
  ativo INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// Tabela de Equipamentos/Máquinas
db.run(`CREATE TABLE IF NOT EXISTS equipamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT UNIQUE,
  nome TEXT NOT NULL,
  tipo TEXT,
  fabricante TEXT,
  modelo TEXT,
  numero_serie TEXT,
  data_aquisicao DATE,
  status TEXT DEFAULT 'disponivel',
  capacidade TEXT,
  observacoes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// Tabela de Alocação de Equipamentos
db.run(`CREATE TABLE IF NOT EXISTS alocacao_equipamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  equipamento_id INTEGER NOT NULL,
  os_id INTEGER,
  data_inicio DATE NOT NULL,
  data_fim DATE,
  status TEXT DEFAULT 'alocado',
  observacoes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (equipamento_id) REFERENCES equipamentos(id),
  FOREIGN KEY (os_id) REFERENCES ordens_servico(id)
)`);

// ========== TABELAS MES (Manufacturing Execution System) ==========
// Eventos de Processo
db.run(`CREATE TABLE IF NOT EXISTS eventos_processo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  os_id INTEGER,
  item_id INTEGER,
  tipo_evento TEXT NOT NULL,
  descricao TEXT,
  timestamp DATETIME NOT NULL,
  colaborador_id INTEGER,
  equipamento_id INTEGER,
  parametros TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (os_id) REFERENCES ordens_servico(id),
  FOREIGN KEY (item_id) REFERENCES os_itens(id),
  FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id),
  FOREIGN KEY (equipamento_id) REFERENCES equipamentos(id)
)`);

// Parâmetros Críticos de Processo
db.run(`CREATE TABLE IF NOT EXISTS parametros_processo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  os_id INTEGER NOT NULL,
  item_id INTEGER,
  parametro TEXT NOT NULL,
  valor REAL NOT NULL,
  unidade TEXT,
  limite_min REAL,
  limite_max REAL,
  timestamp DATETIME NOT NULL,
  status TEXT DEFAULT 'normal',
  observacoes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (os_id) REFERENCES ordens_servico(id),
  FOREIGN KEY (item_id) REFERENCES os_itens(id)
)`);

// Gestão de Lotes
db.run(`CREATE TABLE IF NOT EXISTS lotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero_lote TEXT UNIQUE NOT NULL,
  os_id INTEGER,
  item_id INTEGER,
  tipo_lote TEXT NOT NULL,
  quantidade REAL NOT NULL,
  unidade TEXT DEFAULT 'un',
  data_producao DATE NOT NULL,
  data_validade DATE,
  status TEXT DEFAULT 'em_producao',
  rastreabilidade TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (os_id) REFERENCES ordens_servico(id),
  FOREIGN KEY (item_id) REFERENCES os_itens(id)
)`);

// Rastreabilidade de Lotes
db.run(`CREATE TABLE IF NOT EXISTS rastreabilidade_lotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lote_origem_id INTEGER,
  lote_destino_id INTEGER,
  tipo_operacao TEXT NOT NULL,
  quantidade REAL NOT NULL,
  timestamp DATETIME NOT NULL,
  colaborador_id INTEGER,
  observacoes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (lote_origem_id) REFERENCES lotes(id),
  FOREIGN KEY (lote_destino_id) REFERENCES lotes(id),
  FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id)
)`);

// Controle de Qualidade
db.run(`CREATE TABLE IF NOT EXISTS controle_qualidade (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lote_id INTEGER,
  os_id INTEGER,
  tipo_inspecao TEXT NOT NULL,
  resultado TEXT NOT NULL,
  especificacao TEXT,
  valor_medido REAL,
  valor_esperado REAL,
  tolerancia REAL,
  status TEXT DEFAULT 'pendente',
  aprovado_por INTEGER,
  data_inspecao DATETIME NOT NULL,
  observacoes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (lote_id) REFERENCES lotes(id),
  FOREIGN KEY (os_id) REFERENCES ordens_servico(id),
  FOREIGN KEY (aprovado_por) REFERENCES usuarios(id)
)`);

// Padrões e Especificações
db.run(`CREATE TABLE IF NOT EXISTS padroes_qualidade (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT UNIQUE NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  tipo_produto TEXT,
  especificacoes TEXT,
  limites TEXT,
  ativo INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// Manutenção Preventiva
db.run(`CREATE TABLE IF NOT EXISTS manutencao_preventiva (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  equipamento_id INTEGER NOT NULL,
  tipo_manutencao TEXT NOT NULL,
  descricao TEXT,
  frequencia_dias INTEGER,
  ultima_execucao DATE,
  proxima_execucao DATE,
  responsavel_id INTEGER,
  status TEXT DEFAULT 'agendada',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (equipamento_id) REFERENCES equipamentos(id),
  FOREIGN KEY (responsavel_id) REFERENCES colaboradores(id)
)`);

// Ordens de Manutenção
db.run(`CREATE TABLE IF NOT EXISTS ordens_manutencao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero_om TEXT UNIQUE NOT NULL,
  equipamento_id INTEGER NOT NULL,
  tipo TEXT NOT NULL,
  prioridade TEXT DEFAULT 'normal',
  descricao TEXT,
  status TEXT DEFAULT 'aberta',
  data_abertura DATE NOT NULL,
  data_prevista DATE,
  data_execucao DATE,
  data_conclusao DATE,
  responsavel_id INTEGER,
  tempo_execucao REAL,
  custo REAL,
  observacoes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (equipamento_id) REFERENCES equipamentos(id),
  FOREIGN KEY (responsavel_id) REFERENCES colaboradores(id)
)`);

// Alarmes e Eventos
db.run(`CREATE TABLE IF NOT EXISTS alarmes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL,
  severidade TEXT NOT NULL,
  descricao TEXT NOT NULL,
  equipamento_id INTEGER,
  parametro TEXT,
  valor_atual REAL,
  limite_excedido REAL,
  timestamp DATETIME NOT NULL,
  status TEXT DEFAULT 'ativo',
  reconhecido_por INTEGER,
  data_reconhecimento DATETIME,
  resolvido_por INTEGER,
  data_resolucao DATETIME,
  observacoes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (equipamento_id) REFERENCES equipamentos(id),
  FOREIGN KEY (reconhecido_por) REFERENCES usuarios(id),
  FOREIGN KEY (resolvido_por) REFERENCES usuarios(id)
)`);

// Controle de Formulações
db.run(`CREATE TABLE IF NOT EXISTS formulacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT UNIQUE NOT NULL,
  nome TEXT NOT NULL,
  versao TEXT NOT NULL,
  descricao TEXT,
  tipo_produto TEXT,
  ativo INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// Ingredientes das Formulações
db.run(`CREATE TABLE IF NOT EXISTS formulacao_ingredientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  formulacao_id INTEGER NOT NULL,
  ingrediente TEXT NOT NULL,
  quantidade REAL NOT NULL,
  unidade TEXT DEFAULT 'kg',
  tolerancia REAL,
  ordem INTEGER DEFAULT 0,
  critico INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (formulacao_id) REFERENCES formulacoes(id) ON DELETE CASCADE
)`);

// Logs de Operações
db.run(`CREATE TABLE IF NOT EXISTS logs_operacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo_operacao TEXT NOT NULL,
  modulo TEXT,
  descricao TEXT,
  usuario_id INTEGER,
  os_id INTEGER,
  equipamento_id INTEGER,
  dados TEXT,
  ip_address TEXT,
  timestamp DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  FOREIGN KEY (os_id) REFERENCES ordens_servico(id),
  FOREIGN KEY (equipamento_id) REFERENCES equipamentos(id)
)`);

// OEE (Overall Equipment Effectiveness)
db.run(`CREATE TABLE IF NOT EXISTS oee_registros (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  equipamento_id INTEGER NOT NULL,
  data DATE NOT NULL,
  turno TEXT,
  disponibilidade REAL,
  performance REAL,
  qualidade REAL,
  oee_total REAL,
  tempo_producao REAL,
  tempo_parada REAL,
  quantidade_produzida INTEGER,
  quantidade_rejeitada INTEGER,
  observacoes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (equipamento_id) REFERENCES equipamentos(id)
)`);

// ========== ROTAS MÓDULO COMPRAS ==========
// Fornecedores
app.get('/api/compras/fornecedores', authenticateToken, checkModulePermission('compras'), (req, res) => {
  const { search, status } = req.query;
  let query = 'SELECT * FROM fornecedores WHERE 1=1';
  const params = [];

  if (search) {
    query += ' AND (razao_social LIKE ? OR nome_fantasia LIKE ? OR cnpj LIKE ?)';
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }
  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  query += ' ORDER BY created_at DESC';

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Pedidos de Compra
app.get('/api/compras/pedidos', authenticateToken, checkModulePermission('compras'), (req, res) => {
  const { search, status } = req.query;
  let query = `SELECT p.*, f.razao_social as fornecedor_nome 
               FROM pedidos_compra p 
               LEFT JOIN fornecedores f ON p.fornecedor_id = f.id 
               WHERE 1=1`;
  const params = [];

  if (search) {
    query += ' AND (p.numero LIKE ? OR f.razao_social LIKE ?)';
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm);
  }
  if (status) {
    query += ' AND p.status = ?';
    params.push(status);
  }

  query += ' ORDER BY p.created_at DESC';

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Cotações
app.get('/api/compras/cotacoes', authenticateToken, checkModulePermission('compras'), (req, res) => {
  const { search, status } = req.query;
  let query = `SELECT c.*, f.razao_social as fornecedor_nome 
               FROM cotacoes c 
               LEFT JOIN fornecedores f ON c.fornecedor_id = f.id 
               WHERE 1=1`;
  const params = [];

  if (search) {
    query += ' AND (c.numero LIKE ? OR f.razao_social LIKE ?)';
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm);
  }
  if (status) {
    query += ' AND c.status = ?';
    params.push(status);
  }

  query += ' ORDER BY c.created_at DESC';

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Delete genérico
app.delete('/api/compras/:tipo/:id', authenticateToken, checkModulePermission('compras'), (req, res) => {
  const { tipo, id } = req.params;
  const tables = {
    'fornecedores': 'fornecedores',
    'pedidos': 'pedidos_compra',
    'cotacoes': 'cotacoes'
  };

  // Validação de input
  if (!tipo || !id) {
    return res.status(400).json({ error: 'Tipo e ID são obrigatórios' });
  }

  // Validar que o ID é numérico
  const idNum = parseInt(id);
  if (isNaN(idNum) || idNum <= 0) {
    return res.status(400).json({ error: 'ID inválido' });
  }

  const table = tables[tipo];
  if (!table) {
    return res.status(400).json({ error: 'Tipo inválido' });
  }

  // Usar prepared statement para prevenir SQL injection
  db.run(`DELETE FROM ${table} WHERE id = ?`, [idNum], function(err) {
    if (err) {
      console.error('Erro ao deletar:', err);
      return res.status(500).json({ error: 'Erro ao excluir item' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Item não encontrado' });
    }
    res.json({ message: 'Item excluído com sucesso' });
  });
});

// ---------- Grupos de fornecedores homologados (Compras) ----------
app.get('/api/compras/grupos', authenticateToken, checkModulePermission('compras'), (req, res) => {
  db.all('SELECT * FROM grupos_compras WHERE ativo = 1 ORDER BY COALESCE(numero, 999) ASC, ordem ASC, nome ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});
app.get('/api/compras/grupos/:id', authenticateToken, checkModulePermission('compras'), (req, res) => {
  const id = req.params.id;
  db.get('SELECT * FROM grupos_compras WHERE id = ? AND ativo = 1', [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Grupo não encontrado' });
    res.json(row);
  });
});
app.post('/api/compras/grupos', authenticateToken, checkModulePermission('compras'), (req, res) => {
  const body = req.body || {};
  const nome = (body.nome || '').trim();
  if (!nome) return res.status(400).json({ error: 'Nome do grupo é obrigatório' });
  const numero = parseInt(body.numero, 10);
  const ordem = parseInt(body.ordem, 10) || 0;
  db.run('INSERT INTO grupos_compras (nome, numero, ordem, ativo) VALUES (?, ?, ?, 1)', [nome, isNaN(numero) || numero < 10 ? 10 : numero, ordem], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ id: this.lastID, nome, numero: isNaN(numero) || numero < 10 ? 10 : numero, ordem });
  });
});
app.put('/api/compras/grupos/:id', authenticateToken, checkModulePermission('compras'), (req, res) => {
  const id = req.params.id;
  const body = req.body || {};
  const nome = (body.nome || '').trim();
  if (!nome) return res.status(400).json({ error: 'Nome do grupo é obrigatório' });
  const numero = parseInt(body.numero, 10);
  const ordem = parseInt(body.ordem, 10) || 0;
  db.run('UPDATE grupos_compras SET nome = ?, numero = ?, ordem = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [nome, isNaN(numero) || numero < 10 ? 10 : numero, ordem, id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Grupo não encontrado' });
    res.json({ id, nome, numero: isNaN(numero) || numero < 10 ? 10 : numero, ordem });
  });
});
app.delete('/api/compras/grupos/:id', authenticateToken, checkModulePermission('compras'), (req, res) => {
  const id = req.params.id;
  db.run('UPDATE grupos_compras SET ativo = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Grupo não encontrado' });
    res.json({ message: 'Grupo desativado' });
  });
});
app.post('/api/compras/grupos/:id/foto', authenticateToken, checkModulePermission('compras'), uploadGrupoCompras.single('foto'), (req, res) => {
  const id = req.params.id;
  if (!req.file || !req.file.filename) return res.status(400).json({ error: 'Nenhuma imagem enviada' });
  const filename = req.file.filename;
  db.get('SELECT * FROM grupos_compras WHERE id = ?', [id], (err, grupo) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!grupo) return res.status(404).json({ error: 'Grupo não encontrado' });
    const oldFoto = grupo.foto;
    db.run('UPDATE grupos_compras SET foto = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [filename, id], (updateErr) => {
      if (updateErr) return res.status(500).json({ error: updateErr.message });
      if (oldFoto) {
        const oldPath = path.join(uploadsGruposComprasDir, oldFoto);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      res.json({ foto: filename, url: '/api/uploads/grupos-compras/' + filename });
    });
  });
});
app.post('/api/compras/grupos/:id/foto-base64', authenticateToken, checkModulePermission('compras'), (req, res) => {
  try {
    const id = req.params.id;
    const b64 = req.body && req.body.foto_base64;
    if (!b64 || typeof b64 !== 'string') return res.status(400).json({ error: 'foto_base64 é obrigatório' });
    const match = b64.match(/^data:image\/(\w+);base64,(.+)$/);
    let ext = '.jpg';
    let buf = b64;
    if (match) {
      ext = match[1] === 'jpeg' ? '.jpg' : '.' + match[1];
      buf = Buffer.from(match[2], 'base64');
    } else {
      buf = Buffer.from(b64, 'base64');
    }
    if (!fs.existsSync(uploadsGruposComprasDir)) fs.mkdirSync(uploadsGruposComprasDir, { recursive: true });
    const filename = 'grupo_compras_' + id + '_' + Date.now() + ext;
    const filePath = path.join(uploadsGruposComprasDir, filename);
    fs.writeFile(filePath, buf, (err) => {
      if (err) return res.status(500).json({ error: 'Erro ao salvar arquivo: ' + err.message });
      db.get('SELECT * FROM grupos_compras WHERE id = ?', [id], (dbErr, grupo) => {
        if (dbErr) return res.status(500).json({ error: dbErr.message });
        if (!grupo) return res.status(404).json({ error: 'Grupo não encontrado' });
        const oldFoto = grupo.foto;
        db.run('UPDATE grupos_compras SET foto = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [filename, id], (upErr) => {
          if (upErr) return res.status(500).json({ error: upErr.message });
          if (oldFoto) {
            const oldPath = path.join(uploadsGruposComprasDir, oldFoto);
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
          }
          res.json({ foto: filename, url: '/api/uploads/grupos-compras/' + filename });
        });
      });
    });
  } catch (e) {
    console.error('Erro foto-base64 grupo compras:', e);
    res.status(500).json({ error: e.message || 'Erro ao processar foto' });
  }
});

// Fornecedores de um grupo (homologados no grupo)
app.get('/api/compras/grupos/:grupoId/fornecedores', authenticateToken, checkModulePermission('compras'), (req, res) => {
  const grupoId = req.params.grupoId;
  db.all('SELECT * FROM fornecedores WHERE grupo_id = ? AND status = ? ORDER BY razao_social', [grupoId, 'ativo'], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

// Criar fornecedor (opcional: grupo_id para já homologar no grupo)
app.post('/api/compras/fornecedores', authenticateToken, checkModulePermission('compras'), (req, res) => {
  const body = req.body || {};
  const razao_social = (body.razao_social || '').trim();
  const nome_fantasia = (body.nome_fantasia || '').trim();
  const cnpj = (body.cnpj || '').trim();
  const contato = body.contato != null ? String(body.contato).trim() : null;
  const email = body.email != null ? String(body.email).trim() : null;
  const telefone = body.telefone != null ? String(body.telefone).trim() : null;
  const grupo_id = body.grupo_id != null ? (parseInt(body.grupo_id, 10) || null) : null;
  if (!razao_social) return res.status(400).json({ error: 'Razão social é obrigatória' });
  db.run('INSERT INTO fornecedores (razao_social, nome_fantasia, cnpj, contato, email, telefone, grupo_id, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [razao_social, nome_fantasia, cnpj, contato, email, telefone, grupo_id, 'ativo'], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ id: this.lastID, razao_social, nome_fantasia, grupo_id });
  });
});

// Atualizar fornecedor (ex.: grupo_id para homologar no grupo)
app.put('/api/compras/fornecedores/:id', authenticateToken, checkModulePermission('compras'), (req, res) => {
  const id = req.params.id;
  const body = req.body || {};
  const razao_social = (body.razao_social || '').trim();
  const nome_fantasia = (body.nome_fantasia || '').trim();
  const cnpj = (body.cnpj || '').trim();
  const contato = body.contato != null ? String(body.contato).trim() : null;
  const email = body.email != null ? String(body.email).trim() : null;
  const telefone = body.telefone != null ? String(body.telefone).trim() : null;
  const endereco = body.endereco != null ? String(body.endereco).trim() : null;
  const grupo_id = body.grupo_id != null ? (parseInt(body.grupo_id, 10) || null) : undefined;
  if (!razao_social) return res.status(400).json({ error: 'Razão social é obrigatória' });
  const updates = ['razao_social = ?', 'nome_fantasia = ?', 'cnpj = ?', 'contato = ?', 'email = ?', 'telefone = ?', 'endereco = ?', 'updated_at = CURRENT_TIMESTAMP'];
  const params = [razao_social, nome_fantasia, cnpj, contato, email, telefone, endereco];
  if (grupo_id !== undefined) {
    updates.push('grupo_id = ?');
    params.push(grupo_id);
  }
  params.push(id);
  db.run('UPDATE fornecedores SET ' + updates.join(', ') + ' WHERE id = ?', params, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Fornecedor não encontrado' });
    res.json({ message: 'Fornecedor atualizado' });
  });
});

app.post('/api/compras/fornecedores/:id/foto', authenticateToken, checkModulePermission('compras'), uploadFornecedor.single('foto'), (req, res) => {
  const id = req.params.id;
  if (!req.file || !req.file.filename) return res.status(400).json({ error: 'Nenhuma imagem enviada' });
  const filename = req.file.filename;
  db.get('SELECT * FROM fornecedores WHERE id = ?', [id], (err, fornecedor) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!fornecedor) return res.status(404).json({ error: 'Fornecedor não encontrado' });
    const oldFoto = fornecedor.foto;
    db.run('UPDATE fornecedores SET foto = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [filename, id], (updateErr) => {
      if (updateErr) return res.status(500).json({ error: updateErr.message });
      if (oldFoto) {
        const oldPath = path.join(uploadsFornecedoresDir, oldFoto);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      res.json({ foto: filename, url: '/api/uploads/fornecedores/' + filename });
    });
  });
});
app.post('/api/compras/fornecedores/:id/foto-base64', authenticateToken, checkModulePermission('compras'), (req, res) => {
  try {
    const id = req.params.id;
    const b64 = req.body && req.body.foto_base64;
    if (!b64 || typeof b64 !== 'string') return res.status(400).json({ error: 'foto_base64 é obrigatório' });
    const match = b64.match(/^data:image\/(\w+);base64,(.+)$/);
    let ext = '.jpg';
    let buf = b64;
    if (match) {
      ext = match[1] === 'jpeg' ? '.jpg' : '.' + match[1];
      buf = Buffer.from(match[2], 'base64');
    } else {
      buf = Buffer.from(b64, 'base64');
    }
    if (!fs.existsSync(uploadsFornecedoresDir)) fs.mkdirSync(uploadsFornecedoresDir, { recursive: true });
    const filename = 'fornecedor_' + id + '_' + Date.now() + ext;
    const filePath = path.join(uploadsFornecedoresDir, filename);
    fs.writeFile(filePath, buf, (err) => {
      if (err) return res.status(500).json({ error: 'Erro ao salvar arquivo: ' + err.message });
      db.get('SELECT * FROM fornecedores WHERE id = ?', [id], (dbErr, fornecedor) => {
        if (dbErr) return res.status(500).json({ error: dbErr.message });
        if (!fornecedor) return res.status(404).json({ error: 'Fornecedor não encontrado' });
        const oldFoto = fornecedor.foto;
        db.run('UPDATE fornecedores SET foto = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [filename, id], (upErr) => {
          if (upErr) return res.status(500).json({ error: upErr.message });
          if (oldFoto) {
            const oldPath = path.join(uploadsFornecedoresDir, oldFoto);
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
          }
          res.json({ foto: filename, url: '/api/uploads/fornecedores/' + filename });
        });
      });
    });
  } catch (e) {
    console.error('Erro foto-base64 fornecedor:', e);
    res.status(500).json({ error: e.message || 'Erro ao processar foto' });
  }
});

// Itens padrão / lista de preços do fornecedor
app.get('/api/compras/fornecedores/:fornecedorId/itens', authenticateToken, checkModulePermission('compras'), (req, res) => {
  const fornecedorId = req.params.fornecedorId;
  db.all('SELECT * FROM itens_fornecedor WHERE fornecedor_id = ? ORDER BY descricao', [fornecedorId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});
app.post('/api/compras/fornecedores/:fornecedorId/itens', authenticateToken, checkModulePermission('compras'), (req, res) => {
  const fornecedorId = req.params.fornecedorId;
  const body = req.body || {};
  const codigo = (body.codigo || '').trim();
  const descricao = (body.descricao || '').trim();
  const unidade = (body.unidade || 'UN').trim();
  const preco = parseFloat(body.preco);
  const observacoes = (body.observacoes || '').trim();
  if (!descricao) return res.status(400).json({ error: 'Descrição é obrigatória' });
  db.run('INSERT INTO itens_fornecedor (fornecedor_id, codigo, descricao, unidade, preco, observacoes) VALUES (?, ?, ?, ?, ?, ?)',
    [fornecedorId, codigo || null, descricao, unidade || 'UN', isNaN(preco) ? 0 : preco, observacoes || null], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ id: this.lastID, fornecedor_id: parseInt(fornecedorId, 10), codigo, descricao, unidade, preco: isNaN(preco) ? 0 : preco, observacoes: observacoes || null });
  });
});
app.put('/api/compras/fornecedores/:fornecedorId/itens/:id', authenticateToken, checkModulePermission('compras'), (req, res) => {
  const { fornecedorId, id } = req.params;
  const body = req.body || {};
  const codigo = (body.codigo || '').trim();
  const descricao = (body.descricao || '').trim();
  const unidade = (body.unidade || 'UN').trim();
  const preco = parseFloat(body.preco);
  const observacoes = (body.observacoes || '').trim();
  if (!descricao) return res.status(400).json({ error: 'Descrição é obrigatória' });
  db.run('UPDATE itens_fornecedor SET codigo = ?, descricao = ?, unidade = ?, preco = ?, observacoes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND fornecedor_id = ?',
    [codigo || null, descricao, unidade || 'UN', isNaN(preco) ? 0 : preco, observacoes || null, id, fornecedorId], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Item não encontrado' });
    res.json({ message: 'Item atualizado' });
  });
});
app.delete('/api/compras/fornecedores/:fornecedorId/itens/:id', authenticateToken, checkModulePermission('compras'), (req, res) => {
  const { fornecedorId, id } = req.params;
  db.run('DELETE FROM itens_fornecedor WHERE id = ? AND fornecedor_id = ?', [id, fornecedorId], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Item não encontrado' });
    res.json({ message: 'Item excluído' });
  });
});

// Salvar planilha do fornecedor (para visualização no software)
app.post('/api/compras/fornecedores/:fornecedorId/planilha', authenticateToken, checkModulePermission('compras'), (req, res) => {
  const fornecedorId = req.params.fornecedorId;
  const body = req.body || {};
  const nome = (body.nome || body.nomeArquivo || '').trim() || 'planilha';
  const linhas = body.linhas || body.rows || [];
  if (!Array.isArray(linhas)) {
    return res.status(400).json({ error: 'Envie "linhas" com array de linhas (array de arrays)' });
  }
  const planilhaDados = JSON.stringify(linhas);
  db.run(
    'UPDATE fornecedores SET planilha_dados = ?, planilha_nome = ?, planilha_atualizado_em = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [planilhaDados, nome, fornecedorId],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Fornecedor não encontrado' });
      res.json({ message: 'Planilha salva', nome, linhas: linhas.length });
    }
  );
});

// Obter planilha salva do fornecedor (para visualização no software)
app.get('/api/compras/fornecedores/:fornecedorId/planilha', authenticateToken, checkModulePermission('compras'), (req, res) => {
  const fornecedorId = req.params.fornecedorId;
  db.get('SELECT planilha_dados, planilha_nome, planilha_atualizado_em FROM fornecedores WHERE id = ?', [fornecedorId], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Fornecedor não encontrado' });
    let linhas = [];
    if (row.planilha_dados) {
      try {
        linhas = JSON.parse(row.planilha_dados);
      } catch (_) {}
    }
    res.json({ nome: row.planilha_nome || null, linhas, atualizado_em: row.planilha_atualizado_em || null });
  });
});

// Importar itens do fornecedor via planilha (JSON de linhas ou arquivo)
// Aceita qualquer formato: o backend tenta achar descrição, código, unidade e preço em várias chaves possíveis
function normalizarCampo(s) {
  if (s == null || s === '') return '';
  return String(s).trim();
}
function parsePrecoBackend(val) {
  if (val == null || val === '') return 0;
  if (typeof val === 'number' && !isNaN(val)) return val;
  const s = String(val).trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}
function extrairDoRow(row, ...candidatos) {
  for (const k of candidatos) {
    const v = row[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}
function extrairPrecoDoRow(row) {
  const chavesPreco = ['preco', 'preço', 'valor', 'valor unitario', 'valor unitário', 'price', 'vlr', 'preco unitario', 'preço unitário', 'valor unit', 'preco unit', 'valor_unitario', 'preco_unitario'];
  for (const k of chavesPreco) {
    const v = row[k];
    if (v != null && v !== '') {
      const n = parsePrecoBackend(v);
      if (!isNaN(n)) return n;
    }
  }
  for (const k of Object.keys(row || {})) {
    const v = row[k];
    if (v == null || v === '') continue;
    if (typeof v === 'number' && !isNaN(v)) return v;
    const n = parsePrecoBackend(v);
    if (!isNaN(n)) return n;
  }
  return 0;
}
function extrairDescricaoDoRow(row) {
  const desc = extrairDoRow(row, 'descricao', 'descrição', 'descricao_produto', 'descricao produto', 'produto', 'item', 'nome', 'designacao', 'designação', 'material', 'especificacao', 'denominacao', 'nome do produto', 'desc');
  if (desc) return desc;
  for (const k of Object.keys(row || {})) {
    const v = row[k];
    if (v == null) continue;
    const s = String(v).trim();
    if (s === '') continue;
    if (isNaN(parsePrecoBackend(v))) return s;
  }
  return '';
}
app.post('/api/compras/fornecedores/:fornecedorId/itens/importar', authenticateToken, checkModulePermission('compras'), (req, res) => {
  const fornecedorId = req.params.fornecedorId;
  const body = req.body || {};
  const linhas = body.linhas || body.rows || [];
  if (!Array.isArray(linhas) || linhas.length === 0) {
    return res.status(400).json({ error: 'Envie "linhas" ou "rows" com array de objetos (qualquer formato de planilha)' });
  }
  let inseridos = 0;
  const next = (i) => {
    if (i >= linhas.length) return res.json({ message: 'Importação concluída', inseridos });
    const row = linhas[i];
    const descricao = extrairDescricaoDoRow(row);
    if (!descricao) return next(i + 1);
    const codigo = extrairDoRow(row, 'codigo', 'código', 'cod', 'sku', 'referencia', 'referência', 'ref') || null;
    const unidade = (extrairDoRow(row, 'unidade', 'und', 'um', 'un', 'unid') || 'UN').trim();
    const preco = extrairPrecoDoRow(row);
    db.run('INSERT INTO itens_fornecedor (fornecedor_id, codigo, descricao, unidade, preco) VALUES (?, ?, ?, ?, ?)',
      [fornecedorId, codigo, descricao, unidade || 'UN', preco], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        inseridos++;
        next(i + 1);
      });
  };
  next(0);
});

// ========== ROTAS MÓDULO FINANCEIRO ==========
// Contas a Pagar
app.get('/api/financeiro/contas-pagar', authenticateToken, checkModulePermission('financeiro'), (req, res) => {
  const { search, status, periodo } = req.query;
  let query = 'SELECT * FROM contas_pagar WHERE 1=1';
  const params = [];

  if (search) {
    query += ' AND (descricao LIKE ? OR fornecedor LIKE ?)';
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm);
  }
  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }
  if (periodo && periodo !== 'todos') {
    const now = new Date();
    let startDate;
    if (periodo === 'mes') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (periodo === 'trimestre') {
      const quarter = Math.floor(now.getMonth() / 3);
      startDate = new Date(now.getFullYear(), quarter * 3, 1);
    } else if (periodo === 'ano') {
      startDate = new Date(now.getFullYear(), 0, 1);
    }
    if (startDate) {
      query += ' AND data_vencimento >= ?';
      params.push(startDate.toISOString().split('T')[0]);
    }
  }

  query += ' ORDER BY data_vencimento ASC';

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Contas a Receber
app.get('/api/financeiro/contas-receber', authenticateToken, checkModulePermission('financeiro'), (req, res) => {
  const { search, status, periodo } = req.query;
  let query = 'SELECT * FROM contas_receber WHERE 1=1';
  const params = [];

  if (search) {
    query += ' AND (descricao LIKE ? OR cliente LIKE ?)';
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm);
  }
  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }
  if (periodo && periodo !== 'todos') {
    const now = new Date();
    let startDate;
    if (periodo === 'mes') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (periodo === 'trimestre') {
      const quarter = Math.floor(now.getMonth() / 3);
      startDate = new Date(now.getFullYear(), quarter * 3, 1);
    } else if (periodo === 'ano') {
      startDate = new Date(now.getFullYear(), 0, 1);
    }
    if (startDate) {
      query += ' AND data_vencimento >= ?';
      params.push(startDate.toISOString().split('T')[0]);
    }
  }

  query += ' ORDER BY data_vencimento ASC';

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Fluxo de Caixa
app.get('/api/financeiro/fluxo-caixa', authenticateToken, checkModulePermission('financeiro'), (req, res) => {
  const { periodo } = req.query;
  let query = 'SELECT * FROM fluxo_caixa WHERE 1=1';
  const params = [];

  if (periodo && periodo !== 'todos') {
    const now = new Date();
    let startDate;
    if (periodo === 'mes') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (periodo === 'trimestre') {
      const quarter = Math.floor(now.getMonth() / 3);
      startDate = new Date(now.getFullYear(), quarter * 3, 1);
    } else if (periodo === 'ano') {
      startDate = new Date(now.getFullYear(), 0, 1);
    }
    if (startDate) {
      query += ' AND data >= ?';
      params.push(startDate.toISOString().split('T')[0]);
    }
  }

  query += ' ORDER BY data DESC';

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Bancos
app.get('/api/financeiro/bancos', authenticateToken, checkModulePermission('financeiro'), (req, res) => {
  const { search } = req.query;
  let query = 'SELECT * FROM bancos WHERE 1=1';
  const params = [];

  if (search) {
    query += ' AND (nome LIKE ? OR banco LIKE ?)';
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm);
  }

  query += ' ORDER BY nome ASC';

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Dashboard financeiro - métricas e dados para gráficos
app.get('/api/financeiro/dashboard', authenticateToken, checkModulePermission('financeiro'), (req, res) => {
  const ano = parseInt(req.query.ano) || new Date().getFullYear();
  const mes = parseInt(req.query.mes) !== undefined ? parseInt(req.query.mes) : new Date().getMonth() + 1;
  const inicioMes = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const ultimoDia = new Date(ano, mes, 0).getDate();
  const fimMes = `${ano}-${String(mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;
  const mesAnterior = mes === 1 ? 12 : mes - 1;
  const anoAnterior = mes === 1 ? ano - 1 : ano;
  const inicioMesAnt = `${anoAnterior}-${String(mesAnterior).padStart(2, '0')}-01`;
  const fimMesAnt = `${anoAnterior}-${String(mesAnterior).padStart(2, '0')}-${String(new Date(anoAnterior, mesAnterior, 0).getDate()).padStart(2, '0')}`;
  const hoje = new Date().toISOString().split('T')[0];

  const runQueries = (cb) => {
    let pending = 8;
    const result = {};
    const done = () => {
      pending--;
      if (pending === 0) cb(result);
    };

    db.get(
      `SELECT COALESCE(SUM(valor), 0) as total FROM contas_receber WHERE status = 'recebido' AND ( (data_recebimento BETWEEN ? AND ?) OR (data_vencimento BETWEEN ? AND ?) )`,
      [inicioMes, fimMes, inicioMes, fimMes],
      (err, row) => { result.receitaMensal = (row && row.total) ? row.total : 0; done(); }
    );
    db.get(
      `SELECT COALESCE(SUM(valor), 0) as total FROM contas_receber WHERE status = 'recebido' AND ( (data_recebimento BETWEEN ? AND ?) OR (data_vencimento BETWEEN ? AND ?) )`,
      [inicioMesAnt, fimMesAnt, inicioMesAnt, fimMesAnt],
      (err, row) => { result.receitaMesAnt = (row && row.total) ? row.total : 0; done(); }
    );
    db.get(
      `SELECT COALESCE(SUM(valor), 0) as total FROM contas_pagar WHERE (data_pagamento BETWEEN ? AND ? AND status = 'pago')`,
      [inicioMes, fimMes],
      (err, row) => { result.despesasMensal = (row && row.total) ? row.total : 0; done(); }
    );
    db.get(
      `SELECT COALESCE(SUM(valor), 0) as total FROM contas_pagar WHERE (data_pagamento BETWEEN ? AND ? AND status = 'pago')`,
      [inicioMesAnt, fimMesAnt],
      (err, row) => { result.despesasMesAnt = (row && row.total) ? row.total : 0; done(); }
    );
    db.get(
      `SELECT COALESCE(SUM(valor), 0) as total, COUNT(*) as count FROM contas_receber WHERE status IN ('pendente', 'parcial')`,
      [],
      (err, row) => {
        result.contasReceberTotal = (row && row.total) ? row.total : 0;
        result.contasReceberCount = (row && row.count) ? row.count : 0;
        done();
      }
    );
    db.get(
      `SELECT COUNT(*) as count FROM contas_receber WHERE status IN ('pendente', 'parcial') AND data_vencimento < ?`,
      [hoje],
      (err, row) => { result.contasReceberVencidas = (row && row.count) ? row.count : 0; done(); }
    );
    db.get(
      `SELECT COALESCE(SUM(valor), 0) as total, COUNT(*) as count FROM contas_pagar WHERE status IN ('pendente', 'parcial')`,
      [],
      (err, row) => {
        result.contasPagarTotal = (row && row.total) ? row.total : 0;
        result.contasPagarCount = (row && row.count) ? row.count : 0;
        done();
      }
    );
    db.get(
      `SELECT COUNT(*) as count FROM contas_pagar WHERE status IN ('pendente', 'parcial') AND data_vencimento < ?`,
      [hoje],
      (err, row) => { result.contasPagarVencidas = (row && row.count) ? row.count : 0; done(); }
    );
    db.get(
      `SELECT COALESCE(SUM(saldo), 0) as total FROM bancos`,
      [],
      (err, row) => { result.saldoBancario = (row && row.total) ? row.total : 0; done(); }
    );
  };

  runQueries((r) => {
    const receitaVariacao = r.receitaMesAnt > 0 ? ((r.receitaMensal - r.receitaMesAnt) / r.receitaMesAnt) * 100 : (r.receitaMensal > 0 ? 100 : 0);
    const despesasVariacao = r.despesasMesAnt > 0 ? ((r.despesasMensal - r.despesasMesAnt) / r.despesasMesAnt) * 100 : (r.despesasMesAnt > 0 ? -100 : 0);
    const lucroLiquido = r.receitaMensal - r.despesasMensal;
    const lucroMesAnt = r.receitaMesAnt - r.despesasMesAnt;
    const lucroVariacao = lucroMesAnt !== 0 ? ((lucroLiquido - lucroMesAnt) / Math.abs(lucroMesAnt)) * 100 : (lucroLiquido > 0 ? 100 : 0);

    db.all(
      `SELECT strftime('%m', data_vencimento) as mes, strftime('%Y', data_vencimento) as ano,
        SUM(CASE WHEN status = 'recebido' OR (status IN ('pendente','parcial') AND data_vencimento <= date('now')) THEN valor ELSE 0 END) as receita
       FROM contas_receber WHERE strftime('%Y', data_vencimento) = ? GROUP BY mes, ano`,
      [String(ano)],
      (err, rowsReceita) => {
        db.all(
          `SELECT strftime('%m', data_vencimento) as mes, strftime('%Y', data_vencimento) as ano, SUM(valor) as despesa
           FROM contas_pagar WHERE status = 'pago' AND strftime('%Y', data_pagamento) = ? GROUP BY strftime('%m', data_pagamento), strftime('%Y', data_pagamento)`,
          [String(ano)],
          (err2, rowsDespesa) => {
            const meses = ['01','02','03','04','05','06','07','08','09','10','11','12'];
            const receitaPorMes = {};
            (rowsReceita || []).forEach(x => { receitaPorMes[x.mes] = parseFloat(x.receita) || 0; });
            const despesaPorMes = {};
            (rowsDespesa || []).forEach(x => { despesaPorMes[x.mes] = parseFloat(x.despesa) || 0; });
            const chartReceitasDespesas = meses.map(m => ({
              mes: m,
              nome: ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][parseInt(m) - 1],
              receita: receitaPorMes[m] || 0,
              despesa: despesaPorMes[m] || 0
            }));

            db.all(
              `SELECT categoria, SUM(valor) as valor FROM contas_pagar WHERE status = 'pago' AND strftime('%Y', data_pagamento) = ? AND strftime('%m', data_pagamento) = ? GROUP BY COALESCE(categoria, 'Outros')`,
              [String(ano), String(mes).padStart(2, '0')],
              (err3, rowsCat) => {
                const totalCat = (rowsCat || []).reduce((s, x) => s + (parseFloat(x.valor) || 0), 0);
                const chartCategorias = (rowsCat || []).map(x => ({
                  nome: x.categoria || 'Outros',
                  valor: parseFloat(x.valor) || 0,
                  percentual: totalCat > 0 ? ((parseFloat(x.valor) || 0) / totalCat) * 100 : 0
                }));

                let saldoAcum = 0;
                const chartSaldo = chartReceitasDespesas.map((m, i) => {
                  saldoAcum += (m.receita - m.despesa);
                  return { mes: m.nome, saldo: Math.round(saldoAcum * 100) / 100 };
                });

                res.json({
                  receitaMensal: r.receitaMensal,
                  despesasMensal: r.despesasMensal,
                  lucroLiquido,
                  receitaVariacao,
                  despesasVariacao,
                  lucroVariacao,
                  contasReceber: { total: r.contasReceberTotal, count: r.contasReceberCount, vencidas: r.contasReceberVencidas },
                  contasPagar: { total: r.contasPagarTotal, count: r.contasPagarCount, vencidas: r.contasPagarVencidas },
                  saldoBancario: r.saldoBancario,
                  saldoVariacao: 0,
                  chartReceitasDespesas,
                  chartSaldo,
                  chartCategorias,
                  mes,
                  ano
                });
              }
            );
          }
        );
      }
    );
  });
});

// Delete genérico financeiro
app.delete('/api/financeiro/:tipo/:id', authenticateToken, checkModulePermission('financeiro'), (req, res) => {
  const { tipo, id } = req.params;
  const tables = {
    'contas-pagar': 'contas_pagar',
    'contas-receber': 'contas_receber',
    'fluxo-caixa': 'fluxo_caixa',
    'bancos': 'bancos'
  };

  // Validação de input
  if (!tipo || !id) {
    return res.status(400).json({ error: 'Tipo e ID são obrigatórios' });
  }

  // Validar que o ID é numérico
  const idNum = parseInt(id);
  if (isNaN(idNum) || idNum <= 0) {
    return res.status(400).json({ error: 'ID inválido' });
  }

  const table = tables[tipo];
  if (!table) {
    return res.status(400).json({ error: 'Tipo inválido' });
  }

  // Usar prepared statement para prevenir SQL injection
  db.run(`DELETE FROM ${table} WHERE id = ?`, [idNum], function(err) {
    if (err) {
      console.error('Erro ao deletar:', err);
      return res.status(500).json({ error: 'Erro ao excluir item' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Item não encontrado' });
    }
    res.json({ message: 'Item excluído com sucesso' });
  });
});

// Deletar todas as permissões de módulos de um usuário
app.delete('/api/permissoes/usuario/:id/modulos', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  const { id } = req.params;
  db.run(
    'DELETE FROM permissoes WHERE usuario_id = ? AND grupo_id IS NULL',
    [id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ message: 'Permissões de módulos removidas com sucesso' });
    }
  );
});

// ========== ROTAS MÓDULO OPERACIONAL ==========
// Colaboradores
app.get('/api/operacional/colaboradores', authenticateToken, checkModulePermission('operacional'), (req, res) => {
  const { search, status, setor, disponivel } = req.query;
  let query = `SELECT c.*, 
    (SELECT COUNT(*) FROM atividades_colaboradores ac WHERE ac.colaborador_id = c.id AND ac.status = 'em_andamento') as atividades_ativas,
    (SELECT COUNT(*) FROM controle_presenca cp WHERE cp.colaborador_id = c.id AND cp.data = date('now') AND cp.status = 'presente') as presente_hoje
    FROM colaboradores c WHERE 1=1`;
  const params = [];

  if (search) {
    query += ' AND (c.nome LIKE ? OR c.matricula LIKE ? OR c.cpf LIKE ?)';
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }
  if (status) {
    query += ' AND c.status = ?';
    params.push(status);
  }
  if (setor) {
    query += ' AND c.setor = ?';
    params.push(setor);
  }
  if (disponivel !== undefined) {
    query += ' AND c.disponivel = ?';
    params.push(disponivel === 'true' || disponivel === '1' ? 1 : 0);
  }

  query += ' ORDER BY c.nome';

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    if (!rows || rows.length === 0) {
      return res.json([]);
    }
    
    // Para cada colaborador, buscar atividade atual
    let completed = 0;
    const total = rows.length;
    
    if (total === 0) {
      return res.json([]);
    }
    
    rows.forEach((colab) => {
      // Buscar atividade em andamento
      db.get(`SELECT ac.*, 
        os.numero_os,
        os.descricao as os_descricao,
        oi.descricao as item_descricao,
        oi.etapa_fabricacao,
        e.nome as equipamento_nome,
        e.tipo as equipamento_tipo
        FROM atividades_colaboradores ac
        LEFT JOIN ordens_servico os ON ac.os_id = os.id
        LEFT JOIN os_itens oi ON ac.item_id = oi.id
        LEFT JOIN alocacao_equipamentos ae ON ac.os_id = ae.os_id AND ac.item_id = ae.item_id
        LEFT JOIN equipamentos e ON ae.equipamento_id = e.id
        WHERE ac.colaborador_id = ? AND ac.status = 'em_andamento'
        ORDER BY ac.data_inicio DESC
        LIMIT 1`, [colab.id], (err2, atividade) => {
        if (!err2 && atividade) {
          // Calcular tempo decorrido
          const inicio = new Date(atividade.data_inicio);
          const agora = new Date();
          const diffMs = agora - inicio;
          const diffHoras = Math.floor(diffMs / (1000 * 60 * 60));
          const diffMinutos = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
          
          colab.atividade_atual = {
            id: atividade.id,
            tipo: atividade.tipo_atividade,
            descricao: atividade.descricao || atividade.item_descricao || atividade.os_descricao,
            numero_os: atividade.numero_os,
            item_descricao: atividade.item_descricao,
            etapa: atividade.etapa_fabricacao,
            equipamento: atividade.equipamento_nome,
            equipamento_tipo: atividade.equipamento_tipo,
            data_inicio: atividade.data_inicio,
            tempo_decorrido: `${diffHoras}h ${diffMinutos}min`,
            horas_decorridas: diffHoras + (diffMinutos / 60)
          };
          colab.status_trabalho = 'trabalhando';
          completed++;
          if (completed === total) {
            res.json(rows);
          }
        } else {
          // Verificar se está presente hoje
          db.get(`SELECT * FROM controle_presenca 
            WHERE colaborador_id = ? AND data = date('now') AND status = 'presente'`, 
            [colab.id], (err3, presenca) => {
              if (!err3 && presenca) {
                colab.status_trabalho = colab.disponivel ? 'disponivel' : 'parado';
              } else {
                colab.status_trabalho = 'ausente';
              }
              colab.atividade_atual = null;
              completed++;
              if (completed === total) {
                res.json(rows);
              }
            });
        }
      });
    });
  });
});

app.get('/api/operacional/colaboradores/:id', authenticateToken, checkModulePermission('operacional'), (req, res) => {
  const { id } = req.params;
  db.get('SELECT * FROM colaboradores WHERE id = ?', [id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: 'Colaborador não encontrado' });
    }
    res.json(row);
  });
});

app.post('/api/operacional/colaboradores', authenticateToken, checkModulePermission('operacional'), (req, res) => {
  normalizarMaiusculas(req.body, ['nome', 'cargo', 'setor', 'observacoes']);
  const { nome, cpf, matricula, cargo, setor, telefone, email, data_admissao, salario_base, tipo_contrato, status, disponivel, observacoes } = req.body;
  
  if (!nome) {
    return res.status(400).json({ error: 'Nome é obrigatório' });
  }

  db.run(`INSERT INTO colaboradores (nome, cpf, matricula, cargo, setor, telefone, email, data_admissao, salario_base, tipo_contrato, status, disponivel, observacoes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [nome, cpf || null, matricula || null, cargo || null, setor || null, telefone || null, email || null, data_admissao || null, salario_base || null, tipo_contrato || null, status || 'ativo', disponivel !== undefined ? disponivel : 1, observacoes || null],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint')) {
          return res.status(400).json({ error: 'CPF ou Matrícula já cadastrado' });
        }
        return res.status(500).json({ error: err.message });
      }
      res.json({ id: this.lastID, message: 'Colaborador criado com sucesso' });
    });
});

app.put('/api/operacional/colaboradores/:id', authenticateToken, checkModulePermission('operacional'), (req, res) => {
  const { id } = req.params;
  normalizarMaiusculas(req.body, ['nome', 'cargo', 'setor', 'observacoes']);
  const { nome, cpf, matricula, cargo, setor, telefone, email, data_admissao, salario_base, tipo_contrato, status, disponivel, observacoes } = req.body;
  
  db.run(`UPDATE colaboradores SET nome = ?, cpf = ?, matricula = ?, cargo = ?, setor = ?, telefone = ?, email = ?, data_admissao = ?, salario_base = ?, tipo_contrato = ?, status = ?, disponivel = ?, observacoes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [nome, cpf || null, matricula || null, cargo || null, setor || null, telefone || null, email || null, data_admissao || null, salario_base || null, tipo_contrato || null, status || 'ativo', disponivel !== undefined ? disponivel : 1, observacoes || null, id],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint')) {
          return res.status(400).json({ error: 'CPF ou Matrícula já cadastrado' });
        }
        return res.status(500).json({ error: err.message });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Colaborador não encontrado' });
      }
      res.json({ message: 'Colaborador atualizado com sucesso' });
    });
});

app.delete('/api/operacional/colaboradores/:id', authenticateToken, checkModulePermission('operacional'), (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM colaboradores WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Colaborador não encontrado' });
    }
    res.json({ message: 'Colaborador excluído com sucesso' });
  });
});

// Ordens de Serviço
app.get('/api/operacional/ordens-servico', authenticateToken, checkModulePermission('operacional'), (req, res) => {
  const { search, status, prioridade, cliente_id, projeto_id } = req.query;
  
  // Verificar se a tabela os_itens existe
  db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='os_itens'", [], (err, table) => {
    if (err) {
      console.error('Erro ao verificar tabela os_itens:', err);
      return res.status(500).json({ error: 'Erro ao verificar banco de dados' });
    }
    
    const hasOsItens = !!table;
    
    let query = `SELECT os.*, 
      COALESCE(c.razao_social, '') as cliente_nome, 
      COALESCE(p.nome, '') as projeto_nome,
      COALESCE(u.nome, '') as responsavel_nome,
      COALESCE(prop.numero_proposta, '') as proposta_numero`;
    
    if (hasOsItens) {
      query += `,
      (SELECT COUNT(*) FROM os_itens oi WHERE oi.os_id = os.id) as total_itens,
      (SELECT COUNT(*) FROM os_itens oi WHERE oi.os_id = os.id AND oi.status_item = 'concluido') as itens_concluidos`;
    } else {
      query += `,
      0 as total_itens,
      0 as itens_concluidos`;
    }
    
    query += ` FROM ordens_servico os
      LEFT JOIN clientes c ON os.cliente_id = c.id
      LEFT JOIN projetos p ON os.projeto_id = p.id
      LEFT JOIN usuarios u ON os.responsavel_id = u.id
      LEFT JOIN propostas prop ON os.proposta_id = prop.id
      WHERE 1=1`;
    
    const params = [];

    if (search) {
      query += ' AND (os.numero_os LIKE ? OR os.descricao LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm);
    }
    if (status) {
      query += ' AND os.status = ?';
      params.push(status);
    }
    if (prioridade) {
      query += ' AND os.prioridade = ?';
      params.push(prioridade);
    }
    if (cliente_id) {
      query += ' AND os.cliente_id = ?';
      params.push(cliente_id);
    }
    if (projeto_id) {
      query += ' AND os.projeto_id = ?';
      params.push(projeto_id);
    }

    query += ' ORDER BY os.data_abertura DESC, os.numero_os DESC';

    db.all(query, params, (err, rows) => {
      if (err) {
        console.error('Erro ao buscar OS:', err);
        return res.status(500).json({ error: err.message });
      }
      
      // Garantir que total_itens e itens_concluidos sejam números
      const rowsProcessed = (rows || []).map(row => ({
        ...row,
        total_itens: parseInt(row.total_itens) || 0,
        itens_concluidos: parseInt(row.itens_concluidos) || 0
      }));
      
      res.json(rowsProcessed);
    });
  });
});

// Ordens de Serviço - Módulo Comercial (acesso sem permissão operacional)
app.get('/api/comercial/ordens-servico', authenticateToken, checkModulePermission('comercial'), (req, res) => {
  try {
    const { search, status, prioridade, proposta_id } = req.query;
    
    // Verificar se a tabela existe primeiro
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='ordens_servico'", [], (err, table) => {
      if (err) {
        console.error('❌ Erro ao verificar tabela ordens_servico:', err);
        return res.status(500).json({ 
          error: 'Erro ao verificar banco de dados',
          message: process.env.NODE_ENV === 'development' ? err.message : 'Erro interno do servidor'
        });
      }
      
      if (!table) {
        // Tabela não existe, retornar array vazio
        return res.json([]);
      }
      
      // Construir query - verificar se tabela os_itens existe
      db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='os_itens'", [], (err, osItensTable) => {
        if (err) {
          console.error('❌ Erro ao verificar tabela os_itens:', err);
        }
        
        const hasOsItensTable = !!osItensTable;
        
        // Construir query - fazer JOIN condicional com projetos para evitar erro se coluna não existir
        let query = `SELECT os.*, 
          COALESCE(c.razao_social, '') as cliente_nome, 
          '' as projeto_nome,
          COALESCE(u.nome, '') as responsavel_nome,
          COALESCE(prop.numero_proposta, '') as proposta_numero,
          COALESCE(prop.id, 0) as proposta_id`;
        
        if (hasOsItensTable) {
          query += `,
          COALESCE((SELECT COUNT(*) FROM os_itens oi WHERE oi.os_id = os.id), 0) as total_itens,
          COALESCE((SELECT COUNT(*) FROM os_itens oi WHERE oi.os_id = os.id AND oi.status_item = 'concluido'), 0) as itens_concluidos`;
        } else {
          query += `,
          0 as total_itens,
          0 as itens_concluidos`;
        }
        
        query += `
          FROM ordens_servico os
          LEFT JOIN clientes c ON os.cliente_id = c.id
          LEFT JOIN usuarios u ON os.responsavel_id = u.id
          LEFT JOIN propostas prop ON os.proposta_id = prop.id
          WHERE 1=1`; // Mostrar todas as OS (removido filtro de proposta_id e JOIN com projetos)
        const params = [];

        if (search) {
          query += ' AND (os.numero_os LIKE ? OR os.descricao LIKE ? OR c.razao_social LIKE ? OR prop.numero_proposta LIKE ?)';
          const searchTerm = `%${search}%`;
          params.push(searchTerm, searchTerm, searchTerm, searchTerm);
        }
        if (status) {
          query += ' AND os.status = ?';
          params.push(status);
        }
        if (prioridade) {
          query += ' AND os.prioridade = ?';
          params.push(prioridade);
        }
        if (proposta_id) {
          query += ' AND os.proposta_id = ?';
          params.push(proposta_id);
        }

        query += ' ORDER BY os.data_abertura DESC, os.numero_os DESC';

        db.all(query, params, (err, rows) => {
          if (err) {
            // Se o erro for por tabela não existir, retornar array vazio
            if (err.message && (err.message.includes('no such table') || err.message.includes('no such column'))) {
              return res.json([]);
            }
            return res.status(500).json({ 
              error: 'Erro ao buscar ordens de serviço',
              message: process.env.NODE_ENV === 'development' ? err.message : 'Erro interno do servidor'
            });
          }
          
          // Garantir que total_itens e itens_concluidos sejam números
          const rowsProcessed = (rows || []).map(row => ({
            ...row,
            total_itens: parseInt(row.total_itens) || 0,
            itens_concluidos: parseInt(row.itens_concluidos) || 0
          }));
          res.json(rowsProcessed);
        });
      });
    });
  } catch (error) {
    console.error('❌ Erro geral na rota /api/comercial/ordens-servico:', error);
    return res.status(500).json({ 
      error: 'Erro interno do servidor',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

app.get('/api/operacional/ordens-servico/proximo-numero', authenticateToken, checkModulePermission('operacional'), (req, res) => {
  db.get('SELECT numero_os FROM ordens_servico ORDER BY id DESC LIMIT 1', [], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    let proximoNumero = 'OS-001';
    if (row && row.numero_os) {
      const match = row.numero_os.match(/\d+/);
      if (match) {
        const numero = parseInt(match[0]) + 1;
        proximoNumero = `OS-${numero.toString().padStart(3, '0')}`;
      }
    }
    res.json({ proximo_numero: proximoNumero });
  });
});

// Rota para buscar OS específica - permite acesso comercial e operacional
app.get('/api/operacional/ordens-servico/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  // Query simples - buscar apenas a OS, sem JOINs que podem causar erro
  db.get(`SELECT * FROM ordens_servico WHERE id = ?`, [id], (err, os) => {
    if (err) {
      console.error('Erro ao buscar OS:', err);
      return res.status(500).json({ error: err.message });
    }
    
    if (!os) {
      return res.status(404).json({ error: 'Ordem de Serviço não encontrada' });
    }
    
    // Inicializar campos relacionados
    const result = { ...os };
    result.cliente_nome = '';
    result.projeto_nome = '';
    result.responsavel_nome = '';
    result.proposta_numero = '';
    
    // Buscar dados relacionados de forma segura (ignorar erros)
    let completed = 0;
    const total = 4;
    
    const checkComplete = () => {
      completed++;
      if (completed === total) {
        res.json(result);
      }
    };
    
    // Buscar cliente
    if (os.cliente_id) {
      db.get('SELECT razao_social FROM clientes WHERE id = ?', [os.cliente_id], (err, cliente) => {
        if (!err && cliente) result.cliente_nome = cliente.razao_social || '';
        checkComplete();
      });
    } else {
      checkComplete();
    }
    
    // Buscar projeto
    if (os.projeto_id) {
      db.get('SELECT nome FROM projetos WHERE id = ?', [os.projeto_id], (err, projeto) => {
        if (!err && projeto) result.projeto_nome = projeto.nome || '';
        checkComplete();
      });
    } else {
      checkComplete();
    }
    
    // Buscar responsável
    if (os.responsavel_id) {
      db.get('SELECT nome FROM usuarios WHERE id = ?', [os.responsavel_id], (err, usuario) => {
        if (!err && usuario) result.responsavel_nome = usuario.nome || '';
        checkComplete();
      });
    } else {
      checkComplete();
    }
    
    // Buscar proposta
    if (os.proposta_id) {
      db.get('SELECT numero_proposta FROM propostas WHERE id = ?', [os.proposta_id], (err, proposta) => {
        if (!err && proposta) result.proposta_numero = proposta.numero_proposta || '';
        checkComplete();
      });
    } else {
      checkComplete();
    }
  });
});

// Rota para criar OS - permite acesso comercial e operacional
app.post('/api/operacional/ordens-servico', authenticateToken, (req, res, next) => {
  // Verificar se tem permissão operacional OU comercial
  if (req.user.role === 'admin') {
    return next();
  }
  
  const userId = req.user.id;
  db.all(
    `SELECT gp.id FROM grupos_permissoes gp
     INNER JOIN usuarios_grupos ug ON gp.id = ug.grupo_id
     WHERE ug.usuario_id = ? AND gp.ativo = 1 AND (gp.modulo = 'operacional' OR gp.modulo = 'comercial')`,
    [userId],
    (err, grupos) => {
      if (err) {
        return res.status(500).json({ error: 'Erro ao verificar permissões' });
      }
      if (!grupos || grupos.length === 0) {
        // Se não tem grupos, permitir apenas comercial por padrão
        return next();
      }
      next();
    }
  );
}, (req, res) => {
  normalizarMaiusculas(req.body, ['tipo_os', 'prioridade', 'descricao', 'observacoes']);
  const { numero_os, projeto_id, cliente_id, tipo_os, prioridade, status, data_abertura, data_prevista, descricao, observacoes, responsavel_id, valor_total } = req.body;
  
  if (!numero_os || !tipo_os || !data_abertura) {
    return res.status(400).json({ error: 'Número OS, tipo e data de abertura são obrigatórios' });
  }

  const { proposta_id } = req.body;
  
  // Garantir que a coluna proposta_id existe antes de inserir
  db.run(`ALTER TABLE ordens_servico ADD COLUMN proposta_id INTEGER`, (err) => {
    // Ignorar erro se coluna já existe
    if (err && !err.message.includes('duplicate column') && !err.message.includes('already exists')) {
      console.warn('⚠️ Aviso ao verificar coluna proposta_id:', err.message);
    }
    
    // Agora fazer o INSERT
    db.run(`INSERT INTO ordens_servico (numero_os, proposta_id, projeto_id, cliente_id, tipo_os, prioridade, status, data_abertura, data_prevista, descricao, observacoes, responsavel_id, valor_total, pdf_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [numero_os, proposta_id || null, projeto_id || null, cliente_id || null, tipo_os, prioridade || 'normal', status || 'pendente', data_abertura, data_prevista || null, descricao || null, observacoes || null, responsavel_id || null, valor_total || 0, null],
      function(err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint')) {
            return res.status(400).json({ error: 'Número de OS já existe' });
          }
          if (err.message.includes('no column named')) {
            // Se ainda não tem a coluna, tentar adicionar novamente e retentar
            console.error('❌ Coluna não encontrada, tentando adicionar novamente...');
            db.run(`ALTER TABLE ordens_servico ADD COLUMN proposta_id INTEGER`, (alterErr) => {
              if (alterErr && !alterErr.message.includes('duplicate') && !alterErr.message.includes('already exists')) {
                return res.status(500).json({ 
                  error: 'Erro ao adicionar coluna proposta_id',
                  message: process.env.NODE_ENV === 'development' ? alterErr.message : 'Erro interno do servidor'
                });
              }
              // Retentar o INSERT
              db.run(`INSERT INTO ordens_servico (numero_os, proposta_id, projeto_id, cliente_id, tipo_os, prioridade, status, data_abertura, data_prevista, descricao, observacoes, responsavel_id, valor_total, pdf_url)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [numero_os, proposta_id || null, projeto_id || null, cliente_id || null, tipo_os, prioridade || 'normal', status || 'pendente', data_abertura, data_prevista || null, descricao || null, observacoes || null, responsavel_id || null, valor_total || 0, null],
                function(retryErr) {
                  if (retryErr) {
                    if (retryErr.message.includes('UNIQUE constraint')) {
                      return res.status(400).json({ error: 'Número de OS já existe' });
                    }
                    return res.status(500).json({ error: retryErr.message });
                  }
                  res.json({ id: this.lastID, message: 'Ordem de Serviço criada com sucesso' });
                });
            });
            return;
          }
          return res.status(500).json({ error: err.message });
        }
        res.json({ id: this.lastID, message: 'Ordem de Serviço criada com sucesso' });
      });
  });
});

app.put('/api/operacional/ordens-servico/:id', authenticateToken, checkModulePermission('operacional'), (req, res) => {
  const { id } = req.params;
  normalizarMaiusculas(req.body, ['tipo_os', 'prioridade', 'descricao', 'observacoes']);
  const { numero_os, projeto_id, cliente_id, tipo_os, prioridade, status, data_abertura, data_prevista, data_inicio, data_conclusao, descricao, observacoes, responsavel_id, valor_total, custo_real } = req.body;
  
  const { proposta_id } = req.body;
  db.run(`UPDATE ordens_servico SET numero_os = ?, proposta_id = ?, projeto_id = ?, cliente_id = ?, tipo_os = ?, prioridade = ?, status = ?, data_abertura = ?, data_prevista = ?, data_inicio = ?, data_conclusao = ?, descricao = ?, observacoes = ?, responsavel_id = ?, valor_total = ?, custo_real = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [numero_os, proposta_id || null, projeto_id || null, cliente_id || null, tipo_os, prioridade || 'normal', status || 'pendente', data_abertura, data_prevista || null, data_inicio || null, data_conclusao || null, descricao || null, observacoes || null, responsavel_id || null, valor_total || 0, custo_real || null, id],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint')) {
          return res.status(400).json({ error: 'Número de OS já existe' });
        }
        return res.status(500).json({ error: err.message });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Ordem de Serviço não encontrada' });
      }
      res.json({ message: 'Ordem de Serviço atualizada com sucesso' });
    });
});

app.delete('/api/operacional/ordens-servico/:id', authenticateToken, checkModulePermission('operacional'), (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM ordens_servico WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Ordem de Serviço não encontrada' });
    }
    res.json({ message: 'Ordem de Serviço excluída com sucesso' });
  });
});

// Gerar PDF da OS usando Puppeteer (POST para gerar e salvar)
app.post('/api/operacional/ordens-servico/:id/gerar-pdf', authenticateToken, async (req, res) => {
  const { id } = req.params;
  let browser = null;
  
  try {
    // Buscar OS completa
    const os = await new Promise((resolve, reject) => {
      // Primeiro buscar a OS básica
      db.get(`SELECT * FROM ordens_servico WHERE id = ?`, [id], async (err, osRow) => {
        if (err) {
          reject(err);
          return;
        }
        
        if (!osRow) {
          resolve(null);
          return;
        }
        
        // Buscar dados relacionados separadamente para evitar erros de colunas faltantes
        const osData = { ...osRow };
        
        // Buscar cliente
        if (osRow.cliente_id) {
          try {
            const cliente = await new Promise((res, rej) => {
              db.get(`SELECT razao_social, cnpj, endereco, cidade, estado, cep FROM clientes WHERE id = ?`, [osRow.cliente_id], (err, row) => {
                if (err) rej(err);
                else res(row);
              });
            });
            if (cliente) {
              osData.cliente_nome = cliente.razao_social;
              osData.cnpj = cliente.cnpj;
              osData.cliente_endereco = cliente.endereco;
              osData.cliente_cidade = cliente.cidade;
              osData.cliente_estado = cliente.estado;
              osData.cliente_cep = cliente.cep;
            }
          } catch (e) {
            console.warn('Erro ao buscar cliente:', e.message);
          }
        }
        
        // Buscar projeto (se existir a tabela e a coluna)
        if (osRow.projeto_id) {
          try {
            const projeto = await new Promise((res, rej) => {
              db.get(`SELECT nome FROM projetos WHERE id = ?`, [osRow.projeto_id], (err, row) => {
                if (err && !err.message.includes('no such column')) rej(err);
                else res(row);
              });
            });
            if (projeto) {
              osData.projeto_nome = projeto.nome;
            }
          } catch (e) {
            console.warn('Erro ao buscar projeto:', e.message);
            osData.projeto_nome = '';
          }
        } else {
          osData.projeto_nome = '';
        }
        
        // Buscar responsável
        if (osRow.responsavel_id) {
          try {
            const usuario = await new Promise((res, rej) => {
              db.get(`SELECT nome FROM usuarios WHERE id = ?`, [osRow.responsavel_id], (err, row) => {
                if (err) rej(err);
                else res(row);
              });
            });
            if (usuario) {
              osData.responsavel_nome = usuario.nome;
            }
          } catch (e) {
            console.warn('Erro ao buscar responsável:', e.message);
          }
        }
        
        // Buscar proposta
        if (osRow.proposta_id) {
          try {
            // Buscar apenas numero_proposta, SEM valor_total (confidencial)
            const proposta = await new Promise((res, rej) => {
              db.get(`SELECT numero_proposta FROM propostas WHERE id = ?`, [osRow.proposta_id], (err, row) => {
                if (err) rej(err);
                else res(row);
              });
            });
            if (proposta) {
              osData.numero_proposta = proposta.numero_proposta;
            }
          } catch (e) {
            console.warn('Erro ao buscar proposta:', e.message);
          }
        }
        
        resolve(osData);
      });
    });

    if (!os) {
      return res.status(404).json({ error: 'Ordem de Serviço não encontrada' });
    }

    // Buscar itens da OS com especificações técnicas dos produtos
    const osItens = await new Promise((resolve, reject) => {
      // Primeiro, buscar todos os itens da OS
      db.all(`
        SELECT oi.*
        FROM os_itens oi
        WHERE oi.os_id = ? 
        ORDER BY oi.id
      `, [id], async (err, rows) => {
        if (err) {
          console.error('❌ [PDF] Erro ao buscar itens da OS:', err);
          reject(err);
          return;
        }
        
        console.log(`📦 [PDF] Itens encontrados: ${rows ? rows.length : 0}`);
        
        if (!rows || rows.length === 0) {
          resolve([]);
          return;
        }
        
        // Para cada item, buscar o produto completo separadamente
        const itensComProdutos = await Promise.all(rows.map(async (item) => {
          let produto = null;
          
          // Método 1: Buscar por código_produto se existir
          if (item.codigo_produto) {
            try {
              // Tentar buscar com TRIM primeiro
              produto = await new Promise((res, rej) => {
                db.get(`
                  SELECT nome, descricao, especificacoes_tecnicas, imagem 
                  FROM produtos 
                  WHERE TRIM(codigo) = TRIM(?)
                `, [item.codigo_produto], (err, row) => {
                  if (err) rej(err);
                  else res(row);
                });
              });
              
              // Se não encontrou, tentar sem TRIM
              if (!produto) {
                produto = await new Promise((res, rej) => {
                  db.get(`
                    SELECT nome, descricao, especificacoes_tecnicas, imagem 
                    FROM produtos 
                    WHERE codigo = ?
                  `, [item.codigo_produto], (err, row) => {
                    if (err) rej(err);
                    else res(row);
                  });
                });
              }
              
              if (produto) {
                console.log(`✅ [PDF] Produto encontrado por código "${item.codigo_produto}": imagem="${produto.imagem || 'N/A'}"`);
              } else {
                console.warn(`⚠️ [PDF] Produto não encontrado para código: "${item.codigo_produto}"`);
              }
            } catch (error) {
              console.error(`❌ [PDF] Erro ao buscar produto por código "${item.codigo_produto}":`, error.message);
            }
          }
          
          // Método 2: Se não encontrou por código e tem descrição, tentar buscar por nome/descrição
          if (!produto && item.descricao) {
            try {
              // Buscar produto que tenha nome ou descrição similar à descrição do item
              produto = await new Promise((res, rej) => {
                db.get(`
                  SELECT nome, descricao, especificacoes_tecnicas, imagem 
                  FROM produtos 
                  WHERE nome LIKE ? OR descricao LIKE ?
                  LIMIT 1
                `, [`%${item.descricao}%`, `%${item.descricao}%`], (err, row) => {
                  if (err) rej(err);
                  else res(row);
                });
              });
              
              if (produto) {
                console.log(`✅ [PDF] Produto encontrado por descrição "${item.descricao}": imagem="${produto.imagem || 'N/A'}"`);
              }
            } catch (error) {
              console.warn(`⚠️ [PDF] Erro ao buscar produto por descrição:`, error.message);
            }
          }
          
          // Se encontrou produto, preencher dados
          if (produto) {
            item.nome_produto = produto.nome;
            item.produto_descricao = produto.descricao;
            item.produto_especificacoes = produto.especificacoes_tecnicas;
            item.produto_imagem = produto.imagem;
          } else {
            console.warn(`⚠️ [PDF] Item sem produto encontrado: id=${item.id}, descrição="${item.descricao || 'N/A'}"`);
          }
          
          return item;
        }));
        if (err) {
          reject(err);
          return;
        }
        
        if (!rows || rows.length === 0) {
          resolve([]);
          return;
        }
        
        // Processar cada item para incluir especificações técnicas e converter imagens para base64
        const itensProcessados = await Promise.all(itensComProdutos.map(async (item) => {
          console.log(`🔍 [PDF] Processando item:`, {
            id: item.id,
            codigo_produto: item.codigo_produto,
            nome_produto: item.nome_produto,
            produto_imagem: item.produto_imagem,
            descricao: item.descricao
          });
          
          // Tentar parsear especificações do item (salvas em observacoes)
          let especsItem = {};
          try {
            if (item.observacoes) {
              const parsed = JSON.parse(item.observacoes);
              if (parsed.especificacoes_tecnicas) {
                especsItem = typeof parsed.especificacoes_tecnicas === 'string' 
                  ? JSON.parse(parsed.especificacoes_tecnicas) 
                  : parsed.especificacoes_tecnicas;
              }
            }
          } catch (e) {
            // Ignorar erros
          }
          
          // Se não tem especificações no item, tentar do produto
          if (Object.keys(especsItem).length === 0 && item.produto_especificacoes) {
            try {
              especsItem = typeof item.produto_especificacoes === 'string' 
                ? JSON.parse(item.produto_especificacoes) 
                : item.produto_especificacoes;
            } catch (e) {
              // Ignorar erros
            }
          }
          
          // Adicionar especificações ao item
          item.especificacoes_tecnicas = especsItem;
          
          // Garantir nome do produto
          if (!item.nome_produto && item.produto_descricao) {
            item.nome_produto = item.produto_descricao;
          }
          
          // Se não encontrou produto pelo JOIN, tentar buscar diretamente pelo código
          // Buscar TODOS os dados do produto, não só a imagem
          if (!item.produto_imagem && item.codigo_produto) {
            try {
              const produto = await new Promise((res, rej) => {
                db.get('SELECT imagem, nome, descricao, especificacoes_tecnicas FROM produtos WHERE codigo = ?', [item.codigo_produto], (err, row) => {
                  if (err) rej(err);
                  else res(row);
                });
              });
              if (produto) {
                if (produto.imagem) {
                  item.produto_imagem = produto.imagem;
                  console.log(`✅ [PDF] Imagem encontrada buscando produto diretamente: ${produto.imagem}`);
                }
                // Também preencher outros dados se não vieram do JOIN
                if (!item.nome_produto && produto.nome) {
                  item.nome_produto = produto.nome;
                }
                if (!item.produto_descricao && produto.descricao) {
                  item.produto_descricao = produto.descricao;
                }
                if (!item.produto_especificacoes && produto.especificacoes_tecnicas) {
                  item.produto_especificacoes = produto.especificacoes_tecnicas;
                }
              } else {
                console.warn(`⚠️ [PDF] Produto não encontrado no banco: código=${item.codigo_produto}`);
              }
            } catch (error) {
              console.warn(`⚠️ [PDF] Erro ao buscar produto diretamente:`, error.message);
            }
          }
          
          // Log final do item processado
          console.log(`📋 [PDF] Item processado:`, {
            id: item.id,
            codigo: item.codigo_produto,
            nome: item.nome_produto,
            tem_imagem: !!item.produto_imagem,
            imagem: item.produto_imagem || 'N/A'
          });
          
          // Converter imagem do produto para base64 se existir
          if (item.produto_imagem) {
            let imagemConvertida = false;
            
            // Método 1: Tentar ler do sistema de arquivos
            try {
              const imagemPath = path.join(uploadsProdutosDir, item.produto_imagem);
              console.log(`🔍 [PDF] Tentando carregar imagem do sistema de arquivos: ${imagemPath}`);
              
              if (fs.existsSync(imagemPath)) {
                const imagemBuffer = fs.readFileSync(imagemPath);
                const imagemBase64 = imagemBuffer.toString('base64');
                const imagemExtension = path.extname(item.produto_imagem).substring(1).toLowerCase() || 'jpg';
                const mimeType = imagemExtension === 'jpg' || imagemExtension === 'jpeg' ? 'jpeg' : 
                                imagemExtension === 'png' ? 'png' : 
                                imagemExtension === 'gif' ? 'gif' : 
                                imagemExtension === 'webp' ? 'webp' : 'jpeg';
                item.produto_imagem_base64 = `data:image/${mimeType};base64,${imagemBase64}`;
                console.log(`✅ [PDF] Imagem convertida do sistema de arquivos: ${item.produto_imagem} (${imagemBase64.length} bytes)`);
                imagemConvertida = true;
              }
            } catch (error) {
              console.warn(`⚠️ [PDF] Erro ao ler do sistema de arquivos:`, error.message);
            }
            
            // Método 2: Se não encontrou no sistema de arquivos, tentar buscar via HTTP
            if (!imagemConvertida) {
              try {
                const http = require('http');
                const https = require('https');
                const url = require('url');
                
                // Construir URL da imagem
                const baseURL = process.env.API_URL || `http://localhost:${PORT}`;
                const imagemURL = `${baseURL}/api/uploads/produtos/${item.produto_imagem}`;
                console.log(`🌐 [PDF] Tentando buscar imagem via HTTP: ${imagemURL}`);
                
                const parsedURL = new URL(imagemURL);
                const client = parsedURL.protocol === 'https:' ? https : http;
                
                await new Promise((resolve, reject) => {
                  const req = client.get(imagemURL, (res) => {
                    if (res.statusCode !== 200) {
                      reject(new Error(`HTTP ${res.statusCode}`));
                      return;
                    }
                    
                    const chunks = [];
                    res.on('data', (chunk) => chunks.push(chunk));
                    res.on('end', () => {
                      try {
                        const imagemBuffer = Buffer.concat(chunks);
                        const imagemBase64 = imagemBuffer.toString('base64');
                        const imagemExtension = path.extname(item.produto_imagem).substring(1).toLowerCase() || 'jpg';
                        const mimeType = imagemExtension === 'jpg' || imagemExtension === 'jpeg' ? 'jpeg' : 
                                        imagemExtension === 'png' ? 'png' : 
                                        imagemExtension === 'gif' ? 'gif' : 
                                        imagemExtension === 'webp' ? 'webp' : 'jpeg';
                        item.produto_imagem_base64 = `data:image/${mimeType};base64,${imagemBase64}`;
                        console.log(`✅ [PDF] Imagem convertida via HTTP: ${item.produto_imagem} (${imagemBase64.length} bytes)`);
                        imagemConvertida = true;
                        resolve();
                      } catch (error) {
                        reject(error);
                      }
                    });
                  });
                  
                  req.on('error', (error) => {
                    console.warn(`⚠️ [PDF] Erro na requisição HTTP:`, error.message);
                    reject(error);
                  });
                  
                  req.setTimeout(5000, () => {
                    req.destroy();
                    reject(new Error('Timeout na requisição HTTP'));
                  });
                });
              } catch (error) {
                console.warn(`⚠️ [PDF] Não foi possível buscar imagem via HTTP:`, error.message);
                
                // Listar arquivos no diretório para debug
                try {
                  const arquivos = fs.readdirSync(uploadsProdutosDir);
                  console.log(`📁 [PDF] Arquivos no diretório produtos (${arquivos.length}):`, arquivos.slice(0, 10));
                  console.log(`📁 [PDF] Procurando por: ${item.produto_imagem}`);
                } catch (e) {
                  console.error(`❌ [PDF] Erro ao listar arquivos:`, e.message);
                }
              }
            }
            
            if (!imagemConvertida) {
              console.warn(`⚠️ [PDF] Não foi possível carregar imagem: ${item.produto_imagem}`);
            }
          } else {
            console.log(`⚠️ [PDF] Item sem imagem cadastrada: código=${item.codigo_produto || 'N/A'}, descrição=${item.descricao || 'N/A'}`);
          }
          
          return item;
        }));
        
        resolve(itensProcessados);
      });
    });

    // Gerar HTML
    let html;
    try {
      console.log('Iniciando geração de HTML para OS:', os.id, 'com', osItens.length, 'itens');
      html = gerarHTMLOS(os, osItens);
      if (!html || html.trim().length === 0) {
        throw new Error('HTML gerado está vazio');
      }
      console.log('HTML gerado com sucesso, tamanho:', html.length);
    } catch (error) {
      console.error('Erro ao gerar HTML da OS:', error);
      console.error('Stack:', error.stack);
      console.error('OS data:', JSON.stringify(os, null, 2));
      console.error('OS Itens:', JSON.stringify(osItens, null, 2));
      throw new Error(`Erro ao gerar HTML: ${error.message}`);
    }
    
    // Iniciar Puppeteer
    try {
      browser = await puppeteer.launch({
        ...getPuppeteerLaunchOptions(),
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu'
        ]
      });
    } catch (error) {
      console.error('Erro ao iniciar Puppeteer:', error);
      throw new Error(`Erro ao iniciar Puppeteer: ${error.message}`);
    }
    
    let page;
    try {
      page = await browser.newPage();
    } catch (error) {
      console.error('Erro ao criar nova página:', error);
      await browser.close();
      throw new Error(`Erro ao criar página: ${error.message}`);
    }
    
    // Configurar viewport
    await page.setViewport({
      width: 1200,
      height: 1600,
      deviceScaleFactor: 2
    });
    
    // Configurar URL base para recursos
    const baseURL = process.env.API_URL || `http://localhost:${PORT}`;
    
    // Interceptar requisições para converter URLs relativas em absolutas
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const url = request.url();
      console.log(`🌐 [PDF] Requisição: ${url}`);
      
      // Se for URL relativa, converter para absoluta
      if (url.startsWith('/')) {
        const absoluteUrl = `${baseURL}${url}`;
        console.log(`🔗 [PDF] Convertendo URL relativa: ${url} -> ${absoluteUrl}`);
        request.continue({ url: absoluteUrl });
      } 
      // Se for URL de uploads/produtos ou Logo, garantir que seja absoluta
      else if (url.includes('uploads/produtos') || url.includes('Logo_MY') || url.includes('Logo')) {
        const absoluteUrl = url.startsWith('http') ? url : `${baseURL}${url.startsWith('/') ? url : '/' + url}`;
        console.log(`🔗 [PDF] Convertendo URL de recurso: ${url} -> ${absoluteUrl}`);
        request.continue({ url: absoluteUrl });
      } 
      else {
        request.continue();
      }
    });
    
    // Carregar HTML
    try {
      await page.setContent(html, {
        waitUntil: ['load', 'domcontentloaded', 'networkidle0'],
        timeout: 60000
      });
    } catch (error) {
      console.error('Erro ao carregar HTML no Puppeteer:', error);
      await browser.close();
      throw new Error(`Erro ao carregar HTML: ${error.message}`);
    }
    
    // Aguardar imagens carregarem
    try {
      const imagesInfo = await page.evaluate(() => {
        const images = Array.from(document.images);
        console.log(`📊 Total de imagens encontradas no HTML: ${images.length}`);
        images.forEach((img, index) => {
          console.log(`🖼️ Imagem ${index + 1}: src="${img.src}", complete: ${img.complete}, naturalWidth: ${img.naturalWidth}`);
        });
        return Promise.all(
          images.map((img, index) => {
            if (img.complete && img.naturalWidth > 0) {
              console.log(`✅ Imagem ${index + 1} já carregada`);
              return Promise.resolve();
            }
            return new Promise((resolve) => {
              img.onload = () => {
                console.log(`✅ Imagem ${index + 1} carregada: ${img.src}`);
                resolve();
              };
              img.onerror = () => {
                console.warn(`❌ Erro ao carregar imagem ${index + 1}: ${img.src}`);
                resolve(); // Não falhar se imagem não carregar
              };
              setTimeout(() => {
                console.warn(`⏱️ Timeout imagem ${index + 1}: ${img.src}`);
                resolve();
              }, 10000); // Timeout de 10s
            });
          })
        );
      });
      console.log(`✅ Processamento de imagens concluído`);
    } catch (err) {
      console.warn('Erro ao aguardar imagens:', err.message);
      // Continuar mesmo se houver erro com imagens
    }
    
    // Aguardar renderização (Puppeteer 22+ não tem waitForTimeout)
    try {
      await new Promise(r => setTimeout(r, 2000));
    } catch (error) {
      console.warn('Erro ao aguardar timeout:', error.message);
    }
    
    // Gerar PDF
    let pdfBuffer;
    try {
      pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '15mm',
          right: '15mm',
          bottom: '15mm',
          left: '15mm'
        },
        preferCSSPageSize: true,
        displayHeaderFooter: false,
        scale: 1.0
      });
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      await browser.close();
      throw new Error(`Erro ao gerar PDF: ${error.message}`);
    }
    
    try {
      await browser.close();
    } catch (error) {
      console.warn('Erro ao fechar browser:', error.message);
    }
    browser = null;
    
    // Garantir que o diretório existe
    if (!fs.existsSync(uploadsOSDir)) {
      fs.mkdirSync(uploadsOSDir, { recursive: true });
    }
    
    // Salvar PDF
    const pdfPath = path.join(uploadsOSDir, `OS_${os.numero_os || id}_${Date.now()}.pdf`);
    fs.writeFileSync(pdfPath, pdfBuffer);
    
    // Salvar URL no banco (sem o prefixo /api/ pois será adicionado pelo frontend)
    const pdfUrl = `/uploads/ordens-servico/${path.basename(pdfPath)}`;
    await new Promise((resolve, reject) => {
      db.run('UPDATE ordens_servico SET pdf_url = ? WHERE id = ?', [pdfUrl, id], (err) => {
        if (err) {
          console.error('Erro ao salvar URL do PDF:', err);
          reject(err);
        } else {
          resolve();
        }
      });
    });

    // Retornar JSON com a URL do PDF (não enviar o PDF diretamente)
    res.json({ 
      success: true,
      pdf_url: pdfUrl,
      message: 'PDF gerado com sucesso'
    });

  } catch (error) {
    console.error('Erro ao gerar PDF da OS:', error);
    console.error('Stack trace:', error.stack);
    console.error('Detalhes do erro:', {
      message: error.message,
      name: error.name,
      id: id
    });
    
    // Fechar browser se ainda estiver aberto
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.error('Erro ao fechar browser:', closeError);
      }
    }
    
    if (!res.headersSent) {
      return res.status(500).json({ 
        error: 'Erro ao gerar PDF',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Erro ao gerar PDF. Verifique os logs do servidor.',
        details: process.env.NODE_ENV === 'development' ? {
          stack: error.stack,
          name: error.name
        } : undefined
      });
    }
  }
});

// Servir PDFs de OS
// Rota para servir PDFs de OS (sem /api/ no caminho para evitar duplicação)
app.use('/uploads/ordens-servico', express.static(uploadsOSDir));

// Itens da OS
app.get('/api/operacional/os-itens/:os_id', authenticateToken, (req, res) => {
  const { os_id } = req.params;
  db.all('SELECT * FROM os_itens WHERE os_id = ? ORDER BY item_numero, id', [os_id], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows || []);
  });
});

// Itens da OS por ID da OS (rota alternativa)
app.get('/api/operacional/ordens-servico/:id/itens', authenticateToken, (req, res) => {
  const { id } = req.params;
  db.all('SELECT * FROM os_itens WHERE os_id = ? ORDER BY item_numero, id', [id], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows || []);
  });
});

app.post('/api/operacional/os-itens', authenticateToken, checkModulePermission('operacional'), (req, res) => {
  const { os_id, item_numero, descricao, quantidade, unidade, codigo_produto, status_item, etapa_fabricacao, observacoes } = req.body;
  
  if (!os_id || !descricao) {
    return res.status(400).json({ error: 'OS ID e descrição são obrigatórios' });
  }

  db.run(`INSERT INTO os_itens (os_id, item_numero, descricao, quantidade, unidade, codigo_produto, status_item, etapa_fabricacao, observacoes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [os_id, item_numero || null, descricao, quantidade || 1, unidade || 'un', codigo_produto || null, status_item || 'pendente', etapa_fabricacao || null, observacoes || null],
    function(err) {
      if (err) {
        console.error('Erro ao inserir item da OS:', err);
        return res.status(500).json({ error: err.message });
      }
      res.json({ id: this.lastID, message: 'Item adicionado com sucesso' });
    });
});

app.put('/api/operacional/os-itens/:id', authenticateToken, checkModulePermission('operacional'), (req, res) => {
  const { id } = req.params;
  const { item_numero, descricao, quantidade, unidade, status_item, etapa_fabricacao, observacoes } = req.body;
  
  db.run(`UPDATE os_itens SET item_numero = ?, descricao = ?, quantidade = ?, unidade = ?, status_item = ?, etapa_fabricacao = ?, observacoes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [item_numero || null, descricao, quantidade || 1, unidade || 'un', status_item || 'pendente', etapa_fabricacao || null, observacoes || null, id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Item não encontrado' });
      }
      res.json({ message: 'Item atualizado com sucesso' });
    });
});

app.delete('/api/operacional/os-itens/:id', authenticateToken, checkModulePermission('operacional'), (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM os_itens WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Item não encontrado' });
    }
    res.json({ message: 'Item excluído com sucesso' });
  });
});

// Status de Fabricação
app.get('/api/operacional/status-fabricacao/:os_id', authenticateToken, checkModulePermission('operacional'), (req, res) => {
  const { os_id } = req.params;
  db.all(`SELECT sf.*, 
    c.nome as colaborador_nome,
    oi.descricao as item_descricao
    FROM status_fabricacao sf
    LEFT JOIN colaboradores c ON sf.colaborador_id = c.id
    LEFT JOIN os_itens oi ON sf.item_id = oi.id
    WHERE sf.os_id = ? ORDER BY sf.created_at DESC`, [os_id], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows || []);
  });
});

app.post('/api/operacional/status-fabricacao', authenticateToken, checkModulePermission('operacional'), (req, res) => {
  const { os_id, item_id, etapa, status, percentual_conclusao, data_inicio, data_fim, colaborador_id, observacoes } = req.body;
  
  if (!os_id || !etapa || !status) {
    return res.status(400).json({ error: 'OS ID, etapa e status são obrigatórios' });
  }

  db.run(`INSERT INTO status_fabricacao (os_id, item_id, etapa, status, percentual_conclusao, data_inicio, data_fim, colaborador_id, observacoes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [os_id, item_id || null, etapa, status, percentual_conclusao || 0, data_inicio || null, data_fim || null, colaborador_id || null, observacoes || null],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ id: this.lastID, message: 'Status de fabricação registrado com sucesso' });
    });
});

// Atividades de Colaboradores (O que cada um está fazendo)
app.get('/api/operacional/atividades-colaboradores', authenticateToken, checkModulePermission('operacional'), (req, res) => {
  const { colaborador_id, os_id, status, data } = req.query;
  let query = `SELECT ac.*, 
    c.nome as colaborador_nome,
    os.numero_os,
    oi.descricao as item_descricao
    FROM atividades_colaboradores ac
    LEFT JOIN colaboradores c ON ac.colaborador_id = c.id
    LEFT JOIN ordens_servico os ON ac.os_id = os.id
    LEFT JOIN os_itens oi ON ac.item_id = oi.id
    WHERE 1=1`;
  const params = [];

  if (colaborador_id) {
    query += ' AND ac.colaborador_id = ?';
    params.push(colaborador_id);
  }
  if (os_id) {
    query += ' AND ac.os_id = ?';
    params.push(os_id);
  }
  if (status) {
    query += ' AND ac.status = ?';
    params.push(status);
  }
  if (data) {
    query += ' AND date(ac.data_inicio) = ?';
    params.push(data);
  }

  query += ' ORDER BY ac.data_inicio DESC';

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows || []);
  });
});

app.get('/api/operacional/atividades-colaboradores/em-andamento', authenticateToken, checkModulePermission('operacional'), (req, res) => {
  db.all(`SELECT ac.*, 
    c.nome as colaborador_nome,
    c.setor,
    os.numero_os,
    oi.descricao as item_descricao
    FROM atividades_colaboradores ac
    LEFT JOIN colaboradores c ON ac.colaborador_id = c.id
    LEFT JOIN ordens_servico os ON ac.os_id = os.id
    LEFT JOIN os_itens oi ON ac.item_id = oi.id
    WHERE ac.status = 'em_andamento'
    ORDER BY ac.data_inicio DESC`, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows || []);
  });
});

app.post('/api/operacional/atividades-colaboradores', authenticateToken, checkModulePermission('operacional'), (req, res) => {
  const { colaborador_id, os_id, item_id, tipo_atividade, descricao, status, data_inicio, horas_previstas, observacoes } = req.body;
  
  if (!colaborador_id || !tipo_atividade || !data_inicio) {
    return res.status(400).json({ error: 'Colaborador, tipo de atividade e data de início são obrigatórios' });
  }

  db.run(`INSERT INTO atividades_colaboradores (colaborador_id, os_id, item_id, tipo_atividade, descricao, status, data_inicio, horas_previstas, observacoes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [colaborador_id, os_id || null, item_id || null, tipo_atividade, descricao || null, status || 'em_andamento', data_inicio, horas_previstas || null, observacoes || null],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      // Atualizar disponibilidade do colaborador
      db.run('UPDATE colaboradores SET disponivel = 0 WHERE id = ?', [colaborador_id]);
      res.json({ id: this.lastID, message: 'Atividade registrada com sucesso' });
    });
});

app.put('/api/operacional/atividades-colaboradores/:id', authenticateToken, checkModulePermission('operacional'), (req, res) => {
  const { id } = req.params;
  const { tipo_atividade, descricao, status, data_fim, horas_reais, observacoes } = req.body;
  
  db.get('SELECT colaborador_id FROM atividades_colaboradores WHERE id = ?', [id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: 'Atividade não encontrada' });
    }

    db.run(`UPDATE atividades_colaboradores SET tipo_atividade = ?, descricao = ?, status = ?, data_fim = ?, horas_reais = ?, observacoes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [tipo_atividade, descricao || null, status || 'em_andamento', data_fim || null, horas_reais || null, observacoes || null, id],
      function(err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        // Se atividade foi concluída, verificar se colaborador tem outras atividades
        if (status === 'concluida' || status === 'cancelada') {
          db.get('SELECT COUNT(*) as total FROM atividades_colaboradores WHERE colaborador_id = ? AND status = ?', [row.colaborador_id, 'em_andamento'], (err, countRow) => {
            if (!err && countRow.total === 0) {
              db.run('UPDATE colaboradores SET disponivel = 1 WHERE id = ?', [row.colaborador_id]);
            }
          });
        }
        res.json({ message: 'Atividade atualizada com sucesso' });
      });
  });
});

// Controle de Presença
app.get('/api/operacional/controle-presenca', authenticateToken, checkModulePermission('operacional'), (req, res) => {
  const { colaborador_id, data_inicio, data_fim, status } = req.query;
  let query = `SELECT cp.*, 
    c.nome as colaborador_nome,
    c.setor,
    c.cargo
    FROM controle_presenca cp
    LEFT JOIN colaboradores c ON cp.colaborador_id = c.id
    WHERE 1=1`;
  const params = [];

  if (colaborador_id) {
    query += ' AND cp.colaborador_id = ?';
    params.push(colaborador_id);
  }
  if (data_inicio) {
    query += ' AND cp.data >= ?';
    params.push(data_inicio);
  }
  if (data_fim) {
    query += ' AND cp.data <= ?';
    params.push(data_fim);
  }
  if (status) {
    query += ' AND cp.status = ?';
    params.push(status);
  }

  query += ' ORDER BY cp.data DESC, c.nome';

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows || []);
  });
});

app.post('/api/operacional/controle-presenca', authenticateToken, checkModulePermission('operacional'), (req, res) => {
  const { colaborador_id, data, hora_entrada, hora_saida, hora_entrada_almoco, hora_saida_almoco, status, motivo_ausencia, observacoes } = req.body;
  
  if (!colaborador_id || !data) {
    return res.status(400).json({ error: 'Colaborador e data são obrigatórios' });
  }

  // Calcular horas trabalhadas
  let horas_trabalhadas = 0;
  let horas_extras = 0;
  if (hora_entrada && hora_saida) {
    const entrada = new Date(`${data}T${hora_entrada}`);
    const saida = new Date(`${data}T${hora_saida}`);
    let diff = (saida - entrada) / (1000 * 60 * 60); // horas
    
    if (hora_entrada_almoco && hora_saida_almoco) {
      const entradaAlmoco = new Date(`${data}T${hora_entrada_almoco}`);
      const saidaAlmoco = new Date(`${data}T${hora_saida_almoco}`);
      const tempoAlmoco = (saidaAlmoco - entradaAlmoco) / (1000 * 60 * 60);
      diff -= tempoAlmoco;
    }
    
    horas_trabalhadas = Math.max(0, diff);
    horas_extras = Math.max(0, horas_trabalhadas - 8); // Considerando 8h como jornada padrão
  }

  db.run(`INSERT OR REPLACE INTO controle_presenca (colaborador_id, data, hora_entrada, hora_saida, hora_entrada_almoco, hora_saida_almoco, horas_trabalhadas, horas_extras, status, motivo_ausencia, observacoes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [colaborador_id, data, hora_entrada || null, hora_saida || null, hora_entrada_almoco || null, hora_saida_almoco || null, horas_trabalhadas, horas_extras, status || 'presente', motivo_ausencia || null, observacoes || null],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ id: this.lastID, message: 'Presença registrada com sucesso', horas_trabalhadas, horas_extras });
    });
});

// Horas Extras
app.get('/api/operacional/horas-extras', authenticateToken, checkModulePermission('operacional'), (req, res) => {
  const { colaborador_id, status, data_inicio, data_fim } = req.query;
  let query = `SELECT he.*, 
    c.nome as colaborador_nome,
    c.setor,
    u.nome as aprovador_nome
    FROM horas_extras he
    LEFT JOIN colaboradores c ON he.colaborador_id = c.id
    LEFT JOIN usuarios u ON he.aprovado_por = u.id
    WHERE 1=1`;
  const params = [];

  if (colaborador_id) {
    query += ' AND he.colaborador_id = ?';
    params.push(colaborador_id);
  }
  if (status) {
    query += ' AND he.status = ?';
    params.push(status);
  }
  if (data_inicio) {
    query += ' AND he.data >= ?';
    params.push(data_inicio);
  }
  if (data_fim) {
    query += ' AND he.data <= ?';
    params.push(data_fim);
  }

  query += ' ORDER BY he.data DESC';

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows || []);
  });
});

app.post('/api/operacional/horas-extras', authenticateToken, checkModulePermission('operacional'), (req, res) => {
  const { colaborador_id, data, horas_extras, tipo_hora_extra, motivo, valor_hora_extra, observacoes } = req.body;
  
  if (!colaborador_id || !data || !horas_extras) {
    return res.status(400).json({ error: 'Colaborador, data e horas extras são obrigatórios' });
  }

  const valor_total = (valor_hora_extra || 0) * horas_extras;

  db.run(`INSERT INTO horas_extras (colaborador_id, data, horas_extras, tipo_hora_extra, motivo, valor_hora_extra, valor_total, observacoes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [colaborador_id, data, horas_extras, tipo_hora_extra || 'normal', motivo || null, valor_hora_extra || null, valor_total, observacoes || null],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ id: this.lastID, message: 'Horas extras registradas com sucesso' });
    });
});

app.put('/api/operacional/horas-extras/:id/aprovar', authenticateToken, checkModulePermission('operacional'), (req, res) => {
  const { id } = req.params;
  const { aprovado_por } = req.body;
  
  db.run(`UPDATE horas_extras SET status = 'aprovado', aprovado_por = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [aprovado_por || req.user.id, id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Registro de horas extras não encontrado' });
      }
      res.json({ message: 'Horas extras aprovadas com sucesso' });
    });
});

// Dashboard Operacional
app.get('/api/operacional/dashboard', authenticateToken, checkModulePermission('operacional'), (req, res) => {
  const dados = {
    kpis: {},
    atividades_em_andamento: [],
    colaboradores_disponiveis: [],
    os_prioritarias: []
  };

  let completed = 0;
  const total = 6;

  const checkComplete = () => {
    completed++;
    if (completed === total) {
      res.json(dados);
    }
  };

  // Total de OS
  db.get('SELECT COUNT(*) as total FROM ordens_servico', [], (err, row) => {
    if (!err) dados.kpis.total_os = row?.total || 0;
    checkComplete();
  });

  // OS em andamento
  db.get('SELECT COUNT(*) as total FROM ordens_servico WHERE status = ?', ['em_andamento'], (err, row) => {
    if (!err) dados.kpis.os_em_andamento = row?.total || 0;
    checkComplete();
  });

  // Total de colaboradores
  db.get('SELECT COUNT(*) as total FROM colaboradores WHERE status = ?', ['ativo'], (err, row) => {
    if (!err) dados.kpis.total_colaboradores = row?.total || 0;
    checkComplete();
  });

  // Colaboradores disponíveis
  db.get('SELECT COUNT(*) as total FROM colaboradores WHERE status = ? AND disponivel = ?', ['ativo', 1], (err, row) => {
    if (!err) dados.kpis.colaboradores_disponiveis = row?.total || 0;
    checkComplete();
  });

  // Atividades em andamento
  db.all(`SELECT ac.*, c.nome as colaborador_nome, os.numero_os 
    FROM atividades_colaboradores ac
    LEFT JOIN colaboradores c ON ac.colaborador_id = c.id
    LEFT JOIN ordens_servico os ON ac.os_id = os.id
    WHERE ac.status = 'em_andamento'
    ORDER BY ac.data_inicio DESC
    LIMIT 10`, [], (err, rows) => {
    if (!err) dados.atividades_em_andamento = rows || [];
    checkComplete();
  });

  // OS prioritárias
  db.all(`SELECT os.*, c.razao_social as cliente_nome
    FROM ordens_servico os
    LEFT JOIN clientes c ON os.cliente_id = c.id
    WHERE os.status IN ('pendente', 'em_andamento') AND os.prioridade IN ('alta', 'urgente')
    ORDER BY os.prioridade DESC, os.data_prevista ASC
    LIMIT 10`, [], (err, rows) => {
    if (!err) dados.os_prioritarias = rows || [];
    checkComplete();
  });
});

// Dashboard MES (Manufacturing Execution System)
app.get('/api/operacional/dashboard-mes', authenticateToken, checkModulePermission('operacional'), (req, res) => {
  const dados = {
    kpis: {},
    oee: {},
    producao: [],
    qualidade: {},
    manutencao: {},
    alarmes: [],
    status_linhas: []
  };

  let completed = 0;
  const total = 17; // Total de queries assíncronas
  let responseSent = false;

  // Timeout de segurança - enviar resposta após 10 segundos mesmo se não completar todas
  const timeout = setTimeout(() => {
    if (!responseSent) {
      responseSent = true;
      console.warn('Dashboard MES: Timeout - enviando resposta parcial');
      // Calcular OEE Total se possível
      if (dados.oee.disponibilidade !== undefined && dados.oee.performance !== undefined && dados.oee.qualidade !== undefined) {
        if (!dados.kpis.oee) {
          const oee = (dados.oee.disponibilidade * dados.oee.performance * dados.oee.qualidade) / 10000;
          dados.kpis.oee = Math.round(oee * 10) / 10;
          dados.oee.oee_total = dados.kpis.oee;
        }
      }
      res.json(dados);
    }
  }, 10000);

  const checkComplete = () => {
    completed++;
    if (completed === total && !responseSent) {
      responseSent = true;
      clearTimeout(timeout);
      // Calcular OEE Total se não foi calculado diretamente dos registros
      if (dados.oee.disponibilidade !== undefined && dados.oee.performance !== undefined && dados.oee.qualidade !== undefined) {
        if (!dados.kpis.oee) {
          const oee = (dados.oee.disponibilidade * dados.oee.performance * dados.oee.qualidade) / 10000;
          dados.kpis.oee = Math.round(oee * 10) / 10;
          dados.oee.oee_total = dados.kpis.oee;
        }
      }
      res.json(dados);
    }
  };

  // OEE - Calcular disponibilidade média (real)
  db.get(`SELECT AVG(disponibilidade) as media FROM oee_registros WHERE data = date('now')`, [], (err, row) => {
    if (!err && row && row.media !== null) {
      dados.oee.disponibilidade = Math.round(row.media * 10) / 10;
      dados.kpis.disponibilidade = dados.oee.disponibilidade;
      checkComplete();
    } else {
      // Se não há dados, calcular baseado em equipamentos e paradas
      db.get(`SELECT 
        COUNT(DISTINCT e.id) as total_equipamentos,
        COUNT(DISTINCT CASE WHEN a.status = 'ativo' AND a.tipo = 'parada' THEN a.equipamento_id END) as equipamentos_parados
        FROM equipamentos e
        LEFT JOIN alarmes a ON e.id = a.equipamento_id AND date(a.timestamp) = date('now')
        WHERE e.status != 'indisponivel'`, [], (err2, row2) => {
        if (!err2 && row2 && row2.total_equipamentos > 0) {
          const disponibilidade = ((row2.total_equipamentos - (row2.equipamentos_parados || 0)) / row2.total_equipamentos) * 100;
          dados.oee.disponibilidade = Math.round(disponibilidade * 10) / 10;
          dados.kpis.disponibilidade = dados.oee.disponibilidade;
        } else {
          dados.oee.disponibilidade = 0;
          dados.kpis.disponibilidade = 0;
        }
        checkComplete();
      });
    }
  });

  // OEE - Calcular performance média (real)
  db.get(`SELECT AVG(performance) as media FROM oee_registros WHERE data = date('now')`, [], (err, row) => {
    if (!err && row && row.media !== null) {
      dados.oee.performance = Math.round(row.media * 10) / 10;
      dados.kpis.performance = dados.oee.performance;
      checkComplete();
    } else {
      // Calcular baseado em produção real vs capacidade
      db.get(`SELECT 
        COALESCE(SUM(oi.quantidade), 0) as quantidade_produzida,
        COUNT(DISTINCT os.id) as os_ativas
        FROM ordens_servico os
        LEFT JOIN os_itens oi ON os.id = oi.os_id AND oi.status_item = 'concluido'
        WHERE os.status = 'em_andamento' AND date(os.data_inicio) <= date('now')`, [], (err2, row2) => {
        if (!err2 && row2 && row2.os_ativas > 0) {
          // Performance estimada baseada em produção (assumindo 100 unidades por OS como capacidade)
          const capacidade_esperada = row2.os_ativas * 100;
          const performance = capacidade_esperada > 0 ? Math.min(100, (row2.quantidade_produzida / capacidade_esperada) * 100) : 0;
          dados.oee.performance = Math.round(performance * 10) / 10;
          dados.kpis.performance = dados.oee.performance;
        } else {
          dados.oee.performance = 0;
          dados.kpis.performance = 0;
        }
        checkComplete();
      });
    }
  });

  // OEE - Calcular qualidade média (real)
  db.get(`SELECT AVG(qualidade) as media FROM oee_registros WHERE data = date('now')`, [], (err, row) => {
    if (!err && row && row.media !== null) {
      dados.oee.qualidade = Math.round(row.media * 10) / 10;
      dados.kpis.qualidade = dados.oee.qualidade;
      checkComplete();
    } else {
      // Calcular baseado em inspeções de qualidade
      db.get(`SELECT 
        COUNT(*) as total_inspecoes,
        COUNT(CASE WHEN status = 'aprovado' THEN 1 END) as aprovadas
        FROM controle_qualidade 
        WHERE date(data_inspecao) = date('now')`, [], (err2, row2) => {
        if (!err2 && row2 && row2.total_inspecoes > 0) {
          const qualidade = (row2.aprovadas / row2.total_inspecoes) * 100;
          dados.oee.qualidade = Math.round(qualidade * 10) / 10;
          dados.kpis.qualidade = dados.oee.qualidade;
          checkComplete();
        } else {
          // Se não há inspeções hoje, verificar itens concluídos sem rejeição
          db.get(`SELECT 
            COUNT(*) as total_itens,
            COUNT(CASE WHEN oi.status_item = 'concluido' THEN 1 END) as concluidos
            FROM os_itens oi
            INNER JOIN ordens_servico os ON oi.os_id = os.id
            WHERE date(os.updated_at) = date('now')`, [], (err3, row3) => {
            if (!err3 && row3 && row3.total_itens > 0) {
              const qualidade = (row3.concluidos / row3.total_itens) * 100;
              dados.oee.qualidade = Math.round(qualidade * 10) / 10;
              dados.kpis.qualidade = dados.oee.qualidade;
            } else {
              dados.oee.qualidade = 0;
              dados.kpis.qualidade = 0;
            }
            checkComplete();
          });
        }
      });
    }
  });

  // OEE Total será calculado após todos os componentes estarem prontos
  // Será feito no checkComplete final

  // Produção hoje (real - soma de itens produzidos hoje)
  db.get(`SELECT COALESCE(SUM(oi.quantidade), 0) as total 
    FROM os_itens oi
    INNER JOIN ordens_servico os ON oi.os_id = os.id
    WHERE oi.status_item = 'concluido' 
    AND date(os.updated_at) = date('now')`, [], (err, row) => {
    if (!err) {
      dados.kpis.producao_hoje = row?.total || 0;
      // Meta baseada em OS ativas
      db.get(`SELECT COUNT(*) * 100 as meta FROM ordens_servico WHERE status = 'em_andamento'`, [], (err2, row2) => {
        dados.kpis.producao_meta = row2?.meta || 0;
        checkComplete();
      });
    } else {
      dados.kpis.producao_hoje = 0;
      dados.kpis.producao_meta = 0;
      checkComplete();
    }
  });

  // Tempo ciclo médio (real)
  db.get(`SELECT AVG(CAST(julianday(ac.data_fim) - julianday(ac.data_inicio) AS REAL) * 24) as media_horas
    FROM atividades_colaboradores ac
    WHERE ac.status = 'concluida' 
    AND date(ac.data_fim) = date('now')
    AND ac.horas_reais IS NOT NULL`, [], (err, row) => {
    if (!err && row && row.media_horas !== null) {
      dados.kpis.tempo_ciclo_medio = Math.round(row.media_horas * 10) / 10;
    } else {
      // Tentar calcular de outra forma
      db.get(`SELECT AVG(horas_reais) as media FROM atividades_colaboradores 
        WHERE status = 'concluida' AND date(data_fim) = date('now') AND horas_reais > 0`, [], (err2, row2) => {
        dados.kpis.tempo_ciclo_medio = row2?.media ? Math.round(row2.media * 10) / 10 : 0;
        checkComplete();
      });
    }
    if (!err && row && row.media_horas !== null) {
      checkComplete();
    }
  });

  // Paradas hoje (real)
  db.get(`SELECT COUNT(*) as total FROM alarmes 
    WHERE date(timestamp) = date('now') 
    AND (tipo = 'parada' OR severidade = 'alta')`, [], (err, row) => {
    if (!err) {
      dados.kpis.paradas_hoje = row?.total || 0;
    } else {
      dados.kpis.paradas_hoje = 0;
    }
    checkComplete();
  });

  // Não conformidades (real)
  db.get(`SELECT COUNT(*) as total FROM controle_qualidade 
    WHERE date(data_inspecao) = date('now') 
    AND status IN ('rejeitado', 'nao_conforme')`, [], (err, row) => {
    if (!err) {
      dados.kpis.nao_conformidades = row?.total || 0;
    } else {
      dados.kpis.nao_conformidades = 0;
    }
    checkComplete();
  });

  // Eficiência (real)
  db.get(`SELECT 
    COALESCE(SUM(oi.quantidade), 0) as produzido,
    COUNT(DISTINCT os.id) as os_ativas
    FROM ordens_servico os
    LEFT JOIN os_itens oi ON os.id = oi.os_id AND oi.status_item = 'concluido'
    WHERE os.status = 'em_andamento'`, [], (err, row) => {
    if (!err && row && row.os_ativas > 0) {
      dados.kpis.eficiencia = Math.round((row.produzido / (row.os_ativas * 10)) * 100 * 10) / 10;
    } else {
      dados.kpis.eficiencia = 0;
    }
    checkComplete();
  });

  // Alarmes ativos (real)
  db.all(`SELECT a.*, e.nome as equipamento_nome
    FROM alarmes a
    LEFT JOIN equipamentos e ON a.equipamento_id = e.id
    WHERE a.status = 'ativo' 
    ORDER BY a.timestamp DESC 
    LIMIT 10`, [], (err, rows) => {
    if (!err) {
      dados.alarmes = rows.map(a => ({
        id: a.id,
        tipo: a.severidade || 'Média',
        descricao: a.descricao,
        equipamento: a.equipamento_nome || a.equipamento_id || 'N/A',
        hora: new Date(a.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      }));
    } else {
      dados.alarmes = [];
    }
    checkComplete();
  });

  // Produção ao longo do dia (real - por hora)
  db.all(`SELECT 
    strftime('%H:00', datetime(oi.updated_at)) as hora,
    SUM(oi.quantidade) as quantidade
    FROM os_itens oi
    INNER JOIN ordens_servico os ON oi.os_id = os.id
    WHERE oi.status_item = 'concluido'
    AND date(oi.updated_at) = date('now')
    GROUP BY strftime('%H', datetime(oi.updated_at))
    ORDER BY hora`, [], (err, rows) => {
    if (!err && rows && rows.length > 0) {
      // Preencher horas faltantes com 0
      const horas = [];
      const dadosPorHora = {};
      rows.forEach(r => {
        dadosPorHora[r.hora] = r.quantidade;
      });
      
      for (let h = 0; h < 24; h++) {
        const hora = `${h.toString().padStart(2, '0')}:00`;
        horas.push({
          hora,
          quantidade: dadosPorHora[hora] || 0
        });
      }
      
      // Adicionar total acumulado
      let acumulado = 0;
      dados.producao = horas.map(h => {
        acumulado += h.quantidade;
        return { ...h, quantidade: acumulado };
      });
    } else {
      // Se não há dados, criar array vazio
      dados.producao = Array.from({ length: 24 }, (_, i) => ({
        hora: `${i.toString().padStart(2, '0')}:00`,
        quantidade: 0
      }));
    }
    checkComplete();
  });

  // Status das linhas (real - baseado em equipamentos)
  db.all(`SELECT 
    e.id,
    e.nome,
    e.status,
    COUNT(CASE WHEN a.status = 'ativo' THEN 1 END) as alarmes_ativos
    FROM equipamentos e
    LEFT JOIN alarmes a ON e.id = a.equipamento_id AND a.status = 'ativo'
    WHERE e.tipo LIKE '%linha%' OR e.nome LIKE '%linha%' OR e.nome LIKE '%Linha%'
    GROUP BY e.id
    LIMIT 4`, [], (err, rows) => {
    if (!err && rows && rows.length > 0) {
      dados.status_linhas = rows.map(e => ({
        id: e.id,
        nome: e.nome,
        status: e.alarmes_ativos > 0 ? 'warning' : (e.status === 'em_uso' ? 'active' : 'inactive'),
        label: e.alarmes_ativos > 0 ? 'Manutenção' : (e.status === 'em_uso' ? 'Em Produção' : 'Parada')
      }));
    } else {
      // Se não há linhas cadastradas, criar status padrão baseado em OS
      db.all(`SELECT DISTINCT 
        'Linha ' || (ROW_NUMBER() OVER ()) as nome,
        CASE WHEN COUNT(*) > 0 THEN 'active' ELSE 'inactive' END as status
        FROM ordens_servico
        WHERE status = 'em_andamento'
        LIMIT 4`, [], (err2, rows2) => {
        if (!err2 && rows2 && rows2.length > 0) {
          dados.status_linhas = rows2.map((r, i) => ({
            id: i + 1,
            nome: r.nome,
            status: r.status,
            label: r.status === 'active' ? 'Em Produção' : 'Parada'
          }));
        } else {
          dados.status_linhas = [];
        }
        checkComplete();
      });
    }
    if (!err && rows && rows.length > 0) {
      checkComplete();
    }
  });

  // Dados de qualidade (real)
  db.get(`SELECT 
    COUNT(*) as total_inspecoes,
    COUNT(CASE WHEN status = 'aprovado' THEN 1 END) as aprovadas,
    COUNT(CASE WHEN status = 'rejeitado' THEN 1 END) as rejeitadas,
    COUNT(CASE WHEN status = 'pendente' THEN 1 END) as em_analise
    FROM controle_qualidade 
    WHERE date(data_inspecao) = date('now')`, [], (err, row) => {
    if (!err && row) {
      dados.qualidade = {
        taxa_aprovacao: row.total_inspecoes > 0 ? Math.round((row.aprovadas / row.total_inspecoes) * 100 * 10) / 10 : 100,
        inspecoes_hoje: row.total_inspecoes || 0,
        rejeicoes: row.rejeitadas || 0,
        em_analise: row.em_analise || 0
      };
    } else {
      dados.qualidade = {
        taxa_aprovacao: 100,
        inspecoes_hoje: 0,
        rejeicoes: 0,
        em_analise: 0
      };
    }
    checkComplete();
  });

  // Dados de manutenção (real)
  db.get(`SELECT 
    COUNT(CASE WHEN tipo = 'preventiva' AND date(proxima_execucao) = date('now') THEN 1 END) as preventivas_hoje,
    COUNT(CASE WHEN tipo = 'corretiva' AND date(data_abertura) = date('now') THEN 1 END) as corretivas_hoje,
    COUNT(CASE WHEN date(proxima_execucao) BETWEEN date('now') AND date('now', '+7 days') THEN 1 END) as proximas_preventivas
    FROM manutencao_preventiva`, [], (err, row) => {
    if (!err && row) {
      dados.manutencao = {
        preventivas_hoje: row.preventivas_hoje || 0,
        corretivas_hoje: row.corretivas_hoje || 0,
        proximas_preventivas: row.proximas_preventivas || 0,
        disponibilidade_equipamentos: 0
      };
      
      // Calcular disponibilidade de equipamentos
      db.get(`SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'disponivel' OR status = 'em_uso' THEN 1 END) as disponiveis
        FROM equipamentos`, [], (err2, row2) => {
        if (!err2 && row2 && row2.total > 0) {
          dados.manutencao.disponibilidade_equipamentos = Math.round((row2.disponiveis / row2.total) * 100 * 10) / 10;
        }
        checkComplete();
      });
    } else {
      dados.manutencao = {
        preventivas_hoje: 0,
        corretivas_hoje: 0,
        proximas_preventivas: 0,
        disponibilidade_equipamentos: 0
      };
      checkComplete();
    }
  });
});

// Equipamentos
app.get('/api/operacional/equipamentos', authenticateToken, checkModulePermission('operacional'), (req, res) => {
  const { search, status, tipo } = req.query;
  let query = 'SELECT * FROM equipamentos WHERE 1=1';
  const params = [];

  if (search) {
    query += ' AND (nome LIKE ? OR codigo LIKE ? OR modelo LIKE ?)';
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }
  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }
  if (tipo) {
    query += ' AND tipo = ?';
    params.push(tipo);
  }

  query += ' ORDER BY nome';

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows || []);
  });
});

app.post('/api/operacional/equipamentos', authenticateToken, checkModulePermission('operacional'), (req, res) => {
  normalizarMaiusculas(req.body, ['nome', 'tipo', 'fabricante', 'modelo', 'observacoes']);
  const { codigo, nome, tipo, fabricante, modelo, numero_serie, data_aquisicao, status, capacidade, observacoes } = req.body;
  
  if (!nome) {
    return res.status(400).json({ error: 'Nome é obrigatório' });
  }

  db.run(`INSERT INTO equipamentos (codigo, nome, tipo, fabricante, modelo, numero_serie, data_aquisicao, status, capacidade, observacoes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [codigo || null, nome, tipo || null, fabricante || null, modelo || null, numero_serie || null, data_aquisicao || null, status || 'disponivel', capacidade || null, observacoes || null],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint')) {
          return res.status(400).json({ error: 'Código já cadastrado' });
        }
        return res.status(500).json({ error: err.message });
      }
      res.json({ id: this.lastID, message: 'Equipamento criado com sucesso' });
    });
});

app.put('/api/operacional/equipamentos/:id', authenticateToken, checkModulePermission('operacional'), (req, res) => {
  const { id } = req.params;
  normalizarMaiusculas(req.body, ['nome', 'tipo', 'fabricante', 'modelo', 'observacoes']);
  const { codigo, nome, tipo, fabricante, modelo, numero_serie, data_aquisicao, status, capacidade, observacoes } = req.body;
  
  db.run(`UPDATE equipamentos SET codigo = ?, nome = ?, tipo = ?, fabricante = ?, modelo = ?, numero_serie = ?, data_aquisicao = ?, status = ?, capacidade = ?, observacoes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [codigo || null, nome, tipo || null, fabricante || null, modelo || null, numero_serie || null, data_aquisicao || null, status || 'disponivel', capacidade || null, observacoes || null, id],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint')) {
          return res.status(400).json({ error: 'Código já cadastrado' });
        }
        return res.status(500).json({ error: err.message });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Equipamento não encontrado' });
      }
      res.json({ message: 'Equipamento atualizado com sucesso' });
    });
});

app.delete('/api/operacional/equipamentos/:id', authenticateToken, checkModulePermission('operacional'), (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM equipamentos WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Equipamento não encontrado' });
    }
    res.json({ message: 'Equipamento excluído com sucesso' });
  });
});

// ========== ROTAS DE AUDITORIA E LOGS ==========
// Registrar tentativa de acesso não autorizado
app.post('/api/auditoria/tentativa-acesso', authenticateToken, (req, res) => {
  const { modulo, nome_modulo, tipo } = req.body;
  const usuario_id = req.user.id;
  const ip_address = req.ip || req.connection.remoteAddress;
  const user_agent = req.get('user-agent') || '';

  // Buscar informações completas do usuário
  db.get('SELECT nome, email FROM usuarios WHERE id = ?', [usuario_id], (err, user) => {
    if (err) {
      console.error('Erro ao buscar usuário:', err);
      return res.status(500).json({ error: 'Erro ao buscar informações do usuário' });
    }

    const usuario_nome = user?.nome || req.user.email || 'N/A';
    const usuario_email = user?.email || req.user.email || 'N/A';

    db.run(
      `INSERT INTO logs_auditoria 
       (usuario_id, usuario_nome, usuario_email, tipo, modulo, nome_modulo, ip_address, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [usuario_id, usuario_nome, usuario_email, tipo || 'acesso_negado', modulo, nome_modulo, ip_address, user_agent],
      function(err) {
        if (err) {
          console.error('Erro ao registrar log de auditoria:', err);
          return res.status(500).json({ error: 'Erro ao registrar tentativa de acesso' });
        }
        res.json({ 
          message: 'Tentativa de acesso registrada', 
          id: this.lastID 
        });
      }
    );
  });
});

// Listar logs de auditoria (apenas admin)
app.get('/api/auditoria/logs', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso negado. Apenas administradores podem visualizar logs.' });
  }

  const { tipo, modulo, data_inicio, data_fim, limit = 100, offset = 0 } = req.query;
  let query = 'SELECT * FROM logs_auditoria WHERE 1=1';
  const params = [];

  if (tipo) {
    query += ' AND tipo = ?';
    params.push(tipo);
  }
  if (modulo) {
    query += ' AND modulo = ?';
    params.push(modulo);
  }
  if (data_inicio) {
    query += ' AND DATE(created_at) >= ?';
    params.push(data_inicio);
  }
  if (data_fim) {
    query += ' AND DATE(created_at) <= ?';
    params.push(data_fim);
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('Erro ao buscar logs:', err);
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// ========== MIDDLEWARE DE TRATAMENTO DE ERROS ==========
// Middleware para tratar erros de banco de dados (deve ser o último antes do listen)
app.use('/api', (err, req, res, next) => {
  if (err && (err.message && (err.message.includes('database is locked') || 
                               err.message.includes('SQLITE_BUSY')) ||
              err.code === 'SQLITE_BUSY')) {
    console.warn('⚠️ Erro de lock no banco de dados:', err.message);
    return res.status(503).json({ 
      error: 'Banco de dados temporariamente ocupado. Tente novamente em alguns segundos.',
      retryAfter: 2
    });
  }
  // Se não for erro de banco, passar para o próximo handler
  if (err) {
    console.error('❌ Erro na API:', err);
    return res.status(500).json({ 
      error: 'Erro interno do servidor',
      message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
  next();
});

// ========== INICIAR SERVIDOR ==========
// Servir arquivos estáticos do React em produção
if (process.env.NODE_ENV === 'production') {
  const clientBuildPath = path.join(__dirname, '../client/build');
  
  // Verificar se a pasta build existe
  if (fs.existsSync(clientBuildPath)) {
    // Garantir MIME type correto para CSS/JS (evita "Refused to apply style" quando proxy serve como text/plain)
    app.use('/static', (req, res, next) => {
      if (req.path.endsWith('.css')) {
        res.setHeader('Content-Type', 'text/css; charset=UTF-8');
      } else if (req.path.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
      }
      next();
    });
    // Servir arquivos estáticos
    app.use(express.static(clientBuildPath));
    
    // Rota catch-all: serve o index.html para todas as rotas não-API
    app.get('*', (req, res, next) => {
      // Ignorar rotas da API
      if (req.path.startsWith('/api') || 
          req.path.startsWith('/health') ||
          req.path.startsWith('/logo') ||
          req.path.startsWith('/cabecalho') ||
          req.path.startsWith('/Logo_')) {
        return next();
      }
      
      // Servir index.html para rotas do React
      res.sendFile(path.join(clientBuildPath, 'index.html'), (err) => {
        if (err) {
          res.status(500).send('Erro ao carregar a aplicação');
        }
      });
    });
    
    console.log(`📦 Servindo arquivos estáticos de: ${clientBuildPath}`);
  } else {
    console.warn(`⚠️  Pasta de build não encontrada: ${clientBuildPath}`);
    console.warn(`   Execute 'npm run build' no diretório client/ antes de iniciar em produção`);
  }
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor CRM GMP INDUSTRIAIS rodando na porta ${PORT}`);
  console.log(`📊 API disponível em http://localhost:${PORT}/api`);
  if (process.env.NODE_ENV === 'production') {
    console.log(`🌐 Aplicação disponível em http://localhost:${PORT}`);
  } else {
    console.log(`🌐 Acesse de outros dispositivos usando o IP desta máquina na porta ${PORT}`);
    console.log(`   Exemplo: http://192.168.1.XXX:${PORT}/api`);
  }
});
