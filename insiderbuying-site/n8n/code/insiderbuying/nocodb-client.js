'use strict';

/**
 * NocoDB REST client — shared helper for all migrated workflow files.
 *
 * Caller pattern (inside n8n Code node):
 *   const nocodb = new NocoDB(env.NOCODB_BASE_URL, env.NOCODB_API_TOKEN,
 *                             env.NOCODB_PROJECT_ID, (url, opts) => fetch(url, opts));
 */
class NocoDB {
  /**
   * @param {string} baseUrl     e.g. "http://localhost:8080"
   * @param {string} token       NocoDB API token (xc-token)
   * @param {string} projectId   NocoDB project/base ID
   * @param {Function} fetchFn   fetch-compatible function (url, opts) => Promise<Response>
   */
  constructor(baseUrl, token, projectId, fetchFn) {
    this.baseUrl = baseUrl;
    this.token = token;
    this.projectId = projectId;
    this.fetchFn = fetchFn;
  }

  // ---------------------------------------------------------------------------
  // Private helper
  // ---------------------------------------------------------------------------

  /**
   * Core HTTP helper with retry on 5xx.
   *
   * @param {string} method   HTTP verb (GET, POST, PATCH, DELETE)
   * @param {string} path     URL path starting with /api/...
   * @param {object} [opts]
   * @param {object} [opts.body]    Request body (will be JSON-serialized)
   * @param {string} [opts.query]  Pre-built query string (without leading ?)
   * @returns {Promise<object>} Parsed JSON response body
   */
  async _req(method, path, opts = {}) {
    const url = `${this.baseUrl}${path}${opts.query ? '?' + opts.query : ''}`;
    const reqOpts = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'xc-token': this.token,
      },
    };
    if (opts.body !== undefined) {
      reqOpts.body = JSON.stringify(opts.body);
    }

    const RETRY_DELAYS = [100, 300, 1000];
    let lastErr;

    for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
      const res = await this.fetchFn(url, reqOpts);

      if (res.ok) {
        return res.json();
      }

      // 404 is special — used by get() to return null; surface immediately
      // 4xx (non-404) are caller errors — do NOT retry
      if (res.status !== 500 && res.status !== 503) {
        const body = await res.text();
        throw new Error(
          `NocoDB ${method} ${path} => ${res.status}: ${body}`
        );
      }

      // 500 or 503 — retry if we have attempts left
      if (attempt < RETRY_DELAYS.length) {
        await _sleep(RETRY_DELAYS[attempt]);
      } else {
        const body = await res.text();
        lastErr = new Error(
          `NocoDB ${method} ${path} => ${res.status}: ${body}`
        );
      }
    }

    throw lastErr;
  }

  // ---------------------------------------------------------------------------
  // Public methods
  // ---------------------------------------------------------------------------

  /**
   * List records from a table.
   *
   * @param {string} table
   * @param {object} [opts]
   * @param {string}  [opts.where]   NocoDB where clause e.g. "(status,eq,active)"
   * @param {number}  [opts.limit]
   * @param {number}  [opts.offset]
   * @param {string}  [opts.sort]    e.g. "-Id" for descending
   * @param {string}  [opts.fields]  comma-separated field names
   * @returns {Promise<{ list: object[], pageInfo: object }>}
   */
  async list(table, opts = {}) {
    const params = new URLSearchParams();
    if (opts.where !== undefined) params.set('where', opts.where);
    if (opts.limit !== undefined) params.set('limit', String(opts.limit));
    if (opts.offset !== undefined) params.set('offset', String(opts.offset));
    if (opts.sort !== undefined) params.set('sort', opts.sort);
    if (opts.fields !== undefined) params.set('fields', opts.fields);
    const query = params.toString();
    const path = `/api/v1/db/data/noco/${this.projectId}/${table}`;
    return this._req('GET', path, query ? { query } : {});
  }

  /**
   * Get a single record by integer ID.
   * Returns null if not found (404) — does NOT throw.
   *
   * @param {string} table
   * @param {number} id
   * @returns {Promise<object|null>}
   */
  async get(table, id) {
    const path = `/api/v1/db/data/noco/${this.projectId}/${table}/${id}`;
    try {
      return await this._req('GET', path);
    } catch (err) {
      if (err.message && err.message.includes('=> 404:')) {
        return null;
      }
      throw err;
    }
  }

  /**
   * Create a record with a flat data object (no { fields: {} } wrapper).
   *
   * @param {string} table
   * @param {object} data  Flat key/value pairs matching NocoDB column names
   * @returns {Promise<object>} Created record including integer Id
   */
  async create(table, data) {
    const path = `/api/v1/db/data/noco/${this.projectId}/${table}`;
    return this._req('POST', path, { body: data });
  }

  /**
   * Partially update a record.
   * Pass ONLY the fields to change — do not spread a full record (system
   * fields like Id and created_at will cause Postgres errors).
   *
   * @param {string} table
   * @param {number} id
   * @param {object} data  Partial update fields
   * @returns {Promise<object>} Updated record
   */
  async update(table, id, data) {
    const path = `/api/v1/db/data/noco/${this.projectId}/${table}/${id}`;
    return this._req('PATCH', path, { body: data });
  }

  /**
   * Delete a record by ID.
   *
   * @param {string} table
   * @param {number} id
   * @returns {Promise<object>} Success response
   */
  async delete(table, id) {
    const path = `/api/v1/db/data/noco/${this.projectId}/${table}/${id}`;
    return this._req('DELETE', path);
  }

  /**
   * Bulk-create records. Chunks into batches of 200 (sequential) to avoid
   * Postgres parameter-limit errors.
   *
   * Bulk endpoint URL differs from single-record URL:
   *   /api/v1/db/data/bulk/noco/{projectId}/{tableName}/  (note /bulk/ and trailing slash)
   *
   * @param {string}   table
   * @param {object[]} records  Array of flat record objects
   * @returns {Promise<object[]>} Flattened array of all created records
   */
  async bulkCreate(table, records) {
    const CHUNK_SIZE = 200;
    const path = `/api/v1/db/data/bulk/noco/${this.projectId}/${table}/`;
    const results = [];

    for (let i = 0; i < records.length; i += CHUNK_SIZE) {
      const chunk = records.slice(i, i + CHUNK_SIZE);
      const created = await this._req('POST', path, { body: chunk });
      if (Array.isArray(created)) {
        results.push(...created);
      }
    }

    return results;
  }

  /**
   * Count records matching an optional where clause.
   *
   * @param {string} table
   * @param {string} [where]  NocoDB where clause
   * @returns {Promise<number>} Integer count (unwrapped from { count: N })
   */
  async count(table, where) {
    const path = `/api/v1/db/data/noco/${this.projectId}/${table}/count`;
    const params = new URLSearchParams();
    if (where) params.set('where', where);
    const query = params.toString();
    const result = await this._req('GET', path, query ? { query } : {});
    return result.count;
  }
}

// ---------------------------------------------------------------------------
// Internal sleep (not exported — only used by _req retry logic)
// ---------------------------------------------------------------------------
function _sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { NocoDB };
