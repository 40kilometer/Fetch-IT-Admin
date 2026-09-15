// One-off script to create (or promote) an admin account.
// Run with:  node scripts/create-admin.js you@example.com "a strong password" "Your Name"
//
// Uses the exact same password-hashing format as the rest of Fetch-It
// (Node's built-in scrypt), so this account can log in normally.

require("dotenv").config();
const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");

function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(plain, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

async function main() {
  const [, , email, password, name] = process.argv;
  if (!email || !password) {
    console.error('Usage: node scripts/create-admin.js you@example.com "password" "Your Name"');
    process.exit(1);
  }

  const db = new PrismaClient();
  const passwordHash = hashPassword(password);

  const user = await db.user.upsert({
    where: { email: email.toLowerCase() },
    update: { role: "ADMIN", passwordHash },
    create: {
      email: email.toLowerCase(),
      name: name || "Admin",
      passwordHash,
      role: "ADMIN",
    },
  });

  console.log(`✔ Admin account ready: ${user.email} (id: ${user.id})`);
  await db.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
