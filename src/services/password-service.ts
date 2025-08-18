
'use server';

import * as jose from 'jose';

// This should be a securely stored secret, loaded from environment variables.
const secretKey = new TextEncoder().encode(process.env.PASSWORD_HASH_SECRET || 'a-very-strong-and-long-secret-for-hashing-passwords-!@#$');

// We use PBKDF2 from jose which is a standard, secure key derivation function.
// It's a good alternative to bcrypt for environments where bcrypt causes issues.
export async function hashPassword(password: string): Promise<string> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const derivedKey = await jose.pbkdf2(
        new TextEncoder().encode(password), 
        salt, 
        {
            iterations: 250000,
            hash: 'sha256'
        }
    );
    
    // We store the salt with the hash, separated by a period.
    const toBase64 = (buff: ArrayBuffer) => Buffer.from(buff).toString('base64');
    return `${toBase64(salt)}.${toBase64(derivedKey)}`;
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
    if (!password || !hash || !hash.includes('.')) {
        return false;
    }

    if (hash === 'google_sso_user') {
        return false;
    }

    try {
        const [saltB64, derivedKeyB64] = hash.split('.');
        const fromBase64 = (str: string) => Buffer.from(str, 'base64');
        const salt = fromBase64(saltB64);
        const derivedKey = fromBase64(derivedKeyB64);

        const inputKey = await jose.pbkdf2(
            new TextEncoder().encode(password), 
            salt, 
            {
                iterations: 250000,
                hash: 'sha256'
            }
        );

        // Constant-time comparison to protect against timing attacks.
        return await jose.timingSafeEqual(derivedKey, inputKey);
    } catch (error) {
        console.error("Error comparing password:", error);
        return false;
    }
}
