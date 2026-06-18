const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("../db");

const router = express.Router();

router.post("/login", async (req, res) => {
  try {
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({ erro: "Email e senha sao obrigatorios." });
    }

    const resultado = await pool.query(
      `SELECT id, nome, email, senha, tipo, ativo, criado_em
       FROM usuarios
       WHERE email = $1`,
      [email]
    );

    if (resultado.rows.length === 0) {
      return res.status(401).json({ erro: "Credenciais invalidas." });
    }

    const usuario = resultado.rows[0];

    if (!usuario.ativo) {
      return res.status(403).json({ erro: "Usuario inativo." });
    }

    const senhaSalva = usuario.senha || "";
    const senhaPareceHash = senhaSalva.startsWith("$2a$") || senhaSalva.startsWith("$2b$") || senhaSalva.startsWith("$2y$");
    const senhaValida = senhaPareceHash
      ? await bcrypt.compare(senha, senhaSalva)
      : senha === senhaSalva;

    if (!senhaValida) {
      return res.status(401).json({ erro: "Credenciais invalidas." });
    }

    return res.json({
      mensagem: "Login realizado com sucesso.",
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        tipo: usuario.tipo,
        ativo: usuario.ativo,
        criado_em: usuario.criado_em
      }
    });
  } catch (error) {
    return res.status(500).json({ erro: "Erro ao realizar login." });
  }
});

module.exports = router;
