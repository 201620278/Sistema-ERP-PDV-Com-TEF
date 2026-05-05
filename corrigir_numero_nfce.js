const db = require('./backend/database');

const PROXIMO_NUMERO = 100;

db.run(
  "UPDATE configuracoes SET valor = ?, updated_at = CURRENT_TIMESTAMP WHERE chave = 'fiscal_numero_atual'",
  [String(PROXIMO_NUMERO)],
  function (err) {
    if (err) {
      console.error('Erro:', err.message);
      process.exit(1);
    }

    console.log(`✔ fiscal_numero_atual ajustado para ${PROXIMO_NUMERO}`);
    process.exit(0);
  }
);