const $ = (id)=>document.getElementById(id);

const PRESETS = {
  local: "http://localhost:5005",
  render: "https://beteknepet-api.onrender.com",
};

function setMsg(text, kind){
  const el = $("msg");
  el.textContent = text || "";
  el.className = "msg" + (kind ? (" " + kind) : "");
}

function apiBase(){
  const v = $("apiBase").value.trim().replace(/\/$/,"");
  localStorage.setItem("BK_ADMIN_API_BASE", v);
  return v;
}

function api(){
  const base = apiBase();
  return {
    async getSteps(){
      const r = await fetch(base + "/api/beteknepet/steg");
      const j = await r.json().catch(()=> ({}));
      if(!r.ok) throw new Error(j.error || r.statusText);
      return Array.isArray(j.steg) ? j.steg : [];
    },
    async putSteps(steg){
      const r = await fetch(base + "/api/beteknepet/steg", {
        method:"PUT",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ steg })
      });
      const j = await r.json().catch(()=> ({}));
      if(!r.ok) throw new Error(j.error || r.statusText);
      return j;
    }
  };
}

let model = { steg: [] };

function uid(prefix="steg"){
  return prefix + "_" + Math.random().toString(16).slice(2,10);
}

function normalize(){
  model.steg = (model.steg || []).map((s,i)=>({
    id: s.id || uid("steg"),
    title: s.title || "Nytt steg",
    key: s.key || uid("key"),
    order: typeof s.order === "number" ? s.order : (i+1),
    options: Array.isArray(s.options) ? s.options : []
  })).sort((a,b)=> (a.order||0)-(b.order||0));
}

function render(){
  normalize();
  const wrap = $("stepsList");
  wrap.innerHTML = "";
  model.steg.forEach((step)=>{
    const card = document.createElement("div");
    card.className = "stepCard";

    const head = document.createElement("div");
    head.className = "stepHead";

    const title = document.createElement("div");
    title.className = "stepTitle";
    title.textContent = `${step.order}. ${step.title}`;

    const meta = document.createElement("div");
    meta.className = "stepMeta";

    const inpTitle = document.createElement("input");
    inpTitle.className = "smallInput w160";
    inpTitle.value = step.title;
    inpTitle.placeholder = "Titel";
    inpTitle.oninput = ()=>{ step.title = inpTitle.value; title.textContent = `${step.order}. ${step.title}`; };

    const inpKey = document.createElement("input");
    inpKey.className = "smallInput w160";
    inpKey.value = step.key;
    inpKey.placeholder = "key (frontend state)";
    inpKey.oninput = ()=>{ step.key = inpKey.value; };

    const inpOrder = document.createElement("input");
    inpOrder.className = "smallInput w90";
    inpOrder.type = "number";
    inpOrder.value = step.order;
    inpOrder.oninput = ()=>{ step.order = Number(inpOrder.value||0); render(); };

    const btnDel = document.createElement("button");
    btnDel.className = "btn";
    btnDel.textContent = "Ta bort";
    btnDel.onclick = ()=>{
      model.steg = model.steg.filter(x=>x!==step);
      render();
    };

    meta.appendChild(inpTitle);
    meta.appendChild(inpKey);
    meta.appendChild(inpOrder);
    meta.appendChild(btnDel);

    head.appendChild(title);
    head.appendChild(meta);

    const body = document.createElement("div");
    body.className = "stepBody";

    const optsHead = document.createElement("div");
    optsHead.className = "optsHead";
    optsHead.innerHTML = `<div class="hint">Alternativ</div>`;
    const btnAddOpt = document.createElement("button");
    btnAddOpt.className = "btn";
    btnAddOpt.textContent = "+ Alternativ";
    btnAddOpt.onclick = ()=>{
      step.options.push({ value:"", label:"", img:"" });
      render();
    };
    optsHead.appendChild(btnAddOpt);

    const grid = document.createElement("div");
    grid.className = "optionsGrid";

    step.options.forEach((opt)=>{
      const oc = document.createElement("div");
      oc.className = "optCard";

      const row1 = document.createElement("div");
      row1.className = "optRow";

      const v = document.createElement("input");
      v.className = "smallInput";
      v.placeholder = "value";
      v.value = opt.value || "";
      v.oninput = ()=> opt.value = v.value;

      const l = document.createElement("input");
      l.className = "smallInput";
      l.placeholder = "label";
      l.value = opt.label || "";
      l.oninput = ()=> opt.label = l.value;

      row1.appendChild(v);
      row1.appendChild(l);

      const row2 = document.createElement("div");
      row2.className = "optRow";

      const img = document.createElement("input");
      img.className = "smallInput";
      img.placeholder = "img url (ex /beteknepet/assets/gadda.png)";
      img.value = opt.img || "";
      img.oninput = ()=>{
        opt.img = img.value;
        prev.style.backgroundImage = opt.img ? `url('${opt.img}')` : "";
      };

      const btnDelOpt = document.createElement("button");
      btnDelOpt.className = "btn";
      btnDelOpt.textContent = "X";
      btnDelOpt.onclick = ()=>{
        step.options = step.options.filter(x=>x!==opt);
        render();
      };

      row2.appendChild(img);
      row2.appendChild(btnDelOpt);

      const prev = document.createElement("div");
      prev.className = "optPreview";
      prev.style.backgroundImage = opt.img ? `url('${opt.img}')` : "";

      oc.appendChild(row1);
      oc.appendChild(row2);
      oc.appendChild(prev);
      grid.appendChild(oc);
    });

    body.appendChild(optsHead);
    body.appendChild(grid);

    card.appendChild(head);
    card.appendChild(body);
    wrap.appendChild(card);
  });

  $("jsonBox").value = JSON.stringify({ steg: model.steg }, null, 2);
}

async function load(){
  setMsg("Hämtar steg...", "");
  try{
    const steg = await api().getSteps();
    model.steg = steg;
    render();
    setMsg("Hämtat.", "ok");
  }catch(e){
    setMsg("Fel: " + e.message, "err");
  }
}

async function save(){
  setMsg("Sparar...", "");
  try{
    normalize();
    const r = await api().putSteps(model.steg);
    setMsg("Sparat. Antal steg: " + (r.count ?? model.steg.length), "ok");
  }catch(e){
    setMsg("Fel: " + e.message, "err");
  }
}

$("btnLoad").onclick = load;
$("btnSave").onclick = save;

$("btnAddStep").onclick = ()=>{
  model.steg.push({ id: uid("steg"), title:"Nytt steg", key: uid("key"), order: (model.steg.length+1), options:[] });
  render();
};

$("btnExport").onclick = ()=>{
  $("jsonBox").value = JSON.stringify({ steg: model.steg }, null, 2);
  setMsg("Exporterat JSON.", "ok");
};

$("btnImport").onclick = ()=>{
  try{
    const parsed = JSON.parse($("jsonBox").value || "{}");
    if(!Array.isArray(parsed.steg)) throw new Error("JSON måste ha { steg: [...] }");
    model.steg = parsed.steg;
    render();
    setMsg("Importerad JSON (ej sparad ännu).", "ok");
  }catch(e){
    setMsg("Fel: " + e.message, "err");
  }
};

$("apiPreset").onchange = ()=>{
  const v = $("apiPreset").value;
  $("apiBase").value = PRESETS[v] || $("apiBase").value;
};

(function init(){
  const saved = localStorage.getItem("BK_ADMIN_API_BASE") || PRESETS.render;
  $("apiBase").value = saved;
  $("apiPreset").value = saved.includes("localhost") ? "local" : "render";
  load();
})();
