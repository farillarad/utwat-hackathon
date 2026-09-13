import { useEffect, useRef } from "react";
import type { RunRecord } from "@shared/schema/benchmarkRun";
import { SECTORS, getOutcome, type Outcome } from "../lib/benchmark";

const hash = (n: number) => {
  const value = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
};

function noise(x: number, y: number) {
  const xx = Math.floor(x), yy = Math.floor(y);
  const fx = x - xx, fy = y - yy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(xx + yy * 57), b = hash(xx + 1 + yy * 57);
  const c = hash(xx + (yy + 1) * 57), d = hash(xx + 1 + (yy + 1) * 57);
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}

export function Starfield({ moving }: { moving: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d", { alpha: false });
    if (!canvas || !ctx) return;
    const cloud = document.createElement("canvas");
    cloud.width = 480;
    cloud.height = 300;
    const cloudCtx = cloud.getContext("2d")!;
    const image = cloudCtx.createImageData(cloud.width, cloud.height);
    for (let y = 0; y < cloud.height; y++) {
      for (let x = 0; x < cloud.width; x++) {
        const n = noise(x / 90, y / 90) * 0.5 + noise(x / 40, y / 40) * 0.28 + noise(x / 17, y / 17) * 0.15 + noise(x / 7, y / 7) * 0.07;
        const band = Math.exp(-Math.pow((y / 300 + x / 700 - 0.84) * 4.6, 2));
        const density = Math.max(0, n - 0.26) * band;
        const i = (y * cloud.width + x) * 4;
        image.data[i] = 3 + density * 34;
        image.data[i + 1] = 5 + density * 28;
        image.data[i + 2] = 9 + density * 45;
        image.data[i + 3] = 255;
      }
    }
    cloudCtx.putImageData(image, 0, 0);
    const stars = Array.from({ length: 430 }, (_, i) => ({ x: hash(i * 7), y: hash(i * 11 + 2), size: 0.25 + hash(i * 13) ** 5 * 1.5, alpha: 0.18 + hash(i * 17) * 0.62, depth: 0.3 + hash(i * 23) }));
    let width = 0, height = 0, frame = 0, offsetX = 0, offsetY = 0;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      if (!moving) draw(0);
    };
    const draw = (now: number) => {
      ctx.fillStyle = "#03060b";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(cloud, -30 + offsetX * 0.2, -20 + offsetY * 0.2, width + 60, height + 40);
      for (const star of stars) {
        const x = (star.x * (width + 40) + (moving ? now * 0.0006 * star.depth : 0) + offsetX * star.depth + width + 40) % (width + 40) - 20;
        const y = star.y * height + offsetY * star.depth;
        ctx.globalAlpha = star.alpha * (moving ? 0.83 + Math.sin(now * 0.0007 + star.x * 40) * 0.17 : 1);
        ctx.fillStyle = star.size > 1.3 ? "#e1ddcf" : "#acbbd1";
        ctx.beginPath();
        ctx.arc(x, y, star.size, 0, Math.PI * 2);
        ctx.fill();
        if (star.size > 1.5) {
          ctx.globalAlpha *= 0.18;
          ctx.fillRect(x - 4, y - 0.3, 8, 0.6);
          ctx.fillRect(x - 0.3, y - 4, 0.6, 8);
        }
      }
      ctx.globalAlpha = 1;
      if (moving) frame = requestAnimationFrame(draw);
    };
    const pointer = (event: PointerEvent) => {
      offsetX = (event.clientX / window.innerWidth - 0.5) * -12;
      offsetY = (event.clientY / window.innerHeight - 0.5) * -8;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    if (moving) {
      frame = requestAnimationFrame(draw);
      window.addEventListener("pointermove", pointer, { passive: true });
    }
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", pointer);
    };
  }, [moving]);
  return <canvas className="cockpit-stars" ref={ref} aria-hidden="true" />;
}

