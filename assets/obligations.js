/* "Your obligations in practice" (standalone page). The ten themes and every
   sector's notes are in the HTML; this only shows the notes for the sector
   chosen in the selector and points the back link at that sector's guide.
   A ?sector=accountants|lawyers|realestate query preselects a sector. */
(function(){
  var sel = document.getElementById("ob-sector");
  var back = document.getElementById("ob-back");
  var notes = Array.prototype.slice.call(document.querySelectorAll(".ob-note"));
  if(!sel) return;

  var GUIDES = {
    accountants: ["/who-we-help/accountants/", "accountants guide"],
    lawyers: ["/who-we-help/lawyers-and-conveyancers/", "lawyers and conveyancers guide"],
    realestate: ["/who-we-help/real-estate/", "real estate guide"]
  };

  function render(){
    var v = sel.value;
    notes.forEach(function(n){ n.hidden = n.dataset.sector !== v; });
    if(back && GUIDES[v]){ back.href = GUIDES[v][0]; back.textContent = "Back to the " + GUIDES[v][1]; }
  }

  var m = /[?&]sector=([a-z]+)/.exec(location.search);
  if(m && GUIDES[m[1]]) sel.value = m[1];
  render();
  sel.addEventListener("change", render);
})();
