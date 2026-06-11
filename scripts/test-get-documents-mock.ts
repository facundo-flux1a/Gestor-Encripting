import { getDocuments } from '../src/services/document-service';
import * as userService from '../src/services/user-service';

// Mock getCurrentUser
(userService as any).getCurrentUser = async () => ({ id: 6, email: 'test@test.com' });

async function main() {
  const docs = await getDocuments([64]);
  console.log("getDocuments length:", docs.length);
}
main().finally(() => process.exit(0));
