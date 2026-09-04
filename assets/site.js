/* Contact forms. Loaded only on the pages that carry one (home and about). */

/* Paste the deployed Worker URL here. While it is empty the forms fall back to
   opening the visitor's email app, exactly as they did before. */
const ENQUIRY_ENDPOINT = "";
/* Paste the Turnstile site key here. While it is empty no widget is rendered and
   the Worker skips the check, so the form still works. */
const TURNSTILE_SITEKEY = "";
const ENQUIRY_EMAIL = "info@nimbi.com.au";
/* [element id, key sent to the Worker, label shown in the email] */
const ENQUIRY_FORMS = {
  h: { note:"h-note", box:"h-turnstile", subject:"Call back request - Nimbi website",
       fields:[["h-name","name","Name"],["h-firm","firm","Firm"],["h-sector","sector","Sector"],["h-email","email","Email"],["h-phone","phone","Phone"],["h-when","when","When do you need help?"],["h-msg","msg","What's on your mind?"]] },
  a: { note:"a-note", box:"a-turnstile", subject:"Call back request - Nimbi website",
       fields:[["a-name","name","Name"],["a-firm","firm","Firm"],["a-email","email","Email"],["a-phone","phone","Phone"],["a-msg","msg","How can we help?"]] }
};

const turnstileWidgets = {};
function onTurnstileLoad(){
  if(!TURNSTILE_SITEKEY) return;
  Object.keys(ENQUIRY_FORMS).forEach(function(key){
    const box = document.getElementById(ENQUIRY_FORMS[key].box);
    if(box) turnstileWidgets[key] = turnstile.render(box, { sitekey: TURNSTILE_SITEKEY });
  });
}
window.onTurnstileLoad = onTurnstileLoad;

function readEnquiry(key){
  const cfg = ENQUIRY_FORMS[key];
  const hp = document.getElementById(key + "-hp");
  const data = { form:key, page: location.pathname, website: hp ? hp.value : "" };
  const lines = [];
  let firstBad = null;
  cfg.fields.forEach(function(f){
    const el = document.getElementById(f[0]);
    const val = (el.value || "").trim();
    let ok = val !== "";
    if(ok && el.type === "email") ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
    if(ok){ el.classList.remove("invalid"); }
    else { el.classList.add("invalid"); if(!firstBad) firstBad = el; }
    data[f[1]] = val;
    lines.push(f[2] + ": " + val);
  });
  return { cfg:cfg, data:data, lines:lines, firstBad:firstBad };
}

function resetTurnstile(key){
  if(TURNSTILE_SITEKEY && window.turnstile && turnstileWidgets[key] !== undefined) turnstile.reset(turnstileWidgets[key]);
}

async function submitEnquiry(key, btn){
  const read = readEnquiry(key);
  const note = document.getElementById(read.cfg.note);
  note.style.display = "block";

  if(read.firstBad){
    note.classList.add("err");
    note.textContent = (read.firstBad.type === "email" && read.firstBad.value.trim())
      ? "Please enter a valid email address."
      : "Please complete every field before sending - required fields are marked with *.";
    read.firstBad.focus();
    return;
  }

  /* Worker not deployed yet - hand off to the visitor's mail app. */
  if(!ENQUIRY_ENDPOINT){
    note.classList.remove("err");
    note.textContent = "Opening your email app so you can send this to " + ENQUIRY_EMAIL + ".";
    window.location.href = "mailto:" + ENQUIRY_EMAIL +
      "?subject=" + encodeURIComponent(read.cfg.subject) +
      "&body=" + encodeURIComponent(read.lines.join("\n") + "\n");
    return;
  }

  if(TURNSTILE_SITEKEY){
    const token = (window.turnstile && turnstileWidgets[key] !== undefined)
      ? turnstile.getResponse(turnstileWidgets[key]) : "";
    if(!token){
      note.classList.add("err");
      note.textContent = "Please complete the verification check above the button.";
      return;
    }
    read.data.turnstile = token;
  }

  const label = btn ? btn.textContent : "";
  if(btn){ btn.disabled = true; btn.textContent = "Sending..."; }
  note.classList.remove("err");
  note.textContent = "Sending your enquiry...";

  try{
    const res = await fetch(ENQUIRY_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(read.data)
    });
    const out = await res.json().catch(function(){ return {}; });
    if(!res.ok || !out.ok) throw new Error(out.error || "Send failed.");

    read.cfg.fields.forEach(function(f){ document.getElementById(f[0]).value = ""; });
    resetTurnstile(key);
    note.classList.remove("err");
    note.textContent = "Thank you - your enquiry is with us. A Nimbi practitioner will come back to you within one business day.";
  }catch(err){
    note.classList.add("err");
    note.innerHTML = "We could not send your enquiry. Please try again, or email us directly at " +
      '<a href="mailto:' + ENQUIRY_EMAIL + '" style="color:inherit;font-weight:700">' + ENQUIRY_EMAIL + "</a>.";
    resetTurnstile(key);
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = label; }
  }
}
window.submitEnquiry = submitEnquiry;

function clearInvalid(e){
  if(e.target && e.target.classList && e.target.classList.contains("invalid")) e.target.classList.remove("invalid");
}
document.addEventListener("input", clearInvalid);
document.addEventListener("change", clearInvalid);
