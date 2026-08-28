/**
 * Dataset ficticio y repetible para capturas comerciales de Muvail.
 * No utiliza documentos ni empresas reales.
 *
 * Uso: npx tsx --env-file=.env scripts/seed-landing-demo.ts
 */
import crypto from 'crypto';
import { prisma } from '../src/lib/prisma';
import { hashField } from '../src/lib/encryption';
import { saveSelectedCompanies } from '../src/lib/upstash';
import { calcularTrimestreExtendido } from '../src/lib/trimestre-utils';

const DEMO_EMAIL = 'test@gestor.local';
// El nombre y el correo aparecen en la barra lateral en todos los planos del video,
// así que la cuenta de capturas usa una identidad ficticia pero verosímil.
const DEMO_IDENTITY = { nombre: 'Marta Ferrer', email: 'marta.ferrer@lumen-estudio.es' };
const COMPANY = {
  name: 'Lumen Estudio S.L.',
  cif: 'B76184293',
  email: 'documentos@lumen-demo.local',
};

type DemoDocument = {
  number: string;
  type: 'Factura Emitida' | 'Factura Recibida';
  issueDate: string;
  dueDate: string;
  base: number;
  vat: number;
  counterparty: string;
  counterpartyCif: string;
  description: string;
  incident?: string;
  /** Total tal como lo leyó la extracción. Si difiere de base+vat el health check lo marca. */
  readTotal?: number;
};

const DOCUMENTS: DemoDocument[] = [
  { number: 'LUM-2026-041', type: 'Factura Emitida', issueDate: '2026-07-03', dueDate: '2026-08-02', base: 4850, vat: 1018.5, counterparty: 'Norte Diseño S.L.', counterpartyCif: 'B12879461', description: 'Proyecto de identidad y diseño web' },
  { number: 'LUM-2026-042', type: 'Factura Emitida', issueDate: '2026-07-15', dueDate: '2026-08-14', base: 3275, vat: 687.75, counterparty: 'Atria Comercio S.L.', counterpartyCif: 'B78214906', description: 'Implementación de portal de clientes' },
  { number: 'LUM-2026-043', type: 'Factura Emitida', issueDate: '2026-08-05', dueDate: '2026-09-04', base: 1980, vat: 415.8, counterparty: 'Casa Pardo S.L.', counterpartyCif: 'B65931487', description: 'Mantenimiento de plataforma' },
  { number: 'ALF-7781', type: 'Factura Recibida', issueDate: '2026-07-07', dueDate: '2026-08-06', base: 1180, vat: 247.8, counterparty: 'Alfa Cloud Iberia S.L.', counterpartyCif: 'B89650412', description: 'Infraestructura cloud y copias de seguridad', readTotal: 1472.8 },
  { number: 'PAP-2049', type: 'Factura Recibida', issueDate: '2026-07-22', dueDate: '2026-08-21', base: 640, vat: 134.4, counterparty: 'Papel Norte S.L.', counterpartyCif: 'B24180637', description: 'Material de oficina y papelería' },
  { number: 'ECO-9952', type: 'Factura Recibida', issueDate: '2026-08-01', dueDate: '2026-08-31', base: 820, vat: 172.2, counterparty: 'Estudio Contable Río S.L.', counterpartyCif: 'B57204916', description: 'Asesoría contable y fiscal' },
  { number: 'MOV-3801', type: 'Factura Recibida', issueDate: '2026-08-12', dueDate: '2026-09-11', base: 360, vat: 75.6, counterparty: 'Móvil Proveedores S.L.', counterpartyCif: 'B31075829', description: 'Telefonía y conectividad' },
  { number: 'NUB-1147', type: 'Factura Recibida', issueDate: '2026-08-18', dueDate: '2026-09-17', base: 495, vat: 103.95, counterparty: 'Nube Clara S.L.', counterpartyCif: 'B42786103', description: 'Licencias de colaboración', incident: 'Fecha de vencimiento a confirmar antes del cierre.' },
];

// Los ocho documentos de arriba son los que aparecen en los rankings y en el health check.
// Estos completan el volumen del trimestre para que el cierre no se vea vacío.
const SUPPLIERS: Array<[string, string, string]> = [
  ['Alfa Cloud Iberia S.L.', 'B89650412', 'Infraestructura cloud y copias de seguridad'],
  ['Papel Norte S.L.', 'B24180637', 'Material de oficina y papelería'],
  ['Estudio Contable Río S.L.', 'B57204916', 'Asesoría contable y fiscal'],
  ['Móvil Proveedores S.L.', 'B31075829', 'Telefonía y conectividad'],
  ['Nube Clara S.L.', 'B42786103', 'Licencias de colaboración'],
  ['Suministros Vallés S.L.', 'B61093574', 'Consumibles de impresión'],
  ['Energía Duero S.A.', 'A47301826', 'Suministro eléctrico del local'],
  ['Seguros Almenar S.L.', 'B95412708', 'Póliza de responsabilidad civil'],
  ['Logística Ebro S.L.', 'B50827194', 'Mensajería y envíos'],
  ['Talleres Gráficos Sella S.L.', 'B33619470', 'Impresión de material corporativo'],
];

