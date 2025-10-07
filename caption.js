// caption.js
// Minimal SPA for GitHub Pages: ZIP/latlon -> NWS forecast -> captions, alt text, image suggestions
// Added: Hazardous Weather Outlook (HWO) lookup and display.

(async function(){
  const EMOJI_MAP = { sun:"☀️", cloud:"☁️", rain:"🌧️", showers:"🌦️", thunder:"⛈️", snow:"❄️", wind:"🌬️", fog:"🌫️" };
  const HASHTAGS_BASE = ["#weather","#forecast","#localweather"];

  const el = id => document.getElementById(id);

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
  const hwoBlock = el("hwo-block");
  const hwoText = el("hwo-text");

  document.addEventListener("click", e=>{
    const btn = e.target.closest("button.copy");
    if(!btn) return;
    const target=el(btn.dataset.target);
    navigator.clipboard.writeText(target.innerText).then(()=> {
      const prev = btn.innerText;
      btn.innerText = "Copied";
      setTimeout(()=> btn.innerText = prev,1200);
    }).catch(()=> alert("Copy failed"));
  });

  // Simple localStorage cache (10 minutes)
  function cacheGet(key){
    try{
      const raw = localStorage.getItem(key);
      if(!raw) return null;
      const obj = JSON.parse(raw);
      if(Date.now() - obj.ts > 1000*60*10) { localStorage.removeItem(key); return null; }
      return obj.val;
    }catch(e){ return null; }
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
    const out = { lat: parseFloat(p.latitude), lon: parseFloat(p.longitude), place: `${p['place name']}, ${data['state abbreviation']||data['country abbreviation']||''}` };
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

  function detectConditions(text){
    const t = (text||"").toLowerCase();
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
    const set = new Set(flags||[]);
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
      out.push({ date: new Date(k+"T00:00:00Z"), high: highs, low: lows, flags, day_text: day_period?day_period.shortForecast:null, night_text: night_period?night_period.shortForecast:null, raw: items });
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

  function buildImageSuggestions(agg, place, alerts){
    if(!agg.length) return "No image suggestions available.";
    const first = agg[0];
    const flags = new Set(first.flags);
    const suggestions = [];
    if(flags.has("thunder")){
      suggestions.push("Concept: Dramatic storm — dark clouds, wet streets, silhouette. Use moody tones.");
    } else if(flags.has("rain")){
      suggestions.push("Concept: Rain — umbrella, reflections, puddles. Use cool slate palette with a warm accent.");
    } else if(flags.has("snow")){
      suggestions.push("Concept: Snow — flakes/backlight/frost textures. Use cool palette.");
    } else if(flags.has("fog")){
      suggestions.push("Concept: Fog — minimal, lonely subject with negative space.");
    } else if(flags.has("sun")){
      suggestions.push("Concept: Sunny/golden hour — warm backlight, sun flare, long shadows.");
    } else {
      suggestions.push("Concept: Mixed skies — sky texture + local foreground subject.");
    }
    if(first.high != null && first.low != null){
      if(first.high >= 90) suggestions.push("Hot day: emphasize sun and warm colors.");
      if(first.low <= 32) suggestions.push("Freezing: show breath/frost textures and cool palette.");
    }
    if(alerts && alerts.length){
      suggestions.push("Alerts: add an attention banner variant (red/orange) with a short directive.");
    }
    suggestions.push("Overlay: headline (1–4 words) + small temp line. Export at 1080×1080 or 1080×1350.");
    return suggestions.join("\n\n");
  }

  // --- HWO lookup ---
  // Try: (1) alerts API filtered by event, (2) products endpoint for forecast office (defensive parsing).
  async function fetchHwoForPoint(lat, lon, office){
    // 1) try alerts query for event=Hazardous Weather Outlook
    try{
      const aurl = `https://api.weather.gov/alerts?point=${lat},${lon}&event=${encodeURIComponent("Hazardous Weather Outlook")}`;
      const r = await fetch(aurl);
      if(r.ok){
        const data = await r.json();
        if(Array.isArray(data.features) && data.features.length){
          // pick the most recent HWO-like feature
          const f = data.features[0];
          const p = f.properties || {};
          const headline = p.headline || p.event || "Hazardous Weather Outlook";
          const desc = (p.description || p.instruction || p.headline || "").trim();
          return {source: "alerts", title: headline, text: desc, raw: p};
        }
      }
    }catch(e){
      console.warn("HWO alert query failed", e);
    }

    // 2) fallback: try products list for the forecast office and find HWO product
    if(office){
      try{
        // fetch products for office (may be large, but we cache)
        const pkey = `products:${office}`;
        const cached = cacheGet(pkey);
        let productsJson = cached;
        if(!productsJson){
          const url = `https://api.weather.gov/products?office=${office}`;
          const r2 = await fetch(url);
          if(r2.ok){
            productsJson = await r2.json();
            cacheSet(pkey, productsJson);
          }
        }
        if(productsJson){
          // defensively search through returned items for 'hazardous' or 'hwo'
          const entries = productsJson.products || productsJson || [];
          for(const ent of entries){
            const rawText = JSON.stringify(ent || "").toLowerCase();
            if(rawText.includes("hazardous weather outlook") || rawText.includes("\"type\":\"hwo\"") || rawText.includes(" hwo ")){
              // try to fetch the actual product text if there's an id or productURI
              // common field: ent.productId or ent.id or ent.productURI
              const candidateUrl = ent.id || ent.productURI || ent.productUrl;
              if(candidateUrl && typeof candidateUrl === "string" && candidateUrl.startsWith("http")){
                try{
                  const rp = await fetch(candidateUrl);
                  if(rp.ok){
                    const pj = await rp.json();
                    // many product endpoints include 'productText' or 'properties.productText'
                    const body = pj.productText || (pj.properties && pj.properties.productText) || (pj.properties && (pj.properties.headline || pj.properties.description)) || "";
                    return {source: "products", title: ent.title || ent.productName || "Hazardous Weather Outlook", text: (body || "").trim(), raw: ent};
                  }
                }catch(e){}
              } else {
                // if no direct URL, return a summary using ent.title or ent.productName
                return {source: "products", title: ent.title || ent.productName || "Hazardous Weather Outlook", text: (ent.summary || ent.description || "").trim(), raw: ent};
              }
            }
          }
        }
      }catch(e){
        console.warn("HWO products fetch failed", e);
      }
    }

    // nothing found
    return null;
  }

  // --- Helpers: SVG download & copy bundle ---
  function escapeXml(s){ return String(s || "").replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function downloadPrefilledSVG({ headline, subline, miniStripText, filename = "overlay_1080.svg" } = {}) {
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1080" height="1080" viewBox="0 0 1080 1080" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeXml(headline || 'overlay')}">
  <style>
    .h{font-family:Inter,Arial,sans-serif;font-weight:700;font-size:56px;fill:#ffc857}
    .s{font-family:Inter,Arial,sans-serif;font-weight:600;font-size:22px;fill:#e6eef8}
    .m{font-family:Inter,Arial,sans-serif;font-weight:500;font-size:16px;fill:#e6eef8}
  </style>
  <rect width="1080" height="1080" fill="transparent"/>
  <g transform="translate(60,840)">
    <rect x="0" y="0" width="960" height="180" rx="14" fill="#071227" opacity="0.35"/>
    <text x="38" y="64" class="h">${escapeXml(headline || "")}</text>
    <text x="38" y="104" class="s">${escapeXml(subline || "")}</text>
  </g>
  <g transform="translate(60,320)">
    <text class="m">${escapeXml(miniStripText || "")}</text>
  </g>
</svg>`;
    const blob = new Blob([svg], {type: "image/svg+xml;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function copyAllForIG({ shortCaption, longCaption, altTextVal, hashtags = [] } = {}) {
    const block = [
      shortCaption || "",
      "",
      longCaption || "",
      "",
      "Alt text:",
      altTextVal || "",
      "",
      (hashtags.length ? hashtags.join(" ") : "")
    ].join("\n");
    try {
      await navigator.clipboard.writeText(block);
      alert("Caption bundle copied to clipboard!");
    } catch (e) {
      console.error("Copy failed", e);
      alert("Copy failed — please copy manually.");
    }
  }

  // UI wiring
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
    const office = point.properties && point.properties.forecastOffice;
    if(!forecastUrl) throw new Error("No forecast for location");
    const periods = await fetchNwsForecast(forecastUrl);
    const alerts = await fetchNwsAlerts(lat,lon);
    const agg = aggregateDays(periods, days);

    // attempt to fetch HWO (hazardous weather outlook)
    let hwo = null;
    try{
      hwo = await fetchHwoForPoint(lat, lon, office);
    }catch(e){
      console.warn("HWO fetch error", e);
    }

    return {place, agg, alerts, hwo, lat, lon, office};
  }

  btn.addEventListener("click", async ()=>{
    const val = input.value.trim();
    if(!val) { alert("Enter ZIP or lat,lon"); return; }
    btn.disabled = true; btn.innerText="Loading...";
    results.classList.add("hidden");
    // hide HWO until loaded
    hwoBlock.style.display = "none";
    try{
      const days = parseInt(daysSel.value,10);
      const {place, agg, alerts, hwo, lat, lon, office} = await generateForInput(val, days);
      placeTitle.innerText = place;
      shortCap.innerText = buildShortCaption(agg, place, alerts);
      longCap.innerText = buildLongCaption(agg, place, days, alerts);
      altText.innerText = buildAltText(agg, place);
      imageSuggestions.innerText = buildImageSuggestions(agg, place, alerts);

      // HWO display
      if(hwo){
        const title = hwo.title || (hwo.raw && (hwo.raw.event || hwo.raw.productName)) || "Hazardous Weather Outlook";
        const text = hwo.text || (hwo.raw && (hwo.raw.description || hwo.raw.productText || hwo.raw.headline)) || "";
        hwoText.innerText = `${title}\n\n${text}`.trim();
        hwoBlock.style.display = "";
      } else {
        hwoText.innerText = "No Hazardous Weather Outlook found for this location.";
        // show block so you can copy the no-result string if needed
        hwoBlock.style.display = "";
      }

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

  // Enter key triggers generate
  input.addEventListener("keydown", e=>{
    if(e.key === "Enter") btn.click();
  });

  // One-click actions wiring
  const copyAllBtn = el("btn-copy-all");
  const downloadSvgBtn = el("btn-download-svg");
  if(copyAllBtn){
    copyAllBtn.addEventListener("click", ()=>{
      const sc = shortCap.innerText || "";
      const lc = longCap.innerText || "";
      const at = altText.innerText || "";
      const tags = HASHTAGS_BASE.slice();
      copyAllForIG({ shortCaption: sc, longCaption: lc, altTextVal: at, hashtags: tags });
    });
  }
  if(downloadSvgBtn){
    downloadSvgBtn.addEventListener("click", ()=>{
      const headline = (shortCap.innerText || "").split("\n")[0] || "Weather Snapshot";
      const place = placeTitle.innerText || "";
      const updated = new Date().toLocaleDateString();
      const subline = `${place} · Updated ${updated}`;
      const mini = longCap.innerText.split("\n").slice(0,5).join("  •  ");
      const filename = (place?place.split(",")[0].replace(/\s+/g,"_"):"forecast") + "_" + (new Date().toISOString().slice(0,10)) + ".svg";
      downloadPrefilledSVG({ headline, subline, miniStripText: mini, filename });
    });
  }

  // expose a helper for debugging
  window._wxHelper = { generateForInput, fetchHwoForPoint };

})();
