/* Quick readiness check. Every question, for every sector, is in the HTML;
   this shows the chosen sector's Part 1 questions, records answers, writes the
   results and drives the review tracker at the foot of the screen. Nothing
   leaves the page. */
(function(){
  var cs = document.getElementById("check-sector");
  var readyBox = document.getElementById("ready-check");
  if(!cs || !readyBox) return;

  var scopeSets = Array.prototype.slice.call(document.querySelectorAll(".check.scope"));
  var scopeNotes = Array.prototype.slice.call(document.querySelectorAll(".scope-note"));
  var scopeRes = document.getElementById("scope-result");
  var scopeProg = document.getElementById("scope-progress");
  var readyRes = document.getElementById("ready-result");
  var readyProg = document.getElementById("ready-progress");
  var gapbar = document.getElementById("gapbar");
  var dismissed = false;
  var scopeState = "unknown";

  var GUIDES = {
    accountants: "/who-we-help/accountants/",
    lawyers: "/who-we-help/lawyers-and-conveyancers/",
    realestate: "/who-we-help/real-estate/"
  };
  function guideFor(){ return GUIDES[cs.value] || GUIDES.accountants; }
  function activeScope(){
    for(var i = 0; i < scopeSets.length; i++){ if(scopeSets[i].dataset.sector === cs.value) return scopeSets[i]; }
    return scopeSets[0];
  }
  function rowsIn(box){ return Array.prototype.slice.call(box.querySelectorAll(".row")); }
  function unanswered(rows){ return rows.filter(function(r){ return !r.dataset.v; }).map(function(r){ return r.dataset.n; }); }
  function clearRows(rows){
    rows.forEach(function(r){
      delete r.dataset.v;
      r.querySelectorAll("button").forEach(function(b){ b.setAttribute("aria-pressed", "false"); });
    });
  }

  /* Answer buttons: one answer per row, then re-render that part. */
  function wire(box, render){
    rowsIn(box).forEach(function(r){
      r.querySelectorAll("button").forEach(function(bt){
        bt.addEventListener("click", function(){
          r.querySelectorAll("button").forEach(function(x){ x.setAttribute("aria-pressed", "false"); });
          bt.setAttribute("aria-pressed", "true");
          r.dataset.v = bt.dataset.v;
          render();
        });
      });
    });
  }

  /* ---------- Part 1: does the Act apply? ---------- */
  function scopeRender(){
    var rows = rowsIn(activeScope()), left = unanswered(rows);
    scopeProg.textContent = "Answered " + (rows.length - left.length) + " of " + rows.length +
      (left.length ? ". Unanswered: " + left.join(", ") : ".");
    if(left.length){
      scopeState = "unknown";
      scopeRes.textContent = "Answer the remaining questions and the result appears here.";
      return;
    }
    var yes = rows.filter(function(r){ return r.dataset.v === "y"; }).length;
    var unsure = rows.filter(function(r){ return r.dataset.v === "u"; }).length;
    scopeState = yes > 0 ? "yes" : (unsure > 0 ? "unsure" : "none");
    if(readyBox.querySelector(".row[data-v]")) readyRender();
    if(yes > 0){
      scopeRes.innerHTML = "<strong>The Act may apply.</strong> You answered yes to " + yes + " of " + rows.length +
        " designated services. One is enough if you provide it in the course of business, subject to the conditions noted under each question. Go on to Part 2, and confirm the position for your practice with AUSTRAC’s guidance or independent advice.";
    } else if(unsure > 0){
      scopeRes.innerHTML = "<strong>Applicability needs clarifying.</strong> No yes answers, but " + unsure +
        " not sure. Open the note under each uncertain question, or read your sector guide, then answer again. If it stays unclear, a scoping call or independent advice can settle it.";
    } else {
      scopeRes.innerHTML = "<strong>No designated service identified from these answers.</strong> On what you have told us, the practice may not be a reporting entity. This short check is not a legal determination: confirm against AUSTRAC’s designated services guidance, and check again if your services change. You can stop here, or <a href=\"/how-nimbi-helps/\">read how Nimbi helps</a> if you expect to start such services.";
    }
  }

  function showScope(){
    scopeSets.forEach(function(s){ s.hidden = s.dataset.sector !== cs.value; clearRows(rowsIn(s)); });
    scopeNotes.forEach(function(n){ n.hidden = n.dataset.sector !== cs.value; });
    scopeState = "unknown";
    scopeRes.textContent = "Answer the questions and the result appears here.";
    scopeProg.textContent = "Answered 0 of " + rowsIn(activeScope()).length + ".";
  }

  /* ---------- Part 2: how ready are you? ---------- */
  function hideBar(){ gapbar.hidden = true; document.body.classList.remove("has-gapbar"); }

  function decide(rows){
    var left = unanswered(rows);
    var no = rows.filter(function(r){ return r.dataset.v === "n"; });
    var unsure = rows.filter(function(r){ return r.dataset.v === "u"; });
    var dom = function(set){
      var d = {};
      set.forEach(function(r){
        var a = r.dataset.area;
        d[(a === "setup" || a === "framework") ? "framework" : (a === "cdd" ? "cdd" : "firm")] = true;
      });
      return d;
    };
    var noD = dom(no), unD = dom(unsure), noCount = Object.keys(noD).length;
    var label = function(set){ return set.map(function(r){ return r.dataset.n; }).join(", "); };
    var out = { code: "", html: "", cta: "", href: "", sub: "" };
    var guide = guideFor();
    var scopeNote = scopeState === "unsure"
      ? " Applicability is still unclear from Part 1, so treat this as preparation until that is settled."
      : (scopeState === "none"
          ? " Part 1 did not identify a designated service, so this is preparatory only unless your services change."
          : "");

    if(left.length){
      out.code = "incomplete";
      out.html = "Answer the remaining questions and your result appears here. Provisional so far: " + no.length +
        " answered no, " + unsure.length + " not sure, " + left.length + " unanswered.";
      out.cta = "Continue the check"; out.href = "#ready-check";
      out.sub = no.length + " self-reported as needing attention, " + unsure.length + " needing clarification, " + left.length + " unanswered";
      return out;
    }
    out.sub = no.length + " self-reported as needing attention, " + unsure.length + " needing clarification";
    if(no.length === 0 && unsure.length === 0){
      out.code = "allyes";
      out.html = "<strong>No issues identified from these self-reported answers.</strong> That is not a compliance assurance: the test is whether the program works in daily practice and would hold up to an independent evaluation." +
        scopeNote + " A <a href=\"/contact/\">scoping call</a> can pressure-test it.";
      out.cta = "Talk it through"; out.href = "/contact/";
      return out;
    }
    var head = "";
    if(no.length) head += "<strong>Needs attention (you answered no):</strong> themes " + label(no) + ". ";
    if(unsure.length) head += "<strong>Needs clarification (not sure):</strong> themes " + label(unsure) + ". ";
    if(no.length === 0){
      out.code = "unsure";
      out.html = head + "Clarify these through your <a href=\"" + guide + "\">sector guide</a>, then answer again. If they stay unclear, a <a href=\"/contact/\">scoping call</a> can settle them." + scopeNote;
      out.cta = "Clarify with your sector guide"; out.href = guide;
      return out;
    }
    if(noCount === 1 && noD.framework){
      out.code = "framework";
      out.html = head + "The risk assessment, program, governance and compliance officer set-up are framework work. <a href=\"/how-nimbi-helps/\">Nimbi Foundations</a> builds those with you; your senior manager approves the result and the practice runs it." +
        (unsure.length ? " Clarify the not-sure items through your <a href=\"" + guide + "\">sector guide</a> at the same time." : "") + scopeNote;
      out.cta = "Foundations can support the framework work"; out.href = "/how-nimbi-helps/";
      return out;
    }
    if(noCount === 1 && noD.cdd){
      if(unD.framework){
        out.code = "cdd-unsure-framework";
        out.html = head + "Customer due diligence depends on the framework it runs under, and you are not sure the framework is in place. Clarify the framework first, through your <a href=\"" + guide + "\">sector guide</a> or a <a href=\"/contact/\">scoping conversation</a>, before choosing tooling." + scopeNote;
        out.cta = "Clarify the framework first"; out.href = "/contact/";
        return out;
      }
      out.code = "cdd";
      out.html = head + "Your framework answers were yes, so the gap is the customer due diligence workflow and evidence. Your team can run that on <a href=\"/how-nimbi-helps/#how-lens\">Nimbi Lens</a>, with procedures from Foundations; the tooling supports the obligation, it does not fulfil it for you." +
        (unsure.length ? " Clarify the other not-sure items through your <a href=\"" + guide + "\">sector guide</a>." : "") + scopeNote;
      out.cta = "How Lens supports your team"; out.href = "/how-nimbi-helps/#how-lens";
      return out;
    }
    if(noCount === 1 && noD.firm){
      out.code = "firm";
      out.html = head + "Reporting judgement and lodgement, personnel checks, training, firm-wide records and the independent evaluation are your firm’s own duties. Foundations can supply the procedures and training material, and your <a href=\"" + guide + "\">sector guide</a> explains each duty. A <a href=\"/contact/\">scoping call</a> is the place to work through how to close them." + scopeNote;
      out.cta = "Talk it through"; out.href = "/contact/";
      return out;
    }
    out.code = "mixed";
    var parts = [];
    if(noD.framework) parts.push("framework (risk assessment, program, governance, compliance officer)");
    if(noD.cdd) parts.push("customer due diligence workflow and evidence");
    if(noD.firm) parts.push("firm duties (reporting, records, training, evaluation)");
    out.html = head + "The gaps span " + parts.join(" and ") + ". That combination needs sequencing: the framework comes first, the due diligence workflow runs under it, and the firm duties sit with your people. A <a href=\"/contact/\">scoping conversation</a> is the practical next step." + scopeNote;
    out.cta = "Scoping conversation"; out.href = "/contact/";
    return out;
  }

  function readyRender(){
    var rows = rowsIn(readyBox), left = unanswered(rows);
    readyProg.textContent = "Answered " + (rows.length - left.length) + " of " + rows.length +
      (left.length ? ". Unanswered: " + left.join(", ") : ".");
    var d = decide(rows);
    if(rows.length - left.length > 0 && !dismissed){
      var n = rows.filter(function(r){ return r.dataset.v && r.dataset.v !== "y"; }).length;
      document.getElementById("gap-count").textContent = n;
      document.getElementById("gap-title").textContent = n === 1 ? "item to review" : "items to review";
      document.getElementById("gap-sub").textContent = d.sub;
      var b = document.getElementById("gap-btn");
      b.href = d.href; b.textContent = d.cta;
      gapbar.hidden = false; document.body.classList.add("has-gapbar");
    }
    readyRes.innerHTML = d.html;
  }

  function resetReady(){
    clearRows(rowsIn(readyBox));
    dismissed = false; hideBar();
    readyRes.textContent = "Answer the questions and your result appears here.";
    readyProg.textContent = "Answered 0 of " + rowsIn(readyBox).length + ".";
  }

  /* ---------- wiring ---------- */
  scopeSets.forEach(function(s){ wire(s, scopeRender); });
  wire(readyBox, readyRender);
  showScope();
  cs.addEventListener("change", function(){ showScope(); resetReady(); });
  document.getElementById("gap-close").addEventListener("click", function(){ dismissed = true; hideBar(); });
  document.getElementById("reset-all").addEventListener("click", function(){
    showScope(); resetReady();
    document.getElementById("readiness").scrollIntoView();
  });
})();
