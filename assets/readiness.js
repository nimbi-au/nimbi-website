/* Readiness check. The questions are server-rendered; this only tracks answers
   and drives the running gap summary. */
(function(){
  const cells = Array.prototype.slice.call(document.querySelectorAll(".yn[data-row]"));
  if(!cells.length) return;

  const total = cells.length;
  const answers = new Array(total).fill(null);
  const bar = document.getElementById("gapbar");
  const pill = document.getElementById("gappill");
  const gapnum = document.getElementById("gapnum");
  const pillnum = document.getElementById("pillnum");
  const gapmsg = document.getElementById("gapmsg");
  let barDismissed = false;

  function refresh(){
    const gaps = answers.filter(function(a){ return a === false; }).length;
    const answered = answers.filter(function(a){ return a !== null; }).length;
    gapnum.textContent = gaps;
    pillnum.textContent = gaps;
    gapmsg.textContent = gaps === 0
      ? (answered === total
          ? "No gaps - the next step is keeping it that way through monitoring and your evaluation cycle."
          : "no gaps so far. Keep going.")
      : (gaps === 1 ? "gap identified." : "gaps identified.");
    if(answered === 0){ bar.classList.remove("show"); pill.classList.remove("show"); return; }
    if(barDismissed){ bar.classList.remove("show"); pill.classList.add("show"); }
    else { bar.classList.add("show"); pill.classList.remove("show"); }
  }

  cells.forEach(function(cell){
    const i = Number(cell.dataset.row);
    cell.addEventListener("click", function(e){
      const btn = e.target.closest("button[data-answer]");
      if(!btn) return;
      answers[i] = btn.dataset.answer === "yes";
      cell.querySelectorAll("button").forEach(function(b){ b.classList.remove("sel"); });
      btn.classList.add("sel");
      btn.setAttribute("aria-pressed", "true");
      cell.querySelectorAll("button").forEach(function(b){
        if(b !== btn) b.setAttribute("aria-pressed", "false");
      });
      refresh();
    });
  });

  document.getElementById("gapdismiss").addEventListener("click", function(){
    barDismissed = true; refresh();
  });
  pill.addEventListener("click", function(){ barDismissed = false; refresh(); });
})();
