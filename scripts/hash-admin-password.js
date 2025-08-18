
const bcrypt = require('bcrypt');

const password = 'admin';
const saltRounds = 10;

async function hashAdminPassword() {
  try {
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    console.log('--- Admin Password Hash ---');
    console.log('Copy this hash and update the password field for "admin@example.com" in your database:');
    console.log(hashedPassword);
    console.log('---------------------------');
  } catch (error) {
    console.error('Error hashing password:', error);
  }
}

hashAdminPassword();
