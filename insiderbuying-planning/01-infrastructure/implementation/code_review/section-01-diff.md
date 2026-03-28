diff --git a/insiderbuying-site/docker/nocodb/setup-tables.sh b/insiderbuying-site/docker/nocodb/setup-tables.sh
index f1e800b..dc49f70 100644
--- a/insiderbuying-site/docker/nocodb/setup-tables.sh
+++ b/insiderbuying-site/docker/nocodb/setup-tables.sh
@@ -102,6 +102,8 @@ ARTICLES_ID=$(create_table "Articles" '[
   {"title":"author_name","uidt":"SingleLineText"},
   {"title":"status","uidt":"SingleSelect","dtxp":"enriching,published,draft,error"},
   {"title":"quality_gate_pass","uidt":"Checkbox"},
+  {"title":"seo_score","uidt":"Number"},
+  {"title":"ai_detection_score","uidt":"Number"},
   {"title":"related_articles","uidt":"LongText"},
   {"title":"published_at","uidt":"DateTime"}
 ]')
@@ -123,14 +125,121 @@ IMAGES_ID=$(create_table "Published_Images" '[
   {"title":"prompt_used","uidt":"LongText"}
 ]')
 
+# --- Data_Studies Table (W3 data studies) ---
+STUDIES_ID=$(create_table "Data_Studies" '[
+  {"title":"title","uidt":"SingleLineText"},
+  {"title":"study_type","uidt":"SingleLineText"},
+  {"title":"data_period","uidt":"SingleLineText"},
+  {"title":"key_findings","uidt":"LongText"},
+  {"title":"methodology","uidt":"LongText"},
+  {"title":"charts_data","uidt":"LongText"},
+  {"title":"status","uidt":"SingleSelect","dtxp":"draft,published"},
+  {"title":"published_at","uidt":"DateTime"}
+]')
+
+# --- Insider_Alerts Table (W4 SEC monitor) ---
+ALERTS_ID=$(create_table "Insider_Alerts" '[
+  {"title":"ticker","uidt":"SingleLineText"},
+  {"title":"company_name","uidt":"SingleLineText"},
+  {"title":"insider_name","uidt":"SingleLineText"},
+  {"title":"insider_title","uidt":"SingleLineText"},
+  {"title":"transaction_type","uidt":"SingleSelect","dtxp":"buy,sell,cluster"},
+  {"title":"shares","uidt":"Number"},
+  {"title":"price_per_share","uidt":"Decimal"},
+  {"title":"total_value","uidt":"Number"},
+  {"title":"filing_date","uidt":"DateTime"},
+  {"title":"significance_score","uidt":"Number"},
+  {"title":"ai_analysis","uidt":"LongText"},
+  {"title":"cluster_id","uidt":"SingleLineText"},
+  {"title":"is_cluster","uidt":"Checkbox"},
+  {"title":"raw_data","uidt":"LongText"},
+  {"title":"status","uidt":"SingleSelect","dtxp":"new,processed,delivered"},
+  {"title":"delivered_at","uidt":"DateTime"}
+]')
+
+# --- Outreach_Prospects Table (W10 prospect finder) ---
+PROSPECTS_ID=$(create_table "Outreach_Prospects" '[
+  {"title":"name","uidt":"SingleLineText"},
+  {"title":"email","uidt":"Email"},
+  {"title":"website","uidt":"URL"},
+  {"title":"domain_authority","uidt":"Number"},
+  {"title":"type","uidt":"SingleSelect","dtxp":"blogger,newsletter,podcast"},
+  {"title":"relevance_score","uidt":"Number"},
+  {"title":"status","uidt":"SingleSelect","dtxp":"found,contacted,replied,linked"},
+  {"title":"notes","uidt":"LongText"}
+]')
+
+# --- Outreach_Log Table (W11 email sender) ---
+OUTREACH_LOG_ID=$(create_table "Outreach_Log" '[
+  {"title":"prospect_id","uidt":"Number"},
+  {"title":"email_type","uidt":"SingleSelect","dtxp":"initial,followup"},
+  {"title":"sent_at","uidt":"DateTime"},
+  {"title":"opened_at","uidt":"DateTime"},
+  {"title":"replied_at","uidt":"DateTime"},
+  {"title":"result","uidt":"SingleSelect","dtxp":"no_reply,positive,negative,linked"}
+]')
+
+# --- X_Engagement_Log Table (W7/W8 X posts) ---
+X_LOG_ID=$(create_table "X_Engagement_Log" '[
+  {"title":"tweet_id","uidt":"SingleLineText"},
+  {"title":"article_id","uidt":"Number"},
+  {"title":"tweet_text","uidt":"LongText"},
+  {"title":"type","uidt":"SingleSelect","dtxp":"post,reply"},
+  {"title":"likes","uidt":"Number"},
+  {"title":"retweets","uidt":"Number"},
+  {"title":"replies","uidt":"Number"},
+  {"title":"impressions","uidt":"Number"},
+  {"title":"posted_at","uidt":"DateTime"}
+]')
+
+# --- Reddit_Log Table (W9 Reddit monitor) ---
+REDDIT_LOG_ID=$(create_table "Reddit_Log" '[
+  {"title":"post_url","uidt":"URL"},
+  {"title":"subreddit","uidt":"SingleLineText"},
+  {"title":"comment_text","uidt":"LongText"},
+  {"title":"type","uidt":"SingleSelect","dtxp":"value,mention"},
+  {"title":"upvotes","uidt":"Number"},
+  {"title":"posted_at","uidt":"DateTime"},
+  {"title":"status","uidt":"SingleSelect","dtxp":"drafted,approved,posted"}
+]')
+
+# --- Lead_Magnet_Versions Table (W16 lead magnet PDF) ---
+LEAD_MAGNET_ID=$(create_table "Lead_Magnet_Versions" '[
+  {"title":"month","uidt":"SingleLineText"},
+  {"title":"title","uidt":"SingleLineText"},
+  {"title":"pdf_url","uidt":"URL"},
+  {"title":"backtest_period","uidt":"SingleLineText"},
+  {"title":"key_stats","uidt":"LongText"},
+  {"title":"beehiiv_updated","uidt":"Checkbox"},
+  {"title":"created_at","uidt":"DateTime"}
+]')
+
+# --- SEO_Rankings Table (W14 SEO monitoring) ---
+SEO_ID=$(create_table "SEO_Rankings" '[
+  {"title":"keyword_id","uidt":"Number"},
+  {"title":"date","uidt":"Date"},
+  {"title":"position","uidt":"Number"},
+  {"title":"clicks","uidt":"Number"},
+  {"title":"impressions","uidt":"Number"},
+  {"title":"ctr","uidt":"Decimal"}
+]')
+
 echo ""
