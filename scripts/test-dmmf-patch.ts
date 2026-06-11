import { Prisma } from '@prisma/client';

console.log("Before patch:");
let e = Prisma.dmmf.datamodel.models.find(m => m.name === 'empresas');
console.log(e?.fields.find(f => f.name === 'nombre_de_empresa')?.documentation);

const encryptedFields: Record<string, string[]> = {
  "empresas": ["nombre_de_empresa", "nombre_fiscal", "mail_de_carga"]
};

Prisma.dmmf.datamodel.models.forEach((model: any) => {
  const fields = encryptedFields[model.name];
  if (fields) {
    model.fields.forEach((field: any) => {
      if (fields.includes(field.name)) {
        field.documentation = '@encrypted';
      }
    });
  }
});

console.log("After patch:");
let e2 = Prisma.dmmf.datamodel.models.find(m => m.name === 'empresas');
console.log(e2?.fields.find(f => f.name === 'nombre_de_empresa')?.documentation);

// Now try initializing the extension
import { fieldEncryptionExtension } from 'prisma-field-encryption';
const ext = fieldEncryptionExtension({ dmmf: Prisma.dmmf });
// We can't easily see its internal parsed models, but let's check if it throws
console.log("Extension initialized.");
