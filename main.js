// ============================================================
//  aion — interactions
//  - caustic / wave field background (WebGL, ported from the
//    Aion Mac app's caustics.metal, recoloured to ink-on-paper)
//  - scroll reveals, nav state
//  - "roll" hover on links, subtle parallax on the hero mark
//  The hero mark itself (the ring drawing on + ripples) is pure
//  CSS/SVG — see index.html and styles.css.
// ============================================================

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const nav = document.getElementById("nav");

// ---------- scroll reveal ----------
function initReveal() {
  const items = document.querySelectorAll("[data-reveal]");
  if (!("IntersectionObserver" in window) || reduceMotion) {
    items.forEach((el) => el.classList.add("in"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.16, rootMargin: "0px 0px -8% 0px" }
  );
  items.forEach((el) => io.observe(el));
}

// ---------- nav background on scroll ----------
function initNav() {
  if (!nav) return;
  const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 12);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
}

// ---------- "roll" hover: text swaps with a copy from below ----------
function initLinkRoll() {
  const links = document.querySelectorAll(".nav__links a, .footer__links a");
  links.forEach((a) => {
    if (a.dataset.roll) return;
    a.dataset.roll = "1";
    const text = a.textContent.trim();
    a.classList.add("roll");
    a.innerHTML =
      `<span class="roll-a">${text}</span>` +
      `<span class="roll-b" aria-hidden="true">${text}</span>`;
  });
}

// ---------- subtle parallax on the hero mark ----------
function initHeroParallax() {
  const mark = document.getElementById("hero-mark");
  if (!mark || reduceMotion) return;
  let tx = 0, ty = 0, x = 0, y = 0, raf = null;

  function tick() {
    x += (tx - x) * 0.06;
    y += (ty - y) * 0.06;
    mark.style.transform = `translate(${x * 24}px, ${y * 24}px)`;
    if (Math.abs(tx - x) > 0.0005 || Math.abs(ty - y) > 0.0005) {
      raf = requestAnimationFrame(tick);
    } else {
      raf = null;
    }
  }
  window.addEventListener(
    "pointermove",
    (e) => {
      tx = e.clientX / window.innerWidth - 0.5;
      ty = e.clientY / window.innerHeight - 0.5;
      if (!raf) raf = requestAnimationFrame(tick);
    },
    { passive: true }
  );
}

// ---------- background: a caustic / wave-interference field ----------
// Ported from the Aion Mac app's caustics.metal, recoloured to ink-on-paper.
// Composition is a mandala: one source at the centre (the self) with a
// quaternity of sources around it, the field concentrated toward the middle.
function initBackground() {
  const bg = document.getElementById("bg-canvas");
  if (!bg) return;

  let r;
  try {
    r = new THREE.WebGLRenderer({ canvas: bg, alpha: true, antialias: false });
  } catch (err) {
    return; // no WebGL — the paper field stands on its own
  }
  const pr = Math.min(window.devicePixelRatio || 1, 1.5);
  r.setPixelRatio(pr);
  r.setClearAlpha(0);

  const scene = new THREE.Scene();
  const cam = new THREE.Camera();

  const uniforms = {
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uInk: { value: new THREE.Color(0x1b1814) },
    uStrength: { value: 0.12 },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    vertexShader: `
      void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
    `,
    fragmentShader: `
      precision highp float;
      uniform float uTime;
      uniform vec2  uRes;
      uniform vec3  uInk;
      uniform float uStrength;

      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
      float vnoise(vec2 p){
        vec2 i = floor(p), f = fract(p);
        float a = hash(i), b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
      }
      float fbm(vec2 p){
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 5; i++) { v += a * vnoise(p); p *= 2.0; a *= 0.5; }
        return v;
      }

      void main(){
        vec2 uv = gl_FragCoord.xy / uRes - 0.5;
        uv.x *= uRes.x / uRes.y;
        float t = uTime;

        float w = 0.0;
        w += sin(length(uv) * 34.0 - t * 0.50);                         // centre — the self
        w += sin(length(uv - vec2(-0.55,  0.34)) * 26.0 - t * 0.62);    // quaternity
        w += sin(length(uv - vec2( 0.58,  0.30)) * 30.0 + t * 0.48);
        w += sin(length(uv - vec2( 0.50, -0.40)) * 24.0 - t * 0.55);
        w += sin(length(uv - vec2(-0.48, -0.42)) * 28.0 + t * 0.43);
        w /= 5.0;

        float c = pow(1.0 - abs(w), 4.0);             // thin, bright caustic ridges
        float n = fbm(uv * 2.2 + vec2(t * 0.05, -t * 0.04));
        c *= 0.75 + 0.4 * n;

        float vig = 1.0 - smoothstep(0.05, 1.05, length(uv));
        float a = c * vig * uStrength;

        gl_FragColor = vec4(uInk, a);
      }
    `,
  });

  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  scene.add(quad);

  function resizeBg() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    r.setSize(w, h, false);
    uniforms.uRes.value.set(w * pr, h * pr);
  }
  resizeBg();
  window.addEventListener("resize", resizeBg, { passive: true });

  let bgStart = null;
  let bgRunning = true;
  document.addEventListener("visibilitychange", () => {
    bgRunning = !document.hidden;
    if (bgRunning) requestAnimationFrame(bgLoop);
  });

  function bgLoop(now) {
    if (!bgRunning) return;
    if (bgStart === null) bgStart = now;
    uniforms.uTime.value = reduceMotion ? 6.0 : (now - bgStart) / 1000;
    r.render(scene, cam);
    if (!reduceMotion) requestAnimationFrame(bgLoop);
  }
  requestAnimationFrame(bgLoop);
}

initReveal();
initNav();
initLinkRoll();
initHeroParallax();
initBackground();
