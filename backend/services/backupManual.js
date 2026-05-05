const fs = require("fs");
const path = require("path");

function formatarDataArquivo() {
  const agora = new Date();
  const pad = (n) => String(n).padStart(2, "0");

  return (
    agora.getFullYear() +
    "-" + pad(agora.getMonth() + 1) +
    "-" + pad(agora.getDate()) +
    "_" + pad(agora.getHours()) +
    "-" + pad(agora.getMinutes()) +
    "-" + pad(agora.getSeconds())
  );
}

function fazerBackupManual(dbPath, pastaDestino = null) {
  if (!dbPath || !fs.existsSync(dbPath)) {
    throw new Error("Banco de dados não encontrado: " + dbPath);
  }

  const pastaBackup = pastaDestino || path.join(path.dirname(dbPath), "backups");

  if (!fs.existsSync(pastaBackup)) {
    fs.mkdirSync(pastaBackup, { recursive: true });
  }

  const nomeBackup = `backup_pdv_${formatarDataArquivo()}.db`;
  const caminhoBackup = path.join(pastaBackup, nomeBackup);

  fs.copyFileSync(dbPath, caminhoBackup);

  return {
    sucesso: true,
    arquivo: nomeBackup,
    caminho: caminhoBackup
  };
}

module.exports = {
  fazerBackupManual
};