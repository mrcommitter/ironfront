import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, "..");

// Function to generate the IronFront Logo SVG (Centered, tight, no overlapping)
function generateIronFrontLogo(isDark = true) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1364 259" width="1364" height="259">
  <defs>
    <!-- Gradients for Iron & Steel -->
    <linearGradient id="ironGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF" />
      <stop offset="35%" stop-color="#F1F5F9" />
      <stop offset="70%" stop-color="#94A3B8" />
      <stop offset="100%" stop-color="#475569" />
    </linearGradient>

    <!-- Gradients for Front Cyber Blue -->
    <linearGradient id="frontGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#7DD3FC" />
      <stop offset="35%" stop-color="#38BDF8" />
      <stop offset="70%" stop-color="#0284C7" />
      <stop offset="100%" stop-color="#0369A1" />
    </linearGradient>

    <linearGradient id="shieldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1E293B" />
      <stop offset="50%" stop-color="#0F172A" />
      <stop offset="100%" stop-color="#0284C7" />
    </linearGradient>

    <linearGradient id="shieldBorder" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38BDF8" />
      <stop offset="50%" stop-color="#0284C7" />
      <stop offset="100%" stop-color="#1E293B" />
    </linearGradient>

    <linearGradient id="badgeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#0284C7" />
      <stop offset="100%" stop-color="#00A3FF" />
    </linearGradient>

    <filter id="cyberGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="5" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <!-- ==================== EMBLEM: IRON FRONT SHIELD ==================== -->
  <g transform="translate(100, 32)">
    <!-- Outer Shield Shadow -->
    <polygon points="85,6 158,36 158,124 85,178 12,124 12,36" fill="#0B132B" stroke="#000" stroke-width="4" />
    
    <!-- Outer Shield Frame -->
    <polygon points="85,8 154,38 154,122 85,174 16,122 16,38" fill="url(#shieldGrad)" stroke="url(#shieldBorder)" stroke-width="5" stroke-linejoin="round" />

    <!-- Left Wing Plate -->
    <polygon points="85,18 24,44 24,114 85,158" fill="#1E293B" opacity="0.6" />
    
    <!-- Right Wing Plate -->
    <polygon points="85,18 146,44 146,114 85,158" fill="#334155" opacity="0.3" />

    <!-- Upper Chevron (Cyber Blue) -->
    <polygon points="85,28 128,62 112,74 85,54 58,74 42,62" fill="url(#frontGrad)" filter="url(#cyberGlow)" />
    
    <!-- Middle Chevron -->
    <polygon points="85,66 124,98 110,108 85,88 60,108 46,98" fill="url(#frontGrad)" opacity="0.9" />

    <!-- Lower Chevron Core -->
    <polygon points="85,102 118,128 108,136 85,120 62,136 52,128" fill="#38BDF8" opacity="0.8" />

    <!-- Center Line -->
    <line x1="85" y1="14" x2="85" y2="168" stroke="#38BDF8" stroke-width="2.5" stroke-linecap="round" opacity="0.85" />
  </g>

  <!-- ==================== TYPOGRAPHY: IRON FRONT ==================== -->
  
  <!-- 'I' -->
  <g transform="translate(295, 62)">
    <polygon points="0,0 26,0 26,134 0,134" fill="url(#ironGrad)" />
    <polygon points="0,0 26,0 26,8 0,8" fill="#FFFFFF" />
  </g>

  <!-- 'R' -->
  <g transform="translate(335, 62)">
    <polygon points="0,0 66,0 86,20 86,58 66,76 86,134 58,134 42,80 26,80 26,134 0,134" fill="url(#ironGrad)" />
    <!-- Cutout -->
    <polygon points="26,22 56,22 62,30 62,50 56,58 26,58" fill="#111827" />
    <polygon points="0,0 66,0 86,20 76,20 60,6 0,6" fill="#FFFFFF" opacity="0.8" />
  </g>

  <!-- 'O' -->
  <g transform="translate(435, 62)">
    <polygon points="22,0 68,0 90,22 90,112 68,134 22,134 0,112 0,22" fill="url(#ironGrad)" />
    <!-- Cutout -->
    <polygon points="32,26 58,26 66,36 66,98 58,108 32,108 24,98 24,36" fill="#111827" />
    <polygon points="22,0 68,0 90,22 80,22 64,6 26,6 8,22 0,22" fill="#FFFFFF" opacity="0.8" />
  </g>

  <!-- 'N' -->
  <g transform="translate(539, 62)">
    <polygon points="0,0 26,0 64,88 64,0 88,0 88,134 62,134 26,46 26,134 0,134" fill="url(#ironGrad)" />
    <polygon points="0,0 26,0 26,6 0,6" fill="#FFFFFF" opacity="0.8" />
    <polygon points="64,0 88,0 88,6 64,6" fill="#FFFFFF" opacity="0.8" />
  </g>

  <!-- SEPARATOR / ACCENT BAR -->
  <g transform="translate(642, 62)">
    <polygon points="4,0 14,0 8,134 0,134" fill="#38BDF8" opacity="0.7" />
  </g>

  <!-- 'F' -->
  <g transform="translate(668, 62)">
    <polygon points="0,0 84,0 84,24 26,24 26,56 74,56 74,80 26,80 26,134 0,134" fill="url(#frontGrad)" />
    <polygon points="0,0 84,0 84,8 0,8" fill="#BAE6FD" opacity="0.9" />
    <polygon points="26,56 74,56 74,62 26,62" fill="#BAE6FD" opacity="0.7" />
  </g>

  <!-- 'R' -->
  <g transform="translate(766, 62)">
    <polygon points="0,0 66,0 86,20 86,58 66,76 86,134 58,134 42,80 26,80 26,134 0,134" fill="url(#frontGrad)" />
    <!-- Cutout -->
    <polygon points="26,22 56,22 62,30 62,50 56,58 26,58" fill="#111827" />
    <polygon points="0,0 66,0 86,20 76,20 60,6 0,6" fill="#BAE6FD" opacity="0.9" />
  </g>

  <!-- 'O' -->
  <g transform="translate(866, 62)">
    <polygon points="22,0 68,0 90,22 90,112 68,134 22,134 0,112 0,22" fill="url(#frontGrad)" />
    <!-- Cutout -->
    <polygon points="32,26 58,26 66,36 66,98 58,108 32,108 24,98 24,36" fill="#111827" />
    <polygon points="22,0 68,0 90,22 80,22 64,6 26,6 8,22 0,22" fill="#BAE6FD" opacity="0.9" />
  </g>

  <!-- 'N' -->
  <g transform="translate(970, 62)">
    <polygon points="0,0 26,0 64,88 64,0 88,0 88,134 62,134 26,46 26,134 0,134" fill="url(#frontGrad)" />
    <polygon points="0,0 26,0 26,6 0,6" fill="#BAE6FD" opacity="0.9" />
    <polygon points="64,0 88,0 88,6 64,6" fill="#BAE6FD" opacity="0.9" />
  </g>

  <!-- 'T' -->
  <g transform="translate(1072, 62)">
    <polygon points="0,0 88,0 88,26 58,26 58,134 30,134 30,26 0,26" fill="url(#frontGrad)" />
    <polygon points="0,0 88,0 88,8 0,8" fill="#BAE6FD" opacity="0.9" />
  </g>

  <!-- ==================== BADGE: .IR ==================== -->
  <g transform="translate(1172, 62)">
    <!-- Badge Box -->
    <polygon points="5,0 66,0 74,8 74,42 66,50 5,50 0,42 0,8" fill="url(#badgeGrad)" stroke="#38BDF8" stroke-width="2" />
    <!-- Dot -->
    <rect x="9" y="30" width="6" height="7" fill="#FFFFFF" />
    <!-- I -->
    <rect x="20" y="13" width="6" height="24" fill="#FFFFFF" />
    <!-- R -->
    <polygon points="31,13 49,13 54,18 54,25 49,29 56,37 48,37 42,29 37,29 37,37 31,37" fill="#FFFFFF" />
    <rect x="37" y="18" width="9" height="6" fill="#0284C7" />
  </g>
