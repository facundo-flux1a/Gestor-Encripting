
'use server';

import { pbkdf2Sync, timingSafeEqual, randomBytes } from 'node:crypto';

// We use PBKDF2 from Node's native crypto module, which is standard and secure.
export async function hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16);
    const derivedKey = pbkdf2Sync(
        password, 
        salt, 
        250000, // Iterations
        64,     // Key length
        'sha512'// Algorithm
    );
    
    // We store the salt with the hash, separated by a period.
    return `${salt.toString('hex')}.${derivedKey.toString('hex')}`;
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
    if (!password || !hash || !hash.includes('.')) {
        return false;
    }
    
    try {
        const [saltHex, derivedKeyHex] = hash.split('.');
        const salt = Buffer.from(saltHex, 'hex');
        const derivedKey = Buffer.from(derivedKeyHex, 'hex');

        const inputKey = pbkdf2Sync(
            password, 
            salt, 
            250000, 
            64, 
            'sha512'
        );

        // Constant-time comparison to protect against timing attacks.
        if (derivedKey.length !== inputKey.length) {
            return false;
        }
        
        return timingSafeEqual(derivedKey, inputKey);

    } catch (error) {
        console.error("Error comparing password:", error);
        return false;
    }
}
