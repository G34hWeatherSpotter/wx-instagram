// caption.js
// Client-side caption generator for GitHub Pages
// Extended: includes image suggestion generator.

(async function(){
  const EMOJI_MAP = {
    sun: "☀️", cloud: "☁️", rain: "🌧️", showers: "🌦️",
    thunder: "⛈️", snow: "❄️", wind: "🌬️", fog: "🌫️", cold: "🧊", hot: "🔥"
  };
  const HASHTAGS_BASE = ["#weather","#forecast","#localweather"];

  const el = id => document.getElementById(id);
  const q = s => document.querySelector(s);

  const input = el("input-loc");
  const daysSel = el("input-days");
  const btn = el("btn-generate");
  const results = el("results");
  const placeTitle = el("place-title");
  const shortCap = el("short-caption");
  const longCap = el("long-caption");
  const altText = el("alt-text");
  const imageSuggestions = el("image-suggestions");
  const alertsBlock = el("alerts-block");
  const alertsList = el("alerts-list");
  const updatedTs = el("updated-ts");

  document.addEventListener("click", e=>{
    const btn = e.target.closest("button.copy");
    if(!btn) return;
    const target=el(btn.dataset.target);
    navigator.clipboard.writeText(target.innerText).then(()=> {
      const prev = btn.innerText;
      btn.innerText = "Copied";
      setTimeout(()=> btn.innerText = prev,1200);
    });
  });

  function detectConditions(text){
    const t = text.toLowerCase();
    const flags = new Set();
    if(/thunder|t-storm|thunderstorm/.test(t)) flags.add("thunder");
    if(/rain|showers|drizzle/.test(t)) flags.add("rain");
    if(/snow|flurr|sleet/.test(t)) flags.add("snow");
    if(/fog|mist|haze/.test(t)) flags.add("fog");
    if(/wind|gust/.test(t)) flags.add("wind");
    if(/sunny|clear|mostly sunny/.test(t)) flags.add("sun");
    if(/cloudy|mostly cloudy|partly cloudy/.test(t)) flags.add("cloud");
    return Array.from(flags);
  }

  function emojiForFlags(flags){
    const set = new Set(flags);
    const out=[];
    if(set.has("thunder")) out.push(EMOJI_MAP.thunder);
    if(set.has("rain") && !set.has("thunder")) out.push(EMOJI_MAP.rain);
    if(set.has("snow")) out.push(EMOJI_MAP.snow);
    if(set.has("sun") && out.length===0) out.push(EMOJI_MAP.sun);
    if(set.has("cloud") && out.length===0) out.push(EMOJI_MAP.cloud);
    if(set.has("wind")) out.push(EMOJI_MAP.wind);
    if(set.has("fog")) out.push(EMOJI_MAP.fog);
    return out.join(" ") || EMOJI_MAP.cloud;
  }

  function cacheGet(key){
    try{
      const raw = localStorage.getItem(key);
      if(!raw) return null;
      const obj = JSON.parse(raw);
      if(Date.now() - obj.ts > (1000*60*10)) { localStorage.removeItem(key); return null; } // 10m
      return obj.val;
    }catch(e){return null}
  }
  function cacheSet(key,val){
    try{ localStorage.setItem(key, JSON.stringify({ts:Date.now(), val})); }catch(e){}
  }

  async function zipToLatLon(zip){
    const cached = cacheGet("zip:"+zip);
    if(cached) return cached;
    const r = await fetch(`https://api.zippopotam.us/us/${zip}`);
    if(!r.ok) throw new Error("ZIP lookup failed");
    const data = await r.json();
    const p = data.places[0];
    const lat = parseFloat(p.latitude), lon = parseFloat(p.longitude);
    const place = `${p['place name']}, ${data['state abbreviation']||data['country abbreviation']||''}`;
    const out = {lat,lon,place};
    cacheSet("zip:"+zip,out);
    return out;
  }

  async function fetchNwsPoint(lat,lon){
    const key = `point:${lat.toFixed(3)},${lon.toFixed(3)}`;
    const cached = cacheGet(key);
    if(cached) return cached;
    const r = await fetch(`https://api.weather.gov/points/${lat},${lon}`);
    if(!r.ok) throw new Error("NWS points lookup failed");
    const data = await r.json();
    cacheSet(key,data);
    return data;
  }

  async function fetchNwsForecast(url){
    const cached = cacheGet("forecast:"+url);
    if(cached) return cached;
    const r = await fetch(url);
    if(!r.ok) throw new Error("NWS forecast fetch failed");
    const data = await r.json();
    cacheSet("forecast:"+url,data.properties.periods);
    return data.properties.periods;
  }

  async function fetchNwsAlerts(lat,lon){
    const key = `alerts:${lat.toFixed(3)},${lon.toFixed(3)}`;
    const cached = cacheGet(key);
    if(cached) return cached;
    const r = await fetch(`https://api.weather.gov/alerts/active?point=${lat},${lon}`);
    if(!r.ok) return [];
    const data = await r.json();
    cacheSet(key,data.features);
    return data.features;
  }

  function aggregateDays(periods, days){
    const now = new Date();
    const cutoff = new Date(now.getTime() + days*24*3600*1000);
    const groups = {};
    for(const p of periods){
      const start = new Date(p.startTime);
      if(start < now) continue;
      if(start > cutoff) continue;
      const key = start.toISOString().slice(0,10);
      groups[key] = groups[key] || [];
      groups[key].push(p);
    }
    const sorted = Object.keys(groups).sort();
    const out = [];
    for(const k of sorted.slice(0, days)){
      const items = groups[k];
      const temps = items.map(i => (typeof i.temperature === "number")?i.temperature:NaN).filter(Number.isFinite);
      const highs = temps.length? Math.max(...temps): null;
      const lows = temps.length? Math.min(...temps): null;
      const combined = items.map(i=>i.shortForecast||"").join(" ");
      const flags = detectConditions(combined);
      const day_period = items.find(it => it.isDaytime);
      const night_period = items.find(it => !it.isDaytime);
      out.push({
        date: new Date(k+"T00:00:00Z"),
        high: highs,
        low: lows,
        flags,
        day_text: day_period?day_period.shortForecast:null,
        night_text: night_period?night_period.shortForecast:null,
        raw: items
      });
    }
    return out;
  }

  function buildShortSummary(agg){
    if(!agg.length) return "Forecast unavailable.";
    const f = agg[0];
    const flags = new Set(f.flags);
    const emoji = emojiForFlags(f.flags);
    if(flags.has("thunder")) return `${emoji} Thunderstorms likely today — stay alert.`;
    if(flags.has("rain")) return `${emoji} Rain likely today. Bring an umbrella.`;
    if(flags.has("snow")) return `${emoji} Snow possible today.`;
    if(flags.has("sun") && !flags.has("cloud")) return `${emoji} Mostly sunny today.`;
    return `${emoji} Typical mix of sun and clouds today.`;
  }

  function buildLongCaption(agg, place, days, alerts, tone="friendly"){
    const lines = [];
    lines.push(`${place} — ${days}-day snapshot`);
    lines.push("");
    for(const d of agg){
      const w = d.date.toLocaleDateString(undefined,{weekday:"short"}).toUpperCase();
      const ds = d.date.toLocaleDateString(undefined,{month:"short", day:"numeric"});
      const parts=[];
      if(d.high!=null && d.low!=null) parts.push(`${d.high}°/${d.low}°`);
      else if(d.high!=null) parts.push(`High ${d.high}°`);
      else if(d.low!=null) parts.push(`Low ${d.low}°`);
      if(d.day_text) parts.push(d.day_text);
      else if(d.night_text) parts.push(d.night_text);
      const emo = emojiForFlags(d.flags);
      lines.push(`${emo} ${w} ${ds} — ${parts.join(" · ")}`);
    }
    lines.push("");
    lines.push(buildShortSummary(agg));
    if(alerts && alerts.length){
      lines.push("");
      lines.push("⚠️ Active alerts:");
      for(const a of alerts.slice(0,5)){
        const p = a.properties || {};
        const title = p.event || "Alert";
        const sev = p.severity || "";
        const area = p.areaDesc || "";
        const instr = (p.instruction || p.description || "").split(".")[0] || "";
        lines.push(`- ${title} (${sev}) for ${area}: ${instr}`);
      }
    }
    const tags = HASHTAGS_BASE.slice();
    const ptag = place.split(",")[0].replace(/\s+/g,"").replace(/\./g,"");
    if(ptag) tags.push("#"+ptag);
    lines.push("");
    lines.push(tags.join(" "));
    return lines.join("\n");
  }

  function buildShortCaption(agg, place, alerts){
    const head = buildShortSummary(agg);
    const d0 = agg[0]||null;
    let temp="";
    if(d0){
      if(d0.high!=null && d0.low!=null) temp = ` ${d0.high}°/${d0.low}°`;
      else if(d0.high!=null) temp = ` ${d0.high}°`;
    }
    let out = `${emojiForFlags(d0?d0.flags:[])}${temp} — ${head}`;
    if(alerts && alerts.length) out += " ⚠️ See alerts.";
    out += "\n\n" + HASHTAGS_BASE.slice(0,3).join(" ");
    return out;
  }

  function buildAltText(agg, place){
    const parts = [`${place} weather preview.`];
    for(const d of agg){
      const w = d.date.toLocaleDateString(undefined,{weekday:"long"});
      const hi = d.high!=null?d.high:"—";
      const lo = d.low!=null?d.low:"—";
      const txt = d.day_text||d.night_text||"mixed skies";
      parts.push(`${w}: high ${hi}°, low ${lo}°, ${txt}.`);
    }
    return parts.join(" ");
  }

  // New: image suggestion generator
  function buildImageSuggestions(agg, place, alerts){
    if(!agg.length) return "No image suggestions available.";
    const first = agg[0];
    const flags = new Set(first.flags);
    const suggestions = [];
    // Main concept
    if(flags.has("thunder")){
      suggestions.push("Concept: Dramatic storm — dark clouds, wet streets or silhouette of trees. Aim for high contrast and moody tones.");
      suggestions.push("Action: Capture during/after a downpour; include reflections or a skyline silhouette. Consider an action shot with an umbrella or lightning silhouette.");
      suggestions.push("Overlay: bold headline e.g., 'Storm Watch' in white on a semi-opaque red/orange bar. Use ⚠️ or ⛈️ icon.");
      suggestions.push("Crop: square (1:1) or portrait (4:5) for strong vertical compositions.");
      suggestions.push("Palette: deep charcoal #0b1220, accent orange #ff6b35, highlight white.");
    } else if(flags.has("rain")){
      suggestions.push("Concept: Rain mood — umbrella, raindrops on a window, reflections in puddles.");
      suggestions.push("Action: Shoot close-up raindrops or street reflections in soft light; capture motion for umbrellas or people with splashes.");
      suggestions.push("Overlay: short headline like 'Rain Today' or temp (e.g., '55° / 44°') in thin uppercase; use blue-gray semi-transparent bar.");
      suggestions.push("Crop: square (1:1) or vertical 4:5 for posts with a person holding an umbrella.");
      suggestions.push("Palette: slate blue #556c8a, cool gray #9fb0d4, accent yellow #ffc857 for contrast.");
    } else if(flags.has("snow")){
      suggestions.push("Concept: Snow — wide shot of flakes, rooftops, or close-up textures on branches.");
      suggestions.push("Action: Capture soft light or backlight flakes at golden hour; include footprints or a cozy subject.");
      suggestions.push("Overlay: 'Snow Possible' or temp headline in dark text on a light translucent bar; add ❄️.");
      suggestions.push("Crop: square or landscape depending on scene; portrait works for people in snow.");
      suggestions.push("Palette: cool cyan #bfe7ff, soft gray #dfeffb, deep navy accents.");
    } else if(flags.has("fog")){
      suggestions.push("Concept: Fog & mood — low contrast, minimal compositions, lone subject.");
      suggestions.push("Action: Use negative space; let fog simplify the background and focus on one object (lamp post, tree).");
      suggestions.push("Overlay: minimal text (one line) with small serif or uppercase; muted palette.");
      suggestions.push("Crop: square with center or left-aligned subject for editorial feel.");
      suggestions.push("Palette: muted beige #cfcfcf, soft blue-gray #aebccd.");
    } else if(flags.has("sun") && !flags.has("cloud")){
      suggestions.push("Concept: Sunny/golden hour — warm, vibrant scenes, portraits, outdoors.");
      suggestions.push("Action: Shoot in golden hour; include sun flare or warm backlight. Use shadows for depth.");
      suggestions.push("Overlay: bright headline like 'Mostly Sunny' with warm accent; consider a subtle badge with ☀️.");
      suggestions.push("Crop: square or portrait (4:5) for people/landscape combos.");
      suggestions.push("Palette: warm gold #ffc857, soft orange #ffb86b, deep blue for contrast.");
    } else {
      // default mixed conditions
      suggestions.push("Concept: Mixed skies — combine sky texture with local subject (street, park, skyline).");
      suggestions.push("Action: Balanced exposure; include foreground interest (tree, building) and sky as background.");
      suggestions.push("Overlay: concise headline (one short phrase) and temp; small icon for condition.");
      suggestions.push("Crop: square for Instagram feed; keep safe margins for overlays.");
      suggestions.push("Palette: neutral blues and grays with one warm accent (e.g., #ffc857).");
    }

    // wind-specific tip
    if(flags.has("wind")){
      suggestions.push("Wind tip: emphasize motion — motion blur on grasses/flags, hair/clothing movement; diagonal compositions work well.");
    }

    // temperature extremes
    if(first.high != null && first.low != null){
      if(first.high >= 90) suggestions.push("Hot day: emphasize sun, warm colors, and hydration props (iced drink, sunglasses).");
      if(first.low <= 32) suggestions.push("Freezing: show breath, gloves, or frost textures; use cool palette and soft light.");
    }

    // alerts
    if(alerts && alerts.length){
      suggestions.push("Alerts: Create an attention image variant — red/orange banner with '⚠️ Alert' and a one-line action (e.g., 'Avoid flooded roads'). Add link-in-bio note.");
    }

    // practical file and overlay suggestions
    suggestions.push("Overlay text suggestion: use the short caption headline or a 3–4 word summary (e.g., 'Rain Today — Bring an Umbrella').");
    suggestions.push("Filename suggestion: " + place.split(",")[0].replace(/\s+/g,"_") + "_forecast_" + (new Date().toISOString().slice(0,10)) + ".jpg");
    suggestions.push("Accessibility: include the alt text produced above; add a short alt describing the photo and the weather snapshot.");
    suggestions.push("Final tip: export at 1080×1080 for feed or 1080×1350 for portrait; keep important text inside a 90% safe margin.");

    return suggestions.join("\n\n");
  }

  async function generateForInput(rawInput, days){
    let lat,lon,place;
    if(rawInput.includes(",")){
      const [a,b] = rawInput.split(",",2).map(s=>s.trim());
      lat = parseFloat(a); lon = parseFloat(b);
      if(Number.isFinite(lat) && Number.isFinite(lon)) place = `${lat.toFixed(3)},${lon.toFixed(3)}`;
      else throw new Error("Invalid lat,lon");
    } else {
      const z = rawInput.trim();
      const r = await zipToLatLon(z);
      lat = r.lat; lon = r.lon; place = r.place;
    }

    const point = await fetchNwsPoint(lat,lon);
    const forecastUrl = point.properties && point.properties.forecast;
    if(!forecastUrl) throw new Error("No forecast for location");
    const periods = await fetchNwsForecast(forecastUrl);
    const alerts = await fetchNwsAlerts(lat,lon);
    const agg = aggregateDays(periods, days);
    return {place, agg, alerts};
  }

  btn.addEventListener("click", async ()=>{
    const val = input.value.trim();
    if(!val) { alert("Enter ZIP or lat,lon"); return; }
    btn.disabled = true; btn.innerText="Loading...";
    results.classList.add("hidden");
    try{
      const days = parseInt(daysSel.value,10);
      const {place, agg, alerts} = await generateForInput(val, days);
      placeTitle.innerText = place;
      shortCap.innerText = buildShortCaption(agg, place, alerts);
      longCap.innerText = buildLongCaption(agg, place, days, alerts);
      altText.innerText = buildAltText(agg, place);
      imageSuggestions.innerText = buildImageSuggestions(agg, place, alerts);
      if(alerts && alerts.length){
        alertsBlock.style.display = "";
        alertsList.innerHTML = "";
        for(const a of alerts){
          const p = a.properties || {};
          const li = document.createElement("li");
          li.textContent = `${p.event||"Alert"} — ${p.headline||p.description||"No description"}`;
          alertsList.appendChild(li);
        }
      } else {
        alertsBlock.style.display = "none";
        alertsList.innerHTML = "";
      }
      updatedTs.innerText = `Updated ${new Date().toLocaleString()}`;
      results.classList.remove("hidden");
    }catch(err){
      alert("Error: " + (err.message||err));
    }finally{
      btn.disabled = false; btn.innerText = "Generate";
    }
  });

  // small convenience: press Enter in input triggers generate
  input.addEventListener("keydown", e=>{
    if(e.key === "Enter") btn.click();
  });

  // expose helper for debugging
  window._wxHelper = {
    generateForInput
  };

})();
