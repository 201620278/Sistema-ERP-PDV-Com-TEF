const express = require("express");
const path = require("path");
const db = require("../database");
const { fazerBackupManual } = require("../services/backupManual");

const router = express.Router();

router.post("/manual", (req, res) => {
  const dbPath =
    process.env.DB_PATH ||
    path.join("C:", "projetos", "MercantilFiscal", "dados", "mercadao.db");

  db.get(
    "SELECT valor FROM configuracoes WHERE chave = 'backup_path'",
    [],
    (err, row) => {
      if (err || !row || !row.valor) {
        return res.status(400).json({
          sucesso: false,
          mensagem: "Configure a pasta de backup primeiro."
        });
      }

      try {
        const resultado = fazerBackupManual(dbPath, row.valor);

        res.json({
          sucesso: true,
          backup: resultado
        });
      } catch (error) {
        res.status(500).json({
          sucesso: false,
          mensagem: error.message
        });
      }
    }
  );
});

module.exports = router;
