const express = require("express");
const pool = require("../db");

const router = express.Router();
const STATUS_PERMITIDOS = ["recebido", "em_preparo", "pronto", "entregue", "cancelado"];

async function buscarPedidoComItens(client, id) {
  const pedidoResultado = await client.query(
    `SELECT id, numero_pedido, usuario_id, cliente_nome, mesa, status, total,
            forma_pagamento, observacao, criado_em, atualizado_em
     FROM pedidos
     WHERE id = $1`,
    [id]
  );

  if (pedidoResultado.rows.length === 0) {
    return null;
  }

  const itensResultado = await client.query(
    `SELECT pi.id, pi.pedido_id, pi.produto_id, pr.nome AS produto_nome,
            pi.quantidade, pi.preco_unitario, pi.subtotal, pi.observacao
     FROM pedido_itens pi
     JOIN produtos pr ON pr.id = pi.produto_id
     WHERE pi.pedido_id = $1
     ORDER BY pi.id ASC`,
    [id]
  );

  return {
    ...pedidoResultado.rows[0],
    itens: itensResultado.rows
  };
}

router.get("/", async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT id, numero_pedido, usuario_id, cliente_nome, mesa, status, total,
              forma_pagamento, observacao, criado_em, atualizado_em
       FROM pedidos
       ORDER BY criado_em DESC`
    );

    return res.json({ pedidos: resultado.rows });
  } catch (error) {
    return res.status(500).json({ erro: "Erro ao listar pedidos." });
  }
});

router.get("/status/:status", async (req, res) => {
  try {
    const { status } = req.params;

    if (!STATUS_PERMITIDOS.includes(status)) {
      return res.status(400).json({ erro: "Status invalido." });
    }

    const resultado = await pool.query(
      `SELECT id, numero_pedido, usuario_id, cliente_nome, mesa, status, total,
              forma_pagamento, observacao, criado_em, atualizado_em
       FROM pedidos
       WHERE status = $1
       ORDER BY criado_em DESC`,
      [status]
    );

    return res.json({ pedidos: resultado.rows });
  } catch (error) {
    return res.status(500).json({ erro: "Erro ao listar pedidos por status." });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const pedido = await buscarPedidoComItens(pool, req.params.id);

    if (!pedido) {
      return res.status(404).json({ erro: "Pedido nao encontrado." });
    }

    return res.json({ pedido });
  } catch (error) {
    return res.status(500).json({ erro: "Erro ao buscar pedido." });
  }
});

router.post("/", async (req, res) => {
  let client;

  try {
    const { usuario_id, cliente_nome, mesa, forma_pagamento, observacao, itens } = req.body;

    if (!usuario_id) {
      return res.status(400).json({ erro: "usuario_id e obrigatorio." });
    }

    if (!Array.isArray(itens) || itens.length === 0) {
      return res.status(400).json({ erro: "itens deve ser um array com pelo menos um item." });
    }

    for (const item of itens) {
      if (!item.produto_id) {
        return res.status(400).json({ erro: "produto_id e obrigatorio em todos os itens." });
      }

      const quantidade = Number(item.quantidade);
      if (!Number.isInteger(quantidade) || quantidade <= 0) {
        return res.status(400).json({ erro: "quantidade deve ser um numero inteiro maior que zero." });
      }
    }

    client = await pool.connect();
    await client.query("BEGIN");

    const usuarioResultado = await client.query(
      "SELECT id FROM usuarios WHERE id = $1",
      [usuario_id]
    );

    if (usuarioResultado.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ erro: "Usuario nao encontrado." });
    }

    const produtoIdsUnicos = [...new Set(itens.map((item) => Number(item.produto_id)))];
    const produtosResultado = await client.query(
      `SELECT id, nome, preco, disponivel
       FROM produtos
       WHERE id = ANY($1::int[])`,
      [produtoIdsUnicos]
    );

    if (produtosResultado.rows.length !== produtoIdsUnicos.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({ erro: "Um ou mais produtos nao existem." });
    }

    const produtosPorId = new Map(produtosResultado.rows.map((produto) => [produto.id, produto]));
    const itensCalculados = [];
    let total = 0;

    for (const item of itens) {
      const produto = produtosPorId.get(Number(item.produto_id));

      if (!produto.disponivel) {
        await client.query("ROLLBACK");
        return res.status(400).json({ erro: `Produto ${produto.id} indisponivel.` });
      }

      const quantidade = Number(item.quantidade);
      const precoUnitario = Number(produto.preco);
      const subtotal = precoUnitario * quantidade;
      total += subtotal;

      itensCalculados.push({
        produto_id: produto.id,
        produto_nome: produto.nome,
        quantidade,
        preco_unitario: precoUnitario,
        subtotal,
        observacao: item.observacao || null
      });
    }

    const pedidoResultado = await client.query(
      `INSERT INTO pedidos (numero_pedido, usuario_id, cliente_nome, mesa, status, total,
                            forma_pagamento, observacao)
       VALUES ($1, $2, $3, $4, $5, 0, $6, $7)
       RETURNING id, numero_pedido, usuario_id, cliente_nome, mesa, status, total,
                 forma_pagamento, observacao, criado_em, atualizado_em`,
      [
        `PED-${Date.now()}`,
        usuario_id,
        cliente_nome || null,
        mesa || null,
        "recebido",
        forma_pagamento || null,
        observacao || null
      ]
    );

    const pedido = pedidoResultado.rows[0];

    for (const item of itensCalculados) {
      await client.query(
        `INSERT INTO pedido_itens (pedido_id, produto_id, quantidade, preco_unitario, subtotal, observacao)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [pedido.id, item.produto_id, item.quantidade, item.preco_unitario, item.subtotal, item.observacao]
      );
    }

    const pedidoAtualizadoResultado = await client.query(
      `UPDATE pedidos
       SET total = $1,
           atualizado_em = NOW()
       WHERE id = $2
       RETURNING id, numero_pedido, usuario_id, cliente_nome, mesa, status, total,
                 forma_pagamento, observacao, criado_em, atualizado_em`,
      [total, pedido.id]
    );

    const pedidoCriado = await buscarPedidoComItens(client, pedidoAtualizadoResultado.rows[0].id);

    await client.query("COMMIT");

    return res.status(201).json({
      mensagem: "Pedido criado com sucesso.",
      pedido: pedidoCriado
    });
  } catch (error) {
    if (client) {
      await client.query("ROLLBACK");
    }

    console.error('Erro ao criar pedido:', error);

    return res.status(500).json({
      erro: "Erro ao criar pedido.",
      detalhe: error.message
    });
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

    if (!STATUS_PERMITIDOS.includes(status)) {
      return res.status(400).json({ erro: "Status invalido." });
    }

    const resultado = await pool.query(
      `UPDATE pedidos
       SET status = $1,
           atualizado_em = NOW()
       WHERE id = $2
       RETURNING id, numero_pedido, usuario_id, cliente_nome, mesa, status, total,
                 forma_pagamento, observacao, criado_em, atualizado_em`,
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
