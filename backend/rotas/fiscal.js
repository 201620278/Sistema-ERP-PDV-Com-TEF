const express = require('express');
const router = express.Router();
const db = require('../database');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { getFiscalConfig, setConfiguracao } = require('../services/fiscal/configService');
const { carregarCertificadoPfx } = require('../services/fiscal/certificateService');
const { emitirPorVendaId } = require('../services/fiscal/emissor');
const cancelarNfce = require('../services/fiscal/cancelarNfce');
const { getFiscalSubDir } = require('../services/fiscal/paths');

const pastaCertificados = getFiscalSubDir('certificados');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, pastaCertificados);
  },
  filename: (req, file, cb) => {
    cb(null, 'certificado.pfx');
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();

    if (ext !== '.pfx') {
      return cb(new Error('Envie apenas arquivo .pfx'));
    }

    cb(null, true);
  }
});

router.post('/certificado/upload', upload.single('certificado'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum certificado enviado.' });
    }

    const caminhoCompleto = path.resolve(pastaCertificados, 'certificado.pfx');

    await setConfiguracao(
      'fiscal_certificado_path',
      caminhoCompleto,
      'string',
      'Caminho interno do certificado A1'
    );

    res.json({
      success: true,
      message: 'Certificado enviado com sucesso.',
      path: caminhoCompleto
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/config', async (req, res) => {
  try {
    const config = await getFiscalConfig();
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/config', async (req, res) => {
  try {
    const payload = req.body || {};
    const entries = Object.entries(payload);
    for (const [chave, valor] of entries) {
      await setConfiguracao(chave, String(valor ?? ''), 'string', `Configuração fiscal: ${chave}`);
    }
    res.json({ message: 'Configurações fiscais atualizadas com sucesso.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/config/certificado/testar', async (req, res) => {
  try {
    const { certificadoPath, senha } = req.body;
    const certificado = carregarCertificadoPfx(certificadoPath, senha);
    res.json({
      success: true,
      certBase64Length: certificado.certBase64.length
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/emitir/venda/:vendaId', async (req, res) => {
  try {
    const vendaId = Number(req.params.vendaId);
    const resultado = await emitirPorVendaId(vendaId);
    res.json(resultado);
  } catch (error) {
    console.error('Erro ao emitir NFC-e:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/danfe/venda/:vendaId', (req, res) => {
  const vendaId = Number(req.params.vendaId);

  db.get(`
    SELECT n.danfe_html, n.chave_acesso, n.protocolo, n.status, n.numero, n.serie
    FROM nfce_notas n
    WHERE n.venda_id = ?
    ORDER BY n.id DESC
    LIMIT 1
  `, [vendaId], (err, nota) => {
    if (err) {
      console.error('Erro ao buscar DANFE:', err);
      return res.status(500).send('Erro interno ao buscar DANFE.');
    }

    if (!nota) {
      return res.status(404).send('NFC-e não encontrada para esta venda.');
    }

    if (!nota.danfe_html) {
      return res.status(404).send('DANFE não gerado para esta NFC-e.');
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(nota.danfe_html);
  });
});

function extrairTagXml(xml, tag) {
  const regex = new RegExp(`<${tag}>(.*?)</${tag}>`, 'i');
  const match = String(xml || '').match(regex);
  return match ? match[1] : null;
}

function extrairCancelamentoSefaz(xml) {
  const texto = String(xml || '');

  const blocoEventoMatch = texto.match(/<retEvento[\s\S]*?<\/retEvento>/i);
  const blocoEvento = blocoEventoMatch ? blocoEventoMatch[0] : texto;

  return {
    cStatLote: extrairTagXml(texto, 'cStat'),
    xMotivoLote: extrairTagXml(texto, 'xMotivo'),
    cStatEvento: extrairTagXml(blocoEvento, 'cStat'),
    xMotivoEvento: extrairTagXml(blocoEvento, 'xMotivo'),
    protocoloCancelamento: extrairTagXml(blocoEvento, 'nProt'),
    dataCancelamento: extrairTagXml(blocoEvento, 'dhRegEvento')
  };
}

router.post('/notas/:id/cancelar', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { justificativa } = req.body || {};

    if (!justificativa || justificativa.trim().length < 15) {
      return res.status(400).json({
        error: 'A justificativa deve ter no mínimo 15 caracteres.'
      });
    }

    db.get(`
      SELECT *
      FROM nfce_notas
      WHERE id = ?
    `, [id], async (err, nota) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      if (!nota) {
        return res.status(404).json({ error: 'NFC-e não encontrada.' });
      }

      if (String(nota.status || '').toLowerCase() === 'cancelada') {
        return res.status(400).json({
          error: 'Esta NFC-e já está cancelada.'
        });
      }

      if (!String(nota.status || '').toLowerCase().includes('autoriz')) {
        return res.status(400).json({
          error: 'Somente NFC-e autorizada pode ser cancelada.'
        });
      }

      if (!nota.chave_acesso || !nota.protocolo) {
        return res.status(400).json({
          error: 'NFC-e sem chave ou protocolo. Não é possível cancelar.'
        });
      }

      try {
        const retorno = await cancelarNfce({
          chave: nota.chave_acesso,
          protocolo: nota.protocolo
        }, justificativa.trim());

        const retornoTexto = typeof retorno === 'string'
          ? retorno
          : JSON.stringify(retorno);

        const dadosCancelamento = extrairCancelamentoSefaz(retornoTexto);

        const canceladoComSucesso =
          String(dadosCancelamento.cStatEvento) === '135' ||
          String(dadosCancelamento.cStatEvento) === '136' ||
          String(dadosCancelamento.cStatEvento) === '155';

        const novoStatus = canceladoComSucesso
          ? 'cancelada'
          : 'cancelamento_rejeitado';

        const resumoCancelamento = `
STATUS CANCELAMENTO: ${novoStatus}
cStatEvento: ${dadosCancelamento.cStatEvento || ''}
xMotivoEvento: ${dadosCancelamento.xMotivoEvento || ''}
protocoloCancelamento: ${dadosCancelamento.protocoloCancelamento || ''}
dataCancelamento: ${dadosCancelamento.dataCancelamento || ''}
justificativa: ${justificativa.trim()}
`;

        db.run(`
          UPDATE nfce_notas
          SET status = ?,
              xml_retorno = COALESCE(xml_retorno, '') || char(10) || ? || char(10) || ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [novoStatus, resumoCancelamento, retornoTexto, id], (updErr) => {
          if (updErr) {
            return res.status(500).json({ error: updErr.message });
          }

          if (!canceladoComSucesso) {
            return res.status(400).json({
              success: false,
              message: dadosCancelamento.xMotivoEvento || 'Cancelamento rejeitado pela SEFAZ.',
              status: novoStatus,
              retorno,
              dadosCancelamento
            });
          }

          res.json({
            success: true,
            message: 'NFC-e cancelada com sucesso.',
            status: novoStatus,
            protocoloCancelamento: dadosCancelamento.protocoloCancelamento,
            dataCancelamento: dadosCancelamento.dataCancelamento,
            retorno,
            dadosCancelamento
          });
        });
      } catch (cancelErr) {
        res.status(500).json({
          error: cancelErr.message
        });
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/notas', (req, res) => {
  db.all(`
    SELECT n.*, v.codigo as venda_codigo, v.total as venda_total
    FROM nfce_notas n
    LEFT JOIN vendas v ON v.id = n.venda_id
    ORDER BY n.id DESC
  `, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

router.get('/notas/:id', (req, res) => {
  db.get(`
    SELECT n.*, v.codigo as venda_codigo, v.total as venda_total
    FROM nfce_notas n
    LEFT JOIN vendas v ON v.id = n.venda_id
    WHERE n.id = ?
  `, [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'NFC-e não encontrada.' });
    res.json(row);
  });
});

module.exports = router;
