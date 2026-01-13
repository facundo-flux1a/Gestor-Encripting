// src/app/sii-test/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle, XCircle, Upload, Send, FileText, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// ============================================================
// INTERFACES
// ============================================================

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
}

// ============================================================
// COMPONENTES
// ============================================================

const PageHeader = ({ onBack }: { onBack: () => void }) => (
  <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-700">
    <Button
      onClick={onBack}
      variant="outline"
      size="lg"
      className="group hover:bg-violet-50 dark:hover:bg-violet-950 hover:border-violet-300 transition-all duration-300 hover:shadow-lg hover:scale-105"
    >
      <ArrowLeft className="h-5 w-5 mr-2 group-hover:-translate-x-1 transition-transform duration-300" />
      <span>Volver</span>
    </Button>
    <div className="text-center">
      <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold bg-gradient-to-r from-violet-600 to-indigo-600 dark:from-violet-400 dark:to-indigo-400 bg-clip-text text-transparent">
        Envío al SII
      </h1>
      <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mt-2">
        Sistema de Suministro Inmediato de Información
      </p>
    </div>
  </div>
);

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
      <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">
        📜 Certificado Digital
      </label>
      <div className="flex items-center gap-2">
        <input
          type="file"
          accept=".pfx,.p12"
          onChange={onFileChange}
          className="block w-full text-xs sm:text-sm file:mr-2 sm:file:mr-4 file:py-2 sm:file:py-3 file:px-4 sm:file:px-6 file:rounded-full file:border-0 file:text-xs sm:file:text-sm file:font-semibold file:bg-violet-100 file:text-violet-700 hover:file:bg-violet-200 dark:file:bg-violet-900 dark:file:text-violet-300 file:transition-all file:duration-300 cursor-pointer"
        />
        {certificado && <CheckCircle className="h-5 w-5 sm:h-6 sm:w-6 text-green-500 animate-in zoom-in duration-300 shrink-0" />}
      </div>
    </div>

    <div className="group">
      <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">
        🔐 Contraseña
      </label>
      <input
        type="password"
        value={password}
        onChange={(e) => onPasswordChange(e.target.value)}
        placeholder="Escribe la contraseña"
        className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base border-2 border-gray-200 dark:border-gray-700 rounded-lg focus:border-violet-400 dark:focus:border-violet-600 focus:ring-2 sm:focus:ring-4 focus:ring-violet-100 dark:focus:ring-violet-900 transition-all duration-300 bg-white dark:bg-gray-800"
      />
    </div>
  </>
);

