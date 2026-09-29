const bcrypt = require('bcryptjs');

const plain = process.argv[2];
if (!plain) {
  console.log('Gunakan: node scripts/hashPassword.js "password"');
  process.exit(1);
}

bcrypt.hash(plain, 10).then((hash) => {
  console.log('Password hash:');
  console.log(hash);
  console.log('\nJalankan SQL :');
  console.log(`UPDATE users SET password_hash = '${hash}' WHERE username = 'owner';`);
});