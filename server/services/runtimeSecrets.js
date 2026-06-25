const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SECRETS_FILENAME = '.runtime-secrets.json';

function getSecretsPath(dataDir) {
  return path.join(dataDir, SECRETS_FILENAME);
}

function loadSecretsFile(dataDir) {
  const filePath = getSecretsPath(dataDir);
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (err) {
    console.warn('[runtimeSecrets] Não foi possível ler', SECRETS_FILENAME + ':', err.message);
  }
  return {};
}

function saveSecretsFile(dataDir, secrets) {
  const filePath = getSecretsPath(dataDir);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(secrets, null, 2), { mode: 0o600 });
}

function generateSecret(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

function generatePassword(length = 20) {
  return crypto.randomBytes(length).toString('base64url').slice(0, length);
}

function resolveJwtSecret(dataDir) {
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }
  const secrets = loadSecretsFile(dataDir);
  if (secrets.jwtSecret) {
    return secrets.jwtSecret;
  }
  const jwtSecret = generateSecret();
  secrets.jwtSecret = jwtSecret;
  secrets.jwtSecretCreatedAt = new Date().toISOString();
  saveSecretsFile(dataDir, secrets);
  console.log(`[runtimeSecrets] JWT_SECRET gerado e persistido em server/data/${SECRETS_FILENAME}`);
  return jwtSecret;
}

function resolveSeedAdminCredentials(dataDir) {
  const envEmail = process.env.SEED_ADMIN_EMAIL;
  const envPassword = process.env.SEED_ADMIN_PASSWORD;
  if (envEmail && envPassword) {
    return { email: envEmail, password: envPassword, source: 'env' };
  }
  const secrets = loadSecretsFile(dataDir);
  if (secrets.seedAdminEmail && secrets.seedAdminPassword) {
    return { email: secrets.seedAdminEmail, password: secrets.seedAdminPassword, source: 'file' };
  }
  return null;
}

function persistSeedAdmin(dataDir, email, password) {
  const secrets = loadSecretsFile(dataDir);
  secrets.seedAdminEmail = email;
  secrets.seedAdminPassword = password;
  secrets.seedAdminCreatedAt = new Date().toISOString();
  saveSecretsFile(dataDir, secrets);
}

function getAdminCredentialsForUpload(dataDir) {
  const envEmail = process.env.ADMIN_EMAIL || process.env.SEED_ADMIN_EMAIL;
  const envPassword = process.env.ADMIN_PASSWORD || process.env.SEED_ADMIN_PASSWORD;
  if (envEmail && envPassword) {
    return { email: envEmail, password: envPassword };
  }
  const secrets = loadSecretsFile(dataDir);
  if (secrets.seedAdminEmail && secrets.seedAdminPassword) {
    return { email: secrets.seedAdminEmail, password: secrets.seedAdminPassword };
  }
  return null;
}

module.exports = {
  SECRETS_FILENAME,
  resolveJwtSecret,
  resolveSeedAdminCredentials,
  persistSeedAdmin,
  getAdminCredentialsForUpload,
  generatePassword,
};
