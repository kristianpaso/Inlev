
const fs = require('fs-extra');
const path = require('path');
const dataDir = path.join(__dirname,'..','data');
const file = path.join(dataDir,'shipments.json');
function read(){ if(!fs.existsSync(file)) return {}; return fs.readJsonSync(file); }
function write(obj){ fs.writeJsonSync(file,obj,{spaces:2}); }
function listShipments(req,res){ const db=read(); const user=req.user.sub; res.json(Object.values(db[user]||{})); }
function createShipment(req,res){ const db=read(); const user=req.user.sub; if(!db[user]) db[user]={}; const id=Date.now().toString(); db[user][id]={id,name:req.body.name||id,created:new Date().toISOString(),data:{}}; write(db); res.json(db[user][id]); }
function getShipment(req,res){ const db=read(); const user=req.user.sub; const s=db[user]?.[req.params.id]; if(!s) return res.status(404).json({error:'not_found'}); res.json(s); }
function saveShipment(req,res){ const db=read(); const user=req.user.sub; if(!db[user]) db[user]={}; db[user][req.params.id]={...(db[user][req.params.id]||{}),...req.body}; write(db); res.json({ok:true}); }
module.exports={listShipments,createShipment,getShipment,saveShipment};