export function Canopy() {
  return (
    <svg className="cockpit-canopy" viewBox="0 0 1600 1000" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="ck-metal" x1="0" y1="0" x2="0.4" y2="1"><stop stopColor="#303135" /><stop offset=".19" stopColor="#101217" /><stop offset=".54" stopColor="#040508" /><stop offset=".85" stopColor="#17191e" /><stop offset="1" stopColor="#383438" /></linearGradient>
        <linearGradient id="ck-arm" x2="0.25" y2="1"><stop stopColor="#07090d" /><stop offset=".43" stopColor="#080a0d" /><stop offset=".56" stopColor="#24262b" /><stop offset=".62" stopColor="#111419" /><stop offset="1" stopColor="#030407" /></linearGradient>
        <linearGradient id="ck-dash" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#44342e" /><stop offset=".18" stopColor="#221f1e" /><stop offset=".3" stopColor="#0d1013" /><stop offset=".85" stopColor="#090b0e" /><stop offset="1" stopColor="#030407" /></linearGradient>
        <linearGradient id="ck-face" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#352922" /><stop offset=".2" stopColor="#19191b" /><stop offset=".8" stopColor="#05070a" /><stop offset="1" stopColor="#30251f" /></linearGradient>
        <radialGradient id="ck-knob"><stop stopColor="#080a0c" /><stop offset=".64" stopColor="#161a1e" /><stop offset=".8" stopColor="#383b3c" /><stop offset="1" stopColor="#040609" /></radialGradient>
        <linearGradient id="ck-edge"><stop stopColor="#4b3020" stopOpacity=".15" /><stop offset=".35" stopColor="#de7730" stopOpacity=".6" /><stop offset=".6" stopColor="#583621" /><stop offset="1" stopColor="#b3602b" stopOpacity=".15" /></linearGradient>
      </defs>
      <path d="M0 0H1600V31L1505 88 1094 132H506L95 88 0 31Z" fill="url(#ck-metal)" />
      <path d="M14 3L121 69 514 113H1086L1479 69 1586 3" fill="none" stroke="#323135" strokeWidth="3" />
      <path d="M50 12L132 55 517 100H1083L1468 55 1550 12" fill="none" stroke="#030509" strokeWidth="10" />
      <path d="M103 88L506 130H1094L1497 88" fill="none" stroke="#896c4d" strokeOpacity=".28" strokeWidth="2" />
      <path d="M0 44L457 317 486 405 430 354 0 140Z" fill="url(#ck-arm)" />
      <path d="M1600 44L1143 317 1114 405 1170 354 1600 140Z" fill="url(#ck-arm)" />
      <path d="M0 77L437 329 473 389M1600 77L1163 329 1127 389" fill="none" stroke="#393a3b" strokeOpacity=".48" strokeWidth="3" />
      <path d="M0 99L426 349 461 395M1600 99L1174 349 1139 395" fill="none" stroke="#000206" strokeWidth="10" />
      <path d="M0 666L381 728 474 716 626 799 563 893 0 878Z" fill="url(#ck-metal)" />
      <path d="M1600 666L1219 728 1126 716 974 799 1037 893 1600 878Z" fill="url(#ck-metal)" />
      <path d="M0 686L382 740 472 732 608 802M1600 686L1218 740 1128 732 992 802" fill="none" stroke="#575049" strokeOpacity=".6" strokeWidth="3" />
      <path d="M0 698L380 755 464 746 591 811M1600 698L1220 755 1136 746 1009 811" fill="none" stroke="#010307" strokeWidth="10" />
      <path d="M0 841L365 811 543 775 640 738H960L1057 775 1235 811 1600 841V1000H0Z" fill="url(#ck-dash)" />
      <path d="M0 859L365 829 543 793 646 757H954L1057 793 1235 829 1600 859" fill="none" stroke="url(#ck-edge)" strokeWidth="4" />
      <path d="M618 791L661 754H938L982 791 1040 942 967 1000H634L560 941Z" fill="url(#ck-face)" stroke="#302c28" strokeWidth="3" />
      <path d="M643 810L679 776H921L957 810 982 920 942 951H658L619 920Z" fill="#080b0f" stroke="#514138" strokeWidth="4" />
      <ellipse cx="800" cy="855" rx="180" ry="76" fill="#190e08" stroke="#603b24" strokeWidth="3" />
      <ellipse cx="800" cy="853" rx="165" ry="65" fill="#080a0c" stroke="#29201a" strokeWidth="12" />
      <path d="M612 827L598 847 621 929M988 827L1002 847 979 929" fill="none" stroke="#a76231" strokeOpacity=".45" strokeWidth="7" />
      <path d="M80 893L462 844 515 911 465 994H22ZM1520 893L1138 844 1085 911 1135 994H1578Z" fill="#05080b" stroke="#252325" strokeWidth="3" />
      {[62, 1540].map((x) => <g key={x}><ellipse cx={x} cy="837" rx="27" ry="32" fill="url(#ck-knob)" transform={`rotate(${x < 800 ? 24 : -24} ${x} 837)`} /><path d={`M${x - 6} 823l12 25M${x} 821l12 25`} stroke="#51504b" strokeOpacity=".6" /></g>)}
      {[117, 151, 185, 1415, 1449, 1483].map((x) => <path key={x} d={`M${x} 986l9-34`} stroke="#302d29" strokeWidth="9" />)}
      <path d="M0 981H1600" stroke="#000" strokeWidth="38" />
    </svg>
  );
}

