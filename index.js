require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const mysql = require('mysql2/promise');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

const upload = multer({ storage: multer.memoryStorage() });

const s3 = new S3Client({
  endpoint: 'https://s3.filebase.com',
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.FILEBASE_ACCESS_KEY,
    secretAccessKey: process.env.FILEBASE_SECRET_KEY,
  },
  forcePathStyle: true,
});

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

app.get('/usuarios', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM alumno');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/usuarios', upload.single('imagen'), async (req, res) => {
  try {
    const { nombre, apellidos, localidad } = req.body;
    let imagenNombre = null;

    if (req.file) {
      const ext = path.extname(req.file.originalname);
      imagenNombre = uuidv4() + ext;

      await s3.send(new PutObjectCommand({
        Bucket: process.env.FILEBASE_BUCKET,
        Key: imagenNombre,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      }));
    }

    await db.query(
      'INSERT INTO alumno (nombre, apellidos, localidad, imagen) VALUES (?, ?, ?, ?)',
      [nombre, apellidos, localidad, imagenNombre]
    );

    res.json({ mensaje: 'Usuario creado correctamente' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/usuarios/:id', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM alumno WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });

    const usuario = rows[0];

    if (usuario.imagen) {
      await s3.send(new DeleteObjectCommand({
        Bucket: process.env.FILEBASE_BUCKET,
        Key: usuario.imagen,
      }));
    }

    await db.query('DELETE FROM alumno WHERE id = ?', [req.params.id]);
    res.json({ mensaje: 'Usuario eliminado correctamente' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor en http://localhost:${PORT}`));

module.exports = app;