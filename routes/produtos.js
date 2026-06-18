const express = require("express");
const pool = require("../db");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT id, nome, descricao, categoria, preco, disponivel, criado_em, atualizado_em
       FROM produtos
       ORDER BY nome ASC`
    );

    return res.json({ produtos: resultado.rows });
  } catch (error) {
    return res.status(500).json({ erro: "Erro ao listar produtos." });
  }
});

router.get("/disponiveis", async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT id, nome, descricao, categoria, preco, disponivel, criado_em, atualizado_em
       FROM produtos
       WHERE disponivel = true
       ORDER BY nome ASC`
    );

    return res.json({ produtos: resultado.rows });
  } catch (error) {
    return res.status(500).json({ erro: "Erro ao listar produtos disponiveis." });
  }
});

router.post("/", async (req, res) => {
  try {
    const { nome, descricao, categoria, preco, disponivel } = req.body;

    if (!nome || !categoria || preco === undefined || preco === null) {
      return res.status(400).json({ erro: "Nome, categoria e preco sao obrigatorios." });
    }

    if (Number.isNaN(Number(preco)) || Number(preco) < 0) {
      return res.status(400).json({ erro: "Preco invalido." });
    }

    const resultado = await pool.query(
      `INSERT INTO produtos (nome, descricao, categoria, preco, disponivel)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, nome, descricao, categoria, preco, disponivel, criado_em, atualizado_em`,
      [nome, descricao || null, categoria, Number(preco), disponivel !== false]
    );

    return res.status(201).json({
      mensagem: "Produto cadastrado com sucesso.",
      produto: resultado.rows[0]
    });
  } catch (error) {
    return res.status(500).json({ erro: "Erro ao cadastrar produto." });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, descricao, categoria, preco, disponivel } = req.body;

    if (!nome || !categoria || preco === undefined || preco === null) {
      return res.status(400).json({ erro: "Nome, categoria e preco sao obrigatorios." });
    }

    if (Number.isNaN(Number(preco)) || Number(preco) < 0) {
      return res.status(400).json({ erro: "Preco invalido." });
    }

    const resultado = await pool.query(
      `UPDATE produtos
       SET nome = $1,
           descricao = $2,
           categoria = $3,
           preco = $4,
           disponivel = $5,
           atualizado_em = NOW()
       WHERE id = $6
       RETURNING id, nome, descricao, categoria, preco, disponivel, criado_em, atualizado_em`,
      [nome, descricao || null, categoria, Number(preco), disponivel !== false, id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: "Produto nao encontrado." });
    }

    return res.json({
      mensagem: "Produto atualizado com sucesso.",
      produto: resultado.rows[0]
    });
  } catch (error) {
    return res.status(500).json({ erro: "Erro ao atualizar produto." });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const resultado = await pool.query(
      `UPDATE produtos
       SET disponivel = false,
           atualizado_em = NOW()
       WHERE id = $1
       RETURNING id, nome, descricao, categoria, preco, disponivel, criado_em, atualizado_em`,
      [id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: "Produto nao encontrado." });
    }

    return res.json({
      mensagem: "Produto indisponibilizado com sucesso.",
      produto: resultado.rows[0]
    });
  } catch (error) {
    return res.status(500).json({ erro: "Erro ao remover produto." });
  }
});

module.exports = router;
