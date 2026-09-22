'use strict';
// Blindagem da ferramenta consulta_banco: SÓ leitura, SÓ nas tabelas da loja.
// A chave é service-role (ignora RLS), então aqui está a única barreira — tem que ser rígida.

// Tabelas que a IA pode ler. Nada de auth/storage/pg_catalog/tokens/afiliados/etc.
const ALLOWED = new Set(['cacife_orders', 'shopee_orders', 'shopee_order_items', 'shopee_returns']);

// Verbos/funções perigosas (escrita, leitura de arquivo, privilégios).
const FORBIDDEN = /\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|copy|merge|call|vacuum|analyze|reindex|comment|lock|listen|notify|into|nextval|setval|pg_sleep|dblink|lo_import|lo_export|current_setting|set_config|pg_read_file|pg_read_binary_file|pg_ls_dir|pg_stat_file|has_table_privilege|has_column_privilege|has_database_privilege)\b/i;

// Nomes/esquemas sensíveis (segredos, PII de sistema, catálogo).
const SENSITIVE = /\b(auth|storage|pg_catalog|information_schema|pg_[a-z_]+)\b|\w*token\w*|secret|credential|password|senha|whatsapp_config|lojista\w*|\busers\b|afiliad\w*|comiss\w*|disparo\w*/i;

function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

function cteNames(s) {
  const names = new Set();
  const re = /(?:\bwith\b|,)\s+"?([a-zA-Z_][\w$]*)"?\s+as\s*\(/gi;
  let m;
  while ((m = re.exec(s))) names.add(m[1].toLowerCase());
  return names;
}

function relations(s) {
  const out = [];
  const re = /\b(?:from|join)\s+"?([a-zA-Z_][\w$]*)"?(?:\s*\.\s*"?([a-zA-Z_][\w$]*)"?)?/gi;
  let m;
  while ((m = re.exec(s))) {
    const schema = m[2] ? m[1].toLowerCase() : null;
    const rel = (m[2] || m[1]).toLowerCase();
    out.push({ schema, rel });
  }
  return out;
}

function guardSelect(sql, cap = 200) {
  if (typeof sql !== 'string') throw new Error('sql inválido');
  let s = stripComments(sql).trim().replace(/;+\s*$/, '');
  if (!s) throw new Error('sql vazio');
  if (s.length > 2000) throw new Error('consulta muito longa');
  if (s.includes(';')) throw new Error('apenas uma consulta por vez');
  if (!/^\s*(select|with)\b/i.test(s)) throw new Error('apenas SELECT é permitido');
  if (FORBIDDEN.test(s)) throw new Error('consulta não permitida (só leitura)');
  if (SENSITIVE.test(s)) throw new Error('consulta acessa dados não permitidos');
  const ctes = cteNames(s);
  const rels = relations(s);
  if (rels.length === 0) throw new Error('consulta precisa referenciar uma tabela permitida');
  for (const { schema, rel } of rels) {
    if (schema && schema !== 'public') throw new Error('esquema não permitido');
    if (!ALLOWED.has(rel) && !ctes.has(rel)) throw new Error('tabela não permitida: ' + rel);
  }
  if (!/\blimit\s+\d+/i.test(s)) s += ' limit ' + cap;
  return s;
}

module.exports = { guardSelect, ALLOWED, FORBIDDEN, SENSITIVE };
