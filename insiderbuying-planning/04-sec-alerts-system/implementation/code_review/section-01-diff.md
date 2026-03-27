diff --git a/insiderbuying-site/scripts/insiderbuying/setup-airtable-base.js b/insiderbuying-site/scripts/insiderbuying/setup-airtable-base.js
new file mode 100644
index 0000000..a133533
--- /dev/null
+++ b/insiderbuying-site/scripts/insiderbuying/setup-airtable-base.js
@@ -0,0 +1,195 @@
+'use strict';
+
+/**
+ * setup-airtable-base.js
+ *
+ * Creates the InsiderBuying.ai Airtable base tables and seeds Monitor_State.
+ *
+ * Usage:
+ *   AIRTABLE_TOKEN=pat... BASE_ID=appXXX node scripts/insiderbuying/setup-airtable-base.js
+ *
+ * Prerequisites:
+ *   1. Manually create a new base named "InsiderBuying.ai" in the Airtable UI.
+ *   2. Copy its base ID (starts with "app") and set BASE_ID env var.
+ *   3. Set AIRTABLE_TOKEN to a personal access token with scopes:
+ *      schema.bases:write, data.records:write
+ *
+ * The Airtable REST API cannot create a base — only tables/fields/records within one.
+ */
+
+const https = require('https');
+
+const TOKEN = process.env.AIRTABLE_TOKEN;
+const BASE_ID = process.env.BASE_ID;
+
+if (require.main === module && (!TOKEN || !BASE_ID)) {
+  console.error('ERROR: AIRTABLE_TOKEN and BASE_ID env vars are required.');
+  process.exit(1);
+}
+
+// ── HTTP helper ────────────────────────────────────────────────────────────────
+
+function airtableRequest(method, path, body) {
+  return new Promise((resolve, reject) => {
+    const data = body ? JSON.stringify(body) : null;
+    const options = {
+      hostname: 'api.airtable.com',
+      path,
+      method,
+      headers: {
+        Authorization: `Bearer ${TOKEN}`,
+        'Content-Type': 'application/json',
+        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
+      },
+    };
+    const req = https.request(options, (res) => {
+      let raw = '';
+      res.on('data', (chunk) => (raw += chunk));
+      res.on('end', () => {
+        try {
+          const parsed = JSON.parse(raw);
+          if (res.statusCode >= 400) reject(new Error(`Airtable ${res.statusCode}: ${JSON.stringify(parsed)}`));
+          else resolve(parsed);
+        } catch (e) {
+          reject(new Error(`JSON parse error: ${raw}`));
+        }
+      });
+    });
+    req.on('error', reject);
+    if (data) req.write(data);
+    req.end();
+  });
+}
+
+// ── Field definitions ──────────────────────────────────────────────────────────
+
+const INSIDER_ALERTS_FIELDS = [
+  // Filing metadata
+  { name: 'dedup_key', type: 'singleLineText' },
+  { name: 'ticker', type: 'singleLineText' },
+  { name: 'company_name', type: 'singleLineText' },
+  { name: 'insider_name', type: 'singleLineText' },
+  { name: 'insider_title', type: 'singleLineText' },
+  { name: 'insider_category', type: 'singleLineText' },
+  // Trade details
+  {
+    name: 'transaction_type',
+    type: 'singleSelect',
+    options: { choices: [{ name: 'buy' }, { name: 'sell' }, { name: 'cluster' }] },
+  },
+  { name: 'shares', type: 'number', options: { precision: 0 } },
+  { name: 'price_per_share', type: 'number', options: { precision: 2 } },
+  { name: 'total_value', type: 'number', options: { precision: 2 } },
+  { name: 'transaction_date', type: 'date', options: { dateFormat: { name: 'iso' } } },
+  { name: 'filing_date', type: 'date', options: { dateFormat: { name: 'iso' } } },
+  // AI scoring
+  { name: 'significance_score', type: 'number', options: { precision: 0 } },
+  { name: 'score_reasoning', type: 'multilineText' },
+  { name: 'ai_analysis', type: 'multilineText' },
+  // Cluster
+  { name: 'cluster_id', type: 'singleLineText' },
+  { name: 'is_cluster_buy', type: 'checkbox', options: { icon: 'check', color: 'greenBright' } },
+  { name: 'cluster_size', type: 'number', options: { precision: 0 } },
+  // Debug & cross-reference
+  { name: 'raw_filing_data', type: 'multilineText' },
+  { name: 'supabase_id', type: 'singleLineText' },
+  // Delivery tracking
+  {
+    name: 'status',
+    type: 'singleSelect',
+    options: {
+      choices: [
+        { name: 'new' },
+        { name: 'processing' },
+        { name: 'processed' },
+        { name: 'delivered' },
+        { name: 'delivery_failed' },
+        { name: 'failed' },
+      ],
+    },
+  },
+  { name: 'emails_sent', type: 'number', options: { precision: 0 } },
+  { name: 'push_sent', type: 'number', options: { precision: 0 } },
+  {
+    name: 'delivered_at',
+    type: 'dateTime',
+    options: { dateFormat: { name: 'iso' }, timeFormat: { name: '24hour' }, timeZone: 'utc' },
+  },
+  { name: 'error_log', type: 'multilineText' },
+];
+
+const MONITOR_STATE_FIELDS = [
+  { name: 'name', type: 'singleLineText' },
+  {
+    name: 'last_check_timestamp',
+    type: 'dateTime',
+    options: { dateFormat: { name: 'iso' }, timeFormat: { name: '24hour' }, timeZone: 'utc' },
+  },
+  { name: 'last_run_status', type: 'singleLineText' },
+  { name: 'last_run_filings_found', type: 'number', options: { precision: 0 } },
+  { name: 'last_run_error', type: 'multilineText' },
+];
+
+// ── Seed records for Monitor_State ────────────────────────────────────────────
+
+function yesterday() {
+  const d = new Date();
+  d.setDate(d.getDate() - 1);
+  return d.toISOString();
+}
+
+const MONITOR_STATE_SEEDS = [
+  { fields: { name: 'market', last_check_timestamp: yesterday() } },
+  { fields: { name: 'afterhours', last_check_timestamp: yesterday() } },
+];
+
+// ── Main setup flow ────────────────────────────────────────────────────────────
+
+async function createTable(name, fields) {
+  console.log(`Creating table: ${name}...`);
+  // Airtable requires at least one field in table creation.
+  // Additional fields are added via the fields endpoint.
+  const firstField = fields[0];
+  const table = await airtableRequest('POST', `/v0/meta/bases/${BASE_ID}/tables`, {
+    name,
+    fields: [firstField],
+  });
+  console.log(`  Created table ${name} (id: ${table.id})`);
+
+  // Add remaining fields
+  for (const field of fields.slice(1)) {
+    await airtableRequest('POST', `/v0/meta/bases/${BASE_ID}/tables/${table.id}/fields`, field);
+    console.log(`  Added field: ${field.name}`);
+  }
+  return table;
+}
+
+async function seedRecords(tableId, records) {
+  console.log(`Seeding ${records.length} records...`);
+  const result = await airtableRequest('POST', `/v0/${BASE_ID}/${tableId}`, { records });
+  console.log(`  Seeded ${result.records.length} records.`);
+}
+
+async function main() {
+  console.log(`Setting up InsiderBuying.ai base (${BASE_ID})...`);
+
+  const alertsTable = await createTable('Insider_Alerts', INSIDER_ALERTS_FIELDS);
+  const monitorTable = await createTable('Monitor_State', MONITOR_STATE_FIELDS);
+
+  await seedRecords(monitorTable.id, MONITOR_STATE_SEEDS);
+
+  console.log('\nDone. Base IDs to save in your .env / n8n credentials:');
+  console.log(`  AIRTABLE_BASE_ID=${BASE_ID}`);
+  console.log(`  INSIDER_ALERTS_TABLE_ID=${alertsTable.id}`);
+  console.log(`  MONITOR_STATE_TABLE_ID=${monitorTable.id}`);
+}
+
+if (require.main === module) {
+  main().catch((err) => {
+    console.error('Setup failed:', err.message);
+    process.exit(1);
+  });
+}
+
+// Export schema config for unit tests
+module.exports = { INSIDER_ALERTS_FIELDS, MONITOR_STATE_FIELDS, MONITOR_STATE_SEEDS };
diff --git a/insiderbuying-site/tests/insiderbuying/section-01-airtable-setup.test.js b/insiderbuying-site/tests/insiderbuying/section-01-airtable-setup.test.js
new file mode 100644
index 0000000..3a673d2
--- /dev/null
+++ b/insiderbuying-site/tests/insiderbuying/section-01-airtable-setup.test.js
@@ -0,0 +1,139 @@
+'use strict';
+
+const {
+  INSIDER_ALERTS_FIELDS,
+  MONITOR_STATE_FIELDS,
+  MONITOR_STATE_SEEDS,
+} = require('../../scripts/insiderbuying/setup-airtable-base');
+
+describe('section-01: Airtable schema config', () => {
+  // ── Insider_Alerts table ──────────────────────────────────────────────────
+
+  describe('Insider_Alerts field definitions', () => {
+    const fieldNames = INSIDER_ALERTS_FIELDS.map((f) => f.name);
+
+    const requiredFields = [
+      'dedup_key', 'ticker', 'company_name', 'insider_name', 'insider_title',
+      'insider_category', 'transaction_type', 'shares', 'price_per_share',
+      'total_value', 'transaction_date', 'filing_date', 'significance_score',
+      'score_reasoning', 'ai_analysis', 'cluster_id', 'is_cluster_buy',
+      'cluster_size', 'raw_filing_data', 'supabase_id', 'status',
+      'emails_sent', 'push_sent', 'delivered_at', 'error_log',
+    ];
+
+    requiredFields.forEach((name) => {
+      test(`defines field: ${name}`, () => {
+        expect(fieldNames).toContain(name);
+      });
+    });
+
+    test('transaction_type is singleSelect', () => {
+      const f = INSIDER_ALERTS_FIELDS.find((x) => x.name === 'transaction_type');
+      expect(f.type).toBe('singleSelect');
+    });
+
+    test('transaction_type has exactly 3 choices: buy, sell, cluster', () => {
+      const f = INSIDER_ALERTS_FIELDS.find((x) => x.name === 'transaction_type');
+      const names = f.options.choices.map((c) => c.name);
+      expect(names).toEqual(expect.arrayContaining(['buy', 'sell', 'cluster']));
+      expect(names).toHaveLength(3);
+    });
+
+    test('status is singleSelect with 6 delivery states', () => {
+      const f = INSIDER_ALERTS_FIELDS.find((x) => x.name === 'status');
+      expect(f.type).toBe('singleSelect');
+      const names = f.options.choices.map((c) => c.name);
+      expect(names).toEqual(
+        expect.arrayContaining(['new', 'processing', 'processed', 'delivered', 'delivery_failed', 'failed'])
+      );
+      expect(names).toHaveLength(6);
+    });
+
+    test('delivered_at is dateTime (not date-only)', () => {
+      const f = INSIDER_ALERTS_FIELDS.find((x) => x.name === 'delivered_at');
+      expect(f.type).toBe('dateTime');
+    });
+
+    test('is_cluster_buy is checkbox', () => {
+      const f = INSIDER_ALERTS_FIELDS.find((x) => x.name === 'is_cluster_buy');
+      expect(f.type).toBe('checkbox');
+    });
+
+    test('numeric fields have precision defined', () => {
+      ['shares', 'cluster_size', 'significance_score', 'emails_sent', 'push_sent'].forEach((name) => {
+        const f = INSIDER_ALERTS_FIELDS.find((x) => x.name === name);
+        expect(f.type).toBe('number');
+        expect(f.options).toBeDefined();
+        expect(typeof f.options.precision).toBe('number');
+      });
+    });
+  });
+
+  // ── Monitor_State table ────────────────────────────────────────────────────
+
+  describe('Monitor_State field definitions', () => {
+    const fieldNames = MONITOR_STATE_FIELDS.map((f) => f.name);
+
+    test('has all 5 required fields', () => {
+      expect(fieldNames).toEqual(
+        expect.arrayContaining([
+          'name', 'last_check_timestamp', 'last_run_status',
+          'last_run_filings_found', 'last_run_error',
+        ])
+      );
+    });
+
+    test('last_check_timestamp is dateTime (not date-only)', () => {
+      const f = MONITOR_STATE_FIELDS.find((x) => x.name === 'last_check_timestamp');
+      expect(f.type).toBe('dateTime');
+    });
+  });
+
+  // ── Monitor_State seed records ─────────────────────────────────────────────
+
+  describe('Monitor_State seed records', () => {
+    test('seeds exactly 2 records', () => {
+      expect(MONITOR_STATE_SEEDS).toHaveLength(2);
+    });
+
+    test('seeds market record', () => {
+      const record = MONITOR_STATE_SEEDS.find((r) => r.fields.name === 'market');
+      expect(record).toBeDefined();
+    });
+
+    test('seeds afterhours record', () => {
+      const record = MONITOR_STATE_SEEDS.find((r) => r.fields.name === 'afterhours');
+      expect(record).toBeDefined();
+    });
+
+    test('both seed records have last_check_timestamp as ISO datetime string', () => {
+      MONITOR_STATE_SEEDS.forEach((record) => {
+        const ts = record.fields.last_check_timestamp;
+        expect(typeof ts).toBe('string');
+        // ISO 8601 datetime includes 'T' separator and ends with 'Z' or offset
+        expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
+      });
+    });
+
+    test('seed timestamps are roughly 24h in the past (± 2h)', () => {
+      const now = Date.now();
+      MONITOR_STATE_SEEDS.forEach((record) => {
+        const ts = new Date(record.fields.last_check_timestamp).getTime();
+        const hoursAgo = (now - ts) / 1000 / 3600;
+        // Should be between 22h and 26h ago
+        expect(hoursAgo).toBeGreaterThan(22);
+        expect(hoursAgo).toBeLessThan(26);
+      });
+    });
+  });
+
+  // ── Live integration tests (require real Airtable credentials) ─────────────
+  // Run manually after executing setup-airtable-base.js:
+  //   AIRTABLE_TOKEN=pat... BASE_ID=appXXX node scripts/insiderbuying/setup-airtable-base.js
+  //
+  //   Then verify in Airtable UI:
+  //   - Insider_Alerts table accepts a record with all required fields populated
+  //   - transaction_type rejects values outside buy/sell/cluster
+  //   - Monitor_State has exactly 2 records (market / afterhours)
+  //   - filterByFormula({dedup_key}='TEST_KEY') returns at most 1 record
+});
