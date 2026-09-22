'use strict';
// Blindagem para a ferramenta de consulta ao banco: SÓ leitura (SELECT/WITH), uma consulta só.
// Bloqueia qualquer verbo de escrita (inclusive dentro de CTE) e força um LIMIT.
const FORBIDDEN = /\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|copy|merge|call|vacuum|analyze|reindex|comment|lock|listen|notify|into|nextval|setval|pg_sleep|dblink|pg_read_file|lo_import|lo_export)\b/i;

function guardSelect(sql, cap = 200) {
  if (typeof sql !== 'string') throw new Error('sql inválido');
  let s = sql.trim().replace(/;+\s*$/, ''); // tira ; final
  if (!s) throw new Error('sql vazio');
  if (s.length > 2000) throw new Error('consulta muito longa');
  if (s.includes(';')) throw new Error('apenas uma consulta por vez');
  if (!/^\s*(select|with)\b/i.test(s)) throw new Error('apenas SELECT é permitido');
  if (FORBIDDEN.test(s)) throw new Error('consulta não permitida (só leitura)');
  if (!/\blimit\s+\d+/i.test(s)) s += ' limit ' + cap;
  return s;
}

module.exports = { guardSelect, FORBIDDEN };
