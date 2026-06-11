import '../src/lib/prisma'; // This loads the polyfill
import { NextResponse } from 'next/server';

async function main() {
  try {
    const data = { id: 10n };
    console.log(JSON.stringify(data));
  } catch (err: any) {
    console.log("Stringify error:", err.message);
  }
}
main();
