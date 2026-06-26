import crypto from 'crypto';

// Clave de encriptación (debe estar en .env)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-key-change-me-in-production-32bytes';
const ALGORITHM = 'aes-256-cbc';

// Asegurar que la key tenga 32 bytes
function getKey(): Buffer {
  return crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
}

/**
 * Encripta un texto (API key)
 */
export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  // Retornar IV + encrypted (separados por :)
  return iv.toString('hex') + ':' + encrypted;
}

/**
 * Desencripta un texto (API key)
 */
export function decrypt(encryptedText: string): string {
  const parts = encryptedText.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * Calcula el Blind Index SHA-256 para búsquedas seguras en campos encriptados.
 * Siempre normaliza a minúsculas antes de hashear.
 */
export function hashField(value: string): string {
  return crypto.createHash('sha256').update(value.toLowerCase().trim()).digest('hex');
}

/**
 * Normaliza nombres para garantizar que el hash de búsqueda sea determinista y constante.
 * Útil para campos como nombre_de_empresa o nombre de entidades.
 */
export function normalizeEntityName(name: string): string {
  if (!name) return '';
  return name
    .normalize("NFD") 
    .replace(/[\u0300-\u036f]/g, "") 
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ""); 
}