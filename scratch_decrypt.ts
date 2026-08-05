import { PrismaClient } from '@prisma/client'
import { fieldEncryptionExtension } from '@prisma/extension-field-encryption'

const client = new PrismaClient()
const prisma = client.$extends(
  fieldEncryptionExtension({
    encryptionKey: process.env.PRISMA_FIELD_ENCRYPTION_KEY,
  })
)

async function decryptValues() {
    const encryptedValues = [
        "v1.aesgcm256.75c66696._6q70C9wz8Z09nxn.VAdTm5DJXnd9PCbx5Wv_QjvfoPfo8zx4kQcsv2om7VJpHb8MHwmJNoAv-ku6NWA6Qu7Swi8Vg13Sr5ZnadfiR3qFs_X0c5kZ_G2Yo-CCdZcMyYKN0Ea9MwlfryyAG5vu1tU-4uvTX_cguvIE5gawFqt9EEKP2dWZaQ1GhMxM926DnCeaHAO3UqVN2z-V42okGFxvh1xFhS1pWdGj",
        "v1.aesgcm256.75c66696.plMPU4IY1f575mS_.7tC55qneN1zU2VO9S2uhugUG0gYutH1sRAp6Eqv5ncTuMO_HLMhQ_QaD6pwCoOqxQ16h5gmzhe8O9_ebenTwNjN9PJcPAFewGsoWI3wBIIT05Nwq_Yjf8G3j1mNFVlUPG9zArlcHlML3DXbqYUQ1VA3UVX0aWKPvjkSBjj5xyx-BlOGO-zRDyQ67W83HK8l5lxzmf3r9qChEXM9d",
        "v1.aesgcm256.75c66696.JMmwbD_CEfN7BlNF.Pejf8krorgXO5In2s6y9ZDZFY2_2fFVUlRQurnmNJp2ak-eyBje0xJEvbgRx7nfb7lLna8YxJjg0b3qEFHaWFhEBRFTvDUd0Vot7mHW6ii6nmSZ_pJSHmxMWnqbkaQVw9V2n_mcENkijw-N_MfoAEJJyTps2dV8VSCHn6GtFc4wUn9Wo-iM="
    ];

    try {
        // We can use the library's internal decryption function directly if it's exported
        // But fieldEncryptionExtension intercepts Prisma queries.
        // Let's just import the decrypt function directly.
        
        const { decrypt } = require('@prisma/extension-field-encryption/dist/crypto')
        
        const keyStr = process.env.PRISMA_FIELD_ENCRYPTION_KEY;
        const key = keyStr.replace('k1.aesgcm256.', ''); // Or maybe the library handles the full string
        // Actually we need to see how the library is structured, but we can write a simple aesgcm256 decryptor in node using crypto module because we know the format!
    } catch (e) {
        console.error(e)
    }
}
decryptValues();
