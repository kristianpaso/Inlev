
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const usersFile = path.join(dataDir, 'users.json');
const shipFile = path.join(dataDir, 'shipments.json');

function ensureFiles(){
  if(!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, {recursive:true});
  if(!fs.existsSync(usersFile)){
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync('test', 10);
    fs.writeFileSync(usersFile, JSON.stringify([{username:'Admin', role:'admin', pass: hash}], null, 2));
  }
  if(!fs.existsSync(shipFile)){
    fs.writeFileSync(shipFile, JSON.stringify({ byUser: {} }, null, 2));
  }
}
ensureFiles();

function readJSON(file){ return JSON.parse(fs.readFileSync(file,'utf8')); }
function writeJSON(file, data){ fs.writeFileSync(file, JSON.stringify(data,null,2)); }

function getUsers(){ return readJSON(usersFile); }
function setUsers(list){ writeJSON(usersFile, list); }

function getShipData(){ return readJSON(shipFile); }
function setShipData(obj){ writeJSON(shipFile, obj); }

module.exports = { getUsers, setUsers, getShipData, setShipData };