-echo "=== 4 Content Engine tables created ==="
+echo "=== 12 tables created ==="
 echo ""
 echo "Table IDs:"
-echo "  Keywords:        $KEYWORDS_ID"
-echo "  Articles:        $ARTICLES_ID"
-echo "  Financial_Cache: $CACHE_ID"
-echo "  Published_Images: $IMAGES_ID"
+echo "  Keywords:           $KEYWORDS_ID"
+echo "  Articles:           $ARTICLES_ID"
+echo "  Financial_Cache:    $CACHE_ID"
+echo "  Published_Images:   $IMAGES_ID"
+echo "  Data_Studies:       $STUDIES_ID"
+echo "  Insider_Alerts:     $ALERTS_ID"
+echo "  Outreach_Prospects: $PROSPECTS_ID"
+echo "  Outreach_Log:       $OUTREACH_LOG_ID"
+echo "  X_Engagement_Log:   $X_LOG_ID"
+echo "  Reddit_Log:         $REDDIT_LOG_ID"
+echo "  Lead_Magnet_Vers:   $LEAD_MAGNET_ID"
+echo "  SEO_Rankings:       $SEO_ID"
 echo ""
 echo "=== Next Steps ==="
 echo "1. In NocoDB UI: Published_Images -> add LinkToAnotherRecord field to Articles"
