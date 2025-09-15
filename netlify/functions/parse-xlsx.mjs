import { buffer } from 'node:stream/consumers';
import { Buffer } from 'node:buffer';
import XLSX from 'xlsx';

function json(status, data){ 
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type':'application/json' } }); 
}

export default async (req) => {
  try{
    if(req.method !== 'POST') return json(405, { error: 'Use POST with binary body' });
    const ab = await req.arrayBuffer();
    const buf = Buffer.from(ab);
    const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
    const names = wb.SheetNames || [];
    if(!names.length) return json(400, { error: 'No sheets found' });
    const first = names[0];
    const ws = wb.Sheets[first];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true, cellDates: true });
    return json(200, { ok:true, sheet:first, sheets:names, rows });
  }catch(e){
    return json(500, { error: String(e && e.message || e) });
  }
}