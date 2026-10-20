/** Read-only query against the preview's local D1: npx tsx e2e/tools/q.ts "select ..." */
import { openLocalD1 } from '../lib/sqlite';

const sql = process.argv[2];
if (!sql || !/^\s*select/i.test(sql)) throw new Error('Pass one SELECT statement');
const db = openLocalD1();
console.log(JSON.stringify(db.prepare(sql).all(), null, 1));
db.close();
