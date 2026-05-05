const fs = require('fs');
const path = require('path');

// Ver conteúdo real do arquivo configService.js
const configPath = path.join(__dirname, 'backend', 'services', 'fiscal', 'configService.js');
const content = fs.readFileSync(configPath, 'utf8');

console.log('Arquivo:', configPath);
console.log('Linha 153-177 (incrementaNumeroFiscal):');

const lines = content.split('\n');
for (let i = 152; i < Math.min(177, lines.length); i++) {
  console.log(`${i+1}: ${lines[i]}`);
}

// Verificar se a função usa getConfiguracoes (versão antiga) ou db.get direto (versão nova)
if (content.includes('getConfiguracoes') && content.includes('fiscal_numero_atual')) {
  console.log('\n⚠️  VERSÃO ANTIGA DETECTADA: usa getConfiguracoes + fiscal_numero_atual');
} else if (content.includes('SELECT MAX(CAST(numero AS INTEGER))')) {
  console.log('\n✅ VERSÃO NOVA: usa MAX(numero) do banco');
}
