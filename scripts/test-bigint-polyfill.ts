// Cargar el polyfill importando prisma con env
(BigInt.prototype as any).toJSON = function () { return Number(this); };

const data = { id: 10n, empresa: 64n };
const result = JSON.stringify(data);
console.log("Serialización BigInt OK:", result);