const ConnectionDetails = ({ details }: { details: TestResult['details'] }) => {
  if (!details) return null;

  return (
    <Card className="border-2 border-green-200 dark:border-green-800 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950 p-4 sm:p-6">
        <CardTitle className="text-base sm:text-lg flex items-center gap-2">
          <span className="text-xl sm:text-2xl">📋</span>
          Detalles de la Conexión
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 sm:space-y-4 pt-4 sm:pt-6 p-4 sm:p-6">
        <InfoSection title="🔌 Endpoint" className="bg-gray-100 dark:bg-gray-900">
          <p className="text-xs font-mono break-all text-gray-900 dark:text-gray-100">{details.endpoint}</p>
        </InfoSection>

        <InfoSection title="📦 Servicios" className="bg-blue-50 dark:bg-blue-950">
          <p className="text-xs text-blue-900 dark:text-blue-100">{details.services.join(', ')}</p>
        </InfoSection>

        <InfoSection title={`⚙️ Operaciones (${details.operations.length})`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {details.operations.map((op, idx) => (
              <div key={idx} className="text-xs bg-violet-50 dark:bg-violet-950 text-violet-900 dark:text-violet-100 p-2 rounded hover:bg-violet-100 dark:hover:bg-violet-900 transition-all duration-300">
                {op}
              </div>
            ))}
          </div>
        </InfoSection>

        <div className="border-t-2 pt-3 sm:pt-4">
          <p className="text-sm font-semibold mb-2 flex items-center gap-2">
            <span className="text-lg sm:text-xl">🔐</span> Certificado
          </p>
          <div className="space-y-2 text-xs">
            <InfoBlock label="Subject" value={details.certificate.subject} />
            <InfoBlock label="Emisor" value={details.certificate.issuer} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <InfoBlock label="Válido desde" value={new Date(details.certificate.validFrom).toLocaleDateString('es-ES')} className="bg-green-50 dark:bg-green-950" />
              <InfoBlock label="Válido hasta" value={new Date(details.certificate.validTo).toLocaleDateString('es-ES')} className="bg-green-50 dark:bg-green-950" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const InfoSection = ({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) => (
  <div className="group hover:bg-gray-50 dark:hover:bg-gray-800 p-2 sm:p-3 rounded-lg transition-all duration-300">
    <p className="text-xs sm:text-sm font-semibold mb-2">{title}</p>
    <div className={`p-2 sm:p-3 rounded ${className}`}>{children}</div>
  </div>
);

const InfoBlock = ({ label, value, className = '' }: { label: string; value: string; className?: string }) => (
  <div className={`p-2 sm:p-3 rounded hover:opacity-80 transition-all duration-300 ${className || 'bg-gray-50 dark:bg-gray-800'}`}>
    <p className="font-semibold text-gray-700 dark:text-gray-300 mb-1">{label}:</p>
    <p className="font-mono text-gray-900 dark:text-gray-100 break-all">{value}</p>
  </div>
);

const DocumentCard = ({ doc }: { doc: DocumentoSII }) => (
  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 sm:p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm border-2 border-violet-200 dark:border-violet-700 hover:border-violet-400 dark:hover:border-violet-500 hover:shadow-lg transition-all duration-300 hover:scale-[1.01] sm:hover:scale-[1.02] group gap-2 sm:gap-0">
    <div className="flex-1 w-full sm:w-auto">
      <p className="font-bold text-sm sm:text-base text-gray-900 dark:text-gray-100 group-hover:text-violet-700 dark:group-hover:text-violet-300 transition-colors duration-300">
        {doc.num_factura}
      </p>
      <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 mt-1">
        📅 {doc.fecha_factura} • {doc.descripcion}
      </p>
      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
        {doc.nombre_empresa} → {doc.nombre_cliente || 'Cliente'}
      </p>
    </div>
    <div className="text-left sm:text-right w-full sm:w-auto sm:ml-4">
      <p className="font-bold text-sm sm:text-base text-violet-700 dark:text-violet-300">
        {parseFloat(doc.base_imponible).toFixed(2)}€
      </p>
      <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
        IVA: {parseFloat(doc.cuota_iva).toFixed(2)}€
      </p>
    </div>
  </div>
);

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================

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
  const [trimestreInfo, setTrimestreInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const año = searchParams.get('año');
    const trimestre = searchParams.get('trimestre');
    const empresaId = searchParams.get('empresa_id');

    if (año && trimestre) {
      cargarDocumentos(año, trimestre, empresaId);
    }
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
        toast({
          title: '✅ Documentos cargados',
          description: `${data.total_documentos} documentos listos`,
          className: "bg-gradient-to-br from-green-500 to-emerald-600 text-white",
        });
      }
    } catch (error) {
      toast({ title: 'Error', description: 'No se pudieron cargar los documentos', variant: 'destructive' });
    } finally {
      setLoading(false);
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
    if (!certificado || !password) return alert('Primero prueba la conexión');
    if (documentos.length === 0) return alert('No hay documentos');

    setSending(true);
    try {
      const resultados = await Promise.all(
        documentos.map(async (doc) => {
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
      toast({
        title: exitosos === resultados.length ? '✅ Envío completo' : '⚠️ Envío parcial',
        description: `${exitosos}/${resultados.length} facturas enviadas`,
        variant: exitosos === resultados.length ? 'default' : 'destructive',
      });
    } catch (error) {
      toast({ title: 'Error', description: 'Error al enviar', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-indigo-50 dark:from-gray-950 dark:via-gray-900 dark:to-indigo-950">
      <div className="container max-w-6xl mx-auto p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6">
        
        <PageHeader onBack={() => router.push('/trimestres')} />
      
        {/* Test de Conexión */}
        <Card className="animate-in fade-in slide-in-from-bottom-4 duration-700 hover:shadow-2xl transition-all duration-500 border-2 hover:border-violet-200 dark:hover:border-violet-800">
          <CardHeader className="bg-gradient-to-r from-violet-50 to-indigo-50 dark:from-violet-950 dark:to-indigo-950 border-b p-4 sm:p-6">
            <CardTitle className="text-lg sm:text-xl lg:text-2xl flex items-center gap-2 sm:gap-3">
              <span className="text-2xl sm:text-3xl animate-pulse">🧪</span>
              <span className="bg-gradient-to-r from-violet-700 to-indigo-700 dark:from-violet-400 dark:to-indigo-400 bg-clip-text text-transparent">
                Conexión con AEAT
              </span>
            </CardTitle>
            <CardDescription className="text-sm sm:text-base mt-1 sm:mt-2">
              Valida tu certificado digital
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 sm:space-y-6 pt-4 sm:pt-6 p-4 sm:p-6">
            
            <CertificateUpload 
              onFileChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = (event) => {
                    const base64 = event.target?.result?.toString().split(',')[1];
                    if (base64) setCertificado(base64);
                  };
                  reader.readAsDataURL(file);
                }
              }}
              certificado={certificado}
              password={password}
              onPasswordChange={setPassword}
            />

            <Button
              onClick={testConnection}
              disabled={testing || !certificado || !password}
              className="w-full py-4 sm:py-6 text-sm sm:text-base font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 transition-all duration-300 hover:shadow-lg hover:scale-105 disabled:opacity-50"
            >
              {testing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 sm:h-5 sm:w-5 animate-spin" />
                  Probando...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
                  Probar Conexión
                </>
              )}
            </Button>

            {result && (
              <div className="space-y-3 sm:space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
                <Alert variant={result.success ? 'default' : 'destructive'} className="border-2">
                  {result.success ? <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5" /> : <XCircle className="h-4 w-4 sm:h-5 sm:w-5" />}
                  <AlertDescription>
                    <div className="space-y-1 sm:space-y-2">
                      <p className="font-bold text-sm sm:text-base">{result.success ? '✅ Conexión exitosa' : '❌ Error'}</p>
                      <p className="text-xs sm:text-sm"><strong>Entorno:</strong> {result.entorno}</p>
                      <p className="text-xs sm:text-sm">{result.mensaje}</p>
                      {result.error && <p className="text-xs text-red-600 dark:text-red-400">{result.error}</p>}
                    </div>
                  </AlertDescription>
                </Alert>

                <ConnectionDetails details={result.details} />
              </div>
            )}

            <Alert className="border-2 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950">
              <AlertDescription className="text-xs space-y-1 text-gray-900 dark:text-gray-100">
                <p className="font-semibold">ℹ️ Información</p>
                <p>Entorno: <strong>{process.env.NEXT_PUBLIC_SII_ENVIRONMENT || 'PRUEBAS'}</strong></p>
              </AlertDescription>
            </Alert>

          </CardContent>
        </Card>

        {/* Documentos del Trimestre */}
        {trimestreInfo && (
          <Card className="animate-in fade-in slide-in-from-bottom-6 duration-700 border-2 border-violet-300 dark:border-violet-700 hover:shadow-2xl transition-all duration-500 bg-gradient-to-br from-violet-50 to-indigo-100 dark:from-violet-950 dark:to-indigo-950">
            <CardHeader className="border-b border-violet-200 dark:border-violet-800 p-4 sm:p-6">
              <CardTitle className="flex items-center gap-2 sm:gap-3 text-violet-900 dark:text-violet-100 text-lg sm:text-xl lg:text-2xl">
                <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-violet-600 dark:text-violet-400 animate-pulse" />
                T{trimestreInfo.trimestre} {trimestreInfo.año}
              </CardTitle>
              <CardDescription className="text-violet-700 dark:text-violet-300 text-sm sm:text-base mt-1 sm:mt-2">
                {documentos.length} documentos listos
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4 sm:pt-6 p-4 sm:p-6">
              {loading ? (
                <div className="flex items-center justify-center p-8 sm:p-12">
                  <Loader2 className="h-8 w-8 sm:h-12 sm:w-12 animate-spin text-violet-600 dark:text-violet-400" />
                  <span className="ml-3 sm:ml-4 text-base sm:text-lg text-violet-900 dark:text-violet-100">Cargando...</span>
                </div>
              ) : documentos.length > 0 ? (
                <>
                  <div className="space-y-2 sm:space-y-3 max-h-80 sm:max-h-96 overflow-y-auto mb-4 sm:mb-6 pr-1 sm:pr-2">
                    {documentos.map((doc, idx) => <DocumentCard key={idx} doc={doc} />)}
                  </div>

                  <Button
                    onClick={enviarDocumentos}
                    disabled={sending || !result?.success}
                    size="lg"
                    className="w-full py-4 sm:py-6 text-sm sm:text-base font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 transition-all duration-300 hover:shadow-lg hover:scale-105 disabled:opacity-50"
                  >
                    {sending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 sm:h-5 sm:w-5 animate-spin" />
                        Enviando {documentos.length} facturas...
                      </>
                    ) : (
                      <>
                        <Send className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
                        Enviar {documentos.length} facturas
                      </>
                    )}
                  </Button>

                  {!result?.success && (
                    <Alert className="mt-3 sm:mt-4 border-2 border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-950">
                      <AlertDescription className="text-xs sm:text-sm text-gray-900 dark:text-gray-100 font-semibold">
                        ⚠️ Primero valida tu certificado
                      </AlertDescription>
                    </Alert>
                  )}
                </>
              ) : (
                <Alert className="border-2">
                  <AlertDescription className="text-gray-900 dark:text-gray-100 text-sm">
                    No hay documentos en este trimestre
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        )}

      </div>
    </div>
  );
}