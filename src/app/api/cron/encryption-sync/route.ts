import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import db from '@/lib/db';
import * as crypto from 'crypto';

// Replicamos la misma lógica criptográfica del script maestro
function sha256(text: string | null | undefined): string | null {
  if (!text) return null;
  return crypto.createHash('sha256').update(String(text).toLowerCase().trim()).digest('hex');
}

export async function GET(req: Request) {
  try {
    // 1. Verificación de Seguridad Básica
    const authHeader = req.headers.get('authorization');
    const secret = process.env.CRON_SECRET;
    
    if (!secret || authHeader !== `Bearer ${secret}`) {
      console.warn('⚠️ [CRON] Intento de acceso no autorizado al cron de encriptación.');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('🧹 [CRON] Iniciando proceso barrendero de encriptación...');
    const stats = {
      entidades_documento: 0,
      empresas: 0,
      usuarios: 0,
      archivos_documento: 0,
      productos_config: 0,
      entidades_config: 0,
      invitaciones_empresa: 0
    };

    const BATCH_SIZE = 50;

    // ==========================================
    // 1. Entidades Documento
    // ==========================================
    const [entidades] = await db.query<{ id: string }[]>(`
      SELECT id FROM entidades_documento 
      WHERE fecha_creacion < NOW() - INTERVAL 15 MINUTE
        AND (
          (nombre IS NOT NULL AND nombre NOT LIKE 'v1.%')
          OR (direccion IS NOT NULL AND direccion NOT LIKE 'v1.%')
          OR (identificador_fiscal IS NOT NULL AND identificador_fiscal NOT LIKE 'v1.%')
          OR (telefono IS NOT NULL AND telefono NOT LIKE 'v1.%')
          OR (email IS NOT NULL AND email NOT LIKE 'v1.%')
        )
      LIMIT ?
    `, [BATCH_SIZE]);

    if (entidades.length > 0) {
      const ids = entidades.map(e => BigInt(e.id));
      console.log(`[CRON] Entidades Documento a procesar: ${ids.length}`);
      const unencryptedData = await prisma.entidades_documento.findMany({ where: { id: { in: ids } } });
      
      for (const ent of unencryptedData) {
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
        stats.entidades_documento++;
      }
      console.log(`[CRON] Entidades Documento procesadas: ${stats.entidades_documento}`);
    }

    // ==========================================
    // 2. Empresas
    // Nota: CIF queda en texto plano (no @encrypted), solo computamos su hash.
    // nombre_de_empresa, nombre_fiscal y mail_de_carga SÍ se encriptan.
    // ==========================================
    // Sin filtro de fecha: empresas son registros de configuración creados por humanos.
    const [empresasRows] = await db.query<{ id: string }[]>(`
      SELECT id FROM empresas 
      WHERE (nombre_de_empresa IS NOT NULL AND nombre_de_empresa NOT LIKE 'v1.%')
         OR (nombre_fiscal IS NOT NULL AND nombre_fiscal NOT LIKE 'v1.%')
         OR (CIF IS NOT NULL AND CIF NOT LIKE 'v1.%')
         OR (mail_de_carga IS NOT NULL AND mail_de_carga NOT LIKE 'v1.%')
      LIMIT ?
    `, [BATCH_SIZE]);

    if (empresasRows.length > 0) {
      const ids = empresasRows.map(e => BigInt(e.id));
      console.log(`[CRON] Empresas a procesar: ${ids.length}`);
      const unencryptedData = await prisma.empresas.findMany({ where: { id: { in: ids } } });
      
      for (const emp of unencryptedData) {
        try {
          await prisma.empresas.update({
            where: { id: emp.id },
            data: {
              nombre_de_empresa: emp.nombre_de_empresa,
              nombre_fiscal: emp.nombre_fiscal,
              CIF: emp.CIF,
              mail_de_carga: emp.mail_de_carga,
              cif_hash: sha256(emp.CIF),
              mail_de_carga_hash: sha256(emp.mail_de_carga)
            }
          });
          stats.empresas++;
        } catch (e: any) {
          if (e.code !== 'P2002') console.error('Error migrando empresa', emp.id, e);
        }
      }
      console.log(`[CRON] Empresas procesadas: ${stats.empresas}`);
    }

    // ==========================================
    // 3. Usuarios
    // ==========================================
    const [usuariosRows] = await db.query<{ id: string }[]>(`
      SELECT id FROM usuarios 
      WHERE fecha_creacion < NOW() - INTERVAL 15 MINUTE
        AND fecha_actualizacion < NOW() - INTERVAL 15 MINUTE
        AND (
          (nombre IS NOT NULL AND nombre NOT LIKE 'v1.%')
          OR (email IS NOT NULL AND email NOT LIKE 'v1.%')
          OR (phone IS NOT NULL AND phone NOT LIKE 'v1.%')
        )
      LIMIT ?
    `, [BATCH_SIZE]);

    if (usuariosRows.length > 0) {
      const ids = usuariosRows.map(e => BigInt(e.id));
      console.log(`[CRON] Usuarios a procesar: ${ids.length}`);
      const unencryptedData = await prisma.usuarios.findMany({ where: { id: { in: ids } } });
      
      for (const usr of unencryptedData) {
        try {
          await prisma.usuarios.update({
            where: { id: usr.id },
            data: {
              nombre: usr.nombre,
              email: usr.email,
              phone: usr.phone,
              email_hash: sha256(usr.email)
            }
          });
          stats.usuarios++;
        } catch (e: any) {
          if (e.code !== 'P2002') console.error('Error migrando usuario', usr.id, e);
        }
      }
      console.log(`[CRON] Usuarios procesados: ${stats.usuarios}`);
    }

    // ==========================================
    // 4. Archivos Documento
    // ==========================================
    const [archivosRows] = await db.query<{ id: string }[]>(`
      SELECT id FROM archivos_documento 
      WHERE fecha_subida < NOW() - INTERVAL 15 MINUTE
        AND (
          (nombre_archivo IS NOT NULL AND nombre_archivo NOT LIKE 'v1.%')
          OR (ruta_archivo IS NOT NULL AND ruta_archivo NOT LIKE 'v1.%')
        )
      LIMIT ?
    `, [BATCH_SIZE]);

    if (archivosRows.length > 0) {
      const ids = archivosRows.map(e => BigInt(e.id));
      console.log(`[CRON] Archivos Documento a procesar: ${ids.length}`);
      const unencryptedData = await prisma.archivos_documento.findMany({ where: { id: { in: ids } } });
      
      for (const arc of unencryptedData) {
        await prisma.archivos_documento.update({
          where: { id: arc.id },
          data: {
            nombre_archivo: arc.nombre_archivo,
            ruta_archivo: arc.ruta_archivo
          }
        });
        stats.archivos_documento++;
      }
      console.log(`[CRON] Archivos Documento procesados: ${stats.archivos_documento}`);
    }

    // ==========================================
    // 5. Productos Config
    // ==========================================
    const [productosConfigRows] = await db.query<{ id: string }[]>(`
      SELECT id FROM productos_config 
      WHERE created_at < NOW() - INTERVAL 15 MINUTE
        AND updated_at < NOW() - INTERVAL 15 MINUTE
        AND (proveedor_cif IS NOT NULL AND proveedor_cif NOT LIKE 'v1.%')
      LIMIT ?
    `, [BATCH_SIZE]);

    if (productosConfigRows.length > 0) {
      const ids = productosConfigRows.map(e => Number(e.id));
      console.log(`[CRON] Productos Config a procesar: ${ids.length}`);
      const unencryptedData = await prisma.productos_config.findMany({ where: { id: { in: ids } } });
      
      for (const pc of unencryptedData) {
        await prisma.productos_config.update({
          where: { id: pc.id },
          data: {
            proveedor_cif: pc.proveedor_cif,
            proveedor_cif_hash: sha256(pc.proveedor_cif)
          }
        });
        stats.productos_config++;
      }
      console.log(`[CRON] Productos Config procesados: ${stats.productos_config}`);
    }

    // ==========================================
    // 6. Entidades Config
    // ==========================================
    const [entidadesConfigRows] = await db.query<{ id: string }[]>(`
      SELECT id FROM entidades_config 
      WHERE fecha_modificacion < NOW() - INTERVAL 15 MINUTE
        AND (identificador_fiscal IS NOT NULL AND identificador_fiscal NOT LIKE 'v1.%')
      LIMIT ?
    `, [BATCH_SIZE]);

    if (entidadesConfigRows.length > 0) {
      const ids = entidadesConfigRows.map(e => BigInt(e.id));
      console.log(`[CRON] Entidades Config a procesar: ${ids.length}`);
      const unencryptedData = await prisma.entidades_config.findMany({ where: { id: { in: ids } } });
      
      for (const ec of unencryptedData) {
        try {
          await prisma.entidades_config.update({
            where: { id: ec.id },
            data: {
              identificador_fiscal: ec.identificador_fiscal,
              identificador_fiscal_hash: sha256(ec.identificador_fiscal)
            }
          });
          stats.entidades_config++;
        } catch (e: any) {
          if (e.code !== 'P2002') console.error('Error migrando entidades config', ec.id, e);
        }
      }
      console.log(`[CRON] Entidades Config procesadas: ${stats.entidades_config}`);
    }

    // ==========================================
    // 7. Invitaciones Empresa
    // ==========================================
    const [invitacionesRows] = await db.query<{ id: string }[]>(`
      SELECT id FROM invitaciones_empresa 
      WHERE fecha_creacion < NOW() - INTERVAL 15 MINUTE
        AND (email IS NOT NULL AND email NOT LIKE 'v1.%')
      LIMIT ?
    `, [BATCH_SIZE]);

    if (invitacionesRows.length > 0) {
      const ids = invitacionesRows.map(e => Number(e.id)); // invitaciones_empresa id is Int
      console.log(`[CRON] Invitaciones a procesar: ${ids.length}`);
      const unencryptedData = await prisma.invitaciones_empresa.findMany({ where: { id: { in: ids } } });
      
      for (const inv of unencryptedData) {
        await prisma.invitaciones_empresa.update({
          where: { id: inv.id },
          data: {
            email: inv.email,
            email_hash: sha256(inv.email)
          }
        });
        stats.invitaciones_empresa++;
      }
      console.log(`[CRON] Invitaciones procesadas: ${stats.invitaciones_empresa}`);
    }

    console.log('✅ [CRON] Proceso barrendero finalizado.', stats);
    return NextResponse.json({ success: true, stats }, { status: 200 });

  } catch (error: any) {
    console.error('❌ [CRON] Error crítico en proceso barrendero:', error);
    return NextResponse.json({ error: 'Error interno del servidor', details: error.message }, { status: 500 });
  }
}
