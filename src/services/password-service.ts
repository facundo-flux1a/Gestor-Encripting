
'use server';

import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    return hashedPassword;
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
    if (!password || !hash) {
        return false;
    }
    // Prevent bcrypt error for users created via Google SSO
    if (hash === 'google_sso_user') {
        return false;
    }
    try {
        const isMatch = await bcrypt.compare(password, hash);
        return isMatch;
    } catch (error) {
        console.error("Error comparing password:", error);
        return false;
    }
}
