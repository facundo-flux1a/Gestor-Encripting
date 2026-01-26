'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { MainLayout } from '@/components/layout/main-layout';
import { PageHeader } from '@/components/layout/page-header';
import { Loader2, CheckCircle, XCircle, Upload, Send, FileText, ArrowLeft, MoveRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';

interface TestResult {
  success: boolean;
  entorno?: string;
  mensaje?: string;
  error?: string;
  details?: {
    endpoint: string;
    services: string[];
    operations: string[];
    certificate: {
      subject: string;
      issuer: string;
      validFrom: string;
      validTo: string;
      serialNumber: string;
    };
  };
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
      <label className="block text-sm font-semibold mb-2">📜 Certificado Digital</label>
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
      <p className="font-bold text-violet-700">{parseFloat(doc.base_imponible).toFixed(2)}€</p>
      <p className="text-xs sm:text-sm text-gray-600">IVA: {parseFloat(doc.cuota_iva).toFixed(2)}€</p>
    </div>
  </div>
);

export default function SIIPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();

  const [testing, setTesting] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [certificado, setCertificado] = useState('');
  const [password, setPassword] = useState('');
  const [documentos, setDocumentos] = useState<DocumentoSII[]>([]);
  const [excluidos, setExcluidos] = useState<Set<number>>(new Set());
  const [trimestreInfo, setTrimestreInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const año = searchParams.get('año');
    const trimestre = searchParams.get('trimestre');
    const empresaId = searchParams.get('empresa_id');
    if (año && trimestre) cargarDocumentos(año, trimestre, empresaId);
  }, [searchParams]);

  const cargarDocumentos = async (año: string, trimestre: string, empresaId: string | null) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ año, trimestre });
      if (empresaId && empresaId !== 'all') params.append('empresa_id', empresaId);

      const response = await fetch(`/api/trimestres/documentos-sii?${params}`);
      if (!response.ok) throw new Error('Error al cargar documentos');

      const data = await response.json();
      if (data.success) {
        setDocumentos(data.documentos);
        setTrimestreInfo({ año: data.año, trimestre: data.trimestre, total: data.total_documentos });
        toast({ title: '✅ Documentos cargados', description: `${data.total_documentos} documentos listos`, className: "bg-gradient-to-br from-green-500 to-emerald-600 text-white" });
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

  const moverExcluidosASiguienteTrimestre = async () => {
    if (excluidos.size === 0) return toast({ title: 'Sin documentos', description: 'No hay documentos excluidos', variant: 'destructive' });

    try {
      const promises = Array.from(excluidos).map(async (id) => {
        const response = await fetch('/api/trimestres/mover-siguiente', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ documentoId: id })
        });
        return response.json();
      });

      const results = await Promise.all(promises);
      const exitosos = results.filter(r => r.success).length;

      toast({ title: '✅ Documentos movidos', description: `${exitosos} documentos movidos al siguiente trimestre`, className: "bg-gradient-to-br from-blue-500 to-indigo-600 text-white" });

      const año = searchParams.get('año');
      const trimestre = searchParams.get('trimestre');
      const empresaId = searchParams.get('empresa_id');
      if (año && trimestre) cargarDocumentos(año, trimestre, empresaId);
      setExcluidos(new Set());
    } catch (error) {
      toast({ title: 'Error', description: 'Error al mover documentos', variant: 'destructive' });
    }
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
    if (!certificado || !password) return toast({ title: 'Error', description: 'Primero valida tu certificado', variant: 'destructive' });

    setSending(true);
    try {
      const resultados = await Promise.all(
        docsFiltrados.map(async (doc) => {
          const response = await fetch('/api/sii/enviar-factura', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ certificado_pfx: certificado, password, factura: doc })
          });
          const data = await response.json();
          return { documento: doc.num_factura, ...data };
        })
      );

      const exitosos = resultados.filter(r => r.success).length;
      if (excluidos.size > 0) await moverExcluidosASiguienteTrimestre();

      toast({
        title: exitosos === resultados.length ? '✅ Envío completo' : '⚠️ Envío parcial',
        description: `${exitosos}/${resultados.length} facturas enviadas al SII`,
        className: exitosos === resultados.length ? "bg-gradient-to-br from-green-500 to-emerald-600 text-white" : "bg-gradient-to-br from-orange-500 to-red-600 text-white"
      });
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
          title="Envío al SII"
          icon={Send}
          description="Sistema de Suministro Inmediato de Información"
          hideSidebarTrigger
        >
          <Button onClick={() => router.push('/trimestres')} variant="outline" size="sm" className="group">
            <ArrowLeft className="h-4 w-4 mr-2 group-hover:-translate-x-1 transition-transform" />
            <span>Volver</span>
          </Button>
        </PageHeader>

        <Card className="animate-in fade-in">
          <CardHeader className="bg-gradient-to-r from-violet-50 to-indigo-50 dark:from-violet-950 dark:to-indigo-950 border-b p-4 sm:p-6">
            <CardTitle className="text-lg sm:text-xl flex items-center gap-2">
              <span className="text-2xl">🧪</span>
              <span className="bg-gradient-to-r from-violet-700 to-indigo-700 bg-clip-text text-transparent">Conexión con AEAT</span>
            </CardTitle>
            <CardDescription>Valida tu certificado digital</CardDescription>
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
              {testing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Probando...</> : <><Upload className="mr-2 h-4 w-4" />Probar Conexión</>}
            </Button>

            {result && (
              <Alert variant={result.success ? 'default' : 'destructive'} className="border-2">
                {result.success ? <CheckCircle className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
                <AlertDescription>
                  <div className="space-y-1">
                    <p className="font-bold">{result.success ? '✅ Conexión exitosa' : '❌ Error'}</p>
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

                  {excluidos.size > 0 && (
                    <Alert className="mb-4 bg-gradient-to-r from-violet-100 to-indigo-100 dark:from-violet-950 dark:to-indigo-950 border-2 border-violet-400 dark:border-violet-600">
                      <AlertDescription className="flex items-center justify-between">
                        <span className="font-semibold text-violet-900 dark:text-violet-100">⚠️ {excluidos.size} documentos excluidos se moverán al siguiente trimestre</span>
                        <Button onClick={moverExcluidosASiguienteTrimestre} variant="outline" size="sm" className="border-violet-400 hover:bg-violet-200 dark:hover:bg-violet-900">
                          <MoveRight className="h-4 w-4 mr-2" />Mover ahora
                        </Button>
                      </AlertDescription>
                    </Alert>
                  )}

                  <Button onClick={enviarDocumentos} disabled={sending || docsAEnviar.length === 0} size="lg" className="w-full">
                    {sending ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Enviando {docsAEnviar.length} facturas...</> : <><Send className="mr-2 h-5 w-5" />Enviar {docsAEnviar.length} facturas al SII</>}
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