export function FlightTarget({ progress, outcome, level, step, hasRun }: { progress: number; outcome: Outcome; level: number; step: number; hasRun: boolean }) {
  const revealed = progress >= 0.999 && outcome !== "pending";
  const state = revealed ? outcome : "pending";
  const gateScale = 0.68 + progress * 0.3;
  return (
    <svg className={`cockpit-target cockpit-target--${state}`} viewBox="0 0 700 520" aria-hidden="true">
      <defs><filter id="ck-hud-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
      <g className="flight-brackets"><path d="M147 105Q65 255 147 400M553 105Q635 255 553 400" /><path d="M153 108Q78 255 153 397M547 108Q622 255 547 397" opacity=".28" />
        <path d="M130 104h21M130 401h21M549 104h21M549 401h21" />
      </g>
      {[0, 1].map((side) => <g key={side} className="flight-scale">
        {Array.from({ length: 27 }, (_, i) => <path key={i} d={`M${side ? 610 : 90} ${133 + i * 9}h${(side ? -1 : 1) * (i % 3 ? 5 : 13)}`} />)}
        {[40, 30, 20, 10, 0].map((number, i) => <text key={number} x={side ? 624 : 62} y={153 + i * 45}>{side ? number : `+${number}`}</text>)}
      </g>)}
      <text className="flight-micro" x="91" y="86">AGENT / 01</text><text className="flight-micro" x="545" y="86">GROUND TRUTH</text>
      <g className="flight-bearing"><path d="M267 39h166M350 32v15" />{Array.from({ length: 13 }, (_, i) => <path key={i} d={`M${272 + i * 13} 39v${i % 3 ? 4 : 8}`} />)}<text x="350" y="24" textAnchor="middle">TARGET {String(level).padStart(2, "0")}</text></g>
      {hasRun && <g className="flight-gate" transform={`translate(350 253) scale(${gateScale})`}>
        <path className="flight-gate__back" d="M-79-85H79L110-52V67L73 100H-73L-110 67V-52Z" />
        <path className="flight-gate__outer" d="M-98-138H98L169-67V95L98 164H-98L-169 95V-67Z" />
        <path className="flight-gate__inner" d="M-93-130H93L159-63V91L93 154H-93L-159 91V-63Z" />
        <path className="flight-gate__depth" d="M-98-138L-79-85M98-138L79-85M169-67L110-52M169 95L110 67M98 164L73 100M-98 164L-73 100M-169 95L-110 67M-169-67L-110-52" />
        <g className="flight-cargo" transform="translate(0 -9)"><path d="M0-34L35-15V25L0 46-35 25V-15ZM-35-15L0 6 35-15M0 6V46M-17-25L17-5V7" /><path d="M-53-41h-11v16M53-41h11v16M-53 53h-11V37M53 53h11V37" className="flight-lock" /></g>
        <text x="0" y="84" textAnchor="middle" className="flight-gate__label">{revealed ? outcome === "pass" ? "CARGO VERIFIED" : outcome === "false-success" ? "FALSE EXIT DETECTED" : "RUN RESOLVED" : "ORDER CONFIRMATION"}</text>
        <text x="0" y="110" textAnchor="middle" className="flight-gate__id">{revealed ? "CLAIM ≠ PROOF" : `APPROACH / ${String(step).padStart(2, "0")}`}</text>
      </g>}
      <g className="flight-crosshair"><path d="M339 252h7m8 0h7M350 241v7m0 8v7" /><circle cx="350" cy="252" r="2" /></g>
      <path className="flight-horizon" d="M226 455L350 440 474 455M350 422v63M344 483h12" />
      <path className="flight-pointer" d="M350 428l7 12-7-3-7 3Z" />
      <text x="235" y="480" className="flight-micro">{Math.round(progress * 100)}% / VERIFY</text>
      <text x="420" y="480" className="flight-micro">{String(step).padStart(2, "0")} STEPS</text>
    </svg>
  );
}

