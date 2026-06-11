import { getDocuments } from '../src/services/document-service';

async function main() {
  try {
    const docs = await getDocuments([64]);
    console.log("Documents fetched:", docs.length);
    console.log(docs.slice(0, 2)); // Print first two
  } catch (err) {
    console.error("Error:", err);
  }
}

main().finally(() => process.exit(0));
