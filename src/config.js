// Configuration centrale de l'application.

// VULN-04 : clé d'API FACTICE écrite en dur dans le code source (secret exposé dans le dépôt Git)
const FAKE_API_KEY = 'FAKE_API_KEY_DO_NOT_USE_123456';

// Secret de signature des JWT : à définir dans .env
const JWT_SECRET = process.env.JWT_SECRET || 'dev_only_secret';

module.exports = { FAKE_API_KEY, JWT_SECRET };
