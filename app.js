import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { GoogleGenerativeAI } from "@google/generative-ai";
import express from "express";
import cors from "cors";
import PDFDocument from "pdfkit";
import MarkdownIt from "markdown-it";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// Carrega GEMINI_API_KEY do .env
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("❌ GEMINI_API_KEY não encontrada no .env");
  process.exit(1);
}

const ai = new GoogleGenerativeAI(apiKey);

// Função para converter Markdown em PDF usando pdfkit
async function mdParaPDF(mdText, outputPath) {
  const md = new MarkdownIt();
  const html = md.render(mdText);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(outputPath);

    doc.pipe(stream);

    // Remove tags HTML e escreve texto simples (Markdown básico)
    doc.font("Helvetica").fontSize(12).text(html.replace(/<[^>]+>/g, ""), {
      align: "left",
    });

    doc.end();

    stream.on("finish", resolve);
    stream.on("error", reject);
  });
}

// Função principal — gera conteúdo usando AI e converte em PDF
async function gerarDocumento(conteudoDesejado, comoGerar) {
  const model = ai.getGenerativeModel({ model: "gemini-2.0-flash" });
  const prompt = `${conteudoDesejado}. ${comoGerar}`;
  const result = await model.generateContent(prompt);
  const textoMD = result.response.text();

  const pastaDocumentos = process.env.VERCEL ? "/tmp" : path.join(process.cwd(), "documentos");
  if (!fs.existsSync(pastaDocumentos)) fs.mkdirSync(pastaDocumentos);

  const nomeArquivoBase = conteudoDesejado.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  const caminhoPDF = path.join(pastaDocumentos, `${nomeArquivoBase}.pdf`);

  await mdParaPDF(textoMD, caminhoPDF);

  console.log(`✅ PDF gerado em: ${caminhoPDF}`);
  return caminhoPDF;
}

// --------------------
// Rota POST para gerar e retornar a URL do PDF
// --------------------
app.post("/", async (req, res) => {
  try {
    const { prompt, comoGerar } = req.body;

    if (!prompt || !comoGerar) {
      return res.status(400).json({ erro: "Campos 'prompt' e 'comoGerar' são obrigatórios." });
    }

    console.log("🧠 Gerando documento...");
    const caminhoPDF = await gerarDocumento(prompt, comoGerar);

    // Gera a URL pública de download
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : `http://localhost:3000`;

    const nomeArquivo = path.basename(caminhoPDF);
    const urlDownload = `${baseUrl}/download/${nomeArquivo}`;

    res.json({ url: urlDownload });
  } catch (error) {
    console.error("❌ Erro na rota /:", error);
    res.status(500).json({ erro: "Erro ao gerar documento." });
  }
});

// --------------------
// Rota GET para servir o PDF gerado
// --------------------
app.get("/download/:arquivo", (req, res) => {
  const arquivo = req.params.arquivo;
  const pastaDocumentos = process.env.VERCEL ? "/tmp" : path.join(process.cwd(), "documentos");
  const caminhoArquivo = path.join(pastaDocumentos, arquivo);

  if (fs.existsSync(caminhoArquivo)) {
    res.download(caminhoArquivo, (err) => {
      if (!err) {
        // Remove o arquivo após envio
        fs.unlink(caminhoArquivo, () => {});
      }
    });
  } else {
    res.status(404).json({ erro: "Arquivo não encontrado." });
  }
});

app.listen(3000, () => console.log("🚀 Servidor rodando em http://localhost:3000"));
