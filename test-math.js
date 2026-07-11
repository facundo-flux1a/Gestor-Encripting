const TPM_LIMIT = 30000;
const TOKENS_PER_DOC = 12000;
const maxItems = Math.floor(TPM_LIMIT / TOKENS_PER_DOC);
console.log("Max items per 60s:", maxItems);
console.log("Safe delay:", Math.ceil(62000 / maxItems));
