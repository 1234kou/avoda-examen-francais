const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Connexion à PostgreSQL Render
if (!process.env.DATABASE_URL) {
  console.error("ERREUR : DATABASE_URL n'est pas définie.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : false
});

// Création automatique de la table des pré-inscriptions
async function initialiserBase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS preinscriptions (
      id SERIAL PRIMARY KEY,
      date_creation TIMESTAMPTZ DEFAULT NOW(),
      type_parcours VARCHAR(50) NOT NULL,
      nom_parent VARCHAR(150),
      prenom_parent VARCHAR(150),
      telephone VARCHAR(50) NOT NULL,
      email VARCHAR(200),
      nom_eleve VARCHAR(150) NOT NULL,
      prenom_eleve VARCHAR(150) NOT NULL,
      classe_actuelle VARCHAR(100),
      examen VARCHAR(100) NOT NULL,
      message TEXT,
      engagement BOOLEAN NOT NULL DEFAULT FALSE
    );
  `);

  console.log("Table preinscriptions prête.");
}

initialiserBase().catch((error) => {
  console.error("Erreur initialisation PostgreSQL :", error);
});

// Test du serveur
app.get("/", (req, res) => {
  res.json({
    service: "AVODA Académie - Pré-inscriptions",
    status: "OK"
  });
});

// Enregistrement d'une pré-inscription
app.post("/api/preinscriptions", async (req, res) => {
  try {
    const {
      type_parcours,
      nom_parent,
      prenom_parent,
      telephone,
      email,
      nom_eleve,
      prenom_eleve,
      classe_actuelle,
      examen,
      message,
      engagement
    } = req.body;

    if (
      !telephone ||
      !nom_eleve ||
      !prenom_eleve ||
      !examen ||
      engagement !== true
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Veuillez compléter les informations obligatoires et confirmer votre engagement."
      });
    }

    const resultat = await pool.query(
      `
      INSERT INTO preinscriptions
      (
        type_parcours,
        nom_parent,
        prenom_parent,
        telephone,
        email,
        nom_eleve,
        prenom_eleve,
        classe_actuelle,
        examen,
        message,
        engagement
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING id, date_creation;
      `,
      [
        type_parcours || "Candidature libre",
        nom_parent || null,
        prenom_parent || null,
        telephone,
        email || null,
        nom_eleve,
        prenom_eleve,
        classe_actuelle || null,
        examen,
        message || null,
        true
      ]
    );

    res.status(201).json({
      success: true,
      message:
        "Votre demande de pré-inscription a bien été enregistrée par AVODA Académie.",
      dossier: resultat.rows[0]
    });
  } catch (error) {
    console.error("Erreur pré-inscription :", error);

    res.status(500).json({
      success: false,
      message:
        "Une erreur est survenue pendant l'enregistrement de la pré-inscription."
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Serveur AVODA démarré sur le port ${PORT}`);
});
