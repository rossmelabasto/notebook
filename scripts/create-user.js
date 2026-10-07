#!/usr/bin/env node
// Uso: node scripts/create-user.js <usuario> <password> [admin]
// Fallback CLI; normalmente los usuarios se crean desde la UI (admin).
import { db } from '../lib/db.js';
import { hashPassword, USERNAME_RE, isValidPassword } from '../lib/auth.js';

const [, , username, password, adminFlag] = process.argv;

if (!username || !password) {
  console.error('Uso: node scripts/create-user.js <usuario> <password> [admin]');
  process.exit(1);
}
if (!USERNAME_RE.test(username)) {
  console.error('Usuario inválido (3-32 chars: letras, números, . _ -)');
  process.exit(1);
}
if (!isValidPassword(password)) {
  console.error('Contraseña inválida (mínimo 8 caracteres)');
  process.exit(1);
}

try {
  const info = db
    .prepare(
      'INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, ?)'
    )
    .run(username.trim(), hashPassword(password), adminFlag === 'admin' ? 1 : 0);
  console.log(`Usuario creado: ${username} (id ${Number(info.lastInsertRowid)})`);
} catch (err) {
  if (String(err.message).includes('UNIQUE')) {
    console.error('Ese usuario ya existe');
    process.exit(1);
  }
  throw err;
}