diff --git a/insiderbuying-site/docker/nocodb/setup_remote.py b/insiderbuying-site/docker/nocodb/setup_remote.py
new file mode 100644
index 0000000..f3e81e8
--- /dev/null
+++ b/insiderbuying-site/docker/nocodb/setup_remote.py
@@ -0,0 +1,234 @@
+#!/usr/bin/env python3
+"""NocoDB setup script - run on VPS directly"""
+import json, subprocess, sys
+
+def signin():
+    r = subprocess.run(["docker","exec","nocodb-nocodb-1","wget","-qO-",
+        "--post-data",json.dumps({"email":"admin@earlyinsider.com","password":"E4rly1ns1d3r_Adm1n_2026"}),
+        "--header","Content-Type: application/json",
+        "http://localhost:8080/api/v1/auth/user/signin"], capture_output=True, text=True)
+    return json.loads(r.stdout)["token"]
+
+def post(path, data, token):
+    r = subprocess.run(["docker","exec","nocodb-nocodb-1","wget","-qO-",
+        "--post-data",json.dumps(data),
+        "--header","Content-Type: application/json",
+        "--header","xc-auth: " + token,
+        "http://localhost:8080" + path], capture_output=True, text=True)
+    if r.returncode != 0:
+        print("  FAIL: " + r.stderr[:200])
+        return None
+    return json.loads(r.stdout) if r.stdout.strip() else None
+
+def get(path, token):
+    r = subprocess.run(["docker","exec","nocodb-nocodb-1","wget","-qO-",
+        "--header","xc-auth: " + token,
+        "http://localhost:8080" + path], capture_output=True, text=True)
+    return json.loads(r.stdout) if r.stdout.strip() else None
+
+token = signin()
+print("Auth OK")
+
+WS = "w4kv5lzf"
+
+# Create base
+print("Creating EarlyInsider base...")
+result = post("/api/v2/meta/workspaces/" + WS + "/bases", {"title":"EarlyInsider"}, token)
+if result:
+    BASE_ID = result["id"]
+    print("Created base: " + BASE_ID)
+else:
+    bases = get("/api/v2/meta/workspaces/" + WS + "/bases", token)
+    for b in bases.get("list", []):
+        print("  Existing: " + b["title"] + " -> " + b["id"])
+    # Use existing Getting Started base or rename it
+    BASE_ID = bases["list"][0]["id"]
+    print("Using existing base: " + BASE_ID)
+
+TABLES = [
+    ("Keywords", [
+        {"title":"keyword","uidt":"SingleLineText"},
+        {"title":"ticker","uidt":"SingleLineText"},
+        {"title":"blog","uidt":"SingleLineText"},
+        {"title":"article_type","uidt":"SingleLineText"},
+        {"title":"search_volume","uidt":"Number"},
+        {"title":"difficulty","uidt":"Number"},
+        {"title":"cpc","uidt":"Number"},
+        {"title":"intent_multiplier","uidt":"Number"},
+        {"title":"priority_score","uidt":"Number"},
+        {"title":"secondary_keywords","uidt":"LongText"},
+        {"title":"status","uidt":"SingleLineText"},
+        {"title":"used_at","uidt":"DateTime"},
+    ]),
+    ("Articles", [
+        {"title":"slug","uidt":"SingleLineText"},
+        {"title":"title_text","uidt":"SingleLineText"},
+        {"title":"meta_description","uidt":"SingleLineText"},
+        {"title":"body_html","uidt":"LongText"},
+        {"title":"verdict_type","uidt":"SingleLineText"},
+        {"title":"verdict_text","uidt":"LongText"},
+        {"title":"key_takeaways","uidt":"LongText"},
+        {"title":"word_count","uidt":"Number"},
+        {"title":"primary_keyword","uidt":"SingleLineText"},
+        {"title":"secondary_keywords_used","uidt":"LongText"},
+        {"title":"data_tables_count","uidt":"Number"},
+        {"title":"filing_citations_count","uidt":"Number"},
+        {"title":"confidence_notes","uidt":"LongText"},
+        {"title":"ticker","uidt":"SingleLineText"},
+        {"title":"sector","uidt":"SingleLineText"},
+        {"title":"company_name","uidt":"SingleLineText"},
+        {"title":"blog","uidt":"SingleLineText"},
+        {"title":"hero_image_url","uidt":"URL"},
+        {"title":"og_image_url","uidt":"URL"},
+        {"title":"author_name","uidt":"SingleLineText"},
+        {"title":"status","uidt":"SingleLineText"},
+        {"title":"quality_gate_pass","uidt":"Checkbox"},
+        {"title":"seo_score","uidt":"Number"},
+        {"title":"ai_detection_score","uidt":"Number"},
+        {"title":"related_articles","uidt":"LongText"},
+        {"title":"published_at","uidt":"DateTime"},
+    ]),
+    ("Financial_Cache", [
+        {"title":"ticker","uidt":"SingleLineText"},
+        {"title":"data_type","uidt":"SingleLineText"},
+        {"title":"data_json","uidt":"LongText"},
+        {"title":"fetched_at","uidt":"DateTime"},
+        {"title":"expires_at","uidt":"DateTime"},
+    ]),
+    ("Published_Images", [
+        {"title":"article_id","uidt":"Number"},
+        {"title":"image_type","uidt":"SingleLineText"},
+        {"title":"r2_url","uidt":"URL"},
+        {"title":"prompt_used","uidt":"LongText"},
+    ]),
+    ("Data_Studies", [
+        {"title":"title","uidt":"SingleLineText"},
+        {"title":"study_type","uidt":"SingleLineText"},
+        {"title":"data_period","uidt":"SingleLineText"},
+        {"title":"key_findings","uidt":"LongText"},
+        {"title":"methodology","uidt":"LongText"},
+        {"title":"charts_data","uidt":"LongText"},
+        {"title":"status","uidt":"SingleLineText"},
+        {"title":"published_at","uidt":"DateTime"},
+    ]),
+    ("Insider_Alerts", [
+        {"title":"ticker","uidt":"SingleLineText"},
+        {"title":"company_name","uidt":"SingleLineText"},
+        {"title":"insider_name","uidt":"SingleLineText"},
+        {"title":"insider_title","uidt":"SingleLineText"},
+        {"title":"transaction_type","uidt":"SingleLineText"},
+        {"title":"shares","uidt":"Number"},
+        {"title":"price_per_share","uidt":"Number"},
+        {"title":"total_value","uidt":"Number"},
+        {"title":"filing_date","uidt":"DateTime"},
+        {"title":"significance_score","uidt":"Number"},
+        {"title":"ai_analysis","uidt":"LongText"},
+        {"title":"cluster_id","uidt":"SingleLineText"},
+        {"title":"is_cluster","uidt":"Checkbox"},
+        {"title":"raw_data","uidt":"LongText"},
+        {"title":"status","uidt":"SingleLineText"},
+        {"title":"delivered_at","uidt":"DateTime"},
+    ]),
+    ("Outreach_Prospects", [
+        {"title":"name","uidt":"SingleLineText"},
+        {"title":"email","uidt":"SingleLineText"},
+        {"title":"website","uidt":"URL"},
+        {"title":"domain_authority","uidt":"Number"},
+        {"title":"type","uidt":"SingleLineText"},
+        {"title":"relevance_score","uidt":"Number"},
+        {"title":"status","uidt":"SingleLineText"},
+        {"title":"notes","uidt":"LongText"},
+    ]),
+    ("Outreach_Log", [
+        {"title":"prospect_id","uidt":"Number"},
+        {"title":"email_type","uidt":"SingleLineText"},
+        {"title":"sent_at","uidt":"DateTime"},
+        {"title":"opened_at","uidt":"DateTime"},
+        {"title":"replied_at","uidt":"DateTime"},
+        {"title":"result","uidt":"SingleLineText"},
+    ]),
+    ("X_Engagement_Log", [
+        {"title":"tweet_id","uidt":"SingleLineText"},
+        {"title":"article_id","uidt":"Number"},
+        {"title":"tweet_text","uidt":"LongText"},
+        {"title":"type","uidt":"SingleLineText"},
+        {"title":"likes","uidt":"Number"},
+        {"title":"retweets","uidt":"Number"},
+        {"title":"replies","uidt":"Number"},
+        {"title":"impressions","uidt":"Number"},
+        {"title":"posted_at","uidt":"DateTime"},
+    ]),
+    ("Reddit_Log", [
+        {"title":"post_url","uidt":"URL"},
+        {"title":"subreddit","uidt":"SingleLineText"},
+        {"title":"comment_text","uidt":"LongText"},
+        {"title":"type","uidt":"SingleLineText"},
+        {"title":"upvotes","uidt":"Number"},
+        {"title":"posted_at","uidt":"DateTime"},
+        {"title":"status","uidt":"SingleLineText"},
+    ]),
+    ("Lead_Magnet_Versions", [
+        {"title":"month","uidt":"SingleLineText"},
+        {"title":"title","uidt":"SingleLineText"},
+        {"title":"pdf_url","uidt":"URL"},
+        {"title":"backtest_period","uidt":"SingleLineText"},
+        {"title":"key_stats","uidt":"LongText"},
+        {"title":"beehiiv_updated","uidt":"Checkbox"},
+        {"title":"created_at","uidt":"DateTime"},
+    ]),
+    ("SEO_Rankings", [
+        {"title":"keyword_id","uidt":"Number"},
+        {"title":"date","uidt":"DateTime"},
+        {"title":"position","uidt":"Number"},
+        {"title":"clicks","uidt":"Number"},
+        {"title":"impressions","uidt":"Number"},
+        {"title":"ctr","uidt":"Number"},
+    ]),
+]
+
+for name, cols in TABLES:
+    print("Creating " + name + "...")
+    r = post("/api/v2/meta/bases/" + BASE_ID + "/tables", {"title": name, "columns": cols}, token)
+    if r:
+        tid = r.get("id", "?")
+        print("  OK: " + tid)
+    else:
+        print("  FAILED (may already exist)")
+
+# Get actual table names in postgres for indexes
+print("\nListing postgres tables...")
+r = subprocess.run(["docker","exec","nocodb-nocodb_db-1","psql","-U","nocodb","-d","nocodb",
+    "-t","-c","SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'nc_%' ORDER BY tablename;"],
+    capture_output=True, text=True)
+pg_tables = [t.strip() for t in r.stdout.strip().split("\n") if t.strip()]
+print("  Tables: " + str(pg_tables))
+
+# Find our tables
+kw_table = [t for t in pg_tables if "keyword" in t.lower()]
+art_table = [t for t in pg_tables if "article" in t.lower()]
+cache_table = [t for t in pg_tables if "cache" in t.lower() or "financial" in t.lower()]
+
+print("\nCreating indexes...")
+if kw_table:
+    sql = 'CREATE INDEX IF NOT EXISTS idx_kw_status ON "' + kw_table[0] + '" (status, priority_score DESC, blog);'
+    r = subprocess.run(["docker","exec","nocodb-nocodb_db-1","psql","-U","nocodb","-d","nocodb","-c",sql], capture_output=True, text=True)
+    print("  Keywords idx: " + (r.stdout.strip() or r.stderr.strip()[:100]))
+
+if art_table:
+    sql = 'CREATE INDEX IF NOT EXISTS idx_art_status ON "' + art_table[0] + '" (status, published_at DESC, blog);'
+    r = subprocess.run(["docker","exec","nocodb-nocodb_db-1","psql","-U","nocodb","-d","nocodb","-c",sql], capture_output=True, text=True)
+    print("  Articles status idx: " + (r.stdout.strip() or r.stderr.strip()[:100]))
+
+    sql = 'CREATE INDEX IF NOT EXISTS idx_art_ticker ON "' + art_table[0] + '" (ticker, sector);'
+    r = subprocess.run(["docker","exec","nocodb-nocodb_db-1","psql","-U","nocodb","-d","nocodb","-c",sql], capture_output=True, text=True)
+    print("  Articles ticker idx: " + (r.stdout.strip() or r.stderr.strip()[:100]))
+
+if cache_table:
+    sql = 'CREATE UNIQUE INDEX IF NOT EXISTS idx_cache_uniq ON "' + cache_table[0] + '" (ticker, data_type);'
+    r = subprocess.run(["docker","exec","nocodb-nocodb_db-1","psql","-U","nocodb","-d","nocodb","-c",sql], capture_output=True, text=True)
+    print("  Cache unique idx: " + (r.stdout.strip() or r.stderr.strip()[:100]))
+
+print("\n=== SETUP COMPLETE ===")
+print("NocoDB UI: https://db.earlyinsider.com")
+print("Login: admin@earlyinsider.com")
+print("API Token: Y6HDzDYgJZF-mZXxbRPQuCk961DAhNjPV1MTl8iG")
diff --git a/insiderbuying-site/tests/insiderbuying/nocodb-schema.test.js b/insiderbuying-site/tests/insiderbuying/nocodb-schema.test.js
new file mode 100644
index 0000000..38e75f4
--- /dev/null
+++ b/insiderbuying-site/tests/insiderbuying/nocodb-schema.test.js
@@ -0,0 +1,148 @@
+'use strict';
+
+const fs = require('fs');
+const path = require('path');
+
+/**
+ * Section 01: NocoDB VPS — Schema Definition Tests
+ *
+ * Validates that the setup script defines all 12 required tables
+ * with correct field types. Parses the bash script as a source of truth.
+ */
+
+const SETUP_SCRIPT = fs.readFileSync(
+  path.join(__dirname, '../../docker/nocodb/setup-tables.sh'),
+  'utf8'
+);
+
+// Extract table names from create_table calls
+function extractTableNames(script) {
+  const matches = script.match(/create_table\s+"([^"]+)"/g) || [];
+  return matches.map(m => m.match(/"([^"]+)"/)[1]);
+}
+
+// Extract columns for a table from the JSON block after create_table
+function extractColumns(script, tableName) {
+  const regex = new RegExp(`create_table\\s+"${tableName}"\\s+'\\[([\\s\\S]*?)\\]'`, 'm');
+  const match = script.match(regex);
+  if (!match) return [];
+  try {
+    const jsonStr = '[' + match[1] + ']';
+    return JSON.parse(jsonStr);
+  } catch {
+    // Parse individual objects manually
+    const objMatches = match[1].match(/\{[^}]+\}/g) || [];
+    return objMatches.map(o => {
+      try { return JSON.parse(o); }
+      catch { return null; }
+    }).filter(Boolean);
+  }
+}
+
+// ─────────────────────────────────────────────────────────────────────────────
+describe('section-01: NocoDB schema definitions', () => {
+
+  const REQUIRED_TABLES = [
+    'Keywords', 'Articles', 'Financial_Cache', 'Published_Images',
+    'Data_Studies', 'Insider_Alerts', 'Outreach_Prospects', 'Outreach_Log',
+    'X_Engagement_Log', 'Reddit_Log', 'Lead_Magnet_Versions', 'SEO_Rankings',
+  ];
+
+  test('setup script exists and is not empty', () => {
+    expect(SETUP_SCRIPT.length).toBeGreaterThan(100);
+  });
+
+  test('all 12 required tables are defined', () => {
+    const tables = extractTableNames(SETUP_SCRIPT);
+    for (const t of REQUIRED_TABLES) {
+      expect(tables).toContain(t);
+    }
+    expect(tables.length).toBe(12);
+  });
+
+  describe('Keywords table', () => {
+    test('has required fields', () => {
+      const cols = extractColumns(SETUP_SCRIPT, 'Keywords');
+      const names = cols.map(c => c.title);
+      expect(names).toContain('keyword');
+      expect(names).toContain('ticker');
+      expect(names).toContain('priority_score');
+      expect(names).toContain('status');
+      expect(names).toContain('search_volume');
+    });
+  });
+
+  describe('Articles table', () => {
+    test('has required fields', () => {
+      const cols = extractColumns(SETUP_SCRIPT, 'Articles');
+      const names = cols.map(c => c.title);
+      expect(names).toContain('slug');
+      expect(names).toContain('body_html');
+      expect(names).toContain('verdict_type');
+      expect(names).toContain('status');
+      expect(names).toContain('hero_image_url');
+      expect(names).toContain('seo_score');
+      expect(names).toContain('ai_detection_score');
+    });
+  });
+
+  describe('Financial_Cache table', () => {
+    test('has ticker, data_type, expires_at', () => {
+      const cols = extractColumns(SETUP_SCRIPT, 'Financial_Cache');
+      const names = cols.map(c => c.title);
+      expect(names).toContain('ticker');
+      expect(names).toContain('data_type');
+      expect(names).toContain('expires_at');
+    });
+  });
+
+  describe('Insider_Alerts table', () => {
+    test('has required fields', () => {
+      const cols = extractColumns(SETUP_SCRIPT, 'Insider_Alerts');
+      const names = cols.map(c => c.title);
+      expect(names).toContain('ticker');
+      expect(names).toContain('significance_score');
+      expect(names).toContain('ai_analysis');
+      expect(names).toContain('cluster_id');
+    });
+  });
+
+  describe('Data_Studies table', () => {
+    test('has required fields', () => {
+      const cols = extractColumns(SETUP_SCRIPT, 'Data_Studies');
+      const names = cols.map(c => c.title);
+      expect(names).toContain('title');
+      expect(names).toContain('study_type');
+      expect(names).toContain('status');
+    });
+  });
+
+  describe('docker-compose.yml', () => {
+    const compose = fs.readFileSync(
+      path.join(__dirname, '../../docker/nocodb/docker-compose.yml'),
+      'utf8'
+    );
+
+    test('uses postgres:16', () => {
+      expect(compose).toMatch(/postgres:16/);
+    });
+
+    test('has Traefik labels for HTTPS', () => {
+      expect(compose).toMatch(/traefik\.http\.routers\.nocodb\.tls=true/);
+    });
+
+    test('has health check for postgres', () => {
+      expect(compose).toMatch(/pg_isready/);
+    });
+
+    test('uses external Traefik network', () => {
+      expect(compose).toMatch(/root_default/);
+    });
+
+    test('nocodb_db is not exposed to Traefik', () => {
+      // nocodb_db should NOT have traefik labels
+      const dbSection = compose.split(/nocodb_db:/)[1]?.split(/^volumes:/m)[0] || '';
+      expect(dbSection).not.toMatch(/traefik\.enable/);
+    });
+  });
+});
