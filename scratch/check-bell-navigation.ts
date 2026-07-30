// Just testing if the router link will work as intended with special characters
const cif = "B12345678";
const code = "SUPLIDO";
const desc = "Exceso de caras de Matriz electrónica";

const normDesc = desc.toLowerCase().trim().replace(/\s+/g, ' ');
const identifier = code
  ? `${encodeURIComponent(code)}?desc=${encodeURIComponent(normDesc)}`
  : `DESC_${encodeURIComponent(normDesc)}`;
const sep = identifier.includes('?') ? '&' : '?';

console.log(`/proveedores/${encodeURIComponent(cif)}/${identifier}${sep}view=list&tab=products`);