</svg>`;
}

// Function to generate the IronFront Favicon SVG
function generateIronFrontFavicon() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <defs>
    <linearGradient id="favShieldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1E293B" />
      <stop offset="60%" stop-color="#0F172A" />
      <stop offset="100%" stop-color="#0284C7" />
    </linearGradient>
    <linearGradient id="favBorder" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38BDF8" />
      <stop offset="100%" stop-color="#0369A1" />
    </linearGradient>
    <linearGradient id="favCyan" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#7DD3FC" />
      <stop offset="50%" stop-color="#38BDF8" />
      <stop offset="100%" stop-color="#0284C7" />
    </linearGradient>
  </defs>

  <!-- Shield Base -->
  <polygon points="64,8 116,28 116,84 64,120 12,84 12,28" fill="url(#favShieldGrad)" stroke="url(#favBorder)" stroke-width="5" stroke-linejoin="round" />

  <!-- Inner Plates -->
  <polygon points="64,18 22,36 22,78 64,108" fill="#1E293B" opacity="0.7" />
  <polygon points="64,18 106,36 106,78 64,108" fill="#334155" opacity="0.4" />

  <!-- Tactical Chevrons -->
  <polygon points="64,28 94,52 82,62 64,48 46,62 34,52" fill="url(#favCyan)" />
  <polygon points="64,58 90,80 80,88 64,74 48,88 38,80" fill="url(#favCyan)" opacity="0.9" />
  <polygon points="64,84 84,102 76,108 64,96 52,108 44,102" fill="#BAE6FD" opacity="0.8" />

  <!-- Center Line -->
  <line x1="64" y1="14" x2="64" y2="114" stroke="#38BDF8" stroke-width="2.5" stroke-linecap="round" />
</svg>`;
}

const logoLight = generateIronFrontLogo(false);
const logoDark = generateIronFrontLogo(true);
const faviconSvg = generateIronFrontFavicon();

fs.writeFileSync(path.join(root, "proprietary/images/OpenFrontLogo.svg"), logoLight);
fs.writeFileSync(path.join(root, "proprietary/images/OpenFrontLogoDark.svg"), logoDark);
fs.writeFileSync(path.join(root, "proprietary/images/Favicon.svg"), faviconSvg);

console.log("Successfully regenerated centered, compact IronFront SVG logos and Favicon!");
