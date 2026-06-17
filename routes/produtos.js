const express = require("express");
const pool = require("../db");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT id, nome, descricao, categoria, preco, disponivel, criado_em
       FROM produtos
       ORDER BY nome ASC`
    );

    return res.json({ produtos: resultado.rows });
  } catch (error) {
    return res.status(500).json({ erro: "Erro ao listar produtos." });
  }
});

router.post("/", async (req, res) => {
  try {
    const { nome, descricao, categoria, preco, disponivel } = req.body;

    if (!nome || preco === undefined) {
      return res.status(400).json({ erro: "Nome e preco sao obrigatorios." });
    }

    const resultado = await pool.query(
      `INSERT INTO produtos (nome, descricao, categoria, preco, disponivel)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, nome, descricao, categoria, preco, disponivel, criado_em`,
      [nome, descricao || null, categoria || null, preco, disponivel !== false]
    );

    return res.status(201).json({
      mensagem: "Produto cadastrado com sucesso.",
      produto: resultado.rows[0]
    });
  } catch (error) {
    return res.status(500).json({ erro: "Erro ao cadastrar produto." });
  }
});

module.exports = router;
