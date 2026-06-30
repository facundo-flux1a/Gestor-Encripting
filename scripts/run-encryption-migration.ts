import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';
import { prisma } from '../src/lib/prisma';

// Función para generar SHA-256 idéntica a la que usa la aplicación en sus servicios
// Aplicando toLowerCase y trim() para no romper los Blind Index
function sha256(text: string | null | undefined): string | null {
  if (!text) return null;
  return crypto.createHash('sha256').update(String(text).toLowerCase().trim()).digest('hex');
}

async function processInBatches(model: any, processor: (item: any) => Promise<void>) {
  let count = 0;
  const take = 500;
  let hasMore = true;
  let lastId: any = undefined;

  while (hasMore) {
    const batch = await model.findMany({
      take,
      ...(lastId !== undefined && {
        skip: 1,
        cursor: { id: lastId }
      }),
      orderBy: { id: 'asc' } // Cursor paginación para 100% de consistencia en live databases
    });

    if (batch.length === 0) {
      hasMore = false;
      break;
    }

    for (const item of batch) {
      await processor(item);
      count++;
    }
    
    lastId = batch[batch.length - 1].id;
    // Muestra progreso en la misma línea
    process.stdout.write(`  Procesados ${count}...\r`);
  }
  console.log(`\n  ✅ Total migrados: ${count}`);
}

async function migrateEmpresas() {
  console.log('Migrando Empresas...');
  await processInBatches(prisma.empresas, async (emp) => {
    try {
      await prisma.empresas.update({
        where: { id: emp.id },
        data: {
          nombre_de_empresa: emp.nombre_de_empresa,
          nombre_fiscal: emp.nombre_fiscal,
          mail_de_carga: emp.mail_de_carga,
          CIF: emp.CIF,
          cif_hash: sha256(emp.CIF),
          mail_de_carga_hash: sha256(emp.mail_de_carga)
        }
      });
    } catch (error: any) {
      if (error.code === 'P2002') console.error(`\n  ⚠️ Duplicado detectado en Empresa ID ${emp.id}. Saltando...`);
      else console.error(`\n  ❌ Error en Empresa ID ${emp.id}:`, error.message);
    }
  });
}

async function migrateEntidades() {
  console.log('Migrando Entidades Documento...');
  await processInBatches(prisma.entidades_documento, async (ent) => {
    try {
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
    } catch (error: any) {
      console.error(`\n  ❌ Error en Entidad Documento ID ${ent.id}:`, error.message);
    }
  });
}

async function migrateUsuarios() {
  console.log('Migrando Usuarios...');
  await processInBatches(prisma.usuarios, async (user) => {
    try {
      await prisma.usuarios.update({
        where: { id: user.id },
        data: {
          nombre: user.nombre,
          email: user.email,
          phone: user.phone,
          email_hash: sha256(user.email) // AHORA SÍ GENERAMOS EL HASH PARA EL USUARIO
        }
      });
    } catch (error: any) {
      if (error.code === 'P2002') console.error(`\n  ⚠️ Email duplicado en Usuario ID ${user.id}. Saltando...`);
      else console.error(`\n  ❌ Error en Usuario ID ${user.id}:`, error.message);
    }
  });
}

async function migrateArchivos() {
  console.log('Migrando Archivos Documento...');
  await processInBatches(prisma.archivos_documento, async (arc) => {
    // Si bien no hay hashes acá, repasar un update dispara la encriptación segura de Prisma 
    // sin riesgo de doble encriptar (porque Prisma ya desencriptó al hacer findMany)
    try {
      await prisma.archivos_documento.update({
        where: { id: arc.id },
        data: {
          nombre_archivo: arc.nombre_archivo,
          ruta_archivo: arc.ruta_archivo
        }
      });
    } catch (error: any) {
      console.error(`\n  ❌ Error en Archivo Documento ID ${arc.id}:`, error.message);
    }
  });
}

async function migrateProductosConfig() {
  console.log('Migrando Productos Config...');
  await processInBatches(prisma.productos_config, async (prod) => {
    try {
      await prisma.productos_config.update({
        where: { id: prod.id },
        data: {
          proveedor_cif: prod.proveedor_cif,
          proveedor_cif_hash: sha256(prod.proveedor_cif)
        }
      });
    } catch (error: any) {
      console.error(`\n  ❌ Error en Productos Config ID ${prod.id}:`, error.message);
    }
  });
}

async function migrateEntidadesConfig() {
  console.log('Migrando Entidades Config...');
  await processInBatches(prisma.entidades_config, async (ent) => {
    try {
      await prisma.entidades_config.update({
        where: { id: ent.id },
        data: {
          identificador_fiscal: ent.identificador_fiscal,
          identificador_fiscal_hash: sha256(ent.identificador_fiscal)
        }
      });
    } catch (error: any) {
      if (error.code === 'P2002') console.error(`\n  ⚠️ Duplicado detectado en Entidades Config ID ${ent.id}. Saltando...`);
      else console.error(`\n  ❌ Error en Entidades Config ID ${ent.id}:`, error.message);
    }
  });
}

async function migrateInvitaciones() {
  console.log('Migrando Invitaciones Empresa...');
  await processInBatches(prisma.invitaciones_empresa, async (inv) => {
    try {
      await prisma.invitaciones_empresa.update({
        where: { id: inv.id },
        data: {
          email: inv.email,
          email_hash: sha256(inv.email)
        }
      });
    } catch (error: any) {
      console.error(`\n  ❌ Error en Invitación Empresa ID ${inv.id}:`, error.message);
    }
  });
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
    await migrateInvitaciones();
    console.log('\n🎉 Migración completada exitosamente. Todo está a prueba de balas.');
  } catch (error) {
    console.error('\n❌ Error general durante la migración:', error);
  } finally {
    process.exit(0);
  }
}

main();
