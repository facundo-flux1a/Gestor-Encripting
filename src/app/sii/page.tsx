'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PageHeader } from '@/components/layout/page-header';
import { Loader2, CheckCircle, XCircle, Upload, Send, FileText, ArrowLeft, MoveRight, Database, ShieldCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import { useDemoMode } from '@/context/DemoModeContext';
import { DEMO_DOCUMENTS } from '@/lib/demo-data';

interface TestResult {
  success: boolean;
  entorno?: string;
  mensaje?: string;
  error?: string;
}

interface DocumentoSII {
  id: number;
  num_factura: string;
  fecha_factura: string;
  descripcion: string;
  nombre_empresa: string;
  nombre_cliente: string;
  base_imponible: string;
  cuota_iva: string;
  tipo_documento: string;
  empresa_id?: number | string;
}

const CertificateUpload = ({
  onFileChange,
  certificado,
  password,
  onPasswordChange
}: {
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  certificado: string;
  password: string;
  onPasswordChange: (value: string) => void;
}) => (
  <>
    <div className="group">
      <label className="block text-sm font-semibold mb-2">📜 Certificado Digital (AEAT)</label>
      <div className="flex items-center gap-2">
        <input type="file" accept=".pfx,.p12" onChange={onFileChange} className="block w-full text-xs sm:text-sm file:mr-2 file:py-2 file:px-4 file:rounded-full file:border-0 file:font-semibold file:bg-violet-100 file:text-violet-700 hover:file:bg-violet-200 cursor-pointer" />
        {certificado && <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />}
      </div>
    </div>
    <div className="group">
      <label className="block text-sm font-semibold mb-2">🔐 Contraseña</label>
      <input type="password" value={password} onChange={(e) => onPasswordChange(e.target.value)} placeholder="Escribe la contraseña" className="w-full px-4 py-3 border-2 rounded-lg focus:border-violet-400" />
    </div>
  </>
);

const DocumentCard = ({ doc, excluido, onToggle }: { doc: DocumentoSII; excluido: boolean; onToggle: () => void }) => (
  <div className={`flex items-start gap-3 p-4 rounded-xl border-2 transition-all ${excluido ? 'bg-red-50 dark:bg-red-950 border-red-300 opacity-60' : 'bg-white dark:bg-gray-800 border-violet-200 hover:border-violet-400'}`}>
    <Checkbox checked={excluido} onCheckedChange={onToggle} className="mt-1" />
    <div className="flex-1">
      <p className="font-bold text-sm sm:text-base">{doc.num_factura}</p>
      <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">📅 {doc.fecha_factura} • {doc.tipo_documento}</p>
      <p className="text-xs text-gray-500">{doc.nombre_empresa} → {doc.nombre_cliente || 'Cliente'}</p>
    </div>
    <div className="text-right">
      <p className="font-bold text-violet-700">{parseFloat(doc.base_imponible || '0').toFixed(2)}€</p>
      <p className="text-xs sm:text-sm text-gray-600">IVA: {parseFloat(doc.cuota_iva || '0').toFixed(2)}€</p>
    </div>
  </div>
);

export default function SIIPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const { isDemoMode } = useDemoMode();

  const [testing, setTesting] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [certificado, setCertificado] = useState('');
  const [password, setPassword] = useState('');
  const [documentos, setDocumentos] = useState<DocumentoSII[]>([]);
  const [excluidos, setExcluidos] = useState<Set<number>>(new Set());
  const [trimestreInfo, setTrimestreInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // User & Company Fiscal Info
  const [userInfo, setUserInfo] = useState<{ nombre?: string; email?: string } | null>(null);
  const [companyInfo, setCompanyInfo] = useState<{ id: number; nombre: string; cif: string } | null>(null);
  const [siiStats, setSiiStats] = useState<{ pendientes: number; enviados: number; total: number } | null>(null);

  // Estado DELSOL
  const [hasDelsol, setHasDelsol] = useState<boolean | null>(null);
  const [delsolInfo, setDelsolInfo] = useState<{ clienteCode?: string; baseDatos?: string } | null>(null);

  useEffect(() => {
    const año = searchParams.get('año') || '2026';
    const trimestre = searchParams.get('trimestre') || '3';
    const empresaId = searchParams.get('empresa_id');
    cargarDocumentos(año, trimestre, empresaId);
    cargarUserInfo(empresaId);
    if (!isDemoMode && empresaId && empresaId !== 'all') verificarDelsol(empresaId);
  }, [searchParams, isDemoMode]);

  const cargarUserInfo = async (empresaId: string | null) => {
    try {
      const params = new URLSearchParams();
      if (empresaId && empresaId !== 'all') params.append('empresa_id', empresaId);
      const res = await fetch(`/api/sii/user-info?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setUserInfo(data.usuario);
          setSiiStats(data.estadisticas);
          if (data.empresas && data.empresas.length > 0) {
            setCompanyInfo({
              id: data.empresas[0].id,
              nombre: data.empresas[0].nombre_fiscal || data.empresas[0].nombre_de_empresa,
              cif: data.empresas[0].cif,
            });
          }
        }
      }
    } catch (err) {
      console.error('Error al cargar info de usuario para SII:', err);
    }
  };

  const verificarDelsol = async (empresaId: string) => {
    try {
      const res = await fetch(`/api/delsol/config?empresaId=${empresaId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.clienteCode && data.baseDatos && data.hasPassword) {
          setHasDelsol(true);
          setDelsolInfo({ clienteCode: data.clienteCode, baseDatos: data.baseDatos });
        } else {
          setHasDelsol(false);
        }
      } else {
        setHasDelsol(false);
      }
    } catch {
      setHasDelsol(false);
    }
  };

  const cargarDocumentos = async (año: string, trimestre: string, empresaId: string | null) => {
    try {
      setLoading(true);

      if (isDemoMode) {
        const demoDocs: DocumentoSII[] = DEMO_DOCUMENTS.map(d => ({
          id: d.id_documento,
          num_factura: d.numero_documento,
          fecha_factura: d.fecha_emision,
          descripcion: d.observaciones || d.tipo_documento,
          nombre_empresa: d.empresa_nombre || 'Innovatech Solutions S.L.',
          nombre_cliente: d.proveedor || 'Cliente Demo',
          base_imponible: (d.base_imponible || 0).toString(),
          cuota_iva: (d.iva || 0).toString(),
          tipo_documento: d.tipo_documento,
          empresa_id: d.empresa_id
        }));
        setDocumentos(demoDocs);
        setTrimestreInfo({ año, trimestre, total: demoDocs.length });
        setHasDelsol(true);
        setDelsolInfo({ clienteCode: 'DEMO-87654', baseDatos: 'F2026' });
        return;
      }
      const params = new URLSearchParams({ año, trimestre });
      if (empresaId && empresaId !== 'all') params.append('empresa_id', empresaId);

      const response = await fetch(`/api/trimestres/documentos-sii?${params}`);
      if (!response.ok) throw new Error('Error al cargar documentos');

      const data = await response.json();
      if (data.success) {
        setDocumentos(data.documentos);
        setTrimestreInfo({ año: data.año, trimestre: data.trimestre, total: data.total_documentos });
        toast({
          title: '✅ Documentos cargados',
          description: `${data.total_documentos} documentos listos para envío`,
          className: "bg-gradient-to-br from-green-500 to-emerald-600 text-white"
        });
      }
    } catch (error) {
      toast({ title: 'Error', description: 'No se pudieron cargar los documentos', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const toggleExcluir = (id: number) => {
    setExcluidos(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  };



  const testConnection = async () => {
    if (!certificado || !password) return alert('Sube un certificado y escribe la contraseña');
    setTesting(true);
    setResult(null);
    try {
      const response = await fetch('/api/sii/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certificado_pfx: certificado, password })
      });
      setResult(await response.json());
    } catch (error) {
      setResult({ success: false, error: error instanceof Error ? error.message : 'Error desconocido' });
    } finally {
      setTesting(false);
    }
  };

  const enviarDocumentos = async () => {
    const docsFiltrados = documentos.filter(d => !excluidos.has(d.id));
    if (docsFiltrados.length === 0) return toast({ title: 'Sin documentos', description: 'No hay documentos para enviar', variant: 'destructive' });

    const empresaIdParam = searchParams.get('empresa_id');

    // Si NO es DELSOL, requerimos certificado
    if (!hasDelsol && (!certificado || !password)) {
      return toast({ title: 'Error', description: 'Primero valida tu certificado digital para el envío al SII', variant: 'destructive' });
    }

    setSending(true);
    try {
      const resultados = await Promise.all(
        docsFiltrados.map(async (doc) => {
          const empId = doc.empresa_id || empresaIdParam || '115';
          const payload: any = {
            documentoId: doc.id,
            empresaId: empId,
            factura: {
              ...doc,
              certificado_pfx: certificado,
              password,
            }
          };

          const response = await fetch('/api/delsol/enviar-factura', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const data = await response.json();
          return { documento: doc.num_factura, ...data };
        })
      );

      const exitosos = resultados.filter(r => r.success).length;

      const canalUsado = resultados[0]?.canal || (hasDelsol ? 'DELSOL' : 'SII');

      toast({
        title: exitosos === resultados.length ? `✅ Envío completo por ${canalUsado}` : '⚠️ Envío parcial',
        description: `${exitosos}/${resultados.length} facturas enviadas correctamente`,
        className: exitosos === resultados.length ? "bg-gradient-to-br from-green-500 to-emerald-600 text-white" : "bg-gradient-to-br from-orange-500 to-red-600 text-white"
      });

      // Recargar lista tras envío
      const año = searchParams.get('año');
      const trimestre = searchParams.get('trimestre');
      if (año && trimestre) cargarDocumentos(año, trimestre, empresaIdParam);
    } catch (error) {
      toast({ title: 'Error', description: 'Error al enviar documentos', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const docsAEnviar = documentos.filter(d => !excluidos.has(d.id));

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-indigo-50 dark:from-gray-950 dark:via-gray-900 dark:to-indigo-950">
      <div className="container max-w-6xl mx-auto p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6">
        <PageHeader
          title="Gestor SII (AEAT - Hacienda)"
          icon={Send}
          description="Modulo exclusivo para Suministro Inmediato de Información con la Agencia Tributaria"
          hideSidebarTrigger
        >
          <Button onClick={() => router.push('/trimestres')} variant="outline" size="sm" className="group">
            <ArrowLeft className="h-4 w-4 mr-2 group-hover:-translate-x-1 transition-transform" />
            <span>Volver</span>
          </Button>
        </PageHeader>

        {/* Panel de Datos Fiscales del Usuario y Empresa */}
        {(userInfo || companyInfo) && (
          <Card className="animate-in fade-in bg-gradient-to-r from-slate-900 to-indigo-950 text-white border-violet-500/30">
            <CardHeader className="p-4 sm:p-6 pb-2">
              <CardTitle className="text-lg sm:text-xl flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <ShieldCheck className="h-6 w-6 text-violet-400" />
                  <span>Información Fiscal de Usuario & Empresa</span>
                </span>
                <span className="text-xs px-2.5 py-1 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30">
                  Entorno: AEAT Pruebas
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs sm:text-sm">
                <div>
                  <p className="text-gray-400 font-medium">👤 Usuario</p>
                  <p className="font-bold text-white text-base">{userInfo?.nombre || 'Cargando...'}</p>
                  <p className="text-gray-300">{userInfo?.email || ''}</p>
                </div>
                <div>
                  <p className="text-gray-400 font-medium">🏢 Empresa Seleccionada</p>
                  <p className="font-bold text-white text-base">{companyInfo?.nombre || 'Todas las Empresas'}</p>
                  {companyInfo?.cif && <p className="text-gray-300">NIF/CIF: {companyInfo.cif}</p>}
                </div>
                <div>
                  <p className="text-gray-400 font-medium">📊 Estado Documentación SII</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-amber-400 font-bold text-sm">⏳ {siiStats?.pendientes ?? 0} Pendientes</span>
                    <span className="text-emerald-400 font-bold text-sm">✅ {siiStats?.enviados ?? 0} Presentados</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Informar si DELSOL está también disponible */}
        {hasDelsol && (
          <Card className="animate-in fade-in border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20">
            <CardContent className="p-3 sm:p-4 flex items-center justify-between text-xs sm:text-sm text-emerald-800 dark:text-emerald-300">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Integración con Software DELSOL activa (Cliente: <strong>{delsolInfo?.clienteCode}</strong>, BD: <strong>{delsolInfo?.baseDatos}</strong>). Puedes usar DELSOL o probar la conexión SII directamente abajo.</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Panel de Certificado Digital y Emulación SII (SIEMPRE DISPONIBLE) */}
        <Card className="animate-in fade-in">
          <CardHeader className="bg-gradient-to-r from-violet-50 to-indigo-50 dark:from-violet-950 dark:to-indigo-950 border-b p-4 sm:p-6">
            <CardTitle className="text-lg sm:text-xl flex items-center gap-2">
              <span className="text-2xl">🧪</span>
              <span className="bg-gradient-to-r from-violet-700 to-indigo-700 bg-clip-text text-transparent">Certificado Digital y Conexión SII (AEAT)</span>
            </CardTitle>
            <CardDescription>Carga tu certificado digital (.p12 / .pfx) para probar la conexión mTLS y emular respuestas de Hacienda</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 sm:space-y-6 pt-4 sm:pt-6 p-4 sm:p-6">
            <CertificateUpload onFileChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                  const base64 = event.target?.result?.toString().split(',')[1];
                  if (base64) setCertificado(base64);
                };
                reader.readAsDataURL(file);
              }
            }} certificado={certificado} password={password} onPasswordChange={setPassword} />

            <Button onClick={testConnection} disabled={testing || !certificado || !password} className="w-full py-4 sm:py-6 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700">
              {testing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Probando conexión con SII...</> : <><Upload className="mr-2 h-4 w-4" />Probar Conexión AEAT (Emulador SII)</>}
            </Button>

            {result && (
              <Alert variant={result.success ? 'default' : 'destructive'} className="border-2">
                {result.success ? <CheckCircle className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
                <AlertDescription>
                  <div className="space-y-1">
                    <p className="font-bold">{result.success ? '✅ Conexión exitosa con el SII' : '❌ Error de Conexión'}</p>
                    <p><strong>Entorno:</strong> {result.entorno}</p>
                      <p>{result.mensaje}</p>
                    </div>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

        {trimestreInfo && (
          <Card className="animate-in fade-in border-2 border-violet-300 dark:border-violet-700">
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-6 w-6" />
                T{trimestreInfo.trimestre} {trimestreInfo.año}
              </CardTitle>
              <CardDescription>
                {docsAEnviar.length} de {documentos.length} documentos para enviar
                {excluidos.size > 0 && ` • ${excluidos.size} excluidos`}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4 sm:pt-6 p-4 sm:p-6">
              {loading ? (
                <div className="flex items-center justify-center p-12">
                  <Loader2 className="h-12 w-12 animate-spin text-violet-600" />
                </div>
              ) : documentos.length > 0 ? (
                <>
                  <div className="space-y-3 max-h-96 overflow-y-auto mb-6">
                    {documentos.map((doc) => <DocumentCard key={doc.id} doc={doc} excluido={excluidos.has(doc.id)} onToggle={() => toggleExcluir(doc.id)} />)}
                  </div>



                  <Button onClick={enviarDocumentos} disabled={sending || docsAEnviar.length === 0} size="lg" className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-bold py-6">
                    {sending ? (
                      <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Enviando {docsAEnviar.length} facturas...</>
                    ) : (
                      <><Send className="mr-2 h-5 w-5" />{hasDelsol ? `Enviar ${docsAEnviar.length} facturas a Software DELSOL` : `Enviar ${docsAEnviar.length} facturas al SII`}</>
                    )}
                  </Button>
                </>
              ) : (
                <Alert><AlertDescription>No hay documentos en este trimestre</AlertDescription></Alert>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}