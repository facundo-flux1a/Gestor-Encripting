/**
 * Crea usuario + empresa de prueba en la DB de .env (testing).
 * Uso: npx tsx --env-file=.env scripts/seed-test-user.ts
 */
import bcrypt from 'bcryptjs';
import { prisma } from '../src/lib/prisma';
import { hashField } from '../src/lib/encryption';

const email = 'test@gestor.local';
const password = 'TestGestor2026!';
const nombre = 'Usuario Test';
const empresaNombre = 'Empresa Test SL';
const cif = 'B12345678';
const mailCarga = 'carga-test@gestor.local';

async function main() {
  const existing = await prisma.usuarios.findUnique({
    where: { email_hash: hashField(email) },
  });
  if (existing) {
    console.log('Ya existe usuario id=', String(existing.id));
    console.log('email:', email);
    console.log('password:', password);
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const empresa = await prisma.empresas.create({
    data: {
      nombre_de_empresa: empresaNombre,
      nombre_fiscal: empresaNombre,
      CIF: cif,
      cif_hash: hashField(cif),
      mail_de_carga: mailCarga,
      mail_de_carga_hash: hashField(mailCarga),
      recargo: false,
      config_roles: {},
    },
  });

  const user = await prisma.usuarios.create({
    data: {
      nombre,
      email,
      email_hash: hashField(email),
      password: hashedPassword,
      activo: true,
      email_verified: true,
      has_permits: true,
      id_de_empresa: empresa.id,
      organization_rol: 'ADMIN',
      rol: 'usuario',
      tutorial: false,
      tutorial_documentos: false,
      tutorial_trimestres: false,
      tutorial_actividad: false,
      tutorial_individual: false,
      tutorial_incidencias: false,
      tutorial_proveedores: false,
      tutorial_health_check: false,
    },
  });

  await prisma.empresas.update({
    where: { id: empresa.id },
    data: { id_de_usuario: [Number(user.id)] },
  });

  console.log('OK');
  console.log('email:', email);
  console.log('password:', password);
  console.log('userId:', String(user.id));
  console.log('empresaId:', String(empresa.id));
  console.log('empresa:', empresaNombre);
  console.log('cif:', cif);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