export function Radar({ level, runs, onSelect }: { level: number; runs: RunRecord[]; onSelect: (id: number) => void }) {
  return (
    <svg className="cockpit-radar" viewBox="0 0 480 250" role="group" aria-label="Tactical radar: choose one of twelve test cases">
      <defs><radialGradient id="ck-radar-fill"><stop stopColor="#693414" stopOpacity=".15" /><stop offset="1" stopColor="#0a0806" stopOpacity=".5" /></radialGradient></defs>
      <ellipse cx="240" cy="142" rx="194" ry="73" fill="url(#ck-radar-fill)" />
      {[1, 0.92, 0.82, 0.65, 0.49, 0.32, 0.15].map((r) => <ellipse key={r} cx="240" cy="142" rx={194 * r} ry={73 * r} className="radar-ring" />)}
      <ellipse cx="240" cy="144" rx="208" ry="83" className="radar-rim" strokeDasharray="95 9 21 5" />
      <path className="radar-sweep" d="M240 142L94 94Q135 58 215 62Z" />
      {SECTORS.map((sector, i) => {
        const angle = (i * 60 - 90) * Math.PI / 180;
        return <g key={sector.id}>
          <path className="radar-spoke" d={`M240 142L${240 + Math.cos(angle) * 193} ${142 + Math.sin(angle) * 73}`} />
          <text x={240 + Math.cos(angle) * 225} y={146 + Math.sin(angle) * 90} className="radar-number">{String(sector.id).padStart(2, "0")}</text>
          {sector.levels.map((id, j) => {
            const a = angle + (j ? 0.16 : -0.16);
            const radius = j ? 0.83 : 0.57;
            const x = 240 + Math.cos(a) * 194 * radius;
            const y = 142 + Math.sin(a) * 73 * radius;
            const outcome = getOutcome(runs.find((run) => run.level_id === id));
            return <g key={id} className={`radar-marker radar-marker--${outcome}${level === id ? " radar-marker--selected" : ""}`} transform={`translate(${x} ${y})`} role="button" tabIndex={0} aria-label={`Select level ${id}: ${sector.name}, variant ${j + 1}`} aria-pressed={level === id} onClick={() => onSelect(id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(id); } }}>
              <circle r="18" cy="-10" fill="transparent" className="radar-hit" />
              <path d="M0 0V-18" /><ellipse cy="0" rx="5" ry="2" opacity=".3" />
              <circle cy="-18" r={level === id ? 5 : 3} />
              {level === id && <><circle cy="-18" r="11" fill="none" className="radar-pulse" /><text x="14" y="-21">L{id}</text></>}
            </g>;
          })}
        </g>;
      })}
      <path d="M240 130L250 148 240 143 230 148Z" className="radar-ownship" />
      <text x="240" y="245" textAnchor="middle" className="radar-caption">12 TESTS / 6 INDEPENDENT SECTORS</text>
    </svg>
  );
}

