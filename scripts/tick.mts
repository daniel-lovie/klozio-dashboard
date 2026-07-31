/**
 * Scheduler trigger. Calls the app's own /api/cron/publish endpoint.
 *
 * Deliberately an HTTP client rather than importing src/lib/publish: the app's modules use
 * extensionless imports that only the Next bundler resolves, and duplicating the publish
 * logic in a script would be worse than a network hop. One publish code path, one trigger.
 *
 *   npm run publish:tick                       # hits localhost
 *   BASE_URL=https://app.up.railway.app npm run publish:tick
 */
const base = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3010}`;
const secret = process.env.CRON_SECRET;

const res = await fetch(`${base}/api/cron/publish`, {
  method: "POST",
  headers: secret ? { Authorization: `Bearer ${secret}` } : {},
});

const text = await res.text();
if (!res.ok) {
  console.error(`✗ ${res.status} ${base}/api/cron/publish\n${text.slice(0, 500)}`);
  process.exit(1);
}
console.log(text);
