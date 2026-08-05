import crypto from 'crypto';

const configKeyStr = "k1.aesgcm256.jlU4p6tDcWdI-W12nlIRl-qruW5FRgTpL2ytKtMa-g0=";
const keyBuffer = Buffer.from(configKeyStr.split('.')[2], 'base64url');

function decryptPrisma(encryptedStr: string) {
    // Format: v1.aesgcm256.KeyVersion.IV.Ciphertext
    const parts = encryptedStr.split('.');
    if (parts.length !== 5) {
        throw new Error("Invalid format");
    }
    const iv = Buffer.from(parts[3], 'base64url');
    
    // The Ciphertext includes the auth tag at the end (16 bytes)
    const cipherTextWithTag = Buffer.from(parts[4], 'base64url');
    
    const cipherText = cipherTextWithTag.slice(0, cipherTextWithTag.length - 16);
    const authTag = cipherTextWithTag.slice(cipherTextWithTag.length - 16);
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(cipherText, undefined, 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
}

const strings = [
    "v1.aesgcm256.75c66696._6q70C9wz8Z09nxn.VAdTm5DJXnd9PCbx5Wv_QjvfoPfo8zx4kQcsv2om7VJpHb8MHwmJNoAv-ku6NWA6Qu7Swi8Vg13Sr5ZnadfiR3qFs_X0c5kZ_G2Yo-CCdZcMyYKN0Ea9MwlfryyAG5vu1tU-4uvTX_cguvIE5gawFqt9EEKP2dWZaQ1GhMxM926DnCeaHAO3UqVN2z-V42okGFxvh1xFhS1pWdGj",
    "v1.aesgcm256.75c66696.plMPU4IY1f575mS_.7tC55qneN1zU2VO9S2uhugUG0gYutH1sRAp6Eqv5ncTuMO_HLMhQ_QaD6pwCoOqxQ16h5gmzhe8O9_ebenTwNjN9PJcPAFewGsoWI3wBIIT05Nwq_Yjf8G3j1mNFVlUPG9zArlcHlML3DXbqYUQ1VA3UVX0aWKPvjkSBjj5xyx-BlOGO-zRDyQ67W83HK8l5lxzmf3r9qChEXM9d",
    "v1.aesgcm256.75c66696.JMmwbD_CEfN7BlNF.Pejf8krorgXO5In2s6y9ZDZFY2_2fFVUlRQurnmNJp2ak-eyBje0xJEvbgRx7nfb7lLna8YxJjg0b3qEFHaWFhEBRFTvDUd0Vot7mHW6ii6nmSZ_pJSHmxMWnqbkaQVw9V2n_mcENkijw-N_MfoAEJJyTps2dV8VSCHn6GtFc4wUn9Wo-iM="
];

for (const s of strings) {
    try {
        console.log(decryptPrisma(s));
    } catch(e: any) {
        console.log("Error decrypting:", e.message);
    }
}