export function Planet() {
  return <svg className="cockpit-planet" viewBox="0 0 180 220" aria-hidden="true">
    <defs><radialGradient id="ck-planet"><stop stopColor="#869db3" /><stop offset=".55" stopColor="#425c78" /><stop offset=".88" stopColor="#17293d" /><stop offset="1" stopColor="#081321" /></radialGradient><clipPath id="ck-planet-clip"><circle cx="90" cy="83" r="55" /></clipPath><filter id="ck-planet-noise"><feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="4" seed="14" /><feColorMatrix type="saturate" values="0" /><feComposite in2="SourceGraphic" operator="in" /><feBlend in="SourceGraphic" mode="soft-light" /></filter></defs>
    <ellipse cx="90" cy="179" rx="63" ry="16" className="planet-orbit" /><ellipse cx="90" cy="194" rx="46" ry="12" className="planet-orbit planet-orbit--dim" />
    <path d="M41 110L28 178M139 110L152 178" className="planet-projection" />
    <circle cx="90" cy="83" r="56" fill="url(#ck-planet)" stroke="#9bb9d6" strokeWidth="1" filter="url(#ck-planet-noise)" />
    <g clipPath="url(#ck-planet-clip)" opacity=".18" stroke="#b9d3e9" fill="none">{[32, 57, 83, 108, 133].map((y) => <ellipse key={y} cx="90" cy={y} rx="56" ry="8" />)}<ellipse cx="90" cy="83" rx="20" ry="56" /><ellipse cx="90" cy="83" rx="43" ry="56" /></g>
    <path d="M26 149H154" stroke="#69899f" strokeOpacity=".6" /><text x="90" y="214" textAnchor="middle">ENVIRONMENT / SANDBOX</text>
  </svg>;
}

export function Ship({ protected: protectedMode }: { protected: boolean }) {
  return <svg className={`cockpit-ship${protectedMode ? " cockpit-ship--protected" : ""}`} viewBox="0 0 230 220" aria-hidden="true">
    <g className="ship-shields"><ellipse cx="115" cy="84" rx="99" ry="42" transform="rotate(13 115 84)" /><ellipse cx="115" cy="84" rx="90" ry="37" transform="rotate(13 115 84)" /><ellipse cx="115" cy="84" rx="83" ry="31" transform="rotate(13 115 84)" /></g>
    <g className="ship-wireframe"><path d="M115 58L177 86 184 110 132 99 117 107 101 96 49 91 58 77Z" /><path d="M115 58L117 107M58 77L101 96 106 74 115 58 132 79 132 99 177 86M49 91L101 86M132 89L184 110M75 79L93 81 84 89M141 84L163 93 143 92" /><path d="M108 59L120 61 129 77 106 74Z" /><path d="M78 92L70 114M154 101L160 121" /></g>
    <ellipse cx="115" cy="161" rx="66" ry="18" className="ship-plinth" /><ellipse cx="115" cy="175" rx="52" ry="14" className="ship-plinth" opacity=".4" /><path d="M64 113L49 163M169 124L181 163" className="planet-projection" />
    <text x="115" y="210" textAnchor="middle">{protectedMode ? "VERIFICATION SHIELD / ON" : "VERIFICATION SHIELD / OFF"}</text>
  </svg>;
}

export function Compass() {
  return <svg className="cockpit-compass" viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="87" /><circle cx="100" cy="100" r="56" /><circle cx="100" cy="100" r="28" /><path d="M100 7v20M100 173v20M7 100h20M173 100h20M38 38l12 12M150 150l12 12" /><g className="compass-needle"><path d="M91 96l9-14 9 14M91 112l9 8 9-8" /><circle cx="100" cy="100" r="3" /></g></svg>;
}
