// Deterministic monogram placeholders; no imitation of real people's photographs.
const fs = require('node:fs'), path = require('node:path'), sharp = require('sharp');
const root = path.resolve(__dirname, '..'), plan = JSON.parse(fs.readFileSync(path.join(root, 'tmp/team-activity/plan.json'), 'utf8'));
const output = path.join(root, 'output/pdf/team-activity'); fs.mkdirSync(output, { recursive: true });
(async () => {
  for (const app of plan.applications) {
    const document = plan.documents.find(document => document.applicationId === app.id && document.kind === 'PROFILE');
    const initials = app.fields.legalName.split(' ').map(part => part[0]).slice(0, 2).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#edf3ef"/><circle cx="300" cy="260" r="162" fill="#d5e3da"/><text x="300" y="300" text-anchor="middle" font-family="Arial,sans-serif" font-size="115" fill="#254a3c">${initials}</text><text x="300" y="492" text-anchor="middle" font-family="Arial,sans-serif" font-size="22" fill="#52665f">Profile image pending verification</text></svg>`;
    await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toFile(path.join(output, document.originalName));
  }
  console.log(JSON.stringify({ profilePlaceholders: plan.applications.length }));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
