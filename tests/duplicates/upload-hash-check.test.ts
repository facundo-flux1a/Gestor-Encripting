/**
 * Verifica que el hash check del upload (SQL directo) resuelve rápido.
 * Requiere DATABASE_URL (ej. npm test con --env-file=.env).
 */
const hasDb = !!process.env.DATABASE_URL;

(hasDb ? describe : describe.skip)('upload hash duplicate check (DB)', () => {
  afterAll(async () => {
    const { default: pool } = await import('@/lib/db');
    await pool.end();
  });

  it('resuelve en <2s para empresa 115 (caso user 6)', async () => {
    const { default: pool } = await import('@/lib/db');
    const empresaId = 115;
    const fakeHash = '5d9879b9df672b2521549aabf882b488fc986c8ebde696df74a312641bc82641';
    const started = Date.now();

    const [rows] = await pool.query(
      `SELECT file_hash, numero_documento as file_name, fecha_creacion as uploaded_at 
       FROM documentos 
       WHERE file_hash = ? AND id_de_empresa = ?
       ORDER BY fecha_creacion DESC
       LIMIT 1`,
      [fakeHash, empresaId]
    );

    const elapsed = Date.now() - started;
    expect(Array.isArray(rows)).toBe(true);
    expect(elapsed).toBeLessThan(2000);
  });
});
