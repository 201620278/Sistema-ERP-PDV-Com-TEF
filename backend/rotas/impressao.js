const express = require("express");
const router = express.Router();
const db = require("../database");

// 🔎 detectar impressora automaticamente
function detectarImpressoraCupom(impressoras) {
  return impressoras.find(imp =>
    imp.name.toLowerCase().includes("cupom")
  );
}

router.post("/imprimir", async (req, res) => {
  try {
    const win = global.mainWindow;

    if (!win) {
      return res.status(500).json({
        sucesso: false,
        mensagem: "Janela principal não disponível (não está rodando em Electron)"
      });
    }

    // 1️⃣ buscar impressora salva
    db.get(
      "SELECT valor FROM configuracoes WHERE chave = 'impressora_cupom'",
      async (err, row) => {
        if (err) {
          return res.status(500).json({ sucesso: false });
        }

        let nomeImpressora = row?.valor;

        const impressoras = await win.webContents.getPrintersAsync();

        // 2️⃣ se não tiver salva → detectar automaticamente
        if (!nomeImpressora) {
          const encontrada = detectarImpressoraCupom(impressoras);

          if (encontrada) {
            nomeImpressora = encontrada.name;

            // salvar no banco
            db.run(
              `INSERT INTO configuracoes (chave, valor)
               VALUES ('impressora_cupom', ?)
               ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`,
              [nomeImpressora]
            );
          }
        }

        // 3️⃣ imprimir
        const printOptions = {
          silent: true,
          printBackground: true
        };

        // Só definir deviceName se tiver impressora configurada
        if (nomeImpressora) {
          printOptions.deviceName = nomeImpressora;
        }

        win.webContents.print(printOptions);

        res.json({
          sucesso: true,
          impressora: nomeImpressora || "padrão do Windows"
        });
      }
    );
  } catch (error) {
    console.error(error);

    res.status(500).json({
      sucesso: false,
      mensagem: error.message
    });
  }
});

module.exports = router;
