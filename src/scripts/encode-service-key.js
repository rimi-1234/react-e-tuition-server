/**
 * Prints a Firebase service-account JSON file as base64, ready to paste into
 * the FB_SERVICE_KEY environment variable on Render / Vercel.
 *
 *   node src/scripts/encode-service-key.js ./serviceKeyConverter.json
 */
import { readFileSync } from 'node:fs';

const file = process.argv[2] || './serviceKeyConverter.json';
const json = readFileSync(file, 'utf8');
JSON.parse(json); // fail loudly on a malformed file
console.log(Buffer.from(json).toString('base64'));
