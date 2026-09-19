// Run after editing data/abstracts.json: npm install, then node scripts/render-abstracts.cjs.
// Keep source wording in text; only typeset TeX in the derived html field.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const katex = require(process.env.KATEX_MODULE || 'katex');
const file = path.join(__dirname, '../data/abstracts.json');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const escape = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function render(s) {
  // Text-level TeX emphasis found in arXiv abstracts; preserve the words.
  const tokens = /\{\\bf\{([^{}]*)\}\}|\\emph\{([^{}]*)\}|\$\$([\s\S]*?)\$\$|\$([^$]*?)\$|\\\(([\s\S]*?)\\\)/g;
  let result = '', end = 0;
  for (const m of s.matchAll(tokens)) {
    result += escape(s.slice(end, m.index));
    if (m[1] !== undefined || m[2] !== undefined) {
      const tag = m[1] !== undefined ? 'strong' : 'em';
      result += `<${tag}>${render(m[1] ?? m[2])}</${tag}>`;
    } else {
      result += katex.renderToString(m[3] ?? m[4] ?? m[5], {output:'mathml', displayMode:m[3] !== undefined, throwOnError:true, trust:false});
    }
    end = m.index + m[0].length;
  }
  return result + escape(s.slice(end));
}
for (const entry of Object.values(data)) {
  entry.html = entry.text.split(/\n\s*\n/).map(p => `<p>${render(p)}</p>`).join('\n');
  entry.sha256 = crypto.createHash('sha256').update(entry.text).digest('hex');
}
fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
console.log(`Typeset ${Object.keys(data).length} abstracts with native MathML.`);
