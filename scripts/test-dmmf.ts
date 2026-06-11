import { Prisma } from '@prisma/client';
const models = Prisma.dmmf.datamodel.models;
const encryptedModels = models.map(m => {
  return {
    name: m.name,
    encryptedFields: m.fields.filter(f => f.documentation?.includes('@encrypted')).map(f => f.name)
  }
}).filter(m => m.encryptedFields.length > 0);
console.log(JSON.stringify(encryptedModels, null, 2));
