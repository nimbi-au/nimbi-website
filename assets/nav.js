/* Header navigation. The "Who we help" dropdown is a <details> element, so it
   works without JavaScript; this only adds the small-screen menu button and
   closes open menus when the visitor clicks elsewhere or presses Escape. */
(function(){
  var m = document.querySelector(".mnav");
  var mb = document.querySelector(".menu-btn");
  var dd = m ? m.querySelector(".dd") : null;
  if(!m || !mb) return;

  function closeAll(){
    m.classList.remove("open");
    mb.setAttribute("aria-expanded", "false");
    if(dd) dd.open = false;
  }

  mb.addEventListener("click", function(){
    var open = m.classList.toggle("open");
    mb.setAttribute("aria-expanded", open ? "true" : "false");
    if(!open && dd) dd.open = false;
  });

  document.addEventListener("click", function(e){
    if(dd && dd.open && !dd.contains(e.target)) dd.open = false;
    if(m.classList.contains("open") && !m.contains(e.target)) closeAll();
  });

  document.addEventListener("keydown", function(e){
    if(e.key === "Escape") closeAll();
  });
})();

/* Deep links into collapsed content. If the URL hash targets a <details>, or something
   inside one, open it (and any <details> it is nested in) so a link such as
   /how-nimbi-helps/#compare-details or a guide's #privilege lands on the expanded
   section rather than its closed summary. Runs on load and on every hash change. */
(function(){
  function openHashTarget(){
    var id = location.hash.slice(1);
    if(!id) return;
    var target = null;
    try { target = document.getElementById(decodeURIComponent(id)); }
    catch(e){ target = document.getElementById(id); }
    if(!target) return;
    var opened = false;
    for(var d = target.closest("details"); d; d = d.parentElement && d.parentElement.closest("details")){
      if(!d.open){ d.open = true; opened = true; }
    }
    /* The browser scrolled before the content existed; bring the target into view now. */
    if(opened) target.scrollIntoView();
  }
  window.addEventListener("hashchange", openHashTarget);
  openHashTarget();
})();
