diff --git a/insiderbuying-site/n8n/code/insiderbuying/market-hours-guard.js b/insiderbuying-site/n8n/code/insiderbuying/market-hours-guard.js
new file mode 100644
index 0000000..5914431
--- /dev/null
+++ b/insiderbuying-site/n8n/code/insiderbuying/market-hours-guard.js
@@ -0,0 +1,63 @@
+'use strict';
+
+/**
+ * Market-Hours Guard for W4-afterhours workflow.
+ *
+ * Determines whether the current time falls within NYSE market hours
+ * (Mon-Fri 09:30-16:00 ET). Uses Intl.DateTimeFormat for automatic
+ * EST/EDT handling — no manual DST math.
+ *
+ * Used by W4-afterhours to skip execution during market hours
+ * (W4-market handles that window).
+ */
+
+/**
+ * Check if a given Date falls within NYSE market hours.
+ * @param {Date} date - the timestamp to check
+ * @returns {{ isMarketHours: boolean, estHour: number, estMinute: number, weekday: string }}
+ */
+function checkMarketHours(date) {
+  const formatter = new Intl.DateTimeFormat('en-US', {
+    timeZone: 'America/New_York',
+    hour: 'numeric',
+    minute: 'numeric',
+    weekday: 'short',
+    hour12: false,
+  });
+
+  const parts = Object.fromEntries(
+    formatter.formatToParts(date).map(p => [p.type, p.value])
+  );
+
+  const estHour = parseInt(parts.hour, 10);
+  const estMinute = parseInt(parts.minute, 10);
+  const weekday = parts.weekday;
+  const isWeekday = !['Sat', 'Sun'].includes(weekday);
+
+  // NYSE hours: Mon-Fri 09:30 - 16:00 ET
+  // 09:30 <= time < 16:00
+  const afterOpen = estHour > 9 || (estHour === 9 && estMinute >= 30);
+  const beforeClose = estHour < 16;
+  const isMarketHours = isWeekday && afterOpen && beforeClose;
+
+  return { isMarketHours, estHour, estMinute, weekday };
+}
+
+/**
+ * Validate that all required environment variables are set.
+ * Throws with a clear message naming the first missing variable.
+ * @param {string[]} requiredVars - list of env var names
+ * @param {object} env - environment object (e.g., process.env or $env)
+ */
+function validateEnvVars(requiredVars, env) {
+  const missing = requiredVars.filter(name => !env[name]);
+  if (missing.length > 0) {
+    throw new Error(
+      `Missing required environment variable(s): ${missing.join(', ')}`
+    );
+  }
+}
+
+if (typeof module !== 'undefined' && module.exports) {
+  module.exports = { checkMarketHours, validateEnvVars };
+}
diff --git a/insiderbuying-site/n8n/workflows/insiderbuying/w4-afterhours.json b/insiderbuying-site/n8n/workflows/insiderbuying/w4-afterhours.json
new file mode 100644
index 0000000..7bf12bc
--- /dev/null
+++ b/insiderbuying-site/n8n/workflows/insiderbuying/w4-afterhours.json
@@ -0,0 +1,107 @@
+{
+  "name": "EarlyInsider — W4 SEC Monitor (After Hours)",
+  "nodes": [
+    {
+      "parameters": {
+        "rule": { "interval": [{ "field": "cronExpression", "expression": "0 * * * *" }] }
+      },
+      "id": "schedule-trigger",
+      "name": "Schedule Trigger",
+      "type": "n8n-nodes-base.scheduleTrigger",
+      "typeVersion": 1.2,
+      "position": [0, 0]
+    },
+    {
+      "parameters": {
+        "jsCode": "// After-hours guard: skip during NYSE market hours (W4-market handles that)\nconst { checkMarketHours } = require('/home/node/.n8n/code/insiderbuying/market-hours-guard.js');\nconst { isMarketHours } = checkMarketHours(new Date());\nif (isMarketHours) return [];\nreturn [{ json: { afterHours: true } }];"
+      },
+      "id": "guard-afterhours",
+      "name": "After Hours Guard",
+      "type": "n8n-nodes-base.code",
+      "typeVersion": 2,
+      "position": [220, 0]
+    },
+    {
+      "parameters": {
+        "jsCode": "const { runSecMonitor } = require('/home/node/.n8n/code/insiderbuying/sec-monitor.js');\nconst _https = require('https');\nconst _http = require('http');\nconst { URL } = require('url');\n\nfunction fetchFn(urlStr, opts = {}) {\n  return new Promise((resolve, reject) => {\n    const u = new URL(urlStr);\n    const mod = u.protocol === 'https:' ? _https : _http;\n    const reqOpts = { hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: opts.method || 'GET', headers: { ...opts.headers } };\n    if (opts.body) reqOpts.headers['Content-Type'] = reqOpts.headers['Content-Type'] || 'application/json';\n    const req = mod.request(reqOpts, (res) => {\n      const chunks = [];\n      res.on('data', (c) => chunks.push(c));\n      res.on('end', () => {\n        const body = Buffer.concat(chunks).toString();\n        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, json: () => Promise.resolve(JSON.parse(body)), text: () => Promise.resolve(body) });\n      });\n    });\n    req.on('error', reject);\n    if (opts.body) req.write(typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body));\n    req.end();\n  });\n}\n\nfunction sleep(ms) { return new Promise(r => setTimeout(r, ms)); }\n\nconst filings = await runSecMonitor({ fetchFn, sleep, env: $env });\nreturn filings.map(f => ({ json: f }));"
+      },
+      "id": "code-sec-monitor",
+      "name": "sec-monitor",
+      "type": "n8n-nodes-base.code",
+      "typeVersion": 2,
+      "position": [440, 0]
+    },
+    {
+      "parameters": {
+        "jsCode": "const { scoreAlert } = require('/home/node/.n8n/code/insiderbuying/score-alert.js');\nconst _https = require('https');\nconst _http = require('http');\nconst { URL } = require('url');\n\nfunction fetchFn(urlStr, opts = {}) {\n  return new Promise((resolve, reject) => {\n    const u = new URL(urlStr);\n    const mod = u.protocol === 'https:' ? _https : _http;\n    const reqOpts = { hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: opts.method || 'GET', headers: { ...opts.headers } };\n    if (opts.body) reqOpts.headers['Content-Type'] = reqOpts.headers['Content-Type'] || 'application/json';\n    const req = mod.request(reqOpts, (res) => {\n      const chunks = [];\n      res.on('data', (c) => chunks.push(c));\n      res.on('end', () => {\n        const body = Buffer.concat(chunks).toString();\n        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, json: () => Promise.resolve(JSON.parse(body)), text: () => Promise.resolve(body) });\n      });\n    });\n    req.on('error', reject);\n    if (opts.body) req.write(typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body));\n    req.end();\n  });\n}\n\nconst filing = $input.first().json;\nconst scored = await scoreAlert(filing, { fetchFn, env: $env });\nreturn [{ json: scored }];"
+      },
+      "id": "code-score",
+      "name": "score-alert",
+      "type": "n8n-nodes-base.code",
+      "typeVersion": 2,
+      "position": [660, 0]
+    },
+    {
+      "parameters": {
+        "jsCode": "const { analyzeAlert } = require('/home/node/.n8n/code/insiderbuying/analyze-alert.js');\nconst _https = require('https');\nconst _http = require('http');\nconst { URL } = require('url');\n\nfunction fetchFn(urlStr, opts = {}) {\n  return new Promise((resolve, reject) => {\n    const u = new URL(urlStr);\n    const mod = u.protocol === 'https:' ? _https : _http;\n    const reqOpts = { hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: opts.method || 'GET', headers: { ...opts.headers } };\n    if (opts.body) reqOpts.headers['Content-Type'] = reqOpts.headers['Content-Type'] || 'application/json';\n    const req = mod.request(reqOpts, (res) => {\n      const chunks = [];\n      res.on('data', (c) => chunks.push(c));\n      res.on('end', () => {\n        const body = Buffer.concat(chunks).toString();\n        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, json: () => Promise.resolve(JSON.parse(body)), text: () => Promise.resolve(body) });\n      });\n    });\n    req.on('error', reject);\n    if (opts.body) req.write(typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body));\n    req.end();\n  });\n}\n\nconst filing = $input.first().json;\nconst analyzed = await analyzeAlert(filing, { fetchFn, env: $env });\nreturn [{ json: analyzed }];"
+      },
+      "id": "code-analyze",
+      "name": "analyze-alert",
+      "type": "n8n-nodes-base.code",
+      "typeVersion": 2,
+      "position": [880, 0]
+    },
+    {
+      "parameters": {
+        "conditions": {
+          "options": { "caseSensitive": true, "leftValue": "", "typeValidation": "strict" },
+          "conditions": [
+            {
+              "id": "score-check",
+              "leftValue": "={{ $json.significance_score }}",
+              "rightValue": 6,
+              "operator": { "type": "number", "operation": "gte" }
+            }
+          ]
+        }
+      },
+      "id": "if-score",
+      "name": "Score >= 6?",
+      "type": "n8n-nodes-base.if",
+      "typeVersion": 2.2,
+      "position": [1100, 0]
+    },
+    {
+      "parameters": {
+        "jsCode": "const { deliverAlert } = require('/home/node/.n8n/code/insiderbuying/deliver-alert.js');\nconst _https = require('https');\nconst _http = require('http');\nconst { URL } = require('url');\n\nfunction fetchFn(urlStr, opts = {}) {\n  return new Promise((resolve, reject) => {\n    const u = new URL(urlStr);\n    const mod = u.protocol === 'https:' ? _https : _http;\n    const reqOpts = { hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: opts.method || 'GET', headers: { ...opts.headers } };\n    if (opts.body) reqOpts.headers['Content-Type'] = reqOpts.headers['Content-Type'] || 'application/json';\n    const req = mod.request(reqOpts, (res) => {\n      const chunks = [];\n      res.on('data', (c) => chunks.push(c));\n      res.on('end', () => {\n        const body = Buffer.concat(chunks).toString();\n        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, json: () => Promise.resolve(JSON.parse(body)), text: () => Promise.resolve(body) });\n      });\n    });\n    req.on('error', reject);\n    if (opts.body) req.write(typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body));\n    req.end();\n  });\n}\n\nfunction sleep(ms) { return new Promise(r => setTimeout(r, ms)); }\n\nconst filing = $input.first().json;\nconst result = await deliverAlert(filing, { fetchFn, sleep, env: $env });\nreturn [{ json: result }];"
+      },
+      "id": "code-deliver",
+      "name": "deliver-alert",
+      "type": "n8n-nodes-base.code",
+      "typeVersion": 2,
+      "position": [1320, -100]
+    }
+  ],
+  "connections": {
+    "Schedule Trigger": { "main": [[{ "node": "After Hours Guard", "type": "main", "index": 0 }]] },
+    "After Hours Guard": { "main": [[{ "node": "sec-monitor", "type": "main", "index": 0 }]] },
+    "sec-monitor": { "main": [[{ "node": "score-alert", "type": "main", "index": 0 }]] },
+    "score-alert": { "main": [[{ "node": "analyze-alert", "type": "main", "index": 0 }]] },
+    "analyze-alert": { "main": [[{ "node": "Score >= 6?", "type": "main", "index": 0 }]] },
+    "Score >= 6?": {
+      "main": [
+        [{ "node": "deliver-alert", "type": "main", "index": 0 }],
+        []
+      ]
+    }
+  },
+  "settings": {
+    "executionOrder": "v1",
+    "callerPolicy": "workflowsFromSameOwner",
+    "maxConcurrency": 1
+  },
+  "pinData": {},
+  "meta": {
+    "templateCredsSetupCompleted": true
+  }
+}
diff --git a/insiderbuying-site/n8n/workflows/insiderbuying/w4-env-vars.yml b/insiderbuying-site/n8n/workflows/insiderbuying/w4-env-vars.yml
new file mode 100644
index 0000000..bc356b5
--- /dev/null
+++ b/insiderbuying-site/n8n/workflows/insiderbuying/w4-env-vars.yml
@@ -0,0 +1,28 @@
+# W4 SEC Alerts — Required Environment Variables
+# Add these to /docker/n8n/docker-compose.yml under environment:
+#
+# Claude AI (scoring + analysis)
+# ANTHROPIC_API_KEY: "sk-ant-..."
+#
+# Financial Datasets (Form 4 enrichment)
+# FINANCIAL_DATASETS_API_KEY: "..."
+#
+# Supabase (read/write insider_alerts + user preferences)
+# SUPABASE_URL: "https://<project>.supabase.co"
+# SUPABASE_SERVICE_ROLE_KEY: "eyJ..."  # service role key, NOT anon key
+#
+# Airtable InsiderBuying base
+# AIRTABLE_API_KEY: "pat..."
+# AIRTABLE_BASE_ID: "app..."
+# INSIDER_ALERTS_TABLE_ID: "tbl..."
+# MONITOR_STATE_TABLE_ID: "tbl..."
+#
+# Email delivery
+# RESEND_API_KEY: "re_..."
+#
+# Push notifications
+# ONESIGNAL_APP_ID: "..."
+# ONESIGNAL_REST_API_KEY: "..."
+#
+# Error monitoring (Telegram)
+# TELEGRAM_ALERT_CHAT_ID: "-100..."
diff --git a/insiderbuying-site/n8n/workflows/insiderbuying/w4-market.json b/insiderbuying-site/n8n/workflows/insiderbuying/w4-market.json
new file mode 100644
index 0000000..33b33b8
--- /dev/null
+++ b/insiderbuying-site/n8n/workflows/insiderbuying/w4-market.json
@@ -0,0 +1,105 @@
+{
+  "name": "EarlyInsider — W4 SEC Monitor (Market Hours)",
+  "nodes": [
+    {
+      "parameters": {
+        "rule": { "interval": [{ "field": "cronExpression", "expression": "*/15 * * * *" }] }
+      },
+      "id": "schedule-trigger",
+      "name": "Schedule Trigger",
+      "type": "n8n-nodes-base.scheduleTrigger",
+      "typeVersion": 1.2,
+      "position": [0, 0]
+    },
+    {
+      "parameters": {
+        "jsCode": "// Market-hours guard: only proceed during NYSE hours (Mon-Fri 09:30-16:00 ET)\nconst { checkMarketHours } = require('/home/node/.n8n/code/insiderbuying/market-hours-guard.js');\nconst { isMarketHours } = checkMarketHours(new Date());\nif (!isMarketHours) return [];\nreturn [{ json: { marketHours: true } }];"
+      },
+      "id": "guard-market",
+      "name": "Market Hours Guard",
+      "type": "n8n-nodes-base.code",
+      "typeVersion": 2,
+      "position": [220, 0]
+    },
+    {
+      "parameters": {
+        "jsCode": "const { runSecMonitor } = require('/home/node/.n8n/code/insiderbuying/sec-monitor.js');\nconst _https = require('https');\nconst _http = require('http');\nconst { URL } = require('url');\n\nfunction fetchFn(urlStr, opts = {}) {\n  return new Promise((resolve, reject) => {\n    const u = new URL(urlStr);\n    const mod = u.protocol === 'https:' ? _https : _http;\n    const reqOpts = { hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: opts.method || 'GET', headers: { ...opts.headers } };\n    if (opts.body) reqOpts.headers['Content-Type'] = reqOpts.headers['Content-Type'] || 'application/json';\n    const req = mod.request(reqOpts, (res) => {\n      const chunks = [];\n      res.on('data', (c) => chunks.push(c));\n      res.on('end', () => {\n        const body = Buffer.concat(chunks).toString();\n        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, json: () => Promise.resolve(JSON.parse(body)), text: () => Promise.resolve(body) });\n      });\n    });\n    req.on('error', reject);\n    if (opts.body) req.write(typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body));\n    req.end();\n  });\n}\n\nfunction sleep(ms) { return new Promise(r => setTimeout(r, ms)); }\n\nconst filings = await runSecMonitor({ fetchFn, sleep, env: $env });\nreturn filings.map(f => ({ json: f }));"
+      },
+      "id": "code-sec-monitor",
+      "name": "sec-monitor",
+      "type": "n8n-nodes-base.code",
+      "typeVersion": 2,
+      "position": [440, 0]
+    },
+    {
+      "parameters": {
+        "jsCode": "const { scoreAlert } = require('/home/node/.n8n/code/insiderbuying/score-alert.js');\nconst _https = require('https');\nconst _http = require('http');\nconst { URL } = require('url');\n\nfunction fetchFn(urlStr, opts = {}) {\n  return new Promise((resolve, reject) => {\n    const u = new URL(urlStr);\n    const mod = u.protocol === 'https:' ? _https : _http;\n    const reqOpts = { hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: opts.method || 'GET', headers: { ...opts.headers } };\n    if (opts.body) reqOpts.headers['Content-Type'] = reqOpts.headers['Content-Type'] || 'application/json';\n    const req = mod.request(reqOpts, (res) => {\n      const chunks = [];\n      res.on('data', (c) => chunks.push(c));\n      res.on('end', () => {\n        const body = Buffer.concat(chunks).toString();\n        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, json: () => Promise.resolve(JSON.parse(body)), text: () => Promise.resolve(body) });\n      });\n    });\n    req.on('error', reject);\n    if (opts.body) req.write(typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body));\n    req.end();\n  });\n}\n\nconst filing = $input.first().json;\nconst scored = await scoreAlert(filing, { fetchFn, env: $env });\nreturn [{ json: scored }];"
+      },
+      "id": "code-score",
+      "name": "score-alert",
+      "type": "n8n-nodes-base.code",
+      "typeVersion": 2,
+      "position": [660, 0]
+    },
+    {
+      "parameters": {
+        "jsCode": "const { analyzeAlert } = require('/home/node/.n8n/code/insiderbuying/analyze-alert.js');\nconst _https = require('https');\nconst _http = require('http');\nconst { URL } = require('url');\n\nfunction fetchFn(urlStr, opts = {}) {\n  return new Promise((resolve, reject) => {\n    const u = new URL(urlStr);\n    const mod = u.protocol === 'https:' ? _https : _http;\n    const reqOpts = { hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: opts.method || 'GET', headers: { ...opts.headers } };\n    if (opts.body) reqOpts.headers['Content-Type'] = reqOpts.headers['Content-Type'] || 'application/json';\n    const req = mod.request(reqOpts, (res) => {\n      const chunks = [];\n      res.on('data', (c) => chunks.push(c));\n      res.on('end', () => {\n        const body = Buffer.concat(chunks).toString();\n        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, json: () => Promise.resolve(JSON.parse(body)), text: () => Promise.resolve(body) });\n      });\n    });\n    req.on('error', reject);\n    if (opts.body) req.write(typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body));\n    req.end();\n  });\n}\n\nconst filing = $input.first().json;\nconst analyzed = await analyzeAlert(filing, { fetchFn, env: $env });\nreturn [{ json: analyzed }];"
+      },
+      "id": "code-analyze",
+      "name": "analyze-alert",
+      "type": "n8n-nodes-base.code",
+      "typeVersion": 2,
+      "position": [880, 0]
+    },
+    {
+      "parameters": {
+        "conditions": {
+          "options": { "caseSensitive": true, "leftValue": "", "typeValidation": "strict" },
+          "conditions": [
+            {
+              "id": "score-check",
+              "leftValue": "={{ $json.significance_score }}",
+              "rightValue": 6,
+              "operator": { "type": "number", "operation": "gte" }
+            }
+          ]
+        }
+      },
+      "id": "if-score",
+      "name": "Score >= 6?",
+      "type": "n8n-nodes-base.if",
+      "typeVersion": 2.2,
+      "position": [1100, 0]
+    },
+    {
+      "parameters": {
+        "jsCode": "const { deliverAlert } = require('/home/node/.n8n/code/insiderbuying/deliver-alert.js');\nconst _https = require('https');\nconst _http = require('http');\nconst { URL } = require('url');\n\nfunction fetchFn(urlStr, opts = {}) {\n  return new Promise((resolve, reject) => {\n    const u = new URL(urlStr);\n    const mod = u.protocol === 'https:' ? _https : _http;\n    const reqOpts = { hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: opts.method || 'GET', headers: { ...opts.headers } };\n    if (opts.body) reqOpts.headers['Content-Type'] = reqOpts.headers['Content-Type'] || 'application/json';\n    const req = mod.request(reqOpts, (res) => {\n      const chunks = [];\n      res.on('data', (c) => chunks.push(c));\n      res.on('end', () => {\n        const body = Buffer.concat(chunks).toString();\n        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, json: () => Promise.resolve(JSON.parse(body)), text: () => Promise.resolve(body) });\n      });\n    });\n    req.on('error', reject);\n    if (opts.body) req.write(typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body));\n    req.end();\n  });\n}\n\nfunction sleep(ms) { return new Promise(r => setTimeout(r, ms)); }\n\nconst filing = $input.first().json;\nconst result = await deliverAlert(filing, { fetchFn, sleep, env: $env });\nreturn [{ json: result }];"
+      },
+      "id": "code-deliver",
+      "name": "deliver-alert",
+      "type": "n8n-nodes-base.code",
+      "typeVersion": 2,
+      "position": [1320, -100]
+    }
+  ],
+  "connections": {
+    "Schedule Trigger": { "main": [[{ "node": "Market Hours Guard", "type": "main", "index": 0 }]] },
+    "Market Hours Guard": { "main": [[{ "node": "sec-monitor", "type": "main", "index": 0 }]] },
+    "sec-monitor": { "main": [[{ "node": "score-alert", "type": "main", "index": 0 }]] },
+    "score-alert": { "main": [[{ "node": "analyze-alert", "type": "main", "index": 0 }]] },
+    "analyze-alert": { "main": [[{ "node": "Score >= 6?", "type": "main", "index": 0 }]] },
+    "Score >= 6?": {
+      "main": [
+        [{ "node": "deliver-alert", "type": "main", "index": 0 }],
+        []
+      ]
+    }
+  },
+  "settings": {
+    "executionOrder": "v1"
+  },
+  "pinData": {},
+  "meta": {
+    "templateCredsSetupCompleted": true
+  }
+}
diff --git a/insiderbuying-site/tests/insiderbuying/market-hours-guard.test.js b/insiderbuying-site/tests/insiderbuying/market-hours-guard.test.js
new file mode 100644
index 0000000..38c05f6
--- /dev/null
+++ b/insiderbuying-site/tests/insiderbuying/market-hours-guard.test.js
@@ -0,0 +1,131 @@
+'use strict';
+
+const {
+  checkMarketHours,
+  validateEnvVars,
+} = require('../../n8n/code/insiderbuying/market-hours-guard');
+
+// ─────────────────────────────────────────────────────────────────────────────
+describe('section-07: market-hours-guard', () => {
+
+  // ── checkMarketHours ──────────────────────────────────────────────────────
+
+  describe('checkMarketHours()', () => {
+
+    test('Monday 10:00 ET = market hours → should exit', () => {
+      // March 23 2026 is EDT (UTC-4). 10:00 EDT = 14:00 UTC
+      const result = checkMarketHours(new Date('2026-03-23T14:00:00Z'));
+      expect(result.isMarketHours).toBe(true);
+      expect(result.estHour).toBe(10);
+      expect(result.weekday).toBe('Mon');
+    });
+
+    test('Monday 20:00 ET = afterhours → should proceed', () => {
+      // 20:00 EDT = 00:00 UTC March 24
+      const result = checkMarketHours(new Date('2026-03-24T00:00:00Z'));
+      expect(result.isMarketHours).toBe(false);
+      expect(result.estHour).toBe(20);
+    });
+
+    test('Saturday 10:00 ET = weekend → should proceed', () => {
+      // Saturday March 28 2026. 10:00 EDT = 14:00 UTC
+      const result = checkMarketHours(new Date('2026-03-28T14:00:00Z'));
+      expect(result.isMarketHours).toBe(false);
+      expect(result.weekday).toBe('Sat');
+    });
+
+    test('Monday 09:29 ET = before open → should proceed (afterhours)', () => {
+      // 09:29 EDT = 13:29 UTC
+      const result = checkMarketHours(new Date('2026-03-23T13:29:00Z'));
+      expect(result.isMarketHours).toBe(false);
+      expect(result.estHour).toBe(9);
+      expect(result.estMinute).toBe(29);
+    });
+
+    test('Monday 09:30 ET = exact open → market hours', () => {
+      // 09:30 EDT = 13:30 UTC
+      const result = checkMarketHours(new Date('2026-03-23T13:30:00Z'));
+      expect(result.isMarketHours).toBe(true);
+      expect(result.estHour).toBe(9);
+      expect(result.estMinute).toBe(30);
+    });
+
+    test('Monday 16:00 ET = exact close → NOT market hours (close boundary)', () => {
+      // 16:00 EDT = 20:00 UTC
+      const result = checkMarketHours(new Date('2026-03-23T20:00:00Z'));
+      expect(result.isMarketHours).toBe(false);
+      expect(result.estHour).toBe(16);
+    });
+
+    test('Monday 15:59 ET = last minute of market hours', () => {
+      // 15:59 EDT = 19:59 UTC
+      const result = checkMarketHours(new Date('2026-03-23T19:59:00Z'));
+      expect(result.isMarketHours).toBe(true);
+      expect(result.estHour).toBe(15);
+    });
+
+    test('Sunday 12:00 ET = weekend → not market hours', () => {
+      // Sunday March 22 2026, 12:00 EDT = 16:00 UTC
+      const result = checkMarketHours(new Date('2026-03-22T16:00:00Z'));
+      expect(result.isMarketHours).toBe(false);
+      expect(result.weekday).toBe('Sun');
+    });
+
+    test('handles DST transition correctly (EST in November)', () => {
+      // November 2 2026 is EST (clocks fall back Nov 1)
+      // 10:00 EST = 15:00 UTC (EST = UTC-5)
+      const result = checkMarketHours(new Date('2026-11-02T15:00:00Z'));
+      expect(result.isMarketHours).toBe(true);
+      expect(result.estHour).toBe(10);
+    });
+
+    test('Friday 14:00 ET = market hours', () => {
+      // Friday March 27 2026, 14:00 EDT = 18:00 UTC
+      const result = checkMarketHours(new Date('2026-03-27T18:00:00Z'));
+      expect(result.isMarketHours).toBe(true);
+      expect(result.weekday).toBe('Fri');
+    });
+  });
+
+  // ── validateEnvVars ───────────────────────────────────────────────────────
+
+  describe('validateEnvVars()', () => {
+
+    test('does not throw when all vars present', () => {
+      const env = {
+        ANTHROPIC_API_KEY: 'sk-ant-xxx',
+        SUPABASE_URL: 'https://example.supabase.co',
+        RESEND_API_KEY: 're_xxx',
+      };
+      expect(() =>
+        validateEnvVars(['ANTHROPIC_API_KEY', 'SUPABASE_URL', 'RESEND_API_KEY'], env)
+      ).not.toThrow();
+    });
+
+    test('throws naming the missing variable', () => {
+      const env = {
+        ANTHROPIC_API_KEY: 'sk-ant-xxx',
+        SUPABASE_URL: '',
+      };
+      expect(() =>
+        validateEnvVars(['ANTHROPIC_API_KEY', 'SUPABASE_URL', 'RESEND_API_KEY'], env)
+      ).toThrow('SUPABASE_URL');
+    });
+
+    test('throws naming all missing variables', () => {
+      const env = {};
+      expect(() =>
+        validateEnvVars(['ANTHROPIC_API_KEY', 'RESEND_API_KEY'], env)
+      ).toThrow('ANTHROPIC_API_KEY, RESEND_API_KEY');
+    });
+
+    test('treats empty string as missing', () => {
+      const env = { KEY: '' };
+      expect(() => validateEnvVars(['KEY'], env)).toThrow('KEY');
+    });
+
+    test('passes with no required vars', () => {
+      expect(() => validateEnvVars([], {})).not.toThrow();
+    });
+  });
+});
diff --git a/insiderbuying-site/tests/insiderbuying/workflow-config.test.js b/insiderbuying-site/tests/insiderbuying/workflow-config.test.js
new file mode 100644
index 0000000..e93a008
--- /dev/null
+++ b/insiderbuying-site/tests/insiderbuying/workflow-config.test.js
@@ -0,0 +1,130 @@
+'use strict';
+
+const fs = require('fs');
+const path = require('path');
+
+const WORKFLOW_DIR = path.join(__dirname, '../../n8n/workflows/insiderbuying');
+
+// ─────────────────────────────────────────────────────────────────────────────
+describe('section-07: workflow configuration', () => {
+
+  // ── W4-market ─────────────────────────────────────────────────────────────
+
+  describe('w4-market.json', () => {
+    let wf;
+    beforeAll(() => {
+      wf = JSON.parse(fs.readFileSync(path.join(WORKFLOW_DIR, 'w4-market.json'), 'utf8'));
+    });
+
+    test('has a valid name', () => {
+      expect(wf.name).toMatch(/market/i);
+    });
+
+    test('schedule trigger fires every 15 min', () => {
+      const trigger = wf.nodes.find(n => n.type === 'n8n-nodes-base.scheduleTrigger');
+      expect(trigger).toBeDefined();
+      const cron = trigger.parameters.rule.interval[0].expression;
+      expect(cron).toBe('*/15 * * * *');
+    });
+
+    test('has market hours guard node', () => {
+      const guard = wf.nodes.find(n => n.id === 'guard-market');
+      expect(guard).toBeDefined();
+      expect(guard.parameters.jsCode).toMatch(/checkMarketHours/);
+      // W4-market: exits if NOT market hours
+      expect(guard.parameters.jsCode).toMatch(/!isMarketHours/);
+    });
+
+    test('node chain: trigger → guard → sec-monitor → score → analyze → IF → deliver', () => {
+      const conn = wf.connections;
+      expect(conn['Schedule Trigger'].main[0][0].node).toBe('Market Hours Guard');
+      expect(conn['Market Hours Guard'].main[0][0].node).toBe('sec-monitor');
+      expect(conn['sec-monitor'].main[0][0].node).toBe('score-alert');
+      expect(conn['score-alert'].main[0][0].node).toBe('analyze-alert');
+      expect(conn['analyze-alert'].main[0][0].node).toBe('Score >= 6?');
+      expect(conn['Score >= 6?'].main[0][0].node).toBe('deliver-alert');
+    });
+
+    test('IF node checks significance_score >= 6', () => {
+      const ifNode = wf.nodes.find(n => n.type === 'n8n-nodes-base.if');
+      expect(ifNode).toBeDefined();
+      const cond = ifNode.parameters.conditions.conditions[0];
+      expect(cond.leftValue).toMatch(/significance_score/);
+      expect(cond.rightValue).toBe(6);
+      expect(cond.operator.operation).toBe('gte');
+    });
+
+    test('has all required Code nodes', () => {
+      const codeNodes = wf.nodes.filter(n => n.type === 'n8n-nodes-base.code');
+      const names = codeNodes.map(n => n.name);
+      expect(names).toContain('sec-monitor');
+      expect(names).toContain('score-alert');
+      expect(names).toContain('analyze-alert');
+      expect(names).toContain('deliver-alert');
+    });
+  });
+
+  // ── W4-afterhours ─────────────────────────────────────────────────────────
+
+  describe('w4-afterhours.json', () => {
+    let wf;
+    beforeAll(() => {
+      wf = JSON.parse(fs.readFileSync(path.join(WORKFLOW_DIR, 'w4-afterhours.json'), 'utf8'));
+    });
+
+    test('has a valid name', () => {
+      expect(wf.name).toMatch(/after.*hour/i);
+    });
+
+    test('schedule trigger fires every 60 min', () => {
+      const trigger = wf.nodes.find(n => n.type === 'n8n-nodes-base.scheduleTrigger');
+      expect(trigger).toBeDefined();
+      const cron = trigger.parameters.rule.interval[0].expression;
+      expect(cron).toBe('0 * * * *');
+    });
+
+    test('has afterhours guard that skips market hours', () => {
+      const guard = wf.nodes.find(n => n.id === 'guard-afterhours');
+      expect(guard).toBeDefined();
+      expect(guard.parameters.jsCode).toMatch(/checkMarketHours/);
+      // W4-afterhours: exits if IS market hours
+      expect(guard.parameters.jsCode).toMatch(/isMarketHours.*return \[\]/s);
+    });
+
+    test('wait-for-previous-execution via maxConcurrency setting', () => {
+      // n8n settings.maxConcurrency = 1 prevents overlapping executions
+      expect(wf.settings.maxConcurrency).toBe(1);
+    });
+
+    test('node chain: trigger → guard → sec-monitor → score → analyze → IF → deliver', () => {
+      const conn = wf.connections;
+      expect(conn['Schedule Trigger'].main[0][0].node).toBe('After Hours Guard');
+      expect(conn['After Hours Guard'].main[0][0].node).toBe('sec-monitor');
+      expect(conn['sec-monitor'].main[0][0].node).toBe('score-alert');
+      expect(conn['score-alert'].main[0][0].node).toBe('analyze-alert');
+      expect(conn['analyze-alert'].main[0][0].node).toBe('Score >= 6?');
+      expect(conn['Score >= 6?'].main[0][0].node).toBe('deliver-alert');
+    });
+
+    test('has all required Code nodes', () => {
+      const codeNodes = wf.nodes.filter(n => n.type === 'n8n-nodes-base.code');
+      const names = codeNodes.map(n => n.name);
+      expect(names).toContain('sec-monitor');
+      expect(names).toContain('score-alert');
+      expect(names).toContain('analyze-alert');
+      expect(names).toContain('deliver-alert');
+    });
+  });
+
+  // ── Env var validation in sec-monitor ─────────────────────────────────────
+
+  describe('env var fail-fast', () => {
+    test('sec-monitor.js exports REQUIRED_ENV array', () => {
+      const { REQUIRED_ENV } = require('../../n8n/code/insiderbuying/sec-monitor');
+      expect(Array.isArray(REQUIRED_ENV)).toBe(true);
+      expect(REQUIRED_ENV.length).toBeGreaterThan(0);
+      expect(REQUIRED_ENV).toContain('FINANCIAL_DATASETS_API_KEY');
+      expect(REQUIRED_ENV).toContain('SUPABASE_URL');
+    });
+  });
+});
