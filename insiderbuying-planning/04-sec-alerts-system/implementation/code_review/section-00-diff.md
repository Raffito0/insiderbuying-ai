diff --git a/insiderbuying-site/package.json b/insiderbuying-site/package.json
index 830f4d2..923f164 100644
--- a/insiderbuying-site/package.json
+++ b/insiderbuying-site/package.json
@@ -6,7 +6,12 @@
   "scripts": {
     "dev": "next dev",
     "build": "next build",
-    "start": "next start"
+    "start": "next start",
+    "test": "jest"
+  },
+  "jest": {
+    "testEnvironment": "node",
+    "testMatch": ["**/tests/**/*.test.js"]
   },
   "keywords": [],
   "author": "",
@@ -26,6 +31,7 @@
     "@types/node": "^25.5.0",
     "@types/react": "^19.2.14",
     "cheerio": "^1.2.0",
+    "jest": "^30.3.0",
     "postcss": "^8.5.8",
     "tailwindcss": "^4.2.2",
     "typescript": "^6.0.2"
diff --git a/insiderbuying-site/supabase/migrations/20260327000001_insider_alerts_v2.sql b/insiderbuying-site/supabase/migrations/20260327000001_insider_alerts_v2.sql
new file mode 100644
index 0000000..8780ce4
--- /dev/null
+++ b/insiderbuying-site/supabase/migrations/20260327000001_insider_alerts_v2.sql
@@ -0,0 +1,52 @@
+-- insider_alerts v2 — add missing columns, fix CHECK constraint, add UPDATE policy
+-- Note: cluster_id and is_cluster_buy already exist from v1 migration.
+
+-- Add missing columns
+ALTER TABLE public.insider_alerts
+  ADD COLUMN IF NOT EXISTS transaction_date DATE,
+  ADD COLUMN IF NOT EXISTS dedup_key TEXT,
+  ADD COLUMN IF NOT EXISTS insider_category TEXT,
+  ADD COLUMN IF NOT EXISTS score_reasoning TEXT,
+  ADD COLUMN IF NOT EXISTS cluster_size INTEGER DEFAULT 0,
+  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'new',
+  ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
+  ADD COLUMN IF NOT EXISTS emails_sent INTEGER DEFAULT 0,
+  ADD COLUMN IF NOT EXISTS push_sent INTEGER DEFAULT 0,
+  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
+  ADD COLUMN IF NOT EXISTS error_log TEXT;
+
+-- Unique index on dedup_key (partial — only for non-null keys)
+CREATE UNIQUE INDEX IF NOT EXISTS idx_insider_alerts_dedup
+  ON public.insider_alerts(dedup_key)
+  WHERE dedup_key IS NOT NULL;
+
+-- Fix transaction_type CHECK constraint to include 'cluster'
+-- Must drop the old constraint first (IF NOT EXISTS not available for constraints)
+ALTER TABLE public.insider_alerts
+  DROP CONSTRAINT IF EXISTS insider_alerts_transaction_type_check;
+
+ALTER TABLE public.insider_alerts
+  ADD CONSTRAINT insider_alerts_transaction_type_check
+  CHECK (transaction_type IN ('buy', 'sell', 'cluster'));
+
+-- Add service_role UPDATE policy (required for cluster detection to patch existing rows)
+-- Without this, the UPDATE runs but affects 0 rows silently (RLS blocks it).
+DO $$
+BEGIN
+  IF NOT EXISTS (
+    SELECT 1 FROM pg_policies
+    WHERE schemaname = 'public'
+      AND tablename = 'insider_alerts'
+      AND policyname = 'service_role can update insider_alerts'
+  ) THEN
+    EXECUTE '
+      CREATE POLICY "service_role can update insider_alerts"
+        ON public.insider_alerts
+        FOR UPDATE
+        TO service_role
+        USING (true)
+        WITH CHECK (true)
+    ';
+  END IF;
+END
+$$;
diff --git a/insiderbuying-site/tests/insiderbuying/section-00-schema-migration.test.js b/insiderbuying-site/tests/insiderbuying/section-00-schema-migration.test.js
new file mode 100644
index 0000000..58ef81e
--- /dev/null
+++ b/insiderbuying-site/tests/insiderbuying/section-00-schema-migration.test.js
@@ -0,0 +1,90 @@
+'use strict';
+
+const fs = require('fs');
+const path = require('path');
+
+const MIGRATION_FILE = path.join(
+  __dirname,
+  '../../supabase/migrations/20260327000001_insider_alerts_v2.sql'
+);
+
+let sql;
+beforeAll(() => {
+  sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
+});
+
+describe('section-00: insider_alerts v2 migration file', () => {
+  test('migration file exists', () => {
+    expect(fs.existsSync(MIGRATION_FILE)).toBe(true);
+  });
+
+  const requiredColumns = [
+    'transaction_date',
+    'dedup_key',
+    'insider_category',
+    'score_reasoning',
+    'cluster_size',
+    'status',
+    'retry_count',
+    'emails_sent',
+    'push_sent',
+    'delivered_at',
+    'error_log',
+  ];
+
+  requiredColumns.forEach((col) => {
+    test(`adds column: ${col}`, () => {
+      expect(sql).toContain(col);
+    });
+  });
+
+  test('uses ADD COLUMN IF NOT EXISTS (idempotent columns)', () => {
+    expect(sql).toContain('ADD COLUMN IF NOT EXISTS');
+  });
+
+  test('creates dedup_key unique index with IF NOT EXISTS', () => {
+    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS idx_insider_alerts_dedup');
+  });
+
+  test('dedup_key unique index is partial (WHERE dedup_key IS NOT NULL)', () => {
+    expect(sql).toContain('WHERE dedup_key IS NOT NULL');
+  });
+
+  test('drops old transaction_type CHECK constraint before re-adding', () => {
+    expect(sql).toContain("DROP CONSTRAINT IF EXISTS insider_alerts_transaction_type_check");
+  });
+
+  test("transaction_type CHECK accepts 'cluster'", () => {
+    expect(sql).toContain("'cluster'");
+    expect(sql).toContain('insider_alerts_transaction_type_check');
+  });
+
+  test("transaction_type CHECK includes 'buy' and 'sell'", () => {
+    const checkLine = sql.match(/CHECK \(transaction_type IN \([^)]+\)\)/);
+    expect(checkLine).not.toBeNull();
+    expect(checkLine[0]).toContain("'buy'");
+    expect(checkLine[0]).toContain("'sell'");
+    expect(checkLine[0]).toContain("'cluster'");
+  });
+
+  test('adds service_role UPDATE policy', () => {
+    expect(sql).toContain('service_role can update insider_alerts');
+    expect(sql).toContain('FOR UPDATE');
+    expect(sql).toContain('TO service_role');
+  });
+
+  test('service_role policy is wrapped in IF NOT EXISTS guard (idempotent)', () => {
+    expect(sql).toContain('IF NOT EXISTS');
+    // The DO $$ block guards the policy creation
+    expect(sql).toMatch(/DO\s*\$\$/);
+  });
+
+  test('does NOT re-add cluster_id (already exists in v1)', () => {
+    // cluster_id is in v1 — the v2 migration must not ADD COLUMN cluster_id
+    expect(sql).not.toMatch(/ADD COLUMN\s+IF NOT EXISTS\s+cluster_id/);
+  });
+
+  test('does NOT re-add is_cluster_buy (already exists in v1)', () => {
+    expect(sql).not.toMatch(/ADD COLUMN\s+IF NOT EXISTS\s+is_cluster_buy/);
+  });
+});
