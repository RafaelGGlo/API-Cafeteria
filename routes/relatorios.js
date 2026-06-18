const express = require("express");
const pool = require("../db");

const router = express.Router();

router.get("/dia", async (req, res) => {
  try {
    const resumoResultado = await pool.query(
      `SELECT COUNT(*)::int AS total_pedidos,
              COALESCE(SUM(total), 0)::numeric AS total_vendido
       FROM pedidos
       WHERE criado_em >= CURRENT_DATE
         AND criado_em < CURRENT_DATE + INTERVAL '1 day'`
    );

    const statusResultado = await pool.query(
      `SELECT status, COUNT(*)::int AS quantidade
       FROM pedidos
       WHERE criado_em >= CURRENT_DATE
         AND criado_em < CURRENT_DATE + INTERVAL '1 day'
       GROUP BY status
       ORDER BY status ASC`
    );

    return res.json({
      total_pedidos: resumoResultado.rows[0].total_pedidos,
      total_vendido: resumoResultado.rows[0].total_vendido,
      status: statusResultado.rows
    });
  } catch (error) {
    return res.status(500).json({ erro: "Erro ao gerar relatorio do dia." });
  }
});

module.exports = router;
