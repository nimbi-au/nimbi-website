/* Header navigation, loaded on every page. The small-screen menu button opens
   #main-nav, each .nav-toggle opens the dropdown it controls, and both close on
   an outside click, on Escape, or when the window grows past 780px. On the home
   page the "How it works" link is marked while that section is in view. Links
   that carry data-interest remember the visitor's interest for the contact
   form, and a URL hash that points inside a collapsed <details> opens it. */
(function () {
  'use strict';
  function $(selector) { return document.querySelector(selector); }
  function $$(selector) { return Array.prototype.slice.call(document.querySelectorAll(selector)); }
  function remember(key, value) {
    try { window.sessionStorage.setItem(key, value); } catch (e) { /* storage unavailable: nothing to remember */ }
  }

  /* ---------- menu button and dropdowns ---------- */
  var menu = $('.menu-button');
  var nav = document.getElementById('main-nav');

  function panelFor(button) { return document.getElementById(button.getAttribute('aria-controls') || ''); }
  function closeDropdowns() {
    $$('.nav-toggle').forEach(function (button) {
      button.setAttribute('aria-expanded', 'false');
      var panel = panelFor(button);
      if (panel) panel.hidden = true;
    });
  }
  function closeMenu() {
    if (nav) nav.classList.remove('open');
    if (menu) {
      menu.setAttribute('aria-expanded', 'false');
      menu.setAttribute('aria-label', 'Open navigation');
    }
    closeDropdowns();
  }

  if (menu && nav) {
    menu.addEventListener('click', function () {
      var open = menu.getAttribute('aria-expanded') !== 'true';
      nav.classList.toggle('open', open);
      menu.setAttribute('aria-expanded', String(open));
      menu.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
      if (!open) closeDropdowns();
    });
  }
  $$('.nav-toggle').forEach(function (button) {
    button.addEventListener('click', function () {
      var open = button.getAttribute('aria-expanded') !== 'true';
      closeDropdowns();
      button.setAttribute('aria-expanded', String(open));
      var panel = panelFor(button);
      if (panel) panel.hidden = !open;
    });
  });
  document.addEventListener('click', function (e) {
    var target = e.target;
    if (!target || !target.closest) return;
    if (!target.closest('.nav-group') && !target.closest('.menu-button')) closeDropdowns();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var active = $('.nav-toggle[aria-expanded="true"]');
    closeMenu();
    if (active) active.focus();
  });
  window.addEventListener('resize', function () {
    if (window.innerWidth > 780) closeMenu();
  });
  /* A same-page link in the open menu (the home page's "How it works") scrolls
     without a page load, so close the menu the way a navigation would. */
  if (nav) {
    nav.addEventListener('click', function (e) {
      if (e.target && e.target.closest && e.target.closest('a')) closeMenu();
    });
  }

  /* ---------- home page scroll-spy ---------- */
  var section = document.getElementById('how-it-works');
  var spyLink = nav ? nav.querySelector('a[href$="#how-it-works"]') : null;
  if (section && spyLink) {
    var scheduled = false;
    var spy = function () {
      var r = section.getBoundingClientRect();
      if (r.top <= 165 && r.bottom > 165) spyLink.setAttribute('aria-current', 'location');
      else if (spyLink.getAttribute('aria-current') === 'location') spyLink.removeAttribute('aria-current');
    };
    window.addEventListener('scroll', function () {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(function () { scheduled = false; spy(); });
    }, { passive: true });
    window.addEventListener('hashchange', spy);
    spy();
  }

  /* ---------- remember the interest a link expresses ---------- */
  document.addEventListener('click', function (e) {
    var link = e.target && e.target.closest ? e.target.closest('a[data-interest]') : null;
    if (link) remember('nimbi.interest', link.getAttribute('data-interest'));
  });

  /* ---------- deep links into collapsed content ---------- */
  /* If the URL hash targets a <details>, or something inside one, open it (and
     any <details> it is nested in) so the link lands on the expanded section
     rather than its closed summary. Runs on load and on every hash change. */
  function openHashTarget() {
    var id = window.location.hash.slice(1);
    if (!id) return;
    var target = null;
    try { target = document.getElementById(decodeURIComponent(id)); }
    catch (e) { target = document.getElementById(id); }
    if (!target) return;
    var opened = false;
    for (var d = target.closest('details'); d; d = d.parentElement && d.parentElement.closest('details')) {
      if (!d.open) { d.open = true; opened = true; }
    }
    /* The browser scrolled before the content existed; bring the target into view now. */
    if (opened) target.scrollIntoView();
  }
  window.addEventListener('hashchange', openHashTarget);
  openHashTarget();
})();
