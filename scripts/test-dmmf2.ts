import { Prisma } from '@prisma/client';
const models = Prisma.dmmf.datamodel.models;
console.log("Total models:", models.length);
const empresas = models.find(m => m.name === 'empresas');
if (empresas) {
  console.log("Empresas fields with documentation:");
  empresas.fields.forEach(f => {
    if (f.documentation) {
      console.log(f.name, f.documentation);
    }
  });
}
