/* How Nimbi helps. The "Why Nimbi?" comparison (#compare-details) opens by default; on
   small screens it starts closed so the page is not one long table. This runs after
   nav.js (both deferred), which opens whatever <details> the URL hash points at, so a
   deep link into the comparison is left open. */
(function(){
  var comparison = document.getElementById("compare-details");
  if(!comparison || window.innerWidth > 820) return;
  var id = location.hash.slice(1), target = null;
  if(id){
    try { target = document.getElementById(decodeURIComponent(id)); }
    catch(e){ target = document.getElementById(id); }
  }
  if(target && comparison.contains(target)) return;
  comparison.removeAttribute("open");
})();
