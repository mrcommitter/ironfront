import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, "..");

const enPath = path.join(root, "resources/lang/en.json");
const faPath = path.join(root, "resources/lang/fa.json");

// Update English
const en = JSON.parse(fs.readFileSync(enPath, "utf8"));
function replaceInObjEn(obj) {
  for (const k in obj) {
    if (typeof obj[k] === "string") {
      obj[k] = obj[k]
        .replace(/support@openfront\.io/g, "support@ironfront.ir")
        .replace(/openfront\.io/gi, "ironfront.ir")
        .replace(/OpenFront/g, "IronFront");
    } else if (typeof obj[k] === "object" && obj[k] !== null) {
      replaceInObjEn(obj[k]);
    }
  }
}
replaceInObjEn(en);
en.main.title = "IronFront (ALPHA)";
en.main.copyright = "© IronFront™ and Contributors";
fs.writeFileSync(enPath, JSON.stringify(en, null, 2) + "\n", "utf8");

// Update Persian
const fa = JSON.parse(fs.readFileSync(faPath, "utf8"));
function replaceInObjFa(obj) {
  for (const k in obj) {
    if (typeof obj[k] === "string") {
      obj[k] = obj[k]
        .replace(/support@openfront\.io/g, "support@ironfront.ir")
        .replace(/openfront\.io/gi, "ironfront.ir")
        .replace(/اوپن\s*فرانت/g, "آیرون فرانت")
        .replace(/اوپن‌فرانت/g, "آیرون فرانت")
        .replace(/OpenFront/g, "IronFront");
    } else if (typeof obj[k] === "object" && obj[k] !== null) {
      replaceInObjFa(obj[k]);
    }
  }
}
replaceInObjFa(fa);
fa.main.title = "IronFront | آیرون فرانت";
fa.main.copyright = "© IronFront™ و مشارکت‌کنندگان";
fs.writeFileSync(faPath, JSON.stringify(fa, null, 2) + "\n", "utf8");

console.log("Successfully updated en.json and fa.json for IronFront branding!");
