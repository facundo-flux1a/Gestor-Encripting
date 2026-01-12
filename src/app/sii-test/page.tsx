// src/app/sii-test/page.tsx

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle, XCircle, Upload, Send } from 'lucide-react';

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

interface SendResult {
  success: boolean;
  mensaje?: string;
  error?: string;
  respuestaAEAT?: any;
  estadoEnvio?: string;
}

export default function SIITestPage() {
  const [testing, setTesting] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [sendResult, setSendResult] = useState<SendResult | null>(null);
  const [certificado, setCertificado] = useState<string>('');
  const [password, setPassword] = useState<string>('');

  // Datos de factura de prueba (valores por defecto editables)
  const [facturaTest, setFacturaTest] = useState({
    nif_empresa: 'B12345678',
    num_factura: 'TEST-001',
    fecha_factura: new Date().toISOString().split('T')[0],
    tipo_factura: 'F1',
    clave_regimen: '01',
    descripcion: 'Factura de prueba SII',
    base_imponible: '1000.00',
    tipo_iva: '21',
    cuota_iva: '210.00',
    nif_cliente: 'B87654321',
    nombre_cliente: 'Cliente Prueba SL',
    pais_cliente: 'ES'
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result?.toString().split(',')[1];
      if (base64) {
        setCertificado(base64);
      }
    };
    reader.readAsDataURL(file);
  };

  const testConnection = async () => {
    if (!certificado || !password) {
      alert('Sube un certificado y escribe la contraseña');
      return;
    }

    setTesting(true);
    setResult(null);

    try {
      const response = await fetch('/api/sii/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          certificado_pfx: certificado,
          password: password
        })
      });

      const data = await response.json();
      setResult(data);

    } catch (error) {
      setResult({
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido'
      });
    } finally {
      setTesting(false);
    }
  };

  const enviarFacturaPrueba = async () => {
    if (!certificado || !password) {
      alert('Primero debes probar la conexión');
      return;
    }

    setSending(true);
    setSendResult(null);

    try {
      const response = await fetch('/api/sii/enviar-factura', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          certificado_pfx: certificado,
          password: password,
          factura: facturaTest
        })
      });

      const data = await response.json();
      setSendResult(data);

    } catch (error) {
      setSendResult({
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido'
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="container max-w-6xl mx-auto p-6 space-y-6">
      
      {/* CARD 1: Test de Conexión */}
      <Card>
        <CardHeader>
          <CardTitle>🧪 Test de Conexión SII - Hacienda</CardTitle>
          <CardDescription>
            Prueba la conexión con los servicios de la Agencia Tributaria
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          
          {/* Upload certificado */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Certificado Digital (.pfx o .p12)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="file"
                accept=".pfx,.p12"
                onChange={handleFileUpload}
                className="block w-full text-sm"
              />
              {certificado && <CheckCircle className="h-5 w-5 text-green-500" />}
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Contraseña del certificado
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Escribe la contraseña"
              className="w-full px-3 py-2 border rounded"
            />
          </div>

          {/* Botón test */}
          <Button
            onClick={testConnection}
            disabled={testing || !certificado || !password}
            className="w-full"
          >
            {testing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Probando conexión...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Probar Conexión
              </>
            )}
          </Button>

          {/* Resultado */}
          {result && (
            <div className="space-y-4">
              <Alert variant={result.success ? 'default' : 'destructive'}>
                {result.success ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                <AlertDescription>
                  <div className="space-y-2">
                    <p className="font-semibold">
                      {result.success ? '✅ Conexión exitosa' : '❌ Error de conexión'}
                    </p>
                    <p className="text-sm">
                      <strong>Entorno:</strong> {result.entorno?.toUpperCase()}
                    </p>
                    <p className="text-sm">{result.mensaje}</p>
                    {result.error && (
                      <p className="text-xs text-red-600 mt-2">
                        {result.error}
                      </p>
                    )}
                  </div>
                </AlertDescription>
              </Alert>

              {/* Detalles de la conexión */}
              {result.success && result.details && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">📋 Detalles de la Conexión</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    
                    {/* Endpoint */}
                    <div>
                      <p className="text-sm font-semibold mb-1">🔌 Endpoint:</p>
                      <p className="text-xs bg-gray-100 text-gray-900 p-2 rounded font-mono break-all">
                        {result.details.endpoint}
                      </p>
                    </div>

                    {/* Servicios */}
                    <div>
                      <p className="text-sm font-semibold mb-1">📦 Servicios disponibles:</p>
                      <p className="text-xs bg-gray-100 text-gray-900 p-2 rounded">
                        {result.details.services.join(', ')}
                      </p>
                    </div>

                    {/* Operaciones */}
                    <div>
                      <p className="text-sm font-semibold mb-2">⚙️ Operaciones ({result.details.operations.length}):</p>
                      <div className="grid grid-cols-2 gap-2">
                        {result.details.operations.map((op, idx) => (
                          <div key={idx} className="text-xs bg-blue-50 text-blue-900 p-2 rounded">
                            {op}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Certificado */}
                    <div className="border-t pt-4">
                      <p className="text-sm font-semibold mb-2">🔐 Información del Certificado:</p>
                      <div className="space-y-2 text-xs">
                        <div className="bg-gray-50 p-2 rounded">
                          <p className="font-semibold text-gray-700">Subject:</p>
                          <p className="font-mono text-gray-900">{result.details.certificate.subject}</p>
                        </div>
                        <div className="bg-gray-50 p-2 rounded">
                          <p className="font-semibold text-gray-700">Emisor:</p>
                          <p className="font-mono text-gray-900">{result.details.certificate.issuer}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-green-50 p-2 rounded">
                            <p className="font-semibold text-gray-700">Válido desde:</p>
                            <p className="text-gray-900">{new Date(result.details.certificate.validFrom).toLocaleDateString('es-ES')}</p>
                          </div>
                          <div className="bg-green-50 p-2 rounded">
                            <p className="font-semibold text-gray-700">Válido hasta:</p>
                            <p className="text-gray-900">{new Date(result.details.certificate.validTo).toLocaleDateString('es-ES')}</p>
                          </div>
                        </div>
                        <div className="bg-gray-50 p-2 rounded">
                          <p className="font-semibold text-gray-700">Serial Number:</p>
                          <p className="font-mono break-all text-gray-900">{result.details.certificate.serialNumber}</p>
                        </div>
                      </div>
                    </div>

                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Info */}
          <Alert>
            <AlertDescription className="text-xs space-y-1">
              <p><strong>Entorno actual:</strong> {process.env.NEXT_PUBLIC_SII_ENVIRONMENT || 'PRUEBAS'}</p>
              <p>En pruebas puedes usar cualquier certificado válido (.pfx)</p>
              <p>Para producción necesitarás un certificado real de la FNMT</p>
            </AlertDescription>
          </Alert>

        </CardContent>
      </Card>

      {/* CARD 2: Enviar Factura de Prueba */}
      {result?.success && (
        <Card className="border-2 border-blue-200">
          <CardHeader>
            <CardTitle>📄 Enviar Factura de Prueba</CardTitle>
            <CardDescription>
              Configura los datos y envía una factura al SII (entorno de pruebas)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            
            {/* Grid de campos de factura */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">NIF Empresa Emisora</label>
                <input
                  type="text"
                  value={facturaTest.nif_empresa}
                  onChange={(e) => setFacturaTest({...facturaTest, nif_empresa: e.target.value})}
                  className="w-full px-3 py-2 border rounded text-sm"
                  placeholder="B12345678"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Número Factura</label>
                <input
                  type="text"
                  value={facturaTest.num_factura}
                  onChange={(e) => setFacturaTest({...facturaTest, num_factura: e.target.value})}
                  className="w-full px-3 py-2 border rounded text-sm"
                  placeholder="TEST-001"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Fecha Factura</label>
                <input
                  type="date"
                  value={facturaTest.fecha_factura}
                  onChange={(e) => setFacturaTest({...facturaTest, fecha_factura: e.target.value})}
                  className="w-full px-3 py-2 border rounded text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Tipo Factura</label>
                <select
                  value={facturaTest.tipo_factura}
                  onChange={(e) => setFacturaTest({...facturaTest, tipo_factura: e.target.value})}
                  className="w-full px-3 py-2 border rounded text-sm"
                >
                  <option value="F1">F1 - Factura</option>
                  <option value="F2">F2 - Factura Simplificada</option>
                  <option value="R1">R1 - Factura Rectificativa</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Clave Régimen</label>
                <select
                  value={facturaTest.clave_regimen}
                  onChange={(e) => setFacturaTest({...facturaTest, clave_regimen: e.target.value})}
                  className="w-full px-3 py-2 border rounded text-sm"
                >
                  <option value="01">01 - General</option>
                  <option value="02">02 - Exportación</option>
                  <option value="03">03 - Operaciones UE</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Descripción</label>
                <input
                  type="text"
                  value={facturaTest.descripcion}
                  onChange={(e) => setFacturaTest({...facturaTest, descripcion: e.target.value})}
                  className="w-full px-3 py-2 border rounded text-sm"
                  placeholder="Servicios de consultoría"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Base Imponible (€)</label>
                <input
                  type="number"
                  step="0.01"
                  value={facturaTest.base_imponible}
                  onChange={(e) => setFacturaTest({...facturaTest, base_imponible: e.target.value})}
                  className="w-full px-3 py-2 border rounded text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Tipo IVA (%)</label>
                <select
                  value={facturaTest.tipo_iva}
                  onChange={(e) => {
                    const iva = e.target.value;
                    const base = parseFloat(facturaTest.base_imponible);
                    const cuota = (base * parseFloat(iva) / 100).toFixed(2);
                    setFacturaTest({...facturaTest, tipo_iva: iva, cuota_iva: cuota});
                  }}
                  className="w-full px-3 py-2 border rounded text-sm"
                >
                  <option value="21">21%</option>
                  <option value="10">10%</option>
                  <option value="4">4%</option>
                  <option value="0">0%</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Cuota IVA (€)</label>
                <input
                  type="number"
                  step="0.01"
                  value={facturaTest.cuota_iva}
                  onChange={(e) => setFacturaTest({...facturaTest, cuota_iva: e.target.value})}
                  className="w-full px-3 py-2 border rounded text-sm"
                  readOnly
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">NIF Cliente</label>
                <input
                  type="text"
                  value={facturaTest.nif_cliente}
                  onChange={(e) => setFacturaTest({...facturaTest, nif_cliente: e.target.value})}
                  className="w-full px-3 py-2 border rounded text-sm"
                  placeholder="B87654321"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Nombre Cliente</label>
                <input
                  type="text"
                  value={facturaTest.nombre_cliente}
                  onChange={(e) => setFacturaTest({...facturaTest, nombre_cliente: e.target.value})}
                  className="w-full px-3 py-2 border rounded text-sm"
                  placeholder="Cliente SL"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">País Cliente</label>
                <input
                  type="text"
                  value={facturaTest.pais_cliente}
                  onChange={(e) => setFacturaTest({...facturaTest, pais_cliente: e.target.value})}
                  className="w-full px-3 py-2 border rounded text-sm"
                  placeholder="ES"
                  maxLength={2}
                />
              </div>
            </div>

            {/* Resumen */}
            <div className="bg-blue-50 p-4 rounded">
              <p className="font-semibold text-sm mb-2">📊 Resumen:</p>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Base:</span>
                  <span className="ml-2 font-semibold">{facturaTest.base_imponible}€</span>
                </div>
                <div>
                  <span className="text-gray-600">IVA ({facturaTest.tipo_iva}%):</span>
                  <span className="ml-2 font-semibold">{facturaTest.cuota_iva}€</span>
                </div>
                <div>
                  <span className="text-gray-600">Total:</span>
                  <span className="ml-2 font-semibold text-lg">
                    {(parseFloat(facturaTest.base_imponible) + parseFloat(facturaTest.cuota_iva)).toFixed(2)}€
                  </span>
                </div>
              </div>
            </div>

            {/* Botón enviar */}
            <Button
              onClick={enviarFacturaPrueba}
              disabled={sending}
              className="w-full"
              variant="default"
            >
              {sending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enviando factura...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Enviar Factura al SII
                </>
              )}
            </Button>

            {/* Resultado envío */}
            {sendResult && (
              <Alert variant={sendResult.success ? 'default' : 'destructive'}>
                {sendResult.success ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                <AlertDescription>
                  <div className="space-y-2">
                    <p className="font-semibold">
                      {sendResult.success ? '✅ Factura enviada' : '❌ Error al enviar'}
                    </p>
                    <p className="text-sm">{sendResult.mensaje}</p>
                    {sendResult.error && (
                      <p className="text-xs text-red-600">{sendResult.error}</p>
                    )}
                    {sendResult.respuestaAEAT && (
                      <div className="mt-2">
                        <p className="text-xs font-semibold mb-1">Respuesta AEAT:</p>
                        <pre className="text-xs bg-gray-900 text-green-400 p-2 rounded overflow-x-auto">
                          {JSON.stringify(sendResult.respuestaAEAT, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            <Alert>
              <AlertDescription className="text-xs">
                <p className="font-semibold mb-1">⚠️ Importante:</p>
                <p>Estás en entorno de PRUEBAS. Esta factura no afecta datos reales.</p>
                <p className="mt-1">Los datos son ficticios y se pueden editar para probar diferentes escenarios.</p>
              </AlertDescription>
            </Alert>

          </CardContent>
        </Card>
      )}

    </div>
  );
}