const CLIENTS: Array<[string, string, string]> = [
  ['Norte Diseño S.L.', 'B12879461', 'Proyecto de identidad y diseño web'],
  ['Atria Comercio S.L.', 'B78214906', 'Implementación de portal de clientes'],
  ['Casa Pardo S.L.', 'B65931487', 'Mantenimiento de plataforma'],
  ['Mirador Hostelería S.L.', 'B70348215', 'Consultoría de procesos'],
  ['Bodegas Rincón S.A.', 'A26910473', 'Rediseño de tienda online'],
  ['Clínica Sanabria S.L.', 'B84157029', 'Soporte y evolutivos mensuales'],
];

function fillerDocuments(): DemoDocument[] {
  const documents: DemoDocument[] = [];
  // Repartir el trimestre entre julio y septiembre con importes variados pero coherentes.
  for (let index = 0; index < 40; index += 1) {
    // Más facturas emitidas que recibidas y por importes mayores: un estudio que factura
    // menos de lo que gasta se ve en el resumen del trimestre como beneficio negativo.
    const issued = index % 9 < 5;
    const pool = issued ? CLIENTS : SUPPLIERS;
    const [counterparty, counterpartyCif, description] = pool[index % pool.length];
    const month = 7 + (index % 3);
    const day = 2 + ((index * 7) % 26);
    const base = issued
      ? Math.round((1450 + ((index * 337) % 5200)) * 100) / 100
      : Math.round((95 + ((index * 173) % 980)) * 100) / 100;
    const vat = Math.round(base * 21) / 100;
    const dueMonth = month + 1;
    documents.push({
      number: issued ? `LUM-2026-${100 + index}` : `${counterpartyCif.slice(1, 4)}-${4200 + index * 13}`,
      type: issued ? 'Factura Emitida' : 'Factura Recibida',
      issueDate: `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      dueDate: `2026-${String(dueMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      base,
      vat,
      counterparty,
      counterpartyCif,
      description,
    });
  }
  return documents;
}

DOCUMENTS.push(...fillerDocuments());

function sha256(value: string) {
  return crypto.createHash('sha256').update(value.toLowerCase().trim()).digest('hex');
}

function date(value: string) {
  return new Date(`${value}T12:00:00.000Z`);
}

async function createDocument(companyId: bigint, document: DemoDocument) {
  const fileHash = sha256(`muvail-landing-demo|${COMPANY.cif}|${document.number}`);
  const existing = await prisma.documentos.findFirst({
    where: { file_hash: fileHash, id_de_empresa: companyId },
  });
  if (existing) return existing;

  // El total que se guarda es el que leyó la extracción. Las líneas y el impuesto
  // conservan el importe correcto, así el health check puede volver a sumar y detectar
  // la diferencia igual que con un documento real mal leído.
  const trueTotal = Math.round((document.base + document.vat) * 100) / 100;
  const total = document.readTotal ?? trueTotal;
  const quarter = calcularTrimestreExtendido(date(document.issueDate));
  const issued = document.type === 'Factura Emitida';

  return prisma.$transaction(async (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => {
    const created = await tx.documentos.create({
      data: {
        file_hash: fileHash,
        tipo_documento: document.type,
        numero_documento: document.number,
        fecha_emision: date(document.issueDate),
        fecha_vencimiento: date(document.dueDate),
        importe_total: total,
        importe_sin_impuestos: document.base,
        moneda: 'EUR',
        observaciones: document.description,
        datos_extra: {
          demo_ficticio: true,
          categoria: issued ? 'Servicios profesionales' : 'Operación',
          forma_pago: 'Transferencia bancaria',
        },
        id_de_empresa: companyId,
        is_new: 0,
        trimestre_cerrado: false,
        enviado_sii: false,
        // El trimestre se resuelve con la misma regla que el producto (extendido hasta el
        // día 20 del mes siguiente), no con un número fijo: si no, la demo se contradice
        // con lo que el propio gestor asigna a un documento subido.
        año_trimestre: quarter.año,
        num_trimestre: quarter.trimestre,
        dashboard_correo: 'dashboard',
      },
    });

    const ownEntity = {
      documento_id: created.id,
      id_de_empresa: companyId,
      nombre: COMPANY.name,
      identificador_fiscal: COMPANY.cif,
      nombre_hash: sha256(COMPANY.name),
      identificador_fiscal_hash: sha256(COMPANY.cif),
    };
    const otherEntity = {
      documento_id: created.id,
      id_de_empresa: companyId,
      nombre: document.counterparty,
      identificador_fiscal: document.counterpartyCif,
      nombre_hash: sha256(document.counterparty),
      identificador_fiscal_hash: sha256(document.counterpartyCif),
    };

    await tx.entidades_documento.createMany({
      data: issued
        ? [{ ...ownEntity, rol: 'emisor' }, { ...otherEntity, rol: 'cliente' }]
        : [{ ...otherEntity, rol: 'proveedor' }, { ...ownEntity, rol: 'receptor' }],
    });
    await tx.impuestos_documento.create({
      data: {
        documento_id: created.id,
        id_de_empresa: companyId,
        tipo_impuesto: 'IVA',
        porcentaje: 21,
        base_imponible: document.base,
        cuota: document.vat,
        total_con_impuesto: trueTotal,
      },
    });
    await tx.lineas_documento.create({
      data: {
        documento_id: created.id,
        id_de_empresa: companyId,
        codigo: issued ? 'SERV-01' : 'OPER-01',
        descripcion: document.description,
        cantidad: 1,
        unidad: 'ud',
        precio_unitario: document.base,
        precio_neto: document.base,
        importe_linea: document.base,
      },
    });
    if (document.incident) {
      await tx.incidencias_documento.create({
        data: {
          documento_id: created.id,
          id_de_empresa: companyId,
          incidencia: true,
          descripcion: document.incident,
          validado: false,
        },
      });
    }
    return created;
  });
}

async function main() {
  // El script es repetible: tras la primera pasada el usuario ya responde a la identidad nueva.
  const user =
    (await prisma.usuarios.findUnique({ where: { email_hash: hashField(DEMO_EMAIL) }, select: { id: true } })) ??
    (await prisma.usuarios.findUnique({ where: { email_hash: hashField(DEMO_IDENTITY.email) }, select: { id: true } }));
  if (!user) throw new Error(`No existe el usuario demo ${DEMO_EMAIL}. Ejecutá primero seed-test-user.ts.`);

  await prisma.usuarios.update({
    where: { id: user.id },
    data: {
      nombre: DEMO_IDENTITY.nombre,
      email: DEMO_IDENTITY.email,
      email_hash: hashField(DEMO_IDENTITY.email),
      // Los carteles de tutorial tapan la interfaz en las capturas.
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

  let company = await prisma.empresas.findFirst({ where: { cif_hash: hashField(COMPANY.cif) } });
  if (!company) {
    company = await prisma.empresas.create({
      data: {
        nombre_de_empresa: COMPANY.name,
        nombre_fiscal: COMPANY.name,
        CIF: COMPANY.cif,
        cif_hash: hashField(COMPANY.cif),
        mail_de_carga: COMPANY.email,
        mail_de_carga_hash: hashField(COMPANY.email),
        id_de_usuario: [Number(user.id)],
        recargo: false,
        config_roles: {},
      },
    });
  } else {
    await prisma.empresas.update({
      where: { id: company.id },
      data: { id_de_usuario: [Number(user.id)] },
    });
  }

  // La cuenta usada para las capturas comerciales sólo debe ofrecer datos de demostración.
  // Toda otra empresa se retira del usuario demo: el selector aparece en cada plano del
  // video y un nombre de prueba ahí dentro delata la cuenta.
  const otherCompanies = await prisma.empresas.findMany({
    select: { id: true, nombre_de_empresa: true, id_de_usuario: true },
  });
  const removedCompanyIds: number[] = [];
  for (const candidate of otherCompanies) {
    if (Number(candidate.id) === Number(company.id)) continue;
    const members = Array.isArray(candidate.id_de_usuario)
      ? candidate.id_de_usuario.map(Number)
      : [];
    if (!members.includes(Number(user.id))) continue;

    await prisma.empresas.update({
      where: { id: candidate.id },
      data: { id_de_usuario: members.filter((memberId: number) => memberId !== Number(user.id)) },
    });
    removedCompanyIds.push(Number(candidate.id));
  }

  for (const document of DOCUMENTS) await createDocument(company.id, document);
  await saveSelectedCompanies(Number(user.id), [Number(company.id)]);

  console.log(JSON.stringify({
    company: COMPANY.name,
    companyId: Number(company.id),
    documents: DOCUMENTS.length,
    selectedForUser: Number(user.id),
    removedCompanyIds,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
