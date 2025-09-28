
// This script is now deprecated since password hashing is handled by the jose library.
// You can create/update the admin password directly in your database.
// The new `password-service` will hash it on first login if it's in plain text,
// or you can pre-hash it using a secure method if needed.

console.log("This script is deprecated.");
console.log("Please manage passwords directly or let the application handle hashing on login.");
