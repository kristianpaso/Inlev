
const express = require('express');
const { authenticate } = require('./auth');
const { getShipData, setShipData } = require('./db');
const router = express.Router();

router.get('/store/ping', (req,res)=> res.json({ok:true}));
router.use(authenticate);

function ensureUser(store, uid){
  store.byUser = store.byUser || {};
  store.byUser[uid] = store.byUser[uid] || { list:[], data:{} };
}

router.get('/store/shipments', (req,res)=>{
  const store=getShipData(); ensureUser(store, req.user.sub);
  res.json(store.byUser[req.user.sub].list);
});

router.post('/store/shipments', (req,res)=>{
  const { name } = req.body||{};
  const store=getShipData(); ensureUser(store, req.user.sub);
  const id = String(Date.now());
  store.byUser[req.user.sub].list.push({id, name: name||`Sändning ${id}`, createdAt: new Date().toISOString()});
  store.byUser[req.user.sub].data[id] = {meta:{number:name||id,start:new Date().toISOString()},linked:[],upp:[],kollin:[],upd:{upp:[],kollin:[]},flags:{cleared:{},everIssue:{}}};
  setShipData(store);
  res.json({id});
});

router.get('/store/shipment/:id', (req,res)=>{
  const id=req.params.id;
  const store=getShipData(); ensureUser(store, req.user.sub);
  const data=store.byUser[req.user.sub].data[id];
  if(!data) return res.status(404).json({error:'not found'});
  res.json(data);
});

router.put('/store/shipment/:id', (req,res)=>{
  const id=req.params.id; const body=req.body;
  const store=getShipData(); ensureUser(store, req.user.sub);
  store.byUser[req.user.sub].data[id]=body;
  setShipData(store);
  res.json({ok:true});
});

module.exports = router;
