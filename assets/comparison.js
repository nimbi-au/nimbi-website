/* Comparison tables. The detail row under each comparison is server-rendered and
   visible by default; this collapses it and restores the click-to-expand and
   hover-tooltip behaviour once JS is available. */
(function(){
  const tables = Array.prototype.slice.call(document.querySelectorAll("table.diy"));
  if(!tables.length) return;

  const tip = document.getElementById("diytip");
  const canHover = window.matchMedia("(hover: hover)").matches;

  tables.forEach(function(table){
    table.classList.add("collapsible");
    Array.prototype.forEach.call(table.querySelectorAll("tr.diyrow"), function(row){
      const detail = row.nextElementSibling;
      if(!detail || !detail.classList.contains("diydetail")) return;
      const text = detail.textContent.trim();

      row.setAttribute("aria-expanded", "false");
      row.tabIndex = 0;
      row.setAttribute("role", "button");

      function toggle(){
        const open = detail.classList.toggle("on");
        row.setAttribute("aria-expanded", open ? "true" : "false");
        if(tip) tip.style.display = "none";
      }
      row.addEventListener("click", toggle);
      row.addEventListener("keydown", function(e){
        if(e.key === "Enter" || e.key === " "){ e.preventDefault(); toggle(); }
      });

      if(canHover && tip){
        row.addEventListener("mousemove", function(e){
          if(detail.classList.contains("on")) return;
          tip.textContent = text;
          tip.style.display = "block";
          const pad = 16, w = tip.offsetWidth, h = tip.offsetHeight;
          let x = e.clientX + pad, y = e.clientY + pad;
          if(x + w > window.innerWidth - 8) x = e.clientX - w - pad;
          if(y + h > window.innerHeight - 8) y = e.clientY - h - pad;
          tip.style.left = x + "px";
          tip.style.top = y + "px";
        });
        row.addEventListener("mouseleave", function(){ tip.style.display = "none"; });
      }
    });
  });
})();
