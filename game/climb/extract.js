const fs = require('fs');
const html = fs.readFileSync('c:\\Users\\taroyanaka\\Downloads\\ez\\game\\climb\\climb11-2.html', 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/g);
if (scriptMatch && scriptMatch.length > 1) {
    fs.writeFileSync('c:\\Users\\taroyanaka\\Downloads\\ez\\game\\climb\\test.js', scriptMatch[1].replace('<script>', '').replace('</script>', ''));
}
