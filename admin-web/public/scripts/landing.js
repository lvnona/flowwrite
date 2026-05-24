// Landing page enhancements — no dependencies.
(function () {
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Year in footer
  var y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();

  // Header border on scroll
  var header = document.getElementById('header');
  var onScroll = function () { if (header) header.classList.toggle('scrolled', window.scrollY > 8); };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Mobile menu
  var btn = document.getElementById('menuBtn');
  var links = document.getElementById('navLinks');
  if (btn && links) {
    btn.addEventListener('click', function () { links.classList.toggle('open'); });
    links.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { links.classList.remove('open'); });
    });
  }

  // ── Post-checkout return banner (?upgraded=1 / ?cancelled=1) ──────────────
  (function checkoutReturn() {
    var params = new URLSearchParams(window.location.search);
    var upgraded = params.has('upgraded');
    var cancelled = params.has('cancelled');
    if (!upgraded && !cancelled) return;

    var bar = document.createElement('div');
    bar.className = 'checkout-toast ' + (upgraded ? 'is-success' : 'is-cancel');
    bar.setAttribute('role', 'status');
    bar.innerHTML = upgraded
      ? '<span class="ct-icon">🎉</span><span class="ct-msg"><strong>You\'re Pro!</strong> '
        + 'Thanks for subscribing. Your account is upgraded — unlimited generations &amp; voice '
        + 'dictation. Open FlowWrite and it\'ll switch to Pro automatically.</span>'
        + '<button class="ct-close" aria-label="Dismiss">&times;</button>'
      : '<span class="ct-icon">👋</span><span class="ct-msg">Checkout was cancelled — no charge was made. '
        + 'You can upgrade any time.</span>'
        + '<button class="ct-close" aria-label="Dismiss">&times;</button>';
    document.body.appendChild(bar);
    requestAnimationFrame(function () { bar.classList.add('show'); });

    var close = function () {
      bar.classList.remove('show');
      setTimeout(function () { bar.remove(); }, 350);
    };
    bar.querySelector('.ct-close').addEventListener('click', close);
    if (upgraded) setTimeout(close, 9000); else setTimeout(close, 6000);

    // Strip the flag from the URL so a refresh doesn't re-trigger the banner.
    if (window.history && window.history.replaceState) {
      params.delete('upgraded'); params.delete('cancelled');
      var qs = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (qs ? '?' + qs : '') + window.location.hash);
    }
  })();

  // ── Live transcription typewriter ─────────────────────────────────────────
  var textEl = document.getElementById('demoText');
  var ctxEl = document.getElementById('demoCtx');
  var eqEl = document.getElementById('eq');
  var caret = '<span class="caret"></span>';
  var samples = [
    { ctx: '✉️ Business email', text: "Hi team — quick update: the launch is on track for Friday. I'll send full details tomorrow." },
    { ctx: '𝕏 Social post', text: "Shipped something I'm genuinely proud of today. Small team, big swing. More soon. 🚀" },
    { ctx: '💬 Message', text: "Running about 5 minutes late — grab us a table and I'll be right there!" },
    { ctx: '🎙️ Dictated note', text: "Follow up with the design team about the new onboarding flow before Friday." }
  ];

  if (textEl) {
    if (reduce) {
      ctxEl.textContent = samples[0].ctx;
      textEl.textContent = samples[0].text;
    } else {
      var si = 0, ci = 0, mode = 'type';
      var setEq = function (on) { if (eqEl) eqEl.classList.toggle('paused', !on); };
      var tick = function () {
        var s = samples[si];
        if (mode === 'type') {
          setEq(true);
          if (ctxEl && ci === 0) ctxEl.textContent = s.ctx;
          ci++;
          textEl.innerHTML = s.text.slice(0, ci).replace(/&/g, '&amp;').replace(/</g, '&lt;') + caret;
          if (ci >= s.text.length) { mode = 'hold'; return schedule(2200); }
          return schedule(34 + Math.random() * 36);
        }
        if (mode === 'hold') { setEq(false); mode = 'erase'; return schedule(400); }
        // erase
        ci -= 3;
        if (ci <= 0) { ci = 0; mode = 'type'; si = (si + 1) % samples.length; return schedule(260); }
        textEl.innerHTML = s.text.slice(0, ci).replace(/&/g, '&amp;').replace(/</g, '&lt;') + caret;
        return schedule(12);
      };
      var schedule = function (ms) { setTimeout(tick, ms); };
      schedule(500);
    }
  }

  // ── Language cyclers ──────────────────────────────────────────────────────
  function cycle(el, items, ms, prefix) {
    if (!el) return;
    if (reduce) { el.textContent = (prefix || '') + items[0]; return; }
    var i = 0;
    setInterval(function () {
      i = (i + 1) % items.length;
      el.textContent = (prefix || '') + items[i];
    }, ms);
  }
  cycle(document.getElementById('demoLang'),
    ['English', 'Español', 'Français', 'Deutsch', '日本語', '中文', 'العربية', 'Português'],
    2000, '🌐 ');
  cycle(document.getElementById('xlatTo'),
    ['Español', 'Français', 'Deutsch', 'Italiano', '日本語', '한국어', '中文', 'العربية', 'Português'],
    1800, '');

  // ── Social media demo (idea → Facebook post) ─────────────────────────────
  (function social() {
    var input = document.getElementById('sdInput');
    var post = document.getElementById('sdPost');
    var tags = document.getElementById('sdTags');
    var gen = document.getElementById('sdGen');
    if (!input || !post || !tags || !gen) return;

    var prompt = 'Make a post about the latest AI technologies';
    var body =
      "🤖 AI just had its biggest year yet — and it's only getting wilder.\n\n" +
      "Models that can see, hear and reason. Assistants that draft your emails while you sip your coffee ☕. The tools we used to dream about are finally here.\n\n" +
      "The real shift? You don't need to be technical anymore — if you can describe it, AI can help you build it.\n\n" +
      "👉 What's the one task you'd hand to AI tomorrow?";
    var hashtags = '#AI #ArtificialIntelligence #TechTrends #Innovation #FutureOfWork #MachineLearning';
    var caret = '<span class="caret"></span>';
    var esc = function (s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;'); };

    if (reduce) {
      input.textContent = prompt;
      post.textContent = body;
      tags.textContent = hashtags; tags.style.opacity = 1;
      return;
    }

    function run() {
      input.innerHTML = caret; post.innerHTML = ''; tags.textContent = ''; tags.style.opacity = 0;
      gen.className = 'sd-gen'; gen.textContent = '✨ Generate';
      var i = 0;
      (function typePrompt() {
        i++; input.innerHTML = esc(prompt.slice(0, i)) + caret;
        if (i < prompt.length) return setTimeout(typePrompt, 42 + Math.random() * 40);
        setTimeout(generate, 650);
      })();

      function generate() {
        gen.classList.add('pulse');
        setTimeout(function () { gen.classList.remove('pulse'); gen.classList.add('busy'); gen.textContent = 'Generating…'; }, 140);
        setTimeout(function () {
          var j = 0; post.innerHTML = caret;
          (function typeBody() {
            j += 2; post.innerHTML = esc(body.slice(0, j)) + caret;
            if (j < body.length) return setTimeout(typeBody, 14);
            post.innerHTML = esc(body);
            tags.style.transition = 'opacity .5s ease'; tags.textContent = hashtags;
            requestAnimationFrame(function () { tags.style.opacity = 1; });
            gen.classList.remove('busy'); gen.textContent = '✓ Ready';
            setTimeout(run, 5200);
          })();
        }, 1000);
      }
    }
    run();
  })();
})();
