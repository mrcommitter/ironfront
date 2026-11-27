import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, "..");

const filePath = path.join(root, "resources/tribeNameThemes.json");
const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

const persianPrefixes = [
  "Achaemenid",
  "Sasanian",
  "Parthian",
  "Safavid",
  "Afsharid",
  "Zand",
  "Buyid",
  "Samanid",
  "Tahirid",
  "Ghaznavid",
  "Seljuk",
  "Khwarazmian",
  "Kourosh",
  "Daryush",
  "Rostam",
  "Surena",
  "Aryobarzan",
  "Babak",
  "Arash",
  "Kaveh",
  "Gordafarid",
  "Shapur",
  "Anushirvan",
  "Mehrdad",
  "Bahram",
  "Fereydoun",
  "Jamshid",
  "Sohrab",
  "IronBot-Alpha",
  "IronBot-Omega",
  "IronBot-Sigma",
  "Apex-Vanguard",
  "Cyber-Legion"
];

const persianSuffixes = [
  "Empire",
  "Dynasty",
  "Kingdom",
  "Guardians",
  "Vanguard",
  "Legion",
  "Battalion",
  "Sovereign",
  "Horde",
  "Dominion",
  "Command",
  "Coalition",
  "Warriors",
  "Knights"
];

// Add to default and war themes
for (const p of persianPrefixes) {
  if (!data.default.prefixes.includes(p)) data.default.prefixes.unshift(p);
  if (data.war && !data.war.prefixes.includes(p)) data.war.prefixes.unshift(p);
}

for (const s of persianSuffixes) {
  if (!data.default.suffixes.includes(s)) data.default.suffixes.push(s);
  if (data.war && !data.war.suffixes.includes(s)) data.war.suffixes.push(s);
}

// Add a dedicated iran theme
data.iran = {
  prefixes: persianPrefixes,
  suffixes: persianSuffixes
};

fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
console.log("Successfully added Persian & Epic bot/tribe names to tribeNameThemes.json!");
