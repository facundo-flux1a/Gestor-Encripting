const mysql = require('mysql2/promise');
require('dotenv').config();

async function test() {
  const db = await mysql.createConnection({
    uri: process.env.DATABASE_URL
  });

  try {
    const [res] = await db.query(`SELECT JSON_CONTAINS('[6, 58]', CAST(58 AS CHAR), '$') as res1, JSON_CONTAINS('[6, 58]', CAST(58 AS JSON), '$') as res2`);
    console.log("JSON_CONTAINS check:", res);

    const [res3] = await db.query(`
      SELECT (
        SELECT COALESCE(JSON_ARRAYAGG(val), JSON_ARRAY())
        FROM JSON_TABLE('[6, 58]', '$[*]' COLUMNS(val INT PATH '$')) j
        WHERE val != 58
      ) as updated
    `);
    console.log("JSON_TABLE check:", res3);
  } catch (e) {
    console.error(e);
  } finally {
    await db.end();
  }
}
test();
