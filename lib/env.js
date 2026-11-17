// Settings the server needs, read from the database (set in the admin) with environment variables as overrides.
import { all, envVar } from './db.js';
import { encryptJSON, decryptJSON } from './auth.js';

export async function appEnv(d) {
  const cfg = Object.fromEntries((await all(d, 'SELECT key, value FROM config')).map(r => [r.key, r.value]));
  const env = {
    DB: d,
    SESSION_SECRET: envVar('SESSION_SECRET') || cfg.session_secret,
    SETTINGS_KEY: envVar('SETTINGS_KEY') || cfg.settings_key,
    CRON_SECRET: envVar('CRON_SECRET') || cfg.cron_secret,
    N8N_URL: envVar('N8N_URL') || cfg.n8n_url || '',
    TEMPLATE_WORKFLOW_ID: envVar('TEMPLATE_WORKFLOW_ID') || cfg.template_workflow_id || '',
    N8N_API_KEY: envVar('N8N_API_KEY'),
    ADMIN_SETUP_CODE: envVar('ADMIN_SETUP_CODE'),
  };
  if (!env.N8N_API_KEY && cfg.n8n_api_key_enc) {
    try { env.N8N_API_KEY = (await decryptJSON(env, cfg.n8n_api_key_enc)).k || ''; } catch (e) { env.N8N_API_KEY = ''; }
  }
  env.fromEnv = { N8N_URL: !!envVar('N8N_URL'), N8N_API_KEY: !!envVar('N8N_API_KEY'), TEMPLATE_WORKFLOW_ID: !!envVar('TEMPLATE_WORKFLOW_ID') };
  return env;
}

export const encryptSecret = (env, value) => encryptJSON(env, { k: String(value || '') });
