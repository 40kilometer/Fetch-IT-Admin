// One-off script to create an admin account or update an existing admin password.
// Run with:  node scripts/create-admin.js you@example.com "a strong password" "Your Name"
// Add --replace-existing to replace the other ADMIN accounts atomically.
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

  const normalizedEmail = email.trim().toLowerCase();
  const replaceExisting = process.argv.includes("--replace-existing");
  let removedAdmins = 0;
  const user = await db.$transaction(async tx => {
    const existing = await tx.user.findUnique({ where: { email: normalizedEmail } });
    if (existing && existing.role !== "ADMIN") throw new Error("This email belongs to another account role; use a separate admin email.");
    const account = await tx.user.upsert({ where: { email: normalizedEmail }, update: { ...(name ? { name } : {}), isBanned: false, banReason: null, bannedAt: null },
      create: { email: normalizedEmail, name: name || "Admin", role: "ADMIN" } });
    await tx.authIdentity.upsert({ where: { userId_provider: { userId: account.id, provider: "PASSWORD" } },
      update: { passwordHash }, create: { userId: account.id, provider: "PASSWORD", providerUserId: normalizedEmail, passwordHash } });
    if (replaceExisting) {
      const removed = await tx.user.deleteMany({ where: { role: "ADMIN", id: { not: account.id } } });
      removedAdmins = removed.count;
    }
    return account;
  });

  console.log(`✔ Admin account ready: ${user.email} (id: ${user.id})`);
  if (replaceExisting) console.log(`Replaced ${removedAdmins} previous admin account(s).`);
  await db.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
