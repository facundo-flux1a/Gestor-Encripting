import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';
import { prisma } from '../src/lib/prisma';

// Función para generar SHA-256 (mismo algoritmo que usa MySQL SHA2(text, 256))
function sha256(text: string | null | undefined): string | null {
  if (!text) return null;
  return crypto.createHash('sha256').update(text).digest('hex');
}

async function migrateEmpresas() {
  console.log('Migrando Empresas...');
  // Bypass middleware: lectura directa vía Prisma $queryRaw
  const empresas = await prisma.$queryRawUnsafe('SELECT * FROM empresas WHERE nombre_de_empresa NOT LIKE "v1:%" OR cif_hash IS NULL');
  let count = 0;
  for (const emp of (empresas as any[])) {
    await prisma.empresas.update({
      where: { id: emp.id },
      data: {
        nombre_de_empresa: emp.nombre_de_empresa,
        nombre_fiscal: emp.nombre_fiscal,
        mail_de_carga: emp.mail_de_carga,
        CIF: emp.CIF || emp.cif,
        cif_hash: sha256(emp.CIF || emp.cif),
        mail_de_carga_hash: sha256(emp.mail_de_carga)
      }
    });
    count++;
    if (count % 100 === 0) console.log(`  Procesadas ${count}/${(empresas as any[]).length}...`);
  }
  console.log(`✅ Empresas migradas: ${count}`);
}

async function migrateEntidades() {
  console.log('Migrando Entidades Documento...');
  const entidades = await prisma.$queryRawUnsafe('SELECT * FROM entidades_documento WHERE nombre NOT LIKE "v1:%" OR nombre_hash IS NULL');
  let count = 0;
  for (const ent of (entidades as any[])) {
    await prisma.entidades_documento.update({
      where: { id: ent.id },
      data: {
        nombre: ent.nombre,
        direccion: ent.direccion,
        identificador_fiscal: ent.identificador_fiscal,
        telefono: ent.telefono,
        email: ent.email,
        nombre_hash: sha256(ent.nombre),
        identificador_fiscal_hash: sha256(ent.identificador_fiscal)
      }
    });
    count++;
    if (count % 1000 === 0) console.log(`  Procesadas ${count}/${(entidades as any[]).length}...`);
  }
  console.log(`✅ Entidades migradas: ${count}`);
}

async function migrateUsuarios() {
  console.log('Migrando Usuarios...');
  const usuarios = await prisma.$queryRawUnsafe('SELECT * FROM usuarios WHERE nombre NOT LIKE "v1:%" OR email NOT LIKE "v1:%"');
  let count = 0;
  for (const user of (usuarios as any[])) {
    await prisma.usuarios.update({
      where: { id: user.id },
      data: {
        nombre: user.nombre,
        email: user.email,
        phone: user.phone
      }
    });
    count++;
    if (count % 100 === 0) console.log(`  Procesados ${count}/${(usuarios as any[]).length}...`);
  }
  console.log(`✅ Usuarios migrados: ${count}`);
}

async function migrateArchivos() {
  console.log('Migrando Archivos Documento...');
  const archivos = await prisma.$queryRawUnsafe('SELECT * FROM archivos_documento WHERE nombre_archivo NOT LIKE "v1:%"');
  let count = 0;
  for (const arc of (archivos as any[])) {
    await prisma.archivos_documento.update({
      where: { id: arc.id },
      data: {
        nombre_archivo: arc.nombre_archivo,
        ruta_archivo: arc.ruta_archivo
      }
    });
    count++;
    if (count % 1000 === 0) console.log(`  Procesados ${count}/${(archivos as any[]).length}...`);
  }
  console.log(`✅ Archivos migrados: ${count}`);
}

async function migrateProductosConfig() {
  console.log('Migrando Productos Config...');
  const productos = await prisma.$queryRawUnsafe('SELECT * FROM productos_config WHERE proveedor_cif NOT LIKE "v1:%" OR proveedor_cif_hash IS NULL');
  let count = 0;
  for (const prod of (productos as any[])) {
    await prisma.productos_config.update({
      where: { id: prod.id },
      data: {
        proveedor_cif: prod.proveedor_cif,
        proveedor_cif_hash: sha256(prod.proveedor_cif)
      }
    });
    count++;
    if (count % 100 === 0) console.log(`  Procesados ${count}/${(productos as any[]).length}...`);
  }
  console.log(`✅ Productos Config migrados: ${count}`);
}

async function migrateEntidadesConfig() {
  console.log('Migrando Entidades Config...');
  const entidades = await prisma.$queryRawUnsafe('SELECT * FROM entidades_config WHERE identificador_fiscal NOT LIKE "v1:%" OR identificador_fiscal_hash IS NULL');
  let count = 0;
  for (const ent of (entidades as any[])) {
    await prisma.entidades_config.update({
      where: { id: ent.id },
      data: {
        identificador_fiscal: ent.identificador_fiscal,
        identificador_fiscal_hash: sha256(ent.identificador_fiscal)
      }
    });
    count++;
    if (count % 100 === 0) console.log(`  Procesados ${count}/${(entidades as any[]).length}...`);
  }
  console.log(`✅ Entidades Config migrados: ${count}`);
}

async function main() {
  console.log('🚀 Iniciando Migración de Encriptación y Hashes...');
  try {
    await migrateEmpresas();
    await migrateEntidades();
    await migrateUsuarios();
    await migrateArchivos();
    await migrateProductosConfig();
    await migrateEntidadesConfig();
    console.log('🎉 Migración completada exitosamente.');
  } catch (error) {
    console.error('❌ Error durante la migración:', error);
  } finally {
    process.exit(0);
  }
}

main();
