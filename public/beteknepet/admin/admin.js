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

async function fetchJson(url, opts){
  const r = await fetch(url, opts);
  const j = await r.json().catch(()=> ({}));
  if(!r.ok) throw new Error(j.error || r.statusText);
  return j;
}

async function getSteg(){
  const base = apiBase();
  return (await fetchJson(base + "/api/beteknepet/steg")).steg || [];
}

async function putSteg(steg){
  const base = apiBase();
  return await fetchJson(base + "/api/beteknepet/steg", {
    method:"PUT",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ steg })
  });
}

let model = { steg: [] };

function uid(prefix="steg"){ return prefix + "_" + Math.random().toString(16).slice(2,10); }

function normalize(){
  model.steg = (model.steg || []).map((s,i)=>({
    id: s.id || uid("steg"),
    title: s.title || "Nytt steg",
    key: s.key || uid("key"),
    order: typeof s.order === "number" ? s.order : (i+1),
    options: Array.isArray(s.options) ? s.options : []
  })).sort((a,b)=>(a.order||0)-(b.order||0));

  model.steg.forEach(s=>{
    s.options = (s.options||[]).map(o=>({
      value: o.value || "",
      label: o.label || "",
      img: o.img || "" // DataURL
    }));
  });
}

function updateJsonBox(){
  normalize();
  $("jsonBox").value = JSON.stringify({ steg: model.steg }, null, 2);
}

function readFileAsDataURL(file){
  return new Promise((resolve,reject)=>{
    const fr = new FileReader();
    fr.onload = ()=>resolve(String(fr.result || ""));
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
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

    const titleRow = document.createElement("div");
    titleRow.className = "stepTitle";

    const inpTitle = document.createElement("input");
    inpTitle.className = "smallInput wTitle";
    inpTitle.placeholder = "Rubrik (t.ex. Vart fiskar du?)";
    inpTitle.value = step.title;
    inpTitle.oninput = ()=>{ step.title = inpTitle.value; updateJsonBox(); };

    const inpKey = document.createElement("input");
    inpKey.className = "smallInput wKey";
    inpKey.placeholder = "key (t.ex. platform)";
    inpKey.value = step.key;
    inpKey.oninput = ()=>{ step.key = inpKey.value; updateJsonBox(); };

    const inpOrder = document.createElement("input");
    inpOrder.className = "smallInput wOrder";
    inpOrder.type = "number";
    inpOrder.value = step.order;
    inpOrder.oninput = ()=>{ step.order = Number(inpOrder.value||0); render(); };

    const btnDel = document.createElement("button");
    btnDel.className = "btn";
    btnDel.textContent = "Ta bort";
    btnDel.onclick = ()=>{
      model.steg = model.steg.filter(x=>x!==step);
      render();
      updateJsonBox();
    };

    titleRow.appendChild(inpTitle);
    titleRow.appendChild(inpKey);
    titleRow.appendChild(inpOrder);
    titleRow.appendChild(btnDel);

    head.appendChild(titleRow);

    const body = document.createElement("div");
    body.className = "stepBody";

    const optsHead = document.createElement("div");
    optsHead.className = "optsHead";
    optsHead.innerHTML = `<div class="hint">Alternativ</div>`;

    const btnAddOpt = document.createElement("button");
    btnAddOpt.className = "btn";
    btnAddOpt.textContent = "+ Lägg till alternativ";
    btnAddOpt.onclick = ()=>{
      step.options.push({ value:"", label:"", img:"" });
      render();
      updateJsonBox();
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
      v.placeholder = "value (t.ex. bat)";
      v.value = opt.value || "";
      v.oninput = ()=>{ opt.value = v.value; updateJsonBox(); };

      const l = document.createElement("input");
      l.className = "smallInput";
      l.placeholder = "Rubrik (t.ex. Från Båt)";
      l.value = opt.label || "";
      l.oninput = ()=>{ opt.label = l.value; updateJsonBox(); };

      row1.appendChild(v);
      row1.appendChild(l);

      const row2 = document.createElement("div");
      row2.className = "optRow";

      const file = document.createElement("input");
      file.type = "file";
      file.accept = "image/*";
      file.className = "smallInput";

      const btnClear = document.createElement("button");
      btnClear.className = "btn";
      btnClear.textContent = "Ta bort bild";
      btnClear.onclick = ()=>{
        opt.img = "";
        prev.style.backgroundImage = "";
        updateJsonBox();
      };

      const btnDelOpt = document.createElement("button");
      btnDelOpt.className = "btn";
      btnDelOpt.textContent = "X";
      btnDelOpt.onclick = ()=>{
        step.options = step.options.filter(x=>x!==opt);
        render();
        updateJsonBox();
      };

      const prev = document.createElement("div");
      prev.className = "optPreview";
      if(opt.img) prev.style.backgroundImage = `url('${opt.img}')`;

      file.onchange = async ()=>{
        if(!file.files || !file.files[0]) return;
        const dataUrl = await readFileAsDataURL(file.files[0]);
        opt.img = dataUrl;     // sparas i MongoDB
        prev.style.backgroundImage = `url('${opt.img}')`;
        updateJsonBox();
      };

      row2.appendChild(file);
      row2.appendChild(btnClear);
      row2.appendChild(btnDelOpt);

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

  updateJsonBox();
}

async function load(){
  setMsg("Hämtar steg...", "");
  try{
    model.steg = await getSteg();
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
    const r = await putSteg(model.steg);
    setMsg("Sparat. Antal steg: " + (r.count ?? model.steg.length), "ok");
  }catch(e){
    setMsg("Fel: " + e.message, "err");
  }
}

$("btnLoad").onclick = load;
$("btnSave").onclick = save;
$("btnAddStep").onclick = ()=>{
  model.steg.push({ id: uid("steg"), title:"Nytt steg", key: uid("key"), order: model.steg.length+1, options:[] });
  render();
};

$("apiPreset").onchange = ()=>{
  const v = $("apiPreset").value;
  $("apiBase").value = PRESETS[v] || $("apiBase").value;
  localStorage.setItem("BK_ADMIN_API_BASE", $("apiBase").value.trim());
};

(function init(){
  const saved = localStorage.getItem("BK_ADMIN_API_BASE") || PRESETS.render;
  $("apiBase").value = saved;
  $("apiPreset").value = saved.includes("localhost") ? "local" : "render";
  load();
})();
