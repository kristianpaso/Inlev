const { useEffect, useMemo, useState } = React;

function useLocalStorageState(key, initialValue){
  const [value, setValue] = useState(() => {
    try{
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : initialValue;
    }catch(e){
      return initialValue;
    }
  });
  useEffect(() => {
    try{ localStorage.setItem(key, JSON.stringify(value)); }catch(e){}
  }, [key, value]);
  return [value, setValue];
}

function App(){
  const [loggedIn, setLoggedIn] = useLocalStorageState("BK_LOGGED_IN", false);
  const [page, setPage] = useState(loggedIn ? "home" : "login");

  useEffect(() => {
    setPage(loggedIn ? "home" : "login");
  }, [loggedIn]);

  const [wizardStep, setWizardStep] = useState(0);
  const [answers, setAnswers] = useState({
    plats: null, // land/bat
    djup: null,  // grunt/medel/djupt
    art: null,   // abborre/gadda/gös/alla
    vatten: null,// klart/medel/grumligt
    tid: null    // morgon/dag/kvall/natt
  });

  const steps = useMemo(() => ([
    {
      key:"plats",
      title:"Hur fiskar du?",
      options:[
        { value:"land", label:"Från Land" },
        { value:"bat", label:"Från Båt" },
      ]
    },
    {
      key:"djup",
      title:"Vad är Djupet?",
      options:[
        { value:"grunt", label:"Grunt" },
        { value:"medel", label:"Medel" },
        { value:"djupt", label:"Djupt" },
      ]
    },
    {
      key:"art",
      title:"Vilken Art?",
      options:[
        { value:"abborre", label:"Abborre" },
        { value:"gadda", label:"Gädda" },
        { value:"gos", label:"Gös" },
        { value:"alla", label:"Alla" },
      ]
    },
    {
      key:"vatten",
      title:"Typ av Vatten?",
      options:[
        { value:"klart", label:"Klart" },
        { value:"medel", label:"Medel" },
        { value:"grumligt", label:"Grumligt" },
      ]
    },
    {
      key:"tid",
      title:"Tid på Dagen?",
      options:[
        { value:"morgon", label:"Morgon" },
        { value:"dag", label:"Dag" },
        { value:"kvall", label:"Kväll" },
        { value:"natt", label:"Natt" },
      ]
    }
  ]), []);

  function startWizard(){
    setWizardStep(0);
    setAnswers({ plats:null, djup:null, art:null, vatten:null, tid:null });
    setPage("wizard");
  }

  function selectOption(stepKey, value){
    setAnswers(prev => ({ ...prev, [stepKey]: value }));
    const next = wizardStep + 1;
    if(next >= steps.length){
      setPage("plan");
    } else {
      setWizardStep(next);
    }
  }

  const crumb = useMemo(() => {
    const parts = [];
    if(answers.plats) parts.push(answers.plats.toUpperCase());
    if(answers.djup) parts.push(answers.djup.toUpperCase());
    if(answers.art) parts.push(answers.art.toUpperCase());
    if(answers.vatten) parts.push(answers.vatten.toUpperCase());
    if(answers.tid) parts.push(answers.tid.toUpperCase());
    return parts.join("  •  ");
  }, [answers]);

  return (
    <div className="bkShell">
      <div className="bkPhone">
        <div className="bkTop">
          <div className="bkBrand">Beteknepet</div>
          <div className="bkSub">Börja fiska • Skapa en plan</div>
        </div>

        {page === "login" && (
          <Login onLogin={() => setLoggedIn(true)} />
        )}

        {page === "home" && (
          <Home
            onStart={startWizard}
            onLure={() => alert("Kommer snart: Hitta rätt drag")}
          />
        )}

        {page === "wizard" && (
          <Wizard
            stepIndex={wizardStep}
            totalSteps={steps.length}
            title={steps[wizardStep].title}
            options={steps[wizardStep].options}
            crumb={crumb}
            onPick={(v)=>selectOption(steps[wizardStep].key, v)}
            onExit={()=>setPage("home")}
          />
        )}

        {page === "plan" && (
          <Plan
            crumb={crumb}
            answers={answers}
            onRestart={startWizard}
            onBackHome={()=>setPage("home")}
          />
        )}
      </div>
    </div>
  );
}

function Login({ onLogin }){
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");

  return (
    <div className="bkPanel">
      <div className="bkTitleBig">Beteknepet</div>

      <div className="bkForm">
        <input className="bkInput" placeholder="Mailadress" value={email} onChange={(e)=>setEmail(e.target.value)} />
        <input className="bkInput" placeholder="Lösenord" type="password" value={pw} onChange={(e)=>setPw(e.target.value)} />
        <button className="bkBtn bkBtnPrimary" onClick={onLogin}>Logga in</button>
        <button className="bkBtn bkBtnGhost" onClick={()=>alert("Registrera ny konto (kommer snart)")}>Registrera ny konto</button>
      </div>
    </div>
  );
}

function Home({ onStart, onLure }){
  return (
    <div className="bkPanel">
      <div className="bkCard">
        <button className="bkBigBtn" onClick={onStart}>
          <div className="bkBigBtnTitle">Börja fiska</div>
          <div className="bkBigBtnSub">Skapa en plan</div>
        </button>

        <button className="bkBigBtn bkBigBtnAlt" onClick={onLure}>
          <div className="bkBigBtnTitle">Hitta rätt drag</div>
          <div className="bkBigBtnSub">Färg / Storlek / Vikt</div>
        </button>
      </div>
    </div>
  );
}

function Wizard({ stepIndex, totalSteps, title, options, crumb, onPick, onExit }){
  return (
    <div className="bkPanel">
      <div className="bkStepTop">
        <div className="bkStepLabel">Börja fiska • Steg {stepIndex+1}/{totalSteps}</div>
        <button className="bkMiniBtn" onClick={onExit}>Avbryt</button>
      </div>

      {crumb ? <div className="bkCrumb">{crumb}</div> : <div className="bkCrumb muted">—</div>}

      <div className="bkQuestion">{title}</div>

      <div className="bkChoices">
        {options.map(o => (
          <button key={o.value} className="bkChoice" onClick={()=>onPick(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Plan({ crumb, answers, onRestart, onBackHome }){
  return (
    <div className="bkPanel">
      <div className="bkStepTop">
        <div className="bkStepLabel">Börja fiska • Planen</div>
        <button className="bkMiniBtn" onClick={onBackHome}>Hem</button>
      </div>

      <div className="bkCrumb">{crumb || "—"}</div>

      <div className="bkPlanHeader">Plan registrerad</div>

      <div className="bkPlanCard">
        <div className="bkPlanBlockTitle">Text om hur du ska fiska</div>
        <div className="bkPlanText">
          • Börja i lugn takt och byt plats/tempo om du inte får kontakt.<br/>
          • Fiska av kanter och övergångar: {answers.djup || "—"}.<br/>
          • Anpassa beten efter vatten: {answers.vatten || "—"}.
        </div>

        <div className="bkPlanBlockTitle" style={{marginTop:12}}>Typ av bete med mera</div>
        <div className="bkPlanText">
          • Spinnare/spinnerbait när det är grumligt eller vind.<br/>
          • Jerkbait i klart vatten (pauser 1–3 sek).<br/>
          • Jig 12–18 cm på kanter.
        </div>
      </div>

      <div className="bkPlanActions">
        <button className="bkBtn bkBtnPrimary" onClick={onRestart}>Skapa ny plan</button>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
