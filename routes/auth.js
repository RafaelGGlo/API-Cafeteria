const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../db");

const router = express.Router();

router.post("/criar-admin", async (req, res) => {
  try {
    const nome = "Administrador";
    const email = "admin@cafeteria.com";
    const senha = "admin";
    const tipo = "admin";

    const adminExistente = await pool.query(
      "SELECT id FROM usuarios WHERE email = $1",
      [email]
    );

    if (adminExistente.rows.length > 0) {
      return res.status(409).json({ erro: "Administrador ja existe." });
    }

    const senhaHash = await bcrypt.hash(senha, 10);

    const novoAdmin = await pool.query(
      `INSERT INTO usuarios (nome, email, senha_hash, tipo)
       VALUES ($1, $2, $3, $4)
       RETURNING id, nome, email, tipo, ativo, criado_em`,
      [nome, email, senhaHash, tipo]
    );

    return res.status(201).json({
      mensagem: "Administrador criado com sucesso.",
      usuario: novoAdmin.rows[0]
    });
  } catch (error) {
    return res.status(500).json({ erro: "Erro ao criar administrador." });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({ erro: "Email e senha sao obrigatorios." });
    }

    const resultado = await pool.query(
      "SELECT id, nome, email, senha_hash, tipo, ativo FROM usuarios WHERE email = $1",
      [email]
    );

    if (resultado.rows.length === 0) {
      return res.status(401).json({ erro: "Credenciais invalidas." });
    }

    const usuario = resultado.rows[0];

    if (!usuario.ativo) {
      return res.status(403).json({ erro: "Usuario inativo." });
    }

    const senhaValida = await bcrypt.compare(senha, usuario.senha_hash);

    if (!senhaValida) {
      return res.status(401).json({ erro: "Credenciais invalidas." });
    }

    const token = jwt.sign(
      {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        tipo: usuario.tipo
      },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    return res.json({
      mensagem: "Login realizado com sucesso.",
      token,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        tipo: usuario.tipo
      }
    });
  } catch (error) {
    return res.status(500).json({ erro: "Erro ao realizar login." });
  }
});

module.exports = router;
