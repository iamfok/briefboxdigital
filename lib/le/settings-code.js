// Finds and reads the "const S = {...}" block in a workflow's Client Settings Code node.
// Works with strict JSON and with hand-edited JavaScript (unquoted keys, 'single' or `template` strings,
// comments, trailing commas), so workflows edited in n8n can still be linked and updated.

// Returns { start, end, text } of the object literal, or null.
export function findSettings(code) {
  code = String(code || '');
  const m = /\b(?:const|let|var)\s+S\s*=\s*/.exec(code);
  if (!m) return null;
  let i = m.index + m[0].length;
  if (code[i] !== '{') return null;
  const start = i;
  let depth = 0;
  while (i < code.length) {
    const c = code[i];
    if (c === '"' || c === "'" || c === '`') { i = skipString(code, i); continue; }
    if (c === '/' && code[i + 1] === '/') { const n = code.indexOf('\n', i); i = n < 0 ? code.length : n; continue; }
    if (c === '/' && code[i + 1] === '*') { const n = code.indexOf('*/', i + 2); i = n < 0 ? code.length : n + 2; continue; }
    if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') { depth--; if (depth === 0) return { start, end: i + 1, text: code.slice(start, i + 1) }; }
    i++;
  }
  return null;
}
function skipString(s, i) {
  const q = s[i]; i++;
  while (i < s.length && s[i] !== q) { if (s[i] === '\\') i++; i++; }
  return i + 1;
}

// Small JSON5-style parser. Throws an Error with a readable reason.
export function parseLoose(text) {
  let i = 0;
  const s = String(text);
  const fail = msg => { const line = s.slice(0, i).split('\n').length; throw new Error(`${msg} (line ${line} of the settings)`); };
  const ws = () => {
    for (;;) {
      while (i < s.length && /\s/.test(s[i])) i++;
      if (s[i] === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
      if (s[i] === '/' && s[i + 1] === '*') { const n = s.indexOf('*/', i + 2); i = n < 0 ? s.length : n + 2; continue; }
      break;
    }
  };
  const str = () => {
    const q = s[i++]; let out = '';
    while (i < s.length && s[i] !== q) {
      let c = s[i++];
      if (q === '`' && c === '$' && s[i] === '{') fail('A ${...} expression inside the settings cannot be read. Replace it with plain text');
      if (c === '\\') {
        c = s[i++];
        const map = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0' };
        if (c in map) out += map[c];
        else if (c === 'u') { if (s[i] === '{') { const e = s.indexOf('}', i); out += String.fromCodePoint(parseInt(s.slice(i + 1, e), 16)); i = e + 1; } else { out += String.fromCharCode(parseInt(s.slice(i, i + 4), 16)); i += 4; } }
        else if (c === 'x') { out += String.fromCharCode(parseInt(s.slice(i, i + 2), 16)); i += 2; }
        else if (c === '\n') { /* line continuation */ }
        else if (c === '\r') { if (s[i] === '\n') i++; }
        else out += c;
      } else out += c;
    }
    if (s[i] !== q) fail('A text value is not closed');
    i++;
    return out;
  };
  const value = () => {
    ws();
    const c = s[i];
    if (c === '{') {
      i++; const o = {};
      for (;;) {
        ws(); if (s[i] === '}') { i++; return o; }
        let k;
        if (s[i] === '"' || s[i] === "'" || s[i] === '`') k = str();
        else { const m = /^[A-Za-z_$][\w$]*/.exec(s.slice(i)); if (!m) fail('Expected a setting name'); k = m[0]; i += k.length; }
        ws(); if (s[i] !== ':') fail(`Expected ":" after "${k}"`); i++;
        o[k] = value(); ws();
        if (s[i] === ',') { i++; continue; }
        if (s[i] === '}') { i++; return o; }
        fail(`Expected "," or "}" after "${k}"`);
      }
    }
    if (c === '[') {
      i++; const a = [];
      for (;;) {
        ws(); if (s[i] === ']') { i++; return a; }
        a.push(value()); ws();
        if (s[i] === ',') { i++; continue; }
        if (s[i] === ']') { i++; return a; }
        fail('Expected "," or "]" in a list');
      }
    }
    if (c === '"' || c === "'" || c === '`') return str();
    const m = /^(?:true|false|null|undefined|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/.exec(s.slice(i));
    if (!m) fail('Unexpected value "' + s.slice(i, i + 20).split('\n')[0] + '"');
    i += m[0].length;
    return m[0] === 'true' ? true : m[0] === 'false' ? false : m[0] === 'null' || m[0] === 'undefined' ? null : Number(m[0]);
  };
  const v = value(); ws();
  if (i < s.length) fail('Extra text after the settings');
  return v;
}

// { settings } or { error } for a Code node's text
export function readSettingsCode(code) {
  const f = findSettings(code);
  if (!f) return { error: 'No "const S = { ... }" block found in the Client Settings node.' };
  try { return { settings: parseLoose(f.text) }; }
  catch (e) { return { error: e.message }; }
}
