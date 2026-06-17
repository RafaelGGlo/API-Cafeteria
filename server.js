const express = require("express");
const cors = require("cors");
require("dotenv").config();

const authRoutes = require("./routes/auth");
const produtosRoutes = require("./routes/produtos");
const pedidosRoutes = require("./routes/pedidos");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    mensagem: "API da Cafeteria funcionando!"
  });
});

app.use("/auth", authRoutes);
app.use("/produtos", produtosRoutes);
app.use("/pedidos", pedidosRoutes);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});