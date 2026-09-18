import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-institutional-loader',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div *ngIf="visible" class="loader-overlay" role="status" aria-live="polite" aria-atomic="true" [attr.aria-label]="message">
      <div class="loader-card">
        <div class="orbital-scene" aria-hidden="true">
          <div class="ambient-glow"></div>
          <div class="orbit orbit-back"></div>
          <svg class="globe" viewBox="0 0 180 180" focusable="false">
            <defs>
              <radialGradient id="ocean" cx="36%" cy="28%" r="72%">
                <stop offset="0" stop-color="#55d8ff"/><stop offset=".42" stop-color="#0879da"/><stop offset="1" stop-color="#063b91"/>
              </radialGradient>
              <clipPath id="globe-clip"><circle cx="90" cy="90" r="68"/></clipPath>
            </defs>
            <circle cx="90" cy="90" r="70" fill="url(#ocean)" stroke="#7de5ff" stroke-width="3"/>
            <g class="grid" clip-path="url(#globe-clip)">
              <ellipse cx="90" cy="90" rx="35" ry="68"/><ellipse cx="90" cy="90" rx="60" ry="68"/>
              <ellipse cx="90" cy="90" rx="68" ry="25"/><ellipse cx="90" cy="90" rx="68" ry="50"/><path d="M22 90h136"/>
            </g>
            <g class="land" clip-path="url(#globe-clip)">
              <path d="M45 40l15-10 23 4 10 13-8 8-15-3-5 8-13 1-8 12-13-6 3-16z"/>
              <path d="M69 66l15 2 11 14-7 15-3 20-10 22-10-6-3-18-9-12 4-15-8-9z"/>
              <path d="M108 44l21 2 19 12 8 17-11 8-9-6-10 7-8-9-17-2-8-13z"/>
              <path d="M111 87l20-5 14 12-5 13-9 2-4 19-12 8-9-18-8-17z"/>
            </g>
            <ellipse class="globe-shine" cx="68" cy="55" rx="36" ry="19"/>
          </svg>
          <div class="orbit orbit-front"></div>
          <div class="flight-path">
            <span class="contrail"></span>
            <svg class="airplane" viewBox="0 0 576 512" focusable="false">
              <path d="M480 192H365.7L260.8 8.6A17.3 17.3 0 0 0 245.8 0h-36.6c-10.6 0-18.3 10.2-15.2 20.3L245.7 192H144l-43.2-57.6A16 16 0 0 0 88 128H56c-10.4 0-18 9.8-15.5 19.9L72 256 40.5 364.1C38 374.2 45.6 384 56 384h32a16 16 0 0 0 12.8-6.4L144 320h101.7L194 491.7c-3.1 10.1 4.6 20.3 15.2 20.3h36.6a17.3 17.3 0 0 0 15-8.6L365.7 320H480c35.3 0 96-28.7 96-64s-60.7-64-96-64Z"/>
            </svg>
          </div>
        </div>
        <strong class="loader-message">{{ message }}</strong>
        <span class="loader-caption">{{ detail }}</span>
        <div class="loading-dots" aria-hidden="true"><i></i><i></i><i></i></div>
      </div>
    </div>
  `,
  styles: [`
    :host{display:contents}.loader-overlay{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:20px;background:rgba(5,20,40,.72);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);cursor:wait;touch-action:none}
    .loader-card{width:min(390px,calc(100vw - 32px));display:grid;justify-items:center;padding:24px 24px 22px;border:1px solid rgba(125,211,252,.58);border-radius:26px;color:#eef8ff;background:linear-gradient(155deg,rgba(10,52,94,.98),rgba(5,27,55,.98));box-shadow:0 30px 90px rgba(0,8,25,.55),inset 0 1px rgba(255,255,255,.12);text-align:center;box-sizing:border-box}
    .orbital-scene{position:relative;width:250px;height:205px;margin-bottom:8px}.ambient-glow{position:absolute;inset:25px 38px;border-radius:50%;background:rgba(31,176,255,.26);filter:blur(22px);animation:glow-pulse 2.4s ease-in-out infinite}
    .globe{position:absolute;width:180px;height:180px;left:35px;top:8px;filter:drop-shadow(0 12px 22px rgba(0,110,255,.45))}.grid{fill:none;stroke:rgba(150,235,255,.32);stroke-width:1}.land{fill:#dff8ff;stroke:rgba(255,255,255,.7);stroke-width:1}.globe-shine{fill:rgba(255,255,255,.14);transform:rotate(-24deg);transform-origin:68px 55px}
    .orbit{position:absolute;left:12px;top:71px;width:226px;height:76px;border:3px solid transparent;border-radius:50%;transform:rotate(-10deg);box-sizing:border-box}.orbit-back{border-top-color:rgba(120,224,255,.45)}.orbit-front{border-bottom-color:#8cecff;filter:drop-shadow(0 0 6px #20bfff)}
    .flight-path{position:absolute;width:54px;height:42px;offset-path:ellipse(105px 47px at 125px 106px);offset-rotate:auto 0deg;animation:fly-orbit 3s linear infinite;filter:drop-shadow(0 4px 7px rgba(0,187,255,.65))}.airplane{position:absolute;inset:0;width:54px;height:42px;overflow:visible;transform:translate(-50%,-50%);fill:#f5fbff;stroke:#0879da;stroke-width:10;stroke-linejoin:round}.contrail{position:absolute;width:32px;height:3px;right:42px;top:-1px;border-radius:999px;background:linear-gradient(90deg,transparent,rgba(126,231,255,.9));transform:translateY(-50%)}
    .loader-message{font-size:18px;line-height:1.35;letter-spacing:.01em}.loader-caption{margin-top:6px;color:#a9c5db;font-size:13px}.loading-dots{display:flex;gap:7px;height:12px;margin-top:14px}.loading-dots i{width:7px;height:7px;border-radius:50%;background:#74dcff;animation:dot-pulse 1.1s ease-in-out infinite}.loading-dots i:nth-child(2){animation-delay:.16s}.loading-dots i:nth-child(3){animation-delay:.32s}
    @keyframes fly-orbit{to{offset-distance:100%}}@keyframes glow-pulse{50%{opacity:.68;transform:scale(1.06)}}@keyframes dot-pulse{0%,70%,100%{opacity:.3;transform:translateY(0)}35%{opacity:1;transform:translateY(-4px)}}
    @media(max-width:480px){.loader-card{padding:18px 12px;border-radius:22px}.orbital-scene{width:220px;height:185px;transform:scale(.88);margin:-4px 0 0}.loader-message{font-size:16px}}
    @media(prefers-reduced-motion:reduce){.flight-path,.ambient-glow,.loading-dots i{animation:none}.flight-path{offset-distance:14%}}
  `]
})
export class InstitutionalLoaderComponent {
  @Input() visible = false;
  @Input() message = 'Procesando solicitud...';
  @Input() detail = 'Por favor, espera un momento';
}
