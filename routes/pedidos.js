const express = require("express");
const pool = require("../db");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT
         p.id,
         p.usuario_id,
         u.nome AS usuario_nome,
         p.mesa,
         p.cliente,
         p.total,
         p.status,
         p.observacao,
         p.criado_em
       FROM pedidos p
       JOIN usuarios u ON u.id = p.usuario_id
       ORDER BY p.criado_em DESC`
    );

    return res.json({ pedidos: resultado.rows });
  } catch (error) {
    return res.status(500).json({ erro: "Erro ao listar pedidos." });
  }
});

router.post("/", async (req, res) => {
  let client;

  try {
    const { usuario_id, mesa, cliente, observacao, itens } = req.body;

    if (!usuario_id) {
      return res.status(400).json({ erro: "usuario_id e obrigatorio." });
    }

    if (!Array.isArray(itens) || itens.length === 0) {
      return res.status(400).json({ erro: "O pedido deve ter pelo menos um item." });
    }

    client = await pool.connect();
    await client.query("BEGIN");

    const produtoIds = itens.map((item) => item.produto_id);
    const produtoIdsUnicos = [...new Set(produtoIds)];
    const produtosResultado = await client.query(
      `SELECT id, nome, preco
       FROM produtos
       WHERE id = ANY($1::int[]) AND disponivel = $2`,
      [produtoIdsUnicos, true]
    );

    if (produtosResultado.rows.length !== produtoIdsUnicos.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({ erro: "Um ou mais produtos sao invalidos ou indisponiveis." });
    }

    const produtosPorId = new Map(
      produtosResultado.rows.map((produto) => [produto.id, produto])
    );

    let total = 0;
    const itensCalculados = itens.map((item) => {
      const produto = produtosPorId.get(Number(item.produto_id));
      const quantidade = Number(item.quantidade);

      if (!Number.isInteger(quantidade) || quantidade <= 0) {
        throw new Error("Quantidade invalida.");
      }

      const precoUnitario = Number(produto.preco);
      const subtotal = precoUnitario * quantidade;
      total += subtotal;

      return {
        produtoId: produto.id,
        quantidade,
        precoUnitario,
        subtotal
      };
    });

    const pedidoResultado = await client.query(
      `INSERT INTO pedidos (usuario_id, mesa, cliente, total, observacao)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, usuario_id, mesa, cliente, total, status, observacao, criado_em`,
      [usuario_id, mesa || null, cliente || null, total, observacao || null]
    );

    const pedido = pedidoResultado.rows[0];

    for (const item of itensCalculados) {
      await client.query(
        `INSERT INTO pedido_itens (pedido_id, produto_id, quantidade, preco_unitario, subtotal)
         VALUES ($1, $2, $3, $4, $5)`,
        [pedido.id, item.produtoId, item.quantidade, item.precoUnitario, item.subtotal]
      );
    }

    await client.query("COMMIT");

    return res.status(201).json({
      mensagem: "Pedido criado com sucesso.",
      pedido: {
        ...pedido,
        itens: itensCalculados
      }
    });
  } catch (error) {
    if (client) {
      await client.query("ROLLBACK");
    }

    if (error.message === "Quantidade invalida.") {
      return res.status(400).json({ erro: error.message });
    }

    return res.status(500).json({ erro: "Erro ao criar pedido." });
  } finally {
    if (client) {
      client.release();
    }
  }
});

router.put("/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const statusPermitidos = ["recebido", "em_preparo", "pronto", "entregue", "cancelado"];

    if (!statusPermitidos.includes(status)) {
      return res.status(400).json({ erro: "Status invalido." });
    }

    const resultado = await pool.query(
      `UPDATE pedidos
       SET status = $1
       WHERE id = $2
       RETURNING id, usuario_id, mesa, cliente, total, status, observacao, criado_em`,
      [status, id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: "Pedido nao encontrado." });
    }

    return res.json({
      mensagem: "Status do pedido atualizado com sucesso.",
      pedido: resultado.rows[0]
    });
  } catch (error) {
    return res.status(500).json({ erro: "Erro ao atualizar status do pedido." });
  }
});

module.exports = router;
