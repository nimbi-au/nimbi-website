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
